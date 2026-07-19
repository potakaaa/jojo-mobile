---
phase: phase-07-analytics
date: 2026-07-17
status: COMPLETE
feature: admin-dashboard
plan: process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-07-analytics_PLAN_14-07-26.md
---

# Phase 7 — Basic Analytics Dashboard (ADM-007, #45) — EXECUTE/EVL Report

**FINAL PHASE OF THE 8-PHASE ADMIN-DASHBOARD PROGRAM.** Branch: `feat/adm-007-analytics`
(rooted at merged `development`, which already includes Phase 6's `feat/adm-006-branchview`
merge). Commit: `ba88318` (feat — analytics dashboard, 8 KPIs, read-only aggregation). Status:
✅ VERIFIED — EXECUTE complete, EVL independently confirmed green. With this phase, all 8 phases
of the admin-dashboard program are ✅ VERIFIED — the program's scoped Definition of Done is met.

## What Was Done

- `packages/api/src/routes/admin/analytics.ts` (new) — `GET /api/admin/analytics?from=&to=[&branchId=]`,
  a single read-only aggregation route returning all 8 metrics in one payload:
  `ordersPerBranch`, `averageOrderValueCents`, `dealsSplit`, `repeatPurchaseRate`, `starsEarned`,
  `rewardsUnlocked`, `rewardsRedeemed`, `topSellingProducts`, `newVsReturning`. Appended to the
  existing append-only `/api/admin` aggregator (`routes/admin/index.ts`) — the **11th confirmed
  consumer** of the pattern (after users/branches/products+categories/deals/promotions+offers+
  coupons/rewards/orders). `requireAdmin` + `adminCors` inherited structurally from the router
  mount, never re-checked per-handler.
- `packages/api/src/routes/admin/lib/analytics-range.ts` (new) — a pure Manila-timezone
  (Asia/Manila, fixed +08:00, no DST) half-open-interval range helper (D3), unit-tested in
  isolation (Execute-Agent Instruction E3) in addition to the AC5 integration-level boundary
  fixture.
- `packages/types/src/admin.ts` (additive) — `AdminAnalytics` response type incl.
  `AdminTopSellingProduct`/`AdminNewVsReturning` sub-shapes. No existing admin type touched.
- `packages/api/src/routes/admin/__tests__/admin-analytics.integration.test.ts` (new) — 18
  seeded exact-value fixture cases covering AC1–AC12 (per-branch counts, AOV, deals split with
  double-signal dedup, repeat-purchase rate, two-range recalculation + Manila 23:30/00:30
  boundary, stars/rewards, role-matrix rejection, param validation, top-selling products,
  new-vs-returning incl. the E1 cancelled-first-order edge case).
- `apps/admin/src/features/analytics/**` (new) — `lib/admin-analytics-api.ts` (fetch wrapper,
  `credentials:'include'`, mirrors `admin-branches-api.ts`), `hooks/use-analytics.ts`
  (react-query, key `['admin','analytics',from,to,branchId]` with `branchId` normalized to a
  stable `'all'` placeholder when unset per Execute-Agent Instruction E4), components
  `metric-card.tsx` (new shared stat-tile composite), `time-range-picker.tsx` (7/30-day presets +
  custom from/to), `branch-orders-table.tsx` + `top-products-table.tsx` (both on the existing
  `data-table` composite).
- `apps/admin/src/routes/(dashboard)/analytics.tsx` (new) — single screen, no `<Outlet/>` split
  needed (no detail child route).
- `apps/admin/src/config/nav-config.ts` (modified) — new Analytics `NavItem` created under
  Management group (no prior disabled placeholder existed — a net-new entry, same class as
  Phase 5's rewards nav entry and Phase 6's orders nav entry).

**Correctness fixes applied per Execute-Agent Instructions E1–E5 (all from the PVL validate-contract):**
- **E1 (substantive):** the `newVsReturning` global earliest-order lookup applies the SAME D2
  status filter (`status NOT IN ('cancelled','rejected')`) as the range-scoped base order set — a
  user whose only-ever order was cancelled is correctly classified `new` on their first real order,
  not misclassified `returning`. Proven by AC12's 4th fixture user.
- **E2 (substantive):** the D1 "has a deal" signal is computed as one explicit per-order boolean
  union (`coupon_id != null || deal_id != null || orderId ∈ bundleOrderIds`), so a coupon+bundle
  order is never double-counted across `withDeals`/`withoutDeals`. Proven by AC3's double-signal
  fixture.
- **E3 (minor):** direct unit test added for the pure Manila-boundary range-helper function, in
  addition to the AC5 integration-level fixture.
- **E4 (minor):** `branchId` normalized to `'all'` in the react-query key tuple when unset, so
  "all branches" and a specific branch produce distinct, non-colliding cache entries.
- **E5 (minor, docs-only):** a file-header comment in `analytics.ts` documents that this route
  intentionally uses Asia/Manila day-boundary semantics (D3), diverging from Phase 6's
  `orders.ts` UTC-day convention — a deliberate, recorded divergence, not a defect.

## What Was Skipped / Deferred

- Nothing from the Implementation Checklist was skipped — all 10 steps (4 server, 6 client)
  applied, including both D8 net-new metrics (top-selling products, new-vs-returning).
- No chart library was added (D6, locked decision — stat cards + tables only at MVP).
- Order-status funnel, stars breakage, offer-coupon redemption rate, peak-hours, and prep-time
  metrics were explicitly deferred to a Phase-2 note per D8 — not part of this phase's scope.
- No E2E/browser runner exists for `apps/admin` (project-wide gap, carried from every prior phase)
  — AC9's visual half and AC10's PII code-review scan remain user-run Agent-Probe items, same
  standing convention as P2 AC7 / P3 AC8 / Phase 5 G10 / Phase 6's precedent.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| AC1–AC8, AC11–AC12 (`packages/api`) | `pnpm --filter @jojopotato/api test` | 493/493 green (baseline 468 + 25 new: 18 `admin-analytics.integration.test.ts` + 7 `analytics-range` unit tests, 0 regressions) |
| Structural (`packages/api`) | `pnpm --filter @jojopotato/api typecheck` | clean, 0 errors |
| `apps/admin` component (AC9 wiring half) | `pnpm --filter @jojopotato/admin test` | 72/72 green (baseline 58 + 14 new component tests: picker preset math, screen renders all 8 metrics from mocked payload incl. top-products table + new-vs-returning card, range-change updates hook params) |
| Structural (`apps/admin`) | `pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin build` | clean, 0 errors (analytics chunk emitted) |
| Format | `pnpm format:check` | clean |
| Regression | full 493/493 API run + 72/72 admin run | pass — no regression against Phases 0–6/ADM-008/Fix-6 surfaces |
| AC9 (visual half) | manual admin UI walkthrough (Agent-Probe, user-run) | owed — standing project-wide `apps/admin` E2E-runner gap, non-blocking |
| AC10 | code-review PII field-shape scan | owed — Agent-Probe, non-blocking, no per-customer field in any of the 8 metric shapes by construction |

EVL (this UPDATE PROCESS pass) independently re-confirmed the automated gates above via
vc-tester — execute-agent's own green report was not taken on faith; the orchestrator-owned
confirmation run reproduced the same 493/493 + 72/72 + clean typecheck/build/format result
exactly, matching what execute-agent reported. Money-adjacent gates (AC2 AOV, AC3 deals-split,
AC6 stars/rewards, AC11 top-selling-products) are ALL real passing Fully-Automated fixtures —
Known-Gap is banned for these per the program charter and was not used.

## Plan Deviations

Two minor, within-blast-radius deviations, both benign:
1. Added `asc(products.name)` as a secondary tiebreak on `topSellingProducts` ordering — when two
   products tie exactly on `SUM(quantity)`, the plan's own "What this coverage does NOT prove"
   section flagged tie-break as unspecified; execute-agent added a deterministic secondary sort so
   repeated calls return stable ordering. No value/behavior change to the ranking itself.
2. A test-fixture user-isolation detail in `admin-analytics.integration.test.ts` (scoping seeded
   fixture users to avoid cross-test interference within the hermetic self-seeding pattern) — a
   test-hygiene detail, not a production-code deviation.

Neither deviation required a plan-scope change or a new Execute-Agent Instruction. All 5
validate-contract Execute-Agent Instructions (E1–E5) were applied exactly as written — see "What
Was Done" above for the substantive/minor breakdown.

## Test Infra Gaps Found

None new this phase. The `apps/admin` E2E-runner gap remains the same standing project-wide item
tracked in `process/context/tests/all-tests.md` (AC9 visual half, AC10 owed as Agent-Probe). The
`api-test-db-concurrency-guard` backlog note's serial-run discipline was followed (no collision
observed this session).

## SPEC Achievement

This phase has no dedicated `*_SPEC_*.md` — governed by the admin-dashboard umbrella program's
Program Goal Charter (phase-program inner loop skips per-phase SPEC). Scoring against the phase
plan's own AC1–AC12:

| AC | Criterion | Status | Proving gate |
|---|---|---|---|
| AC1 | `ordersPerBranch` exact counts, cancelled/rejected excluded, zero-order branch shows 0 | met | Fully-Automated |
| AC2 | `averageOrderValueCents` exact cents, cancelled excluded, post-discount total used | met | Fully-Automated |
| AC3 | `dealsSplit` partition sums to total, all 3 D1 signals, double-signal counted once (E2) | met | Fully-Automated |
| AC4 | `repeatPurchaseRate` exact ratio, pending-only user in denominator not numerator | met | Fully-Automated |
| AC5 | All 8 metrics recalculate across two ranges + Manila boundary edge | met | Fully-Automated |
| AC6 | stars/rewards exact per D4/D5, offer coupons excluded (DB-CHECK backed) | met | Fully-Automated |
| AC7 | Staff/customer rejected on `/api/admin/analytics` | met | Fully-Automated |
| AC8 | 400 on missing/malformed/inverted range params | met | Fully-Automated |
| AC9 (wiring) | Screen renders 8 metrics from mocked payload; picker/hook wiring | met | Fully-Automated |
| AC9 (visual) | Live visual render + range-change behavior against dev DB | owed (non-blocking) | Agent-Probe, user-run |
| AC10 | No per-customer identifying field in any response payload | owed (non-blocking) | Agent-Probe code-review scan |
| AC11 | `topSellingProducts` exact quantity/revenue, DESC order, 10-row cap, branch-scoped | met | Fully-Automated |
| AC12 | `newVsReturning` exact classification incl. cancelled-first-order edge (E1); sums to distinct-user count | met | Fully-Automated |

10/12 criteria met by a real passing Fully-Automated gate; the 2 remaining (AC9 visual, AC10) are
Agent-Probe residuals consistent with every prior phase in this program's standing
`apps/admin` E2E-runner gap — not new debt, not blocking, and never resting on Known-Gap (they are
explicitly Agent-Probe strategy in the validate-contract, not an unproven claim). All 4
money-adjacent ACs (AC2, AC3, AC6, AC11) — the program's Known-Gap-banned tier — are real passing
Fully-Automated tests.

## Closeout Packet

1. **Selected plan path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-07-analytics_PLAN_14-07-26.md`
2. **Closeout classification:** Ready for UPDATE PROCESS archival (of the phase status) —
   ✅ VERIFIED. All Fully-Automated gates green, independently EVL-confirmed matching
   execute-agent's report exactly; the CONDITIONAL PVL gate's 5 concerns were all resolved via
   Execute-Agent Instructions E1–E5 this cycle, with no plan-scope change and no Known-Gap rows.
   The 2 owed Agent-Probe items (AC9 visual, AC10) are the standing project-wide residual, not a
   blocker to VERIFIED status per this program's own established precedent (P2 AC7, P3 AC8 partial,
   Phase 5 G10).
3. **What was finished:** see "What Was Done" above — the full 8-metric analytics surface, both
   server and client, plus 5 correctness/hygiene fixes from the validate-contract.
4. **Verified vs unverified:** 10/12 ACs verified by a real passing automated gate; AC9 (visual
   half) and AC10 remain Agent-Probe-owed, non-blocking, same standing pattern as every prior
   phase in the program.
4b. **Validate-contract compliance:** present, inline in plan, Gate: CONDITIONAL (17-07-26,
   `generated-by: inner-pvl: phase-7`) — 0 FAILs, 5 CONCERNs, all resolved via Execute-Agent
   Instructions E1-E5, execution proceeded and all instructions were applied.
5. **Cleanup done vs still needed:** this pass — phase report written, Phase Loop Progress Steps
   6/7 ticked, plan Status stamped ✅ VERIFIED, umbrella `## Current Execution State` + Phase
   Map/Ordering/Program Status tables reconciled marking the ENTIRE 8-phase PROGRAM COMPLETE,
   `all-context.md` updated with a Phase 7 delta bullet + program-completion note + Scan Metadata
   entry. Still needed: user decision on whether the `admin-dashboard_14-07-26/` task folder
   (and the sibling `adm-008-coupons_16-07-26`/`adm-008-free-mechanics_16-07-26` folders held OPEN
   for follow-up exploration) move to `completed/` — flagged for the user, not auto-moved this
   pass (see umbrella plan reconciliation notes).
6. **Next valid state:** No next phase — this was the program's final phase. Recommend: (a) user
   reviews the flagged archival decision for the task folder; (b) any further admin-dashboard work
   (Customers module / Tier 3, ADM-008 coupons follow-up exploration, offer-usage-limits backlog
   item, coupons mutual-exclusivity follow-up if not already resolved) should be scoped as a new
   feature-folder task or a follow-up plan, not folded back into this now-complete program.
7. **Commit checkpoint:** Execution commit already made (`ba88318`) — this pass is process-only
   (plan/report/umbrella/context edits). A separate `process(admin): ...` commit is recommended
   for this pass's doc changes; do not fold into the execution commit (see staging command at the
   end of this session's output).
8. **Regression status:** Regression checkpoint against P1 (`requireAdmin` role matrix), P2
   (`branches` list — the branch-scoping source), P5 (rewards/stars source columns), and P6
   (`orders` source columns/status enum) all re-run as part of the full 493/493 API suite pass —
   no regression against any earlier phase surface.
9. **SPEC achievement:** see table above — 10/12 met, 2 owed-non-blocking Agent-Probe residuals,
   zero unmet-and-uncovered criteria, zero Known-Gap rows anywhere in the money-adjacent tier.

Drift score: MEDIUM (3 signals: (a) 5+ files touched → +1, ≥10 not reached → total files ~11 across
`packages/api`/`apps/admin`/`packages/types` → +2 for source count band; (c) 3+ memory-worthy
observations this pass — program-completion milestone, 11th append-only aggregator consumer,
Manila-vs-UTC cross-phase timezone divergence note; (d) feature-folder structural reconciliation
across phase plan + umbrella plan marking the full program complete). No `.claude/`/`.codex`/
protocol-doc edits this pass. Recommend UPDATE PROCESS -- significant changes detected. (This pass
IS that UPDATE PROCESS.)

---

## Program Completion Note

This phase closes the admin-dashboard program's scoped Definition of Done: all 8 phases
(P0 Scaffold, P1 Auth/RBAC, P2 Branches CRUD, P3 Products/Categories CRUD, P4a Deals-as-Products,
P5 Rewards CRUD, P6 Orders view, P7 Analytics) are now ✅ VERIFIED. The two HARD program-level
invariants (order_items snapshot integrity — P3 AC1; star_transactions retroactivity — P5) both
have real passing regression tests, Known-Gap never used for either. The inserted ADM-008 Coupons
+ Fix 6 sub-program is CODE-COMPLETE and held OPEN in `active/` per the user's standing decision
for further follow-up exploration — this is a deliberate, tracked exception to full archival, not
an oversight. See the umbrella plan's `## Current Execution State` for the authoritative program
closeout summary.
