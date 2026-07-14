---
phase: order-history-reorder-api
date: 2026-07-13
status: COMPLETE_WITH_GAPS
feature: ordering-cart
plan: process/features/ordering-cart/active/order-history-reorder-api_13-07-26/order-history-reorder-api_PLAN_13-07-26.md
---

# EXECUTE Report — Order History + Reorder (HIST-001 / HIST-002)

## What Was Done

All 19 checklist steps applied (Sections A–E). Pure frontend, zero `packages/api`/DB/migration changes (E3 respected).

**Section A — pure logic (`packages/utils`)**
- `packages/utils/src/order-display.ts` — `summarizeOrderItems` (NEW)
- `packages/utils/src/reorder.ts` — `reorderEligibility`, `reconcileReorder`, `ReorderAvailableLine`/`ReorderUnavailableLine`/`ReorderReconciliation` (NEW)
- `packages/utils/src/index.ts` — exports both (MODIFIED)
- `packages/utils/src/__tests__/reorder.test.ts` (NEW, 6 tests), `.../order-display.test.ts` (NEW, 2 tests)

**Section B — mobile seams**
- `apps/mobile/src/features/cart/hooks/use-reorder-conflicts.ts` — out-of-band `ReorderConflictProvider`/`useReorderConflicts` (NEW)
- `apps/mobile/src/features/orders/hooks/use-reorder.ts` — imperative reorder flow: clearConflicts → setBranch → clearCart → `queryClient.fetchQuery(['menu', branchId])` → reconcile → addItem(live price) → setConflicts → navigate; error-guarded Alert (NEW)
- `apps/mobile/src/app/_layout.tsx` — mounted `<ReorderConflictProvider>` inside `CartSessionProvider` (MODIFIED)

**Section C — history screen**
- `apps/mobile/src/app/(tabs)/order/history.tsx` — branch name via `useBranch().branches` cross-ref + "Unknown branch" fallback; `summarizeOrderItems` line; eligibility-gated Reorder Button; NO stars affordance (MODIFIED)

**Section D — cart conflict surface (E1 applied)**
- `apps/mobile/src/app/(tabs)/order/cart.tsx` — conflict notice `Card` (Badge per line + acknowledge Button) renders whenever `conflicts.length > 0` REGARDLESS of empty/loading/error; empty+conflicts suppresses the bare empty state; `disabled={isEmpty || hasConflicts}`; `clearConflicts()` on branch-change clearCart path (MODIFIED)

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| utils unit tests | `pnpm --filter @jojopotato/utils test` | PASS — 3 files, 17 tests (incl. 8 new) |
| raw-token check | `node packages/ui/scripts/check-raw-tokens.mjs` | PASS — "OK — no raw hex literals" |
| typecheck (mobile) | `pnpm --filter @jojopotato/mobile typecheck` | PASS |
| typecheck (utils/types/ui) | `pnpm typecheck` | PASS (3 successful) |
| typecheck (api) | `pnpm typecheck` | PRE-EXISTING FAIL — `Cannot find module 'supertest'` + `@jojopotato/types` unresolved in packages/api; install-state issue, NOT caused by this change (zero api files touched) |
| lint (utils) | `pnpm --filter @jojopotato/utils lint` | PASS |
| lint (mobile) | `pnpm --filter @jojopotato/mobile lint` | PASS — 0 errors (3 pre-existing warnings in `scripts/dev-with-tunnel.mjs`, untouched) |

## AC Status

- **Automated-green:** AC6 (logic), AC9, AC10, AC11, AC12, AC15 (`reorder.test.ts`/`order-display.test.ts`); cross-package type integrity; style/token.
- **Agent-Probe-pending (user confirmation required):** AC5, AC6 (render), AC9/AC10 (render), AC11/AC12/AC14 (screen), AC13 (inline notice + checkout block, incl. all-unavailable empty-cart case), regression guard on existing cart flows.
- **Known-gap (accepted):** AC7 stars accrual — omitted, backlog stub written.

## Plan Deviations

One deliberate reconciliation (within blast radius, no scope change): plan step 16 says "clear conflicts when the cart becomes empty." I did NOT add an auto-clear-on-empty effect because it directly conflicts with E1/AC13 (the hard requirement): an all-unavailable reorder yields an empty cart WITH conflicts, which MUST still show the notice. Auto-clearing on empty would erase the notice immediately. Strand-prevention is instead satisfied by the always-present "Remove unavailable & continue" acknowledge button (explicit user action) plus `clearConflicts()` on the branch-change and reorder paths. E1 (explicitly the hard requirement) supersedes the conflicting secondary instruction.

## Test Infra Gaps Found

- `apps/mobile` still has no RN test runner — AC5/AC13/AC14 + render halves are Agent-Probe only (accepted known-gap #2). Confirmed `packages/utils` has vitest wired (`"test": "vitest run"`, vitest ^3.2.4) — used for all decidable logic.
- Pre-existing `@jojopotato/api` typecheck breakage (missing `supertest` + unresolved `@jojopotato/types`) surfaced during the full `pnpm typecheck` — an install-state gap, unrelated to this feature. Flagging for repo maintenance (not this plan's scope).

## Closeout Packet

- **Selected plan:** `process/features/ordering-cart/active/order-history-reorder-api_13-07-26/order-history-reorder-api_PLAN_13-07-26.md`
- **Finished:** all 19 checklist steps; all automated gates green; E1/E3/E4 applied; backlog stub written.
- **Verified vs unverified:** pure logic + types + lint + tokens = automated-verified. Screen behavior (AC5/AC13/AC14 + render halves) = unverified pending user-confirmed Agent-Probe.
- **Remaining cleanup:** Agent-Probe walkthrough (AC1–AC15, incl. all-unavailable reorder empty-cart notice); UPDATE PROCESS should correct the stale `all-tests.md` line claiming `packages/utils` has no runner.
- **Best next state:** Keep plan in active/testing until user confirms the Agent-Probe walkthrough; then UPDATE PROCESS archival.

## Backlog stub path

`process/features/ordering-cart/backlog/stars-accrual-and-history-display_NOTE_13-07-26.md`

## Forward Preview

- **Test Infra Found:** `packages/utils` vitest is the automated home for mobile-derivable logic. No RN runner in `apps/mobile`. `packages/api` typecheck is broken pre-existing (install state).
- **Blast Radius Changes:** 4 new utils files + 1 utils index edit; 2 new mobile hooks; 3 modified mobile files (`_layout.tsx`, `history.tsx`, `cart.tsx`). No api/types/ui source changes.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/utils test`, `pnpm --filter @jojopotato/mobile typecheck`, `pnpm --filter @jojopotato/mobile lint`, `node packages/ui/scripts/check-raw-tokens.mjs`.
- **Dependency Changes:** none.
