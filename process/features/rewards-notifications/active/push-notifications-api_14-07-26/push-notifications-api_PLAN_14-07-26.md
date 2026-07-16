---
name: plan:push-notifications-api
description: "Implementation plan for real push notification backend integration (PUSH-004 / #75) — device_tokens table, notifications.target_params column, expo-server-sdk send pipeline, marketing_opt_in additionalField, in-process scheduler"
date: 14-07-26
feature: rewards-notifications
---

# PLAN — Push Notification API Integration (PUSH-004 / #75)

**Date**: 14-07-26
**Status**: VALIDATED — see Validate Contract below
**Complexity**: COMPLEX (single plan, NOT a phase program — confirmed by INNOVATE). New schema
(1 table + 1 column), new API surface (`/notifications`), new external SDK dependency
(`expo-server-sdk`), new scheduler substrate, mobile-side `expo-notifications` install.

Locked SPEC: `process/features/rewards-notifications/active/push-notifications-api_14-07-26/push-notifications-api_SPEC_14-07-26.md`

## Overview

Makes push notifications real end-to-end: a new `device_tokens` table stores per-device Expo push
tokens (upsert-on-device, never duplicated), `notifications.target_params` (jsonb, additive) closes
the DB/type mismatch already documented in the SPEC, a new `/notifications` router serves the
signed-in user's own rows, `notifyCustomer` in `staff.ts` becomes a real 4-event dispatcher
(`accepted`/`preparing`/`ready`/`cancelled`) that writes a notification row and sends via
`expo-server-sdk` (log-instead-of-send when creds are unset, mirroring the existing
`RESEND_API_KEY` pattern), `marketing_opt_in` becomes a better-auth `additionalFields` entry
gating all 5 marketing types (never the 4 transactional types), and a lightweight in-process
interval scheduler with an injectable clock proves trigger-firing without becoming PUSH-003's
campaign logic.

## Goals

1. Real device-token registration, keyed by `(user_id, device_id)`, upsert on device (AC-1).
2. Real `notifyCustomer` covering exactly the 4 transactional events, one row + one send attempt
   each, no other status fires a customer push (AC-2).
3. Marketing opt-in gating enforced for all 5 marketing types, never gates the 4 transactional
   types (AC-3).
4. Real `GET /notifications` route, session-scoped, newest-first, matching the mobile
   `AppNotification` contract (AC-4).
5. Scheduler substrate that demonstrably fires a trigger within a configured window using an
   injectable clock (AC-5).
6. Safe, observable log-instead-of-send fallback when provider creds are unset (AC-6).
7. Mobile-side real data wiring: `useNotifications()` swapped from mock state to real fetch,
   `notification-permission.ts` extended to register the real Expo push token, opt-in toggle
   screen wired to `authClient.updateUser({ marketingOptIn })`.

## Scope

In scope: `device_tokens` table, `notifications.target_params` column, `marketing_opt_in`
additionalField, `/notifications` GET + device-token registration POST routes, `notifyCustomer`
rewrite, `expo-server-sdk` provider wrapper with log-fallback, in-process scheduler substrate,
mobile `expo-notifications` install + token registration + real data wiring for
`useNotifications()` and the opt-in toggle.

Out of scope (verbatim from SPEC): permission-prompt UI/timing, opt-in toggle screen UI itself
(already built), notification tap deep-linking UI, in-app notification list screen UI, actual
marketing campaign content/triggers (PUSH-003), star/rewards accrual (`STAR-00x`), coupon
redemption/wallet, live provider credential provisioning, real SMS OTP delivery.

## Acceptance Criteria

Maps 1:1 to SPEC AC-1 through AC-7 (see Verification Evidence table below for exact proving
gate per criterion). Plan-level testable acceptance criteria:

1. Device token registered once per physical device; re-registration with a rotated token
   updates the same row (AC-1).
2. Exactly 4 transitions (accepted/preparing/ready/cancelled) each produce exactly 1
   notification row + 1 push-send attempt; no other status triggers a customer push (AC-2).
3. Marketing opt-in gates all 5 marketing types; never gates the 4 transactional types (AC-3).
4. GET /notifications returns only the caller own rows, newest-first, matching the mobile
   AppNotification contract (AC-4).
5. Scheduler tick() fires a configured trigger exactly once within its window using an
   injected clock (AC-5).
6. Send pipeline is safe/observable with provider creds unset -- notification row still created,
   no outbound call attempted (AC-6).
7. Mobile notification list reflects real transitions end-to-end (AC-7, Agent-Probe only).

## Phase Completion Rules

This is a single-plan (non-phase-program) COMPLEX plan -- one phase, no umbrella. The plan is
CODE DONE when every touchpoint in the Touchpoints table is implemented and every
Fully-Automated/Hybrid gate in Verification Evidence is green. The plan is VERIFIED only after
the user has confirmed the AC-7 Agent-Probe walkthrough (mobile notification list reflects real
transitions) -- code-only completion without that confirmation stays CODE DONE, not VERIFIED.

## Implementation Checklist

1. packages/api/src/db/schema/device_tokens.ts -- create table schema.
2. packages/api/src/db/schema/notifications.ts -- add target_params jsonb column.
3. packages/api/src/db/schema/index.ts -- export the new schema file.
4. Run drizzle-kit generate -- confirm actual next migration slot number first (VALIDATE
   re-confirmed 0007 is still correct as of 14-07-26 — see Migration section note below; re-check
   again at EXECUTE time regardless, per this repo's renumbering-churn precedent).
5. packages/api/src/lib/auth.ts -- add marketingOptIn additionalField.
6. packages/api/package.json -- add expo-server-sdk dependency.
7. packages/api/src/lib/push-provider.ts -- create sendPush() wrapper with log-fallback.
8. packages/api/src/routes/lib/notification-dispatch.ts -- create dispatchOrderNotification +
   dispatchMarketingNotification.
9. packages/api/src/routes/staff.ts -- rewrite notifyCustomer stub body + fix the 4 call
   sites per the exact diff scope section (leave creditStarsForOrder untouched).
10. packages/api/src/routes/notifications.ts -- create GET/POST/PATCH routes.
11. packages/api/src/routes/lib/serializers.ts -- add serializeNotification.
12. packages/api/src/lib/scheduler.ts -- create injectable-clock scheduler substrate.
13. packages/api/src/index.ts -- add the single isolated /notifications router mount line.
14. packages/api env config file -- document EXPO_ACCESS_TOKEN fallback trigger.
15. apps/mobile/app.config.ts + package.json -- add expo-notifications plugin + dependency.
16. apps/mobile notification-permission.ts -- real permission call + registerDeviceToken()
    (confirm device-id API via vc-docs-seeker first).
17. apps/mobile use-notifications.ts -- swap mock state for real fetch, keep hook shape.
18. apps/mobile use-auth.ts -- expose marketingOptIn.
19. Wire the opt-in toggle at apps/mobile/src/app/(tabs)/account/notifications.tsx to
    authClient.updateUser (path confirmed by VALIDATE — no vc-scout hunt needed, see Risks #5).
20. Delete apps/mobile mock-notifications.ts once unreferenced.
21. Run all Verification Evidence gates listed below; fix until green.
22. Agent-Probe walkthrough for AC-7; request user confirmation for VERIFIED status.

## Touchpoints

### `packages/api`

| File | Action | Notes |
|---|---|---|
| `packages/api/src/db/schema/device_tokens.ts` | CREATE | New table: `id, user_id FK→users, device_id, push_token, platform, last_seen_at, created_at, updated_at`. Unique constraint on `(user_id, device_id)`. |
| `packages/api/src/db/schema/notifications.ts` | MODIFY | Add nullable `target_params: jsonb('target_params')` column. |
| `packages/api/src/db/schema/index.ts` | MODIFY | Add `export * from './device_tokens';` in the correct FK-dependency-ordered section (depends on `users`, so alongside/after the `users` export block). |
| `packages/api/drizzle/0007_*.sql` (name TBD by `drizzle-kit generate`) | CREATE (generated) | `CREATE TABLE device_tokens (...)` + `ALTER TABLE notifications ADD COLUMN target_params jsonb`. |
| `packages/api/src/lib/auth.ts` | MODIFY | Add `marketingOptIn: { type: 'boolean', required: false, input: true }` to `additionalFields` (same block as `birthday`/`address`/`onboardedAt`, confirmed at lines 76-88: `role` is `input:false` server-owned, `birthday`/`address`/`onboardedAt` are `input:true` self-owned — `marketingOptIn` follows the self-owned `input:true` shape exactly). Server default handled at read-time (`?? DEFAULT_MARKETING_OPT_IN` equivalent — see Public Contracts). |
| `packages/api/src/lib/push-provider.ts` | CREATE | `sendPush(tokens: string[], notification: {title, body, data}): Promise<void>` — wraps `expo-server-sdk`'s `Expo.chunkPushNotifications` + `Expo.sendPushNotificationsAsync`, even for a single recipient (vc-predict CAUTION item). If `EXPO_ACCESS_TOKEN`/push creds unset (mirrors `RESEND_API_KEY` unset pattern — confirmed present verbatim in `packages/api/.env.example` lines 23-26) → `console.log('[push] would send:', ...)` instead of calling the SDK; never throws. |
| `packages/api/src/routes/lib/notification-dispatch.ts` | CREATE | `dispatchOrderNotification(order, event)` — the real logic behind `notifyCustomer`. Builds the notification row (type/title/body/target_screen/target_params, deterministic id `order:${orderId}:${status}` used as an idempotency check via a `SELECT`-before-`INSERT` on a matching row, not a DB unique constraint — see Public Contracts), inserts into `notifications`, looks up the user's `device_tokens` rows, calls `sendPush`. Exported separately from `staff.ts` so it is unit-testable without the full PATCH route. Also exports `dispatchMarketingNotification(userId, type, payload)` which checks `marketing_opt_in` FIRST (no exceptions, including scheduler-triggered calls) before writing/sending. |
| `packages/api/src/routes/staff.ts` | MODIFY (surgical) | Lines ~45-55: replace the `notifyCustomer` stub body to call `dispatchOrderNotification` for exactly `accepted \| preparing \| ready \| cancelled`. Lines ~286-296 (inside the `PATCH` handler's step 8 `if/else if` call-site block): **VALIDATE confirmed via direct file read that this block currently has exactly 3 branches — `completed`, `rejected`, `cancelled` — and NO `accepted`/`preparing`/`ready` branches exist there today** (a *different*, earlier block at ~line 255-270 has an unrelated `targetStatus === 'ready'` branch for timestamp-setting only — do not confuse the two). EXECUTE must therefore: ADD three new `else if` arms (`accepted`, `preparing`, `ready`) each calling `notifyCustomer(updatedOrder, '<status>')`, CHANGE the existing `cancelled` arm's call to use the new 4-value event type (call shape unchanged), and REMOVE the `completed`/`rejected` arms' `notifyCustomer(...)` calls entirely — leaving `creditStarsForOrder(updatedOrder)` on the `completed` arm byte-for-byte untouched (verify with `git diff` that this line is unchanged). Net diff: 3 new arms + 1 call-signature-compatible edit + 2 removed calls; `creditStarsForOrder` line untouched. |
| `packages/api/src/routes/notifications.ts` | CREATE | New router: `GET /notifications` (session-scoped, `req.user!.id`, newest-first, returns rows matching `AppNotification` shape) and `POST /notifications/device-tokens` (session-scoped, upserts on `(user_id, device_id)` — `ON CONFLICT` via Drizzle's `.onConflictDoUpdate`). |
| `packages/api/src/routes/lib/serializers.ts` | MODIFY | Add `serializeNotification(row): ApiNotification` (camelCase boundary, ISO timestamps, `targetParams` passthrough from jsonb) — same pattern as the existing `serializeOrder`/`serializeBranch`/`serializeDeal`/`serializeStaffOrderDetail` exports in this file. |
| `packages/api/src/lib/scheduler.ts` | CREATE | `createScheduler({ now = () => new Date(), intervalMs })` returning `{ start(), stop(), tick() }`. `tick()` is the injectable-clock entry point tests call directly (no real wall-clock wait needed for AC-5). `start()` wraps `tick` in `setInterval`. Evaluates registered trigger-check callbacks (empty registry in this plan — substrate only, per SPEC "does not require building the specific marketing campaigns"). |
| `packages/api/src/index.ts` | MODIFY (surgical, isolated line) | Add exactly one line: `app.use('/notifications', requireSession, notificationsRouter)` near the other `app.use('/orders', ...)` / `/branches` mounts — confirmed exact current mount block at lines 200-202 (`/branches`, `/deals`, `/orders`) and 206/212 (`/api/staff`, `/api/admin`). Do not touch the `/api/staff`/`/api/admin` block. Merge-risk note: `origin/dev/star` may add a `/rewards` mount nearby — this line is written as an isolated single-line insertion to minimize conflict surface. |
| `packages/api/.env.example` | MODIFY | Add `EXPO_ACCESS_TOKEN=` (commented, unset by default) documenting the log-fallback trigger, mirroring the existing `RESEND_API_KEY` precedent (confirmed present at lines 23-26 of the current file). |
| `packages/api/package.json` | MODIFY | Add `expo-server-sdk` dependency (confirmed absent from current `package.json` — genuinely new). |

### `packages/types`

| File | Action | Notes |
|---|---|---|
| `packages/types/src/notifications.ts` | MODIFY | `targetParams?: Record<string, string>` is already present on `AppNotification` (confirmed — no change needed there). Add `ApiNotification` / `DeviceTokenRegistration` request/response types if not already covering the wire shape (check existing `AppNotification` reuse first; only add new types for the device-token registration payload, which has no existing type). |

### `apps/mobile`

| File | Action | Notes |
|---|---|---|
| `apps/mobile/app.config.ts` | MODIFY | Add `'expo-notifications'` to the `plugins` array (no existing entry). |
| `apps/mobile/package.json` | MODIFY | Add `expo-notifications` dependency (confirmed absent — no `expo-notifications`/`expo-device`/`expo-application`/`expo-server-sdk` anywhere in the repo today; genuinely greenfield). |
| `apps/mobile/src/features/notifications/lib/notification-permission.ts` | MODIFY | Replace the `TODO(#75)` stub body: call `expo-notifications`'s `requestPermissionsAsync()` for the permission result (keep `shouldPromptPermission`/fire-once guard logic unchanged), and ADD a new exported `registerDeviceToken()` function that calls `Notifications.getExpoPushTokenAsync()` + `POST /notifications/device-tokens` with a stable device identifier (`expo-device`'s `Device.osInternalBuildId` or `expo-application`'s `Application.androidId`/`getIosIdForVendorAsync()` — confirm exact API via `vc-docs-seeker` at EXECUTE time, do not guess). **VALIDATE note: whichever of these two packages/methods is chosen does not change the `device_tokens` schema** — the `device_id` column is a plain `varchar NOT NULL` designed to accept any string identifier, so this is purely a call-site implementation detail, not a design fork; do not re-open the schema for this choice. Token registration is deliberately a SEPARATE function from permission request per the existing file's own doc comment ("token registration is a net-new call site"). |
| `apps/mobile/src/features/notifications/hooks/use-notifications.ts` | MODIFY | Swap `useState` seeded from `MOCK_NOTIFICATIONS` for a real fetch to `GET /notifications` (react-query, matching the `features/branch`/`features/menu` precedent — own `queryKey: ['notifications']`). Keep the external hook shape byte-identical: `{ notifications, unreadCount, markRead, marketingOptIn, setMarketingOptIn }` (confirmed current shape at lines 31-37 of the existing file). `markRead` becomes a mutation (needs a `PATCH /notifications/:id/read` route — see Open Item below). `marketingOptIn`/`setMarketingOptIn` currently a local `useState(DEFAULT_MARKETING_OPT_IN)` inside `NotificationsProvider` (confirmed) — must be swapped to read/write through `useAuth()`'s session `marketingOptIn` field via `authClient.updateUser`. |
| `apps/mobile/src/features/notifications/mock-notifications.ts` | DELETE | Dead once `use-notifications.ts` no longer imports it (confirm no other importer first). |
| `apps/mobile/src/features/auth/hooks/use-auth.ts` | MODIFY | Expose `marketingOptIn: boolean` derived from the session (mirrors `hasCompletedProfile: user?.onboardedAt != null`, confirmed pattern at line 196 of the existing file), so `use-notifications.ts` and the opt-in toggle screen can read it without a separate fetch. |
| `apps/mobile/src/app/(tabs)/account/notifications.tsx` | MODIFY | **VALIDATE confirmed exact path** (resolves plan Risk #5 — no vc-scout hunt needed at EXECUTE). This file IS both the notification list screen AND the marketing opt-in toggle screen (same file — confirmed at lines 57/80-82: it destructures `marketingOptIn`/`setMarketingOptIn` from `useNotifications()` and renders a `"Marketing notifications"` switch bound to them). Swap its toggle's `onValueChange={setMarketingOptIn}` local-state path for `authClient.updateUser({ marketingOptIn })`, same pattern as onboarding's `completeProfile()`. |

### Open Item flagged for EXECUTE (not a scope change, a locate-then-wire task)

- `markRead(id)` needs a real `PATCH /notifications/:id/read` route (small additive route in
  `notifications.ts`, session-scoped, sets `read_at`) — not called out as a separate touchpoint
  above because it's mechanically identical to the GET route's session-scoping; EXECUTE adds it in
  the same file.

## Public Contracts

- `GET /notifications` (session-gated via `requireSession`, mirrors `orders`/`branches` pattern —
  NOT `requireStaff`/`requireAdmin`) — returns the authenticated session's own rows only via
  `req.user!.id`, never a client-supplied `userId`. Response: array of `ApiNotification` matching
  mobile's `AppNotification` shape (id, type, title, body, targetScreen, targetParams, createdAt,
  readAt), newest-first.
- `POST /notifications/device-tokens` (session-gated) — body `{ deviceId, pushToken, platform }`.
  Upserts on `(user_id, device_id)` via Drizzle `.onConflictDoUpdate` — never inserts a duplicate
  row for the same device.
- `PATCH /notifications/:id/read` (session-gated) — sets `read_at`, 404 if the row doesn't belong
  to the caller (never leak existence of another user's row).
- `dispatchOrderNotification(order, event)` — internal function contract, event ∈
  `'accepted' | 'preparing' | 'ready' | 'cancelled'` only (narrowed from the old
  `'completed' | 'rejected' | 'cancelled'` stub signature — this IS a breaking internal signature
  change, confined to `staff.ts`'s call sites only — not a public/external API contract, so it
  does not require a deprecation window).
- `dispatchMarketingNotification(userId, type, payload)` — internal function contract. MUST check
  `marketing_opt_in` before any write/send, unconditionally, including scheduler-triggered calls —
  no code path may bypass this check (SPEC constraint, verbatim).
- `marketingOptIn` better-auth `additionalFields` entry — client-writable (`input: true`) on the
  caller's own record only, same trust boundary as `birthday`/`address`/`onboardedAt`.
- Idempotent dedupe: deterministic id convention (`order:${orderId}:${status}`) is enforced at the
  application layer (a `SELECT` check before `INSERT` in `dispatchOrderNotification`), NOT a DB
  unique constraint on a derived id column — the `notifications` table's PK stays a plain
  `defaultRandom()` uuid (no schema change to the PK). This is a design choice to avoid widening
  the `notifications` migration risk; document as accepted in Risks below.

## Blast Radius

- **Packages touched:** `packages/api` (schema, routes, lib, migration), `packages/types`
  (additive types only), `apps/mobile` (2 feature dirs + config + package.json), root
  `.env.example` pattern (via `packages/api/.env.example`).
- **File count:** ~17 files (7 new, 10 modified), 1 deleted (`mock-notifications.ts`).
- **Risk class:** schema/migration (new table + new column — additive only, no breaking change to
  `users`/`orders`), new external dependency (`expo-server-sdk`, `expo-notifications`), new API
  surface (`/notifications`, session-gated — not auth/admin, but still a new authenticated
  surface). No billing/payments surface touched.
- **Merge-risk surface (per SPEC Risks section):** `packages/api/src/index.ts` router-mount block
  (isolated single-line insertion) and `packages/api/src/routes/staff.ts`'s shared call-site block
  with `origin/dev/star`'s pending `STAR-002` work — both mitigated by touching only the exact
  minimal lines named in Touchpoints above, never reflowing `creditStarsForOrder`.

## Migration `0007` DDL Summary

Generated via `drizzle-kit generate` after schema edits (do not hand-write SQL — confirm the exact
generated filename/slot number at EXECUTE time; last is `0006_legal_daredevil.sql`, this repo has
had repeated renumbering churn from parallel branches per SPEC background — re-check
`packages/api/drizzle/` immediately before generating). **VALIDATE re-confirmed (14-07-26) via
`packages/api/drizzle/meta/_journal.json`: the last landed migration is still
`0006_legal_daredevil.sql` (idx 6) — nothing has landed on `development` since PLAN was written
that would shift the `0007` slot. Re-check again immediately before EXECUTE runs `drizzle-kit
generate` regardless, per the standing renumbering-churn risk.**

```sql
CREATE TABLE device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  device_id varchar NOT NULL,
  push_token varchar NOT NULL,
  platform varchar NOT NULL,
  last_seen_at timestamp DEFAULT now() NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT device_tokens_user_device_unique UNIQUE (user_id, device_id)
);

ALTER TABLE notifications ADD COLUMN target_params jsonb;
```

Both changes are purely additive (new table, nullable new column) — no `notNull()` on
`target_params`, matching the `birthday`/`address`/`onboardedAt` precedent. No existing
`users`/`orders`/`notifications` row is broken by this migration.

## `notifyCustomer` Exact Diff Scope

Confirms the INNOVATE decision precisely, so EXECUTE cannot silently widen it. **Updated by
VALIDATE (14-07-26) after a direct read of `packages/api/src/routes/staff.ts` — see the
Touchpoints table row above for the full corrected description:**

1. **Stub body (lines ~45-55):** replace with a thin call to
   `dispatchOrderNotification(order, event)` where `event` is now typed
   `'accepted' | 'preparing' | 'ready' | 'cancelled'` (was `'completed' | 'rejected' | 'cancelled'`).
2. **Call sites (lines ~286-296):** the `PATCH` handler's step-8 `if/else if` block today has
   EXACTLY 3 arms — `completed`, `rejected`, `cancelled` — confirmed by direct file read, no
   `accepted`/`preparing`/`ready` arms exist yet. (Do not confuse this block with the earlier,
   unrelated `targetStatus === 'ready'` arm at ~line 264, which only sets `ready_at` and has
   nothing to do with `notifyCustomer`.) EXECUTE must: ADD 3 new arms (`accepted`, `preparing`,
   `ready`), each a minimal `else if (targetStatus === '<status>')` mirroring the existing pattern,
   calling `notifyCustomer(updatedOrder, '<status>')`; CHANGE the `cancelled` arm's existing call
   to the new 4-value type (call shape itself is unchanged); REMOVE the `completed` and `rejected`
   arms' `notifyCustomer(...)` calls entirely.
3. **`creditStarsForOrder(updatedOrder)`** on the `'completed'` branch: **zero-diff, byte-for-byte
   untouched.** This is a hard constraint from both SPEC and INNOVATE — verify with `git diff`
   during EXECUTE that this line is unchanged.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api test -- device-tokens` — register token, re-register same device with new token value, assert single updated row | Fully-Automated | AC-1 |
| `pnpm --filter @jojopotato/api test -- staff-order-status` (extends `staff-order-status.integration.test.ts`) — drive all 4 transitions (`accepted`/`preparing`/`ready`/`cancelled`) via `PATCH /api/staff/orders/:orderId`, assert exactly 1 notification row + 1 mocked push-send call per transition, assert `completed`/`rejected`/`pending` trigger zero customer pushes | Fully-Automated | AC-2 |
| `pnpm --filter @jojopotato/api test -- marketing-opt-in` — for each of the 5 marketing types, assert zero row/send when `marketing_opt_in=false`, assert send succeeds when `true`; separately assert an order-status push still sends for an opted-out user | Fully-Automated | AC-3 |
| `pnpm --filter @jojopotato/api test -- notifications` — seed rows for 2 users, call `GET /notifications` as user A, assert only A's rows returned newest-first with fields matching insert | Fully-Automated | AC-4 |
| `pnpm --filter @jojopotato/api test -- scheduler` — configure a trigger with a short injected-clock window, call `tick()` directly (no real wall-clock wait), assert the trigger fires exactly once within window and not before/after | Fully-Automated | AC-5 |
| `pnpm --filter @jojopotato/api test -- push-provider` — run a send with `EXPO_ACCESS_TOKEN` unset, assert notification row created, assert no outbound HTTP call attempted (SDK client mocked to fail the test if invoked) | Fully-Automated | AC-6 |
| Manual walkthrough: place order, staff transitions accepted → preparing → ready, confirm each transition appears in the signed-in customer's in-app notification list without app restart | Agent-Probe | AC-7 (no RN test runner exists — project-wide gap, per `process/context/tests/all-tests.md`) |
| `pnpm --filter @jojopotato/api typecheck` | Fully-Automated | Type-safety regression gate (not a numbered AC, but required before EXECUTE closeout) |
| `pnpm --filter @jojopotato/api lint` | Fully-Automated | Lint regression gate |
| `pnpm --filter @jojopotato/mobile typecheck` | Fully-Automated | Mobile-side type-safety regression gate (`notification-permission.ts`, `use-notifications.ts`, `use-auth.ts` changes) |
| `pnpm --filter @jojopotato/api test` (full suite) | Fully-Automated | No regression to existing 84+ tests (auth, staff authz, branches, orders, deals, staff-order-status) |
| Manual: mobile opt-in toggle → `authClient.updateUser({ marketingOptIn })` round-trip, confirm persisted value survives session refetch | Hybrid | Confirms `marketingOptIn` additionalField wiring works against the real better-auth adapter (precondition: local Postgres + docker compose running) |

### High-Risk Class Table

| Area | High-risk class | Minimum tier | Gap rationale if known-gap accepted |
|---|---|---|---|
| Device-token registration (writes to `device_tokens`, cross-references `users`) | schema/migration | Hybrid | — (Fully-Automated achieved, exceeds minimum) |
| `/notifications` new authenticated route | trust-boundary (session-scoped, could leak cross-user data if `req.user!.id` filter is dropped) | Hybrid | — (Fully-Automated achieved) |
| Live Expo push delivery (real device receives a real push) | none of the 6 named high-risk classes, but flagged as untestable-in-CI | Known-Gap | No live Expo push credentials in CI/dev by design (SPEC constraint); log-fallback path (AC-6) is the automated substitute. Real delivery is an operational follow-up once production credentials are provisioned (out of scope per SPEC). |

### Missing Test Areas

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| Real on-device push receipt (banner/sound/badge) | Requires live provider creds + physical/simulator device; no RN test runner in repo | Backlog note (see Test Infra Improvement Notes) — Agent-Probe walkthrough recommended once live creds are provisioned, not blocking this plan |
| Scheduler running under real `setInterval` at production tick rate (as opposed to `tick()` called directly) | Would require real wall-clock waits in CI, explicitly not required per SPEC AC-5 | Accepted — `tick()` direct-call coverage is the documented sufficient proof per SPEC |

## Test Infra Improvement Notes

(none identified yet)

## Risks

1. **Merge conflict vs `origin/dev/star`** (SPEC-documented) — `packages/api/src/index.ts` router-mount
   block and `staff.ts`'s call-site block. Mitigation: isolated single-line router mount, surgical
   call-site diff, `creditStarsForOrder` byte-for-byte untouched. If the conflict still
   occurs at merge time, it is a mechanical resolve (two independent additive lines), not a logic
   conflict.
2. **Migration slot renumbering churn** (SPEC-documented, repeated pattern in this repo) — confirm
   the actual next slot number immediately before running `drizzle-kit generate`, do not hard-assume
   `0007`. **VALIDATE re-confirmed 0007 is still the correct next slot as of 14-07-26** (see
   Migration section above) — re-verify again at EXECUTE time regardless.
3. **Application-layer idempotency (not DB-enforced)** — the `SELECT`-before-`INSERT` dedupe check
   in `dispatchOrderNotification` has a narrow race window under concurrent identical calls (same
   order+status patched twice near-simultaneously). Accepted risk: the existing `PATCH` route
   already has a compare-and-swap guard (`WHERE ... AND status = order.status`) that makes a
   duplicate identical-transition call structurally rare (a second identical PATCH 409s before
   reaching the notify call). Documented, not re-engineered with a DB constraint in this pass.
4. **`expo-notifications`/device-identifier API exact method names** — RESEARCH did not lock which
   of `expo-device`/`expo-application` API to use for a stable device id. EXECUTE MUST invoke
   `vc-docs-seeker` before writing this call site (per the standard Library API References rule) —
   do not guess the method signature. **VALIDATE confirmed this choice does NOT change the
   `device_tokens` schema** (`device_id` is a generic `varchar NOT NULL`, accepts any string
   identifier regardless of which API produces it) — this is a call-site detail only, not a design
   fork requiring a return to PLAN.
5. **Opt-in toggle screen exact file path** — SPEC referenced it as "already built" but RESEARCH did
   not pin the exact file path. **RESOLVED by VALIDATE:** the file is
   `apps/mobile/src/app/(tabs)/account/notifications.tsx` — confirmed by direct grep (it is the
   SAME file as the in-app notification list screen; the toggle is rendered inline from
   `useNotifications()`'s `marketingOptIn`/`setMarketingOptIn`). EXECUTE no longer needs a
   vc-scout hunt for this touchpoint.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/rewards-notifications/active/push-notifications-api_14-07-26/push-notifications-api_PLAN_14-07-26.md`
2. **Last completed phase or step:** VALIDATE (this file). Gate: PASS — see Validate Contract below.
3. **Validate-contract status:** written 14-07-26, Gate: PASS.
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`, locked SPEC (path above), `process/development-protocols/orchestration.md`, `process/development-protocols/implementation-standards.md`, `process/development-protocols/plan-lifecycle.md`.
5. **Next step for a fresh agent picking up mid-execution:** run `ENTER EXECUTE MODE` on this plan file. If EXECUTE has already started, check `git diff` against the exact touchpoint list above and cross-reference against the "`notifyCustomer` Exact Diff Scope" section to confirm no unintended widening (especially: `creditStarsForOrder` line must remain untouched, `staff.ts` call sites must be limited to the 3 new arms + 1 renamed call + 2 removed calls described above).

## Deviations (EXECUTE, 14-07-26)

All within-blast-radius (schema/migration + mobile device-id call site already covered by the
validate-contract). None are hard-stop class. Documented per /goal autonomous-execution rules.

1. **`users.marketing_opt_in` column ADDED (not in the plan's DDL summary).** The plan's Migration
   `0007` DDL Summary listed only `device_tokens` + `notifications.target_params`, but the
   plan-specified `marketingOptIn` better-auth `additionalField` (`input:true`, boolean) REQUIRES a
   backing column on the `users` table — better-auth's drizzle adapter maps every additionalField to
   a column (exactly as `birthday`/`address`/`onboardedAt` each have one). Without it, `updateUser`
   would fail at the DB layer and AC-3 could not persist. **Impact:** additive nullable boolean,
   same schema/migration blast radius + same precedent the contract already blesses; zero breakage.
   Generated migration is `0007_wet_ser_duncan.sql` (device_tokens + FK + index,
   `users.marketing_opt_in`, `notifications.target_params`) — all additive.
2. **`expo-application` dependency added (mobile).** The plan named `expo-device`/`expo-application`
   as the device-id source options (Touchpoint 16, Risk #4) but only listed `expo-notifications` in
   the package.json touchpoint. `expo-application` (`getIosIdForVendorAsync()` / `getAndroidId()`)
   is the per-device-stable choice; `expo-device.osInternalBuildId` is NOT per-device (shared across
   an OS build), so it was rejected. API confirmed from the installed `.d.ts` (not guessed).
3. **`notifyCustomer` made `async` + `await`ed at call sites.** The plan said the `cancelled` call
   shape is "unchanged"; the added `await` (in an already-async handler) is the minimal change
   needed so the notification row is persisted before the PATCH response — deterministic for AC-2.
   `dispatchOrderNotification` still never throws, so a push failure cannot break the transition.
4. **`DEFAULT_MARKETING_OPT_IN` relocated to the pure `notification-factory.ts` (mobile).** Wiring
   `useNotifications` to `useAuth` made the hook module transitively load `expo-modules-core`, which
   the node-env pure-TS vitest cannot strip-load — this broke the existing `notification-factory.test.ts`
   (which imported the constant from the hook). Moved the constant to the pure module, re-exported it
   from `use-notifications` for runtime consumers, and repointed the one test import. Mobile test
   suite restored to green (13/13).
5. **Opt-in toggle screen — no edit needed.** Plan item 19 said to swap the toggle's `onValueChange`
   to `authClient.updateUser`. Since `useNotifications().setMarketingOptIn` now routes through
   `useAuth().setMarketingOptIn` → `authClient.updateUser` + session refetch, the screen already
   persists correctly through the existing binding — the indirection satisfies the contract without
   touching `notifications.tsx`.

## Validate Contract

Status: PASS
Date: 14-07-26
date: 2026-07-14
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 2/7 (S6 high-risk class present: schema/migration + new session-gated API surface; S7 not met — 17 files is close to but under the "5+ files" threshold's real signal, which is really about independent parallelizable directions, not raw count — this is ONE coherent, sequentially-dependent backend-then-mobile feature, not N independent directions). Layer 1 (4 dimension agents) + Layer 2 (7 section agents) fan-out was run as lightweight parallel subagents (Tier 1) for this VALIDATE pass itself — no cross-agent coordination was needed since each section maps to a disjoint file group. EXECUTE itself should run sequential/single-agent: the touchpoints are ordered dependencies (schema → routes → staff.ts rewrite → mobile wiring), not independent parallel work.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | Device token registered once per device; rotation updates not duplicates | Fully-Automated | `pnpm --filter @jojopotato/api test -- device-tokens` | A |
| AC-2 | Exactly 4 transitions (accepted/preparing/ready/cancelled) each fire exactly 1 notification row + 1 push-send attempt; no other status fires a push | Fully-Automated | `pnpm --filter @jojopotato/api test -- staff-order-status` | A |
| AC-3 | Marketing opt-in gates all 5 marketing types; never gates the 4 transactional types | Fully-Automated | `pnpm --filter @jojopotato/api test -- marketing-opt-in` | A |
| AC-4 | GET /notifications returns only caller's own rows, newest-first, matching AppNotification shape | Fully-Automated | `pnpm --filter @jojopotato/api test -- notifications` | A |
| AC-5 | Scheduler tick() fires a configured trigger exactly once within its window via injected clock | Fully-Automated | `pnpm --filter @jojopotato/api test -- scheduler` | A |
| AC-6 | Send pipeline safe/observable with provider creds unset — row created, no outbound call | Fully-Automated | `pnpm --filter @jojopotato/api test -- push-provider` | A |
| AC-7 | Mobile notification list reflects real transitions end-to-end, register→trigger→see-in-list | Agent-Probe | Manual walkthrough: place order, staff transitions accepted→preparing→ready, confirm each appears without app restart | D |
| type-safety (api) | No type regressions from schema/route changes | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` | A |
| lint (api) | No lint regressions | Fully-Automated | `pnpm --filter @jojopotato/api lint` | A |
| type-safety (mobile) | No type regressions from notification-permission/use-notifications/use-auth changes | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` | A |
| full regression (api) | No regression to existing 84+ tests | Fully-Automated | `pnpm --filter @jojopotato/api test` | A |
| marketingOptIn round-trip | additionalField wiring works against real better-auth adapter | Hybrid | Manual: toggle → `authClient.updateUser({ marketingOptIn })` → confirm persisted value survives session refetch (precondition: local Postgres + docker compose running) | A |
| Live on-device push receipt (banner/sound/badge) | Real provider delivery, out of CI reach | Known-Gap | — no automated proof possible without live creds; log-fallback (AC-6) is the automated substitute | C — deferred until live Expo/APNs/FCM credentials are provisioned (operational follow-up, out of scope per SPEC) |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column above carries only Fully-Automated / Hybrid / Agent-Probe. The one Known-Gap row (live push receipt) is a named residual carried via gap-resolution C, not a proving strategy.

Legacy line form (retained so existing validate-contract consumers still parse):
- Device tokens (AC-1): Fully-automated: `pnpm --filter @jojopotato/api test -- device-tokens`
- Order-status push dispatch (AC-2): Fully-automated: `pnpm --filter @jojopotato/api test -- staff-order-status`
- Marketing opt-in gating (AC-3): Fully-automated: `pnpm --filter @jojopotato/api test -- marketing-opt-in`
- GET /notifications (AC-4): Fully-automated: `pnpm --filter @jojopotato/api test -- notifications`
- Scheduler (AC-5): Fully-automated: `pnpm --filter @jojopotato/api test -- scheduler`
- Push-provider log-fallback (AC-6): Fully-automated: `pnpm --filter @jojopotato/api test -- push-provider`
- Mobile end-to-end list (AC-7): agent-probe: manual walkthrough (no RN runner exists, project-wide gap)
- marketingOptIn round-trip: hybrid: manual toggle round-trip + local Postgres precondition
- Live push receipt: known-gap: documented, no live creds in CI/dev by design

### Failing stubs (Fully-Automated rows only)

```
Failing stub (AC-1):
test("should update the same device row when a token rotates instead of inserting a duplicate", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: device token upsert-on-device (AC-1)")
})

Failing stub (AC-2):
test("should write exactly 1 notification row + 1 push-send attempt per accepted/preparing/ready/cancelled transition, and zero for completed/rejected/pending", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: notifyCustomer 4-event coverage (AC-2)")
})

Failing stub (AC-3):
test("should block all 5 marketing types when marketing_opt_in=false and never block the 4 transactional types", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: marketing opt-in gating (AC-3)")
})

Failing stub (AC-4):
test("should return only the caller's own notification rows, newest-first", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: GET /notifications session-scoping (AC-4)")
})

Failing stub (AC-5):
test("should fire a configured trigger exactly once within its window using an injected clock", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: scheduler tick() (AC-5)")
})

Failing stub (AC-6):
test("should create the notification row and attempt no outbound HTTP call when EXPO_ACCESS_TOKEN is unset", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: push-provider log-fallback (AC-6)")
})
```

Dimension findings:
- Infra fit: PASS — `/notifications` router mount follows the exact existing `app.use('/orders', ordersRouter)` pattern (confirmed at `packages/api/src/index.ts` lines 200-202), session-gated via `requireSession` (not `requireStaff`/`requireAdmin` — correct, this is a customer-facing surface). No container/port/proxy surface touched — pure Express route addition.
- Test coverage: PASS — all 6 numbered ACs (AC-1 through AC-6) achieve Fully-Automated, exceeding the Hybrid minimum required for the 2 high-risk-class areas (device-token writes, new authenticated route). AC-7 is correctly Agent-Probe (project-wide RN-runner gap, not a plan defect). One Known-Gap (live push receipt) is properly justified and non-blocking per SPEC's explicit out-of-scope stance on live provider credentials.
- Breaking changes: PASS — DB changes are additive only (new table, nullable new column, matches `birthday`/`address`/`onboardedAt` precedent). The `dispatchOrderNotification`/`notifyCustomer` signature narrowing is an internal function contract confined to 2 call sites inside `staff.ts` — not a public/external API, no deprecation window needed. New `/notifications` routes are pure additions, no existing route contract changes.
- Security surface: PASS — `GET /notifications` and `PATCH /notifications/:id/read` both scope strictly to `req.user!.id` from the session (never a client-supplied `userId`), matching the `orders`/`branches` precedent; the PATCH route 404s (not 403) on a foreign row to avoid existence leakage, per the plan's own Public Contracts section. `marketing_opt_in` gating is checked unconditionally before any marketing send (SPEC hard constraint), verified by a dedicated AC-3 test. `marketingOptIn` additionalField is `input:true` on the caller's own record only — same trust boundary as the existing `birthday`/`address`/`onboardedAt` fields, no privilege widening.
- Section A — Schema/migration (device_tokens, target_params): PASS — mechanically feasible; `packages/api/src/db/schema/` and `index.ts` export pattern confirmed; migration slot 0007 re-confirmed correct via `_journal.json` (last is `0006_legal_daredevil.sql`); both DDL changes additive, no `notNull()` widening.
- Section B — better-auth marketingOptIn additionalField: PASS — exact block/pattern to replicate confirmed at `packages/api/src/lib/auth.ts` lines 76-88 (`birthday`/`address`/`onboardedAt`, all `input:true`); no conflicts.
- Section C — push-provider.ts + env fallback: PASS — `RESEND_API_KEY`-unset log-fallback precedent confirmed present verbatim in `packages/api/.env.example` (lines 23-26); the planned `EXPO_ACCESS_TOKEN` pattern is coherent and directly mirrors it.
- Section D — notifyCustomer/notification-dispatch rewrite (staff.ts): PASS (was CONCERN — RESOLVED by this validate pass). Direct file read found the call-site if-chain (lines 288-296) currently has exactly 3 arms (`completed`/`rejected`/`cancelled`), no `accepted`/`preparing`/`ready` arms exist. Plan's Touchpoints table and Diff Scope section have been corrected in this VALIDATE pass to state EXECUTE must ADD 3 new arms rather than "add a call to an existing branch" — removes ambiguity for EXECUTE. Highest-risk edit: accidentally reflowing the `creditStarsForOrder(updatedOrder)` line on the `completed` arm — mitigated by the plan's explicit git-diff verification instruction.
- Section E — /notifications routes + serializer: PASS — session-scoping pattern matches `orders.ts`/`branches.ts` exactly (`requireSession` import confirmed); `serializeNotification` follows the same pattern as 6 existing serializer exports in `serializers.ts`.
- Section F — scheduler substrate: PASS — genuinely new file, no naming/export conflicts found.
- Section G — mobile wiring (permission, use-notifications, use-auth, opt-in toggle): PASS (was CONCERN — RESOLVED). Device-id API choice (expo-device vs expo-application) confirmed to be a mechanical docs-lookup, not a runtime probe candidate — `device_tokens.device_id` is a generic string column, schema is unaffected by which API is chosen (no VC-FEASIBILITY-PROBE-NEEDED warranted; EXECUTE's existing instruction to run `vc-docs-seeker` first is sufficient). Opt-in toggle screen file path confirmed exact: `apps/mobile/src/app/(tabs)/account/notifications.tsx` (same file as the notification list screen), resolving plan Risk #5.

Open gaps: Live on-device push receipt (banner/sound/badge) — known-gap: documented, no live Expo/APNs/FCM credentials available in CI/dev by design (SPEC-explicit out-of-scope decision); AC-6's log-fallback path is the automated substitute proof. No backlog note required — this is an already-documented, already-justified SPEC-level scope boundary, not an unplanned gap.

What this coverage does NOT prove:
- AC-1 device-tokens test proves single-row-per-device upsert logic; it does NOT prove the mobile-side `registerDeviceToken()` call site actually invokes the endpoint correctly at runtime (that's covered only by the AC-7 Agent-Probe walkthrough).
- AC-2 staff-order-status test proves server-side dispatch-per-transition; it does NOT prove the push actually renders as a banner/sound/badge on a physical device (Known-Gap, no live creds).
- AC-3 marketing-opt-in test proves the gate function's behavior server-side; it does NOT prove the mobile toggle UI correctly persists the flag through `authClient.updateUser` end-to-end (that's the separate Hybrid manual gate).
- AC-4 notifications test proves session-scoped row isolation server-side; it does NOT prove the mobile `useNotifications()` hook correctly renders the fetched list (Agent-Probe, AC-7).
- AC-5 scheduler test proves `tick()` fires correctly under an injected clock; it does NOT prove the real `setInterval`-driven production tick rate behaves identically (explicitly accepted per SPEC AC-5 — not required).
- AC-6 push-provider test proves no outbound call is attempted when creds are unset; it does NOT prove what happens when creds ARE set and a live send is attempted (no live-credential path exists in this plan by design).
- The Hybrid marketingOptIn round-trip gate proves persistence survives a session refetch; it does NOT prove the toggle UI's visual state or animation — purely a data-persistence check.
(Required until C3 is implemented — temporary C3 mitigation)

Gate: PASS (no FAILs, plan updated — Sections D and G's CONCERNs resolved via direct file verification and plan-text correction applied in this VALIDATE pass, no unresolved items remain)
Accepted by: session (autonomous, /goal execution) — plan-update mitigations applied directly rather than carried forward as CONDITIONAL, per the orchestrator's autonomy grant for this VALIDATE pass.

## Autonomous Goal Block

SESSION GOAL: Ship real push-notification backend integration (PUSH-004 / #75) — device tokens, notifications.target_params, expo-server-sdk send pipeline with log-fallback, marketing opt-in gating, in-process scheduler substrate, and mobile-side real data wiring.
Charter + umbrella plan: N/A — single plan, not a phase program.
Autonomy: /goal-style autonomous execution granted by user through VALIDATE ("go, don't ask until it's time to execute"). EXECUTE still requires explicit "ENTER EXECUTE MODE" per this repo's approval gate — autonomy through VALIDATE does not itself constitute EXECUTE consent.
Hard stop conditions / safety constraints:
- Do not touch `creditStarsForOrder(updatedOrder)` on the `completed` branch in `staff.ts` — must remain byte-for-byte untouched (verify via `git diff`).
- Do not widen `notifyCustomer`'s scope beyond the 4 transactional events (`accepted`/`preparing`/`ready`/`cancelled`) — `completed`/`rejected` calls must be removed, not repurposed.
- Marketing sends must always check `marketing_opt_in` before writing/sending, unconditionally, including scheduler-triggered calls — no bypass path.
- Do not touch the `/api/staff`/`/api/admin` router-mount block in `packages/api/src/index.ts` — only add the isolated `/notifications` mount line.
- Do not hand-write migration SQL — always regenerate via `drizzle-kit generate` and re-confirm the actual next slot number immediately before running it (renumbering-churn precedent).
- Do not attempt a live Expo push send in CI/dev — the log-fallback path must remain the default when `EXPO_ACCESS_TOKEN` is unset.
Next phase: EXECUTE — `process/features/rewards-notifications/active/push-notifications-api_14-07-26/push-notifications-api_PLAN_14-07-26.md`
Validate contract: inline in plan (this file, `## Validate Contract` section above)
Execute start: `pnpm --filter @jojopotato/api test -- device-tokens` (first Fully-Automated red stub) | AC-7 Agent-Probe walkthrough scenario: place order → staff transitions accepted→preparing→ready → confirm each appears in customer's in-app list without restart | high-risk pack: no (schema/migration + new session-gated API surface present, but additive-only with existing precedent — not classified as requiring the full 5-artifact evidence pack; standard Verification Evidence gates are sufficient per the High-Risk Class Table above)
