import { desc, eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { offers, promotions } from '../../db/schema/index';
import { centsToNumeric, serializeAdminOffer } from '../lib/serializers';
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

const createOfferSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  offerType: offerTypeEnum,
  discountValueCents: z.number().int().nonnegative().optional(),
  minimumOrderAmountCents: z.number().int().nonnegative(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  usageLimitPerUser: z.number().int().positive().optional(),
  totalUsageLimit: z.number().int().positive().optional(),
  promotionId: z.uuid().optional(),
});

// `.refine` rejects an empty `{}` body so a no-op PATCH can't bump `updated_at`.
const updateOfferSchema = createOfferSchema
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
        ...(o.promotionId === undefined ? {} : { promotion_id: o.promotionId }),
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

    if (o.promotionId !== undefined) {
      await assertPromotionExists(o.promotionId);
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
    if (o.promotionId !== undefined) updates.promotion_id = o.promotionId;

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
