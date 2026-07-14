---
name: plan:order-history-reorder-api-spec
description: "Product-discovery SPEC for real API integration of Order History (#20 HIST-001) and Reorder (#21 HIST-002) — supersedes the mock-data-only order-history-reorder plan"
date: 13-07-26
feature: ordering-cart
---

# SPEC — Order History + Reorder, Real API Integration (HIST-001 / HIST-002)

## Summary

A customer should be able to open Order History and see their real past orders — not mock
data — with enough detail (branch, items, total, status, stars) to recognize what they ordered,
and tap "Reorder" to get those items back in their cart at today's prices and availability, not a
stale snapshot. Part of this already exists: the Order History screen was built against the real
backend by a separate, more recent piece of work than originally planned. This SPEC captures what
is *actually* still missing — three visible row fields on the list, and the entire Reorder feature
— so the team can review and confirm scope before anyone chooses how to build it.

## Context: this SPEC supersedes the prior plan

`process/features/ordering-cart/active/order-history-reorder_13-07-26/order-history-reorder_PLAN_13-07-26.md`
is **stale and superseded**. It was explicitly scoped "SCREENS ONLY, MOCK DATA ONLY —
`packages/api` OUT OF SCOPE," and it validated (Gate: PASS) but was never executed as written.
Reality diverged: a different, later piece of work wired the real Order History screen straight to
the real backend, skipping the mock-data plan entirely. That plan's mock dataset, mock
`MOCK_CURRENT_USER_ID` scoping, and `packages/types` `Order` shape (`branchId`/`starsEarned`
additive fields) were never built — the codebase instead already has a *different*, real `Order`
type and a working data layer. Building anything on top of the old plan would be building on a
shape that no longer exists. A later UPDATE PROCESS pass should formally archive the superseded
plan as `SUPERSEDED`; this SPEC does not modify it.

This SPEC covers the **opposite** scope from the superseded plan: real API integration, not mock
data.

## User Stories / Jobs To Be Done

1. **As a signed-in customer**, I want to see my own past orders and no one else's, so that my
   order history is private and accurate.
2. **As a customer reviewing my history**, I want each order to show which branch I ordered from,
   what I ordered, how much I paid, and its status, so I can recognize the order at a glance
   without opening it.
3. **As a customer who earns stars for orders**, I want to see how many stars I got from a
   completed order, so I can track my rewards progress. (Today the app cannot compute this yet —
   see Constraints/Open Questions for the honest interim behavior.)
4. **As a customer with a past order**, I want to tap "Reorder" and have those items added to my
   cart, so I don't have to rebuild the same order from scratch.
5. **As a customer reordering**, I want the price I'm charged to reflect today's menu, not what I
   paid last time, so I'm never surprised at checkout.
6. **As a customer reordering an item that's no longer available**, I want to be told clearly
   before I reach checkout, so I'm never charged for something I can't actually get.
7. **As a customer reordering a multi-choice item** (e.g. a specific size + flavor + add-ons), I
   want all my original choices carried over correctly, so reordering doesn't silently simplify or
   drop part of what I ordered.
8. **As a customer with zero past orders**, I want a clear "no orders yet" message instead of a
   blank or broken screen.

## What The User Wants (Behavioral Outcomes)

- Opening Order History shows a list of the signed-in customer's own orders, newest first, each
  showing at minimum: date, branch name, a summary of items ordered, total paid, order status, and
  stars earned (or an honest placeholder if stars aren't tracked yet).
- Zero orders shows a friendly empty state, not a blank list.
- A cancelled order always shows 0 stars earned, never a positive number.
- Every order row (except ones still in progress) shows a "Reorder" action.
- Tapping Reorder rebuilds a cart from that order's items, but priced and checked against **today's**
  menu — not the price the customer paid originally.
- If every item in the reordered order is still available today, the customer lands in their cart,
  ready to check out, with no extra interruption.
- If one or more items are no longer available (discontinued, or off the branch's current menu),
  the customer is shown exactly which items before anything is added to checkout — never silently
  dropped, never silently substituted.
- Multi-choice items (size, flavor, add-ons) reorder with every original choice intact, not just
  the base product.

## Flow / State Diagram

```
                    ┌───────────────────────────────┐
                    │   Customer opens Order History  │
                    └───────────────┬─────────────────┘
                                    │
                        GET real orders for this user
                                    │
                 ┌──────────────────┴───────────────────┐
                 ▼                                        ▼
        Zero orders                              One or more orders
                 │                                        │
        Empty state shown                    List, newest first, each row:
        ("No orders yet")                    date / branch / items summary /
                                              total / status / stars
                                                        │
                                          ┌─────────────┴─────────────┐
                                          ▼                             ▼
                                 order still in progress      order completed / cancelled
                                 (no Reorder shown)             (Reorder button shown)
                                                                          │
                                                                 tap "Reorder"
                                                                          │
                                                     Re-check every item against
                                                     TODAY's menu (availability + price)
                                                                          │
                                        ┌─────────────────────────────────┴───────────────────┐
                                        ▼                                                        ▼
                              all items available today                          one or more items unavailable
                                        │                                                        │
                          Cart populated at TODAY's prices                     Customer sees exactly which items
                          → customer lands in cart, ready                      are unavailable, before checkout
                            to check out                                       → explicit choice: continue with
                                                                                   only the available items, or
                                                                                   go back — nothing added silently
```

## Acceptance Criteria (Testable Outcomes)

### Order History list (HIST-001)

1. **Only the signed-in customer's own orders appear.**
   Already true today — the backend `GET /orders` route scopes every query to the caller's
   session user id; there is no cross-user leakage path.
   `proven by:` `packages/api/src/routes/__tests__/orders.test.ts` (session-boundary isolation
   coverage already exists per the ordering-flow test suite). `strategy:` Fully-Automated.

2. **Orders are sorted newest-first.**
   Already true today — `GET /orders` orders by `placed_at desc`.
   `proven by:` existing `orders.test.ts` coverage + manual confirmation of on-screen order.
   `strategy:` Hybrid.

3. **Each row shows the order's date and total.**
   Already true today — `history.tsx` renders `placedAt` (formatted) and `totalCents`.
   `proven by:` manual verification against a real placed order. `strategy:` Agent-Probe.

4. **Each row shows the order's status via the standard status badge.**
   Already true today — `OrderStatusBadge` renders `item.status` (the real 7-value
   `OrderStatus` enum).
   `proven by:` manual verification across at least 2 distinct statuses (e.g.
   `completed`, `cancelled`). `strategy:` Agent-Probe.

5. **Each row shows the branch the order was placed at, by name.**
   Not yet true — the row currently has no branch name at all; the API response only carries
   `branchId` (`ApiOrder.branchId`), no name. This needs a decision (see Open Questions) on
   whether the branch name is added to the order response or fetched separately.
   `proven by:` TBD — depends on the INNOVATE/PLAN decision for the resolution mechanism.
   `strategy:` TBD (expected Fully-Automated once implemented, given `packages/api` already has
   route-test coverage precedent).

6. **Each row shows a short summary of items ordered** (e.g. item names or count).
   Not yet true — the current row renders no item information at all, even though
   `ApiOrder.items[]` (with `productName`, `quantity`) is already returned by both `GET /orders`
   and `GET /orders/:orderId`.
   `proven by:` TBD — Agent-Probe at minimum (list is already available client-side, no backend
   change strictly required for a summary line, but see Open Questions on scope). `strategy:`
   Hybrid.

7. **Each row shows stars earned for that order, with cancelled orders always showing 0.**
   Not yet true, and not fully buildable today — the backend never accrues stars
   (`star_transactions` table exists in the schema but is never written to by any route; no order
   ever produces a stars value). This is a **known gap**, not a design choice this SPEC can close.
   The interim on-screen behavior (e.g. omit the row, show "—", or show a fixed placeholder) is an
   Open Question, not a decided requirement — see Open Questions.
   `proven by:` N/A for real accrual this pass — known-gap. If an interim display value is
   chosen, it needs its own Agent-Probe check that it never shows a nonzero value.
   `strategy:` Known-Gap (accrual) / Agent-Probe (interim display, once decided).

8. **Zero orders shows an explicit empty state.**
   Already true today — `history.tsx` renders `EmptyState` with a "Start an order" CTA when
   `orders.length === 0`.
   `proven by:` manual verification with a fresh account that has never ordered. `strategy:`
   Agent-Probe.

### Reorder (HIST-002)

9. **A "Reorder" action is available on completed and cancelled orders.**
   Not yet built — no reorder entry point exists anywhere in the app today.
   `proven by:` TBD (implementation-dependent). `strategy:` Hybrid.

10. **A "Reorder" action is NOT available on orders still in progress** (any status other than
    `completed`/`cancelled` — i.e. `pending`, `accepted`, `preparing`, `flavoring`, `ready`).
    `proven by:` TBD. `strategy:` Hybrid.

11. **Reordering rebuilds the cart against today's prices, not the historical snapshot.**
    The reconstructed cart line's price must reflect the CURRENT menu price for that product +
    options, not `ApiOrderItem.unitPriceCents` from the original order.
    `proven by:` TBD — should be a unit-testable comparison once the "current menu" lookup
    mechanism is chosen in INNOVATE/PLAN (this repo already has a precedent for pure-function unit
    tests on pricing logic, e.g. `use-cart.ts`'s `unitPriceFor`). `strategy:` expected
    Fully-Automated for the pricing math, Agent-Probe for the end-to-end screen behavior.

12. **Reordering rebuilds the cart against today's availability, not the historical snapshot.**
    An item that is no longer active, or no longer available at the reorder branch, must be
    detected before checkout — using the same availability rule the real menu already uses
    (`products.is_active = true` AND `branch_product_availability.is_available = true` for that
    branch), not a stale assumption from order-placement time.
    `proven by:` TBD. `strategy:` expected Fully-Automated for the availability-check logic,
    Agent-Probe for the end-to-end screen behavior.

13. **Unavailable items are surfaced explicitly before checkout — never silently dropped or
    silently substituted.**
    The customer must see which specific items are unavailable and make an explicit choice
    (continue with only the available items / go back) before anything reaches checkout.
    `proven by:` Agent-Probe (conflict-resolution UI walkthrough). `strategy:` Agent-Probe.

14. **All-available reorders proceed without unnecessary friction** — if every item in the order
    is still available, the customer is not forced through an extra confirmation screen before
    landing in their cart.
    `proven by:` Agent-Probe. `strategy:` Agent-Probe.

15. **Multi-option items (size + flavor + add-ons) reorder with every original choice intact,
    not just the base product.**
    `ApiOrderItem.selectedOptions` already carries the full original selection (`optionId`,
    `optionType`, `name`, `priceDeltaCents`) — reorder must reconstruct all of them, re-priced
    against today's option deltas, not drop any.
    `proven by:` TBD — unit-testable against a fixture with 2+ `selectedOptions` on one line.
    `strategy:` expected Fully-Automated.

## Out Of Scope

- Stars/rewards accrual — no order currently writes to `star_transactions`; implementing real
  accrual is a separate, larger backend effort (rewards ledger design, tier logic) not scoped
  here. This SPEC only asks for an honest interim *display* decision (see Open Questions).
- Coupon/deal application on a reordered cart — the existing cart has a coupon-apply UI that is
  currently disabled/hidden (no backend coupon support yet); reorder does not need to newly wire
  this.
- Live/online payment processing — unchanged; still visibly disabled, `online_payment` is
  rejected server-side.
- Push notifications or live/websocket order-status updates — unchanged; fetch-on-focus only.
- Option-level (not whole-item) unavailability — e.g. a specific flavor becoming unavailable while
  the base product stays orderable. Only whole-item availability is required to be checked; if a
  specific historical option is no longer offered, how that's surfaced is left to INNOVATE/PLAN as
  an extension of the same "flag before checkout" behavior, not a hard requirement of this pass.
- Any change to order *placement* (`POST /orders`), order tracking, or the existing checkout flow
  beyond a reordered cart landing in the existing cart/checkout screens.
- Any automated end-to-end/regression test harness for mobile navigation — this remains a known,
  project-wide gap (see Constraints) and is not something this SPEC asks to be solved.
- Archiving the superseded `order-history-reorder_13-07-26` plan — noted here for awareness, done
  by a later UPDATE PROCESS pass, not part of this SPEC's deliverable.

## Constraints

- **Money stays in cents everywhere.** No decimal-peso convention is to be reintroduced anywhere
  in this work (an earlier parallel branch briefly used decimal pesos and was explicitly rejected
  during a prior merge reconciliation).
- **Backend response-shape changes are an API-contract change.** If `GET /orders` / `GET
  /orders/:orderId` / `serializeOrder` gain new fields (e.g. branch name, item summary), that is a
  contract change on a route with existing automated test coverage
  (`packages/api/src/routes/__tests__/orders.test.ts`) — VALIDATE should give this its normal
  attention as a public-API-surface change. This SPEC does not decide the shape; it flags the
  surface.
- **No stars accrual mechanism exists.** Any acceptance criterion referencing "stars earned" for a
  real order cannot be proven end-to-end until accrual exists; the interim display behavior must
  be an explicit, reviewed decision, not an invented formula.
- **Reorder must re-derive availability using the same rule the real menu enforces** —
  `products.is_active = true` AND `branch_product_availability.is_available = true` for the
  specific branch — not a separate or looser rule.
- **No mobile-side (RN) automated test runner exists** for UI/screen behavior (`apps/mobile` has
  no Jest/Vitest/Detox). `packages/api` has vitest+supertest with real route coverage. Any
  acceptance criterion that depends on on-screen behavior is Agent-Probe unless the underlying
  logic (pricing, availability-checking, item reconstruction) is extracted into a plain, testable
  function — consistent with this repo's existing pattern (`use-cart.ts`'s pure pricing helpers).
- **Must reuse `@jojopotato/ui` shared components** — no one-off screen markup where an existing
  component (`Card`, `Badge`, `Button`, `OrderStatusBadge`, `EmptyState`) already fits.
- **The real cart seam is `useCart()`** (`apps/mobile/src/features/cart/hooks/use-cart.ts`,
  `Cart`/`CartItem`/`CartItemOption` from `packages/types/src/cart.ts`) — any reorder-population
  approach should drive this existing seam rather than inventing a parallel cart-write path,
  consistent with how the rest of the app populates the cart today.

## Open Questions

Each of these must be resolved by INNOVATE/PLAN. Under an interactive session these block
progression to PLAN; under `/goal` they are recorded as backlog notes and the run continues.

1. **How does the order list get the branch name?** Owner: INNOVATE. Options include: (a) extend
   `GET /orders`'/`serializeOrder`'s response to include a denormalized branch name, (b) have the
   client cross-reference the already-fetched branch list (`getBranches()`) by `branchId`, (c)
   fetch branch detail per order on demand. This is a genuine API-contract-vs-client tradeoff, not
   a style choice — flagged as a backend-surface note in Constraints.
2. **How does the order list get an items-ordered summary?** Owner: INNOVATE. `GET /orders`
   already returns full `items[]` per order (not just a count), so this may need no backend change
   at all — but rendering a summary line ("2x Classic Fries + 1 more") vs. full expansion is a UI
   decision, and whether the list-response's `items[]` payload is "heavy enough" to reconsider is
   a legitimate INNOVATE question, not decided here.
3. **What is the interim stars-earned display until real accrual exists?** Owner: INNOVATE, with
   explicit user sign-off recommended given it's user-facing. Candidate defaults: omit the stars
   row entirely until accrual exists, or show a static "—" / "0" placeholder. This SPEC explicitly
   does NOT recommend inventing a stars formula.
4. **Is reorder available on `completed` AND `cancelled` orders, or `completed` only?** Owner:
   INNOVATE. The GitHub issue AC literally says "reorder a completed order"; the previous
   (superseded) plan's own default was completed+cancelled. Worth an explicit decision rather than
   silently inheriting the old plan's default.
5. **How are now-unavailable items surfaced to the customer — a dedicated review screen, or
   inline flags directly in the cart after population?** Owner: INNOVATE. Both satisfy "never
   silently dropped"; the UX shape (extra screen vs. inline) is an implementation decision, not
   fixed by this SPEC.
6. **Does the availability/price re-check reuse the existing `getMenu()`/`useMenu()` react-query
   layer, or does reorder need a dedicated lookup (e.g. `GET /branches/:id/menu` by product id, or
   a new endpoint)?** Owner: INNOVATE. The existing menu data layer already encodes the correct
   availability rule; reusing it avoids a second source of truth, but its shape (grouped by
   category) may not be the most direct lookup for "is product X still available."

## Background / Research Findings

- **Order History is already real, partially.** `apps/mobile/src/app/(tabs)/order/history.tsx` is
  wired to `useOrderHistory()` → `fetchOrderHistory()` → `GET /orders` (session-gated,
  user-scoped, `placed_at desc`, cursor pagination). It renders `orderNumber`, `totalCents`
  (via `formatCurrency`), `placedAt` (formatted short date), and `OrderStatusBadge`. It has real
  loading (`ScreenLoader`), error (`ScreenMessage` with retry), and empty (`EmptyState`) states.
  It does NOT render branch name, an item summary, a stars-earned value, or a Reorder button — all
  four are net-new for this pass except stars (which is a known-gap, not a build gap).
- **The real orders data layer** is `apps/mobile/src/features/orders/{hooks/{use-order-history,use-order,use-checkout}.ts,lib/api-client.ts}`, built on the shared `apiRequest` fetch wrapper and the generic `useAsyncData` hook (fetch-on-mount, manual `refetch`, no react-query here — orders intentionally still uses the pre-existing plumbing while menu/branch data uses react-query; these are two coexisting, intentional patterns in this codebase, not a gap to unify).
- **Real backend response shape (`ApiOrder`, `packages/api/src/routes/lib/serializers.ts`):**
  `{ id, orderNumber, branchId, status, subtotalCents, discountTotalCents, totalCents,
  paymentMethod, paymentStatus, estimatedReadyAt, placedAt, items: ApiOrderItem[] }` where
  `ApiOrderItem = { productId, productName, quantity, unitPriceCents, totalPriceCents,
  selectedOptions: SelectedOption[] }`. Confirmed: **no branch name field** (only `branchId`), and
  **no stars field of any kind**. `GET /orders` and `GET /orders/:orderId` share this same
  `serializeOrder` function — both already return full `items[]`, not just a count.
- **`packages/types/src/order.ts`'s `Order`/`OrderItem` mirror `ApiOrder`/`ApiOrderItem` exactly**
  (same field names, cents-based) — this is the real, current type, distinct from and unrelated to
  the superseded plan's proposed `Order` extension (`branchId`/`starsEarned` as new additive
  fields onto a different, older `Order` shape that no longer exists in the codebase).
  `OrderStatus` is the real 7-value enum: `pending | accepted | preparing | flavoring | ready |
  completed | cancelled`.
- **`star_transactions` table exists in the Drizzle schema but nothing ever writes to it** —
  confirmed by grep: no `insert(starTransactions` (or equivalent) call anywhere in
  `packages/api/src`. Stars accrual is schema-ready but functionally a no-op today.
- **No reorder route or logic exists anywhere in the codebase** — confirmed no `reorder` path
  under `apps/mobile/src/app`, no reorder-related hook or lib file. This is fully greenfield.
- **What reorder can build on, already real and working:**
  - `GET /orders/:orderId` (via `fetchOrder(orderId)` / `useOrder(orderId)`) returns the full past
    order including every line's `selectedOptions` snapshot — everything needed to reconstruct a
    multi-option cart line.
  - The menu/branch data layer (`apps/mobile/src/lib/{api-client,query-client}.ts`,
    `getMenu()`/`useMenu()` in `features/menu/hooks/`) is real, react-query-backed, and already
    encodes the exact "current availability + current price" rule against
    `GET /branches/:id/menu` — this is the source of truth for "is this still orderable, and at
    what price."
  - The real cart seam is `CartSessionProvider`/`useCart()` (`features/cart/hooks/use-cart.ts`),
    backed by `packages/types/src/cart.ts`'s `Cart`/`CartItem`/`CartItemOption`. `addItem(menuItem,
    opts, qty, notes)` already recomputes `unitPriceCents` from the current `MenuItem.priceCents` +
    live option deltas at call time (`unitPriceFor`) — it never reuses a stale snapshot. This is
    the correct seam for reorder to drive, matching the existing app-wide convention.
- **Money convention:** cents everywhere in this backend, reconfirmed across `ApiOrder`,
  `ApiMenuProduct.basePriceCents`, `CartItem.unitPriceCents`. A prior parallel branch's
  decimal-peso convention was explicitly rejected during a merge reconciliation and must not be
  reintroduced.
- **Test infra reality** (`process/context/tests/all-tests.md`): `packages/api` has vitest +
  supertest with real coverage for orders (`routes/__tests__/orders.test.ts`) including
  session-boundary isolation. `apps/mobile` has zero test runner — verification there is
  typecheck + lint + manual/Agent-Probe walkthrough. No e2e/navigation harness exists project-wide
  (tracked backlog gap, not something this SPEC asks to fix).
- **Superseded plan's now-irrelevant design decisions** (for awareness only, not carried forward):
  its `MOCK_CURRENT_USER_ID` hardcoded-constant scoping trick, its `Order.branchId`/`starsEarned`
  additive-field proposal, and its `mock-order-history.ts`/`MOCK_PRODUCTS`-based availability
  simulation were all built against a mock `Order` shape that the real codebase never adopted —
  none of it should be reused or referenced by the real implementation.
