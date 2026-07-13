import type { MenuItem, Product } from '@jojopotato/types';

/**
 * Adapts the real, whole-PHP-unit `Product` catalog type (wired to the actual
 * menu API) into the cart's cents-based `MenuItem` shape (`useCart().addItem`).
 * `isAvailable` defaults to `product.isActive` since plain `Product` has no
 * branch-availability field — callers holding a `ProductDetail` (which does)
 * should pass its `isAvailable` explicitly.
 */
export function productToMenuItem(
  product: Product,
  isAvailable: boolean = product.isActive,
): MenuItem {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? undefined,
    priceCents: Math.round(product.basePrice * 100),
    imageUrl: product.imageUrl ?? undefined,
    categoryId: product.categoryId,
    isAvailable,
  };
}
