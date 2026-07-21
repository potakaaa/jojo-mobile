import type { MenuResponse, Product } from '@jojopotato/types';

/**
 * Find the eligible reward product within a branch menu tree. Returns null when
 * there is no eligible product id, no menu yet, or the product is absent from
 * the branch's menu (unavailable / inactive / deal-with-unavailable-components,
 * since useMenu() only returns orderable products). Pure — node-vitest testable.
 */
export function findEligibleMenuItem(
  eligibleProductId: string | null,
  menu: MenuResponse | undefined,
): Product | null {
  if (!eligibleProductId || !menu) return null;
  return menu.categories.flatMap((c) => c.products).find((p) => p.id === eligibleProductId) ?? null;
}
