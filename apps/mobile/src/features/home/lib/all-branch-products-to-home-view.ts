import type { MenuItem, MenuResponse } from '@jojopotato/types';

import type { HomeMenuView } from './menu-to-home-view';

/**
 * Flatten the ALL-BRANCH catalog (`GET /products`, home-all-branches D1) into the
 * flat `MenuCategory[]` / `MenuItem[]` shapes the Home `CategorySelector` /
 * `ProductGrid` accept. Pure — no I/O, no React.
 *
 * A sibling of `flattenMenuForHome` rather than a change to it: the two take
 * meaningfully different inputs (already-deduped all-branch vs. one branch's
 * menu) even though they produce the same `HomeMenuView`. `flattenMenuForHome`
 * stays in place for the branch-scoped surfaces.
 *
 * Derivations, matching `flattenMenuForHome` except where noted:
 * - `MenuCategory.sortOrder` ← the category's index (array order IS display order).
 * - `MenuItem.categoryId` ← the parent category's id.
 * - `MenuItem.priceCents` ← `Product.basePriceCents` (rename only; both cents).
 * - `MenuItem.branches` ← threaded through verbatim (NEW) — this is what the
 *   card subtext and the cross-branch tap check read.
 * - `MenuItem.isAvailable` ← always `true`, as in `flattenMenuForHome`. A product
 *   no branch currently carries is deliberately NOT marked unavailable here: the
 *   grid's job is to always show something real, and the honest per-branch answer
 *   lives on Product Details.
 *
 * DEDUPLICATION (AC1): one `MenuItem` per distinct product id, first occurrence
 * winning. The route already returns one row per product, so this is a guard
 * rather than a fix — but it is the guarantee the Home grid depends on, so it is
 * enforced (and tested) here rather than assumed of the server.
 */
export function flattenAllBranchProducts(menu: MenuResponse): HomeMenuView {
  const categories = menu.categories.map((category, index) => ({
    id: category.id,
    name: category.name,
    sortOrder: index,
  }));

  const seen = new Set<string>();
  const products: MenuItem[] = [];

  for (const category of menu.categories) {
    for (const product of category.products) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      products.push({
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: product.basePriceCents,
        imageUrl: product.imageUrl,
        categoryId: category.id,
        isAvailable: true,
        ...(product.branches === undefined ? {} : { branches: product.branches }),
      });
    }
  }

  return { categories, products };
}
