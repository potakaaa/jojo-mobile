---
name: plan:admin-phase-04-deals
description: "Admin Dashboard Phase 4 — Deals CRUD (deals + deal_products + deal_branches junctions), ADM-004 #42"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 4
---

# Phase 4 — Deals CRUD (ADM-004, #42)

**Date**: 14-07-26
**Complexity**: COMPLEX (phase-program phase)
**Status**: ⏳ PLANNED

Depends on: Phase 2 (Branches CRUD), Phase 3 (Products/Categories CRUD) — deals reference both
products (via `deal_products`) and branches (via `deal_branches`); requires the shared
`requireAdmin` middleware + `/api/admin` mount from Phase 1.

---

## Overview

Build CRUD for the `deals` table (`packages/api/src/db/schema/deals.ts:22-42`) and its two
junction tables, `deal_products` (`packages/api/src/db/schema/deal_products.ts:5-17`) and
`deal_branches` (`packages/api/src/db/schema/deal_branches.ts:5-17`), which determine which
products and branches a deal applies to. This is PRD §9.7-9.9
(`docs/jojo-potato-mobile-prd.md:928-981`).

Schema facts (from source, not assumption):
- `deals.deal_type` is a Postgres enum (`dealTypeEnum`, `deals.ts:13-20`) with EXACTLY 6 values:
  `percentage_discount | fixed_discount | buy_one_take_one | free_item | free_upgrade | bundle`.
- `deals.start_at` / `deals.end_at` are both `timestamp(...).notNull()` (`deals.ts:35-36`) — no DB
  constraint enforces `end_at > start_at`. This must be enforced app-side.
- `deals.is_active` is `boolean().default(true).notNull()` (`deals.ts:39`) — soft-delete/deactivate
  target, per the umbrella's Global Constraint (prefer `is_active` over hard-delete).
- `deal_products` and `deal_branches` are pure many-to-many join tables (`id`, `deal_id`, FK'd
  column) each with a `uniqueIndex` on the pair (`deal_products.ts:16`, `deal_branches.ts:16`) —
  DB itself rejects duplicate attach rows; the route layer should surface that as a clean 409/400,
  not a raw Postgres constraint-violation error.
- `coupons` (`packages/api/src/db/schema/coupons.ts:9-25`) has a nullable `deal_id` FK
  (`coupons.ts:16`, no `onDelete` cascade specified — Drizzle default is `NO ACTION`) and a
  `status` enum (`available | used | expired`, `coupons.ts:7`). **No cascade behavior is defined
  anywhere in the schema or PRD for what happens to `available` coupons when their deal is
  deactivated or deleted.** This is the OPEN QUESTION this phase must carry (see below) — do NOT
  silently pick a default.

---

## OPEN QUESTION — Coupon Cascade on Deal Deactivation (flag, do not silently decide)

When a deal with outstanding `coupons` rows (`status = 'available'`, `deal_id` pointing at this
deal) is deactivated (`is_active -> false`) or deleted, what should happen to those coupons? No
cascade behavior exists in the DB (no `onDelete`) or PRD. Three resolution options, to be
presented to the user during this phase's INNOVATE step for sign-off — **do not bake a default
into the acceptance criteria below**:

1. **Leave outstanding coupons valid until their own `expires_at`** — deactivating the deal only
   stops NEW coupon issuance/redemption eligibility going forward; existing `available` coupons
   still honor their original terms until they naturally expire. Simplest, most customer-friendly,
   but means a "dead" deal can still be redeemed via old coupons.
2. **Bulk-expire outstanding coupons** — on deactivation, run an update setting
   `status = 'expired'` for all `available` coupons referencing this `deal_id`. Cleanest
   invariant (no redemption after deactivation) but is itself a bulk historical-data mutation that
   needs its own safety review (is this "historical" data the same class of thing the umbrella's
   hard invariants protect, or is it operational state that's fine to mutate forward-only? — needs
   explicit sign-off, since coupon `status` transitions are otherwise only ever user-redemption-
   driven, not admin-driven).
3. **Block deactivation while coupons are outstanding** — reject the deactivate/delete request
   (400) until an admin explicitly resolves outstanding coupons first (e.g. via a forced bulk-expire
   confirmation step). Safest but adds UX friction and requires a preview/count endpoint
   (`GET .../deals/:id/outstanding-coupons-count` or similar) not otherwise in scope.

**This phase's INNOVATE step must present these 3 options, capture the user's choice in the
Decision Summary, and only then does this PLAN get supplemented with the concrete acceptance
criterion for the chosen behavior** (PLAN-SUPPLEMENT step). Until resolved: deal deactivation MUST
NOT be gated on a v1 assumption — implement bare `is_active` toggle first, defer the coupon-cascade
behavior to the resolved option once decided, and do not let EXECUTE start on this route until the
decision is locked.

---

## Cross-Cutting Compliance

1. **Modularity** — one new route file `packages/api/src/routes/admin/deals.ts`, mounted under the
   shared `adminRouter` (built in Phase 1) behind `requireAdmin`. One new app feature folder
   `apps/admin/src/features/deals/**`. Reuses the shared `AdminApiError` typed-error class, shared
   Zod validation helpers, and `numericToCents`/`centsToNumeric` serializer helpers
   (`packages/api/src/routes/lib/serializers.ts:105-107`) established in earlier phases — no
   per-domain reimplementation.
2. **Clarity** — Zod `safeParse` request validation mirroring `orders.ts:24-33`; response envelope
   `{ resource: deal }` / `{ resources: [deals] }` matching the existing `branches.ts`/`orders.ts`
   shape family; typed errors mirroring `OrderError` (`orders.ts:39-47`); serializer helpers in
   `routes/lib/serializers.ts`-style files, not inlined in handlers; kebab-case files, camelCase
   functions, PascalCase components.
3. **Safety** — deactivate via `is_active` toggle (soft-delete), never hard-`DELETE` a deal with
   any historical `deal_products`/`deal_branches`/`coupons` references. The coupon-cascade OPEN
   QUESTION above is this phase's primary Safety flag — do not resolve it silently.
4. **Security** — `/api/admin/deals/*` inherits `requireAdmin` at the router-mount level (no
   per-handler re-check); all inputs (including `deal_type` enum membership, numeric ranges,
   date ordering) are validated server-side with Zod, never trusting client-side validation alone.

5. **UI component modularity & reusability** — `features/deals/` reuses the P2 composites; no
   re-implementation. Deal-specific UI is limited to the genuinely new pieces: the `deal_type` select,
   the date-range inputs, and the product/branch multi-select association editors. If a multi-select
   association editor is needed again by another domain, promote it to `components/` (second-consumer
   rule). Token-driven styling only.

---

## Touchpoints

- `packages/api/src/routes/admin/deals.ts` (new) — CRUD routes for deals + attach/detach
  products/branches
- `packages/api/src/routes/admin/index.ts` or equivalent adminRouter aggregator (from Phase 1) —
  mount `deals.ts` sub-router
- `packages/api/src/routes/lib/serializers.ts` — extend with a `serializeDeal` helper (reuse
  existing money-conversion helpers where `discount_value`/`minimum_order_amount` are numeric)
- `packages/types/src/admin.ts` (from Phase 1) — add `Deal`, `DealType`, `DealProductLink`,
  `DealBranchLink` shared types
- `apps/admin/src/features/deals/**` (new) — deal list, deal create/edit form, product/branch
  attach UI
- Read-only reference (no write access from this phase): `packages/api/src/db/schema/coupons.ts`
  (for the open-question resolution once decided)

## Public Contracts

- `GET /api/admin/deals` — list deals (`{ resources: Deal[] }`), filterable by `is_active`
- `GET /api/admin/deals/:id` — single deal incl. attached product/branch ids
- `POST /api/admin/deals` — create deal; validates `deal_type` enum, `end_at > start_at`,
  non-negative `discount_value`/`minimum_order_amount`
- `PATCH /api/admin/deals/:id` — update deal fields (including `is_active` toggle)
- `POST /api/admin/deals/:id/products` — attach product(s) (writes to `deal_products`)
- `DELETE /api/admin/deals/:id/products/:productId` — detach product
- `POST /api/admin/deals/:id/branches` — attach branch(es) (writes to `deal_branches`)
- `DELETE /api/admin/deals/:id/branches/:branchId` — detach branch
- All routes: admin/super_admin only (server-side `requireAdmin`), 403 for other roles

## Blast Radius

- New files only in `packages/api/src/routes/admin/deals.ts`,
  `apps/admin/src/features/deals/**` — no existing route/schema files modified except the shared
  admin-router mount aggregator (additive) and `packages/types/src/admin.ts` (additive)
- No migration needed — `deals`, `deal_products`, `deal_branches` schema already exists
  (`deals.ts`, `deal_products.ts`, `deal_branches.ts`)
- Risk class: none of auth/billing/schema-migration/public-external-API — this is an internal
  admin CRUD surface behind `requireAdmin`. Junction-table unique-index violations are the main
  edge case to handle cleanly (attach same product/branch twice).

---

## Implementation Checklist (Implementation Steps)

**HIGH-LEVEL OUTLINE ONLY — EXECUTE-level checklist finalized at this phase's inner-loop
PLAN-SUPPLEMENT after RESEARCH — kept flexible so earlier phases' CRUD pattern (established in
Phase 2/3) informs the exact steps.**

1. RESEARCH: confirm Phase 2/3's route-file shape, `AdminApiError`, and serializer conventions are
   in place; confirm `adminRouter` mount aggregator exists; scan for any existing coupon-adjacent
   logic that might already imply an answer to the open question.
2. INNOVATE: present the 3 coupon-cascade resolution options (above) for user sign-off; lock the
   chosen option into the Decision Summary.
3. PLAN-SUPPLEMENT: add the concrete acceptance criterion/route behavior for the chosen coupon-
   cascade option into this plan.
4. Build `deals.ts` admin route: Zod schemas for create/update, `end_at > start_at` via
   `.refine()`, `deal_type` enum validation, CRUD handlers, attach/detach handlers for
   `deal_products`/`deal_branches` with clean duplicate-attach error handling.
5. Build `serializeDeal` helper.
6. Build `apps/admin/src/features/deals/**` — list screen, create/edit form (deal_type picker,
   date-range picker, discount fields), product/branch multi-select attach UI.
7. Wire the chosen coupon-cascade behavior into the deactivate/delete path.
8. Write automated tests per Verification Evidence below; write hybrid/agent-probe scenarios.
9. Run regression check against Phase 2 (branches) and Phase 3 (products) surfaces this phase's
   attach/detach endpoints depend on (FK integrity, existing list endpoints unaffected).

Test procedure: run `pnpm --filter @jojopotato/api test` per `process/context/tests/all-tests.md`
after each checklist section; do not batch all gates to the end.

---

## Acceptance Criteria

1. `POST /api/admin/deals` with a valid `deal_type` (one of the 6 enum values,
   `deals.ts:13-20`) and `end_at > start_at` creates a deal and returns `{ resource: Deal }` with
   201.
2. `POST /api/admin/deals` with `end_at <= start_at` is rejected with 400 and a clear validation
   error (app-level `.refine()`, since no DB constraint exists — `deals.ts:35-36`).
3. `POST /api/admin/deals` with an invalid `deal_type` string (not one of the 6 enum values) is
   rejected with 400 (Zod enum validation before it ever reaches the Postgres enum).
4. `POST /api/admin/deals/:id/products` attaches a product to a deal (writes `deal_products` row,
   `deal_products.ts:5-17`); re-attaching the same product+deal pair is rejected cleanly (400/409,
   not a raw Postgres unique-violation) per the `uniqueIndex` at `deal_products.ts:16`.
5. `POST /api/admin/deals/:id/branches` attaches a branch to a deal (writes `deal_branches` row,
   `deal_branches.ts:5-17`); same duplicate-handling requirement as #4, per `deal_branches.ts:16`.
6. `DELETE .../products/:productId` and `DELETE .../branches/:branchId` detach cleanly (200/204).
7. Only `admin`/`super_admin` roles can call any `/api/admin/deals/*` write route; `staff` and
   `customer` roles are rejected with 403 (mirrors `requireStaff` role-check pattern,
   `require-staff.ts:32-58`, applied via the phase-1 `requireAdmin` equivalent).
8. Deactivating a deal (`PATCH .../deals/:id { is_active: false }`) never hard-deletes the row and
   never mutates unrelated deals/products/branches.
9. **[PENDING PLAN-SUPPLEMENT]** — the coupon-cascade acceptance criterion is intentionally absent
   here; it is added after INNOVATE resolves the open question above. Do not add a default.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Create deal with valid 6-type enum returns 201 + correct shape | Fully-Automated | AC1 |
| Create deal with `end_at <= start_at` returns 400 | Fully-Automated | AC2 |
| Create deal with invalid `deal_type` string returns 400 | Fully-Automated | AC3 |
| Attach product to deal writes `deal_products` row; re-attach same pair returns clean 400/409 | Fully-Automated | AC4 |
| Attach branch to deal writes `deal_branches` row; re-attach same pair returns clean 400/409 | Fully-Automated | AC5 |
| Detach product/branch removes junction row | Fully-Automated | AC6 |
| Non-admin (staff/customer) role rejected 403 on all deal write routes | Fully-Automated | AC7 |
| Deactivate toggles `is_active` only, leaves other deal fields/rows untouched | Fully-Automated | AC8 |
| Coupon-cascade behavior per resolved option (test added at PLAN-SUPPLEMENT) | Fully-Automated (pending resolution) | AC9 (pending) |
| Admin UI: create/edit deal form round-trips all fields incl. product/branch attach UI | Agent-Probe | AC1, AC4, AC5 |
| Admin UI: date-range picker rejects `end_at <= start_at` before submit | Agent-Probe | AC2 |

**Failing stub example (Fully-Automated tier, TDD red-first):**
```
test("should reject deal creation when end_at <= start_at", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: create deal with end_at <= start_at")
})
```
(Equivalent stubs apply to every Fully-Automated row above — full stub set to be finalized during
this phase's own PVL when the validate-contract is written.)

---

## Test Infra Improvement Notes

(none identified yet)

---

## Phase Completion Rules

This phase is CODE DONE when Steps 1-5 (RESEARCH through EXECUTE) are complete; VERIFIED only
after Step 6 EVL gates are green, Step 7 UPDATE-PROCESS has archived the phase, and the user has
explicitly confirmed the phase works (user-confirmed). Do not mark ✅ VERIFIED without both
phase-gate evidence and regression evidence against Phases 2/3.

This phase plan is the primary execute anchor for Phase 4 (Deals CRUD); it has no supporting
phase files — all detail lives in this single file.

## Phase Loop Progress

- [ ] 1. RESEARCH
- [ ] 2. INNOVATE — resolve coupon-cascade open question (3 options above), lock Decision Summary
- [ ] 3. PLAN-SUPPLEMENT — add resolved coupon-cascade acceptance criterion + test row
- [ ] 4. PVL (validate-contract)
- [ ] 5. EXECUTE
- [ ] 6. EVL
- [ ] 7. UPDATE-PROCESS

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-04-deals_PLAN_14-07-26.md`
2. **Last completed phase or step:** none — plan just written, Phase Loop Progress all unchecked
3. **Validate-contract status:** pending (placeholder below; not written until Step 4 PVL)
4. **Supporting context files loaded:**
   - `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
   - `process/context/all-context.md`
   - `packages/api/src/db/schema/deals.ts`, `deal_products.ts`, `deal_branches.ts`, `coupons.ts`
   - `docs/jojo-potato-mobile-prd.md` §9.7-9.10
   - `packages/api/src/routes/orders.ts` (Zod + `OrderError` conventions)
   - `packages/api/src/lib/require-staff.ts` (guard-middleware pattern to mirror for `requireAdmin`)
5. **Next step for a fresh agent picking up mid-execution:** this phase cannot start RESEARCH
   before Phase 2 (Branches CRUD) and Phase 3 (Products/Categories CRUD) reach at least
   `🔨 CODE DONE`, since `deal_products`/`deal_branches` attach UI needs real product/branch list
   endpoints to select from. Confirm Phase 1's `requireAdmin` middleware and `adminRouter` mount
   exist before writing `deals.ts`. First action: run vc-context-discovery + vc-plan-discovery, then
   begin Step 1 RESEARCH, paying special attention to resolving the coupon-cascade open question at
   Step 2 INNOVATE before any code is written for the deactivate/delete path.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
