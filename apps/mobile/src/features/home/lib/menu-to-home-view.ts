import type { MenuCategory, MenuItem, MenuResponse } from '@jojopotato/types';

/** Flat Home-view shape the `CategorySelector` / `ProductGrid` components accept. */
export interface HomeMenuView {
  categories: MenuCategory[];
  products: MenuItem[];
}

/**
 * Flatten the real nested branch-menu tree (`MenuResponse.categories: Category[]`,
 * each `Category` holding its own `Product[]`) into the flat `MenuCategory[]` /
 * `MenuItem[]` shapes the Home `CategorySelector` / `ProductGrid` accept. Pure —
 * no I/O, no React — so it is unit-testable (see `__tests__/menu-to-home-view.test.ts`).
 *
 * Derivations:
 * - `MenuCategory.sortOrder` ← the category's index in `menu.categories`. The tree
 *   carries no explicit order field; array order IS the display order.
 * - `MenuItem.categoryId` ← the parent category's id.
 * - `MenuItem.priceCents` ← `Product.basePriceCents` (rename only; both integer cents).
 * - `MenuItem.isAvailable` ← always `true`: the branch menu tree is server-side
 *   filtered to available-only products (see `ProductDetail`'s doc note in
 *   `packages/types/src/menu.ts`), and `Product` carries no availability field.
 *
 * Ordering is preserved: categories in tree order, products within each category
 * in tree order, flattened into a single products array.
 */
export function flattenMenuForHome(menu: MenuResponse): HomeMenuView {
  const categories: MenuCategory[] = menu.categories.map((category, index) => ({
    id: category.id,
    name: category.name,
    sortOrder: index,
  }));

  const products: MenuItem[] = menu.categories.flatMap((category) =>
    category.products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      priceCents: product.basePriceCents,
      imageUrl: product.imageUrl,
      categoryId: category.id,
      isAvailable: true,
    })),
  );

  return { categories, products };
}
