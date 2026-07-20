export interface CartItemOption {
  optionType: 'size' | 'flavor' | 'add_on'; // mirrors product_options.option_type
  id: string; // product_options.id
  name: string;
  priceDeltaCents: number; // product_options.price_delta (cents convention)
}

/**
 * A per-line conflict surfaced at cart READ time (CART-003, AC7/AC8). Additive and
 * optional — a line with no conflict omits it. `unavailable` = the product is no
 * longer orderable at the cart's branch; `price_changed` = its live price differs
 * from the stored snapshot (the cart shows the live price). Distinct from the
 * reorder-time `ReorderUnavailableLine` vocabulary in `@jojopotato/utils`.
 */
export interface CartItemConflict {
  reason: 'unavailable' | 'price_changed';
}

export interface CartItem {
  lineId: string; // unique per line (same menuItem w/ different options = distinct lines)
  menuItemId: string;
  quantity: number;
  productNameSnapshot: string; // mirrors order_items.product_name_snapshot
  unitPriceCents: number; // snapshot: base + Σ option deltas (order_items.unit_price)
  selectedOptions: CartItemOption[]; // originates the order_items.selected_options shape
  notes?: string;
  conflict?: CartItemConflict; // CART-003: read-time re-validation flag (AC7/AC8)
}

/** One active discount at a time (D1), coupon-shaped (D2). */
export type AppliedDiscount = {
  source: 'coupon' | 'deal' | 'reward';
  refId: string;
  label: string;
  amountCents: number;
};

export interface Cart {
  id: string;
  items: CartItem[];
  pickupBranchId: string; // single-branch scoping (A7)
  appliedDiscount?: AppliedDiscount;
}
