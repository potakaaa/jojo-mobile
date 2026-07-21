---
phase: push-marketing-triggers
date: 2026-07-21
status: COMPLETE
feature: rewards-notifications
plan: process/features/rewards-notifications/active/push-marketing-triggers_20-07-26/push-marketing-triggers_PLAN_20-07-26.md
---

# EXECUTE REPORT — PUSH-005: Real Marketing/Retention Push Triggers (#82)

**TL;DR:** All 13 files created/modified per the plan (8 source + 5 test). Full `packages/api`
suite **566/566** (43 new tests, 0 regressions), api typecheck clean, cross-package typecheck 6/6,
api lint 0 errors, touched files Prettier-clean. Every AC0–AC12 (+ AC0b/AC5b/AC10b/AC11b and the
self-rearming continuation/resilience gates) is proven Fully-Automated — Known-Gap used for none.
One within-blast-radius deviation (branch-promo unauthenticated → 403 not 401, documented). Zero DB
migration. CODE DONE — NOT yet VERIFIED (one Agent-Probe residual: real on-device push delivery
timing, the standing project-wide no-live-push gap).

## What Was Done

**Source (8 files):**
- `packages/api/src/lib/marketing-quiet-hours.ts` (new) — pure `isWithinQuietHours(now)` (Manila
  +08:00, hour ≥ 21 || < 8) + `QUIET_START_HOUR`/`QUIET_END_HOUR`. DB-import-free (AC11 unit).
- `packages/api/src/routes/lib/notification-dispatch.ts` (modified) — added
  `dispatchMarketingNotificationIfAllowed(userId, type, payload, opts?)` with the ordered gate chain
  opt-in → quiet-hours → frequency-cap → send; `MAX_PER_24H=3`/`MAX_PER_30D=8`;
  `countRecentMarketingNotifications`; `CAP_COUNTED_TYPES` **excludes `reward_unlocked`** (E4);
  discriminated `MarketingDispatchResult`; reuses the module-private `loadPushTokens`/`sendAndPrune`
  directly (E3 — does NOT delegate to `dispatchMarketingNotification`); never throws. Existing
  `dispatchOrderNotification`/`dispatchMarketingNotification` untouched.
- `packages/api/src/lib/marketing-triggers.ts` (new) — `scanExpiringCoupons`, `scanOneMoreOrder`,
  `notifyNewDeal` (each with persisted D2 one-shot dedup), `registerSelfRearmingTrigger`
  (E1: re-arm in `finally`; E2: successor window = `now + 2×interval`; monotonic-seq unique ids so a
  static clock can't collide a successor id into the `fired` Set), `bootMarketingScheduler`.
- `packages/api/src/lib/reward-unlock-notify.ts` (modified) — kept the unconditional in-app insert;
  added exactly ONE `writeRow:false` guarded push per unlock event (E5: N rows, 1 push); removed the
  `TODO(PUSH-002/003)` marker.
- `packages/api/src/routes/admin/notifications.ts` (new) — `POST /branch-promo`; audience = DISTINCT
  recent-order (≤90d) customers of the branch ∩ `marketingOptIn=true` (D5); one-shot guarded
  dispatch; returns `{ dispatched }`.
- `packages/api/src/routes/admin/deals.ts` (modified) — fire-and-forget `notifyNewDeal(inserted.id)`
  after BOTH `res.status(201)` sites (fast + transactional create paths); response unchanged.
- `packages/api/src/routes/admin/index.ts` (modified) — appended
  `adminRouter.use('/notifications', notificationsRouter)`.
- `packages/api/src/index.ts` (modified) — `bootMarketingScheduler()` inside the existing
  `NODE_ENV !== 'test' && VITEST !== 'true'` boot guard (AC0 wiring; AC0b static assertion locks it).

**Tests (5 files, 43 tests):**
- `marketing-quiet-hours.test.ts` (8) — AC11 math, boundary-exact.
- `marketing-triggers.integration.test.ts` (11) — AC0 (register+start spy), AC0b (index.ts static
  wiring), AC0/D3 continuation + resilience (E1), AC1/AC2 (coupon-expiring), AC3/AC4 (one-more-order),
  AC6 (new-deal), AC12 (fresh-scheduler restart dedup).
- `notification-dispatch-guard.integration.test.ts` (15) — AC8 (opt-out ×4 types), AC9 (row shape
  ×4), AC10 (24h + 30d cap; order-status exempt), AC10b (reward_unlocked excluded from cap — E4),
  AC11 (quiet-hours drop; order exempt), AC11b (event drop vs poll re-attempt asymmetry).
- `admin-notifications.integration.test.ts` (6) — AC7 (audience D5 + one-shot), AC8/AC9 branch_promo,
  payload validation, role matrix.
- `reward-unlock-notify.integration.test.ts` (3) — AC5 (one push per real credit, none on retry),
  AC5b (2 rows / 1 push — E5), AC8-reward regression (opted-out gets in-app row, no push).

## What Was Skipped or Deferred

- Real on-device push delivery timing (killed/background app) — Agent-Probe only, the standing
  project-wide no-live-push gap (`sendPush` hits its log-fallback with `EXPO_ACCESS_TOKEN` unset).
  Out of scope per SPEC; not a new gap. This is the sole residual keeping the plan CODE-DONE (not
  VERIFIED).

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| API suite (regression + AC0–AC12) | `pnpm --filter @jojopotato/api test` | **566/566 pass** (43 new) |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | clean |
| Cross-package typecheck | `pnpm typecheck` | 6/6 tasks pass (mobile incl.) |
| API lint | `pnpm --filter @jojopotato/api lint` | 0 errors (1 pre-existing unrelated warning in `staff-order-lookup`) |
| Format (touched files) | `prettier --check --end-of-line auto <files>` | all clean |

Regression specifically confirmed green: `star-earning.integration.test.ts` (20/20 — reward-unlock
path now also fires a push), `push-provider*.test.ts`, `admin-deals`/`deals` tests (POST response
unchanged), `notification`/`marketing-opt-in` tests.

## Plan Deviations

1. **Branch-promo unauthenticated → 403, not 401** (within blast radius; recorded in the plan's
   `## Deviations`). The route inherits `requireAdmin` verbatim (as mandated), and that existing
   guard returns `403 Forbidden` for both wrong-role AND no-session — it has no 401 path. The plan's
   Public Contract said "401 unauthenticated"; the role-matrix test asserts the guard's real 403
   behavior rather than changing shared auth logic (out-of-scope auth-surface change avoided). No
   other AC affected.

No other deviations. E1–E6 + AC0b + the E4 exclude decision were all implemented exactly as the
validate-contract specified.

## Test Infra Gaps Found

- **CRLF format drift (pre-existing, environment-level):** `core.autocrlf=true` makes the working
  tree CRLF while Prettier's default `endOfLine` is `lf`, so repo-wide `pnpm format:check` flags every
  CRLF line. Touched files are content-clean under `--end-of-line auto`; git normalizes to LF on
  commit, so CI (LF checkout) passes. Already tracked:
  `process/general-plans/backlog/crlf-line-ending-format-check-drift_NOTE_17-07-26.md`. No new note
  filed.
- No new test-runner gap. `packages/api` vitest+supertest with hermetic self-seeding covered every
  AC as Fully-Automated (no Known-Gap used for developed behavior).

## Closeout Packet

- **Selected plan:** `process/features/rewards-notifications/active/push-marketing-triggers_20-07-26/push-marketing-triggers_PLAN_20-07-26.md`
- **Finished:** all 13 files; all automated gates green; every AC0–AC12 Fully-Automated.
- **Verified vs unverified:** automated gates fully verified/EVL-ready. Unverified: real on-device
  push delivery timing (Agent-Probe, standing gap).
- **Cleanup remaining:** commit the 13 files (recommended single logical commit on `development`);
  UPDATE PROCESS reconciliation (context delta + archival decision) — orchestrator-owned.
- **Follow-up plan stubs created:** none.
- **CONTEXT_PARTIAL items:** none.
- **Best next state:** Keep plan in `active/` (CODE DONE, not VERIFIED — Agent-Probe residual owed
  per the plan's own Phase Completion Rules). EVL confirmation run next, then UPDATE PROCESS.

## Forward Preview

**Test Infra Found:** `packages/api` vitest globalSetup recreates a pristine `_test` DB per run
(docker postgres `jojo-mobile-jojopotato-db-1` already up). Cross-module `vi.spyOn(namespace, fn)`
reliably intercepts calls from other modules here (same pattern as the existing `star-earning-config`
spy) — used for the guard/quiet-hours spies.

**Blast Radius Changes:** `packages/api` only. New exported `packages/api`-internal contracts:
`dispatchMarketingNotificationIfAllowed` (the ONLY entry point marketing triggers may use — direct
`dispatchMarketingNotification` bypasses the cap/quiet-hours), `scanExpiringCoupons`,
`scanOneMoreOrder`, `notifyNewDeal`, `bootMarketingScheduler`, `registerSelfRearmingTrigger`,
`isWithinQuietHours`. New admin endpoint `POST /api/admin/notifications/branch-promo`. No wire
contract changed; no migration; no `packages/types`/`apps/mobile` edit.

**Commands to Stay Green:** `pnpm --filter @jojopotato/api test` (needs docker postgres up),
`pnpm --filter @jojopotato/api typecheck`, `pnpm --filter @jojopotato/api lint`, format via
`--end-of-line auto` on touched files.

**Dependency Changes:** none (reuses `expo-server-sdk`/`scheduler`/`sendAndPrune` from PUSH-004).
