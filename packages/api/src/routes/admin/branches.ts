import { asc, eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { branches } from '../../db/schema/index';
import { serializeAdminBranch } from '../lib/serializers';
import { AdminApiError, handleAdminError, isUniqueViolation } from './lib/errors';

/**
 * Admin branch CRUD routes (ADM-002). The `requireAdmin` guard + CORS are applied
 * ONCE at the `/api/admin` mount in `index.ts` and inherited by every sub-router
 * mounted on the aggregator (`routes/admin/index.ts`), so NO handler here
 * re-checks role — `req.adminSession` is always populated.
 *
 * Soft-delete ONLY: deactivation flips `is_active = false`; there is NEVER a
 * `DELETE FROM branches`. `is_accepting_pickup` is the SAME column the (future)
 * mobile staff shell (STAFF-004) will also write — one source of truth,
 * last-write-wins accepted for now (tracked Known-Gap, no version guard added).
 */
const adminBranchesRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();

const createBranchSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().min(1),
  openingHours: z.string().min(1),
  isAcceptingPickup: z.boolean().optional(),
  estimatedPrepMinutes: z.number().int().positive().optional(),
});

// `isActive` is NOT a `createBranchSchema` field, so `.partial()` alone can't
// carry it — it is added explicitly so a generic PATCH can reactivate a branch
// the deactivate route set to `false` (`{ isActive: true }`).
// `.refine` rejects an empty `{}` body so a no-op PATCH can't bump `updated_at`.
const updateBranchSchema = createBranchSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

// GET / — ALL branches (active + inactive), name-ascending. No `is_active`
// filter: the admin view must show deactivated rows (unlike the public route).
adminBranchesRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(branches).orderBy(asc(branches.name));
  res.json({ branches: rows.map(serializeAdminBranch) });
});

// GET /:branchId — branch detail, no `is_active` filter (admin can view
// inactive rows). 404 on a malformed id or a missing row.
adminBranchesRouter.get('/:branchId', async (req, res) => {
  const branchId = String(req.params.branchId);
  if (!uuidSchema.safeParse(branchId).success) {
    res.status(404).json({ error: 'Branch not found' });
    return;
  }

  const [branch] = await db.select().from(branches).where(eq(branches.id, branchId));
  if (!branch) {
    res.status(404).json({ error: 'Branch not found' });
    return;
  }

  res.json({ branch: serializeAdminBranch(branch) });
});

// POST / — create a branch. Duplicate `slug` → 409 (caught from the DB unique
// constraint, never pre-checked with a racy SELECT).
adminBranchesRouter.post('/', async (req, res) => {
  try {
    const parsed = createBranchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid branch payload', details: parsed.error.issues });
      return;
    }
    const b = parsed.data;

    let inserted;
    try {
      [inserted] = await db
        .insert(branches)
        .values({
          name: b.name,
          slug: b.slug,
          address: b.address,
          latitude: String(b.latitude),
          longitude: String(b.longitude),
          phone: b.phone,
          opening_hours: b.openingHours,
          ...(b.isAcceptingPickup === undefined
            ? {}
            : { is_accepting_pickup: b.isAcceptingPickup }),
          ...(b.estimatedPrepMinutes === undefined
            ? {}
            : { estimated_prep_minutes: b.estimatedPrepMinutes }),
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AdminApiError(409, 'Slug already in use');
      }
      throw err;
    }

    res.status(201).json({ branch: serializeAdminBranch(inserted!) });
  } catch (err) {
    handleAdminError(err, res, 'creating branch');
  }
});

// PATCH /:branchId — partial update of any supplied fields (others untouched).
// `isActive: true` reactivates a deactivated branch. Duplicate `slug` → 409.
adminBranchesRouter.patch('/:branchId', async (req, res) => {
  try {
    const branchId = String(req.params.branchId);
    if (!uuidSchema.safeParse(branchId).success) {
      throw new AdminApiError(404, 'Branch not found');
    }

    const parsed = updateBranchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid branch payload', details: parsed.error.issues });
      return;
    }
    const b = parsed.data;

    const updates: Partial<typeof branches.$inferInsert> = { updated_at: new Date() };
    if (b.name !== undefined) updates.name = b.name;
    if (b.slug !== undefined) updates.slug = b.slug;
    if (b.address !== undefined) updates.address = b.address;
    if (b.latitude !== undefined) updates.latitude = String(b.latitude);
    if (b.longitude !== undefined) updates.longitude = String(b.longitude);
    if (b.phone !== undefined) updates.phone = b.phone;
    if (b.openingHours !== undefined) updates.opening_hours = b.openingHours;
    if (b.isAcceptingPickup !== undefined) updates.is_accepting_pickup = b.isAcceptingPickup;
    if (b.estimatedPrepMinutes !== undefined)
      updates.estimated_prep_minutes = b.estimatedPrepMinutes;
    if (b.isActive !== undefined) updates.is_active = b.isActive;

    let updated;
    try {
      [updated] = await db
        .update(branches)
        .set(updates)
        .where(eq(branches.id, branchId))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AdminApiError(409, 'Slug already in use');
      }
      throw err;
    }

    if (!updated) {
      throw new AdminApiError(404, 'Branch not found');
    }

    res.json({ branch: serializeAdminBranch(updated) });
  } catch (err) {
    handleAdminError(err, res, 'updating branch');
  }
});

// PATCH /:branchId/deactivate — soft-delete: sets `is_active = false`. The row
// SURVIVES (never `DELETE`). Reactivation is the generic PATCH `{ isActive: true }`
// (non-destructive → needs no confirm-gated endpoint).
adminBranchesRouter.patch('/:branchId/deactivate', async (req, res) => {
  try {
    const branchId = String(req.params.branchId);
    if (!uuidSchema.safeParse(branchId).success) {
      throw new AdminApiError(404, 'Branch not found');
    }

    const [updated] = await db
      .update(branches)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(branches.id, branchId))
      .returning();

    if (!updated) {
      throw new AdminApiError(404, 'Branch not found');
    }

    res.json({ branch: serializeAdminBranch(updated) });
  } catch (err) {
    handleAdminError(err, res, 'deactivating branch');
  }
});

export default adminBranchesRouter;
