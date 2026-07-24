---
phase: push-notifications-fixes
date: 2026-07-22
status: COMPLETE_WITH_GAPS
feature: rewards-notifications
plan: process/features/rewards-notifications/active/push-notifications-fixes_22-07-26/push-notifications-fixes_PLAN_22-07-26.md
---

# EXECUTE Report — Push Notification Fixes

**TL;DR** — All 8 touchpoints (T1–T8) implemented exactly per the plan + Execute-Agent
Instructions E1–E6. Every developed behavior (AC1–AC8) has a GREEN Fully-Automated gate; no
section rests on Known-Gap. Cross-package typecheck (all 6 packages) is clean. The two new test
suites pass. **CODE DONE.** AC9/AC10 stay Agent-Probe (owed by user/operator — on-device delivery
+ live `EXPO_ACCESS_TOKEN`), so the task folder stays in `active/` per the plan's Phase Completion
Rules. Repo-wide `lint` + `format:check` are red ONLY from OTHER uncommitted workstreams' files
(never touched here); all 8 of my touched files are lint- and format-clean. Full
`pnpm --filter @jojopotato/api test` is not reliably runnable right now due to remote Neon test-DB
flakiness (documented gap) — but every blast-radius suite passes cleanly in isolation.

## What Was Done

| # | File | Change | Status |
|---|---|---|---|
| T1 | `packages/types/src/notifications.ts` | Added standalone `StaffNotificationType='staff_new_order'`, `STAFF_NOTIFICATION_TYPES`, `StaffNotificationTargetScreen='staff_order_detail'`. `NotificationType`/`NotificationTargetScreen` untouched (D1). | ✅ |
| T2 | `packages/api/src/routes/lib/notification-dispatch.ts` | Added `dispatchNewOrderStaffNotification(order)`: resolves branch staff via `assignedBranchId = branchId` AND `role != 'customer'` (D3+E6), writes one PII-free staff `notifications` row per staff (`target_params={orderId}` only — E3), reuses `loadPushTokens`+`sendAndPrune`. Wrapped in try/catch, never throws (D4). | ✅ |
| T3 | `packages/api/src/routes/orders.ts` | Imported + `await dispatchNewOrderStaffNotification(result)` after the transaction commits, before `res.status(201)`. Passes `result` (the `serializeOrder(...)` `ApiOrder`, camelCase) directly — NOT the raw snake_case `createdOrder` (E4-LOCKED). | ✅ |
| T4 | `apps/mobile/.../notification-permission.ts` | Added `promptAndRegisterForPush(deps?)` composing the existing `requestNotificationPermission` → on-grant `registerDeviceToken` chain; optional dep injection for tests (D2). | ✅ |
| T5 | `apps/mobile/src/app/(onboarding)/index.tsx` | On the success continuation of `onSubmit` (after the `if (!result.ok){…;return;}` early-return guard — E5), fire-and-forget `void promptAndRegisterForPush().catch(...)`. Never awaited, never gates the nav flip. | ✅ |
| T6 | `apps/mobile/src/app/(tabs)/cart/checkout.tsx` | Replaced the inline `requestNotificationPermission().then(register)` chain with `void promptAndRegisterForPush().catch(...)`; removed the now-unused two imports, added the single seam import. | ✅ |
| T7 | `packages/api/.../staff-order-notification.integration.test.ts` (new) | AC1–AC4, hermetic self-seed, auth stubbed at `getSession`. | ✅ 3/3 |
| T8 | `apps/mobile/.../__tests__/prompt-and-register.test.ts` (new) | AC5–AC8, node vitest, injected spies + real seam for AC7. | ✅ 4/4 |

## Test Gate Outcomes

| Gate | Result | Notes |
|---|---|---|
| `pnpm --filter @jojopotato/types typecheck` | GREEN | T1 additive exports compile |
| `pnpm typecheck` (all 6 packages) | GREEN (exit 0) | incl. that standalone staff types didn't break the two customer exhaustive maps, and T3 didn't break orders.ts |
| `staff-order-notification.integration.test.ts` (AC1–AC4) | GREEN 3/3 | branch-isolation on write side (AC1) + `target_params.orderId` (AC3) + resilience-with-`sendSpy`-called (AC2) + real prune with `EXPO_ACCESS_TOKEN` set + Expo SDK `DeviceNotRegistered` mock (AC4, E2) |
| `prompt-and-register.test.ts` (AC5–AC8) | GREEN 4/4 | injected spies (AC5/AC6/AC8) + REAL `__resetPermissionSeam` fire-once seam for AC7 (E1, non-vacuous) |
| Blast-radius regression (in isolation) | GREEN 118/118 | `orders.test.ts` 88, `cart.integration.test.ts` 15, `deals-products.test.ts` 15 — all pass with T3's dispatch call added |
| `apps/mobile` full `test` (vitest + jest) | GREEN | jest 35 suites / 173, vitest incl. the new seam test |
| `pnpm lint` (repo-wide) | RED — pre-existing, NOT mine | 2 `react/display-name` errors in `staff/hooks/__tests__/use-completed-orders.test.tsx` + `use-staff-order-detail.test.tsx` (untracked, from the separate `staff-live-freshness_22-07-26` workstream). None of my 8 touched files have a lint error. |
| `pnpm format:check` (repo-wide) | RED — pre-existing, NOT mine | 3 files from other uncommitted workstreams (STAFF-005 `branch-pickup-settings.tsx`, `staff-refresh.test.tsx`, `order-detail/[orderId].tsx`). My new api test file was the 4th — now formatted. All 8 of my touched files pass `prettier --check`. |
| Full `pnpm --filter @jojopotato/api test` | NOT reliably runnable | Remote Neon `neondb_test` flakiness — see Test Infra Gaps. Blast-radius suites pass in isolation. |

## Vacuous-Green / Deviation-Against-Named-Test Check

Every DEVELOPED behavior (T2/T3 staff dispatch, T4 seam, T5/T6 wirings) is proven by a GREEN
Fully-Automated gate (AC1–AC8). No section rests on Known-Gap. The two vacuous-green risks the
validate-contract flagged were closed as instructed: AC4 sets a real `EXPO_ACCESS_TOKEN` + mocks the
Expo SDK to emit `DeviceNotRegistered` (E2 — the log-fallback returns all-`ok` and could never
prune), and AC7 drives the REAL `requestNotificationPermission` seam so the module-level
`alreadyAsked` flag is genuinely exercised (E1 — an injected `request` spy would bypass it). AC9/AC10
are classified Agent-Probe/operator (real on-device delivery + a live runtime secret), NOT Known-Gap
— genuinely un-automatable, owed by user/operator.

## Plan Deviations (all within blast radius, none hard-stop)

1. **T8 spy syntax** — used vitest 3.x's single-type-arg form `vi.fn<() => Promise<PermissionResult>>()`
   (the plan's pseudo-code implied the older `<[], R>` two-arg form, which fails typecheck on this
   vitest version). Behavior identical.
2. **T2 param type** — used a local structural `NewOrderStaffNotificationInput` interface
   (`{ id; branchId; orderNumber }`, structurally `Pick<ApiOrder,…>`) rather than importing `ApiOrder`
   — exactly the inline shape the plan's checklist step 2 specified (E4 allowed "compatible with");
   keeps `notification-dispatch.ts` free of a serializers dependency.
3. **AC1 send-side spy** — relied on the write-side branch-isolation assertion (the plan's stated
   "strongest, least-brittle proof") for AC1 and used the `vi.spyOn(push,'sendPush')` spy in AC2
   instead (the plan marked the AC1 spy "optional"). AC2's `expect(sendSpy).toHaveBeenCalled()` keeps
   it non-vacuous and also empirically confirms the ESM namespace spy intercepts the dispatch's
   internal `sendPush` call.

## What Was Skipped or Deferred

- **AC9** (real on-device OS dialog + push delivery, iOS + Android separately) — Agent-Probe, owed by
  the user; needs a live `EXPO_ACCESS_TOKEN` + physical devices; no RN E2E runner exists.
- **AC10** (operator confirms `EXPO_ACCESS_TOKEN` set in the deployed API env) — operator checklist;
  runtime secret, not code-provable.
- Per the plan's Phase Completion Rules the task folder STAYS in `active/` (not archived) until AC9/AC10
  are performed. This plan does NOT claim to close the standing `real-push-delivery_15-07-26` Known Gap.

## Test Infra Gaps Found

- **Remote Neon shared test-DB flakiness (pre-existing, documented).** `DATABASE_URL` in this env
  points at a REMOTE Neon Postgres (`neondb_test` via a pooler), not local. Full-suite runs
  intermittently hit `08P01` "server conn crashed" (pooler connection drop under parallel load) and
  `55006` "database being accessed by other users" (global-setup's `DROP DATABASE` can't run while
  another run/stale session holds the single fixed-name test DB). A parallel full run showed 17
  failures cascading from a crash originating in `admin-coupon-issuance.integration.test.ts` (outside
  this plan's blast radius); a later run mass-skipped 606 tests (early global-setup crash). This is the
  exact class tracked in `api-test-db-concurrency-guard_NOTE_17-07-26.md`. **Mitigation used:** ran each
  blast-radius suite ONE-AT-A-TIME against a clean DB — all pass (orders 88, cart 15, deals-products 15,
  staff-notification 3 = 121/121). EVL should re-run the api gate suites in isolation (or on a stable
  DB), not as one big parallel batch, to get trustworthy evidence.
- `CONTEXT_PARTIAL: none` — all required context (plan, contract, source, reference test patterns) was
  available.

## Closeout Packet

- **Selected plan:** `process/features/rewards-notifications/active/push-notifications-fixes_22-07-26/push-notifications-fixes_PLAN_22-07-26.md`
- **Finished:** T1–T8; AC1–AC8 all proven by green Fully-Automated gates; all-package typecheck clean;
  both new test suites green; blast-radius regression green in isolation; all touched files lint/format-clean.
- **Verified vs unverified:** AC1–AC8 verified (automated). AC9 (on-device) + AC10 (live secret) unverified —
  owed by user/operator (Agent-Probe).
- **Cleanup remaining:** commit the 8 touched/new files (uncommitted; the working tree also holds several
  OTHER unrelated uncommitted workstreams — commit selectively). The repo-wide lint/format redness belongs
  to those other workstreams, not this change.
- **Best next state:** Keep in `active/` (CODE DONE, AC9/AC10 owed). EVL: re-run the two named gate suites
  (in isolation for api). Then UPDATE PROCESS once the user performs the AC9/AC10 walkthrough.
- **Follow-up plan stubs created:** none.
- **Closeout classification:** `Keep in active/testing`.

## Forward Preview

- **Test Infra Found:** Remote Neon shared `neondb_test` is single-tenant + flaky under parallel load;
  run api integration suites in isolation for trustworthy gate evidence (see `api-test-db-concurrency-guard`
  backlog note). New reusable server-side pattern: staff branch-fan-out dispatch reusing the module-private
  `loadPushTokens`+`sendAndPrune`.
- **Blast Radius Changes:** `POST /orders` now has a post-commit, awaited, never-throwing staff-notification
  side effect (request/response byte-identical). `notifications.type` may now carry `'staff_new_order'`
  (varchar, no migration). New additive `packages/types` staff-notification exports. New additive mobile
  `promptAndRegisterForPush` export; checkout + onboarding both call it.
- **Commands to Stay Green:** `pnpm typecheck`; `pnpm --filter @jojopotato/api exec vitest run src/routes/__tests__/staff-order-notification.integration.test.ts`; `pnpm --filter @jojopotato/mobile exec vitest run src/features/notifications/lib/__tests__/prompt-and-register.test.ts`; `pnpm --filter @jojopotato/mobile test`.
- **Dependency Changes:** none (no new deps, no migration).
