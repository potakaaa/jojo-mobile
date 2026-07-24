---
phase: staff-live-freshness
date: 2026-07-22
status: COMPLETE_WITH_GAPS
feature: staff-dashboard
plan: process/features/staff-dashboard/active/staff-live-freshness_22-07-26/staff-live-freshness_PLAN_22-07-26.md
---

# EXECUTE Report — Staff App Live Data Freshness

**TL;DR:** All three work items (A polling, B pull-to-refresh on 7 screens, C new-order toast)
implemented and green. 8/8 automated SPEC ACs pass across vitest + jest-expo; AC-8 (on-device
gesture/visual) is the standing Agent-Probe residual owed by the user. CODE DONE, not yet VERIFIED
— task folder stays in `active/`. The `pnpm typecheck` gate is red ONLY due to 7 pre-existing
errors in a concurrent task's `notifications` vitest file (outside this plan's blast radius);
zero errors are attributable to this work.

## What Was Done

All 21 touched files are within the plan's blast radius (`apps/mobile` `(staff)` +
`features/staff/{hooks,lib}`). Executed in plan order A → B → C, running the gate suite after each.

### Work Item A — polling (self-pickup reflection, AC-1/AC-2)
- **NEW** `features/staff/lib/staff-poll-config.ts` — `STAFF_ORDERS_POLL_INTERVAL = 10_000` +
  `STAFF_POLL_OPTIONS = { refetchInterval: 10000, refetchIntervalInBackground: false }`. Imports
  nothing from `@jojopotato/ui`/`react-native`/`staff-api` (node-env-vitest-safe per STAFF-005).
- `use-staff-orders.ts` — re-exports `STAFF_ORDERS_POLL_INTERVAL` (back-compat) and spreads
  `...STAFF_POLL_OPTIONS` (behavior byte-identical).
- `use-staff-order-detail.ts` — spreads `...STAFF_POLL_OPTIONS`, keeps `enabled`, updated comment.
- `use-completed-orders.ts` — spreads `...STAFF_POLL_OPTIONS`. Per **E1**, no in-hook `onSuccess`
  was added (there never was one; invalidation is external via `useUpdateOrderStatus`).
- Tests: `staff-poll-config.test.ts` (vitest, 3) + `use-staff-order-detail.test.tsx` /
  `use-completed-orders.test.tsx` (jest fake-timer polling, 3). **E3 fallback NOT needed** — the
  fake-timer + react-query polling tests are stable (verified across 4 repeat runs).

### Work Item B — pull-to-refresh on all 7 staff screens (AC-3/AC-4/AC-5)
- Direct idiom (`refreshing={query.isRefetching}`, `onRefresh={() => void refetch()}`, `tintColor`/
  `colors` from `theme.text`) + a `testID` on the `ScrollView` for: `active-orders`,
  `completed-orders`, `order-detail/[orderId]`, `product-availability`, `branch-pickup-settings`.
- `(staff)/index.tsx` dashboard — manual `useState` + `Promise.all` idiom (3 refetches), mirroring
  customer `(tabs)/index.tsx`.
- `pickup-lookup.tsx` (D1/E2) — `RefreshControl` whose `onRefresh` clears `errorMessage` ONLY and
  preserves the typed `code`.
- **AC-4** confirmed inherent — the `branch-pickup-settings` render-phase
  `if (settings && !prepState.hasSeeded)` seed guard means a mid-edit refetch never re-dispatches
  `SETTINGS_ARRIVED`. No reducer change (as planned).
- Tests: `staff-refresh.test.tsx` (7 — 6 screens' refetch wiring + an AC-5 error-with-data-retained
  case) + `pickup-lookup-refresh.test.tsx` (1 — D1 error-reset/code-preservation).

### Work Item C — new-order toast (AC-6/AC-7)
- **NEW** `features/staff/lib/detect-new-orders.ts` — pure `detectNewOrders(prev, next)`; `[]` when
  `prev === undefined` (baseline) or on a status-only change.
- **NEW** `features/staff/hooks/use-new-order-toast.ts` — ref-tracked diff; fires
  `showToast(msg, 'warning')` on a genuinely-new id; message `New order — <orderNumber>` (1) /
  `<N> new orders` (many).
- Toast wired at the screen root of `active-orders.tsx` and `(staff)/index.tsx` (explicit
  `visible/message/severity/mode` props — no spread; `bottomOffset = insets.bottom + Spacing.four`).
- Tests: `detect-new-orders.test.ts` (vitest, 6) + `new-order-toast.test.tsx` (jest render, 5 —
  baseline-no-toast, new-id toast, status-only no-toast, batch "N new orders", tap-dismiss, dashboard
  mount point).

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/mobile test` — vitest | **18 files / 122 tests pass** |
| `pnpm --filter @jojopotato/mobile test` — jest-expo | **38 suites / 186 tests pass** (stable ×3) |
| `pnpm --filter @jojopotato/mobile typecheck` | **Clean within blast radius**; 7 pre-existing errors remain in `features/notifications/lib/__tests__/prompt-and-register.test.ts` — see Gaps |
| `pnpm --filter @jojopotato/mobile lint` | **exit 0** (2 self-introduced `react/display-name` errors fixed; 5 remaining warnings are pre-existing in untouched files) |
| `pnpm --filter @jojopotato/mobile guard:theme-mode` | **OK** — 237 call sites, no spread on `<Toast>`, no raw `useColorScheme`, no new hex |
| `pnpm format:check` | **Clean** (4 files auto-formatted via `prettier --write`) |

Every developed behavior has a Fully-Automated proving gate (AC-1..AC-7). **No vacuous green, no
Known-Gap-only section.** AC-8 (Agent-Probe) covers only the physical-gesture/visual layer no runner
reaches — it is not the sole coverage of any developed behavior.

## What Was Skipped or Deferred
- **AC-8 (Agent-Probe on-device walkthrough)** — the sole owed item at CODE DONE. Standing
  project-wide no-RN-gesture/E2E-runner gap (documented in `process/context/tests/all-tests.md`).
  Blocks VERIFIED only, not CODE DONE. The E2 note applies: the on-device probe must specifically
  exercise the keyboard-up pull gesture on `pickup-lookup`.

## Plan Deviations (all within-blast-radius, documented)
1. **`useStaffMe` gained a `refetch`** (`features/staff/hooks/use-staff-me.ts`). The plan's
   checklist 12 assumed all 3 dashboard-home hooks expose `refetch`, but `useStaffMe` is a one-shot
   `useState/useEffect` hook with none. Added an additive `refetch` (extracted `fetchStaffMe` into a
   `useCallback`; mount effect unchanged) so the dashboard pull refreshes the branch name too. Within
   blast radius (`features/staff/hooks/**`); Touchpoints table did not name the file, Blast Radius
   directory does. Additive — existing consumers unaffected.
2. **`pickup-lookup` `onRefresh` releases the indicator on a microtask** (`Promise.resolve().then`)
   rather than a `setTimeout`. Same "brief indicator, clears error, preserves code" behavior, but
   leak-free (no lingering timer to poison the jest worker pool). Matches the plan's stated intent.
3. **Dashboard toast wiring passes raw `orders`** (undefined-while-loading), not the plan text's
   `orders ?? []`. Required for the first-load-no-toast baseline — passing `[]` during loading would
   seed the baseline to `[]` and toast on first real data. This matches the plan's own stated intent
   ("first data render seeds the ref with no toast"); the `orders ?? []` in the plan prose was
   imprecise. `active-orders` was correspondingly restructured (`data: orders = []` →
   `data: ordersData` + `const orders = ordersData ?? []`) to pass raw data to the toast hook.

## Test Infra Gaps Found
- **jest fake-timer + react-query `refetchInterval` leaks intervals into the shared worker pool.**
  My initial polling tests (Work Item A) leaked `setInterval` timers that poisoned sibling suites
  (`home-refresh`/`deals-refresh` flaked/hung). Fixed with rigorous per-test teardown:
  `afterEach` does `queryClient.clear()` + `queryClient.unmount()` + `jest.clearAllTimers()` +
  `jest.useRealTimers()`, plus RNTL auto-unmount. **Durable pattern for any future react-query
  polling test under jest.** Verified fixed: `home-refresh`/`deals-refresh` pass alongside the
  polling tests, full jest suite stable ×3.
- The pre-existing "A worker process has failed to exit gracefully / Active timers" warning is
  present in the base tree too (not introduced by this work).

## Pre-existing / Concurrent-Work Issue (NOT this plan's regression)
- `pnpm --filter @jojopotato/mobile typecheck` exits non-zero due to **7 TS2558 errors in
  `src/features/notifications/lib/__tests__/prompt-and-register.test.ts`** (`vi.fn<[], Promise<...>>()`
  — vitest's tightened `vi.fn` generic arity). Confirmed pre-existing via `git stash` (present with
  all my work removed) and belongs to the concurrent in-flight `push-notifications-fixes_22-07-26`
  task folder (untracked in the working tree), outside this plan's blast radius (`notifications` ≠
  `staff`). **Not fixed** — fixing it is scope expansion beyond the staff blast radius.
  Classification: **harness-drift**. Zero typecheck errors are attributable to this work.
- CONTEXT note: the working tree carries extensive uncommitted changes from other concurrent tasks
  (`packages/api`, `packages/types`, `packages/ui`, `(tabs)`, `home`, `deals`, `notifications`,
  `branch`). None were touched by this plan.

## Closeout Packet
- **Selected plan:** `process/features/staff-dashboard/active/staff-live-freshness_22-07-26/staff-live-freshness_PLAN_22-07-26.md`
- **Finished:** Work Items A/B/C — 10 new + 11 modified files, all within blast radius.
- **Verified:** all 8 automated SPEC ACs (vitest + jest), lint, guard:theme-mode, format:check.
- **Unverified:** AC-8 on-device Agent-Probe walkthrough (owed by user); package-wide `typecheck`
  gate is red only from the concurrent `notifications` task's pre-existing errors.
- **Cleanup remaining:** user runs AC-8; concurrent `notifications` typecheck errors handled by the
  push-notifications-fixes task, not here.
- **Best next state:** `Keep in active/testing` — CODE DONE, awaiting AC-8 before VERIFIED/archival.
- **Follow-up plan stubs created:** none.
- **CONTEXT_PARTIAL items:** none.

## Forward Preview
- **Test Infra Found:** react-query polling tests under jest MUST tear down the QueryClient +
  timers per-test (`queryClient.clear()`/`unmount()` + `jest.clearAllTimers()`) or they leak
  intervals that poison sibling suites — reuse this pattern for any future poll-cadence test.
- **Blast Radius Changes:** `useStaffMe` now returns an additive `refetch` (any future consumer can
  refresh the branch identity on demand).
- **Commands to Stay Green:** `pnpm --filter @jojopotato/mobile test` /
  `... guard:theme-mode` / `... lint` / `pnpm format:check`. `... typecheck` is clean for the staff
  surface but package-wide-red until the concurrent `notifications` `vi.fn` generic errors land.
- **Dependency Changes:** none (no new packages; reuses react-query, RN `RefreshControl`, existing
  `Toast`/`useToast`/`prepTimeReducer`).
