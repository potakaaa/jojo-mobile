---
name: spec:staff-live-freshness
description: "Product-discovery SPEC — staff-app live data freshness: reflect customer self-pickup, pull-to-refresh on all staff screens, new-order toast on Active Orders/dashboard"
date: 22-07-26
feature: staff-dashboard
---

# SPEC — Staff App Live Data Freshness

## Summary

Staff members currently have to guess whether what they're looking at is up to date. If a
customer marks their own order picked up, staff viewing that order's detail screen or the
Completed Orders list won't see the change until they leave and come back. None of the staff
screens support the standard "pull down to refresh" gesture, so staff have to force-close and
reopen the app to check for updates. And when a new order lands at the branch, nothing calls it
out — staff have to be staring at the Active Orders list at the right moment to notice. This work
closes those three gaps: staff-facing screens reflect a customer's own pickup confirmation
promptly, every staff screen supports pull-to-refresh, and a new order triggers an on-screen
notification so staff don't miss it.

## User Stories / Jobs To Be Done

1. **As a staff member viewing an order's detail screen**, I want the status to update if the
   customer marks their own order as picked up while I'm looking at it, so that I'm never staring
   at a stale "Ready" status for an order that's actually done.
2. **As a staff member browsing Completed Orders**, I want an order the customer self-completed to
   show up there without me having to leave and re-enter the screen, so that my history view is
   trustworthy.
3. **As a staff member on any staff screen**, I want to pull down to refresh, so that I can force
   a check for new data on demand instead of waiting for a poll or restarting the app.
4. **As a staff member working the counter**, I want an on-screen alert when a new order comes in,
   so that I notice it immediately even if I'm not actively looking at the Active Orders list.

## What The User Wants (Behavioral Outcomes)

- **Self-pickup reflection:** While a staff member is viewing an order's detail screen, if the
  customer marks that same order as picked up (self-service), the screen's status updates to
  "Completed" within the same short window the Active Orders list already refreshes on (no manual
  action from staff required). The Completed Orders list picks up that same order without staff
  needing to leave and re-enter the screen.
- **Pull-to-refresh:** Every staff screen that shows fetched data (Active Orders, Completed
  Orders, Product Availability, Branch Pickup Settings, the dashboard home stat block, Order
  Detail, Pickup Code lookup) responds to the standard pull-down gesture with a refresh indicator,
  then shows current data. Pulling to refresh never discards an in-progress unsaved edit (e.g. a
  prep-time value the staff member is mid-typing on Branch Pickup Settings) — it behaves the same
  safe way the existing background-refetch already does on that screen.
- **New-order toast:** When a new order arrives at the staff member's branch while they have the
  Active Orders screen or the staff dashboard home open, an on-screen toast notification appears
  calling out that a new order has come in. The toast is dismissed by the staff member tapping it
  (it does not silently disappear on its own — a missed new-order notice is an operational
  problem, not a cosmetic one). The toast never fires twice for the same order.

## Flow / State Diagram

**Self-pickup reflection (Order Detail + Completed Orders):**

```
[Staff viewing Order Detail, status = "Ready"]
                |
   customer taps "I've picked this up" (their own device)
                |
   PATCH /orders/:orderId/complete  (existing, unchanged)
                |
   staff screen's own refresh cycle ticks (poll, matching Active Orders cadence)
                |
                v
[Staff Order Detail now shows "Completed"] --staff navigates away--> [Completed Orders list
                                                                        already includes this order]
```

**Pull-to-refresh (any staff screen):**

```
[Staff screen at rest, showing last-fetched data]
                |
        staff pulls down
                v
[Refresh indicator shown] --fetch fails--> [Error indication shown, PREVIOUS data still visible]
                |
         fetch succeeds
                v
[Screen shows updated data, indicator hidden, any in-progress unsaved edit left untouched]
```

**New-order toast:**

```
[Active Orders / dashboard home mounted, poll cycle N returns order set S(N)]
                |
   poll cycle N+1 returns order set S(N+1)
                |
   diff: does S(N+1) contain an order id not in S(N)? (first poll after mount is baseline, no diff)
        no  -----------------------------------------------> [no toast]
        yes
         v
[Toast appears: "New order — <order number>"] --staff taps toast--> [toast dismissed]
                |
        same order id seen again on a later poll
                v
        [no repeat toast for that id]
```

## Acceptance Criteria (Testable Outcomes)

1. **A customer self-completing an order updates that order's staff Order Detail screen within
   the same polling window Active Orders already uses (≤10s), while the screen stays open.**
   proven by: new vitest unit test on the Order Detail data hook confirming it now polls on the
   same interval/background-pause convention as `useStaffOrders`. strategy: Fully-Automated.
   (Visual on-screen confirmation that the status text actually changes while staring at a live
   device is Agent-Probe — see AC-8.)

2. **A customer self-completing an order appears in the staff Completed Orders list without the
   staff member leaving and re-entering that screen.**
   proven by: new vitest unit test on the Completed Orders data hook confirming it now polls
   while mounted. strategy: Fully-Automated. (On-device visual confirmation is Agent-Probe — see
   AC-8.)

3. **Every staff data-driven screen (Active Orders, Completed Orders, Product Availability,
   Branch Pickup Settings, dashboard home, Order Detail, Pickup Code lookup) exposes a working
   pull-to-refresh gesture that shows a refresh indicator and re-fetches on release.**
   proven by: per-screen render test asserting the screen wires `RefreshControl`
   (`refreshing`/`onRefresh` bound to the underlying query's `isRefetching`/`refetch`), following
   the same idiom already covered by the `list-pagination-refresh` plan's tests. strategy:
   Fully-Automated (RefreshControl wiring is host-agnostic and testable via jest-expo render
   assertions, unlike a real touch gesture — see AC-8 for the physical-gesture residual).

4. **Pulling to refresh on Branch Pickup Settings while a staff member has an unsaved prep-time
   edit in progress does not overwrite that in-progress edit.**
   proven by: new vitest unit test on the existing `prepTimeReducer` confirming a
   `SETTINGS_ARRIVED` action dispatched mid-edit (i.e. after a `USER_EDIT`, before `SAVE_SUCCESS`)
   does not clobber the pending value — reusing the reducer's existing `hasSeeded`/pending-edit
   guard rather than adding a new one. strategy: Fully-Automated.

5. **A failed pull-to-refresh leaves the previously-loaded data on screen (nothing blanks out)
   and surfaces an error indication.**
   proven by: per-screen render test simulating a rejected refetch and asserting prior data rows
   remain rendered. strategy: Fully-Automated.

6. **When a new order (an order id not present in the previous poll's result) arrives while
   Active Orders or the dashboard home is mounted, a toast notification appears naming the new
   order.**
   proven by: new vitest unit test on a pure new-order-diff function (`detectNewOrders(prev,
   next)` or equivalent) confirming it returns exactly the ids present in `next` but not `prev`,
   and returns none on the first poll (no prior baseline) or when the set is unchanged/only
   status-changed. strategy: Fully-Automated.

7. **The new-order toast does not fire again for an order id already seen in a prior poll (no
   repeat toast on a status change of an existing order).**
   proven by: same `detectNewOrders`-style unit test as AC-6, asserting a status change alone
   (same id, different status) does not appear in the diff. strategy: Fully-Automated.

8. **On a physical device: the Order Detail status visibly updates after an external self-pickup
   completion, the pull-to-refresh gesture is smooth and shows/hides the platform refresh spinner
   correctly in both light and dark mode, and the new-order toast visibly appears and is
   dismissed by tapping.**
   proven by: user-run Agent-Probe walkthrough (device or simulator) — no automated RN
   gesture/E2E runner exists in this repo (standing project-wide gap, see
   `process/context/tests/all-tests.md`). strategy: Agent-Probe.

## Out Of Scope

- Real push notifications (device-level, app-backgrounded/killed) for new orders or for
  self-pickup completion. This SPEC covers in-app, screen-mounted behavior only (polling +
  toast) — no `device_tokens`/Expo push wiring for staff. If the user wants staff to be alerted
  while the app is backgrounded, that is separate, follow-up scope (staff push notifications do
  not currently exist anywhere in this codebase).
- Sound or vibration/haptic feedback on the new-order toast. Purely visual, matching the existing
  `Toast` component's capabilities.
- Any change to the customer-facing self-pickup flow (`PATCH /orders/:orderId/complete`) — that
  flow is already delivered and unchanged by this work.
- Any change to the 10s Active Orders poll interval or its background-pause behavior.
- Any change to the Completed Orders list's response shape, filtering, or sort order — only its
  fetch-cadence changes (from "no poll" to "poll while mounted").
- Websocket/real-time push infrastructure of any kind — this SPEC stays within the existing
  polling convention already established in this codebase (react-query `refetchInterval`).
- A toast queue for multiple simultaneous new orders — the existing `useToast` hook is
  replace-latest (no queue); if two orders arrive in the same poll cycle, the toast names however
  many arrived in one message (e.g. "2 new orders") rather than queuing two toasts. Exact message
  copy is PLAN-level detail, not locked here.
- Reworking Product Availability's or Pickup Code lookup's existing data-fetch/mutation logic
  beyond adding pull-to-refresh.

## Constraints

- Must reuse the existing `RefreshControl` + `refetch()`/`isRefetching` idiom already established
  by `list-pagination-refresh_20-07-26` (customer-side) rather than inventing a new pattern.
- Must reuse the existing polling convention (`useQuery` + `refetchInterval` +
  `refetchIntervalInBackground: false`) already established by `useStaffOrders` rather than adding
  a new data-fetching mechanism.
- Must reuse the existing `Toast`/`useToast` primitives (`packages/ui/src/components/toast.tsx`,
  `apps/mobile/src/features/shared/hooks/use-toast.ts`) rather than building a new notification
  component. `Toast` only supports `success | warning | error` severities and is replace-latest
  (no queue) — the new-order toast design must work within those constraints.
- Must not overwrite an in-progress, unsaved staff edit on refresh — reuse the existing
  `prepTimeReducer`'s `hasSeeded`/pending-edit protection pattern
  (`apps/mobile/src/features/staff/lib/prep-time-reducer.ts`) rather than adding a second,
  divergent seeding mechanism.
- Must not introduce a new backend route or schema change — every data source needed already
  exists (`GET /api/staff/orders`, `GET /api/staff/orders/:orderId`,
  `GET /api/staff/orders/completed`).
- Branch isolation must be preserved automatically (all reads already go through the existing
  `requireStaff` → `resolveBranchScope` → `assertBranchScope` chain; no new authz surface is
  introduced).
- No RN component/E2E test runner exists for `apps/mobile` — UI-level (on-device gesture/visual)
  acceptance criteria are Agent-Probe by design, not a claimed automated gap (standing project-wide
  condition, documented in `process/context/tests/all-tests.md`).

## Open Questions

**Locked with sensible defaults (no INNOVATE-level tradeoff needed — reuses established patterns):**

- *Should Order Detail and Completed Orders poll, or rely on some other invalidation trigger?*
  **Locked: extend the same polling convention Active Orders already uses** (`refetchInterval`,
  paused in background) to both screens while mounted. This is mechanical reuse of an existing,
  proven pattern — no new mechanism, no INNOVATE needed.
- *Should the new-order toast fire app-wide for staff, or only where `useStaffOrders` is mounted?*
  **Locked: only where `useStaffOrders` is already mounted** (Active Orders screen + staff
  dashboard home). This is the only place the poll result needed for the id-diff already exists;
  extending it further would need new plumbing and is out of scope for this SPEC.

**Flagged — genuinely needs INNOVATE/user tradeoff analysis, not defaulted silently:**

- **New-order toast persistence and channel.** This SPEC locks the toast as `warning` severity
  (tap-to-dismiss, no auto-timeout — see Acceptance Criteria/Behavioral Outcomes above) as the
  safer default given a missed new-order notice is an operational cost, not a cosmetic one.
  However, whether an in-app, screen-mounted, silent toast is actually sufficient for a
  counter-staff workflow — versus needing sound/vibration, or eventually a real push notification
  so staff notice a new order even when the app isn't in the foreground — is a genuine product
  tradeoff (cost/complexity of adding audio or push infra vs. the operational risk of a missed
  order). This SPEC deliberately does NOT expand scope to cover that; it is called out here as a
  candidate for a follow-up decision, not something INNOVATE needs to resolve to satisfy this
  SPEC's own acceptance criteria (AC-6/7/8 are satisfiable with the toast-only approach as locked).

No open questions remain that block SPEC completion — both flagged items above are locked with a
stated default and a scoped-out follow-up note, not left unresolved.

## Background / Research Findings

Prior RESEARCH (this session) established:

- The customer self-pickup write path already exists and is done:
  `PATCH /orders/:orderId/complete` (`packages/api/src/routes/orders.ts:635-696`) sets status
  `completed` + `completed_at`. Delivered by
  `process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/`, whose own plan states
  "no staff-side change" and "no completion push notification" — the staff-reflect gap is new
  scope, not covered by that plan.
- Staff Active Orders already polls every 10s: `useStaffOrders` sets `refetchInterval: 10_000,
  refetchIntervalInBackground: false`
  (`apps/mobile/src/features/staff/hooks/use-staff-orders.ts`). A customer-completed order already
  drops off that list within ~10s automatically, including the dashboard-home stat block that
  reads the same hook.
- The precise remaining gap for self-pickup reflection: `useStaffOrderDetail`
  (`apps/mobile/src/features/staff/hooks/use-staff-order-detail.ts`) explicitly has "no polling —
  transient", and `useCompletedOrders`
  (`apps/mobile/src/features/staff/hooks/use-completed-orders.ts`) explicitly has "no polling
  since terminal orders never change", invalidated only on a staff-driven mutation success. A
  customer's own completion never invalidates either.
- A reference `RefreshControl` + `refetch()` idiom already exists for customer screens, delivered
  by `process/general-plans/active/list-pagination-refresh_20-07-26/` (explicitly scoped to
  Branches/History/Deals/Home only — staff screens out of scope there). Standard idiom:
  `<ScrollView refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() =>
  void refetch()} tintColor={theme.text} colors={[theme.text]} />}>`. All staff screens
  (`active-orders.tsx`, `completed-orders.tsx`, `(staff)/index.tsx`, `product-availability.tsx`,
  `branch-pickup-settings.tsx`, `order-detail/[orderId].tsx`, `pickup-lookup.tsx`) currently use a
  plain `ScrollView` with zero `RefreshControl`. Every staff data hook already exposes
  react-query's `refetch`/`isRefetching` (all built on `useQuery`) — this is purely a wiring task.
- A shared `Toast` primitive already exists — `packages/ui/src/components/toast.tsx`
  (`Toast`, `ToastSeverity: success | warning | error`) + `useToast()`
  (`apps/mobile/src/features/shared/hooks/use-toast.ts`, replace-latest, no queue). Currently
  consumed only by customer screens. No staff screen uses it, and there is no existing "diff the
  poll result, detect a newly-appeared order id" trigger anywhere.
- Full polling-convention table across staff hooks: `useStaffOrders` 10s poll;
  `useStaffOrderDetail` no poll; `useCompletedOrders` no poll; `useStaffBranchSettings`
  `staleTime: 0`; `useStaffProducts` `staleTime: 30s`.
- `apps/mobile/src/features/staff/lib/prep-time-reducer.ts` (from STAFF-005,
  `process/features/staff-dashboard/active/staff-dashboard-home_20-07-26/`) already solved a
  closely related problem — a react-query cache refresh silently clobbering an in-progress edit —
  via a `hasSeeded`-keyed `useReducer` with a `SETTINGS_ARRIVED` action. This SPEC's pull-to-refresh
  constraint on Branch Pickup Settings reuses that same protection rather than inventing a new one.
- Read directly this session (grounding, not just research summary): `(staff)/active-orders.tsx`,
  `(staff)/completed-orders.tsx`, `(staff)/index.tsx`, `(staff)/order-detail/[orderId].tsx`,
  `(staff)/product-availability.tsx`, all staff hooks + `staff-api.ts`,
  `packages/ui/src/components/toast.tsx`, `use-toast.ts`, and the
  `list-pagination-refresh_20-07-26` SPEC for the RefreshControl idiom precedent.
