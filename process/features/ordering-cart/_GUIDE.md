# ordering-cart

<!-- Part of Jojo Potato -->

## Scope

Menu browsing, cart management, and checkout flow for the Jojo Potato mobile app. Covers menu
item display, cart state (add/remove/update quantity), price calculation, and the checkout
sequence leading up to order placement. Payments processor is not yet decided (see
`process/context/all-context.md`).

**Status as of 13-07-26:** Cart (CART-001) and Checkout + Order Confirmation + Payment-method
selection (CART-002, issue #18, and its follow-up) are implemented — real screen UI backed by
in-memory state seams (`useCart()`, `useOrder()`), not a real backend. Menu browsing is still
not started.

## Key Source Files

- `apps/mobile/src/app/(tabs)/order/{checkout.tsx, payment-method.tsx, confirmation/[orderId].tsx}` -- checkout, payment-method, confirmation screens
- `apps/mobile/src/features/cart/hooks/use-cart.ts`, `apps/mobile/src/features/order/hooks/use-order.ts` -- in-memory state seams
- `apps/mobile/src/features/order/mock-order.ts` -- pure order-building/validation functions (unit-tested via vitest)
- `packages/types/src/order.ts`, `packages/types/src/cart.ts` -- shared cart/order domain types
- `packages/ui/src/components/{cart-item, branch-card, payment-method-selector, order-status-badge, order-status-timeline}.tsx` -- shared UI
- Menu browsing screens/types: not started yet — `packages/types/src/menu.ts` remains a placeholder.

## Related Context

- `process/context/all-context.md` -- overall repo structure and tech stack, §Current Implementation State for the Order-flow detail
- `process/features/ordering-cart/completed/checkout-flow_13-07-26/` -- CART-002 plan (Gate: PASS)
- `process/features/ordering-cart/completed/payment-method-screen_13-07-26/` -- payment-method screen plan (Gate: PASS)
- `process/features/ordering-cart/backlog/` -- real order API + payment-method enum divergence follow-ups

## Current Status

Status: in-progress (Cart + Checkout + Payment-method done; Menu browsing not started)

## Folder Contents

```
process/features/ordering-cart/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
