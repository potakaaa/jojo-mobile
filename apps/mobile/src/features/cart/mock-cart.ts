/**
 * PLACEHOLDER / MOCK DATA — dev seed for the Cart screen (CART-001).
 *
 * There is no cart backend yet (see process/context/all-context.md Open
 * Questions). Until CART-002 wires real reads/writes, `CartSessionProvider`
 * seeds its initial state from this module so the Cart screen renders against a
 * realistic populated cart on-device. Every value is typed against the real
 * `@jojopotato/types` cart contracts. Replace with backend-backed state later.
 */
import type { Cart, CartItem, Product } from '@jojopotato/types';

import { MOCK_BRANCH, MOCK_PRODUCTS } from '@/features/home/mock-home';
import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';

/** The branch a seeded cart is scoped to (single-branch rule, A7). */
export const MOCK_CART_BRANCH = MOCK_BRANCH;

/** How long the mock branch takes to prepare an order (display estimate, D5). */
export const MOCK_BRANCH_PREP_MINUTES = 15;

function seedLine(sourceProduct: Product, quantity: number): CartItem {
  const product = productToMenuItem(sourceProduct);
  return {
    lineId: `line-${product.id}`,
    menuItemId: product.id,
    quantity,
    productNameSnapshot: product.name,
    unitPriceCents: product.priceCents,
    selectedOptions: [],
  };
}

export const MOCK_CART: Cart = {
  id: 'cart-dev-seed',
  pickupBranchId: MOCK_BRANCH.id,
  items: MOCK_PRODUCTS.slice(0, 2).map((product, i) => seedLine(product, i === 0 ? 2 : 1)),
};

/** A second branch used to exercise the mixed-branch clear-and-switch prompt. */
export const MOCK_OTHER_BRANCH: typeof MOCK_BRANCH = {
  ...MOCK_BRANCH,
  id: 'branch-sm-north',
  name: 'Jojo Potato — SM North',
  address: 'North Ave cor. EDSA, Quezon City',
};
