export interface CartItemOption {
  optionType: 'size' | 'flavor' | 'add_on'; // mirrors product_options.option_type
  id: string; // product_options.id
  name: string;
  priceDeltaCents: number; // product_options.price_delta (cents convention)
}

export interface CartItem {
  lineId: string; // unique per line (same menuItem w/ different options = distinct lines)
  menuItemId: string;
  quantity: number;
  productNameSnapshot: string; // mirrors order_items.product_name_snapshot
  unitPriceCents: number; // snapshot: base + Σ option deltas (order_items.unit_price)
  selectedOptions: CartItemOption[]; // originates the order_items.selected_options shape
  notes?: string;
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
