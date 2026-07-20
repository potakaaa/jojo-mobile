import { and, eq, inArray } from 'drizzle-orm';

import { branchProductAvailability, dealComponents, products } from '../../db/schema/index';
import type { Queryer } from './coupon-apply';

/**
 * MENU-003 — the shared "is every component of this deal available at this branch"
 * check, used by BOTH the deals-menu read path (`branches.ts`) and the
 * order-placement write path (`orders.ts`) so the list and the money path can
 * never disagree about what a branch can actually fulfil.
 *
 * A deal-product is available iff it has AT LEAST ONE component AND EVERY one of
 * its components is available at `branchId`. "Available" for a component requires
 * BOTH signals (SPEC Constraints): its `branch_product_availability.is_available`
 * is true for this branch AND its own `products.is_active` is true globally — a
 * globally-deactivated ingredient can never make a deal look available just
 * because nobody flipped its per-branch switch too.
 *
 * Zero-component deals are NEVER available (SPEC AC7, locked decision) — they are
 * excluded unconditionally, without running the availability query for them.
 *
 * Batched: 2 queries total regardless of how many deal-products are passed in
 * (never one query per deal). Reads only — no locking. Deliberately NOT
 * `FOR UPDATE` (INNOVATE decision B): this matches the existing unlocked
 * `branch_product_availability` read for regular products at `orders.ts`, and
 * inherits the same accepted, app-wide race window rather than introducing a new
 * locking discipline for deals alone.
 *
 * Scope: this helper checks COMPONENTS ONLY. It deliberately does NOT check the
 * deal-product's own availability/active row — both callers already do that for
 * every product (deal or not) via their own existing joins, and compose that
 * result with this one.
 *
 * @param dbOrTx `db` or an open transaction (`Queryer`, reused from `coupon-apply.ts`).
 *   Order placement MUST pass its `tx` so the check reads the same snapshot as the write.
 * @returns the subset of `dealProductIds` whose components are all available.
 */
export async function resolveAvailableDealProductIds(
  dbOrTx: Queryer,
  branchId: string,
  dealProductIds: string[],
): Promise<Set<string>> {
  if (!dealProductIds.length) return new Set();

  // Query 1 — every component of every candidate deal. Same shape as the
  // display-side component fetch in `branches.ts` (inner join to the component's
  // own `products` row), minus the name column this check doesn't need.
  const componentRows = await dbOrTx
    .select({
      dealProductId: dealComponents.deal_product_id,
      componentProductId: dealComponents.component_product_id,
    })
    .from(dealComponents)
    .innerJoin(products, eq(products.id, dealComponents.component_product_id))
    .where(inArray(dealComponents.deal_product_id, dealProductIds));

  const componentIdsByDeal = new Map<string, string[]>();
  for (const row of componentRows) {
    const list = componentIdsByDeal.get(row.dealProductId) ?? [];
    list.push(row.componentProductId);
    componentIdsByDeal.set(row.dealProductId, list);
  }

  // Every candidate is a zero-component deal → all excluded, query 2 is pointless.
  if (componentIdsByDeal.size === 0) return new Set();

  const allComponentIds = [...new Set(componentRows.map((row) => row.componentProductId))];

  // Query 2 — which of those components are actually available at this branch.
  // INNER JOIN, so a component with NO `branch_product_availability` row at all
  // for this branch falls out exactly like one with `is_available = false` —
  // both are "unavailable" (regression-locked by a dedicated test).
  const availableRows = await dbOrTx
    .select({ productId: products.id })
    .from(products)
    .innerJoin(
      branchProductAvailability,
      and(
        eq(branchProductAvailability.product_id, products.id),
        eq(branchProductAvailability.branch_id, branchId),
        eq(branchProductAvailability.is_available, true),
      ),
    )
    .where(and(inArray(products.id, allComponentIds), eq(products.is_active, true)));

  const availableComponentIds = new Set(availableRows.map((row) => row.productId));

  const available = new Set<string>();
  for (const [dealProductId, componentIds] of componentIdsByDeal) {
    if (componentIds.every((id) => availableComponentIds.has(id))) {
      available.add(dealProductId);
    }
  }
  return available;
}
