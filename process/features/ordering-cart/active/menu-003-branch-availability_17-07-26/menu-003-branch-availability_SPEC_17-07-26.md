---
name: spec:menu-003-branch-availability
description: "Requirements for hiding deals with unavailable components at a branch, rejecting orders for them, and reconciling deals correctly on reorder (MENU-003, issue #98)"
date: 17-07-26
feature: ordering-cart
---

# MENU-003 — Branch Availability: Hide Unavailable Deals and Reject Orders for Them

## Summary

Today, a customer can be shown a "Deal" (a bundle product like "Buy 1 Take 1 Fries") at a branch
even when one of the items that makes up that deal is out of stock there — and can even complete
an order for it, because the server never checks the deal's individual components before
accepting payment. Reorder makes this worse in the other direction: it currently treats every
past deal as unavailable, always, whether or not it's actually orderable today. This SPEC locks
the requirement to fix all three problems: a deal should only be shown at a branch when everything
it's made of is actually available there, the server must refuse to place an order for a deal
that isn't truly available, and reordering a past deal must check its real current availability
instead of always failing. This closes a real "customer paid, branch can't fulfill it" gap and a
real "reorder is broken for every deal" gap.

## User Stories / Jobs To Be Done

1. **As a customer browsing deals at a branch**, I want to see only deals the branch can actually
   fulfill right now, so that I don't get excited about a deal I can't actually get.
2. **As a customer who somehow still tries to order an unavailable deal** (stale app data, deep
   link, or a reorder from history), I want the app to stop me with a clear reason before I pay,
   so that I'm never charged for something the branch can't make.
3. **As a customer reordering a past order that included a deal**, I want the app to check whether
   that deal is still really available today — not just assume it isn't — so that deals I can
   still get are added to my cart, and deals I can't get anymore are flagged so I know, instead of
   either silently vanishing or silently going through.
4. **As a branch/staff user**, I want the app to automatically stop advertising a deal the moment
   one of its ingredients runs out, so that I don't have to manually pull the deal down myself.
5. **As the business**, I want it to be structurally impossible to complete an order for a deal
   with an unavailable component, so that this can never become a refund/complaint/trust problem.

## What The User Wants (Behavioral Outcomes)

- When a customer opens the Deals list for a branch, they only see deals where the deal itself
  AND every one of its components are currently available at that branch.
- A component only counts as "available" when it is both switched on for that branch AND not
  globally deactivated — a deactivated ingredient can't make a deal look available just because
  nobody remembered to also flip its per-branch switch off.
- The moment a branch marks one ingredient of a deal as unavailable, that deal disappears from
  that branch's deals list the next time the customer's app refreshes it (no app restart needed).
- The same deal keeps showing normally at any other branch where all its components are still
  available — this is a per-branch decision, not global.
- A deal a customer already has open (e.g. via a deep link, or a shared link) will not let them
  place an order if the deal has become unavailable in the meantime — they'll see the same
  "unavailable" outcome the list already reflects, not a broken screen.
- If an order is somehow attempted for a deal with an unavailable component (e.g. because the
  customer's app has a stale copy of the menu, or via reorder from history), the order is rejected
  with a clear reason — the customer is never charged.
- Reordering a past order that included a deal checks that deal's real, current availability at
  the order's branch — a deal that's still fully available today is added back to the cart like
  any other reorderable item; a deal that's no longer available (deal itself pulled, or missing a
  component) is called out as a conflict the customer has to acknowledge, not silently dropped and
  not silently placed.
- Regular (non-deal) products keep behaving exactly as they do today — this fix must not change
  anything about how normal menu items are shown or ordered.
- A deal with zero components attached (an admin data quality gap — not the everyday case) is
  treated as never orderable and is hidden everywhere, at every branch. See Constraints for the
  accepted trade-off of this decision.

## Flow / State Diagram

```
Customer opens Deals tab for Branch A
        │
        ▼
Server checks, for the candidate deal:
   - Is the deal itself available at Branch A?             ──NO──► not shown
   - Does the deal have at least 1 component?               ──NO──► not shown (see Constraints)
   - Is EVERY component available AND active at Branch A?   ──NO──► not shown
        │ YES to all
        ▼
   Deal appears in Branch A's Deals list
        │
        ▼
Customer taps deal → Deal Details screen
   (details come from the same already-fetched list — if the deal already isn't
    in the list, the details screen shows "Deal not found", no separate check needed)
        │
        ▼
Customer adds deal to cart, proceeds to Checkout → Place Order
        │
        ▼
Server re-checks at order placement (never trusts the client's cached copy):
   - Deal's own availability OK?              ──NO──► reject order, explain why, no charge
   - Every component's availability OK?       ──NO──► reject order, explain why, no charge
        │ YES to all
        ▼
   Order accepted, deal-product priced/added exactly like today
```

Branch-toggle live-update path:

```
Branch staff marks Component X unavailable (existing admin/staff availability toggle — unchanged)
        │
        ▼
Any deal that requires Component X drops out of that branch's Deals list
on the customer's next fetch (existing fetch-on-focus refresh pattern — no new refresh
mechanism needed; deals just start obeying the same availability signal products already do)
```

Reorder reconciliation path:

```
Customer taps "Reorder" on a past order that included a deal line
        │
        ▼
For each deal line in the past order, check the deal's REAL, CURRENT availability
at the order's branch (same all-components-available rule as the list view — not a
blanket "deals are never reorderable" assumption)
        │
        ├── Deal still fully available today ──► added to cart at today's price, like
        │                                          any other reorderable item
        │
        └── Deal no longer available (deal pulled, OR a component now unavailable)
                        │
                        ▼
             Surfaced as an explicit conflict row the customer must acknowledge
             before checkout — never silently dropped, never silently added
```

## Acceptance Criteria (Testable Outcomes)

1. A deal whose deal-product and every component are available (and active) at Branch A is
   listed in Branch A's Deals view.
   proven by: API integration test — GET branch menu with `isDeal=true`, all-available deal.
   strategy: Fully-Automated

2. Marking exactly one component of an already-listed deal unavailable at Branch A removes that
   deal from Branch A's Deals list on the next fetch — no other deals are affected.
   proven by: API integration test — toggle one component's availability row, re-fetch, assert
   deal absent while other listed deals remain.
   strategy: Fully-Automated

3. The same deal remains listed normally at Branch B where all of its components are still
   available, even while it is hidden at Branch A (per-branch isolation, not a global flag).
   proven by: API integration test — two-branch scenario, one component unavailable only at
   Branch A.
   strategy: Fully-Automated

4. Regular (non-deal) products that are unavailable at the selected branch remain hidden exactly
   as they do today — this fix causes zero behavior change to the existing product-availability
   filter.
   proven by: existing regression suite (`branches.test.ts` product-availability assertions) run
   unmodified and green; explicit no-diff check on the pre-existing filter code path.
   strategy: Fully-Automated

5. **(Hard AC — trust boundary, Known-Gap banned)** `POST /orders` rejects an attempt to place an
   order containing a deal-product whose deal-level or component-level availability at the target
   branch fails, with a response the client can turn into a clear customer-facing reason. No
   charge/order row is created for the rejected line.
   proven by: API integration test — attempt order placement for a deal with an unavailable
   component; assert rejection status, no order row written, and (for comparison) that the same
   deal succeeds when placed against a branch where it's fully available.
   strategy: Fully-Automated

6. A deal with 2+ components, where exactly one is unavailable, is excluded from the branch list —
   proving the check covers multi-component deals correctly, not just the 1-component case.
   proven by: API integration test — 2-component deal, one flipped unavailable, other still
   available; assert deal excluded.
   strategy: Fully-Automated

7. A deal with zero attached components is never listed at any branch, under any availability
   state.
   proven by: API integration test — zero-component deal, deal-product itself marked available at
   a branch; assert still excluded from that branch's list.
   strategy: Fully-Automated

8. A component that is available at the branch (its `branch_product_availability` row says so)
   but globally deactivated (`products.is_active = false`) does NOT count as available — a deal
   depending on it is excluded from the branch's list, and rejected at order placement, exactly as
   if the component were branch-unavailable.
   proven by: API integration test — component with `is_available = true` at the branch but
   `is_active = false` globally; assert deal excluded from list AND rejected at placement.
   strategy: Fully-Automated

9. **Reorder correctly reconciles deal lines against real, current availability — both
   directions:**
   - 9a. Reordering a past order whose deal line is STILL fully available today (deal + all
     components) adds that deal to the cart at today's price, the same as any other reorderable
     line — it is not skipped or flagged just because it's a deal.
   - 9b. Reordering a past order whose deal line is NO LONGER available today (deal pulled, or any
     one component now unavailable/inactive) surfaces that line as an explicit
     unavailable/conflict item the customer must acknowledge — it is never silently dropped from
     the cart, and never silently added in an unorderable state.
   proven by: `packages/utils` vitest unit tests against `reconcileReorder` (or its successor) —
   one case per direction, covering an available deal and an unavailable deal (both "deal itself
   pulled" and "component unavailable" sub-cases).
   strategy: Fully-Automated

10. Opening a deal that has become unavailable via a deep link/shared link does not let the
    customer reach an orderable state for it — it presents the same "not available" outcome the
    list view already reflects.
    proven by: this is a structural consequence of AC1–AC3 (the details screen derives from the
    same fetched list, not an independent fetch) plus AC5 as the final backstop if a customer
    somehow still attempts to submit; Agent-Probe walkthrough confirms the details screen shows a
    clear "not available" state rather than a broken/blank screen.
    strategy: Agent-Probe

## Out Of Scope

- Issue #103 (MENU-004) — a separate, later piece of work; not touched here.
- Any change to the legacy discount-model `deals`/`GET /deals`/`GET /deals/:id` routes, or the
  admin Deals/Offers/Promotions CRUD screens — these are a different, frozen surface untouched by
  this fix.
- Pricing, discount math, coupon logic, or eligibility windows for deals — unaffected.
- Any new admin-facing indicator that a deal is "invisible due to a component" or "invisible due
  to having zero components" (a parallel to the existing `availableBranchCount`/
  `activeBranchCount` admin fields). This is a real, accepted gap — and the zero-component-hide
  decision makes it sharper (an admin can create a componentless deal and get zero signal that it
  vanished everywhere) — but it does not block shipping the customer-facing correctness fix in
  this SPEC. PLAN must file a backlog note for it.
- Any change to how regular (non-deal) products are filtered for availability.
- Adding a DB-level constraint requiring a deal to have at least one component — the zero-
  component case is handled at the read/write level (hide/reject), not by preventing the data
  state from existing.

## Constraints

- **Locked decision — zero-component deals are hidden everywhere.** A deal with no attached
  `deal_components` rows must never appear at any branch, at any time, under this fix. This was an
  explicit user decision after being shown the trade-off against the alternative (showing it
  unconditionally). The accepted cost: if an admin creates a deal and simply forgets to attach any
  components, it will silently vanish from every branch's deals list with no error, no warning,
  and no indicator anywhere in the admin UI that this happened. This is a known, accepted gap for
  this pass — not something this SPEC's acceptance criteria attempt to soften.
- **Locked decision — component availability requires BOTH signals.** A component only counts as
  available when its `branch_product_availability.is_available = true` for that branch AND its
  `products.is_active = true` globally. This applies everywhere the "is every component
  available" check runs: the branch deals list, order placement, and reorder reconciliation. This
  keeps deal-component gating consistent with how the regular (non-deal) menu already treats
  `is_active`.
- The order-placement check (AC5) is a trust-boundary / money-safety requirement — it must be
  enforced server-side, unconditionally, and must never be satisfiable by anything the client
  sends. This AC may not be satisfied by Agent-Probe or manual-only verification.
- The existing, correct availability filter for regular (non-deal) products must remain
  byte-identical — this fix only adds new checks for the deal/component case, consistent with the
  precedent set by prior admin-dashboard work (ADM-004/ADM-008) of regression-locking untouched
  money/availability logic with an explicit no-diff check.
- This fix must not touch: `admin/deals.ts` CRUD, the legacy `GET /deals`/`GET /deals/:id` routes,
  `apply-deal.ts`/`eligibility.ts`/`use-deal-usage.ts` (old discount-model code), or the
  `deal_components` table's stated purpose as display/composition metadata beyond adding this one
  new availability read.
- **Reorder is in scope and its blast radius is explicitly widened by this SPEC.**
  `packages/utils/src/reorder.ts` (specifically `reconcileReorder`) and
  `apps/mobile/src/features/orders/hooks/use-reorder.ts` are no longer "must not touch" — they are
  required touchpoints for AC9. The reconciliation logic must be corrected to check a deal line's
  real, current availability (per the same all-components-available rule as the list view)
  instead of unconditionally treating every deal line as unavailable.
- **Production pre-flight check required before ship.** PLAN must include a step to count existing
  zero-component deals in production (or whatever the production-equivalent environment is) before
  this ships, so that the zero-component-hide decision doesn't silently disappear a real deal on
  release. The dev database currently has zero deals of any kind (verified live this session), so
  there is no dev-side risk — production is unverified and must be checked as part of PLAN, not
  assumed safe.
- Work lands on a new feature branch cut from `development` (not `main`, not an existing
  in-flight branch).

## Open Questions

None. All four questions raised during RESEARCH have been reviewed and resolved by the user; the
resulting decisions are recorded above in Constraints, Out Of Scope, and the Acceptance Criteria.

## Background / Research Findings

- **Read-path gap (confirmed):** `packages/api/src/routes/branches.ts:109-128` inner-joins
  `branch_product_availability` for the deal-product's own row only. `branches.ts:158-181`
  resolves `deal_components` for display via `inArray(dealComponents.deal_product_id,
  productIds)` with zero availability filtering on `componentProductId` — a deal shows its
  components in the response regardless of whether they're available.
- **Write-path gap (confirmed, the more important one):** `orders.ts:134-146` runs the identical
  bpa inner-join per cart line, and `orders.ts:166-169` throws 400 if the deal-product's own bpa
  row is missing — but component availability is never checked at order placement. An order can
  be placed today for a deal whose component is unavailable at that branch. Regular products are
  correctly checked at placement; deals are not.
- **`is_active` gap on the component check (confirmed, now locked as a requirement):** the
  deals-menu component join only checks availability by id, while the regular-menu path already
  enforces `products.is_active` too. The resolved decision requires the deal-component check to
  match the regular-menu path and enforce both signals — see Constraints.
- **Correct customer-facing surface confirmed:** `apps/mobile/src/features/deals/hooks/
  use-deal-products.ts:34` calls `getMenu(branchId, {isDeal:true})` → `GET
  /branches/:id/menu?isDeal=true`. (An earlier assumption in `all-context.md` that the Deals tab
  reads the old dormant `GET /deals` route is stale/incorrect — it doesn't.) The old-model
  `use-deals.ts`/`use-deal.ts` hooks are frozen and consumed only by the Home strip + cart coupon
  display, which are out of scope here.
- **Deep-link AC is a free structural consequence:** `(tabs)/deals/deal/[dealId].tsx:34` derives
  purely from the already-cached list query (`useDealProduct` in
  `use-deal-products.ts:54-63`) — it does not perform its own independent fetch. If a deal drops
  out of the list query, the details screen renders "Deal not found"
  (`[dealId].tsx:56-70`) automatically. No separate `GET /deals/:id` change is needed for this.
- **Reorder is a real bug, now in scope (previously assumed out of scope, user overrode):**
  `use-reorder.ts:38` calls `getMenu(order.branchId)` with no `isDeal` flag, so the regular menu
  structurally excludes all deals (`branches.ts:125`). `packages/utils/src/reorder.ts:66-103`
  (`reconcileReorder`) therefore flags every historical deal line `product_unavailable`
  unconditionally, regardless of whether the deal is actually still available — deals are simply
  never reorderable today, in either direction. The user decided to fix this properly in this
  plan rather than backlog it: reorder must check the deal's real current availability (same rule
  as the list/order-placement checks) instead of assuming every deal is unavailable. AC9 is the
  testable requirement; `reconcileReorder` is a pure function with an existing real `packages/utils`
  vitest runner, so this is Fully-Automated test surface, not Agent-Probe.
- **Schema facts:** `branch_product_availability` — composite unique on `(branch_id, product_id)`,
  `is_available` boolean defaulting true. `deal_components` — self-referential FK pair
  (`deal_product_id`, `component_product_id` → `products.id`, both NO ACTION), `quantity` int
  default 1, composite unique on the pair. The table's existing doc comment states these rows are
  "never read by pricing/cart/order-placement code" and are "metadata only" — this fix partially
  revises that intent by adding an availability read (not a pricing read); PLAN should update that
  doc comment to reflect the new, narrower scope of what "metadata only" still means.
- **Test surface is clean, no conflicting lock-in:** `branches.test.ts:142-166` seeds a
  1-component deal with both deal and component available; `branches.test.ts:237-276` asserts the
  regular menu excludes deals and the deals menu returns `components[]`. No existing test covers
  component-unavailable, zero-component, `is_active`-only-unavailable, placement-rejection, or
  reorder-reconciliation scenarios — this is genuinely new test surface, not a regression risk
  against existing coverage.
- **Dev-DB fact:** a live query against the dev database this session found zero deals of any kind
  currently exist there — so the zero-component-hide decision has no live data impact in dev.
  Production has not been checked; PLAN must include the pre-flight count (see Constraints).
- **Must-not-change list (confirmed by research, carried forward as a hard constraint):**
  `admin/deals.ts` CRUD, the legacy `GET /deals`/`GET /deals/:id` routes,
  `apply-deal.ts`/`eligibility.ts`/`use-deal-usage.ts` (old-model code), and the regular
  non-deal filtering paths in `branches.ts`/`orders.ts:134-146` — these must stay byte-identical,
  following the same snapshot-integrity regression-lock precedent established in the ADM-004 and
  ADM-008 admin-dashboard work. `packages/utils/src/reorder.ts` and
  `apps/mobile/src/features/orders/hooks/use-reorder.ts` are explicitly REMOVED from this
  must-not-change list — they are now required touchpoints (see Constraints).
