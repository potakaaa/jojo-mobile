import { desc, eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { coupons, offers } from '../../db/schema/index';
import { offerCouponCodeGenerator } from '../../lib/reward-coupon-code';
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

// Whole-batch validation FIRST (AC11): a malformed request (quantity<=0, missing
// offerId) is rejected with 400 by `safeParse` BEFORE any DB write, so no partial
// rows are ever written. `userId` is only valid for a single targeted coupon.
const generateSchema = z
  .object({
    offerId: z.uuid(),
    quantity: z.number().int().min(1),
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

    // Referenced Offer must exist (404) — checked before any coupon write.
    const [offer] = await db.select({ id: offers.id }).from(offers).where(eq(offers.id, offerId));
    if (!offer) {
      throw new AdminApiError(404, 'Offer not found');
    }

    // Persist user_id ONLY for a targeted single issue; bulk coupons stay NULL
    // (claimed on redeem via COALESCE in the Phase 2 atomic burn UPDATE).
    const targetedUserId = quantity === 1 && userId !== undefined ? userId : null;

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
