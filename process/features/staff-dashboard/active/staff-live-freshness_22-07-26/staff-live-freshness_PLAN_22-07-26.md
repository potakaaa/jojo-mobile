---
name: plan:staff-live-freshness
description: "Staff app live data freshness — poll Order Detail + Completed Orders, pull-to-refresh on all 7 staff screens, new-order toast on Active Orders + dashboard home"
date: 22-07-26
feature: staff-dashboard
---

# PLAN — Staff App Live Data Freshness

- **Date**: 22-07-26
- **Status**: DRAFT — awaiting VALIDATE (validate-contract required before EXECUTE)
- **Complexity**: COMPLEX (single-plan artifact, not a phase program)
- **Feature:** staff-dashboard
- **SPEC:** `staff-live-freshness_SPEC_22-07-26.md` (co-located)

**TL;DR:** Three mechanical, pattern-reuse work items across the `(staff)` surface — (A) make
`useStaffOrderDetail` + `useCompletedOrders` poll on the existing 10s convention, (B) wire the
already-proven `RefreshControl` idiom into all 7 staff screens, (C) add a pure `detectNewOrders`
diff + `useToast` wiring so a newly-arrived order raises a tap-to-dismiss `warning` toast on Active
Orders and the dashboard home. Zero backend, zero schema, one feature area. 6 of 8 SPEC ACs are
Fully-Automated (vitest + jest-expo, both runners already established); the 2 on-device visual/gesture
ACs are the standing project-wide Agent-Probe residual.

## Complexity Classification

**COMPLEX — single-plan artifact (NOT a phase program).** Rationale:
- ~11 files touched across 3 logical work items (A/B/C) — above the SIMPLE 8-15 atomic-step band and
  spanning screens + hooks + new pure utils + tests.
- No dependent phases, no per-phase validation gates, no cross-package coordination — one
  validate-contract, one EXECUTE pass, realistically one session. So a phase program is overkill.
- The three work items are independent (can be executed in any order) but share the same
  blast radius and one gate suite, which is exactly the COMPLEX-single-plan shape, not a program.

## Goals

1. A customer self-completing their own order is reflected on the staff Order Detail screen and in
   the Completed Orders list within the existing 10s poll window, no staff action required (SPEC
   Item 1 / AC-1, AC-2).
2. Every staff data screen supports the standard pull-to-refresh gesture, reusing the existing
   `RefreshControl` + `refetch()`/`isRefetching` idiom, without discarding an in-progress unsaved
   edit and without blanking on a failed refresh (SPEC Item 2 / AC-3, AC-4, AC-5).
3. A newly-arrived order raises an on-screen toast where `useStaffOrders` is already mounted (Active
   Orders + dashboard home), scoped by a pure id-diff, never firing twice for the same order (SPEC
   Item 3 / AC-6, AC-7).

## Scope

**In scope:** the exact behaviors in `staff-live-freshness_SPEC_22-07-26.md` (co-located). **Out of
scope:** everything under the SPEC's Out Of Scope section — real push notifications, sound/haptics,
any change to `PATCH /orders/:orderId/complete`, the 10s interval value, the Completed Orders
response shape, websockets, a toast queue, and any new backend route/schema.

## Acceptance Criteria

Verbatim from the co-located SPEC (proving gate + strategy in the Verification Evidence table below):

- **AC-1** — A customer self-completing an order updates that order's staff Order Detail screen
  within the same 10s polling window Active Orders uses, while the screen stays open.
  *proven by:* `use-staff-order-detail` poll config/behavior test. *strategy:* Fully-Automated.
- **AC-2** — A customer self-completing an order appears in the staff Completed Orders list without
  the staff member leaving and re-entering the screen. *proven by:* `use-completed-orders` poll
  test. *strategy:* Fully-Automated.
- **AC-3** — Every staff data screen (Active Orders, Completed Orders, Product Availability, Branch
  Pickup Settings, dashboard home, Order Detail, Pickup Code lookup) exposes a working
  pull-to-refresh gesture. *proven by:* per-screen `RefreshControl` render test. *strategy:*
  Fully-Automated.
- **AC-4** — Pull-to-refresh on Branch Pickup Settings mid-edit does not overwrite the in-progress
  prep-time value. *proven by:* existing `prepTimeReducer` mid-edit guard test. *strategy:*
  Fully-Automated.
- **AC-5** — A failed pull-to-refresh leaves prior data on screen and surfaces an error indication.
  *proven by:* per-screen rejected-refetch render test. *strategy:* Fully-Automated.
- **AC-6** — A newly-arrived order (id not in the prior poll) raises a toast naming the order while
  Active Orders or dashboard home is mounted. *proven by:* `detectNewOrders` unit test +
  `new-order-toast` render test. *strategy:* Fully-Automated.
- **AC-7** — The toast does not fire again for an id already seen in a prior poll (no repeat on a
  status change). *proven by:* same `detectNewOrders` / render tests. *strategy:* Fully-Automated.
- **AC-8** — On device: status visibly flips after external self-pickup; pull gesture smooth +
  spinner correct in light/dark; toast visibly appears + tap-dismisses. *proven by:* user-run
  walkthrough. *strategy:* Agent-Probe (no RN gesture/E2E runner exists — standing project-wide gap).

## Context Envelope

| # | Field | Value |
|---|---|---|
| 1 | feature | staff-dashboard |
| 2 | phase | PLAN |
| 3 | session-goal | Staff app live data freshness (poll + pull-to-refresh + new-order toast) |
| 4 | branch | development |
| 5 | worktree | main |
| 6 | context-group | tests (`process/context/tests/all-tests.md`) |
| 7 | blast-radius-packages | apps/mobile (`src/app/(staff)/**`, `src/features/staff/**`, `src/features/shared/**`) |
| 8 | active-plan | process/features/staff-dashboard/active/staff-live-freshness_22-07-26/staff-live-freshness_PLAN_22-07-26.md |
| 9 | test-runner | vitest (node, pure-TS) \| jest-expo (RN component) |
| 10 | validate-contract | pending (vc-validate-agent writes before EXECUTE) |

## Touchpoints

### Work Item A — Self-pickup reflection (polling)

| File | Change | Type |
|---|---|---|
| `apps/mobile/src/features/staff/lib/staff-poll-config.ts` | **NEW** pure module. Move `STAFF_ORDERS_POLL_INTERVAL` here and add `STAFF_POLL_OPTIONS = { refetchInterval: STAFF_ORDERS_POLL_INTERVAL, refetchIntervalInBackground: false } as const`. Must import NOTHING from `@jojopotato/ui`/`react-native`/`staff-api` — stays node-env-vitest safe (per the STAFF-005 import-chain constraint in all-context.md). | modify/create |
| `apps/mobile/src/features/staff/hooks/use-staff-orders.ts` | Re-export `STAFF_ORDERS_POLL_INTERVAL` from the new config module (back-compat — `active-orders.tsx` may import it) and spread `...STAFF_POLL_OPTIONS` into the `useQuery` call. Behavior byte-identical (same 10s + background-pause). | modify |
| `apps/mobile/src/features/staff/hooks/use-staff-order-detail.ts` | Spread `...STAFF_POLL_OPTIONS` into `useQuery`. Keep `enabled: Boolean(orderId)`. Remove the "no polling — transient" comment; document the self-pickup-reflection reason. | modify |
| `apps/mobile/src/features/staff/hooks/use-completed-orders.ts` | Spread `...STAFF_POLL_OPTIONS` into `useQuery`. Keep the existing `onSuccess`-invalidation behavior. Update the "no polling since terminal orders never change" comment. | modify |

### Work Item B — Pull-to-refresh on all 7 staff screens

Each screen adds a `RefreshControl` to its existing `ScrollView`, a `testID` on that `ScrollView`,
and derives `refreshing`/`onRefresh` from its query. Single-query screens use the direct idiom
(`refreshing={query.isRefetching} onRefresh={() => void query.refetch()}`); the dashboard home
(3 queries) uses the manual `useState` + `Promise.all` idiom already proven in customer
`(tabs)/index.tsx:206-220`.

| File | Query source(s) | testID | Notes |
|---|---|---|---|
| `apps/mobile/src/app/(staff)/active-orders.tsx` | `useStaffOrders` | `staff-active-orders-scroll` | direct idiom |
| `apps/mobile/src/app/(staff)/completed-orders.tsx` | `useCompletedOrders` | `staff-completed-orders-scroll` | direct idiom |
| `apps/mobile/src/app/(staff)/order-detail/[orderId].tsx` | `useStaffOrderDetail` | `staff-order-detail-scroll` | direct idiom; `refetch` from the hook |
| `apps/mobile/src/app/(staff)/product-availability.tsx` | `useStaffProducts` | `staff-product-availability-scroll` | direct idiom; the per-row `prevIsAvailable` sync already handles a refetched value safely |
| `apps/mobile/src/app/(staff)/branch-pickup-settings.tsx` | `useStaffBranchSettings` | `staff-branch-settings-scroll` | direct idiom. **AC-4 protection is inherent** — the render-phase `if (settings && !prepState.hasSeeded)` seed guard means a refetch after the field is seeded never re-dispatches `SETTINGS_ARRIVED`, so a mid-edit refresh cannot clobber the pending value. No reducer change. |
| `apps/mobile/src/app/(staff)/index.tsx` (dashboard home) | `useStaffMe` + `useStaffOrders` + `useStaffBranchSettings` | `staff-dashboard-scroll` | manual `useState`+`Promise.all` idiom (3 refetches) |
| `apps/mobile/src/app/(staff)/pickup-lookup.tsx` | none (imperative form) | `staff-pickup-lookup-scroll` | **See Decision D1** — no at-rest query; pull resets stale `errorMessage` only. |

### Work Item C — New-order toast

| File | Change | Type |
|---|---|---|
| `apps/mobile/src/features/staff/lib/detect-new-orders.ts` | **NEW** pure util. `detectNewOrders(prev: readonly StaffOrderSummary[] \| undefined, next: readonly StaffOrderSummary[]): string[]` → ids present in `next` but not `prev`; returns `[]` when `prev === undefined` (first poll = baseline). Only imports the `StaffOrderSummary` type. Node-env-vitest safe. | create |
| `apps/mobile/src/features/staff/hooks/use-new-order-toast.ts` | **NEW** hook. Input: the `useStaffOrders` data array + a `showToast(message, severity)` callback. Holds the previous poll's id set in a `useRef` (undefined until first data). On each data change, computes `detectNewOrders(prevIds, currentIds)`; if non-empty, calls `showToast(message(newIds, orders), 'warning')`, then updates the ref to the current id set. First data render seeds the ref with no toast. Message helper: 1 new → `New order — <orderNumber>`; N>1 → `<N> new orders`. | create |
| `apps/mobile/src/app/(staff)/active-orders.tsx` | Add `useToast()`, call `useNewOrderToast(orders, showToast)`, render `<Toast>` at the screen root (inside the outer `View`, after `SafeAreaView`), passing `visible/message/severity` explicitly (no spread — `check-theme-mode.mjs` bans spread on themed components), `onDismiss={hideToast}`, `mode={mode}`, and a `bottomOffset` from the safe-area inset (staff screens are pushed, not tab-root — no floating-tab-bar footprint). | modify |
| `apps/mobile/src/app/(staff)/index.tsx` (dashboard home) | Same `useToast()` + `useNewOrderToast(orders ?? [], showToast)` + `<Toast>` wiring as above. | modify |

## Public Contracts

- **No API/schema/wire contract changes.** All three data sources (`GET /api/staff/orders`,
  `GET /api/staff/orders/:orderId`, `GET /api/staff/orders/completed`) are consumed unchanged; only
  react-query client-side `refetchInterval` options change.
- **New internal module contracts (app-internal, not cross-package):**
  - `detectNewOrders(prev, next): string[]` — pure, deterministic.
  - `STAFF_POLL_OPTIONS` — shared react-query polling options constant.
  - `useNewOrderToast(orders, showToast): void` — side-effecting hook (fires toast; no return).
  - `usePullToRefresh` is intentionally NOT introduced — per-screen inline wiring matches the
    existing `branches-refresh.test.tsx` precedent and keeps each screen's test self-contained.
- **Branch isolation** is preserved automatically: every read still flows through the unchanged
  `requireStaff → resolveBranchScope → assertBranchScope` chain. No new authz surface.

## Blast Radius

- **Package:** `apps/mobile` only. **Directories:** `src/app/(staff)/**` (7 screens),
  `src/features/staff/{hooks,lib}/**` (3 hooks modified, 2 hooks/utils new, 1 config module),
  plus their `__tests__/`.
- **File count:** ~11 source files (7 screens + 3 hook edits + 1 config + 2 new
  hook/util) + ~9 test files.
- **Risk class:** LOW. Presentation + client-side fetch-cadence only. No high-risk class
  (no auth/billing/schema/migration/public-API/deploy surface). The one subtle correctness point
  (mid-edit refresh not clobbering an unsaved prep-time) is already structurally guaranteed by the
  existing `prepTimeReducer` seed guard — this plan does not weaken it.
- **Regression surfaces to keep green:** existing `dashboard-counts.test.ts`,
  `prep-time-reducer.test.ts`, `live-order-actions.test.tsx`, and the customer refresh suites
  (`branches-refresh`, `history-refresh`, `deals-refresh`, `home-refresh`) — all must stay passing;
  the shared idiom is reused, not modified.

## Data Flow

- **Polling (A):** `useStaffOrderDetail`/`useCompletedOrders` gain `refetchInterval: 10_000`. While
  the screen stays mounted and the app is foregrounded, react-query re-fetches every 10s. A
  customer's `PATCH .../complete` sets `status=completed` server-side; the next poll returns the new
  status, the query cache updates, and the screen re-renders. Backgrounded → poll paused
  (`refetchIntervalInBackground: false`), matching Active Orders exactly.
- **Pull-to-refresh (B):** gesture → `RefreshControl.onRefresh` → `refetch()` (bypasses staleTime) →
  spinner shown via `isRefetching` (or manual `refreshing` state) → on resolve, spinner hides and
  fresh data renders; on reject, react-query keeps the prior `data` (never blanks) and the screen's
  existing error state governs messaging.
- **New-order toast (C):** each `useStaffOrders` poll produces `orders`. `useNewOrderToast` diffs
  current ids against the previous poll's ids (`detectNewOrders`). First poll seeds the ref (no
  toast). A later poll containing an id not seen last poll → `showToast(..., 'warning')`. A
  status-only change (same id) → not in the diff → no toast. Ref updates to the current id set each
  poll so a given id toasts at most once.

## Failure Modes

| Mode | Handling |
|---|---|
| Refetch rejects during pull-to-refresh | react-query retains prior `data`; screen shows its existing error block only when there is no data at all; previously-rendered rows stay (AC-5). |
| Poll fires while app backgrounded | Suppressed by `refetchIntervalInBackground: false` (battery/network parity with Active Orders). |
| Toast fires twice for one order | Prevented — the previous-poll id ref is updated after each diff; a seen id never re-appears as "new" (AC-7). |
| Two orders arrive in one poll cycle | `useToast` is replace-latest (no queue) — the message names the count (`2 new orders`), not two separate toasts (matches SPEC Out Of Scope). |
| Mid-edit prep-time refresh | Inherent no-op: seed guard `!hasSeeded` blocks re-seed after first arrival (AC-4). |
| Pickup-lookup pull with a typed-but-unsubmitted code | D1: only `errorMessage` is reset; the typed `code` is preserved (never cleared mid-type). |

## Implementation Checklist

**Work Item A — polling (do first; smallest, unblocks AC-1/AC-2 tests):**

1. Create `apps/mobile/src/features/staff/lib/staff-poll-config.ts` exporting
   `STAFF_ORDERS_POLL_INTERVAL = 10_000` and
   `STAFF_POLL_OPTIONS = { refetchInterval: STAFF_ORDERS_POLL_INTERVAL, refetchIntervalInBackground: false } as const`.
2. Edit `use-staff-orders.ts`: import + re-export `STAFF_ORDERS_POLL_INTERVAL` from the config
   module and spread `...STAFF_POLL_OPTIONS` into `useQuery` (net behavior unchanged).
3. Edit `use-staff-order-detail.ts`: spread `...STAFF_POLL_OPTIONS`; keep `enabled`; update comment.
4. Edit `use-completed-orders.ts`: spread `...STAFF_POLL_OPTIONS`; keep invalidation; update comment.
5. Add `apps/mobile/src/features/staff/lib/__tests__/staff-poll-config.test.ts` (vitest) asserting
   `STAFF_POLL_OPTIONS` equals `{ refetchInterval: 10000, refetchIntervalInBackground: false }`.
6. Add jest polling tests (`use-staff-order-detail.test.tsx`, `use-completed-orders.test.tsx`) using
   `renderHook` + a real `QueryClient` + mocked `staff-api` + `jest.useFakeTimers()`: assert the
   mocked fetch fires a second time after advancing 10s (AC-1/AC-2). **Fallback if fake-timer +
   react-query polling proves flaky:** downgrade these two to the config-constant assertion in step 5
   plus a jest assertion that each hook module is wired to `STAFF_POLL_OPTIONS` (documented, not
   silent) — record the choice in the EXECUTE report.

**Work Item B — pull-to-refresh (per screen):**

7. `active-orders.tsx`: add `testID="staff-active-orders-scroll"` + `RefreshControl`
   (`refreshing={ordersQuery.isRefetching}`, `onRefresh={() => void refetch()}`, `tintColor`/`colors`
   from `theme.text`). Destructure `refetch`/`isRefetching` from `useStaffOrders()`.
8. `completed-orders.tsx`: same idiom with `useCompletedOrders`, `testID="staff-completed-orders-scroll"`.
9. `order-detail/[orderId].tsx`: same idiom with `useStaffOrderDetail`, `testID="staff-order-detail-scroll"`.
10. `product-availability.tsx`: same idiom with `useStaffProducts`,
    `testID="staff-product-availability-scroll"`.
11. `branch-pickup-settings.tsx`: same idiom with `useStaffBranchSettings`,
    `testID="staff-branch-settings-scroll"`. Confirm (no code change) that the existing seed guard
    protects the mid-edit case.
12. `(staff)/index.tsx`: add `testID="staff-dashboard-scroll"` + `RefreshControl` driven by a manual
    `const [refreshing, setRefreshing] = useState(false)` + `onRefresh` doing
    `Promise.all([staffMe.refetch(), orders.refetch(), branchSettings.refetch()])` in try/finally
    (mirror `(tabs)/index.tsx:206-220`). Destructure `refetch` from the three hooks (currently only
    `data` is destructured).
13. `pickup-lookup.tsx` (per D1): add `testID="staff-pickup-lookup-scroll"` + `RefreshControl` whose
    `onRefresh` sets a brief local `refreshing` flag and clears `errorMessage` (does not clear
    `code`), then resets `refreshing`.
14. Add per-screen jest render tests asserting the `RefreshControl` is wired
    (`getByTestId(...).props.refreshControl.props.onRefresh` triggers a refetch) — following
    `branches-refresh.test.tsx` verbatim as the template. Group logically (e.g.
    `staff-refresh.test.tsx` covering the list/detail/settings screens; a focused
    `pickup-lookup-refresh.test.tsx` for the D1 error-reset behavior). Include an AC-5 case
    (rejected refetch → prior rows retained) for at-rest-data screens.

**Work Item C — new-order toast:**

15. Create `apps/mobile/src/features/staff/lib/detect-new-orders.ts` (pure `detectNewOrders`).
16. Add `detect-new-orders.test.ts` (vitest): (a) new id appears → returned; (b) `prev === undefined`
    → `[]` (first-poll baseline, AC-6); (c) unchanged set → `[]`; (d) same id different status → `[]`
    (AC-7); (e) multiple new ids → all returned.
17. Create `use-new-order-toast.ts` (ref-tracked diff + `showToast` on new ids + message helper).
18. Wire `useToast()` + `useNewOrderToast(...)` + `<Toast>` into `active-orders.tsx` (compute a
    `bottomOffset` from safe-area inset — staff screens are pushed, so no floating-tab-bar footprint;
    reuse the inset the screen already reads or add `useSafeAreaInsets`).
19. Wire the same into `(staff)/index.tsx`.
20. Add jest render tests (`new-order-toast.test.tsx`) for both mount points: (a) a second poll with a
    new id renders a `toast-card` naming the order (AC-6); (b) a status-only change fires no toast
    (AC-7); (c) tapping `toast-card` dismisses it. Mock `useStaffOrders` to return successive datasets.

**Final gate (all items):**

21. Run the full gate suite (see Verification Evidence) and fix any red before handoff.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `staff-poll-config.test.ts` — `STAFF_POLL_OPTIONS` deep-equals `{ refetchInterval: 10000, refetchIntervalInBackground: false }` | Fully-Automated (vitest) | AC-1/AC-2 (shared poll convention value) |
| `use-staff-order-detail.test.tsx` — mocked fetch fires 2nd time after 10s advance | Fully-Automated (jest-expo, fake timers) | AC-1 |
| `use-completed-orders.test.tsx` — mocked fetch fires 2nd time after 10s advance | Fully-Automated (jest-expo, fake timers) | AC-2 |
| `staff-refresh.test.tsx` — each staff screen's `RefreshControl.onRefresh` triggers a refetch | Fully-Automated (jest-expo render) | AC-3 |
| `prep-time-reducer.test.ts` — existing "mid-edit SETTINGS_ARRIVED does not stomp" case (already green) | Fully-Automated (vitest) | AC-4 |
| `staff-refresh.test.tsx` — rejected refetch leaves prior rows rendered | Fully-Automated (jest-expo render) | AC-5 |
| `detect-new-orders.test.ts` — new id returned; baseline/unchanged/status-only → `[]` | Fully-Automated (vitest) | AC-6, AC-7 |
| `new-order-toast.test.tsx` — new id → toast rendered naming order; status-change → no toast; tap dismisses | Fully-Automated (jest-expo render) | AC-6, AC-7 |
| `pnpm --filter @jojopotato/mobile typecheck` clean | Fully-Automated | all (type safety) |
| `pnpm --filter @jojopotato/mobile lint` clean | Fully-Automated | all |
| `pnpm --filter @jojopotato/mobile guard:theme-mode` clean (no spread on `<Toast>`; no raw `useColorScheme`) | Fully-Automated | Item C constraint |
| `pnpm format:check` clean on touched files | Fully-Automated | all |
| On-device: Order Detail status visibly flips after external self-pickup; pull gesture smooth + spinner correct in light/dark; toast visibly appears + tap-dismisses | Agent-Probe (user-run) | AC-8 |

**Gate commands (full):**
```
pnpm --filter @jojopotato/mobile test        # vitest (pure) + jest-expo (component), sequential
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/mobile lint
pnpm --filter @jojopotato/mobile guard:theme-mode
pnpm format:check
```

**Known-Gap note:** AC-8 is Agent-Probe by design — no RN gesture/E2E runner exists project-wide
(documented standing gap in `process/context/tests/all-tests.md`). It is NOT assigned Known-Gap as a
terminal PASS for developed behavior: every developed behavior (polling wiring, RefreshControl
wiring, diff logic, toast firing) has a Fully-Automated proving gate above. AC-8 covers only the
physical-gesture/visual layer those automated gates structurally cannot reach. No developed behavior
is left vacuously green.

## Decisions (locked; flag D1 for VALIDATE review)

- **D1 — Pickup Lookup pull-to-refresh semantics. RESOLVED by VALIDATE (22-07-26): LOCK the plan
  default — keep Pickup Lookup in AC-3.** Pickup Lookup has no at-rest react-query data (it is an
  imperative form). SPEC AC-3 explicitly enumerates it, so the affordance is kept for cross-screen
  consistency. Its `RefreshControl.onRefresh` clears any stale `errorMessage` (resets a lingering
  "not found"/error state) and shows a brief refresh indicator; it does NOT clear the typed `code`
  (a mid-type wipe would be hostile). Its AC-3 test asserts the RefreshControl exists AND that
  `onRefresh` clears `errorMessage` while preserving `code` — it cannot assert the "bound to a
  query's refetch" shape the other screens use, because there is no query. **VALIDATE note (see
  execute-agent instruction E2):** `errorMessage` already auto-clears on keystroke
  (`onChangeText` -> `if (errorMessage) setErrorMessage(null)`), so the pull-reset has real value
  only in the "searched -> error -> didn't type -> pull" case; keep the wiring minimal, and AC-8's
  on-device probe must specifically exercise the pull gesture on this keyboard-form screen (the one
  place the gesture is non-standard). Descope was considered and rejected: the SPEC enumerates the
  screen and the behavior is cheap + testable.
- **D2 — No shared `usePullToRefresh` hook.** Per-screen inline wiring is chosen over a shared hook
  to match the existing `branches-refresh.test.tsx` precedent and keep each screen's gate
  self-contained. Reconsider only if a 3rd multi-query staff screen appears.
- **D3 — Toast severity + message.** `warning` (tap-to-dismiss, no auto-timeout) per SPEC. Message:
  `New order — <orderNumber>` for one, `<N> new orders` for many. Locked by SPEC; copy is
  PLAN-level and may be tuned in EXECUTE without re-plan.

## Test Infra Improvement Notes

(none identified yet — both required runners already exist. If the fake-timer + react-query polling
test in step 6 proves flaky under jest-expo, note it here during EXECUTE as a candidate for a shared
`renderQueryHook` helper; the config-constant fallback keeps AC-1/AC-2 Fully-Automated regardless.)

## Dependencies

- No new packages. Reuses `@tanstack/react-query`, `react-native` `RefreshControl`, existing
  `@jojopotato/ui` `Toast`, existing `useToast`, existing `prepTimeReducer`.
- Both test runners (vitest node-env, jest-expo RN component) already configured — no runner
  introduction needed.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Fake-timer polling test flakiness (AC-1/AC-2) | Medium | Documented config-constant fallback (step 6) keeps the AC Fully-Automated. |
| Toast `bottomOffset` mis-computation on pushed staff screens | Low | Staff screens are pushed (no tab-bar footprint) → offset = safe-area inset; verify via the toast render test + Agent-Probe AC-8. |
| `guard:theme-mode` failing on the new `<Toast>` call site (spread ban) | Low | Pass the 3 state fields explicitly (never `{...toast}`) — documented in `useToast`'s own JSDoc. |
| Regression to existing customer refresh suites | Very low | Idiom is reused, not modified; regression suites listed in Blast Radius must stay green in the gate run. |

## Backwards Compatibility

Fully backward-compatible. `STAFF_ORDERS_POLL_INTERVAL` stays importable from `use-staff-orders.ts`
(re-exported). No consumer of the three hooks changes its call shape. No wire/schema change.

## Phase Completion Rules

- **CODE DONE** (not VERIFIED): all Fully-Automated gates in Verification Evidence green
  (vitest + jest-expo suites, typecheck, lint, `guard:theme-mode`, `format:check`), EVL-confirmed by
  an independently spawned vc-tester (not on execute-agent self-report).
- **VERIFIED:** requires CODE DONE **plus** the AC-8 Agent-Probe on-device walkthrough performed and
  confirmed by the user. Until then the task folder stays in `active/` — do not archive.
- **Standing residual:** AC-8 is the only owed item at CODE DONE — the same project-wide
  no-RN-gesture/E2E-runner gap every UI-adjacent staff plan carries; not new debt, not blocking
  CODE DONE.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/staff-dashboard/active/staff-live-freshness_22-07-26/staff-live-freshness_PLAN_22-07-26.md`
2. **Last completed step:** PLAN written (this artifact). No code changes yet.
3. **Validate-contract status:** PENDING — vc-validate-agent must write the `## Validate Contract`
   section before EXECUTE. This plan touches no schema/auth/API/billing surface, but it is COMPLEX
   with 11 source files and 8 mapped ACs, so VALIDATE is NOT skipped.
4. **Supporting context loaded:** `staff-live-freshness_SPEC_22-07-26.md` (co-located),
   `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `process/context/planning/all-planning.md`. Grounded directly in: all 7 `(staff)` screens, all
   staff hooks, `prep-time-reducer.ts` (+ its test), `packages/ui/src/components/toast.tsx`,
   `use-toast.ts`, `branches-refresh.test.tsx` (RefreshControl test precedent), and
   `(tabs)/index.tsx` (multi-query refresh precedent).
5. **Next step for a fresh agent:** run VALIDATE (V1–V7) to produce the validate-contract with the
   test-gate matrix above, resolve D1, then EXECUTE Work Item A → B → C in order, running the gate
   suite after each item (per-section test gates), then the full suite at the end.

## Validate Contract

Status: PASS
Date: 22-07-26
date: 2026-07-22
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 1/7 (only S7 — 5+ files in blast radius). Single feature area
(`apps/mobile` `(staff)` surface), one shared gate suite, interdependent work items (toast wiring
depends on `detectNewOrders` + `useNewOrderToast`; all 7 screens share the RefreshControl idiom).
Parallel subagents would fragment the shared gate suite. Recommend ONE `vc-execute-agent` (opus),
Work Item A -> B -> C in order, running the gate suite after each item.

Test gates (C3 5-column table — ADDITIVE; the legacy line form below it is retained for existing consumers):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1/AC-2 | `STAFF_POLL_OPTIONS` is the shared 10s+background-pause poll convention value | Fully-Automated | `staff-poll-config.test.ts` — deep-equals `{ refetchInterval: 10000, refetchIntervalInBackground: false }` (vitest) | B |
| AC-1 | Order Detail hook re-fetches on the 10s poll while mounted | Fully-Automated | `use-staff-order-detail.test.tsx` — mocked fetch fires a 2nd time after 10s fake-timer advance (jest-expo) | B |
| AC-2 | Completed Orders hook re-fetches on the 10s poll while mounted | Fully-Automated | `use-completed-orders.test.tsx` — mocked fetch fires a 2nd time after 10s fake-timer advance (jest-expo) | B |
| AC-3 | Each staff screen wires a working RefreshControl bound to its query's refetch | Fully-Automated | `staff-refresh.test.tsx` — `getByTestId(<screen-scroll>).props.refreshControl.props.onRefresh` triggers a refetch, per screen (jest-expo) | B |
| AC-3 (pickup-lookup) | Pickup Lookup RefreshControl `onRefresh` clears `errorMessage` and preserves `code` | Fully-Automated | `pickup-lookup-refresh.test.tsx` — onRefresh clears error, leaves typed code intact (jest-expo) | B |
| AC-4 | Mid-edit refresh does not clobber an unsaved prep-time value | Fully-Automated | `prep-time-reducer.test.ts` — EXISTING "SETTINGS_ARRIVED mid-edit does not stomp" case (already green, re-run as regression) | A |
| AC-5 | Failed pull-to-refresh retains prior rows + surfaces error | Fully-Automated | `staff-refresh.test.tsx` — rejected refetch leaves prior rows rendered (jest-expo) | B |
| AC-6/AC-7 | `detectNewOrders` returns only genuinely-new ids; `[]` on baseline/unchanged/status-only | Fully-Automated | `detect-new-orders.test.ts` — new id returned; `prev===undefined`/unchanged/status-only -> `[]`; multi-new -> all (vitest) | B |
| AC-6/AC-7 | New-order toast renders naming the order; no repeat on status change; tap dismisses | Fully-Automated | `new-order-toast.test.tsx` — 2nd poll with new id renders `toast-card` naming order; status-only -> no toast; tap `toast-card` dismisses (jest-expo) | B |
| all | Type safety across the blast radius | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` exits 0 | A |
| all | Lint clean | Fully-Automated | `pnpm --filter @jojopotato/mobile lint` exits 0 | A |
| Item C constraint | No spread on `<Toast>`; no raw `useColorScheme` | Fully-Automated | `pnpm --filter @jojopotato/mobile guard:theme-mode` exits 0 | A |
| all | Formatting clean on touched files | Fully-Automated | `pnpm format:check` exits 0 | A |
| AC-8 | On-device: status flips after external self-pickup; pull gesture smooth + spinner correct light/dark (incl. keyboard-up pickup-lookup pull); toast appears + tap-dismisses | Agent-Probe | user-run device/simulator walkthrough | D |

gap-resolution legend: A — proven now (gate passes in this cycle / existing test) · B — gate added by this plan's checklist · C — deferred to a named later phase/plan · D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy` column carries ONLY proving strategies (Fully-Automated / Agent-Probe here). Known-Gap is never a strategy — AC-8's physical-gesture/visual layer is a named residual (gap-resolution D), not the sole coverage of any developed behavior.

Failing stubs (Fully-Automated new-behavior rows only — TDD red-first starting points, NOT on-disk files):

```
test("STAFF_POLL_OPTIONS equals the shared 10s poll convention", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: STAFF_POLL_OPTIONS deep-equals { refetchInterval: 10000, refetchIntervalInBackground: false }")
})
test("useStaffOrderDetail re-fetches after a 10s poll while mounted", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: mocked fetch fires a 2nd time after 10s fake-timer advance")
})
test("useCompletedOrders re-fetches after a 10s poll while mounted", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: mocked fetch fires a 2nd time after 10s fake-timer advance")
})
test("each staff screen's RefreshControl onRefresh triggers a refetch", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: getByTestId(scroll).props.refreshControl.props.onRefresh triggers refetch")
})
test("pickup-lookup onRefresh clears errorMessage and preserves code", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: onRefresh clears error, leaves typed code intact")
})
test("failed pull-to-refresh leaves prior rows rendered", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: rejected refetch retains previously-rendered rows")
})
test("detectNewOrders returns only new ids; baseline/unchanged/status-only give []", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: new id returned; prev===undefined/unchanged/status-only -> []; multi-new -> all")
})
test("new-order toast renders naming order, no repeat on status change, tap dismisses", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: 2nd poll new id renders toast-card; status-only -> no toast; tap dismisses")
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- Work Item A (polling): Fully-automated: `pnpm --filter @jojopotato/mobile test` (staff-poll-config.test.ts + use-staff-order-detail.test.tsx + use-completed-orders.test.tsx)
- Work Item B (pull-to-refresh): Fully-automated: `pnpm --filter @jojopotato/mobile test` (staff-refresh.test.tsx + pickup-lookup-refresh.test.tsx + existing prep-time-reducer.test.ts)
- Work Item C (toast): Fully-automated: `pnpm --filter @jojopotato/mobile test` (detect-new-orders.test.ts + new-order-toast.test.tsx)
- Cross-cutting: Fully-automated: `pnpm --filter @jojopotato/mobile typecheck` + `... lint` + `... guard:theme-mode` + `pnpm format:check`
- On-device: agent-probe: AC-8 user-run walkthrough (documented standing no-RN-gesture/E2E-runner gap)

Dimension findings:
- Infra fit: PASS — `apps/mobile` only; both runners (vitest node-env + jest-expo RN component) already configured; RefreshControl idiom (4 precedents), multi-query idiom (`(tabs)/index.tsx`), and `Toast`/`useToast` primitives all confirmed present. `staff-poll-config.ts` node-env-vitest import-chain constraint correctly identified (STAFF-005 lesson). No container/port/proxy surface.
- Test coverage: PASS — 8 of 8 dev behaviors have a Fully-Automated proving gate; AC-8 Agent-Probe covers only the physical-gesture/visual layer no runner reaches (not the sole coverage of any behavior — no vacuous green). One watch-item: AC-1/AC-2 fake-timer + react-query polling can be flaky under jest-expo; plan carries a documented config-constant fallback (checklist step 6) that keeps the AC Fully-Automated. Not a high-risk class -> no hybrid-minimum triggered.
- Breaking changes: PASS — no API/schema/wire change; the three read routes are consumed unchanged (only client-side `refetchInterval` added). `STAFF_ORDERS_POLL_INTERVAL` stays importable via re-export (back-compat). All three hooks keep their `UseQueryResult` return shape.
- Security surface: PASS — branch isolation preserved automatically (all reads still flow through the unchanged `requireStaff -> resolveBranchScope -> assertBranchScope` chain); zero new authz/ownership surface; no auth/billing/schema/migration/trust-boundary. LOW risk — 5-artifact evidence pack not required.
- Section A (polling) feasibility: PASS — `STAFF_POLL_OPTIONS` spreads trivially into all three `useQuery` calls; highest-risk edit is the fake-timer polling test (mitigated by the config-constant fallback). See E1.
- Section B (pull-to-refresh) feasibility: PASS — 4 refresh-test precedents + proven multi-query idiom; every staff hook exposes `refetch`/`isRefetching`; highest-risk edit is the dashboard-home `Promise.all` wiring (verbatim precedent exists) and the pickup-lookup D1 case (resolved, see E2).
- Section C (toast) feasibility: PASS — `Toast` exposes `testID="toast-card"`, `onDismiss`, `bottomOffset`, explicit `visible/message/severity/mode` props (no spread needed); `detectNewOrders` pure; highest-risk edit is the first-poll ref-seed-without-firing in `useNewOrderToast` (well-specified; `detectNewOrders` returns `[]` when `prev===undefined`).

Execute-agent instructions (informational — no residual design risk):
- E1 — `use-completed-orders.ts` has NO `onSuccess` callback in the hook itself (invalidation is external, via `useUpdateOrderStatus` onSuccess). The plan's "keep the existing onSuccess-invalidation behavior" wording is a doc imprecision: just spread `...STAFF_POLL_OPTIONS` into `useQuery`; there is no in-hook `onSuccess` to preserve. Do not add one.
- E2 — Pickup Lookup (D1, RESOLVED = keep in AC-3): `onRefresh` must clear `errorMessage` ONLY and MUST NOT clear the typed `code`. Its test asserts both (error cleared, code preserved). Keep the wiring minimal — `errorMessage` already auto-clears on keystroke, so this is a thin affordance. The AC-8 on-device probe MUST specifically exercise the pull gesture on this keyboard-form screen (keyboard up and down), the one screen where the gesture is non-standard.
- E3 — If the AC-1/AC-2 fake-timer polling tests prove flaky under jest-expo, take the plan's documented fallback (config-constant assertion + module-wiring assertion), record the choice in the EXECUTE report; do not silently drop the AC.

Open gaps: none blocking. AC-8 on-device Agent-Probe walkthrough is the sole owed item at CODE DONE — the standing project-wide no-RN-gesture/E2E-runner gap documented in `process/context/tests/all-tests.md`, not new debt. It does not block CODE DONE; it blocks VERIFIED (per the plan's Phase Completion Rules).

What this coverage does NOT prove:
- `staff-poll-config.test.ts` / `use-staff-order-detail.test.tsx` / `use-completed-orders.test.tsx`: prove the poll cadence is wired and re-fires under fake timers; do NOT prove that a real device, foregrounded, actually re-renders the flipped status text on a live 10s tick after a real customer self-pickup (AC-8 visual).
- `staff-refresh.test.tsx` / `pickup-lookup-refresh.test.tsx`: prove the RefreshControl is wired and `onRefresh` calls refetch / clears error; do NOT prove the physical pull-down gesture triggers it on a real device, nor that the platform spinner shows/hides smoothly in light/dark (AC-8), nor keyboard-up gesture behavior on pickup-lookup.
- `prep-time-reducer.test.ts`: proves the reducer guard; does NOT prove the on-screen field visibly retains the edit through a real pull gesture (AC-8).
- `detect-new-orders.test.ts` / `new-order-toast.test.tsx`: prove the diff logic and toast render/dismiss under mocked successive datasets; do NOT prove the toast visibly appears at the correct on-device offset above the safe-area inset, nor that a real tap dismisses it on hardware (AC-8).
- typecheck / lint / guard:theme-mode / format:check: prove type/style/formatting correctness; prove no runtime or visual behavior.

Gate: PASS (no FAILs; D1 resolved by VALIDATE — plan updated; two informational execute-agent instructions carry no residual design risk; every developed behavior has a Fully-Automated proving gate)
Accepted by: session (autonomous VALIDATE) — Gate is PASS; no CONCERN required user acceptance. D1 flagged item resolved (locked: keep Pickup Lookup in AC-3). E1/E2/E3 are informational execute-agent instructions, not accepted concerns.

## Autonomous Goal Block

```
SESSION GOAL: Staff App Live Data Freshness — poll Order Detail + Completed Orders on the existing 10s convention, add pull-to-refresh to all 7 (staff) screens, and raise a new-order toast on Active Orders + dashboard home.
Charter + umbrella plan: N/A — single COMPLEX plan (feature: staff-dashboard)
Autonomy: reversible apps/mobile-only presentation + client-fetch-cadence work; proceed without gates on all reversible decisions. Subagent delegation stays mandatory (no inline execution). Model: opus for EXECUTE, sonnet elsewhere.
Hard stop conditions / safety constraints:
- Do NOT change any backend route, schema, migration, or the 10s interval value / Completed Orders response shape (SPEC Out Of Scope).
- Do NOT weaken the prepTimeReducer hasSeeded seed guard (AC-4 mid-edit protection is inherent — no reducer change).
- Do NOT use a `{...toast}` spread at the `<Toast>` call site (guard:theme-mode hard-fails); pass visible/message/severity/mode explicitly.
- Do NOT clear the typed `code` on Pickup Lookup pull-to-refresh (E2) — clear errorMessage only.
Next phase: EXECUTE — process/features/staff-dashboard/active/staff-live-freshness_22-07-26/staff-live-freshness_PLAN_22-07-26.md
Validate contract: inline in plan (## Validate Contract, Gate: PASS)
Execute start: Work Item A (polling) -> B (pull-to-refresh) -> C (toast), gate suite after each item. Fully-auto: `pnpm --filter @jojopotato/mobile test` + `... typecheck` + `... lint` + `... guard:theme-mode` + `pnpm format:check`. Agent-probe: AC-8 on-device walkthrough. High-risk pack: no.
```

