/**
 * PLACEHOLDER / MOCK — contract-shaped in-memory order placement logic (CART-002).
 *
 * There is NO order backend yet (see process/context/all-context.md Open
 * Questions). These pure functions stand in for the eventual `POST /api/orders`
 * endpoint: `validatePlaceOrderRequest` mimics the server-side availability
 * check, `buildOrderFromRequest` mimics the row the server would persist, and
 * `generateOrderNumber` mimics the server-assigned display order number. All are
 * pure (no React, no I/O) so they unit-test under the node-environment vitest
 * runner. Swapping to the real backend replaces `useOrder()`'s internals only —
 * these types (`PlaceOrderRequest`/`PlaceOrderResult`/`Order`) are already
 * backend-shaped and require no change.
 */
import type { Order, OrderItem, PlaceOrderRequest } from '@jojopotato/types';

const ORDER_NUMBER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** `JP-` + 6 uppercase alphanumeric chars, e.g. `JP-4F8B2C`. Mock-only (Math.random). */
export function generateOrderNumber(): string {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += ORDER_NUMBER_ALPHABET[Math.floor(Math.random() * ORDER_NUMBER_ALPHABET.length)];
  }
  return `JP-${suffix}`;
}

export type ValidatePlaceOrderResult =
  | { ok: true }
  | { ok: false; reason: 'branch_unavailable' }
  | { ok: false; reason: 'item_unavailable'; unavailableLineIds: string[] };

/**
 * Pure availability check mirroring what the real endpoint would enforce:
 * the branch must be open, and no line's product may be unavailable. Branch
 * failure takes precedence (there is no point flagging items at a closed branch).
 */
export function validatePlaceOrderRequest(
  req: PlaceOrderRequest,
  branchAvailable: boolean,
  unavailableProductIds: string[],
): ValidatePlaceOrderResult {
  if (!branchAvailable) {
    return { ok: false, reason: 'branch_unavailable' };
  }
  const unavailableLineIds = req.items
    .filter((item) => unavailableProductIds.includes(item.menuItemId))
    .map((item) => item.menuItemId);
  if (unavailableLineIds.length > 0) {
    return { ok: false, reason: 'item_unavailable', unavailableLineIds };
  }
  return { ok: true };
}

/**
 * Pure builder: turns a validated request plus a generated order number and the
 * pickup-time estimate computed at checkout into a fully-shaped `Order`. Snapshot
 * fields (`productNameSnapshot`, `unitPriceCents`) are copied from the request
 * as-is — price-at-time-of-order, never re-derived from live catalog state.
 */
export function buildOrderFromRequest(
  req: PlaceOrderRequest,
  orderNumber: string,
  estimatedReadyAt: string,
): Order {
  const items: OrderItem[] = req.items.map((item, index) => ({
    id: `${orderNumber}-${index}`,
    productId: item.menuItemId,
    productNameSnapshot: item.productNameSnapshot,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    totalPriceCents: item.unitPriceCents * item.quantity,
    selectedOptions: item.selectedOptions,
  }));

  const subtotalCents = items.reduce((sum, item) => sum + item.totalPriceCents, 0);
  const discountTotalCents = req.discountTotalCents;
  const totalCents = Math.max(0, subtotalCents - discountTotalCents);

  return {
    id: orderNumber,
    orderNumber,
    branchId: req.branchId,
    items,
    status: 'pending',
    subtotalCents,
    discountTotalCents,
    totalCents,
    paymentMethod: req.paymentMethod,
    paymentStatus: 'unpaid',
    estimatedReadyAt,
    placedAt: new Date().toISOString(),
  };
}

/**
 * Dev-only forced-network-failure toggle (AC6). `__DEV__`-gated affordances flip
 * this so `placeOrder()` returns `{ ok: false, reason: 'network' }` without a
 * real network layer. Never mutated in production paths.
 */
export const devFlags = {
  simulateNetworkFailure: false,
};
