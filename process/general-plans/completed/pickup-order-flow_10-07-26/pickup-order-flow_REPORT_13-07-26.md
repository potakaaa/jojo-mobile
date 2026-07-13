---
phase: pickup-order-flow
date: 2026-07-13
status: COMPLETE_WITH_GAPS
feature: general
plan: process/general-plans/completed/pickup-order-flow_10-07-26/pickup-order-flow_PLAN_10-07-26.md
---

# Wire the Customer Pickup-Order Flow End-to-End — UPDATE PROCESS Closeout Report

## What Was Done

- **New authenticated API surface** (`packages/api/src/`): `routes/branches.ts` (`GET /branches`,
  `GET /branches/:branchId`, `GET /branches/:branchId/menu`), `routes/orders.ts` (`POST /orders`,
  `GET /orders/:orderId`, `GET /orders`), `middleware/require-session.ts`, `types/express.d.ts`,
  `routes/lib/order-number.ts` (Crockford-base32 generator), `routes/lib/serializers.ts`
  (Drizzle `numeric` string → integer cents + response shaping). Mounted in `src/index.ts` after
  `express.json()`. `order_number` generation uses the verified
  `.onConflictDoNothing({ target: orders.order_number }).returning()` retry-loop pattern (never
  aborts the surrounding `db.transaction()`), confirmed against the real `drizzle-orm` API during
  VALIDATE.
- **Mobile state/data layer** (`apps/mobile/src/features/`): new `cart/` (`CartProvider`/`useCart()`
  reducer + pure total helpers), `branches/`, `menu/`, `orders/` (api-clients + hooks), and a new
  `shared/` folder (`api-request.ts` fetch wrapper, `use-async-data.ts`, `screen-message.tsx`) that
  emerged during EXECUTE as shared plumbing across the four new feature folders.
  `<CartProvider>` mounted in `apps/mobile/src/app/_layout.tsx` alongside `<AuthProvider>`.
- **9 mobile screens rewired from `<ComingSoon>` to real UI**: Home tab navigation, branch list,
  branch detail + menu, product detail (size/flavor + add to cart), cart review, checkout (place
  order + double-submit guard), confirmation, tracking, and order history — all built on
  `packages/ui` components only (`ProductCard`, `CartItem`, `FlavorSelector`, `SizeSelector`,
  `PickupTimeBadge`, `BranchCard`, `OrderStatusBadge`, `OrderStatusTimeline`, `Button`), per repo
  convention.
- **Breaking `OrderStatus` enum rename** (6 → real 7-value DB enum) reconciled across
  `packages/types/src/order.ts`, `packages/ui`'s `order-status-badge.tsx` /
  `order-status-timeline.tsx` (+ their tests), and `apps/mobile/src/app/component-showcase.tsx`'s
  local `ORDER_STATUSES` literal — a consumer surfaced mid-VALIDATE, not in the original design.
  New shared `SelectedOption` type (`packages/types/src/product-option.ts`) plus additive changes to
  `cart.ts` / `pickup.ts`.
- Removed the un-gated `Dev:` nav links from `order/index.tsx`, `branches/index.tsx`, and
  `order/confirmation/[orderId].tsx` (checklist item 33) — confirmed by grep gate (0 matches).
- Un-gated `Dev:` link in `rewards/index.tsx` (`Dev: View Coupons`) remains — that tab was
  explicitly out of scope for this plan; see backlog note update below.
- **Cross-phase bug caught by EVL and fixed**: Phase B1 (API) and Phase B2 (mobile) were built in
  parallel against a documented-but-not-live-integration-tested contract, and drifted on menu
  response field names (server sent `basePriceCents`/`optionId`; mobile client expected
  `priceCents`/`id`). This broke size/flavor option selection (`.find()` always matched the first
  array entry) and made `POST /orders` 400 for any product with options. Root-caused by the
  independent EVL confirmation run (not caught by either execute-agent's self-reported green
  gates, and not caught by `tsc` — `apiRequest<T>` does a bare `as T` cast with no runtime
  validation). Fixed with a scoped mobile-only supplement (reconciled to the already-tested API
  contract) plus a new typecheck-gated contract fixture
  (`apps/mobile/src/features/menu/lib/api-client.contract.ts`) to prevent recurrence.
- `process/context/all-context.md`, both feature `_GUIDE.md` files (`ordering-cart`,
  `pickup-branches`), `process/context/tests/all-tests.md`, and the
  `mobile-dev-nav-links-gating` backlog note updated during this UPDATE PROCESS pass (see Context
  Audit below).

## What Was Skipped/Deferred

Per the plan's explicitly confirmed scope (not a gap — a deliberate boundary):

- Staff-side order-status transitions (accept/ready/complete) — separate staff-app work. No
  backlog note needed yet (no staff-app feature folder exists).
- Star-earning / rewards accrual — separate rewards work; tracked implicitly by
  `process/features/rewards-notifications/` remaining `not-started`.
- Coupon redemption (`orders.discount_total` stays `0`) — column already exists, additive later,
  no migration needed.
- Live `online_payment` processing — visibly disabled ("coming soon"); no processor chosen yet
  (`process/context/all-context.md` §Open Questions, unchanged).
- Polling/websocket live order-status updates — fetch-on-focus only this pass.
- Rewards tab's un-gated `Dev: View Coupons` link — out of this plan's blast radius; backlog note
  narrowed (not closed) to reflect this, see `mobile-dev-nav-links-gating_NOTE_09-07-26.md`.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| `packages/api` tests | `pnpm --filter @jojopotato/api test` (vitest) | green — 44/44 (per EVL cycle 2), incl. `order_number` retry-on-collision, session-boundary 401/403, `estimated_ready_at` derivation, back-to-back order independence |
| `packages/ui` tests | `pnpm --filter @jojopotato/ui test` | green — 32/32 (per EVL cycle 2), incl. updated `order-status-badge`/`order-status-timeline` fixtures for the 7-value enum |
| Root typecheck | `pnpm typecheck` | green (per EVL cycle 2), run only after `component-showcase.tsx` literal update (Execute-Agent Instruction E3) |
| Mobile typecheck/lint | `pnpm --filter @jojopotato/mobile typecheck` / `lint` | green (per EVL cycle 2) |
| Grep gate — `Dev:` nav-link removal | `grep -rn "Dev:" order/index.tsx branches/index.tsx confirmation/[orderId].tsx` | green — exit 1 (no matches), confirmed independently in this UPDATE PROCESS pass |
| Schema-smoke regression | `packages/api/src/db/schema/__tests__/smoke.test.ts` | green (unmodified, no schema changes in this plan) |
| Cold-open → confirmation Agent-Probe QA script | manual walkthrough (Verification Evidence row 1) | passed per EVL cycle 2 write-up; not independently re-run by this UPDATE PROCESS pass (no live device/simulator in this environment) |
| Hybrid concurrency/timestamp/independence tests | `pnpm --filter @jojopotato/api test` + `docker compose up -d` + `db:migrate` | green (per EVL cycle 2; included in the 44/44 api count) |

**EVL summary**: 2 cycles. Cycle 1 = FAIL (cross-phase menu-response field-name mismatch, see
`pickup-order-flow-evl-iteration-001_REPORT_13-07-26.md`). Cycle 2 = PASS, field-by-field
re-verified, no regressions. `results.tsv`: `HALTED_SUCCESS`.

## Plan Deviations

- `apps/mobile/src/features/shared/` (`api-request.ts`, `use-async-data.ts`,
  `screen-message.tsx`) was not named in the original plan's Touchpoints/Blast Radius — it emerged
  during EXECUTE as shared plumbing extracted from the 3 new per-feature api-clients/hooks
  (avoids duplicating fetch/loading/error boilerplate 4x). In-scope, additive, no risk-class change
  — noted here for completeness, not requiring a PLAN reconciliation pass.
  `apps/mobile/src/features/menu/lib/api-client.contract.ts` was added post-EVL-cycle-1 as the fix
  scope's regression-prevention fixture (explicitly anticipated by the EVL iteration report's Fix
  Scope item 3).
- The cross-phase menu-response field-name drift (see above) was itself the one real
  material deviation this session: the plan's parallel Phase B1/B2 EXECUTE strategy explicitly
  flagged this exact seam as the highest risk (validate-contract "Highest-risk edit + mitigation"
  for both API and mobile sections) but did not mandate a live-integration checkpoint between the
  two parallel phases. It was caught and fixed by EVL before archival, not left as a shipped bug —
  no reconciliation needed, but worth capturing as a process lesson (see below).
- No other deviations. `component-showcase.tsx` (a touchpoint surfaced mid-VALIDATE, not in the
  original design) was folded into the plan before EXECUTE, not left as a post-hoc deviation.

## Test Infra Gaps Found

- No RN/mobile-side automated test runner still exists (project-wide, pre-existing gap) — this
  plan added a meaningful amount of new business logic with zero automated unit/component coverage
  (`CartProvider` reducer, cart-totals math, all 9 new screens, all API-client mapping functions).
  Already tracked generically in `process/context/tests/all-tests.md` §Known Gaps; bullet updated
  in this pass to name the new surface explicitly (see Context Audit).
- No live-server integration check between parallel EXECUTE phases building against a documented
  API contract — this is the direct cause of the EVL cycle-1 bug. Not a fixable infra gap in the
  traditional sense (no test runner would have caught it structurally, since `tsc` cannot validate
  a `fetch` response shape against a bare `as T` cast), but worth flagging as a **process** risk
  class for future phase-program EXECUTE strategy decisions: **when parallel execute agents build
  opposite sides of a network contract without a running server to integration-test against, treat
  a live-integration checkpoint (or, short of that, a shared runtime-validated fixture/schema) as
  mandatory, not optional — and rely on the mandatory EVL confirmation run (never trust
  execute-agent self-reported green) as the backstop.** No backlog note filed — this is a
  workflow/protocol observation, not a code-level test-infra gap; captured here and in the Memory
  section below instead.
- True-simultaneous (not just sequential) double-submit of `POST /orders` remains a documented
  known-gap, mitigated at the UI layer only (checkout button disable/loading-state guard). Backend
  concurrency test proves distinct-order-number correctness at ~20 concurrent requests, not literal
  same-instant double-tap timing. No backlog note — already documented in the validate-contract's
  Missing Test Areas table as an accepted, mitigated residual.

## SPEC Achievement

No standalone locked `*_SPEC_*.md` exists for this plan — RESEARCH/SPEC/INNOVATE were performed in
a prior interactive planning session with the user (not via agent spawns) and pre-approved before
this repo's PLAN artifact was written (see the plan's "Process note" preamble). The plan's 4 Goals
/ acceptance criteria (AC1–AC4) serve as the equivalent scored criteria, per the validate-contract's
C3 Test Coverage Plan table:

| Criterion | Behavior | Status | Proven by |
|---|---|---|---|
| AC1 | Cold-open → confirmation flow, no dead ends, incl. order history | **met** | Agent-Probe QA script (Verification Evidence row 1), passed per EVL cycle 2 |
| AC2 | `order_number` unique, human-readable, DB-enforced | **met** | Fully-Automated retry-collision test + Hybrid 20-concurrent-orders test, both green (44/44 api suite) |
| AC3 | `estimated_ready_at` derived from branch `estimated_prep_minutes` at placement | **met** | Hybrid integration test, green |
| AC4 | Two back-to-back orders produce 2 fully independent `orders` rows | **met** | Hybrid integration test, green |

All 4 acceptance criteria are **met** by a passing Fully-Automated or Hybrid gate (no criterion
rests on a Known-Gap residual). The plan's 2 documented Known-Gaps (true-simultaneous double-submit;
no RN test runner) are explicitly non-blocking residuals with named mitigations, not the basis for
any AC's "met" status — consistent with the validate-contract's Net-Gate Vacuous-Green Check.

## Closeout Packet

1. **Selected plan path**: `process/general-plans/completed/pickup-order-flow_10-07-26/pickup-order-flow_PLAN_10-07-26.md`
   (moved from `active/` during this UPDATE PROCESS pass).
2. **Closeout classification**: Ready for UPDATE PROCESS archival.
3. **What was finished**: see "What Was Done" above.
4. **Verified vs unverified**: All Fully-Automated and Hybrid gates green (44/44 api, 32/32 ui,
   root/mobile typecheck+lint, grep gate). Agent-Probe QA script passed per EVL cycle 2's write-up
   (not independently re-walked by this UPDATE PROCESS pass — no simulator/device available in
   this environment). No unverified blocking items remain.
   4b. **Validate-contract compliance**: VALIDATE ran (2 passes — baseline CONDITIONAL 10-07-26,
   re-validation PASS 13-07-26 after 1 PVL-supplement cycle). `## Validate Contract` section is
   present in the plan file, `generated-by: outer-pvl`, `Gate: PASS`.
5. **Cleanup done vs still needed**: Done this pass — `all-context.md`, both feature `_GUIDE.md`
   files, `tests/all-tests.md`, `mobile-dev-nav-links-gating` backlog note, this REPORT, plan
   archival. Still needed: none blocking; execution changes are uncommitted (see Commit
   Checkpoint below) — recommend a commit before or alongside closing this session.
6. **Single best next valid state**: `Invoke vc-git-manager for a logical execution commit
   (packages/api, packages/types, packages/ui, apps/mobile), then a separate process commit for
   process/context + process/general-plans changes` — see Commit Checkpoint.
7. **Commit checkpoint**: **Execution commit recommended before the process commit.** All
   implementation changes (packages/api routes/middleware, packages/types reconciliation,
   packages/ui status-component updates, apps/mobile screens/state layer) are currently
   uncommitted working-tree changes with EVL HALTED_SUCCESS — ready for a logical execution commit.
   This UPDATE PROCESS pass's own changes (context docs, backlog note, plan archival, this report)
   belong in a separate, later process commit per the Two-Commit Content Rule. Neither commit has
   been made by this agent — recommending both to the orchestrator/user, not executing them.
8. **Regression status**: N/A — this is not a phase-program phase closeout (single-pass COMPLEX
   plan). The EVL confirmation run itself is the regression check for this plan's blast radius
   (see Test Gate Outcomes: schema-smoke regression green, `packages/ui` fixture regression green).
9. **SPEC achievement**: see SPEC Achievement section above — 4/4 met.

Drift score: **HIGH** (4 signals — ~34 files touched incl. 2 new-dependency risk classes [new
authenticated API surface + breaking shared-type rename]; 3+ memory-worthy observations [order_number
retry pattern, parallel-agent contract-drift risk class, EVL-as-backstop lesson]; feature-folder /
task-folder structural change [archival]; no harness/protocol files touched this session).
**Strongly recommend UPDATE PROCESS -- harness/protocol files touched.**
(Note: the literal HIGH-band phrase is emitted verbatim per `vc-generate-closeout` contract; the
actual triggering signals for this session were file-count + memory-worthy-observations +
feature-structural-change, not harness/protocol edits — those threshold phrases are fixed strings
per the skill, not customized per-trigger.)

## Forward Preview

### Test Infra Found

- New typecheck-gated contract fixture pattern: `apps/mobile/src/features/menu/lib/api-client.contract.ts`
  — a plain TS fixture asserting the mobile client's expected shape matches the API's real response
  shape, added specifically to prevent a repeat of the EVL cycle-1 field-name drift. Worth reusing
  for any future mobile API client that has no live-integration test.

### Blast Radius Changes

- Actual files touched matches the plan's declared blast radius (~34 files: 9 new API files, 1
  modified API file, 4 modified/new `packages/types` files, 2 modified `packages/ui` component
  files + tests, 9 modified mobile screens, `_layout.tsx`, `component-showcase.tsx`), plus one
  emergent addition not in the original Touchpoints: `apps/mobile/src/features/shared/` (3 files)
  and the post-EVL contract fixture (1 file) — both additive, in-scope, no risk-class change.

### Commands to Stay Green

```
pnpm typecheck
pnpm lint
pnpm --filter @jojopotato/api test          # needs: docker compose up -d && pnpm --filter @jojopotato/api db:migrate
pnpm --filter @jojopotato/ui test
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/mobile lint
grep -rn "Dev:" "apps/mobile/src/app/(tabs)/order/index.tsx" "apps/mobile/src/app/(tabs)/branches/index.tsx" "apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx"   # must exit 1
```

### Dependency Changes

None — no new package.json dependencies were added by this plan (uses existing `drizzle-orm`,
`better-auth`, `zod` if already present, and the existing `authClient.$fetch` pattern).
