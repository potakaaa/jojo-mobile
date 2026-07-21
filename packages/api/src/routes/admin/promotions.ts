import { desc, eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { promotions } from '../../db/schema/index';
import { serializeAdminPromotion } from '../lib/serializers';
import { AdminApiError, handleAdminError } from './lib/errors';

/**
 * Admin Promotion CRUD routes (ADM-008 Phase 3). A Promotion groups one or more
 * Offers under a named, time-windowed campaign (Promotion 1 — 0..N Offer, via
 * `offers.promotion_id`). The `requireAdmin` guard + CORS are applied ONCE at the
 * `/api/admin` mount in `index.ts` and inherited via the aggregator, so NO handler
 * here re-checks role. Mirrors the ADM-002 `branches.ts` shape verbatim (shared
 * `AdminApiError`/`handleAdminError`, Zod-validated bodies, 404 on missing rows).
 */
const adminPromotionsRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();

// Base object — the create refine and the `.partial()` update both derive from it
// (a `ZodEffects` from `.refine()` has no `.partial()`).
const basePromotionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

// Reject an inverted or zero-length campaign window on create.
const createPromotionSchema = basePromotionSchema.refine((v) => v.endAt > v.startAt, {
  message: 'endAt must be after startAt',
  path: ['endAt'],
});

// `.refine` rejects an empty `{}` body so a no-op PATCH can't bump `updated_at`.
// The window invariant is re-checked on the MERGED state in the handler (a partial
// body may supply only one of the two dates).
const updatePromotionSchema = basePromotionSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

// GET / — all promotions, newest-first.
adminPromotionsRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(promotions).orderBy(desc(promotions.created_at));
  res.json({ promotions: rows.map(serializeAdminPromotion) });
});

// GET /:promotionId — detail. 404 on a malformed id or a missing row.
adminPromotionsRouter.get('/:promotionId', async (req, res) => {
  const promotionId = String(req.params.promotionId);
  if (!uuidSchema.safeParse(promotionId).success) {
    res.status(404).json({ error: 'Promotion not found' });
    return;
  }

  const [promotion] = await db.select().from(promotions).where(eq(promotions.id, promotionId));
  if (!promotion) {
    res.status(404).json({ error: 'Promotion not found' });
    return;
  }

  res.json({ promotion: serializeAdminPromotion(promotion) });
});

// POST / — create a promotion.
adminPromotionsRouter.post('/', async (req, res) => {
  try {
    const parsed = createPromotionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid promotion payload', details: parsed.error.issues });
      return;
    }
    const p = parsed.data;

    const [inserted] = await db
      .insert(promotions)
      .values({
        name: p.name,
        ...(p.description === undefined ? {} : { description: p.description }),
        start_at: p.startAt,
        end_at: p.endAt,
      })
      .returning();

    res.status(201).json({ promotion: serializeAdminPromotion(inserted!) });
  } catch (err) {
    handleAdminError(err, res, 'creating promotion');
  }
});

// PATCH /:promotionId — partial update of any supplied fields (others untouched).
adminPromotionsRouter.patch('/:promotionId', async (req, res) => {
  try {
    const promotionId = String(req.params.promotionId);
    if (!uuidSchema.safeParse(promotionId).success) {
      throw new AdminApiError(404, 'Promotion not found');
    }

    const parsed = updatePromotionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid promotion payload', details: parsed.error.issues });
      return;
    }
    const p = parsed.data;

    // Re-check the window invariant on the MERGED (existing + patch) state so a
    // single-date patch can't create an inverted window (e.g. move startAt past
    // the stored endAt). Load existing only when a date field is actually touched.
    if (p.startAt !== undefined || p.endAt !== undefined) {
      const [existing] = await db.select().from(promotions).where(eq(promotions.id, promotionId));
      if (!existing) {
        throw new AdminApiError(404, 'Promotion not found');
      }
      const mergedStartAt = p.startAt ?? existing.start_at;
      const mergedEndAt = p.endAt ?? existing.end_at;
      if (mergedEndAt <= mergedStartAt) {
        res.status(400).json({ error: 'endAt must be after startAt' });
        return;
      }
    }

    const updates: Partial<typeof promotions.$inferInsert> = { updated_at: new Date() };
    if (p.name !== undefined) updates.name = p.name;
    if (p.description !== undefined) updates.description = p.description;
    if (p.startAt !== undefined) updates.start_at = p.startAt;
    if (p.endAt !== undefined) updates.end_at = p.endAt;

    const [updated] = await db
      .update(promotions)
      .set(updates)
      .where(eq(promotions.id, promotionId))
      .returning();

    if (!updated) {
      throw new AdminApiError(404, 'Promotion not found');
    }

    res.json({ promotion: serializeAdminPromotion(updated) });
  } catch (err) {
    handleAdminError(err, res, 'updating promotion');
  }
});

export default adminPromotionsRouter;
