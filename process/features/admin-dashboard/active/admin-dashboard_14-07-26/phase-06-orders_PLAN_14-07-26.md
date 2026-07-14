---
name: plan:admin-phase-06-orders
description: "Phase 6 (ADM-006, #44) — read-only admin orders view: filterable order list + detail, requireAdmin-gated, no status mutation"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 6
---

# Phase 6 — Orders View (ADM-006, #44)

**Date:** 14-07-26
Date: 14-07-26
**Complexity:** COMPLEX (part of an 8-phase program; individually SIMPLE-to-MODERATE scope)
Complexity: COMPLEX
**Status:** ⏳ PLANNED
Status: PLANNED

## Phase Completion Rules

Code-only completion is CODE DONE, not VERIFIED. This phase is only ✅ VERIFIED once its own
validate-contract gates are green (fully-automated + hybrid tiers, agent-probe judgments recorded)
AND the regression checkpoint against P1/P2 passes — per the umbrella's "What verified means"
definition. Explicit user confirmation is required before this phase's status is marked
VERIFIED (⏳ PLANNED → 🔨 CODE DONE → 🧪 TESTING → ✅ VERIFIED, confirmed by the user/orchestrator,
not self-declared by execute-agent).

---

## Overview

Give `admin`/`super_admin` users a **read-only** view into orders across all branches — filterable
by branch, status, and date range, plus an order detail read. This is oversight only: no order
status transitions, no order mutation of any kind, live in this program (staff-side status
transitions on the mobile `(staff)` shell are a separate, already-deferred surface — see the
umbrella's Global Constraints and Phase Map risk column for P6).

The new surface reuses the EXISTING order data model and serialization exactly as built by the
customer-facing ordering flow (`packages/api/src/routes/orders.ts`, `packages/api/src/db/schema/
{orders,order_items}.ts`, `packages/api/src/routes/lib/serializers.ts`). Phase 6 adds a parallel,
admin-scoped READ router — it does not touch `ordersRouter` (`orders.ts`) at all, and it does not
add any write path.

Depends on: P1 (Auth/RBAC — `requireAdmin`, `/api/admin` mount, apps/admin auth/query-client
plumbing) and P2 (Branches CRUD — branch list needed to populate the branch filter dropdown). Both
are assumed complete (✅ VERIFIED) before this phase's EXECUTE step begins; this phase plan's own
RESEARCH step must re-confirm that assumption against the umbrella's `## Current Execution State`
before proceeding.

---

## Cross-Cutting Compliance

1. **Modularity** — new route file `packages/api/src/routes/admin/orders.ts`, mounted as one
   sub-router/route-group inside the shared `adminRouter` (established in P1) behind
   `requireAdmin(auth)` at the router-mount level — the guard is inherited, never re-checked
   per-handler. App side: one feature folder, `apps/admin/src/features/orders/` (list screen +
   detail screen + hooks), following the same file/hook shape P2 (branches) established. Reuses the
   shared serializer money-conversion helpers (`numericToCents`, `serializers.ts:105-107`) and the
   existing `serializeOrder`/`ApiOrder` shape (`serializers.ts:188-203`) directly — no duplicate
   serialization logic for orders.
2. **Clarity** — Zod `safeParse` for query-param validation (branch/status/date filters), same
   pattern as `createOrderSchema` in `orders.ts:24-36`. Response envelope: `{ orders: [...],
   nextCursor }` for the list (mirrors the existing cursor-pagination shape at `orders.ts:255`) and
   `{ order: {...} }` for detail (mirrors `orders.ts:279`). Errors follow the existing `OrderError`-
   style typed-error pattern (`orders.ts:39-47`) or the shared `AdminApiError` if P1/P2 already
   established one — confirm during RESEARCH which exists and reuse it, do not create a second error
   class for this phase.
3. **Safety** — this phase is **inherently low-risk**: it is READ-ONLY. No route in this phase
   accepts a body that mutates `orders`, `order_items`, or any other table. No soft-delete, no
   status-transition endpoint, no PATCH/PUT/DELETE verb anywhere in `admin/orders.ts`. The only
   "destructive" concern is data exposure (PII), addressed explicitly below — there is no
   irreversible-action concern for this phase.
4. **Security** — `/api/admin/orders*` inherits `requireAdmin` from the P1 router mount; this phase
   adds no new auth logic of its own, only route handlers. All query params are Zod-validated
   server-side (branch/status/date are never trusted un-validated, even though this is a read path —
   malformed filters must 400, not silently ignore or crash).

5. **UI component modularity & reusability** — read-only, so `features/orders/` reuses the P2
   `data-table`, `page-header`, and `query-states` composites plus shared filter controls (branch/
   status/date) built on shadcn `Select`/date primitives; NO new mutation composites (`form-dialog`/
   `confirm-dialog` are not used here — there are no writes). If the filter-bar is reused by analytics
   (P7) it gets promoted to `components/` under the second-consumer rule. Token-driven styling only.

### PII / Customer-Data Exposure Design Note (REQUIRED)

PRD §19 (`docs/jojo-potato-mobile-prd.md:1680-1707`) draws an explicit distinction:

- **Staff** — "Cannot: ... View sensitive customer data beyond order needs" (line 1694). Staff is
  branch-scoped and order-operational only.
- **Admin** — "Can: ... View customers ... View orders ..." (lines 1704-1705). Admin has a broader,
  explicitly-granted mandate that includes viewing customer records, not just order-adjacent
  fields.

Because admin's mandate is broader than staff's by design (§19), the admin orders view is
**permitted to expose more customer identity than the staff shell would be** — but "more" still
means "what's needed for order oversight," not an unbounded user-table dump. This phase's admin
orders view exposes exactly:

| Field | Source | Included? | Rationale |
|---|---|---|---|
| Customer full name | `users.name` (`db/schema/users.ts:20`) | YES | Needed to identify who placed the order for pickup verification/support — directly "order needs," and admin's §19 mandate explicitly includes "View customers." |
| Customer phone number | `users.phoneNumber` (`db/schema/users.ts:23`) | YES | Needed for pickup contact/dispute resolution — same "order needs" rationale; also directly enables admin's §19 "View customers" mandate for support workflows. |
| Customer email | `users.email` (`db/schema/users.ts:21`) | NO (this phase) | Not required for order-oversight or pickup contact; email is account/login-adjacent, not order-operational. Deferred to the explicitly out-of-scope Tier 3 "Customers module" (ADM-008 candidate, umbrella charter) where a dedicated customer-record view can make a considered call on email exposure with its own design note. |
| Password/session/auth internals | `users` (better-auth managed columns) | NO | Never exposed by any admin route — auth internals are never part of an "order needs" or "view customers" read. |
| Order + item snapshot data (product name, unit price, options, status, timestamps) | `orders`/`order_items` | YES | This is the core of "View orders" — no restriction beyond the existing `ApiOrder`/`ApiOrderItem` shape already serialized for the customer-facing order-history endpoint. |

This table is the one-time design decision for Phase 6's PII boundary — EXECUTE must implement
exactly this field set (name + phone, not email) and must NOT expand it ad hoc. If a later phase or
the deferred Customers module (ADM-008) needs broader customer data, that is a new, explicitly
reviewed decision, not an extension of this table.

---

## Touchpoints

- `packages/api/src/routes/admin/orders.ts` (NEW) — read-only admin orders router: list + detail.
- `packages/api/src/routes/admin/index.ts` or wherever P1 assembles `adminRouter` (READ — mount this
  new sub-router into the existing admin router; exact mount-point file/line to be confirmed during
  this phase's RESEARCH step against whatever P1 actually built).
- `packages/api/src/routes/lib/serializers.ts` (READ-ONLY reuse — `serializeOrder`, `ApiOrder`,
  `numericToCents`; add a new `ApiAdminOrder` type ONLY if the admin list view needs a
  customer-name/phone field the existing `ApiOrder` shape doesn't carry — likely a thin wrapper
  type, not a modified `ApiOrder`).
- `packages/api/src/db/schema/{orders.ts,order_items.ts,users.ts,branches.ts}` (READ-ONLY —
  no migration in this phase).
- `packages/types/src/admin.ts` (extend — add `AdminOrder`/`AdminOrderListItem`-equivalent shared
  types, mirroring the P1-established `packages/types/src/staff.ts` pattern).
- `apps/admin/src/features/orders/` (NEW) — list screen (branch/status/date filters + paginated
  table), detail screen/panel, `hooks/use-admin-orders.ts` + `hooks/use-admin-order.ts` (react-query,
  same client instance established by P0/P1), `lib/admin-orders-api.ts` (fetch wrapper).
- `apps/admin` routing (wherever P0/P1 established the app's route tree) — add an Orders nav entry
  + route(s).

## Public Contracts

- `GET /api/admin/orders` — list orders. Query params (all optional): `branchId` (uuid),
  `status` (one of the 7 `order_status` enum values — `pending | accepted | preparing | flavoring |
  ready | completed | cancelled`), `dateFrom` / `dateTo` (ISO date, filters on `placed_at`), `limit`,
  `cursor` (mirrors the existing customer-history cursor shape at `orders.ts:214-256`). Response:
  `{ orders: AdminOrderListItem[], nextCursor: string | null }`. Requires `requireAdmin`.
- `GET /api/admin/orders/:orderId` — single order detail, full item breakdown + customer name/phone.
  Response: `{ order: AdminOrderDetail }`. 404 if not found. Requires `requireAdmin`. No branch- or
  ownership-scoping beyond admin role (admin sees ALL branches' orders, unlike the mobile staff shell
  which is branch-scoped — confirm this matches the umbrella's intent for admin vs. staff during
  RESEARCH; if a branch-scope-by-default UI filter is wanted for usability, that's a UI-only default,
  not a server-side restriction, since admin's §19 mandate is unrestricted "View orders").
- **Explicitly NOT part of this phase's contract:** no `PATCH`/`PUT`/`POST`/`DELETE` verb anywhere
  under `/api/admin/orders*`. No status-transition endpoint. Confirmed absence of a mutation route is
  itself part of this phase's acceptance criteria (see below).

## Blast Radius

- New files only in `packages/api/src/routes/admin/orders.ts`, `apps/admin/src/features/orders/**`,
  and an additive extension to `packages/types/src/admin.ts`.
- One mount-point edit in the existing admin router assembly file (1 line, adding the new
  sub-router — exact file confirmed during RESEARCH).
- No schema migrations. No changes to `orders.ts` (customer-facing router), `serializers.ts` (only
  additive reads, no modification of existing exports), or any other phase's files.
- Risk class: **low** — read-only, no schema change, no write path, no shared-state race (unlike P2's
  `is_accepting_pickup` concern). The only risk-bearing decision is the PII boundary, which is locked
  above.

---

## Implementation Checklist (Implementation Steps)

**NOTE: this is a HIGH-LEVEL outline only. The EXECUTE-level checklist is finalized at this phase's
inner-loop PLAN-SUPPLEMENT after RESEARCH — kept flexible so earlier phases' (P1 auth, P2 branches)
actual patterns inform the exact steps, rather than guessing file names and mount points now.**

1. RESEARCH: confirm the actual shape P1 built for `adminRouter` mounting and `requireAdmin`; confirm
   P2's `apps/admin/src/features/branches/` file/hook conventions to mirror; confirm whether P1/P2
   already established a shared `AdminApiError` or per-domain error class convention.
2. API: add `packages/api/src/routes/admin/orders.ts` with Zod-validated list + detail handlers,
   reusing `serializeOrder`/`numericToCents` and joining in `users.name`/`users.phoneNumber` for the
   admin-only view (per the PII design note above).
3. API: mount the new sub-router into the existing `adminRouter` behind `requireAdmin` (1-line
   addition at the existing mount-assembly point).
4. Types: extend `packages/types/src/admin.ts` with the admin order list/detail shapes.
5. App: build `apps/admin/src/features/orders/` — filter UI (branch dropdown reusing P2's branch
   list, status dropdown from the 7-value enum, date range picker), paginated list, detail
   view/panel, react-query hooks + API client wrapper.
6. App: wire an Orders nav entry into the existing `apps/admin` shell (from P1/P0).
7. Tests: automated route tests for list filters (branch/status/date), detail read, 403/401 on
   non-admin, and an explicit assertion that no mutating verb is registered on `/api/admin/orders*`.
   Agent-probe pass on the filter UI and PII field display matching the design-note table exactly
   (name + phone shown, email NOT shown).
8. Regression checkpoint against P1 (`requireAdmin` still correctly rejects non-admin) and P2
   (branch list still renders correctly as the filter source) per the phase-program regression
   protocol.

---

## Acceptance Criteria

1. `GET /api/admin/orders?branchId=...&status=...&dateFrom=...&dateTo=...` returns only orders
   matching ALL supplied filters; omitting a filter returns unfiltered-on-that-dimension results;
   response shape matches the documented `{ orders: [...], nextCursor }` envelope. Proven against the
   real serializer/schema at `packages/api/src/routes/orders.ts:214-256` (cursor-pagination pattern
   reused) and `packages/api/src/db/schema/orders.ts:5-13` (7-value status enum).
2. `GET /api/admin/orders/:orderId` returns the full order + item breakdown (same shape family as
   `ApiOrder`/`ApiOrderItem`, `packages/api/src/routes/lib/serializers.ts:85-98,188-203`) plus
   customer name + phone per the PII design note; 404 for a non-existent id.
3. **No mutation endpoint exists**: `packages/api/src/routes/admin/orders.ts` registers ONLY `GET`
   handlers — proven by an automated test that enumerates the router's registered routes/methods (or
   asserts `PATCH`/`PUT`/`POST`/`DELETE` requests to `/api/admin/orders*` return 404/405, never a
   handled response).
4. **Only admin/super_admin can read**: a `customer`- or `staff`-role session gets 403 from both
   `GET /api/admin/orders` and `GET /api/admin/orders/:orderId`; an unauthenticated request gets 401.
   Proven via `requireAdmin` — same test pattern as P1's own `requireAdmin` coverage.
5. **PII exposure matches the documented design note**: the admin order detail/list response
   includes customer `name` and `phoneNumber` and does NOT include customer `email` or any better-
   auth-managed session/credential field. Proven by an automated response-shape assertion (field
   presence/absence check) against the design-note table above.
6. Regression: P1's `requireAdmin` behavior and P2's branch list endpoint are unaffected (narrowest
   representative check per the phase-program regression protocol).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| List orders filtered by branch/status/date | Fully-Automated | AC1 |
| Order detail read (found + 404) | Fully-Automated | AC2 |
| No mutating verb registered on `/api/admin/orders*` | Fully-Automated | AC3 |
| `requireAdmin` rejects customer/staff (403) and unauthenticated (401) | Fully-Automated | AC4 |
| Admin order response field-presence check (name+phone present, email absent) | Fully-Automated | AC5 |
| Filter UI + PII field display matches design note (visual/manual pass) | Agent-Probe | AC5 (UI layer) |
| Regression: P1 requireAdmin + P2 branch list still pass | Hybrid (requires prior phases' live DB fixtures) | AC6 |

Exact test commands and file locations are finalized at this phase's PVL (inner validate-contract),
following `vc-test-coverage-plan`'s context-discovery-first rule (`process/context/tests/
all-tests.md` routing chain) — not invented here ahead of that pass, per the "kept flexible" note
above. Expected runner: `pnpm --filter @jojopotato/api test` (vitest + supertest, same suite family
as the existing `orders.ts`/`require-staff.integration.test.ts` coverage) plus whichever runner P0
scaffolds for `apps/admin`.

## Test Infra Improvement Notes

(none identified yet)

---

## Phase Loop Progress

- [ ] 1. RESEARCH
- [ ] 2. INNOVATE
- [ ] 3. PLAN-SUPPLEMENT
- [ ] 4. PVL (validate-contract)
- [ ] 5. EXECUTE
- [ ] 6. EVL
- [ ] 7. UPDATE-PROCESS

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-06-orders_PLAN_14-07-26.md`
2. **Last completed phase or step:** none — this plan file was just created; Phase Loop Progress is
   entirely unchecked. Depends on P1 and P2 reaching ✅ VERIFIED first (see umbrella `## Phase
   Ordering`).
3. **Validate-contract status:** pending (placeholder below — vc-validate-agent writes it during
   this phase's PVL step, after RESEARCH/INNOVATE/PLAN-SUPPLEMENT).
4. **Supporting context files loaded:** `process/features/admin-dashboard/active/
   admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`, `process/context/
   all-context.md`, `packages/api/src/routes/orders.ts`, `packages/api/src/db/schema/{orders,
   order_items,users}.ts`, `packages/api/src/routes/lib/serializers.ts`, `docs/
   jojo-potato-mobile-prd.md` §19.
5. **Next step for a fresh agent picking up mid-execution:** confirm P1 (Auth/RBAC) and P2 (Branches
   CRUD) are ✅ VERIFIED in the umbrella's `## Current Execution State`; if not, this phase is
   Dependency-BLOCKED and should not start RESEARCH yet. If both are verified, begin this phase's
   RESEARCH step (re-confirm P1's actual `adminRouter`/`requireAdmin` mount shape and P2's actual
   `apps/admin/src/features/branches/` conventions before writing any code).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
