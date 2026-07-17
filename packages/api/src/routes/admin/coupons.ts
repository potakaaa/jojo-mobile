import { desc, eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { coupons, offers, users } from '../../db/schema/index';
import { offerCouponCodeGenerator } from '../../lib/reward-coupon-code';
import { couponIdentityIsExclusive } from '../lib/coupon-identity';
import { serializeAdminCoupon } from '../lib/serializers';
import { AdminApiError, handleAdminError, isUniqueViolation } from './lib/errors';

/**
 * Admin coupon issuance routes (ADM-008 Phase 3). Issues burnable `coupons` rows
 * for an Offer — either BULK (N codes, `user_id` NULL, claimed on redeem) or a
 * single TARGETED coupon (`user_id` set). Reuses the collision-safe code
 * generator from `lib/reward-coupon-code.ts` (parameterized to the `JP-OFR-`
 * prefix) with the SAME savepoint-bounded retry the star-earning unlock uses —
 * a `coupons.code` UNIQUE collision aborts only the savepoint, never the batch.
 * Guard/CORS are inherited from the `/api/admin` mount; no handler re-checks role.
 */
const adminCouponsRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();

/** Max attempts to dodge a `coupons.code` UNIQUE collision (mirrors star-earning). */
const COUPON_CODE_MAX_ATTEMPTS = 5;

/** Upper bound on codes minted per request — a serial-insert loop, so cap it. */
const MAX_COUPON_QUANTITY = 500;

// Whole-batch validation FIRST (AC11): a malformed request (quantity<=0, missing
// offerId) is rejected with 400 by `safeParse` BEFORE any DB write, so no partial
// rows are ever written. `userId` is only valid for a single targeted coupon.
const generateSchema = z
  .object({
    offerId: z.uuid(),
    quantity: z.number().int().min(1).max(MAX_COUPON_QUANTITY),
    userId: z.uuid().optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .refine((v) => v.userId === undefined || v.quantity === 1, {
    message: 'userId is only valid for a single targeted coupon (quantity must be 1)',
    path: ['userId'],
  });

type CouponRow = typeof coupons.$inferSelect;

// POST /generate — bulk (N codes, user_id NULL) or single targeted (user_id set).
adminCouponsRouter.post('/generate', async (req, res) => {
  try {
    // AC11: validate the WHOLE batch first; reject before any DB write.
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Invalid coupon-generation payload', details: parsed.error.issues });
      return;
    }
    const { offerId, quantity, userId, expiresAt } = parsed.data;

    // Referenced Offer must exist (404) — checked before any coupon write. The
    // deal_type + benefit_product_id + discount_value are read too so an
    // unredeemable offer can be blocked (ADM-008 Fix 6, below).
    const [offer] = await db
      .select({
        id: offers.id,
        dealType: offers.deal_type,
        benefitProductId: offers.benefit_product_id,
        discountValue: offers.discount_value,
      })
      .from(offers)
      .where(eq(offers.id, offerId));
    if (!offer) {
      throw new AdminApiError(404, 'Offer not found');
    }

    // ADM-008 Fix 6: a free_item/free_upgrade offer with no benefit product cannot
    // be redeemed (the resolver rejects it), so refuse to mint codes against one —
    // fail before any coupon write, matching the malformed-payload 400 contract.
    if (
      (offer.dealType === 'free_item' || offer.dealType === 'free_upgrade') &&
      offer.benefitProductId === null
    ) {
      throw new AdminApiError(
        400,
        'This offer has no benefit product configured — set one before generating coupons.',
      );
    }

    // ADM-008 Fix 6 F6: buy_one_take_one / bundle offers have no coupon-redemption
    // semantics — the resolver permanently denies them — so refuse to mint codes that
    // could never be redeemed.
    if (offer.dealType === 'buy_one_take_one' || offer.dealType === 'bundle') {
      throw new AdminApiError(400, 'This offer type cannot be redeemed with a coupon.');
    }

    // ADM-008 Fix 6 F6 (F1 mint-side twin): a percentage/fixed offer with a NULL or
    // non-positive discount_value resolves to zero benefit (the resolver rejects it),
    // so refuse to mint codes against it.
    if (
      (offer.dealType === 'percentage_discount' || offer.dealType === 'fixed_discount') &&
      (offer.discountValue === null || Number(offer.discountValue) <= 0)
    ) {
      throw new AdminApiError(
        400,
        'This offer has no discount value configured — set one before generating coupons.',
      );
    }

    // Reward XOR offer invariant (DB CHECK coupons_reward_offer_mutex, migration
    // 0015). This route only ever sets offer_id — reward_id is never in scope — so
    // this guard is a non-reachable assertion today; it enforces the invariant in
    // code so a future edit that adds reward_id here is rejected at the boundary
    // (400) before the DB CHECK fires. An admin wanting both benefits mints two
    // separate coupons.
    if (!couponIdentityIsExclusive({ offer_id: offerId, reward_id: null })) {
      throw new AdminApiError(400, 'A coupon cannot be both a reward coupon and an offer coupon.');
    }

    // Persist user_id ONLY for a targeted single issue; bulk coupons stay NULL
    // (claimed on redeem via COALESCE in the Phase 2 atomic burn UPDATE).
    const targetedUserId = quantity === 1 && userId !== undefined ? userId : null;

    // Validate the target user exists BEFORE any coupon write — otherwise the
    // `coupons.user_id → users` FK (23503) surfaces as an unmapped 500 instead of
    // a clean 404.
    if (targetedUserId !== null) {
      const [userRow] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, targetedUserId));
      if (!userRow) {
        throw new AdminApiError(404, 'User not found');
      }
    }

    const created = await db.transaction(async (tx) => {
      const rows: CouponRow[] = [];
      for (let i = 0; i < quantity; i += 1) {
        let inserted: CouponRow[] = [];
        for (let attempt = 0; attempt < COUPON_CODE_MAX_ATTEMPTS; attempt += 1) {
          try {
            // Savepoint per insert: a `coupons.code` collision aborts only the
            // savepoint, so the whole batch is not poisoned and the retry can
            // mint a fresh code (mirrors star-earning's in-tx retry).
            inserted = await tx.transaction(async (sp) =>
              sp
                .insert(coupons)
                .values({
                  offer_id: offerId,
                  user_id: targetedUserId,
                  code: offerCouponCodeGenerator.generate(),
                  ...(expiresAt === undefined ? {} : { expires_at: expiresAt }),
                })
                .returning(),
            );
            break;
          } catch (err) {
            // The only UNIQUE constraint reachable here is `coupons.code` (no
            // reward_id → the partial (user,reward) index never applies), so a
            // 23505 is always a code collision → retry with a fresh code.
            if (isUniqueViolation(err) && attempt < COUPON_CODE_MAX_ATTEMPTS - 1) continue;
            throw err;
          }
        }
        rows.push(inserted[0]!);
      }
      return rows;
    });

    res.status(201).json({ coupons: created.map(serializeAdminCoupon) });
  } catch (err) {
    handleAdminError(err, res, 'generating coupons');
  }
});

// GET /?offerId= — list coupons for an Offer (query filter required → 400 if absent).
adminCouponsRouter.get('/', async (req, res) => {
  const offerId = req.query.offerId;
  if (typeof offerId !== 'string' || !uuidSchema.safeParse(offerId).success) {
    res.status(400).json({ error: 'offerId query parameter is required' });
    return;
  }

  const rows = await db
    .select()
    .from(coupons)
    .where(eq(coupons.offer_id, offerId))
    .orderBy(desc(coupons.created_at));
  res.json({ coupons: rows.map(serializeAdminCoupon) });
});

export default adminCouponsRouter;
