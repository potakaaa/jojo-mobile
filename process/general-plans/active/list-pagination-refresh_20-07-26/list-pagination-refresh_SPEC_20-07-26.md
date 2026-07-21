---
name: plan:list-pagination-refresh-spec
description: "Product-discovery requirements doc — pull-to-refresh + Order History pagination + duplicate-fetch-path cleanup"
date: 20-07-26
feature: general
---

# SPEC — Pull-to-Refresh, Order History Pagination, and Duplicate-Fetch Cleanup

## Summary

Right now, none of the app's lists let you pull down to get fresh data — if a branch reopens,
a new deal drops, or an order status changes, the customer has to force-quit and reopen the app
to see it. Order History also has no "load more" — it fetches every order you've ever placed in
one shot, which will get slow and eventually break as history grows. This work adds pull-to-refresh
to Branches, Order History, Deals, and the Home tab, adds page-by-page loading to Order History, and
fixes a bug where Order History is currently fetched through two separate, uncoordinated code paths
at once (wasting a network request every time you open the app). None of this changes what data
looks like or how orders are placed — it only makes existing lists refresh and load correctly.

## User Stories / Jobs To Be Done

1. **As a customer browsing branches**, I want to pull down on the branch list to check for
   updates (e.g. a branch just opened), so that I don't have to restart the app to see current
   branch status.
2. **As a customer viewing my past orders**, I want to pull down to refresh my order history and
   scroll to load older orders as I go, so that I can review my full order history without the
   screen freezing or the app pulling my entire history at once.
3. **As a customer browsing deals**, I want to pull down to see newly published deals, so that I
   don't miss a promotion because my app had a stale list cached.
4. **As a customer on the Home tab**, I want one pull-down gesture to refresh everything on that
   screen (products, deals, branch info), so I don't need to know which specific widget is stale.
5. **As a customer with an empty or just-failed order history**, I want to clearly see "you haven't
   ordered yet" versus "something went wrong, try again" — not a blank screen either way.
6. **As a customer reordering a past order**, I want reorder to keep working correctly no matter
   which page of my history I found that order on.

## What The User Wants (Behavioral Outcomes)

- On Branches, Order History, and Deals: pulling down on the list triggers a visible refresh
  indicator, then the list updates with current data. Releasing the gesture always results in
  either updated data or a clear "refresh failed" indication — never a silent no-op.
- On the Home tab: pulling down refreshes the whole screen's content (products/menu, deals,
  branch widget) in one gesture, not per-section.
- On Order History: the list initially loads a first page of recent orders. As the customer
  scrolls down, more (older) orders load in automatically, with a loading indicator at the bottom
  while fetching. When there are no more orders to load, scrolling further does nothing new and
  no further requests are made.
- Order History with zero orders ever placed shows a friendly "no orders yet" empty state — visibly
  different from a failed-to-load state.
- If a refresh or a "load more" fails, previously loaded orders stay visible (nothing blanks out);
  an error indication appears so the customer knows to retry.
- Reordering an item from any page of Order History (not just the first page) still works exactly
  as it does today.
- Refresh spinners and the "loading more" footer never sit behind or get clipped by the floating
  tab bar, and render correctly in both light and dark mode.
- Behind the scenes, Order History is fetched through exactly one code path — no more duplicate,
  uncoordinated fetches of the same data when the Home tab and the History tab are both mounted.

## Flow / State Diagram

**Pull-to-refresh (Branches / Order History / Deals / Home) — same shape on all four:**

```
[List/Screen at rest]
        |
   user pulls down
        v
[Refresh indicator shown] --fetch fails--> [Error indicator shown, PREVIOUS data still visible]
        |
   fetch succeeds
        v
[List/Screen shows updated data, indicator hidden]
```

**Order History pagination:**

```
[Screen mount]
     |
     v
[Loading first page] --fails--> [Error state, retry available]
     |
  succeeds, 0 orders
     |-----------------------------> [Empty state: "No orders yet"]
     |
  succeeds, N orders
     v
[Page 1 rendered in list]
     |
  user scrolls near bottom
     v
[Footer: "loading more..."] --fails--> [Footer: error, list unchanged, previous pages intact]
     |
  fetch succeeds, more orders exist
     |-----------------------------> [Next page appended] --(scroll again, repeat)-->
     |
  fetch succeeds, no more orders (nextCursor is null)
     v
[Footer: "You've reached the end" / no footer] -- further scrolling triggers no new requests
```

**Duplicate-fetch-path fix (before/after, not a user-facing flow but part of this SPEC's scope):**

```
BEFORE:
  Home tab  ---> react-query fetch A ---\
                                          >--> same order-history data, two independent caches
  History tab ---> bespoke fetch B ------/

AFTER:
  Home tab    ---\
                   >--> single react-query cache (shared) ---> one fetch, both screens read it
  History tab ---/
```

## Acceptance Criteria (Testable Outcomes)

1. Pulling down on the Branches list shows a refresh indicator and results in current branch data
   being displayed (or a visible error state that preserves previously loaded branches on failure).
   proven by: `branches-refresh.test.tsx` (RN component test — refresh triggers refetch, error
   path preserves prior list) — strategy: Fully-Automated.

2. Pulling down on Order History shows a refresh indicator and re-loads the first page of orders
   (or a visible error state that preserves previously loaded orders on failure).
   proven by: `history-refresh.test.tsx` (RN component test) — strategy: Fully-Automated.

3. Pulling down on Deals shows a refresh indicator and results in current deals being displayed
   (or a visible error state that preserves previously loaded deals on failure).
   proven by: `deals-refresh.test.tsx` (RN component test) — strategy: Fully-Automated.

4. Pulling down anywhere on the Home tab refreshes products, deals, and the branch widget together
   in one gesture (screen-level refresh, not per-widget).
   proven by: `home-refresh.test.tsx` (RN component test — asserts all relevant queries are
   invalidated/refetched on one pull) — strategy: Fully-Automated.

5. An explicit pull-to-refresh always results in a real network re-fetch, even when the data is
   still considered "fresh" by the app's normal 30-second cache window.
   proven by: `history-refresh.test.tsx` + `branches-refresh.test.tsx` (assert refetch is called
   regardless of cache staleness state) — strategy: Fully-Automated.

6. Order History loads an initial page of recent orders on screen mount, and loads the next
   (older) page automatically when the customer scrolls near the bottom — with no duplicated or
   skipped orders across the page boundary.
   proven by: `history-pagination.test.tsx` (RN component test simulating `onEndReached`, asserting
   combined page contents have no duplicate/missing order IDs) — strategy: Fully-Automated.

7. When Order History has no more pages left, scrolling further shows a clear end-of-list state
   and triggers no additional network requests.
   proven by: `history-pagination.test.tsx` (asserts fetch call count does not increase after
   `nextCursor` is null) — strategy: Fully-Automated.

8. An empty order history (zero orders ever placed) renders a distinct "no orders yet" empty state,
   never confused with a failed-load error state.
   proven by: `history-empty-error-states.test.tsx` — strategy: Fully-Automated.

9. A failed Order History fetch (initial load or "load more") renders a distinct error state and
   does not clear any orders already loaded.
   proven by: `history-empty-error-states.test.tsx` — strategy: Fully-Automated.

10. Order History is served by exactly one fetch path (react-query `useInfiniteQuery`) shared by
    every screen that needs order-history data — no independent, uncoordinated second fetch of the
    same data exists anywhere in the app.
    proven by: `history-single-source.test.tsx` (asserts `use-order-history.ts` is no longer backed
    by `use-async-data.ts`; a manual code-review check that no second call site duplicates the
    fetch) — strategy: Hybrid (automated hook-source assertion + a one-time manual grep confirming
    no other consumer reintroduces a parallel fetch).

11. Reordering an item found on a page other than the first page of Order History still adds the
    correct items to the cart (or flags conflicts) exactly as reordering from page 1 does today.
    proven by: existing `packages/utils` `reorder.test.ts` unit coverage (unchanged pure logic,
    re-run as a regression guard) plus a manual on-device walkthrough reordering from a
    second-loaded page — strategy: Hybrid (Fully-Automated regression guard on the pure reorder
    logic + Agent-Probe confirmation that pagination doesn't disturb the reorder entry point).

12. Refresh indicators and the Order History "loading more" footer never overlap or get clipped by
    the floating tab bar, and render legibly in both light and dark mode.
    proven by: on-device Agent-Probe walkthrough (light + dark, iOS + Android) — strategy:
    Agent-Probe (visual/layout outcome, not automatable under jsdom/RN test renderer — no runner
    in this repo renders real device layout metrics).

13. The backend's existing cursor-pagination behavior on `GET /orders` (`?cursor=`, `?limit=`,
    `nextCursor` in the response) is proven correct by real automated tests, closing the
    previously-untested gap in `orders.test.ts`.
    proven by: `packages/api/src/routes/__tests__/orders.test.ts` — new cases asserting
    `?limit=` bounds, `?cursor=` continuation, `nextCursor` shape, and end-of-data (`nextCursor:
    null`) — strategy: Fully-Automated.

14. The stale "no react-query in this repo" comment in `use-async-data.ts` is removed (doc-accuracy
    outcome, not a behavior change).
    proven by: code-review check during EXECUTE — strategy: Hybrid (verified by grep during the
    EVL confirmation pass, not a standalone test).

## Out Of Scope

- Pagination on Branches, Deals, or the Home tab's menu/category grid — these stay
  pull-to-refresh only (small, bounded datasets with no backend pagination). This is a locked
  product decision, not a gap.
- Per-component pull-to-refresh on Home's individual widgets (products grid, deals strip,
  branch widget) — Home refreshes as one screen-level gesture, not per-widget.
- Any change to the `GET /orders` API contract or its cursor-pagination design — the backend
  already implements this correctly; only the mobile client's consumption of it changes.
- Real-time/push-based list updates (websockets, live subscriptions) — refresh remains
  pull-triggered or navigation/focus-triggered only, consistent with the existing react-query
  `refetchOnWindowFocus` convention.
- Any change to order placement, reorder business logic, deal eligibility, or checkout — this
  work touches list-loading/refresh behavior only.
- Migrating `use-order.ts`'s remaining `use-async-data.ts` usage — that hook is unrelated to
  order history and stays on its current data-fetching approach.
- Adding a navigation-level/E2E test runner (Detox/Maestro/Playwright) — this remains a
  standing, separately tracked project-wide gap; this SPEC's Agent-Probe items are performed
  manually, not automated by a new harness.

## Constraints

- Continue on the current branch (`feat/font-tone-payment-overflow`) — no new branch for this
  work (locked decision).
- No backend API contract changes for `GET /orders` — it already returns `{ orders, nextCursor }`
  with `?cursor=`/`?limit=` support; only add test coverage for the existing behavior.
- Must use the existing global react-query client (`apps/mobile/src/lib/query-client.ts`,
  30s `staleTime`, `refetchOnWindowFocus: true`, `retry: 1`) and its established idioms
  (`useInfiniteQuery`, matching the in-repo `apps/admin` precedent) — no new data-fetching library.
- Must reuse `packages/ui`'s `EmptyState` component for the Order History empty state, not a new
  one-off component.
- Must preserve existing `keyExtractor={(item) => item.id}` convention on all touched `FlatList`s.
- Any new/changed UI on a themed surface must supply the required `mode` prop and pass
  `guard:theme-mode` (`pnpm --filter @jojopotato/mobile guard:theme-mode`) — no hardcoded colors.
- Any new footer/loading indicator on a tabbed scroll surface must account for
  `TAB_BAR_FOOTPRINT`/`resolveTabBarClearance()` (`floating-tab-bar.tsx`) so it isn't clipped.
- Reorder (`use-reorder.ts`) must not be modified in a way that changes its input contract — it
  already takes a full `Order` object directly and is expected to work unmodified across pages.
- New backend test coverage for `GET /orders` cursor pagination must reuse the existing
  supertest/self-seeding fixture pattern already used in `orders.test.ts` — no new test
  infrastructure.

## Open Questions

None. All product decisions were locked during RESEARCH (screen-level Home refresh; Order-History-only
pagination scope; branch continuation) and confirmed with the user before this SPEC was written.

## Background / Research Findings

- `packages/api/src/routes/orders.ts:521-562` (`GET /orders`) already implements cursor-based
  pagination (`?limit=` default 20/max 50, `?cursor=` on `placed_at`, returns `{ orders,
  nextCursor }`, newest-first) — this is a client-only change, not a new API design.
- The mobile client (`apps/mobile/src/features/orders/lib/api-client.ts`'s `fetchOrderHistory()`)
  already calls this endpoint but discards `nextCursor` and passes no params today.
- Order History screen is at `apps/mobile/src/app/(tabs)/history/index.tsx` (moved here by NAV-005)
  and already renders via a real `FlatList` with `keyExtractor={(item) => item.id}` — it is NOT
  using `.map()` as originally assumed. It currently has no `RefreshControl`, no
  `ListEmptyComponent`, and no `ListFooterComponent`/`onEndReached`.
- Branches list is at `apps/mobile/src/app/(tabs)/branches/index.tsx` — web `FlatList` (~line 177),
  native `BottomSheetFlatList` (~line 278), backed by `useQuery(['branches','all'], getBranches)`.
- **Confirmed duplicate-fetch bug:** `(tabs)/history/index.tsx` uses `useOrderHistory()` →
  `use-order-history.ts` → `use-async-data.ts` (a bespoke fetch-on-mount hook, not react-query),
  while `(tabs)/index.tsx` (Home) separately calls `useQuery({ queryFn: fetchOrderHistory })` (real
  react-query). Both hit the same underlying `fetchOrderHistory()` with no shared cache — two
  independent fetches of identical data on every app open. The `use-async-data.ts` docstring
  claiming "no react-query in this repo" is stale (react-query ^5.62.0 is installed and used by
  branches/deals/menu/Home already). `use-async-data.ts` has one other consumer, `use-order.ts`
  (payment-method selection state, unrelated to history) — migrating `use-order-history.ts` off it
  is safe and doesn't require touching `use-async-data.ts` itself.
- In-repo precedent for the pagination idiom to follow: `apps/admin/src/features/orders/hooks/
  use-admin-orders.ts` uses react-query v5's `useInfiniteQuery` (matches the installed
  `@tanstack/react-query ^5.62.0`).
- `use-reorder.ts` takes an `Order` object directly and refetches the menu itself — it does not
  read from the history list's pagination/cache state, so reordering from any page continues to
  work structurally; this needs only a regression check, not a design change.
- Branches/menu/deals are explicitly kept unpaginated per the issue's own stated scope (small,
  bounded datasets, no backend pagination) — refresh-only for those surfaces is a locked decision,
  not an open question.
- Home's category/menu grid renders inside an outer `ScrollView` rather than its own scrollable
  list, so per-component pull-to-refresh isn't natural there — the locked decision is
  **screen-level refresh**: one `RefreshControl` on Home's outer scroll that refetches all of that
  screen's queries together (products, deals, branches widget).
- Reuse conventions already established in-repo: `packages/ui/src/components/empty-state.tsx`
  (`EmptyState`, required `mode` prop) for empty states; `(item) => item.id` for `keyExtractor`;
  `floating-tab-bar.tsx`'s `TAB_BAR_FOOTPRINT`/`resolveTabBarClearance()` for footer/indicator
  clearance; the dark-mode `mode` prop convention enforced by `guard:theme-mode`.
- Global react-query client (`apps/mobile/src/lib/query-client.ts`): `staleTime: 30_000`,
  `refetchOnWindowFocus: true`, `retry: 1`. A `RefreshControl`'s `onRefresh` calling `refetch()` (or
  `queryClient.invalidateQueries` for Home's multi-query refresh) forces a real fetch regardless of
  `staleTime` — this is react-query's standard, already-proven behavior in this repo.
- Real, closeable test gap found: `packages/api/src/routes/__tests__/orders.test.ts:430-433`
  currently asserts only that `GET /orders` returns orders — zero assertions on `?cursor=`,
  `?limit=`, `nextCursor`, or end-of-data behavior, despite the feature already being implemented.
  This SPEC requires closing that gap using the existing supertest/self-seeding fixture pattern.
- Locked with the user: continue on `feat/font-tone-payment-overflow` (no new branch); Home uses
  screen-level refresh (not per-widget); only Order History paginates.
