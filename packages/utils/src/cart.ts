import type { Cart, CartAction, CartItem, CartSelectedOption, Product } from '@jojopotato/types';

export const initialCartState: Cart = { items: [] };

/** In-memory cart reducer. Append-only this phase (no edit/remove — out of scope). */
export function cartReducer(state: Cart, action: CartAction): Cart {
  switch (action.type) {
    case 'ADD_ITEM':
      return { ...state, items: [...state.items, action.item] };
    default:
      return state;
  }
}

let lineSequence = 0;
function nextLineId(): string {
  lineSequence += 1;
  return `cart-line-${Date.now().toString(36)}-${lineSequence}`;
}

/**
 * Build a fully self-contained cart-line snapshot (AC10). Primitive fields are
 * copied by value and each selected option is cloned, so a later mutation of the
 * source `product` or `selectedOptions` can never retroactively change an
 * already-added line.
 */
export function buildCartItemSnapshot(
  product: Product,
  selectedOptions: CartSelectedOption[],
  unitPrice: number,
  quantity = 1,
): CartItem {
  return {
    id: nextLineId(),
    productId: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    basePrice: product.basePrice,
    unitPrice,
    quantity,
    selectedOptions: selectedOptions.map((option) => ({ ...option })),
  };
}
