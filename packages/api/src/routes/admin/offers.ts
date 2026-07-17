import { desc, eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { offers, products, promotions } from '../../db/schema/index';
import { centsToNumeric, numericToCents, serializeAdminOffer } from '../lib/serializers';
import { AdminApiError, handleAdminError } from './lib/errors';

/**
 * Admin Offer CRUD routes (ADM-008 Phase 3). An Offer is the discount mechanic
 * (the legacy `deals` table, renamed to `offers` in migration 0011). `offerType`
 * reuses the existing 6-value `deal_type` enum verbatim (no new enum). Money is
 * cents at the boundary (`centsToNumeric` on write, `numericToCents` on read via
 * the serializer). `promotionId` is an optional link to a parent Promotion —
 * when supplied it is validated to exist (404) BEFORE any write. Guard/CORS are
 * inherited from the `/api/admin` mount; no handler re-checks role.
 */
const adminOffersRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();

const offerTypeEnum = z.enum([
  'percentage_discount',
  'fixed_discount',
  'buy_one_take_one',
  'free_item',
  'free_upgrade',
  'bundle',
]);

type OfferType = z.infer<typeof offerTypeEnum>;

// Base object schema — the source `.partial()` derives from (a `ZodEffects` from
// `.superRefine()` has no `.partial()`, so the cross-field rules live on a
// create-only derived schema, per VALIDATE Execute-Agent Instruction E1). ADM-008
// Fix 6 adds the optional `benefitProductId`.
const baseOfferSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  offerType: offerTypeEnum,
  discountValueCents: z.number().int().nonnegative().optional(),
  minimumOrderAmountCents: z.number().int().nonnegative(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  usageLimitPerUser: z.number().int().positive().optional(),
  totalUsageLimit: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  promotionId: z.uuid().optional(),
  // Nullable so a PATCH can explicitly CLEAR the column (free→discount mechanic
  // flip sends `benefitProductId: null`). On create an explicit null behaves as
  // absent (mechanicBenefitError treats null as "no benefit").
  benefitProductId: z.uuid().nullable().optional(),
});

/**
 * ADM-008 Fix 6 mechanic⇄benefit⇄value cross-validation, shared by the create
 * `.superRefine` and the PATCH merged-state handler check. Returns the first
 * violation message, or null when the combination is valid:
 *  - free_item / free_upgrade REQUIRE a benefitProductId (they mis-discount without one).
 *  - percentage_discount / fixed_discount REJECT a benefitProductId AND REQUIRE a
 *    positive discountValueCents (closes the ₱0-burn-via-NULL-discount hole).
 *  - buy_one_take_one / bundle have no cross-rules (they cannot be coupon-redeemed).
 */
function mechanicBenefitError(input: {
  offerType: OfferType;
  benefitProductId?: string | null;
  discountValueCents?: number | null;
}): string | null {
  const isFree = input.offerType === 'free_item' || input.offerType === 'free_upgrade';
  const isDiscount =
    input.offerType === 'percentage_discount' || input.offerType === 'fixed_discount';
  const hasBenefit = input.benefitProductId !== undefined && input.benefitProductId !== null;
  if (isFree && !hasBenefit) {
    return 'benefitProductId is required for free_item and free_upgrade offers';
  }
  if (isDiscount) {
    if (hasBenefit) {
      return 'benefitProductId is not allowed for percentage_discount or fixed_discount offers';
    }
    if (input.discountValueCents === undefined || input.discountValueCents === null) {
      return 'discountValueCents is required for percentage_discount and fixed_discount offers';
    }
    if (input.discountValueCents <= 0) {
      return 'discountValueCents must be greater than 0 for percentage_discount and fixed_discount offers';
    }
  }
  return null;
}

const createOfferSchema = baseOfferSchema.superRefine((data, ctx) => {
  const message = mechanicBenefitError(data);
  if (message !== null) {
    ctx.addIssue({ code: 'custom', message });
  }
});

// `.refine` rejects an empty `{}` body so a no-op PATCH can't bump `updated_at`.
// Derives from the BASE object (not the refined create schema) so `.partial()` is
// available; the mechanic⇄benefit cross-rules run on the MERGED state in the PATCH
// handler (a partial body cannot be cross-validated in isolation).
const updateOfferSchema = baseOfferSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

/** 404 if a supplied `promotionId` does not reference an existing Promotion. */
async function assertPromotionExists(promotionId: string): Promise<void> {
  const [row] = await db
    .select({ id: promotions.id })
    .from(promotions)
    .where(eq(promotions.id, promotionId));
  if (!row) {
    throw new AdminApiError(404, 'Promotion not found');
  }
}

/**
 * FK-friendly 400 if a supplied `benefitProductId` is not a valid benefit product.
 * ADM-008 Fix 6 F5: besides existence, the product must be ACTIVE and must NOT be a
 * deal product (`is_deal = true`) — a deal-product benefit would always 400 at
 * placement via the coupon×deal guard, creating a preview/placement disagreement, and
 * an inactive product cannot be added to a cart to satisfy redemption.
 */
async function assertBenefitProductExists(benefitProductId: string): Promise<void> {
  const [row] = await db
    .select({ id: products.id, isDeal: products.is_deal, isActive: products.is_active })
    .from(products)
    .where(eq(products.id, benefitProductId));
  if (!row) {
    throw new AdminApiError(400, 'benefitProductId does not reference an existing product');
  }
  if (row.isDeal) {
    throw new AdminApiError(400, 'benefitProductId cannot be a deal product');
  }
  if (!row.isActive) {
    throw new AdminApiError(400, 'benefitProductId must reference an active product');
  }
}

// GET / — all offers, newest-first. Optional `?promotionId=` filter.
adminOffersRouter.get('/', async (req, res) => {
  const promotionId = req.query.promotionId;
  if (typeof promotionId === 'string') {
    if (!uuidSchema.safeParse(promotionId).success) {
      res.json({ offers: [] });
      return;
    }
    const rows = await db
      .select()
      .from(offers)
      .where(eq(offers.promotion_id, promotionId))
      .orderBy(desc(offers.created_at));
    res.json({ offers: rows.map(serializeAdminOffer) });
    return;
  }

  const rows = await db.select().from(offers).orderBy(desc(offers.created_at));
  res.json({ offers: rows.map(serializeAdminOffer) });
});

// GET /:offerId — detail. 404 on a malformed id or a missing row.
adminOffersRouter.get('/:offerId', async (req, res) => {
  const offerId = String(req.params.offerId);
  if (!uuidSchema.safeParse(offerId).success) {
    res.status(404).json({ error: 'Offer not found' });
    return;
  }

  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId));
  if (!offer) {
    res.status(404).json({ error: 'Offer not found' });
    return;
  }

  res.json({ offer: serializeAdminOffer(offer) });
});

// POST / — create an offer. Validates `promotionId` FK (404) before any write.
adminOffersRouter.post('/', async (req, res) => {
  try {
    const parsed = createOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid offer payload', details: parsed.error.issues });
      return;
    }
    const o = parsed.data;

    if (o.promotionId !== undefined) {
      await assertPromotionExists(o.promotionId);
    }
    if (o.benefitProductId != null) {
      await assertBenefitProductExists(o.benefitProductId);
    }

    const [inserted] = await db
      .insert(offers)
      .values({
        title: o.title,
        ...(o.description === undefined ? {} : { description: o.description }),
        deal_type: o.offerType,
        ...(o.discountValueCents === undefined
          ? {}
          : { discount_value: centsToNumeric(o.discountValueCents) }),
        minimum_order_amount: centsToNumeric(o.minimumOrderAmountCents),
        start_at: o.startAt,
        end_at: o.endAt,
        ...(o.usageLimitPerUser === undefined ? {} : { usage_limit_per_user: o.usageLimitPerUser }),
        ...(o.totalUsageLimit === undefined ? {} : { total_usage_limit: o.totalUsageLimit }),
        ...(o.isActive === undefined ? {} : { is_active: o.isActive }),
        ...(o.promotionId === undefined ? {} : { promotion_id: o.promotionId }),
        ...(o.benefitProductId === undefined ? {} : { benefit_product_id: o.benefitProductId }),
      })
      .returning();

    res.status(201).json({ offer: serializeAdminOffer(inserted!) });
  } catch (err) {
    handleAdminError(err, res, 'creating offer');
  }
});

// PATCH /:offerId — partial update. Re-validates `promotionId` FK (404) if supplied.
adminOffersRouter.patch('/:offerId', async (req, res) => {
  try {
    const offerId = String(req.params.offerId);
    if (!uuidSchema.safeParse(offerId).success) {
      throw new AdminApiError(404, 'Offer not found');
    }

    const parsed = updateOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid offer payload', details: parsed.error.issues });
      return;
    }
    const o = parsed.data;

    // Load the existing row FIRST — the mechanic⇄benefit⇄value cross-rules must be
    // validated against the MERGED (existing + patch) state, not the patch in
    // isolation (partial-update bypass trap: e.g. flipping only `offerType` to a
    // free mechanic while `benefit_product_id` stays NULL, or flipping to a discount
    // mechanic while a benefit lingers).
    const [existing] = await db.select().from(offers).where(eq(offers.id, offerId));
    if (!existing) {
      throw new AdminApiError(404, 'Offer not found');
    }

    // ADM-008 Fix 6 F4: only run the mechanic⇄benefit⇄value cross-validation when the
    // patch actually TOUCHES one of those three fields. A patch that changes none of
    // them (e.g. a deactivate-only `{ isActive: false }`, a rename, or a window edit)
    // must NOT be blocked by a pre-existing legacy-invalid row — otherwise an admin
    // could never deactivate a misconfigured offer.
    const touchesMechanicFields =
      o.offerType !== undefined ||
      o.benefitProductId !== undefined ||
      o.discountValueCents !== undefined;
    if (touchesMechanicFields) {
      const mergedBenefitProductId =
        o.benefitProductId !== undefined ? o.benefitProductId : existing.benefit_product_id;
      const mergedDiscountValueCents =
        o.discountValueCents !== undefined
          ? o.discountValueCents
          : existing.discount_value === null
            ? null
            : numericToCents(existing.discount_value);
      const mergeError = mechanicBenefitError({
        offerType: o.offerType ?? existing.deal_type,
        benefitProductId: mergedBenefitProductId,
        discountValueCents: mergedDiscountValueCents,
      });
      if (mergeError !== null) {
        res.status(400).json({ error: mergeError });
        return;
      }
    }

    if (o.promotionId !== undefined) {
      await assertPromotionExists(o.promotionId);
    }
    if (o.benefitProductId != null) {
      await assertBenefitProductExists(o.benefitProductId);
    }

    const updates: Partial<typeof offers.$inferInsert> = { updated_at: new Date() };
    if (o.title !== undefined) updates.title = o.title;
    if (o.description !== undefined) updates.description = o.description;
    if (o.offerType !== undefined) updates.deal_type = o.offerType;
    if (o.discountValueCents !== undefined)
      updates.discount_value = centsToNumeric(o.discountValueCents);
    if (o.minimumOrderAmountCents !== undefined)
      updates.minimum_order_amount = centsToNumeric(o.minimumOrderAmountCents);
    if (o.startAt !== undefined) updates.start_at = o.startAt;
    if (o.endAt !== undefined) updates.end_at = o.endAt;
    if (o.usageLimitPerUser !== undefined) updates.usage_limit_per_user = o.usageLimitPerUser;
    if (o.totalUsageLimit !== undefined) updates.total_usage_limit = o.totalUsageLimit;
    if (o.isActive !== undefined) updates.is_active = o.isActive;
    if (o.promotionId !== undefined) updates.promotion_id = o.promotionId;
    if (o.benefitProductId !== undefined) updates.benefit_product_id = o.benefitProductId;

    const [updated] = await db
      .update(offers)
      .set(updates)
      .where(eq(offers.id, offerId))
      .returning();

    if (!updated) {
      throw new AdminApiError(404, 'Offer not found');
    }

    res.json({ offer: serializeAdminOffer(updated) });
  } catch (err) {
    handleAdminError(err, res, 'updating offer');
  }
});

export default adminOffersRouter;
