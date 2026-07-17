---
phase: phase-06-orders
date: 2026-07-17
status: COMPLETE
feature: admin-dashboard
plan: process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-06-orders_PLAN_14-07-26.md
---

# Phase 6 — Orders View by Branch (ADM-006, #44) — EXECUTE/EVL Report

Branch: `feat/adm-006-branchview` (rooted at `development`'s PR #112 merge commit `772e2fd`,
Phase 5 Rewards CRUD). Commit: `7bb0918` (feat — read-only cross-branch orders view). Status:
✅ VERIFIED — EXECUTE complete, EVL independently confirmed green, and the user ran and passed
the Agent-Probe UI walkthrough this session.

## What Was Done

- `packages/api/src/routes/admin/orders.ts` (new) — `GET /api/admin/orders` (cursor-paginated
  list, filterable by `branchId`/`status`/`dateFrom`/`dateTo`, AND-composed) and
  `GET /api/admin/orders/:orderId` (detail). Appended to the existing append-only `/api/admin`
  aggregator (`routes/admin/index.ts`) — the **10th confirmed consumer** of the pattern
  (after users/branches/products+categories/deals/promotions+offers+coupons/rewards).
  `requireAdmin` + `adminCors` inherited structurally from the router mount, never re-checked
  per-handler. Read-only by construction: no `POST`/`PATCH`/`PUT`/`DELETE` verb anywhere under
  `/api/admin/orders*` (D1 — no admin write path; status transitions stay a staff-only action via
  STAFF-003's state machine).
- `packages/api/src/routes/lib/serializers.ts` (additive) — `AdminOrderSummary`/`AdminOrderDetail`
  interfaces + `serializeAdminOrderSummary`/`serializeAdminOrderDetail` that CALL the existing
  staff serializers (`serializeStaffOrderSummary`/`serializeStaffOrderDetail`) and spread
  admin-only fields on top (`branchId`, `branchName`, `customerName`, `customerPhone`,
  `discountTotalCents`, `couponId`, `dealId`) — D4's "compose, don't duplicate" decision,
  guaranteeing AC3 field-parity by construction rather than by hand-matching two independent
  serializers. No existing staff/public export modified.
- **PII boundary (D2, locked):** customer `name` + `phone` only — no `email`, no better-auth
  credential/session fields anywhere in the response. Proven by an automated field-shape
  presence/absence assertion (AC6), not a code-review judgment call.
- `packages/api/src/routes/admin/__tests__/admin-orders.integration.test.ts` (new, 531 lines) —
  20 new supertest cases reusing the `makeUser(role)` self-seeding fixture: branch filter (AC1),
  status filter across all 8 enum values incl. `rejected`, 400 on unknown value (AC2), date-range
  boundary + filter composition + cursor pagination round-trip (AC1/D3/D6), admin-vs-staff detail
  field-by-field parity (AC3), 404 unknown id, 403 customer/staff + 401 unauthenticated on both
  routes (AC4), mutation-verb absence probe — `POST`/`PATCH`/`PUT`/`DELETE` never handled, 404
  (AC5), PII field presence/absence (AC6).
- `apps/admin/src/features/orders/**` (new) — `lib/admin-orders-api.ts` (fetch wrapper +
  query-string builder, `credentials:'include'`), `hooks/use-admin-orders.ts` (react-query, key
  `['admin','orders', filters, cursor]`), `components/{order-filter-bar,order-list}.tsx`.
  `apps/admin/src/routes/(dashboard)/{orders.tsx,orders.index.tsx,orders.$orderId.tsx}` — the
  Outlet+index layout split (P3 nested-detail-route precedent, applied proactively, no repeat of
  the P3 bug). `nav-config.ts` gained a new Orders `NavItem` under Management (Execute-Agent
  Instruction E1 — no prior disabled placeholder existed to "enable", same class of deviation as
  Phase 5's rewards nav entry).
- **List UI (D7):** `data-table`/`status-badge` composites reused (no new shared primitives);
  native `<select>` filter bar (branch/status/date-range), matching the offer-form convention —
  no new shared `Select` primitive built (deferred per D7 until a second consumer needs it);
  react-query with the existing ~30s `staleTime` caching model plus a 15s `refetchInterval`
  poll-while-mounted for live status freshness while an admin is on the page (fetch-on-focus +
  polling remains the app-wide realtime convention — no websockets/push infra added).
- `apps/admin/src/routeTree.gen.ts` — regenerated (TanStack Start route-tree codegen artifact,
  not hand-edited).

## What Was Skipped / Deferred

- Nothing from the plan's Implementation Checklist was skipped — all 10 steps applied.
- `packages/types/src/admin.ts` shared types were NOT added (per the plan's own conditional
  wording — "ONLY if a second consumer outside `packages/api` needs them"); `AdminOrderSummary`/
  `AdminOrderDetail` stayed serializer-local, matching the established `AdminBranch`/`AdminReward`
  convention. Confirmed at inner-loop RESEARCH per the plan's own instruction, not a deviation.
- No E2E/browser runner exists for `apps/admin` (project-wide gap, carried from P2 AC7 / P3 AC8 /
  Phase 5 G10) — but for THIS phase the Agent-Probe UI walkthrough was actually PERFORMED and
  PASSED by the user this session (see Test Gate Outcomes), so it is not a residual for Phase 6.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| AC1–AC7 (`packages/api`) | `pnpm --filter @jojopotato/api test` | 468/468 green (baseline 448 + 20 new `admin-orders.integration.test.ts` cases, 0 regressions) |
| Structural (`packages/api`) | `pnpm --filter @jojopotato/api typecheck` | clean, 0 errors |
| `apps/admin` component | `pnpm --filter @jojopotato/admin test` | 58/58 green (baseline unchanged — no new component test file added, filter-bar/order-list are network-hook-bound, matching the documented Fix-4/ADM-006-precedent decision to skip RTL tests for that class of component) |
| Structural (`apps/admin`) | `pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin build` | clean, 0 errors |
| Format | `pnpm format:check` | clean |
| Regression (P1/P2) | `require-admin.integration.test.ts` + `admin-branches.integration.test.ts` subset | pass, part of the full 468/468 run |
| AC1/AC3/AC6 UI layer | manual admin UI walkthrough (Agent-Probe, user-run) | **PASSED — performed by the user this session, 17-07-26** |

EVL (this UPDATE PROCESS pass) independently re-confirmed the automated gates above via
vc-tester — execute-agent's own green report was not taken on faith; the orchestrator-owned
confirmation run reproduced the same 468/468 + 58/58 + clean typecheck/build/format result
exactly. AC1/AC3/AC6's UI-layer Agent-Probe gate was performed and confirmed passing by the
user directly (filters, pagination, detail render, PII display all matched D2) — this is the
project-wide `apps/admin` E2E-runner gap being satisfied by its documented manual-walkthrough
fallback, not a residual owed.

## Plan Deviations

None. All 10 Implementation Checklist steps were applied as written; the 4 non-blocking
Execute-Agent Instructions (E1–E4) recorded in the validate-contract were informational, not
scope changes:
- E1 (create new Orders NavItem — applied, no disabled placeholder existed).
- E2 (Zod query-param validation style — a deliberate choice, not required to be documented
  since it stayed within the contract's stated either/or; per-field validation convention used,
  consistent with `products.ts`/`offers.ts`/`deals.ts`/`coupons.ts`).
- E3 (no exact filtered+paginated fetch-wrapper precedent in `apps/admin` — new ground, built
  as instructed with the `['admin','orders', filters, cursor]` query-key shape).
- E4 (serial-only test-DB run to avoid the tracked concurrency gap — followed; no collision
  observed this session).

## Test Infra Gaps Found

None new this phase. The `apps/admin` E2E-runner gap remains the same standing project-wide
item tracked in `process/context/tests/all-tests.md` — not new debt, and for this phase it was
successfully bridged by the user's own manual walkthrough rather than left as an owed residual.

## SPEC Achievement

This phase has no dedicated `*_SPEC_*.md` — governed by the admin-dashboard umbrella program's
Program Goal Charter (phase-program inner loop skips per-phase SPEC). Scoring against the phase
plan's own AC1–AC7 (closest equivalent to acceptance criteria):

| AC | Criterion | Status | Proving gate |
|---|---|---|---|
| AC1 | Branch filter — only that branch's orders; omitted filter unfiltered; AND composition; cursor pagination (D3) | met | Fully-Automated, `admin-orders.integration.test.ts` |
| AC2 | Status filter cross-branch, all 8 enum values, 400 on unknown | met | Fully-Automated, same suite |
| AC3 | Admin detail vs staff detail field-by-field parity; 404 unknown id | met | Fully-Automated, same suite (structurally guaranteed by D4 composition) |
| AC4 | 403 customer/staff, 401 unauthenticated on both routes | met | Fully-Automated, same suite (ADM-001 role-matrix pattern) |
| AC5 | No mutation endpoint exists anywhere under `/api/admin/orders*` | met | Fully-Automated, mutation-absence probe |
| AC6 | PII boundary — name+phone in, email/auth fields out, per D2 | met | Fully-Automated, field-shape assertion |
| AC7 | Zero regressions — full API suite + admin suite + both typechecks + P1/P2 narrow re-runs | met | Fully-Automated + Hybrid, 468/468 + 58/58 + clean typechecks |
| AC1/AC3/AC6 (UI layer) | Filter UI, pagination UX, detail render, PII display matches D2 exactly | met | Agent-Probe, user-run walkthrough — PASSED 17-07-26 |

No unmet criteria. Every developed behavior (including the UI layer) has a proving strategy that
actually ran and passed — no Known-Gap rows, matching the plan's own validate-contract, which
declared zero Known-Gap rows going in.

## Closeout Packet

1. **Selected plan path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-06-orders_PLAN_14-07-26.md`
2. **Closeout classification:** Ready for UPDATE PROCESS archival (of the phase status, not the
   shared task folder — see below) — ✅ VERIFIED. All automated gates green, independently
   EVL-confirmed; the UI-layer Agent-Probe gate was performed and passed by the user this
   session, satisfying the plan's own Phase Completion Rules ("Explicit user confirmation is
   required before this phase's status is marked VERIFIED").
3. **What was finished:** see "What Was Done" above.
4. **Verified vs unverified:** all 7 ACs are met with a passing proving gate; nothing remains
   unverified for this phase.
4b. **Validate-contract compliance:** present, inline in plan, Gate: PASS (17-07-26,
   `generated-by: inner-pvl: phase-6`).
5. **Cleanup done vs still needed:** this pass — phase report written, Phase Loop Progress
   Steps 5/6/7 ticked, plan Status stamped ✅ VERIFIED, umbrella `## Current Execution State` +
   Phase Map/Ordering/Program Status tables reconciled (Phase 6 no longer PARKED), `all-context.md`
   updated with a Phase 6 delta bullet + Scan Metadata entry. Still needed: none for Phase 6
   itself. The `admin-dashboard_14-07-26/` task folder remains in `active/` because Phase 7 is
   still pending and the umbrella plan is not yet fully complete — this is the correct
   phase-program shape, not deferred cleanup.
6. **Next valid state:** Phase 7 — Analytics (ADM-007, #45). D1–D9 decisions were already LOCKED
   with the user 17-07-26 (per the plan's own Open Decisions section) and the phase was PARKED
   only behind Phase 6's execution (D9) — that condition is now satisfied. Next loop step for
   Phase 7 is its inner-loop RESEARCH re-confirm pass (Step 1), same shape as Phase 6's own
   unpark-then-reconfirm sequence.
7. **Commit checkpoint:** Execution commit already made (`7bb0918`) — this pass is process-only
   (plan/report/umbrella/context edits). A separate `process(admin): ...` commit is recommended
   for this pass's doc changes; do not fold into the execution commit (see staging command at
   end of this session's output).
8. **Regression status:** Regression checkpoint against P1 (`requireAdmin` role matrix) and P2
   (`GET /api/admin/branches` list, the branch-filter source) both re-run as part of the full
   468/468 API suite pass — no regression against Phases 0–5/ADM-008/Fix-6 surfaces.
9. **SPEC achievement:** see table above — 8/8 criteria met, zero unmet, zero Known-Gap.

Drift score: MEDIUM (3 signals: (a) 13 files touched in the execution commit → +2; (c) 2+
memory-worthy observations this pass — Phase 6 unpark-and-verify sequence, 10th append-only
aggregator consumer milestone; (d) feature-folder structural reconciliation across the phase
plan + umbrella plan). No `.claude/`/`.codex`/protocol-doc edits this pass. Recommend UPDATE
PROCESS -- significant changes detected. (This pass IS that UPDATE PROCESS.)
