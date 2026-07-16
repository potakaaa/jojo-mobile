---
name: spec:push-notifications-api
description: "Product-discovery SPEC for real push notification backend integration (tokens, provider wiring, delivery, opt-in gating, scheduler) — PUSH-004 / issue #75"
date: 14-07-26
feature: rewards-notifications
---

# SPEC — Push Notification API Integration (PUSH-004 / #75)

## Summary

Right now the app can *show* notifications on-screen, but nothing real is happening behind the
scenes — the notification list, the marketing opt-in toggle, and permission prompts (all built and
merged in PR #78) are wired to fake, locally-stored sample data. This work makes push notifications
real: when a customer's order status changes (accepted, preparing, ready, or the order gets
cancelled), the app actually stores that event and sends a real push notification to the
customer's phone — not a placeholder. It also lays the groundwork so future marketing pushes
(deal reminders, coupon-expiry nudges, reward unlocks) can be sent on a schedule, and makes sure a
customer who has turned marketing notifications off never receives one, no exceptions.

## User Stories / Jobs To Be Done

1. **As a customer**, I want to receive a real push notification on my phone when my order status
   changes (accepted / preparing / ready / cancelled), so that I know what's happening with my
   order without having to keep the app open.
2. **As a customer**, I want my notification history (the in-app notification list) to reflect
   real events that actually happened, not placeholder data, so that I can trust what I see there.
3. **As a customer who has turned off marketing notifications**, I want to never receive a
   marketing-type push (deal alerts, coupon-expiry reminders, reward-unlocked nudges), so that my
   opt-out preference is actually respected.
4. **As a customer using multiple devices** (e.g. phone + tablet, or after reinstalling the app),
   I want push notifications to keep working correctly without duplicate or stale registrations,
   so that switching or adding devices doesn't break or spam my notifications.
5. **As the product**, we want a scheduling substrate in place so that time-based marketing
   triggers (a coupon about to expire, a new deal becoming available, "1 more order to unlock a
   reward") can fire pushes without a human manually triggering them, so that future marketing
   features (already scoped elsewhere) have real infrastructure to build on.
6. **As a developer/CI system**, I want the push-send pipeline to be testable without live
   provider credentials, so that automated tests can verify delivery logic (token targeting,
   opt-in gating, event coverage) without making real network calls to Expo/APNs/FCM in CI.

## What The User Wants (Behavioral Outcomes)

- When a staff member transitions an order to `accepted`, `preparing`, `ready`, or `cancelled`,
  the customer who placed that order receives exactly one push notification for that transition,
  and exactly one corresponding row appears in their in-app notification list — using the same
  categorization the notification list UI already expects (`order_accepted`, `order_preparing`,
  `order_ready`, `order_cancelled`).
- Opening the app's notification list shows real notifications for the signed-in user, newest
  first — not the current mock data.
- A customer registers their device for push once (during onboarding/permission-prompt, already
  built) and the app silently keeps that registration current — reinstalling the app, switching
  devices, or getting a new push token from the OS updates the existing registration rather than
  creating an unbounded pile of duplicates.
- A customer with the marketing opt-in switched off (the toggle already exists in Account/Settings
  UI) does not receive deal, coupon-expiring, stars-progress, reward-unlocked, or promo pushes —
  while still receiving order-status pushes (those are never gated by the marketing toggle).
- A scheduled/background process exists that can evaluate "is it time to send this marketing
  nudge yet?" and trigger a send — this SPEC only requires the substrate exists and demonstrably
  fires a trigger within its configured window; it does not require building the specific
  marketing campaigns themselves (those are separate, already-scoped work).
- If push provider credentials are not configured (e.g. local dev, CI), the system does not error
  or silently drop the notification — it still creates the notification record, and logs the
  outbound push attempt server-side instead of actually calling out to a live provider (matching
  the existing magic-link-email fallback pattern already used elsewhere in this codebase).

## Flow / State Diagram

**Transactional order-status push (happy path):**

```
Staff: PATCH /api/staff/orders/:orderId  (status: accepted|preparing|ready|cancelled)
        |
        v
  order-state-machine validates transition (existing, unchanged)
        |
        v
  [notifyCustomer(order, event)]  <-- currently a no-op stub, becomes REAL
        |
        +--> write 1 row to `notifications` table
        |       (type = order_accepted|order_preparing|order_ready|order_cancelled,
        |        target_screen + target_params set per mobile contract,
        |        deterministic id: order:{orderId}:{status} for idempotent dedupe)
        |
        +--> look up customer's registered push token(s)
        |
        +--> send push via provider
        |       (no creds configured -> log instead of send, notification row still created)
        |
        v
  customer's phone shows push (if delivered) + GET /notifications reflects the new row
```

**Marketing push (opt-in gated):**

```
[scheduler tick]  or  [event trigger: deal published / coupon nearing expiry / stars threshold]
        |
        v
  candidate marketing notification identified for user U
        |
        v
  check U.marketing_opt_in
        |
   +----+----+
   |         |
  true      false
   |         |
   v         v
 send      SKIP (no notifications row, no push sent, no exception)
 (write row + push, same log-instead-of-send fallback as above)
```

**Device token registration (multi-device + rotation):**

```
App requests push permission (already built) -> OS returns a push token
        |
        v
  App sends token to backend with device identity
        |
        v
  Backend: does a record for THIS device already exist for this user?
        |
   +----+----+
   |         |
  yes        no
   |         |
   v         v
 UPDATE     INSERT new
 existing   device/token
 row        record
        |
        v
  Customer now has 1 row per physical device, never duplicated for the same device
```

## Acceptance Criteria (Testable Outcomes)

1. **A registered push token is stored against the correct user/device and updates (not
   duplicates) on rotation.**
   Registering the same physical device twice (e.g. token rotates after reinstall) results in one
   updated record for that device, never a second row.
   proven by: integration test — register token, re-register with new token value for the same
   device identity, assert single row with updated token.
   strategy: Fully-Automated

2. **Each of the 4 transactional status transitions (`accepted`, `preparing`, `ready`,
   `cancelled`) triggers exactly one `notifications` row write and exactly one push send attempt.**
   No transition is missed, none is double-fired, and no other status (e.g. `completed`,
   `rejected`, `pending`) triggers a customer push under this feature.
   proven by: integration test extending `staff-order-status.integration.test.ts` — drive each of
   the 4 transitions via `PATCH /api/staff/orders/:orderId`, assert exactly one `notifications`
   row per transition with the correct `type` value, and assert the push-send call was invoked
   exactly once per transition (mocked provider in test).
   strategy: Fully-Automated

3. **A user with marketing opt-in disabled never receives a marketing-type push, verified per
   type.**
   Covers all 5 marketing types (`deal`, `coupon_expiring`, `stars_progress`, `reward_unlocked`,
   `promo`) individually — opting out blocks every one of them, while transactional order pushes
   for the same user remain unaffected by the opt-in flag.
   proven by: integration test — for each of the 5 marketing types, attempt a send for a user with
   `marketing_opt_in = false`, assert zero notification row + zero push attempt; repeat for a user
   with `marketing_opt_in = true` and assert the send succeeds; separately assert an
   order-status push still sends for an opted-out user.
   strategy: Fully-Automated

4. **`GET /notifications` returns real rows for a signed-in user, ordered newest-first, matching
   what was inserted.**
   The response shape matches the mobile app's `AppNotification` contract (type, target screen,
   target params, read/created timestamps).
   proven by: integration test — seed several notification rows for a user across two different
   users, call the route as one signed-in user, assert only that user's rows are returned, in
   newest-first order, with fields matching what was inserted.
   strategy: Fully-Automated

5. **Time-based marketing triggers fire from the new scheduler within their configured window.**
   Demonstrated at the integration level (a fast-forwardable/injectable clock or short test
   window), not required to be verified at real wall-clock speed in CI.
   proven by: integration test — configure a trigger with a short test window, advance the
   scheduler's clock (or use dependency-injected time), assert the trigger fires exactly once
   within the window and not before/after.
   strategy: Fully-Automated

6. **Real push send behavior without live provider credentials is safe and observable.**
   When provider credentials are unset (dev/CI default), a transactional or opted-in marketing
   send still creates its `notifications` row, does not throw, and the "would-have-sent" attempt
   is logged server-side instead of calling a live provider.
   proven by: integration test — run a send with provider env vars unset, assert the notification
   row is created and no outbound HTTP call is attempted (provider client mocked/stubbed to fail
   the test if invoked).
   strategy: Fully-Automated

7. **The mobile notification list renders real backend data end-to-end (register → trigger →
   see in list).**
   A customer who places an order and has staff transition it through accepted → preparing →
   ready sees each transition appear in their in-app notification list without app restart, using
   the existing (already-built, unmodified) notification list screen.
   proven by: manual walkthrough — no RN test runner exists in this repo (project-wide gap, see
   `process/context/tests/all-tests.md`); this is Agent-Probe only, not automated.
   strategy: Agent-Probe

## Out Of Scope

- **Permission-prompt UI/timing** — already built and merged (PR #78, `notification-permission.ts`
  scoped to permission request only).
- **Opt-in toggle screen** — already built and merged (PR #78); this SPEC only makes the flag it
  writes actually gate real sends.
- **Notification tap deep-linking UI behavior** — already built and merged (PR #78,
  `notification-factory.ts`'s `TYPE_TARGET` map); this SPEC only has to produce data that map
  already knows how to route.
- **In-app notification list screen UI** — already built and merged (PR #78); this SPEC swaps its
  data source, not its UI.
- **Building the actual marketing campaigns** (specific deal-reminder copy, specific coupon
  expiry rules, specific reward-unlock thresholds) — this SPEC only delivers the scheduler
  substrate that lets such campaigns be triggered; the campaigns themselves are separate,
  already-scoped work (PUSH-003 territory).
- **Star/rewards accrual logic** — unrelated system (`STAR-00x`), not touched here even though it
  shares an edit location in `staff.ts`.
- **Coupon redemption/wallet logic** — unrelated, not in scope.
- **Live provider credential provisioning** (obtaining real Expo/APNs/FCM push credentials for
  production) — this is an operational/manual follow-up, not a coding deliverable.
- **Real SMS-based OTP delivery** — separate, already-tracked open item, unrelated to this issue.

## Constraints

- Must reuse the same `PATCH /api/staff/orders/:orderId` transition call site that already exists
  (`packages/api/src/routes/staff.ts`) — no parallel/duplicate status-change code path.
- The notification `type` values and `target_screen`/`target_params` produced by the backend MUST
  match the mobile app's already-locked contract in
  `apps/mobile/src/features/notifications/lib/notification-factory.ts` (9-value `NotificationType`
  union, `STATUS_TO_ORDER_TYPE` mapping, `TYPE_TARGET` map, deterministic id convention) — the
  backend adapts to this existing contract, it does not redefine it.
  See also: `apps/mobile/src/features/notifications/hooks/use-notifications.ts` (the seam this
  work must swap from mock state to real data without changing the hook's external shape) and
  `apps/mobile/src/features/notifications/lib/notification-permission.ts` (confirms permission
  request is a separate concern from token registration).
  `filterMarketingByOptIn` (same file) is the existing pure marketing-gate function; the backend's
  opt-in gating logic must produce behavior consistent with what that function already assumes.
- Marketing sends must ALWAYS check the opt-in flag before sending — no code path may bypass this
  check, including scheduler-triggered sends.
- Every transactional (order-status) notification must NEVER be gated by the marketing opt-in flag
  — those 4 types always send regardless of the opt-in setting.
- Must follow this repo's additive-nullable-column migration convention (see `birthday`,
  `address`, `onboardedAt`, `assignedBranchId` precedent in `packages/api/src/db/schema/users.ts`)
  — no breaking schema changes to `users` or `orders`.
- Money/enum/type conventions already established in the codebase (cents-native pricing,
  `@jojopotato/types` as the shared type source) must be respected; do not introduce a parallel
  type definition for concepts already typed in `packages/types/src/notifications.ts` — reconcile
  drift instead.
- Must not require live provider credentials to be testable — CI must be able to exercise the full
  send pipeline logic with credentials unset (see AC-6).
- No RN/mobile component test runner exists in this repo (project-wide gap) — any acceptance
  criterion whose proof requires rendering a screen or observing on-device push receipt is
  Agent-Probe only, never claimed as automated coverage.

## Open Questions

All items below are flagged for resolution during INNOVATE — this SPEC deliberately does not
choose among them:

1. **Push-token storage shape** — a column on `users` vs. a dedicated `device_tokens` table.
   Research signal: no existing precedent in this repo for a multi-value column on `users`, and
   the multi-device + rotation requirement (AC-1) structurally favors a separate table. Owner:
   INNOVATE.
2. **Push provider choice** — `expo-server-sdk` vs. the raw Expo push HTTP API vs. a third-party
   provider. Repo's `process/context/all-context.md` §Open Questions already lists "Notifications
   provider: not decided." Owner: INNOVATE.
3. **`marketing_opt_in` field ownership** — a plain `users` boolean column (dedicated PATCH route)
   vs. a better-auth `additionalFields` entry (client-writable via `authClient.updateUser`, same
   pattern as `birthday`/`address`). Depends on how the already-built opt-in toggle screen expects
   to write this value. Owner: INNOVATE.
4. **Scheduler substrate** — in-process lightweight interval-based scheduler vs. adopting a real
   job-queue dependency. No existing precedent in this repo either way. Owner: INNOVATE.
5. **`target_params` column type** — jsonb vs. flat/varchar-per-param encoding on the
   `notifications` table. Owner: INNOVATE.
6. **Merge sequencing vs. `origin/dev/star`** — see Risks/Dependencies below; INNOVATE/PLAN should
   propose an ordering or conflict-avoidance approach, not this SPEC. Owner: INNOVATE/PLAN.
7. **Disposition of the current `completed`/`rejected` call sites** in the `notifyCustomer` stub —
   the mobile type contract has no `order_completed`/`order_rejected` notification types, so
   PLAN/EXECUTE must explicitly decide whether/how those call sites are removed or reworked (not
   silently left as dead code). Owner: INNOVATE/PLAN.

## Background / Research Findings

**Current stub state** (`packages/api/src/routes/staff.ts:45-55`): `notifyCustomer` is a
named no-op stub (`TODO(PUSH-002)`) called from `PATCH /api/staff/orders/:orderId` (step 8) on
`completed`/`rejected`/`cancelled` — the WRONG event set. The correct required set, per the
mobile UI's already-locked contract, is `accepted`/`preparing`/`ready`/`cancelled` (only
`cancelled` overlaps with today's stub call sites). A sibling stub `creditStarsForOrder`
(`TODO(STAR-001)`) sits at the exact same call site — not this issue's concern, but a shared-edit
collision risk (see Risks below).

**Mobile UI's locked type/target contract**
(`apps/mobile/src/features/notifications/lib/notification-factory.ts`) — the backend must produce
data matching this shape, not invent a new one:
- `STATUS_TO_ORDER_TYPE`: `accepted→order_accepted`, `preparing→order_preparing`,
  `ready→order_ready`, `cancelled→order_cancelled`.
- `TYPE_TARGET` is an exhaustive `Record<NotificationType, NotificationTargetScreen>` covering 9
  types total (4 order + 5 marketing: deal, coupon-expiring, stars-progress, reward-unlocked,
  promo).
- Deterministic id convention for idempotent dedupe: `order:${orderId}:${status}`,
  `deal:${dealId}`, `coupon:${coupon.id}`, `stars:${required}`, `reward:${eventId}`,
  `promo:${promoId}`.
- `filterMarketingByOptIn` is the existing pure marketing-gate function already covering the
  opt-in AC — transactional notifications are never gated, marketing always is.
- `useNotifications()` (`apps/mobile/src/features/notifications/hooks/use-notifications.ts`) is
  currently local `useState` seeded from mock data, explicitly commented in-repo as the seam this
  issue swaps to real data without touching screens. Shape: `{ notifications, unreadCount,
  markRead, marketingOptIn, setMarketingOptIn }`.
- `DEFAULT_MARKETING_OPT_IN = true` today in mobile code.
- `notification-permission.ts`'s `requestNotificationPermission` is explicitly scoped to
  permission-only (not token registration) — token registration is a net-new call site.

**Type mismatch, `packages/types/src/notifications.ts` (`AppNotification`) vs. DB `notifications`
table:**
- `type` (DB: untyped varchar) vs. `NotificationType` (9-value union, not DB-enforced).
- `target_screen` (DB: nullable) vs. `targetScreen` (type: required) — every real insert must set
  it.
- `targetParams?: Record<string,string>` (type) has no DB column at all — needs a new nullable
  column (jsonb or text) for route params like `{ orderId }`.
- `read_at`/`created_at` (DB timestamp) vs. `readAt?`/`createdAt` (type: ISO string) — a
  serialization boundary only, no schema change needed.

**`users` schema conventions** (`packages/api/src/db/schema/users.ts`) — additive-nullable-column
precedent: `birthday`, `address`, `onboardedAt`, `assignedBranchId` were all added as nullable
columns in later migrations, no `notNull()`. No existing precedent for a multi-value
(array/jsonb) column on `users` — this structurally argues toward a separate `device_tokens`
table for multi-device token support, surfaced as Open Question 1 rather than decided here.

**Migration numbering:** current last migration is `0006_legal_daredevil.sql`; next slot is
`0007`. This repo has had repeated migration-slot renumbering churn from parallel feature branches
landing near-simultaneously — a process risk, not a SPEC decision.

**Infra confirmed absent (genuinely greenfield):** no `expo-notifications` or `expo-server-sdk` in
any `package.json`; no cron/queue/scheduler library anywhere; no `packages/api/src/infra/`
directory exists (despite a stale pointer to it in `orchestration.md`); `apps/mobile/app.config.ts`
has no push-related Expo plugin/entitlement config; no push/notification-related env vars in any
`.env.example`.

**Suggested Known-Gap-friendly infra pattern (for live send without live credentials):** this repo
already has a working precedent — `RESEND_API_KEY` unset → magic-link emails are logged
server-side instead of sent (`packages/api/.env.example`). The same fallback shape (log-instead-
of-send when provider creds are unset) makes most of the send pipeline CI-testable without live
credentials (see AC-6).

### Risks / Dependencies (not scope decisions — informational)

- **Shared call-site collision risk:** `notifyCustomer` and `creditStarsForOrder`
  (`TODO(STAR-001)`) sit at the exact same call site inside `PATCH /api/staff/orders/:orderId`.
  Any concurrent STAR-00x work editing that same block should be sequenced or coordinated to avoid
  a merge conflict — this is a scheduling note, not a scope boundary.
- **`origin/dev/star` merge-conflict risk:** an unmerged teammate branch (Kent Vincent Butaya,
  STAR-002 rewards screen) is also expected to touch `packages/api/src/index.ts`'s router-mount
  block (adding a `/rewards` mount) around the same lines this work needs to add a `/notifications`
  mount. Near-certain merge conflict if both land close together — not blocking, a sequencing note
  for PLAN/EXECUTE.
