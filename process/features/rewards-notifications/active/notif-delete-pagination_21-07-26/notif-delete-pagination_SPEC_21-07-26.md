---
name: plan:notif-delete-pagination-spec
description: "SPEC — notifications swipe-to-delete + paginated load-more, rewards-notifications feature"
date: 21-07-26
feature: rewards-notifications
---

# SPEC — Notifications: Swipe-to-Delete + Load-More Pagination

## Summary

Today the Notifications screen shows every notification a customer has (up to a hidden cap
of 100) in one long list, and there is no way to delete one you don't want anymore. This
change adds two things customers can do on that screen: (1) swipe a notification left to
reveal a delete button, tap it, confirm in a small popup, and the notification is gone for
good; and (2) the list now loads only the 10 most recent notifications at first, quietly
loading 10 more each time you scroll near the bottom — so the screen opens fast and never
tries to render a huge list at once. Both changes are presentation and data-loading
improvements only; no other notification behavior (marking read, the marketing toggle,
tapping a notification to jump somewhere) changes.

## User Stories / Jobs To Be Done

- As a customer with a cluttered notification list, I want to remove notifications I don't
  need anymore, so that my list only shows things that matter to me.
- As a customer, I want a clear "are you sure?" check before a notification is permanently
  removed, so that I don't lose something by an accidental swipe/tap.
- As a customer with a long notification history, I want the screen to open quickly and load
  more only as I scroll, so that I'm not stuck waiting for a huge list to render up front.
- As a customer, I want my unread-count badge (the bell icon) to stay accurate no matter how
  many pages of notifications I've scrolled through, so I always know how many are actually
  unread.

## What The User Wants (Behavioral Outcomes)

- The notification list shows 10 items at first load.
- Scrolling toward the bottom of the list automatically fetches and appends the next 10 (no
  "Load More" button tap required) — a small loading indicator appears at the bottom while
  more are being fetched.
- Swiping a notification row to the side reveals a red trash-can button on that row.
- Tapping the trash-can button opens a confirmation popup asking the user to confirm the
  delete (not an instant delete).
- Confirming the popup removes that notification immediately and permanently from the list —
  it does not reappear, and it does not count toward the unread badge if it was unread.
- Cancelling the popup closes it and leaves the notification exactly as it was (row returns
  to its normal, non-swiped state).
- The unread-count bell badge (shown elsewhere in the app header) continues to reflect the
  true number of unread notifications, independent of how many pages the user has scrolled
  through on this screen.
- Everything else on the screen (marketing-opt-in toggle, "Mark all as read", tapping a row to
  navigate, read/unread visual state) behaves exactly as it does today.

## Flow / State Diagram

```
Notifications screen opens
        |
        v
 Fetch first page (10 newest notifications) + unread count
        |
        v
 [ List renders: 10 rows ]
        |
        |-- user scrolls near bottom --> fetch next 10 --> append to list
        |                                      |
        |                                      v
        |                          (repeat until no more pages)
        |
        |-- user swipes a row left
        |         |
        |         v
        |   [ Row reveals red trash-can button ]
        |         |
        |         |-- user swipes back / taps elsewhere --> row returns to normal
        |         |
        |         |-- user taps trash-can
        |                 |
        |                 v
        |         [ Confirm delete modal shown ]
        |                 |
        |        |--------+--------|
        |        v                 v
        |   user cancels      user confirms
        |        |                 |
        |        v                 v
        |  modal closes,     notification deleted (server + local list)
        |  row resets        row removed from list, unread badge
        |                    recalculated if it was unread
```

## Acceptance Criteria (Testable Outcomes)

1. Opening the Notifications screen shows at most 10 notifications initially, newest first.
   proven by: notifications-pagination initial-page-size integration test (server) + screen
   render test asserting row count ≤ 10 on first load.
   strategy: Fully-Automated.

2. Scrolling near the bottom of the list triggers loading of the next 10 notifications and
   appends them without replacing the ones already shown.
   proven by: server cursor-pagination integration test (returns correct next page + stable
   ordering) — Fully-Automated. The on-device scroll-triggers-fetch interaction itself is
   Agent-Probe (standing no-RN-runner gap).
   strategy: Hybrid.

3. When there are no more notifications to load, scrolling further does not trigger any
   additional fetch and no loading indicator is shown.
   proven by: server "hasMore=false on last page" integration test — Fully-Automated. On-screen
   confirmation that no further fetch/spinner occurs is Agent-Probe.
   strategy: Hybrid.

4. Swiping a notification row reveals a red trash-can delete button on that row.
   proven by: Agent-Probe on-device gesture walkthrough (no RN swipe-gesture runner exists
   project-wide). Component-level render test confirms the delete-button element exists and is
   themed with the destructive token when the row is in "revealed" state.
   strategy: Hybrid.

5. Tapping the trash-can button opens a confirmation modal before anything is deleted; the
   notification is NOT deleted until the user explicitly confirms.
   proven by: component test asserting no delete call fires on trash-tap alone (only opens
   modal); Agent-Probe confirms the full on-device flow.
   strategy: Hybrid.

6. Confirming the modal permanently deletes the notification — it is removed from the
   customer's list and does not return on next screen load or app restart.
   proven by: `DELETE /notifications/:id` integration test verifying the row no longer exists
   in the database and no longer appears in a subsequent `GET /notifications` call for that
   user. Fully-Automated, Known-Gap banned for this criterion.
   strategy: Fully-Automated.

7. Cancelling the modal leaves the notification untouched — no delete occurs, and the row
   returns to its normal (non-swiped) resting state.
   proven by: component test asserting the row's swipe state resets and no delete call is made
   on cancel.
   strategy: Fully-Automated.

8. A customer can only delete their own notifications — attempting to delete another user's
   notification (or a non-existent one) fails safely without revealing whether that
   notification exists.
   proven by: `DELETE /notifications/:id` ownership/404 integration test, mirroring the
   existing `PATCH /notifications/:id/read` 404-on-mismatch convention. Fully-Automated,
   Known-Gap banned.
   strategy: Fully-Automated.

9. Deleting an unread notification correctly decreases the unread-count badge shown elsewhere
   in the app (the bell icon); deleting a read notification does not change the unread count.
   proven by: integration test asserting `unreadCount` before/after delete for both read and
   unread cases.
   strategy: Fully-Automated.

10. The unread-count badge stays accurate regardless of how many pages of notifications the
    user has scrolled through (i.e., unread count is not derived only from currently-loaded
    rows).
    proven by: integration test seeding more unread notifications than one page holds, then
    asserting `unreadCount` reflects the true total even before the user has scrolled to load
    them all.
    strategy: Fully-Automated.

11. Every other existing behavior on the Notifications screen (marketing opt-in toggle, "Mark
    all as read", tap-to-navigate, visual read/unread distinction) continues to work
    unchanged after this feature ships.
    proven by: existing regression test suite for `use-notifications.ts` / notifications
    screen re-run as a no-regression gate.
    strategy: Fully-Automated.

12. The delete button, swipe interaction, and confirmation modal render correctly in both
    light and dark mode, using themed tokens (no hardcoded colors).
    proven by: `guard:theme-mode` CI script (0 violations) + component render test asserting
    `mode` prop is threaded through. The visual on-device light/dark check itself is
    Agent-Probe.
    strategy: Hybrid.

## Out Of Scope

- Bulk delete / "clear all notifications" — not requested by the user; may be considered as a
  separate future request.
- Undo-delete / soft-delete / delete history — deletion is permanent and immediate; no
  recovery mechanism is being built.
- Any change to how notifications are created, sent, or marked read/unread — those flows are
  untouched.
- Any change to the marketing-opt-in toggle or its behavior.
- Swipe-to-delete or pagination on any other list in the app (order history, deals, etc.) —
  scoped to the Notifications screen only.
- Changing what counts as a "notification" (types, targets, payload shape) — the underlying
  data model for a notification is unchanged apart from becoming deletable.

## Constraints

- Must reuse the existing shared `ConfirmDialog` component for the delete confirmation — no
  new modal primitive, and no reintroduction of `Alert.alert` (previously and deliberately
  removed elsewhere in this app).
- Must use a themed `mode: ThemeMode` prop (no default) on any new UI component, per this
  project's hard theming convention; no hardcoded hex colors (enforced by the `guard:theme-mode`
  CI script).
- The public shape of `useNotifications()` must remain externally compatible — `notifications`
  must stay a flat array (existing consumer: the Home-header bell icon), even though the
  underlying fetch becomes paginated. New capabilities (delete, load-more, loading state) must
  be additive, not shape-breaking.
- Deletion must be a real, permanent removal (matches the existing "no soft-delete column"
  reality of the `notifications` table) — no new schema column is required for this feature.
- Pagination must scope to the requesting user's own notifications only, matching every other
  authenticated route in this codebase (never leak another user's rows or existence).
- The user has explicitly directed that the `ui-ux-pro-max` skill be used for this feature's
  UX/visual design (swipe-reveal styling, trash-button appearance, confirmation modal
  copy/layout). INNOVATE and PLAN must invoke it before finalizing the visual approach.
- No automated on-device gesture/scroll test runner exists in this codebase today (standing,
  project-wide gap) — criteria involving actual swipe gestures or live scroll-triggered
  fetching are Agent-Probe by design, not a scoping failure of this SPEC.

## Open Questions

None. The following product decisions were ambiguous coming out of RESEARCH and are locked
here as defaults (not left open), per Auto Mode guidance to avoid blocking on decisions with a
clear, low-risk default:

- **Page size & pagination style:** cursor-based pagination on a COMPOUND `(created_at, id)` key
  (not `created_at` alone — a single-column cursor let rows tied at millisecond precision be
  permanently skipped, found by CodeRabbit review on PR #151 and fixed with a real regression
  test), default page size 10, otherwise mirroring the existing `GET /orders` cursor pattern.
  Locked.
- **Delete semantics:** hard delete (`DELETE FROM notifications WHERE id=:id AND
  user_id=:userId`), no soft-delete column added — mirrors the existing cart-line delete
  convention and nothing in the request implies an undo/audit requirement. Locked.
- **Unread count under pagination:** computed server-side as an independent count, not derived
  from currently-loaded pages, so the bell badge stays correct regardless of scroll position.
  Locked.
- **Bulk/clear-all delete:** explicitly out of scope (see Out Of Scope). Locked.
- **`useNotifications()` contract:** stays externally compatible for existing consumers
  (flat `notifications` array); new exports (delete, pagination state) are additive only.
  Locked.

## Background / Research Findings

- Feature folder `rewards-notifications` confirmed active with no conflicting plans; this is
  genuinely new scope.
- Current screen (`apps/mobile/src/app/(tabs)/notifications/index.tsx`) uses a plain
  `ScrollView` + `.map()`, not a `FlatList` — will need to move to a `FlatList` (or
  `SectionList`, matching the order-history precedent) with `onEndReached` to support
  load-more.
- Data layer `useNotifications()` (`apps/mobile/src/features/notifications/hooks/use-notifications.ts`)
  currently wraps a single `useQuery` and exposes `{ notifications, unreadCount, markRead,
  markAllRead, marketingOptIn, setMarketingOptIn }`, consumed by both the notifications screen
  and the Home-header bell. This shape must stay compatible.
- Server route `packages/api/src/routes/notifications.ts` is session-gated, currently returns
  up to 100 rows with no real pagination (the route's own comment attributes the flat cap to
  there being no paginated UI yet — this comment becomes stale once this feature ships). No
  `DELETE` route exists today.
- DB table `notifications` (`packages/api/src/db/schema/notifications.ts`) has no soft-delete
  column; index exists on `(user_id, read_at)`.
- Precedent for the new delete route's general SHAPE (scope-to-caller, validate the id,
  invalidate/optimistically update the client cache on success): cart-line
  `DELETE /cart/items/:lineId`. **Correction (verified against `cart.ts:122`): cart does NOT use
  404-not-403** — it returns 404 for a genuinely nonexistent line but 403 for a line that exists
  but belongs to another user's cart (an intentional, different convention — see
  `requireOwnedLine`'s own doc comment). The notification DELETE route's actual 404-for-both
  (never leak existence) convention instead mirrors this codebase's existing
  `PATCH /notifications/:id/read` route, not cart. (Found by CodeRabbit review, PR #151 — this
  note previously mis-cited cart as the 404-not-403 precedent.)
- Precedent for pagination: order-history's `useInfiniteQuery` + server `limit`/`cursor` (on
  `placed_at`) pattern, fetching `limit+1` to detect `hasMore`. Directly transferable to
  notifications using `created_at` as the cursor field.
- No swipeable/gesture list interaction exists anywhere in the app yet, but
  `react-native-gesture-handler` and `react-native-reanimated` (with `Swipeable`/
  `ReanimatedSwipeable`) are already dependencies, and `GestureHandlerRootView` already wraps
  the root layout — no new root-level wiring is needed.
- The shared `ConfirmDialog` component (`packages/ui/src/components/confirm-dialog.tsx`)
  already supports a `variant="destructive"` styling and is the established replacement for
  `Alert.alert` elsewhere in this app (e.g. staff order reject/cancel) — this is the confirm
  modal to reuse.
- Theming convention (CLAUDE.md, hard requirement): every `@jojopotato/ui` component requires a
  non-defaulted `mode: ThemeMode` prop; the `guard:theme-mode` CI script hard-fails on raw hex
  literals and other violations.
- Test-tier reality: the new delete route is fully automatable via vitest+supertest (mirroring
  existing `:id/read` ownership tests) — Known-Gap must not be used for it. Swipe-gesture
  interaction and live on-device scroll-triggered pagination are Agent-Probe only, matching the
  standing project-wide gap documented in `process/context/tests/all-tests.md`.
- User explicitly requested the `ui-ux-pro-max` skill be used for this feature's UX design —
  carried into this SPEC's Constraints so INNOVATE/PLAN do not skip it.
