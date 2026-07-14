---
name: spec:staff-003-order-status-actions
description: "Product-discovery SPEC for STAFF-003 — staff order status-change actions (state machine PATCH endpoint) and Completed Orders screen"
date: 14-07-26
feature: staff-dashboard
phase: "STAFF-003"
---

# STAFF-003: Order Status Actions and Completed Orders — Product Requirements

**GitHub Issue**: #33
**Priority**: P0 — Milestone: Phase 3: Pickup Live Updates
**PRD references**: §6.13 (Staff Order Actions, Completed Orders screen), §6.6 (Order Statuses), §8.4 (Branch Staff Flow)
**Date**: 2026-07-14
**Status**: SPEC (pre-plan)

---

## Summary

Branch staff currently have a working Active Orders dashboard (STAFF-002) where they can see incoming pickup orders and the full item details for each order — but the action buttons on the Order Details screen are inert placeholders. This makes the app a read-only observer: staff can see orders but cannot move them forward.

STAFF-003 activates those buttons. Staff should be able to accept an incoming order, work it through the kitchen pipeline (preparing → flavoring → ready), and mark it picked up when the customer arrives. They should also be able to reject new orders or cancel any in-progress order. The app enforces the rules about which transitions are legal — staff cannot skip steps or move an order backward.

Alongside that, a Completed Orders screen gives staff access to their branch's finished work (completed, cancelled, and rejected orders) so they can answer customer queries or review their day's throughput.

The result closes the operational loop started by STAFF-001 (auth) and STAFF-002 (visibility): staff can now fully process a customer order from arrival to pickup without leaving the app.

---

## User Stories / Jobs To Be Done

**US-1 — Accept a new order**
As a branch staff member, I want to accept an incoming pending order so that the customer is notified their order is confirmed and the kitchen knows to start preparing.

**US-2 — Work an order through the kitchen pipeline**
As a branch staff member, I want to advance an accepted order through Preparing → Flavoring → Ready so that the order status reflects exactly where it is in the kitchen.

**US-3 — Mark an order picked up**
As a branch staff member, I want to mark a ready order as completed (picked up) so that it leaves the active queue and the customer knows their order is done.

**US-4 — Reject an incoming order**
As a branch staff member, I want to reject a pending order I cannot fulfill so that the customer is informed quickly and the order does not sit unanswered.

**US-5 — Cancel an in-progress order**
As a branch staff member, I want to cancel any non-terminal order (including ones already being prepared) so that I can handle unexpected situations like equipment failure or ingredient shortage.

**US-6 — View completed, cancelled, and rejected orders**
As a branch staff member, I want a Completed Orders screen that lists my branch's terminal orders so that I can review what was processed and answer customer queries without asking another team member.

**US-7 — Action buttons are context-aware**
As a branch staff member, I want the action buttons on an order to show only the transitions that are valid for the current status so that I am never shown a button I am not allowed to tap.

---

## What The User Wants (Behavioral Outcomes)

### Order Details screen — active action buttons

- The Order Details screen (reachable from Active Orders by tapping a row) replaces its current inert placeholder buttons with real, tappable controls.
- The buttons shown depend on the order's current status:

  | Current status | Buttons shown |
  |---|---|
  | `pending` | Accept Order, Reject Order |
  | `accepted` | Start Preparing |
  | `preparing` | Mark Flavoring |
  | `flavoring` | Mark Ready |
  | `ready` | Mark Picked Up, Cancel Order |
  | `completed` / `cancelled` / `rejected` | No action buttons (order is terminal) |

- Tapping an action button sends the transition request to the server immediately (no confirmation modal for forward-moving actions; cancel and reject show a brief confirmation because they are destructive).
- While the request is in-flight the tapped button shows a loading state and all other buttons are disabled.
- On success, the order status on screen updates and the Active Orders list (in the background) invalidates its cache and refreshes.
- If the server rejects the request (e.g. the status was already changed by another device), the screen shows an inline error message ("Order status has changed — pull down to refresh") without crashing or navigating away.
- For `pending → accepted`, the server automatically sets the ETA using the branch's default estimated prep minutes. There is no custom ETA input field in the STAFF-003 mobile UI (default-only, see § Constraints #4).
- Completed, cancelled, or rejected orders reached from the Completed Orders screen show no action buttons.

### Completed Orders screen

- The staff index "Completed Orders" navigation card navigates to a new `(staff)/completed-orders` screen.
- The screen lists all terminal orders (`completed`, `cancelled`, `rejected`) for the staff member's assigned branch, sorted newest-first (by the most recent terminal timestamp — `completed_at`, `cancelled_at`, or the status change time).
- Each row shows: order number, status badge, placed time, and item summary (same display shape as Active Orders rows).
- Tapping a row opens the same `(staff)/order-detail/[orderId]` screen, which shows full item details but no action buttons (because the order is terminal).
- Empty state message when no terminal orders exist: "No completed orders yet."
- The screen does not auto-poll — it is a historical view; pull-to-refresh is sufficient.

### Server-side state machine

- The server is the sole authority for valid transitions. The client cannot supply an arbitrary status value.
- Invalid transition attempts (e.g. `accepted → ready` skipping `preparing` and `flavoring`) are rejected with HTTP 409.
- Terminal-order mutation attempts are also rejected with HTTP 409.
- Branch isolation is enforced: staff can only transition orders belonging to their assigned branch (same pattern as STAFF-002). Cross-branch attempts return 403.

---

## Flow / State Diagram

### Order status state machine

```
                         ┌─────────────────────┐
                         │       pending        │
                         └──────────┬──────────┘
                              [staff action]
                   ┌───────────────┴──────────────┐
                   │                               │
            Accept Order                     Reject Order
                   │                               │
                   v                               v
         ┌──────────────────┐            ┌─────────────────┐
         │     accepted     │            │    rejected ★   │  (terminal)
         └────────┬─────────┘            └─────────────────┘
          Start Preparing
                  │
                  v
         ┌──────────────────┐
         │    preparing     │
         └────────┬─────────┘
          Mark Flavoring
                  │
                  v
         ┌──────────────────┐
         │    flavoring     │
         └────────┬─────────┘
           Mark Ready
                  │
                  v
         ┌──────────────────┐
         │      ready       │
         └────────┬─────────┘
          Mark Picked Up
                  │
                  v
         ┌──────────────────┐
         │    completed     │  (terminal)
         └──────────────────┘

  Cancel Order available from:
  pending, accepted, preparing, flavoring, ready
                  │
                  v
         ┌──────────────────┐
         │    cancelled     │  (terminal)
         └──────────────────┘

★ `rejected` is a new enum value added via migration `0005_add_rejected_order_status.sql`
```

### Order Details action flow (single transition)

```
Staff taps action button
        │
        v
[Confirmation modal?]
  ├── Cancel / Reject → YES: "Are you sure?" modal → confirm → proceed
  └── All others → NO: proceed immediately
        │
        v
PATCH /api/staff/orders/:orderId  { status: "new_status" }
        │
  ┌─────┴──────┐
  │            │
success      error (409/403/404)
  │            │
  v            v
Update      Show inline
status      error message
on screen   "Order status
  │          has changed —
  v          pull down to
Invalidate   refresh"
Active Orders
cache + refresh
```

### Completed Orders screen flow

```
Staff taps "Completed Orders" on staff index
        │
        v
Navigate to (staff)/completed-orders
        │
        v
useQuery fetches GET /api/staff/orders/completed
        │
  ┌─────┴──────┐
  │            │
loading      data
spinner      arrives
               │
        ┌──────┴──────┐
        │             │
   empty state    order rows
  "No completed   (newest first)
   orders yet"         │
                  user taps row
                       │
                       v
          (staff)/order-detail/[orderId]
          (read-only, no action buttons)
                       │
                  user presses back
                       │
                  returns to Completed Orders
```

---

## Acceptance Criteria (Testable Outcomes)

**AC-1 — Valid transitions accepted and timestamps set**
`PATCH /api/staff/orders/:orderId` with a valid `{ status }` body updates the order status in the database. Timestamp columns are set for the transitions that require them: `accepted_at` is set on `pending → accepted`; `ready_at` on `flavoring → ready`; `completed_at` on `ready → completed`; `cancelled_at` on any non-terminal → `cancelled`. `estimated_ready_at` is set on `pending → accepted` using the branch's `estimated_prep_minutes`.

- `proven by:` Vitest integration test — `packages/api/src/routes/__tests__/staff-orders.integration.test.ts`: for each valid transition, assert the response status is 200, the returned order carries the new status, and the relevant timestamp field is non-null.
- `strategy:` Fully-Automated (hermetic vitest integration test, self-seeding, same pattern as STAFF-002 test file).

**AC-2 — Invalid transitions rejected with 409**
Attempts to transition an order to a non-adjacent status (e.g. `accepted → ready`, skipping preparing and flavoring) are rejected with HTTP 409. Attempts to transition a terminal order (status `completed`, `cancelled`, or `rejected`) are also rejected with 409.

- `proven by:` Vitest integration test — same file: seeds orders in specific statuses, sends PATCH with illegal target status, asserts HTTP 409 response.
- `strategy:` Fully-Automated (same hermetic vitest test file as AC-1).

**AC-3 — Branch isolation enforced on status transitions**
A staff member assigned to branch 1 cannot transition an order belonging to branch 2. The server returns 403 regardless of the order's current status.

- `proven by:` Vitest integration test — same file: seeds a branch-2 order, sends PATCH with a branch-1 session, asserts HTTP 403.
- `strategy:` Fully-Automated (same hermetic vitest test file as AC-1).

**AC-4 — `rejected` status is a valid terminal outcome for `pending` orders**
`PATCH /api/staff/orders/:orderId { status: "rejected" }` is accepted when the order is in `pending` status. The order becomes terminal (further PATCHes return 409). The `rejected` value exists in the DB `order_status` enum after migration `0005_add_rejected_order_status.sql` is applied.

- `proven by:` Vitest integration test — same file: seeds a pending order, PATCHes to `rejected`, asserts 200 and terminal state; then PATCHes again and asserts 409. Typecheck (`pnpm typecheck`) confirms `OrderStatus` type in `packages/types` includes `rejected`.
- `strategy:` Fully-Automated (integration test + typecheck gate).

**AC-5 — Completed Orders endpoint returns only terminal orders for the assigned branch**
`GET /api/staff/orders/completed` returns orders with status in `{ completed, cancelled, rejected }` for the session's assigned branch only. Non-terminal orders and terminal orders from other branches are never included.

- `proven by:` Vitest integration test — same file: seeds terminal and non-terminal orders across two branches, calls endpoint with branch-1 session, asserts only branch-1 terminal orders appear.
- `strategy:` Fully-Automated (hermetic vitest integration test).

**AC-6 — ETA set from branch default on accept, not from client input**
When a pending order is accepted, `estimated_ready_at` is set server-side as `NOW() + branch.estimated_prep_minutes * 60 seconds`. The client does not supply an ETA value in the request body. Supplying an `etaMinutes` field in the body has no effect on the stored value (it is ignored or rejected).

- `proven by:` Vitest integration test — same file: seeds a branch with `estimated_prep_minutes = 15`, PATCHes a pending order to `accepted`, asserts `estimated_ready_at` is approximately `placed_at + 15 minutes` (±5s tolerance).
- `strategy:` Fully-Automated (same hermetic vitest test file as AC-1).

**AC-7 — Action buttons are status-appropriate on the Order Details screen**
The Order Details screen shows only the valid-transition buttons for the current order status. A `pending` order shows "Accept Order" and "Reject Order". A `ready` order shows "Mark Picked Up" and "Cancel Order". A terminal order shows no action buttons.

- `proven by:` Agent-Probe scenario — developer opens Order Details for orders in each relevant status (seeded via direct DB insert or real placement), visually verifies the correct button set appears and no extra buttons are visible.
- `strategy:` Agent-Probe (no RN test runner; automation genuinely impossible without Detox/Maestro — Known-Gap consistent with STAFF-001 and STAFF-002).

**AC-8 — Successful transition updates the screen and invalidates the Active Orders cache**
After a staff member taps an action button and the server responds 200, the order status displayed on the Order Details screen updates to the new status without a manual reload. The Active Orders list cache is invalidated (react-query `queryClient.invalidateQueries(['staff','orders'])`), so when the staff member navigates back the list reflects the new state.

- `proven by:` Agent-Probe scenario — developer taps "Start Preparing" on an `accepted` order, observes status badge change on the detail screen, navigates back, confirms the order no longer shows `accepted` in the list.
- `strategy:` Agent-Probe (mobile interaction — no RN runner; Known-Gap).

**AC-9 — Server error on PATCH shows inline error, does not crash**
When the server returns 409 (status already changed by another device or session), the Order Details screen shows an inline error message and remains on screen. The error does not cause a navigation pop or an unhandled exception.

- `proven by:` Agent-Probe scenario — developer directly updates an order's status in the DB while the Order Details screen is open, then taps an action button; confirms the error message appears inline.
- `strategy:` Agent-Probe (requires concurrent state manipulation — no automated path; Known-Gap).

**AC-10 — Completed Orders screen is reachable from staff index and shows terminal orders**
Tapping "Completed Orders" on the staff index screen navigates to `(staff)/completed-orders`. Terminal orders for the assigned branch appear in the list (newest first). Tapping a row navigates to the Order Details screen with no action buttons visible.

- `proven by:` Agent-Probe scenario — developer navigates from staff index → Completed Orders, verifies list content and newest-first order, taps a row, confirms Order Details shows items but no action buttons.
- `strategy:` Agent-Probe (navigation and render — no RN runner; Known-Gap consistent with STAFF-001/002).

---

## Out Of Scope

- **Real STAR-001 star crediting** — When an order reaches `completed`, a `creditStarsForOrder(order)` stub with a `TODO(STAR-001)` comment is inserted at the transition site. No actual star balance update or star-earning logic is implemented in STAFF-003.
- **Real PUSH-002 push notifications** — When an order is rejected, cancelled, or completed, a `notifyCustomer(order, event)` stub with a `TODO(PUSH-002)` comment is inserted. No actual push dispatch is implemented.
- **Custom ETA input on accept** — Staff cannot enter a custom number of minutes when accepting an order. The ETA is always derived from `branch.estimated_prep_minutes` (branch default, typically 15 minutes). A custom ETA input field is a post-STAFF-003 enhancement.
- **Admin cross-branch bypass** — The `assertBranchScope` `TODO(STAFF-ADM)` seam from STAFF-001 is not implemented. Admins are subject to the same branch isolation as regular staff for STAFF-003.
- **Product availability toggles (STAFF-004)** — Staff cannot mark products unavailable from this screen. That is STAFF-004 scope.
- **Pickup code scanning** — PRD §6.13 mentions staff scanning a pickup code. Not in scope for STAFF-003.
- **Branch pause (pause pickup orders)** — PRD §6.13 mentions pausing pickup for a branch. Not in scope for STAFF-003.
- **Optimistic concurrency guard** — No `If-Match` / ETag header or version field is used. The 409 response from the server state machine (wrong source status) is the stale-client protection for V1. A proper optimistic concurrency header is a post-STAFF-003 enhancement.
- **Completed Orders pull-to-refresh animation** — The screen refreshes on pull; the specific pull-to-refresh UI control (e.g. `RefreshControl`) is an implementation detail left to PLAN.
- **WebSockets / Server-Sent Events** — Same as STAFF-002. Polling only.

---

## Constraints

1. **Server is the state machine authority** — The server validates every transition. The mobile client shows context-aware buttons as a UX convenience, but the server rejects any invalid transition regardless of what the client sends.

2. **Branch isolation is session-derived, never client-supplied** — `resolveBranchScope(db, userId)` from `packages/api/src/lib/require-staff.ts` is the only source of branch scope. The client sends no `branch_id` in the PATCH request body.

3. **Migration `0005_add_rejected_order_status.sql` is required** — The `rejected` value does not exist in the current `order_status` DB enum. This migration must run before any PATCH to `rejected` can succeed. The `OrderStatus` type in `packages/types/src/order.ts` must also add `rejected`.

4. **ETA is branch-default-only for STAFF-003** — `estimated_ready_at` on accept is computed server-side as `NOW() + branch.estimated_prep_minutes * interval '1 minute'`. The PATCH body may carry an optional `etaMinutes` field for forward compatibility but it is ignored by the STAFF-003 server handler (not consumed, not stored). A custom ETA field is post-STAFF-003.

5. **STAR-001 and PUSH-002 are stub-only** — Both must appear as named no-op functions (`creditStarsForOrder` / `notifyCustomer`) with `TODO(STAR-001)` / `TODO(PUSH-002)` comments at the relevant transition sites in the API handler. They do not run any real logic.

6. **Plain `fetch` with `Cookie` header for mobile API calls** — Same as STAFF-002 Constraint #4. `authClient.$fetch` cannot be used for `/api/staff/*` routes. Use `fetch(url, { headers: { Cookie: authClient.getCookie() } })`.

7. **React-query `useMutation` for PATCH calls** — Status transitions from the mobile client use `useMutation` from `@tanstack/react-query`. On success, call `queryClient.invalidateQueries(['staff','orders'])` to force the Active Orders list and Completed Orders list to re-fetch.

8. **Integration tests must be hermetic and self-seeding** — No dependency on pre-existing seed data. Tests create all required fixture rows (`users`, `branches`, `orders`) in `beforeAll` using a port-0 Express instance, and delete them in `afterAll`. This is the project's standard (see STAFF-002 test template).

9. **No RN test runner exists** — All mobile screen behavior (buttons, navigation, error states) is verified via Agent-Probe (Known-Gap). This is consistent with STAFF-001 and STAFF-002.

10. **`@jojopotato/ui` components only** — No one-off inline markup for UI elements. Reuse `Button`, `Card`, `Badge`, `OrderStatusBadge`, `OrderStatusTimeline`. Add to `packages/ui` only when a component is reusable and missing.

11. **`(staff)/_layout.tsx` and staff index must be updated** — The `completed-orders` Stack.Screen must be registered in `(staff)/_layout.tsx`. The "Completed Orders" navigation card on `(staff)/index.tsx` (currently `navigateTo: null`) must be wired to the real route.

12. **Serializers are reusable** — `serializeStaffOrderSummary` and `serializeStaffOrderDetail` from `packages/api/src/routes/lib/serializers.ts` are already the correct shape for the Completed Orders response and the post-PATCH updated order response. They should be reused unchanged.

---

## API Contract Sketch

These are the endpoint shapes PLAN must implement. Response field names and request shapes are locked here; implementation details (SQL, middleware) belong to PLAN.

### `PATCH /api/staff/orders/:orderId`

**Request body:**
```json
{ "status": "accepted" }
```
The `status` field is the only required field. Valid target values are those permitted by the state machine from the order's current status (see State Machine table above).

**Success response (200):**
```json
{
  "order": { /* StaffOrderDetail shape from serializeStaffOrderDetail */ }
}
```

**Error responses:**
- `403` — order belongs to a different branch than the session's assigned branch
- `404` — order not found
- `409` — transition is invalid (wrong source status or order is terminal)
- `422` — `status` field missing or not a valid `OrderStatus` value

### `GET /api/staff/orders/completed`

**Request:** no body; branch scope derived from session.

**Success response (200):**
```json
{
  "orders": [ /* array of StaffOrderSummary shape, same as GET /api/staff/orders */ ]
}
```

Filtered to: `status IN ('completed', 'cancelled', 'rejected')` for the session's assigned branch. Sorted by the most recent terminal timestamp descending.

---

## Open Questions

None — all intent is resolved. The three questions flagged during RESEARCH are answered below:

1. **ETA input on accept:** Default-only for STAFF-003 (Constraint #4). No custom input field. An optional `etaMinutes` field in the request body is accepted but ignored.

2. **Optimistic concurrency guard:** Not in scope for STAFF-003 (Out of Scope). The server's state-machine 409 is sufficient stale-client protection for V1.

3. **`cancelled` from which statuses:** Any non-terminal status (`pending`, `accepted`, `preparing`, `flavoring`, `ready`). This is confirmed by the state machine table in the research findings ("any non-terminal → cancelled").

---

## Background / Research Findings

Key facts from the RESEARCH phase that shaped these requirements:

**State machine design confirmed by Issue #33**
The required transitions are: `pending → accepted`, `accepted → preparing`, `preparing → flavoring`, `flavoring → ready`, `ready → completed`, `pending → rejected`, and `any non-terminal → cancelled`. The server enforces this machine — the client only suggests transitions via the PATCH body.

**`rejected` is a new enum value (migration required)**
The current DB `order_status` enum has 7 values: `pending`, `accepted`, `preparing`, `flavoring`, `ready`, `completed`, `cancelled`. The `rejected` status is not in the PRD's original status list but is required by Issue #33 for the `pending → rejected` transition. Adding it requires a new migration `0005_add_rejected_order_status.sql` (PostgreSQL `ALTER TYPE ... ADD VALUE`). The `OrderStatus` type in `packages/types/src/order.ts` must also add `'rejected'`.

**Pre-built lifecycle timestamps (no migration needed)**
The `orders` table already has `accepted_at`, `ready_at`, `completed_at`, and `cancelled_at` columns (all nullable). No new columns are needed. The `estimated_ready_at` column also exists and is currently set at customer order placement time.

**STAFF-001 primitives reused as-is**
`requireStaff(auth)` is applied at the router level and inherited by all `/api/staff/*` routes. `resolveBranchScope(db, userId)` and `assertBranchScope(assigned, requested)` from `packages/api/src/lib/require-staff.ts` are the building blocks for per-request branch isolation in the PATCH handler. The pattern to follow is `GET /api/staff/orders/:orderId` at `staff.ts:86-106`.

**InertOrderActions scaffold exists on Order Details screen**
`apps/mobile/src/app/(staff)/order-detail/[orderId].tsx` already has an `InertOrderActions` component with disabled placeholder buttons for each status. STAFF-003 replaces this component with real, wired action controls.

**ETA derivation**
`branches.estimated_prep_minutes` (default 15) is available from the branch row lookup already performed in the handler (via `resolveBranchScope`). For `pending → accepted`, `estimated_ready_at = NOW() + estimated_prep_minutes * interval '1 minute'`.

**STAR-001 / PUSH-002 stub pattern**
Both are schema-only at this point (tables exist, no write logic). Named no-op stubs (`creditStarsForOrder(order)` / `notifyCustomer(order, event)`) with `TODO(STAR-001)` / `TODO(PUSH-002)` comments are inserted at the transition sites — `ready → completed` for stars, `pending → rejected` / any → `cancelled` / `ready → completed` for push. No real implementation.

**Mobile fetch / mutation pattern**
Staff API calls use plain `fetch(${env.apiUrl}/api/staff/orders/${id}, { method: 'PATCH', headers: { Cookie: authClient.getCookie() }, body: JSON.stringify({ status }) })`. Mutations use `useMutation` from `@tanstack/react-query`. On success: `queryClient.invalidateQueries(['staff','orders'])` to refresh both Active Orders and Completed Orders lists.

**Completed Orders navigation gap**
`(staff)/index.tsx` "Completed Orders" card currently has `navigateTo: null`. `(staff)/_layout.tsx` has no `completed-orders` Stack.Screen. Both need updating as part of this scope.

**Serializers are reusable**
`serializeStaffOrderSummary` and `serializeStaffOrderDetail` in `packages/api/src/routes/lib/serializers.ts` already produce the correct response shapes. The Completed Orders list uses `serializeStaffOrderSummary`; the PATCH success response uses `serializeStaffOrderDetail`.

**Test infrastructure**
`packages/api` uses vitest + supertest with hermetic self-seeding integration tests. STAFF-003 API tests follow the same pattern as `staff-orders.integration.test.ts` (STAFF-002). Mobile surfaces are Agent-Probe only (no RN runner — Known-Gap, consistent with backlog note `staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`).

**PRD §6.13 Staff Order Actions reference**
The PRD lists: Accept order, Reject order, Set estimated pickup time, Mark as preparing, Mark as flavoring, Mark as ready, Mark as picked up, Cancel order. STAFF-003 delivers all of these except "Set estimated pickup time" as a custom UI input (Constraint #4 — default-only ETA).
