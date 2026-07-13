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

**Checkout-flow UI rework (CART-002 #18, `feat/checkout-flow` branch — reconciliation pending):**
this branch reworked Checkout, Payment-method selection (`order/payment-method.tsx` + shared
`payment-method-selector.tsx` with `PAYMENT_METHOD_LABELS`/`ICONS`), and Order Confirmation as
richer UI backed by **in-memory seams** (`useOrder()`/`mock-order.ts`). In the development merge,
this branch's screens were KEPT over development's backend-wired checkout/confirmation — wiring
them to the real `POST /orders` API is the tracked follow-up
(`backlog/checkout-real-order-api_NOTE_13-07-26.md`). App-side `PaymentMethod` intentionally
widens the DB enum (`backlog/payment-method-enum-divergence_NOTE_13-07-26.md`);
`env.onlinePaymentEnabled` gates selectable methods. Plans:
`completed/{checkout-flow_13-07-26,payment-method-screen_13-07-26}/`.

**Cart type/state layer superseded (13-07-26):** `pickup-order-flow`'s original `CartProvider`/
`useCart()` (`CartLine`-shaped, backed by `cart-totals.ts`) is no longer in the codebase. While this
branch was building `pickup-order-flow`, `development` independently shipped its own cart screen
(PR #62, this feature's own CART-001 plan — `process/features/ordering-cart/completed/cart-screen_09-07-26/`,
now archived as superseded, its own EXECUTE never ran on this branch). When the branches merged, the
user chose development's `Cart`/`CartItem`/`CartItemOption`/`AppliedDiscount`/`CartSessionProvider`
model as canonical and this branch's real backend wiring was ported onto it — see
`process/general-plans/completed/merge-cart-reconciliation_13-07-26/` for the full merge-resolution
plan, the branch-switch regression it caught and fixed (Findings F1/F5), and its closeout report.
The order-placement backend (API routes, `order_number`, pricing, transactions) described below is
**unchanged** — only the cart's own type/state seam changed shape.

**Menu/branch data layer superseded (13-07-26):** while this branch built its own plain
`useEffect`/`useState` menu/branch hooks, `development` independently shipped a parallel menu
feature (its own SPEC/plan — `process/features/ordering-cart/completed/menu-product-browsing_10-07-26/`,
now archived as superseded) built on **react-query** and a **decimal-peso** backend
(`packages/api/src/routes/menu.ts`, discarded/never mounted). The user chose to keep this branch's
cents backend + real order-placement as canonical, adopt react-query retargeted onto the cents
backend, and adopt development's menu UI components — see
`process/general-plans/completed/merge-menu-api-reconciliation_13-07-26/` for the full
merge-resolution plan and closeout report. `packages/types/src/menu.ts` is no longer a
placeholder — it now has real cents-native catalog types (`Product`, `ProductOption`, `Category`,
`ProductDetail`, `MenuResponse`). `features/branches/` no longer exists (replaced by
`features/branch/hooks/use-branch.ts`'s `BranchProvider`).

**Done:** menu browsing (`GET /branches/:branchId/menu`), product size/flavor customization,
cart state (`CartSessionProvider`/`useCart()`, `Cart`/`CartItem`-shaped — see superseded note
above), price calculation (server-recomputed cents, never trusts client prices; cart-side totals
now derived inside the hook itself, `cart-totals.ts` deleted), checkout with `pay_at_branch`, order
placement (`POST /orders`, DB-unique `order_number`, correct `estimated_ready_at`),
confirmation/tracking/history screens.

**Deferred / not yet done (future work, not a gap in what shipped):**
- Live `online_payment` processing — visibly disabled this pass, no processor chosen yet.
- Coupon redemption — a coupon-apply UI exists in the merged cart screen but is disabled/hidden
  (`orders.discount_total` stays `0`, no backend coupon support yet).
- Cart line-item product images — accepted cosmetic known-gap since the merge (`imageUrl:
  undefined`; `CartItem` renders a placeholder), see `merge-cart-reconciliation_13-07-26`'s Test
  Infra Improvement Notes for the follow-up options.
- Automated mobile-side (RN) test coverage for the new cart/menu/checkout logic — see
  `process/context/tests/all-tests.md` §Known Gaps.

## Key Source Files

- `apps/mobile/src/app/(tabs)/order/` -- product detail, cart, checkout, confirmation, tracking, history screens
- `apps/mobile/src/lib/{api-client,query-client}.ts` -- global react-query client + branch/menu fetchers
- `apps/mobile/src/features/{cart,menu,orders,shared}/` -- cart state, menu hooks/components (react-query-backed), order api-client + hooks, shared fetch plumbing (`api-request.ts`/`use-async-data.ts` carved out for `orders/`, not deleted)
- `packages/api/src/routes/orders.ts` + `routes/lib/{order-number,serializers}.ts` -- order placement/read API
- `packages/types/src/{order,cart,menu,product-option}.ts` -- reconciled shared types (real 7-value `OrderStatus`, `SelectedOption`, cents-native menu catalog types)
- `packages/ui/src/components/{order-status-badge,order-status-timeline,cart-item,flavor-selector,size-selector,addon-selector}.tsx` -- shared UI
- `packages/utils/src/product-options.ts` -- unit-agnostic required-option-selection helpers

## Related Context

- `process/context/all-context.md` -- overall repo structure and tech stack, §Current Implementation State (incl. "Cart architecture (superseded)")
- `process/general-plans/completed/pickup-order-flow_10-07-26/` -- the plan, validate journey, and closeout report that delivered the backend-wired ordering flow
- `process/general-plans/completed/merge-cart-reconciliation_13-07-26/` -- the plan that reconciled development's independently-shipped cart (PR #62) with this flow's real backend wiring; current canonical cart architecture
- `process/features/ordering-cart/completed/cart-screen_09-07-26/` -- this feature's own CART-001 plan, archived as superseded (its requirements were fulfilled by development's PR #62 + the merge reconciliation, not by executing this plan itself)
- `process/general-plans/completed/merge-menu-api-reconciliation_13-07-26/` -- the plan that reconciled development's independently-shipped menu/branch feature (react-query, decimal-peso API) with this flow's real cents backend; current canonical menu/branch data layer
- `process/features/ordering-cart/completed/menu-product-browsing_10-07-26/` -- this feature's own MENU-001/MENU-002 plan, archived as superseded (its react-query/UI intent was fulfilled by adopting it onto the real backend via the merge reconciliation, not by executing this plan itself)

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
