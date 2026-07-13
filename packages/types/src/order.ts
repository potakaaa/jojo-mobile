import type { SelectedOption } from './product-option';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'flavoring'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type PaymentMethod = 'pay_at_branch' | 'online_payment';

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  selectedOptions: SelectedOption[];
}

export interface Order {
  id: string;
  orderNumber: string;
  branchId: string;
  status: OrderStatus;
  subtotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  estimatedReadyAt: string;
  placedAt: string;
  items: OrderItem[];
}
