import type { SelectedOption } from './product-option';

export interface CartItem {
  /** Client-side stable identity for a cart line (distinct product+options combos). */
  lineId: string;
  menuItemId: string;
  quantity: number;
  selectedOptions: SelectedOption[];
  notes?: string;
}

export interface Cart {
  id: string;
  items: CartItem[];
  pickupBranchId: string;
}
