import { and, count, desc, eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import {
  branches,
  coupons,
  dealBranches,
  dealProducts,
  deals,
  products,
} from '../../db/schema/index';
import { centsToNumeric, serializeAdminDeal } from '../lib/serializers';
import { AdminApiError, handleAdminError, isUniqueViolation } from './lib/errors';

/**
 * Admin deals CRUD routes (ADM-004): the `deals` table plus its `deal_products`
 * and `deal_branches` many-to-many junctions. The `requireAdmin` guard + CORS are
 * applied ONCE at the `/api/admin` mount in `index.ts` and inherited here, so NO
 * handler re-checks role.
 *
 * Two DELIBERATE NEW PRECEDENTS for a `routes/admin/*` file (called out so they
 * read as intentional, not scope creep — mirroring how `lib/errors.ts` documents
 * the P2/P3 precedents it set):
 *  1. FIRST admin-initiated write to `coupons` — the deactivate route's opt-in
 *     `couponPolicy: 'expire'` path transitions this deal's `available` coupons
 *     to `expired`. Never touched by any prior admin phase.
 *  2. FIRST `db.transaction()` in any admin route — the `'expire'` cascade wraps
 *     the coupon `UPDATE` + `deals.is_active` flip in one atomic transaction so a
 *     partial failure can never leave the two tables inconsistent (the same
 *     `db.transaction()` pattern already proven in `routes/orders.ts`).
 *
 * Soft-delete ONLY: deactivation flips `is_active = false` via its own dedicated
 * `POST .../deactivate` route; there is NEVER a `DELETE` on a `deals` row. The
 * junction `DELETE` endpoints remove only the many-to-many LINK row, never the
 * underlying deal/product/branch. `order_items` and `star_transactions` are NEVER
 * touched by this phase. Money is integer CENTS at the HTTP boundary — the
 * `centsToNumeric`/`numericToCents` conversion is the ONLY place cents<->numeric
 * happens (never in the app layer), applied UNCONDITIONALLY across all 6 deal
 * types (no per-`deal_type` branching — see `serializeAdminDeal`).
 */
const adminDealsRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();

const dealTypeSchema = z.enum([
  'percentage_discount',
  'fixed_discount',
  'buy_one_take_one',
  'free_item',
  'free_upgrade',
  'bundle',
]);

/** Deal types that REQUIRE a non-null `discount_value` (D5). */
const DISCOUNT_REQUIRED_TYPES: ReadonlySet<z.infer<typeof dealTypeSchema>> = new Set([
  'percentage_discount',
  'fixed_discount',
]);

// Accept both full ISO (`2026-07-15T10:00:00.000Z`) and `datetime-local`
// (`2026-07-15T10:00`) strings — any value `new Date()` can parse.
const dateStringSchema = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), { message: 'Invalid datetime' });

const createDealSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    dealType: dealTypeSchema,
    discountValueCents: z.number().int().nonnegative().nullable().optional(),
    minimumOrderAmountCents: z.number().int().nonnegative().optional(),
    startAt: dateStringSchema,
    endAt: dateStringSchema,
    usageLimitPerUser: z.number().int().positive().nullable().optional(),
    totalUsageLimit: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => new Date(v.endAt).getTime() > new Date(v.startAt).getTime(), {
    message: 'end_at must be after start_at',
    path: ['endAt'],
  })
  .refine(
    (v) => !(DISCOUNT_REQUIRED_TYPES.has(v.dealType) && (v.discountValueCents ?? null) === null),
    { message: 'discount_value is required for this deal type', path: ['discountValueCents'] },
  );

// PATCH: all fields optional, `is_active` intentionally EXCLUDED (deactivation is
// its own route). No cross-field date refine here — the handler does the
// fetch-merge-validate for `start_at`/`end_at` (D5/AC10) instead, because a
// `.refine()` on an isolated partial body cannot validate a single-field change.
const updateDealSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    dealType: dealTypeSchema.optional(),
    discountValueCents: z.number().int().nonnegative().nullable().optional(),
    minimumOrderAmountCents: z.number().int().nonnegative().optional(),
    startAt: dateStringSchema.optional(),
    endAt: dateStringSchema.optional(),
    usageLimitPerUser: z.number().int().positive().nullable().optional(),
    totalUsageLimit: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const deactivateDealSchema = z.object({
  couponPolicy: z.enum(['leave', 'expire']).optional(),
});

const attachProductSchema = z.object({ productId: z.uuid() });
const attachBranchSchema = z.object({ branchId: z.uuid() });

/** 404 (not a raw 500 FK-violation) when a deal id doesn't resolve to a real row. */
async function requireDealExists(dealId: string): Promise<void> {
  const [deal] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
  if (!deal) {
    throw new AdminApiError(404, 'Deal not found');
  }
}

/**
 * Shared attach helper for both junctions (D3 / Clean-Code note): pre-checks the
 * deal AND the referenced product/branch exist (clean 404 instead of a raw FK
 * 500), then runs the insert wrapped in the shared `isUniqueViolation` catch → a
 * clean 409 on a duplicate attach (never a silent upsert, never a raw constraint
 * leak).
 */
async function attachRef(opts: {
  dealId: string;
  refId: string;
  refExists: () => Promise<boolean>;
  refNotFoundMessage: string;
  insertRow: () => Promise<unknown>;
  duplicateMessage: string;
}): Promise<void> {
  await requireDealExists(opts.dealId);
  if (!(await opts.refExists())) {
    throw new AdminApiError(404, opts.refNotFoundMessage);
  }
  try {
    await opts.insertRow();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AdminApiError(409, opts.duplicateMessage);
    }
    throw err;
  }
}

// ─── Deals CRUD ──────────────────────────────────────────────────────────────

// GET / — ALL deals (active + inactive, in- and out-of-window), newest first.
// Optional ?isActive=true|false filter. Admin management view — never the
// public route's active/in-window filter.
adminDealsRouter.get('/', async (req, res) => {
  const isActiveRaw = req.query.isActive;
  if (isActiveRaw !== undefined && isActiveRaw !== 'true' && isActiveRaw !== 'false') {
    res.status(400).json({ error: 'Invalid isActive filter' });
    return;
  }

  const rows =
    isActiveRaw === undefined
      ? await db.select().from(deals).orderBy(desc(deals.created_at))
      : await db
          .select()
          .from(deals)
          .where(eq(deals.is_active, isActiveRaw === 'true'))
          .orderBy(desc(deals.created_at));

  res.json({ deals: rows.map((d) => serializeAdminDeal(d)) });
});

// GET /:id — single deal WITH its attached product/branch id arrays and the
// count of outstanding (`available`) coupons for the UI deactivate confirm (D1).
adminDealsRouter.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!uuidSchema.safeParse(id).success) {
    res.status(404).json({ error: 'Deal not found' });
    return;
  }

  const [deal] = await db.select().from(deals).where(eq(deals.id, id));
  if (!deal) {
    res.status(404).json({ error: 'Deal not found' });
    return;
  }

  const productRows = await db
    .select({ productId: dealProducts.product_id })
    .from(dealProducts)
    .where(eq(dealProducts.deal_id, id));
  const branchRows = await db
    .select({ branchId: dealBranches.branch_id })
    .from(dealBranches)
    .where(eq(dealBranches.deal_id, id));
  const [couponCount] = await db
    .select({ value: count() })
    .from(coupons)
    .where(and(eq(coupons.deal_id, id), eq(coupons.status, 'available')));

  res.json({
    deal: serializeAdminDeal(deal, {
      productIds: productRows.map((r) => r.productId),
      branchIds: branchRows.map((r) => r.branchId),
      outstandingCoupons: couponCount?.value ?? 0,
    }),
  });
});

// POST / — create a deal. `deal_type` enum, `end_at > start_at`, and conditional
// `discount_value` requiredness are all Zod-validated BEFORE any DB call (D5).
adminDealsRouter.post('/', async (req, res) => {
  try {
    const parsed = createDealSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid deal payload', details: parsed.error.issues });
      return;
    }
    const d = parsed.data;

    const [inserted] = await db
      .insert(deals)
      .values({
        title: d.title,
        description: d.description ?? null,
        image_url: d.imageUrl ?? null,
        deal_type: d.dealType,
        discount_value:
          (d.discountValueCents ?? null) === null
            ? null
            : centsToNumeric(d.discountValueCents as number),
        ...(d.minimumOrderAmountCents === undefined
          ? {}
          : { minimum_order_amount: centsToNumeric(d.minimumOrderAmountCents) }),
        start_at: new Date(d.startAt),
        end_at: new Date(d.endAt),
        ...(d.usageLimitPerUser === undefined ? {} : { usage_limit_per_user: d.usageLimitPerUser }),
        ...(d.totalUsageLimit === undefined ? {} : { total_usage_limit: d.totalUsageLimit }),
      })
      .returning();

    res.status(201).json({ deal: serializeAdminDeal(inserted!) });
  } catch (err) {
    handleAdminError(err, res, 'creating deal');
  }
});

// PATCH /:id — update deal fields (NOT `is_active` — that is the deactivate
// route). When the body touches `start_at`/`end_at`, the existing row is fetched
// and the MERGED start/end pair is validated against `end_at > start_at` (D5/AC10)
// — a partial payload that looks internally consistent alone can still be
// rejected once merged.
adminDealsRouter.patch('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!uuidSchema.safeParse(id).success) {
      throw new AdminApiError(404, 'Deal not found');
    }

    const parsed = updateDealSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid deal payload', details: parsed.error.issues });
      return;
    }
    const d = parsed.data;

    // Fetch-merge-validate for dates — ONLY when a date field is present (E4).
    if (d.startAt !== undefined || d.endAt !== undefined) {
      const [existing] = await db.select().from(deals).where(eq(deals.id, id));
      if (!existing) {
        throw new AdminApiError(404, 'Deal not found');
      }
      const mergedStart = d.startAt !== undefined ? new Date(d.startAt) : existing.start_at;
      const mergedEnd = d.endAt !== undefined ? new Date(d.endAt) : existing.end_at;
      if (mergedEnd.getTime() <= mergedStart.getTime()) {
        throw new AdminApiError(400, 'end_at must be after start_at');
      }
    }

    const updates: Partial<typeof deals.$inferInsert> = { updated_at: new Date() };
    if (d.title !== undefined) updates.title = d.title;
    if (d.description !== undefined) updates.description = d.description;
    if (d.imageUrl !== undefined) updates.image_url = d.imageUrl;
    if (d.dealType !== undefined) updates.deal_type = d.dealType;
    if (d.discountValueCents !== undefined) {
      updates.discount_value =
        d.discountValueCents === null ? null : centsToNumeric(d.discountValueCents);
    }
    if (d.minimumOrderAmountCents !== undefined) {
      updates.minimum_order_amount = centsToNumeric(d.minimumOrderAmountCents);
    }
    if (d.startAt !== undefined) updates.start_at = new Date(d.startAt);
    if (d.endAt !== undefined) updates.end_at = new Date(d.endAt);
    if (d.usageLimitPerUser !== undefined) updates.usage_limit_per_user = d.usageLimitPerUser;
    if (d.totalUsageLimit !== undefined) updates.total_usage_limit = d.totalUsageLimit;

    const [updated] = await db.update(deals).set(updates).where(eq(deals.id, id)).returning();
    if (!updated) {
      throw new AdminApiError(404, 'Deal not found');
    }

    res.json({ deal: serializeAdminDeal(updated) });
  } catch (err) {
    handleAdminError(err, res, 'updating deal');
  }
});

// POST /:id/deactivate — soft-deactivate. Body `{ couponPolicy?: 'leave'|'expire' }`,
// default 'leave' (D1). 'leave' flips `is_active` only (zero coupon writes).
// 'expire' atomically flips `is_active` AND expires every `available` coupon for
// this deal in ONE transaction; `outstandingCouponsAffected` is the count of rows
// actually transitioned (0 for 'leave' or when nothing was outstanding).
adminDealsRouter.post('/:id/deactivate', async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!uuidSchema.safeParse(id).success) {
      throw new AdminApiError(404, 'Deal not found');
    }

    const parsed = deactivateDealSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid deactivate payload', details: parsed.error.issues });
      return;
    }
    const policy = parsed.data.couponPolicy ?? 'leave';

    if (policy === 'leave') {
      const [updated] = await db
        .update(deals)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(deals.id, id))
        .returning();
      if (!updated) {
        throw new AdminApiError(404, 'Deal not found');
      }
      res.json({ deal: serializeAdminDeal(updated), outstandingCouponsAffected: 0 });
      return;
    }

    // policy === 'expire' — atomic cascade (first admin-route transaction).
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(deals)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(deals.id, id))
        .returning();
      if (!updated) {
        // Throwing rolls the transaction back — nothing is committed (AC9).
        throw new AdminApiError(404, 'Deal not found');
      }
      // Derive the affected count from RETURNING.length INSIDE the tx (E1) — no
      // separate pre-count query, provably consistent with what was mutated.
      const expired = await tx
        .update(coupons)
        .set({ status: 'expired' })
        .where(and(eq(coupons.deal_id, id), eq(coupons.status, 'available')))
        .returning({ id: coupons.id });
      return { deal: updated, affected: expired.length };
    });

    res.json({
      deal: serializeAdminDeal(result.deal),
      outstandingCouponsAffected: result.affected,
    });
  } catch (err) {
    handleAdminError(err, res, 'deactivating deal');
  }
});

// ─── Product junction (deal_products) ─────────────────────────────────────────

// POST /:id/products — attach a product. FK-pre-check → insert → 409 on duplicate.
adminDealsRouter.post('/:id/products', async (req, res) => {
  try {
    const dealId = String(req.params.id);
    if (!uuidSchema.safeParse(dealId).success) {
      throw new AdminApiError(404, 'Deal not found');
    }

    const parsed = attachProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid attach payload', details: parsed.error.issues });
      return;
    }
    const { productId } = parsed.data;

    await attachRef({
      dealId,
      refId: productId,
      refExists: async () => {
        const [p] = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.id, productId));
        return Boolean(p);
      },
      refNotFoundMessage: 'Product not found',
      insertRow: () => db.insert(dealProducts).values({ deal_id: dealId, product_id: productId }),
      duplicateMessage: 'Product already attached to this deal',
    });

    res.status(201).json({ attached: true });
  } catch (err) {
    handleAdminError(err, res, 'attaching product to deal');
  }
});

// DELETE /:id/products/:productId — detach a product. 204, or 404 if not attached.
adminDealsRouter.delete('/:id/products/:productId', async (req, res) => {
  try {
    const dealId = String(req.params.id);
    const productId = String(req.params.productId);
    if (!uuidSchema.safeParse(dealId).success || !uuidSchema.safeParse(productId).success) {
      throw new AdminApiError(404, 'Attachment not found');
    }

    const deleted = await db
      .delete(dealProducts)
      .where(and(eq(dealProducts.deal_id, dealId), eq(dealProducts.product_id, productId)))
      .returning({ id: dealProducts.id });
    if (deleted.length === 0) {
      throw new AdminApiError(404, 'Attachment not found');
    }

    res.status(204).send();
  } catch (err) {
    handleAdminError(err, res, 'detaching product from deal');
  }
});

// ─── Branch junction (deal_branches) ──────────────────────────────────────────

// POST /:id/branches — attach a branch. FK-pre-check → insert → 409 on duplicate.
adminDealsRouter.post('/:id/branches', async (req, res) => {
  try {
    const dealId = String(req.params.id);
    if (!uuidSchema.safeParse(dealId).success) {
      throw new AdminApiError(404, 'Deal not found');
    }

    const parsed = attachBranchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid attach payload', details: parsed.error.issues });
      return;
    }
    const { branchId } = parsed.data;

    await attachRef({
      dealId,
      refId: branchId,
      refExists: async () => {
        const [b] = await db
          .select({ id: branches.id })
          .from(branches)
          .where(eq(branches.id, branchId));
        return Boolean(b);
      },
      refNotFoundMessage: 'Branch not found',
      insertRow: () => db.insert(dealBranches).values({ deal_id: dealId, branch_id: branchId }),
      duplicateMessage: 'Branch already attached to this deal',
    });

    res.status(201).json({ attached: true });
  } catch (err) {
    handleAdminError(err, res, 'attaching branch to deal');
  }
});

// DELETE /:id/branches/:branchId — detach a branch. 204, or 404 if not attached.
adminDealsRouter.delete('/:id/branches/:branchId', async (req, res) => {
  try {
    const dealId = String(req.params.id);
    const branchId = String(req.params.branchId);
    if (!uuidSchema.safeParse(dealId).success || !uuidSchema.safeParse(branchId).success) {
      throw new AdminApiError(404, 'Attachment not found');
    }

    const deleted = await db
      .delete(dealBranches)
      .where(and(eq(dealBranches.deal_id, dealId), eq(dealBranches.branch_id, branchId)))
      .returning({ id: dealBranches.id });
    if (deleted.length === 0) {
      throw new AdminApiError(404, 'Attachment not found');
    }

    res.status(204).send();
  } catch (err) {
    handleAdminError(err, res, 'detaching branch from deal');
  }
});

export default adminDealsRouter;
