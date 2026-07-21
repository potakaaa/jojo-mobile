---
name: plan:push-marketing-triggers
description: PUSH-005 (#82) — wire 5 real marketing/retention push triggers into the PUSH-004 scheduler substrate (coupon-expiring, one-more-order, reward-unlocked, new-deal, branch-promo) + frequency cap + quiet hours + restart-safe dedup + scheduler boot
date: 20-07-26
feature: rewards-notifications
---

# PLAN — PUSH-005: Real Marketing/Retention Push Triggers (#82)

**Date**: 20-07-26
**Status**: VALIDATED — CONDITIONAL (see Validate Contract); awaiting explicit ENTER EXECUTE MODE
**Complexity**: COMPLEX (moderate — single plan, no phase program; INNOVATE fan-out signal 0–1/7)
**Feature:** rewards-notifications
**SPEC:** `process/features/rewards-notifications/active/push-marketing-triggers_20-07-26/push-marketing-triggers_SPEC_20-07-26.md`

## TL;DR

Fill the empty PUSH-004 pipe with 5 real, data-driven triggers. All work is in **`packages/api`
only, zero DB migration** (everything rides existing `notifications.target_params` jsonb,
`coupons`, `user_stars`, `orders`, `users.marketingOptIn`). Two triggers poll via the existing
scheduler (coupon-expiring, one-more-order), two are event hooks (reward-unlocked into the
star-credit path, new-deal into admin deal-create), one is admin-command (branch-promo, new admin
route). A single shared guard adds opt-in + frequency-cap + quiet-hours enforcement; restart-safe
dedup reuses `dispatchOrderNotification`'s persisted-row-check pattern. Every AC (AC0–AC12) is
Fully-Automated via `packages/api` vitest+supertest. **VALIDATE is next; EXECUTE requires explicit
"ENTER EXECUTE MODE".**

## Overview / Context

Context loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md`,
`process/context/planning/all-planning.md`, plus the 10 source files in Touchpoints. PUSH-004 (#75)
built the scheduler substrate, send provider (`sendAndPrune`), opt-in gate, and `notifications` log;
PUSH-003 built the on/off switch + in-app list. This plan is the consumer that decides *when* to
fire, per the locked SPEC (AC0 + AC1–AC12) and the INNOVATE Decision Summary (D1–D5) reproduced in
Architecture below. It touches `packages/api` only, adds no schema, and reuses the existing dispatch
pipeline — no parallel send path.

## Goal / Scope

Deliver the five triggers named in SPEC #82 so opted-in customers receive real marketing/retention
pushes — safely (opt-in gated), once each (one-shot dedup), capped (frequency + quiet hours), and
restart-safe. Consume the existing `dispatchMarketingNotification` / `sendAndPrune` / `notifications`
pipeline — no parallel send path, no new device-token/provider work.

**In scope:** AC0 (scheduler boot), AC1–AC2 (coupon-expiring poll), AC3–AC4 (one-more-order poll),
AC5 (reward-unlocked event push), AC6 (new-deal event), AC7 (branch-promo admin route), AC8 (opt-out
per type), AC9 (row shape per type), AC10 (frequency cap), AC11 (quiet hours), AC12 (restart-safe
dedup).

**Out of scope (SPEC-locked, unchanged):** foreground push-handler UI gap, `rejected` order push,
branch-affinity audience targeting, reward-coupon expiry, scheduler substrate internals, opt-in
toggle UI, device-token/provider mechanics, admin-tunable cap/quiet-hours settings. Real on-device
push *delivery timing* stays Agent-Probe (standing project-wide gap; `sendPush` hits its log-fallback
with `EXPO_ACCESS_TOKEN` unset).

## Acceptance Criteria

Verbatim from the locked SPEC (each mapped to its proving gate in Verification Evidence):

- **AC0** — Scheduler `start()` actually runs at server boot; poll triggers evaluate on a real
  interval. `proven by:` boot-time registration test. `strategy:` Fully-Automated.
- **AC1** — Coupon-expiring fires exactly once, in-window, per coupon. `proven by:` seed coupon at
  `expires_at` offsets + single-fire-on-repeat-poll. `strategy:` Fully-Automated.
- **AC2** — Coupon-expiring does not re-fire after used or fully expired. `proven by:` post-redeem +
  post-expiry poll assertions. `strategy:` Fully-Automated.
- **AC3** — One-more-order fires at exactly `lifetime_stars = required_stars − 1`; nowhere else.
  `proven by:` star-count sweep around several tiers. `strategy:` Fully-Automated.
- **AC4** — One-more-order is one-shot per near-miss tier. `proven by:` repeated-tick assertion.
  `strategy:` Fully-Automated.
- **AC5** — Reward-unlocked fires once per unlock, no duplicate on retry. `proven by:` unlock path +
  simulated duplicate-credit. `strategy:` Fully-Automated.
- **AC6** — New-deal fires once per (deal, opted-in customer); no re-notify on re-check. `proven by:`
  deal-creation hook + repeat-call. `strategy:` Fully-Automated.
- **AC7** — Branch-promo is admin-triggered, one-shot per submission, not scheduler-driven.
  `proven by:` admin promo-dispatch endpoint test. `strategy:` Fully-Automated.
- **AC8** — Opt-out blocks all 5 marketing types, verified per type. `proven by:` per-type opt-in-off
  assertion. `strategy:` Fully-Automated.
- **AC9** — Every fired trigger writes a correctly-shaped `notifications` row (type + target_screen +
  target_params per type). `proven by:` per-type row-shape assertion. `strategy:` Fully-Automated.
- **AC10** — Per-user marketing frequency cap enforced; transactional pushes never counted/blocked.
  `proven by:` multi-type back-to-back fire + order-status-still-delivers assertion. `strategy:`
  Fully-Automated.
- **AC11** — Quiet hours suppress marketing sends; transactional exempt. `proven by:` injectable-clock
  inside/outside window. `strategy:` Fully-Automated.
- **AC12** — Restart-safe dedup: no duplicate poll-trigger send across a process restart. `proven by:`
  reconstruct scheduler mid-test + re-tick. `strategy:` Fully-Automated.

## Architecture (from locked INNOVATE Decision Summary)

- **D1 — Trigger split:** event hooks for `reward_unlocked` (star-credit path) and `new_deal` (admin
  deal-create); poll for `coupon_expiring` + `one_more_order`; admin-command for `branch_promo`.
- **D2 — Restart-safe dedup:** reuse `dispatchOrderNotification`'s SELECT-existing-`notifications`-
  rows-and-inspect-`target_params` pattern. Entity key = `couponId` (coupon-expiring), `requiredStars`
  (one-more-order), `dealId` (new-deal). Zero schema change.
- **D3 — Scheduler boot + self-rearming triggers:** call scheduler `start()` at boot inside the
  existing `NODE_ENV !== 'test' && VITEST !== 'true'` guard in `index.ts`. CRITICAL: `scheduler.ts`
  fires each trigger id **at most once ever** (in-memory `fired` Set, purged-not-refired). So each
  poll trigger is a **self-rearming meta-trigger**: `onFire` runs the DB scan + dispatch, then
  re-registers itself under a fresh id (`coupon-scan:{ts}`) for the next window. Correctness comes
  from D2's persisted dedup, not scheduler per-id dedup. Document the pattern in code comments.
- **D4 — Frequency cap + quiet hours:** one shared guard `dispatchMarketingNotificationIfAllowed()`
  in `notification-dispatch.ts`, checked order: (a) opt-in, (b) quiet hours (fixed Asia/Manila
  `+08:00`, clock-injectable), (c) frequency cap (count marketing-type `notifications` rows in 24h +
  30d windows vs `MAX_PER_24H`/`MAX_PER_30D`). Entity dedup (D2) happens in each trigger BEFORE the
  guard. Transactional `dispatchOrderNotification` NEVER routed through the guard.
- **D5 — Audience:** `new_deal` = all `marketingOptIn=true` users; `branch_promo` = `SELECT DISTINCT
  user_id FROM orders WHERE branch_id=:branchId AND placed_at > now−90d` ∩ opted-in. `favoriteBranchId`
  deliberately NOT used (SPEC out of scope).

### Locked micro-decisions (this plan resolves what INNOVATE flagged)

1. **Reward-unlocked in-app row stays UNCONDITIONAL; push is separately opt-in-gated** (INNOVATE
   flagged item 2, recommendation accepted). `notifyRewardUnlocked`'s existing unconditional insert is
   **unchanged**. A SEPARATE opt-in + cap + quiet-hours-gated **push-only** send is added alongside via
   `dispatchMarketingNotificationIfAllowed(userId, 'reward_unlocked', payload, { writeRow: false })`.
   `writeRow: false` means the guard does NOT insert a second `notifications` row (the row already
   exists) — it only runs the gates + `loadPushTokens` + `sendAndPrune`. Regression test locks:
   opted-out user still gets the in-app row, receives no push.
2. **Quiet-hours behavior = DROP (no send).** For the 4 non-reward types no row is written when
   dropped (matches SPEC flow "skip send"). Poll triggers (coupon-expiring, one-more-order) naturally
   re-attempt on the next non-quiet tick because D2 dedup only marks fired on a *written row*; event
   triggers (new-deal, reward push) are genuinely dropped if they land in quiet hours (acceptable v1,
   documented). Reward-unlocked in-app row is unaffected (always written).
3. **Frequency-cap constants:** `MAX_PER_24H = 3`, `MAX_PER_30D = 8` (SPEC "≤3/24h, ~1–4/month"
   industry range; 8/30d chosen as the upper-safe end). Code-level constants, tunable, documented.
4. **Coupon-expiring lead window:** `COUPON_EXPIRY_LEAD_MS = 72h`. Only `offer_id IS NOT NULL`,
   `status='available'`, `expires_at IS NOT NULL`, `user_id IS NOT NULL` coupons with `expires_at ∈
   [now, now+72h]`. Reward coupons (`expires_at` NULL) excluded by construction (D from SPEC).
5. **Scheduler interval:** `MARKETING_SCAN_INTERVAL_MS = 15 min` (900000). Tunable constant.
6. **target_screen / target_params per type (AC9):**
   | type | targetScreen | targetParams |
   |---|---|---|
   | `coupon_expiring` | `coupon_wallet` | `{ couponId }` |
   | `one_more_order` | `rewards` | `{ requiredStars }` (string) |
   | `reward_unlocked` (push only, no row) | `rewards` | `{}` — in-app row keeps existing `'/(tabs)/rewards'` unchanged |
   | `new_deal` | `deal_details` | `{ dealId }` |
   | `branch_promo` | `deal_details` | `{ branchId }` |

## Touchpoints

Files read for context: `packages/api/src/lib/scheduler.ts`,
`packages/api/src/routes/lib/notification-dispatch.ts`, `packages/api/src/lib/reward-unlock-notify.ts`,
`packages/api/src/lib/star-earning.ts`, `packages/api/src/index.ts`,
`packages/api/src/routes/admin/index.ts`, `packages/api/src/routes/admin/deals.ts`,
`packages/api/src/db/schema/{notifications,coupons}.ts`, `packages/types/src/notifications.ts`,
`packages/api/src/routes/admin/lib/analytics-range.ts`.

### Files to CREATE

| File | Purpose |
|---|---|
| `packages/api/src/lib/marketing-triggers.ts` | Hub: poll-scan fns `scanExpiringCoupons(now)` + `scanOneMoreOrder(now)`; event fn `notifyNewDeal(dealId, now?)`; self-rearming trigger registration + `bootMarketingScheduler(opts?)` (creates scheduler, registers self-rearming poll triggers, calls `start()`). All dedup (D2) lives here, BEFORE the guard call. |
| `packages/api/src/lib/marketing-quiet-hours.ts` | Pure `isWithinQuietHours(now: Date): boolean` — Manila `+08:00` local hour ≥ 21 or < 8. Mirrors `analytics-range.ts` `MANILA_OFFSET_MS` convention. DB-import-free, unit-testable. |
| `packages/api/src/routes/admin/notifications.ts` | Admin `POST /api/admin/notifications/branch-promo` — validate `{ branchId, title, body }`, compute recent-order ∩ opted-in audience (D5), one-shot guard-dispatch per user. |
| `packages/api/src/lib/__tests__/marketing-triggers.integration.test.ts` | AC0, AC1, AC2, AC3, AC4, AC6, AC12 — hermetic self-seeding vitest+supertest. |
| `packages/api/src/lib/__tests__/marketing-quiet-hours.test.ts` | AC11 quiet-hours math (pure unit, injected clock inside/outside window). |
| `packages/api/src/routes/lib/__tests__/notification-dispatch-guard.integration.test.ts` | AC8 (opt-out per type), AC9 (row shape per type), AC10 (frequency cap + order-status exempt), AC11 (guard drops in quiet hours). |
| `packages/api/src/routes/admin/__tests__/admin-notifications.integration.test.ts` | AC7 (branch-promo admin-triggered one-shot), AC8/AC9 for `branch_promo`, role matrix (403/401). |
| `packages/api/src/lib/__tests__/reward-unlock-notify.integration.test.ts` | AC5 (fires once per unlock, no dup on retry), AC8-reward, **regression: opted-out user gets in-app row but no push**. |

### Files to MODIFY

| File | Change |
|---|---|
| `packages/api/src/routes/lib/notification-dispatch.ts` | ADD exported `dispatchMarketingNotificationIfAllowed(userId, type, payload, opts?: { now?: () => Date; writeRow?: boolean })` wrapping the existing `dispatchMarketingNotification`. Order: opt-in → quiet hours (`isWithinQuietHours`) → frequency cap (count marketing-type rows in 24h/30d windows) → send (insert row unless `writeRow===false`, then `loadPushTokens`+`sendAndPrune`). ADD `MAX_PER_24H`/`MAX_PER_30D` consts + count query using `MARKETING_NOTIFICATION_TYPES`. Existing `dispatchOrderNotification` + `dispatchMarketingNotification` UNCHANGED (guard is additive). |
| `packages/api/src/lib/reward-unlock-notify.ts` | KEEP the unconditional in-app insert exactly as-is. ADD, after the insert, an opt-in+cap+quiet-hours-gated push-only send: `await dispatchMarketingNotificationIfAllowed(userId, 'reward_unlocked', { title, body, targetScreen: 'rewards' }, { writeRow: false })`, still inside the try/catch (never rolls back a coupon). Remove the `TODO(PUSH-002/003)` marker. |
| `packages/api/src/routes/admin/deals.ts` | In `adminDealsRouter.post('/')`, after `res.status(201).json(...)` (post-commit, both fast + transactional paths), fire-and-forget best-effort `notifyNewDeal(inserted.id).catch(log)`. No behavior change to the create response. |
| `packages/api/src/routes/admin/index.ts` | APPEND `adminRouter.use('/notifications', notificationsRouter)` (append-only aggregator convention — never restructure). |
| `packages/api/src/index.ts` | Inside the existing `if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true')` block, call `bootMarketingScheduler()` alongside `app.listen(...)`. Import from `./lib/marketing-triggers`. |

## Public Contracts

- **NEW admin endpoint** `POST /api/admin/notifications/branch-promo` — body `{ branchId: uuid,
  title: string, body: string }`; inherits `requireAdmin` + CORS from the aggregator mount. Returns
  `{ dispatched: number }` (count of opted-in recent-order customers messaged). Admin/super_admin only;
  403 for staff/customer, 401 unauthenticated.
- **NEW exported fn** `dispatchMarketingNotificationIfAllowed()` (internal `packages/api` contract) —
  the only entry point marketing triggers use; `dispatchMarketingNotification` stays exported but
  triggers must not call it directly (bypasses cap/quiet-hours).
- **NEW exported fns** in `marketing-triggers.ts`: `scanExpiringCoupons`, `scanOneMoreOrder`,
  `notifyNewDeal`, `bootMarketingScheduler` (all `packages/api`-internal).
- **UNCHANGED wire contracts:** `dispatchMarketingNotification`, `dispatchOrderNotification`,
  `sendAndPrune`, `POST /api/admin/deals` request/response, `notifications` table shape, all 5
  `MarketingNotificationType` values, `NotificationTargetScreen` union. No migration.

## Blast Radius

- **Package:** `packages/api` only (1 package). No `apps/mobile`, no `packages/ui`, no
  `packages/types` (all 5 types already exist).
- **Files:** 3 create (source) + 5 create (tests) + 5 modify = 13 files.
- **Risk class:** public API contract change (1 new admin endpoint) + a boot-time side effect
  (scheduler start). NOT auth/identity (reuses `requireAdmin`), NOT schema/migration (zero),
  NOT billing, NOT destructive. Moderate risk: a runaway scheduler or an un-gated marketing send are
  the two real hazards — both covered by dedicated tests (AC10/AC11/AC12 + AC8).
- **Regression surface:** `star-earning.integration.test.ts` (reward-unlock path now also fires a
  push-only call — must stay green), existing `notification-dispatch`/`push-provider` tests, admin
  deals tests (POST unchanged response). Re-run the full `packages/api` suite as the regression gate.

## Implementation Checklist

1. Create `packages/api/src/lib/marketing-quiet-hours.ts` — pure `isWithinQuietHours(now)` using
   `MANILA_OFFSET_MS` (Manila local hour ≥ 21 || < 8). Mirror `analytics-range.ts` header-comment
   style. Export `QUIET_START_HOUR = 21`, `QUIET_END_HOUR = 8`.
2. In `notification-dispatch.ts`: add `MAX_PER_24H = 3`, `MAX_PER_30D = 8` consts + a
   `countRecentMarketingNotifications(userId, now)` helper (counts `notifications` rows where
   `type IN MARKETING_NOTIFICATION_TYPES` and `created_at >= now−24h` / `>= now−30d`, returns both).
   **[VALIDATE E4] Decide the cap-count set explicitly — see step 3's E4 note; the count query's
   `type IN (...)` list is the single lever.**
3. In `notification-dispatch.ts`: add exported `dispatchMarketingNotificationIfAllowed(userId, type,
   payload, opts?)` — opt-in (reuse `users.marketingOptIn === true`) → `isWithinQuietHours(now)` drop
   → cap check → send (insert row unless `writeRow===false`, then `loadPushTokens` + `sendAndPrune`).
   Return a discriminated result (`'sent' | 'gated-opt-out' | 'gated-quiet-hours' | 'gated-frequency'`)
   for testability. Never throw (swallow+log like siblings).
   **[VALIDATE E3] Reuse the module-private `loadPushTokens`/`sendAndPrune` helpers directly (same
   file) — do NOT delegate to `dispatchMarketingNotification` (that would re-run the opt-in query and
   unconditionally write a row, breaking the `writeRow:false` reward-push path).**
   **[VALIDATE E4] Cap-count semantics decision: `reward_unlocked` in-app rows are written
   UNCONDITIONALLY (step 5) and `reward_unlocked` is a marketing type — so a naive
   `type IN MARKETING_NOTIFICATION_TYPES` count lets an unlock consume other marketing pushes' 24h/30d
   budget (an unlock a customer did not opt into can suppress a coupon-expiry reminder they did).
   RECOMMENDED: the cap count EXCLUDES `reward_unlocked` (its in-app row is not opt-in-gated, so it
   should not spend cap budget). Whichever is chosen, add the AC10b test row below locking it.**
4. Create `packages/api/src/lib/marketing-triggers.ts`:
   - `scanExpiringCoupons(now)`: query offer coupons `expires_at ∈ [now, now+72h]`, `available`,
     `user_id NOT NULL`; per coupon, D2 dedup on `(user_id,'coupon_expiring',target_params.couponId)`;
     then `dispatchMarketingNotificationIfAllowed(user_id,'coupon_expiring',{...coupon_wallet,{couponId}})`.
   - `scanOneMoreOrder(now)`: per active reward tier, find `user_stars.lifetime_stars =
     required_stars − 1`; per user, D2 dedup on `(user_id,'one_more_order',target_params.requiredStars)`;
     then guard-dispatch (`rewards`, `{ requiredStars: String(r.required_stars) }`).
   - `notifyNewDeal(dealId, now?)`: all opted-in users; per user D2 dedup on `(user_id,'new_deal',
     target_params.dealId)`; guard-dispatch (`deal_details`, `{ dealId }`).
   - **Self-rearming registration** (D3): `bootMarketingScheduler(opts?)` creates
     `createScheduler({ intervalMs: MARKETING_SCAN_INTERVAL_MS, now })`, registers ONE self-rearming
     trigger per poll type whose `onFire` runs its scan then re-registers a successor under a fresh
     id (`coupon-scan:{ts}` / `one-more-order-scan:{ts}`) with a forward window, then calls `start()`.
     **Write a header comment mirroring `scheduler.ts`'s style explaining WHY re-registration is
     required (fired-once-ever Set) so it does not read as a bug** (INNOVATE flagged item 1).
     **[VALIDATE E1] Register the successor trigger in a `finally` (or BEFORE running the scan) so a
     throwing/transient scan (e.g. a DB blip) never breaks the re-arm chain — the scheduler logs an
     `onFire` rejection but does NOT re-arm on its own, so a scan that throws before re-registering
     would silently halt that poll until the next process restart.**
     **[VALIDATE E2] Size each successor window ≥ 2× `MARKETING_SCAN_INTERVAL_MS` (windowStart ≈ now,
     windowEnd ≈ now + 2×interval) so a single missed/drifted `setInterval` tick still lands inside
     the window and fires — a window narrower than one interval can be skipped entirely, and a skipped
     fire means no successor is registered and the chain dies (the trigger's window then passes and is
     purged with no replacement).**
5. In `reward-unlock-notify.ts`: keep the unconditional insert; add the `writeRow:false` push-only
   gated dispatch after it (still inside try/catch); delete the `TODO(PUSH-002/003)` line.
   **[VALIDATE E5] A multi-tier unlock inserts N in-app rows (one per rewardId) but makes ONE
   push-only guard call (one push, not N). This is the intended design — add the AC5b row-vs-push
   count assertion below so it is locked, not accidental.**
6. In `admin/deals.ts` `POST /`: after both `res.status(201).json(...)` sites, fire-and-forget
   `notifyNewDeal(inserted.id).catch((e)=>console.error('[new-deal-notify] failed', e))` (post-commit,
   best-effort, never blocks/breaks the admin response).
7. Create `packages/api/src/routes/admin/notifications.ts`: `POST /branch-promo` — zod-validate
   `{ branchId (uuid), title, body }`; audience = `SELECT DISTINCT orders.user_id WHERE branch_id=:id
   AND placed_at > now−90d` ∩ `users.marketingOptIn=true`; per user
   `dispatchMarketingNotificationIfAllowed(user,'branch_promo',{deal_details,{branchId}})`; respond
   `{ dispatched }`. One-shot (no scheduler registration).
8. In `admin/index.ts`: append `adminRouter.use('/notifications', notificationsRouter)` + import.
9. In `index.ts`: import `bootMarketingScheduler`; call it inside the existing non-test boot guard.
   **[VALIDATE E6] The boot guard (`NODE_ENV !== 'test' && VITEST !== 'true'`) is FALSE under vitest,
   so the actual boot invocation is never exercised by the integration suite. AC0's Fully-Automated
   proof is `bootMarketingScheduler()` called directly (registration + `start()` spy — SPEC's
   "equivalent boot-time registration test"). ADD the AC0b static-wiring assertion below (grep/read
   that `index.ts` imports and calls `bootMarketingScheduler` inside the boot guard) so the wiring is
   not a silent Known-Gap.**
10. Write all 5 test files per the Verification Evidence table below (hermetic self-seeding, mirror
    `admin-rewards.integration.test.ts` / `star-earning.integration.test.ts` patterns).
11. Run the full gate suite (see Verification / Test Gate Commands) until green.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `marketing-triggers` test: `bootMarketingScheduler` registers both poll triggers + calls `start()` (spy) | Fully-Automated | AC0 |
| **[VALIDATE] AC0b static-wiring: assert `index.ts` imports `bootMarketingScheduler` and calls it inside the `NODE_ENV !== 'test' && VITEST !== 'true'` boot guard (grep/read assertion — the env-guarded call is never run under vitest)** | Fully-Automated | AC0 (wiring) |
| **[VALIDATE] Self-rearming continuation: drive `tick()` (injected clock) across ≥2 intervals → each interval fires its scan AND a successor is registered, so tick N+1 re-fires (proves the chain continues, not fire-once)** | Fully-Automated | AC0/D3 |
| **[VALIDATE] Self-rearming resilience: a scan that THROWS still re-registers a successor (chain survives a transient scan error — E1)** | Fully-Automated | AC0/D3 |
| `marketing-triggers` test: seed offer coupon at `expires_at` offsets → exactly-one fire in-window; repeat-`scanExpiringCoupons` → no second row | Fully-Automated | AC1 |
| same suite: coupon `used` / `expires_at` fully past → no fire | Fully-Automated | AC2 |
| `marketing-triggers` test: sweep `lifetime_stars` around several tiers → fire only at `required−1` | Fully-Automated | AC3 |
| same suite: repeat `scanOneMoreOrder` while still one away → no repeat row | Fully-Automated | AC4 |
| `reward-unlock-notify` test: credit crossing a tier fires one `reward_unlocked` push; simulated duplicate credit → no 2nd push | Fully-Automated | AC5 |
| **[VALIDATE] AC5b multi-tier unlock: crossing 2 tiers in one credit inserts exactly 2 in-app rows but makes exactly 1 push-only guard call (row-vs-push count locked — E5)** | Fully-Automated | AC5 |
| `marketing-triggers` test: `notifyNewDeal` notifies each opted-in user once; re-call → no re-notify | Fully-Automated | AC6 |
| `admin-notifications` test: `POST /branch-promo` dispatches once to audience; not re-sent on ticks | Fully-Automated | AC7 |
| `notification-dispatch-guard` + `reward-unlock-notify` + `admin-notifications` tests: opt-in off → zero rows/pushes, asserted per each of the 5 types | Fully-Automated | AC8 |
| `notification-dispatch-guard` test: each type writes correct `type` + `target_screen` + `target_params` | Fully-Automated | AC9 |
| `notification-dispatch-guard` test: back-to-back multi-type fires respect `MAX_PER_24H`/`MAX_PER_30D`; order-status pushes still deliver + not counted | Fully-Automated | AC10 |
| **[VALIDATE] AC10b cap-count semantics: assert the chosen behavior for whether an unconditional `reward_unlocked` in-app row counts toward the marketing cap (E4) — a customer's earned-reward unlock does/does-not suppress a subsequent coupon-expiry push, per the locked decision** | Fully-Automated | AC10 |
| `marketing-quiet-hours` unit + `notification-dispatch-guard` integration: injected clock inside window drops marketing; order-status exempt | Fully-Automated | AC11 |
| **[VALIDATE] AC11b event-trigger quiet-hours DROP: a `new_deal`/`reward_unlocked` push landing in quiet hours is genuinely dropped (no row, no deferred re-send) while a poll trigger re-attempts next non-quiet tick — locks micro-decision 2's asymmetry** | Fully-Automated | AC11 |
| `marketing-triggers` test: reconstruct scheduler mid-test (fresh `fired` set), re-run scan → no duplicate row (dedup from persisted rows) | Fully-Automated | AC12 |
| Real on-device push delivery timing (killed/background app) | Agent-Probe (standing project-wide gap; out of scope) | none — `sendPush` log-fallback with `EXPO_ACCESS_TOKEN` unset; not a new gap |

## Test Infra Improvement Notes

(none identified yet — `packages/api` vitest+supertest with hermetic self-seeding fixtures already
covers every AC0–AC12 as Fully-Automated; no new runner needed.)

## Verification / Test Gate Commands

```bash
# Preconditions: local Postgres (docker compose up -d + db:migrate, or native pg per all-tests.md)
pnpm --filter @jojopotato/api test        # full API suite — all AC0-AC12 + regression gate
pnpm --filter @jojopotato/api typecheck
pnpm typecheck                            # cross-package (should stay green — packages/api only)
pnpm lint
pnpm format:check
```

Regression gate: the full `packages/api` suite must pass, specifically `star-earning.integration.
test.ts` (reward-unlock path unchanged behavior + new push-only call), the existing
`notification-dispatch`/`push-provider` tests, and the admin deals tests (POST response unchanged).

## Dependencies / Risks

- **Dependency:** local Postgres for the vitest suite (`docker compose up -d` + `db:migrate`, or the
  native pg instance per `all-tests.md` dev-machine note). No new external dependency.
- **Risk — un-gated marketing send:** mitigated — every trigger routes through
  `dispatchMarketingNotificationIfAllowed`; AC8 asserts opt-out per type.
- **Risk — scheduler runaway / double-fire on restart:** mitigated — D3 self-rearming pattern +
  D2 persisted dedup; AC12 reconstructs a fresh scheduler and asserts no duplicate.
- **Risk — self-rearming chain silently halting** (VALIDATE-found): mitigated by E1 (re-arm in
  `finally`) + E2 (window ≥ 2× interval) + the two new self-rearming continuation/resilience gates.
- **Risk — new-deal broadcast to all opted-in users could be large:** accepted for v1 (SPEC-locked
  broadcast audience); fire-and-forget post-commit so it never blocks the admin response.
- **Risk — reward-unlock behavior change** (push now opt-in-gated where previously only the in-app
  row existed): explicitly designed — in-app row stays unconditional; regression test locks it.
- **Backwards compatibility:** additive only. No migration, no wire-contract change, no `packages/types`
  edit. Existing consumers unaffected.

## Phase Completion Rules

- **CODE DONE** = all 13 files created/modified per the checklist, and all Verification / Test Gate
  Commands green (full `packages/api` suite incl. the new AC0–AC12 tests, typecheck, lint,
  format:check).
- **VERIFIED** requires, in addition to CODE DONE, explicit user confirmation of the one Agent-Probe
  residual (real on-device push delivery timing) OR the user accepting it as the standing
  project-wide out-of-scope gap. Until then the task folder stays in `active/`, not archived — do NOT
  mark ✅ VERIFIED on automated gates alone.
- Known-Gap is BANNED for AC0–AC12 (all are Fully-Automated); any AC that cannot be proven
  Fully-Automated at EXECUTE time keeps its gate CONDITIONAL and gets a backlog stub — it is never a
  silent terminal PASS.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/rewards-notifications/active/push-marketing-triggers_20-07-26/push-marketing-triggers_PLAN_20-07-26.md`
2. **Last completed step:** VALIDATE (V1–V7) complete — validate-contract written below (Gate: CONDITIONAL). SPEC + INNOVATE Decision Summary persisted into this plan.
3. **Validate-contract status:** written 21-07-26 — see `## Validate Contract`.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `process/context/planning/all-planning.md`, and the 10 source files in Touchpoints.
5. **Next step for a fresh agent:** await explicit "ENTER EXECUTE MODE". Do NOT begin
   EXECUTE from this plan alone — autonomy does not bypass the EXECUTE approval gate.

## Deviations

Within-blast-radius deviations recorded during EXECUTE (documented + continued under standing /goal
autonomy; none are hard-stop class — no auth/schema/API-surface logic was changed):

1. **Branch-promo unauthenticated status = 403, not 401.** The plan's Public Contract stated "401
   unauthenticated" for `POST /api/admin/notifications/branch-promo`. The route inherits
   `requireAdmin` (as the plan mandates — no ad-hoc auth), and that existing guard
   (`packages/api/src/lib/require-admin.ts`) responds `403 { error: 'Forbidden' }` for BOTH
   wrong-role AND no-session — it has no distinct 401 path. Impact: the endpoint returns 403 (not
   401) to an unauthenticated caller. The role-matrix test asserts the guard's real behavior (403);
   changing the shared guard to emit 401 would be an out-of-scope auth-surface change and was not
   made. Every other AC (AC0–AC12) is unaffected.

## Validate Contract

Status: CONDITIONAL
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Signal 2/7 (S2 API-contract surface, S7 5+ files). Single package `packages/api`; the guard, triggers, and tests are interdependent (triggers depend on the guard; tests depend on both) — parallel subagents would collide on shared files. VALIDATE fan-out ran Simple Mode (self-contained plan, one domain).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC0 | `bootMarketingScheduler` registers poll triggers + calls `start()` | Fully-Automated | `marketing-triggers.integration.test.ts` — spy on `scheduler.start`, assert both poll triggers registered | A |
| AC0-wiring | `index.ts` invokes `bootMarketingScheduler` inside the boot guard | Fully-Automated | AC0b static/grep assertion (env-guarded call never runs under vitest) | B |
| AC0/D3-continuation | self-rearming chain fires across ≥2 intervals | Fully-Automated | tick() driven 2+ intervals; assert successor registered + tick N+1 re-fires | B |
| AC0/D3-resilience | throwing scan still re-arms (E1) | Fully-Automated | scan stub throws; assert successor still registered | B |
| AC1 | coupon-expiring fires once in-window per coupon | Fully-Automated | seed coupon at `expires_at` offsets; single-fire-on-repeat-poll | A |
| AC2 | no re-fire after used / fully expired | Fully-Automated | post-redeem + post-expiry poll assertions | A |
| AC3 | one-more-order fires only at `required−1` | Fully-Automated | `lifetime_stars` sweep around several tiers | A |
| AC4 | one-more-order one-shot per near-miss tier | Fully-Automated | repeated-tick assertion | A |
| AC5 | reward-unlocked fires once per unlock, no dup on retry | Fully-Automated | unlock path + simulated duplicate credit (relies on `creditStarForCompletedOrder` `already-credited` gate — verified real) | A |
| AC5b | multi-tier unlock: N in-app rows, 1 push (E5) | Fully-Automated | 2-tier credit → assert 2 rows + 1 guard call | B |
| AC6 | new-deal fires once per (deal, opted-in user) | Fully-Automated | `notifyNewDeal` + repeat-call assertion | A |
| AC7 | branch-promo admin one-shot, not scheduler-driven | Fully-Automated | `admin-notifications.integration.test.ts` POST /branch-promo | A |
| AC8 | opt-out blocks all 5 marketing types, per type | Fully-Automated | per-type opt-in-off assertion across 3 test files | A |
| AC9 | correct row shape (type + target_screen + target_params) per type | Fully-Automated | per-type row-shape assertion | A |
| AC10 | frequency cap enforced; transactional never counted/blocked | Fully-Automated | back-to-back multi-type fire; order-status still delivers | A |
| AC10b | cap-count semantics for unconditional `reward_unlocked` in-app row (E4) | Fully-Automated | assert chosen exclude/include behavior | B |
| AC11 | quiet hours suppress marketing; transactional exempt | Fully-Automated | `marketing-quiet-hours.test.ts` + guard integration, injected clock | A |
| AC11b | event-trigger quiet-hours DROP vs poll re-attempt asymmetry | Fully-Automated | new_deal/reward dropped (no row); poll re-attempts next non-quiet tick | B |
| AC12 | restart-safe dedup across process restart | Fully-Automated | reconstruct scheduler (fresh `fired` set) + re-tick → no duplicate row | A |
| on-device delivery timing | killed/background-app push delivery | Agent-Probe | manual walkthrough with live `EXPO_ACCESS_TOKEN` + hardware | D |

gap-resolution legend: A — proven now · B — gate added by this plan's checklist · C — deferred to named later phase · D — backlog test-building stub (named residual; standing project-wide no-live-push gap).

C-4 reconciliation: `strategy:` column carries ONLY Fully-Automated / Agent-Probe here (no Hybrid needed). Known-Gap is NOT a strategy value; the single on-device-delivery residual is carried via gap-resolution D (named residual), not as a strategy that proves a behavior. AC0–AC12 are Known-Gap-BANNED per the plan's Phase Completion Rules — all resolve A or B.

Legacy line form (retained for existing consumers):
- Scheduler boot + self-rearming (AC0/D3): Fully-automated: `pnpm --filter @jojopotato/api test` (marketing-triggers suite) + AC0b static-wiring grep
- Poll triggers coupon-expiring/one-more-order (AC1-AC4): Fully-automated: `pnpm --filter @jojopotato/api test`
- Reward-unlock push (AC5/AC5b): Fully-automated: `pnpm --filter @jojopotato/api test` (reward-unlock-notify suite)
- New-deal + branch-promo (AC6/AC7): Fully-automated: `pnpm --filter @jojopotato/api test`
- Guard: opt-out/row-shape/cap/quiet-hours (AC8-AC11b): Fully-automated: `pnpm --filter @jojopotato/api test` (notification-dispatch-guard + marketing-quiet-hours suites)
- Restart dedup (AC12): Fully-automated: `pnpm --filter @jojopotato/api test`
- On-device delivery timing: known-gap: documented as standing project-wide no-live-push Agent-Probe residual (out of scope, not a new gap)

Dimension findings:
- Infra fit: PASS — `packages/api` only, zero migration; all 11 touchpoints verified present; scheduler/dispatch/star-earning/admin-aggregator substrate all real and match the plan's claims. Boot side-effect rides the existing env-guarded block in `index.ts`.
- Test coverage: CONCERN — every AC is Fully-Automated on the real `packages/api` vitest+supertest infra, but the plan under-specified the self-rearming continuation/resilience gates, the AC0 boot-wiring residual, and the cap-count/quiet-hours-drop semantics tests. All added as gates B (AC0b, continuation, resilience, AC5b, AC10b, AC11b) during VALIDATE — no Known-Gap for any AC0–AC12.
- Breaking changes: PASS — additive only. All wire contracts (`dispatchMarketingNotification`, `dispatchOrderNotification`, `sendAndPrune`, `POST /api/admin/deals`, `notifications` shape, the 5 `MarketingNotificationType` values) verified UNCHANGED. `notifyRewardUnlocked` in-app insert is byte-unchanged; the push is a separate `writeRow:false` call (no double-row, verified).
- Security surface: PASS — the new `POST /api/admin/notifications/branch-promo` mounts under the append-only aggregator and inherits `requireAdmin` + CORS (verified in `admin/index.ts`) — NO ad-hoc auth check. `branchId` zod-validated as uuid; free-text title/body carry no injection surface (parameterized drizzle, plain push text). Role matrix (403/401) is a required test. 5-artifact evidence pack NOT proportionate (narrow additive admin endpoint inheriting existing auth; matches repo precedent for CART-003 session-auth CRUD).
- Section — self-rearming trigger adapter (D3) feasibility: CONCERN — mechanically feasible (`createScheduler` `fired`-Set + purge-on-window-pass verified); highest-risk edit is the re-arm ordering: a scan that throws before re-registering, or a window narrower than one tick, silently halts the poll. Mitigated by execute-agent instructions E1/E2 + two new continuation/resilience gates.
- Section — frequency-cap guard (D4) feasibility: CONCERN — feasible in-file (guard reuses the module-private `loadPushTokens`/`sendAndPrune`); highest-risk edit is that the unconditional `reward_unlocked` in-app row is a marketing type and would count toward the cap under a naive query, letting a non-opted-into unlock suppress other pushes. Resolved via E4 explicit decision + AC10b gate.
- Section — reward-unlock opt-in-gating (micro-decision 1) feasibility: PASS — in-app insert unchanged, push is separate `writeRow:false`; AC5 retry-dedup rests on the verified `creditStarForCompletedOrder` `already-credited` gate (never re-calls `notifyRewardUnlocked` on a duplicate credit). No double-write, no regression to existing in-app behavior.
- Section — admin branch-promo endpoint (D5) feasibility: PASS — append-only aggregator convention correct; two `res.status(201).json` sites in `deals.ts` (lines 359, 420) with `inserted.id` in scope at both for the `notifyNewDeal` hook.

Open gaps:
- On-device push delivery timing (killed/background app): known-gap: standing project-wide Agent-Probe residual — `sendPush` hits its log-fallback with `EXPO_ACCESS_TOKEN` unset. Out of scope, not a new gap. Not counted toward CONDITIONAL.

What this coverage does NOT prove:
- `pnpm --filter @jojopotato/api test` (marketing-triggers suite) proves `bootMarketingScheduler`'s registration + `start()` call and the self-rearming chain under a manually-driven injected clock; it does NOT prove the real `setInterval` wall-clock cadence fires in a live server, nor that `index.ts`'s env-guarded boot call executes (the guard is false under vitest — covered only by the AC0b static assertion).
- The guard/quiet-hours/cap gates prove the row-write + gate-decision logic; they do NOT prove a real Expo push is delivered to a device (log-fallback with no `EXPO_ACCESS_TOKEN`), nor real-world quiet-hours behavior across timezones other than the fixed Manila +08:00.
- AC5/AC5b prove the reward push fires once per real credit and the in-app rows are unchanged; they do NOT prove behavior if `unlockRewardsForLifetime` is ever refactored to be non-idempotent (the retry-dedup depends on that upstream idempotency remaining true).
- The restart-dedup gate (AC12) proves dedup from persisted rows within a single test process; it does NOT prove behavior under two concurrent live server processes polling the same DB simultaneously (single-instance assumption; not in scope).

Gate: CONDITIONAL (all CONCERNs resolved in-plan via VALIDATE gate additions B + execute-agent instructions E1–E6; no unresolved FAILs; every AC0–AC12 lands Fully-Automated, Known-Gap banned and unused for developed behavior)
Accepted by: session (autonomous, standing /goal execution) — accepted concerns: [test-coverage: self-rearming continuation/resilience + AC0 boot-wiring + AC5b/AC10b/AC11b semantics gates added as gate-B during VALIDATE]; [self-rearming feasibility: re-arm ordering E1 + window-sizing E2]; [frequency-cap feasibility: cap-count semantics E4]

## Autonomous Goal Block

```
SESSION GOAL: PUSH-005 (#82) — wire 5 real marketing/retention push triggers (coupon-expiring, one-more-order, reward-unlocked, new-deal, branch-promo) into the PUSH-004 scheduler substrate in packages/api. Zero DB migration.
Charter + umbrella plan: N/A — single standalone plan (no phase program).
Autonomy: standing /goal — proceed through EXECUTE→EVL→UPDATE PROCESS without approval pauses on reversible actions; per feedback_autonomous_phase_execution.md. Subagent delegation (no inline execution) still mandatory. EXECUTE approval gate still required (explicit "ENTER EXECUTE MODE").
Hard stop conditions / safety constraints:
- Never bypass the marketing opt-in gate — every marketing send routes through dispatchMarketingNotificationIfAllowed (AC8).
- Never write a second notifications row for reward_unlocked (in-app row is unconditional; push is a separate writeRow:false call).
- Never let a scan error permanently halt a poll (re-arm in finally — E1); never delegate the guard to dispatchMarketingNotification (E3).
- Known-Gap is BANNED for AC0–AC12 — any AC that can't be proven Fully-Automated keeps its gate CONDITIONAL + a backlog stub, never a silent PASS.
Next phase: EXECUTE (after explicit ENTER EXECUTE MODE) — spawn vc-execute-agent (opus), sequential, single package packages/api.
Validate contract: inline in this plan (## Validate Contract, Gate: CONDITIONAL, 21-07-26).
Execute start: fully-auto: `pnpm --filter @jojopotato/api test` + `pnpm --filter @jojopotato/api typecheck` + `pnpm typecheck` + `pnpm lint` + `pnpm format:check` | e2e spec: none | probe scenario: on-device push delivery timing (out of scope, standing gap) | high-risk pack: no (narrow additive admin endpoint inheriting requireAdmin).
```
