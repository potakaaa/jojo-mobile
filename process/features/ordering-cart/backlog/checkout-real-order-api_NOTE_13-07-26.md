---
name: note:checkout-real-order-api
description: "Deferred follow-up — real POST /api/orders endpoint + Drizzle persistence + mobile HTTP client to replace the CART-002 contract-shaped mock seam"
date: 13-07-26
feature: ordering-cart
---

# Backlog: Real `POST /api/orders` endpoint (CART-002 follow-up)

CART-002 shipped a **contract-shaped in-memory mock** for order placement
(`apps/mobile/src/features/order/`). The request/response TypeScript shapes
(`PlaceOrderRequest` / `PlaceOrderResult` / `Order` in `packages/types/src/order.ts`)
already mirror the real Drizzle `orders` / `order_items` schema field-for-field,
so the backend swap is isolated. This note tracks the deferred real work.

## Deferred scope

1. **Express route — `POST /api/orders`** (in `packages/api/src/index.ts` / a new
   router module). Auth-gated (uses the better-auth session to resolve `user_id`).
   Writes `orders` + `order_items` in a single Drizzle transaction. Assigns the
   server-authoritative `order_number` (do not trust a client-generated one),
   `status = 'pending'`, `payment_status = 'unpaid'`, and `placed_at`.
   Returns the persisted `Order` in the same shape the mock returns today.

2. **Server-side availability check.** Move `validatePlaceOrderRequest`'s logic
   server-side: verify the branch is open and each product is available at
   commit time, returning the same `branch_unavailable` / `item_unavailable`
   discriminated failures the mock returns.

3. **Mobile HTTP client swap-in point.** The ONLY file that changes on the app
   side is `apps/mobile/src/features/order/hooks/use-order.ts` — replace the
   in-memory `validatePlaceOrderRequest` + `buildOrderFromRequest` calls with a
   `fetch('{apiUrl}/api/orders', ...)` call. `PlaceOrderRequest` /
   `PlaceOrderResult` / `Order` need no change (already backend-shaped). Screen
   consumers (`checkout.tsx`, `confirmation/[orderId].tsx`) need no change.
   The confirmation screen's `lastOrder` fallback should become a real
   `GET /api/orders/:orderNumber` fetch for direct-link / cold-start resilience.

4. **Payment-gateway integration for `online_payment`.** Currently flag-gated
   off by default (`EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED=false`) and a UI-only
   stub when enabled. Wire a real payment processor (provider undecided — see
   `process/context/all-context.md` Open Questions) before enabling the flag in
   any shipped environment.

## Out of scope for this note (separate backlog items)

- Order tracking screen (`tracking/[orderId].tsx`) — still a placeholder.
- Push notifications on order status change.
- Real coupon/discount pricing engine (CART-001's `AppliedDiscount` stub).
- Project-wide RN E2E/navigation regression harness
  (`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`).
