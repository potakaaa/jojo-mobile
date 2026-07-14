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
  /** Optional applied deal — the server recomputes the real discount from it. */
  dealId?: string;
}

/** `POST /orders` — create an order (session required). Returns the full order. */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const { order } = await apiRequest<{ order: Order }>('/orders', {
    method: 'POST',
    body: input,
  });
  return order;
}

/** `GET /orders/:orderId` — full order + items (session required). */
export async function fetchOrder(orderId: string): Promise<Order> {
  const { order } = await apiRequest<{ order: Order }>(`/orders/${encodeURIComponent(orderId)}`);
  return order;
}

/** `GET /orders` — the caller's order history, newest first. */
export async function fetchOrderHistory(): Promise<Order[]> {
  const { orders } = await apiRequest<{ orders: Order[]; nextCursor: string | null }>('/orders');
  return orders;
}
