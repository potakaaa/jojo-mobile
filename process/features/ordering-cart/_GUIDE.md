# ordering-cart

<!-- Part of Jojo Potato -->

## Scope

Menu browsing, cart management, and checkout flow for the Jojo Potato mobile app. Covers menu
item display, cart state (add/remove/update quantity), price calculation, and the checkout
sequence leading up to order placement. Payments processor is not yet decided (see
`process/context/all-context.md`).

**Status as of 13-07-26: partially implemented.** The customer-facing menu → cart → checkout →
order-placement → confirmation/tracking/history flow is real and working end-to-end, delivered by
`process/general-plans/completed/pickup-order-flow_10-07-26/` (this plan lived in
`general-plans/` rather than this feature folder because it spanned both `ordering-cart` and
`pickup-branches` as one continuous flow — see that plan's Scope section).

**Done:** menu browsing (`GET /branches/:branchId/menu`), product size/flavor customization,
cart state (`CartProvider`/`useCart()` reducer), price calculation (server-recomputed cents,
never trusts client prices), checkout with `pay_at_branch`, order placement (`POST /orders`,
DB-unique `order_number`, correct `estimated_ready_at`), confirmation/tracking/history screens.

**Deferred / not yet done (future work, not a gap in what shipped):**
- Live `online_payment` processing — visibly disabled this pass, no processor chosen yet.
- Coupon redemption (`orders.discount_total` stays `0`).
- Automated mobile-side (RN) test coverage for the new cart/menu/checkout logic — see
  `process/context/tests/all-tests.md` §Known Gaps.

## Key Source Files

- `apps/mobile/src/app/(tabs)/order/` -- product detail, cart, checkout, confirmation, tracking, history screens
- `apps/mobile/src/features/{cart,menu,orders,shared}/` -- cart state, menu/order api-clients + hooks, shared fetch plumbing
- `packages/api/src/routes/orders.ts` + `routes/lib/{order-number,serializers}.ts` -- order placement/read API
- `packages/types/src/{order,cart,product-option}.ts` -- reconciled shared types (real 7-value `OrderStatus`, `SelectedOption`)
- `packages/ui/src/components/{order-status-badge,order-status-timeline,cart-item,flavor-selector,size-selector}.tsx` -- shared UI

## Related Context

- `process/context/all-context.md` -- overall repo structure and tech stack, §Current Implementation State
- `process/general-plans/completed/pickup-order-flow_10-07-26/` -- the plan, validate journey, and closeout report that delivered this

## Current Status

Status: partially-implemented (customer-facing flow done; payments/coupons/automated mobile tests deferred)

## Folder Contents

```
process/features/ordering-cart/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
