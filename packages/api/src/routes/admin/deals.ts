import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import {
  branchProductAvailability,
  branches,
  categories,
  dealComponents,
  dealSchedules,
  products,
} from '../../db/schema/index';
import { validateRecurrence, validateWindow } from '../lib/deal-schedule';
import { notifyNewDeal } from '../../lib/marketing-triggers';
import {
  centsToNumeric,
  serializeAdminDealProduct,
  type AdminDealComponent,
  type AdminDealWindow,
} from '../lib/serializers';
import { AdminApiError, handleAdminError, isUniqueViolation } from './lib/errors';

/**
 * Admin deals CRUD routes (ADM-004 — deals-as-products). A "deal" is simply a
 * `products` row with `is_deal = true`, priced at its own `base_price`, whose
 * "what's inside" is described by the `deal_components` junction to other
 * products. This deliberately styles itself as a SIBLING of `admin/products.ts`
 * (same Zod-before-Postgres conventions, same `AdminApiError`/`handleAdminError`/
 * `isUniqueViolation` reuse, same `centsToNumeric` cents-at-boundary rule) so a
 * reader can diff the two files to see exactly where deals diverge: `categoryId`
 * is server-pinned (never client-supplied), there is a `deal_components` junction
 * instead of `product_options`/`branch_product_availability`, and writes always
 * carry `is_deal = true`.
 *
 * The `requireAdmin` guard + CORS are applied ONCE at the `/api/admin` mount in
 * `index.ts` and inherited here, so NO handler re-checks role.
 *
 * Soft-delete ONLY: deactivation reuses the products `is_active` toggle via
 * `PATCH /:id { isActive: false }` (a deal IS a products row — no dedicated
 * deactivate route needed); there is NEVER a `DELETE` on a deal-product. The
 * `deal_components` `DELETE` endpoint removes only the LINK row, never a product.
 * `order_items` are NEVER touched here — editing a deal-product's `base_price`
 * writes only the `products` row; historical snapshots stay frozen (AC9).
 *
 * Supersedes the discount-shaped ADM-004 deals CRUD (commit d5070d8) — that
 * model (`deals`/`deal_products`/`deal_branches`/coupon-cascade) is now dormant.
 */
const adminDealsRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();

/**
 * Reserved category every deal-product is pinned to (Decision 8). `products
 * .category_id` is NOT NULL, so a deal needs a real category; the admin never
 * picks one — it is implicit. Matches the slug the seed also provisions.
 */
const DEALS_CATEGORY_SLUG = 'deals';

// Optional component entries seeded at create time (Enhancement E1). When
// present, the deal-product and all `deal_components` rows are written in ONE
// transaction so a failed component can never leave an orphan deal-product.
// Omitting `components` behaves EXACTLY like the shipped single-insert create.
const createDealComponentSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1),
});

const createDealSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  basePriceCents: z.number().int().nonnegative(),
  isActive: z.boolean().optional(),
  isRewardEligible: z.boolean().optional(),
  components: z.array(createDealComponentSchema).optional(),
  // OPTIONAL branch selection (post-merge Fix 4). Omitting seeds availability for
  // EVERY active branch (backward-compatible with the Fix 1 seed-all behavior).
  // When present, availability is seeded ONLY for the listed branches; each id must
  // reference an active branch (unknown/inactive → 400). An empty array is a valid
  // explicit "no branches" choice (the deal is created invisible everywhere).
  branchIds: z.array(z.uuid()).optional(),
  // DEAL-005 Phase 1 — optional scheduled live window. Coerced from the same
  // naive-local datetime string `offers.ts` accepts, and stored as real instants
  // (never routed through the Manila day-bucket analytics helper). BOTH optional
  // and nullable, unlike offers which requires both: "always live" is a first-class
  // Phase-1 state, expressed as NO `deal_schedules` row at all.
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  // DEAL-005 Phase 2 — optional weekly recurrence NARROWING the window above. The
  // three fields move as a UNIT (all or none); cross-field legality, the day-range
  // check and D5's overnight rejection all live in `validateRecurrence` so create
  // and update reject identically. Times are Manila WALL-CLOCK "HH:mm", not UTC.
  recurDays: z.array(z.number().int()).nullable().optional(),
  recurStartTime: z.string().nullable().optional(),
  recurEndTime: z.string().nullable().optional(),
});

// `.refine` rejects an empty `{}` body so a no-op PATCH can't bump `updated_at`.
const updateDealSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    basePriceCents: z.number().int().nonnegative().optional(),
    isActive: z.boolean().optional(),
    isRewardEligible: z.boolean().optional(),
    // DEAL-005 — omitting a key LEAVES that bound untouched; sending it as `null`
    // CLEARS it. Sending both as null clears the whole window (the deal returns to
    // always-live and its `deal_schedules` row is deleted).
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    // DEAL-005 Phase 2 — same omit-leaves / null-clears semantics as the bounds
    // above. Validated against the MERGED state, never the payload alone.
    recurDays: z.array(z.number().int()).nullable().optional(),
    recurStartTime: z.string().nullable().optional(),
    recurEndTime: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const attachComponentSchema = z.object({
  componentProductId: z.uuid(),
  quantity: z.number().int().positive().optional(),
});

/**
 * Resolve the reserved "Deals" category id, creating it idempotently if absent
 * (Decision 8's goal: deal-creation can never 500 on a missing FK, regardless of
 * seed state). The seed also provisions this row up front for dev parity; the
 * `onConflictDoUpdate` on the unique `slug` makes a concurrent create race-safe.
 */
async function resolveDealsCategoryId(): Promise<string> {
  const [existing] = await db
    .select({ id: categories.id, isActive: categories.is_active })
    .from(categories)
    .where(eq(categories.slug, DEALS_CATEGORY_SLUG));
  if (existing) {
    // The reserved Deals category must stay active — the customer menu filters
    // categories by is_active, so an inactive one hides every deal-product. If an
    // admin deactivated it via categories CRUD, self-heal before pinning here.
    if (!existing.isActive) {
      await db
        .update(categories)
        .set({ is_active: true, updated_at: new Date() })
        .where(eq(categories.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(categories)
    .values({ name: 'Deals', slug: DEALS_CATEGORY_SLUG, sort_order: 999 })
    .onConflictDoUpdate({ target: categories.slug, set: { updated_at: new Date() } })
    .returning({ id: categories.id });
  return created!.id;
}

/**
 * Resolve a deal-product's `deal_components` into the display shape (join to each
 * component's `products` row for its name). Populated only on the DETAIL response
 * — the list route passes `[]` to avoid an N+1 join.
 */
async function fetchComponents(dealProductId: string): Promise<AdminDealComponent[]> {
  return db
    .select({
      componentProductId: dealComponents.component_product_id,
      componentName: products.name,
      quantity: dealComponents.quantity,
    })
    .from(dealComponents)
    .innerJoin(products, eq(products.id, dealComponents.component_product_id))
    .where(eq(dealComponents.deal_product_id, dealProductId))
    .orderBy(asc(products.name));
}

/**
 * Seed `branch_product_availability` rows (available=true) for a freshly-created
 * deal-product, so the deal is immediately visible on the customer menu
 * (`GET /branches/:id/menu?isDeal=true` filters on an available BPA row). Runs
 * inside the create transaction so a seeding failure rolls back the product.
 * `is_available` is set explicitly for clarity (schema default is true).
 *
 * `branchIds` selects WHICH branches to seed (post-merge Fix 4): omitted → every
 * ACTIVE branch (the original seed-all behavior); provided → exactly those branches
 * (each validated as an active branch, unknown/inactive → 400). An empty array
 * seeds nothing (a valid "no branches" choice).
 */
async function seedBranchAvailability(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  productId: string,
  branchIds?: string[],
): Promise<void> {
  const activeBranches = await tx
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.is_active, true));
  const activeIds = new Set(activeBranches.map((b) => b.id));

  let targetIds: string[];
  if (branchIds === undefined) {
    targetIds = [...activeIds];
  } else {
    // Validate the caller's selection against the active-branch set — a single
    // source of truth for both the 400 guard and the rows we seed.
    for (const id of branchIds) {
      if (!activeIds.has(id)) {
        throw new AdminApiError(400, 'Unknown or inactive branch');
      }
    }
    targetIds = [...new Set(branchIds)];
  }
  if (targetIds.length === 0) return;

  await tx.insert(branchProductAvailability).values(
    targetIds.map((id) => ({
      branch_id: id,
      product_id: productId,
      is_available: true,
    })),
  );
}

/**
 * DEAL-005 — resolve each deal's single `deal_schedules` window for serialization.
 * ONE query for the whole list (never per row). A deal absent from the returned map
 * has no schedule row, which serializes as `startsAt: null, endsAt: null` and means
 * "always live".
 *
 * Phase 1 writes AT MOST ONE row per deal (see `writeDealSchedule`), so taking the
 * first row per deal is exact here. Phase 2 (multi-row recurrence) will need to
 * widen this to an array — deliberately left as the simple case rather than
 * pre-building an abstraction Phase 2 may shape differently.
 */
async function fetchSchedules(productIds: string[]): Promise<Map<string, AdminDealWindow>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select({
      dealProductId: dealSchedules.deal_product_id,
      startsAt: dealSchedules.starts_at,
      endsAt: dealSchedules.ends_at,
      recurDays: dealSchedules.recur_days,
      recurStartTime: dealSchedules.recur_start_time,
      recurEndTime: dealSchedules.recur_end_time,
    })
    .from(dealSchedules)
    .where(inArray(dealSchedules.deal_product_id, productIds));

  const byDeal = new Map<string, AdminDealWindow>();
  for (const row of rows) {
    if (!byDeal.has(row.dealProductId)) {
      byDeal.set(row.dealProductId, {
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        recurDays: row.recurDays,
        recurStartTime: row.recurStartTime,
        recurEndTime: row.recurEndTime,
      });
    }
  }
  return byDeal;
}

/** Is every field of a window empty? Then "always live" is expressed as ZERO rows. */
function isEmptyWindow(window: AdminDealWindow): boolean {
  return (
    window.startsAt === null &&
    window.endsAt === null &&
    window.recurDays === null &&
    window.recurStartTime === null &&
    window.recurEndTime === null
  );
}

/**
 * DEAL-005 — write the deal's single scheduled window: REPLACE, never append.
 *
 * The "at most one row per deal" invariant is enforced HERE, structurally, and
 * deliberately NOT by a unique constraint on `deal_product_id` (Execute-Agent
 * Instruction E2). A unique constraint would have to be dropped again for Phase 2's
 * multi-row recurrence — the exact second migration the table shape exists to
 * avoid — and it is also why `.onConflictDoUpdate()` is not used (it needs a unique
 * target to conflict on). Delete-then-insert inside the caller's transaction gives
 * the same single-row guarantee with no schema commitment.
 *
 * EVERY field null → the row is deleted and none is written: "always live" is
 * expressed as ZERO rows, never as an all-null row. Phase 2 widened this emptiness
 * test to cover the recurrence columns too — checking only the absolute bounds would
 * delete a recurring row that deliberately has open-ended bounds ("every Friday
 * 2–5pm, forever"), which is a perfectly legal shape.
 *
 * Still SINGLE-ROW replace-only (Execute-Agent Instruction E3): Phase 2 does not add
 * a multi-row/repeatable admin write path, even though the table shape and
 * `isDealScheduleLive`'s union logic support one. That authoring flow is a future
 * phase.
 */
async function writeDealSchedule(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  dealProductId: string,
  window: AdminDealWindow,
): Promise<void> {
  await tx.delete(dealSchedules).where(eq(dealSchedules.deal_product_id, dealProductId));
  if (isEmptyWindow(window)) return;
  await tx.insert(dealSchedules).values({
    deal_product_id: dealProductId,
    starts_at: window.startsAt,
    ends_at: window.endsAt,
    recur_days: window.recurDays,
    recur_start_time: window.recurStartTime,
    recur_end_time: window.recurEndTime,
  });
}

/**
 * Count ACTIVE branches — the denominator for the deal-visibility indicator. A
 * deal is only orderable at active branches, so this is the max it could ever be
 * "available at". One cheap aggregate shared across every row of a list response.
 */
async function countActiveBranches(): Promise<number> {
  const [row] = await db.select({ c: count() }).from(branches).where(eq(branches.is_active, true));
  return Number(row?.c ?? 0);
}

/**
 * Count, per deal-product, the number of ACTIVE branches where it has an
 * `is_available = true` availability row — i.e. the branches where the deal is
 * actually visible on the customer menu (`GET /branches/:id/menu?isDeal=true`
 * filters on exactly this: an available BPA row at an active branch). A count of
 * 0 for an active deal means it is invisible everywhere (the seeding bug this
 * indicator surfaces). Returns a map keyed by product id; ids absent from the map
 * have zero available branches.
 */
async function fetchAvailableBranchCounts(productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select({ productId: branchProductAvailability.product_id, c: count() })
    .from(branchProductAvailability)
    .innerJoin(branches, eq(branches.id, branchProductAvailability.branch_id))
    .where(
      and(
        inArray(branchProductAvailability.product_id, productIds),
        eq(branchProductAvailability.is_available, true),
        eq(branches.is_active, true),
      ),
    )
    .groupBy(branchProductAvailability.product_id);
  return new Map(rows.map((r) => [r.productId, Number(r.c)]));
}

// ─── Deals CRUD (is_deal=true products) ──────────────────────────────────────

// GET / — ALL deal-products (active + inactive), optional ?isActive=true|false.
// Admin management view — never a public active-only filter. `components` is []
// on the list (avoids per-row junction joins).
adminDealsRouter.get('/', async (req, res) => {
  const isActiveRaw = req.query.isActive;
  if (isActiveRaw !== undefined && isActiveRaw !== 'true' && isActiveRaw !== 'false') {
    res.status(400).json({ error: 'Invalid isActive filter' });
    return;
  }

  const conditions = [eq(products.is_deal, true)];
  if (isActiveRaw !== undefined) {
    conditions.push(eq(products.is_active, isActiveRaw === 'true'));
  }

  const rows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(asc(products.name));

  // Visibility indicator: per-deal available-branch counts + the active-branch
  // denominator (one aggregate query each, not per-row).
  const [availableCounts, activeBranchCount, schedules] = await Promise.all([
    fetchAvailableBranchCounts(rows.map((p) => p.id)),
    countActiveBranches(),
    fetchSchedules(rows.map((p) => p.id)),
  ]);

  res.json({
    deals: rows.map((p) =>
      serializeAdminDealProduct(
        p,
        [],
        {
          availableBranchCount: availableCounts.get(p.id) ?? 0,
          activeBranchCount,
        },
        schedules.get(p.id) ?? null,
      ),
    ),
  });
});

// GET /:id — single deal-product WITH its resolved components array. 404 on a
// malformed/missing id OR a product that isn't a deal (is_deal !== true).
adminDealsRouter.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!uuidSchema.safeParse(id).success) {
    res.status(404).json({ error: 'Deal not found' });
    return;
  }

  const [deal] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.is_deal, true)));
  if (!deal) {
    res.status(404).json({ error: 'Deal not found' });
    return;
  }

  const [components, availableCounts, activeBranchCount, schedules] = await Promise.all([
    fetchComponents(id),
    fetchAvailableBranchCounts([id]),
    countActiveBranches(),
    fetchSchedules([id]),
  ]);
  res.json({
    deal: serializeAdminDealProduct(
      deal,
      components,
      {
        availableBranchCount: availableCounts.get(id) ?? 0,
        activeBranchCount,
      },
      schedules.get(id) ?? null,
    ),
  });
});

// POST / — create a deal-product (`is_deal = true`), `category_id` server-pinned
// to the reserved Deals category (never client-supplied). Duplicate `slug` → 409.
//
// Enhancement E1 — OPTIONAL `components: [{ productId, quantity }]`. When present,
// the deal-product insert + all `deal_components` inserts run in ONE
// `db.transaction()` (mirrors the `orders.ts` placement transaction) so any
// failure rolls back the whole request — a create can never leave an orphan
// component-less deal when the admin intended to seed it with items. The same
// app-layer guards the standalone attach route uses are reused here: FK-existence
// per component (missing → 404), deal-of-deals reject (a component that is itself
// `is_deal=true` → 400), and duplicate-pair reject (the composite unique index
// fires → clean 409 via the shared `isUniqueViolation`, not a hand-rolled pass —
// so the failure mode is identical to the attach route). There is no self-
// reference case at create time (the new deal's id does not exist yet). Omitting
// `components` falls through to the shipped single-insert path (backward-compat).
adminDealsRouter.post('/', async (req, res) => {
  try {
    const parsed = createDealSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid deal payload', details: parsed.error.issues });
      return;
    }
    const d = parsed.data;

    // DEAL-005 (AC5) — reject an impossible window BEFORE any write, via the same
    // shared validator the update path uses.
    const windowError = validateWindow(d.startsAt, d.endsAt);
    if (windowError) {
      res.status(400).json({ error: windowError });
      return;
    }
    // DEAL-005 Phase 2 — same posture for the recurrence triple: rejected BEFORE any
    // write, by the same shared validator the update path uses, so create and update
    // can never disagree about which shapes are legal.
    const recurrenceError = validateRecurrence(d.recurDays, d.recurStartTime, d.recurEndTime);
    if (recurrenceError) {
      res.status(400).json({ error: recurrenceError });
      return;
    }
    const window: AdminDealWindow = {
      startsAt: d.startsAt ?? null,
      endsAt: d.endsAt ?? null,
      recurDays: d.recurDays ?? null,
      recurStartTime: d.recurStartTime ?? null,
      recurEndTime: d.recurEndTime ?? null,
    };

    const categoryId = await resolveDealsCategoryId();

    const productValues = {
      category_id: categoryId,
      name: d.name,
      slug: d.slug,
      description: d.description ?? null,
      image_url: d.imageUrl ?? null,
      base_price: centsToNumeric(d.basePriceCents),
      is_deal: true,
      ...(d.isActive === undefined ? {} : { is_active: d.isActive }),
      ...(d.isRewardEligible === undefined ? {} : { is_reward_eligible: d.isRewardEligible }),
    };

    // Fast path: no components. The product insert + branch-availability seeding
    // run in ONE transaction so a seeding failure rolls back the product (mirrors
    // the E1 transactional path's atomicity).
    if (!d.components || d.components.length === 0) {
      const inserted = await db.transaction(async (tx) => {
        let created;
        try {
          [created] = await tx.insert(products).values(productValues).returning();
        } catch (err) {
          if (isUniqueViolation(err)) {
            throw new AdminApiError(409, 'Slug already in use');
          }
          throw err;
        }
        await seedBranchAvailability(tx, created!.id, d.branchIds);
        await writeDealSchedule(tx, created!.id, window);
        return created!;
      });
      res.status(201).json({ deal: serializeAdminDealProduct(inserted, [], undefined, window) });
      // New-deal marketing push (PUSH-005, AC6) — post-commit, fire-and-forget,
      // best-effort. Never blocks or breaks the admin create response.
      void notifyNewDeal(inserted.id).catch((e) => console.error('[new-deal-notify] failed', e));
      return;
    }

    const components = d.components;

    // Transactional path: deal-product + all component rows, atomically.
    const inserted = await db.transaction(async (tx) => {
      // Guard every component BEFORE inserting the product: each must exist and
      // must not itself be a deal (deal-of-deals). One bulk read yields both the
      // FK-existence check and the `is_deal` flag (no per-row query).
      const componentIds = components.map((c) => c.productId);
      const found = await tx
        .select({ id: products.id, isDeal: products.is_deal })
        .from(products)
        .where(inArray(products.id, componentIds));
      const isDealById = new Map(found.map((r) => [r.id, r.isDeal]));
      for (const c of components) {
        const isDeal = isDealById.get(c.productId);
        if (isDeal === undefined) {
          throw new AdminApiError(404, 'Component product not found');
        }
        if (isDeal) {
          throw new AdminApiError(400, 'A deal cannot contain another deal');
        }
      }

      let created;
      try {
        [created] = await tx.insert(products).values(productValues).returning();
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new AdminApiError(409, 'Slug already in use');
        }
        throw err;
      }

      // Insert all component rows in one statement — a duplicate `(deal,
      // component)` pair within the payload violates the composite unique index
      // and fails the whole statement → clean 409 → rolls back the product too.
      try {
        await tx.insert(dealComponents).values(
          components.map((c) => ({
            deal_product_id: created!.id,
            component_product_id: c.productId,
            quantity: c.quantity,
          })),
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new AdminApiError(409, 'Duplicate component in deal');
        }
        throw err;
      }

      await seedBranchAvailability(tx, created!.id, d.branchIds);
      await writeDealSchedule(tx, created!.id, window);

      return created!;
    });

    const resolvedComponents = await fetchComponents(inserted.id);
    res
      .status(201)
      .json({ deal: serializeAdminDealProduct(inserted, resolvedComponents, undefined, window) });
    // New-deal marketing push (PUSH-005, AC6) — post-commit, fire-and-forget,
    // best-effort. Never blocks or breaks the admin create response.
    void notifyNewDeal(inserted.id).catch((e) => console.error('[new-deal-notify] failed', e));
  } catch (err) {
    handleAdminError(err, res, 'creating deal');
  }
});

// PATCH /:id — partial update of a deal-product (name/slug/description/
// basePriceCents/imageUrl/isActive). Scoped to `is_deal = true` rows only (a
// regular product id → 404). isActive:false is the deactivate path (no separate
// route). Duplicate `slug` → 409. base_price edit never touches order_items (AC9).
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

    const updates: Partial<typeof products.$inferInsert> = { updated_at: new Date() };
    if (d.name !== undefined) updates.name = d.name;
    if (d.slug !== undefined) updates.slug = d.slug;
    if (d.description !== undefined) updates.description = d.description;
    if (d.imageUrl !== undefined) updates.image_url = d.imageUrl;
    if (d.basePriceCents !== undefined) updates.base_price = centsToNumeric(d.basePriceCents);
    if (d.isActive !== undefined) updates.is_active = d.isActive;
    if (d.isRewardEligible !== undefined) updates.is_reward_eligible = d.isRewardEligible;

    // DEAL-005 — a window key is only touched when the caller sent it. Omitting a
    // bound LEAVES it as stored; sending `null` clears it. Both cleared → the row is
    // deleted and the deal returns to always-live.
    // Phase 2 widens this to the recurrence keys too: a PATCH that only flips the
    // recurrence must still reach the write path.
    const touchesWindow =
      d.startsAt !== undefined ||
      d.endsAt !== undefined ||
      d.recurDays !== undefined ||
      d.recurStartTime !== undefined ||
      d.recurEndTime !== undefined;

    const { updated, window } = await db.transaction(async (tx) => {
      let row;
      try {
        [row] = await tx
          .update(products)
          .set(updates)
          .where(and(eq(products.id, id), eq(products.is_deal, true)))
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new AdminApiError(409, 'Slug already in use');
        }
        throw err;
      }

      if (!row) {
        throw new AdminApiError(404, 'Deal not found');
      }

      // Select-then-branch (E2): read the current row, merge the caller's partial
      // window onto it, validate the MERGED state, then replace. Validating the
      // merge rather than the payload alone is what stops a PATCH that sends only
      // `startsAt` from silently creating a `startsAt >= endsAt` window against an
      // already-stored `endsAt` — the same merged-state rule `offers.ts` applies.
      const [existing] = await tx
        .select({
          startsAt: dealSchedules.starts_at,
          endsAt: dealSchedules.ends_at,
          recurDays: dealSchedules.recur_days,
          recurStartTime: dealSchedules.recur_start_time,
          recurEndTime: dealSchedules.recur_end_time,
        })
        .from(dealSchedules)
        .where(eq(dealSchedules.deal_product_id, id));

      const current: AdminDealWindow = {
        startsAt: existing?.startsAt ?? null,
        endsAt: existing?.endsAt ?? null,
        recurDays: existing?.recurDays ?? null,
        recurStartTime: existing?.recurStartTime ?? null,
        recurEndTime: existing?.recurEndTime ?? null,
      };
      if (!touchesWindow) return { updated: row, window: current };

      const merged: AdminDealWindow = {
        startsAt: d.startsAt === undefined ? current.startsAt : d.startsAt,
        endsAt: d.endsAt === undefined ? current.endsAt : d.endsAt,
        recurDays: d.recurDays === undefined ? current.recurDays : d.recurDays,
        recurStartTime: d.recurStartTime === undefined ? current.recurStartTime : d.recurStartTime,
        recurEndTime: d.recurEndTime === undefined ? current.recurEndTime : d.recurEndTime,
      };
      const windowError = validateWindow(merged.startsAt, merged.endsAt);
      if (windowError) {
        // Throws inside the transaction, so the product update rolls back too — a
        // rejected window never half-applies an unrelated name/price edit.
        throw new AdminApiError(400, windowError);
      }
      // Validated on the MERGED state, exactly like the bounds above: a PATCH sending
      // only `recurStartTime` must not be able to create an overnight span against an
      // already-stored `recurEndTime`, nor leave a half-specified triple behind.
      const recurrenceError = validateRecurrence(
        merged.recurDays,
        merged.recurStartTime,
        merged.recurEndTime,
      );
      if (recurrenceError) {
        throw new AdminApiError(400, recurrenceError);
      }

      await writeDealSchedule(tx, id, merged);
      return { updated: row, window: merged };
    });

    const [components, availableCounts, activeBranchCount] = await Promise.all([
      fetchComponents(id),
      fetchAvailableBranchCounts([id]),
      countActiveBranches(),
    ]);
    res.json({
      deal: serializeAdminDealProduct(
        updated,
        components,
        {
          availableBranchCount: availableCounts.get(id) ?? 0,
          activeBranchCount,
        },
        window,
      ),
    });
  } catch (err) {
    handleAdminError(err, res, 'updating deal');
  }
});

// ─── Component junction (deal_components) ─────────────────────────────────────

// POST /:id/components — attach a component product (+ optional quantity). The
// single component FK-existence read ALSO yields `is_deal` for the deal-of-deals
// guard (Decision 3 — zero extra query). Guards, in order: self-reference (a deal
// cannot contain itself) → 400; component missing → 404; component is itself a
// deal → 400; duplicate (deal, component) pair → 409.
adminDealsRouter.post('/:id/components', async (req, res) => {
  try {
    const dealProductId = String(req.params.id);
    if (!uuidSchema.safeParse(dealProductId).success) {
      throw new AdminApiError(404, 'Deal not found');
    }

    const parsed = attachComponentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid attach payload', details: parsed.error.issues });
      return;
    }
    const { componentProductId, quantity } = parsed.data;

    // The deal-product must exist AND actually be a deal.
    const [deal] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, dealProductId), eq(products.is_deal, true)));
    if (!deal) {
      throw new AdminApiError(404, 'Deal not found');
    }

    // Self-reference guard (Decision 3) — a deal cannot contain itself.
    if (componentProductId === dealProductId) {
      throw new AdminApiError(400, 'A deal cannot contain itself');
    }

    // FK-existence read (clean 404 instead of a raw FK 500) — the same read also
    // carries `is_deal` for the deal-of-deals guard (no extra query).
    const [component] = await db
      .select({ id: products.id, isDeal: products.is_deal })
      .from(products)
      .where(eq(products.id, componentProductId));
    if (!component) {
      throw new AdminApiError(404, 'Component product not found');
    }
    if (component.isDeal) {
      throw new AdminApiError(400, 'A deal cannot contain another deal');
    }

    try {
      await db.insert(dealComponents).values({
        deal_product_id: dealProductId,
        component_product_id: componentProductId,
        ...(quantity === undefined ? {} : { quantity }),
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AdminApiError(409, 'Component already attached to this deal');
      }
      throw err;
    }

    res.status(201).json({ attached: true });
  } catch (err) {
    handleAdminError(err, res, 'attaching component to deal');
  }
});

// DELETE /:id/components/:componentProductId — detach a component. 204, or 404 if
// the pair isn't currently attached. Removes only the LINK row, never a product.
adminDealsRouter.delete('/:id/components/:componentProductId', async (req, res) => {
  try {
    const dealProductId = String(req.params.id);
    const componentProductId = String(req.params.componentProductId);
    if (
      !uuidSchema.safeParse(dealProductId).success ||
      !uuidSchema.safeParse(componentProductId).success
    ) {
      throw new AdminApiError(404, 'Attachment not found');
    }

    const deleted = await db
      .delete(dealComponents)
      .where(
        and(
          eq(dealComponents.deal_product_id, dealProductId),
          eq(dealComponents.component_product_id, componentProductId),
        ),
      )
      .returning({ id: dealComponents.id });
    if (deleted.length === 0) {
      throw new AdminApiError(404, 'Attachment not found');
    }

    res.status(204).send();
  } catch (err) {
    handleAdminError(err, res, 'detaching component from deal');
  }
});

export default adminDealsRouter;
