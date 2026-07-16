---
phase: push-notifications-api
date: 2026-07-14
status: COMPLETE_WITH_GAPS
feature: rewards-notifications
plan: process/features/rewards-notifications/active/push-notifications-api_14-07-26/push-notifications-api_PLAN_14-07-26.md
---

# EXECUTE Report — Push Notification API Integration (PUSH-004 / #75)

TL;DR: All 22 checklist items implemented. All 6 Fully-Automated ACs (AC-1..AC-6) green + full API
regression green (159/159). Mobile typecheck introduces zero new errors (one pre-existing staff
typed-routes error, confirmed identical on clean HEAD). Mobile test suite green (13/13). Owed:
AC-7 Agent-Probe walkthrough + the Hybrid marketingOptIn round-trip (both need a device / manual
run). Live push receipt stays a SPEC-justified Known-Gap.

## What Was Done

**API (`packages/api`):**
- `db/schema/device_tokens.ts` (new table, unique `(user_id, device_id)`), `notifications.target_params`
  (jsonb, additive), `users.marketing_opt_in` (additive nullable — backing column for the
  additionalField; see Deviation 1), schema `index.ts` export.
- Migration `0007_wet_ser_duncan.sql` generated via `drizzle-kit generate` (NOT hand-written); all
  additive; applied cleanly via `db:migrate`.
- `lib/auth.ts` — `marketingOptIn` additionalField (`input:true`, self-owned).
- `lib/push-provider.ts` — `sendPush()` wrapping `expo-server-sdk` chunk/send (used even for a single
  recipient); log-fallback when `EXPO_ACCESS_TOKEN` unset; never throws.
- `routes/lib/notification-dispatch.ts` — `dispatchOrderNotification` (4 transactional events,
  app-layer idempotency on `(type, orderId)`, never marketing-gated) + `dispatchMarketingNotification`
  (marketing_opt_in checked FIRST, unconditionally).
- `routes/staff.ts` — `notifyCustomer` rewritten to the 4-event dispatcher; call sites: +3 arms
  (accepted/preparing/ready), cancelled kept, completed/rejected notify calls removed;
  `creditStarsForOrder(updatedOrder)` byte-for-byte untouched (git-diff verified).
- `routes/notifications.ts` — `GET /notifications` (session-scoped, newest-first), `POST
  /notifications/device-tokens` (upsert), `PATCH /notifications/:id/read` (404 on foreign row).
- `routes/lib/serializers.ts` — `serializeNotification`.
- `lib/scheduler.ts` — injectable-clock substrate (`register`/`tick`/`start`/`stop`, fire-once).
- `index.ts` — single isolated `app.use('/notifications', requireSession, notificationsRouter)`
  line; `/api/staff` + `/api/admin` block untouched (git-diff verified).
- `.env.example` — `EXPO_ACCESS_TOKEN` documented; `package.json` — `expo-server-sdk` added.

**Types (`packages/types`):** `DeviceTokenRegistration` added (`targetParams` already present).

**Mobile (`apps/mobile`):**
- `expo-notifications` + `expo-application` installed (SDK-57 versions via `expo install`);
  `expo-notifications` plugin added to `app.config.ts`.
- `notification-permission.ts` — real `requestPermissionsAsync()` in prod (simulated in dev/test),
  net-new `registerDeviceToken()` (real Expo push token + `POST /notifications/device-tokens`, all
  native imports DYNAMIC so the node test suite still loads the module).
- `use-notifications.ts` — real `GET /notifications` fetch (react-query) + `markRead` mutation;
  marketing opt-in read/written via `useAuth()`; hook shape unchanged.
- `use-auth.ts` — `marketingOptIn` (derived) + `setMarketingOptIn` (updateUser + refetch).
- `auth-client.ts` — `marketingOptIn` in `inferAdditionalFields`.
- `checkout.tsx` — registers device token after permission grant.
- `mock-notifications.ts` deleted (unreferenced).

## What Was Skipped or Deferred

- **AC-7 (mobile end-to-end list)** — Agent-Probe, no RN component/E2E runner exists (project-wide gap).
- **Hybrid marketingOptIn round-trip** — needs a manual toggle→updateUser→refetch check on device.
- **Live on-device push receipt** — SPEC-justified Known-Gap (no live Expo/APNs/FCM creds); AC-6
  log-fallback is the automated substitute.
- Out-of-scope per SPEC: PUSH-003 campaign logic, star accrual, coupons, live SMS/credentials.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| AC-1 device tokens | `pnpm --filter @jojopotato/api test device-tokens` | PASS (5) |
| AC-2 order-status push | `pnpm --filter @jojopotato/api test staff-order-status` | PASS (AC-2 +5) |
| AC-3 marketing opt-in | `pnpm --filter @jojopotato/api test marketing-opt-in` | PASS (3) |
| AC-4 GET /notifications | `pnpm --filter @jojopotato/api test notifications` | PASS (4) |
| AC-5 scheduler | `pnpm --filter @jojopotato/api test scheduler` | PASS (3) |
| AC-6 push-provider | `pnpm --filter @jojopotato/api test push-provider` | PASS (2) |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | PASS |
| API lint | `pnpm --filter @jojopotato/api lint` | PASS (0 errors) |
| API full suite | `pnpm --filter @jojopotato/api test` | PASS (159/159, 19 files) |
| Mobile typecheck | `pnpm --filter @jojopotato/mobile typecheck` | 1 PRE-EXISTING error only (see gaps) |
| Mobile test | `pnpm --filter @jojopotato/mobile test` | PASS (13/13) |

Note: the `--` form in the plan's gate strings (`test -- device-tokens`) can drop the filter through
pnpm; the positional form (`test device-tokens`) filters correctly. Full suite is authoritative.

## Plan Deviations

See the plan's `## Deviations (EXECUTE, 14-07-26)` section — 5 within-blast-radius, none hard-stop:
(1) added `users.marketing_opt_in` column (required backing column for the marketingOptIn
additionalField, omitted from the plan DDL); (2) added `expo-application` dep for the device id;
(3) `notifyCustomer` made async+awaited for deterministic row persistence; (4) relocated
`DEFAULT_MARKETING_OPT_IN` to the pure factory module to fix a node-test-loadability regression;
(5) opt-in toggle needed no screen edit (indirection already satisfies it).

## Test Infra Gaps Found

- **Mobile typecheck RED (pre-existing, zero-diff from PUSH-004):** `src/app/(staff)/index.tsx(83)`
  typed-routes error for STAFF-004 routes (`product-availability`/`branch-pickup-settings`). Confirmed
  IDENTICAL on clean HEAD via `git stash` baseline. Stale `.expo/types/router.d.ts` codegen; needs an
  `expo start` pass to regenerate. Out of this plan's blast radius — do NOT fix here. Matches the
  documented all-tests.md Known Gap.
- No RN component/E2E runner (project-wide) — AC-7 stays Agent-Probe.

## Closeout Packet

- **Selected plan:** `process/features/rewards-notifications/active/push-notifications-api_14-07-26/push-notifications-api_PLAN_14-07-26.md`
- **Finished:** all 22 checklist items; migration applied; all 6 automated ACs + full API regression green; mobile test green.
- **Verified vs unverified:** AC-1..AC-6 automated-verified; mobile behavior (AC-7) + Hybrid opt-in round-trip UNVERIFIED (need device/manual); live push receipt = Known-Gap.
- **Remaining cleanup:** run AC-7 Agent-Probe walkthrough; run Hybrid opt-in round-trip; (optional) regenerate mobile typed-routes to clear the pre-existing staff error; commit when user asks.
- **Closeout classification:** `Keep in active/testing` — code-complete + automated-green, but VERIFIED status awaits the AC-7 walkthrough per the plan's Phase Completion Rules.

## Forward Preview

### Test Infra Found
- API vitest harness (`test/global-setup.ts` pristine `<db>_test` + seed, `fileParallelism:false`) is
  the pattern for any future notification/device-token tests. `EXPO_ACCESS_TOKEN` intentionally unset
  in the test env → push log-fallback; count `[push] would send` log lines to assert send attempts.

### Blast Radius Changes
- New migration slot consumed: `0007_wet_ser_duncan.sql`. Next migration is `0008`.
- New session-gated surface `/notifications` (GET/POST/PATCH). New `device_tokens` table; new
  `users.marketing_opt_in` + `notifications.target_params` columns.

### Commands to Stay Green
- `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` before API tests.
- `pnpm --filter @jojopotato/api test` (full) and `typecheck`/`lint`; `pnpm --filter @jojopotato/mobile test`.

### Dependency Changes
- `packages/api`: +`expo-server-sdk`. `apps/mobile`: +`expo-notifications`, +`expo-application`.
