/**
 * Reorder logic (HIST-002) — pure functions, no hook, no cart-state seam.
 *
 * `buildReorderPlan` re-checks a past order's lines against the CURRENT mock
 * catalog (MOCK_PRODUCTS): a line is unavailable if its product is discontinued
 * (not found) or currently `isAvailable === false`. For available lines it
 * recomputes the unit price from the CURRENT `MenuItem.priceCents` plus the
 * carried-forward option deltas — never reusing the historical snapshot price
 * (proves AC6 re-pricing). Whole-item availability only; option-level drift is
 * out of scope this pass (D7).
 *
 * `applyReorderPlan` drives the EXISTING `useCart()` seam: the caller (screen)
 * passes the `addItem`/`setBranch` actions in, so this module never imports the
 * hook and stays pure and unit-testable (A3).
 */
import type { CartItem, MenuItem, Order } from '@jojopotato/types';

import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';
import type { CartSessionState } from '@/features/cart/hooks/use-cart';
import { MOCK_PRODUCTS } from '@/features/home/mock-home';

export interface ReorderLine {
  /** The historical snapshot line from the past order. */
  originalItem: CartItem;
  /** The current catalog item; undefined if discontinued (not found). */
  currentMenuItem?: MenuItem;
  /** false when the product is not found OR found with isAvailable: false. */
  isAvailable: boolean;
  /** Recomputed from currentMenuItem.priceCents + carried-forward option deltas. */
  currentUnitPriceCents?: number;
}

export interface ReorderResult {
  available: ReorderLine[];
  unavailable: ReorderLine[];
}

/**
 * Pure — no side effects, no cart mutation. Re-checks each line against the
 * current MOCK_PRODUCTS catalog (D4).
 */
export function buildReorderPlan(order: Order): ReorderResult {
  const available: ReorderLine[] = [];
  const unavailable: ReorderLine[] = [];

  for (const originalItem of order.cart.items) {
    const currentProduct = MOCK_PRODUCTS.find((p) => p.id === originalItem.menuItemId);
    const currentMenuItem =
      currentProduct !== undefined ? productToMenuItem(currentProduct) : undefined;
    const isAvailable = currentMenuItem !== undefined && currentMenuItem.isAvailable;

    if (isAvailable) {
      const optionDeltas = originalItem.selectedOptions.reduce(
        (sum, o) => sum + o.priceDeltaCents,
        0,
      );
      available.push({
        originalItem,
        currentMenuItem,
        isAvailable: true,
        // Recompute from the CURRENT catalog price, not originalItem.unitPriceCents.
        currentUnitPriceCents: currentMenuItem.priceCents + optionDeltas,
      });
    } else {
      unavailable.push({ originalItem, currentMenuItem, isAvailable: false });
    }
  }

  return { available, unavailable };
}

/**
 * Applies the `available` lines of a reorder plan to the live cart via the
 * existing useCart() seam. Sets the branch first, then re-adds each available
 * line with its current MenuItem and carried-forward historical options (which
 * makes useCart().addItem recompute the unit price from the current catalog).
 * Unavailable lines are intentionally NOT added (the Reorder Review screen has
 * already surfaced them to the user — D8, never a silent drop).
 */
export function applyReorderPlan(
  result: ReorderResult,
  branchId: string,
  cartActions: Pick<CartSessionState, 'addItem' | 'setBranch'>,
): void {
  cartActions.setBranch(branchId);
  for (const line of result.available) {
    if (!line.currentMenuItem) continue;
    cartActions.addItem(
      line.currentMenuItem,
      line.originalItem.selectedOptions,
      line.originalItem.quantity,
    );
  }
}
