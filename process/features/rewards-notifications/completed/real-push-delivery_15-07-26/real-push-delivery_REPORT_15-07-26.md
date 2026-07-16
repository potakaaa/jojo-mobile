---
phase: real-push-delivery
date: 2026-07-15
status: COMPLETE
feature: rewards-notifications
plan: process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_PLAN_15-07-26.md
---

# EXECUTE Report — Real Device Push Delivery (iOS + Android)

**TL;DR:** All 12 checklist items + 5 Execute-Agent Instructions (E1–E5) implemented exactly as
planned. Every fully-automated gate is green: API suite 167/167 with `EXPO_ACCESS_TOKEN` unset,
mobile typecheck+lint+test clean. Zero plan deviations. AC-5 (runbook) written and awaiting user
review; AC-6 (real hardware) is the permanent, user-run Known-Gap documented inside the runbook.
CODE DONE — VERIFIED pends only the user's runbook review.

## What Was Done

| Checklist | File | Change |
|---|---|---|
| #1 | `packages/api/src/routes/notifications.ts` | `platform` Zod schema `z.string().min(1)` → `z.enum(['ios','android'])` (AC-1) |
| #2 | `packages/api/src/lib/push-provider.ts` | Added `priority: 'high'` + `_contentAvailable: true` to the constructed `ExpoPushMessage` (AC-2) |
| #3 | `packages/api/src/lib/push-provider.ts` | `sendPush` return `Promise<void>` → `Promise<PushSendResult[]>`; per-ticket classification; log-fallback returns all-`{status:'ok'}` |
| #4 | `packages/api/src/lib/push-provider.ts` | Exported `PushSendResult`, `PERMANENT_PUSH_ERROR_CODES`, `isPermanentPushError` |
| #5 / E5 | `packages/api/src/routes/lib/notification-dispatch.ts` | Added `sendAndPrune`; both `dispatchOrderNotification` + `dispatchMarketingNotification` now call it; Risk #5 globally-unique-token comment added; never-throw preserved (inner try/catch on delete) |
| #5a / E1 | `push-provider.ts` + test | Ticket→token correlation by filtered+chunked message order (positional within chunk), prefer `details.expoPushToken`; NEVER zips against raw `tokens` |
| #6 / E4 | `apps/mobile/app.config.ts` | `'expo-notifications'` bare string → `['expo-notifications', { enableBackgroundRemoteNotifications: true }]` tuple (AC-4) |
| #7 | `packages/api/src/routes/__tests__/device-tokens.integration.test.ts` | AC-1 cases: `platform:'windows'` → 422 + no row; `ios`/`android` still 200 |
| #8 / #8a / E2 | `packages/api/src/lib/__tests__/push-provider.test.ts` (NEW) | AC-2 (4 types), Risk #4 (log-fallback all-ok), #5a (positional correlation, no DB), AC-3 (prune via BOTH dispatchers, real seeded `device_tokens` rows against the test DB) |
| #9 | `push-provider.integration.test.ts` | Re-verified — no change needed (asserts side effects only, not the return value); 2/2 green |
| #10 / #12 | `.../real-push-delivery_REF-credential-runbook_15-07-26.md` (NEW) | Human-executable Firebase/APNs/EAS runbook + AC-6 walkthrough (AC-5) |
| Backlog | `.../backlog/receipt-stage-token-prune_NOTE_15-07-26.md` (NEW) | Deferred receipt-polling follow-up (Open Design Decision 2) |

**E4 confirmatory check:** read the installed `expo-server-sdk@3.15.0/build/ExpoClient.d.ts`
(`priority?: 'default'|'normal'|'high'`, `_contentAvailable?: boolean`, `ExpoPushErrorReceipt.details?.{error, expoPushToken?}` both top-level/optional) and
`expo-notifications@57.0.3/plugin/src/withNotifications.ts` (`enableBackgroundRemoteNotifications?: boolean`) — no version drift; names correct as planned.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| AC-1 | `pnpm --filter @jojopotato/api test` → device-tokens | ✓ 8/8 |
| AC-2/AC-3/#5a/Risk#4 | `pnpm --filter @jojopotato/api test` → push-provider.test.ts | ✓ 5/5 |
| AC-4 typecheck | `pnpm --filter @jojopotato/mobile typecheck` | ✓ clean |
| AC-4 lint | `pnpm --filter @jojopotato/mobile lint` | ✓ 0 errors (3 pre-existing warnings in unrelated `dev-with-tunnel.mjs`) |
| AC-7 | `pnpm --filter @jojopotato/api test` (EXPO_ACCESS_TOKEN unset) | ✓ 167/167, 20 files |
| Regression | push-provider.integration.test.ts | ✓ 2/2 (new return shape) |
| Type/lint | `pnpm --filter @jojopotato/api typecheck` + `lint` | ✓ clean |
| Log-fallback dependents (E3) | marketing-opt-in (3/3) + staff-order-status (22/22) | ✓ exactly-one-`[push] would send` contract preserved |
| Mobile suite | `pnpm --filter @jojopotato/mobile test` | ✓ 13/13 |

Ambient `EXPO_ACCESS_TOKEN` was `<unset>` during the AC-7 run (verified/printed). Zero live
network calls.

## What Was Skipped or Deferred

- **AC-5 (runbook review):** doc written; user review is the verification step — not agent-runnable.
- **AC-6 (real-device delivery):** permanent Known-Gap for any agent (needs live billed creds +
  physical hardware). Documented as a user-run walkthrough inside the runbook, gated on AC-5.
- **Receipt-stage `DeviceNotRegistered` pruning:** deliberately deferred (Open Design Decision 2);
  backlog note written. Ticket-level pruning is this pass's provable substitute.

## Plan Deviations

None. Every touchpoint implemented as written; all 5 Execute-Agent Instructions honored.

## Test Infra Gaps Found

None new. `push-provider.test.ts` is a net-new, reusable pattern (mocked `Expo` client + real-DB
fixture for the pruning assertions). The receipt-vs-ticket gap is a pre-declared scope boundary,
not a defect (backlog note filed).

## Closeout Packet

- **Selected plan:** `process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_PLAN_15-07-26.md`
- **Finished:** all code touchpoints + tests + runbook + backlog note; all fully-automated gates green.
- **Verified vs unverified:** AC-1/2/3/4/7 + regression + type/lint = automated-verified. AC-5 =
  awaiting user doc review. AC-6 = permanent user-run Known-Gap.
- **Cleanup remaining:** none code-side. UPDATE PROCESS should update `all-context.md` (push-provider
  now returns `PushSendResult[]`; `sendAndPrune` prune seam; platform Zod-enum tightening) and
  archive the plan once the user reviews the runbook.
- **Best next state:** Keep in active/testing until the user reviews the runbook (AC-5), then
  UPDATE PROCESS archival.

## Forward Preview

### Test Infra Found
- `packages/api` vitest+supertest with `fileParallelism: false` + `test/global-setup.ts` (drop/create/migrate a `<db>_test` DB once per run). New `push-provider.test.ts` mixes pure-unit (mocked `Expo`) with real-DB seeded fixtures — reusable for future push hardening.

### Blast Radius Changes
- `sendPush` signature widened to `Promise<PushSendResult[]>` (internal; 1 non-test caller = `sendAndPrune`). New exports from `push-provider.ts`: `PushSendResult`, `PERMANENT_PUSH_ERROR_CODES`, `isPermanentPushError`, `sendAndPrune` (internal to `notification-dispatch.ts`).
- `POST /notifications/device-tokens` now 422s on any `platform` ∉ {ios, android} (behavior tightening; mobile only ever sends `Platform.OS`).
- No schema/migration change; `drizzle/` untouched (next slot remains 0009).

### Commands to Stay Green
- `pnpm --filter @jojopotato/api test` (needs `docker compose up -d` + the auto test-DB provisioning)
- `pnpm --filter @jojopotato/mobile typecheck && pnpm --filter @jojopotato/mobile lint && pnpm --filter @jojopotato/mobile test`

### Dependency Changes
- None. No new package dependency; both Expo SDK versions unchanged.
