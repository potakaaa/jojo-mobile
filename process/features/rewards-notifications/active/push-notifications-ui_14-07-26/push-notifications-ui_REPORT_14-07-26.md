---
phase: push-notifications-ui
date: 2026-07-14
status: COMPLETE_WITH_GAPS
feature: rewards-notifications
plan: process/features/rewards-notifications/active/push-notifications-ui_14-07-26/push-notifications-ui_PLAN_14-07-26.md
---

# Push Notifications UI-Only Pass — EXECUTE Report

## What Was Done

All checklist sections A–G implemented; all Fully-Automated gates green.

- **A. Shared type** — rewrote `packages/types/src/notifications.ts`: `OrderNotificationType` (4) + `MarketingNotificationType` (5) → `NotificationType` (9), `NotificationTargetScreen` (4), `AppNotification` with `userId`/`targetScreen`/`targetParams`, and runtime `ORDER_NOTIFICATION_TYPES`/`MARKETING_NOTIFICATION_TYPES` arrays. Barrel already re-exported `./notifications` — no edit needed. E5 grep re-confirmed ZERO live consumers before the breaking rewrite.
- **B. Pure logic lib** — `apps/mobile/src/features/notifications/lib/notification-factory.ts`: `TYPE_TARGET` (exhaustive Record), `targetForType`, `resolveRoute`, `sortNewestFirst`, `buildOrderNotification` (deterministic id, null for non-notifiable statuses), `filterMarketingByOptIn`, `shouldNotifyOneMoreOrder`, `shouldNotifyCouponExpiring` (E1 — `Date.parse` on ISO `expiresAt`, `undefined`-guarded), `buildMarketingNotifications`, `mergeNotification` (idempotent).
- **B. Permission seam** — `lib/notification-permission.ts`: local STUB (no `expo-notifications`, no token), session-scoped fire-once flag, `shouldPromptPermission` pure guard (E4), `__resetPermissionSeam` test helper, `TODO(#75)`.
- **C. Mock data** — `mock-notifications.ts` with PLACEHOLDER banner; 9 seed items (targetScreen via `targetForType` so it can't drift), marketing evaluator inputs, `MOCK_ORDER_TRANSITIONS`.
- **D. Hook seam** — `hooks/use-notifications.ts`: plain hook (YAGNI, single consumer), `DEFAULT_MARKETING_OPT_IN = true` (documented), `markRead`, derived `unreadCount`.
- **E. UI components** — `packages/ui` `Toggle` (wraps RN `Switch`, theme-token driven) + `NotificationRow` (icon circle, title/body/time, unread dot); both exported from barrel.
- **F. Screen** — rewrote `account/notifications.tsx`: inline marketing `Toggle` + always-on note, newest-first `NotificationRow` list, tap → `markRead` + `resolveRoute` navigation, `EmptyState` for zero items. Local `formatRelativeTime` (E3 — no shared util exists).
- **G. Checkout trigger** — one import + one `void requestNotificationPermission()` inside the `if (order)` success branch (E2), fire-and-forget, not awaited.
- **Tests** — vitest `notification-factory.test.ts` (13 tests, ACs 1/2-map/3/4/5/6/7/8/11-branch/12 + E4 fire-once); jest-expo `toggle.test.tsx` + `notification-row.test.tsx` (5 tests, AC#11 render + Toggle constraint).

## What Was Skipped or Deferred

Nothing in scope skipped. Out-of-scope (per plan) untouched: no `packages/api`/DB/migration, no `expo-notifications` dependency, no real push delivery/token/server writes, no Coupon Wallet screen, no tab-bar bell/badge.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/mobile exec vitest run` | PASS (13/13) |
| `pnpm --filter @jojopotato/ui exec jest toggle notification-row` | PASS (5/5) |
| `tsc --noEmit` — types / ui / mobile | PASS (0 errors each) |
| `eslint src` — ui / mobile | PASS (clean) |

Mobile `tsc` did not require an `expo start` codegen pass — no NEW route files were added (only an existing route rewritten); route hrefs resolved cleanly. No pre-existing BRN typecheck errors surfaced in this run.

## Plan Deviations

All within blast radius, none hard-stop:
1. `packages/ui` component tests use `await render(...)` (async) — matches the repo's established test convention (`cart-item`, `payment-method-selector`), not the plan's synchronous assumption.
2. `notification-factory.test.ts` uses `!` non-null assertions on array index access to satisfy strict `noUncheckedIndexedAccess`.
3. Notifications screen casts the resolved route to `Href` for Expo typed-routes compatibility.

## Test Infra Gaps Found

None new. Standing project-wide RN-runner gap unchanged — screen assembly + on-device tap-navigation + real OS permission dialog remain Agent-Probe only.

## Closeout Packet

- **Selected plan:** `process/features/rewards-notifications/active/push-notifications-ui_14-07-26/push-notifications-ui_PLAN_14-07-26.md`
- **Finished + verified (automated):** ACs 1, 2-map, 3, 4, 5, 6, 7, 8, 11, 12, Toggle/compile/lint constraints, plus E4 fire-once guard (lifted from Agent-Probe to automated).
- **Still unverified (Agent-Probe, human re-walk owed):** AC#2 on-device tap→navigate, AC#9 permission decline doesn't block, AC#10 first-order fire-once timing on device, screen-assembly render.
- **Cleanup remaining:** UPDATE PROCESS archival + context-doc delta (add notifications feature to `all-context.md` implementation state).
- **Closeout classification:** `Keep in active/testing` — CODE DONE (all automated gates green); VERIFIED requires the Agent-Probe walkthroughs on a simulator/device.
- **Follow-up stub paths created:** none (existing Known Gaps in the plan cover all residuals; #75/PUSH-004 owns real delivery).
- **CONTEXT_PARTIAL items:** none.

## Forward Preview

### Test Infra Found
vitest include glob is `src/**/*.test.ts` (not `__tests__`-scoped); `packages/ui` `render` is async (`await render`).

### Blast Radius Changes
`packages/types/src/notifications.ts` (breaking rewrite, 0 consumers), `packages/ui` (+2 components, barrel), `apps/mobile/src/features/notifications/*` (new tree), `account/notifications.tsx` (rewrite), `order/checkout.tsx` (1 line + 1 import).

### Commands to Stay Green
`pnpm --filter @jojopotato/mobile exec vitest run` · `pnpm --filter @jojopotato/ui exec jest` · `tsc --noEmit` (types/ui/mobile) · `eslint src` (ui/mobile).

### Dependency Changes
None — no new packages. `expo-notifications` deliberately NOT added (A2).
