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

const createPromotionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

// `.refine` rejects an empty `{}` body so a no-op PATCH can't bump `updated_at`.
const updatePromotionSchema = createPromotionSchema
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
