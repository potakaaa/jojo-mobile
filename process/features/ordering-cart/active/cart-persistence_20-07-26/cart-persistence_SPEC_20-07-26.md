---
name: plan:cart-persistence
description: "Requirements doc for CART-003 (#99) — persist the shopping cart server-side so it survives app restarts, sign-out/in, and device switches"
date: 20-07-26
feature: ordering-cart
---

# SPEC: Persist Cart Server-Side (CART-003, GitHub #99)

## Summary

Right now the shopping cart lives only in the app's memory. If the app is force-quit, the phone
restarts, or the customer signs in on a different device, the cart is gone — every item has to be
re-added from scratch. This project makes the cart a real, saved thing tied to the customer's
account: add an item on one device, and it's still there (with the same options and quantities)
the next time they open the app, on any device, even after signing out and back in. The screens
customers already use (cart, checkout, product pages) will not look or feel different — this is a
behind-the-scenes durability upgrade, not a redesign.

## User Stories / Jobs To Be Done

- **As a customer**, I want my cart to survive closing the app, so that I don't lose my order when
  I get interrupted (a call, switching apps, phone restart) before I check out.
- **As a customer**, I want my cart to still be there after I sign out and back in, so that I don't
  have to remember and re-add everything.
- **As a customer who uses more than one device** (e.g. phone and a family member's phone, or after
  getting a new phone), I want to see the same cart wherever I'm signed in, so that my order isn't
  tied to one piece of hardware.
- **As a customer**, when I switch pickup branch, I want a clear, predictable outcome for items my
  new branch can't make, so that I'm never surprised by stale or unorderable items at checkout.
- **As a customer**, if something in my cart changed since I added it — the price went up, or the
  item is no longer available — I want to be told clearly instead of being charged the old price or
  having my order silently fail.
- **As the business**, I want to guarantee a customer can never see or change another customer's
  cart, so that order data stays private and correct.

## What The User Wants (Behavioral Outcomes)

- Adding an item to the cart, changing its quantity, or removing it is saved immediately — not just
  held in the app's memory.
- Force-quitting the app (or the phone dying, or reinstalling and signing back in) and reopening the
  app shows the exact same cart: same items, same selected options (size/flavor/add-ons), same
  quantities, same totals.
- Signing out and signing back in on the same phone shows the same cart.
- Signing in with the same account on a second device shows the same cart the first device has.
- The customer can add, change the quantity of, remove, and clear items, and each action is
  reflected the next time the cart is viewed — from any device.
- The cart behaves the same as it does today for one thing: it belongs to one branch at a time.
  Switching to a different pickup branch is handled by one clear, documented rule (rather than
  silently keeping items the new branch cannot make) — the exact rule is being decided in the next
  phase (INNOVATE) and will be confirmed with the user before it's built.
- If something in the cart is no longer valid by the time the customer looks at it again — the item
  became unavailable at that branch, or its price changed — the customer sees this clearly (as a
  flagged/conflicted item) rather than the app silently letting them order something it can't
  fulfill, or charging a price that's gone stale.
- Checking out still works exactly as it does today from the customer's point of view: review cart
  → checkout → order placed → confirmation. The order the customer places is still checked and
  priced by the server at the moment of placing it — the saved cart never overrides that.
- No visible change to any other feature (deals, coupons/discounts as they exist today, order
  history, product browsing).

## Flow / State Diagram

**Happy path — cart persists across sessions and devices:**

```
[Customer adds item to cart on Phone A]
        |
        v
  Cart is saved to the customer's account (not just Phone A's memory)
        |
        v
  [Customer force-quits app / signs out / switches to Phone B]
        |
        v
  [Customer reopens app / signs back in / opens app on Phone B]
        |
        v
  App loads the saved cart for this account
        |
        v
  Cart shown: same items, options, quantities, totals   <-- OBSERVABLE OUTCOME
        |
        v
  Customer proceeds to checkout -> places order (unchanged flow)
```

**Cart re-validation on view (price/availability drift):**

```
[Customer opens cart screen]
        |
        v
  App checks each saved item against current branch menu
        |
   +----+----------------------+
   |                           |
still available,          item unavailable OR
same price                 price changed
   |                           |
   v                           v
shown normally          shown as a flagged/conflicted
                         item; customer must acknowledge
                         or resolve before checkout
                         (mirrors existing reorder-conflict
                          pattern already used elsewhere)
```

**Branch switch (rule to be finalized in INNOVATE, shape shown here):**

```
[Customer has items in cart for Branch A]
        |
        v
  [Customer selects Branch B]
        |
        v
  Documented rule applies (exact mechanics decided in INNOVATE):
  either the cart is cleared for the new branch,
  or items are re-checked against Branch B and
  incompatible ones are flagged/removed with the customer told why.
        |
        v
  Customer is never left with items silently carried over
  that Branch B cannot fulfill.
```

**Ownership boundary (every request):**

```
[Any cart read/write request] --> [Who is signed in?] --> [Only that customer's cart is touched]
                                          |
                                    someone else's cart id?
                                          |
                                          v
                                     Rejected (not visible, not editable)
```

## Acceptance Criteria (Testable Outcomes)

1. **Cart survives an app restart.** Adding items, force-quitting the app, and reopening it shows
   the same items, options, quantities, and totals.
   `proven by:` new API integration test (create cart via API calls, simulate a fresh app load by
   re-fetching with no client cache) + Agent-Probe on-device restart walkthrough.
   `strategy:` Hybrid.

2. **Cart survives sign-out then sign-in on the same device.** Signing out and back in restores the
   same cart.
   `proven by:` API integration test (cart persists across two separate authenticated sessions for
   the same user) + Agent-Probe walkthrough.
   `strategy:` Hybrid.

3. **Cart is visible across devices for the same account.** Signing in with the same account on a
   second device (or a second simulated session) shows the same cart contents.
   `proven by:` API integration test asserting two independent sessions for the same user resolve
   to the identical cart state.
   `strategy:` Fully-Automated.

4. **A customer cannot read or modify another customer's cart.** Any attempt to access or mutate a
   cart that isn't the signed-in user's own is rejected.
   `proven by:` API integration test — cross-user read/write attempts return a rejection (403), not
   another user's data.
   `strategy:` Fully-Automated.

5. **Add / update-quantity / remove / clear each persist correctly.** Every one of the four cart
   mutations, once performed, is reflected on the next fetch of the cart — including from a
   simulated "different session."
   `proven by:` API integration tests, one case per mutation type, each followed by a fresh-fetch
   assertion.
   `strategy:` Fully-Automated.

6. **Switching branch never leaves an unfulfillable cart.** After selecting a different pickup
   branch, the documented switch rule has been applied — no item incompatible with the newly
   selected branch remains silently orderable.
   `proven by:` API/unit test locking the chosen rule's exact behavior (exact test shape depends on
   the rule INNOVATE picks) + Agent-Probe walkthrough for the on-screen experience.
   `strategy:` Hybrid.

7. **An item that became unavailable is flagged, not silently kept.** If a cart item's product is
   no longer available at the selected branch by the time the cart is viewed, it is surfaced as a
   conflict rather than treated as normally orderable.
   `proven by:` API integration test (mark a cart item's product unavailable at the branch, then
   fetch the cart and assert a conflict flag is present) — mirrors the existing MENU-003
   availability-check pattern.
   `strategy:` Fully-Automated.

8. **A cart item reflects the live price, and placed orders still snapshot correctly.** If a
   product's price changes after it was added to a saved cart, the cart shows the current price;
   separately, an order that has already been placed keeps the price it was placed at (never
   retroactively changes).
   `proven by:` two API integration tests — one asserting the cart reflects a live price change,
   one regression test locking the existing order-snapshot invariant (the same invariant already
   proven by the ADM-003 test) still holds when the source of the order is a persisted cart.
   `strategy:` Fully-Automated.

9. **Checkout from a persisted cart still places a correct order end-to-end.** Building a saved
   cart, then checking out, produces an order with the correct items and totals — no regression
   versus today's checkout flow.
   `proven by:` API integration test (full add-to-cart → place-order round trip against the new
   persisted-cart path) + Agent-Probe checkout walkthrough on-device.
   `strategy:` Hybrid.

10. **All existing and new automated tests pass together.** The full `packages/api` test suite
    (existing + new cart tests) passes with the new database migration applied, and the
    `apps/mobile` suites covering the cart hook pass with no regressions to existing consumers of
    `useCart()`.
    `proven by:` full `packages/api` vitest run + `apps/mobile` vitest/jest run as part of the
    EXECUTE gate.
    `strategy:` Fully-Automated.

## Out Of Scope

- **Redesigning any screen.** The cart, checkout, and product screens keep their current look and
  navigation — this is a state/data-layer change behind the existing `useCart()` seam, not a UI
  rewrite.
- **Changing how `POST /orders` decides pricing.** Order placement stays server-authoritative;
  the persisted cart is an input to placing an order, never a second source of truth for price.
- **Coupons/discounts beyond what exists today.** `AppliedDiscount` (deal/coupon/reward) gets a
  storage shape as part of this work, but no new discount *mechanics* are introduced — the
  existing deal-apply and coupon-apply behavior is preserved as-is.
- **Payment method persistence.** Whether the selected payment method should also survive
  app-restart is a separate, not-yet-scoped question (see the standing `payment-method-enum
  -divergence` backlog note) — this project only persists the cart contents, not payment selection.
- **Guest / unauthenticated carts.** Persistence is per signed-in account only. There is no
  requirement here for an anonymous visitor's cart to be saved before they sign in.
- **Multi-cart / saved-for-later / wishlist features.** One active cart per user only — no
  concept of multiple named carts or a separate "saved items" list.
- **Real-time cross-device sync (websockets/push).** If a customer adds an item on Device A while
  Device B has the cart screen open, Device B is not required to update live — the existing
  fetch-on-focus/refetch convention used elsewhere in the app is sufficient; there is no
  requirement for live push-based sync between simultaneously open sessions.
- **Star/rewards accrual, deal eligibility rules, or menu/branch data changes.** Those systems are
  consumed as-is; this project does not modify them.
- **A new admin-side view of customer carts.** No admin UI or admin API surface is added for this
  work.

## Constraints

- **`useCart()` stays the only seam screens use.** Every screen currently consuming `useCart()`
  (cart, checkout, product detail, home add-to-cart bar, etc.) must not need to change how it calls
  the hook — this is a state-layer swap behind an existing, stable API, not a screen-by-screen
  rewrite.
- **Session-gated, matching the existing pattern.** Cart endpoints must sit behind the same
  session-auth middleware pattern already used for `orders`/`branches` (`requireSession`) — not the
  role-gated staff pattern, which is unrelated here.
- **Money stays cents-native in the app boundary,** consistent with the rest of the API (the DB
  storage representation — decimal vs. integer — is an INNOVATE/PLAN decision, not locked here).
- **One active cart per user.** The system must guarantee a user never has two simultaneously valid
  carts to reconcile between.
- **`POST /orders`'s existing contract is not broken.** Whatever the cart's new persisted shape is,
  order placement must still work, and remains the authority on final pricing and eligibility
  checks (deal windows, branch availability, discounts) — the persisted cart never bypasses those
  checks.
- **Availability and price re-validation happens at read time**, using the same kind of "check
  once, on both read and write" approach already established by MENU-003's
  `resolveAvailableDealProductIds` pattern, so the cart screen and order placement can never
  disagree about what's actually orderable.
- **Failed mutations must not show a phantom item.** If an add/update/remove/clear request to the
  server fails, the customer-visible cart must not be left showing a state that was never actually
  saved.
- **No automated RN/E2E runner exists for `apps/mobile`.** As with every other on-device UX in this
  codebase, cart-screen-level and cross-device on-device behavior verification is Agent-Probe
  (manual) — this project cannot claim automated coverage for what the customer visually sees on
  screen, only for the underlying API and hook logic.

## Open Questions

The following are real open decisions carried forward from RESEARCH. They do not block writing
this SPEC (the *what* is unambiguous — persist the cart, one per user, private, re-validated at
read time), but they DO need to be resolved before PLAN, because they shape the technical approach.
Owner for all seven: **INNOVATE** (next phase) — each should be resolved as part of choosing the
implementation approach, with the user confirming the choice.

1. **`POST /orders` payload contract.** Does the client keep assembling the order-placement payload
   from its cart cache exactly as it does today, or does order placement start reading the
   persisted cart directly server-side? (Owner: INNOVATE)
2. **Branch-switch rule, exact mechanics.** Today's client-only behavior clears the cart on branch
   mismatch. Does the persisted version keep that same "clear on switch" behavior, or should it
   re-validate/stash items instead? (Owner: INNOVATE — user confirmation required before PLAN)
3. **One-cart-per-user enforcement mechanism.** Database unique constraint vs. an application-level
   "always find-or-create" convention — needs a concrete decision. (Owner: INNOVATE)
4. **Cart money storage representation.** Follow the rest of the DB's existing decimal-with-cents
   -at-the-boundary convention, or introduce integer-cents columns for cart tables specifically?
   (Owner: INNOVATE)
5. **`AppliedDiscount` (deal/coupon/reward) storage shape.** Denormalized columns on a `carts` row
   (mirroring how `orders.deal_id`/`orders.coupon_id` already work), or a separate table? (Owner:
   INNOVATE)
6. **Optimistic-update mechanics.** There is no existing precedent for optimistic updates with
   rollback anywhere in this codebase — this needs a genuine design decision (what the UI shows
   immediately vs. what happens if the server rejects the mutation). (Owner: INNOVATE)
7. **Exact next migration number.** Not a product decision — flagged so PLAN/EXECUTE re-verifies
   against the live migration journal rather than assuming a number now, since this repo's
   migration numbering has been renumbered multiple times during past branch merges. (Owner: PLAN/
   EXECUTE, mechanical only)

## Background / Research Findings

- **Current state:** the cart is 100% client-only and in-memory —
  `apps/mobile/src/features/cart/hooks/use-cart.ts` (`CartSessionProvider`/`useCart()`, backed by
  plain `useState<Cart>`). Its own doc comment explicitly deferred persistence to a
  never-built "CART-002" (a naming collision with this repo's real, already-shipped CART-002 —
  the checkout-flow rework — not the same thing).
- **No `carts`/`cart_items` tables exist yet.** 23 schema files were checked; the latest migration
  is `0016_rename_offer_fk_constraints.sql`. The exact next migration number must be re-verified at
  EXECUTE time against `packages/api/drizzle/meta/_journal.json` — this repo's migration numbering
  has shifted multiple times across recent merges.
- **`packages/types/src/cart.ts`'s existing types** (`Cart`, `CartItem`, `CartItemOption`,
  `AppliedDiscount`) already mirror the `order_items` snapshot shape (their own doc comments say
  so) — this is a strong signal the new DB tables should model these types closely rather than
  invent a new shape. `AppliedDiscount` (`source: 'coupon'|'deal'|'reward'`, `refId`, `label`,
  `amountCents`) has no existing DB representation anywhere — genuinely new modeling territory.
- **Money convention today:** the DB stores money as `numeric(10,2)` (decimal) everywhere, converted
  to cents at the API boundary via `numericToCents`/`centsToNumeric`
  (`packages/api/src/routes/lib/serializers.ts`). `packages/types` itself is cents-native
  throughout. Whether new cart tables follow the decimal-in-DB convention or diverge is an
  INNOVATE decision, not decided by this research.
- **Session-auth pattern to reuse:** `requireSession`
  (`packages/api/src/middleware/require-session.ts`) — the same middleware `orders.ts` and
  `branches.ts` already use. This is explicitly NOT the staff `requireStaff`/branch-scope chain,
  which is role-gated and irrelevant to a customer-owned cart.
- **`POST /orders` today** receives the cart directly from the client as a payload
  (`{branchId, paymentMethod, items:[...], couponCode?, dealId?}`), assembled ad hoc in
  `checkout.tsx` from live `useCart()` state (`packages/api/src/routes/orders.ts:37-56`). Whether
  this payload contract is preserved unchanged (client still assembles it, now from a persisted-
  cart-backed cache) or the server starts reading the persisted cart directly is Open Question #1.
- **Direct precedent for read-time re-validation (AC7):** MENU-003's
  `resolveAvailableDealProductIds` (`packages/api/src/routes/lib/deal-availability.ts`) — a single
  shared function used on BOTH the read path (menu listing) and the write path (order placement),
  so the two paths can never disagree. This SPEC expects the same "one function, two call sites"
  shape for cart availability re-validation, though the concrete design is INNOVATE's job.
- **Direct precedent for surfacing conflicts instead of silently dropping items (AC6/AC7):**
  HIST-002's reorder-conflict pattern (`apps/mobile/src/features/orders/hooks/
  use-reorder-conflicts.ts`, `packages/utils/src/reorder.ts`) — flags now-unavailable items as
  inline conflict rows that block checkout until acknowledged, never silently dropped. This is the
  established UX precedent this SPEC's AC6/AC7 draw from.
  vs. an updated cache with no rollback design). This is genuinely new design ground for this
  codebase.
- **React-query hook convention to follow:** `useBranch()`
  (`apps/mobile/src/features/branch/hooks/use-branch.ts`) — a Context wrapping `useQuery` for reads
  plus `useMutation`s for writes, exposing a stable public hook surface. This SPEC's constraint that
  `useCart()`'s public shape must not change for existing screen consumers is grounded in this
  being achievable (the hook internals can be swapped, the exported API stays the same).
- **Snapshot-integrity precedent this work must not regress (AC8):** the ADM-003 test proving that
  editing a product's price after an order was placed never mutates that order's already-recorded
  `order_items.unit_price`/`total_price`. This SPEC's AC8 requires this invariant to keep holding
  even when the order's source is a persisted cart, not a freshly-built client-side one.
- **Test convention to follow:** hermetic self-seeding fixtures per test file (local
  `makeUser`/`makeBranch`/`makeProduct` helpers inside `beforeAll`), matching
  `orders.test.ts`/`branches.test.ts` — this SPEC expects new cart tests (AC1-AC10) to follow the
  same convention, per `process/context/tests/all-tests.md`'s documented `packages/api` vitest +
  supertest pattern.
- **Backlog notes checked, none blocking:** `checkout-real-order-api_NOTE_13-07-26.md` (already
  DELIVERED — confirms the current client-assembles-payload order-placement flow described above);
  `stars-accrual-and-history-display_NOTE_13-07-26.md` (unrelated to cart persistence);
  `payment-method-enum-divergence_NOTE_13-07-26.md` (tangential — only relevant if payment-method
  selection is later added to persistence scope, which this SPEC explicitly excludes).
- **User's original request (GitHub issue #99, CART-003, P0):** verbatim summary and acceptance
  criteria are reproduced in full at the top of this SPEC's Acceptance Criteria and Summary
  sections — see the orchestrator's task prompt for the issue's original wording, which this SPEC
  restates in its own structure without altering intent.
