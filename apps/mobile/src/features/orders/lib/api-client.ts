import type { Order, PaymentMethod, Review, SubmitReviewRequest } from '@jojopotato/types';

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

/**
 * `PATCH /orders/:orderId/complete` — the customer confirms they collected the
 * order, moving it from `ready` to `completed` (session required).
 *
 * The route takes NO body on purpose: it can only ever express one target
 * status, so a customer cannot steer an order into some other state. Keep it
 * body-less — adding one would hand that choice back to the client.
 *
 * Rejects (via `apiRequest`) on 403 (not the caller's order), 409 (the order is
 * no longer `ready`, e.g. staff completed it first), and 404.
 */
export async function completeOrder(orderId: string): Promise<Order> {
  const { order } = await apiRequest<{ order: Order }>(
    `/orders/${encodeURIComponent(orderId)}/complete`,
    { method: 'PATCH' },
  );
  return order;
}

/**
 * `PATCH /orders/:orderId/cancel` — the customer cancels their own order while it
 * is still `pending`, i.e. before staff have accepted it (session required).
 *
 * Unlike `completeOrder` this route DOES take a body — but only a reason, never a
 * target status: the route always means `pending → cancelled`, so the customer
 * still cannot steer the order into some other state. Both reason fields are
 * optional; the server stores whatever is sent verbatim and 422s an unrecognised
 * `reasonCode`.
 *
 * Rejects (via `apiRequest`) on 403 (not the caller's order), 409 (the order is no
 * longer `pending`, e.g. staff accepted it first), 404, and 422.
 */
export async function cancelOrder(
  orderId: string,
  reasonCode?: string,
  note?: string,
): Promise<Order> {
  const { order } = await apiRequest<{ order: Order }>(
    `/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: 'PATCH',
      body: {
        ...(reasonCode ? { reasonCode } : {}),
        ...(note ? { note } : {}),
      },
    },
  );
  return order;
}

/**
 * `POST /orders/:orderId/review` — leave a single overall rating (1–5) + optional
 * comment for a completed order the caller owns (session required).
 *
 * Rejects (via `apiRequest`) on 403 (not the caller's order), 404 (missing),
 * 409 (order not `completed`, or already reviewed — one review per order), and
 * 422 (rating out of 1–5).
 */
export async function submitReview(orderId: string, body: SubmitReviewRequest): Promise<Review> {
  const { review } = await apiRequest<{ review: Review }>(
    `/orders/${encodeURIComponent(orderId)}/review`,
    { method: 'POST', body },
  );
  return review;
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
