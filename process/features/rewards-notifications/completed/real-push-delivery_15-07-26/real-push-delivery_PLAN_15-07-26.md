---
name: plan:real-push-delivery
description: "Implementation plan for real OS-level push delivery hardening (iOS+Android) on top of PUSH-004 — platform validation, background/killed-app payload shaping, ticket-based token pruning, app.config background mode, credential runbook doc"
date: 15-07-26
feature: rewards-notifications
---

# PLAN — Real Device Push Delivery (iOS + Android)

**Date**: 15-07-26
**Status**: VALIDATED (PASS, PVL cycle 2) — ready for EXECUTE
**Complexity**: COMPLEX (single plan, NOT a phase program). No new schema/migration, but touches a
provider-transport contract (`sendPush` return signature), a shared dispatch seam used by both
transactional and marketing sends, and a mobile native-config file. 3 packages touched
(`packages/api`, `apps/mobile`, docs), ~8 files.

Locked SPEC: `process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_SPEC_15-07-26.md`

INNOVATE decision (locked, not re-litigated): **Path A** — harden the existing `expo-server-sdk`
Expo-relay transport in place. No new native dependency, no transport swap, no parallel pipeline.

## Overview

PUSH-004 shipped a push notification backend that has never had real credentials, so `sendPush()`
has only ever hit its log-fallback branch. This plan makes the *code around* that seam correct for
when real credentials eventually exist, entirely provable today with `EXPO_ACCESS_TOKEN` unset:

1. `device_tokens.platform` is validated to `'ios' | 'android'` only, at the **API boundary**
   (Zod enum) — no DB schema/migration change, no widening of the just-landed (uncommitted)
   `0008_amusing_night_nurse.sql` migration.
2. `push-provider.ts`'s outbound `ExpoPushMessage` gains the background/killed-app-capable fields
   (`priority: 'high'`, `_contentAvailable: true`) alongside the existing visible title/body, so a
   killed app still gets woken to process the notification instead of relying purely on the OS's
   default visible-alert handling.
3. `sendPush()`'s return type changes from `Promise<void>` to `Promise<PushSendResult[]>` so callers
   can see per-token outcomes; a new shared `sendAndPrune()` helper in `notification-dispatch.ts`
   hard-deletes a `device_tokens` row when the Expo SDK reports a permanent per-token error
   (`DeviceNotRegistered`), leaving transient errors untouched. This uses **ticket-level** errors
   returned synchronously from `sendPushNotificationsAsync`, not a deferred receipt-polling step —
   see Open Design Decision 2 below for why, and the accepted Known-Gap this leaves.
4. `apps/mobile/app.config.ts`'s existing bare `'expo-notifications'` plugin entry becomes a
   `['expo-notifications', { enableBackgroundRemoteNotifications: true }]` tuple — the Expo
   config-plugin property that wires the `remote-notification` `UIBackgroundModes` entitlement on
   iOS, without any secret file needing to exist in the repo.
5. A standalone, human-readable credential-provisioning runbook doc is written for the user
   (Firebase project, APNs key, EAS credential upload) — documentation, not code, reviewed by the
   user as its own verification.

No `device_tokens` table shape change, no new migration, no new package dependency.

## Goals

1. `POST /notifications/device-tokens` rejects any `platform` value other than `'ios'`/`'android'`
   with a validation error and writes no row (AC-1).
2. The outbound push payload for all 4 transactional order-status notification types includes the
   fields required for background/killed-app delivery, verifiable by inspecting the constructed
   message object without a live send (AC-2).
3. A permanent per-token delivery failure (`DeviceNotRegistered`) deletes that device's
   `device_tokens` row; a transient failure leaves it untouched — applies to both order-status and
   marketing sends via one shared helper (AC-3).
4. `apps/mobile/app.config.ts` declares the background-delivery config-plugin property, and no
   secret/credential file needs to exist in the repo for `apps/mobile` typecheck/lint/build to pass
   (AC-4).
5. A written, human-executable credential-provisioning checklist exists for the user (AC-5).
6. Every in-scope automated criterion (AC-1, AC-2, AC-3, AC-4, and the full regression run, AC-7)
   passes with `EXPO_ACCESS_TOKEN` unset — zero live network calls, zero new manual CI setup (AC-7).
7. Real on-device delivery (AC-6) is explicitly out of agent-execution scope — documented as a
   manual, credential-gated Agent-Probe walkthrough for the user, not claimed as automated.

## Scope

In scope: platform validation at the API boundary (`notifications.ts`), background/killed-app
payload shaping (`push-provider.ts`), ticket-based permanent-error token pruning
(`push-provider.ts` + `notification-dispatch.ts`), `apps/mobile/app.config.ts` background-mode
plugin config, credential-provisioning runbook doc.

Out of scope (verbatim from SPEC): actually creating Firebase/APNs/EAS credentials; transport
replacement (`firebase-admin`/RN Firebase); marketing/scheduler push going live; rich/interactive
push features; push analytics/receipts dashboard; Android notification channel customization; a
device-token health/monitoring admin view; receipt-based (delayed, ~15-minute) invalidity
detection via `getPushNotificationReceiptsAsync` (see Open Design Decision 2).

## Open Design Decisions (PLAN's call, per INNOVATE's deferred Open Questions 2–4)

**1. `platform` tightening mechanism — Zod-validated string union at the API boundary, NOT a
Postgres enum.** The column stays `varchar('platform').notNull()`. Rationale: zero migration risk
(the `0008_amusing_night_nurse.sql` migration is already generated-but-uncommitted for an unrelated
change — `users.marketing_opt_in` NOT NULL + `device_tokens` unique-constraint rename; adding a
Postgres enum type here would require yet another migration touching the same table in the same
uncommitted window, raising collision risk for no behavioral benefit). A Zod union at the API
boundary gives the exact same AC-1 guarantee (invalid values rejected, no row written) with zero
schema churn, and matches the existing pattern already used for every other write-time validation
in this router (`deviceTokenSchema` is already a Zod object).

**2. Token-invalidation pruning — ticket-level error inspection + hard-delete, NOT receipt-polling
+ soft-delete.** Two independent sub-decisions:
   - **Hard-delete, not `is_active`/`invalidated_at` soft-delete.** No other code path in this repo
     ever needs to see a "this token used to exist" record — `device_tokens` has no audit/history
     consumer. A soft-delete column would need a migration (schema change) for a value nothing
     reads. Hard-delete is simpler, matches KISS, and produces the exact same customer-visible
     outcome SPEC AC-3 asks for ("no further sends are attempted to it").
   - **Ticket-level errors, not `getPushNotificationReceiptsAsync` receipt polling.** Expo's fully
     correct long-term mechanism for `DeviceNotRegistered` detection is a *two-phase* flow: send
     returns tickets immediately, then the caller must poll `getPushNotificationReceiptsAsync`
     roughly 15+ minutes later for the delivery receipt that actually carries the error detail.
     Building that polling loop (needs persistent ticket storage + a scheduler-driven delayed
     check) is materially larger scope than this SPEC's AC-3 asks for, and AC-3's own proving
     test ("mock the provider's response to return a permanent-error receipt ... in the same send
     batch") describes a **synchronous**, same-call assertion — not a deferred poll. This plan
     therefore inspects the `status`/`details.error` fields Expo's SDK already attaches to each
     **ticket** in the `sendPushNotificationsAsync` response (some malformed/known-dead tokens are
     rejected at ticket time, not only at receipt time) and treats a `DeviceNotRegistered` ticket
     error as the prune signal. **Accepted Known-Gap:** a token that fails only at the *receipt*
     stage (the common case — most `DeviceNotRegistered` failures manifest there, not at the
     ticket) will NOT be pruned by this pass; it is left as a documented follow-up (see Missing Test
     Areas / Test Infra Improvement Notes) for a future receipt-polling phase once real send volume
     exists to justify it. This keeps today's change entirely provable without live credentials
     and without a new persistence layer.

**3. Where background-payload construction lives — inside `push-provider.ts`'s existing message
builder, not a new dedicated module.** `sendPush()` already owns `ExpoPushMessage` construction;
adding `priority`/`_contentAvailable` there is a same-function, same-responsibility change. A
separate payload-builder module would only be justified if multiple distinct message shapes needed
composing, which is not the case here (all 4 transactional types share one shape).

## Acceptance Criteria

Maps 1:1 to SPEC AC-1 through AC-7 (see Verification Evidence table for the exact proving gate per
criterion).

1. Registering a device with `platform` outside `{'ios','android'}` returns a validation error and
   writes no row; `'ios'`/`'android'` continue to succeed exactly as today (AC-1).
2. The constructed `ExpoPushMessage` for each of the 4 transactional notification types includes
   `priority: 'high'` and `_contentAvailable: true` alongside the existing title/body/sound (AC-2).
3. A send batch containing one token with a ticket-level `DeviceNotRegistered` error and one token
   with a transient/other ticket error results in exactly the first row deleted and the second row
   unchanged — proven for both `dispatchOrderNotification` and `dispatchMarketingNotification` via
   the shared `sendAndPrune()` helper (AC-3).
4. `apps/mobile/app.config.ts`'s `expo-notifications` plugin entry is a tuple with
   `enableBackgroundRemoteNotifications: true`; `apps/mobile` typecheck/lint/build all still pass
   with no `google-services.json`/`GoogleService-Info.plist` present in the repo (AC-4).
5. A credential-provisioning runbook doc exists at the path specified in Touchpoints, reviewed by
   the user (AC-5, Agent-Probe/document-review).
6. Real-device delivery is out of agent scope — a manual walkthrough scenario is documented for the
   user to run once AC-5's checklist is complete (AC-6, Agent-Probe, deferred).
7. `pnpm --filter @jojopotato/api test` (full suite) passes with `EXPO_ACCESS_TOKEN` unset — no
   regression to the existing 90+ tests, and AC-1/AC-2/AC-3/AC-4's new tests are included and green
   (AC-7).

## Phase Completion Rules

Single-plan (non-phase-program) COMPLEX plan — one phase, no umbrella. CODE DONE when every
touchpoint below is implemented and every Fully-Automated/Hybrid gate in Verification Evidence is
green. VERIFIED only after the user has reviewed the credential runbook doc (AC-5) — code-only
completion without that review stays CODE DONE, not VERIFIED. AC-6 (real hardware) can never be
satisfied by an agent and does not gate VERIFIED status for this plan; it is documented as a
standing follow-up the user runs independently once live credentials exist.

## Implementation Checklist

1. `packages/api/src/routes/notifications.ts` — tighten `deviceTokenSchema.platform` from
   `z.string().min(1)` to `z.enum(['ios', 'android'])`.
2. `packages/api/src/lib/push-provider.ts` — add `priority: 'high'` and `_contentAvailable: true`
   to the constructed `ExpoPushMessage` objects (confirm exact `expo-server-sdk` field names via
   `vc-docs-seeker` before writing — do not guess; see Risks #1).
3. `packages/api/src/lib/push-provider.ts` — change `sendPush()`'s return type from
   `Promise<void>` to `Promise<PushSendResult[]>`; classify each ticket in the SDK's send response
   (`ok` / `error` + `errorType`); log-fallback branch returns `tokens.map(t => ({ token: t, status: 'ok' }))` unchanged in spirit (no live call, no per-token error possible).
4. `packages/api/src/lib/push-provider.ts` — export `PERMANENT_PUSH_ERROR_CODES` (`Set(['DeviceNotRegistered'])`) and `isPermanentPushError(errorType?: string): boolean`.
5. `packages/api/src/routes/lib/notification-dispatch.ts` — add `sendAndPrune(tokens, payload)`
   helper: calls `sendPush`, then for each `error` result where `isPermanentPushError(errorType)`,
   hard-deletes the matching `device_tokens` row (`WHERE push_token = token`); replace the two
   direct `sendPush(...)` call sites (`dispatchOrderNotification`, `dispatchMarketingNotification`)
   with `sendAndPrune(...)`.
   5a. **[PVL supplement, cycle 1, 15-07-26 — required step, ties to Risk #6 / Execute-Agent
   Instruction E1]** When implementing `sendPush`'s ticket classification (item #3) and
   `sendAndPrune` (this item), the token→result correlation MUST be built from the SAME
   `validTokens`/chunk ordering used to construct the outbound `messages` (prefer
   `details.expoPushToken` when the SDK populates it on an error ticket, else fall back to the
   positional index WITHIN that chunk). Do NOT zip `tickets` against the raw, unfiltered `tokens`
   argument passed into `sendPush` — `sendPush` filters out non-Expo tokens via
   `Expo.isExpoPushToken` and then re-chunks before sending, so a naive zip against the original
   array misaligns indices whenever any token is filtered out and can prune the WRONG
   `device_tokens` row. This sub-item is a required, explicit checklist step — not only a Risk-section
   note — and must be covered by the mixed valid+invalid batch unit assertion added in item #8.
   **[PVL cycle 2, 15-07-26 — independently re-verified against `sendPush`'s actual current code
   (`packages/api/src/lib/push-provider.ts`): `validTokens` is built via
   `tokens.filter(Expo.isExpoPushToken)`, `messages` is built from `validTokens`, and
   `expo.chunkPushNotifications(messages)` produces the chunks sent one-by-one via
   `sendPushNotificationsAsync(chunk)`, which returns tickets in the SAME order as that chunk's
   messages. The instruction above is mechanically correct and directly implementable against this
   exact shape — confirmed, not just plausible.]**
6. `apps/mobile/app.config.ts` — convert the `'expo-notifications'` plugins-array entry to
   `['expo-notifications', { enableBackgroundRemoteNotifications: true }]` (confirm this is the
   correct/current property name via `vc-docs-seeker` before writing — do not guess; see Risks #2).
7. `packages/api/src/routes/__tests__/device-tokens.integration.test.ts` — add AC-1 case: POST with
   `platform: 'windows'` asserts 422 + no row written (extends existing hermetic suite).
8. `packages/api/src/lib/__tests__/push-provider.test.ts` (NEW, unit-level, mocked `Expo` client) —
   AC-2 case: assert constructed message includes `priority`/`_contentAvailable` for all 4
   transactional types; AC-3 case: mock `sendPushNotificationsAsync` to return one `DeviceNotRegistered` ticket + one transient-error ticket in the same call, assert `sendAndPrune` deletes only the first token's row; also add the mixed valid+invalid token batch assertion required by item #5a.
   8a. **[PVL supplement, cycle 1, 15-07-26 — required step, ties to Execute-Agent Instruction E2]**
   AC-3's row-deletion assertion approach is EXPLICITLY: seed a real `device_tokens` row through the
   api vitest `global-setup.ts` (the same Postgres provisioning already used by the hermetic
   self-seeding pattern in `push-provider.integration.test.ts`), then assert that row's deletion
   against the real test DB after `sendAndPrune` runs — NOT a mocked `db.delete`. Because this
   requires a real seeded row, `push-provider.test.ts` is unit-level for the message-construction
   (AC-2) assertions but the AC-3 pruning assertions use the same real-DB fixture pattern as
   `push-provider.integration.test.ts` (only the `Expo` SDK client itself stays mocked); do not
   describe the AC-3 portion of the suite as "no DB."
   **[PVL cycle 2, 15-07-26 — independently re-verified against the actual precedent file
   `packages/api/src/lib/__tests__/push-provider.integration.test.ts`: it seeds a real
   `device_tokens` row via a per-suite `beforeAll()` insert (`db.insert(schema.deviceTokens).values(...)`)
   against the real Postgres test DB that `packages/api/test/global-setup.ts` provisions/migrates
   once for the whole run, with matching `afterAll()` cleanup. "Through the api vitest
   global-setup.ts" in this item's wording means "against the real test-DB infrastructure
   global-setup.ts provisions," concretized by Execute-Agent Instruction E2's explicit "mirroring
   push-provider.integration.test.ts's hermetic self-seed/cleanup" — i.e. a per-suite beforeAll
   insert, not literally adding seeding logic inside global-setup.ts itself. Confirmed workable and
   unambiguous as written for EXECUTE to follow.]**
9. `packages/api/src/lib/__tests__/push-provider.integration.test.ts` — confirm no regression: the
   existing AC-6 log-fallback assertions still pass against the new `Promise<PushSendResult[]>`
   return shape (update any direct assertions on the old `void` return if present).
10. `process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_REF-credential-runbook_15-07-26.md`
    (NEW) — write the manual Firebase/APNs/EAS provisioning checklist (AC-5 deliverable).
11. Run all Verification Evidence gates below; fix until green.
12. Present the credential runbook doc to the user for review (AC-5 verification is the review
    itself, not a runtime check).

## Touchpoints

### `packages/api`

| File | Action | Notes |
|---|---|---|
| `packages/api/src/routes/notifications.ts` | MODIFY | `deviceTokenSchema.platform`: `z.string().min(1)` → `z.enum(['ios', 'android'])`. No other change to this file — the upsert/route logic is unaffected. |
| `packages/api/src/lib/push-provider.ts` | MODIFY | (a) Add `priority: 'high'` + `_contentAvailable: true` to constructed `ExpoPushMessage`s. (b) `sendPush()` return type `Promise<void>` → `Promise<PushSendResult[]>`. (c) Export `PushSendResult`, `PERMANENT_PUSH_ERROR_CODES`, `isPermanentPushError`. Log-fallback branch (creds unset) is otherwise UNCHANGED — still exactly one log line, still zero SDK construction, still zero network call; only its return value gains the new shape. |
| `packages/api/src/routes/lib/notification-dispatch.ts` | MODIFY | Add `sendAndPrune(tokens, payload)`; both `dispatchOrderNotification` and `dispatchMarketingNotification` call it instead of `sendPush` directly. Both functions' own try/catch-and-never-throw contract is preserved — a prune failure (e.g. DB error deleting the row) must not throw either; wrap the delete in the same outer try/catch already present. |
| `packages/api/src/routes/__tests__/device-tokens.integration.test.ts` | MODIFY | Add the AC-1 invalid-platform case (extends existing hermetic suite; no new setup/teardown). |
| `packages/api/src/lib/__tests__/push-provider.test.ts` | CREATE | New suite, `Expo` client mocked at the module boundary (no network). AC-2 message-construction assertions are pure unit-level (no DB). AC-3 pruning assertions seed a real `device_tokens` row via the api vitest `global-setup.ts` (per checklist item #8a) and assert real-DB deletion — mirrors `push-provider.integration.test.ts`'s hermetic pattern for that portion. |
| `packages/api/src/lib/__tests__/push-provider.integration.test.ts` | MODIFY (if needed) | Re-verify existing AC-6 assertions against the new return shape; no behavioral change expected, only possibly a type-level adjustment if the test destructures/asserts on the old `void` return. |

### `apps/mobile`

| File | Action | Notes |
|---|---|---|
| `apps/mobile/app.config.ts` | MODIFY | `plugins` array: `'expo-notifications'` (bare string) → `['expo-notifications', { enableBackgroundRemoteNotifications: true }]` (tuple form, matching the existing tuple patterns already used for `expo-splash-screen`/`expo-location`/`expo-maps` in this same array). No other mobile file changes — `notification-permission.ts`'s `registerDeviceToken()` already sends `platform: Platform.OS`, which is always exactly `'ios'` or `'android'` at runtime, so it is compatible with the new server-side Zod enum with zero mobile-side change required. |

### Documentation

| File | Action | Notes |
|---|---|---|
| `process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_REF-credential-runbook_15-07-26.md` | CREATE | Human-executable checklist: (1) create Firebase project, (2) generate + upload APNs auth key to Firebase (note paid Apple Developer account requirement), (3) download `google-services.json`/`GoogleService-Info.plist` and configure EAS credentials to reference them, (4) confirm `EXPO_ACCESS_TOKEN`/EAS project linkage, (5) how to run the AC-6 manual on-device walkthrough once done. Plain language, no source-code reading required. |

## Public Contracts

- `sendPush(tokens: string[], notification: PushPayload): Promise<PushSendResult[]>` — **breaking
  internal signature change** from `Promise<void>`. Confined to 2 call sites, both modified in this
  same plan (`notification-dispatch.ts`'s two dispatch functions). Not exported to any other
  package or external caller — safe internal widening, no deprecation window needed.
- `PushSendResult { token: string; status: 'ok' | 'error'; errorType?: string }` — new exported
  type from `push-provider.ts`.
- `sendAndPrune(tokens, payload): Promise<void>` — new internal helper in
  `notification-dispatch.ts`, never throws (same never-throw contract as its two callers).
- `POST /notifications/device-tokens` — `platform` field now rejects any value outside
  `'ios' | 'android'` with a 422 (existing `safeParse` → 422 convention, unchanged status code
  choice). This is a **behavior tightening** of an already-shipped, session-gated route — no
  existing valid caller (mobile app only ever sends `Platform.OS`) is affected.
- `apps/mobile/app.config.ts`'s `expo-notifications` plugin entry — adds a config-plugin property;
  does not change the plugin's identity or remove any existing plugin. No secret file is required
  to exist for typecheck/lint/build (SPEC AC-4 constraint).

## Blast Radius

- **Packages touched:** `packages/api` (1 route file, 1 lib file, 1 routes/lib file, 2 test files
  modified/created), `apps/mobile` (1 config file), plus 1 new documentation file. No `packages/types`
  change needed (no new wire-shape — `DeviceTokenRegistration.platform: string` on the mobile side
  stays a plain string type; only the server-side Zod schema narrows the accepted values).
- **File count:** ~8 files (2 new: `push-provider.test.ts`, credential runbook doc; 6 modified).
- **Risk class:** none of the 6 named high-risk classes (auth/identity, billing/credits,
  schema/migration, public API breaking change, deploy/container/gateway, secrets/trust-boundary)
  are triggered — no migration, no schema change, no new external-facing API shape (only a
  same-route validation tightening and an internal function signature change confined to 2 call
  sites already inside this plan's own blast radius).
- **No migration.** `packages/api/drizzle/` is untouched by this plan — the next available slot
  remains `0009` for any future work, unaffected by the already-uncommitted `0008_amusing_night_nurse.sql`.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api test -- device-tokens` — POST with `platform: 'windows'` asserts 422 + no row written; POST with `'ios'`/`'android'` still succeeds | Fully-Automated | AC-1 |
| `pnpm --filter @jojopotato/api test -- push-provider` (new suite, `Expo` client mocked) — assert constructed message for each of the 4 transactional types includes `priority: 'high'` + `_contentAvailable: true` | Fully-Automated | AC-2 |
| `pnpm --filter @jojopotato/api test -- push-provider` (same suite; AC-3 portion seeds a real `device_tokens` row via global-setup per checklist item #8a) — mock a batch with 1 `DeviceNotRegistered` ticket + 1 transient-error ticket, assert `sendAndPrune` deletes only the permanent-error token's `device_tokens` row, for both `dispatchOrderNotification` and `dispatchMarketingNotification` | Fully-Automated | AC-3 |
| Static check: `grep` / config-load assertion on `apps/mobile/app.config.ts` for the `enableBackgroundRemoteNotifications: true` plugin tuple; `pnpm --filter @jojopotato/mobile typecheck` and `pnpm --filter @jojopotato/mobile lint` pass with no secret file present in the repo | Fully-Automated | AC-4 |
| Presence + user review of `real-push-delivery_REF-credential-runbook_15-07-26.md` | Agent-Probe (document review) | AC-5 |
| Manual walkthrough on real iOS + Android hardware, run by the user after AC-5's checklist is complete — not executable by any agent | Agent-Probe (deferred, user-run) | AC-6 |
| `pnpm --filter @jojopotato/api test` (full suite) with `EXPO_ACCESS_TOKEN` unset | Fully-Automated | AC-7 |
| `pnpm --filter @jojopotato/api test -- push-provider.integration` — existing AC-6-of-PUSH-004 log-fallback assertions still pass against the new return shape | Fully-Automated | Regression gate (not a numbered AC, required before EXECUTE closeout) |
| `pnpm --filter @jojopotato/api typecheck` / `pnpm --filter @jojopotato/api lint` | Fully-Automated | Type-safety/lint regression gate |

### High-Risk Class Table

| Area | High-risk class | Minimum tier | Gap rationale if known-gap accepted |
|---|---|---|---|
| Token pruning (deletes `device_tokens` rows) | none of the 6 named classes, but destructive-write-adjacent | Hybrid | — (Fully-Automated achieved, exceeds minimum) |
| Real on-device push delivery | none of the 6 named classes; explicitly SPEC-scoped as unautomatable | Known-Gap | No live provider credentials in CI/dev by design (SPEC constraint AC-6); this is a permanent, in-principle Known-Gap for any agent, not a deferred-but-fixable gap — the manual walkthrough (AC-6) is the only possible proof. |
| Receipt-based (delayed) `DeviceNotRegistered` detection via `getPushNotificationReceiptsAsync` | none of the 6 named classes | Known-Gap | Deliberately deferred per Open Design Decision 2 — ticket-level detection is this pass's provable substitute; receipt polling is a documented follow-up once real send volume justifies the added scheduler/persistence complexity. |

### Missing Test Areas

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| Real on-device push receipt (banner/sound/badge, background wake actually firing) | Requires live provider creds + physical device; no RN test runner in repo | Agent-Probe walkthrough (AC-6), user-run, gated on AC-5's manual credential checklist |
| Receipt-stage (`getPushNotificationReceiptsAsync`) `DeviceNotRegistered` detection for tokens whose failure only manifests at receipt time, not ticket time | Would require a delayed poll (~15 min) + persistent ticket storage — materially larger scope than this SPEC's AC-3, which describes a synchronous same-call assertion | Backlog note (see Test Infra Improvement Notes) — revisit once live send volume exists to justify a scheduler-driven receipt-polling phase |

## Test Infra Improvement Notes

- Ticket-vs-receipt-stage error detection gap (Open Design Decision 2): a future phase should add
  receipt polling (`getPushNotificationReceiptsAsync`) via the existing `scheduler.ts` substrate
  from PUSH-004, once real send volume exists to observe which error class (ticket vs receipt) is
  actually dominant in production. Not a defect of this plan — a deliberately bounded first pass.
- No new test infra gaps introduced by this plan otherwise; the new `push-provider.test.ts` suite
  (mocked `Expo` client, plus a real-DB fixture for the AC-3 pruning assertions per checklist item
  #8a) is a net-new, reusable pattern for future push-provider hardening.

## Risks

> **VALIDATE de-risk note (15-07-26):** Risks #1 and #2 below were independently re-verified during
> VALIDATE against the actually-installed package type definitions
> (`expo-server-sdk@3.15.0` `build/ExpoClient.d.ts` and `expo-notifications@57.0.3`
> `plugin/src/withNotifications.ts`). Both field names are CONFIRMED CORRECT:
> `ExpoPushMessage.priority?: 'default' | 'normal' | 'high'` and
> `ExpoPushMessage._contentAvailable?: boolean` (both top-level, not nested), and
> `NotificationsPluginProps.enableBackgroundRemoteNotifications?: boolean` (wires
> `remote-notification` into `UIBackgroundModes`). The `vc-docs-seeker` step in EXECUTE is now
> CONFIRMATORY (a fast re-check of the same `.d.ts`), not blocking — EXECUTE may proceed with these
> exact names but should still open the `.d.ts` once to confirm no version drift.
>
> **PVL cycle 2 re-confirmation (15-07-26):** re-read directly from
> `node_modules/.pnpm/expo-server-sdk@3.15.0/node_modules/expo-server-sdk/build/ExpoClient.d.ts`
> and `node_modules/.pnpm/expo-notifications@57.0.3_.../plugin/src/withNotifications.ts` this cycle
> (not trusting the cycle-1 note at face value) — both confirmed unchanged, plus the ticket shape
> (`ExpoPushErrorReceipt.details?.expoPushToken?: string`, `details?.error` as the error-code
> field) was read directly, confirming Risk #6 / checklist item #5a's fallback-to-positional-index
> requirement is real (the token field on an error ticket is genuinely optional, not just
> defensively assumed to be).

1. **Exact `expo-server-sdk` field names for background delivery (`priority`, `_contentAvailable`)
   are not yet confirmed against the installed SDK version's type definitions.** EXECUTE MUST
   invoke `vc-docs-seeker` before writing this call site — do not guess the field names or their
   exact casing/location (top-level on `ExpoPushMessage` vs nested under a provider-specific key).
2. **Exact Expo config-plugin property name (`enableBackgroundRemoteNotifications`) is carried
   forward from SPEC's external research pass, not independently re-verified against the installed
   `expo-notifications` plugin version in this repo.** EXECUTE MUST invoke `vc-docs-seeker` to
   confirm the property name/shape against the actual installed version before writing
   `app.config.ts`.
3. **Ticket-level vs receipt-level error timing (Open Design Decision 2) is an accepted, documented
   scope boundary, not an oversight** — if EXECUTE's `vc-docs-seeker` pass on the Expo SDK reveals
   that `DeviceNotRegistered` genuinely never appears at the ticket stage (only ever at receipt
   stage) for any token class, the AC-3 test's mocked scenario is still valid (it mocks the SDK's
   response shape directly, so the test proves the *code path* works correctly whenever the SDK
   *does* return a ticket-level error, even if that is empirically rarer than the receipt-stage
   case in live traffic) — this does not block or invalidate this plan, it only strengthens the
   case for the already-documented receipt-polling follow-up.
4. **`sendPush`'s log-fallback branch return shape must exactly match what `sendAndPrune` expects**
   (an array of `{ token, status: 'ok' }` per input token) so the log-fallback path never
   accidentally triggers a prune — EXECUTE must add an explicit unit-test assertion for this (folded
   into the new `push-provider.test.ts` suite, not a separate touchpoint).
5. **`device_tokens.push_token` has no unique index today** (only `device_id` is unique) — a
   defensive design note, not a blocker: `sendAndPrune`'s delete is scoped to
   `WHERE push_token = token`, which could in theory delete more than one row if two devices ever
   shared an identical push token string (Expo push tokens are themselves globally unique per
   physical Expo push registration, so this is not expected in practice, but EXECUTE should add a
   one-line comment noting the assumption rather than silently relying on it).
6. **[VALIDATE-FOUND — token-to-ticket index correlation]** `sendPushNotificationsAsync` returns
   `ExpoPushTicket[]` in message order (nth ticket ↔ nth message), and an error ticket
   (`ExpoPushErrorReceipt`) carries the token only via the OPTIONAL `details.expoPushToken` field —
   NOT a required field on the ticket. `sendPush` FILTERS the input `tokens` (dropping non-Expo
   tokens via `Expo.isExpoPushToken`) and then RE-CHUNKS before sending, so ticket index aligns with
   the filtered+chunked message list, NOT the raw `tokens` argument. EXECUTE MUST build the
   token→result correlation from the same `validTokens`/chunk ordering used to construct the
   messages (prefer `details.expoPushToken` when the SDK populates it, fall back to positional index
   WITHIN the chunk), never by zipping `tickets` against the original unfiltered `tokens` array — a
   naive zip would misalign indices whenever any token was filtered out and could prune the WRONG
   `device_tokens` row. Add a `push-provider.test.ts` unit assertion for a mixed valid+invalid token
   batch to lock this. **[Now also a required Implementation Checklist step — see item #5a.]**


## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_PLAN_15-07-26.md`
2. **Last completed phase or step:** VALIDATE — PVL cycle 2 complete, Gate: PASS (15-07-26). Both
   first-pass CONCERNs were resolved by PVL supplement cycle 1 (checklist items #5a, #8a) and
   independently re-verified against source in this cycle-2 re-validation pass. Ready for EXECUTE.
3. **Validate-contract status:** written (PASS, PVL cycle 2, 15-07-26) — see `## Validate Contract`
   below. No further VALIDATE re-run required unless the plan changes again.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, locked SPEC (path above), PUSH-004's plan/report
   (`process/features/rewards-notifications/active/push-notifications-api_14-07-26/`), and direct
   reads of `packages/api/src/lib/push-provider.ts`, `packages/api/src/db/schema/device_tokens.ts`,
   `packages/api/src/routes/lib/notification-dispatch.ts`, `packages/api/src/routes/notifications.ts`,
   `apps/mobile/src/features/notifications/lib/notification-permission.ts`, `apps/mobile/app.config.ts`,
   the uncommitted `packages/api/drizzle/0008_amusing_night_nurse.sql`, existing test files
   (`device-tokens.integration.test.ts`, `push-provider.integration.test.ts`), and — new in PVL
   cycle 2 — the actually-installed `expo-server-sdk@3.15.0` (`ExpoClient.d.ts`) and
   `expo-notifications@57.0.3` (`withNotifications.ts`) type definitions, read directly from
   `node_modules/.pnpm/`.
5. **Next step for a fresh agent picking up mid-execution:** route to EXECUTE with this
   PASS-gated plan. If EXECUTE has already started, check `git diff` against the Touchpoints table
   above, with special attention to: `creditStarsForOrder` and the 4-event `notifyCustomer` scope
   from PUSH-004 remaining untouched (this plan does not touch `staff.ts` at all), and confirm
   `sendPush`'s new return shape is consumed only via `sendAndPrune`, not by any other caller.

## Validate Contract

Status: PASS
Date: 15-07-26
date: 2026-07-15
generated-by: outer-pvl
supersedes: 2026-07-15 (outer-pvl) — PVL cycle 2, fresh independent re-validation supersedes the
cycle-1 first-pass CONDITIONAL contract

**PVL cycle 2 — supplement-verified.** This is a genuine, independent re-run of V1–V7 against the
cycle-1-supplemented plan — not a rubber-stamp of the supplement's own "RESOLVED" self-report. Both
prior CONCERNs were re-checked directly against source: the actually-installed
`expo-server-sdk@3.15.0` type definitions (`ExpoClient.d.ts`) and `expo-notifications@57.0.3`
plugin source (`withNotifications.ts`), plus the current (pre-EXECUTE) state of `push-provider.ts`,
`notification-dispatch.ts`, `device_tokens.ts`, `notifications.ts`, and the existing test files
(`device-tokens.integration.test.ts`, `push-provider.integration.test.ts`). No new gaps found.

Parallel strategy: sequential
Rationale: unchanged from cycle 1 — Signal score 3/7 (S1 multi-package: packages/api + apps/mobile
+ docs; S2 public-route validation tightening; S7 ~8 files). MEDIUM band, but the changes are
tightly INTERDEPENDENT — the `sendPush` `Promise<void>` → `Promise<PushSendResult[]>` signature
change must land atomically with its two call sites (`sendAndPrune`) and all affected tests, so
parallel subagents would fracture a single cohesive edit. One sequential vc-execute-agent (opus) is
the correct fit.

### Test Gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | `POST /notifications/device-tokens` with `platform: 'windows'` → 422, no row written; `'ios'`/`'android'` still succeed | Fully-Automated | `pnpm --filter @jojopotato/api test -- device-tokens` (new case in `device-tokens.integration.test.ts`) exits 0 | B (gate added by this plan's checklist item #7) |
| AC-2 | Constructed `ExpoPushMessage` for all 4 transactional types includes `priority: 'high'` + `_contentAvailable: true` alongside title/body/sound | Fully-Automated | `pnpm --filter @jojopotato/api test -- push-provider` (new `push-provider.test.ts`, `Expo` mocked) exits 0 | B (gate added by checklist item #8) |
| AC-3 | Batch with 1 `DeviceNotRegistered` ticket + 1 transient-error ticket → only the permanent-error token's `device_tokens` row deleted, for both `dispatchOrderNotification` and `dispatchMarketingNotification` via `sendAndPrune` | Fully-Automated | `pnpm --filter @jojopotato/api test -- push-provider` (same suite; real-seeded-row assertion per checklist item #8a) exits 0 | B (gate added by checklist item #8, assertion approach locked by item #8a) |
| AC-4 | `app.config.ts` `expo-notifications` entry is a tuple with `enableBackgroundRemoteNotifications: true`; `apps/mobile` typecheck+lint pass with no secret file present | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` && `pnpm --filter @jojopotato/mobile lint` exit 0; grep/config-load asserts the tuple | B (gate added by checklist item #6) |
| AC-7 | Full API suite passes with `EXPO_ACCESS_TOKEN` unset — no regression to existing 90+ tests, new AC-1/2/3 green, zero live network calls | Fully-Automated | `pnpm --filter @jojopotato/api test` (whole suite) exits 0 | A (proven now once code lands) |
| Regression | Existing PUSH-004 log-fallback assertions still pass against the new `Promise<PushSendResult[]>` return shape | Fully-Automated | `pnpm --filter @jojopotato/api test -- push-provider.integration` exits 0 | A (proven now) |
| Type/lint | API type-safety + lint regression gate | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` && `pnpm --filter @jojopotato/api lint` exit 0 | A (proven now) |
| AC-5 | Credential-provisioning runbook doc exists and is human-executable | Agent-Probe | User reviews `real-push-delivery_REF-credential-runbook_15-07-26.md` | C (deferred to user document review — not automatable) |
| AC-6 | Real push lands on physical iOS + Android device for an order-status transition | Agent-Probe | User-run manual hardware walkthrough after AC-5 checklist complete | D (backlog test-building stub — permanent Known-Gap for any agent; live billed creds + physical device required) |
| Receipt-stage prune | `getPushNotificationReceiptsAsync` `DeviceNotRegistered` detection for tokens that fail only at receipt time (~15 min later) | Known-Gap | — | D (backlog note — deferred receipt-polling phase; see Missing Test Areas) |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to a named later phase/plan (or user review); D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy:` column carries only the 3 proving strategies (Fully-Automated / Agent-Probe here; no Hybrid needed since the api vitest global-setup provides the DB precondition non-interactively). Known-Gap is a named residual row (gap-resolution D), never a strategy that proves a behavior.

Legacy line form (retained for existing consumers):
- Platform validation (notifications.ts): Fully-automated: `pnpm --filter @jojopotato/api test -- device-tokens`
- Background payload shape (push-provider.ts): Fully-automated: `pnpm --filter @jojopotato/api test -- push-provider`
- Token pruning (push-provider.ts + notification-dispatch.ts): Fully-automated: `pnpm --filter @jojopotato/api test -- push-provider`
- app.config background mode (apps/mobile): Fully-automated: `pnpm --filter @jojopotato/mobile typecheck` + `lint`
- Full-suite creds-unset regression: Fully-automated: `pnpm --filter @jojopotato/api test`
- Credential runbook doc: agent-probe: user document review (AC-5)
- Real on-device delivery: known-gap: documented as permanent Agent-Probe (AC-6)
- Receipt-stage prune: known-gap: documented as backlog follow-up (Open Design Decision 2)

Failing stubs (Fully-Automated rows only — TDD red-first for execute-agent):

AC-1:
```
test("should reject POST /notifications/device-tokens with platform 'windows' (422, no row) while ios/android still succeed", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC-1 platform enum rejection") })
```
AC-2:
```
test("should construct ExpoPushMessage with priority 'high' and _contentAvailable true for all 4 transactional types", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC-2 background payload shape") })
```
AC-3:
```
test("should delete only the DeviceNotRegistered token's device_tokens row (not the transient-error token's) via sendAndPrune for both order and marketing dispatch, using a real seeded row per checklist item #8a", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC-3 permanent-error token prune") })
```
AC-4:
```
test("should declare enableBackgroundRemoteNotifications true tuple in app.config.ts and pass mobile typecheck+lint with no secret file present", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC-4 background-mode plugin config") })
```
AC-7:
```
test("should pass the full @jojopotato/api suite with EXPO_ACCESS_TOKEN unset and zero live network calls", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC-7 creds-unset full-suite regression") })
```

### Dimension findings

PVL cycle 2 — fresh, independent re-verification against source (not a re-statement of cycle 1's
self-reported "RESOLVED" claims):

- Infra fit: PASS — Re-confirmed this cycle by reading the actually-installed type definitions
  directly: `node_modules/.pnpm/expo-server-sdk@3.15.0/node_modules/expo-server-sdk/build/ExpoClient.d.ts`
  confirms `ExpoPushMessage.priority?: 'default' | 'normal' | 'high'` and
  `_contentAvailable?: boolean` (both top-level), and `ExpoPushErrorReceipt.details?.expoPushToken?: string`
  is genuinely OPTIONAL (confirming checklist item #5a's positional-index fallback is necessary, not
  just defensive). `expo-notifications@57.0.3`'s `plugin/src/withNotifications.ts` confirms
  `NotificationsPluginProps.enableBackgroundRemoteNotifications?: boolean` sets `UIBackgroundModes` →
  `remote-notification`. `.github/workflows/ci.yml` has no `EXPO_` env var — log-fallback remains
  the CI/dev default. No migration, no port/runtime surface, no container.
- Test coverage: PASS (RESOLVED, cycle 2 re-verified) — checklist item #8a was checked against the
  real precedent file `push-provider.integration.test.ts`: it seeds a real `device_tokens` row via a
  per-suite `beforeAll()` insert against the real Postgres test DB that `test/global-setup.ts`
  provisions/migrates once for the whole run, with `afterAll()` cleanup — a genuine, working
  hermetic pattern already proven in this codebase. Execute-Agent Instruction E2's "mirroring
  push-provider.integration.test.ts's hermetic self-seed/cleanup" disambiguates item #8a's slightly
  loose "via global-setup.ts" phrasing down to the correct, concrete mechanism (a per-suite
  `beforeAll` insert, not adding seeding logic to `global-setup.ts` itself) — no longer ambiguous,
  no vague "pick one."
- Breaking changes: PASS — re-grep-confirmed this cycle: `sendPush(` has exactly 2 non-test call
  sites (`notification-dispatch.ts:95,146`), both inside this plan's own blast radius.
  `push-provider.integration.test.ts` asserts on side effects (`sendSpy`, `logSpy`) only and never
  destructures/types the return value → no type break from the `Promise<void>` →
  `Promise<PushSendResult[]>` widening. `notification-permission.ts:121` sends
  `platform: Platform.OS` (always `'ios'`/`'android'` at RN runtime) → compatible with the new
  server-side Zod enum. `device-tokens.integration.test.ts`'s only non-ios/android platform case
  (`platform: ''`, line 189) already 422s under `z.string().min(1)` and will still 422 under
  `z.enum(['ios','android'])` — confirmed no regression.
- Security surface: PASS — re-confirmed none of the 6 high-risk classes triggered (no
  auth/identity, billing/credits, schema/migration, public external API breaking change,
  deploy/container/gateway, or secrets/trust-boundary surface). Token pruning is a scoped
  `DELETE WHERE push_token = token` on a session-owned registry table.
- Section: Implementation Checklist feasibility — PASS (RESOLVED, cycle 2 re-verified) — checklist
  item #5a's instruction was checked directly against `sendPush`'s current code:
  `validTokens = tokens.filter(Expo.isExpoPushToken)` → `messages` built from `validTokens` →
  `chunks = expo.chunkPushNotifications(messages)` → each chunk sent via
  `sendPushNotificationsAsync(chunk)`, which returns tickets in the SAME order as that chunk. The
  checklist's instruction (correlate by validTokens/chunk order, prefer `details.expoPushToken` when
  present, else positional index within the chunk) is mechanically correct and directly actionable
  against this exact code shape — a concrete algorithm EXECUTE can implement as written, not
  narrative.

### Open gaps

- Receipt-stage `DeviceNotRegistered` detection (`getPushNotificationReceiptsAsync`): known-gap — documented as a deliberate scope boundary (Open Design Decision 2); backlog follow-up for a future receipt-polling phase once live send volume justifies scheduler/persistence complexity. Not a defect of this plan.
- Real on-device delivery (AC-6): known-gap — permanent, in-principle Agent-Probe (live billed creds + physical device, unautomatable by any agent). User-run, gated on AC-5.

What This Coverage Does NOT Prove:
- `pnpm --filter @jojopotato/api test -- device-tokens` (AC-1): does NOT prove the mobile client actually sends a valid platform at runtime (Agent-Probe only, no RN runner) — only that the server rejects invalid values.
- `pnpm --filter @jojopotato/api test -- push-provider` (AC-2/AC-3): proves the CODE PATH constructs the correct payload and prunes the correct row when the SDK returns a ticket-level error; does NOT prove a real device wakes on `_contentAvailable`, nor that `DeviceNotRegistered` actually arrives at the TICKET stage in live traffic (it commonly arrives only at the receipt stage — the accepted Known-Gap).
- `pnpm --filter @jojopotato/mobile typecheck`/`lint` (AC-4): proves the config tuple is type-valid and lint-clean with no secret present; does NOT prove a real EAS build wires the `UIBackgroundModes` entitlement (that requires a native build, no RN/EAS runner in repo).
- `pnpm --filter @jojopotato/api test` (AC-7): proves no regression with creds unset and zero live calls; does NOT prove any real send succeeds (by design — creds never present in CI).

Gate: PASS (0 FAILs, 0 CONCERNs). Both first-pass CONCERNs (test-coverage AC-3 assertion mechanism;
implementation-checklist token→ticket correlation) were folded into the plan by PVL cycle 1's
supplement (checklist items #5a, #8a) and were independently re-verified against actual source in
this cycle-2 pass — genuinely resolved, not rubber-stamped. No new gaps surfaced during this fresh
re-check. EXECUTE may proceed.

Accepted by: n/a — PASS gate carries no unresolved CONCERNs requiring explicit acceptance.

### Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | When implementing `sendPush`'s ticket classification + `sendAndPrune`, correlate each ticket to its token using the SAME `validTokens`/chunk ordering used to build `messages` (prefer `details.expoPushToken` when the SDK populates it, else positional index WITHIN the chunk). NEVER zip `tickets` against the raw unfiltered `tokens` argument — filtered-out tokens misalign indices and could prune the wrong row. Add a mixed valid+invalid batch unit assertion. (plan Risk #6; now also Implementation Checklist item #5a) | Checklist items #3, #5, #5a, #8 |
| E2 | For the AC-3 assertion (a `device_tokens` row is deleted), the approach is now LOCKED (not a choice): seed a real `device_tokens` row via the api vitest `global-setup.ts` (mirroring `push-provider.integration.test.ts`'s hermetic self-seed/cleanup) and assert its deletion against the test DB. Do not describe this portion of the suite as "no DB." (Implementation Checklist item #8a) | Checklist item #8, #8a |
| E3 | Preserve the log-fallback's EXACT observable behavior: exactly ONE `[push] would send` `console.log` per call (existing `staff-order-status.integration.test.ts` `countPushSends()` and `marketing-opt-in.integration.test.ts` depend on it) AND return an all-`{status:'ok'}` array so the fallback path never triggers a prune (plan Risk #4). Re-run both suites after the change. | Checklist items #3, #5 |
| E4 | The `vc-docs-seeker` steps for Risks #1/#2 are now CONFIRMATORY (VALIDATE verified the exact names against the installed `.d.ts` twice, cycle 1 and cycle 2). Open `expo-server-sdk` `build/ExpoClient.d.ts` and `expo-notifications` `plugin/src/withNotifications.ts` once to confirm no version drift, then proceed — do not treat these as blocking research. | Checklist items #2, #6 |
| E5 | Add the one-line comment on `sendAndPrune`'s `WHERE push_token = token` delete noting the globally-unique-token assumption (plan Risk #5) rather than silently relying on it. | Checklist item #5 |

### Backlog Artifacts

| Artifact | Location | What it tracks |
|---|---|---|
| receipt-stage-token-prune_NOTE_15-07-26.md | process/features/rewards-notifications/backlog/ | Deferred `getPushNotificationReceiptsAsync` receipt-polling for `DeviceNotRegistered` tokens that fail only at receipt time (Open Design Decision 2) — revisit once live send volume exists |

Notes: AC-6 (real-hardware) is NOT a backlog artifact — it is a standing user-run manual walkthrough documented inside the AC-5 credential runbook, gated on live credentials the user provisions independently.

## Autonomous Goal Block

```
SESSION GOAL: Real Device Push Delivery hardening (iOS + Android) on top of PUSH-004 — platform Zod-enum validation, background/killed-app payload shaping, ticket-based token pruning, app.config background-mode plugin, credential runbook doc. All automated ACs provable with EXPO_ACCESS_TOKEN unset.
Charter + umbrella plan: N/A — single COMPLEX plan (not a phase program)
Autonomy: standing autonomy this session ("go dont ask until its time to execute") — self-decide reversible steps; hard-stop only on irreversible/outward-facing actions not in this contract. EXECUTE remains a separate orchestrator-owned gate.
Hard stop conditions / safety constraints:
- Do NOT create/upload any live Firebase/APNs/EAS credential (AC-5/AC-6 are user-only manual steps).
- Do NOT add a DB migration or change device_tokens/notifications schema — platform stays varchar, validated via Zod enum at the API boundary only.
- Do NOT let sendPush's log-fallback (creds unset) trigger a prune, and keep exactly one `[push] would send` log line per call (existing tests depend on it).
- Do NOT prune the wrong device_tokens row — correlate ticket→token by filtered+chunked message order, never the raw tokens array (Risk #6 / E1 / checklist item #5a).
Next phase: EXECUTE — process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_PLAN_15-07-26.md (validate-contract PASS, PVL cycle 2, 15-07-26 — ready now)
Validate contract: inline in plan (## Validate Contract — Gate: PASS, PVL cycle 2 — supplement-verified, 15-07-26, generated-by: outer-pvl)
Execute start: fully-auto: `pnpm --filter @jojopotato/api test -- device-tokens` | `pnpm --filter @jojopotato/api test -- push-provider` | `pnpm --filter @jojopotato/mobile typecheck` + `lint` | `pnpm --filter @jojopotato/api test` (full, EXPO_ACCESS_TOKEN unset) | agent-probe: AC-5 doc review, AC-6 user hardware walkthrough | high-risk pack: no
```
