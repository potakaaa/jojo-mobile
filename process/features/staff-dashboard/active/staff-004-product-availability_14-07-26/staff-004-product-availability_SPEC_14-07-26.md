---
name: spec:staff-004-product-availability
description: "Product-discovery SPEC for STAFF-004 — staff product availability toggles and Branch Pickup Settings screen"
date: 14-07-26
feature: staff-dashboard
phase: "STAFF-004"
---

# STAFF-004: Product Availability and Branch Pickup Settings — Product Requirements

**GitHub Issue**: #34 (STAFF-004)
**Priority**: P0 — Milestone: Phase 4: Staff Availability Controls
**PRD references**: §6.13 (Staff Product Availability, Branch Pickup Settings)
**Date**: 2026-07-14
**Status**: SPEC (pre-plan)

---

## Summary

Branch staff can already view incoming pickup orders and move them through the kitchen pipeline (STAFF-001 through STAFF-003). But when a product runs out or is temporarily unavailable, staff have no way to hide it from the customer menu. Customers can still order it and the order will be rejected or cause confusion at the counter. Similarly, when a branch needs to stop taking pickup orders entirely — kitchen equipment goes down, they are at capacity — there is no way for staff to flip a switch in the app.

STAFF-004 gives staff two new tools: a **Product Availability** screen where they can turn individual menu items on or off for their assigned branch, and a **Branch Pickup Settings** screen where they can pause and resume pickup orders for the whole branch, and update how long orders are expected to take.

Both actions take effect immediately on the customer-facing side. Turning a product off removes it from the customer's branch menu in real time; turning it back on restores it. Pausing pickup disables the "Order Here" button on the branch screen and blocks new order placements at the server level; resuming restores everything.

---

## User Stories / Jobs To Be Done

**US-1 — See which products are currently available at my branch**
As a branch staff member, I want to open a Product Availability screen and see all active menu items with their current on/off status for my branch, so that I have a clear picture of what customers can order right now.

**US-2 — Mark a product unavailable**
As a branch staff member, I want to toggle a product off, so that it is immediately hidden from the customer-facing menu and customers cannot order it until it is restocked.

**US-3 — Restore a product to available**
As a branch staff member, I want to toggle a product back on, so that customers can order it again without any manual server intervention.

**US-4 — Pause pickup for the entire branch**
As a branch staff member, I want to turn off pickup ordering for my branch, so that when the kitchen is at capacity or equipment goes down, no new orders arrive while we catch up.

**US-5 — Resume pickup ordering**
As a branch staff member, I want to turn pickup ordering back on, so that customers can place orders again once the branch is ready.

**US-6 — Update estimated prep time**
As a branch staff member, I want to change my branch's estimated preparation time, so that the ETA shown to customers at order acceptance reflects current kitchen throughput.

---

## What The User Wants (Behavioral Outcomes)

### Product Availability screen

- The staff dashboard "Product Availability" navigation card (currently inert) navigates to a new screen.
- The screen lists every globally-active product for the assigned branch, grouped by category, with a toggle switch next to each product showing whether it is currently available at this branch.
- Products with no availability record in the database are shown as **on** (available). The absence of a record means the product is available by default — this is the system's intentional default and the screen must reflect it accurately.
- Tapping a toggle flips its state immediately (optimistic update). The change is persisted to the server in the background.
- If the server call fails, the toggle reverts to its previous state and a brief error message is shown.
- A product toggled **off** is immediately excluded from the customer-facing branch menu (the server filter is already live). Customers cannot order it until it is toggled back on.
- A product toggled **on** is immediately included in the customer-facing branch menu.
- Staff cannot toggle products on behalf of another branch. Any attempt to do so is rejected by the server with 403.

### Branch Pickup Settings screen

- The staff dashboard "Branch Pickup Settings" navigation card (currently inert) navigates to a new screen.
- The screen shows two controls:
  1. **Accepting Pickup Orders** — a toggle showing whether the branch is currently accepting new pickup orders.
  2. **Estimated Prep Time** — an editable numeric field showing the branch's current `estimatedPrepMinutes` value, with a save button.
- When the pickup toggle is **off**, the screen clearly signals that new orders are blocked. Customers attempting to order at this branch will see it marked as unavailable and the "Order Here" action is disabled on their side.
- Turning pickup back **on** restores customer ordering immediately.
- Changing the estimated prep time requires tapping a Save button. The new value is validated on screen (1–120 minutes) before being sent to the server. The server stores the new value and uses it for all future `pending → accepted` ETA calculations.
- Staff cannot modify settings for a branch they are not assigned to. Server returns 403.

---

## Flow / State Diagram

### Product Availability toggle flow

```
Staff opens Product Availability screen
        │
        v
GET /api/staff/products
(all globally-active products + per-branch availability for assigned branch)
        │
        v
Screen renders product list
(absent row → shown as ON = available)
        │
Staff taps a toggle
        │
  ┌─────┴──────────────────────┐
  │                             │
toggle OFF (was on)       toggle ON (was off)
  │                             │
  v                             v
Optimistic UI update      Optimistic UI update
(show as unavailable)     (show as available)
  │                             │
  v                             v
PATCH /api/staff/products/:productId/availability
  { isAvailable: false }   { isAvailable: true }
  │                             │
  ├── success 200           ├── success 200
  │   (persist toggle)      │   (persist toggle)
  │                         │
  └── error                 └── error
      │                         │
      v                         v
  Revert toggle            Revert toggle
  Show error message       Show error message
```

### Branch Pickup Settings flow

```
Staff opens Branch Pickup Settings screen
        │
        v
GET /api/staff/branch (or same as staff/me — branch settings)
        │
        v
Screen renders:
  - Accepting Pickup: [toggle ON/OFF]
  - Estimated Prep Time: [N] min  [Save]
        │
  ┌─────┴──────────────────────────────────────┐
  │                                             │
Toggle Pickup                         Edit Prep Time
  │                                             │
  v                                             v
PATCH /api/staff/branch                  User types new value
  { isAcceptingPickup: true/false }       (validates 1–120 min)
  │                                             │
  ├── success 200                        Taps Save
  │   (update display)                         │
  └── error                              PATCH /api/staff/branch
      │                                    { estimatedPrepMinutes: N }
      v                                         │
  Show error                             ├── success 200
                                         │   (update display, dismiss keyboard)
                                         └── error
                                             │
                                             v
                                         Show validation or server error
```

### Customer-facing enforcement (already live, shown for context)

```
Customer opens branch menu
        │
        v
GET /branches/:branchId/menu
(INNER JOIN branch_product_availability WHERE is_available = true
 — products with no row are included by LEFT JOIN default)
        │
        v
Only available products shown
        │
Customer attempts to place order at paused branch
        │
        v
POST /orders
  → 400 blocked: branch.is_accepting_pickup = false
```

---

## Acceptance Criteria (Testable Outcomes)

**AC-1 — Product list shows all globally-active products with correct availability for the assigned branch**
`GET /api/staff/products` returns all products where `products.is_active = true`, decorated with the per-branch availability from `branch_product_availability` for the session's assigned branch. Products with no row in `branch_product_availability` are returned with `isAvailable: true` (absent row = available by default).

- `proven by:` Vitest integration test — `packages/api/src/routes/__tests__/staff-product-availability.integration.test.ts`: seed products with and without availability rows for the test branch; assert the response includes all active products and correctly reflects `isAvailable: true` for no-row products and the stored value for products with a row.
- `strategy:` Fully-Automated (hermetic vitest integration test, self-seeding, same pattern as `staff-order-status.integration.test.ts`).

**AC-2 — Toggling a product unavailable removes it from the customer-facing menu**
After `PATCH /api/staff/products/:productId/availability` with `{ isAvailable: false }`, a subsequent call to `GET /branches/:branchId/menu` for that branch does not include the toggled-off product.

- `proven by:` Vitest integration test — same file: seed a product with no availability row (default on), PATCH it to unavailable, then call the branches menu endpoint and assert the product is absent.
- `strategy:` Fully-Automated (hermetic vitest integration test, cross-route assertion).

**AC-3 — Toggling a product available restores it on the customer-facing menu**
After a product has been set unavailable, `PATCH /api/staff/products/:productId/availability` with `{ isAvailable: true }` causes the product to reappear in `GET /branches/:branchId/menu` for that branch.

- `proven by:` Vitest integration test — same file: seed a product with `is_available = false`, PATCH it to available, then call the branches menu endpoint and assert the product appears.
- `strategy:` Fully-Automated (hermetic vitest integration test).

**AC-4 — Staff cannot toggle products for a branch they are not assigned to**
Sending `PATCH /api/staff/products/:productId/availability` with a session whose `assigned_branch_id` does not match the product's target branch returns 403. Branch scope is always derived from the session, never from the request body.

- `proven by:` Vitest integration test — same file: seed a product for branch 2, send PATCH with a branch-1 session, assert 403 response.
- `strategy:` Fully-Automated (hermetic vitest integration test).

**AC-5 — Pausing pickup blocks new order placements and disables customer branch CTA**
After `PATCH /api/staff/branch` with `{ isAcceptingPickup: false }`, a customer attempting `POST /orders` for that branch receives a 400 error. The branch data returned by `GET /branches/:branchId` reflects `isAcceptingPickup: false`, which the customer branch screens use to disable the "Order Here" CTA.

- `proven by:` Vitest integration test — same file: PATCH branch to not-accepting, attempt POST /orders for that branch, assert 400. Also assert GET /branches/:branchId returns `isAcceptingPickup: false`.
- `strategy:` Fully-Automated (hermetic vitest integration test, cross-route assertion).

**AC-6 — Resuming pickup restores order placement**
After a branch has `is_accepting_pickup = false`, `PATCH /api/staff/branch` with `{ isAcceptingPickup: true }` allows `POST /orders` for that branch to succeed again.

- `proven by:` Vitest integration test — same file: set branch to not-accepting, then PATCH to accepting, then POST /orders and assert success (201).
- `strategy:` Fully-Automated (hermetic vitest integration test).

**AC-7 — Estimated prep time is editable within valid range and used for future ETA calculations**
`PATCH /api/staff/branch` with `{ estimatedPrepMinutes: N }` where N is between 1 and 120 (inclusive) updates `branches.estimated_prep_minutes`. A subsequent `pending → accepted` transition on an order for that branch sets `estimated_ready_at` using the new prep time, not the old value.

- `proven by:` Vitest integration test — same file: PATCH branch prep time to 30, then accept a pending order, assert `estimated_ready_at ≈ NOW() + 30 minutes` (±5s tolerance). Also assert that PATCH with N < 1 or N > 120 returns a 422 validation error.
- `strategy:` Fully-Automated (hermetic vitest integration test).

**AC-8 — Staff cannot modify branch settings for a branch they are not assigned to**
`PATCH /api/staff/branch` with a session whose assigned branch is branch 1 cannot be used to modify branch 2's settings. The branch being modified is always the session's assigned branch — there is no `branchId` parameter in the request body.

- `proven by:` Vitest integration test — same file: assert that the PATCH endpoint resolves branch from the session (no body `branchId`), and that a staff session assigned to branch 1 can only change branch 1's settings. Cross-branch scenario is covered implicitly by AC-4 isolation pattern.
- `strategy:` Fully-Automated (hermetic vitest integration test).

**AC-9 — Mobile: Product Availability screen renders toggles correctly for each product**
The Product Availability screen shows all active products with toggle switches. Products that are available (including those with no `branch_product_availability` row) show the toggle in the ON position. Unavailable products show it in the OFF position.

- `proven by:` Agent-Probe scenario — developer opens the Product Availability screen on the staff dashboard with a seeded branch having a mix of available and unavailable products (and at least one product with no row); verifies toggle state matches expected availability for each product.
- `strategy:` Agent-Probe (no RN test runner; automation genuinely impossible without Detox/Maestro — Known-Gap consistent with STAFF-001 through STAFF-003).

**AC-10 — Mobile: Tapping a toggle sends the mutation and optimistically updates the UI**
When a staff member taps a product toggle on the Product Availability screen, the toggle state changes immediately in the UI (optimistic update), the PATCH request is sent, and on success the toggle remains in the new state. On failure, the toggle reverts and an error message appears.

- `proven by:` Agent-Probe scenario — developer taps a toggle, observes the immediate UI flip, and (for the error path) simulates a server error by stopping the local server; verifies the toggle reverts.
- `strategy:` Agent-Probe (mobile interaction — no RN runner; Known-Gap).

**AC-11 — Mobile: Branch Pickup Settings screen shows current pickup status and prep time**
The Branch Pickup Settings screen shows the branch's current `isAcceptingPickup` state as a toggle and `estimatedPrepMinutes` as a numeric input. Both values are fetched from the server on mount and reflect the real branch state.

- `proven by:` Agent-Probe scenario — developer opens the Branch Pickup Settings screen; verifies that the displayed values match the branch's actual database state (checked via a direct DB query or by comparing to the staff index screen's branch info).
- `strategy:` Agent-Probe (mobile render — no RN runner; Known-Gap).

**AC-12 — Mobile: Pickup toggle and prep time save persist to the server and take effect**
Tapping the pickup toggle on Branch Pickup Settings sends `PATCH /api/staff/branch { isAcceptingPickup }` and the branch's accepting state updates. Editing the prep time and tapping Save sends `PATCH /api/staff/branch { estimatedPrepMinutes }` and the new value is reflected on the customer side for subsequent order acceptances.

- `proven by:` Agent-Probe scenario — developer toggles pickup off, confirms the branch shows as unavailable on the customer branch list screen; then toggles back on, confirms ordering is restored; also edits prep time, saves, accepts a test order, and confirms the new ETA.
- `strategy:` Agent-Probe (cross-screen, cross-role interaction — no RN runner; Known-Gap).

---

## Out Of Scope

- **Admin cross-branch toggling** — The `TODO(STAFF-ADM)` seam in `assertBranchScope` (from STAFF-001) remains unimplemented. Admins are subject to the same single-branch scope as regular staff. Cross-branch availability management by admins is a future feature.
- **`products.is_active` (global admin flag)** — The `products.is_active` column is a global switch controlled by administrators, not branch staff. Staff can only toggle per-branch availability via `branch_product_availability`. STAFF-004 never reads or writes `products.is_active`.
- **Two-layer mobile branch data reconciliation** — The `BranchProvider`/`useBranch()` hook (`features/branch/hooks/use-branch.ts`) drives the customer-facing branch screens. STAFF-004 does not refactor or reconcile that hook — the staff screens use their own data fetching seam. Aligning the two layers is a separate concern.
- **RN automated test runner** — No Detox, Maestro, or jest-expo setup is in scope. Mobile screen behavior is Agent-Probe only, consistent with STAFF-001 through STAFF-003 (see backlog note `staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`).
- **Push notifications on availability change** — When a product is toggled or pickup is paused, no push is sent to customers. The `notifyCustomer` stub pattern from STAFF-003 is NOT extended to cover availability events in this plan — that belongs to PUSH-002.
- **STAR-001 star crediting** — Not touched by STAFF-004.
- **Real-time customer notification of availability change** — No WebSocket or SSE. The customer menu re-fetches on next navigation; there is no live push to already-open sessions.
- **Batch availability updates** — Staff cannot select multiple products and toggle them all at once. Each product is toggled individually.
- **Image or description editing** — Product detail editing (name, price, image, description) is an admin function and not in scope for staff.
- **`etaMinutes` validation below 1 or above 120** — The valid range for `estimatedPrepMinutes` is 1–120. Values outside that range return 422. The specific UX for out-of-range input (inline validation vs. server error) is an implementation detail left to PLAN.

---

## Constraints

1. **No new migration needed** — `branch_product_availability` and `branches.is_accepting_pickup` / `branches.estimated_prep_minutes` all exist in migration `0000`. STAFF-004 adds no schema changes.

2. **Absent row = available** — A missing row in `branch_product_availability` for a (branch, product) pair means the product IS available at that branch. This is the intentional default. Toggle-off must INSERT with `is_available = false`. Toggle-on must UPSERT `is_available = true`. The GET endpoint uses a LEFT JOIN; absent rows are surfaced as `isAvailable: true` in the API response.

3. **Branch scope is always session-derived** — `resolveBranchScope(db, userId)` from `packages/api/src/lib/require-staff.ts` is the only source of branch scope for all three new endpoints. No client-supplied `branchId` is accepted in any request body.

4. **All three endpoints inherit `requireStaff(auth)` automatically** — The middleware is applied at router level in `packages/api/src/index.ts`. New endpoints added to `packages/api/src/routes/staff.ts` inherit it without any extra decoration.

5. **`estimatedPrepMinutes` valid range: 1–120** — Input outside this range must be rejected with 422 before any DB write. Validation lives at the server (zod schema on the request body).

6. **Customer enforcement is already live** — `GET /branches/:branchId/menu` already filters by `branch_product_availability.is_available = true` (INNER JOIN for present rows); `POST /orders` already blocks on `!branch.is_accepting_pickup`. STAFF-004 adds the staff write path; the customer read enforcement requires no changes.

7. **React-query mutation pattern** — Mobile writes use `useMutation` from `@tanstack/react-query`. On success: invalidate relevant query keys so the product list and branch settings re-fetch. Cache invalidation scope: `['staff','products']` for product toggles; `['staff','branch']` for branch settings changes.

8. **`@jojopotato/ui` components only** — All UI uses shared components (`Button`, `Card`, `Badge`, etc. from `packages/ui`). No one-off inline markup. Toggle switches must use a shared or standard RN control — not a custom one-off.

9. **Integration tests must be hermetic and self-seeding** — Same pattern as STAFF-002 and STAFF-003: all fixture rows (`users`, `branches`, `products`, `branch_product_availability`) created in `beforeAll`, torn down in `afterAll`, port-0 Express instance.

10. **High-risk trust boundary** — Staff writes directly affect what customers can see and order. This is the same `mustStopBeforeFinalize` risk class as STAFF-003. A human review of the risk evidence pack is required before production deployment.

11. **`(staff)/_layout.tsx` and staff index must be updated** — `product-availability` and `branch-pickup-settings` Stack.Screens must be registered. The matching navigation cards on `(staff)/index.tsx` (currently `navigateTo: null`) must be wired to the real routes.

12. **New `StaffProduct` type belongs in `packages/types/src/staff.ts`** — The list-products response shape is a new domain type. It should go alongside `StaffMe`, `StaffRole`, and `StaffBranch` in the established staff types file. Do not define it locally in the API route or the mobile feature folder.

---

## Data Model Decisions

These decisions are locked and must be reflected in PLAN without re-opening them.

**Absence-of-row semantics (branch_product_availability)**
A product with no row in `branch_product_availability` for a given branch is treated as **available**. This is the intended default — new products added globally appear on all branches without requiring a staff action. Only explicit opt-outs (staff toggling a product off) create rows with `is_available = false`.

**Toggle-off: INSERT**
When a staff member toggles a product off and no row exists yet, the server must INSERT a new row with `is_available = false` (and set `updated_at = NOW()`).

**Toggle-on: UPSERT**
When a staff member toggles a product on, the server must UPSERT: if a row exists, set `is_available = true` and `updated_at = NOW()`; if no row exists, INSERT with `is_available = true`. (Inserting a row with `is_available = true` is equivalent to the default absent-row state but makes the state explicit.)

**LEFT JOIN for GET /api/staff/products**
The product list endpoint uses a LEFT JOIN from `products` to `branch_product_availability` (filtered to the assigned branch). Rows with no match return `isAvailable: true` in the serialized response.

**Branch settings write target**
`PATCH /api/staff/branch` updates the `branches` table row for the session's assigned branch. Both `is_accepting_pickup` and `estimated_prep_minutes` can be updated in a single PATCH call. Either field is optional in the request body — omitting a field leaves it unchanged.

---

## Open Questions

None — all intent is resolved based on the locked research findings.

1. **Default availability for absent rows:** resolved — absent row = available (LEFT JOIN, `isAvailable: true`). See Data Model Decisions above.
2. **`estimatedPrepMinutes` in scope:** resolved — yes, editable on Branch Pickup Settings screen.
3. **Both screens in scope:** resolved — Product Availability + Branch Pickup Settings are both STAFF-004.
4. **Admin cross-branch:** resolved — out of scope (STAFF-ADM, deferred). See Out Of Scope.
5. **Propagation to customers:** resolved — customer enforcement is already live; no changes needed on read path. React-query `staleTime` is sufficient for mobile cache management.

---

## Background / Research Findings

Key facts from the RESEARCH phase that shaped these requirements.

**DB schema — no migration needed**
`branch_product_availability` exists in migration `0000`: columns `id` (uuid pk), `branch_id` (FK→branches), `product_id` (FK→products), `is_available` (boolean default true not null), `updated_at`. Unique index on `(branch_id, product_id)`. The `branches` table already has `is_accepting_pickup` (boolean default true not null) and `estimated_prep_minutes` (integer default 15 not null). No new columns or tables needed.

**Customer enforcement already live**
`GET /branches/:branchId/menu` already INNER JOINs `branch_product_availability` on `is_available = true` — products with no row appear because the join excludes them from the filter (they are not explicitly unavailable). `POST /orders` at `orders.ts:81-83` blocks if `!branch.is_accepting_pickup`; at `orders.ts:88-99/117-119` it rejects items with no availability row. Customer branch screens already use `isAcceptingPickup` to conditionally disable ordering CTAs. STAFF-004 only adds the staff write path.

**Three new endpoints needed**
All inherit `requireStaff(auth)` from the router-level middleware in `index.ts`:
- `GET /api/staff/products` — list all active products with per-branch availability.
- `PATCH /api/staff/products/:productId/availability` — upsert availability for (assignedBranch, productId). Body: `{ isAvailable: boolean }`.
- `PATCH /api/staff/branch` — update `is_accepting_pickup` and/or `estimated_prep_minutes` for the assigned branch. Body: `{ isAcceptingPickup?: boolean, estimatedPrepMinutes?: number }`.

**Mobile gaps**
Two new screens need to be created and wired: `apps/mobile/src/app/(staff)/product-availability.tsx` and `apps/mobile/src/app/(staff)/branch-pickup-settings.tsx`. Both navigation cards on `(staff)/index.tsx` are currently inert (`navigateTo: null`). Hooks needed: `use-staff-products.ts` (useQuery), `use-toggle-product-availability.ts` (useMutation), `use-staff-branch-settings.ts` (useQuery), `use-patch-branch-settings.ts` (useMutation). API client wrappers: `fetchStaffProducts()`, `toggleStaffProductAvailability()`, `patchStaffBranchSettings()` in `features/staff/lib/staff-api.ts`.

**New type: StaffProduct**
A `StaffProduct` type (product id, name, category, price in cents, isAvailable) must be added to `packages/types/src/staff.ts` for the list-products API response shape.

**Risk class**
This feature writes to data that directly controls customer-visible ordering. The same `mustStopBeforeFinalize: true` risk class applies as STAFF-003 — a human review of the risk evidence pack is required before production deployment.

**Test infrastructure**
`packages/api` uses vitest + supertest with hermetic self-seeding integration tests (84 tests total as of STAFF-003, all green). STAFF-004 API tests follow the same pattern as `staff-order-status.integration.test.ts`. Mobile surfaces are Agent-Probe only — no RN component/E2E runner exists (project-wide gap, backlog note `staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`).

**Admin bypass (STAFF-ADM)**
The `TODO(STAFF-ADM)` comment in `assertBranchScope` (added by STAFF-001) marks where admin cross-branch logic will eventually go. STAFF-004 does not implement this — all staff, including admins, are bound to their assigned branch for availability toggles and branch settings.
