import { and, eq, inArray } from 'drizzle-orm';

import { branchProductAvailability, productOptions, products } from '../../db/schema/index';
import type { Queryer } from './coupon-apply';
import { resolveAvailableDealProductIds } from './deal-availability';

/**
 * CART-003 — the shared "is each cart line still orderable, and at what price"
 * check, run by `GET /cart` before returning the cart to the client. Structurally
 * mirrors MENU-003's `resolveAvailableDealProductIds` (`deal-availability.ts`): one
 * exported function, batched queries (never N+1), so the cart screen's displayed
 * availability/price and the real product/branch state can never silently drift.
 *
 * For each line it decides two things against the LIVE product/option/branch state:
 *   1. availability — the product is `is_active` AND has an `is_available` row at
 *      this branch (same two-signal rule `orders.ts` placement uses). A deal-product
 *      (`is_deal = true`) additionally requires every component available (delegated
 *      to `resolveAvailableDealProductIds`, so the cart and placement agree).
 *   2. live price — recomputed from the CURRENT `product.base_price` plus each still-
 *      active selected option's `price_delta`. The cart item's stored `unit_price` is
 *      a cache; this is the truth (AC8: a customer never pays a stale cached price).
 *
 * A line is flagged with a `conflict` when it is unavailable ('unavailable') or its
 * live price differs from the stored snapshot ('price_changed'). 'unavailable' takes
 * precedence. Read-only — no locking, no writes (matches the unlocked availability
 * read for regular products at `orders.ts`).
 *
 * @param dbOrTx `db` or an open transaction (`Queryer`, reused from `coupon-apply.ts`).
 * @param branchId the cart's pickup branch, or null (a branchless cart cannot verify
 *   availability, so every line is reported unavailable — items normally cannot exist
 *   without a branch, this is only a defensive guard).
 * @param lines the cart's lines (line id, product id, selected option ids, and the
 *   stored unit price to compare the live price against).
 * @returns a Map keyed by `lineId` → its live price + conflict verdict.
 */

export interface CartLineForValidation {
  lineId: string;
  productId: string;
  selectedOptionIds: string[];
  storedUnitPriceCents: number;
}

export interface CartLineValidity {
  available: boolean;
  livePriceCents: number;
  conflict: { reason: 'unavailable' | 'price_changed' } | null;
}

export async function resolveCartLineValidity(
  dbOrTx: Queryer,
  branchId: string | null,
  lines: CartLineForValidation[],
): Promise<Map<string, CartLineValidity>> {
  const result = new Map<string, CartLineValidity>();
  if (lines.length === 0) return result;

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const allOptionIds = [...new Set(lines.flatMap((l) => l.selectedOptionIds))];

  // Query 1 — every referenced product's live base price + active/deal flags.
  const productRows = await dbOrTx
    .select({
      id: products.id,
      basePrice: products.base_price,
      isActive: products.is_active,
      isDeal: products.is_deal,
    })
    .from(products)
    .where(inArray(products.id, productIds));
  const productById = new Map(productRows.map((p) => [p.id, p]));

  // Query 2 — which products have an is_available row at this branch. Skipped when
  // there is no branch (nothing to check against — all lines fall through to
  // unavailable below).
  const availableProductIds = new Set<string>();
  if (branchId !== null) {
    const availRows = await dbOrTx
      .select({ productId: branchProductAvailability.product_id })
      .from(branchProductAvailability)
      .where(
        and(
          eq(branchProductAvailability.branch_id, branchId),
          eq(branchProductAvailability.is_available, true),
          inArray(branchProductAvailability.product_id, productIds),
        ),
      );
    for (const row of availRows) availableProductIds.add(row.productId);
  }

  // Query 3 — active option price deltas for the selected options (for live pricing).
  const optionById = new Map<string, string>();
  if (allOptionIds.length > 0) {
    const optionRows = await dbOrTx
      .select({ id: productOptions.id, priceDelta: productOptions.price_delta })
      .from(productOptions)
      .where(and(inArray(productOptions.id, allOptionIds), eq(productOptions.is_active, true)));
    for (const row of optionRows) optionById.set(row.id, row.priceDelta);
  }

  // Query 4 — component availability for any deal-products in the cart (reuses the
  // MENU-003 shared helper so cart availability matches order-placement availability).
  let availableDealIds = new Set<string>();
  if (branchId !== null) {
    const dealProductIds = productIds.filter((id) => productById.get(id)?.isDeal === true);
    if (dealProductIds.length > 0) {
      availableDealIds = await resolveAvailableDealProductIds(dbOrTx, branchId, dealProductIds);
    }
  }

  for (const line of lines) {
    const product = productById.get(line.productId);

    // Live price: current base price + each still-active selected option's delta.
    // A missing/deactivated product prices at 0 (it will also be unavailable);
    // a missing/deactivated option contributes 0 (which will surface as a price
    // change if it previously had a delta).
    let livePriceCents = product ? Math.round(Number(product.basePrice) * 100) : 0;
    for (const optionId of line.selectedOptionIds) {
      const delta = optionById.get(optionId);
      if (delta !== undefined) livePriceCents += Math.round(Number(delta) * 100);
    }

    const productAvailable =
      product !== undefined &&
      product.isActive &&
      availableProductIds.has(line.productId) &&
      (product.isDeal !== true || availableDealIds.has(line.productId));

    let conflict: CartLineValidity['conflict'] = null;
    if (!productAvailable) {
      conflict = { reason: 'unavailable' };
    } else if (livePriceCents !== line.storedUnitPriceCents) {
      conflict = { reason: 'price_changed' };
    }

    result.set(line.lineId, { available: productAvailable, livePriceCents, conflict });
  }

  return result;
}
