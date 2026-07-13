---
name: spec:staff-002-active-orders
description: "Product-discovery SPEC for STAFF-002 — staff Active Orders dashboard with real-time polling and read-only Order Details route"
date: 13-07-26
feature: staff-dashboard
phase: "STAFF-002"
---

# STAFF-002: Active Orders Dashboard — Product Requirements

**GitHub Issue**: #32
**Priority**: P0 — Milestone: Phase 3: Pickup Live Updates
**PRD references**: §6.13 (Active Orders screen, Order Details screen), §8.4 (Branch Staff Flow)
**Date**: 2026-07-13
**Status**: SPEC (pre-plan)
**Amended**: 2026-07-13 — post `development` merge (PR #65)

---

## Amendments (13-07-26, post development merge)

The following changes are the result of verifying ground truth in the merged `development` branch (PR #65 — staff authz + shell landed). They supersede the original SPEC text where indicated.

### A1 — Phase 0 / OrderStatus reconciliation already delivered (REMOVED from scope)

`packages/types/src/order.ts` (line 3-4) already declares:

```
export type OrderStatus =
  'pending' | 'accepted' | 'preparing' | 'flavoring' | 'ready' | 'completed' | 'cancelled';
```

`packages/ui/src/components/order-status-badge.tsx` and `order-status-timeline.tsx` already use `accepted`, `flavoring`, `ready` with the exact PRD §6.6 customer-facing labels (Confirmed by branch / Shaking the flavor / Ready for pickup). No reconciliation work remains.

**Impact:**
- "Type reconciliation (Phase 0)" paragraph in Behavioral Outcomes — removed.
- "OrderStatus type reconciliation flow (Phase 0)" flow diagram — removed.
- AC-6 (OrderStatus type reconciliation) — removed.
- Constraint #10 (Phase 0 prerequisite) — removed.
- Out-of-scope list and Background now note "delivered upstream".
- US-5 (dev testability via injection endpoint) and AC-7 (dev endpoint refuses production) — **also removed** (see A2).

**New consideration for PLAN:** `OrderStatusBadge` renders customer-facing labels ("Order received", "Confirmed by branch", etc.). PLAN must decide whether the staff Active Orders list uses these customer labels via the shared badge, or shows internal-name labels (e.g. "Accepted", "Flavoring") more suited to staff. This is now OC-6.

### A2 — Dev injection endpoint removed from scope (premises gone)

`packages/api/src/routes/orders.ts` contains a real `POST /orders` endpoint behind `requireSession` middleware, a real `GET /orders` history endpoint, and `GET /orders/:orderId` — all fully functional. The mobile app has real cart → checkout → confirmation → tracking → history screens.

**Impact:**
- US-5 (dev testability via injection endpoint) — removed.
- "Dev order injection endpoint" paragraph in Behavioral Outcomes — removed.
- "Dev order injection flow" flow diagram — removed.
- AC-7 (dev endpoint refuses production) — removed.
- Constraint #3 (dev endpoint must mirror `/dev/session` gate) — removed.
- Out-of-scope item "Real customer checkout / order placement" updated: real checkout exists; the item now reads "customer checkout screens (already built, no STAFF-002 changes needed)".

**Live-demo path for AC-1 (updated):** place a real order via the customer app (seeded customer `jojo@test.com` / `jojo1234`) at the staff user's assigned branch, then observe the order appear on the staff dashboard within ≤2 polling intervals (~20s). The "seed ~5 sample active orders" item is kept — it provides instant varied-status dashboard content for manual QA without requiring the full customer checkout flow each time.

### A3 — `selected_options` shape now confirmed (OC-1 resolved)

Real order placement (`POST /orders`) writes `selected_options` to `order_items` as a JSONB array of the `SelectedOption` type defined in `packages/api/src/routes/lib/serializers.ts` (lines 27-32):

```typescript
// packages/api/src/routes/lib/serializers.ts:27-32
export interface SelectedOption {
  optionId: string;          // UUID of the product_option row
  optionType: 'size' | 'flavor' | 'add_on';
  name: string;              // option display name, e.g. "BBQ Ranch"
  priceDeltaCents: number;   // signed cents delta; 0 for no-cost options
}
```

The serializer (`serializeOrderItem`, line 175-183) casts `item.selected_options` to this type and returns it verbatim in `ApiOrderItem.selectedOptions`. This is the de-facto display contract for Order Details.

**Impact:** OC-1 (selected_options shape) is resolved. Constraint #6 (OC-1 is open) updated to reflect the confirmed shape. AC-4 detail endpoint assertion updated to use the confirmed field names.

### A4 — Customer order tracking screen exists (reference screen update)

`apps/mobile/src/app/(tabs)/order/tracking/[orderId].tsx` is a real, implemented tracking screen (not a placeholder). It is now available as a reference for the staff Order Details screen implementation.

**Impact:** the "no reference screen for Order Details" note in Background is updated. PLAN should read this screen as a structural reference.

### A5 — Route mount corrections

Active route mounts as of the merged branch:
- `/branches` — branch routes
- `/orders` — customer orders (requireSession)
- `/api/staff/*` — staff routes (requireStaff)
- `/api/auth/*` — better-auth

The `/api/menu` router was deleted upstream. Any SPEC or plan reference to `/api/menu` is stale — the menu data is served under a different path or removed. STAFF-002 does not touch the menu router.

---

## Summary

Branch staff need to see all live pickup orders for their assigned branch the moment they open the app — and have new orders appear automatically without tapping a refresh button. Today the Active Orders screen in the staff shell shows hardcoded mock data. This plan replaces that mock with a real, branch-scoped order feed from the API, adds automatic polling so incoming orders surface within about 10 seconds, and opens a read-only Order Details screen where the staff member can see exactly what the customer ordered (flavour choices, sizes, add-ons).

The result is the core operational loop for a branch: staff member opens app, sees what orders are waiting, taps to see the full item list, and the feed stays current without manual refresh. Order status changes (accepting, marking ready) are deliberately deferred to STAFF-003.

**Note (post-merge):** The `OrderStatus` type reconciliation that was previously listed as "Phase 0" of this work has already been delivered by the upstream `development` branch. The shared `OrderStatusBadge` and `OrderStatusTimeline` components are ready to use. Real customer order placement also exists; a dev-only injection endpoint is no longer needed.

---

## User Stories / Jobs To Be Done

**US-1 — Live order feed**
As a branch staff member, I want to see all non-terminal orders for my branch update automatically so that I do not miss incoming pickup orders or have to manually refresh.

**US-2 — Branch isolation**
As a branch staff member, I want to see only my assigned branch's orders so that I never act on another branch's orders by mistake.

**US-3 — Order Details**
As a branch staff member, I want to tap an order in the list and see the full item breakdown — names, quantities, and selected options (flavours, sizes, add-ons) — so that I know exactly what to prepare.

**US-4 — Clean completed/cancelled state**
As a branch staff member, I want completed and cancelled orders to disappear from my Active Orders list so that the screen only shows work that still needs attention.

~~**US-5 — Dev testability**~~ *(Removed — A2: real order placement exists; injection endpoint not needed.)*

---

## What The User Wants (Behavioral Outcomes)

**Active Orders screen (replaces mock)**
- Opening the screen shows all non-terminal orders (`pending`, `accepted`, `preparing`, `flavoring`, `ready`) for the staff member's assigned branch, sorted newest / most-urgent first.
- Each row displays: order number, item summary (e.g. "2× Loaded Fries, 1× Classic Soda"), time placed, and current status badge.
- The list refreshes automatically in the background. Within roughly 10 seconds of a new order landing in the database, it appears on the screen with no interaction from the staff member.
- When there are no active orders the screen shows a friendly empty state ("No active orders right now").
- The branch name in the header comes from `useStaffMe()` and stays consistent with the existing shell design.

**Order Details screen (new)**
- Tapping any row pushes a new Order Details screen within the `(staff)` stack.
- The screen shows: order number, placed time, total, status, and the full ordered item list.
- Each item shows: product name, quantity, unit price, and all selected options (e.g. "Flavor: BBQ Ranch", "Size: Large") — rendered from `selectedOptions: Array<{ optionId, optionType, name, priceDeltaCents }>` (see A3).
- Action buttons for accepting / marking ready / etc. are visible but inert — they are placeholders for STAFF-003. They must not trigger any state change.
- Navigating back returns to the Active Orders list, which continues polling.

~~**Type reconciliation (Phase 0)**~~ *(Removed — A1: already delivered upstream. `OrderStatus` type and badge/timeline components are correct.)*

~~**Dev order injection endpoint**~~ *(Removed — A2: real order placement exists.)*

---

## Flow / State Diagram

### Active Orders screen lifecycle

```
Staff opens (staff)/active-orders
          |
          v
   useQuery fetches GET /api/staff/orders
          |
    +-----------+-----------+
    |                       |
  loading               data arrives
  spinner                   |
                    +-------+-------+
                    |               |
                empty state    order rows list
                "No active          |
                orders"     user taps a row
                                    |
                                    v
                         pushes (staff)/order-detail/[orderId]
                                    |
                         reads GET /api/staff/orders/:id
                                    |
                         shows item list + inert action buttons
                                    |
                         user presses back
                                    |
                         returns to Active Orders
                         (polling continues in background)
```

### Polling loop

```
  Query mounted
       |
       v
  initial fetch -----> display results
       |
  [refetchInterval ~10s]
       |
       v
  background re-fetch --> merge results --> re-render if changed
       |
  repeat until screen unmounts
```

~~### Dev order injection flow~~ *(Removed — A2)*

~~### OrderStatus type reconciliation flow (Phase 0)~~ *(Removed — A1)*

---

## Acceptance Criteria (Testable Outcomes)

**AC-1 — New order appears without manual refresh**
A new order placed for the assigned branch (via real customer checkout using `jojo@test.com` / `jojo1234`, OR via a directly seeded DB row) appears on the Active Orders screen within a bounded time window (≤ 2× the polling interval, ~20s upper bound) without any manual action from the staff member.

- `proven by:` Agent-Probe scenario — developer places a real order or seeds a DB row for the assigned branch, observes the new row in the Expo simulator without tapping refresh.
- `strategy:` Agent-Probe (no RN test runner; automation is genuinely impossible without Detox/Maestro — Known-Gap consistent with STAFF-001).

**AC-2 — Branch isolation is server-enforced**
Orders for branch 2 are never returned when a staff member assigned to branch 1 calls `GET /api/staff/orders`. This holds even if a client passes `branch_id=2` directly in the request — the server derives scope from the session, never from the client.

- `proven by:` Vitest integration test — `packages/api/src/routes/__tests__/staff-orders.integration.test.ts`: self-seeds branch-1 and branch-2 orders, calls the endpoint with a branch-1 session, asserts response contains only branch-1 order IDs.
- `strategy:` Fully-Automated (vitest hermetic integration test, self-seeding pattern from `branches.ts`/`menu.ts` precedent).

**AC-3 — Completed and cancelled orders never appear**
Orders with status `completed` or `cancelled` are not returned by `GET /api/staff/orders`, even when they exist in the database for the assigned branch.

- `proven by:` Vitest integration test — same test file: seeds orders in terminal states (`completed`, `cancelled`) plus non-terminal ones, asserts terminal-status orders are absent from the response.
- `strategy:` Fully-Automated (same hermetic vitest test file as AC-2).

**AC-4 — Order Details item list matches what the customer submitted**
`GET /api/staff/orders/:id` returns the full item list with `productName`, `quantity`, `unitPriceCents`, and `selectedOptions` matching the data written to `order_items` at placement time. Each `selectedOption` carries `{ optionId, optionType, name, priceDeltaCents }` (confirmed shape — A3). The mobile Order Details screen renders all items and their options.

- `proven by:` Vitest integration test (API contract) + Agent-Probe (mobile render).
  - API: seeds an order with known `order_items` including `selected_options` in the confirmed shape; asserts the detail endpoint returns them verbatim with matching field names.
  - Mobile: Agent-Probe — developer taps the seeded order row and observes the item list and options on-device.
- `strategy:` Hybrid (Fully-Automated for API layer; Agent-Probe for mobile render — Known-Gap).

**AC-5 — Branch isolation also applies to Order Details**
Calling `GET /api/staff/orders/:id` with an order ID belonging to a different branch returns 403 or 404. Staff cannot view another branch's order details by guessing order IDs.

- `proven by:` Vitest integration test — seeds a branch-2 order, calls detail endpoint with branch-1 session using the branch-2 order ID, asserts 403/404.
- `strategy:` Fully-Automated (same hermetic vitest test file as AC-2/AC-3).

~~**AC-6 — OrderStatus type reconciliation**~~ *(Removed — A1: delivered upstream. `pnpm typecheck` and badge/timeline tests already pass.)*

~~**AC-7 — Dev injection endpoint is absent in production**~~ *(Removed — A2: endpoint not built.)*

---

## Out Of Scope

- **Status-change write actions (STAFF-003)** — Accept, Mark Ready, and any other order-status mutation endpoints. The inert buttons on the Order Details screen are placeholders only; their wiring is STAFF-003.
- **Completed Orders screen (STAFF-003)** — A separate screen listing terminal orders is STAFF-003 scope.
- **Customer checkout screens** — already built (cart → checkout → confirmation → tracking → history); no STAFF-002 changes needed to the customer-facing order flow.
- ~~Real customer checkout / order placement~~ *(Updated — A2: this now exists; no longer a gap.)*
- ~~`POST /dev/orders` injection endpoint~~ *(Removed — A2.)*
- **Product availability toggles (STAFF-004)** — Out of scope for this milestone.
- **WebSockets / Server-Sent Events** — Real-time delivery via push channel is explicitly deferred. Polling is the chosen mechanism.
- **Admin or super_admin branch-scope rules** — Multi-branch admin access is a post-MVP concern; the `assertBranchScope` TODO seam from STAFF-001 stays untouched.
- **Order filtering, sorting UI controls** — The sort order (newest/most-urgent first) is fixed server-side. No client-side filter controls.
- **Push notifications for new orders** — Notifications (STAFF-004 / rewards-notifications feature area) are out of scope.
- **Order cancellation by staff** — Not in scope for this issue.

---

## Constraints

1. **Polling only** — `refetchInterval` via react-query (~10s). No SSE or WebSocket. The interval value is an open contract to lock in PLAN.
2. **Branch scope is session-derived, never client-supplied** — `resolveBranchScope(db, session.userId)` from `require-staff.ts` (STAFF-001 primitive). The client sends no `branch_id` parameter.
3. ~~**Dev endpoint must mirror the `/dev/session` gate pattern**~~ *(Removed — A2: no dev endpoint.)*
4. **`authClient.$fetch` for mobile API calls** — Public `getJson` would 403. All staff API calls must use `authClient.$fetch` from `apps/mobile/src/features/auth/lib/auth-client.ts` to forward the SecureStore session cookie.
5. **`product_name_snapshot` is the item name** — Never join to the `products` table for the item name; use `order_items.product_name_snapshot` (denormalised for order history integrity).
6. **`selected_options` shape is confirmed** — `Array<{ optionId: string; optionType: 'size'|'flavor'|'add_on'; name: string; priceDeltaCents: number }>` as defined in `packages/api/src/routes/lib/serializers.ts:SelectedOption`. OC-1 is resolved (A3).
7. **Integration tests must be hermetic and self-seeding** — No dependency on pre-existing seed data. Tests insert their own fixtures in `beforeAll` on a port-0 Express instance and delete them in `afterAll`. This is a hard constraint from the research findings (branches.ts / menu.ts test template).
8. **No RN test runner exists** — Mobile screen rendering is Agent-Probe (Known-Gap) for all ACs. This is consistent with STAFF-001 and the Known-Gap note at `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`.
9. **`@jojopotato/ui` components only** — No one-off inline markup. Reuse existing components (`OrderStatusBadge`, `OrderStatusTimeline`, `Card`, `Button`, `Badge`) or add to `packages/ui/src/components/` if a missing component is needed.
10. ~~**Phase 0 (type reconciliation) must complete before data-fetching code**~~ *(Removed — A1: type reconciliation is done.)*
11. **Order Details route is `(staff)/order-detail/[orderId].tsx`** — Must be registered in `(staff)/_layout.tsx`. Route shape is locked by user decision.
12. **DB index already exists** — `orders_branch_status_idx (branch_id, status)` is present; query design must use it (filter on `branch_id` AND `status IN (non-terminal values)` together).

---

## Open Contracts (to lock in PLAN)

These are not implementation choices — they are interface contracts that PLAN must define before execution begins.

~~**OC-1 — `selected_options` display shape**~~ *(Resolved — A3: shape is `Array<{ optionId, optionType, name, priceDeltaCents }>` from `serializers.ts:SelectedOption`.)*

**OC-2 — `GET /api/staff/orders` response schema**
The response envelope from the list endpoint is not yet defined. It needs to include at minimum per-order: `id`, `order_number`, `status`, `placed_at`, and an item summary representation. Whether `order_items` is included in the list response (pre-fetched) or only in the detail response needs to be locked in PLAN to avoid over-fetching.

**OC-3 — Item summary format in the list row**
The row subtitle shows a text summary of ordered items (e.g. "2× Loaded Fries, 1× Classic Soda"). PLAN must define: is this derived server-side (a computed field in the list response) or computed client-side from a nested `order_items` array? The server-side option avoids sending full item data in the list; client-side is simpler but may over-fetch.

**OC-4 — Polling interval value**
The `refetchInterval` is noted as "~10s" but the exact value is not locked. PLAN must commit to a specific number (e.g. 10000ms) and note it in the plan checklist. This value appears in at least one Agent-Probe instruction so it needs to be explicit.

**OC-5 — Order sort order / urgency definition**
"Newest / most-urgent first" is the requirement. PLAN must define whether urgency is simply `ORDER BY placed_at DESC` (newest first) or a more complex rule (e.g. pending > accepted > preparing > … by status priority, then by placed_at within each group). The DB index supports branch + status filtering; sort direction is a separate ORDER BY concern.

**OC-6 — Staff-facing status label wording (new — A1)**
`OrderStatusBadge` renders customer-facing labels ("Order received", "Confirmed by branch", "Frying now", "Shaking the flavor", "Ready for pickup"). PLAN must decide: does the staff Active Orders list use the shared `OrderStatusBadge` (customer labels) or a staff-specific label mapping showing internal names (e.g. "Accepted", "Flavoring")? Using `OrderStatusBadge` is simplest; different wording for staff is a deliberate product choice that requires a new component or a prop.

---

## Open Questions

None — all intent is locked from the user-confirmed decisions and authoritative research findings above (including post-merge amendments A1–A5). OC-2 through OC-6 are contracts to lock in PLAN, not unresolved intent questions.

---

## Dependencies / Prerequisites

- **STAFF-001 must be complete** (it is — see `process/features/staff-dashboard/completed/staff-001-login-branch-scope_13-07-26/`). `requireStaff`, `resolveBranchScope`, `assertBranchScope`, and the `staffRouter` mount are live.
- **OrderStatus reconciliation is complete** (delivered upstream, PR #65 — A1). `packages/types/src/order.ts` and the shared UI badge/timeline components are ready.
- **Real customer order placement exists** (`POST /orders` behind `requireSession` — A2). Seeded customer `jojo@test.com` / `jojo1234` can place real orders for integration testing.
- **Local Postgres must be running** for integration tests (`docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate`).

---

## Risk / Edge Cases

| Risk | Mitigation |
|---|---|
| Staff member has no `assigned_branch_id` set | `resolveBranchScope` throws / returns null — server returns 400 or 403 with a clear error message. Mobile shows an error state ("Branch not assigned — contact admin"). |
| No active orders for a branch | Empty state renders ("No active orders right now") — not a loading spinner that never resolves. |
| Another branch's order ID guessed in the detail URL | `GET /api/staff/orders/:id` calls `assertBranchScope` and returns 403/404 before any order data is sent (AC-5). |
| Polling fires while Order Details screen is open | react-query continues to update the list-query cache in the background; the detail screen is a separate query and is unaffected. |
| `selected_options` is null or empty array in DB | Mobile renders gracefully — no options section shown, not a crash. (Shape is now confirmed — A3.) |
| ~~`POST /dev/orders` called in production~~ | *(Removed — A2: endpoint not built.)* |
| `OrderStatus` reconciliation breaks customer-facing badge labels | *(Moot — A1: reconciliation is done and labels are correct.)* |

---

## Background / Research Findings

Key facts from the RESEARCH phase that shaped these requirements:

**Reusable STAFF-001 primitives (already shipped)**
`requireStaff` middleware, `resolveBranchScope`, and `assertBranchScope` in `packages/api/src/lib/require-staff.ts` provide the full auth + branch-scope enforcement layer. The `staffRouter` in `packages/api/src/routes/staff.ts` is already mounted and guarded. Branch scope is structurally enforced (session-derived, never client-supplied) — AC-2 is "free" at the server layer.

**Integration test template**
`packages/api/src/routes/branches.ts` and `menu.ts` with their hermetic self-seeding `routes/__tests__/` tests are the authoritative template. Tests insert all fixtures, run on a port-0 Express instance, and delete in `afterAll`. STAFF-002 tests follow this exact pattern.

**Data model facts**
- `orders`: `order_number` (format `JP-YYMMDD-XXXX`), `status` (DB enum: `pending|accepted|preparing|flavoring|ready|completed|cancelled`), `branch_id`, `user_id`, `placed_at`, `estimated_ready_at` (derived from `branch.estimated_prep_minutes`), `total`, timestamps.
- `order_items`: `order_id`, `product_id`, `product_name_snapshot` (use this for display — never join products), `quantity`, `unit_price`, `total_price`, `selected_options JSONB`.
- DB index: `orders_branch_status_idx (branch_id, status)` — already present.

**`selected_options` confirmed shape (A3)**
Written by the real `POST /orders` handler (`packages/api/src/routes/orders.ts:134-139`) and serialized by `serializeOrderItem` (`packages/api/src/routes/lib/serializers.ts:175-183`):

```typescript
// packages/api/src/routes/lib/serializers.ts:27-32
export interface SelectedOption {
  optionId: string;
  optionType: 'size' | 'flavor' | 'add_on';
  name: string;
  priceDeltaCents: number;
}
```

This is the shape PLAN must use for the staff Order Details display contract.

**OrderStatus type and badge/timeline (A1 — already delivered)**
`packages/types/src/order.ts` has the 7-value enum matching the DB. `OrderStatusBadge` and `OrderStatusTimeline` in `packages/ui/src/components/` use these values with PRD §6.6 customer-facing labels. No reconciliation work remains. OC-6 is the residual PLAN decision: whether staff screens use these customer labels or internal-name variants.

**Real order placement (A2 — already exists)**
`packages/api/src/routes/orders.ts` — `POST /orders` (requireSession): full transaction, server-side price recompute, `order_number` generator (`JP-YYMMDD-XXXX`), `estimated_ready_at` from branch prep time, denormalized item snapshots. `GET /orders` history + `GET /orders/:orderId` detail also exist. Mobile has real cart → checkout → confirmation → tracking (`(tabs)/order/tracking/[orderId].tsx`) → history screens. Customer `jojo@test.com` / `jojo1234` can place real orders for AC-1 live-demo.

**Reference screen for Order Details (A4 — now exists)**
`apps/mobile/src/app/(tabs)/order/tracking/[orderId].tsx` is a real implemented customer order tracking screen. PLAN should read it as a structural reference for the staff Order Details screen layout.

**Mobile fetch pattern**
`authClient.$fetch` from `apps/mobile/src/features/auth/lib/auth-client.ts` is required for all staff API calls (forwards the SecureStore session). Wrap in react-query `useQuery` + `refetchInterval` for polling. This reuses the `useProductDetails` precedent from the ordering-cart feature.

**Mock to replace**
`apps/mobile/src/app/(staff)/active-orders.tsx` currently renders hardcoded `MOCK_ORDERS`. This file is fully replaced. The custom header and `useStaffMe()` branch-name display are kept.

~~**OrderStatus type mismatch**~~ *(Resolved — A1: no longer a gap. Backlog note at `staff-002-order-status-type-reconciliation_NOTE_13-07-26.md` can be closed.)*

**No RN test runner**
`apps/mobile` has no Jest/Vitest/Detox/Playwright. Mobile rendering is Agent-Probe (Known-Gap) — consistent with STAFF-001 and the backlog note at `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`.

**User's confirmed approach decisions (locked constraints)**
1. Seed ~5 sample active orders for branch 1 (for instant varied-status dashboard content during manual QA).
2. ~~Phase 0 OrderStatus reconciliation ships in the same plan.~~ *(Removed — A1: already done.)*
3. Real-time = polling via react-query `refetchInterval` (~10s).
4. Order Details = pushed route `(staff)/order-detail/[orderId].tsx`, read-only, inert action buttons.
