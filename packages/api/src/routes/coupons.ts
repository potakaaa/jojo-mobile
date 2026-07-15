import type { CouponWithReward } from '@jojopotato/types';
import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import { coupons, rewards } from '../db/schema/index';
import { buildCartFromItems, resolveCouponDiscount } from './lib/coupon-apply';

/**
 * Coupon routes (STAR-004). Session-gated — `requireSession` is applied ONCE at
 * mount in `index.ts` (`app.use('/coupons', requireSession, couponsRouter)`), so
 * every handler here assumes `req.user!.id` is the server-owned better-auth
 * session user. Cross-user reads are structurally impossible: every query scopes
 * on `req.user!.id`.
 *
 * `POST /coupons/apply` is validate-and-compute-ONLY — it performs ZERO writes to
 * the `coupons` table (the AC4 "abandon-doesn't-burn" guarantee). The only place
 * a coupon is ever consumed is inside the `POST /orders` transaction.
 */
export const couponsRouter: Router = Router();

const applySchema = z.object({
  code: z.string().min(1),
  pickupBranchId: z.string().uuid(),
  cartItems: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
        selectedOptions: z.array(z.object({ optionId: z.string().uuid() })).optional(),
      }),
    )
    .min(1),
});

/**
 * `POST /coupons/apply` → `{ discount }` on success (200) or `{ error, reason }`
 * on rejection (400). Zero DB mutation: the reward-coupon and deal-catalog
 * resolution runs inside a READ-ONLY transaction so the AC4 guarantee holds
 * structurally (no `.insert`/`.update` is ever issued in this path).
 */
couponsRouter.post('/apply', async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid apply payload', reason: 'invalid_payload' });
    return;
  }
  const { code, pickupBranchId, cartItems } = parsed.data;
  const userId = req.user!.id;

  const resolution = await db.transaction(async (tx) => {
    const cart = await buildCartFromItems(tx, pickupBranchId, cartItems);
    return resolveCouponDiscount(tx, { code: code.trim(), userId, pickupBranchId, cart });
  });

  if (!resolution.ok) {
    res.status(resolution.status).json({ error: resolution.message, reason: resolution.reason });
    return;
  }
  res.json({ discount: resolution.discount });
});

/**
 * `GET /coupons` → `{ coupons: CouponWithReward[] }`, scoped to `req.user!.id`.
 * Each row carries a light reward label (name + required stars) for reward-backed
 * coupons; deal coupons carry `reward: null`. Newest first.
 */
couponsRouter.get('/', async (req, res) => {
  const userId = req.user!.id;

  const rows = await db
    .select({
      coupon: coupons,
      rewardName: rewards.name,
      rewardRequiredStars: rewards.required_stars,
    })
    .from(coupons)
    .leftJoin(rewards, eq(coupons.reward_id, rewards.id))
    .where(eq(coupons.user_id, userId))
    .orderBy(desc(coupons.created_at));

  const body: CouponWithReward[] = rows.map(({ coupon, rewardName, rewardRequiredStars }) => ({
    id: coupon.id,
    userId: coupon.user_id,
    dealId: coupon.deal_id,
    rewardId: coupon.reward_id,
    code: coupon.code,
    status: coupon.status,
    expiresAt: coupon.expires_at ? coupon.expires_at.toISOString() : null,
    usedAt: coupon.used_at ? coupon.used_at.toISOString() : null,
    createdAt: coupon.created_at.toISOString(),
    reward:
      coupon.reward_id !== null && rewardName !== null && rewardRequiredStars !== null
        ? { name: rewardName, requiredStars: rewardRequiredStars }
        : null,
  }));

  res.json({ coupons: body });
});

export default couponsRouter;
