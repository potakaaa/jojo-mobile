---
name: spec:push-notifications-ui
description: "Product-discovery SPEC for a UI-only push notifications pass (#36/#37/#38) — notification center, opt-in settings, and mock/local data, deferring all real push delivery/backend to #75"
date: 14-07-26
feature: rewards-notifications
---

# Push Notifications — UI-Only Pass (PUSH-001 / PUSH-002 / PUSH-003)

## Summary

Right now the Notifications screen under Account is an empty "Coming Soon" placeholder, and
there is no way for a user to see what happened to an order, hear about a new deal, or control
whether Jojo Potato can send them marketing pushes. This pass builds the **screens and on-device
behavior** for notifications — a real Notifications list, a way to turn marketing notifications
on/off, and tap-to-navigate — all backed by realistic mock/local data instead of a live server.
It does **not** wire up actual push delivery (device tokens, a notification provider, or real
server-side sends) — that is a separate, already-tracked piece of work (#75, PUSH-004). Building
it this way means when #75 lands, the screens themselves don't need to be rebuilt — only the data
source underneath them swaps from mock to real.

## User Stories / Jobs To Be Done

1. **As a customer**, I want to see a list of my notifications (order updates, deals, rewards),
   so that I don't have to keep re-checking the app to know what's going on with my order or account.
2. **As a customer**, I want tapping a notification to take me straight to the relevant screen
   (my order tracking, a deal, my coupons, or my rewards progress), so that I don't have to
   hunt for it myself.
3. **As a customer**, I want to control whether I receive marketing notifications (deals, promos,
   reward nudges) separately from order updates, so that I can stay informed about my orders
   without being spammed with promotions I don't want.
4. **As a customer**, I want to be asked for notification permission at a sensible moment — not
   the instant I open the app for the first time — so the request feels relevant instead of
   annoying.
5. **As a customer who just placed an order**, I want to know when my order is accepted,
   being prepared, ready, or cancelled, so I know when to head to the branch (or that I don't
   need to).
6. **As a customer who opted out of marketing**, I want to be certain I still hear about my own
   order status, so opting out of promotions never means missing something I actually need.

## What The User Wants (Behavioral Outcomes)

- **Notifications screen** (replaces the current empty placeholder under Account → Notifications):
  shows a list of notification items, newest first, each with a title, body text, a relative
  timestamp, an unread indicator, and an icon/type cue. Tapping an item marks it read and
  navigates to its target screen (order tracking, deal details, coupon wallet, or rewards). An
  empty state is shown when there are no notifications yet.
- **Notification settings**: a marketing-notifications toggle the user can turn on/off. Order
  ("transactional") notifications are never toggle-off-able from this screen — they are described
  as always-on, reflecting that a user can be opted out of marketing while still getting order
  updates. The current best call is to put this toggle inline at the top of the Notifications
  screen (see Open Questions #2 for the reasoning) rather than a separate settings screen.
- **Permission request**: the OS notification-permission prompt is triggered by a concrete,
  scoped moment — right after a customer places their first order (see Open Questions #5) —
  not on first app launch. Declining permission does not block or break any other part of the
  app; the user can still see everything in the in-app Notifications list either way.
  This pass builds the on-device request flow and its outcome handling; it does not register a
  push token anywhere (that's #75).
- **Order-status notifications** (transactional): whenever a mock/local order transitions through
  accepted → preparing → ready, or is cancelled, a corresponding notification item appears in the
  list, always delivered regardless of the marketing opt-in state, and tapping it opens that
  order's tracking screen.
- **Marketing notifications** (5 types — new deal, coupon expiring soon, one-more-order-to-unlock,
  reward unlocked, branch promo): these only ever appear in the list when the marketing toggle is
  on. Turning the toggle off means none of the 5 types appear (existing marketing items already in
  the list may remain visible as history — see Acceptance Criteria for the precise rule); turning
  it back on resumes them.

## Flow / State Diagram

```
Account tab
   │
   ▼
Account → "Notifications" link (already exists today)
   │
   ▼
┌───────────────────────────────────────────┐
│ Notifications screen                       │
│  [Marketing notifications: ON/OFF toggle]  │
│  ─────────────────────────────────────────│
│  ● Order Ready — tap → Order Tracking      │
│  ○ New Deal — tap → Deal Details           │
│  ○ Coupon Expiring — tap → Coupon Wallet   │
│  ● Reward Unlocked — tap → Rewards         │
│  (● = unread, ○ = read)                    │
│  [Empty state if list is empty]            │
└───────────────────────────────────────────┘

Order-status mock flow (unaffected by marketing toggle):
  order.status changes (accepted/preparing/ready/cancelled)
        │
        ▼
  notification item appended to local list  ──always──▶ visible regardless of opt-in
        │
        ▼
  tap → Order Tracking screen for that order

Marketing mock flow (gated by opt-in):
  marketing trigger condition met
  (new deal seeded / coupon nears expiresAt / stars == required-1 / reward unlocked / promo seeded)
        │
        ▼
  marketing opt-in == ON? ──NO──▶ notification is NOT added to the list
        │ YES
        ▼
  notification item appended to local list
        │
        ▼
  tap → Deals / Coupon Wallet / Rewards (per type)

Permission-prompt flow:
  Customer places their first order (checkout success)
        │
        ▼
  OS permission prompt shown (once; not re-shown if already answered)
        │
   ┌────┴────┐
 Allow      Deny
   │          │
   ▼          ▼
(local flag saved)   (local flag saved; no crash, no blocked flows)
```

## Acceptance Criteria (Testable Outcomes)

1. **Notifications screen renders a list of mock notification items**, newest first, each showing
   title, body, relative time, and unread/read state.
   proven by: `apps/mobile` vitest — pure sort/shape unit test on the mock data + hook.
   strategy: Fully-Automated

2. **Tapping a notification item marks it read and navigates to its `target_screen`** (order
   tracking for order-status types, Deal Details for new-deal/branch-promo, Coupon Wallet for
   coupon-expiring, Rewards for reward-unlocked/one-more-order).
   proven by: Agent-Probe manual walkthrough (no RN runner exists — project-wide gap, see
   `tests/all-tests.md`); routing-map unit test in vitest for the type→target_screen lookup itself.
   strategy: Hybrid

3. **Marketing-notifications toggle exists, defaults to a documented state, and its value persists
   locally** (survives navigating away and back within the session).
   proven by: `apps/mobile` vitest — toggle state hook unit test (on/off/persist-in-memory).
   strategy: Fully-Automated

4. **When the marketing toggle is OFF, none of the 5 marketing notification types are newly added
   to the list; when ON, they are.** Order-status (transactional) notifications are added
   regardless of the toggle's state in either case.
   proven by: `apps/mobile` vitest — mock notification-generation logic unit test asserting
   marketing items are filtered by opt-in flag and transactional items are not.
   strategy: Fully-Automated

5. **A mock order transitioning through accepted → preparing → ready → (or cancelled) produces
   exactly one notification item per transition**, matching STAFF-003's 4 non-terminal-entry
   transitions (`accepted`, `preparing`, `ready`, `cancelled`), with no duplicates for the same
   transition.
   proven by: `apps/mobile` vitest — transition-to-notification mapping unit test.
   strategy: Fully-Automated

6. **The "one more order to unlock reward" mock notification fires only when mock stars are
   exactly one short of the required threshold** (not before, not after crossing it).
   proven by: `apps/mobile` vitest — threshold boundary unit test (N-2, N-1, N, N+1 stars).
   strategy: Fully-Automated

7. **The "coupon expiring soon" mock notification fires only within a defined lead window before
   the mock coupon's `expiresAt`**, not before the window opens and not after expiry.
   proven by: `apps/mobile` vitest — lead-window boundary unit test.
   strategy: Fully-Automated

8. **The "reward unlocked" mock notification fires once per unlock event**, not repeatedly on
   every re-render or re-check.
   proven by: `apps/mobile` vitest — idempotency unit test (same unlock event checked twice
   produces one notification).
   strategy: Fully-Automated

9. **Declining the OS notification permission prompt does not crash the app or block any other
   flow** (checkout, order tracking, browsing all continue to work normally).
   proven by: Agent-Probe manual walkthrough (permission-prompt interaction requires a real
   device/simulator permission dialog; no RN runner exists for this).
   strategy: Agent-Probe

10. **The permission prompt is triggered after the customer's first order is placed, not on first
    app launch**, and is not re-shown once the user has answered it once.
    proven by: Agent-Probe manual walkthrough (OS-level permission timing cannot be verified from
    a pure-TS unit test).
    strategy: Agent-Probe

11. **A brand-new user with zero notifications sees an empty state**, not a blank screen or error.
    proven by: `packages/ui` jest-expo — component render test for the empty-state case;
    `apps/mobile` vitest for the zero-items hook branch.
    strategy: Fully-Automated

12. **Every mock notification item carries an explicit `type` and `targetScreen`** matching one of
    the 8 documented notification kinds (4 transactional + 5 marketing minus overlaps, see
    Background) — no notification is generated with an unmapped or missing target.
    proven by: `apps/mobile` vitest — exhaustiveness unit test over the notification-type union.
    strategy: Fully-Automated

## Out Of Scope

- **All real push delivery** — Expo push token registration/storage, an actual notification
  provider/service, and real device push sends. This is #75 (PUSH-004) entirely.
- **Server-side `notifications` table writes** — this pass produces notification items in local
  mobile state/mock data only; no API call persists them to the real Postgres `notifications`
  table. #75 wires the real write path.
- **Real marketing opt-in enforcement at the backend** — the toggle here is a local UI/state
  control; #75 owns making the actual send pipeline respect it server-side.
- **Push-token rotation/de-duplication logic** — deferred entirely to #75, as PUSH-001 itself notes.
- **A background job/scheduler that generates real "coupon expiring" or "one more order" events**
  — this pass only defines the trigger *conditions* and renders them against mock data; a live
  scheduler is a backend concern (#75 or later).
- **Any change to the real STAFF-003 order-status state machine** — this pass only listens to
  (mock) transitions to generate notification items; it does not modify
  `packages/api/src/routes/lib/order-state-machine.ts` or the real PATCH endpoint.
- **Coupon Wallet screen itself** (if it doesn't already exist as a real screen) — building it is
  out of scope here; the notification's target link may point at a not-yet-built screen and that
  gap is accepted rather than solved in this pass.
- **A dedicated "notification center" bell icon / badge count in the tab bar or header** — not
  requested by any of #36/#37/#38 or the PRD; only the existing Account-nested Notifications
  screen is in scope.
- **Automated RN component/E2E test runner** — not introduced by this pass; remains a tracked
  project-wide gap (see `tests/all-tests.md`).

## Constraints

- Must build on the existing `apps/mobile/src/app/(tabs)/account/notifications.tsx` route (already
  linked from Account) rather than introducing a new nav entry point — PRD §7 places Notifications
  under Account and gives no other convention.
  proven by: n/a (structural constraint, verified in code review)
- Must follow the established mock-data pattern from `apps/mobile/src/features/deals/mock-deals.ts`
  — typed against real `@jojopotato/types` contracts, an explicit "PLACEHOLDER / MOCK DATA" header
  comment, and a hook-shaped seam (e.g. `useNotifications()`) so #75 can later swap the data
  source without changing screen code.
- Must always use shared `@jojopotato/ui` components; a new toggle/switch primitive and a
  notification-row/list component should be added to `packages/ui` (no precedent exists yet)
  rather than built as one-off screen markup, per the standing "always use the shared component
  library" rule.
- Transactional notifications must never be gated by the marketing opt-in flag (PUSH-002 is
  explicit: "transactional notifications bypass marketing opt-in").
- The notification type model must be able to express all 8 distinct kinds referenced across
  #36/#37/#38: 4 transactional (order accepted/preparing/ready/cancelled) + 5 marketing (new deal,
  coupon expiring, one-more-order, reward unlocked, branch promo).
- `packages/types/src/notifications.ts` is currently stale versus the real DB `notifications`
  table shape (missing `target_screen`, `user_id`; `type` is a closed 3-value union instead of the
  real unconstrained varchar). This pass corrects the shared type (adds `targetScreen`, widens
  `type` to the 8 real kinds) since `target_screen` is exactly what powers tap-to-navigate and the
  screens can't be built correctly without it — see Open Questions #3 for reasoning.
- No backend/API changes of any kind — this is a mobile-only (`apps/mobile` + `packages/types` +
  `packages/ui`) pass.

## Open Questions

All 5 questions below were surfaced by RESEARCH as user-decidable framing choices. Per
instruction, each has been resolved with a stated best-reasonable-call rather than blocking —
recorded here for visibility so the user can correct any of them before EXECUTE.

1. **Screen placement** — RESOLVED: use the existing Account → Notifications stub
   (`apps/mobile/src/app/(tabs)/account/notifications.tsx`), already linked from `account/index.tsx`.
   This matches PRD §7 and requires no new navigation surface. Owner: SPEC (resolved, low risk —
   this is literally already wired).

2. **Where the opt-in toggle lives** — RESOLVED: inline at the top of the Notifications screen
   itself, not a separate settings screen. Reasoning: there is exactly one user-facing toggle in
   scope (marketing on/off — transactional is non-optional), which doesn't justify a whole new
   settings screen; keeping it inline also means the user sees the toggle's effect (list content
   changing) right next to the control. Owner: SPEC (resolved) — if the user wants a dedicated
   Notification Settings screen instead, that's a small follow-up, not a redesign.

3. **`packages/types/src/notifications.ts` correction** — RESOLVED: in scope for this pass.
   Reasoning: `targetScreen` is load-bearing for tap-to-navigate (AC #2/#12), and it's a
   mobile-only package edit (not a backend change), consistent with the "UI-only" boundary. The
   type is widened, not the DB — #75 still owns making the real table match.

4. **Are both flags rendered as toggles, or is transactional locked-on?** — RESOLVED: transactional
   is described in the UI as always-on / non-toggleable (no switch rendered for it at all), only
   the marketing flag gets a switch. Reasoning: PUSH-001's own wording ("a user CAN be opted into
   transactional while opted out of marketing") frames transactional as the default/guaranteed
   channel, not a user-facing choice — rendering a toggle for something that can never be turned
   off would be misleading UI.

5. **Permission-prompt trigger timing** — RESOLVED: trigger the OS permission prompt once, right
   after the customer's first successful checkout (order placement), not on first app launch and
   not tied to a specific onboarding step. Reasoning: PUSH-001 explicitly says "align with
   onboarding/first-order context," and first-order is the more concrete, unambiguous moment
   PUSH-002's own transactional notifications become immediately relevant (the user has something
   to be notified about). Owner: SPEC (resolved) — if the user prefers tying it to onboarding
   completion instead, that's a narrow follow-up change.

## Background / Research Findings

- **Backend split:** #75 (PUSH-004) owns ALL real backend/API integration — push-token storage,
  provider wiring, real delivery, marketing-opt-in server enforcement, and any background-job
  scheduler. This SPEC's scope is strictly screens + mock/local state, built so #75 can swap in
  real data later without rework — the same pattern `deals-screens_13-07-26` used ahead of
  `deals-api-integration_13-07-26`.
- **Source issues** (full ACs already captured in the delegation prompt): #36 PUSH-001 (opt-in
  infra + permission timing + deep-link), #37 PUSH-002 (4 transactional types, bypass opt-in,
  1:1 with status change), #38 PUSH-003 (5 marketing types, opt-in gated, specific trigger
  conditions per type).
- **Existing state verified this session:**
  - `apps/mobile/src/app/(tabs)/account/notifications.tsx` exists as a bare `<ComingSoon>` stub,
    already linked from `account/index.tsx`'s `AccountLink` list.
  - `packages/types/src/notifications.ts` is stale (3-value closed `type` union, no
    `targetScreen`/`userId`) versus the real DB `notifications` table.
  - No toggle/switch component exists anywhere in `apps/mobile` or `@jojopotato/ui`.
  - No notification-row/list or unread-indicator component exists in `@jojopotato/ui`; `Badge`
    and `EmptyState` already exist and are reusable building blocks.
  - No dedicated settings screen exists; Account is currently a flat list of `AccountLink` rows.
  - Precedent: `apps/mobile/src/features/deals/mock-deals.ts` + `deals-screens_13-07-26` plan —
    typed mock data with an explicit placeholder header, hook-shaped seam pattern to follow.
  - STAFF-003 delivered the real 8-value `OrderStatus` enum (`pending, accepted, preparing,
    flavoring, ready, completed, cancelled, rejected`) and its state machine
    (`packages/api/src/routes/lib/order-state-machine.ts`). PUSH-002's 4 notification-worthy
    transitions (accepted, preparing, ready, cancelled) are a subset of that real transition set —
    this pass's mock order-transition flow should mirror that subset, not invent a new one.
  - PRD §6.12 and §14 confirm the exact wording used for each of the 8 notification kinds and the
    "transactional after first order, marketing needs opt-in, tap deep-links" rules — used
    verbatim to ground the acceptance criteria above.
- **Test tier (from RESEARCH):** pure-TS logic (unread filtering, opt-in flag state, mock data
  shaping, permission-stub return handling, threshold/window boundary logic) is automatable via
  `apps/mobile` vitest (node env). New `@jojopotato/ui` presentational components (toggle,
  notification row) are automatable via `packages/ui` jest-expo. Screen render, live navigation on
  tap, and OS permission-dialog interaction are Agent-Probe only — this is the same project-wide
  RN-runner gap already tracked in `process/context/tests/all-tests.md` and is not solved by this
  pass.
