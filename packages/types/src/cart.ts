export interface CartItem {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface Cart {
  id: string;
  items: CartItem[];
  pickupBranchId: string;
}
