import { and, asc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

const uuidSchema = z.string().uuid();

import { db } from '../db/client';
import {
  branchProductAvailability,
  branches,
  categories,
  dealComponents,
  productOptions,
  products,
} from '../db/schema/index';
import { resolveAvailableDealProductIds } from './lib/deal-availability';
import { resolveLiveDealProductIds } from './lib/deal-schedule';
import {
  serializeBranch,
  serializeMenuCategory,
  serializeMenuProduct,
  type AdminDealComponent,
  type ApiMenuProduct,
} from './lib/serializers';

export const branchesRouter: Router = Router();

/** Great-circle distance in kilometres between two lat/lng points (haversine). */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /branches — active branches. Optional `lat`/`lng` query params add a
// `distanceKm` field and sort nearest-first.
branchesRouter.get('/', async (req, res) => {
  const rows = await db.select().from(branches).where(eq(branches.is_active, true));

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);

  if (!hasPoint) {
    res.json({ branches: rows.map((b) => serializeBranch(b)) });
    return;
  }

  const withDistance = rows
    .map((b) => ({ branch: b, km: distanceKm(lat, lng, Number(b.latitude), Number(b.longitude)) }))
    .sort((a, b) => a.km - b.km)
    .map(({ branch, km }) => serializeBranch(branch, km));

  res.json({ branches: withDistance });
});

// GET /branches/:branchId — branch detail; 404 if missing or inactive.
branchesRouter.get('/:branchId', async (req, res) => {
  const branchId = String(req.params.branchId);
  if (!uuidSchema.safeParse(branchId).success) {
    res.status(404).json({ error: 'Branch not found' });
    return;
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.is_active, true)));

  if (!branch) {
    res.status(404).json({ error: 'Branch not found' });
    return;
  }

  res.json({ branch: serializeBranch(branch) });
});

// GET /branches/:branchId/menu — categories → active products available at the
// branch → each product's active options grouped by option_type.
branchesRouter.get('/:branchId/menu', async (req, res) => {
  const branchId = String(req.params.branchId);

  if (!uuidSchema.safeParse(branchId).success) {
    res.status(404).json({ error: 'Branch not found' });
    return;
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.is_active, true)));

  if (!branch) {
    res.status(404).json({ error: 'Branch not found' });
    return;
  }

  // ADM-004 deals-as-products filter (sites a + b): by default the customer menu
  // EXCLUDES deal-products (is_deal=false) so they never appear mixed into regular
  // categories. `?isDeal=true` FLIPS the filter to return ONLY deal-products (same
  // route, same response shape — serves the mobile Deals tab without a new
  // endpoint). Any other value defaults to the regular (non-deal) menu.
  const isDealMenu = req.query.isDeal === 'true';

  // Active products available at this branch, joined to their (active) category.
  const productRows = await db
    .select({ product: products, category: categories })
    .from(products)
    .innerJoin(
      branchProductAvailability,
      and(
        eq(branchProductAvailability.product_id, products.id),
        eq(branchProductAvailability.branch_id, branchId),
        eq(branchProductAvailability.is_available, true),
      ),
    )
    .innerJoin(categories, eq(categories.id, products.category_id))
    .where(
      and(
        eq(products.is_active, true),
        eq(categories.is_active, true),
        eq(products.is_deal, isDealMenu),
      ),
    )
    .orderBy(asc(categories.sort_order), asc(products.name));

  const productIds = productRows.map((r) => r.product.id);

  // Active options for all those products in one query.
  const optionRows = productIds.length
    ? await db
        .select()
        .from(productOptions)
        .where(
          and(inArray(productOptions.product_id, productIds), eq(productOptions.is_active, true)),
        )
        .orderBy(asc(productOptions.sort_order))
    : [];

  const optionsByProduct = new Map<string, typeof optionRows>();
  for (const option of optionRows) {
    const list = optionsByProduct.get(option.product_id) ?? [];
    list.push(option);
    optionsByProduct.set(option.product_id, list);
  }

  // ADM-004 deals-as-products: only on the `?isDeal=true` menu, resolve each
  // deal-product's `deal_components` ("what's inside") in ONE batch query. This
  // is the batch-ified form of `admin/deals.ts`'s single-product
  // `fetchComponents()` — same 3-column select + same inner-join to the
  // component's own `products` row for its display name — widened from
  // `eq(deal_product_id, X)` to `inArray(deal_product_id, productIds)`. The
  // regular (non-deal) menu skips this query entirely, so its behavior/perf is
  // provably unchanged (locked by the regression test on the regular menu path).
  const componentsByProduct = new Map<string, AdminDealComponent[]>();
  // MENU-003: the subset of the candidate deal-products whose components are ALL
  // available at this branch. Only ever populated on the deals menu; stays empty
  // (and is never consulted) on the regular menu — see the `isDealMenu &&` guard
  // on its only read site in the product loop below.
  let availableDealIds = new Set<string>();
  // DEAL-005: the subset of candidate deal-products inside their scheduled window
  // right now. Same lifecycle as `availableDealIds` above — only ever populated on
  // the deals menu, never consulted on the regular menu.
  let liveDealIds = new Set<string>();
  if (isDealMenu && productIds.length) {
    const componentRows = await db
      .select({
        dealProductId: dealComponents.deal_product_id,
        componentProductId: dealComponents.component_product_id,
        componentName: products.name,
        quantity: dealComponents.quantity,
      })
      .from(dealComponents)
      .innerJoin(products, eq(products.id, dealComponents.component_product_id))
      .where(inArray(dealComponents.deal_product_id, productIds))
      .orderBy(asc(products.name));

    for (const row of componentRows) {
      const list = componentsByProduct.get(row.dealProductId) ?? [];
      list.push({
        componentProductId: row.componentProductId,
        componentName: row.componentName,
        quantity: row.quantity,
      });
      componentsByProduct.set(row.dealProductId, list);
    }

    // MENU-003: a deal is only listed when every one of its components is
    // available at this branch (and has >=1 component at all). Computed AFTER
    // the display map above and kept separate from it: `componentsByProduct`
    // still drives the unchanged `components[]` display field for the deals that
    // do survive the filter.
    availableDealIds = await resolveAvailableDealProductIds(db, branchId, productIds);

    // DEAL-005: a deal with schedule rows is listed only inside the union of its
    // windows; a deal with ZERO rows is always live (no-backfill guarantee, AC3).
    // A targeted SECOND query calling the shared `isDealScheduleLive()` helper —
    // deliberately NOT an inline SQL join predicate (Execute-Agent Instruction E1):
    // order placement calls the SAME function, so the half-open `[starts_at,
    // ends_at)` boundary cannot drift between browse and buy, and an INNER JOIN
    // shape would silently drop every zero-schedule-row deal.
    liveDealIds = await resolveLiveDealProductIds(db, productIds, new Date());
  }

  // Preserve first-seen category order (already sorted by category.sort_order).
  const categoryOrder: string[] = [];
  const categoryById = new Map<string, { id: string; name: string }>();
  const productsByCategory = new Map<string, ApiMenuProduct[]>();

  for (const { product, category } of productRows) {
    // MENU-003: drop deals with an unavailable (or missing) component entirely —
    // "not shown", not shown-as-unavailable. Gated by `isDealMenu &&`, so this is
    // a guaranteed no-op on the regular menu (AC4 regression lock).
    if (isDealMenu && !availableDealIds.has(product.id)) continue;

    // DEAL-005: drop deals outside their scheduled window entirely — "not shown",
    // never shown-as-unavailable (D2: the customer wire contract carries no window
    // fields). Gated by `isDealMenu &&` exactly like the availability check above,
    // so it is a guaranteed no-op on the regular catalog.
    if (isDealMenu && !liveDealIds.has(product.id)) continue;

    if (!productsByCategory.has(category.id)) {
      categoryOrder.push(category.id);
      categoryById.set(category.id, { id: category.id, name: category.name });
      productsByCategory.set(category.id, []);
    }
    const apiProduct = serializeMenuProduct(
      product,
      optionsByProduct.get(product.id) ?? [],
      // Deal menu → pass the (possibly empty) components list so the serializer
      // sets `isDeal`/`components`. Regular menu → pass `undefined` so both keys
      // are omitted entirely (unchanged regular-menu response body).
      isDealMenu ? (componentsByProduct.get(product.id) ?? []) : undefined,
    );
    productsByCategory.get(category.id)!.push(apiProduct);
  }

  const menuCategories = categoryOrder.map((categoryId) =>
    serializeMenuCategory(categoryById.get(categoryId)!, productsByCategory.get(categoryId)!),
  );

  res.json({ branchId, categories: menuCategories });
});
