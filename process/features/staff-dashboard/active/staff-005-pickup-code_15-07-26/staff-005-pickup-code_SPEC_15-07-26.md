---
name: spec:staff-005-pickup-code
description: "Product-discovery SPEC for STAFF-005/PUP-002 — pickup code generation and staff-side validation"
date: 15-07-26
feature: staff-dashboard
phase: "STAFF-005"
---

# STAFF-005 (PUP-002): Pickup Code Generation and Staff-Side Validation — Product Requirements

**GitHub Issue**: #35 (PUP-002)
**Priority**: P1
**PRD references**: §6.13 (Staff Requirements — "Staff should be able to scan or enter pickup code")
**Date**: 2026-07-15
**Status**: SPEC (pre-plan)

---

## Summary

Today, when a customer places a pickup order, they already see a short order number on their
confirmation and tracking screens ("Show this number at the counter"). What's missing is the
staff side: when a customer walks up to the counter and says their number out loud, staff
currently have no dedicated way to find that order except by scrolling the Active Orders list
looking for a match. This feature gives staff a simple "enter pickup code" lookup so they can
type the number a customer gives them and jump straight to that order — scoped to their own
branch, and clearly telling them if the order was already picked up or doesn't belong to their
branch. No new codes, no new hardware, no scanning — just a fast, reliable way to turn "the
customer said JP-260715-4821" into "here's their order, ready to hand over."

---

## User Stories / Jobs To Be Done

**US-1 — Customer sees their pickup code without any change**
As a customer, I want my pickup code to be clearly visible on my order confirmation and
order-tracking screens, so that I know what to say or show at the counter.

**US-2 — Staff finds an order by typing the code a customer gives them**
As a branch staff member, I want to type in a pickup code and immediately see the matching
order for my branch, so that I don't have to scroll through the Active Orders list searching
for it.

**US-3 — Staff is protected from mixing up branches**
As a branch staff member, I want a pickup code that belongs to another branch's order to come
back as "not found," so that I never accidentally access or act on an order that isn't mine.

**US-4 — Staff is warned before double-completing an order**
As a branch staff member, I want to be told clearly if a pickup code has already been
completed, so that I don't accidentally try to hand out an order a second time or trigger a
duplicate reward.

---

## What The User Wants (Behavioral Outcomes)

- Every pickup order a customer places already has a short, human-speakable code attached to
  it (the existing order number format, e.g. `JP-260715-4821`). No behavior changes here except
  confirming/tightening the "show this at the counter" messaging if needed.
- From the staff dashboard, there is a place to type in a pickup code and search for it.
- If the code matches an order at the staff member's own assigned branch, the app takes them
  straight to that order's details, where they can review it and mark it as picked up (this
  "mark as picked up" action and its rules already exist today — this feature is only about
  finding the order, not changing what happens after it's found).
- If the code does not match any order at the staff member's branch — whether because it
  belongs to a different branch or doesn't exist at all — the app tells them plainly that no
  matching order was found for their branch. It never reveals that the code belongs to someone
  else's branch.
- If the code matches an order that has already been completed (picked up), the app tells the
  staff member the order was already picked up, rather than letting them attempt to complete it
  again or navigate as if it still needs action.
- Nothing about this feature introduces camera/barcode scanning — typing the code in is the
  supported path for this release.

---

## Flow / State Diagram

```text
CUSTOMER SIDE (already true today — confirm, no rework expected)
  Checkout complete
        |
        v
  Order Confirmation screen  ---- shows pickup code prominently ---->  customer notes/remembers code
        |
        v
  Order Tracking screen  ---- also shows the same pickup code ---->  customer can re-check anytime


STAFF SIDE (new)
  Staff opens "Enter Pickup Code" entry point
        |
        v
  Staff types a code and submits
        |
        v
  Lookup against staff member's own assigned branch only
        |
        +--> Code matches an order at MY branch, order NOT yet completed
        |        |
        |        v
        |    Order Details screen for that order
        |        |
        |        v
        |    Staff reviews + taps "Mark Picked Up" (existing action, existing rules apply)
        |
        +--> Code matches an order at MY branch, order ALREADY completed
        |        |
        |        v
        |    "Already picked up" message shown — no re-completion allowed, no navigation
        |    to an actionable state
        |
        +--> Code does not match any order at MY branch
                 (covers: wrong branch's code, or code does not exist at all)
                 |
                 v
             "Not found for your branch" message shown — identical message in both cases
```

---

## Acceptance Criteria (Testable Outcomes)

1. **Every order has a visible pickup code immediately after checkout.**
   Every order a customer places has a non-empty, unique, human-speakable pickup code that is
   clearly visible on the Order Confirmation screen right after checkout.
   proven by: existing/extended confirmation-screen check (Agent-Probe — no RN test runner exists
   project-wide) + a Fully-Automated backend check that every created order has a non-empty,
   unique `order_number`.
   strategy: Hybrid.

2. **The same pickup code is visible on order tracking.**
   A customer can return to the Order Tracking screen at any time and see the same pickup code
   they saw at checkout.
   proven by: Agent-Probe walkthrough (no RN test runner exists project-wide).
   strategy: Agent-Probe.

3. **Staff can look up an order by typing its pickup code.**
   A staff member can enter a pickup code and, when it belongs to an order at their own branch,
   is taken to that order's details.
   proven by: Fully-Automated vitest+supertest integration test on the new staff lookup route
   (branch-scoped, self-seeding fixture pattern) + Agent-Probe walkthrough of the staff entry
   screen (no RN test runner exists project-wide).
   strategy: Hybrid.

4. **A pickup code from another branch is not found — never exposes the other branch's order.**
   When a staff member enters a pickup code belonging to a different branch's order, the app
   tells them no matching order was found for their branch. It does not show the order, and it
   does not reveal that the code exists elsewhere.
   proven by: Fully-Automated integration test asserting cross-branch lookup returns the
   not-found outcome (matches the existing STAFF-001 branch-scoping pattern used by every other
   `/api/staff/*` route).
   strategy: Fully-Automated.

5. **A nonexistent pickup code is not found.**
   When a staff member enters a code that does not match any order at all, the app tells them no
   matching order was found for their branch — the same outcome and message as a wrong-branch
   code (US-3: staff never learns whether a code is "wrong branch" vs. "doesn't exist").
   proven by: Fully-Automated integration test for a random/invalid code string.
   strategy: Fully-Automated.

6. **An already-completed order is clearly flagged, not silently re-actionable.**
   When a staff member enters a pickup code for an order that has already been completed
   (picked up), the app tells them the order was already picked up. The staff member cannot
   trigger a second completion for that order through this lookup path.
   proven by: Fully-Automated integration test — lookup a completed order's code, assert the
   response signals "already completed" and that attempting the existing completion transition
   again is rejected by the existing state-machine 409 guard (already covered by
   `staff-order-status.integration.test.ts`, re-asserted here in the lookup context).
   strategy: Fully-Automated.

7. **No duplicate reward/star credit from a double lookup-and-complete attempt.**
   Attempting to "complete" an already-completed order via this new lookup path never results in
   a second star/reward credit.
   proven by: Fully-Automated integration test confirming the state-machine terminal guard
   blocks re-completion (structurally guaranteed today since star crediting is a no-op stub and
   completion is compare-and-swap gated — this test locks the guarantee against regression, not
   a currently-false fact).
   strategy: Fully-Automated.

---

## Out Of Scope

- Camera or barcode/QR scanning of any kind — manual code entry is the only supported input
  method for this release (explicitly permitted by the source issue).
- Changing the pickup code's format, generation, or introducing a new/separate code distinct
  from the existing order number.
- Any change to the order state machine, the "Mark Picked Up" action, or its transition rules —
  this feature only adds a way to *find* an order by code; what happens after finding it is
  unchanged.
- Real star/reward accrual (STAR-001) — remains a no-op stub; this SPEC only requires that no
  *duplicate* accrual can be triggered, not that real accrual exists.
- Push notifications or any other cross-feature integration.
- Admin-side or customer-side lookup by code — this is a staff-only tool.
- Any new database migration or schema change (the existing `order_number` already satisfies the
  pickup-code requirement).

---

## Constraints

- Must reuse the existing `orders.order_number` value as the pickup code — no new column, no new
  generation scheme.
- Staff-side lookup must be scoped to the requesting staff member's own assigned branch, using
  the same authorization pattern already established for every other `/api/staff/*` route
  (session-gated, branch-scoped).
- Must not introduce any new database migration for this feature (confirmed unnecessary by
  research; flagged only as a risk if a later design decision changes this).
- Must not alter the existing order-completion state machine or its transition rules.
- The "not found" outcome must be indistinguishable between "wrong branch" and "code doesn't
  exist" — staff must never be able to infer that a code belongs to someone else's branch.
- No client-side or third-party scanning library may be introduced in this pass (none exist in
  the repo today, and this feature does not require adding one).
- All new automatable staff-lookup behavior (branch scoping, not-found, already-completed) must
  be covered by a Fully-Automated backend test — mobile staff UI behavior remains Agent-Probe
  only, consistent with the project-wide lack of an RN test runner (already a tracked, not
  newly-introduced, gap).

---

## Open Questions

None — the four design-level questions research surfaced (entry-point placement on the staff
dashboard; whether an already-completed lookup returns the order with `status=completed` vs. a
distinct error code; the not-found response code/shape for cross-branch vs. nonexistent codes;
whether lookup and "mark as picked up" are one combined action or two separate steps) are
explicitly **implementation decisions**, not open product intent — the acceptance criteria above
already lock the required *outcome* for each (US-3/AC4/AC5: identical not-found outcome
regardless of cause; AC6: clear "already picked up" messaging with no re-completion). These are
deferred to INNOVATE/PLAN, where the actual endpoint/response shape will be chosen consistent
with the outcomes locked here.

---

## Background / Research Findings

Key facts from RESEARCH that shaped this SPEC (verbatim ground truth, not re-derived):

- `orders.order_number` (format `JP-YYMMDD-XXXX`, globally unique, `notNull`, indexed,
  human-speakable, ambiguous characters 0/O/1/I already excluded by design) already satisfies
  the "pickup code" requirement. No new column or migration needed.
- The customer-facing visibility acceptance criterion is **already met today** —
  `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx` and
  `order/tracking/[orderId].tsx` already render `order.orderNumber` prominently with
  "Show this number at the counter" copy. This SPEC treats US-1/AC1/AC2 as "confirm, no
  rework expected" unless PLAN finds a genuine copy/prominence gap.
- "Already picked up" maps 1:1 onto the existing order-state-machine terminal guard:
  `ready → completed` is the pickup transition (staff `LiveOrderActions` already has a
  "Mark Picked Up" button), and `PATCH /api/staff/orders/:orderId` already returns 409 on any
  transition attempt where `canTransition()` is false, including re-completing a `completed`
  order. There is no separate "picked up" state to add.
- The one genuinely new surface is a branch-scoped staff lookup-by-code capability (does not
  exist today) plus a mobile "Enter Pickup Code" entry screen (no current UI lets staff find an
  order without already having navigated to it via the Active Orders list).
- STAFF-001's `requireStaff` / `resolveBranchScope` / `assertBranchScope` pattern is directly
  reusable for the new lookup surface — same pattern as every other `/api/staff/*` route.
- Star idempotency (AC7's "no duplicate star credit") is structurally already safe:
  `creditStarsForOrder` is a no-op stub (STAR-001 not yet built) and the compare-and-swap 409
  guard prevents any double-completion regardless — this criterion is satisfied by not
  double-firing the completion transition, not by real accrual idempotency logic.
- No scanning libraries (camera/barcode) exist anywhere in the repo today — manual-entry-only is
  correct for this release, exactly as the source issue permits.
- Express route-ordering gotcha (implementation-relevant, noted for PLAN): any new static route
  segment (e.g. a lookup route) must be registered before the existing `/orders/:orderId` route
  in `staff.ts`, matching the pattern already used for `/orders/completed`.
- Migration numbering note (risk, not expected to matter): `development` is at migration `0006`
  (next free slot `0007`), and an open, unmerged PR (#83) claims `0007` for `device_tokens`.
  This SPEC requires no migration, so this is flagged only as a risk if a later design decision
  in PLAN unexpectedly requires a schema change.
- No collision with in-flight PRs: PR #83 (push notifications) and PR #84 (staff branch
  pickup-toggle, admin-only) do not touch this surface. PR #87 (mobile tabs/rewards) is broad but
  likely doesn't meaningfully touch confirmation/tracking screens — flagged as a recheck-before-
  EXECUTE item, not a blocker.
- Test tier: the new lookup route needs Fully-Automated vitest+supertest coverage (new
  `staff-order-lookup.integration.test.ts`, reusing the `makeUser(role)` self-seeding fixture
  pattern used by `staff-order-status.integration.test.ts`). All `apps/mobile` staff UI (new
  screen, new nav entry point) is Known-Gap/Agent-Probe only — no RN test runner exists
  project-wide (already backlog-tracked; not re-filed here).
