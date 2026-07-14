---
name: plan:admin-phase-03-products
type: plan
feature: admin-dashboard
phase: 3
description: "Phase 3 — Products/Categories CRUD (ADM-003, #41) for the Admin Dashboard program"
date: 14-07-26
---

# Phase 3 — Products & Categories CRUD (ADM-003, #41)

Date: 14-07-26
Status: PLANNED (not next-up; depends on P2 Branches CRUD)
Complexity: COMPLEX (part of an 8-phase program — see umbrella plan)

Phase Completion Rules: this phase is CODE DONE only after Implementation Steps are executed and
all Fully-Automated/Hybrid gates in Verification Evidence are green; VERIFIED requires additionally
the Agent-Probe row confirmed and, per the umbrella's Program Goal Charter, a real passing
snapshot-integrity regression test (Acceptance Criterion #1) — Known-Gap is not permitted for that
criterion.

Umbrella: `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`

---

## Overview

Build full CRUD for the product catalog surface: **categories**, **products**, **product_options**
(size/flavor/add-on variants), and **branch_product_availability** (per-branch availability toggle).
This is the domain the umbrella plan flags as carrying the program's HIGHEST-STAKES correctness bar:
editing a product's price must be structurally proven — via an automated regression test, not a code
review — to never mutate historical order data. Known-Gap is explicitly BANNED for that one
acceptance criterion (per the umbrella's Hard Safety Constraints and Program Goal Charter).

This phase depends on **P2 Branches CRUD** completing first (`admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
Phase Ordering table, row 3) — P2 establishes the branch-scoping UI/API pattern
(`packages/api/src/routes/admin/branches.ts`, `apps/admin/src/features/branches/**`) that P3's
branch-availability screen reuses. **Per the umbrella's Build Strategy, P2's real vertical-slice CRUD
shape is expected to directly inform this phase's exact route/screen structure** — this plan
therefore keeps `## Implementation Steps` deliberately high-level (see note below) rather than
locking file-by-file CRUD mechanics before P2 exists.

Money convention (repo-wide, unchanged by this phase): Postgres stores `numeric(10,2)` DECIMAL PHP
(`products.base_price`, `product_options.price_delta` — `packages/api/src/db/schema/products.ts:12`,
`packages/api/src/db/schema/product_options.ts:19`); the API/UI boundary works in integer cents.
Reuse the existing helpers rather than reimplementing money math:
- `numericToCents(value: string): number` — `packages/api/src/routes/lib/serializers.ts:105-107`,
  already exported and reused (`serializers.ts:133,160,182-183,194-197`) for reads.
- `centsToNumeric(cents: number): string` — currently declared **module-private** inside
  `packages/api/src/routes/orders.ts:49-51` (`function centsToNumeric` — no `export`). This phase
  must export it from a shared location (e.g. move to `routes/lib/serializers.ts` alongside
  `numericToCents`, updating `orders.ts`'s import) so admin write routes reuse the exact same
  round-half-up cents→decimal-string conversion `orders.ts` already uses at write time
  (`orders.ts:150-151` for `unit_price`/`total_price`), instead of re-implementing rounding logic
  for `products.base_price`/`product_options.price_delta` writes. This satisfies the umbrella's
  Modularity gate ("shared serializer money-conversion helpers... written ONCE").

---

## Cross-Cutting Compliance

Per the umbrella plan's 4 mandatory per-phase gates (`admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
§Cross-Cutting Principles):

1. **Modularity** — one route file per domain: `packages/api/src/routes/admin/products.ts` (products
   + product_options + branch_product_availability) and `packages/api/src/routes/admin/categories.ts`
   (categories), both mounted under the single `adminRouter` established in P1 behind `requireAdmin`
   (mirroring `app.use('/api/staff', requireStaff(auth), staffRouter)` at
   `packages/api/src/index.ts:51`). App side: `apps/admin/src/features/products/**` and
   `apps/admin/src/features/categories/**`, one feature folder per domain. Reuses (not
   reimplements): `requireAdmin` guard (P1), shared error envelope (mirroring `OrderError` at
   `orders.ts:39-47`), Zod validation helper conventions, and the (now-exported) money-conversion
   helper pair.
2. **Clarity** — Zod `safeParse` request validation (matches `routes/orders.ts`/`routes/branches.ts`
   convention); response envelopes `{ resource: ... }` / `{ resources: [...] }` matching
   `branches.ts`/`orders.ts`/`staff.ts`; typed errors mirroring `OrderError`; DB-row→API-shape
   conversion lives in a serializer helper file, not inlined in handlers; kebab-case files,
   camelCase functions, PascalCase components (repo-wide convention).
3. **Safety** — all four tables (`categories`, `products`, `product_options`,
   `branch_product_availability`) already carry `is_active`/`is_available` boolean columns
   (`categories.ts:7`, `products.ts:13`, `product_options.ts:22`,
   `branch_product_availability.ts:14`) — deletes are soft (`is_active`/`is_available` toggle), never
   `DELETE` SQL, since all four are FK-referenced by downstream rows (`order_items.product_id`,
   deals join tables). Price/availability edits get a UI confirmation step. **The snapshot-integrity
   regression test is the hard, non-negotiable safety gate for this phase** — see Acceptance
   Criteria #1.
4. **Security** — every `/api/admin/products/*` and `/api/admin/categories/*` route sits behind
   `requireAdmin(auth)` at the router-mount level (inherited from the P1 `adminRouter` mount, no
   per-handler re-check). All request bodies validated server-side with Zod; a rejected client-side
   validation is never the only gate.

5. **UI component modularity & reusability** — `features/products/` reuses the P2 composites
   (`data-table`, `form-dialog`, `confirm-dialog`, `page-header`, `query-states`) — re-implementing any
   of them is a PLAN failure. Product-specific UI is limited to what's genuinely new: the
   category picker and the product-options / branch-availability sub-editors. If any product-specific
   component would be copy-pasted by a later domain (P4/P5), promote it to `components/` under the
   "second consumer" rule instead of duplicating. Styling stays token-driven (no hardcoded hex/px).

---

## Touchpoints

- `packages/api/src/routes/admin/products.ts` (new) — products, product_options, branch_product_availability CRUD
- `packages/api/src/routes/admin/categories.ts` (new) — categories CRUD
- `packages/api/src/routes/lib/serializers.ts` (modified) — add exported `centsToNumeric`, add admin-facing serializers for products/categories/options/availability if not already covered by existing `ApiMenuProduct`-family shapes
- `packages/api/src/routes/orders.ts` (modified) — remove the now-private `centsToNumeric` (line 49-51) in favor of the shared exported one; update its 2 call sites (lines 150-151)
- `packages/types/src/admin.ts` (modified, created by P1) — extend with admin-facing product/category/option/availability request-response types if not already covered by reused mobile-facing types
- `apps/admin/src/features/products/**` (new) — product list/detail/create/edit screens, option-management sub-UI
- `apps/admin/src/features/categories/**` (new) — category list/create/edit screens
- Read-only reference (no changes): `packages/api/src/db/schema/products.ts`, `categories.ts`,
  `product_options.ts`, `branch_product_availability.ts`, `packages/api/src/routes/orders.ts:95-160`
  (order-placement snapshot-write path — used only to write the regression test against)

---

## Public Contracts

New `/api/admin/*` routes (exact paths/methods finalized during this phase's inner-loop RESEARCH,
once P2's route-file shape is established as precedent):

- `GET /api/admin/categories` — list all categories (incl. inactive, admin view)
- `POST /api/admin/categories` — create category (name, slug-uniqueness enforced, sort_order, is_active)
- `PATCH /api/admin/categories/:id` — update category fields
- `DELETE /api/admin/categories/:id` (soft) — sets `is_active: false`, never hard-deletes
- `GET /api/admin/products` — list products (filterable by category, active status)
- `POST /api/admin/products` — create product (category_id FK validated, slug uniqueness, base_price accepted as cents → converted via `centsToNumeric` before insert)
- `PATCH /api/admin/products/:id` — update product fields, including `base_price`
- `DELETE /api/admin/products/:id` (soft) — sets `is_active: false`
- `GET /api/admin/products/:id/options` — list a product's options
- `POST /api/admin/products/:id/options` — create option (option_type enum, price_delta cents → numeric)
- `PATCH /api/admin/products/:productId/options/:optionId` — update option
- `DELETE .../options/:optionId` (soft) — sets `is_active: false`
- `GET /api/admin/products/:id/availability` — list per-branch availability rows for a product
- `PATCH /api/admin/products/:id/availability/:branchId` — upsert/toggle `is_available` (composite-unique `bpa_branch_product_idx` on `branch_id`+`product_id`, `branch_product_availability.ts:16`)

All responses use the `{ resource }` / `{ resources }` envelope family; all errors use the typed
error class mirroring `OrderError`. All money fields in requests/responses are integer cents; the
route layer is the only place `centsToNumeric`/`numericToCents` conversion happens — never in the
app layer.

---

## Blast Radius

- **Packages touched:** `packages/api` (new admin routes + serializer export change + orders.ts
  refactor), `packages/types` (extend admin.ts), `apps/admin` (new feature folders)
- **Risk class:** none of the 6 program-level high-risk classes apply directly (no auth/billing/
  migration/public-API-breaking-change/deploy/secrets change) EXCEPT that this phase touches the
  **money/pricing surface** that the historical order-snapshot invariant depends on — treated as a
  hard safety gate per Cross-Cutting Compliance #3, not a schema/migration change (no new columns or
  tables needed; `products`/`categories`/`product_options`/`branch_product_availability` all already
  exist per `packages/api/src/db/schema/index.ts:1-11`).
- **File count estimate:** ~10-14 new/modified files (2 new route files, 1 modified serializer file,
  1 modified orders.ts, 1 modified types file, 2 new admin feature folders each with several screen/
  hook files) — MEDIUM blast radius, single package family (api + types + admin app), no schema
  migration.
- **Shared-surface note (for umbrella Pre-PVL Conflict Resolution):** this phase modifies
  `packages/api/src/routes/orders.ts` (moving `centsToNumeric` out) and `packages/types/src/admin.ts`
  (also touched by P1, P2, and later phases) — both are flagged shared surfaces the umbrella-level
  Pre-PVL Conflict Resolution step must classify as `parallel-safe` (additive/refactor-only touch) or
  `reassign` once other phase plans are known to be executing concurrently.

---

## Implementation Steps (Phased Delivery Plan / Implementation Checklist — high-level)

**Note:** EXECUTE-level checklist finalized at this phase's inner-loop PLAN-SUPPLEMENT after
RESEARCH — kept flexible so P2's established CRUD pattern informs the exact steps.

High-level outline only:

1. RESEARCH: re-confirm P2's route/screen shape (file layout, Zod schema conventions, error/envelope
   pattern) is landed and stable; confirm the `centsToNumeric` export refactor doesn't break existing
   `orders.ts` tests; confirm no other phase has already claimed `serializers.ts`/`admin.ts` edits in
   an overlapping way.
2. Export `centsToNumeric` from a shared serializer location; update `orders.ts` import; run existing
   order test suite to confirm no regression.
3. Build `admin/categories.ts` route (CRUD + soft-delete) + `apps/admin/src/features/categories/**`.
4. Build `admin/products.ts` route: products CRUD (with cents↔numeric conversion on write/read),
   product_options CRUD nested under a product, branch_product_availability toggle endpoint.
5. Build `apps/admin/src/features/products/**` screens: list, detail/edit (incl. options
   sub-management UI), create, per-branch availability toggle UI.
6. Write the snapshot-integrity regression test (Acceptance Criteria #1) — place products, place an
   order snapshotting price, then edit `base_price` via the new admin route, and assert the
   historical `order_items.unit_price`/`total_price` rows are unchanged.
7. Write remaining CRUD/validation tests per the Verification Evidence table.
8. Regression checkpoint against P2's branch-scoping surfaces if this phase's availability screen
   reuses P2 branch-list data fetching.

---

## Acceptance Criteria

1. **[HARD, non-negotiable]** Editing a product's `base_price` (or an option's `price_delta`) via the
   new admin route(s) MUST NOT change any existing `order_items.unit_price`/`total_price` row for
   orders placed before the edit — proven by proven by: `snapshot-integrity-regression` test |
   strategy: Fully-Automated. Known-Gap is BANNED for this criterion (umbrella charter, Definition of
   Done #5 and Hard Safety Constraints).
2. Categories: create/read/update/soft-delete works; `slug` uniqueness is enforced server-side (DB
   unique constraint + a friendly 409/400 error, not a raw constraint-violation leak) — proven by:
   `category-crud-and-slug-uniqueness` | strategy: Fully-Automated.
3. Products: create/read/update/soft-delete works; `category_id` FK is validated (invalid/inactive
   category rejected); `base_price` round-trips correctly cents→numeric→cents with no rounding drift
   — proven by: `product-crud-and-price-roundtrip` | strategy: Fully-Automated.
4. Product options: create/read/update/soft-delete per product; `option_type` enum
   (`size|flavor|add_on`) is validated server-side; `price_delta` round-trips correctly — proven by:
   `product-option-crud-and-enum-validation` | strategy: Fully-Automated.
5. Branch-product-availability: toggling `is_available` for a branch+product pair works and respects
   the composite-unique constraint (`bpa_branch_product_idx`) — upsert semantics, not duplicate-row
   creation — proven by: `branch-availability-toggle-upsert` | strategy: Fully-Automated.
6. All new `/api/admin/products/*` and `/api/admin/categories/*` routes reject non-admin/non-super_admin
   callers (403), consistent with the P1 `requireAdmin` guard — proven by:
   `admin-route-authz-rejection` | strategy: Fully-Automated (hybrid if it requires the same live-DB
   fixture pattern as `require-staff.integration.test.ts`).
7. Soft-delete is used (not hard `DELETE`) for all four entities — proven by:
   `soft-delete-not-hard-delete` | strategy: Hybrid (code-review-assisted + a test asserting the row
   still exists with `is_active:false` after a delete call).
8. Admin UI screens (categories, products, options, availability) render, allow full CRUD
   round-trips against a real dev DB, and show a confirmation step before destructive/price-changing
   actions — proven by: `admin-ui-manual-walkthrough` | strategy: Agent-Probe.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `snapshot-integrity-regression` (place order, edit base_price, assert order_items unchanged) | Fully-Automated | AC #1 (hard invariant) |
| `category-crud-and-slug-uniqueness` | Fully-Automated | AC #2 |
| `product-crud-and-price-roundtrip` | Fully-Automated | AC #3 |
| `product-option-crud-and-enum-validation` | Fully-Automated | AC #4 |
| `branch-availability-toggle-upsert` | Fully-Automated | AC #5 |
| `admin-route-authz-rejection` | Hybrid (requires seeded admin/non-admin fixtures, same pattern as `require-staff.integration.test.ts`) | AC #6 |
| `soft-delete-not-hard-delete` | Hybrid | AC #7 |
| `admin-ui-manual-walkthrough` (create category → product → options → toggle availability → attempt price edit with confirmation) | Agent-Probe | AC #8 |
| Existing `orders.ts` test suite re-run after `centsToNumeric` export refactor | Fully-Automated | Regression guard (no SPEC criterion — refactor safety) |

Note: exact test file paths and the admin test runner command are finalized during this phase's
RESEARCH step per `process/context/tests/all-tests.md` routing chain — `packages/api` uses vitest +
supertest (`pnpm --filter @jojopotato/api test`, requires `docker compose up -d` +
`pnpm --filter @jojopotato/api db:migrate`); `apps/admin`'s test runner is established in P0/P1 and
inherited here.

---

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

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-03-products_PLAN_14-07-26.md`
2. **Last completed phase or step:** none — this plan was authored ahead of P2 completing (flexible-depth pass per program kickoff); Phase Loop Progress is entirely unchecked.
3. **Validate-contract status:** pending (placeholder below) — not yet written; VALIDATE must not run until P2 (Branches CRUD) is VERIFIED, since this phase's RESEARCH step depends on P2's landed CRUD pattern.
4. **Supporting context files loaded:** `admin-dashboard_UMBRELLA_PLAN_14-07-26.md`, `process/context/all-context.md`, `packages/api/src/db/schema/{products,categories,product_options,branch_product_availability}.ts`, `packages/api/src/routes/orders.ts` (lines 1-60, 95-160), `packages/api/src/routes/lib/serializers.ts` (lines 1-140).
5. **Next step for a fresh agent picking up mid-execution:** confirm P2 (Branches CRUD, `phase-02-branches_PLAN_14-07-26.md`) status is ✅ VERIFIED in the umbrella's Program Status Table; if not, do not start this phase's RESEARCH yet. If P2 is verified, run this phase's RESEARCH step (re-confirm P2's route/screen conventions, run `vc-context-discovery` + `vc-plan-discovery` first) before any INNOVATE/PLAN-SUPPLEMENT work.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
