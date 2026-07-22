---
name: spec:closed-branch-order-gate
description: "Server-side order-placement gate rejecting orders for a branch that is closed by its opening hours (not just is_accepting_pickup)"
date: 22-07-26
feature: pickup-branches
---

# SPEC — Reject Order Placement When the Branch Is Closed (Opening Hours)

**Status: LOCKED.** All 3 items previously under Open Questions were resolved by orchestrator
decision on 22-07-26 (see `## Locked Decisions` below) and folded into requirements. This SPEC is
ready for INNOVATE/PLAN.

## Summary

A customer should never be able to complete a pickup order for a branch that is currently
closed. Today the app's Order button already hides itself when a branch looks closed — but
that check only runs on the customer's phone. The server that actually creates the order never
looks at the branch's opening hours, only at two separate on/off flags (`is_active`,
`is_accepting_pickup`). That gap means a closed branch can still receive a real order if the
request reaches the server directly, or if the customer's app had stale data. This SPEC defines
closing that gap: the server itself must refuse to place an order for a branch that is closed
right now, using the exact same "is this branch open" logic the app already trusts — with two
genuinely distinct, customer-facing rejection reasons (closed-by-hours vs. not-accepting-pickup)
and no grace window at the closing boundary.

## User Stories / Jobs To Be Done

- As a **customer**, I want the app to refuse my order if the branch I picked is closed, so that
  I never pay for or wait on an order a closed branch can't actually prepare.
- As a **customer**, when my order is rejected because the branch is closed, I want to be told
  that plainly (and when possible, when it reopens) — not given a message that sounds like the
  branch has pickup turned off for some other reason.
- As a **branch staff member**, I want to be protected from unexpected orders landing outside our
  opening hours, so that we are never asked to fulfill pickup orders while closed.
- As the **product owner**, I want the closed-branch rule enforced by the server (not just the
  app screen), so that a stale app, a bug, or a direct API call can't bypass it.

## What The User Wants (Behavioral Outcomes)

- If a branch is closed (by its stated opening hours) at the moment an order is submitted, the
  order is not created — the customer sees a message that specifically says the branch is closed
  right now, and can pick a different branch or come back later.
- This closed check happens in addition to, and independently of, the existing
  "not accepting pickup" check. The two rejections use **separate customer-facing copy and
  separate machine-readable reason codes** — they must never be collapsed into shared wording,
  because they mean different things to the customer: "closed right now" resolves itself once
  opening hours arrive; "not accepting pickup" does not carry that same time-bound promise and
  may not resolve on any predictable schedule.
- The check is evaluated at the moment the order is placed, using live server-clock time — not a
  value cached earlier in the checkout flow, and with **no grace window** at the closing
  boundary. An order that was valid when the cart was built but becomes invalid because the
  branch closed in the meantime must still be rejected, even if the customer started checkout
  seconds before closing.
- Nothing changes about how the customer picks a branch or browses the menu — the app's existing
  "closed" badge and disabled Order button stay as they are today. This work only closes the gap
  where the server didn't double-check.

## Flow / State Diagram

```
Customer submits order (POST /orders)
        │
        ▼
 ┌─────────────────────────┐
 │ Branch exists & active?  │──No──▶ 400 "Branch not found"        (existing, unchanged)
 └─────────────┬────────────┘
               │ Yes
               ▼
 ┌─────────────────────────────┐
 │ is_accepting_pickup = true?  │──No──▶ 400 reason: NOT_ACCEPTING_PICKUP
 └─────────────┬─────────────────┘        "Branch is not accepting pickup orders right now"
               │ Yes                       (existing message/status, unchanged — NEW: reason code added)
               ▼
 ┌───────────────────────────────────────┐
 │ Is branch open right now, per          │
 │ opening_hours (server clock, +08:00)?  │──No──▶ 400 reason: BRANCH_CLOSED  (NEW)
 └─────────────┬───────────────────────────┘        "This branch is closed right now[ — opens
               │ Yes                                  again at {time}]." (see Locked Decision 1
               ▼                                       for the bracketed part)
      ...rest of existing placement logic (products, deals, coupons, etc.)
               │
               ▼
        Order created (existing)
```

Boundary case (order submitted right at the closing minute) — **locked as no-grace-window**:

```
14:59:58 — customer taps "Place Order"          14:59:58 — request reaches server, request read starts
                                                  15:00:00 — branch's stated closing time
                                                  15:00:01 — server evaluates "is branch open now?"
                                                              using the CURRENT server clock at
                                                              evaluation time (live transaction
                                                              moment, matching every other
                                                              placement-time check) → branch reads
                                                              as CLOSED → order rejected, reason:
                                                              BRANCH_CLOSED
```
The check always uses the server's clock at the moment it runs inside the placement transaction,
never a snapshot taken earlier in the request and never a grace/tolerance window. This is a
deliberate decision (Locked Decision 2), not an oversight — see below.

## Acceptance Criteria (Testable Outcomes)

1. **Placing an order for a branch that is closed right now (by opening_hours) is rejected**,
   with a machine-readable reason code (e.g. `reason: 'BRANCH_CLOSED'`) distinct from the
   not-accepting-pickup reason, and a customer-facing message that specifically says the branch
   is closed (not reused not-accepting-pickup wording).
   proven by: new supertest case in `packages/api/src/routes/__tests__/orders.test.ts`, branch
   seeded with `opening_hours` that reads as closed at the test's frozen/injected `now`; asserts
   both the reason code/marker and the message text.
   strategy: Fully-Automated

2. **Placing an order for a branch that is currently open (by opening_hours) still succeeds**,
   all else being valid — this change introduces no regression on the existing happy path.
   proven by: existing happy-path order-placement tests in `orders.test.ts` continue to pass
   unmodified (regression proof), plus one new explicit "open branch, opening-hours check
   passes" case if not already implicit in the happy-path fixtures.
   strategy: Fully-Automated

3. **The closed-branch rejection is distinguishable from the not-accepting-pickup rejection at
   both the machine level and the customer-copy level.** The two failure reasons carry different
   reason codes AND different message text — never shared or near-identical wording.
   proven by: new supertest case placing two separate order attempts — one against a branch with
   `is_accepting_pickup=false` (open hours notwithstanding) and one against a branch that is
   `is_accepting_pickup=true` but outside opening hours — asserting both the reason code and the
   message text differ between the two responses.
   strategy: Fully-Automated

4. **A branch that is both not-accepting-pickup AND closed is rejected on the first applicable
   check (not-accepting-pickup, since it is checked first), and this existing behavior is
   explicitly covered by an automated regression test** — closing the previously-missing test gap
   for the `is_accepting_pickup` rejection path (see Locked Decision 3).
   proven by: new supertest case in `orders.test.ts` covering the plain `is_accepting_pickup`
   rejection (independent of opening hours) PLUS a second case combining both conditions,
   confirming the not-accepting-pickup response wins and is unchanged from today's behavior.
   strategy: Fully-Automated

5. **The opening-hours check runs on live server-clock time, evaluated inside the existing
   order-placement transaction, with no grace window** — not a value read earlier in checkout,
   not cached client-side, and not tolerant of a small overrun past the stated closing time.
   proven by: a test that constructs an order request against a branch whose `opening_hours`
   places it as closed at "now" (using dependency-injected time via `getIsOpenNow`'s existing
   `now` parameter, mirroring the pattern already used for its unit tests), confirming rejection
   regardless of any client-supplied timestamp, and a boundary-adjacent case (closed by exactly
   one minute) confirming rejection with no tolerance window.
   strategy: Fully-Automated

6. **The check reuses the same shared `getIsOpenNow` utility already used by the customer app's
   branch list/detail screens** — the server does not reimplement opening-hours parsing.
   proven by: a source-level assertion this SPEC hands to PLAN/INNOVATE as a constraint (verified
   by code review during EXECUTE/VALIDATE that `packages/utils`'s existing `getIsOpenNow` is the
   function called), not by a runtime test.
   strategy: Hybrid

7. **When the closed-branch message can derive a "reopens at" time from the branch's
   `opening_hours`, it includes that time; when it cannot be cleanly derived, the message omits
   it rather than guessing or showing a wrong/misleading time.** (See Locked Decision 1 — no
   "next open" derivation function exists in `packages/utils/src/hours.ts` today; PLAN must
   confirm whether building one is in scope for this change or deferred.)
   proven by: unit test(s) on the message-building logic covering: same-day reopen-later case (if
   built), and the fallback case where no next-open time is computed — asserting the message
   never claims a time it did not actually compute.
   strategy: Fully-Automated

## Out Of Scope

- Any change to the **customer app's** existing closed-branch UI (badge, disabled Order button,
  `getIsOpenNow` client call sites) — research confirmed the client already gates correctly on
  `isOpen && isAcceptingPickup`; this SPEC does not touch `apps/mobile`.
- Staff-side order rejection reasons, or any staff-facing "why was this order blocked" surface.
- Customer-initiated order cancellation.
- Cart line/option editing after a branch closes.
- Any of the other items from the wider 13-item batch this ticket was drawn from — this SPEC
  covers exactly the "can't pick up on a closed branch" server-side gap and nothing else.
- Adding a per-branch timezone field to the schema — the existing fixed `+08:00` default in
  `getIsOpenNow` is reused as-is (already noted as a future TODO in that file, not part of this
  work).
- Changing or removing the existing `is_accepting_pickup` flag or its check — both checks coexist.
- Real-time/websocket notification to the customer if a branch closes while their cart is open —
  the rejection happens at order-placement time, not proactively while browsing.
- A grace/tolerance window at the closing boundary — explicitly rejected, see Locked Decision 2.
  If branches later ask for one, that is a future product change requiring its own decision, not
  something this SPEC leaves half-open.

## Constraints

- No schema change: `opening_hours` already exists on `branches`
  (`packages/api/src/db/schema/branches.ts:23`) and needs no migration.
- Must reuse the existing shared pure function `getIsOpenNow(openingHours, now, tzOffsetHours=8)`
  from `packages/utils/src/hours.ts` — no new opening-hours parsing logic.
- Must run inside the existing `POST /orders` placement transaction
  (`packages/api/src/routes/orders.ts`), alongside the existing `is_active` / `is_accepting_pickup`
  checks, following the same `OrderError(status, message)` rejection pattern already used
  throughout that file (see `orders.ts:63` and its many `throw new OrderError(400, ...)` call
  sites). PLAN/INNOVATE decides whether `OrderError` needs a reason-code field added or whether
  the message string alone satisfies AC1/AC3's distinguishability requirement — this SPEC
  requires distinguishability, not a specific mechanism.
- Timezone convention: this codebase's established Manila/`+08:00` local-time convention (per the
  DEAL-005 scheduling work) applies; `getIsOpenNow` already defaults to `tzOffsetHours=8`, so no
  new timezone logic is introduced.
- **No grace window at the closing boundary — this is a locked, deliberate decision** (Locked
  Decision 2), not an oversight to "fix" later. A future grace window remains possible as a
  distinct future product change but is out of scope here.
- High-risk 5-artifact evidence pack: **accepted as SKIPPED at SPEC level** (orchestrator
  decision, 22-07-26). Reasoning: this is a narrow, additive, server-side tightening of an
  existing validation block — no new route, no new schema, no new trust boundary, and it only
  ever makes placement stricter, never more permissive. **This flag is not final — VALIDATE must
  re-confirm it once the exact diff shape is known**, per standard practice; it is not being
  treated as permanently settled, only as SPEC's considered recommendation, now accepted as the
  working assumption for INNOVATE/PLAN.

## Locked Decisions

Resolved by orchestrator decision, 22-07-26 — folded into the requirements above. Recorded here
so the reasoning is visible to a future reader instead of disappearing into the diff.

1. **Message wording — distinct customer-facing copy + distinct machine-readable reason code**
   (was Open Q1). "This branch is closed right now" and "this branch isn't accepting pickup
   orders" are genuinely different situations to a customer: one resolves by waiting until
   opening hours, the other doesn't carry that same guarantee. Collapsing them into similar text
   would make the app describe the wrong situation to the customer. Locked: two separate reason
   codes, two separate message strings (AC1, AC3).
   **Sub-decision on "next open" time:** the copy should prefer telling the customer when the
   branch next opens, if that is cleanly derivable from `opening_hours` — but research confirms
   **no such "next opening time" derivation function exists in `packages/utils/src/hours.ts`
   today** (only `getIsOpenNow` and `formatOpeningHours`, neither of which computes "the next
   moment this branch opens from an arbitrary closed instant"). This SPEC does **not** mandate
   building that derivation as part of this change — AC7 requires the message to include a
   reopen time ONLY when one is cleanly derivable, and to omit it (never guess) otherwise. PLAN
   decides whether adding the derivation function is in scope for this ticket or deferred as a
   fast-follow.
2. **No grace window — reject strictly on live server-clock time** (was Open Q2). Every other
   placement-time check in `POST /orders` evaluates against the live transaction moment; a grace
   window here would be the only exception, and introducing one would require a real business
   policy decision (how long? per-branch or global? does staff want it?) that nobody has made.
   Locked as a deliberate no-grace-window decision, stated explicitly so a future reader does not
   "fix" this as if it were a bug. A grace window remains available as a future product change if
   branches request one — see Out of Scope.
3. **PLAN adds the missing `is_accepting_pickup` regression test alongside the new closed-branch
   case** (was Open Q3). Confirmed during SPEC research (via direct grep, correcting an earlier,
   wrong research assumption) that `orders.test.ts` has **no existing automated test** for the
   `is_accepting_pickup` rejection path today. Two sibling rejection paths where only one was
   about to gain coverage is exactly the kind of asymmetry that rots — both are now required,
   both Fully-Automated (AC4).

## Open Questions

None. All 3 prior open questions were resolved by orchestrator decision on 22-07-26 — see `## Locked Decisions` above.

## Background / Research Findings

- `branches` has both `opening_hours: text().notNull()` (JSON per-day string) and
  `is_accepting_pickup: boolean` (`packages/api/src/db/schema/branches.ts:23,25`). Both are real,
  independent columns today.
- "Is the branch open right now" is currently derived **client-side only**, by the pure function
  `getIsOpenNow(openingHours, now, tzOffsetHours=8)` in `packages/utils/src/hours.ts`. It is
  called from three `apps/mobile` sites (`(tabs)/branches/index.tsx:131`, `(tabs)/branch/index.tsx:99`,
  `features/branches/components/branch-map-impl.tsx:100`) and nowhere in `packages/api`. The
  client's Order button is gated on `isOpen && item.isAcceptingPickup`
  (`(tabs)/branches/index.tsx:131` area).
- **The confirmed gap:** `POST /orders` (`packages/api/src/routes/orders.ts:126-134`) validates
  only `branch.is_active` and `branch.is_accepting_pickup` inside the placement transaction. It
  never reads `opening_hours` and never calls `getIsOpenNow`. An order can therefore be placed
  server-side against a branch that is closed by its stated hours, via a direct API call or a
  stale/buggy client — the server does not independently confirm what the app's UI already
  assumes.
- No schema change is needed — `opening_hours` already exists and `getIsOpenNow` already exists
  as a shared, zero-new-dependency pure util in `packages/utils`.
- Timezone precedent in this repo: Manila local-day / fixed `+08:00` semantics, established by
  the DEAL-005 scheduling work (`toManilaWallClock()`); `getIsOpenNow` already defaults
  `tzOffsetHours=8`, consistent with that convention.
- `packages/utils/src/hours.ts` today exports exactly two functions: `getIsOpenNow` (open/closed
  boolean) and `formatOpeningHours` (human-readable weekly-hours display lines). Neither computes
  a "next opening time from an arbitrary closed instant" — confirmed by reading the full file.
  This is why Locked Decision 1's "reopens at" copy is conditional on derivability, not mandatory.
- **Correction found during SPEC (differs from initial research note):** `orders.test.ts` does
  **not** currently have an automated test case covering the `is_accepting_pickup` rejection path
  — a grep for `not accepting` / `is_accepting_pickup` inside
  `packages/api/src/routes/__tests__/orders.test.ts` returned no matches. The `OrderError`
  rejection pattern is well-established in `orders.ts` (many `throw new OrderError(400, ...)`
  call sites, e.g. lines 131, 134, 174, 236, 324...), so the pattern to follow is clear even
  though a direct sibling test to copy did not previously exist — now required by Locked
  Decision 3 / AC4.
- `getIsOpenNow` already supports dependency-injected `now`, which is the existing testing
  pattern for this function (per its own JSDoc) and should carry over to the new server-side
  test cases.

TL;DR: Add a server-side "is this branch open right now" check to `POST /orders`, reusing the
existing `getIsOpenNow` util and the branch's existing `opening_hours` column — no schema change.
Closed-branch and not-accepting-pickup rejections now have distinct reason codes and distinct
customer-facing copy (locked decision), the check runs strictly on live server-clock time with no
grace window (locked decision, deliberate), and PLAN adds the previously-missing
`is_accepting_pickup` regression test alongside the new one (locked decision). High-risk evidence
pack accepted as skipped at SPEC level, pending VALIDATE re-confirmation. All 3 former Open
Questions are now locked requirements — SPEC is ready for INNOVATE/PLAN.
