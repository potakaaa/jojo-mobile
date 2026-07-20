---
phase: staff-dashboard-home
date: 2026-07-20
status: COMPLETE_WITH_GAPS
feature: staff-dashboard
plan: process/features/staff-dashboard/active/staff-dashboard-home_20-07-26/staff-dashboard-home_PLAN_20-07-26.md
---

# EXECUTE Report — Staff Dashboard Home + Prep-Time Autofill Fix (STAFF-005, #106)

## TL;DR

All 10 checklist steps implemented, `apps/mobile`-only. Two pure modules
(`deriveDashboardCounts`, `prepTimeReducer`) + 9 new node-env vitest tests (all green),
plus the two screen wirings. Prep-time now seeds SYNCHRONOUSLY via a render-phase reducer
dispatch (no `useEffect` flash). All in-scope automated gates green (mobile typecheck, mobile
test suite 78/78 jest + 9/9 new vitest, api STAFF-003 ETA regression 23/23, format:check).
One within-blast-radius deviation (a pure taxonomy sibling module) and one pre-existing,
out-of-scope red gate (`guard:theme-mode`, 25 baseline violations in `map-style.ts`, zero added
by this work). Agent-Probe visual/nav ACs remain owed → plan stays in `active/`.

## What Was Done

**Pure logic (TDD-first, node-env vitest):**
- `apps/mobile/src/features/staff/lib/staff-status-taxonomy.ts` (NEW, pure) — `NON_TERMINAL_STAFF_STATUSES` (5 keys: pending/accepted/preparing/flavoring/ready) + `NonTerminalStaffStatus` type. Single source of truth for the non-terminal taxonomy. See Deviations for why this is a separate module rather than inline in `staff-status-config.ts`.
- `apps/mobile/src/features/staff/lib/staff-status-config.ts` (EDIT) — re-exports `NON_TERMINAL_STAFF_STATUSES` + `NonTerminalStaffStatus` from the taxonomy module, so the plan's "export from staff-status-config.ts" contract holds for all consumers.
- `apps/mobile/src/features/staff/lib/dashboard-counts.ts` (NEW) — `deriveDashboardCounts(orders): { awaitingAcceptance, activeByStatus: Record<NonTerminalStaffStatus, number> }`. Keys `activeByStatus` off `NON_TERMINAL_STAFF_STATUSES` (AC3 divergence guard). Terminal statuses excluded defensively (E4).
- `apps/mobile/src/features/staff/lib/prep-time-reducer.ts` (NEW) — `prepTimeReducer` + `initialPrepTimeState`. `SETTINGS_ARRIVED` idempotent (seeds once, keyed off `hasSeeded` not object identity — the bug fix); `SAVE_SUCCESS` always re-seeds (AC8); `USER_EDIT` never flips `hasSeeded` (AC9).
- `__tests__/dashboard-counts.test.ts` (NEW, 4 tests): empty→zeros; mixed→per-status + awaiting split; terminal excluded (defensive, E4-annotated); taxonomy-reuse guard asserting keys == `NON_TERMINAL_STAFF_STATUSES`.
- `__tests__/prep-time-reducer.test.ts` (NEW, 5 tests): first-`SETTINGS_ARRIVED` seeds regardless of object identity (bug repro); background-refetch `SETTINGS_ARRIVED` after seed is a no-op (idempotent, returns same object); `SAVE_SUCCESS` deterministic re-seed; `SETTINGS_ARRIVED`-after-`USER_EDIT` preserves the mid-edit value + `USER_EDIT` never flips `hasSeeded`; initial state blank/unseeded.

**Screen wiring:**
- `apps/mobile/src/app/(staff)/branch-pickup-settings.tsx` (EDIT) — replaced the `useState('')` + `useState(settings)` + object-identity seed block with `useReducer(prepTimeReducer, initialPrepTimeState)`. Seeds SYNCHRONOUSLY via a render-phase `dispatch({ type: 'SETTINGS_ARRIVED', settings })` guarded by `prepState.hasSeeded` (plan Step 6 option b — no `useEffect`-only seed; handles warm-revisit AND cold-first-visit). `onChangeText` → `USER_EDIT`. `handleSavePrepTime` dispatches `SAVE_SUCCESS` via the call-site `patchSettings(payload, { onSuccess })` form (E5 — no hook signature change). `prepTimeError` kept as local `useState`; `mode`/`isPending`/`editable` untouched.
- `apps/mobile/src/app/(staff)/index.tsx` (EDIT) — added `useStaffOrders()` + `useStaffBranchSettings()`; computes `deriveDashboardCounts(orders ?? [])` + an `otherActive` sum. New "Branch at a glance" `Card` stat block ABOVE the nav cards: awaiting-acceptance count, in-progress count, accepting-pickup `Badge` (success/danger variant), current prep-time. Loading/missing data degrades to `0` counts / `—` placeholders (never crashes). Every `@jojopotato/ui` component passes explicit `mode={mode}`; all colors from `theme.*` tokens. BOTH stale doc comments updated (header ~lines 12-14 + component ~lines 43-47) to reflect 5 real cards + the dashboard data fetch (E3). All 5 `NAV_CARDS` + sign-out untouched.

## What Was Skipped or Deferred

- Agent-Probe walkthroughs (AC1 visual, AC4 nav, AC5 stale-read, AC6/AC7 on-screen no-flash, AC11 dark-mode visual) — standing project-wide no-RN-screen/E2E-runner gap (`staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`). Owed by the user; plan stays in `active/` per Phase Completion Rules.
- `usePatchBranchSettings` hook edit — genuinely optional per E5; not needed (call-site `onSuccess` works). Not done.

## Test Gate Outcomes

| Gate | Result | Notes |
|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` | PASS | 0 errors |
| `pnpm --filter @jojopotato/mobile test` | PASS | vitest 9 new (dashboard-counts 4 + prep-time-reducer 5) + jest 78/78, 18 suites |
| new vitest files (isolated re-run) | PASS | 9/9 |
| `pnpm --filter @jojopotato/mobile guard:theme-mode` | **RED (pre-existing, out-of-scope)** | 25 violations, ALL in `map-style.ts` + the 2 `use-color-scheme` wrapper files. Baseline (my changes stashed) == 25; with my changes == 25. **My work adds ZERO.** See Test Infra Gaps. |
| `pnpm --filter @jojopotato/api test` (STAFF-003 ETA) | PASS | ran `staff-order-status.integration.test.ts` against native postgres:5432 — 23/23 incl. AC-6 ETA derivation |
| `prettier --check` (touched files) | PASS | clean after `--write` |

## Plan Deviations

**1. Within-blast-radius (file location) — pure taxonomy sibling module.**
- Plan E2/Touchpoints: define + export `NON_TERMINAL_STAFF_STATUSES` FROM `staff-status-config.ts`, import it in `dashboard-counts.ts`.
- What deviated: the const + type are DEFINED in a new pure module `staff-status-taxonomy.ts`; `staff-status-config.ts` re-exports them.
- Why: `staff-status-config.ts` imports `Palette` from `@/constants/theme` → `@jojopotato/ui` → `react-native`. A static import of that file into the node-env-tested `dashboard-counts.ts` makes vitest try to bundle `react-native/index.js` (`import typeof` Flow syntax) and the test suite fails to load. The plan hard-requires `dashboard-counts.ts` to be node-env unit-tested AND to key off the shared const — those collide when the const lives in the Palette-coupled file. The taxonomy split keeps exactly ONE definition (single source of truth intact), keeps the "import from staff-status-config.ts" contract (it re-exports), and makes the node-env test runnable.
- Impact: `apps/mobile` only; no public contract / schema / API / hook-signature change. Consumers importing `NON_TERMINAL_STAFF_STATUSES` from `staff-status-config` are unaffected. AC3's "cannot structurally diverge" guarantee is preserved and unit-tested.

**2. Step 6 option chosen:** used render-phase dispatch guarded by `hasSeeded` (option b), the direct reducer analog of the file's existing correct render-phase seed pattern. Satisfies the locked "never empty while settings defined" constraint for both warm-revisit and cold-first-visit. No lazy-init third-arg (option a) → no cold-path regression risk.

## Test Infra Gaps Found

- **`guard:theme-mode` pre-existing baseline RED (classification: `stale-command-drift`).** The current `development` branch tree has the mobile-dark-mode-audit hex-literal check EXTENSION present, but `map-style.ts`'s hex-literal fixes (and the `use-color-scheme` wrapper-file allowlisting) from that audit are NOT present on this branch — so the guard reports 25 pre-existing violations and exits 1. Proven pre-existing: stashing all STAFF-005 changes yields the identical 25 violations. This work adds zero. Fixing `map-style.ts` is out of the plan's In-scope file list (BRN map feature, unrelated to STAFF-005) — not touched. The AC11 automated-half INTENT (new UI introduces no theme violations) is met; the aggregate command cannot exit 0 until the pre-existing debt is fixed by separate work.
- Standing no-RN-screen/E2E-runner gap (`staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`) — unchanged, not new debt.

## Closeout Packet

- **Selected plan:** `process/features/staff-dashboard/active/staff-dashboard-home_20-07-26/staff-dashboard-home_PLAN_20-07-26.md`
- **Finished:** Steps 1–10; 2 pure modules + 9 unit tests (green); both screen wirings; both stale doc comments; blast radius = apps/mobile only (verified `git diff --stat`).
- **Verified:** mobile typecheck, mobile test (78 jest + 9 vitest), api STAFF-003 ETA regression (23/23), format:check — all green. `git diff` confirms no backend/schema/PATCH-contract change and no staff-side `isAcceptingPickup` write.
- **Unverified / owed:** Agent-Probe visual/nav/no-flash/dark-mode walkthroughs (user-run). `guard:theme-mode` aggregate red due to pre-existing unrelated debt.
- **Best next state:** `Keep in active/testing` — code-complete, but Agent-Probe items + the pre-existing guard-red mean it is not archival-ready.
- **Follow-up plan stubs created:** none.
- **CONTEXT_PARTIAL:** none.

## EVL Confirmation (independent vc-tester re-run, 20-07-26)

Orchestrator spawned an independent vc-tester confirmation run (not execute-agent self-report) —
matches this report's Test Gate Outcomes exactly:

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/mobile test` | GREEN — vitest 63/63 (9 new), jest 78/78 |
| `pnpm --filter @jojopotato/mobile typecheck` | GREEN — 0 errors |
| `pnpm --filter @jojopotato/api test` (STAFF-003 ETA regression) | GREEN — 23/23 |
| `pnpm format:check` (touched files) | GREEN |
| `pnpm --filter @jojopotato/mobile guard:theme-mode` | RED — confirmed pre-existing (stash-baseline comparison: identical violation count/files with or without this change; 25 violations, `map-style.ts` + `use-color-scheme` wrapper files, all outside this plan's touchpoint list). Zero contribution from this work. |

closeout_classification: **CLEAN** (all in-scope gates green; the one red gate is independently
proven pre-existing and out of blast radius).

known_gaps recorded at EVL: `guard-theme-mode-preexisting-25-violations-map-style-and-use-color-scheme-wrappers`,
`format-check-preexisting-repo-wide-drift-158-untouched-files`, `agent-probe-screen-render-nav-darkmode-visual-no-RN-runner`.

follow_up_stubs: none required — both known gaps are already backlog-tracked (see UPDATE PROCESS
backlog filing below); the Agent-Probe gap is covered by the standing
`staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`.

## Forward Preview

- **Test Infra Found:** `apps/mobile` node-env vitest bundles static import graphs eagerly — any module a `.test.ts` imports must be free of the `@jojopotato/ui`/`react-native` chain (hence the pure `staff-status-taxonomy.ts`). `guard:theme-mode` is currently red on `development` for pre-existing `map-style.ts` reasons.
- **Blast Radius Changes:** +1 new pure module (`staff-status-taxonomy.ts`) now the single source of the non-terminal status list; consumed by `dashboard-counts.ts` and re-exported by `staff-status-config.ts`.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/mobile typecheck`; `pnpm --filter @jojopotato/mobile test`; `pnpm --filter @jojopotato/api exec vitest run src/routes/__tests__/staff-order-status.integration.test.ts` (native postgres:5432).
- **Dependency Changes:** none.
