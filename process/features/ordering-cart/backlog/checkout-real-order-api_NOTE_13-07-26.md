---
name: note:checkout-real-order-api
description: "DELIVERED (14-07-26) — checkout + confirmation screens wired to the real POST /orders + GET /orders/:id API; only online-payment gateway remains deferred"
date: 13-07-26
feature: ordering-cart
---

# DELIVERED: Real order API wiring (CART-002 follow-up)

**Status: delivered 14-07-26** on branch `feat/checkout-flow` (PR #69 scope).

The real `POST /orders` + `GET /orders/:orderId` endpoints landed earlier via the
`development` merge (`packages/api/src/routes/orders.ts`, session-gated, transactional,
server-assigned `order_number`/`estimated_ready_at`, server-side availability checks). This
follow-up completed the **mobile-client swap**: the checkout and confirmation screens now
call the real API instead of the CART-002 in-memory mock seam.

## What was delivered

1. **`checkout.tsx`** now places orders via `useCheckout()` → `createOrder()`
   (`POST /orders`), mapping cart lines → `{ productId, quantity, selectedOptions: [{ optionId }] }`.
   The 5-second confirm-drawer countdown/cancel UX is unchanged — only the fire action swapped.
   On success it clears the cart and navigates to `confirmation/[orderId]` with the real
   server `order.id`; failures preserve the cart and surface `useCheckout().error`. Branch
   display resolves from the live `useBranch()` list.
2. **`confirmation/[orderId].tsx`** now renders the real order fetched via
   `useOrder(orderId)` → `fetchOrder()` (`GET /orders/:orderId`), with loading and error
   (retry) states. Works for both fresh-placement navigation and cold direct links. Branch
   name resolves from the live branch list.
3. **`features/order/hooks/use-order.ts`** seam was trimmed to payment-method selection state
   only (`paymentMethod` / `setPaymentMethod`), still consumed by `order/payment-method.tsx`.
   The in-memory placement logic (`mock-order.ts` + its vitest tests) was deleted as dead code.
   `OrderSessionProvider` remains mounted in `_layout.tsx` for the payment-method state.

## Still deferred (separate backlog)

- **Payment-gateway integration for `online_payment`.** Still flag-gated off by default
  (`EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED=false`), UI-only. Wire a real processor (undecided —
  see `process/context/all-context.md` Open Questions) before enabling in any shipped env.
- App-side `PaymentMethod` widening (`pay_at_branch|app_wallet|gcash|maya|card`) vs the DB
  enum (`pay_at_branch|online_payment`) — documented divergence, tracked in
  `payment-method-enum-divergence_NOTE_13-07-26.md`. Only `pay_at_branch` is enabled today.
- Order tracking screen, push notifications, real coupon/discount engine, RN E2E harness —
  all unchanged, separate backlog items.
