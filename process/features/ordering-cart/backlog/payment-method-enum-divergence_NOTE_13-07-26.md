---
name: note:payment-method-enum-divergence
description: "App-side PaymentMethod union diverges from the DB payment_method enum — reconcile when the real order API is wired"
date: 13-07-26
feature: ordering-cart
---

# Payment Method Enum Divergence (D1 contract debt)

## What

The app-side `PaymentMethod` type (`packages/types/src/order.ts`) was widened to five
concrete methods for the payment-method selection screen:

```
'pay_at_branch' | 'app_wallet' | 'gcash' | 'maya' | 'card'
```

The database enum (`packages/api/src/db/schema/orders.ts`, column `payment_method`) is still
the original two-value enum:

```
pay_at_branch | online_payment
```

These no longer match. This is an **intentional mock/app-side divergence** — the
payment-method screen is UI-only, nothing is charged (`payment_status` stays `'unpaid'` for
every method), and there is no real order-write path yet, so no migration was made.

## Why it is safe today

- No code writes an order to the DB — `placeOrder()` is the in-memory mock seam
  (`apps/mobile/src/features/order/hooks/use-order.ts`); `buildOrderFromRequest` is
  type-generic over `PaymentMethod` and never branches on the literal enum values.
- No DB/migration surface was touched by the payment-method-screen plan.

## What must happen when the real order API is wired

When the real `placeOrder()` / order API is built (tracked by
`process/features/ordering-cart/backlog/checkout-real-order-api_NOTE_13-07-26.md`), do ONE of:

1. **Widen the DB `payment_method` enum** to match the concrete app-side methods
   (`pay_at_branch | app_wallet | gcash | maya | card`) via a migration, or
2. **Add a boundary mapping** at the request boundary that collapses the concrete app-side
   method into the DB enum (concrete method → `pay_at_branch | online_payment`).

Do not silently drop the selected method — either persist it faithfully (option 1) or map it
explicitly and record the original selection somewhere (option 2).

## Source

- Introduced by: `process/features/ordering-cart/active/payment-method-screen_13-07-26/payment-method-screen_PLAN_13-07-26.md` (D1)
