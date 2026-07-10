import type { ProductOptionType } from './menu';

/** One selected option, snapshotted onto a cart line at add-time. */
export interface CartSelectedOption {
  optionId: string;
  optionType: ProductOptionType;
  name: string;
  /** Whole PHP units, captured at add-time. */
  priceDelta: number;
}

/**
 * A cart line. Carries a full, self-contained snapshot of the product + selected
 * options + computed unit price as they were at add-time, so a later change to
 * the source product/price never retroactively mutates an already-added line
 * (AC10). Identified by `id` (not `productId`) since the same product with
 * different options is a distinct line.
 */
export interface CartItem {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  /** Base price at add-time (whole PHP units). */
  basePrice: number;
  /** base + selected option deltas, computed at add-time (whole PHP units). */
  unitPrice: number;
  quantity: number;
  selectedOptions: CartSelectedOption[];
}

export interface Cart {
  items: CartItem[];
}

/** In-memory cart reducer action(s). */
export type CartAction = { type: 'ADD_ITEM'; item: CartItem };
