import { asc, eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { categories } from '../../db/schema/index';
import { serializeAdminCategory } from '../lib/serializers';
import { AdminApiError, handleAdminError, isUniqueViolation } from './lib/errors';

/**
 * Admin category CRUD routes (ADM-003). The `requireAdmin` guard + CORS are
 * applied ONCE at the `/api/admin` mount in `index.ts` and inherited by every
 * sub-router on the aggregator, so NO handler here re-checks role.
 *
 * Soft-delete ONLY: deactivation flips `is_active = false`; there is NEVER a
 * `DELETE FROM categories` (categories are FK-referenced by `products.category_id`).
 */
const adminCategoriesRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();

const createCategorySchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

// `isActive` is added explicitly (not in `createCategorySchema`) so a generic
// PATCH can reactivate a category the deactivate route set to `false`.
// `.refine` rejects an empty `{}` body so a no-op PATCH can't bump `updated_at`.
const updateCategorySchema = createCategorySchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

// GET / — ALL categories (active + inactive), sort_order then name. The admin
// view must show deactivated rows (unlike the public menu).
adminCategoriesRouter.get('/', async (_req, res) => {
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sort_order), asc(categories.name));
  res.json({ categories: rows.map(serializeAdminCategory) });
});

// GET /:categoryId — detail, no `is_active` filter. 404 on malformed/missing id.
adminCategoriesRouter.get('/:categoryId', async (req, res) => {
  const categoryId = String(req.params.categoryId);
  if (!uuidSchema.safeParse(categoryId).success) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId));
  if (!category) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  res.json({ category: serializeAdminCategory(category) });
});

// POST / — create a category. Duplicate `slug` → 409 (from the DB unique
// constraint, never a racy pre-SELECT).
adminCategoriesRouter.post('/', async (req, res) => {
  try {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid category payload', details: parsed.error.issues });
      return;
    }
    const c = parsed.data;

    let inserted;
    try {
      [inserted] = await db
        .insert(categories)
        .values({
          name: c.name,
          slug: c.slug,
          ...(c.sortOrder === undefined ? {} : { sort_order: c.sortOrder }),
          ...(c.isActive === undefined ? {} : { is_active: c.isActive }),
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AdminApiError(409, 'Slug already in use');
      }
      throw err;
    }

    res.status(201).json({ category: serializeAdminCategory(inserted!) });
  } catch (err) {
    handleAdminError(err, res, 'creating category');
  }
});

// PATCH /:categoryId — partial update. `isActive: true` reactivates a
// deactivated category. Duplicate `slug` → 409.
adminCategoriesRouter.patch('/:categoryId', async (req, res) => {
  try {
    const categoryId = String(req.params.categoryId);
    if (!uuidSchema.safeParse(categoryId).success) {
      throw new AdminApiError(404, 'Category not found');
    }

    const parsed = updateCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid category payload', details: parsed.error.issues });
      return;
    }
    const c = parsed.data;

    const updates: Partial<typeof categories.$inferInsert> = { updated_at: new Date() };
    if (c.name !== undefined) updates.name = c.name;
    if (c.slug !== undefined) updates.slug = c.slug;
    if (c.sortOrder !== undefined) updates.sort_order = c.sortOrder;
    if (c.isActive !== undefined) updates.is_active = c.isActive;

    let updated;
    try {
      [updated] = await db
        .update(categories)
        .set(updates)
        .where(eq(categories.id, categoryId))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AdminApiError(409, 'Slug already in use');
      }
      throw err;
    }

    if (!updated) {
      throw new AdminApiError(404, 'Category not found');
    }

    res.json({ category: serializeAdminCategory(updated) });
  } catch (err) {
    handleAdminError(err, res, 'updating category');
  }
});

// PATCH /:categoryId/deactivate — soft-delete: sets `is_active = false`. The row
// SURVIVES (never `DELETE`). Reactivation is the generic PATCH `{ isActive: true }`.
adminCategoriesRouter.patch('/:categoryId/deactivate', async (req, res) => {
  try {
    const categoryId = String(req.params.categoryId);
    if (!uuidSchema.safeParse(categoryId).success) {
      throw new AdminApiError(404, 'Category not found');
    }

    const [updated] = await db
      .update(categories)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(categories.id, categoryId))
      .returning();

    if (!updated) {
      throw new AdminApiError(404, 'Category not found');
    }

    res.json({ category: serializeAdminCategory(updated) });
  } catch (err) {
    handleAdminError(err, res, 'deactivating category');
  }
});

export default adminCategoriesRouter;
