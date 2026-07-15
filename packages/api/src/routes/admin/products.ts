import { and, asc, eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import {
  branchProductAvailability,
  branches,
  categories,
  productOptions,
  products,
} from '../../db/schema/index';
import {
  centsToNumeric,
  serializeAdminBranchAvailability,
  serializeAdminProduct,
  serializeAdminProductOption,
} from '../lib/serializers';
import { AdminApiError, handleAdminError, isUniqueViolation } from './lib/errors';

/**
 * Admin product-catalog CRUD routes (ADM-003): products, their options
 * (size/flavor/add_on variants), and per-branch availability. The `requireAdmin`
 * guard + CORS are applied ONCE at the `/api/admin` mount in `index.ts` and
 * inherited here, so NO handler re-checks role.
 *
 * Soft-delete ONLY: deactivation flips `is_active`/`is_available = false`; there
 * is NEVER a `DELETE` (products/options are FK-referenced by `order_items` and
 * deal join tables). Money is integer CENTS at the HTTP boundary — the
 * `centsToNumeric`/`numericToCents` conversion is the ONLY place cents<->numeric
 * happens (never in the app layer). Editing `base_price` writes only the
 * `products` row; historical `order_items.unit_price`/`total_price` are physical
 * snapshot columns written once at placement time and are never recomputed here
 * (the snapshot-integrity invariant — AC1).
 */
const adminProductsRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();
const optionTypeSchema = z.enum(['size', 'flavor', 'add_on']);

const createProductSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  basePriceCents: z.number().int().nonnegative(),
  isActive: z.boolean().optional(),
  isRewardEligible: z.boolean().optional(),
});

// `.refine` rejects an empty `{}` body so a no-op PATCH can't bump `updated_at`.
const updateProductSchema = createProductSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const createOptionSchema = z.object({
  optionType: optionTypeSchema,
  name: z.string().trim().min(1),
  priceDeltaCents: z.number().int().nonnegative().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const updateOptionSchema = createOptionSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
});

/** Assert a `category_id` references an existing, ACTIVE category → else 400. */
async function assertActiveCategory(categoryId: string): Promise<void> {
  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId));
  if (!category || !category.is_active) {
    throw new AdminApiError(400, 'Invalid or inactive category');
  }
}

// ─── Products ────────────────────────────────────────────────────────────────

// GET / — ALL products (active + inactive), optionally filtered by ?categoryId=.
adminProductsRouter.get('/', async (req, res) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  if (categoryId !== undefined && !uuidSchema.safeParse(categoryId).success) {
    res.status(400).json({ error: 'Invalid categoryId' });
    return;
  }

  const rows = categoryId
    ? await db
        .select()
        .from(products)
        .where(eq(products.category_id, categoryId))
        .orderBy(asc(products.name))
    : await db.select().from(products).orderBy(asc(products.name));

  res.json({ products: rows.map(serializeAdminProduct) });
});

// GET /:productId — detail, no `is_active` filter. 404 on malformed/missing id.
adminProductsRouter.get('/:productId', async (req, res) => {
  const productId = String(req.params.productId);
  if (!uuidSchema.safeParse(productId).success) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  res.json({ product: serializeAdminProduct(product) });
});

// POST / — create a product. `category_id` must reference an active category
// (400 otherwise). Duplicate `slug` → 409. `basePriceCents` → numeric on write.
adminProductsRouter.post('/', async (req, res) => {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid product payload', details: parsed.error.issues });
      return;
    }
    const p = parsed.data;

    await assertActiveCategory(p.categoryId);

    let inserted;
    try {
      [inserted] = await db
        .insert(products)
        .values({
          category_id: p.categoryId,
          name: p.name,
          slug: p.slug,
          description: p.description ?? null,
          image_url: p.imageUrl ?? null,
          base_price: centsToNumeric(p.basePriceCents),
          ...(p.isActive === undefined ? {} : { is_active: p.isActive }),
          ...(p.isRewardEligible === undefined ? {} : { is_reward_eligible: p.isRewardEligible }),
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AdminApiError(409, 'Slug already in use');
      }
      throw err;
    }

    res.status(201).json({ product: serializeAdminProduct(inserted!) });
  } catch (err) {
    handleAdminError(err, res, 'creating product');
  }
});

// PATCH /:productId — partial update, including `base_price` (cents → numeric).
// A supplied `categoryId` is re-validated as active. Duplicate `slug` → 409.
adminProductsRouter.patch('/:productId', async (req, res) => {
  try {
    const productId = String(req.params.productId);
    if (!uuidSchema.safeParse(productId).success) {
      throw new AdminApiError(404, 'Product not found');
    }

    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid product payload', details: parsed.error.issues });
      return;
    }
    const p = parsed.data;

    if (p.categoryId !== undefined) {
      await assertActiveCategory(p.categoryId);
    }

    const updates: Partial<typeof products.$inferInsert> = { updated_at: new Date() };
    if (p.categoryId !== undefined) updates.category_id = p.categoryId;
    if (p.name !== undefined) updates.name = p.name;
    if (p.slug !== undefined) updates.slug = p.slug;
    if (p.description !== undefined) updates.description = p.description;
    if (p.imageUrl !== undefined) updates.image_url = p.imageUrl;
    if (p.basePriceCents !== undefined) updates.base_price = centsToNumeric(p.basePriceCents);
    if (p.isActive !== undefined) updates.is_active = p.isActive;
    if (p.isRewardEligible !== undefined) updates.is_reward_eligible = p.isRewardEligible;

    let updated;
    try {
      [updated] = await db
        .update(products)
        .set(updates)
        .where(eq(products.id, productId))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AdminApiError(409, 'Slug already in use');
      }
      throw err;
    }

    if (!updated) {
      throw new AdminApiError(404, 'Product not found');
    }

    res.json({ product: serializeAdminProduct(updated) });
  } catch (err) {
    handleAdminError(err, res, 'updating product');
  }
});

// PATCH /:productId/deactivate — soft-delete: sets `is_active = false`. Row survives.
adminProductsRouter.patch('/:productId/deactivate', async (req, res) => {
  try {
    const productId = String(req.params.productId);
    if (!uuidSchema.safeParse(productId).success) {
      throw new AdminApiError(404, 'Product not found');
    }

    const [updated] = await db
      .update(products)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(products.id, productId))
      .returning();

    if (!updated) {
      throw new AdminApiError(404, 'Product not found');
    }

    res.json({ product: serializeAdminProduct(updated) });
  } catch (err) {
    handleAdminError(err, res, 'deactivating product');
  }
});

// ─── Product options ─────────────────────────────────────────────────────────

// GET /:productId/options — list a product's options (active + inactive).
adminProductsRouter.get('/:productId/options', async (req, res) => {
  const productId = String(req.params.productId);
  if (!uuidSchema.safeParse(productId).success) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const rows = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.product_id, productId))
    .orderBy(asc(productOptions.sort_order), asc(productOptions.name));

  res.json({ options: rows.map(serializeAdminProductOption) });
});

// POST /:productId/options — create an option. `option_type` enum is
// server-validated; `priceDeltaCents` → numeric on write.
adminProductsRouter.post('/:productId/options', async (req, res) => {
  try {
    const productId = String(req.params.productId);
    if (!uuidSchema.safeParse(productId).success) {
      throw new AdminApiError(404, 'Product not found');
    }

    const parsed = createOptionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid option payload', details: parsed.error.issues });
      return;
    }
    const o = parsed.data;

    // The product must exist — an FK insert would 500 otherwise; give a clean 404.
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product) {
      throw new AdminApiError(404, 'Product not found');
    }

    const [inserted] = await db
      .insert(productOptions)
      .values({
        product_id: productId,
        option_type: o.optionType,
        name: o.name,
        ...(o.priceDeltaCents === undefined
          ? {}
          : { price_delta: centsToNumeric(o.priceDeltaCents) }),
        ...(o.sortOrder === undefined ? {} : { sort_order: o.sortOrder }),
        ...(o.isActive === undefined ? {} : { is_active: o.isActive }),
      })
      .returning();

    res.status(201).json({ option: serializeAdminProductOption(inserted!) });
  } catch (err) {
    handleAdminError(err, res, 'creating product option');
  }
});

// PATCH /:productId/options/:optionId — partial option update.
adminProductsRouter.patch('/:productId/options/:optionId', async (req, res) => {
  try {
    const productId = String(req.params.productId);
    const optionId = String(req.params.optionId);
    if (!uuidSchema.safeParse(productId).success || !uuidSchema.safeParse(optionId).success) {
      throw new AdminApiError(404, 'Option not found');
    }

    const parsed = updateOptionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid option payload', details: parsed.error.issues });
      return;
    }
    const o = parsed.data;

    const updates: Partial<typeof productOptions.$inferInsert> = { updated_at: new Date() };
    if (o.optionType !== undefined) updates.option_type = o.optionType;
    if (o.name !== undefined) updates.name = o.name;
    if (o.priceDeltaCents !== undefined) updates.price_delta = centsToNumeric(o.priceDeltaCents);
    if (o.sortOrder !== undefined) updates.sort_order = o.sortOrder;
    if (o.isActive !== undefined) updates.is_active = o.isActive;

    const [updated] = await db
      .update(productOptions)
      .set(updates)
      .where(and(eq(productOptions.id, optionId), eq(productOptions.product_id, productId)))
      .returning();

    if (!updated) {
      throw new AdminApiError(404, 'Option not found');
    }

    res.json({ option: serializeAdminProductOption(updated) });
  } catch (err) {
    handleAdminError(err, res, 'updating product option');
  }
});

// PATCH /:productId/options/:optionId/deactivate — soft-delete: is_active=false.
adminProductsRouter.patch('/:productId/options/:optionId/deactivate', async (req, res) => {
  try {
    const productId = String(req.params.productId);
    const optionId = String(req.params.optionId);
    if (!uuidSchema.safeParse(productId).success || !uuidSchema.safeParse(optionId).success) {
      throw new AdminApiError(404, 'Option not found');
    }

    const [updated] = await db
      .update(productOptions)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(eq(productOptions.id, optionId), eq(productOptions.product_id, productId)))
      .returning();

    if (!updated) {
      throw new AdminApiError(404, 'Option not found');
    }

    res.json({ option: serializeAdminProductOption(updated) });
  } catch (err) {
    handleAdminError(err, res, 'deactivating product option');
  }
});

// ─── Per-branch availability ─────────────────────────────────────────────────

// GET /:productId/availability — list per-branch availability rows for a product.
adminProductsRouter.get('/:productId/availability', async (req, res) => {
  const productId = String(req.params.productId);
  if (!uuidSchema.safeParse(productId).success) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const rows = await db
    .select()
    .from(branchProductAvailability)
    .where(eq(branchProductAvailability.product_id, productId));

  res.json({ availability: rows.map(serializeAdminBranchAvailability) });
});

// PATCH /:productId/availability/:branchId — upsert `is_available` for a
// branch+product pair. Decision 3: a single Drizzle `.onConflictDoUpdate()`
// keyed on the composite unique index `bpa_branch_product_idx`
// (branch_id + product_id) — idempotent, never creates a duplicate row.
adminProductsRouter.patch('/:productId/availability/:branchId', async (req, res) => {
  try {
    const productId = String(req.params.productId);
    const branchId = String(req.params.branchId);
    if (!uuidSchema.safeParse(productId).success || !uuidSchema.safeParse(branchId).success) {
      throw new AdminApiError(404, 'Product or branch not found');
    }

    const parsed = availabilitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid availability payload', details: parsed.error.issues });
      return;
    }

    // Both FK targets must exist — an FK violation would otherwise surface as a
    // 500; give a clean 404 instead.
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product) {
      throw new AdminApiError(404, 'Product or branch not found');
    }
    const [branch] = await db.select().from(branches).where(eq(branches.id, branchId));
    if (!branch) {
      throw new AdminApiError(404, 'Product or branch not found');
    }

    const [row] = await db
      .insert(branchProductAvailability)
      .values({
        branch_id: branchId,
        product_id: productId,
        is_available: parsed.data.isAvailable,
      })
      .onConflictDoUpdate({
        target: [branchProductAvailability.branch_id, branchProductAvailability.product_id],
        set: { is_available: parsed.data.isAvailable, updated_at: new Date() },
      })
      .returning();

    res.json({ availability: serializeAdminBranchAvailability(row!) });
  } catch (err) {
    handleAdminError(err, res, 'updating branch availability');
  }
});

export default adminProductsRouter;
