import type { MenuItem } from '@jojopotato/types';

/**
 * Narrow the Home product grid to a single category. Pure — no I/O, no React —
 * so it is unit-testable (see `__tests__/filter-products-by-category.test.ts`),
 * mirroring the sibling `flattenMenuForHome` helper.
 *
 * - `categoryId === null` means "no filter active" → the full list is returned
 *   unchanged (this is the toggled-off / cleared state).
 * - Otherwise only the products whose `categoryId` matches are returned, in
 *   their original order.
 *
 * This only ever NARROWS the given list — it never re-adds an entry. That
 * matters: `products` comes from the branch-scoped menu API, which is already
 * server-side filtered to available-only items, so filtering can never
 * reintroduce a product that is unavailable at the selected branch.
 */
export function filterProductsByCategory(
  products: MenuItem[],
  categoryId: string | null,
): MenuItem[] {
  if (categoryId === null) return products;

  return products.filter((product) => product.categoryId === categoryId);
}
