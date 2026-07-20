---
name: plan:staff-dashboard-home
description: SIMPLE plan for STAFF-005 (#106) — staff dashboard home stat block + prep-time autofill bug fix (apps/mobile only, 2 pure fns + tests + 2-screen wiring)
date: 20-07-26
feature: staff-dashboard
---

# PLAN — Staff Dashboard Home + Prep-Time Autofill Fix

**Date**: 20-07-26
**Status**: ACTIVE — CODE DONE (EXECUTE complete, EVL-confirmed green 20-07-26). Not VERIFIED — Agent-Probe walkthroughs (AC1 visual, AC4 nav, AC5 stale-read, AC6/AC7 on-screen no-flash, AC11 dark-mode visual) are owed by the user per Phase Completion Rules. Stays in `active/` until those pass.
**Complexity**: SIMPLE (single feature slice, `apps/mobile` only)
**GitHub:** #106 (STAFF-005, P1)
**SPEC:** `staff-dashboard-home_SPEC_20-07-26.md` (11 ACs, locked) · **INNOVATE:** decisions locked, implement exactly.

## Overview / Context

The staff landing screen (`(staff)/index.tsx`) is currently a bare menu of 5 nav cards. This SIMPLE
plan adds a live, branch-scoped dashboard stat block above those cards (composed from existing
hooks, zero new backend) and fixes a real client-side bug where the prep-time field in Branch Pickup
Settings renders blank on a cached revisit. Context loaded: SPEC (11 ACs with proven-by/strategy
tags), INNOVATE decision summary, `process/context/all-context.md` theming + staff-authz
conventions, and `process/context/tests/all-tests.md` runner reality (apps/mobile vitest node-env
for pure logic; no RN screen/E2E runner). Post-phase testing runs the gate commands in Verification
Evidence.

## TL;DR

Turn the staff landing screen into a real dashboard by composing three EXISTING hooks (`useStaffOrders`, `useStaffBranchSettings`, `useStaffMe`) with a new pure `deriveDashboardCounts` function, and fix the prep-time-blank-on-revisit bug by replacing the two `useState` seed calls in `branch-pickup-settings.tsx` with a `useReducer` seed-state-machine (`prepTimeReducer`) driven by 3 actions. Two new pure-function modules + their vitest unit tests are the automated proof surface. Zero backend/schema change. Screen render/nav/dark-mode ACs stay Agent-Probe (standing project-wide no-RN-runner gap).

## Goals

1. Dashboard stat block above the existing 5 nav cards showing awaiting-acceptance count, other-active-by-status counts, accepting-pickup state, and current prep-time — all branch-scoped, all derived client-side.
2. Fix the prep-time-autofill bug (blank on cached revisit) at its root cause, and explicitly fix (not merely accept) the secondary mid-edit-stomp risk.
3. Preserve all 5 nav cards and existing branch-scope guarantees unchanged.

## Scope

- **In:** `apps/mobile/src/app/(staff)/index.tsx`, `apps/mobile/src/app/(staff)/branch-pickup-settings.tsx`, 2 new `apps/mobile/src/features/staff/lib/` modules + their tests, `apps/mobile/src/features/staff/lib/staff-status-config.ts` (add exported non-terminal subset — see PVL P2), possibly `use-patch-branch-settings.ts` (add an `onSuccess` callback passthrough).
- **Out (do NOT touch):** any backend route/schema/migration; `apps/admin` prep-time path; staff-side `is_accepting_pickup` WRITE path (read/display only — the `.strict()` PATCH schema stays `estimatedPrepMinutes`-only); STAFF-004 doc-drift; pull-to-refresh/UX-004; the pickup-code feature.

## Touchpoints

| File | Change | New/Edit |
|---|---|---|
| `apps/mobile/src/features/staff/lib/dashboard-counts.ts` | `deriveDashboardCounts(orders: StaffOrderSummary[])` pure fn; reuses `STAFF_STATUS_CONFIG` taxonomy + the exported non-terminal subset | NEW |
| `apps/mobile/src/features/staff/lib/__tests__/dashboard-counts.test.ts` | vitest unit tests for above | NEW |
| `apps/mobile/src/features/staff/lib/prep-time-reducer.ts` | `prepTimeReducer` + action types + initial state | NEW |
| `apps/mobile/src/features/staff/lib/__tests__/prep-time-reducer.test.ts` | vitest unit tests for above | NEW |
| `apps/mobile/src/features/staff/lib/staff-status-config.ts` | export `NON_TERMINAL_STAFF_STATUSES` (the 5 non-terminal keys) as the single non-terminal source of truth — see PVL P2/E2 | EDIT |
| `apps/mobile/src/app/(staff)/index.tsx` | add stat block above nav cards; wire `useStaffOrders` + `useStaffBranchSettings` + `deriveDashboardCounts`; update stale doc comments (E3 — BOTH lines 12-14 and 43-47) | EDIT |
| `apps/mobile/src/app/(staff)/branch-pickup-settings.tsx` | replace two `useState` seed calls with `useReducer(prepTimeReducer)`; seed SYNCHRONOUSLY (see PVL E1); dispatch `SETTINGS_ARRIVED` / `SAVE_SUCCESS` | EDIT |
| `apps/mobile/src/features/staff/hooks/use-patch-branch-settings.ts` | (if needed) accept/forward an `onSuccess(settings)` callback — but call-site `mutate` options is confirmed feasible, so this edit is genuinely optional | EDIT (conditional) |

## Public Contracts

- **New (module-internal, not cross-package):** `deriveDashboardCounts(orders: StaffOrderSummary[]): { awaitingAcceptance: number; activeByStatus: Record<NonTerminalStaffStatus, number> }` (exact return shape finalized in implementation; MUST key `activeByStatus` off the exported `NON_TERMINAL_STAFF_STATUSES` subset — 5 keys, NOT all 8 `StaffOrderStatus` keys). `prepTimeReducer(state, action): { prepTimeText: string; hasSeeded: boolean }` with actions `SETTINGS_ARRIVED(settings) | SAVE_SUCCESS(settings) | USER_EDIT(text)`. New: `NON_TERMINAL_STAFF_STATUSES` const array exported from `staff-status-config.ts`.
- **Unchanged / frozen:** `PATCH /api/staff/branch` validation contract (`z.number().int().min(1).max(120)`); `orders.ts` ETA-derivation-at-accept-time; `useStaffOrders` 10s poll + `['staff','orders']` key; `useStaffBranchSettings` `staleTime:0` + `['staff','branch']` key; all `/api/staff/*` branch-scope middleware. No new endpoint. `usePatchBranchSettings` mutation signature stays `Partial<StaffBranchSettings>` in, `StaffBranchSettings` out — any `onSuccess` callback is additive/optional.

## Blast Radius

- **Packages:** `apps/mobile` only. Zero `packages/api`, `packages/types`, `packages/ui`, or `apps/admin` source changes.
- **Files:** 4 new (2 modules + 2 tests), 3 edited screens/modules (index.tsx, branch-pickup-settings.tsx, staff-status-config.ts), 1 conditional hook edit.
- **Risk class:** LOW. No schema/auth/API/billing/migration surface. Branch isolation is structurally inherited (no new data path). The only behavioral-correctness surface is client-side state seeding — covered by pure-function unit tests.

## Implementation Checklist (ordered: pure functions + tests FIRST, then wire UI)

1. **Create `dashboard-counts.ts`.** Implement `deriveDashboardCounts(orders)`: `awaitingAcceptance` = count of `status === 'pending'`; `activeByStatus` = per-status counts keyed off the exported `NON_TERMINAL_STAFF_STATUSES` subset (`pending`, `accepted`, `preparing`, `flavoring`, `ready`). First add + export `NON_TERMINAL_STAFF_STATUSES` from `staff-status-config.ts` (PVL P2/E2) and import both it and `STAFF_STATUS_CONFIG`/`StaffOrderStatus` so the dashboard cannot structurally diverge from the Active Orders screen (proves AC3). Pure — no hooks, no imports beyond types + config.
2. **Write `dashboard-counts.test.ts` (vitest node-env).** Cases: empty array → all zeros; mixed statuses → correct per-status counts + correct awaiting count; terminal statuses (`completed`/`cancelled`/`rejected`) excluded from `activeByStatus` (defensive — note in the test that `useStaffOrders` list responses are ALREADY server-filtered to non-terminal only per `packages/types/src/staff.ts:32-33`, so this asserts defensive robustness, not observed runtime input — E4); assert the function keys off `NON_TERMINAL_STAFF_STATUSES` (taxonomy-reuse guard for AC3).
3. **Create `prep-time-reducer.ts`.** State `{ prepTimeText: string; hasSeeded: boolean }`, initial `{ prepTimeText: '', hasSeeded: false }`. Actions:
   - `SETTINGS_ARRIVED(settings)` — if `hasSeeded === false`: set `prepTimeText = String(settings.estimatedPrepMinutes)`, `hasSeeded = true`; else no-op (idempotent — fixes primary bug AND mid-edit stomp AC9).
   - `SAVE_SUCCESS(settings)` — always re-seed `prepTimeText` from `settings.estimatedPrepMinutes`, `hasSeeded = true` (deterministic re-seed for AC8).
   - `USER_EDIT(text)` — set `prepTimeText = text`, `hasSeeded` unchanged.
4. **Write `prep-time-reducer.test.ts` (vitest node-env).** Cases: fresh reducer + first `SETTINGS_ARRIVED` seeds regardless of object identity (bug reproduction — old code failed here); SECOND `SETTINGS_ARRIVED` on same lifetime does NOT reseed once `hasSeeded`; `SAVE_SUCCESS` always reseeds deterministically; `USER_EDIT` never flips `hasSeeded`; `SETTINGS_ARRIVED` after `USER_EDIT` (hasSeeded true) does NOT stomp the edit (AC9).
5. **Run both new test files** (`pnpm --filter @jojopotato/mobile test`) — confirm green before touching any screen.
6. **Wire `branch-pickup-settings.tsx` — seed SYNCHRONOUSLY (PVL E1/Gap 1, overrides the earlier "add a useEffect" wording).** Replace `useState('')` for `prepTimeText` and `useState(settings)` for `seededSettings` + the identity-guard block (lines 32–43) with `const [prepState, dispatch] = useReducer(prepTimeReducer, initial)`. **Do NOT seed via a post-paint `useEffect` alone** — on the cached-revisit path that renders the Input empty for one commit before the effect fires, reintroducing the exact "flicker to empty and back" AC7 forbids (and the pure-reducer unit test cannot catch it). Seed synchronously via ONE of: (a) the lazy-init third-arg form `useReducer(prepTimeReducer, initialSettings, (settings) => settings ? { prepTimeText: String(settings.estimatedPrepMinutes), hasSeeded: true } : { prepTimeText: '', hasSeeded: false })` **— NOTE (PVL cycle 2): lazy-init runs ONCE at mount, so on a COLD-cache first-ever visit (`settings` undefined at mount) it will NOT re-seed when `settings` later arrives; if you choose (a) you MUST ALSO keep a render-phase re-seed (dispatch `SETTINGS_ARRIVED` guarded by `hasSeeded`) for the cold path, or the first-ever visit regresses to blank. Prefer (b) or (c), which handle both the warm-revisit and cold-first-visit paths in one construct**; (b) dispatch `SETTINGS_ARRIVED(settings)` during render guarded by the reducer's `hasSeeded` (mirrors the existing correct render-phase pattern, routed through the reducer); or (c) derive the Input's displayed value as `hasSeeded ? prepTimeText : (settings ? String(settings.estimatedPrepMinutes) : '')` so the UI never shows empty while `settings` is already defined. Locked constraint for EXECUTE: **the rendered prep-time value must never show empty while `settings` is already defined/cached — no useEffect-only seed.** Read `prepTimeText` from `prepState`; `onChangeText` → `dispatch(USER_EDIT(text))`. Keep `prepTimeError` as local `useState` (unrelated). Keep `mode` derivation and every `@jojopotato/ui` `mode={mode}` prop exactly as-is.
7. **Wire deterministic re-seed on save.** In `handleSavePrepTime`, on mutation success dispatch `SAVE_SUCCESS(returnedSettings)` using the call-site `mutate` options form: `patchSettings({ estimatedPrepMinutes: parsed }, { onSuccess: (s) => dispatch({ type: 'SAVE_SUCCESS', settings: s }) })`. This is confirmed feasible without editing the hook (react-query runs both the hook's own `onSuccess` invalidate AND the call-site `onSuccess`). Prefer this over a hook edit. Keep the existing `invalidateQueries` behavior.
8. **Wire `index.tsx` dashboard stat block.** Add `useStaffOrders()` and `useStaffBranchSettings()`. Compute `deriveDashboardCounts(orders ?? [])`. Render a stat block ABOVE the `NAV_CARDS` list (visually separated, not interleaved — UX note 8): awaiting-acceptance count, other-active total/by-status, accepting-pickup boolean state, current prep-time. Handle loading/error states gracefully (counts show 0 or a subtle placeholder, never crash). Use only `@jojopotato/ui` components with explicit `mode={mode}`; read colors from `theme.*` tokens; never hardcode. **Update BOTH now-stale doc comments (E3/Gap 3): (i) the block comment at ~lines 43-47 ("The four nav cards ... inert placeholders ... no order/product data is fetched") AND (ii) the header comment at ~lines 12-14 ("the remaining three are inert placeholders (STAFF-003/004) ... live active-order count is shown inside the Active Orders screen itself, not on this card") — both predate the current 5-card + dashboard-data reality.** Leave all 5 `NAV_CARDS` and the sign-out button untouched.
9. **Run gate commands** (see Verification Evidence) — fix any failure inline; do not batch.
10. **Self-check:** confirm no backend file changed (`git diff --stat` shows only `apps/mobile/**`); confirm PATCH schema untouched; confirm no staff-side `isAcceptingPickup` write was added.

## Acceptance Criteria (SPEC AC → Plan Coverage Map, all 11)

| AC | How satisfied |
|---|---|
| AC1 dashboard live branch-scoped state | Step 1/8 `deriveDashboardCounts` + stat block; Fully-Automated unit + Agent-Probe visual (Hybrid) |
| AC2 branch isolation | No new data path; inherits router-level middleware; proven by `git diff` = apps/mobile only (Fully-Automated) |
| AC3 counts match Active Orders | Step 1 reuses `STAFF_STATUS_CONFIG` + `NON_TERMINAL_STAFF_STATUSES` + `useStaffOrders`; taxonomy-reuse unit test (Fully-Automated) |
| AC4 5 nav cards unchanged | Steps 8/10 leave `NAV_CARDS` untouched; Agent-Probe walkthrough |
| AC5 no stale read | Reuses existing 10s poll + on-focus refetch; Agent-Probe |
| AC6 prep-time never blank on revisit | Steps 3/6 `prepTimeReducer` `hasSeeded` guard + synchronous seed; bug-repro unit test (Fully-Automated) + Agent-Probe (on-screen no-flash, E1 residual) |
| AC7 value doesn't disappear post-render | Step 3 idempotent `SETTINGS_ARRIVED` + Step 6 synchronous seed; background-refetch unit test (Fully-Automated) + Agent-Probe (on-screen no-flicker, E1 residual) |
| AC8 edit+save persists+re-seeds | Step 7 `SAVE_SUCCESS` deterministic re-seed; unit test + existing PATCH integration coverage (Fully-Automated) |
| AC9 leave-without-save no mutation + mid-edit stomp FIXED | Steps 3/7: no PATCH except explicit save; `hasSeeded` guard prevents stomp; unit test (Fully-Automated) |
| AC10 prep-time change → ETA | Re-run existing STAFF-003 ETA integration test as regression (Fully-Automated); no backend change |
| AC11 dark mode | Steps 6/8 explicit `mode` props + tokens; `guard:theme-mode` (Hybrid) + Agent-Probe visual |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `dashboard-counts.test.ts` — counts, awaiting split, terminal exclusion (defensive) | Fully-Automated | AC1 (count derivation), AC3 (taxonomy reuse) |
| `dashboard-counts.test.ts` — asserts `NON_TERMINAL_STAFF_STATUSES` taxonomy + `useStaffOrders` source shared | Fully-Automated | AC3 (cannot structurally diverge from Active Orders) |
| `prep-time-reducer.test.ts` — fresh reducer seeds on first `SETTINGS_ARRIVED` regardless of object identity (bug repro) | Fully-Automated | AC6 (never blank on cached revisit) |
| `prep-time-reducer.test.ts` — background-refetch `SETTINGS_ARRIVED` after seed does not re-blank/flicker | Fully-Automated | AC7 (value stays after render/hydration — reducer level) |
| `prep-time-reducer.test.ts` — `SAVE_SUCCESS` always deterministically reseeds | Fully-Automated | AC8 (save persists + screen re-seeds from response) |
| `prep-time-reducer.test.ts` — `SETTINGS_ARRIVED` after `USER_EDIT` does not stomp; no PATCH except explicit save | Fully-Automated | AC9 (no clear/zero on leave; mid-edit stomp FIXED, not accepted) |
| `pnpm --filter @jojopotato/api test` — existing STAFF-003 ETA-derivation integration test re-run (regression, no new test) | Fully-Automated | AC10 (prep-time change → next-order ETA still correct) |
| Branch-scope: all dashboard data flows through existing `requireStaff`→`resolveBranchScope`→`assertBranchScope`; no new endpoint/bypass added (verified by `git diff` = apps/mobile only) | Fully-Automated | AC2 (branch isolation never violated) |
| `pnpm --filter @jojopotato/mobile guard:theme-mode` green (27 components / call sites) | Hybrid | AC11 (dark-mode token compliance, automated half) |
| Agent-Probe: open dashboard, verify live counts + accepting state + prep-time render for own branch (both light+dark) | Agent-Probe | AC1 (visual), AC11 (visual half) |
| Agent-Probe: open Branch Pickup Settings on a cached revisit — confirm prep-time shows saved value with NO empty flash (E1/Gap 1 on-screen residual) | Agent-Probe | AC6/AC7 (on-screen no-flicker) |
| Agent-Probe: tap each of 5 nav cards → correct destination | Agent-Probe | AC4 (nav cards unchanged) |
| Agent-Probe: accept a pending order, observe dashboard count decrement within 10s poll / on return-to-screen | Agent-Probe | AC5 (no stale read within cadence) |

**Gate commands (run in order):**
```bash
pnpm --filter @jojopotato/mobile test          # vitest (new unit tests) + jest
pnpm --filter @jojopotato/mobile typecheck     # tsc --noEmit
pnpm --filter @jojopotato/mobile guard:theme-mode
pnpm --filter @jojopotato/api test             # STAFF-003 ETA regression (needs docker compose up -d + db:migrate; on this dev box port 5432 is occupied by native postgres — run against the native instance, see all-tests.md)
pnpm format:check
```

## Test Infra Improvement Notes

(none identified yet) — screen-render/nav/dark-mode-visual ACs (AC1 visual, AC4, AC5, AC11 visual) AND the on-screen prep-time no-flash check (E1/Gap 1 on-screen half) remain Agent-Probe due to the standing project-wide no-RN-screen/E2E-runner gap (`staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`). Not new debt; not closed by this work.

## Dependencies & Risks

- **Dependency:** `pnpm --filter @jojopotato/api test` (AC10 regression) requires `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` first. Dev-box note: host port 5432 is occupied by a native `postgresql.service` — the api suite runs against that native instance (see `process/context/tests/all-tests.md`).
- **Risk (LOW):** the `useReducer` migration must preserve the existing `prepTimeError` local-state behavior and the `isPending`/`editable` wiring — keep those as-is; only the seed path changes. Mitigation: Step 6 explicitly scopes the replacement to lines 32–43 seed logic AND mandates synchronous seeding (PVL E1/Gap 1 — no useEffect-only seed).
- **Risk (LOW, PVL cycle 2):** choosing Step 6 option (a) lazy-init *alone* would regress the cold-cache first-ever-visit seed. Mitigation: Step 6 + E1 now explicitly flag this and steer to option (b)/(c), or require a render-phase re-seed alongside (a). The locked "never empty while settings defined" constraint structurally forbids the regression.
- **Backwards compatibility:** `usePatchBranchSettings` change (if made) is additive/optional — no existing caller breaks. Call-site `mutate` options form is confirmed feasible, so the hook edit is genuinely optional.

## Phase Completion Rules

- **CODE DONE** = Steps 1–10 implemented; all Fully-Automated + Hybrid gate commands green (mobile `test`, `typecheck`, `guard:theme-mode`; api STAFF-003 ETA regression; `format:check`).
- **VERIFIED** = CODE DONE **plus** the Agent-Probe walkthroughs (AC1 visual, AC4 nav, AC5 stale-read, AC6/AC7 on-screen no-flash, AC11 dark-mode visual) performed and passed by the user.
- Until the Agent-Probe items are performed, the plan stays in `active/` (not archived) — consistent with every prior staff-screen precedent in this repo.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/staff-dashboard/active/staff-dashboard-home_20-07-26/staff-dashboard-home_PLAN_20-07-26.md`
2. **Last completed step:** PLAN written → VALIDATE cycle 1 (Gate: CONDITIONAL, 4 CONCERN) → PVL supplement cycle applied (all 4 gaps folded into the checklist body) → **VALIDATE cycle 2 re-validation (Gate: PASS)** — all 4 prior concerns verified resolved against the real touchpoint files (seed block lines 32-43 confirmed; `NON_TERMINAL_STAFF_STATUSES` export confirmed additive/no-collision via grep; both `index.tsx` stale doc comments confirmed; `staff.ts:32-33` server-filter reference confirmed accurate). Two LOW clarifications folded into E1/E3 this cycle. No implementation started.
3. **Validate-contract status:** written (20-07-26, PVL cycle 2, PASS — supersedes cycle 1 CONDITIONAL contract). See `## Validate Contract` below. Gate: PASS — proceed to EXECUTE.
4. **Supporting context loaded:** SPEC (11 ACs), INNOVATE decisions (in orchestrator prompt), touchpoint files (`(staff)/index.tsx`, `branch-pickup-settings.tsx`, `staff-status-config.ts`, `use-staff-orders.ts`, `use-staff-branch-settings.ts`, `use-patch-branch-settings.ts`), `StaffOrderSummary`/`StaffBranchSettings` types, `process/context/all-context.md`, `process/context/tests/all-tests.md`.
5. **Next step for a fresh agent:** VALIDATE PASS — proceed to EXECUTE Steps 1→10 in order (pure functions + tests first, screens last). The synchronous-seed constraint (Step 6 / E1 / Gap 1) is locked: the rendered prep-time value must never show empty while `settings` is already defined/cached — no useEffect-only seed; if using the lazy-init form, also keep a render-phase re-seed for the cold path. Do not touch any backend/schema file; confirm `git diff --stat` stays `apps/mobile/**`-only.

## Validate Contract

Status: PASS
Date: 20-07-26
date: 2026-07-20
generated-by: outer-pvl
supersedes: 20-07-26 (outer-pvl) — PVL cycle 2 re-validation after supplement cycle; all 4 cycle-1 CONCERNs verified resolved against real files

Parallel strategy: sequential
Rationale: signal score 0–1/7 → LOW (4 new + 3 edited files, single package `apps/mobile`, no schema/API/auth surface, no cross-agent coordination) → one execute-agent, sequential. SIMPLE plan.

### Test gates (C3 5-column table — ADDITIVE; the legacy line form below it still parses)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 / AC3 | dashboard count derivation + non-terminal taxonomy reuse | Fully-Automated | `dashboard-counts.test.ts` (empty→zeros; mixed→per-status + awaiting split; terminal excluded (defensive); keys off `NON_TERMINAL_STAFF_STATUSES`) | B — gate added by this plan |
| AC6 | prep-time seeds on first `SETTINGS_ARRIVED` regardless of object identity (bug repro) | Fully-Automated | `prep-time-reducer.test.ts` — fresh reducer first-seed case | B — gate added by this plan |
| AC7 | value not re-blanked by a background-refetch `SETTINGS_ARRIVED` after seed (reducer level) | Fully-Automated | `prep-time-reducer.test.ts` — idempotent-after-seed case | B — gate added by this plan |
| AC8 | `SAVE_SUCCESS` always deterministically re-seeds | Fully-Automated | `prep-time-reducer.test.ts` — SAVE_SUCCESS case | B — gate added by this plan |
| AC9 | mid-edit stomp FIXED + `USER_EDIT` never flips `hasSeeded` + no PATCH except explicit save | Fully-Automated | `prep-time-reducer.test.ts` — `SETTINGS_ARRIVED`-after-`USER_EDIT` case | B — gate added by this plan |
| AC10 | prep-time change → next-order ETA still derived correctly | Fully-Automated | `pnpm --filter @jojopotato/api test` — existing STAFF-003 ETA-derivation regression | A — proven now (existing test) |
| AC2 | branch isolation, no new endpoint/bypass | Fully-Automated | `git diff --stat` = `apps/mobile/**` only + inherits `requireStaff`→`resolveBranchScope`→`assertBranchScope` | A — proven now (structural) |
| AC11 | dark-mode token compliance (automated half) | Hybrid | `pnpm --filter @jojopotato/mobile guard:theme-mode` green (precondition: run in apps/mobile) | A — proven now |
| AC1 / AC11 | dashboard + settings visual render, both modes | Agent-Probe | manual walkthrough (own branch, light + dark) | D — Agent-Probe residual (standing no-RN-runner gap) |
| AC6 / AC7 | on-screen prep-time shows saved value with NO empty flash on cached revisit | Agent-Probe | manual walkthrough (cached revisit of Branch Pickup Settings) | D — Agent-Probe residual (E1 on-screen half) |
| AC4 | 5 nav cards navigate to correct destinations | Agent-Probe | manual walkthrough (tap each card) | D — Agent-Probe residual |
| AC5 | count decrement within 10s poll / on return-to-screen | Agent-Probe | manual walkthrough (accept an order, observe) | D — Agent-Probe residual |

gap-resolution legend: A — proven now · B — gate added by this plan's checklist · C — deferred to a named later plan · D — backlog/Agent-Probe named residual (keep-active; continue).

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NOT used anywhere in this contract — no developed behavior rests on it. Every developed pure-logic behavior (count derivation + prep-time seed state machine) has a passing Fully-Automated unit gate; the Agent-Probe rows are named residuals for screen-render/nav that no RN runner can automate (gap-resolution D). No vacuous-green: no developed behavior passes on an Agent-Probe/Known-Gap alone.

**Failing stub (Fully-Automated — `dashboard-counts.test.ts`):**
```
test("should derive zero counts from an empty order array", () => { throw new Error("NOT IMPLEMENTED — TDD stub: empty array → all zeros") })
test("should count awaiting-acceptance and per-status active counts keyed off NON_TERMINAL_STAFF_STATUSES", () => { throw new Error("NOT IMPLEMENTED — TDD stub: mixed statuses → correct awaiting + per-status counts") })
test("should exclude terminal statuses from activeByStatus (defensive)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: terminal statuses excluded from activeByStatus") })
```

**Failing stub (Fully-Automated — `prep-time-reducer.test.ts`):**
```
test("should seed prepTimeText on first SETTINGS_ARRIVED regardless of object identity", () => { throw new Error("NOT IMPLEMENTED — TDD stub: fresh reducer first-seed bug repro") })
test("should not re-blank on a background-refetch SETTINGS_ARRIVED after seed", () => { throw new Error("NOT IMPLEMENTED — TDD stub: idempotent SETTINGS_ARRIVED after seed") })
test("should always re-seed prepTimeText on SAVE_SUCCESS", () => { throw new Error("NOT IMPLEMENTED — TDD stub: SAVE_SUCCESS deterministic re-seed") })
test("should not stomp a mid-edit value when SETTINGS_ARRIVED fires after USER_EDIT", () => { throw new Error("NOT IMPLEMENTED — TDD stub: SETTINGS_ARRIVED after USER_EDIT does not stomp; USER_EDIT never flips hasSeeded") })
```

Legacy line form (retained so existing validate-contract consumers still parse):
- Dashboard counts: Fully-automated: `pnpm --filter @jojopotato/mobile test` (dashboard-counts.test.ts)
- Prep-time reducer: Fully-automated: `pnpm --filter @jojopotato/mobile test` (prep-time-reducer.test.ts)
- ETA regression: Fully-automated: `pnpm --filter @jojopotato/api test` (STAFF-003 ETA derivation)
- Branch isolation: Fully-automated: `git diff --stat` = apps/mobile only + inherited middleware
- Dark mode: hybrid: `pnpm --filter @jojopotato/mobile guard:theme-mode` — precondition: apps/mobile package
- Screen render/nav/on-screen-flash: agent-probe: manual walkthrough (standing no-RN-runner gap)

### Dimension findings

- Infra fit: PASS — `apps/mobile`-only; new files land in existing `features/staff/lib/` + a new `__tests__/` dir (confirmed absent, correct pre-EXECUTE); gate commands (`test`, `typecheck`, `guard:theme-mode`) are real scripts in `apps/mobile/package.json`; AC10 api regression needs docker/native-postgres (documented). No container/port/runtime surface.
- Test coverage: PASS (cycle-2, upgraded from cycle-1 CONCERN) — the two developed pure modules are Fully-Automated (node-env vitest); screen render/nav/dark-mode ACs are correctly Agent-Probe (standing no-RN-E2E-runner gap). The cycle-1 blind spot (AC7 no-flicker proven only at reducer level; a post-paint useEffect could reintroduce a one-frame empty flash) is now RESOLVED by E1's synchronous-seed mandate + the locked "never empty while settings defined" constraint + the added Agent-Probe on-screen no-flash row.
- Breaking changes: PASS — all public contracts frozen (PATCH schema, ETA derivation, query keys/poll/staleTime, branch-scope middleware); new exports are module-internal; `NON_TERMINAL_STAFF_STATUSES` export verified additive with zero existing-consumer collision (grep: every consumer imports `STAFF_STATUS_CONFIG` only); `usePatchBranchSettings` call-site `onSuccess` is additive and confirmed feasible without a hook signature change.
- Security surface: PASS — no auth/identity/billing/schema/migration/secret/trust-boundary change; branch isolation is STRUCTURALLY inherited (no new endpoint, no new data path — all reads flow through the existing `/api/staff/*` middleware chain); AC2 proven by `git diff` = apps/mobile only. Not a high-risk class — no `vc-risk-evidence-pack` required.
- Section A (dashboard stat block): PASS (cycle-2, upgraded from CONCERN) — mechanically feasible (all 3 hooks exist with confirmed return shapes: `StaffOrderSummary`/`StaffBranchSettings` verified; NAV_CARDS + insertion point above line 84 clear). Cycle-1 gaps all resolved: `NON_TERMINAL_STAFF_STATUSES` export added (E2, verified additive), both stale `index.tsx` doc comments now targeted (E3, both confirmed present), terminal-exclusion test correctly annotated defensive (E4, `staff.ts:32-33` reference confirmed accurate). Residual note: `activeByStatus` return type must key off the 5-key non-terminal subset, not all 8 `StaffOrderStatus` keys (clarified in Public Contracts + E2).
- Section B (prep-time reducer fix): PASS (cycle-2, upgraded from CONCERN) — mechanically feasible (seed block confirmed at lines 32–43; `useStaffBranchSettings` returns cached `data` on first render of a warm revisit, so a render-phase/derived synchronous seed reads it; call-site `mutate` `onSuccess` confirmed by hook shape). Cycle-1 highest-risk (post-paint useEffect re-blanks the Input for one commit) RESOLVED by E1. New cycle-2 note: lazy-init option (a) alone regresses the cold-cache first visit — flagged in Step 6/E1/Risks; option (b)/(c) preferred.

### Proposed Plan Updates (applied to plan file this pass)

| # | What changes | Where | Why |
|---|---|---|---|
| P1 (cycle 1) | Step 6 mandates SYNCHRONOUS seeding; bans a post-paint-`useEffect`-only seed | Step 6 + Touchpoints | Prevents reintroducing the AC7 "flicker to empty and back" the fix is meant to kill |
| P2 (cycle 1) | Export `NON_TERMINAL_STAFF_STATUSES`; key `deriveDashboardCounts` off it | Step 1 + Touchpoints + Public Contracts + Scope | Single non-terminal source of truth strengthens AC3 (blast radius unchanged) |
| P3 (cycle 2) | E1 sharpened: lazy-init option (a) alone regresses the cold-cache first visit; steer to (b)/(c) or add render-phase re-seed | Step 6 + E1 + Risks | Closes a corner in the cycle-1 option enumeration (already guarded by the locked constraint; now explicit) |
| P4 (cycle 2) | E3 widened: update BOTH stale `index.tsx` doc comments (lines 12-14 AND 43-47) | Step 8 + Touchpoints + E3 | The header comment at 12-14 ("remaining three are inert placeholders") is also stale post-5-cards |
| P5 (cycle 2) | `activeByStatus` typed off the 5-key non-terminal subset (not all 8 `StaffOrderStatus` keys) | Public Contracts + E2 | Removes a return-type ambiguity between "Record<StaffOrderStatus>" and "keyed off NON_TERMINAL" |

### Execute-Agent Instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | Seed prep-time SYNCHRONOUSLY. Do NOT rely on a post-paint `useEffect(dispatch(SETTINGS_ARRIVED))` alone — it renders the Input empty for one commit on cached revisit (the AC6/AC7 target). Prefer the render-phase dispatch guarded by `hasSeeded` OR the derived-Input-value form — both handle warm-revisit AND cold-first-visit. If you use the lazy-init `useReducer` third-arg form, you MUST ALSO keep a render-phase re-seed for the cold-cache path (`settings` undefined at mount), else the first-ever visit regresses to blank. Keep the reducer pure. Locked constraint: the rendered value must never show empty while `settings` is defined/cached. | Step 6 (branch-pickup-settings.tsx) |
| E2 | Add + export `NON_TERMINAL_STAFF_STATUSES` (the 5 keys: pending, accepted, preparing, flavoring, ready) from `staff-status-config.ts`; import it in `dashboard-counts.ts` and key BOTH the loop AND the `activeByStatus` return type off it (5 keys, not all 8 `StaffOrderStatus` keys). Do NOT re-hardcode the 5-key split inside `dashboard-counts.ts`. | Step 1 |
| E3 | Update BOTH stale `index.tsx` doc comments: (i) the block comment ~lines 43-47 ("four nav cards ... inert placeholders ... no order/product data is fetched") AND (ii) the header comment ~lines 12-14 ("the remaining three are inert placeholders (STAFF-003/004) ... live active-order count is shown inside the Active Orders screen"). Both must reflect 5 real cards + the new dashboard data fetch. | Step 8 |
| E4 | In `dashboard-counts.test.ts`, annotate the terminal-exclusion case as DEFENSIVE — `useStaffOrders` list responses are already server-filtered to non-terminal only (`packages/types/src/staff.ts:32-33`, confirmed), so runtime input never contains terminal statuses; the test guards robustness, not observed behavior. | Step 2 |
| E5 | Use the call-site `mutate` options form for `SAVE_SUCCESS` (`patchSettings(payload, { onSuccess })`) — confirmed feasible against the current hook (`onSuccess` only invalidates; react-query runs both callbacks); do NOT edit `usePatchBranchSettings`'s signature unless a concrete blocker appears. | Step 7 |

### Backlog Artifacts

(none) — the Agent-Probe residuals are already tracked by the standing `staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`; no new backlog note required.

### Open gaps

- Screen render / nav / dark-mode-visual + on-screen prep-time no-flash (E1 on-screen half): Agent-Probe only — standing project-wide no-RN-screen/E2E-runner gap (`staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`). Not new debt; not closed by this work. No Known-Gap used for any developed behavior.

### What This Coverage Does NOT Prove

- `dashboard-counts.test.ts` proves the pure count math; it does NOT prove the stat block renders, lays out above the nav cards, or reads the correct theme tokens on screen (Agent-Probe AC1/AC11 visual).
- `prep-time-reducer.test.ts` proves the reducer's state transitions in isolation; it does NOT prove the on-screen Input never flashes empty on a cached revisit (E1 on-screen half is Agent-Probe AC6/AC7), nor that `SETTINGS_ARRIVED`/`SAVE_SUCCESS` are dispatched at the right lifecycle moments by the screen wiring.
- `guard:theme-mode` proves every `@jojopotato/ui` call site passes an explicit `mode`; it does NOT prove the resulting colours are visually correct/legible in dark mode (Agent-Probe AC11 visual).
- `pnpm --filter @jojopotato/api test` proves the STAFF-003 ETA derivation still holds server-side; it does NOT exercise any new mobile code (no backend change this plan).
- `git diff --stat` proves no backend file changed; it does NOT prove the runtime branch-scope guarantee beyond "no new data path was added".
- The 5 nav cards' navigation targets are NOT automatically asserted (Agent-Probe AC4) — no RN navigation runner exists.

Gate: PASS (0 FAILs, 0 open CONCERNs — all 4 cycle-1 CONCERNs verified resolved against the real touchpoint files; 2 LOW clarifications (P3 lazy-init cold-path, P4 second stale comment) folded into E1/E3/Step 6/Step 8 this cycle; no new blocking issues; no developed behavior rests on Known-Gap)
Accepted by: session (autonomous /goal re-validation, PVL cycle 2) — cycle-1 concerns closed: (1) prep-time seed-flash blind spot → E1 synchronous seed + locked constraint (verified feasible against lines 32-43); (2) non-terminal taxonomy subset → E2/P2 (verified additive, no collision); (3) stale index.tsx doc comment(s) → E3 (both 12-14 and 43-47 confirmed); (4) terminal-exclusion test defensive-only → E4 (staff.ts:32-33 confirmed). No open concerns remain.

## Autonomous Goal Block

```
SESSION GOAL: STAFF-005 (#106) — add a live branch-scoped staff dashboard stat block + fix the prep-time autofill-blank-on-revisit bug (apps/mobile only).
Charter + umbrella plan: N/A — single SIMPLE plan (not a phase program).
Autonomy: reversible apps/mobile edits — proceed without pause. Hard stop only on: touching any backend/schema/migration file, changing the PATCH validation contract, or adding a staff-side is_accepting_pickup write path.
Hard stop conditions / safety constraints:
- Do NOT modify any packages/api, packages/types, packages/ui, or apps/admin source file — git diff --stat MUST stay apps/mobile/** only.
- Do NOT change the PATCH /api/staff/branch validation contract (z.number().int().min(1).max(120)) or orders.ts ETA-derivation.
- Do NOT add a staff-side is_accepting_pickup WRITE path (dashboard is read/display only for that state).
- Known-Gap is banned for the developed pure-function behavior (count derivation + seed state machine) — both MUST have passing Fully-Automated unit tests.
Next phase: EXECUTE (Gate: PASS, PVL cycle 2): process/features/staff-dashboard/active/staff-dashboard-home_20-07-26/staff-dashboard-home_PLAN_20-07-26.md
Validate contract: inline in plan (## Validate Contract, Gate: PASS, generated-by: outer-pvl, supersedes cycle 1)
Execute start: fully-auto: pnpm --filter @jojopotato/mobile test | pnpm --filter @jojopotato/mobile typecheck | pnpm --filter @jojopotato/mobile guard:theme-mode | pnpm --filter @jojopotato/api test | pnpm format:check ; agent-probe: dashboard visual + nav + stale-read + prep-time no-flash walkthrough (both modes) ; high-risk pack: no
```
