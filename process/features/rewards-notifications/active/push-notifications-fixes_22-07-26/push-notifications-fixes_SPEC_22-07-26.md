---
name: spec:push-notifications-fixes
description: "Product-discovery SPEC for 3 push-notification backlog items: staff order-alert push, fixing broken customer push delivery, and an onboarding-completion permission prompt"
date: 22-07-26
feature: rewards-notifications
---

# SPEC — Push Notification Fixes (staff alerts, broken customer push, onboarding prompt)

## Summary

Three related requests, all about push notifications actually reaching people. Today, staff never
get notified when a new order comes in — they have to keep checking the app. Customers report push
notifications "not working" — and the code confirms real gaps that would cause exactly that
experience (some by design, some by bug). And there's no prompt asking new customers to allow
notifications right after they finish setting up their profile — the only ask happens buried inside
checkout, on their first order.

This SPEC locks what "fixed" means for each of the three, so staff get alerted, customers reliably
get pushed for the events the product already promises, and the permission ask happens at a better,
earlier moment — without silently double-prompting because of a shared internal flag both features
would otherwise fight over.

## User Stories / Jobs To Be Done

**1. Staff order alert**
- As a staff member assigned to a branch, I want to receive a push notification when a new order is
  placed at my branch, so that I don't have to keep refreshing the Active Orders screen to notice it.

**2. Customer push notifications actually work**
- As a customer who has opted in / granted permission, I want to reliably receive a push
  notification for the order-status events the app already promises (accepted, preparing, ready,
  cancelled), so that I don't have to keep the app open to know what's happening with my order.
- As a customer, when I place an order (not just when staff later change its status), I want some
  confirmation that my order push notifications are working, so I trust the system is actually
  tracking my order.

**3. Onboarding notification prompt**
- As a new customer who just finished onboarding, I want to be asked whether I want to allow
  notifications, so that I can make that choice early instead of being surprised by an OS prompt
  buried inside checkout on my first order.

## What The User Wants (Behavioral Outcomes)

**Staff alerts:**
- When a customer places a new order at a branch, every staff member currently assigned to that
  branch who has a registered device receives a push notification (e.g. "New order — JP-XXXXXX-XXXX
  placed at [branch]"), tapping it opens the order in the staff app.
- Staff who are not assigned to that branch, or who never registered a device, receive nothing for
  that order.
- This works the same way customer order-status pushes already work: send-and-log, silently prune a
  permanently-dead token, never break order placement if the push fails.

**Customer push reliability:**
- For every order-status transition the app already sends a push for (accepted, preparing, ready,
  cancelled), a customer who has a registered, live device token actually receives the push on their
  device — not just an in-app notification-center row.
- The known, currently-broken/likely-broken paths are addressed as real fixes, not left as
  diagnosis-only: the persistent-across-app-restarts version of "don't ask twice" (today's flag
  resets on every reload, meaning a customer who declined once could get re-prompted after simply
  reopening the app — and conversely a customer who never got a token registered because they never
  completed a first checkout has no path to ever get one).
- The one condition genuinely outside code's control (whether the server's Expo push credential is
  actually configured and live) is called out explicitly as an operator check, not silently assumed
  fixed by this work (see Out Of Scope).

**Onboarding prompt:**
- Immediately after a new customer finishes the onboarding form (the same moment the app navigates
  them into the main tabs), they see the OS notification-permission prompt.
- If they grant it, their device is registered for push immediately — they don't have to wait until
  their first completed checkout to start receiving order-status pushes.
- If they decline, they are not asked again automatically at checkout in the same session (today's
  shared once-per-session behavior already prevents that; this SPEC keeps that guarantee).
- Existing customers who already completed onboarding before this ships are unaffected — they keep
  being asked at checkout, same as today (their next order-placement call is the fallback path).

## Flow / State Diagram

```
Staff order alert:
  Customer places order (POST /orders)
        |
        v
  Order row created  ---->  Resolve branch's assigned staff (users.assigned_branch_id = order.branchId)
                                     |
                                     v
                          For each assigned staff w/ device token(s):
                             write in-app notification row (staff-scoped)
                             send push "New order at [branch]"
                             prune any permanently-dead token
        |
        v
  Order placement response returns to customer (unaffected by staff-push outcome)


Onboarding prompt (new customer):
  Onboarding form submit
        |
        v
  completeProfile() succeeds --> nav gate flips to (tabs)
        |
        v
  requestNotificationPermission()  (existing seam, reused)
        |
        +-- granted --> registerDeviceToken()  (customer now has a live token pre-checkout)
        |
        +-- declined/undetermined --> no-op, remembered for this session
        |
        v
  Customer lands on Home tab


Checkout prompt (existing seam, now a fallback):
  First successful checkout
        |
        v
  requestNotificationPermission()
        |
        +-- already asked this session (e.g. via onboarding) --> silent no-op (unchanged today's behavior)
        +-- not yet asked (e.g. existing customer who onboarded before this shipped) --> prompts as today
```

## Acceptance Criteria (Testable Outcomes)

**AC1 — Staff push on new order placement**
When an order is placed at branch B, every staff user with `assigned_branch_id = B` and at least
one registered device token receives a push notification referencing that order and branch.
- proven by: `packages/api` integration test — seed 2 staff at branch B (one with a token, one
  without), 1 staff at branch C, place an order at B, assert exactly the token-having branch-B staff
  member's token received a send attempt (mocked push provider) and the branch-C staff member's did
  not.
- strategy: Fully-Automated

**AC2 — Staff push failure never blocks order placement**
If staff-push dispatch throws or the push provider errors, `POST /orders` still returns success for
the customer (matches the existing swallow-and-log convention used by `dispatchOrderNotification`).
- proven by: `packages/api` integration test — force the staff-dispatch path to throw, assert order
  placement still returns 201/200 with the order created.
- strategy: Fully-Automated

**AC3 — Staff push targets the order detail screen**
The staff push notification's target/deep-link data points at the newly placed order so tapping it
(future UI wiring, if any exists) can route to it — proven by asserting the notification row/payload
shape, not by driving a real tap (no RN E2E runner exists).
- proven by: `packages/api` integration test — assert the written notification row's target params
  include the order id.
- strategy: Fully-Automated

**AC4 — Staff-dead-token pruning reuses the existing pattern**
A staff device token that comes back as a permanent `DeviceNotRegistered` error is pruned from
`device_tokens`, exactly like the existing customer-push pruning behavior.
- proven by: `packages/api` integration test — reuses the existing `sendAndPrune` pattern
  (parameterized over a staff token, not a new pruning implementation).
- strategy: Fully-Automated

**AC5 — Onboarding-completion permission prompt fires exactly once per completion**
After `completeProfile()` succeeds, `requestNotificationPermission()` is called exactly once as part
of the onboarding completion flow (not on every render, not retried on nav).
- proven by: `apps/mobile` vitest unit test on the onboarding completion handler (mocking the
  permission seam), asserting single invocation.
- strategy: Fully-Automated

**AC6 — Onboarding grant registers a device token immediately**
When the onboarding-completion prompt is granted, `registerDeviceToken()` is called (same as the
existing checkout call path), so the customer has a live token before ever placing an order.
- proven by: `apps/mobile` vitest unit test — mock permission seam returns 'granted', assert
  `registerDeviceToken` is called.
- strategy: Fully-Automated

**AC7 — Fire-once flag prevents a double-ask in the same session**
If the onboarding prompt already consumed the shared session fire-once flag, the later checkout-time
call is a silent no-op (matches today's existing `shouldPromptPermission` behavior — no new flag
needed, this is a regression-lock on existing behavior now that a second call site exists).
- proven by: `apps/mobile` vitest unit test — call the onboarding path then the checkout path in the
  same test session, assert only one underlying OS-permission-request attempt occurs.
- strategy: Fully-Automated

**AC8 — Onboarding decline does not block navigation**
Declining (or the OS prompt being dismissed/undetermined) at onboarding never blocks or delays the
nav-gate flip into `(tabs)` — matches the existing "never throws, never blocks the caller flow"
contract of `requestNotificationPermission`.
- proven by: `apps/mobile` vitest unit test — mock permission seam returns 'denied', assert
  `completeProfile`'s resolved navigation path is unaffected (same tick/no thrown error).
- strategy: Fully-Automated

**AC9 — On-device permission prompt actually appears and push actually arrives**
On a real device (iOS and Android separately), the onboarding-completion prompt visibly appears as
the real OS dialog, granting it results in a real push notification being receivable for a
subsequent staff-triggered order-status change, and a real order placed at a branch results in a
real push landing on an assigned staff member's device.
- proven by: Agent-Probe walkthrough (3 scenarios: onboarding OS-dialog appearance + grant path,
  customer order-status push end-to-end, staff new-order push end-to-end) — requires a live,
  confirmed `EXPO_ACCESS_TOKEN` and physical devices; cannot be automated (no RN E2E/navigation
  runner exists project-wide, and OS permission dialogs cannot be driven from jsdom/vitest).
- strategy: Agent-Probe

**AC10 — Operator confirms the live push credential is configured**
Before claiming customer/staff push "works" in production, an operator confirms `EXPO_ACCESS_TOKEN`
is set for the deployed API environment (the #1 ranked root cause for "customer push not working" —
its absence makes every send silently take the log-fallback branch and report false success).
- proven by: Agent-Probe / operator checklist item — not code-provable (this SPEC's code changes
  cannot themselves prove a runtime secret is set; see Out Of Scope).
- strategy: Agent-Probe

## Out Of Scope

- Verifying the `EXPO_ACCESS_TOKEN` env var is actually set and pointed at a live Expo project in
  any deployed environment — that is an operator/infra action, not something this SPEC's code
  changes can prove automatically. AC10 documents this as a required manual check, not a fixed bug.
- Persisting the "already asked" permission flag across app restarts/reloads (today it is
  session-scoped in-memory and resets on every reload — a known, pre-existing gap, not introduced or
  claimed fixed by this work). If the user wants this fixed too, it needs its own follow-up (likely
  `expo-secure-store`, mirroring the auth-session persistence pattern).
- Sending a push notification on order PLACEMENT itself to the customer (e.g. "order received") —
  today's `OrderNotificationEvent` deliberately has no `placed`/`completed` member; adding one is a
  product-scope decision not requested by any of the 3 backlog items and is left alone.
- A staff-side in-app notification CENTER UI (list/badge/tap-to-navigate screen) — this SPEC covers
  the push send + underlying data only. If a staff notification-center screen is wanted, it is a
  separate follow-up (mirrors the customer-side `push-notifications-ui` plan, which this does not
  extend).
- Building a real SMS/receipt-based delivery confirmation or receipt-stage `DeviceNotRegistered`
  polling (`getPushNotificationReceiptsAsync`) — already a tracked, deliberately deferred gap from
  the `real-push-delivery` plan; unchanged here.
- Any change to WHICH order-status transitions fire a customer push (still exactly `accepted /
  preparing / ready / cancelled`, per `OrderNotificationEvent`) — not touched by this SPEC.
- Marketing/retention push triggers (`PUSH-005`) — separate, already in-flight work
  (`push-marketing-triggers_20-07-26`), untouched here.

## Constraints

- Reuse the existing `sendAndPrune` / `dispatchOrderNotification`-style pattern for staff pushes —
  do not invent a second, parallel pruning or send implementation.
- Staff push dispatch must never throw in a way that blocks `POST /orders`'s success response to the
  customer (matches the existing transactional-notification swallow-and-log contract).
- The onboarding prompt must reuse the EXISTING `requestNotificationPermission()` /
  `registerDeviceToken()` seam from `apps/mobile/src/features/notifications/lib/notification-permission.ts`
  — no new permission-request code path, no second OS-dialog implementation.
- The shared session-scoped fire-once flag stays shared across both call sites (onboarding and
  checkout) — this SPEC does not introduce a second, independent flag per call site, since that
  would reintroduce the double-ask problem the flag exists to prevent.
- `device_tokens` schema is unchanged — it already supports staff tokens (no role column gate
  exists), so no migration is required to reach staff devices.
- No new notification type enum member is required for staff alerts unless PLAN determines the
  existing `notifications` table's `type` column needs a distinct staff-facing value for querying —
  that is a mechanical schema/typing decision for PLAN, not a product decision for this SPEC.

## Open Questions

None. The one genuine product tradeoff identified in RESEARCH — where the permission prompt should
live given the shared fire-once flag — is locked above: the prompt's PRIMARY, earliest trigger moves
to onboarding completion; the existing checkout-time call remains as a fallback for customers who
never went through the new onboarding prompt (pre-existing accounts), using the same shared flag so
the two call sites can never double-ask within one session. This is a mechanical reuse of the
existing seam and existing flag, not a design choice requiring INNOVATE-level debate.

## Background / Research Findings

- All three backlog items trace to one structural fact: push registration + permission-request are
  wired into exactly ONE call site today — `checkout.tsx:141-143` (customer's first order
  placement). Staff never reach this code path at all (`(staff)/**` has zero registration/permission
  calls).
- `device_tokens` (`packages/api/src/db/schema/device_tokens.ts`) links `user_id → users.id` with no
  role column — schema already supports staff tokens.
- Staff alert gap has two parts: (a) staff never register a token (no call site), and (b) no
  staff/branch-targeted dispatch exists server-side — every existing dispatch targets a single
  customer `user_id`. `POST /orders` fires no dispatch at all today. The notification type enum
  (4 order types + 5 marketing types) is entirely single-customer-targeted; no staff-facing type
  exists yet.
- Customer push "not working" root causes, ranked by likelihood (this SPEC's ACs target all of
  them, not just the top one):
  1. `EXPO_ACCESS_TOKEN` unset in the deployed API env → `push-provider.ts` silently takes the
     log-fallback branch and reports every send as 'ok' without ever calling Expo — this is an
     operator/infra check (AC10), not something code can self-verify.
  2. A customer may never have registered a token at all — registration only fires on first
     successful checkout, gated behind a SESSION-scoped in-memory fire-once flag that resets on
     every app reload (real, documented behavior — not fixed by this SPEC, called out in Out Of
     Scope). This SPEC's onboarding-completion prompt gives customers a second, earlier chance to
     register before ever reaching checkout (AC6).
  3. New-order placement itself sends nothing to the customer by original design (not a bug) —
     customers only get pushes on staff-driven status transitions. Unchanged, confirmed out of
     scope.
  4. Lower likelihood: EAS `projectId` mismatch between build and the `EXPO_ACCESS_TOKEN`-owning
     account. Not independently addressed by this SPEC (falls under the AC10 operator check).
  5. Dev-mode simulated permission grant (`__DEV__` → simulated 'granted', real
     `getExpoPushTokenAsync` may then fail silently, swallowed by `registerDeviceToken`'s
     catch-and-warn). Unchanged; this SPEC does not add error surfacing for that catch block since
     none of the 3 backlog items asked for improved dev-mode diagnostics.
  The `real-push-delivery` plan (completed 15-07-26) already hardened the SEND path (ticket-based
  pruning, priority/background payload shaping) but never automated-verified real on-device delivery
  — a standing Known Gap this SPEC's AC9 explicitly re-surfaces rather than silently re-claims fixed.
- Onboarding completion is a single screen, 3 internal steps, completion = `onSubmit` →
  `completeProfile(...)` in `apps/mobile/src/app/(onboarding)/index.tsx` (stamps `onboardedAt`, flips
  the nav gate to `(tabs)`). Zero notification code exists there today — clean insertion point,
  reusing the exact same two functions checkout already calls.
- User's brainstorm input (verbatim intent, as given): "Add push notification on staff", "Push
  notifications on user not working" (needs a real fix, not just diagnosis), "Add notif prompt when
  done onboarding".
