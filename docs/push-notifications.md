# Push Notifications — Developer & Ops Guide

This is a technical implementation/ops guide for this repo's push notification system. It covers
how the code works, how to provision real push credentials on your own machine, and how to test
delivery end to end. It assumes you already know the repo layout (see the root
`process/context/all-context.md`); it does not re-explain the monorepo.

Two prior artifacts fed into this doc and remain useful primary sources:

- `process/features/rewards-notifications/active/real-push-delivery_15-07-26/` — the SPEC, PLAN
  (with its Validate Contract), and EXECUTE report for the hardening pass that made this system
  production-shaped (platform validation, background payload shaping, token pruning).
- `process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_REF-credential-runbook_15-07-26.md`
  — the original credential-provisioning runbook, written before this repo's actual Android
  native-folder situation was discovered. This doc supersedes it for Android; it is still the
  primary reference for iOS.

---

## 1. Overview

When an order's status changes (accepted, preparing, ready, cancelled), the API writes a
notification record and attempts to push it to every device registered for that customer. The
transport is Expo's push relay (`expo-server-sdk`), which forwards to Apple Push Notification
service (APNs) for iOS and Firebase Cloud Messaging (FCM) for Android. Until real credentials are
provisioned, every send attempt hits a log-fallback branch — nothing has ever landed on a real
device in this project until the Android setup described in this doc was done. This doc explains
how the code is structured, how to provision the credentials it needs, and how to verify delivery
end to end.

---

## 2. Architecture

```
Order status transition (staff.ts PATCH handler)
        |
        v
dispatchOrderNotification()  (packages/api/src/routes/lib/notification-dispatch.ts)
        |
        v
sendAndPrune()  ->  sendPush()  (packages/api/src/lib/push-provider.ts)
        |
        v
expo-server-sdk  (Expo's push relay)
        |
   +----+----+
   |         |
  FCM       APNs
(Android)   (iOS)
   |         |
   v         v
 device    device
```

### Why the Expo relay, not raw firebase-admin / @react-native-firebase

The PLAN's INNOVATE decision (locked, "Path A") was to harden the existing `expo-server-sdk`
transport in place rather than replace it with `firebase-admin` (server-side) +
`@react-native-firebase/messaging` (client-side). Reasons:

- The Expo relay was already working end to end (log-fallback branch, token registration,
  dispatch wiring) — replacing it is a materially larger change with a new native dependency and
  a custom EAS dev build requirement (RN Firebase cannot run inside Expo Go).
- `expo-notifications` is push-service-agnostic: it exposes `getDevicePushTokenAsync()` (raw
  native FCM/APNs token) as an escape hatch if a raw-Firebase transport is ever chosen later — the
  app is not locked into the Expo relay by this decision.
- FCM's legacy server-key/XMPP API was shut down in mid-2024; any raw-FCM integration today must
  use FCM HTTP v1 (OAuth2 / service-account auth) — which is exactly what a Firebase Admin SDK
  service-account key (see §4) authenticates as, whether you talk to it directly or, as this repo
  does, let Expo's relay hold and use it on your behalf.

### Delivery is best-effort, not guaranteed, not truly realtime

Push delivery through FCM/APNs is inherently best-effort on both platforms — this is not a defect
in this implementation, it's a property of the transport. Apple explicitly disclaims
background-delivery guarantees. Android's Doze mode can delay or throttle messages. Firebase's own
engineering team wrote in an April 2025 blog post that FCM "is not intended to be used as critical
infrastructure" — i.e. do not build a flow that assumes a push will always arrive, arrive in order,
or arrive within any specific time bound. No acceptance criterion or design decision in this system
assumes otherwise; the order-tracking screen inside the app remains the source of truth, and push
is a best-effort nudge on top of it.

---

## 3. How It's Implemented (Code Tour)

### `packages/api/src/lib/push-provider.ts` — `sendPush`

The low-level send function. Signature:

```ts
export async function sendPush(
  tokens: string[],
  notification: PushPayload,
): Promise<PushSendResult[]>
```

- When `EXPO_ACCESS_TOKEN` is unset (the CI/local-dev default), it logs exactly one
  `[push] would send (EXPO_ACCESS_TOKEN unset): ...` line and returns every input token as
  `{ status: 'ok' }` — no `Expo` client is constructed, no network call happens. This is the same
  log-fallback pattern already used elsewhere in this repo (e.g. `RESEND_API_KEY` in `auth.ts`).
- When a real token is set, it filters out non-Expo-format tokens (`Expo.isExpoPushToken`), builds
  `ExpoPushMessage` objects (each carrying `priority: 'high'` and `_contentAvailable: true` in
  addition to the visible `title`/`body`/`sound`), chunks them via `expo.chunkPushNotifications`,
  and sends each chunk through `sendPushNotificationsAsync`, bounded by a 5-second per-chunk
  timeout (`SEND_TIMEOUT_MS`).
- It never throws — a push failure must not roll back or delay the order transaction that
  triggered it.
- It returns `PushSendResult[]` (`{ token, status: 'ok' | 'error', errorType? }`) so callers can
  see per-token outcomes and decide what to prune.

**Ticket-to-token correlation gotcha:** `sendPushNotificationsAsync` returns tickets in the same
order as the chunk of messages you sent it — but that chunk was built from `validTokens` (the
input tokens *after* filtering out malformed ones), not the raw `tokens` argument. The code
correlates each ticket back to its token by position **within that chunk** (falling back to
`ticket.details?.expoPushToken` when the SDK echoes it back on an error ticket), never by zipping
`tickets` against the original unfiltered `tokens` array. Zipping against the raw array would
misalign indices the moment any token got filtered out, and could prune the wrong device's row.
This is locked in by a unit test in `push-provider.test.ts` using a mixed valid+invalid token
batch — do not "simplify" this correlation logic without re-reading that test.

### `packages/api/src/routes/lib/notification-dispatch.ts` — `sendAndPrune`, `dispatchOrderNotification`

- `sendAndPrune(tokens, payload)` is the shared helper both dispatchers call instead of `sendPush`
  directly. It calls `sendPush`, then for every result with `status === 'error'` and
  `isPermanentPushError(errorType)` (currently only `DeviceNotRegistered`), it hard-deletes the
  matching `device_tokens` row (`WHERE push_token = <token>`). A delete failure is swallowed
  (logged, not thrown) — pruning a dead token is best-effort cleanup, not something that should
  break the send path.
- `dispatchOrderNotification(order, event)` handles the 4 transactional events
  (`accepted | preparing | ready | cancelled`), writes exactly one `notifications` row per
  transition (application-layer dedupe on `(user_id, type, orderId)`, not a DB constraint), then
  calls `sendAndPrune`.
- `dispatchMarketingNotification(userId, type, payload)` gates on `users.marketingOptIn === true`
  first, unconditionally, before writing or sending anything — no code path may bypass this.

**Known gap: receipt-stage failures aren't caught.** Expo's fully correct `DeviceNotRegistered`
detection is two-phase: the send call returns tickets immediately, and the *actual* delivery
receipt (which is where most `DeviceNotRegistered` failures manifest, not at the ticket stage)
only becomes available ~15+ minutes later via `getPushNotificationReceiptsAsync`. This system only
inspects ticket-level errors — a token that fails only at the receipt stage will keep being sent to
until some other event (e.g. re-registration) resolves it. This was a deliberate scope decision
(building the receipt-polling loop needs persistent ticket storage + a scheduler-driven delayed
check), tracked as a backlog note:
`process/features/rewards-notifications/backlog/receipt-stage-token-prune_NOTE_15-07-26.md`.

### `packages/api/src/db/schema/device_tokens.ts`

One row per physical device, keyed globally by `device_id` (unique constraint
`device_tokens_device_unique`), not per `(user, device)`. Re-registering the same `device_id`
under a different `user_id` reassigns the row rather than inserting a second one — a shared device
can only ever route pushes to one signed-in account at a time. `platform` is a `varchar`, tightened
at the API boundary (not the DB) to `z.enum(['ios', 'android'])` in
`packages/api/src/routes/notifications.ts` — any other value gets rejected with a 422 and no row
written.

### `apps/mobile/src/features/notifications/lib/notification-permission.ts`

`registerDeviceToken()` fetches the real Expo push token (`getExpoPushTokenAsync`, using the EAS
project id from `app.config.ts`'s `extra.eas.projectId` when present) and a stable per-device id
(`getIosIdForVendorAsync` on iOS, `getAndroidId` on Android), then POSTs to
`/notifications/device-tokens` with `platform: Platform.OS` — which is always exactly `'ios'` or
`'android'` at RN runtime, so it's automatically compatible with the server's stricter enum. All
native/auth imports inside this function are dynamic so the module's top level stays importable
from the plain-Node vitest environment (no RN/native code loaded at import time).

### `apps/mobile/app.config.ts`

The `expo-notifications` plugin entry is a tuple, not a bare string:

```ts
[
  'expo-notifications',
  {
    enableBackgroundRemoteNotifications: true,
  },
],
```

This wires the `remote-notification` `UIBackgroundModes` entitlement on iOS so a killed or
backgrounded app can still be woken to process a push. Combined with `priority: 'high'` and
`_contentAvailable: true` on the payload (see above), this is what lets a notification reach the
device even when the app isn't running. No secret/credential file needs to exist in the repo for
this config to typecheck, lint, or build — that's intentional (see §4).

---

## 4. Credential Setup (Android)

Android push (FCM) is set up and has been tested in this repo as of this session. Read this whole
section before touching anything — the two credential files below are easy to confuse, and getting
them backwards wastes time.

### The two files, and why they're different

| | `google-services.json` | Firebase Admin SDK service account key |
|---|---|---|
| What it is | Client config — tells the Android app which Firebase project to register with | Server-side credential — a private key with FCM-send authority |
| Filename pattern | Always exactly `google-services.json` | `{project}-firebase-adminsdk-{random}.json` |
| Where it comes from | Firebase Console → Project settings → **Your apps** → Android app → download config | Firebase Console → Project settings → **Service Accounts** tab → Generate new private key |
| Where it goes | Bundled into the APK at build time (native Gradle wiring, see below) | Uploaded via `eas credentials` (Android → Google Service Account → Push Notifications FCM V1) |
| What it does | Registers the installed app with Firebase/FCM so the app can receive messages | Lets Expo's push-sending infrastructure authenticate to your Firebase project's FCM v1 API to actually send messages |

Mixing these up is the single most confusing part of this setup. If `eas credentials` is asking you
to upload a "Google Service Account Key," it wants the **second** file, not `google-services.json`.

### Why this repo needs manual native wiring (not just `eas credentials`)

The original credential runbook (§4/Step 4 of
`real-push-delivery_REF-credential-runbook_15-07-26.md`) assumed a clean managed-workflow Expo
project, where EAS Build generates the native Android/iOS projects on the fly and `eas credentials`
alone is enough to wire `google-services.json` in. That assumption does not hold here:
`apps/mobile/android/` is a **committed native folder** (54 tracked files, confirmed via
`git ls-files apps/mobile/android`), which EAS Build treats as bare-workflow — "an android
directory was detected in the project... EAS Build will use the value found in the native code."
This is recorded explicitly in the repo's own root `.gitignore`:

```
# Expo prebuild native output. NOTE: apps/mobile/android IS committed (tracked on
# `development`, adopted here on merge); only ios stays generated/ignored.
/apps/mobile/ios
```

(Note the comment: `android` is deliberately *not* in that ignore rule — only `/apps/mobile/ios`
is.)

Practically, this means `google-services.json` is **not** handled via `eas credentials` at all —
it must be physically placed in the native Android project, and two Gradle files need manual
wiring. Both are already done in this repo as of this session; if you're setting this up fresh
somewhere else (or verifying it's still correct), check for:

1. **`apps/mobile/android/build.gradle`** — the Google Services Gradle plugin classpath, inside
   `buildscript { dependencies { ... } }`:

   ```gradle
   classpath('com.google.gms:google-services:4.4.2')
   ```

2. **`apps/mobile/android/app/build.gradle`** — the plugin applied as the 4th `apply plugin` line
   (after `com.android.application`, `org.jetbrains.kotlin.android`, `com.facebook.react`):

   ```gradle
   apply plugin: "com.android.application"
   apply plugin: "org.jetbrains.kotlin.android"
   apply plugin: "com.facebook.react"
   apply plugin: "com.google.gms.google-services"
   ```

`expo-notifications`' Android module already depends on
`com.google.firebase:firebase-messaging:25.0.1` via autolinking — no extra dependency needs adding
beyond applying the plugin above.

### Placing `google-services.json`

Download it from Firebase Console → Project settings → **Your apps** → Android app (package name
`ph.jojopotato.mobile`, matching `android.package` in `app.config.ts`) → download config. Place a
copy in **both** locations:

- `apps/mobile/google-services.json` — kept for reference (mirrors the
  `GoogleService-Info.plist`-sibling convention the original runbook assumed).
- `apps/mobile/android/app/google-services.json` — the one that actually gets built into the
  native app. This is required specifically because of the committed `android/` folder above; a
  pure managed-workflow project would not need this second copy.

Both are gitignored — see below.

### Gitignore coverage

`apps/mobile/.gitignore` has explicit entries for all push-related credential files (confirmed
present as of this session):

```
# Firebase per-project config (per-project, not app source; EAS Build/credentials
# manage these remotely — must stay OUT of git per the push-delivery credential runbook)
google-services.json
GoogleService-Info.plist

# Firebase Admin SDK / FCM v1 service account key — a LIVE private key with
# Cloud Messaging send authority. Never commit; provision via EAS credentials.
# Glob (not the exact filename) because the suffix is random per regeneration
# (e.g. {project}-firebase-adminsdk-{random}.json).
*firebase-adminsdk*.json
```

The `google-services.json`/`GoogleService-Info.plist` rules are bare filenames, so they match at
any depth (both `apps/mobile/google-services.json` and
`apps/mobile/android/app/google-services.json` are covered). The `*firebase-adminsdk*.json` glob
covers the Admin SDK service account key wherever you happen to download it — never commit it to
this repo or any other.

### The `eas credentials` walkthrough (uploading the Admin SDK key for FCM V1)

This is the confusing, nested-menu part — the steps below are the exact flow that worked this
session:

```bash
cd apps/mobile
npx eas-cli credentials --platform android
```

1. Select build profile: **`development`**.
2. Main menu → **"Google Service Account"**.
3. Submenu → **"Upload a Google Service Account Key"** → point it at the downloaded Firebase
   Admin SDK key file (the `{project}-firebase-adminsdk-{random}.json` one, NOT
   `google-services.json`). This adds the key to your account's key pool — it does **not** assign
   it to a slot yet.
4. Submenu → **"Manage your Google Service Account Key for Push Notifications (FCM V1)"** →
   **"Select an existing Google Service Account Key for Push Notifications (FCM V1)"** → pick the
   key you just uploaded. This is the step that actually **assigns** it to FCM V1 — the
   "Push Notifications (FCM V1)" section in the credentials summary flips from "None assigned yet"
   to showing the key's client email/project ID once this completes.

If you only do step 3 and skip step 4, the key exists in your account but is not wired to FCM V1
sends — this is the most common way to think you're done when you're not.

---

## 5. Credential Setup (iOS)

**Status: not yet done.** The developer who did the Android setup this session does not have a
paid Apple Developer account yet, so iOS push was not configured or tested. This is not broken —
it was never attempted.

Whether `apps/mobile/ios/` is committed the same way `apps/mobile/android/` is turns out to matter
a lot here, and it was checked directly this session:

```bash
git ls-files apps/mobile/ios | head -5
```

This returns **nothing** — no `ios/` folder is tracked. The root `.gitignore` confirms this is
deliberate:

```
# Expo prebuild native output. NOTE: apps/mobile/android IS committed (tracked on
# `development`, adopted here on merge); only ios stays generated/ignored.
/apps/mobile/ios
```

So **iOS is still pure managed-workflow / CNG-generated** — unlike Android, there is no committed
native project to hand-wire a Gradle-equivalent into. This means the original credential runbook's
assumption (a clean managed workflow, `eas credentials` alone handles everything) should still
hold for iOS. In other words: the Android-specific manual native wiring documented in §4 above is
NOT expected to have an iOS analog — but this has not been verified end to end (no APNs key has
ever been generated or uploaded for this project), so treat it as a strong inference from the repo
state, not a tested fact.

When someone picks up iOS:

1. Follow Steps 2–3 of the original runbook
   (`real-push-delivery_REF-credential-runbook_15-07-26.md`) — generate an APNs auth key at
   <https://developer.apple.com/account/resources/authkeys/list> (requires the paid Apple Developer
   account), then upload it to Firebase Console → Project settings → Cloud Messaging → Apple app
   configuration → APNs Authentication Key.
2. Add the iOS app to the Firebase project (Project settings → Your apps → Add app → iOS, bundle id
   `ph.jojopotato.mobile`) and download `GoogleService-Info.plist`.
3. Run `eas credentials --platform ios` and use "Push Notifications → Set up Push Notifications" to
   attach the key.
4. Sanity-check whether prebuild still generates a fresh `ios/` project cleanly (`npx expo prebuild
   --platform ios` or `npx expo run:ios`) with `GoogleService-Info.plist` referenced correctly, the
   way the original runbook assumed — since that assumption has not been tested against this repo's
   actual state, confirm it rather than trusting it blind.
5. Rebuild the dev client (`npx expo run:ios` or an EAS development build) — `expo-notifications`
   is a native module, and this pass's `enableBackgroundRemoteNotifications` entitlement only takes
   effect in a fresh native build, not an OTA update.

---

## 6. Per-Developer EAS Project Config

There are two supported paths for getting your local build to send/receive against a real EAS
project. Use path (a) unless you have a specific reason not to.

### (a) Recommended — shared account membership

Get invited to the shared `jojo-potato` Expo/EAS account. No config changes needed — the repo's
`app.config.ts` already points at the shared project by default. This is the path actually used
this session: the project's EAS owner granted the developer (`jsrl`) membership on the
`jojo-potato` account (Admin role). Confirm it worked with:

```bash
eas whoami
```

Seeing both your own account (`jsrl`, Owner of your personal account) and `jojo-potato` (with your
Admin/Role on it) listed under Accounts confirms the membership is live.

### (b) Fallback — your own separate EAS project + env override

If you can't get invited, or want full isolation, `apps/mobile/app.config.ts` supports overriding
the EAS project per developer without touching the shared file:

```ts
const easProjectId = process.env.EAS_PROJECT_ID ?? 'a89a764c-ce21-4fa6-a6ab-071b87092350';
const easOwner = process.env.EAS_OWNER ?? 'jojo-potato';
```

Set `EAS_PROJECT_ID` and `EAS_OWNER` in your own `apps/mobile/.env` or `.env.local` (Expo CLI
loads either) to point your local build at your own personal EAS project instead of the shared
one. This mirrors the pre-existing `GOOGLE_MAPS_API_KEY` override pattern already in the same
file. `apps/mobile/.env.example` documents both variables.

To create your own project for this path, use the Expo dashboard (<https://expo.dev>) directly —
**do not use `eas init`** for this. See the warning below.

### Warning: never run `eas init --force`

`eas init` is the normal way to bootstrap/link an EAS project, but running it with
`--force`/`--non-interactive` in this repo is dangerous: it will attempt to overwrite the shared,
checked-in `app.config.ts`'s hardcoded `extra.eas.projectId`/`owner` fields. This repo's harness
actually blocked that exact command mid-session as too risky. If you need your own project, create
it via the Expo dashboard and use the env-override path (b) above — never `eas init --force`
against this repo's `app.config.ts`.

---

## 7. Testing

### Primary/fast path — `push:test` script

`packages/api/scripts/send-test-push.ts`, run via:

```bash
pnpm --filter @jojopotato/api push:test
```

What it does: queries `device_tokens` for the most-recently-active registered device (ordered by
`last_seen_at` desc, no CLI args) and sends one real test push through the exact same `sendPush`
function the app uses — no push logic is reimplemented. If `EXPO_ACCESS_TOKEN` isn't set, it warns
loudly and tells you the run will only hit the log-fallback path. If `device_tokens` is empty, it
tells you to open the rebuilt app on a physical device, sign in, and grant notification permission
first (which populates the table via `POST /notifications/device-tokens`).

This is the fastest way to confirm the whole pipeline (server → Expo → FCM → physical device)
without placing a real order — use it right after rebuilding a dev client with new Firebase/FCM
wiring.

### Full/realistic path — manual order-flow walkthrough

For each platform (iOS once credentials exist, Android now):

1. Sign in on the physical device as a normal customer account and accept the notification
   permission prompt — this registers the device's Expo push token.
2. Place an order at a branch (order lands in `pending`).
3. On the staff side, move the order through: **accept → prepare → ready** (and try **cancel** on
   a separate order). Each transition fires a transactional push.
4. Watch the customer device across three app states:
   - **Foregrounded** — in-app UI should handle it (no OS banner needed).
   - **Backgrounded** — OS notification tray/banner should appear.
   - **Fully killed** (swiped away) — this is the case `priority: 'high'` +
     `_contentAvailable: true` + `enableBackgroundRemoteNotifications` exist to support; confirm
     the OS wakes the app briefly and still shows the notification.
5. Tap the notification and confirm it deep-links into the order tracking screen.
6. Optional token-pruning sanity check: uninstall the app (or disable notifications) so the token
   goes stale, then trigger another order-status push. A `DeviceNotRegistered` ticket error should
   eventually prune that device's `device_tokens` row (subject to the receipt-stage gap in §8 —
   this may not happen on the first attempt).

Set `EXPO_ACCESS_TOKEN` in the API server's environment (never as an `EXPO_PUBLIC_*` var, never in
the mobile bundle) before any of this will actually send instead of log.

---

## 8. Known Gaps / Limitations

- **iOS untested.** No APNs key has ever been generated or uploaded for this project (§5). The
  managed-workflow assumption is a strong inference from the repo state (`ios/` is not committed),
  not a verified fact — confirm it when picking this up.
- **Receipt-stage token pruning is not implemented.** Only ticket-level `DeviceNotRegistered`
  errors prune a device's row; the more common receipt-stage failure (surfacing ~15+ minutes later
  via `getPushNotificationReceiptsAsync`) is not caught by this pass. Tracked in
  `process/features/rewards-notifications/backlog/receipt-stage-token-prune_NOTE_15-07-26.md`.
- **No true realtime guarantee.** Push delivery through FCM/APNs is best-effort on both platforms
  (§2) — never build a flow that assumes guaranteed, ordered, or time-bounded delivery. The in-app
  order tracking screen remains the authoritative source of truth.
- **No RN automated test runner for the mobile-side permission/registration flow.** This is a
  project-wide gap (see `process/context/tests/all-tests.md` §Known Gaps), not specific to push:
  `notification-permission.ts`'s real device-token registration path (`registerDeviceToken`) is
  covered only by typecheck/lint plus manual Agent-Probe walkthroughs — there is no RN
  component/E2E runner in this repo to exercise it automatically. The pure-logic pieces (fire-once
  guard, permission-result branching) do have vitest coverage; the native call sites do not.

---

## 9. Troubleshooting

- **Nothing arrives; backend logs `[push] would send (EXPO_ACCESS_TOKEN unset)`.**
  `EXPO_ACCESS_TOKEN` isn't set in the API server's environment, or the server wasn't restarted
  after setting it. Check with `pnpm --filter @jojopotato/api push:test` — it prints an explicit
  warning banner when the token is missing.
- **iOS silent, Android works.** Expected right now — iOS credentials have never been provisioned
  (§5). Once they are: confirm the APNs key was actually uploaded to Firebase (not just generated
  on Apple's side), and that the iOS dev client was rebuilt after adding the background
  entitlement (an OTA update does not pick up native config changes).
- **`eas credentials` says you don't have permission, despite being told an invite was sent.**
  Account membership on `jojo-potato` isn't actually active yet — verbal/Slack confirmation that an
  invite was sent is not the same as the invite being accepted. Run `eas whoami` and check that
  `jojo-potato` actually appears in your Accounts list with a role attached before assuming
  membership is live. If it's not there, chase down acceptance of the invite (check your email/the
  Expo dashboard's pending-invites view) rather than re-running credential commands — the error is
  an auth/permission problem, not a credentials-flow problem.
- **`DeviceNotRegistered` immediately for every token.** The token was registered against a
  different Expo project than the one `EXPO_ACCESS_TOKEN` belongs to. Confirm both the mobile app's
  build and the API server's token point at the same `extra.eas.projectId` (see §6 — this is
  exactly the kind of mismatch the env-override path can silently cause if only one side is
  overridden).
- **You uploaded `google-services.json` via `eas credentials` and nothing changed.** You uploaded
  the wrong file to the wrong place — `eas credentials`' "Google Service Account" flow wants the
  Firebase **Admin SDK service account key**, not `google-services.json`. `google-services.json`
  needs to be placed directly in `apps/mobile/android/app/` and picked up by the native Gradle
  build (§4), not uploaded through EAS, because of this repo's committed `android/` folder.
- **Push works foregrounded but not when backgrounded/killed.** The dev client wasn't rebuilt after
  the `enableBackgroundRemoteNotifications` config change — this is a native entitlement, so it
  only takes effect in a fresh build (`npx expo run:android` / `npx expo run:ios`, or a new EAS
  development build), never via an OTA JS-only update.
- **Android build fails after adding `google-services.json`.** Double-check both Gradle files from
  §4: the `classpath('com.google.gms:google-services:4.4.2')` line must be inside
  `buildscript { dependencies { ... } }` in `apps/mobile/android/build.gradle`, and
  `apply plugin: "com.google.gms.google-services"` must be present as its own line in
  `apps/mobile/android/app/build.gradle` (order relative to the other 3 `apply plugin` lines
  doesn't matter functionally, but this repo keeps it last).
- **`push:test` says "No rows in device_tokens."** No device has registered yet. Open the rebuilt
  app on a physical device, sign in, and accept the notification permission prompt — this triggers
  `registerDeviceToken()` → `POST /notifications/device-tokens`, which populates the table. Then
  re-run the script.
