---
name: plan:push-notifications-ui
description: "UI-only, mock/local-state push notifications pass (#36/#37/#38) — notification center, marketing opt-in toggle, tap-to-navigate, first-order permission seam; defers all real delivery to #75"
date: 14-07-26
feature: rewards-notifications
---

# Push Notifications — UI-Only Pass (PUSH-001 / PUSH-002 / PUSH-003) — Plan

**Date**: 14-07-26
**Complexity**: COMPLEX (single plan, not a phase program)
**Status**: ⏳ PLANNED

## TL;DR

Replace the empty `account/notifications.tsx` stub with a real Notifications screen: a newest-first
list of mock notification items (unread indicator, relative time, icon, tap-to-navigate), an inline
marketing on/off toggle (transactional is always-on, no switch), and a first-order permission-request
seam. All logic lives in **pure functions** (`features/notifications/lib/*`) so `apps/mobile` vitest
can prove ACs 1/3/4/5/6/7/8/12 mechanically; two new `@jojopotato/ui` components (`Toggle`,
`NotificationRow`) get jest-expo render tests (AC 11). No backend — everything is mock/local state
behind a `useNotifications()` seam so #75 swaps the data source without touching screens.

## Overview

Mirrors the `deals-screens_13-07-26` precedent: typed mock data + a hook-shaped seam + an explicit
`PLACEHOLDER / MOCK DATA` banner, built ahead of the backend (#75, PUSH-004) so screens don't get
rebuilt when the real data path lands. Scope = screens + on-device behavior + mock/local state only.

## Goals

1. A real Notifications list under Account → Notifications (replaces `<ComingSoon>`), newest-first,
   each item = title + body + relative time + unread/read state + type icon; empty state when zero.
2. Tap an item → mark read + navigate to its `targetScreen` (order tracking / deal details / coupon
   wallet / rewards).
3. An inline marketing-notifications toggle; transactional (order) notifications bypass it entirely.
4. A first-order OS-permission-request seam (triggered after first successful checkout, once), whose
   decline path never crashes or blocks other flows.
5. Correct `packages/types/src/notifications.ts` to the real shape (add `targetScreen`/`userId`, widen
   `type` to the 9 enumerated kinds).

## Scope

**In scope:** `packages/types/src/notifications.ts` (rewrite), new
`apps/mobile/src/features/notifications/*` (mock data, pure logic lib, hook seam, permission seam),
`apps/mobile/src/app/(tabs)/account/notifications.tsx` (real screen), a one-line first-order trigger
call in `apps/mobile/src/app/(tabs)/order/checkout.tsx`, two new `@jojopotato/ui` components (`Toggle`,
`NotificationRow`), and their unit/component tests.

**Out of scope (restated from SPEC "Out Of Scope"):** all real push delivery (Expo token
registration/storage, provider wiring, real sends — #75); server `notifications` table writes;
backend marketing-opt-in enforcement; token rotation/dedup; a live scheduler for coupon-expiring /
one-more-order events; any change to STAFF-003 order-state-machine or the real PATCH endpoint;
building the Coupon Wallet screen itself; a tab-bar bell/badge; introducing an RN component/E2E runner.
**No `packages/api` / DB / migration changes of any kind.**

## LOCKED Decisions (from SPEC Open Questions — do not re-litigate)

1. **Screen placement** — reuse the existing `account/notifications.tsx` route (already linked from
   `account/index.tsx`). No new nav surface.
2. **Toggle location** — inline at the top of the Notifications screen, not a separate settings screen.
3. **`notifications.ts` correction is in scope** — widen the shared type (mobile-only package edit).
4. **Transactional = locked-on** — no switch rendered for transactional; only marketing gets a `Toggle`.
5. **Permission trigger** — fire once, right after the customer's first successful checkout (order
   placement), not on first app launch; never re-shown once answered.

## Assumptions (reasonable calls made per "go, don't ask until execute" — user may override at VALIDATE)

- **A1 — 9 type values, not 8.** SPEC AC#12 says "8 documented kinds" but concretely enumerates 4
  transactional + 5 marketing = **9** distinct `type` values. The "minus overlaps" phrasing refers to
  **target-screen** overlaps (`one_more_order` + `reward_unlocked` both → `rewards`;
  `new_deal` + `branch_promo` both → `deal_details`), giving **4 target screens**. This plan implements
  all 9 `type` values mapping onto 4 `targetScreen` values. The AC#12 exhaustiveness test iterates all
  9 types.
- **A2 — Permission seam is a local STUB; no new dependency.** `expo-notifications` is NOT currently a
  dependency (confirmed via `apps/mobile/package.json`). To honor the "no new runtime surface / mock-
  first" boundary, `requestNotificationPermission()` is a local seam that returns a mock result and
  persists an "already asked" flag in local state — it does NOT add `expo-notifications` and does NOT
  register a token. A `TODO(#75)` comment marks where the real `expo-notifications` permission call
  goes. Consequence: no real OS dialog appears from the stub; AC#9/#10 Agent-Probe walkthroughs verify
  the *seam's* decline/timing behavior via a `__DEV__` trigger, not a live OS prompt. If the user wants
  a real OS dialog this round, that is a one-line `expo-notifications` add + seam-body swap — recorded
  as Known Gap, not done by default.
- **A3 — Marketing "history" rule (AC#4).** Turning the toggle OFF stops NEW marketing items being
  added; items already in the list REMAIN as history (never retroactively removed). `buildMarketing…`
  returns `[]` when opt-in is off; the hook never deletes existing items.
- **A4 — Coupon Wallet target may 404.** `coupon_expiring` targets a Coupon Wallet route that may not
  exist yet (SPEC out-of-scope). Link points at `/(tabs)/rewards/coupons`; if that route is absent the
  tap is a no-op/404 — accepted gap, not solved here (Known Gap).
- **A5 — All logic is pure + node-testable.** `use-notifications.ts` is a thin React wrapper; every
  testable rule (sort, opt-in filter, transition→notification, threshold/window boundaries,
  idempotency, type→target map, exhaustiveness) lives in `lib/notification-factory.ts` as pure
  functions the vitest suite calls directly (node env cannot render React hooks).

## Touchpoints

| # | File | Action |
|---|---|---|
| 1 | `packages/types/src/notifications.ts` | **Rewrite** — 9-value `type` union split into `OrderNotificationType` + `MarketingNotificationType`; add `userId`, `targetScreen`, optional `targetParams`; add `NotificationTargetScreen` union + runtime `ORDER_NOTIFICATION_TYPES` / `MARKETING_NOTIFICATION_TYPES` arrays |
| 2 | `apps/mobile/src/features/notifications/lib/notification-factory.ts` | **New** — pure logic: builders, opt-in filter, boundary evaluators, dedupe/idempotency, `targetForType`, `resolveRoute`, `sortNewestFirst` |
| 3 | `apps/mobile/src/features/notifications/mock-notifications.ts` | **New** — `PLACEHOLDER / MOCK DATA` banner; seed `AppNotification[]` covering all 9 types + mock trigger inputs (order transitions, coupon w/ `expiresAt`, stars, reward-unlock event, promo) |
| 4 | `apps/mobile/src/features/notifications/hooks/use-notifications.ts` | **New** — `useNotifications()` seam (local state): `{ notifications, unreadCount, markRead, marketingOptIn, setMarketingOptIn }`; thin wrapper over `lib` pure fns |
| 5 | `apps/mobile/src/features/notifications/lib/notification-permission.ts` | **New** — `requestNotificationPermission()` local STUB seam (A2) + "already asked" flag; `TODO(#75)` for real `expo-notifications` swap |
| 6 | `apps/mobile/src/app/(tabs)/account/notifications.tsx` | **Rewrite** — real screen: inline `Toggle` header + `NotificationRow` list + `EmptyState`; tap → `markRead` + `router.push(resolveRoute(n))` |
| 7 | `apps/mobile/src/app/(tabs)/order/checkout.tsx` | **Edit** — after `placeOrder` success (≈ line 92–105, before/after `router.replace`), call the first-order permission trigger (fire-once) |
| 8 | `packages/ui/src/components/toggle.tsx` | **New** — `Toggle` primitive (wraps RN `Switch`, theme-token driven, optional `label`) |
| 9 | `packages/ui/src/components/notification-row.tsx` | **New** — `NotificationRow` (title/body/timeLabel/unread-dot/iconName/onPress/mode) |
| 10 | `packages/ui/src/index.ts` | **Edit** — export `./components/toggle` and `./components/notification-row` |
| 11 | `apps/mobile/src/features/notifications/lib/notification-factory.test.ts` | **New** — vitest suite (ACs 1/2-map/3-filter/4/5/6/7/8/12) |
| 12 | `packages/ui/src/components/__tests__/toggle.test.tsx` | **New** — jest-expo render (on/off) |
| 13 | `packages/ui/src/components/__tests__/notification-row.test.tsx` | **New** — jest-expo render (read/unread), AC#11 |

## Public Contracts

- **`AppNotification` (packages/types)** — BREAKING rewrite of a placeholder type. Current shape
  (`type: 'order_update'|'promo'|'system'`, `id/title/body/createdAt/readAt`) has **no current
  consumers** (the screen is a `<ComingSoon>` stub; grep-confirm zero importers of `AppNotification` /
  `NotificationType` at EXECUTE before rewriting — if any exist, reconcile them). New shape:
  ```ts
  export type OrderNotificationType =
    | 'order_accepted' | 'order_preparing' | 'order_ready' | 'order_cancelled';
  export type MarketingNotificationType =
    | 'new_deal' | 'coupon_expiring' | 'one_more_order' | 'reward_unlocked' | 'branch_promo';
  export type NotificationType = OrderNotificationType | MarketingNotificationType;
  export type NotificationTargetScreen =
    | 'order_tracking' | 'deal_details' | 'coupon_wallet' | 'rewards';
  export interface AppNotification {
    id: string;
    userId: string;                         // mirrors real DB notifications.user_id
    type: NotificationType;
    title: string;
    body: string;
    targetScreen: NotificationTargetScreen;
    targetParams?: Record<string, string>;  // e.g. { orderId } | { dealId }
    createdAt: string;                       // ISO
    readAt?: string;                         // ISO; absent = unread
  }
  export const ORDER_NOTIFICATION_TYPES: readonly OrderNotificationType[];
  export const MARKETING_NOTIFICATION_TYPES: readonly MarketingNotificationType[];
  ```
- **`useNotifications()` seam** — the swap boundary for #75; screens depend only on this, never on
  mock data directly.
- **New pure fns** (no existing callers): `buildOrderNotification`, `buildMarketingNotifications`,
  `filterMarketingByOptIn`, `shouldNotifyCouponExpiring`, `shouldNotifyOneMoreOrder`,
  `mergeNotification` (idempotent dedupe by id), `targetForType`, `resolveRoute`, `sortNewestFirst`.
- **`Toggle` / `NotificationRow`** — new additive `@jojopotato/ui` exports; no change to existing
  component APIs.
- **No** `packages/api` schema/route/migration change; **no** change to `OrderStatus`,
  order-state-machine, `useCheckout`, or `useCart` signatures.

## Blast Radius

- **Packages touched:** `packages/types` (1 file rewrite, no live consumers — low risk),
  `packages/ui` (2 new components + 1 barrel edit — additive), `apps/mobile` (new
  `features/notifications/` tree + 1 screen rewrite + 1 one-line checkout edit).
- **Read-only reuse:** `@jojopotato/ui` (`EmptyState`, `Badge`, `Card`, theme tokens),
  `@jojopotato/types` (`Coupon`, `OrderStatus`, `Deal`), `mock-deals.ts` (new_deal/branch_promo source).
- **Risk class:** NONE of the high-risk classes (auth / billing / schema-migration / public-API /
  deploy / secrets / trust-boundary) apply — client-only mock UI + pure logic; no server files.
- **File count:** ~13 touchpoints, 3 packages. Multi-package (S1) + 5+ files (S7) → signal score 2/7
  (MEDIUM); no schema/API/auth/high-risk → stays a single COMPLEX plan, **not** a phase program.

## Implementation Checklist

Execute in order A → B → C → D → E → F → G (D depends on A/B; E depends on A/B/C; F depends on
A/B/C/D/E; G depends on B). Run the per-section test gate before moving on.

### A. Shared type (packages/types)

1. Grep-confirm zero live importers of `AppNotification` / `NotificationType` outside the file itself
   (`Grep "AppNotification|NotificationType" packages apps`). If any exist, list them and reconcile in
   the rewrite; if none (expected), proceed.
2. Rewrite `packages/types/src/notifications.ts` to the Public Contracts shape above: the two type
   unions + combined `NotificationType`, `NotificationTargetScreen`, the `AppNotification` interface
   (with `userId`/`targetScreen`/`targetParams`), and the two runtime `readonly` arrays
   (`ORDER_NOTIFICATION_TYPES`, `MARKETING_NOTIFICATION_TYPES`) — used by the opt-in filter and the
   AC#12 exhaustiveness test. Ensure the file is exported from `packages/types/src/index.ts` (confirm
   the barrel already re-exports `./notifications`; add if missing).

### B. Pure logic lib (apps/mobile)

3. Create `apps/mobile/src/features/notifications/lib/notification-factory.ts` (zero RN imports — pure
   TS so vitest node env can import it). Implement:
   - `TYPE_TARGET: Record<NotificationType, NotificationTargetScreen>` and
     `targetForType(type): NotificationTargetScreen` — mapping: the 4 order types → `order_tracking`;
     `new_deal`/`branch_promo` → `deal_details`; `coupon_expiring` → `coupon_wallet`;
     `reward_unlocked`/`one_more_order` → `rewards`. (Exhaustive `Record` gives compile-time coverage
     of all 9 types — the AC#12 guard.)
   - `resolveRoute(n: AppNotification): { pathname: string; params?: Record<string,string> }` — maps
     `targetScreen` → Expo Router pathname: `order_tracking` → `/(tabs)/order/tracking/[orderId]`
     (`params:{orderId}`); `deal_details` → `/(tabs)/deals/deal/[dealId]` (`params:{dealId}`);
     `coupon_wallet` → `/(tabs)/rewards/coupons` (may 404 — A4); `rewards` → `/(tabs)/rewards`.
   - `sortNewestFirst(items): AppNotification[]` — descending by `createdAt`.
   - `buildOrderNotification(orderId, status: OrderStatus): AppNotification | null` — returns an item
     with a **deterministic id** `` `order:${orderId}:${status}` `` for exactly the 4 notifiable
     statuses (`accepted`→`order_accepted`, `preparing`→`order_preparing`, `ready`→`order_ready`,
     `cancelled`→`order_cancelled`); returns `null` for any other status (`pending`/`flavoring`/
     `completed`/`rejected`). Title/body copy per PRD §6.12/§14 wording. `userId: 'mock-user'`.
   - `filterMarketingByOptIn(items, optIn: boolean)` — returns `[]` of marketing items when `optIn`
     is false; passes transactional through untouched (used to gate NEW marketing only — A3).
   - `shouldNotifyOneMoreOrder(stars: number, required: number): boolean` — `stars === required - 1`.
   - `shouldNotifyCouponExpiring(coupon: Coupon, now: number, leadWindowMs: number): boolean` —
     `true` only when `expiresAt` is set AND `now >= (expiresAt - leadWindowMs)` AND `now < expiresAt`.
   - `buildMarketingNotifications(inputs, optIn): AppNotification[]` — evaluates the 5 marketing
     triggers against mock `inputs` (new deals, coupons, stars/required, reward-unlock events, promos),
     each with a deterministic id (e.g. `` `deal:${dealId}` ``, `` `coupon:${couponId}` ``,
     `` `stars:${required}` ``, `` `reward:${eventId}` ``, `` `promo:${promoId}` ``); returns `[]`
     when `optIn` is false.
   - `mergeNotification(existing: AppNotification[], incoming: AppNotification): AppNotification[]` —
     idempotent append: if an item with `incoming.id` already exists, return `existing` unchanged
     (proves AC#5 no-dupes-per-transition and AC#8 fire-once-per-unlock).

### C. Mock data (apps/mobile)

4. Create `apps/mobile/src/features/notifications/mock-notifications.ts` with a `PLACEHOLDER / MOCK
   DATA` banner (match `mock-deals.ts` convention). Export:
   - `MOCK_NOTIFICATIONS: AppNotification[]` — ≥1 item per of the 9 types (mix of read/unread,
     varied `createdAt` so newest-first is observable), each with correct `targetScreen`/`targetParams`
     (author via `targetForType` so it can't drift). Include ≥1 unread and ≥1 read.
   - Mock trigger inputs for the marketing evaluators: a `MOCK_COUPON: Coupon` with `expiresAt` inside
     the lead window (and note a comment for out-of-window boundary), a `MOCK_STARS`/`MOCK_STARS_REQUIRED`
     pair set to the `N-1` boundary, a `MOCK_REWARD_UNLOCK_EVENT`, a `MOCK_BRANCH_PROMO`, and reuse a
     `MOCK_DEALS[0]` id for `new_deal`. Keep these minimal — they exist to feed the factory/tests.
   - A `MOCK_ORDER_TRANSITIONS: { orderId: string; status: OrderStatus }[]` covering
     accepted/preparing/ready/cancelled for the transition→notification mapping.

### D. Hook seam (apps/mobile)

5. Create `apps/mobile/src/features/notifications/hooks/use-notifications.ts`: `useNotifications()`
   returning `{ notifications, unreadCount, markRead, marketingOptIn, setMarketingOptIn }`. Backed by
   `useState` seeded from `MOCK_NOTIFICATIONS` (sorted via `sortNewestFirst`) and a `marketingOptIn`
   `useState` (default documented — **default ON**, so a fresh session shows marketing items; note the
   default in a comment). `markRead(id)` sets `readAt`; `unreadCount` derives from `readAt == null`.
   `setMarketingOptIn(false)` does NOT remove existing items (A3) — it only affects future
   `buildMarketingNotifications` calls. Keep it a thin wrapper — all rules delegate to `lib`. Expose
   it via a `NotificationsProvider` only if screen sharing is needed; otherwise a plain hook is fine
   (single consumer — the Notifications screen). Reasonable call: plain hook, no provider (YAGNI).
6. Create `apps/mobile/src/features/notifications/lib/notification-permission.ts`:
   `requestNotificationPermission(): Promise<'granted'|'denied'|'undetermined'>` — local STUB (A2):
   guard on a module-level/`AsyncStorage`-free in-memory "already asked" flag so it fires at most once;
   return a mock `'granted'` by default (with a `__DEV__`-only way to simulate `'denied'` for the
   Agent-Probe decline walkthrough). No `expo-notifications` import; `TODO(#75)` comment marks the real
   swap. Never throws — decline/undetermined are normal returns.

### E. UI components (packages/ui)

7. Create `packages/ui/src/components/toggle.tsx`: `Toggle` — props `{ value: boolean; onValueChange:
   (v:boolean)=>void; label?: string; disabled?: boolean; mode?: ThemeMode }`. Wrap RN `Switch` with
   theme tokens (`Colors[mode]`, `Spacing`, `FontFamily`); render `label` (if set) beside the switch in
   a row. `accessibilityRole="switch"`. Match the existing component style (see `size-selector.tsx` /
   `flavor-selector.tsx` for the theme-prop pattern; no app theme-hook dependency).
8. Create `packages/ui/src/components/notification-row.tsx`: `NotificationRow` — props `{ title:
   string; body: string; timeLabel: string; unread: boolean; iconName: keyof typeof
   Ionicons.glyphMap; onPress: ()=>void; mode?: ThemeMode }`. `Pressable` row: leading Ionicon in a
   themed circle (reuse EmptyState's icon-circle style idea), title (bold) + body (secondary) + right-
   aligned `timeLabel`; render a small unread dot (theme `accent`) when `unread`.
   `accessibilityRole="button"`.
9. Add both to `packages/ui/src/index.ts` (`export * from './components/toggle';` and
   `export * from './components/notification-row';`).

### F. Notifications screen (apps/mobile)

10. Rewrite `apps/mobile/src/app/(tabs)/account/notifications.tsx`: consume `useNotifications()`.
    Header block = inline `Toggle` (label "Marketing notifications", `value={marketingOptIn}`,
    `onValueChange={setMarketingOptIn}`) + a short static line stating order updates are always on (no
    switch for transactional — Decision #4). Below, render a `ScrollView`/`FlatList` of `NotificationRow`
    from `notifications` (already newest-first), `iconName` derived from `type` (a small local
    `type→Ionicons` map: order→`receipt-outline`, new_deal/branch_promo→`pricetag-outline`,
    coupon_expiring→`ticket-outline`, reward_unlocked/one_more_order→`star-outline`; pick valid
    `Ionicons.glyphMap` keys), `timeLabel` = a relative-time helper (reasonable call: a tiny local
    `formatRelativeTime(createdAt)` — or reuse an existing util if one exists; grep first). `onPress`
    → `markRead(n.id)` then `const r = resolveRoute(n); router.push(r.params ? { pathname: r.pathname,
    params: r.params } : r.pathname)`. When `notifications.length === 0`, render `EmptyState`
    (`iconName:'notifications-outline'`, `title:'No notifications yet'`, description). Respect the
    floating-tab-bar clearance convention used by other nested screens (decide empirically — it's a
    headered nested screen; note the decision in the phase report).

### G. First-order permission trigger (apps/mobile)

11. In `apps/mobile/src/app/(tabs)/order/checkout.tsx`, after `placeOrder(...)` resolves to a non-null
    `order` (the success branch around lines 92–105) and before/after the existing `router.replace` to
    the confirmation screen, call `void requestNotificationPermission()` (fire-and-forget; the seam's
    own once-guard ensures it only prompts on the first successful order and never re-prompts). Do NOT
    block navigation on it, do NOT await in a way that delays the confirmation redirect, and do NOT add
    any new import beyond the permission seam. One line + one import — no other checkout logic changes.

## Acceptance Criteria

Carried verbatim from the SPEC's 12 testable outcomes; each names its proving scenario + strategy
(REQ-TEST-LINK — the matching gate row lives in Verification Evidence below).

1. Notifications list renders newest-first with title/body/relative-time/read-state. proven by:
   `notification-factory.test.ts` sort+shape (vitest). strategy: Fully-Automated.
2. Tapping an item marks read + navigates to its `targetScreen`. proven by: `targetForType`/`resolveRoute`
   routing-map (vitest) + device tap walkthrough. strategy: Hybrid.
3. Marketing toggle exists, documented default, persists in-session. proven by: default-const +
   `filterMarketingByOptIn` (vitest); in-session persistence (Agent-Probe). strategy: Fully-Automated.
4. Toggle OFF → no NEW marketing added; transactional added regardless. proven by:
   `buildMarketingNotifications`/`buildOrderNotification` opt-in tests (vitest). strategy: Fully-Automated.
5. Each of the 4 order transitions → exactly one item, no dupes. proven by: transition-map +
   `mergeNotification` idempotency (vitest). strategy: Fully-Automated.
6. "One more order" fires only at `required-1` stars. proven by: threshold boundary test (vitest). strategy: Fully-Automated.
7. "Coupon expiring" fires only within the lead window. proven by: lead-window boundary test (vitest). strategy: Fully-Automated.
8. "Reward unlocked" fires once per event. proven by: idempotency test (vitest). strategy: Fully-Automated.
9. Declining permission doesn't crash/block other flows. proven by: device decline walkthrough (stub seam). strategy: Agent-Probe.
10. Permission prompt fires after first order, once. proven by: device timing/fire-once walkthrough. strategy: Agent-Probe.
11. Zero-notification user sees an empty state. proven by: `packages/ui` jest-expo row render +
    `apps/mobile` vitest zero-items branch. strategy: Fully-Automated.
12. Every item carries explicit `type` + `targetScreen`; no unmapped target. proven by: exhaustiveness
    test over both type-union arrays (vitest). strategy: Fully-Automated.

## Verification Evidence

`apps/mobile` has a **vitest** runner (node env, `src/**/*.test.ts` — `apps/mobile/vitest.config.ts`)
and `packages/ui` has **jest-expo** (`packages/ui/jest.config.js`, `src/components/__tests__/*.test.tsx`).
Both are real, so the SPEC's Fully-Automated ACs are genuinely automatable this round. Screen render,
live navigation-on-tap, and OS permission-dialog interaction remain Agent-Probe (project-wide RN-runner
gap, `tests/all-tests.md`).

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/mobile exec vitest run` — `notification-factory.test.ts`: `sortNewestFirst` orders a shuffled list descending by `createdAt`; item shape has title/body/createdAt/read-state | Fully-Automated | AC#1 (newest-first list + shape) |
| `notification-factory.test.ts`: `targetForType` / `resolveRoute` returns the correct screen+params for every one of the 9 `type` values | Fully-Automated | AC#2 (type→target_screen routing-map) — tap-navigation itself is Agent-Probe below |
| Agent-Probe: on device, tap items of each target class → marks read + lands on order tracking / deal details / coupon wallet / rewards | Agent-Probe | AC#2 (actual tap→navigate; Hybrid overall) |
| `notification-factory.test.ts`: default `marketingOptIn` constant is documented value; `filterMarketingByOptIn` returns `[]` when off, full set when on | Fully-Automated | AC#3 (toggle default + value drives filtering) |
| Agent-Probe: toggle off → navigate away and back → state persists in-session | Agent-Probe | AC#3 (in-session persistence) |
| `notification-factory.test.ts`: `buildMarketingNotifications(inputs,false) === []`; `(inputs,true)` returns eligible marketing; `buildOrderNotification` unaffected by opt-in in both cases | Fully-Automated | AC#4 (marketing gated by opt-in; transactional never gated) |
| `notification-factory.test.ts`: mapping accepted/preparing/ready/cancelled each yields exactly one item; non-notifiable statuses yield `null`; `mergeNotification` twice with same transition → one item | Fully-Automated | AC#5 (one item per transition, no dupes) |
| `notification-factory.test.ts`: `shouldNotifyOneMoreOrder` true only at `required-1` (false at N-2, N, N+1) | Fully-Automated | AC#6 (one-more-order boundary) |
| `notification-factory.test.ts`: `shouldNotifyCouponExpiring` true only inside the lead window (false before window opens, false at/after expiry) | Fully-Automated | AC#7 (coupon-expiring lead window) |
| `notification-factory.test.ts`: same reward-unlock event through `mergeNotification` twice → one item (idempotent) | Fully-Automated | AC#8 (reward-unlocked fires once) |
| Agent-Probe: decline the (stub) permission prompt → checkout/tracking/browsing all continue; no crash | Agent-Probe | AC#9 (decline doesn't crash/block) |
| Agent-Probe: place first order → permission seam fires once; second order → not re-shown; not shown on cold launch | Agent-Probe | AC#10 (first-order timing, fire-once) |
| `packages/ui` jest-expo `notification-row.test.tsx` renders read vs unread; `apps/mobile` vitest zero-items branch → `unreadCount===0`, empty list | Fully-Automated | AC#11 (empty state) |
| `notification-factory.test.ts`: iterate `[...ORDER_NOTIFICATION_TYPES, ...MARKETING_NOTIFICATION_TYPES]` — every type resolves a non-null `targetScreen` (exhaustive) | Fully-Automated | AC#12 (every item has explicit type+targetScreen; no unmapped) |
| `packages/ui` jest-expo `toggle.test.tsx` renders on/off, fires `onValueChange` | Fully-Automated | Constraint (shared `@jojopotato/ui` Toggle component) |
| `pnpm --filter @jojopotato/mobile exec tsc --noEmit` (after one `expo start`/Ctrl-C for typed-routes codegen) + `pnpm --filter @jojopotato/ui exec tsc --noEmit` + `pnpm --filter @jojopotato/types exec tsc --noEmit` | Fully-Automated | Type rewrite compiles across all 3 packages; new routes resolve; no consumer breakage |
| `pnpm --filter @jojopotato/mobile exec eslint src` + `pnpm --filter @jojopotato/ui exec eslint src` | Fully-Automated | Lint/style/import conventions |
| Code review: `account/notifications.tsx` builds on the existing route (Constraint: no new nav entry) | Agent-Probe | SPEC Constraint (structural) |

**What this coverage does NOT prove:** the Fully-Automated vitest/jest-expo gates prove the pure
logic + component render in isolation — they do NOT prove the assembled screen renders correctly, that
tap actually navigates, that the toggle visibly changes the list on device, or that the permission
seam interacts with a real OS dialog (the seam is a stub — A2). Those are the Agent-Probe rows and are
not regression-safe without a human re-walk. Nothing here proves any backend/DB behavior (none in scope).

## Test Infra Improvement Notes

- The permission seam (A2) is a stub, so AC#9/#10 have no automated proof and no real OS dialog. If
  `expo-notifications` is later added (#75), an automated permission-flow test becomes possible on a
  simulator harness — currently a known gap.
- No RN component/E2E runner exists for `apps/mobile` screens (project-wide gap, `tests/all-tests.md`);
  screen assembly + navigation-on-tap stay Agent-Probe. Extracting `resolveRoute`/`formatRelativeTime`
  as pure fns (done in this plan) is the cheapest available mitigation — it moves as much as possible
  into node-testable vitest surface.

## Phase Completion Rules

- **CODE DONE** — sections A–G implemented; all three `tsc --noEmit`, both eslint, the `apps/mobile`
  vitest suite, and the `packages/ui` jest-expo tests pass. Does not imply Agent-Probe walkthroughs ran.
- **VERIFIED** — CODE DONE plus every Agent-Probe row walked through on a simulator/device and passed,
  and the Known Gaps table reviewed/accepted.
- Single-session build — the whole checklist reaches CODE DONE / VERIFIED together, not phase-by-phase.

## Known Gaps / Follow-ups

| Gap | Why deferred | Suggested resolution |
|---|---|---|
| Real push delivery (token registration/storage, provider, real sends) | #75 (PUSH-004) owns it entirely | Wire `useNotifications()` data source + `notification-permission.ts` body to the real backend/`expo-notifications` in #75 |
| Permission seam is a local stub (no OS dialog) | Avoids a new `expo-notifications` dependency; keeps the pass mock-only (A2) | Add `expo-notifications`, swap the seam body to `requestPermissionsAsync()` (permission only) — one-line follow-up if the user wants a real dialog now |
| Coupon Wallet target (`/(tabs)/rewards/coupons`) may 404 | Coupon Wallet screen is explicitly out of scope (A4) | Build Coupon Wallet (CPN-001) in a future plan; the link is already correctly shaped |
| Server `notifications` table not written; opt-in not enforced server-side | Backend is #75's scope | #75 wires real writes + server-side opt-in enforcement |
| No live scheduler for coupon-expiring / one-more-order events | Backend/scheduler concern | This pass defines trigger *conditions* only; #75+ owns a real scheduler |
| No automated proof of screen assembly / tap-navigation | No RN component/E2E runner (project-wide) | Add an RN test runner (Detox/RTL-native) in a dedicated infra plan |

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/rewards-notifications/active/push-notifications-ui_14-07-26/push-notifications-ui_PLAN_14-07-26.md`
2. **Last completed phase/step:** PLAN (this file). Not yet validated, not yet executed.
3. **Validate-contract status:** pending — `## Validate Contract` is a placeholder below; run VALIDATE
   before EXECUTE.
4. **Supporting context files loaded during PLAN:** `process/context/all-context.md`; SPEC
   (`push-notifications-ui_SPEC_14-07-26.md`); precedent plan `deals-screens_13-07-26/deals-screens_PLAN_13-07-26.md`;
   `packages/types/src/{notifications,order,coupons,rewards}.ts`; `packages/ui/src/index.ts`;
   `packages/ui/src/components/empty-state.tsx`; `apps/mobile/src/app/(tabs)/account/{notifications,index}.tsx`;
   `apps/mobile/src/features/deals/{mock-deals.ts,hooks/use-deals.ts}`;
   `apps/mobile/src/features/orders/hooks/use-checkout.ts`; `apps/mobile/src/app/(tabs)/order/checkout.tsx`;
   `apps/mobile/vitest.config.ts`; `packages/ui/jest.config.js` + `__tests__/` listing.
5. **Next step for a fresh agent:** run EXECUTE section-by-section A → B → C → D → E → F → G. Start A
   with the grep for live `AppNotification`/`NotificationType` consumers (step 1). Run each section's
   test gate before advancing (vitest for B/C/D logic, jest-expo for E, tsc/eslint at the end).

## Validate Contract

Status: PASS
Date: 14-07-26
date: 2026-07-14
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 2/7 (S1 multi-package + S7 5+ files) = MEDIUM; single self-contained plan, no high-risk class, no cross-agent dependency during investigation — sequential single-agent validation, no fan-out escalation.

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC#1 | Notifications list renders newest-first; item shape has title/body/createdAt/read-state | Fully-Automated | `notification-factory.test.ts`: `sortNewestFirst` shuffled→descending by `createdAt`; shape assertion | A |
| AC#2 (map) | type→targetScreen routing map resolves correct screen+params for all 9 types | Fully-Automated | `notification-factory.test.ts`: `targetForType`/`resolveRoute` per type | A |
| AC#2 (tap) | actual tap marks read + navigates on device | Agent-Probe | device walkthrough: tap each target class → correct screen | C (RN-runner gap → #75/RN-harness) |
| AC#3 | marketing toggle default documented + drives filtering | Fully-Automated | `notification-factory.test.ts`: default-const + `filterMarketingByOptIn` on/off | A |
| AC#4 | marketing gated by opt-in; transactional never gated | Fully-Automated | `notification-factory.test.ts`: `buildMarketingNotifications(false)===[]`; order-notif unaffected | A |
| AC#5 | 4 order transitions → exactly one item each; no dupes | Fully-Automated | `notification-factory.test.ts`: transition map + `mergeNotification` twice→one | A |
| AC#6 | "one more order" fires only at `required-1` | Fully-Automated | `notification-factory.test.ts`: boundary N-2/N-1/N/N+1 | A |
| AC#7 | "coupon expiring" fires only inside lead window | Fully-Automated | `notification-factory.test.ts`: before-window / in-window / at-or-after-expiry | A |
| AC#8 | "reward unlocked" fires once per event | Fully-Automated | `notification-factory.test.ts`: same event via `mergeNotification` twice→one | A |
| AC#9 | declining permission doesn't crash/block | Agent-Probe | device walkthrough: decline stub → checkout/tracking/browse continue | C (permission stub; real OS dialog → #75) |
| AC#10 | permission fires after first order, once | Agent-Probe | device walkthrough: first order fires once; second order + cold launch → not re-shown | C (partly liftable — see E4; real OS timing → #75) |
| AC#11 | zero-notification user sees empty state | Fully-Automated | `packages/ui` jest-expo `notification-row.test.tsx` read/unread render + `apps/mobile` vitest zero-items branch | A |
| AC#12 | every item carries explicit type+targetScreen; no unmapped | Fully-Automated | `notification-factory.test.ts`: iterate both type-union arrays → non-null targetScreen | A |
| Constraint (Toggle) | shared `@jojopotato/ui` Toggle renders on/off + fires onValueChange | Fully-Automated | `packages/ui` jest-expo `toggle.test.tsx` | A |
| Constraint (compile) | type rewrite compiles across 3 packages; new routes resolve; no consumer breakage | Fully-Automated | `tsc --noEmit` in mobile (after one `expo start`/Ctrl-C) + ui + types | A |
| Constraint (lint) | style/import conventions | Fully-Automated | `eslint src` in mobile + ui | A |
| Constraint (nav) | screen builds on existing route, no new nav entry | Agent-Probe | code review of `account/notifications.tsx` | A |

gap-resolution legend: A — proven now (gate passes this cycle) · B — fixed in this plan (gate added by this plan's checklist) · C — deferred to a named later phase/plan · D — backlog test-building stub.

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy here — the deferred rows (AC#2-tap, AC#9, AC#10) are proven by Agent-Probe (a real strategy) with gap-resolution C, not by Known-Gap.

Legacy line form (retained for existing consumers):
- notification-factory pure logic (AC#1/2-map/3/4/5/6/7/8/11-branch/12): Fully-automated: `pnpm --filter @jojopotato/mobile exec vitest run`
- @jojopotato/ui components (Toggle, NotificationRow, AC#11 render): Fully-automated: `pnpm --filter @jojopotato/ui exec jest`
- compile across packages: Fully-automated: `pnpm --filter @jojopotato/mobile exec tsc --noEmit` + `pnpm --filter @jojopotato/ui exec tsc --noEmit` + `pnpm --filter @jojopotato/types exec tsc --noEmit`
- lint: Fully-automated: `pnpm --filter @jojopotato/mobile exec eslint src` + `pnpm --filter @jojopotato/ui exec eslint src`
- tap-navigate / toggle-visible-change / permission decline+timing (AC#2-tap/#9/#10): agent-probe: on-device walkthrough (RN-runner gap; permission stub has no OS dialog)
- screen-assembly render + no-new-nav constraint: agent-probe: on-device + code review

Failing stubs (Fully-Automated rows — TDD red-first for execute-agent):
```
test("should order a shuffled notification list newest-first by createdAt", () => { throw new Error("NOT IMPLEMENTED — TDD stub: sortNewestFirst descending by createdAt") })
test("should resolve a non-null targetScreen+params for every one of the 9 notification types", () => { throw new Error("NOT IMPLEMENTED — TDD stub: targetForType/resolveRoute over all 9 types") })
test("should return the documented default for marketingOptIn and filter marketing when off", () => { throw new Error("NOT IMPLEMENTED — TDD stub: default-const + filterMarketingByOptIn on/off") })
test("should build no NEW marketing when opt-in is off but always build transactional", () => { throw new Error("NOT IMPLEMENTED — TDD stub: buildMarketingNotifications(false)===[] and buildOrderNotification unaffected") })
test("should produce exactly one item per order transition with no duplicates", () => { throw new Error("NOT IMPLEMENTED — TDD stub: transition map + mergeNotification idempotency") })
test("should fire one-more-order only at required-1 stars", () => { throw new Error("NOT IMPLEMENTED — TDD stub: shouldNotifyOneMoreOrder boundary N-2/N-1/N/N+1") })
test("should fire coupon-expiring only inside the lead window", () => { throw new Error("NOT IMPLEMENTED — TDD stub: shouldNotifyCouponExpiring before/in/after window") })
test("should fire reward-unlocked once per event (idempotent)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: same event via mergeNotification twice → one") })
test("should report unreadCount 0 and empty list for a zero-notification user", () => { throw new Error("NOT IMPLEMENTED — TDD stub: zero-items branch empty state") })
test("should map every type in both union arrays to a non-null targetScreen (exhaustive)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: exhaustiveness over ORDER_ + MARKETING_ arrays") })
```
(jest-expo Toggle/NotificationRow render rows are Fully-Automated but component-render; advisory stubs only — not mandated inline per vc-test-coverage-plan.)

### Dimension findings

- Infra fit: PASS — all 3 runners real and confirmed: `apps/mobile` vitest (node env, `include: ['src/**/*.test.ts']`) matches the plan's `lib/notification-factory.test.ts` placement; `packages/ui` jest-expo (`testMatch: ['**/*.test.tsx']`) matches the `__tests__/*.test.tsx` component tests (existing `__tests__/` convention verified). No container/infra/port/runtime surface touched. `expo-notifications` deliberately NOT added (A2) — honors "no new runtime surface." Note: `apps/mobile` currently has zero test files (mock-order suite was deleted); the plan adds the first real one — the package `test` script carries `--passWithNoTests`, and the new file is picked up by the include glob.
- Test coverage: PASS — 10/12 ACs Fully-Automated (pure fns + jest-expo render), AC#2 Hybrid (routing-map automated + tap Agent-Probe), AC#9/#10 legitimately Agent-Probe (permission seam is a stub, no OS dialog — the documented project-wide RN-runner gap). Not vacuously green: every developed behavior has a Fully-Automated, Hybrid, or Agent-Probe proving strategy — none rests on Known-Gap alone. Extracting `resolveRoute`/`sortNewestFirst`/boundary evaluators as pure fns is the correct cheapest mitigation for the RN-runner gap.
- Breaking changes: PASS — `AppNotification`/`NotificationType` rewrite is BREAKING but grep-confirmed ZERO live consumers (only the definition file itself; verified this session). `packages/ui` additions are additive exports; barrel already re-exports `./notifications`. No change to `OrderStatus`, order-state-machine, `useCheckout`, or `useCart` signatures. No API/schema/migration. Step A1 grep-guard re-confirms at EXECUTE.
- Security surface: PASS — none of the 6 high-risk classes apply. Client-only mock UI + pure logic; no server files, no DB, no migration, no secrets/trust boundary. `userId: 'mock-user'` is a hardcoded mock, not real identity. No risk-evidence pack required.
- Section A (shared type) feasibility: PASS — rewrite target confirmed clean, zero consumers, barrel export present; mechanical edit, lowest-risk section.
- Section B (pure logic lib) feasibility: PASS — all fns node-testable; `buildOrderNotification` null-returns for the 4 non-notifiable statuses confirmed against the real 8-value `OrderStatus`; deterministic ids give idempotency. Execute-note: `shouldNotifyCouponExpiring` receives `coupon.expiresAt` as an ISO string but compares numerically — parse via `Date.parse()` (see E1).
- Section C (mock data) feasibility: PASS — follows the verified `mock-deals.ts` PLACEHOLDER banner convention; authoring targetScreen via `targetForType` prevents drift.
- Section D (hook + permission seam) feasibility: PASS — thin wrapper, plain hook (YAGNI); permission stub never throws, in-memory fire-once guard. Note: the once-flag is session-scoped (resets on reload) — AC#10 "not re-shown" holds within a session only; real persistence is #75 (already a documented Known Gap).
- Section E (ui components) feasibility: PASS — Toggle wraps RN Switch on the confirmed `size-selector`/`flavor-selector` theme-prop pattern; NotificationRow uses `Ionicons.glyphMap`; both additive to barrel; tests land in the established `__tests__/` convention.
- Section F (notifications screen) feasibility: PASS (Agent-Probe surface) — screen assembly + tap-navigate is the standard RN-runner Agent-Probe gap, honestly flagged; `resolveRoute` extracted as pure fn is the correct mitigation. Execute-note: grep for an existing relative-time util before adding a local `formatRelativeTime` (E3).
- Section G (checkout trigger) feasibility: PASS — the single `submitOrder` `if (order)` success branch (verified lines 103–112) is the correct fire-once insertion point; all submit paths (countdown auto-submit, `confirmNow`) funnel through it, so one insertion covers every path. One line + one import as claimed. Execute-note: locate by the `if (order)` block, not the plan's "≈ line 92–105" estimate (actual 103–112) — E2.

### Execute-agent instructions (fold into EXECUTE; no plan-checklist change required)

- E1 — In `shouldNotifyCouponExpiring`, `Date.parse(coupon.expiresAt)` to a number before the window comparison (the plan's numeric comparison assumes a number but `Coupon.expiresAt` is an ISO string). Guard the `undefined` case → return `false`.
- E2 — In checkout.tsx, insert `void requestNotificationPermission()` inside the existing `if (order) { … }` success branch (actual lines 103–112), not by the plan's approximate line numbers. All three submit paths route through `submitOrder`'s `if (order)` block, so one call site is sufficient.
- E3 — Before adding a local `formatRelativeTime`, grep `packages/utils` and `apps/mobile/src` for an existing relative-time helper; reuse if present.
- E4 — (Optional, strengthens AC#10) Extract the permission "already-asked" fire-once guard into a pure function (e.g. `shouldPromptPermission(alreadyAsked: boolean): boolean`) and add a vitest idempotency case, lifting the fire-once logic from Agent-Probe-only to a Fully-Automated gate. The real OS-timing portion of AC#10 stays Agent-Probe.
- E5 — Run the Section A step-1 grep (`AppNotification|NotificationType` across `packages`/`apps`) at EXECUTE start and confirm zero live consumers before the breaking rewrite (validated zero this session; re-confirm in case of drift).

### Open gaps

none blocking. Documented Known Gaps carried (pre-accepted by SPEC/plan disclosure + `deals-screens` precedent, NOT counted toward CONDITIONAL/BLOCKED):
- AC#2-tap / AC#9 / AC#10 on-device behavior — Agent-Probe only (project-wide RN-runner gap, `tests/all-tests.md`); named residual with written justification, not vacuous-green.
- Permission seam is a local stub; session-scoped once-flag; no real OS dialog (A2).
- Coupon Wallet target `/(tabs)/rewards/coupons` may 404 (A4) — link is correctly shaped, screen out of scope.
- Real push delivery / server writes / opt-in enforcement / scheduler — all #75 (PUSH-004).

### What this coverage does NOT prove

- The Fully-Automated vitest/jest-expo gates prove pure logic + isolated component render only. They do NOT prove: the assembled Notifications screen renders correctly; that a tap actually navigates on device; that flipping the toggle visibly changes the on-screen list; that the permission seam interacts with a real OS dialog (it is a stub — A2).
- The AC#2-tap / AC#9 / AC#10 / screen-assembly rows are Agent-Probe and are NOT regression-safe without a human re-walk on a simulator/device.
- Nothing here proves any backend/DB/push-delivery behavior — none is in scope (all #75).

Gate: PASS (no FAILs; all CONCERNs resolved as execute-agent instructions E1–E5 or carried as pre-accepted documented Known Gaps; plan is mechanically complete and executable without structural change).
Accepted by: session (validate-agent synthesis) — no unresolved CONCERNs requiring user acceptance; the Agent-Probe residual is the pre-existing, plan-disclosed, precedent-accepted project-wide RN-runner gap.

## Autonomous Goal Block

```
SESSION GOAL: Push Notifications — UI-only mock/local-state pass (PUSH-001/002/003, issues #36/#37/#38)
Charter + umbrella plan: N/A — single standalone plan (not a phase program)
Autonomy: standard RIPER-5 — EXECUTE requires explicit "ENTER EXECUTE MODE"; reversible edits auto-proceed; no live-provider/irreversible actions in scope (all client-only mock UI).
Hard stop conditions / safety constraints:
- Do NOT add any packages/api / DB / migration change — this pass is mobile-only (apps/mobile + packages/types + packages/ui).
- Do NOT add the expo-notifications dependency or register a push token — permission seam stays a local stub (A2); real delivery is #75.
- Do NOT modify OrderStatus, the order-state-machine, useCheckout, or useCart signatures — checkout edit is one fire-and-forget line + one import only.
- Before the packages/types breaking rewrite, re-run the AppNotification/NotificationType consumer grep and confirm zero live importers (E5).
Next phase: EXECUTE — process/features/rewards-notifications/active/push-notifications-ui_14-07-26/push-notifications-ui_PLAN_14-07-26.md (sections A→B→C→D→E→F→G in order)
Validate contract: inline in plan (## Validate Contract — Gate: PASS)
Execute start:
- Fully-automated gates: `pnpm --filter @jojopotato/mobile exec vitest run` · `pnpm --filter @jojopotato/ui exec jest` · `pnpm --filter @jojopotato/mobile exec tsc --noEmit` (after one expo start/Ctrl-C) + `... @jojopotato/ui ...` + `... @jojopotato/types ...` · `pnpm --filter @jojopotato/mobile exec eslint src` + `... @jojopotato/ui ...`
- Agent-probe: on-device tap-navigate (AC#2), permission decline (AC#9), first-order fire-once timing (AC#10), screen-assembly render
- High-risk pack: no (no high-risk class touched)
- Execute-agent instructions: E1 (parse ISO expiresAt) · E2 (insert in if(order) block, lines 103–112) · E3 (grep for relative-time util first) · E4 (optional: extract permission once-guard as pure fn + unit test) · E5 (re-grep zero consumers before rewrite)
```
