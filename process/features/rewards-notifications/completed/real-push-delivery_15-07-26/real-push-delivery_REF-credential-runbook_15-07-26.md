---
name: report:real-push-delivery-credential-runbook
description: "Human-executable runbook for provisioning real push credentials (Firebase, APNs, EAS) and running the on-device delivery walkthrough (AC-5/AC-6). No source-code reading required."
date: 15-07-26
metadata:
  node_type: reference
  type: reference
  feature: rewards-notifications
  phase: real-push-delivery
---

# Credential Provisioning Runbook — Real Push Delivery (iOS + Android)

**Who this is for:** the person setting up live push credentials for Jojo Potato. You do NOT
need to read or change any source code. This is a checklist you follow once.

**Why it exists:** the app's push backend (PUSH-004 + this hardening pass) is fully built and
tested, but it has never had real credentials. Until the steps below are done, every push is
*logged instead of sent* — nothing lands on a real phone. Completing this runbook flips the
backend from "log-only" to "really sends," and then lets you run the on-device test (AC-6).

**TL;DR:** create a Firebase project → give Firebase your Apple push key (APNs) → download two
config files → upload them to EAS → set one server env var (`EXPO_ACCESS_TOKEN`) → build a dev
client → send yourself a test order-status push.

---

## Before you start — what you'll need

- [ ] A **paid Apple Developer account** ($99/yr). Required for iOS push — APNs keys cannot be
      created on a free account. (Android/FCM is free.)
- [ ] Owner/admin access to the project's **Expo/EAS account** (`owner: jojo-potato`, EAS
      project id `a89a764c-ce21-4fa6-a6ab-071b87092350` — see `apps/mobile/app.config.ts`).
- [ ] A **physical iOS device and a physical Android device** for the final test. Push
      notifications do **not** work in the iOS Simulator or in Expo Go — they need a real
      device running a custom dev/build client.

---

## Step 1 — Create a Firebase project (Android push transport, FCM)

1. Go to <https://console.firebase.google.com/> → **Add project**. Name it e.g.
   `jojo-potato` (any name; this is just the FCM backend).
2. Skip Google Analytics unless you want it (not required for push).
3. In the new project: **Project settings → General → Your apps → Add app → Android**.
   - **Android package name:** `ph.jojopotato.mobile` (must match `android.package` in
     `apps/mobile/app.config.ts` exactly).
   - Download the generated **`google-services.json`**. Keep it — Step 4 uploads it.
4. Still in **Project settings → General → Your apps → Add app → iOS** (Firebase routes iOS
   push through APNs on your behalf via FCM v1).
   - **Apple bundle ID:** `ph.jojopotato.mobile` (must match `ios.bundleIdentifier`).
   - Download the generated **`GoogleService-Info.plist`**. Keep it — Step 4 uploads it.

> Keep both files OUT of git. They are per-project config, not app source. EAS stores them as
> credentials (Step 4); they never need to live in this repo. (The app builds, typechecks, and
> lints with neither file present — that is intentional.)

## Step 2 — Generate an APNs auth key (iOS push, Apple side)

1. Go to <https://developer.apple.com/account/resources/authkeys/list> (Apple Developer →
   Certificates, Identifiers & Profiles → **Keys**).
2. **Create a key** → give it a name (e.g. `Jojo Potato Push`) → check **Apple Push
   Notifications service (APNs)** → Continue → Register.
3. **Download the `.p8` key file.** Apple lets you download it **once** — save it somewhere
   safe. Note the **Key ID** (shown on the page) and your **Team ID** (top-right of the Apple
   Developer portal).

## Step 3 — Give the APNs key to Firebase

1. Firebase Console → **Project settings → Cloud Messaging**.
2. Under **Apple app configuration → APNs Authentication Key → Upload**.
3. Upload the `.p8` from Step 2, and enter its **Key ID** and your **Team ID**.
4. Save. Firebase can now deliver to iOS via APNs.

## Step 4 — Upload the config files to EAS credentials

Run these from `apps/mobile/` (install the EAS CLI first if needed: `npm i -g eas-cli`, then
`eas login`):

1. **Android (FCM):**
   ```bash
   eas credentials
   ```
   Choose **Android → production (or development) → Google Service Account / FCM V1** and follow
   the prompt to attach the `google-services.json` from Step 1. (Alternatively, place the file
   and reference it via `expo-build-properties`; the interactive `eas credentials` flow is the
   simplest.)
2. **iOS (APNs / push key):**
   ```bash
   eas credentials
   ```
   Choose **iOS → Push Notifications → Set up Push Notifications** and let EAS create/attach the
   push key (or reuse the `.p8` from Step 2). Attach the `GoogleService-Info.plist` when prompted.

> If you prefer, EAS can auto-generate and manage the APNs key for you during
> `eas credentials` instead of the manual Step 2/3 — but if you use Firebase for the send
> transport (FCM v1), Firebase needs the APNs key too (Step 3), so doing Step 2/3 once and
> reusing that key everywhere is the least confusing path.

## Step 5 — Set the server push access token

The backend only *really sends* when `EXPO_ACCESS_TOKEN` is set (otherwise it logs and returns —
by design, so dev/CI never sends). To enable real sends in the environment that runs
`packages/api`:

1. In your Expo account: <https://expo.dev/accounts/[account]/settings/access-tokens> → **Create
   token**. Copy it.
2. Set it as an environment variable **wherever the API server runs** (your host/deploy env — NOT
   an `EXPO_PUBLIC_*` var, and NOT in the mobile bundle):
   ```
   EXPO_ACCESS_TOKEN=<the token you just created>
   ```
3. Restart the API server. From now on, an order-status transition that fires a push will attempt
   a real Expo send instead of logging a fallback line.

> Confirm the EAS project linkage is intact: `apps/mobile/app.config.ts` already carries
> `extra.eas.projectId` (`a89a764c-ce21-4fa6-a6ab-071b87092350`). The push tokens the mobile app
> registers are scoped to this project, so the `EXPO_ACCESS_TOKEN` must belong to the same Expo
> account that owns that project.

## Step 6 — Build a dev client (native modules need a real build)

`expo-notifications` is a native module and this pass added the background-delivery entitlement
(`enableBackgroundRemoteNotifications: true`), so you must build a fresh client — Expo Go cannot
run it:

```bash
# from apps/mobile/
npx expo run:ios      # or: eas build --profile development --platform ios
npx expo run:android  # or: eas build --profile development --platform android
```

Install the resulting build on your physical device(s).

---

## Step 7 — AC-6 on-device delivery walkthrough (the actual test)

Do this once Steps 1–6 are complete. This is the manual proof that real pushes land — it cannot
be automated (no push credentials or physical hardware exist in CI, by design).

For **each** platform (iOS, then Android):

1. **Sign in** on the physical device as a normal customer account. Accept the notification
   permission prompt when the app asks (the app registers the device's Expo push token with
   `POST /notifications/device-tokens` — the `platform` it sends is always `ios`/`android`).
2. **Place an order** at a branch so you have an order in `pending`.
3. On the **staff side** (staff account / staff dashboard), move that order through its statuses:
   **accept → prepare → ready** (and try **cancel** on a separate order). Each transition fires a
   transactional push.
4. **Verify on the customer device:**
   - [ ] The notification banner appears for each transition (accepted / preparing / ready /
         cancelled).
   - [ ] It arrives even when the app is **backgrounded**.
   - [ ] It arrives when the app is **fully killed** (swiped away) — this is what the
         `priority: 'high'` + `_contentAvailable` + background-mode entitlement enable.
   - [ ] Tapping the notification deep-links into the order tracking screen.
5. **Token pruning sanity check (optional):** uninstall the app (or disable notifications) so the
   token becomes invalid, then trigger another order-status push. Over time Expo reports that
   token as `DeviceNotRegistered`; the backend hard-deletes its `device_tokens` row so it stops
   being targeted. (Note: with the current ticket-level pruning, a token that only fails at the
   *receipt* stage — ~15 min later — is not pruned in this pass; that receipt-polling follow-up is
   tracked in `process/features/rewards-notifications/backlog/`.)

If all boxes are checked on both devices, real push delivery is verified end-to-end.

---

## Troubleshooting

- **Nothing arrives, backend logs `[push] would send (EXPO_ACCESS_TOKEN unset)`:** `EXPO_ACCESS_TOKEN`
  isn't set in the API server's environment (Step 5), or the server wasn't restarted after setting it.
- **iOS silent, Android works:** APNs key not uploaded to Firebase (Step 3), or the iOS build
  wasn't rebuilt after adding the background entitlement (Step 6).
- **`DeviceNotRegistered` immediately for every token:** the token was registered against a
  different Expo project than the `EXPO_ACCESS_TOKEN` belongs to — confirm both use the same
  Expo account and the `extra.eas.projectId` in `app.config.ts`.
- **Push works foregrounded but not when killed:** confirm the dev client was rebuilt after this
  pass (the `enableBackgroundRemoteNotifications` entitlement only takes effect in a fresh native
  build, not an OTA update).
