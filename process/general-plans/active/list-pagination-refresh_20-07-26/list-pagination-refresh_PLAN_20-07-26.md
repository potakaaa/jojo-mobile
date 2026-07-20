---
name: plan:list-pagination-refresh
description: "Pull-to-refresh (Branches/History/Deals/Home) + Order History useInfiniteQuery pagination + duplicate-fetch-path cleanup + backend cursor test coverage"
date: 20-07-26
feature: general
---

# PLAN — Pull-to-Refresh, Order History Pagination, and Duplicate-Fetch Cleanup

Date: 20-07-26

Status: CODE DONE (EXECUTE complete 20-07-26; all 6 automated gates green) — NOT VERIFIED (AC11 device-half + AC12 Agent-Probe walkthroughs owed; stays in active/)

Complexity: COMPLEX

**TL;DR:** Rewrite `use-order-history.ts` as one `useInfiniteQuery` hook shared by Home (page-1 only)
and History (full pagination); add pull-to-refresh to Branches / History / Deals / Home; delete the
duplicate Home order-history `useQuery`; close the untested backend cursor-pagination gap in
`orders.test.ts`. Client-only behavior change plus one backend test-only addition — no API contract
change. **Complexity: COMPLEX** (9 source/test files across 2 packages + 7 new RN component test
files, 3 real risk areas: shared-hook multi-consumer, gorhom bottom-sheet refresh, react-query
error-preservation semantics). Lands on the current branch `feat/font-tone-payment-overflow`.

---

## Overview

Adds pull-to-refresh to Branches/History/Deals/Home, page-by-page loading to Order
History, and collapses the duplicate order-history fetch path into one shared react-query
`useInfiniteQuery`. Client-only behavior change plus a backend test-only addition.

### Goals

1. Order History paginates page-by-page via `useInfiniteQuery` (mount = page 1; scroll-near-bottom
   appends older pages; stops cleanly when `nextCursor` is null).
2. Pull-to-refresh works on Branches (web `FlatList` + native `BottomSheetFlatList`), Order History
   (`FlatList`), Deals (`ScrollView`), and Home (screen-level `ScrollView`, one gesture refetches
   all mounted queries).
3. Order History is fetched through exactly ONE react-query path — delete the second, uncoordinated
   Home `useQuery({ queryFn: fetchOrderHistory })`.
4. Distinct empty ("no orders yet") vs error ("couldn't load") states; a failed refresh / load-more
   never blanks already-loaded orders.
5. The backend's existing `GET /orders` cursor pagination gains real automated test coverage.
6. Reorder keeps working from any page (regression-only; no design change).

## Scope

**In scope:** the 9 files in Blast Radius below + 7 new jest-expo RN component test files + one
existing jest-expo test-mock update (`history-screen-dark-mode.test.tsx`) + new backend supertest
cases. **Out of scope (locked in SPEC):** pagination on Branches/Deals/Home;
per-widget Home refresh; any `GET /orders` API contract change; websockets/live push; order
placement / reorder business logic / deal eligibility / checkout; migrating `use-order.ts` off
`use-async-data.ts`; adding a Detox/Maestro/Playwright E2E runner.

---

## Locked Decisions (from INNOVATE + this PLAN's research — do not re-litigate)

| # | Decision | Source |
|---|---|---|
| D1 | `use-order-history.ts` becomes ONE `useInfiniteQuery` hook returning the raw `UseInfiniteQueryResult` (mirrors `apps/admin/.../use-admin-orders.ts`). All consumers (Home, History, deal-usage) consume it; each selects what it needs. | INNOVATE Q1 |
| D2 | Home reads `data?.pages[0]?.orders` only (never calls `fetchNextPage`), so it gets exactly one page-1 request — today's behavior for free. Delete Home's duplicate `useQuery(['orders'])`. | INNOVATE Q1 |
| D3 | `fetchOrderHistory({ limit?, cursor? })` accepts params and RETURNS `{ orders, nextCursor }` (stops discarding `nextCursor`). | INNOVATE Q1 |
| D4 | Native `BottomSheetFlatList` refresh: pass plain `onRefresh` + `refreshing` **direct props** — gorhom 5.2.14 auto-wires the Android gesture internally (`ScrollableContainer.android.tsx`). NO deep import of `BottomSheetRefreshControl` (it is not a public export), NO `scrollableGesture` wiring by us, NO new dependency. Web `FlatList` / `ScrollView` use the standard `refreshControl={<RefreshControl/>}` prop. | This PLAN's node_modules source read (supersedes INNOVATE's tentative Android note) |
| D5 | Home refresh = `Promise.all([...refetch()])` across mounted query hooks (menu, deals, branch, rewards, and the shared order-history hook). NOT `queryClient.invalidateQueries()` by key. Order-history IS included (covers the active-order banner, same query — Q3 open item resolved: INCLUDE). Rewards included too (whole-screen gesture per Q3, one extra refetch, low risk). | INNOVATE Q3 |
| D6 | No shared `useListRefresh` hook and no shared RefreshControl tint constant. Each screen already computes `theme` via `useTheme()`; inline `tintColor={theme.text}` + `colors={[theme.text]}` at the 5 sites. A shared token would have to be theme-aware (a function of mode), which is more machinery than 5 one-prop inlines. | INNOVATE Q2/Q4 |
| D7 | Delete ONLY the stale "no react-query in this repo" docstring lines in `use-async-data.ts`. The file itself STAYS (`use-order.ts` still depends on it). After the rewrite, `use-order-history.ts` must no longer import `use-async-data.ts`. | INNOVATE Q1 |
| D8 | RN component tests are Fully-Automated via the EXISTING jest-expo runner (`apps/mobile` `test: "vitest run --passWithNoTests && jest"`; precedent: `history-screen-dark-mode.test.tsx`, `account-screen.test.tsx`, `deals-screens.test.tsx`; helpers `@testing-library/react-native` + `@/test-utils/render`). This is real coverage, not the standing "no RN runner" gap (that gap is now E2E/navigation-only). | This PLAN's runner-config read |

---

## Touchpoints

**Files changed (9):**

1. `apps/mobile/src/features/orders/lib/api-client.ts` — `fetchOrderHistory` signature + return shape.
2. `apps/mobile/src/features/orders/hooks/use-order-history.ts` — full rewrite to `useInfiniteQuery`.
3. `apps/mobile/src/app/(tabs)/history/index.tsx` — pagination UI + `RefreshControl` + footer + empty/error off infinite-query flags.
4. `apps/mobile/src/app/(tabs)/index.tsx` (Home) — delete duplicate `useQuery`, repoint to shared hook, add screen-level `RefreshControl` + `Promise.all` refetch.
5. `apps/mobile/src/app/(tabs)/branches/index.tsx` — `RefreshControl` on web `FlatList` (~L177) + native `BottomSheetFlatList` (~L278).
6. `apps/mobile/src/app/(tabs)/deals/index.tsx` — `RefreshControl` on the `ScrollView` (~L42).
7. `apps/mobile/src/features/shared/hooks/use-async-data.ts` — remove stale docstring lines only (D7).
8. `packages/api/src/routes/__tests__/orders.test.ts` — new cursor-pagination supertest cases.
9. `apps/mobile/src/features/deals/hooks/use-deal-usage.ts` — 3rd `useOrderHistory()` consumer (found by PVL). Its `const { data: orders } = useOrderHistory();` + `orders.filter(...)` reads the OLD `Order[]` shape; after D1 the hook returns `InfiniteData<{ orders, nextCursor }>`, so `.filter` no longer exists on `data`. Update the destructure to read the new shape (see checklist step 2b) — this is a real functional fix (deal usage-limit eligibility), not cosmetic, and is required for the mobile `typecheck` gate to pass.

**Files read for context (not changed):** `apps/admin/src/features/orders/hooks/use-admin-orders.ts`
(idiom precedent), `apps/mobile/src/lib/query-client.ts` (global client config), `packages/api/src/routes/orders.ts:521-563`
(the read route under test), `apps/mobile/src/components/floating-tab-bar.tsx` (`getFloatingTabBarClearance`),
`packages/ui/src/components/empty-state.tsx` (`EmptyState`), `apps/mobile/src/features/orders/hooks/use-reorder.ts` (regression target).

**New files (7 jest-expo RN component test files):** `branches-refresh.test.tsx`, `history-refresh.test.tsx`,
`deals-refresh.test.tsx`, `home-refresh.test.tsx`, `history-pagination.test.tsx`, `history-empty-error-states.test.tsx`,
`history-single-source.test.tsx` — colocated under each screen/feature's `__tests__/` dir following the
existing convention (e.g. `apps/mobile/src/app/(tabs)/history/__tests__/` or the feature folder, matching
where `history-screen-dark-mode.test.tsx` lives — execute-agent confirms the exact existing dir).

**Existing test file updated (1):** `apps/mobile/src/features/orders/__tests__/history-screen-dark-mode.test.tsx`
— its `useOrderHistory` mock returns the OLD `{ data: Order[], loading, error }` shape (cast `as unknown`
~L122). After the rewrite the History screen reads `data?.pages.flatMap(...)`, so the old array-shaped
mock has no `.pages` — the screen renders empty and the dark-mode assertions go vacuous/break. Update the
mock to the `useInfiniteQuery` return shape (see checklist step G0).

---

## Public Contracts

- **`fetchOrderHistory` (internal module API, mobile only):** signature changes from
  `() => Promise<Order[]>` to `(params?: { limit?: number; cursor?: string | null }) => Promise<{ orders: Order[]; nextCursor: string | null }>`.
  **`fetchOrderHistory()` (the underlying api-client fn) call sites:** `use-order-history.ts` (the hook
  itself) and Home's `(tabs)/index.tsx` `useQuery` — both rewritten in this plan (Home's direct call is
  deleted when its duplicate `useQuery` is removed). Not exported outside `apps/mobile`. No cross-package contract.
- **`useOrderHistory()` (internal hook API):** return type changes from `AsyncDataState<Order[]>`
  (`{ data, loading, error, refetch }`) to react-query's `UseInfiniteQueryResult<InfiniteData<{ orders; nextCursor }>>`.
  **`useOrderHistory()` hook consumers (2):** `apps/mobile/src/app/(tabs)/history/index.tsx` and
  `apps/mobile/src/features/deals/hooks/use-deal-usage.ts` (found by PVL). Both are updated in-plan
  (History = full pagination; deal-usage = flatten pages to read the order list). Home does NOT consume
  the `useOrderHistory()` hook today — it calls `fetchOrderHistory` directly via a plain `useQuery`; this
  plan repoints Home onto the shared hook (page-1 read). Consumer inventory is grep-verified during EXECUTE
  (checklist step 0) — if a 4th consumer appears, STOP and surface it.

---

## Blast Radius

- **Packages:** 2 (`apps/mobile`, `packages/api`).
- **Source files changed:** 8 in `apps/mobile` + 1 test file in `packages/api` = 9.
- **New test files:** 7 (jest-expo) + 1 existing jest-expo test-mock update.
- **Risk class:** MEDIUM. No schema, no migration, no auth, no billing, no public API contract change,
  no destructive writes. The elevated-attention areas are (a) a shared hook with three consumers whose
  return shape changes, (b) third-party bottom-sheet refresh gesture wiring, (c) react-query
  error/data co-existence semantics. All three are code-local and covered by automated component tests.
- **Signal score (vc-agent-strategy-compare):** ~2/7 (S1 multi-package: partial/no — 2 packages but
  test-only in the 2nd; S7 5+ files: yes). Recommended EXECUTE strategy: **sequential single agent** —
  the changes are interdependent (shared hook → all three consumers) and must be made in one coherent
  pass, not fanned out.

---

## Data Flow

**Before:** Home `useQuery(['orders'], fetchOrderHistory)` → fetch A (own cache). History
`useOrderHistory()` → `useAsyncData(fetchOrderHistory)` → fetch B (bespoke, own state). Deal-usage
`useOrderHistory()` → same bespoke fetch B, then `orders.filter(...)`. Two
independent fetches of identical data on every app open; none pass params; all discard `nextCursor`.

**After:** One `useOrderHistory()` → `useInfiniteQuery({ queryKey: ['orders','history'], queryFn:
({pageParam}) => fetchOrderHistory({ cursor: pageParam }), initialPageParam: null, getNextPageParam:
(last) => last.nextCursor })`. Home reads `data?.pages[0]?.orders` (page-1 request only). History
flattens `data.pages.flatMap(p => p.orders)` and calls `fetchNextPage()` on `onEndReached`. Deal-usage
flattens `data?.pages.flatMap((p) => p.orders) ?? []` then applies its existing `.filter`. Single
shared react-query cache; all screens read the same entry.

**Refresh flow (all 4 surfaces, identical shape):** user pulls → `onRefresh` sets/reads
`isRefetching` (or a local `refreshing` bool for Home's `Promise.all`) → `refetch()` forces a real
network fetch regardless of the 30s `staleTime` (react-query standard) → on success list updates,
indicator hides; on failure `isError` flips but `data` (prior pages) is retained → error indication
shown, nothing blanks.

---

## Failure Modes & Handling

| Failure | Handling | Proven by |
|---|---|---|
| Initial History load fails | `data` undefined + `isError` true → full error state with Retry (existing `ScreenMessage`). | `history-empty-error-states.test.tsx` (AC9) |
| `fetchNextPage()` (load-more) fails | react-query keeps prior `pages` in `data`; `isError`/`error` set; footer shows an error/retry, list unchanged. No extra state management needed — this is react-query's default `data`/`error` co-existence (SPEC item 7 confirmed). | `history-empty-error-states.test.tsx` (AC9) |
| Refresh fails on any surface | `refetch()` rejects; `data` retained; `isRefetching` returns false; error indication shown; previously-loaded items stay visible. | `*-refresh.test.tsx` error-path cases (AC1-3) |
| Empty history (0 orders ever) | page-1 `orders: []`, `nextCursor: null`, `isError` false → distinct `EmptyState` "No orders yet". Never confused with error. | `history-empty-error-states.test.tsx` (AC8) |
| End-of-list reached | `hasNextPage` false → `onEndReached` no-ops (guard `if (hasNextPage && !isFetchingNextPage) fetchNextPage()`); no further requests. | `history-pagination.test.tsx` (AC7) |
| Home `Promise.all` partial failure | `Promise.all` rejects if any refetch throws; wrap in `try/finally` so `refreshing` always clears; individual sections already render their own error/retry (existing Home per-section states), so a partial failure degrades gracefully. | `home-refresh.test.tsx` (AC4) |

---

## Implementation Checklist

> Ordered for execution. Each item is atomic. Test-gate loop: after the hook rewrite (steps 1-2b) and
> after each screen, run the covering jest-expo test(s) before continuing (per-section gate).

**Phase A — shared hook + api-client + hook consumers off the old shape (the foundation; do first):**

0. Grep-verify consumer inventory before editing: `rg "useOrderHistory|fetchOrderHistory" apps/mobile/src`
   — confirm the only consumers are `use-order-history.ts`, `(tabs)/history/index.tsx`, `(tabs)/index.tsx`,
   and `features/deals/hooks/use-deal-usage.ts`. If a 5th consumer exists, STOP and surface it (Public
   Contracts assumption breach).
1. `api-client.ts`: change `fetchOrderHistory` to
   `export async function fetchOrderHistory(params?: { limit?: number; cursor?: string | null }): Promise<{ orders: Order[]; nextCursor: string | null }>`.
   Build the query string from `params` (`limit`, `cursor`) when present; return the full
   `{ orders, nextCursor }` envelope (stop unwrapping to `orders`).
2. `use-order-history.ts`: delete the `useAsyncData`/`useCallback` imports; rewrite as a single
   `useInfiniteQuery`:
   - `queryKey: ['orders', 'history']`
   - `queryFn: ({ pageParam }) => fetchOrderHistory({ cursor: pageParam })`
   - `initialPageParam: null as string | null`
   - `getNextPageParam: (lastPage) => lastPage.nextCursor`
   - return the raw result (do NOT pre-flatten — matches `use-admin-orders.ts`; consumers select).
   Confirm no `use-async-data.ts` import remains.
2b. `use-deal-usage.ts` (Gap-1 fix, same phase as the hook rewrite): the current
   `const { data: orders } = useOrderHistory();` then `orders.filter((order) => order.dealId !== null)`
   reads the OLD `Order[]` shape. Update the destructure to read the new `InfiniteData` shape, matching
   how History/Home flatten it: `const { data } = useOrderHistory(); const orders = data?.pages.flatMap((p) => p.orders) ?? [];`
   then keep the existing `orders.filter((order) => order.dealId !== null)` logic unchanged. This preserves
   deal usage-limit eligibility behavior and clears the mobile `typecheck` gate.

**Phase B — Order History screen (pagination + refresh + states):**

3. `(tabs)/history/index.tsx`: replace the destructure with infinite-query fields:
   `const { data, isPending, isError, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useOrderHistory();`
   and derive `const orders = data?.pages.flatMap((p) => p.orders) ?? [];`.
   - Map loading → `isPending`; error → `isError` (keep existing error `ScreenMessage`, pass
     `error?.message` or a fallback string since `error` is now `Error | null`, not `string`).
   - Empty → `!isPending && orders.length === 0` (existing `EmptyState`, keep `mode`).
4. Add `RefreshControl` to the `FlatList`:
   `refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={theme.text} colors={[theme.text]} />}`
   (import `RefreshControl` from `react-native`).
5. Add pagination props to the `FlatList`:
   - `onEndReachedThreshold={0.5}`
   - `onEndReached={() => { if (hasNextPage && !isFetchingNextPage) void fetchNextPage(); }}`
   - `ListFooterComponent`: an `ActivityIndicator` (in a small padded `View`) shown while
     `isFetchingNextPage`; render nothing when not fetching. NOTE: this screen HIDES the floating tab
     bar (`useHideTabBarWhile(useIsFocused())`), so footer clearance is the EXISTING SafeAreaView
     `edges={['bottom']}` inset + `content.paddingBottom` — `TAB_BAR_FOOTPRINT` does NOT apply here
     (the bar isn't rendered on History). Do not add `getFloatingTabBarClearance` to this screen.
   - Keep `keyExtractor={(item) => item.id}` unchanged (Constraint).

**Phase C — Home screen (repoint + screen-level refresh):**

6. `(tabs)/index.tsx`: delete the `useQuery({ queryKey: ['orders'], queryFn: fetchOrderHistory })`
   block (L130-133) and the now-unused `fetchOrderHistory` import (L41). Replace with the shared
   hook: `const orderHistory = useOrderHistory();` and derive
   `const activeOrder = orderHistory.data?.pages[0]?.orders.find((o) => !isTerminalStatus(o.status)) ?? null;`
   (import `useOrderHistory` from `@/features/orders/hooks/use-order-history`).
7. Add a screen-level refresh: a local `const [refreshing, setRefreshing] = useState(false)` and an
   `onRefresh` that does:
   `setRefreshing(true); try { await Promise.all([menuQuery.refetch(), dealsQuery.refetch(), refetchBranch(), rewardsQuery.refetch(), orderHistory.refetch()]); } finally { setRefreshing(false); }`
   (D5 — includes order-history + rewards; NOT `invalidateQueries`).
8. Attach `refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} colors={[theme.text]} />}`
   to the outer Home `ScrollView` (~L201). Keep the existing `contentContainerStyle`/tab-bar clearance untouched.

**Phase D — Branches screen (both list variants):**

9. `(tabs)/branches/index.tsx` web `FlatList` (~L177): add
   `refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={theme.text} colors={[theme.text]} />}`.
   Add `isRefetching` to the existing `useQuery` destructure. Import `RefreshControl` from `react-native`.
10. Native `BottomSheetFlatList` (~L278): add DIRECT props (D4 — gorhom auto-wires Android internally):
    `refreshing={isRefetching}` and `onRefresh={() => void refetch()}`. Do NOT import
    `BottomSheetRefreshControl` and do NOT pass a `scrollableGesture` — gorhom 5.2.14's
    `ScrollableContainer.android.tsx` consumes `onRefresh`/`refreshing` and wraps the gesture itself;
    on iOS the base container is a no-op passthrough. (Tint/`colors` theming is not forwarded through
    gorhom's Android wrapper — accept platform-default spinner color on the native sheet; this is a
    known minor cosmetic gap, documented in Test Infra Improvement Notes, not a blocker.)

**Phase E — Deals screen:**

11. `(tabs)/deals/index.tsx`: the list is a `ScrollView` (`deals.map`), not a `FlatList`. Add
    `refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={theme.text} colors={[theme.text]} />}`
    to the `ScrollView` (~L42). Add `isRefetching` to the `useDealProducts()` destructure
    (`useDealProducts` returns a `UseQueryResult`, which exposes `isRefetching`). Refresh replaces
    stale data after the initial `isLoading` `ScreenLoader` path.

**Phase F — doc cleanup + backend test coverage:**

12. `use-async-data.ts`: remove the stale sentence "Deliberately tiny — no react-query in this repo."
    (and any adjacent stale phrasing) from the docstring. Do NOT delete or otherwise change the file's
    behavior — `use-order.ts` still consumes it (SPEC AC14 / D7).
13. `packages/api/src/routes/__tests__/orders.test.ts`: add a new `describe('GET /orders — cursor
    pagination')` block reusing the existing `makeUser`/`post`/`get`/`singleItemBody` fixture helpers.
    Seed ≥3 orders for one fresh user (place sequentially so `placed_at` differs), then assert:
    - `?limit=2` returns exactly 2 orders and a non-null `nextCursor` (string).
    - Following `?cursor=<nextCursor>&limit=2` returns the remaining order(s) with `nextCursor: null`
      at end-of-data.
    - The union of page IDs across both pages has no duplicates and no missing orders (set size ==
      total seeded).
    - `?limit=` out-of-range clamps (e.g. `?limit=0` → still returns data with the min/default bound;
      `?limit=999` → capped at 50 — assert length ≤ 50 given the seed) — assert the clamp does not error.
    - Default (no `?limit=`) returns newest-first ordering (existing behavior — reassert alongside).

**Phase G — new + updated RN component tests (jest-expo):**

G0. (Gap-3 fix) Update the EXISTING `history-screen-dark-mode.test.tsx` `useOrderHistory` mock from the
    old array shape to the `useInfiniteQuery` return shape so the dark-mode assertions stay non-vacuous
    after the rewrite. Base shape:
    `{ data: { pages: [{ orders: [...], nextCursor: null }] }, isPending: false, isError: false, error: null, refetch: vi.fn?/jest.fn(), isRefetching: false, fetchNextPage: jest.fn(), hasNextPage: false, isFetchingNextPage: false }`.
    Match the EXACT fields the rewritten `(tabs)/history/index.tsx` destructures in step 3 (read that step's
    destructure list and keep this mock consistent with it — this is a jest-expo file, so use `jest.fn()`,
    not `vi.fn()`). Re-run `history-screen-dark-mode.test.tsx` and confirm its assertions still exercise
    real rendered rows (not an empty list).
G1. Write the 7 new test files named in Touchpoints.
    Mirror the existing `history-screen-dark-mode.test.tsx` / `account-screen.test.tsx` setup
    (`renderWithProviders`/`render` from `@/test-utils/render`, `@testing-library/react-native`
    `fireEvent`/`waitFor`, `jest.mock` the data hooks or the api-client as those precedents do). See
    Verification Evidence for what each asserts.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `branches-refresh.test.tsx` — pull triggers `refetch`; error path preserves prior list | Fully-Automated | AC1 |
| `history-refresh.test.tsx` — pull triggers `refetch` of page 1; error preserves prior orders | Fully-Automated | AC2 |
| `deals-refresh.test.tsx` — pull triggers `refetch`; error preserves prior deals | Fully-Automated | AC3 |
| `home-refresh.test.tsx` — one pull calls refetch on menu+deals+branch+rewards+order-history | Fully-Automated | AC4 |
| `history-refresh.test.tsx` + `branches-refresh.test.tsx` — refetch fires even when data is "fresh" (stale-time bypass) | Fully-Automated | AC5 |
| `history-pagination.test.tsx` — `onEndReached` appends next page; combined pages have no dup/missing IDs | Fully-Automated | AC6 |
| `history-pagination.test.tsx` — after `nextCursor` null, further `onEndReached` triggers no new fetch | Fully-Automated | AC7 |
| `history-empty-error-states.test.tsx` — 0 orders → distinct "No orders yet" empty state | Fully-Automated | AC8 |
| `history-empty-error-states.test.tsx` — failed fetch → error state, prior orders retained | Fully-Automated | AC9 |
| `history-single-source.test.tsx` — `use-order-history.ts` no longer imports `use-async-data.ts` (static assertion) + one-time manual grep confirming no 2nd fetch consumer | Hybrid | AC10 |
| `history-screen-dark-mode.test.tsx` (updated mock, G0) — dark-mode rows still render off the new InfiniteData shape (regression guard against a vacuous mock) | Fully-Automated | AC2/AC9 (regression) |
| `use-deal-usage` still filters `dealId`-tagged orders off the flattened pages (via mobile `typecheck` + any covering deal-usage test) | Fully-Automated | AC10 (single-source consumer correctness) |
| `packages/utils` `reorder.test.ts` re-run (regression) + on-device reorder-from-page-2 walkthrough | Hybrid | AC11 |
| On-device light+dark, iOS+Android: refresh spinner + "loading more" footer clear the tab bar / aren't clipped | Agent-Probe | AC12 |
| `orders.test.ts` new cases — `?limit=`, `?cursor=`, `nextCursor` shape, end-of-data | Fully-Automated | AC13 |
| Grep during EVL confirming the stale docstring line is gone | Hybrid | AC14 |

**Test gate commands (run in this order):**
```bash
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/mobile test          # vitest (pure-TS) && jest-expo (the 7 new + 1 updated .test.tsx)
pnpm --filter @jojopotato/mobile guard:theme-mode
pnpm --filter @jojopotato/utils test           # reorder.test.ts regression (AC11)
pnpm --filter @jojopotato/api test             # requires: docker compose up -d && db:migrate first (AC13)
pnpm --filter @jojopotato/mobile lint
```

**Anti-vacuous-green note:** each pagination/refresh test must assert observable OUTCOME, not prop
presence — e.g. `history-pagination.test.tsx` asserts the flattened rendered list has the union of
both pages' IDs (breaking `getNextPageParam` to always-null turns it red), and `history-refresh.test.tsx`
asserts the mocked fetcher call-count increments on pull (breaking `onRefresh→refetch` turns it red).
The updated `history-screen-dark-mode.test.tsx` mock (G0) must resolve to real rendered rows — a mock
that renders an empty list would silently make the dark-mode assertions vacuous, which is exactly the
regression this update prevents. No developed behavior in this plan is assigned Known-Gap; the only
non-automated items (AC11 on-device half, AC12) are genuine Agent-Probe (device layout/gesture feel — no
in-repo runner renders real device metrics), consistent with the standing project-wide E2E-runner gap.
AC12 has no automatable half, so it is a pure Agent-Probe residual, not a CONDITIONAL-blocking developed behavior.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Shared hook's return-shape change breaks an unlisted consumer | Low | Checklist step 0 greps the full consumer inventory before editing; the 3 known consumers (History, Home-via-repoint, deal-usage) are all rewritten. PVL already found deal-usage as the 3rd. |
| gorhom native refresh gesture conflicts with sheet drag on Android | Medium | D4 uses gorhom's OWN internal Android wiring (verified in `ScrollableContainer.android.tsx` source) via direct `onRefresh`/`refreshing` props — the officially-supported path. AC12 Agent-Probe confirms gesture feel on-device. |
| `useInfiniteQuery` blanks list on a failed load-more (should retain) | Low | react-query keeps prior `pages` in `data` on background/next-page error by default; asserted by `history-empty-error-states.test.tsx` (AC9). No custom state needed (SPEC item 7). |
| Home `Promise.all` rejects and leaves `refreshing` stuck true | Low | `try/finally` always clears `refreshing`; per-section error states already exist. |
| `error` type change (`string` → `Error`) in History screen breaks the `ScreenMessage subtitle` | Low | Pass `error?.message ?? 'Something went wrong'` (typecheck gate catches any miss). |
| Existing `history-screen-dark-mode.test.tsx` mock goes vacuous after rewrite | Medium (caught by PVL) | Step G0 updates the mock to the InfiniteData shape and re-confirms rows render; the assertions are re-verified non-vacuous. |
| jest-expo test for a screen with `@gorhom/bottom-sheet` fails to render under jsdom/native mock | Medium | Branches native path needs `Platform.OS` mocking; the `branches-refresh.test.tsx` targets the WEB `FlatList` variant (rendered when `Platform.OS === 'web'`) for the automated assertion — the native sheet's gesture behavior is the Agent-Probe half (AC12). Document this split in the test file header. |

---

## Test Infra Improvement Notes

- gorhom's Android `BottomSheetRefreshControl` does not forward `tintColor`/`colors` through
  `ScrollableContainer.android.tsx`, so the native bottom-sheet refresh spinner uses the platform
  default color (not `theme.text`). Minor cosmetic gap; not worth a custom fork. Recorded here in case
  a future theming pass wants a branded native-sheet spinner.
- AC12 (device layout/gesture) and the AC11 on-device half remain Agent-Probe because the repo has no
  Detox/Maestro/Playwright runner that renders real device layout metrics (standing project-wide gap,
  tracked at `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`). No new
  infra added by this plan (SPEC out-of-scope).

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/list-pagination-refresh_20-07-26/list-pagination-refresh_PLAN_20-07-26.md`
2. **Last completed step:** PLAN written; SPEC locked; INNOVATE Q1-Q4 resolved (+ Q3/Q4 open items
   closed in D5/D6, gorhom Android path resolved in D4). PVL supplement cycle 1 applied (3 gaps:
   deal-usage 3rd consumer, corrected consumer inventory, existing dark-mode-test mock update).
3. **Validate-contract status:** pending (VALIDATE re-runs after this supplement).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`,
   `process/context/tests/all-tests.md`; SPEC in this task folder; source files in Touchpoints;
   `@gorhom/bottom-sheet@5.2.14` node_modules source (refresh-control wiring).
5. **Branch:** stay on `feat/font-tone-payment-overflow` (LOCKED — do NOT branch; SPEC Constraint).
6. **Next step for a fresh agent:** run VALIDATE on this plan (write the validate-contract from the
   Verification Evidence table + test gate commands). Then EXECUTE the checklist in phase order A→G,
   running the per-section test gate after Phase A/B and after each screen. EXECUTE is a **sequential
   single agent** (interdependent changes; do not fan out). Pre-EXECUTE: run `docker compose up -d` +
   `pnpm --filter @jojopotato/api db:migrate` so the AC13 supertest cases can run.

---

## Acceptance Criteria

Full testable ACs live in the SPEC (`list-pagination-refresh_SPEC_20-07-26.md`, AC1-AC14) and are
mapped 1:1 to gates in the **Verification Evidence** table above. Summary of "done":

- AC1-AC5: pull-to-refresh on Branches/History/Deals/Home forces a real refetch (stale-time bypass),
  with error paths preserving previously-loaded items — proven Fully-Automated by the `*-refresh.test.tsx` suite.
- AC6-AC7: Order History paginates via `useInfiniteQuery` (page-1 on mount, `onEndReached` appends,
  clean stop at `nextCursor: null`, no dup/missing IDs) — Fully-Automated (`history-pagination.test.tsx`).
- AC8-AC9: distinct empty vs error states; failed fetch retains loaded orders — Fully-Automated.
- AC10: exactly one order-history fetch path, all 3 consumers on it — Hybrid (static hook-source
  assertion + manual grep) + Fully-Automated (deal-usage consumer correctness via typecheck).
- AC11: reorder works from any page — Hybrid (utils regression + Agent-Probe).
- AC12: indicators/footer clear the tab bar in light+dark — Agent-Probe (no in-repo device-metric runner).
- AC13: backend cursor pagination test coverage added — Fully-Automated (`orders.test.ts`).
- AC14: stale docstring removed — Hybrid (EVL grep).

## Deviations (EXECUTE, 20-07-26)

Two within-blast-radius deviations, both required to satisfy the plan's OWN stated ACs /
Failure Modes. Neither is hard-stop class (no auth/schema/API/billing/secret/container surface).

1. **Error-gating refined to `isError && <list empty>` (History / Deals / Branches).** Checklist
   step 3 said "error → isError (keep existing error ScreenMessage)". Taken literally, a bare
   `if (isError)` early-return blanks the whole screen on a FAILED REFRESH, because react-query v5
   sets `isError: true` on a failed refetch even while retaining prior `data`. That directly
   violates AC1/AC2/AC3/AC9 and the plan's Failure Modes table ("data retained; previously-loaded
   items stay visible"). Fix: gate the full-error early-return on empty data —
   `history/index.tsx` `if (isError && orders.length === 0)`, `deals/index.tsx`
   `if (isError && deals.length === 0)`, `branches/index.tsx` (web + native)
   `fetchError && branches.length === 0`. This IS the behavior the plan's Failure Modes rows
   describe (full error only on an initial-load failure with no data); the checklist one-liner was
   just terse. Proven by the `*-refresh.test.tsx` retention cases + `history-empty-error-states`.

2. **`testID` on the scrollables for test triggering.** RNTL 14.0.1 removed `UNSAFE_getByType`, so
   the component tests query a `testID` on each scrollable (`order-history-list`, `home-scroll`,
   `deals-scroll`, `branches-list`) and drive `.props.refreshControl.props.onRefresh()` /
   `.props.onEndReached()`. Added 4 `testID`s (+ 2 RefreshControl testIDs) to source screens —
   inert attributes, zero behavior change. Implementation detail the plan left unspecified.

## Phase Completion Rules

- **CODE DONE** (not VERIFIED): all six test-gate commands green (mobile typecheck + `test` incl. the
  7 new + 1 updated jest-expo files, `guard:theme-mode`, utils `test`, api `test`, mobile `lint`), and
  every Fully-Automated + Hybrid-automated gate in Verification Evidence passing.
- **VERIFIED** (archival-eligible): CODE DONE **plus** the two Agent-Probe residuals performed by the
  user — AC11 on-device reorder-from-page-2 walkthrough, and AC12 light+dark iOS+Android layout/gesture
  walkthrough. Until both are performed, the plan stays in `active/` (not archived), consistent with the
  standing project-wide no-device-runner convention.
- Known-Gap is BANNED for every developed behavior in this plan; none is assigned it. The Agent-Probe
  items are genuine device-only residuals, not silent coverage gaps.

## Validate Contract

Status: PASS
Date: 20-07-26
date: 2026-07-20
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score ~2/7 (S7 5+ files; S1 partial — 2 packages, test-only in the 2nd). Changes are interdependent (shared hook → all 3 consumers); one coherent pass, no fan-out.

PVL history: cycle 0 → CONDITIONAL/BLOCKED (1 FAIL: unlisted `use-deal-usage.ts` 3rd consumer; 2 CONCERNs: false "no other consumer" claim, unlisted dark-mode-test mock). Supplement cycle 1 added blast-radius file 9 + checklist steps 2b/G0 + corrected Public Contracts inventory. This contract = cycle 1 re-validation: all 3 gaps verified closed against real source. Net gate PASS.

### Test gates (C3 5-column — additive; legacy line form follows)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Branches pull-to-refresh forces refetch; error preserves prior list | Fully-Automated | `branches-refresh.test.tsx` (web `FlatList` variant) | B |
| AC2 | History pull-to-refresh refetches page 1; error preserves orders | Fully-Automated | `history-refresh.test.tsx` | B |
| AC3 | Deals pull-to-refresh refetches; error preserves prior deals | Fully-Automated | `deals-refresh.test.tsx` | B |
| AC4 | One Home pull refetches menu+deals+branch+rewards+order-history | Fully-Automated | `home-refresh.test.tsx` | B |
| AC5 | Refetch fires even when data is "fresh" (staleTime bypass) | Fully-Automated | `history-refresh.test.tsx` + `branches-refresh.test.tsx` | B |
| AC6 | `onEndReached` appends next page; union of pages has no dup/missing IDs | Fully-Automated | `history-pagination.test.tsx` | B |
| AC7 | After `nextCursor` null, further `onEndReached` triggers no new fetch | Fully-Automated | `history-pagination.test.tsx` | B |
| AC8 | 0 orders → distinct "No orders yet" empty state | Fully-Automated | `history-empty-error-states.test.tsx` | B |
| AC9 | Failed fetch → error state; prior orders retained | Fully-Automated | `history-empty-error-states.test.tsx` | B |
| AC10 | Exactly one order-history fetch path; all 3 consumers on it | Hybrid | `history-single-source.test.tsx` (static no-`use-async-data` import) + mobile `typecheck` (deal-usage consumer correctness) + one-time EVL grep | B |
| AC2/AC9 (regr) | Dark-mode rows still render off new `InfiniteData` shape (non-vacuous mock) | Fully-Automated | `history-screen-dark-mode.test.tsx` (G0 updated mock) | B |
| AC11 | Reorder works from any page | Hybrid + Agent-Probe | `packages/utils` `reorder.test.ts` regression (automated) + on-device reorder-from-page-2 walkthrough (device half) | C |
| AC12 | Refresh spinner + load-more footer clear the tab bar / not clipped, light+dark, iOS+Android | Agent-Probe | on-device layout/gesture walkthrough | C |
| AC13 | Backend `GET /orders` cursor pagination (limit/cursor/nextCursor/end-of-data/clamp) | Fully-Automated | `orders.test.ts` new `describe('GET /orders — cursor pagination')` block | B |
| AC14 | Stale "no react-query in this repo" docstring line removed | Hybrid | EVL grep | B |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred device-only residual (named in Phase Completion Rules); D — backlog test-building stub. No developed behavior is gap-resolution D (Known-Gap). AC11 device half + AC12 are genuine device-only Agent-Probe residuals (no in-repo device-metric runner), not Known-Gap.

C-4 reconciliation: the `strategy` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is used nowhere — it is banned for every developed behavior in this plan.

**Failing stubs (Fully-Automated rows — TDD red-first, for execute-agent):**
```
// history-pagination.test.tsx
test("onEndReached appends the next page; flattened list = union of both pages' IDs, no dup/missing", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: pagination append + no dup/missing IDs")
})
test("after nextCursor null, a further onEndReached triggers no new fetch", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: clean stop at end-of-data")
})
// history-refresh.test.tsx
test("pull triggers refetch of page 1; mocked fetcher call-count increments; error path preserves prior orders", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: history pull-to-refresh + error preserves list")
})
// branches-refresh.test.tsx
test("web FlatList pull triggers refetch; error path preserves prior branches", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: branches pull-to-refresh")
})
// deals-refresh.test.tsx
test("ScrollView pull triggers refetch; error path preserves prior deals", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: deals pull-to-refresh")
})
// home-refresh.test.tsx
test("one pull calls refetch on menu+deals+branch+rewards+order-history; refreshing clears via finally", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: home single-gesture multi-refetch")
})
// history-empty-error-states.test.tsx
test("0 orders renders distinct 'No orders yet' empty state (not error)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: distinct empty state")
})
test("failed fetch renders error state and retains previously-loaded orders", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: error retains loaded orders")
})
// orders.test.ts (supertest)
test("GET /orders cursor pagination: ?limit=2 → 2 orders + non-null nextCursor; ?cursor=<next> → remainder + null; no dup/missing; ?limit=0/999 clamp does not error; default newest-first", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: backend cursor pagination coverage (AC13)")
})
```

**Legacy line form (retained for existing consumers):**
- Branches refresh (AC1): Fully-automated: `pnpm --filter @jojopotato/mobile test` (`branches-refresh.test.tsx`, web variant)
- History refresh (AC2/AC5): Fully-automated: `pnpm --filter @jojopotato/mobile test` (`history-refresh.test.tsx`)
- Deals refresh (AC3): Fully-automated: `pnpm --filter @jojopotato/mobile test` (`deals-refresh.test.tsx`)
- Home refresh (AC4): Fully-automated: `pnpm --filter @jojopotato/mobile test` (`home-refresh.test.tsx`)
- Pagination (AC6/AC7): Fully-automated: `pnpm --filter @jojopotato/mobile test` (`history-pagination.test.tsx`)
- Empty/error (AC8/AC9): Fully-automated: `pnpm --filter @jojopotato/mobile test` (`history-empty-error-states.test.tsx`)
- Dark-mode regression (AC2/AC9): Fully-automated: `pnpm --filter @jojopotato/mobile test` (`history-screen-dark-mode.test.tsx`, G0 mock)
- Single source (AC10): hybrid: `history-single-source.test.tsx` + `pnpm --filter @jojopotato/mobile typecheck` + one-time grep (precondition: rewrite landed)
- Deal-usage consumer correctness (AC10): Fully-automated: `pnpm --filter @jojopotato/mobile typecheck`
- Reorder regression (AC11): hybrid: `pnpm --filter @jojopotato/utils test` + on-device walkthrough (precondition: device)
- Backend cursor (AC13): Fully-automated: `pnpm --filter @jojopotato/api test` (precondition: `docker compose up -d && pnpm --filter @jojopotato/api db:migrate`)
- Docstring removed (AC14): hybrid: EVL grep
- Tab-bar clearance (AC12): agent-probe: on-device light+dark iOS+Android walkthrough

Dimension findings:
- Infra fit: PASS — all 9 touchpoint files + `test-utils/render.tsx` + jest-expo runner (D8 precedent `history-screen-dark-mode.test.tsx`) confirmed on disk; D4 gorhom 5.2.14 native direct-props path sourced from node_modules; backend read route `orders.ts:521-563` returns `{ orders, nextCursor }` (`MAX_HISTORY_LIMIT = 50`) exactly matching the api-client envelope and AC13 design.
- Test coverage: PASS — every developed behavior has a Fully-Automated or Hybrid gate; backend cursor test design matches the real route; two Agent-Probe residuals (AC11 device half, AC12) are genuine device-only gaps, not Known-Gap. No developed behavior rests on Known-Gap (banned by plan).
- Breaking changes: PASS — internal-only contract change (`fetchOrderHistory` + `useOrderHistory` return shape); consumer inventory grep-verified accurate (2 hook consumers: `history/index.tsx`, `use-deal-usage.ts`; 1 direct `fetchOrderHistory` call: Home `(tabs)/index.tsx:132`); all 3 fixed in-plan; step-0 grep guard for a 5th consumer in place; no cross-package/public-API contract change.
- Security surface: PASS — no auth/identity, billing/credits, schema/migration, secrets, or trust-boundary surface. MEDIUM risk, code-local. No evidence pack required.
- Phase A (hook + api-client + deal-usage) feasibility: PASS — Gap-1 fix (`data?.pages.flatMap((p) => p.orders) ?? []`) verified correct against `use-deal-usage.ts:16` real source; existing `.filter(dealId)` preserved. Highest-risk edit: the shared-hook shape change — mitigated by fixing all 3 consumers in the same phase.
- Phase B (History screen) feasibility: PASS — current destructure confirmed old `{ data: orders, loading, error, refetch }`; step-3 rewrite consistent; footer clearance reasoning (tab bar hidden on History) correct.
- Phase C (Home) feasibility: PASS — Home's direct `useQuery({ queryFn: fetchOrderHistory })` at L132 confirmed; repoint to shared hook (page-1 read) sound.
- Phase D (Branches) feasibility: PASS (mechanical) — D4 native direct-props is a runtime behavior source-verified in node_modules and covered by AC12 Agent-Probe; web variant fully-automated. No probe needed.
- Phase E (Deals) feasibility: PASS — `ScrollView` refresh, `useDealProducts()` exposes `isRefetching`.
- Phase F (docstring + backend test) feasibility: PASS — stale docstring line present (L13); read route + `userA`/`post`/`get`/`singleItemBody` fixtures + `MAX_HISTORY_LIMIT=50` all confirmed; AC13 exactly implementable.
- Phase G (RN tests incl. G0) feasibility: PASS — Gap-3 fix verified; G0 mock target shape matches the step-3 destructure list.

Open gaps: none blocking. Two device-only Agent-Probe residuals owed before VERIFIED (not before EXECUTE): AC11 on-device reorder-from-page-2, AC12 light+dark iOS+Android layout/gesture. Standing project-wide no-device-runner gap (`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`).

What this coverage does NOT prove:
- Fully-Automated jest-expo `*-refresh.test.tsx` (AC1-5): proves `onRefresh → refetch` wiring + error-path data retention under the jest-expo renderer; does NOT prove real on-device pull-gesture feel, spinner tint on the native gorhom bottom-sheet, or clipping/clearance against real device layout metrics (AC12, Agent-Probe).
- `history-pagination.test.tsx` (AC6-7): proves page-append correctness + clean end-of-data stop off mocked pages; does NOT prove real scroll-position/`onEndReachedThreshold` triggering on a physical device.
- `branches-refresh.test.tsx` (AC1): proves the WEB `FlatList` refresh path only; the native `BottomSheetFlatList` Android gesture is Agent-Probe (AC12) — jest-expo/jsdom cannot render the gorhom native `ScrollableContainer.android.tsx` gesture.
- `orders.test.ts` (AC13): proves cursor/limit/nextCursor/end-of-data/clamp against a real migrated Postgres; does NOT prove behavior under concurrent writes or datasets larger than the seed.
- `history-single-source.test.tsx` + typecheck (AC10): proves no `use-async-data` import remains and deal-usage compiles against the new shape; the "exactly one fetch path at runtime" claim also relies on the one-time EVL grep (no 4th/5th consumer).

Gate: PASS (no FAILs, no CONCERNs; all 3 supplement gaps verified closed against real source; plan structure validator 0/0).
Accepted by: n/a (Gate is PASS — no accepted concerns).

**Execute-agent instructions (informational, non-blocking):**
- E1: In `use-deal-usage.ts` step 2b, prefer keying the `useMemo` on `data` (`[data, user]`) and flattening inside it, rather than on the freshly-created `orders` array (`[orders, user]`) — a new `flatMap` array each render defeats the memo. Functionally identical either way; do not block on it.
- E2: The API test (`orders.test.ts`, step 13) names a `makeUser` fixture; the actual helper is the module-level `userA` (declared L44, seeded in `beforeAll` ~L133) plus `post`/`get`/`singleItemBody`. Use the real `userA` pattern (seed ≥3 sequential orders for a fresh user id) — the named helper does not exist under that exact name.
- E3: Pre-EXECUTE, run `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` so the AC13 supertest cases can run.

## Autonomous Goal Block

```
SESSION GOAL: list-pagination-refresh — pull-to-refresh (Branches/History/Deals/Home) + Order History useInfiniteQuery pagination + duplicate order-history fetch-path cleanup + backend cursor-pagination test coverage.
Charter + umbrella plan: N/A — single general plan (no phase program).
Autonomy: standard single-plan autonomy — sequential single execute-agent; no fan-out (interdependent shared-hook change). EXECUTE consent still requires explicit "ENTER EXECUTE MODE".
Hard stop conditions / safety constraints:
- STOP if checklist step 0 grep finds a 5th consumer of useOrderHistory/fetchOrderHistory (Public Contracts breach) — surface, do not proceed.
- Stay on branch feat/font-tone-payment-overflow (LOCKED — do NOT branch; SPEC constraint).
- Do not add a Detox/Maestro/Playwright E2E runner (SPEC out-of-scope); AC11-device/AC12 stay Agent-Probe.
Next phase: EXECUTE — process/general-plans/active/list-pagination-refresh_20-07-26/list-pagination-refresh_PLAN_20-07-26.md (checklist phases A→G in order; per-section jest-expo gate after Phase A/B and after each screen).
Validate contract: inline in plan (## Validate Contract, Gate: PASS).
Execute start:
- Fully-auto gates: pnpm --filter @jojopotato/mobile typecheck | pnpm --filter @jojopotato/mobile test | pnpm --filter @jojopotato/mobile guard:theme-mode | pnpm --filter @jojopotato/utils test | pnpm --filter @jojopotato/api test (precondition: docker compose up -d && db:migrate) | pnpm --filter @jojopotato/mobile lint
- Agent-Probe residuals (owed before VERIFIED, not before EXECUTE): AC11 on-device reorder-from-page-2; AC12 light+dark iOS+Android refresh/footer layout.
- High-risk pack: no (MEDIUM risk, no auth/billing/schema/API/secret surface).
```
