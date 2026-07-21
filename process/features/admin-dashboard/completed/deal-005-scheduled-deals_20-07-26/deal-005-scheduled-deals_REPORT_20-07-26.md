---
phase: deal-005-scheduled-deals-phase1
date: 2026-07-20
status: COMPLETE
feature: admin-dashboard
plan: process/features/admin-dashboard/active/deal-005-scheduled-deals_20-07-26/deal-005-scheduled-deals_PLAN_20-07-26.md
---

# DEAL-005 Phase 1 — Scheduled Deals: Simple Window — Phase Report

Issue: #127 (DEAL-005, P2), Phase 1 of 3. Branch `adm-deal-005-p2`, commit `5e9261b4`.

## What Was Done

Added a nullable `[starts_at, ends_at)` window to deal-products via a new `deal_schedules`
table (migration `0017`, additive — one `CREATE TABLE`, zero changes to `products`, no
backfill). One shared pure helper (`packages/api/src/routes/lib/deal-schedule.ts`,
`isDealScheduleLive()` + `resolveLiveDealProductIds()`) is called identically at BOTH
enforcement points named in the plan and no others:

1. **Menu read path** (`packages/api/src/routes/branches.ts`, `?isDeal=true` branch) — a
   targeted second query (per binding Execute-Agent Instruction E1, not an inline SQL join)
   excludes out-of-window deal-products.
2. **Order placement** (`packages/api/src/routes/orders.ts`) — re-checks the window against
   `now` at placement time (not cart-add time) and rejects with a specific `OrderError(400,
   ...)` message when it has closed since the cart line was added.

Admin surface: `routes/admin/deals.ts` CRUD gained optional `startsAt`/`endsAt` (mirrors
`offers.ts`'s `z.coerce.date()` + inverted-window 400 reject), written via a transactional
select-then-branch replace (per binding Execute-Agent Instruction E2 — no unique constraint
on `deal_product_id`, no `.onConflictDoUpdate()`, so Phase 2's multi-row recurrence design is
never blocked by a constraint that would have to be dropped again). `serializers.ts` exposes
the resolved window on `AdminDealProduct` only — the public `ApiDeal`/`serializeDeal` and the
`GET /branches/:id/menu` response shape are untouched (D2 — out-of-window = hidden, not
annotated; no window data reaches the customer wire contract). `apps/admin` gained two
`DateTimeField`s on the create wizard Step 1 and the deal manage page (both reusing the
existing `offer-form.tsx` `localNow`/`min`/`endMin` pattern verbatim), plus a
Scheduled/Live/Expired badge via `apps/admin/src/lib/entity-status.ts`'s `windowPhase()`.

Gates, independently EVL-confirmed by a separately spawned tester (not execute-agent's
self-report): API 505 → 547 tests; admin 111 → 127 tests; both typechecks clean;
`pnpm format:check` clean. Migration `0017` applies cleanly against the local dev DB.

**Manual walkthrough performed and passed by the user this session** (not left as an owed
Agent-Probe residual, unlike several recent phases in this program): empty window (no-backfill
case, deal visible), future `starts_at` → hidden + `Scheduled` badge, past `ends_at` → hidden +
`Expired` badge, surrounding window → visible + `Live` badge, cleared window → visible again,
plus the in-cart expiry rejection and the wizard Step 1 inverted-window block. This phase is
therefore VERIFIED, not just CODE DONE — its own Phase Completion Rules require exactly this
(every Verification Evidence row is Fully-Automated, so there is no separate UI-only residual
gating VERIFIED for this plan, and the manual glance was performed on top of that).

## What Was Skipped/Deferred

Phases 2 (`deal_schedules` recurrence — day-of-week/time-of-day rows) and 3 (mobile "Starts
Friday" surfacing) of issue #127 are explicitly out of scope for this plan and remain
unbuilt — no backlog note needed, they are already tracked as future phases of the same
issue. No other deferrals.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| API suite | `pnpm --filter @jojopotato/api test` | green — 505 → 547 tests |
| Admin suite | `pnpm --filter @jojopotato/admin test` | green — 111 → 127 tests |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | clean |
| Admin typecheck | `pnpm --filter @jojopotato/admin typecheck` | clean |
| Format | `pnpm format:check` | clean |
| Migration apply | `pnpm --filter @jojopotato/api db:migrate` | 0017 applies cleanly |

All 5 test-gate commands from the plan's Autonomous Goal Block were independently re-run by a
separately spawned tester at EVL, not taken on the execute agent's own report.

## Plan Deviations

None material. One wording correction is recorded below (see "Correction made this pass").

## Test Infra Gaps Found

None. Every Verification Evidence row in the plan (AC1–AC11) is Fully-Automated; Known-Gap was
explicitly banned for AC3 (no-backfill regression) and AC6 (window-closed-at-placement
rejection) and was not used anywhere in this plan. No backlog test-building stub is required.

## SPEC Achievement

This plan has no separate `*_SPEC_*.md` — it is a single COMPLEX plan (not phase-program
inner-loop, no governing umbrella SPEC) whose own `## Acceptance Criteria` section (11 items)
functions as the achievement checklist. All 11 are scored **met**:

| AC | Criterion | Status |
|---|---|---|
| AC1 | future `starts_at` → hidden + order rejected | met |
| AC2 | past `ends_at` → hidden + order rejected | met |
| AC3 (HARD) | zero-rows deal unchanged from before (no-backfill) | met |
| AC4 | in-window but `is_active=false` stays hidden | met |
| AC5 | `startsAt >= endsAt` → 400 at admin boundary | met |
| AC6 (HARD) | window-closed-between-cart-add-and-placement → rejected | met |
| AC7 | half-open boundary correct at exact `ends_at` instant | met |
| AC8 | wizard Step 1 + manage page persist/edit both dates | met |
| AC9 | admin badge distinguishes Scheduled/Live/Expired | met |
| AC10 | full API suite green, zero regressions | met |
| AC11 | admin suite green | met |

Zero unmet criteria — no backlog NOTE required for SPEC gaps on this plan.

## Closeout Packet

1. **Selected plan path:** `process/features/admin-dashboard/active/deal-005-scheduled-deals_20-07-26/deal-005-scheduled-deals_PLAN_20-07-26.md`
2. **Closeout classification:** Ready for UPDATE PROCESS archival
3. **What was finished:** see "What Was Done" above — full Phase 1 scope, both enforcement
   points, admin CRUD/UI/badge, all green.
4. **Verified vs unverified:** Verified — all 11 ACs Fully-Automated and passing, EVL-confirmed
   independently; manual admin-UI walkthrough performed and passed by the user this session.
   Unverified: nothing outstanding for Phase 1 scope.
4b. **Validate-contract compliance:** present, inline in the plan (`## Validate Contract`),
   `Gate: PASS`, `generated-by: outer-pvl`, single VALIDATE pass, 0 FAILs / 0 unresolved
   CONCERNs.
5. **Cleanup done vs still needed:** Done this pass — phase report written, plan Status/Phase
   Completion Rules stamped, `all-context.md` implementation-state bullet + Scan Metadata delta
   + routing-table row added, task folder archived to `completed/`. Nothing further needed.
6. **Single best next valid state:** `process/features/admin-dashboard/backlog/` — Phase 2
   (`deal_schedules` recurrence) and Phase 3 (mobile surfacing) of issue #127 are the next
   candidate work items but are NOT scoped or planned by this pass; a fresh RESEARCH/PLAN cycle
   is needed for either when picked up.
7. **Commit checkpoint:** N/A — execution was already committed by the user before this UPDATE
   PROCESS pass began (commit `5e9261b4`, branch `adm-deal-005-p2`). This pass makes doc-only
   changes (report, plan reconciliation, context updates, archival) which the user will commit
   separately; no `vc-git-manager` invocation was requested and none was made.
8. **Regression status:** N/A — not a phase-program inner loop; the plan's own regression
   claims (regular non-deal menu query byte-identical, structurally guaranteed by the
   pre-existing `is_active` filter) are covered by AC4/"implicit — regular-menu no-diff" in the
   Verification Evidence table above, both Fully-Automated and green.
9. **SPEC achievement:** see "SPEC Achievement" section above — 11/11 met.

**Drift score: HIGH** (4 signals — (a) 21 files changed across the commit, +2 for ≥10 files;
(c) ≥3 memory-worthy durable facts recorded this pass — half-open-window single-source-of-truth
pattern, no-third-read-path confirmation, deliberate no-unique-constraint rationale, deliberate
FK-cascade divergence, derived-not-seeded manage-page state avoiding the STAFF-005 bug class,
+1; (d) feature-folder structural change — task folder archived `active/` → `completed/`, +1).
No `.claude/`/`.codex`/protocol-doc files were touched, so this is not literally
"harness/protocol files touched" — the required wording is emitted verbatim per the skill
contract regardless of which specific signals fired.

Strongly recommend UPDATE PROCESS -- harness/protocol files touched.

## Correction made this pass

The EXECUTE report (commit message) states the AC3 no-backfill mutation broke "6 tests,
including 3 pre-existing MENU-003 tests." An independently spawned EVL tester's mutation run
measured **14 tests across 4 files** for the equivalent no-backfill check. These are not
contradictory — they were two DIFFERENT mutations: execute-agent's mutation made
`resolveLiveDealProductIds` skip deals lacking schedule rows; the EVL tester's mutation made
`isDealScheduleLive([])` return `false`, a broader change with a larger blast radius. Both
independently prove the no-backfill test (AC3) is non-vacuous — recorded here as two separate
experiments confirming the same result, not as a discrepancy to resolve.

## Forward Preview

### Test Infra Found

None new. `packages/api`, `apps/admin` runners were already established (see
`process/context/tests/all-tests.md`); this phase only added test files within those existing
runners.

### Blast Radius Changes

Matches the plan's declared blast radius (`packages/api`: schema, 2 route files, 1 new lib
file, serializers; `apps/admin`: 2 feature files, 1 shared lib file) plus their corresponding
test files — 21 files total per `git show --stat 5e9261b`. No files outside the declared blast
radius were touched.

### Commands to Stay Green

```
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/admin typecheck
pnpm format:check
```

### Dependency Changes

None. No new dependencies were added.
