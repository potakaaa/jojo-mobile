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
  /** Optional reward/deal code (STAR-004) — re-validated + consumed server-side. */
  couponCode?: string;
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

/** One page of order history: the orders plus the cursor for the next (older) page. */
export interface OrderHistoryPage {
  orders: Order[];
  nextCursor: string | null;
}

/**
 * `GET /orders` — one page of the caller's order history, newest first.
 * Passes `limit`/`cursor` through as query params (when present) and returns the
 * full `{ orders, nextCursor }` envelope so callers can paginate.
 */
export async function fetchOrderHistory(params?: {
  limit?: number;
  cursor?: string | null;
}): Promise<OrderHistoryPage> {
  const search = new URLSearchParams();
  if (params?.limit != null) search.set('limit', String(params.limit));
  if (params?.cursor != null) search.set('cursor', params.cursor);
  const query = search.toString();
  return apiRequest<OrderHistoryPage>(query ? `/orders?${query}` : '/orders');
}
