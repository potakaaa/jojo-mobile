---
name: plan:notif-delete-pagination
description: "PLAN — notifications swipe-to-delete + load-more pagination (packages/api + apps/mobile + packages/ui)"
date: 21-07-26
feature: rewards-notifications
---

# PLAN — Notifications: Swipe-to-Delete + Load-More Pagination

**Date**: 21-07-26
**Status**: CODE PENDING (PLAN written; VALIDATE re-run after supplement cycle 1 → Gate PASS; EXECUTE not started)
**Feature**: rewards-notifications
**Context**: read `process/context/all-context.md` (root router) + `process/context/tests/all-tests.md` before EXECUTE.

**TL;DR:** One SIMPLE (medium) plan, 4 sequenced sections across 3 packages. Server first
(paginate `GET /notifications` + add `unreadCount` + new `DELETE /notifications/:id`), then the
mobile data layer (`useQuery` → `useInfiniteQuery` + optimistic delete), then a new reusable
`SwipeableRow` primitive in `packages/ui`, then screen wiring (ScrollView→FlatList,
SwipeableRow + ConfirmDialog). No schema change. The delete route mirrors `PATCH /:id/read`'s
**404-not-403** ownership convention exactly. Known-Gap is banned for AC6/AC8/AC9/AC10.

Complexity: **SIMPLE** (single feature slice; ~9 files; new gesture primitive; API-contract but
not schema-changing). Not a phase program.

---

## Overview

Add two customer-facing capabilities to the Notifications screen and nothing else:

1. **Swipe-to-delete** — swipe a row to reveal a red trash button, tap it, confirm in the shared
   `ConfirmDialog`, and the notification is hard-deleted server-side and removed from the list.
2. **Load-more pagination** — the list loads the 10 newest notifications first and appends the
   next 10 on scroll-near-bottom (cursor pagination on `created_at`), so the screen opens fast.

The unread-count bell badge stays accurate via a server-computed `unreadCount` (independent
`COUNT(*) WHERE read_at IS NULL`), never derived from currently-loaded pages.

## Goals

- Cursor-paginated `GET /notifications` (default 10) returning `{ notifications, nextCursor, unreadCount }`.
- New `DELETE /notifications/:id` — hard delete, session-scoped, 404 on wrong-owner/malformed id.
- `useNotifications()` converts to `useInfiniteQuery` + adds an **optimistic** `deleteNotification`,
  while keeping its public `notifications` flat-array shape byte-compatible for the Home bell.
- New `packages/ui` `SwipeableRow` primitive (gesture reveal + accessibility fallback + reduced-motion).
- Screen migrates ScrollView→FlatList with `onEndReached` load-more and SwipeableRow+ConfirmDialog delete.

## Scope

In scope: the 4 sections below. Out of scope (from SPEC, verbatim intent): bulk/clear-all delete,
undo/soft-delete, any change to notification creation/read/marketing-toggle behavior, swipe/pagination
on any other list, changing the notification data model beyond becoming deletable.

---

## Touchpoints

Files changed or read, by section.

| File | Package | Change |
|---|---|---|
| `packages/api/src/routes/notifications.ts` | api | MODIFY `GET /` → cursor pagination + `unreadCount`; ADD `DELETE /:id`; update the now-stale flat-cap comment |
| `packages/api/src/routes/__tests__/notifications.integration.test.ts` | api | EXTEND — new pagination + unreadCount + DELETE/ownership cases |
| `packages/api/src/routes/lib/serializers.ts` | api | READ only — reuse `serializeNotification` unchanged |
| `packages/types/src/notifications.ts` | types | READ only — `AppNotification` shape (`createdAt`, `readAt?`) unchanged |
| `apps/mobile/src/features/notifications/hooks/use-notifications.ts` | mobile | MODIFY — `useQuery`→`useInfiniteQuery`; add `deleteNotification`, `hasNextPage`, `fetchNextPage`, `isFetchingNextPage`; keep flat `notifications`/`unreadCount`/`markRead`/`markAllRead`/`marketingOptIn`/`setMarketingOptIn` |
| `apps/mobile/src/app/(tabs)/notifications/index.tsx` | mobile | MODIFY — ScrollView+`.map()` → FlatList (`ListHeaderComponent`/`ListFooterComponent`); SwipeableRow + ConfirmDialog delete flow |
| `packages/ui/src/components/swipeable-row.tsx` | ui | NEW — reusable swipe-reveal-actions primitive |
| `packages/ui/src/index.ts` | ui | MODIFY — export `SwipeableRow` + its prop types from the barrel |
| `packages/ui/src/components/__tests__/swipeable-row.test.tsx` | ui | NEW — component render test (mirror `notification-row.test.tsx`) |
| `packages/ui/package.json` | ui | MODIFY (added by VALIDATE P1) — ADD `react-native-gesture-handler` + `react-native-reanimated` to peerDependencies + devDependencies (SwipeableRow is the FIRST packages/ui component needing them) |
| `packages/ui/jest.config.js` (+ new jest setup file) | ui | MODIFY/NEW (added by VALIDATE P1/P3) — port the reanimated/gesture-handler mock + whitelist both in `transformIgnorePatterns` so `swipeable-row.test.tsx` (Gate C) can render |
| `apps/mobile/src/features/home/components/home-header.tsx` | mobile | READ only — verify `useNotifications()` bell consumption still compiles (no edit expected) |

## Public Contracts

Interfaces/behaviors visible to other packages or callers.

1. **`GET /notifications` response shape (CHANGED, replacing the old `{ notifications }`):**
   ```
   { notifications: AppNotification[], nextCursor: string | null, unreadCount: number }
   ```
   - Query params: `limit` (default 10, clamped 1..MAX, mirroring `orders.ts`), `cursor` (ISO
     timestamp, filters `created_at < cursor`). Fetch `limit + 1` to derive `hasMore`/`nextCursor`.
   - `unreadCount` is an independent `COUNT(*) WHERE user_id=? AND read_at IS NULL` — NOT derived
     from the returned page.

2. **`DELETE /notifications/:id` (NEW):** session-scoped to `req.user!.id`. Validates `:id` is a
   well-formed UUID. Returns **404 (never 403)** on malformed id OR wrong-owner OR already-gone
   (mirrors `PATCH /:id/read` verbatim — do NOT copy cart's 403 convention). Hard
   `DELETE FROM notifications WHERE id=$1 AND user_id=$2`. Success returns the same JSON shape the
   existing `:id/read` route family returns on success (`{ ok: true }` per `read-all` — lock the exact
   mirror during EXECUTE).

3. **`useNotifications()` public shape (ADDITIVE ONLY — existing fields byte-compatible):**
   - Unchanged: `notifications: AppNotification[]` (flat), `unreadCount`, `markRead`, `markAllRead`,
     `marketingOptIn`, `setMarketingOptIn`.
   - New: `deleteNotification: (id: string) => void`, `hasNextPage: boolean`,
     `fetchNextPage: () => void`, `isFetchingNextPage: boolean`.
   - `notifications` = `data.pages.flatMap(p => p.notifications)`; `unreadCount` = `data.pages[0]?.unreadCount ?? 0`.

4. **`SwipeableRow` (NEW `packages/ui` export):**
   ```
   interface SwipeableRowAction { label: string; icon: keyof typeof Ionicons.glyphMap;
     onPress: () => void; variant?: 'default' | 'destructive'; }
   interface SwipeableRowProps { children: ReactNode; actions: SwipeableRowAction[];
     mode: ThemeMode; openRowRef?: MutableRefObject<{ close: () => void } | null>; }
   ```
   - `mode` is REQUIRED (no default) per the hard theming convention.
   - Includes `accessibilityActions` + `onAccessibilityAction` so delete is reachable without a gesture.

## Blast Radius

- **Packages:** 3 (`packages/api`, `apps/mobile`, `packages/ui`).
- **Files:** ~11 (2 new components/tests + packages/ui dep/jest wiring, 6 modified, 1 read-verify). See Touchpoints.
- **Risk class:** MEDIUM. Two high-risk sub-surfaces present: (a) **auth/ownership** on the new
  DELETE route (trust-boundary — must not leak existence, must scope to caller); (b) **public API
  contract change** on `GET /notifications` (response shape changes — the only two runtime consumers
  of the paginated data are the notifications screen and the Home bell via `useNotifications()`, both
  updated here; the hook's public shape stays compatible so `home-header.tsx` needs no edit — verify
  during EXECUTE). No schema change, no migration. `serializeNotification` untouched.
- **Regression surface:** existing `notifications.integration.test.ts` (read/read-all/device-token),
  `notification-row.test.tsx`, `notifications-toast.test.tsx`, and `guard:theme-mode` must stay green.

---

## Acceptance Criteria

The 12 testable outcomes are defined verbatim in the locked SPEC
(`notif-delete-pagination_SPEC_21-07-26.md`, §Acceptance Criteria) and are NOT restated here to avoid
drift — each is mapped to its proving gate + strategy in the **Verification Evidence** table below.
Summary of the "done" bar:

- AC1–AC3: cursor pagination (≤10 first page, append-on-scroll, hasMore=false on last page).
- AC4–AC5, AC7: swipe reveals red trash button; tap opens ConfirmDialog (no delete); cancel resets.
- AC6, AC8: confirm hard-deletes permanently; delete is owner-scoped, 404 (never 403) on wrong-owner/malformed.
- AC9–AC10: `unreadCount` accurate on delete and across pages (server-computed, not page-derived).
- AC11: all existing notification behavior (read, mark-all, marketing toggle, tap-nav) unchanged.
- AC12: light/dark themed tokens, `guard:theme-mode` 0 violations.

"Done" = every Fully-Automated gate green + Known-Gap not used for AC6/AC8/AC9/AC10; Agent-Probe halves
(gesture/scroll/visual) performed and confirmed by the user per Phase Completion Rules.

---

## Implementation Checklist

Sequenced. Each section ends with its own test gate; do not batch gates to the end.

### Section A — Server: pagination + unreadCount + DELETE (`packages/api`)

1. In `notifications.ts`, add `const DEFAULT_NOTIFICATIONS_LIMIT = 10;` and
   `const MAX_NOTIFICATIONS_LIMIT = 50;` (mirror `orders.ts`'s `DEFAULT_HISTORY_LIMIT`/`MAX_HISTORY_LIMIT`
   clamp style). Remove/replace the now-stale `NOTIFICATIONS_LIST_LIMIT = 100` and its comment.
2. Rewrite `GET /` with a COMPOUND `(created_at, id)` cursor, not a `created_at`-only one — a
   `created_at`-only cursor is UNSAFE here: `created_at` is microsecond-precision `timestamp` in
   Postgres, but the cursor round-trips through `Date.toISOString()` (millisecond precision), so
   two rows created in the same millisecond permanently skip one of them at the page boundary
   (found by CodeRabbit review, PR #151; proven by a regression test — see Gate A). Parse `cursor`
   as `${isoTimestamp}_${id}` (split on `_`, safe since neither ISO strings nor UUIDs contain one);
   build the where clause with `sql\`(${created_at}, ${id}) < (${cursorDate}, ${cursorId})\`` when a
   cursor is present, else `eq(user_id)`; order by `desc(created_at), desc(id)` (the tiebreaker
   matters — without it, Postgres's tie order is unspecified per-execution); `.limit(limit + 1)`;
   derive `hasMore`/`page`/`nextCursor = \`${last.created_at.toISOString()}_${last.id}\``.
   (`lt` is NOT needed here — the compound comparison uses a raw `sql` template instead; import
   `and, desc, eq, isNull, sql` from drizzle-orm. `sql` is also already used for the unread-count
   query below.)
3. Add the independent unread count in the same handler:
   `const [{ count }] = await db.select({ count: sql\`count(*)::int\` }).from(notifications).where(and(eq(user_id), isNull(read_at)));`
   (import `sql` from drizzle-orm; `isNull` is already imported).
4. Respond `res.json({ notifications: page.map(serializeNotification), nextCursor, unreadCount: count })`.
5. Add `DELETE /:id` handler, mirroring `PATCH /:id/read` structure exactly:
   - `const id = String(req.params.id);` reject non-UUID with `res.status(404).json({ error: 'Notification not found' })`.
   - `SELECT` the row; if `!row || row.user_id !== userId` → `404` (never 403).
   - `await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.user_id, userId)))`.
   - Return `res.json({ ok: true })` (lock the exact success shape by matching the route family — `read-all` returns `{ ok: true }`).
   - Register order is method-distinct from `/read-all` and `/:id/read`, so no Express path-collision concern; place it with the other `/:id` handlers.
6. **Gate A (Fully-Automated):** extend `notifications.integration.test.ts` (reuse its existing
   self-seeding fixture). Add: default page ≤10 newest-first (AC1); `cursor` returns correct next page
   with stable ordering, no overlap/duplication (AC2); `hasMore`/`nextCursor === null` on the last page
   (AC3); `DELETE` removes the row AND a subsequent `GET` no longer returns it (AC6); `DELETE` of another
   user's id → 404 and the row still exists (AC8); `DELETE` of malformed id → 404 (AC8); `unreadCount`
   decreases by 1 after deleting an unread row and is unchanged after deleting a read row (AC9);
   `unreadCount` reflects the true total when unread rows exceed one page (AC10). Run
   `pnpm --filter @jojopotato/api test` → green (needs `docker compose up -d` + `db:migrate`, or the
   native Postgres per `all-tests.md`).

### Section B — Mobile data layer (`apps/mobile` `use-notifications.ts`)

7. Add a page type + fetcher mirroring `use-order-history.ts`:
   `interface NotificationsPage { notifications: AppNotification[]; nextCursor: string | null; unreadCount: number; }`
   and `fetchNotificationsPage({ cursor }: { cursor: string | null })` calling
   `apiRequest<NotificationsPage>(\`/notifications?limit=10${cursor ? \`&cursor=${encodeURIComponent(cursor)}\` : ''}\`)`.
8. Replace the `useQuery` with `useInfiniteQuery`: `queryKey: notificationsQueryKey(user?.id)`,
   `queryFn: ({ pageParam }) => fetchNotificationsPage({ cursor: pageParam })`,
   `initialPageParam: null as string | null`, `getNextPageParam: (last) => last.nextCursor`,
   `enabled: Boolean(user)`, `refetchOnWindowFocus: true`.
9. Derive `notifications = data?.pages.flatMap(p => p.notifications) ?? EMPTY_NOTIFICATIONS` and
   `unreadCount = data?.pages[0]?.unreadCount ?? 0` (server-authoritative — replaces the old
   client-side `.filter(readAt==null).length` `useMemo`; delete that memo).
10. Add `deleteNotification`: a mutationFn
    `apiRequest(\`/notifications/${encodeURIComponent(id)}\`, { method: 'DELETE' })` wrapped in an
    **optimistic** `useMutation` mirroring the existing `markAllRead` recipe. IMPORTANT — decrement
    `unreadCount` on EVERY page's snapshot when the removed row was unread, not just the page it was
    found on: the bell badge reads `pages[0].unreadCount`, and the server returns the SAME user-wide
    total on every page, so a delete on page 2+ that only touched that page's local count would
    leave `pages[0]` stale until the `onSettled` refetch (found by CodeRabbit review, PR #151).
    - `onMutate(id)`: `cancelQueries`; snapshot `previous = queryClient.getQueryData(key)`; `setQueryData`
      to map over `pages`, filtering the id out of each page's `notifications` AND decrementing that page's
      `unreadCount` by 1 only if the removed row's `readAt == null`. Return `{ previous }`.
    - `onError(_e,_id,ctx)`: `setQueryData(key, ctx.previous)` (rollback).
    - `onSettled()`: `invalidateQueries({ queryKey: key })` (safety-net resync).
11. Update `markAllRead`/`markRead` optimistic writers so they operate on the `InfiniteData`
    page-shape (map over `pages[].notifications`) instead of the old flat array — keep behavior
    identical (existing tests/behavior must not regress; AC11).
12. Extend `UseNotifications` interface + the `value` memo with the 4 new fields
    (`deleteNotification`, `hasNextPage`, `fetchNextPage`, `isFetchingNextPage` from the
    `useInfiniteQuery` result). Keep all existing fields.
13. **Gate B (Fully-Automated + typecheck):** `pnpm --filter @jojopotato/mobile typecheck` green
    (proves the hook public shape stayed compatible and `home-header.tsx` still compiles — AC11 no-regression
    for the bell consumer). Run `pnpm --filter @jojopotato/mobile test` (existing vitest+jest) green,
    including `notifications-toast.test.tsx` (see execute-agent instruction E2 — its hook mock may need
    the 4 new fields added once the screen destructures them).

### Section C — `packages/ui` SwipeableRow primitive

**Section C pre-wiring — LOCKED by PVL-supplement (Gap 1 / VALIDATE P1·P3·E1). Do these BEFORE step 14.**

13b. **Add deps to `packages/ui/package.json` (P1).** `packages/ui` declares its RN-ecosystem deps as
     `peerDependencies` (`"react-native": ">=0.86"`), so MIRROR that convention — do NOT use top-level
     `dependencies` (that breaks the single-RN-copy peer convention every other `packages/ui` component
     follows):
     - `peerDependencies`: add `"react-native-gesture-handler": ">=2.32.0"` and
       `"react-native-reanimated": ">=4.5.0"` (the consuming app `apps/mobile` already provides the
       pinned 2.32.0 / 4.5.0 — versions confirmed live in `apps/mobile/package.json`).
     - `devDependencies`: add `"react-native-gesture-handler": "~2.32.0"` and
       `"react-native-reanimated": "4.5.0"` (EXACT versions matching `apps/mobile`, so pnpm resolves one
       workspace copy for the packages/ui jest env).
     - Run `pnpm install` after editing.

13c. **Wire the `packages/ui` jest reanimated (+ gesture-handler) mock (P3/E1).** `packages/ui/jest.config.js`
     is today a bare `jest-expo` preset with NO `setupFiles`; its `transformIgnorePatterns` already
     whitelists `react-native` broadly (so gesture-handler/reanimated transform is already covered — the
     real blocker is reanimated 4.5.0's import-time crash under jest, identical to `apps/mobile`). Mirror
     `apps/mobile/jest.config.js` exactly:
     - Create `packages/ui/src/test-utils/jest-setup.ts` porting ONLY the hand-rolled
       `react-native-reanimated` `jest.mock` block from `apps/mobile/src/test-utils/jest-setup.ts`
       (lines 21–70). DROP the apps/mobile-only `@/features/auth/lib/auth-client` and `expo-router`
       mocks — `packages/ui` has neither.
     - EXTEND the ported reanimated mock with the APIs SwipeableRow needs that the apps/mobile mock
       currently lacks: `useReducedMotion: () => false` (step 18 reads it). If step 14 imports from
       `react-native-gesture-handler` (`ReanimatedSwipeable`/`Gesture`/`GestureDetector`), ALSO add a
       `jest.mock('react-native-gesture-handler', …)` no-op passthrough (`GestureHandlerRootView`,
       `Swipeable`/`ReanimatedSwipeable` render children; `Gesture.Pan()` returns a chainable stub).
       Stub only the surface the chosen import actually renders — verify against the real import.
     - Add `setupFiles: ['<rootDir>/src/test-utils/jest-setup.ts']` to `packages/ui/jest.config.js`.
       Leave `transformIgnorePatterns` as-is UNLESS a bare `react-native-gesture-handler` import trips
       the `node_modules/.pnpm/(?!…)` lookahead — only then append
       `|react-native-gesture-handler|react-native-reanimated` to the whitelist alternation.
     - Guard: the existing `testMatch: ['**/*.test.tsx']` and the "shared fixtures are not suites" note
       in `jest.config.js` must stay intact — the new setup file lives under `src/test-utils/`, not a
       `__tests__/*.test.tsx` path, so it is not collected as a suite.

13d. **Reclassify Gate C tiers by empirical result (P4/E1).** After 13b–13c land: if
     `swipeable-row.test.tsx` renders under the mock → AC4 / AC12 **render halves stay Fully-Automated**.
     If the mock port is non-trivial/brittle or the component will not render → downgrade ONLY the
     AC4/AC12 render halves to **Agent-Probe** and record the reason in the EXECUTE report (do NOT force
     a brittle test). This NEVER relaxes AC6/AC8/AC9/AC10 (server, Fully-Automated, Known-Gap banned).

14. Create `swipeable-row.tsx`. Use `react-native-gesture-handler`'s `ReanimatedSwipeable` (or a
    `Gesture.Pan()` + reanimated `useSharedValue`/`useAnimatedStyle` translateX at point of use — pick
    the simpler that renders under the repo's jest reanimated mock; the mock covers
    `useAnimatedStyle`/`useSharedValue`/`withTiming`/`withSpring`/`interpolate` but NOT layout
    animations — avoid layout-animation APIs). Gesture/`translateX` state is self-contained in the
    component (not React state — avoids re-rendering the FlatList per frame).
    **NOTE (VALIDATE C1/E1):** `packages/ui` does NOT currently declare `react-native-gesture-handler`
    or `react-native-reanimated` and its jest config has no mock for them — do the dep + jest-mock
    wiring (Touchpoints rows added by P1) BEFORE relying on Gate C. See E1.
15. Single-open-row coordination via the imperative `openRowRef` prop: on gesture-start call
    `openRowRef.current?.close()` then set `openRowRef.current = { close: () => <spring this row shut> }`.
    Expose the row's own `close()` so the screen can call it on cancel.
16. Render the revealed action(s) behind the row: fixed action width ~88px, full row height, background
    `Colors[mode].accent` (= `Palette.jred`, the SAME token `ConfirmDialog variant="destructive"` uses —
    do NOT invent a new token), white Ionicons `trash-outline` glyph (Ionicons is the established set,
    per `product-card`/`notification-row`), press feedback via `activeOpacity` (not a scale transform).
17. Accessibility fallback (REQUIRED, not optional): `accessibilityActions={[{ name: 'delete', label: '<action.label>' }]}`
    + `onAccessibilityAction` firing the same `action.onPress` as the trash-button tap. Gesture-only delete
    is not acceptable.
18. Reduced motion: read `useReducedMotion()` from `react-native-reanimated`; when true, replace spring
    bounce with a `withTiming` snap.
19. Export `SwipeableRow` + `SwipeableRowProps`/`SwipeableRowAction` from `packages/ui/src/index.ts`.
20. **Gate C (Fully-Automated component render — CONTINGENT on C1 wiring, else Agent-Probe per E1):** add
    `swipeable-row.test.tsx` mirroring `notification-row.test.tsx`. Assert: child renders; the action/delete
    element exists and its background resolves to `Colors[mode].accent` (destructive token) — assert
    RESOLVED style, not prop-presence (AC4 render half); `mode` prop is threaded (light vs dark resolve to
    different tokens — AC12 render half); `onAccessibilityAction` invokes the action handler (accessibility
    fallback). Run `pnpm --filter @jojopotato/ui test` + `pnpm --filter @jojopotato/ui check-tokens` green.

### Section D — Screen wiring (`apps/mobile` notifications `index.tsx`)

21. Replace the `ScrollView` + `notifications.map()` block with a `FlatList<AppNotification>`:
    `data={notifications}`, `keyExtractor={(n) => n.id}`, memoized `renderItem`,
    `onEndReachedThreshold={0.5}`, `onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}`,
    `ListFooterComponent={isFetchingNextPage ? <ActivityIndicator/> : null}`.
22. Move the marketing settings card + "Mark all as read" row into `ListHeaderComponent`; keep the
    `EmptyState` as `ListEmptyComponent` (fires only when `notifications.length === 0`). Preserve the
    tab-bar clearance `paddingBottom` via the FlatList `contentContainerStyle`. Keep `Toast` outside the list.
23. Wrap each row: `<SwipeableRow mode={mode} openRowRef={openRowRef} actions={[{ label: 'Delete',
    icon: 'trash-outline', variant: 'destructive', onPress: () => setPendingDeleteId(n.id) }]}>
    <NotificationRow ... /></SwipeableRow>`. Add `const openRowRef = useRef<{ close: () => void } | null>(null);`.
24. Add `const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);` and render one
    `<ConfirmDialog visible={pendingDeleteId != null} title="Delete notification?"
    message="This can't be undone." confirmLabel="Delete" cancelLabel="Cancel" variant="destructive"
    mode={mode} onConfirm={() => { if (pendingDeleteId) deleteNotification(pendingDeleteId); setPendingDeleteId(null); }}
    onCancel={() => { setPendingDeleteId(null); openRowRef.current?.close(); }} />`. Reuse the shared
    `ConfirmDialog` — no new modal, no `Alert.alert` (AC5/AC7 + Constraint).
25. Tapping the trash button ONLY opens the dialog (sets `pendingDeleteId`) — it must not call
    `deleteNotification` directly (AC5). Cancel resets swipe via `openRowRef.current?.close()` (AC7).
26. **Gate D (Fully-Automated where possible + Agent-Probe):** `pnpm --filter @jojopotato/mobile typecheck`
    + `pnpm --filter @jojopotato/mobile guard:theme-mode` (0 violations — AC12) + `pnpm --filter
    @jojopotato/mobile test` green. Optional screen component test (jest) if it renders under the mock:
    assert trash-tap opens the dialog and fires no delete (AC5), cancel fires no delete (AC7). On-device
    gesture/scroll/visual halves are Agent-Probe (see Verification Evidence).

26a. **E2 LOCKED by PVL-supplement (Gap 2 / VALIDATE E2 — mandatory fixture fix, not optional).** After
     this Section D screen change destructures the 4 new hook fields, re-run
     `apps/mobile/src/features/notifications/__tests__/notifications-toast.test.tsx`. Its
     `useNotifications()` mock currently returns a PARTIAL object cast through `unknown`; if the test
     breaks against the new destructuring, extend that mock's return object with the 5 new/changed fields
     the screen now reads — `unreadCount: 0`, `hasNextPage: false`, `fetchNextPage: () => {}`,
     `isFetchingNextPage: false`, `deleteNotification: () => {}` (behavior-preserving stub values). Re-run
     `pnpm --filter @jojopotato/mobile test` until green. This is a TEST-FIXTURE edit only — no production
     behavior change, no new file, within the existing blast radius. (Cross-ref: Gate B step 13 flags the
     same risk; the fix lands here because the destructuring change lands here.)

### Section E — Full regression sweep

27. Run the repo gates: `pnpm --filter @jojopotato/api test`, `pnpm --filter @jojopotato/ui test`,
    `pnpm --filter @jojopotato/ui check-tokens`, `pnpm --filter @jojopotato/mobile test`,
    `pnpm --filter @jojopotato/mobile guard:theme-mode`, `pnpm typecheck`, `pnpm lint`,
    `pnpm format:check`. All green before handoff (AC11 no-regression).

---

## Verification Evidence

Each SPEC acceptance criterion → its proving gate + strategy. Known-Gap is BANNED for AC6/AC8/AC9/AC10
(delete-permanence, delete-ownership, unread-count) per the SPEC; none are assigned Known-Gap.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Server: default page returns ≤10 newest-first | Fully-Automated | AC1 |
| Screen renders ≤10 rows on first load (jest render, if under mock) | Agent-Probe (render half auto where possible) | AC1 |
| Server: `cursor` returns correct next page, stable order, no dup | Fully-Automated | AC2 |
| On-device scroll-near-bottom triggers fetch + append | Agent-Probe | AC2 |
| Server: `nextCursor === null` / `hasMore=false` on last page | Fully-Automated | AC3 |
| On-device: no further fetch/spinner past the last page | Agent-Probe | AC3 |
| `swipeable-row.test.tsx`: delete element exists + destructive-token bg resolved | Fully-Automated IF C1 wiring done, else Agent-Probe | AC4 (render half) |
| On-device swipe reveals red trash button | Agent-Probe | AC4 (gesture half) |
| Screen/component test: trash-tap opens dialog, fires NO delete | Fully-Automated | AC5 |
| On-device: full trash→confirm flow | Agent-Probe | AC5 |
| `DELETE /:id` removes row; subsequent `GET` omits it | Fully-Automated (Known-Gap BANNED) | AC6 |
| Component test: cancel resets swipe state, no delete call | Fully-Automated | AC7 |
| `DELETE /:id` wrong-owner → 404, row persists; malformed → 404 | Fully-Automated (Known-Gap BANNED) | AC8 |
| Server: `unreadCount` −1 on unread delete, unchanged on read delete | Fully-Automated (Known-Gap BANNED) | AC9 |
| Server: `unreadCount` = true total when unread > one page | Fully-Automated (Known-Gap BANNED) | AC10 |
| Existing notif suites + `home-header` typecheck re-run green | Fully-Automated | AC11 |
| `guard:theme-mode` 0 violations + `mode` threaded in render tests | Fully-Automated (visual half Agent-Probe) | AC12 |
| On-device light/dark visual check | Agent-Probe | AC12 (visual half) |

**Per-area tier summary (vc-test-coverage-plan):**

- `packages/api` — Fully-Automated (vitest+supertest, real Postgres). All server ACs (1,2,3,6,8,9,10)
  are exact-value integration tests. No Known-Gap.
- `apps/mobile` (hook/data) — Fully-Automated (typecheck proves shape compat; vitest/jest for logic).
- `apps/mobile` (screen gesture/scroll) — Agent-Probe by design (standing project-wide no-RN-gesture/E2E
  runner gap, documented in `all-tests.md`; not a scoping failure).
- `packages/ui` (SwipeableRow) — Fully-Automated component render (jest-expo) for structure/token/accessibility
  IF the RNGH/reanimated dep + jest-mock wiring (VALIDATE C1/E1) lands; gesture motion is Agent-Probe.

## Test Infra Improvement Notes

- **CORRECTED BY VALIDATE (P3):** Gate C runs under `packages/ui` jest (`packages/ui/jest.config.js`),
  NOT `apps/mobile/src/test-utils/jest-setup.ts`. `packages/ui/jest.config.js` is a bare jest-expo preset
  with NO reanimated/gesture-handler mock and its `transformIgnorePatterns` whitelist does NOT include
  `react-native-gesture-handler` or `react-native-reanimated`. Before Gate C can be Fully-Automated, port
  the proven hand-rolled reanimated mock (from the apps/mobile setup) into a packages/ui jest setup file
  and add both packages to the packages/ui `transformIgnorePatterns` whitelist. If the port is
  non-trivial/brittle, AC4/AC12 render halves fall back to Agent-Probe (SPEC-acceptable).
- The repo jest reanimated mock covers `useSharedValue`/`useAnimatedStyle`/`withTiming`/`withSpring`/
  `interpolate` but NOT layout animations. `SwipeableRow` must avoid layout-animation APIs. If the screen's
  FlatList+SwipeableRow composition cannot render under the mock, the screen-level delete-flow test (AC5/AC7)
  falls back to Agent-Probe — record this in the EXECUTE report rather than forcing a brittle test.
- No RN gesture/scroll/E2E runner exists project-wide (standing gap). AC2/AC3/AC4/AC5(on-device)/AC12(visual)
  Agent-Probe halves are inherent to that gap, already tracked in `all-tests.md` Known Gaps — no NEW backlog
  note required.

---

## Dependencies, Risks, Integration Notes

- **Dependencies (CORRECTED BY VALIDATE P2):** `react-native-gesture-handler` + `react-native-reanimated`
  are already deps **of `apps/mobile`** (and `GestureHandlerRootView` already wraps the root layout), so
  Sections B/D need no new wiring. They are NOT deps of `packages/ui` — SwipeableRow is the first packages/ui
  component to need them, so Section C requires adding them to `packages/ui/package.json` + wiring the
  packages/ui jest mock (P1/P3, E1). `ConfirmDialog` already exists and is the sanctioned `Alert.alert`
  replacement.
- **Risk 1 (security — highest):** the DELETE route MUST mirror `PATCH /:id/read`'s 404-not-403 convention.
  Cart's `requireOwnedLine` uses **403** on wrong-owner (`cart.ts:122`, verified by VALIDATE) — do NOT copy
  it here. (The SPEC's Background note describing cart as "404-not-403" is inaccurate; this plan's own
  instruction is correct and supersedes it — see E3.) Locked, tested by AC8.
- **Risk 2 (contract compat):** `useNotifications().notifications` must stay a flat array so `home-header.tsx`
  bell needs no edit. VALIDATE verified `home-header.tsx` reads ONLY `unreadCount` (kept top-level). Proven
  by typecheck (Gate B) + read-verify of `home-header.tsx`.
- **Risk 3 (money/schema):** none — no schema, no migration, no pricing. `serializeNotification` untouched.
- **Backwards compatibility:** the `GET /notifications` response shape changes (adds `nextCursor`,
  `unreadCount`). VALIDATE grep-confirmed the ONLY client is `useNotifications()` in this repo, updated in
  the same plan; no external consumer.
- **UX design:** SPEC mandates `ui-ux-pro-max` for swipe/trash/modal visuals — apply during EXECUTE for
  the SwipeableRow reveal styling and confirm-modal copy (title/message already locked in the checklist).

## Rollback

Pure feature-add, no destructive migration. Rollback = revert the touched files; the `GET`/`DELETE`
route changes and the hook conversion revert cleanly (no data written that outlives a revert; deletes are
user-initiated and expected). No schema to roll back.

---

## Validate Contract

Status: PASS
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl
supersedes: 21-07-26 (outer-pvl) — outer PVL re-run after supplement cycle 1 has current evidence

Parallel strategy: sequential (single plan; VALIDATE fan-out run internally by one vc-validate-agent)
Rationale: signal score ~4/7 (S1 multi-package, S2 API-contract/auth surface, S6 auth+public-API high-risk class, S7 ~9-11 files). Single plan, not a phase program — dependency-ordered sections A→B→C→D→E execute sequentially (not parallelizable).

Net gate: PASS — 0 FAILs, 0 CONCERNs (after supplement cycle 1). Prior first-pass gate was CONDITIONAL (2 CONCERNs: C1 packages/ui RNGH+reanimated dep + jest-mock wiring; C2 notifications-toast test mock); both closed by supplement steps 13b/13c/13d (Section C pre-wiring) + 26a (toast fixture fix), verified against live source this re-validation cycle. PHASE_COMPLETE: VALIDATE is legal (Gate = PASS).

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Default page returns ≤10 newest-first | Fully-Automated | `pnpm --filter @jojopotato/api test` — new case in `notifications.integration.test.ts` asserting ≤10 rows, `desc(created_at)` | A |
| AC2 | `cursor` returns correct next page, stable order, no dup/overlap | Fully-Automated | Same suite — seed >10, page 1 then cursor page 2, assert disjoint + ordered | A |
| AC3 | `nextCursor === null` / `hasMore=false` on last page | Fully-Automated | Same suite — last page assertion | A |
| AC6 | DELETE removes row; subsequent GET omits it (permanent) | Fully-Automated (Known-Gap BANNED) | Same suite — DELETE then GET no longer returns id; row absent in DB | A |
| AC8 | Wrong-owner → 404 + row persists; malformed id → 404 | Fully-Automated (Known-Gap BANNED) | Same suite — cross-user DELETE → 404, victim row still present; non-UUID → 404 | A |
| AC9 | `unreadCount` −1 on unread delete, unchanged on read delete | Fully-Automated (Known-Gap BANNED) | Same suite — before/after count for both cases | A |
| AC10 | `unreadCount` = true total when unread > one page | Fully-Automated (Known-Gap BANNED) | Same suite — seed >page unread, assert count = true total pre-scroll | A |
| AC5 | Trash-tap opens ConfirmDialog, fires NO delete | Fully-Automated | `pnpm --filter @jojopotato/mobile test` — screen/component test if it renders under jest mock; else Agent-Probe | A |
| AC7 | Cancel resets swipe state, no delete call | Fully-Automated | Same runner — cancel path assertion | A |
| AC4 (render half) | Delete element exists + destructive-token bg resolved | Fully-Automated (contingent on 13b/13c mock render; else Agent-Probe per 13d) | `pnpm --filter @jojopotato/ui test` swipeable-row render test — packages/ui jest now wired for RNGH/reanimated by supplement 13b/13c | B |
| AC11 | Existing notif suites + `home-header` typecheck green | Fully-Automated | api + mobile suites re-run; `pnpm --filter @jojopotato/mobile typecheck` | A |
| AC12 (guard half) | `guard:theme-mode` 0 violations + `mode` threaded | Fully-Automated (visual half Agent-Probe) | `pnpm --filter @jojopotato/mobile guard:theme-mode`; `mode`-threading render assertion CONTINGENT on C1 | A |
| AC2/AC3/AC4/AC5/AC12 (on-device) | swipe/scroll/visual interaction | Agent-Probe | On-device walkthrough (standing no-RN-gesture/E2E runner gap, `all-tests.md`) | C |

gap-resolution legend: A — proven now · B — added by this plan · C — deferred to named later phase/Agent-Probe · D — backlog stub.

C-4 note: the `strategy` column carries only proving strategies (Fully-Automated / Hybrid / Agent-Probe). No Known-Gap row appears — AC6/AC8/AC9/AC10 are all Fully-Automated server integration tests; Known-Gap is not used anywhere (SPEC ban honored).

Legacy line form (retained for existing consumers):
- Server (AC1/2/3/6/8/9/10): Fully-automated — `pnpm --filter @jojopotato/api test` (precondition: `docker compose up -d` + `db:migrate`, or native Postgres per all-tests.md)
- Mobile hook/shape (AC11): Fully-automated — `pnpm --filter @jojopotato/mobile typecheck` + `pnpm --filter @jojopotato/mobile test`
- SwipeableRow render (AC4/AC12 render halves): Fully-automated IF packages/ui jest supports RNGH+reanimated (see C1) — `pnpm --filter @jojopotato/ui test` + `check-tokens`; else agent-probe fallback
- Theme guard (AC12): Fully-automated — `pnpm --filter @jojopotato/mobile guard:theme-mode`
- Gesture/scroll/visual on-device (AC2/3/4/5/12 halves): agent-probe — standing project-wide no-RN-gesture/E2E runner gap

Failing stub (AC1):
test("GET /notifications default page returns at most 10 newest-first", () => { throw new Error("NOT IMPLEMENTED — TDD stub: default page size + ordering") })

Failing stub (AC2):
test("GET /notifications cursor returns correct next page with no overlap", () => { throw new Error("NOT IMPLEMENTED — TDD stub: cursor pagination stable ordering") })

Failing stub (AC3):
test("GET /notifications nextCursor is null on last page", () => { throw new Error("NOT IMPLEMENTED — TDD stub: hasMore=false terminal page") })

Failing stub (AC6):
test("DELETE /notifications/:id hard-deletes and GET no longer returns it", () => { throw new Error("NOT IMPLEMENTED — TDD stub: delete removes row + absent from subsequent GET") })

Failing stub (AC8):
test("DELETE /notifications/:id wrong-owner → 404 and row persists; malformed → 404", () => { throw new Error("NOT IMPLEMENTED — TDD stub: ownership 404-not-403 mirror of PATCH /:id/read") })

Failing stub (AC9):
test("unreadCount decreases by 1 on unread delete, unchanged on read delete", () => { throw new Error("NOT IMPLEMENTED — TDD stub: unread-count delta on delete") })

Failing stub (AC10):
test("unreadCount reflects true total when unread rows exceed one page", () => { throw new Error("NOT IMPLEMENTED — TDD stub: server-computed unread count, not page-derived") })

### Dimension findings

- Infra fit: PASS — server pagination mirrors `orders.ts` (571–612) exactly and the `PATCH /:id/read` mirror is correct. Prior C1 (packages/ui missing RNGH/reanimated deps + no jest mock) closed by supplement 13b/13c: deps added as peer(range)+dev(exact) mirroring packages/ui's existing react/react-native convention, versions matched live to apps/mobile (`~2.32.0`/`4.5.0`); jest-setup ported from apps/mobile lines 21–70 (dropping the auth-client/expo-router mocks that don't apply, adding `useReducedMotion` which the apps/mobile mock lacks); `setupFiles` + transformIgnorePatterns hedge verified sound against live `packages/ui/jest.config.js`.
- Test coverage: PASS — all Known-Gap-banned ACs (6/8/9/10) are real Fully-Automated server integration tests. Prior C1 concern about the AC4/AC12 render halves closed by 13b/13c (packages/ui jest now renders reanimated/gesture components) + 13d (empirical tier reclassification: render halves stay Fully-Automated if they render, else Agent-Probe fallback — never relaxing the server-gate ban). Vacuous-green check: no developed behavior rests on Known-Gap alone; the only Agent-Probe residuals are the un-automatable on-device gesture/scroll/visual halves (standing project-wide no-RN-gesture/E2E runner gap, documented in `all-tests.md`), named as residual. Existing `notifications.integration.test.ts` and `notification-row.test.tsx` confirmed present.
- Breaking changes: PASS — `GET /notifications` shape change is additive (`nextCursor`/`unreadCount` added); grep confirms `useNotifications()` is the SOLE runtime consumer; `home-header.tsx` reads only `unreadCount` (kept top-level) so it needs no edit; no external consumer; client+server ship together.
- Security surface: PASS — DELETE route correctly mirrors `PATCH /:id/read`'s 404-not-403 leak-proof convention (verified against live source), UUID-validates `:id`, scopes DELETE to `AND user_id=$2`, AC8 tests wrong-owner→404 + malformed→404. No secret/credential/privilege-escalation surface, no broadened `:id` param. 5-artifact risk-evidence-pack is available-but-not-required (same risk class + precedent as the shipped cart-persistence session-auth CRUD, which judged it not proportionate).
- Section A (server) feasibility: PASS — orders.ts + PATCH-read precedents exact; imports `lt` + `sql` identified; DELETE register-order collision-free (method-distinct). Highest-risk edit: DELETE ownership 404 — correctly locked.
- Section B (mobile hook) feasibility: PASS — `use-order-history` `useInfiniteQuery` precedent transfers; markAll/markRead optimistic writers correctly migrated to InfiniteData page-shape (step 11). Prior C2 (the `notifications-toast.test.tsx` hook mock returns a partial object cast through `unknown`) is now a locked mandatory step 26a with the exact 5-field stub set (`unreadCount`/`hasNextPage`/`fetchNextPage`/`isFetchingNextPage`/`deleteNotification`), verified this cycle against live mock lines 29–34 — behavior-preserving, in-blast-radius.
- Section C (SwipeableRow) feasibility: PASS — component feasible (RNGH 2.32 ships `ReanimatedSwipeable`; reanimated 4.5 has `useReducedMotion`); accessibility + reduced-motion specified with adequate detail (steps 17–18) and Gate C asserts `onAccessibilityAction` fires the handler. Prior C1 packages/ui dep/jest wiring gap closed by the locked pre-wiring steps 13b/13c/13d (verified grounded against live `apps/mobile`/`packages/ui` package.json + jest configs this cycle).
- Section D (screen wiring) feasibility: PASS — ConfirmDialog props verified match; FlatList `ListHeaderComponent`/`ListEmptyComponent`/tab-bar-clearance migration sound; openRowRef single-open coordination reasonable; on-device halves Agent-Probe as designed.

### Proposed plan updates (applied by VALIDATE + LOCKED by supplement cycle 1)

- P1 — Add two touchpoints (DONE in Touchpoints above): `packages/ui/package.json` (ADD RNGH + reanimated as peer + dev deps — SwipeableRow is the FIRST packages/ui component needing them) and `packages/ui/jest.config.js` (+ new jest setup file) for the reanimated/gesture-handler mock + transformIgnorePatterns whitelist.
- P2 — Correct the "no new wiring" dependency claim (DONE in Dependencies §): true for apps/mobile, FALSE for packages/ui.
- P3 — Fix the Test Infra Notes (DONE): Gate C runs under packages/ui jest, not apps/mobile's setup; port the mock + whitelist RNGH/reanimated there.
- P4 — Reclassify AC4/AC12 render halves as contingent (DONE in test-gates table): Fully-Automated only if the ported packages/ui mock renders SwipeableRow; else Agent-Probe (SPEC-acceptable). Does NOT affect AC6/AC8/AC9/AC10 (server-side).

### Execute-agent instructions

- E1 — Before writing Section C, add `react-native-gesture-handler` + `react-native-reanimated` to `packages/ui` peerDependencies AND devDependencies, then port the reanimated mock from `apps/mobile/src/test-utils/jest-setup.ts` into a `packages/ui` jest setup + add both packages to `packages/ui/jest.config.js` `transformIgnorePatterns`. If the mock port makes Gate C non-trivial/brittle, downgrade AC4/AC12 render halves to Agent-Probe and record it in the EXECUTE report (do NOT force a brittle test). This does NOT relax AC6/AC8/AC9/AC10 (server, Fully-Automated, Known-Gap banned).
- E2 — When Section D converts the screen to FlatList and destructures the 4 new hook fields, re-run `notifications-toast.test.tsx`; if it fails because its `useNotifications` mock lacks `unreadCount`/`hasNextPage`/`fetchNextPage`/`isFetchingNextPage`/`deleteNotification`, extend the mock's return object (behavior-preserving).
- E3 — DELETE route: lock the exact success JSON by matching the route family (`read-all` returns `{ ok: true }`). Keep 404-not-403 for malformed/wrong-owner/already-gone, mirroring `PATCH /:id/read` verbatim. Do NOT copy cart's `requireOwnedLine` 403-on-wrong-owner (verified: cart.ts:122 uses 403 — the SPEC's Background note calling cart "404-not-403" is inaccurate; this plan's instruction is correct and supersedes it).
- E4 — Import `lt` (drizzle-orm) alongside `and, desc, eq, isNull`, and `sql` for the `count(*)::int` unread count.

Open gaps: none. Prior C1/C2 concerns closed by supplement steps 13b/13c/13d + 26a. No new backlog note required — the on-device gesture/scroll/visual Agent-Probe halves are the standing project-wide no-RN-gesture/E2E-runner gap already documented in `all-tests.md` Known Gaps (named residual, not a silent pass).

What this coverage does NOT prove:
- The server Fully-Automated suite (AC1/2/3/6/8/9/10) does NOT prove any on-device behavior: swipe reveals the trash button (AC4 gesture half), scroll-near-bottom triggers fetch+append (AC2), no-fetch-past-last-page (AC3), the full on-device trash→confirm→delete flow (AC5), or light/dark visual correctness (AC12 visual half).
- The `guard:theme-mode` gate proves no hardcoded colors / no banned patterns; it does NOT prove the swipe reveal or modal LOOK correct in either mode.
- The AC4/AC12 render-half component test (if it runs) proves the delete element exists with a resolved destructive-token background and that `mode` threads to different tokens; it does NOT prove the gesture animation, the reduced-motion snap, or real swipe distance/threshold behavior.
- Typecheck (AC11 bell-compat) proves `home-header.tsx` still compiles against the hook's public shape; it does NOT prove the bell badge renders the right number at runtime.

Gate: PASS (no FAILs, no CONCERNs after supplement cycle 1; both prior CONCERNs closed and verified against live source)
Accepted by: session — PASS gate, no residual concerns requiring acceptance. Prior C1 (packages/ui RNGH+reanimated dep + jest-mock wiring) and C2 (notifications-toast test mock) resolved by supplement steps 13b/13c/13d + 26a. Known-Gap-banned server gates (AC6/AC8/AC9/AC10) remain real Fully-Automated tests.

---

## Autonomous Goal Block

```
SESSION GOAL: Notifications swipe-to-delete + load-more pagination (packages/api + apps/mobile + packages/ui)
Charter + umbrella plan: N/A — single plan
Autonomy: interactive single-plan VALIDATE; supplement cycle 1 applied (P1–P4 + E1–E4 locked as steps 13b/13c/13d/26a) → re-validated → Gate PASS. Ready for EXECUTE. No standing /goal.
Hard stop conditions / safety constraints:
- DELETE /notifications/:id MUST return 404 (never 403) on malformed/wrong-owner/already-gone, mirroring PATCH /:id/read — never leak another user's row existence.
- Known-Gap is BANNED for AC6 (permanent delete), AC8 (ownership/404), AC9 + AC10 (unread count) — all stay real Fully-Automated server tests.
- No schema change, no migration; serializeNotification untouched.
Next phase: EXECUTE A→B→C→D→E (Gate PASS; server Section A first, Fully-Automated in isolation).
Validate contract: inline in this plan (§Validate Contract, Status: PASS)
Execute start: pnpm --filter @jojopotato/api test | pnpm --filter @jojopotato/mobile test + typecheck + guard:theme-mode | pnpm --filter @jojopotato/ui test + check-tokens | on-device Agent-Probe (swipe/scroll/visual) | high-risk pack: no (available, not required)
```

---

## Phase Completion Rules

- **CODE DONE** when Sections A–E are implemented and every Fully-Automated gate is green (API suite,
  `packages/ui` jest + check-tokens, mobile vitest+jest, typecheck, lint, `guard:theme-mode`, format:check),
  with Known-Gap NOT used for AC6/AC8/AC9/AC10.
- **NOT VERIFIED** until the user performs the Agent-Probe walkthroughs (owed, standing no-RN-gesture/E2E
  runner gap): AC2 scroll-triggers-fetch, AC3 no-fetch-past-last-page, AC4 swipe reveals trash button,
  AC5 full trash→confirm delete flow on-device, AC12 light/dark visual check. The task folder stays in
  `active/` until these are confirmed — do NOT archive to `completed/` on code-completion alone.
- A first-pass PVL `Gate: CONDITIONAL`/`BLOCKED` routes back to PLAN supplement, never to EXECUTE.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/rewards-notifications/active/notif-delete-pagination_21-07-26/notif-delete-pagination_PLAN_21-07-26.md`
2. **Last completed step:** VALIDATE re-run after supplement cycle 1 → Gate PASS. No EXECUTE work started.
3. **Validate-contract status:** written (21-07-26), Status: PASS, generated-by: outer-pvl (supersedes the first-pass CONDITIONAL).
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   SPEC (same folder), `notifications.ts`, `use-notifications.ts`, notifications `index.tsx`,
   `home-header.tsx`, `orders.ts` GET (pagination precedent), `cart.ts` DELETE (ownership precedent
   — verified: uses 403, NOT the convention to copy), `confirm-dialog.tsx`, `notification-row.tsx`,
   `packages/ui/package.json` + `jest.config.js` (dep/mock gap), `theme.ts` (accent=jred token).
5. **Next step for a fresh agent:** the orchestrator runs the plan-supplement cycle (vc-plan-agent
   supplement mode locking P1–P4 + E1–E4), then re-spawns VALIDATE from V1; on PASS, EXECUTE
   section-by-section A→B→C→D→E, running each section's test gate before advancing. Server (Section A)
   is the foundation and is Fully-Automated testable in isolation — start there. The delete route's
   404-not-403 convention, the `unreadCount` independent-count, and the packages/ui RNGH+reanimated
   dep/jest wiring (Section C) are the three correctness points most likely to be gotten wrong.

---

## Strategy Note (phase-end → VALIDATE)

`vc-agent-strategy-compare`: signal score ~4/7 (S1 multi-package, S2 API contract/auth surface, S6
auth+public-API high-risk class, S7 ~9-11 files). This is a SINGLE plan (not a phase program), so VALIDATE
runs as ONE `vc-validate-agent` pass (its Layer-1 dimension fan-out is internal). Sequential EXECUTE
(A→B→C→D→E) is correct — the sections are dependency-ordered, not parallelizable. Model: sonnet for
VALIDATE; opus only for the EXECUTE leg.
