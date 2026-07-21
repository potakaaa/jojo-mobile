---
name: plan:customer-mark-picked-up
description: "Customer self-confirm pickup — narrow PATCH /orders/:orderId/complete + tracking-screen button"
date: 21-07-26
feature: ordering-cart
---

# PLAN — Customer "Mark as picked up" (SIMPLE)

**TL;DR:** Add one narrow customer route (`PATCH /orders/:orderId/complete`, no `status` in the
body) that flips a `ready` order the caller owns to `completed` via compare-and-swap and calls the
idempotent star-credit service; surface it on the tracking screen as a `ready`-only button behind a
confirm dialog. No state-machine change, no staff-side change, no shared-helper extraction.

Status: PLANNED — not executed.
Complexity: SIMPLE

## Overview

Today an order can only reach `completed` when staff press "Mark Picked Up" on the staff order-detail
screen. A customer who has collected their food has no way to close the loop themselves, and until
someone at the branch acts, the order stays `ready`, the tracking screen keeps polling, and the Jojo
Star for that order is never credited.

This plan adds the customer side of that action: a `ready`-only button on the order-tracking screen,
backed by a new, deliberately narrow API route that can only ever move an order the caller owns from
`ready` to `completed`. `ready → completed` is already a legal transition, star crediting is already
implemented and DB-idempotent, and the ownership pattern already exists on `GET /orders/:orderId` —
so this is wiring existing, tested pieces together behind a new trust boundary, not new mechanics.

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC1 | `PATCH /orders/:orderId/complete` transitions a `ready` order owned by the caller to `completed` and sets `completed_at` |
| AC2 | A user cannot complete an order they do not own → 403, order unchanged |
| AC3 | Completion from any non-`ready` status → 409, order unchanged |
| AC4 | Exactly one star is credited on customer self-completion |
| AC5 | A repeat call, or a subsequent staff completion attempt, never credits a second star |
| AC6 | A concurrent transition that lands first causes the loser to receive 409 |
| AC7 | Non-existent / malformed order id → 404 |
| AC8 | The request body carries no `status` field — the route cannot express another target status |
| AC9 | The button renders only when `order.status === 'ready'` |
| AC10 | Tapping shows a confirm dialog; dismissing it sends nothing |
| AC11 | On success the tracking screen reflects `completed` and stops polling (on-device) |

Full requirement detail: `customer-mark-picked-up_SPEC_21-07-26.md` (same task folder).

---

## Decision Summary

### Chosen Approach
Dedicated `PATCH /orders/:orderId/complete` with the transition mechanics duplicated narrowly in
`orders.ts`, reusing the already-shared pure `canTransition` and calling
`creditStarForCompletedOrder` directly.

### Why This Over Alternatives
| Alternative | Why Rejected |
|---|---|
| Generic customer `PATCH { status }` mirroring staff | Puts a target status in a customer-writable body; safety would depend on a zod literal never regressing. The narrow route makes the bad state unrepresentable. |
| Extract shared `applyOrderStatusTransition()` | Refactors the well-tested staff compare-and-swap + side-effect flow; blast radius disproportionate to this feature. |
| No confirm dialog (match staff) | `completed` is terminal with no exit in the state machine, and a customer taps unprompted on their own phone. Deliberate documented divergence from the staff button. |

### Risk Predictions
- **Security** — check order ownership BEFORE the status check, else the 403-vs-409 split leaks order existence. Mitigated by copying `GET /:orderId`'s 404→403 ordering, then 409.
- **Concurrency** — customer tap racing a staff transition. Mitigated by carrying over the compare-and-swap `where(id AND status = oldStatus)`; loser gets 409.
- **Data integrity** — star credit must run OUTSIDE the transaction, per the staff precedent, so a credit failure never rolls back a durable terminal flip.
- **UX** — a stale poll can show the button on an already-completed order; server 409 + invalidation corrects it. Accepted.
- **Test** — the jest reanimated mock lacks `Easing` and `withRepeat`, both imported by the tracking screen; without extending it the button-visibility gate silently degrades to Agent-Probe. Addressed in Section C.

### Key Constraints Accepted
~40 duplicated lines of transition mechanics across `staff.ts` / `orders.ts`; no completion push
notification; `use-order-query.ts` untouched.

---

## Touchpoints

| File | Change |
|---|---|
| `packages/api/src/routes/orders.ts` | ADD `PATCH /:orderId/complete` handler |
| `packages/api/src/routes/__tests__/orders.test.ts` | ADD customer-completion cases |
| `apps/mobile/src/features/orders/lib/api-client.ts` | ADD `completeOrder(orderId)` |
| `apps/mobile/src/features/orders/hooks/use-complete-order.ts` | NEW mutation hook |
| `apps/mobile/src/app/(tabs)/tracking/index.tsx` | ADD `ready`-gated button + ConfirmDialog |
| `apps/mobile/src/test-utils/jest-setup.ts` | ADD `Easing` + `withRepeat` to the reanimated mock |
| `apps/mobile/src/app/(tabs)/tracking/__tests__/index.test.tsx` | NEW screen test (dir does not exist yet) |

Read-only for context: `packages/api/src/routes/staff.ts` (compare-and-swap precedent),
`packages/api/src/lib/star-earning.ts`, `packages/api/src/routes/lib/order-state-machine.ts`,
`apps/mobile/src/app/(staff)/order-detail/[orderId].tsx` (Button + ConfirmDialog precedent).

## Public Contracts

**NEW — `PATCH /orders/:orderId/complete`** (session-gated via existing `requireSession`)

- Request body: **none** (any body ignored; no `status` field accepted — AC8)
- `200` → `{ order: ApiOrder }` (same envelope + serializer as `GET /orders/:orderId`)
- `404` → order id malformed or not found
- `403` → order not owned by caller
- `409` → current status is not `ready`, or a concurrent transition won the race

Unchanged: `POST /orders`, `GET /orders`, `GET /orders/:orderId`, every `/api/staff/*` route, the
`OrderStatus` union, and the state-machine table.

## Blast Radius

- **Packages:** `packages/api` (1 route file + 1 test file), `apps/mobile` (4 files + 1 new test).
  `packages/types`, `packages/ui`, `packages/utils`, `apps/admin` untouched.
- **Risk class:** public API contract (new customer-facing mutation) + trust boundary (ownership) +
  money-adjacent (star ledger). **Hybrid-minimum tier required; Known-Gap BANNED on AC2/AC3/AC4/AC5.**
- **Migrations:** none. **State-machine edits:** none. **Schema edits:** none.

---

## Implementation Checklist

### Section A — API route (`packages/api`) — ✅ DONE (21-07-26, items 1–7)

1. In `packages/api/src/routes/orders.ts`, add `ordersRouter.patch('/:orderId/complete', requireSession, ...)`.
   Register it **before** any broader `/:orderId`-shaped handler in the same file so Express does not
   shadow it (currently only `GET /:orderId` exists, but keep the ordering explicit).
2. Handler sequence — this order is load-bearing:
   1. `const userId = req.user!.id`
   2. UUID check on `req.params.orderId` → `404 { error: 'Order not found' }` (NOT 400)
   3. `SELECT` order by id → missing → `404`
   4. `order.user_id !== userId` → `403 { error: 'Forbidden' }`
   5. `canTransition(order.status, 'completed')` false → `409 { error: 'Invalid status transition' }`
   6. Additionally hard-gate `order.status !== 'ready'` → `409` (belt-and-braces: `canTransition`
      alone would also admit a future source status if the table ever widens; the SPEC pins `ready`)
3. Build the patch: `{ status: 'completed', completed_at: now, updated_at: now }`.
4. Apply inside `db.transaction`, compare-and-swap:
   `.update(orders).set(patch).where(and(eq(orders.id, orderId), eq(orders.status, order.status))).returning({ id: orders.id })`.
   No row returned → `409 { error: 'Concurrent modification detected; please retry' }`.
5. **After** the transaction commits, call `creditStarForCompletedOrder(orderId)`. Do NOT call it
   inside the transaction, and do NOT let a thrown credit error 500 the request after a durable
   status flip — wrap and log, mirroring the staff path's intent.
6. Do NOT call `notifyCustomer` / `dispatchOrderNotification` — `OrderNotificationEvent` has no
   `completed` member; the omission is deliberate.
7. Re-select order + items and respond `{ order: serializeOrder(order, items) }` (the customer
   serializer, not `serializeStaffOrderDetail`).

### Section B — API tests (`packages/api/src/routes/__tests__/orders.test.ts`) — ✅ DONE (21-07-26, items 8–15; 71→88 cases, AC2/AC3/AC4/AC5 mutation-proven non-vacuous — see `customer-mark-picked-up_REPORT-SECTIONS-AB_21-07-26.md`)

8. AC1 — `ready` + owner → 200, `status === 'completed'`, `completed_at` non-null.
9. AC2 — user B PATCHes user A's `ready` order → 403; re-select proves status still `ready`.
10. AC3 — parameterised over all 7 non-`ready` statuses → 409 each; order unchanged each time.
11. AC4 — after a successful completion, exactly one `star_transactions` row exists for that
    `order_id` and `user_stars` incremented by exactly 1.
12. AC5 — call the customer route a second time (expect 409, since status is now terminal) AND
    invoke the staff completion path/credit service again; assert the star count is STILL exactly 1
    and no second ledger row exists. **This must be a real assertion on row counts, not a smoke call.**
13. AC6 — flip the order to `completed` out-of-band between load and update (simulate by completing
    via a second request first), assert the second request gets 409, not a silent overwrite.
14. AC7 — malformed uuid → 404; well-formed unknown uuid → 404.
15. AC8 — send `{ status: 'cancelled' }` as the body; assert the order becomes `completed` (body
    ignored), proving the route cannot express another target status.

### Section C — Mobile

16. `apps/mobile/src/test-utils/jest-setup.ts`: extend the hand-rolled reanimated mock with `Easing`
    (an object whose `inOut`/`ease` are identity/no-op functions) and `withRepeat`. Without this the
    tracking screen crashes at render under jest and Section C's tests cannot exist. Re-run the full
    mobile jest suite after this edit to confirm no existing suite regressed.
17. `apps/mobile/src/features/orders/lib/api-client.ts`: add
    `completeOrder(orderId): Promise<Order>` — `apiRequest<{ order: Order }>(\`/orders/${encodeURIComponent(orderId)}/complete\`, { method: 'PATCH' })`, returning `order`. Same shape as `fetchOrder`.
18. NEW `apps/mobile/src/features/orders/hooks/use-complete-order.ts`: `useMutation` calling
    `completeOrder`, `onSuccess` invalidating `['order', orderId]` and `['orders', 'history']`.
    Model on `apps/mobile/src/features/staff/hooks/use-update-order-status.ts`.
    **Do not edit `use-order-query.ts`** (LIVE-001 E4 hard contract).
19. `apps/mobile/src/app/(tabs)/tracking/index.tsx`:
    - Import `Button` and `ConfirmDialog` from `@jojopotato/ui` (add to the existing import line).
    - Render the button **only** when `order.status === 'ready'`, placed inside the `ScrollView`
      content BELOW the `timelineCard` — i.e. on the screen's own themed background, NOT on the
      hardcoded-cream card. Therefore pass the device-scheme `mode` (already computed in this
      component), **not** `mode="light"`. Add a short comment stating which surface it sits on.
    - Tap opens `ConfirmDialog`; confirming fires the mutation; show the pending state on the Button.
    - On error, surface the message inline (a 409 means someone else already completed it —
      the `['order', orderId]` invalidation will correct the screen).
20. NEW `apps/mobile/src/app/(tabs)/tracking/__tests__/index.test.tsx` (create the `__tests__` dir):
    AC9 — button present for `ready`, absent for at least `preparing` and `completed`;
    AC10 — tapping renders the dialog and fires no mutation until confirmed.
    Use `renderWithProviders()` (await it) from `src/test-utils/render.tsx`.

### Section D — Gates

21. `pnpm --filter @jojopotato/api test` (needs Postgres — see all-tests.md dev-machine note)
22. `pnpm --filter @jojopotato/mobile test` (vitest then jest)
23. `pnpm --filter @jojopotato/api typecheck` and `pnpm --filter @jojopotato/mobile typecheck`
24. `pnpm --filter @jojopotato/mobile guard:theme-mode`
25. `pnpm format:check`

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `ready` + owner → 200 `completed`, `completed_at` set | Fully-Automated (api vitest) | AC1 |
| user B → 403, order unchanged | Fully-Automated **(HARD — Known-Gap BANNED)** | AC2 |
| all 7 non-`ready` statuses → 409, order unchanged | Fully-Automated **(HARD — Known-Gap BANNED)** | AC3 |
| exactly one `star_transactions` row + `user_stars` +1 | Fully-Automated **(HARD — Known-Gap BANNED)** | AC4 |
| repeat call + staff re-credit → still exactly 1 star | Fully-Automated **(HARD — Known-Gap BANNED)** | AC5 |
| second concurrent transition → 409 | Fully-Automated (api vitest) | AC6 |
| malformed / unknown uuid → 404 | Fully-Automated (api vitest) | AC7 |
| body `{status:'cancelled'}` ignored → order `completed` | Fully-Automated (api vitest) | AC8 |
| button present for `ready`, absent otherwise | Fully-Automated (mobile jest, **after** step 16) | AC9 |
| tap → dialog, no request until confirmed | Fully-Automated (mobile jest) | AC10 |
| on-device: confirm → screen shows completed, polling stops | Agent-Probe | AC11 |

**Tier rationale:** `packages/api` has a real vitest+supertest integration runner against live
Postgres, so every server-side criterion is Fully-Automated — no high-risk criterion is deferred.
`apps/mobile` has a jest/jest-expo component runner, which covers AC9/AC10 once the reanimated mock
is extended (step 16). AC11 is Agent-Probe only because no RN navigation/E2E runner exists
project-wide (standing gap, `all-tests.md` §Known Gaps) — it is a visual/behavioural confirmation,
not a correctness gate, and no HARD criterion depends on it.

### Gap Resolution

| Gap | Resolution options |
|---|---|
| Tracking screen crashes under jest (`Easing`/`withRepeat` missing from mock) | **A) Extend the mock — CHOSEN** (step 16, ~5 lines, unblocks AC9/AC10 as Fully-Automated). B) infra: adopt the official reanimated mock — rejected, known to crash on this repo's 4.5.0 pin. C) accept as known-gap — rejected, AC9 is cheap to automate. D) backlog — rejected. |
| AC11 on-device polling-stop confirmation | A) write an E2E test — rejected, no runner exists. B) stand up Detox/Maestro — out of scope for this plan. **C) Agent-Probe — CHOSEN**, standing project-wide gap already tracked. D) backlog note — already covered by `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. |

## Test Infra Improvement Notes

- The reanimated mock extension in step 16 is reusable infra: it unblocks jest coverage for any
  screen using `Easing`/`withRepeat`. Layout-animation exports (`FadeIn`/`FadeOut`/`SlideInDown`/
  `SlideOutDown`/`cancelAnimation`) remain absent and still block `order/checkout.tsx` — out of
  scope here; the existing backlog item for the full mock extension stands.
- Stale doc (do NOT fix in this plan — flag at UPDATE PROCESS):
  `process/features/ordering-cart/backlog/stars-accrual-and-history-display_NOTE_13-07-26.md`
  claims no server route writes `star_transactions`; that is false since STAFF-003, and this plan
  adds a second writer.

## Phase Completion Rules

- **CODE DONE** — all checklist items applied and every gate in §Test Gates is green, independently
  re-run by a spawned vc-tester (EVL), not taken on the execute-agent's own report.
- **VERIFIED** — CODE DONE **plus** the AC11 Agent-Probe walkthrough performed and confirmed by the
  user on a device: complete a `ready` order from the tracking screen, confirm the screen shows
  `completed` and stops polling, and confirm the star appears in the rewards balance.
- This task folder stays in `active/` until VERIFIED. Do not archive to `completed/` on CODE DONE
  alone.
- A HARD criterion (AC2/AC3/AC4/AC5) may never be closed with Known-Gap. If any of them cannot be
  proven by a real passing automated test, stop and report BLOCKED.

## Resume and Execution Handoff

1. **Selected plan:** `process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/customer-mark-picked-up_PLAN_21-07-26.md`
2. **Last completed step:** PLAN + VALIDATE complete; validate-contract written. EXECUTE not started.
3. **Validate-contract status:** written (see below).
4. **Context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `process/context/planning/all-planning.md`, `process/development-protocols/all-development-protocols.md`,
   plus the source files named in Touchpoints.
5. **Next step for a fresh agent:** start at Section A step 1. Sections A+B (api) and Section C
   (mobile) are file-disjoint and may be executed in parallel; Section C step 16 must precede step 20.
   Branch: `development` at plan time.

---

## Validate Contract

generated-by: outer-pvl
date: 2026-07-21
Date: 21-07-26
Gate: CONDITIONAL
Plan: process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/customer-mark-picked-up_PLAN_21-07-26.md

### Layer 1 dimensions

| Dimension | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS (after E1 applied) |
| Breaking changes | PASS |
| Security surface | PASS |

### Layer 2 sections

| Section | Status |
|---|---|
| A — API route | PASS |
| B — API tests | PASS |
| C — Mobile | CONCERN (resolved into E1/E2) |
| D — Gates | PASS |

**Totals: 0 FAILs / 1 CONCERN / 7 PASSes → Net Gate: CONDITIONAL**

### Findings

| Finding | Severity | Resolution |
|---|---|---|
| Tracking screen imports `Easing`/`withRepeat`; jest mock has neither → screen test impossible as written | CONCERN | Fixed in plan: Section C step 16 added as a prerequisite to step 20 |
| Ownership check must precede status check to avoid existence leak | ✅ PASS | Already ordered correctly in Section A step 2 |
| Star credit outside transaction | ✅ PASS | Section A step 5 |
| `ready`-only gate is stricter than `canTransition` alone | ✅ PASS | Belt-and-braces double gate, Section A step 2.6 |
| No state-machine / schema / migration change | ✅ PASS | — |
| `use-order-query.ts` E4 contract not touched | ✅ PASS | Explicit in step 18 |

### Plan Updates Applied

| # | What changed | Where |
|---|---|---|
| P1 | Added reanimated-mock extension as an explicit prerequisite step | Section C step 16 |
| P2 | Added explicit `order.status !== 'ready'` hard gate on top of `canTransition` | Section A step 2.6 |
| P3 | Pinned the button's theming mode to device-scheme with surface rationale | Section C step 19 |

### Execute-Agent Instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | Complete Section C step 16 and re-run the full mobile jest suite BEFORE writing step 20's test. If extending the mock regresses any existing suite, stop and report — do not delete the failing suite. | Section C entry |
| E2 | The button must sit on the screen background, not inside `styles.timelineCard`. If layout forces it onto the cream card, use `Colors.light.*` tokens for it and document the change — do not silently mix modes. | Section C step 19 |
| E3 | If `creditForCompletedOrder`'s exported name differs from `creditStarForCompletedOrder`, use the real export and note the correction in the phase report — do not skip the call. | Section A step 5 |
| E4 | AC5's test must assert concrete row/counter values, not merely that a second call did not throw. A pass-by-absence assertion is a vacuous test and will be rejected at EVL. | Section B step 12 |

### Test Gates

```
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/mobile test
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/mobile guard:theme-mode
pnpm format:check
```

### Known Gaps Accepted

| Gap | Why accepted |
|---|---|
| AC11 (on-device confirm → completed + polling stop) is Agent-Probe | No RN navigation/E2E runner exists project-wide; standing tracked gap. No HARD criterion depends on it. |

### TDD Stubs (Fully-Automated tiers — red-first starting points)

```
test("403 when a user completes an order they do not own", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: ownership rejection")
})
test("409 from every non-ready source status", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: status gate")
})
test("credits exactly one star on customer self-completion", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: single star credit")
})
test("repeat completion never credits a second star", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: idempotent star credit")
})
test("renders the button only when status is ready", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: ready-only button visibility")
})
```
