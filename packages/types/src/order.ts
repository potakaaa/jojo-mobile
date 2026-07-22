export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'flavoring'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'rejected';
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
  estimatedReadyAt: string | null; // ISO — mirrors orders.estimated_ready_at (null when not yet set)
  placedAt: string; // ISO — mirrors orders.placed_at
  dealId: string | null; // mirrors orders.deal_id — the applied deal, if any (DEAL-003)
  // Terminal-transition reason (B2 staff reject / B3 customer cancel).
  //
  // OPTIONAL *and* nullable, deliberately. The server always emits all three (null
  // when absent), so `| null` alone would describe the wire correctly — but these
  // are sparse audit fields that only ever carry a value for 2 of the 8 statuses,
  // and making them REQUIRED silently turned a purely additive feature into a
  // breaking change for every caller that constructs an `Order` (it broke 5 existing
  // mobile test fixtures outside this feature's blast radius). `?:` keeps the change
  // additive; `| null` keeps it honest about what the server actually sends. The
  // server's unconditional emission is locked by a runtime field-presence test
  // (`order-reasons.integration.test.ts`, B2.6), not by this type.
  reasonCode?: string | null;
  reasonNote?: string | null;
  reasonActor?: 'staff' | 'customer' | null;
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
