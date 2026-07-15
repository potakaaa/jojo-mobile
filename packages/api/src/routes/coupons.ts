import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import { coupons, deals, rewards } from '../db/schema/index';
import { requireSession } from '../middleware/require-session';
import { serializeCouponWithLabel, type ApiCouponWithLabel } from './lib/serializers';

export const couponsRouter: Router = Router();

const uuidSchema = z.string().uuid();
const couponStatusSchema = z.enum(['available', 'used', 'expired']);

// GET /coupons — session-gated per-route (mirror /orders). Returns the caller's
// own coupons, newest-first, each with a derived `displayLabel` built from a
// LEFT JOIN to the linked deal/reward (NOT an N+1 per-row lookup). Optional
// `?status=` filter matches the EFFECTIVE status (after read-time expiry
// relabeling). Expiry is derived at read time ONLY — a still-`available` row
// whose `expires_at` is in the past is reported as `expired` but is never
// written back to the DB in this phase.
couponsRouter.get('/', requireSession, async (req, res) => {
  const userId = req.user!.id;

  const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
  const statusFilter = statusParam ? couponStatusSchema.safeParse(statusParam) : null;

  const rows = await db
    .select({ coupon: coupons, deal: deals, reward: rewards })
    .from(coupons)
    .leftJoin(deals, eq(coupons.deal_id, deals.id))
    .leftJoin(rewards, eq(coupons.reward_id, rewards.id))
    .where(eq(coupons.user_id, userId))
    .orderBy(desc(coupons.created_at));

  const now = new Date();
  let serialized: ApiCouponWithLabel[] = rows.map(({ coupon, deal, reward }) => {
    const effectiveStatus =
      coupon.status === 'available' && coupon.expires_at !== null && coupon.expires_at < now
        ? ('expired' as const)
        : coupon.status;
    return { ...serializeCouponWithLabel(coupon, deal, reward), status: effectiveStatus };
  });

  // Filter by effective status when a valid `?status=` was supplied. An invalid
  // status value yields no matches (a list-scoping filter, not a 400 endpoint).
  if (statusParam !== undefined) {
    const wanted = statusFilter?.success ? statusFilter.data : null;
    serialized = wanted === null ? [] : serialized.filter((c) => c.status === wanted);
  }

  res.json({ coupons: serialized });
});

// POST /coupons/:id/redeem — session-gated. Atomic compare-and-swap: flips
// `available → used` in a single UPDATE whose WHERE also excludes expired rows
// (so an expired-but-still-`available` row never swaps). Mirrors the STAFF-003
// order-status CAS pattern — no SELECT-then-UPDATE TOCTOU window. On 0 rows
// affected, follow-up reads distinguish 404 / 403 / 409.
couponsRouter.post('/:id/redeem', requireSession, async (req, res) => {
  const userId = req.user!.id;
  const couponId = String(req.params.id);
  if (!uuidSchema.safeParse(couponId).success) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }

  const now = new Date();
  const [updated] = await db
    .update(coupons)
    .set({ status: 'used', used_at: now })
    .where(
      and(
        eq(coupons.id, couponId),
        eq(coupons.user_id, userId),
        eq(coupons.status, 'available'),
        or(isNull(coupons.expires_at), gt(coupons.expires_at, now)),
      ),
    )
    .returning();

  if (updated) {
    // Resolve the linked deal/reward so the response carries a real display
    // label (mirrors how GET /coupons builds the join) instead of an empty one.
    const deal = updated.deal_id
      ? ((await db.select().from(deals).where(eq(deals.id, updated.deal_id)))[0] ?? null)
      : null;
    const reward = updated.reward_id
      ? ((await db.select().from(rewards).where(eq(rewards.id, updated.reward_id)))[0] ?? null)
      : null;
    res.status(200).json({ coupon: serializeCouponWithLabel(updated, deal, reward) });
    return;
  }

  // CAS affected 0 rows — distinguish the reason for a correct status code.
  const [existing] = await db.select().from(coupons).where(eq(coupons.id, couponId));
  if (!existing) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }
  if (existing.user_id !== userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  // Owned, but already used OR expired (past expires_at while still stored
  // `available`) → not redeemable.
  res.status(409).json({ error: 'Coupon is no longer available' });
});
