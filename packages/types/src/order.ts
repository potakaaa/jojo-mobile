export type OrderStatus =
  'pending' | 'accepted' | 'preparing' | 'flavoring' | 'ready' | 'completed' | 'cancelled';
export type PaymentMethod = 'pay_at_branch' | 'app_wallet' | 'gcash' | 'maya' | 'card';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded';

export interface OrderItemOption {
  optionType: 'size' | 'flavor' | 'add_on';
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productNameSnapshot: string; // mirrors order_items.product_name_snapshot
  quantity: number;
  unitPriceCents: number; // mirrors order_items.unit_price
  totalPriceCents: number; // mirrors order_items.total_price
  selectedOptions: OrderItemOption[];
}

export interface Order {
  id: string;
  orderNumber: string; // mirrors orders.order_number (unique, display)
  branchId: string;
  items: OrderItem[];
  status: OrderStatus;
  subtotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  estimatedReadyAt: string; // ISO — mirrors orders.estimated_ready_at
  placedAt: string; // ISO — mirrors orders.placed_at
  dealId: string | null; // mirrors orders.deal_id — the applied deal, if any (DEAL-003)
}

export interface PlaceOrderRequest {
  branchId: string;
  items: Array<{
    menuItemId: string;
    productNameSnapshot: string;
    quantity: number;
    unitPriceCents: number;
    selectedOptions: OrderItemOption[];
  }>;
  discountTotalCents: number;
  paymentMethod: PaymentMethod;
}

export type PlaceOrderResult =
  | { ok: true; order: Order }
  | { ok: false; reason: 'branch_unavailable' }
  | { ok: false; reason: 'item_unavailable'; unavailableLineIds: string[] }
  | { ok: false; reason: 'network' };
