---
name: spec:real-push-delivery
description: "Product-discovery SPEC for real OS-level device push delivery (iOS + Android) on top of PUSH-004's backend — credential provisioning runbook, background/killed-app handling, token-lifecycle pruning, platform hardening"
date: 15-07-26
feature: rewards-notifications
---

# SPEC — Real Device Push Delivery (iOS + Android)

## Summary

PUSH-004 (shipped 14-07-26) built the entire push notification *backend*: when an order changes
status, the app writes a real notification record and attempts a real send — but because no
Firebase/Apple push credentials are configured anywhere in this project yet, every attempt today
just logs "would send" and stops. Nothing has ever actually landed on a phone's lock screen. This
next increment closes that gap: it gets real OS-level push notifications appearing on customers'
iOS and Android devices — outside the app, even when the app is closed or the phone is locked —
and hardens the parts of the code that only matter once real notifications are actually flowing
(what happens when a device's token goes stale, what happens when the app is killed, making sure
we're not accidentally storing garbage for the `platform` field). Getting there requires some
manual, human-only setup (a Firebase project, a paid Apple Developer account, an APNs key) that no
agent can do — this SPEC treats that setup as an explicit checklist for the user, separate from the
code changes an agent can make and verify today.

## User Stories / Jobs To Be Done

1. **As a customer**, I want to see an actual notification banner/lock-screen alert on my phone
   when my order status changes — even if the Jojo Potato app is closed or my phone is locked — so
   that I don't have to keep the app open to know when my order is ready.
2. **As a customer**, I want push notifications to keep working reliably even if my phone was
   off, out of signal, or the app was force-closed when the notification was sent, so that I don't
   miss important order updates because of normal day-to-day phone usage.
3. **As a customer who reinstalls the app or gets a new phone**, I want my old, no-longer-valid
   device registration to stop being sent to (silently, with no error visible to me), so that the
   system isn't wasting effort on a device that can never receive it, and I don't get confused by
   inconsistent behavior.
4. **As the product/dev team**, we want a clear, one-time manual setup checklist for provisioning
   the real push credentials (Firebase project, Apple push key, EAS upload), separate from the code
   itself, so that a human can execute the account-level steps once while the codebase changes ship
   independently and are fully agent-verifiable without needing those credentials to exist yet.
5. **As a developer**, I want the `device_tokens.platform` column (currently any free-form string)
   to only ever hold a real, known platform value, so that future platform-specific delivery logic
   (e.g. iOS background payload shaping) can trust that column instead of defensively parsing it.
6. **As a developer/CI system**, I want the background/killed-app delivery code path and the
   token-pruning logic to be verifiable by automated tests without needing live Firebase/APNs
   credentials, so that this hardening work doesn't silently regress in CI just because it's
   downstream of a manual credential-provisioning step.

## What The User Wants (Behavioral Outcomes)

- Once the manual credential setup (see Constraints/Out-of-Scope) is complete, a customer receives
  a real system-level push notification for each of the 4 existing transactional order-status
  events (`accepted`, `preparing`, `ready`, `cancelled`) — visible on the lock screen / notification
  tray, not just inside the app.
- This still works when the app is fully closed/killed, not just backgrounded — the OS itself wakes
  up long enough to display the notification.
- A device that stops accepting pushes (uninstalled app, OS revoked the token, token expired) is
  detected the next time a send to it fails with a permanent provider error, and its registration
  is cleaned up automatically — no customer-visible error, no repeated wasted send attempts to a
  dead token.
- `device_tokens.platform` only ever contains a recognized platform value (`ios` or `android`) —
  never an arbitrary string — so a malformed or unexpected value is rejected at write time instead
  of silently stored.
- Everything that does NOT require live credentials (background-payload shaping, token-pruning
  logic, platform validation, config-plugin wiring) is verified automatically in this repo's
  existing CI/test setup, with zero new manual steps beyond what's already documented in
  `all-tests.md`.
- Everything that DOES require live credentials (an actual notification appearing on a real,
  physical device) is explicitly called out as a manual verification step for the user to run once
  the credential setup is complete — the SPEC does not pretend an agent can verify this
  automatically.

## Flow / State Diagram

**Manual prerequisite (human-only, outside any agent session — not a code path):**

```
User: create Firebase project
        |
        v
User: generate/upload Apple APNs auth key to Firebase (needs paid Apple Developer account)
        |
        v
User: configure EAS credentials (google-services.json / GoogleService-Info.plist references)
        |
        v
[Credentials now live in EAS/Firebase — code written in THIS SPEC can now be exercised for real]
```

**Send path once credentials exist (happy path, background/killed-app case):**

```
Order status transition (existing PUSH-004 dispatch, unchanged)
        |
        v
  sendPush(tokens, notification)   <-- becomes able to actually reach a live device
        |
        v
  Provider (Expo relay -> APNs / FCM) delivers a background-capable payload
        |
        v
  [Device state?]
   +-------------+-------------+
   |             |             |
  foreground   backgrounded   killed
   |             |             |
   v             v             v
 in-app UI    OS shows       OS wakes app briefly (data-only + _contentAvailable),
 handles it   banner/tray    then shows banner/tray notification
```

**Token invalidation / pruning path:**

```
sendPush(tokens, ...) called with N tokens
        |
        v
  provider returns per-token receipts
        |
        v
  [receipt status for token T?]
   +---------+-----------+
   |         |           |
  ok    permanent-error  transient-error
   |         |           |
   v         v           v
 no-op   delete/mark    no-op (retry
         device_tokens  next real event,
         row for T      no special handling)
```

**Platform validation (write-time hardening):**

```
POST /notifications/device-tokens { platform: "..." }
        |
        v
  platform in {'ios','android'}?
   +-----+-----+
   |           |
  yes          no
   |           |
   v           v
 upsert as   reject with
 today       400 validation error
```

## Acceptance Criteria (Testable Outcomes)

1. **`device_tokens.platform` only accepts `ios` or `android`; any other value is rejected at the
   API boundary.**
   Registering a device with a platform value outside the known set returns a validation error and
   writes no row; registering with `ios` or `android` succeeds exactly as today.
   proven by: integration test extending `device-tokens.integration.test.ts` — POST with an invalid
   platform string asserts 4xx + no row written; POST with `ios`/`android` asserts success.
   strategy: Fully-Automated

2. **A background/killed-app-capable push payload is constructed correctly for order-status
   transactional notifications.**
   The payload sent to the push provider for the 4 transactional events includes whatever
   data-only/background-wake fields are required by the chosen delivery mechanism (e.g.
   `_contentAvailable` / equivalent), verifiable by inspecting the constructed payload without a
   live send.
   proven by: unit/integration test on the push-provider/dispatch layer — assert the payload object
   passed toward the provider includes the required background-delivery fields for each of the 4
   transactional notification types.
   strategy: Fully-Automated

3. **A permanent per-token delivery failure prunes that device's registration; a transient failure
   does not.**
   When the provider reports a token as permanently invalid (e.g. app uninstalled), the
   corresponding `device_tokens` row is removed (or marked inactive) so no further sends are
   attempted to it. A transient/temporary failure leaves the row untouched.
   proven by: integration test — mock the provider's response to return a permanent-error receipt
   for one token and a transient-error receipt for another in the same send batch; assert the
   permanent-error token's row is gone/inactive and the transient-error token's row is unchanged.
   strategy: Fully-Automated

4. **The mobile app's push/background config is present and consistent with the chosen delivery
   mechanism's requirements, without requiring live credential files to exist in the repo.**
   The Expo config (`app.config.ts` / plugin config) declares what background delivery needs
   (e.g. background modes), and references credential file paths without requiring the actual
   secret files to be committed.
   proven by: static check / config test — assert the relevant config keys/plugin entries are
   present in `app.config.ts`; assert no real secret file (e.g. `google-services.json`,
   `GoogleService-Info.plist`) is required to exist for `apps/mobile` typecheck/lint/build to pass.
   strategy: Fully-Automated

5. **A documented, step-by-step manual credential-provisioning checklist exists for the user.**
   The checklist covers Firebase project creation, APNs auth key generation/upload (noting the
   paid Apple Developer account requirement), and EAS credential configuration, in enough detail
   that a non-agent human can execute it without needing to read source code first.
   proven by: presence of the checklist document reviewed by the user; this is a documentation
   deliverable, not a code behavior, so there is no automated test — the review IS the
   verification.
   strategy: Agent-Probe (document review, not a runtime check)

6. **An actual push notification appears on a real physical iOS device and a real physical Android
   device for an order-status transition, once live credentials are provisioned.**
   This is the true end-to-end proof that delivery works outside the app, matching the SPEC's core
   user stories 1 and 2.
   proven by: manual walkthrough on real hardware, run by the user AFTER completing the manual
   credential checklist (AC-5) — no agent can execute this because it requires live, billed,
   user-owned third-party credentials and a physical device. Not automatable in principle, not
   just in this repo's current state.
   strategy: Agent-Probe

7. **When live credentials are unset (current CI/dev default), the new code paths (background
   payload construction, platform validation, token pruning) remain exercisable and green,
   exactly like PUSH-004's existing log-fallback pattern.**
   Adding this hardening work must not require live credentials to keep the existing automated
   test suite green.
   proven by: full `pnpm --filter @jojopotato/api test` run with `EXPO_ACCESS_TOKEN` unset,
   asserting all AC-1..AC-4 tests above still pass without any outbound network call.
   strategy: Fully-Automated

## Out Of Scope

- **Actually creating the Firebase project, generating the APNs key, or uploading EAS
  credentials** — these are manual, human-only, account-level actions (AC-5 documents the
  checklist; performing it is explicitly not something any agent does in this or a future
  session).
- **Choosing between the existing Expo-relay transport (`expo-server-sdk`) and a raw
  `firebase-admin` + `@react-native-firebase/messaging` replacement** — this is an architectural
  fork explicitly deferred to INNOVATE (see Open Design Questions below); this SPEC's acceptance
  criteria are written to hold regardless of which path is chosen.
- **Marketing/scheduler push delivery going live** — PUSH-004 already scoped marketing opt-in
  gating and the scheduler substrate; this SPEC is scoped to making delivery itself real, not to
  building new marketing campaigns (still PUSH-003 territory, still out of scope).
- **Rich/interactive push features** (action buttons, images, notification categories/threads,
  badge-count management) — not requested, not required by the existing 4 transactional event
  types.
- **Push delivery analytics/receipts dashboard** (open/delivery-rate tracking) — no such surface
  exists or is requested.
- **Android notification channel customization** (custom sound/importance per channel beyond
  Expo/OS defaults) — not requested.
- **A general device-token health/monitoring admin view** — out of scope; only the pruning
  *behavior* is in scope, not an observability UI for it.

## Constraints

- Must build on top of PUSH-004's existing schema/API (`device_tokens` table, `sendPush()` in
  `packages/api/src/lib/push-provider.ts`, `POST /notifications/device-tokens`,
  `dispatchOrderNotification`) — no parallel/duplicate notification pipeline.
- Must preserve the existing log-fallback-when-credentials-unset behavior (`EXPO_ACCESS_TOKEN`
  unset → log instead of send) for local dev and CI — this SPEC hardens code around that seam, it
  does not remove the seam.
- No agent-executed action may require live Firebase/Apple Developer/EAS credentials to exist —
  every in-scope acceptance criterion except AC-5 (document review) and AC-6 (manual hardware
  walkthrough) must be provable with credentials unset.
- Must follow this repo's additive-nullable-column migration convention if any schema change is
  needed (no breaking changes to `device_tokens` or `notifications`).
- `device_tokens.platform` is currently an unconstrained `varchar` — any tightening (e.g. a
  Postgres enum, a Zod-validated union at the API boundary) must not break the existing PUSH-004
  registration flow for already-valid `ios`/`android` values.
- Background/killed-app delivery requirements (e.g. `enableBackgroundRemoteNotifications`-style
  config, `UIBackgroundModes`) must be wired through `apps/mobile/app.config.ts`'s existing
  `expo-notifications` plugin entry, not a new parallel plugin.
- Push delivery remains explicitly best-effort — Apple and Google both disclaim delivery
  guarantees; no acceptance criterion may assume guaranteed, ordered, or time-bounded delivery.
- No RN/mobile component or E2E test runner exists in this repo (project-wide gap, unchanged by
  this SPEC) — any criterion whose proof requires observing real on-device notification receipt is
  Agent-Probe only (see AC-6), never claimed as automated coverage.

## Open Questions

None blocking — the items below are explicitly deferred to INNOVATE by design, not unresolved
intent:

1. **Transport path** — provision credentials for the existing `expo-server-sdk` relay (smaller
   change) vs. replace it with raw `firebase-admin` + `@react-native-firebase/messaging` (larger
   change, requires a custom EAS dev build since RN Firebase can't run in Expo Go). Research
   findings favor evaluating the small-change path first given the existing working relay, but the
   decision itself belongs to INNOVATE. Owner: INNOVATE.
2. **Token-lifecycle pruning mechanism** — hard-delete the `device_tokens` row vs. an
   `is_active`/`invalidated_at` soft-delete column. Research pass found no existing best-practice
   pattern to follow. Owner: INNOVATE.
3. **`platform` column tightening mechanism** — Postgres native enum vs. a `varchar` +
   Zod-validated union at the API boundary (matching how `NotificationType` is currently
   TS-enforced but not DB-enforced, per PUSH-004's Background section). Owner: INNOVATE.
4. **Where background-payload construction lives** — inside the existing
   `dispatchOrderNotification` / `sendPush` seam vs. a new dedicated payload-builder module. Owner:
   INNOVATE/PLAN.

## Background / Research Findings

**Current state (verified read-only, this session):**
- Transport is `expo-server-sdk` v3 (`packages/api/src/lib/push-provider.ts`), not raw
  `firebase-admin`/FCM. `sendPush()` never throws, times out at 5s per chunk, and logs
  `[push] would send...` when `EXPO_ACCESS_TOKEN` is unset — exactly zero live sends have ever
  happened in this project.
- `device_tokens` (`packages/api/src/db/schema/device_tokens.ts`) stores one row per physical
  device (`device_id` globally unique), `platform` is an unconstrained `varchar`.
- Mobile registration (`apps/mobile/src/features/notifications/lib/notification-permission.ts`)
  uses `expo-notifications`' `getExpoPushTokenAsync()` (the Expo-wrapped token, not the raw
  native FCM/APNs token).
- `apps/mobile/app.config.ts` already has the bare `expo-notifications` plugin entry (line 85) with
  no additional background-mode/credential-reference configuration yet, and no
  `google-services.json` / APNs entitlement / Firebase project anywhere in the repo.
- No RN test runner exists — mobile-side registration/permission behavior stays Agent-Probe only,
  consistent with the rest of this repo (per `all-tests.md`).

**External deep research findings (103-agent adversarially-verified pass, 21 primary sources —
Firebase/Expo official docs), carried forward from this session's RESEARCH phase:**
- FCM never delivers directly to iOS — it always relays through APNs, which needs an APNs auth key
  uploaded to the Firebase project (requires a paid Apple Developer account to generate). Android
  goes through FCM's own transport layer directly.
- `expo-notifications` is push-service-agnostic — `getDevicePushTokenAsync()` (raw native
  FCM/APNs token) exists as an alternative to `getExpoPushTokenAsync()` if a raw-Firebase transport
  path is chosen later; the app is not locked into the Expo relay.
- Legacy FCM server-key/XMPP API was fully shut down mid-2024 — any raw-FCM server integration must
  use FCM HTTP v1 (OAuth2/service-account auth), not the old server-key API.
- Background/killed-app delivery on iOS requires the `enableBackgroundRemoteNotifications`
  config-plugin property (adds `remote-notification` to `UIBackgroundModes`) plus a data-only
  payload (no title/body at the OS level) with `_contentAvailable: true`.
- Push delivery on both platforms is explicitly best-effort — Apple disclaims background-delivery
  guarantees outright; Android Doze mode can delay/throttle messages; Firebase's own April 2025
  engineering blog states "FCM is not intended to be used as critical infrastructure."
- Token-lifecycle handling (refresh/invalidation for `NotRegistered`/`InvalidRegistration`-class
  FCM errors) has no single verified best-practice pattern from this research pass — this is why it
  is carried forward as Open Question 2 for INNOVATE rather than decided here.

**Why credential provisioning is split out of agent scope:** no agent in this harness can create a
Firebase project, hold or manage a paid Apple Developer account, generate an APNs auth key, or
upload live EAS credentials — these are irreducibly manual, account-owning-human actions. Every
acceptance criterion in this SPEC other than AC-5 (document review) and AC-6 (manual hardware
walkthrough, gated on AC-5 being done) is scoped specifically to code that becomes correct/testable
*once* those credentials exist, without requiring them to exist during this session or in CI.

**Cross-reference:** the full PUSH-004 report and SPEC live at
`process/features/rewards-notifications/active/push-notifications-api_14-07-26/` — read that
folder's `push-notifications-api_REPORT_14-07-26.md` §"What Was Skipped or Deferred" for the exact
prior framing of this gap ("Live on-device push receipt — SPEC-justified Known-Gap ... AC-6
log-fallback is the automated substitute").
