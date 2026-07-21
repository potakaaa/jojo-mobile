---
name: plan:admin-phase-06-orders
description: "Phase 6 (ADM-006, #44) — read-only admin orders view: filterable order list (branch/status/date) + detail with customer identity, requireAdmin-gated, no status mutation"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 6
---

# Phase 6 — Orders View by Branch (ADM-006, #44) — DRAFT for user review

**Date:** 14-07-26 (stub) · fleshed out 17-07-26 as DRAFT pending user review · EXECUTE+EVL+user walkthrough complete 17-07-26
Date: 17-07-26
**Complexity:** COMPLEX (part of the 8-phase program; individually MODERATE scope)
Complexity: COMPLEX
**Status:** ✅ VERIFIED — EXECUTE complete (commit `7bb0918`), EVL independently confirmed green (API 468/468, admin 58/58, both typechecks/build/format clean), user-run Agent-Probe UI walkthrough PASSED 17-07-26
Status: VERIFIED

TL;DR: read-only admin oversight of ALL branches' orders — a new `GET /api/admin/orders` (cursor-paginated, filterable by branch/status/date) + `GET /api/admin/orders/:orderId` (staff-detail shape + customer name/phone + discount context), reusing the staff serializers and the existing admin composites. No write path anywhere.

---

## Open Decisions For Review — ✅ RESOLVED (user, 17-07-26)

| # | Decision | Resolution |
|---|---|---|
| D1 | **Admin status override?** | **✅ LOCKED: NO — read-only MVP.** Status transitions remain a staff action via the STAFF-003 state machine (`PATCH /api/staff/orders/:orderId`). No admin write path anywhere. If oversight later needs intervention (force-cancel etc.), that is a new explicitly-reviewed phase, not a P6 extension. |
| D2 | **Customer PII field set** | **✅ LOCKED: Name + phone only; NO email.** Minimal set for pickup verification / dispute contact. |
| D3 | **List pagination** | **✅ LOCKED: Cursor pagination on `placed_at`** (reuse the customer-history pattern verbatim, `orders.ts:487-527`: `limit` 1–50 default 20, `cursor` = ISO `placed_at`, fetch `limit+1`, `{ orders, nextCursor }`). |
| D4 | **Serializer reuse vs duplicate** | **✅ LOCKED: Compose, don't duplicate.** New `serializeAdminOrderSummary`/`serializeAdminOrderDetail` CALL the existing staff serializers (`serializers.ts:580,610`) and spread admin-only fields on top (`branchId`, `customerName`, `customerPhone`, `discountTotalCents`, `couponId`, `dealId`). Guarantees AC3 by construction. Staff exports unmodified. |
| D5 | **Discount context depth in detail** | **✅ LOCKED: IDs + amount only in MVP.** Expose `discountTotalCents`, `couponId`, `dealId` (raw FKs; `deal_id` → `offers` post-0013). No joined display names this phase. |
| D6 | **Date-range semantics** | **✅ LOCKED: Filter on `placed_at`;** `dateFrom` inclusive start-of-day, `dateTo` inclusive end-of-day (server: `< dateTo + 1 day`). |
| D7 | **List rendering + data freshness** (new — surfaced by RESEARCH + `UI_AUDIT.md`) | **✅ LOCKED: `data-table` composite (existing) + react-query with `staleTime` caching + poll-while-mounted for live status.** "Live updates while the admin is on the page" = react-query `refetchInterval` while the list is mounted (mirror the staff active-orders freshness cadence), NOT websockets/push — no realtime infra exists in this stack and none is added here (fetch-on-focus + polling is the app-wide convention). Caching = the existing ~30s `staleTime` model so navigation doesn't refetch every time. Filters (branch/status/date-range) rendered with **native `<select>` feature-local** (matches the offer-form convention; no new shared `Select` primitive until a second consumer needs it — defers the `UI_AUDIT.md` shared-primitive recommendation). |
| D8 | **Sequencing / branch timing** (new) | **✅ LOCKED: PARKED.** Research done (this pass); do NOT plan-supplement/validate/execute P6 until **Phase 5 is finished AND PR'd into the `development` branch.** Keeps the shared aggregator/serializer/nav edits serialized behind P5. |

---

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
by branch, status, and date range, plus an order detail read showing the same order state staff see
(STAFF-002/003 shape) PLUS which customer placed it. Oversight only: no status transitions, no
mutation of any kind (Open Decision D1).

Reuses the EXISTING order data model and staff serializers exactly as built
(`packages/api/src/routes/staff.ts` STAFF-002/003/005, `packages/api/src/routes/lib/serializers.ts:576-622`,
`packages/api/src/db/schema/{orders,order_items}.ts`). Phase 6 adds a parallel admin-scoped READ
router — it touches neither `ordersRouter` (customer) nor `staffRouter`.

**Dependencies (all satisfied as of 17-07-26):** P1 Auth/RBAC ✅, P2 Branches CRUD ✅ (branch
filter source), P3 ✅, P4a EVL-green, ADM-008 CODE-COMPLETE. Ground-truth deltas newer than the
original stub, folded in below: status enum is **8 values** (incl. `rejected`, STAFF-003); orders
carry `deal_id` (FK → `offers` post-rename 0013) and `coupon_id` (ADM-008); `data-table` and
`form-dialog` ARE now extracted shared composites; `status-badge.tsx` exists; baselines ≈448 API
tests / 58 admin tests.

---

## Cross-Cutting Compliance

1. **Modularity** — new route file `packages/api/src/routes/admin/orders.ts`, appended to the
   existing append-only `adminRouter` aggregator (`routes/admin/index.ts` — 10th confirmed consumer
   after users/branches/products+categories/deals/promotions+offers+coupons); `requireAdmin` +
   `adminCors` are inherited from the top-level `/api/admin` mount, never re-checked per-handler.
   App side: one feature folder `apps/admin/src/features/orders/` (list route + detail route +
   hooks + fetch wrapper), mirroring `features/branches/` conventions. Errors reuse the shared
   `handleAdminError` from `routes/admin/lib/errors.ts` — no new error class.
2. **Clarity** — Zod `safeParse` for all query params (branchId uuid, status enum-8, dateFrom/dateTo
   ISO, limit/cursor). Malformed filters → 400, never silently ignored. Response envelopes:
   `{ orders, nextCursor }` (list) and `{ order }` (detail).
3. **Safety** — inherently low-risk: READ-ONLY. No `POST`/`PATCH`/`PUT`/`DELETE` verb anywhere under
   `/api/admin/orders*`. The only risk-bearing decision is PII exposure (D2, locked below).
4. **Security** — inherits `requireAdmin` (admits `admin`/`super_admin` only — ADM-001); staff and
   customer roles are rejected 403 server-side, unauthenticated 401 (issue #44 AC4).
5. **UI composites** — reuse `data-table`, `page-header`, `query-states`, `status-badge` (all exist
   in `apps/admin/src/components/`); NO `form-dialog`/`confirm-dialog` (no writes). Filter bar
   (branch select + status select + date range) is feature-local this phase; promoted to
   `components/` only if P7 analytics becomes a second consumer (umbrella second-consumer rule).
   TanStack Start list→detail screens MUST use the layout+index `<Outlet/>` split
   (`orders.tsx` thin layout + `orders.index.tsx` list + `orders.$orderId.tsx` detail) — the P3
   nested-detail-route gotcha.

### PII / Customer-Data Exposure Design Note (REQUIRED — Open Decision D2)

PRD §19: staff "cannot view sensitive customer data beyond order needs"; admin "can view customers
… view orders" — a broader, explicitly-granted mandate. "Broader" still means order-oversight
minimal, not a user-table dump. The admin orders view exposes exactly:

| Field | Source | Included? | Rationale |
|---|---|---|---|
| Customer full name | `users.name` | YES | Identifies who placed the order for pickup verification/support. |
| Customer phone | `users.phoneNumber` | YES | Pickup contact / dispute resolution. |
| Customer email | `users.email` | NO (this phase) | Account/login-adjacent, not order-operational. Deferred to a future Customers module with its own design note. |
| Auth internals (password/session/tokens) | better-auth columns | NO — never | Never part of an order read. |
| Order + item snapshot data | `orders`/`order_items` | YES | The core of "view orders" — same `StaffOrderDetail` snapshot shape staff already see. |
| Discount context | `orders.discount_total`, `orders.coupon_id`, `orders.deal_id` | YES (IDs + cents only, D5) | Oversight of applied promos; no cross-domain name joins this phase. |

EXECUTE implements exactly this field set and must NOT expand it ad hoc.

---

## Touchpoints

- `packages/api/src/routes/admin/orders.ts` (NEW) — read-only list + detail handlers.
- `packages/api/src/routes/admin/index.ts` (EDIT, ~2 lines) — append `adminOrdersRouter` to the
  aggregator (append-only pattern).
- `packages/api/src/routes/lib/serializers.ts` (ADDITIVE) — `AdminOrderSummary`/`AdminOrderDetail`
  local interfaces + `serializeAdminOrderSummary`/`serializeAdminOrderDetail` composing the existing
  staff serializers (D4). No existing export modified.
- `packages/types/src/admin.ts` (ADDITIVE) — shared `AdminOrderSummary`/`AdminOrderDetail` types
  ONLY if a second consumer outside `packages/api` needs them; default is serializer-local
  declarations per the established `AdminBranch` convention (P2). Likely the fetch wrapper types
  them app-locally like branches does — confirm at inner-loop RESEARCH.
- `packages/api/src/db/schema/{orders,order_items,users,branches}.ts` (READ-ONLY — no migration).
- `packages/api/src/routes/admin/__tests__/admin-orders.integration.test.ts` (NEW) — supertest
  suite reusing the `makeUser(role)` self-seeding fixture.
- `apps/admin/src/features/orders/` (NEW) — `lib/admin-orders-api.ts` (fetch wrapper,
  `credentials:'include'`), `hooks/use-admin-orders.ts` (list, filter-keyed query keys) +
  `hooks/use-admin-order.ts` (detail).
- `apps/admin/src/routes/(dashboard)/orders.tsx` + `orders.index.tsx` + `orders.$orderId.tsx`
  (NEW) — layout+index split.
- `apps/admin/src/config/nav-config.ts` (EDIT, 1 object) — enable an Orders nav entry under
  Management (currently absent/disabled).

## Public Contracts

- `GET /api/admin/orders` — query params (all optional): `branchId` (uuid), `status` (one of the
  **8** `order_status` values: `pending | accepted | preparing | flavoring | ready | completed |
  cancelled | rejected`), `dateFrom`/`dateTo` (ISO date, `placed_at`, D6 semantics), `limit`
  (1–50, default 20), `cursor` (ISO `placed_at`, D3). Filters compose with AND. Response:
  `{ orders: AdminOrderSummary[], nextCursor: string | null }`, newest-first. Requires
  `requireAdmin`. Admin sees ALL branches (no server-side branch scoping — `branchId` is a filter,
  not a restriction; PRD §19 admin mandate is unrestricted "view orders").
- `GET /api/admin/orders/:orderId` — `{ order: AdminOrderDetail }`: everything in
  `StaffOrderDetail` (id, orderNumber, status, placedAt, estimatedReadyAt, totalCents, items with
  option snapshots) PLUS `branchId`, `branchName`, `customerName`, `customerPhone`,
  `discountTotalCents`, `couponId`, `dealId`. 404 if not found. Requires `requireAdmin`.
- **Explicitly NOT in contract:** no mutating verb anywhere under `/api/admin/orders*`; no
  status-transition endpoint (D1). Absence of mutation routes is itself an acceptance criterion.
- Wire-freeze: `GET /api/staff/orders*` and customer `GET /orders*` are untouched.

## Blast Radius

- New files: `packages/api/src/routes/admin/orders.ts`, its test file,
  `apps/admin/src/features/orders/**`, 3 admin route files. Additive edits: `serializers.ts`,
  `routes/admin/index.ts`, `nav-config.ts`, possibly `packages/types/src/admin.ts`. ~8–11 files,
  2 packages (`packages/api`, `apps/admin`).
- No schema migration. No changes to `orders.ts` (customer), `staff.ts`, or any prior phase's
  routes. Staff serializers read-only reused via composition.
- Risk class: **low** — read-only, no write path, no shared-state race. Only risk decision is the
  PII boundary (D2, locked above). Note: touches the auth-guarded surface (AC4 role tests are the
  hybrid-minimum gate for that class).

---

## Implementation Checklist

1. **API — serializers (additive):** in `packages/api/src/routes/lib/serializers.ts`, add
   `AdminOrderSummary`/`AdminOrderDetail` interfaces and `serializeAdminOrderSummary(order, items,
   customer, branch)` / `serializeAdminOrderDetail(...)` that call `serializeStaffOrderSummary` /
   `serializeStaffOrderDetail` and spread `{ branchId, branchName, customerName, customerPhone,
   discountTotalCents: numericToCents(order.discount_total), couponId, dealId }`. Do not modify
   existing exports.
2. **API — router:** create `packages/api/src/routes/admin/orders.ts`:
   - Zod query schema (branchId uuid, status `z.enum` of the 8 values, dateFrom/dateTo ISO date,
     limit coerced+clamped, cursor ISO datetime); `safeParse` → 400 with flattened errors on failure
     (existing admin convention).
   - List handler: build `and(...)` conditions on `orders.branch_id`, `orders.status`,
     `gte(placed_at, dateFrom)`, `lt(placed_at, dateTo + 1d)`, cursor `lt(placed_at, cursor)`;
     `orderBy(desc(placed_at))`, `limit(limit + 1)`; batch-load items via
     `inArray(order_items.order_id, ids)` + Map grouping (mirror `orders.ts:511-521`); LEFT JOIN or
     batch-load `users` (name, phoneNumber) and `branches` (name); respond `{ orders, nextCursor }`.
   - Detail handler: fetch order by id (404 if missing), items, customer row, branch row; respond
     `{ order: serializeAdminOrderDetail(...) }`.
   - GET handlers only; reuse `handleAdminError`.
3. **API — mount:** append `adminRouter.use('/orders', adminOrdersRouter)` in
   `routes/admin/index.ts` (append-only aggregator; guard inherited).
4. **API — tests:** `admin-orders.integration.test.ts` (supertest, `makeUser(role)` self-seeding,
   hermetic): AC1 branch filter, AC2 status filter incl. `rejected` cross-branch, date-range
   boundaries (D6), filter composition, pagination (limit+1/nextCursor round-trip), detail parity
   vs `GET /api/staff/orders/:orderId` for the same seeded order (field-by-field on the shared
   subset — AC3), PII field presence/absence (name+phone present, email + auth fields absent —
   D2), 403 for customer/staff, 401 unauthenticated (AC4, ADM-001 pattern), 404 unknown id, 400
   malformed filters, and mutation-absence probe (`POST/PATCH/PUT/DELETE /api/admin/orders*` →
   404, never handled).
5. **App — data layer:** `features/orders/lib/admin-orders-api.ts` (fetch wrapper, query-string
   builder, `credentials:'include'`); `hooks/use-admin-orders.ts` (react-query, query key
   `['admin','orders', filters, cursor]`) + `hooks/use-admin-order.ts` (`['admin','order', id]`).
6. **App — list screen:** `(dashboard)/orders.tsx` (thin `<Outlet/>` layout) +
   `orders.index.tsx`: filter bar (branch `Select` fed by the existing P2 branches hook, status
   `Select` over the 8 enum values, date-from/date-to inputs), `data-table` of
   orderNumber / branch / customer name / status (`status-badge`) / placedAt / total, "Load more"
   via `nextCursor`, `query-states` for loading/empty/error, `page-header` (no primary action —
   read-only).
7. **App — detail screen:** `orders.$orderId.tsx`: order header (number, status badge,
   placed/ready timestamps), customer block (name + phone only), branch, item table with option
   snapshots and per-line prices, totals block (subtotal derivation, discount cents + couponId/
   dealId when present, total). No action buttons.
8. **App — nav:** enable the Orders `NavItem` in `nav-config.ts` (Management group,
   `to: '/orders'`).
9. **Verification:** typecheck both packages; run the new API suite + full API suite
   (baseline ≈448, 0 regressions) + admin suite (baseline 58); Agent-Probe UI walkthrough
   (filters, pagination, detail, PII display matching D2 exactly).
10. **Regression checkpoint:** P1 `requireAdmin` role matrix + P2 `GET /api/admin/branches` list
    (filter source) narrowest checks per the phase-program regression protocol.

---

## Acceptance Criteria

1. **(issue AC1)** `GET /api/admin/orders?branchId=X` returns only branch X's orders; omitting a
   filter returns unfiltered-on-that-dimension results; filters compose with AND; envelope is
   `{ orders, nextCursor }` with cursor pagination behaving per D3.
2. **(issue AC2)** `?status=cancelled` (and `rejected`) returns matching orders ACROSS branches
   when no `branchId` supplied — all 8 enum values accepted, unknown value → 400.
3. **(issue AC3)** Admin detail matches true order state: for the same seeded order, the admin
   detail's shared fields (status, items, option snapshots, totals, timestamps) are identical to
   the staff `GET /api/staff/orders/:orderId` response — proven by an automated parity test, and
   guaranteed structurally by serializer composition (D4). 404 for unknown id.
4. **(issue AC4)** `customer` and `staff` sessions get 403 from both routes; unauthenticated gets
   401 — same test pattern as ADM-001's `require-admin.integration.test.ts` role matrix.
5. **No mutation endpoint exists:** `POST`/`PATCH`/`PUT`/`DELETE` to `/api/admin/orders` and
   `/api/admin/orders/:id` are never handled (404) — automated probe.
6. **PII boundary:** responses include customer `name` + `phone` and exclude `email` and all
   better-auth credential/session fields — automated field presence/absence assertion against the
   D2 table.
7. **Zero regressions:** full API suite green at baseline (≈448), admin suite green (58); P1/P2
   regression checks pass.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| List filtered by branch (only that branch's orders) | Fully-Automated (`pnpm --filter @jojopotato/api test` — new `admin-orders.integration.test.ts`) | AC1 (proven by: branch-filter test; strategy: Fully-Automated) |
| Status filter across branches, all 8 values, 400 on unknown | Fully-Automated (same suite) | AC2 (proven by: status-filter tests; strategy: Fully-Automated) |
| Date-range boundaries + filter composition + cursor pagination | Fully-Automated (same suite) | AC1/D3/D6 (proven by: pagination + date tests; strategy: Fully-Automated) |
| Admin-vs-staff detail parity on shared fields; 404 unknown id | Fully-Automated (same suite) | AC3 (proven by: parity test; strategy: Fully-Automated) |
| 403 customer/staff, 401 unauthenticated on both routes | Fully-Automated (same suite, ADM-001 pattern) | AC4 (proven by: role-matrix test; strategy: Fully-Automated) |
| Mutation-verb absence probe (POST/PATCH/PUT/DELETE → 404) | Fully-Automated (same suite) | AC5 (proven by: mutation-absence test; strategy: Fully-Automated) |
| PII field presence/absence (name+phone in, email/auth out) | Fully-Automated (same suite) | AC6 (proven by: field-shape test; strategy: Fully-Automated) |
| Full API + admin suites at baseline (≈448 / 58), typechecks | Fully-Automated (`pnpm --filter @jojopotato/api test`, `pnpm --filter @jojopotato/admin test`, typecheck) | AC7 (proven by: regression run; strategy: Fully-Automated) |
| Filter UI, pagination UX, detail render, PII display matches D2 | Agent-Probe (user browser walkthrough — user verifies UI manually per repo convention; checklist provided at EXECUTE) | AC1/AC3/AC6 UI layer (proven by: walkthrough; strategy: Agent-Probe) |
| Regression: P1 requireAdmin matrix + P2 branches list | Hybrid (requires local Postgres up + migrated — `docker compose up -d` + `db:migrate` precondition) | AC7 (proven by: P1/P2 narrow re-runs; strategy: Hybrid) |

No Known-Gap rows: every developed behavior has a proving strategy. The auth-guarded surface (AC4)
meets its hybrid-minimum via the fully-automated integration suite (which itself runs against a
real Postgres — hybrid precondition documented above). The `apps/admin` component-test runner
(vitest+jsdom, baseline 58) MAY gain filter-bar component tests if straightforward; the UI layer's
authoritative gate remains the Agent-Probe walkthrough (project-wide convention).

Exact final commands are locked at this phase's PVL per `vc-test-coverage-plan`'s
context-discovery rule; the commands above are sourced from `process/context/tests/all-tests.md`
(routing chain loaded — no deeper test docs exist yet in this group).

## Test Infra Improvement Notes

- No E2E/browser runner exists for `apps/admin` (project-wide gap, carried from P2 AC7) — the UI
  walkthrough stays Agent-Probe. Not new debt; do not fix in this phase.
- (nothing else identified yet)

---

## Phase Loop Progress

- [x] 1. RESEARCH  (inner-loop re-confirm pass complete, 17-07-26)
- [x] 2. INNOVATE  (decisions D1–D8 locked with user 17-07-26)
- [x] 3. PLAN-SUPPLEMENT  (ground-truth corrections applied 17-07-26)
- [x] 4. PVL (validate-contract)  — Gate: PASS, 17-07-26, generated-by: inner-pvl: phase-6
- [x] 5. EXECUTE  (commit `7bb0918`, 20 new tests, API 468/468, admin 58/58, 17-07-26)
- [x] 6. EVL  (independently re-confirmed green by vc-tester, 17-07-26)
- [x] 7. UPDATE-PROCESS  — archived; context updated; committed

---

## Dependencies, Risks, Integration Notes

- **Depends on:** P1 (requireAdmin + admin aggregator) ✅, P2 (branches list = filter source) ✅.
  Independent of P5 (Rewards CRUD) — can run before or after it.
- **Ordering note:** ADM-008/deals-unification work is on `feat/deals_unification`; this phase's
  serializer edits sit near ADM-008's additions in `serializers.ts` (append-only, low conflict
  risk) — branch off the current integration branch, confirm at RESEARCH.
- **Risk — staff serializer drift:** if a later staff phase changes `StaffOrderDetail`, admin
  detail changes with it (composition). This is intended (AC3 parity) but the parity test will
  surface any surprising field additions.
- **Risk — order volume in tests:** hermetic fixtures must seed orders across ≥2 branches, ≥3
  statuses, and ≥2 dates to make filter tests meaningful; reuse the existing order-seeding helpers
  from `staff-order-status.integration.test.ts` where possible.
- **Rollback:** all-additive; reverting the phase = deleting new files + the 2 aggregator/nav
  lines. No migration to roll back.

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-06-orders_PLAN_14-07-26.md`
2. **Last completed phase or step:** UPDATE-PROCESS complete (17-07-26) — phase is ✅ VERIFIED and committed (`7bb0918`). Nothing further to resume for Phase 6; next work is Phase 7 (Analytics, ADM-007).
3. **Validate-contract status:** written and PASSED (17-07-26, `generated-by: inner-pvl: phase-6`,
   below) — phase is fully executed and VERIFIED, contract is historical record only now.
4. **Supporting context files loaded:** umbrella plan (`admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
   — Current Execution State + §5 composite rules), `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `packages/api/src/routes/{staff.ts,orders.ts}`,
   `packages/api/src/routes/lib/serializers.ts`, `packages/api/src/routes/admin/{index,branches,products,users}.ts`,
   `packages/api/src/db/schema/orders.ts`, `packages/types/src/{staff,admin}.ts`,
   `apps/admin/src/{components,config/nav-config.ts,features}`,
   `packages/api/src/lib/__tests__/require-admin.integration.test.ts`.
5. **Next step:** Phase 6 is complete. A fresh agent should move to Phase 7 (Analytics, ADM-007) —
   see `phase-07-analytics_PLAN_14-07-26.md`, whose D9 unpark condition ("Phase 6 execution") is
   now satisfied. Run Phase 7's inner-loop RESEARCH re-confirm pass next.

---

## Validate Contract

Status: PASS
Date: 17-07-26
date: 2026-07-17
generated-by: inner-pvl: phase-6

Parallel strategy: sequential
Rationale: signal score 4/7 (S2 new admin API contract surface, S4 phase-program, S6 PII/trust-boundary design decision, S6 auth-guarded surface, S7 ~10 files) nominally suggests workflow/agent-team, but strategy-by-fit overrides — this is one bounded, sequentially-dependent slice (server routes then client, no cross-agent coordination need), matching exactly how Phases 2/3/4a/5 were each executed by a single vc-execute-agent. Recommend 1 vc-execute-agent (opus, per Model Selection Policy — EXECUTE is the only opus leg).

D8 unpark independently confirmed via git (not taken on trust): `git merge-base --is-ancestor 772e2fd feat/adm-006-branchview` → yes. Current branch `feat/adm-006-branchview` is rooted at `development`'s PR #112 merge commit (`772e2fd`, Phase 5 Rewards CRUD). The umbrella's `## Current Execution State` still reads "PARKED pending P5 merge" — that is doc-lag for UPDATE PROCESS to correct, not a validation blocker; ground truth via git is unambiguous.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | GET /api/admin/orders branch filter — only that branch's orders; omitted filter = unfiltered on that dimension; filters compose AND | Fully-Automated | `pnpm --filter @jojopotato/api test` — `admin-orders.integration.test.ts` branch-filter case | A |
| AC2 | Status filter cross-branch when no branchId, all 8 order_status enum values accepted, unknown value → 400 | Fully-Automated | same suite — status-filter cases | A |
| AC1/D3/D6 | Date-range boundaries (inclusive start/end-of-day) + filter composition + cursor pagination (limit+1 / nextCursor round-trip) | Fully-Automated | same suite — pagination + date-range cases | A |
| AC3 | Admin detail vs staff `GET /api/staff/orders/:orderId` field-by-field parity on shared fields (status, items, option snapshots, totals, timestamps); 404 unknown id | Fully-Automated | same suite — parity test | A |
| AC4 | customer/staff sessions → 403 on both routes; unauthenticated → 401 (ADM-001 `require-admin.integration.test.ts` role-matrix pattern) | Fully-Automated | same suite — role-matrix test | A |
| AC5 | No mutation endpoint exists — POST/PATCH/PUT/DELETE to `/api/admin/orders` and `/api/admin/orders/:id` never handled (404) | Fully-Automated | same suite — mutation-absence probe | A |
| AC6 | PII boundary — response includes customer `name` + `phone`, excludes `email` and all better-auth credential/session fields, per the D2 table | Fully-Automated | same suite — field presence/absence assertion | A |
| AC7 | Zero regressions — full API suite green at baseline, admin suite green at baseline, both typechecks clean | Fully-Automated | `pnpm --filter @jojopotato/api test` (baseline ≈448 + N new, 0 regressions); `pnpm --filter @jojopotato/admin test` (baseline 58, 0 regressions); `pnpm typecheck` | A |
| AC7 (regression) | P1 `requireAdmin` role matrix + P2 `GET /api/admin/branches` list (filter source) narrow re-runs | Hybrid | `pnpm --filter @jojopotato/api test` subset — `require-admin.integration.test.ts` + `admin-branches.integration.test.ts` — precondition: local Postgres up + migrated (`docker compose up -d` or native `postgresql.service` per `all-tests.md` dev-machine gotcha, then `db:migrate`) | A |
| AC1/AC3/AC6 (UI layer) | Filter UI (branch/status/date-range selects), pagination UX (Load more), detail render, PII display matching D2 exactly | Agent-Probe | user browser walkthrough — checklist provided at EXECUTE handoff (user verifies UI manually per repo convention; no `apps/admin` E2E runner — project-wide gap, not new debt) | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). No Known-Gap rows in this plan — every developed behavior has a proving strategy; none are vacuously green.

Legacy line form (retained so existing validate-contract consumers still parse):
- admin-orders-list: Fully-automated: `pnpm --filter @jojopotato/api test` (branch/status/date/pagination cases) | hybrid: P1/P2 regression re-run (needs local Postgres) | agent-probe: filter bar + data-table UI walkthrough
- admin-orders-detail: Fully-automated: `pnpm --filter @jojopotato/api test` (parity + PII-shape cases) | agent-probe: detail screen render + PII display walkthrough
- admin-orders-security: Fully-automated: `pnpm --filter @jojopotato/api test` (role-matrix + mutation-absence cases)
- admin-orders-regression: Fully-automated: `pnpm --filter @jojopotato/api test` (full suite) + `pnpm --filter @jojopotato/admin test` + `pnpm typecheck`

Dimension findings:
- Infra fit: PASS — append-only aggregator confirmed (9 current mounts in `routes/admin/index.ts`, orders = 10th); no schema migration; no container/infra surface touched.
- Test coverage: PASS — every AC has a Fully-Automated proving test except the UI render layer (Agent-Probe, project-wide convention) and one Hybrid regression re-run (documented Postgres precondition); zero Known-Gap rows.
- Breaking changes: PASS — fully additive (new route file, 1-line aggregator append, additive serializers, 1 new nav object); explicit wire-freeze on `GET /api/staff/orders*` and customer `GET /orders*`, both untouched.
- Security surface: PASS — `requireAdmin` inherited structurally via router mount (not per-handler, cannot be silently skipped); PII boundary explicit via the D2 design-note table and proven by an automated field-shape test (AC6); no new write path, no secrets, no auth-logic change.
- Section A feasibility (API serializers/router/mount): PASS — mechanical feasibility HIGH, every cited file:line verified exact (`serializers.ts:259/580/610`, `orders.ts:487-527`, `orderStatusEnum.enumValues`); 1 non-blocking style note (query-schema shape, see Execute-Agent Instructions E2); highest-risk edit = the N-optional-condition list-query composition (cursor + branch + status + date range), mitigated by full Fully-Automated coverage of that exact scenario.
- Section B feasibility (API tests): PASS — `makeUser(role)` self-seeding fixture confirmed identical in `admin-rewards.integration.test.ts`; no gaps or conflicts found.
- Section C feasibility (App data layer/screens/nav): PASS — Outlet+index precedent confirmed (`deals.$dealId.tsx`/`offers.$offerId.tsx`/`products.$productId.tsx`); 2 non-blocking gaps found (no disabled Orders nav placeholder exists to "enable" — must be created; no existing filtered/paginated fetch-wrapper precedent in `apps/admin` — P6 is first-of-kind), both resolved via Execute-Agent Instructions E1/E3.
- Section D feasibility (Verification/regression): PASS — all gate commands sourced from `process/context/tests/all-tests.md`, verified real and runnable; 1 non-blocking note on the tracked DB-concurrency backlog gap, resolved via Execute-Agent Instruction E4.

Open gaps: none blocking. 4 informational items carried as Execute-Agent Instructions (below) — none require a plan-text edit.

What this coverage does NOT prove:
- Real-world query performance / index usage under production order volume (only hermetic small fixture data is exercised by the integration suite).
- Concurrent-admin-sessions polling load characteristics (react-query `refetchInterval` while multiple admins view the list simultaneously) — not exercised.
- Exhaustive visual/responsive rendering across browsers or viewport sizes — the Agent-Probe walkthrough is a single-pass manual check, not a device/browser matrix.
- Future drift between `packages/api`'s composed serializers and a later `packages/types/src/admin.ts` type extension — composition guarantees today's parity (AC3), not protection against a future staff-serializer change going unnoticed (already flagged as a named Risk in the plan's own Dependencies/Risks section — the parity test will catch it when it happens, not before).
- Load/stress of cursor pagination beyond the hermetic fixture's small seeded order set.

Execute-Agent Instructions:
- E1: Checklist step 8 ("enable the Orders NavItem") — no disabled `orders` placeholder currently exists in `nav-config.ts` (confirmed: only `dashboard/branches/categories/products/deals/promotions/offers/rewards/users(disabled)` are present). CREATE a new `NavItem` object under the Management group (`id: 'orders'`, an appropriate lucide icon e.g. `ClipboardList`, `to: '/orders'`) — do not search for an existing disabled entry to flip. Same class of deviation as Phase 5's rewards nav entry (E4 in that phase's contract).
- E2: Checklist step 2's Zod query-param validation may use either a single combined `z.object({...}).safeParse(req.query)` schema OR the existing admin per-field convention (`uuidSchema.safeParse(individualValue)` per param, as seen in `products.ts`/`offers.ts`/`deals.ts`/`coupons.ts`). Either is acceptable — pick one deliberately and stay consistent within the new route file; document the choice in the phase report if it diverges from the majority convention.
- E3: There is no existing filtered + cursor-paginated list fetch-wrapper precedent anywhere in `apps/admin` today (branches/categories/products/deals/offers/promotions/rewards are all unfiltered full-list GETs). This is genuinely new ground for this app — build the query-string builder and the `['admin','orders', filters, cursor]` query-key shape carefully; there is no exact copy-paste source in `apps/admin`, though the customer-mobile cursor-pagination consumer (`order/history.tsx` + its hook) is a reasonable conceptual reference for the cursor-consumption pattern (different runtime, not directly portable).
- E4: `packages/api`'s vitest global-setup drops/recreates a fixed-name test database with no concurrency guard (tracked: `process/features/admin-dashboard/backlog/api-test-db-concurrency-guard_NOTE_17-07-26.md`). Run the `pnpm --filter @jojopotato/api test` gate serially — do not run it concurrently with another local dev/CI test run against the same machine, or gate evidence may be corrupted by a collision (not caused by this plan, but this plan's new integration suite is exposed to the same pre-existing risk).

Backlog Artifacts: none new — the one relevant pre-existing backlog note (`api-test-db-concurrency-guard_NOTE_17-07-26.md`) is referenced above, not duplicated.

Gate: PASS (no FAILs, 4 informational execute-agent instructions recorded, no plan-text edit required)

**Post-EXECUTE / EVL note (17-07-26):** phase executed on commit `7bb0918`. EVL independently
re-ran the full gate set — API 468/468 (448 baseline + 20 new), admin 58/58, both
typechecks/build clean, `pnpm format:check` clean — and confirmed no drift from this contract.
The AC1/AC3/AC6 Agent-Probe UI-layer row was performed and PASSED by the user this session. See
`phase-06-orders_REPORT_17-07-26.md` for the full closeout packet.
