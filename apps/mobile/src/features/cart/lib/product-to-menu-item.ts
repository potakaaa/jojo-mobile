import type { MenuItem, Product } from '@jojopotato/types';

/**
 * Adapts the cents-native `Product` catalog type (wired to this branch's real
 * menu API) into the cart's cents-based `MenuItem` shape (`useCart().addItem`).
 * Kept as a thin, stable seam that isolates the add-to-cart caller from
 * `Product`↔`MenuItem` shape drift.
 *
 * `Product` is already cents-native (`basePriceCents`), so no `* 100` conversion
 * is needed. `Product` carries no availability field of its own — only the
 * derived `ProductDetail` does — so `isAvailable` is a REQUIRED parameter the
 * caller must pass explicitly (the one real call site always does). It also
 * carries no `categoryId`; the cart does not key on it, so it is left empty.
 */
export function productToMenuItem(product: Product, isAvailable: boolean): MenuItem {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? undefined,
    priceCents: product.basePriceCents,
    imageUrl: product.imageUrl ?? undefined,
    categoryId: '',
    isAvailable,
  };
}
