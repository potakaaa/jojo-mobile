import type { Order, PaymentMethod } from '@jojopotato/types';

import { apiRequest } from '@/features/shared/lib/api-request';

/** Body for `POST /orders` — server recomputes prices, so only ids are sent. */
export interface CreateOrderInput {
  branchId: string;
  paymentMethod: PaymentMethod;
  items: {
    productId: string;
    quantity: number;
    selectedOptions: { optionId: string }[];
  }[];
}

/** `POST /orders` — create an order (session required). Returns the full order. */
export function createOrder(input: CreateOrderInput): Promise<Order> {
  return apiRequest<Order>('/orders', { method: 'POST', body: input });
}

/** `GET /orders/:orderId` — full order + items (session required). */
export function fetchOrder(orderId: string): Promise<Order> {
  return apiRequest<Order>(`/orders/${encodeURIComponent(orderId)}`);
}

/** `GET /orders` — the caller's order history, newest first. */
export function fetchOrderHistory(): Promise<Order[]> {
  return apiRequest<Order[]>('/orders');
}
