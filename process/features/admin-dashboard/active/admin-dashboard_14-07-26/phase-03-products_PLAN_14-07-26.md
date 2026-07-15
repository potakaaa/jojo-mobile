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
Status: PVL COMPLETE — Gate: PASS (see `## Validate Contract` below). RESEARCH + INNOVATE +
PLAN-SUPPLEMENT + PVL are all complete; ready for EXECUTE (Step 5).
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

RESEARCH confirmed P2 (Branches CRUD) is ✅ VERIFIED and its shape is directly reused: the
`AdminApiError` class, the append-only `/api/admin` aggregator, the `requireAdmin` mount, the
`{resource}`/`{resources}` envelope convention, and the `makeUser(role)` self-seeding test-fixture
pattern. INNOVATE locked 3 decisions (below) that extend/refine P2's shape rather than diverging
from it.

Money convention (repo-wide, unchanged by this phase): Postgres stores `numeric(10,2)` DECIMAL PHP
(`products.base_price`, `product_options.price_delta` — `packages/api/src/db/schema/products.ts:12`,
`packages/api/src/db/schema/product_options.ts:19`); the API/UI boundary works in integer cents.
Reuse the existing helpers rather than reimplementing money math:
- `numericToCents(value: string): number` — `packages/api/src/routes/lib/serializers.ts:105-107`,
  already exported and reused for reads.
- `centsToNumeric(cents: number): string` — currently declared **module-private** inside
  `packages/api/src/routes/orders.ts:49-51` (`function centsToNumeric` — no `export`). This phase
  exports it from `routes/lib/serializers.ts` alongside `numericToCents`, updating `orders.ts`'s
  import, so admin write routes reuse the exact same round-half-up cents→decimal-string conversion
  `orders.ts` already uses at write time (`orders.ts:150-151`).

---

## Locked Decisions (RESEARCH + INNOVATE, 14-07-26)

**DECISION 1 — Shared UI extraction (partial, "as-is, improve later"):**
Extract 3 of the 5 composites the umbrella flagged, now, into `apps/admin/src/components/`
(RESEARCH confirmed this is the live shared-components location — `admin-home.tsx` and the shadcn
`ui/` subfolder already live there; P2 explicitly did NOT create any shared composites, per its
Cross-Cutting Compliance §5 deferral note — this phase is the actual first extraction pass, not a
relocation of existing files):
- `apps/admin/src/components/query-states.tsx` — loading/empty/error render helper
- `apps/admin/src/components/confirm-dialog.tsx` — generic radix `Dialog`-based confirmation
  (parameterized version of P2's `deactivate-branch-dialog.tsx` — RESEARCH read that file in full;
  its `Dialog.Root`/`Portal`/`Overlay`/`Content`/`Title`/`Description` structure and Tailwind classes
  become the generic component's implementation, taking `title`/`description`/`onConfirm`/
  `confirmLabel` props instead of branch-specific text)
- `apps/admin/src/components/page-header.tsx` — title + primary-action header

DEFERRED (not built this phase, explicit re-eval trigger): `data-table` and `form-dialog`. Products'
option/availability sub-editors don't fit a single generic form shape yet (nested per-product
option list + per-branch availability toggle grid are both non-trivial extensions of a plain
create/edit form). Re-evaluate both at Phase 4 (Deals) RESEARCH — Deals' junction-table UI
(`deal_products`/`deal_branches`) is likely to be the next real second-consumer test case for
`data-table`.

**Categories screens MUST consume the 3 extracted composites — building local duplicates for
`query-states`/`confirm-dialog`/`page-header` inside `features/categories/` is a plan failure.**
Products' list/form stay feature-local (they may still use the 3 extracted composites where they
fit — e.g. `page-header` on the product list screen, `confirm-dialog` for deactivate/price-change
confirmation — but the product-specific sub-editors are not extracted).

**DECISION 2 — API error-helper extraction (admin-API-only, zero external consumers confirmed):**
Move `handleAdminError` (currently `packages/api/src/routes/admin/branches.ts:49`) and
`isUniqueViolation` (currently `branches.ts:63`) INTO the existing
`packages/api/src/routes/admin/lib/errors.ts` (which already holds `AdminApiError` — RESEARCH read
the file in full, it is 17 lines, only the class). Export both functions. Update `branches.ts` to
import them from `./lib/errors` instead of declaring them locally (explicit touchpoint — not
implied). `products.ts` and `categories.ts` import from the same file. RESEARCH grepped for any
consumer of `handleAdminError`/`isUniqueViolation` outside `branches.ts` and found none — this move
is admin-API-only, does not touch `apps/mobile`, `apps/admin` (app layer), or `packages/api`'s
non-admin routes.

**DECISION 3 — Availability upsert (realtime explicitly deferred):**
`branch_product_availability` writes use Drizzle's `.onConflictDoUpdate()` targeting the composite
unique index `bpa_branch_product_idx` (`branch_id` + `product_id`,
`packages/api/src/db/schema/branch_product_availability.ts:16`) — a single upsert call, not a
manual select-then-insert-or-update. NO realtime/websocket UI sync is built — `apps/admin`'s
react-query screens refetch-on-focus (same staleness model as every other screen in the app; P2's
`queryClient` has `staleTime: 30s`). This is an accepted Known-Gap (stale-until-refetch across
concurrent admin sessions or the future STAFF-004 mobile write path), not new debt — it is
consistent with the rest of the app's data-freshness model, not a regression from some stronger
baseline.

---

## Cross-Cutting Compliance

Per the umbrella plan's 4 mandatory per-phase gates (`admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
§Cross-Cutting Principles):

1. **Modularity** — one route file per domain: `packages/api/src/routes/admin/products.ts` (products
   + product_options + branch_product_availability) and `packages/api/src/routes/admin/categories.ts`
   (categories), both mounted under the existing `adminRouter` aggregator
   (`packages/api/src/routes/admin/index.ts`, append-only, third confirmed consumer after P1's
   `users.ts` and P2's `branches.ts`). App side: `apps/admin/src/features/products/**` and
   `apps/admin/src/features/categories/**`, one feature folder per domain, per Decision 1.
   Reuses (not reimplements): `requireAdmin` guard (P1), `AdminApiError`/`handleAdminError`/
   `isUniqueViolation` (P2, relocated per Decision 2), Zod validation conventions, the (now-exported)
   `centsToNumeric`/`numericToCents` pair, and the 3 extracted composites (Decision 1).
2. **Clarity** — Zod `safeParse` request validation (matches `routes/orders.ts`/`routes/admin/
   branches.ts` convention); response envelopes `{ resource: ... }` / `{ resources: [...] }` matching
   `branches.ts`/`orders.ts`/`staff.ts`; typed errors via `AdminApiError`; DB-row→API-shape
   conversion lives in a serializer helper file, not inlined in handlers; kebab-case files,
   camelCase functions, PascalCase components (repo-wide convention).
3. **Safety** — all four tables (`categories`, `products`, `product_options`,
   `branch_product_availability`) already carry `is_active`/`is_available` boolean columns
   (`categories.ts:7`, `products.ts:13`, `product_options.ts:22`,
   `branch_product_availability.ts:14`) — deletes are soft (`is_active`/`is_available` toggle), never
   `DELETE` SQL, since all four are FK-referenced by downstream rows (`order_items.product_id`,
   deals join tables). Price/availability edits get a UI confirmation step (via the extracted
   `confirm-dialog`, Decision 1). **The snapshot-integrity regression test is the hard,
   non-negotiable safety gate for this phase** — see Acceptance Criteria #1.
4. **Security** — every `/api/admin/products/*` and `/api/admin/categories/*` route sits behind
   `requireAdmin(auth)` at the router-mount level (inherited from the P1 `adminRouter` mount, no
   per-handler re-check). All request bodies validated server-side with Zod; a rejected client-side
   validation is never the only gate.
5. **UI component modularity & reusability** — see Decision 1. Categories consume all 3 extracted
   composites; Products consume them where they fit and stay feature-local for the option/
   availability sub-editors. If any product-specific component would be copy-pasted by a later
   domain (P4/P5), promote it to `components/` under the "second consumer" rule instead of
   duplicating. Styling stays token-driven (no hardcoded hex/px).

---

## Touchpoints

- `packages/api/src/routes/admin/products.ts` (new) — products, product_options,
  branch_product_availability CRUD
- `packages/api/src/routes/admin/categories.ts` (new) — categories CRUD
- `packages/api/src/routes/admin/lib/errors.ts` (modified) — add exported `handleAdminError` and
  `isUniqueViolation`, moved from `branches.ts` (Decision 2)
- `packages/api/src/routes/admin/branches.ts` (modified) — remove local `handleAdminError`/
  `isUniqueViolation` (lines ~49, ~63); import both from `./lib/errors` instead; re-run
  `admin-branches.integration.test.ts` after the swap as a regression guard (Decision 2 explicit
  touchpoint)
- `packages/api/src/routes/admin/index.ts` (modified) — append-only: mount `productsRouter` at
  `/products` and `categoriesRouter` at `/categories`, matching the existing P2 append pattern
- `packages/api/src/routes/lib/serializers.ts` (modified) — add exported `centsToNumeric`
  (moved from `orders.ts`); add local admin-facing serializers/types for category, product, product
  option, and branch-availability (matching the `AdminBranch`/`serializeAdminBranch` local-
  declaration convention from P2 — `packages/types` stays untouched, per the umbrella's "second
  consumer" rule)
- `packages/api/src/routes/orders.ts` (modified) — remove the now-private `centsToNumeric`
  (lines 49-51); update its 2 call sites (lines 150-151) to import from `routes/lib/serializers.ts`;
  re-run the existing `orders.test.ts` suite as a regression guard
- `apps/admin/src/components/query-states.tsx` (new, Decision 1)
- `apps/admin/src/components/confirm-dialog.tsx` (new, Decision 1 — generic version of P2's
  `deactivate-branch-dialog.tsx`)
- `apps/admin/src/components/page-header.tsx` (new, Decision 1)
- `apps/admin/src/features/categories/**` (new) — category list/create/edit screens, consuming all
  3 extracted composites
- `apps/admin/src/features/products/**` (new) — product list/detail/create/edit screens, option-
  management sub-UI, per-branch availability toggle UI
- Read-only reference (no changes): `packages/api/src/db/schema/{products,categories,
  product_options,branch_product_availability}.ts`, `packages/api/src/routes/orders.ts:95-160`
  (order-placement snapshot-write path — used only to write the regression test against),
  `apps/admin/src/features/branches/**` (P2 — reference implementation for route/hook/screen shape)

---

## Public Contracts

Route file/method conventions follow P2 exactly: `Router()` per domain file, Zod
`createXSchema`/`updateXSchema` (`.partial().extend()` for PATCH), `z.uuid()` pre-validation on path
params (404 on malformed id before hitting the DB), `{resource}`/`{resources}` envelopes, soft-delete
only via a dedicated `PATCH .../deactivate` route (never a generic `DELETE`).

- `GET /api/admin/categories` — list all categories (incl. inactive, admin view) → `{ categories: AdminCategory[] }`
- `POST /api/admin/categories` — create category (name, slug-uniqueness enforced via the shared
  `isUniqueViolation` catch → `409`, sort_order, is_active) → `201 { category: AdminCategory }`
- `PATCH /api/admin/categories/:id` — update category fields → `200 { category: AdminCategory }`
- `PATCH /api/admin/categories/:id/deactivate` (soft) — sets `is_active: false`, never hard-deletes
- `GET /api/admin/products` — list products (filterable by `?categoryId=`, includes inactive) →
  `{ products: AdminProduct[] }`
- `POST /api/admin/products` — create product (`category_id` FK validated — 400 if missing/inactive
  category; slug uniqueness via shared catch; `base_price` accepted as integer cents → converted via
  `centsToNumeric` before insert) → `201 { product: AdminProduct }`
- `PATCH /api/admin/products/:id` — update product fields, including `base_price` → `200 { product: AdminProduct }`
- `PATCH /api/admin/products/:id/deactivate` (soft) — sets `is_active: false`
- `GET /api/admin/products/:id/options` — list a product's options → `{ options: AdminProductOption[] }`
- `POST /api/admin/products/:id/options` — create option (`option_type` enum
  `size|flavor|add_on` server-validated via Zod; `price_delta` cents → numeric) → `201 { option: AdminProductOption }`
- `PATCH /api/admin/products/:productId/options/:optionId` — update option
- `PATCH .../options/:optionId/deactivate` (soft) — sets `is_active: false`
- `GET /api/admin/products/:id/availability` — list per-branch availability rows for a product →
  `{ availability: AdminBranchAvailability[] }`
- `PATCH /api/admin/products/:id/availability/:branchId` — upsert `is_available` via Drizzle
  `.onConflictDoUpdate()` targeting the composite-unique index `bpa_branch_product_idx`
  (`branch_id`+`product_id`, `branch_product_availability.ts:16`) — Decision 3

All responses use the `{ resource }` / `{ resources }` envelope family; all errors use
`AdminApiError` thrown and caught by the shared `handleAdminError` (Decision 2). All money fields
in requests/responses are integer cents; the route layer is the only place `centsToNumeric`/
`numericToCents` conversion happens — never in the app layer.

---

## Blast Radius

- **Packages touched:** `packages/api` (2 new admin route files, `errors.ts` extension,
  `branches.ts` import-swap, `serializers.ts` extension, `orders.ts` refactor), `apps/admin`
  (3 new shared composites + 2 new feature folders). `packages/types` explicitly NOT touched
  (local-declaration convention, matching P2).
- **Risk class:** none of the 6 program-level high-risk classes apply directly (no auth/billing/
  migration/public-API-breaking-change/deploy/secrets change) EXCEPT that this phase touches the
  **money/pricing surface** that the historical order-snapshot invariant depends on — treated as a
  hard safety gate per Cross-Cutting Compliance #3, not a schema/migration change (no new columns or
  tables needed; all four tables already exist per `packages/api/src/db/schema/index.ts:1-11`).
- **File count estimate:** ~16-19 new/modified files (2 new route files, 1 modified errors.ts, 1
  modified branches.ts, 1 modified serializers.ts, 1 modified orders.ts, 3 new shared composites, 2
  new admin feature folders each with several screen/hook/lib files) — MEDIUM-HIGH blast radius,
  single package family (api + admin app), no schema migration.
- **Shared-surface note (for umbrella Pre-PVL Conflict Resolution):** this phase modifies
  `packages/api/src/routes/orders.ts` (moving `centsToNumeric` out — additive/refactor-only, low
  conflict risk) and `packages/api/src/routes/admin/branches.ts` (Decision 2 import-swap — also a
  P2-owned file, now touched post-VERIFIED by this phase) and `packages/api/src/routes/admin/lib/
  errors.ts` (P2-created, now extended). None of these are concurrently-claimed by another active
  phase per the umbrella's Phase Ordering (P4-P7 have not started); flag as `parallel-safe`
  (additive/refactor-only) at the umbrella's Pre-PVL Conflict Resolution step if other phases begin
  concurrent execution before this phase's EXECUTE lands.

---

## Implementation Steps (Phased Delivery Plan / Implementation Checklist)

1. **Export `centsToNumeric`** from `routes/lib/serializers.ts` (alongside `numericToCents`);
   update `orders.ts`'s call sites to import it; remove the module-private declaration from
   `orders.ts`; run `pnpm --filter @jojopotato/api test -- orders` to confirm zero regression.
   **VALIDATE correction: the plan's originally-cited line numbers (declaration 49-51, call sites
   150-151) are stale — confirmed at VALIDATE-time the function is actually declared at
   `orders.ts:55-57` with THREE call sites (`orders.ts:175-176` for `unit_price`/`total_price`,
   and `orders.ts:291-293` for `subtotal`/`discount_total`/`total`), not two. Re-grep
   (`grep -n "centsToNumeric" packages/api/src/routes/orders.ts`) at EXECUTE time rather than
   trusting these hardcoded numbers — see Execute-Agent Instruction E1.**
2. **Decision 2 — relocate error helpers**: move `handleAdminError`/`isUniqueViolation` from
   `branches.ts` into `routes/admin/lib/errors.ts`, export both; update `branches.ts`'s imports;
   run `pnpm --filter @jojopotato/api test -- admin-branches` to confirm zero regression.
3. **Decision 1 — extract 3 shared composites** into `apps/admin/src/components/`: `query-states.tsx`,
   `confirm-dialog.tsx` (generalized from P2's `deactivate-branch-dialog.tsx`), `page-header.tsx`.
4. **Build `admin/categories.ts` route** (CRUD + soft-delete via `PATCH .../deactivate`, slug
   uniqueness via the relocated `isUniqueViolation`) + `apps/admin/src/features/categories/**`
   (list/create/edit screens consuming all 3 extracted composites). Mount at `/categories` in
   `routes/admin/index.ts` (append-only).
5. **Build `admin/products.ts` route**: products CRUD (cents↔numeric conversion on write/read via
   the now-shared helpers, `category_id` FK validation), product_options CRUD nested under a
   product (`option_type` enum Zod validation), branch_product_availability upsert endpoint
   (Decision 3 — `.onConflictDoUpdate()` on `bpa_branch_product_idx`). Mount at `/products`.
6. **Build `apps/admin/src/features/products/**` screens**: list (using `page-header`), detail/edit
   (incl. options sub-management UI — feature-local, not extracted), create, per-branch
   availability toggle UI (feature-local grid), deactivate/price-change confirmation via
   `confirm-dialog`.
7. **Write the snapshot-integrity regression test** (Acceptance Criteria #1) — place a product,
   place an order snapshotting its price, then edit `base_price` via the new admin route, and
   assert the historical `order_items.unit_price`/`total_price` rows are unchanged. This is the
   HARD non-negotiable gate — no Known-Gap permitted.
8. **Write remaining CRUD/validation tests** per the Verification Evidence table (categories,
   products, options, availability-upsert, authz-rejection, soft-delete).
9. **Regression checkpoint**: re-run `admin-branches.integration.test.ts` and `orders.test.ts` one
   final time after all steps land (both were touched by Steps 1-2); confirm the full
   `packages/api` suite is still green with 0 regressions.

---

## Acceptance Criteria

1. **[HARD, non-negotiable]** Editing a product's `base_price` (or an option's `price_delta`) via the
   new admin route(s) MUST NOT change any existing `order_items.unit_price`/`total_price` row for
   orders placed before the edit — proven by: `snapshot-integrity-regression` | strategy:
   Fully-Automated. Known-Gap is BANNED for this criterion (umbrella charter, Definition of Done #5
   and Hard Safety Constraints).
2. Categories: create/read/update/soft-delete works; `slug` uniqueness is enforced server-side (DB
   unique constraint + a friendly 409 error via the shared `isUniqueViolation` catch, not a raw
   constraint-violation leak) — proven by: `category-crud-and-slug-uniqueness` | strategy:
   Fully-Automated.
3. Products: create/read/update/soft-delete works; `category_id` FK is validated (invalid/inactive
   category rejected with 400); `base_price` round-trips correctly cents→numeric→cents with no
   rounding drift — proven by: `product-crud-and-price-roundtrip` | strategy: Fully-Automated.
4. Product options: create/read/update/soft-delete per product; `option_type` enum
   (`size|flavor|add_on`) is validated server-side; `price_delta` round-trips correctly — proven by:
   `product-option-crud-and-enum-validation` | strategy: Fully-Automated.
5. Branch-product-availability: toggling `is_available` for a branch+product pair works via
   `.onConflictDoUpdate()` on `bpa_branch_product_idx` — no duplicate-row creation, repeated toggles
   are idempotent upserts — proven by: `branch-availability-toggle-upsert` | strategy:
   Fully-Automated.
6. All new `/api/admin/products/*` and `/api/admin/categories/*` routes reject non-admin/non-super_admin
   callers (403), consistent with the P1 `requireAdmin` guard — proven by:
   `admin-route-authz-rejection` | strategy: Fully-Automated (supertest + `makeUser('staff')`
   fixture, same pattern as P2's AC6 — no live server/browser needed, so this is Fully-Automated,
   not Hybrid, matching P2's precedent).
7. Soft-delete is used (not hard `DELETE`) for all four entities — a `PATCH .../deactivate` call
   sets `is_active`/`is_available: false` and the row still exists (`SELECT` finds it,
   `row count unchanged`) — proven by: `soft-delete-not-hard-delete` | strategy: Fully-Automated
   (a plain supertest + DB-assertion case, same as P2's AC5 — RESEARCH found no reason this needs
   Hybrid; the stub's original "Hybrid, code-review-assisted" framing was over-conservative).
8. Admin UI screens (categories, products, options, availability) render, allow full CRUD
   round-trips against a real dev DB, and show a confirmation step (via `confirm-dialog`) before
   destructive/price-changing actions — proven by: `admin-ui-manual-walkthrough` | strategy:
   Agent-Probe (no `apps/admin` browser/E2E runner exists yet — project-wide gap, matching P2's AC7
   precedent; non-blocking for CODE DONE, required for VERIFIED per Phase Completion Rules).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `snapshot-integrity-regression` — place product, place order (snapshots price), edit `base_price` via admin route, assert `order_items.unit_price`/`total_price` unchanged | Fully-Automated | AC1 (hard invariant, Known-Gap banned) |
| `category-crud-and-slug-uniqueness` | Fully-Automated | AC2 |
| `product-crud-and-price-roundtrip` (incl. invalid/inactive `category_id` → 400) | Fully-Automated | AC3 |
| `product-option-crud-and-enum-validation` | Fully-Automated | AC4 |
| `branch-availability-toggle-upsert` (repeated PATCH is idempotent, no dup rows) | Fully-Automated | AC5 |
| `admin-route-authz-rejection` — `staff`-role session via `makeUser('staff')` → 403 on products+categories routes | Fully-Automated | AC6 |
| `soft-delete-not-hard-delete` — deactivate call, row survives with flag false | Fully-Automated | AC7 |
| `admin-ui-manual-walkthrough` — create category → product → options → toggle availability → attempt price edit with confirmation | Agent-Probe | AC8 |
| Existing `orders.test.ts` suite re-run after `centsToNumeric` export refactor (Step 1) | Fully-Automated | Regression guard (no SPEC criterion — refactor safety) |
| Existing `admin-branches.integration.test.ts` suite re-run after error-helper relocation (Step 2) | Fully-Automated | Regression guard (no SPEC criterion — refactor safety) |

**Failing stubs (Fully-Automated rows only, TDD red-first starting point for EXECUTE):**

```text
test("AC1 — should not mutate order_items.unit_price/total_price when a product's base_price is edited after order placement", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1")
})
test("AC2 — should create/read/update/soft-delete a category and reject a duplicate slug with 409", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC2")
})
test("AC3 — should create/read/update/soft-delete a product, reject invalid category_id, and round-trip base_price with no drift", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3")
})
test("AC4 — should create/read/update/soft-delete a product option and validate option_type enum server-side", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC4")
})
test("AC5 — should upsert branch_product_availability idempotently via onConflictDoUpdate, no duplicate rows", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC5")
})
test("AC6 — should reject a staff-role session with 403 on any /api/admin/products/* or /api/admin/categories/* route", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC6")
})
test("AC7 — should soft-deactivate (is_active/is_available=false) without deleting the row, for all four entities", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC7")
})
```

Note: exact test file paths follow the P2 convention — new supertest integration files as peers of
`admin-branches.integration.test.ts` under `packages/api/src/lib/__tests__/` (e.g.
`admin-products.integration.test.ts`, `admin-categories.integration.test.ts`), reusing the
`makeUser(role)` self-seeding fixture. `packages/api` uses vitest + supertest (`pnpm --filter
@jojopotato/api test -- admin-products` / `-- admin-categories`, requires local Postgres migrated —
either `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate`, or this dev machine's
already-running native Postgres per `process/context/tests/all-tests.md`'s Debugging Quick
Reference). Exact filenames finalized in EXECUTE (vitest's CLI filter is filename-substring based,
per P2's E2 correction — verify the actual filename before locking the gate command in the
validate-contract).

---

## Test Infra Improvement Notes

- No `apps/admin` browser/E2E runner exists yet (project-wide gap, unchanged since P0/P2) — AC8's
  Agent-Probe manual walkthrough is the only coverage for the actual screen interactions.
- Decision 3's Known-Gap (no realtime sync on `branch_product_availability` writes — refetch-on-
  focus only) has no automated coverage possible within this phase's scope; it is consistent with
  the app's existing staleness model (P2's `queryClient` 30s `staleTime`), not new debt.

---

## Phase Loop Progress

- [x] 1. RESEARCH (14-07-26 — confirmed P2 ✅ VERIFIED, `AdminApiError`/aggregator/append pattern
  live; confirmed `handleAdminError`/`isUniqueViolation` are inline in `branches.ts` (lines ~49/63)
  with zero external consumers; confirmed `apps/admin/src/components/` is the live shared-component
  location with no composites extracted yet; confirmed `centsToNumeric` is module-private in
  `orders.ts`; confirmed `bpa_branch_product_idx` composite unique index exists on
  `branch_product_availability.ts:16`)
- [x] 2. INNOVATE (14-07-26 — locked Decisions 1-3, see `## Locked Decisions` above)
- [x] 3. PLAN-SUPPLEMENT (14-07-26 — this pass)
- [x] 4. PVL (validate-contract) (15-07-26 — Gate: PASS, 0 FAILs / 0 blocking CONCERNs; 2
  Execute-Agent Instructions recorded (line-number correction, backlog-note reminder); see
  `## Validate Contract` below)
- [ ] 5. EXECUTE
- [ ] 6. EVL
- [ ] 7. UPDATE-PROCESS

---

## Inner Loop Refresh Note

**Date:** 14-07-26
**Steps run this pass:** RESEARCH (Step 1) → INNOVATE (Step 2) → PLAN-SUPPLEMENT (Step 3, this edit).
**What changed:** collapsed the "high-level outline only" Implementation Steps into a concrete
9-step checklist; baked in 3 locked decisions (partial shared-UI extraction of `query-states`/
`confirm-dialog`/`page-header` into `apps/admin/src/components/`, DEFERRING `data-table`/
`form-dialog` to Phase 4 re-eval; relocation of `handleAdminError`/`isUniqueViolation` from
`branches.ts` into `routes/admin/lib/errors.ts`; `.onConflictDoUpdate()` upsert for availability with
realtime explicitly deferred as an accepted Known-Gap); re-tiered AC6/AC7(now AC6/AC7 in this
plan's numbering) from the stub's over-conservative "Hybrid" to Fully-Automated, matching P2's
precedent (supertest + `makeUser(role)` fixture needs no live server/browser); added explicit
Touchpoints for the `branches.ts` import-swap and `orders.ts` refactor as regression-guard
touchpoints; expanded Verification Evidence with 2 regression-guard rows (re-run
`orders.test.ts` and `admin-branches.integration.test.ts` after Steps 1-2) and added TDD failing
stubs for all 7 Fully-Automated ACs.
**Next:** PVL (Step 4) should run from V1 against this updated plan.

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-03-products_PLAN_14-07-26.md`
2. **Last completed phase or step:** Step 4 — PVL (15-07-26). Steps 1-4 of the 7-step inner loop are
   complete. Gate: PASS.
3. **Validate-contract status:** written (15-07-26) — see `## Validate Contract` below. Gate: PASS.
   Next action is Step 5 (EXECUTE) — spawn `vc-execute-agent` against this plan file.
4. **Supporting context files loaded:** `admin-dashboard_UMBRELLA_PLAN_14-07-26.md`,
   `phase-02-branches_PLAN_14-07-26.md` (full, incl. its validate-contract, as the CRUD-shape
   template), `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `packages/api/src/db/schema/{products,categories,product_options,branch_product_availability}.ts`,
   `packages/api/src/routes/orders.ts` (lines 1-60, 95-200), `packages/api/src/routes/lib/
   serializers.ts`, `packages/api/src/routes/admin/lib/errors.ts` (full, 18 lines),
   `packages/api/src/routes/admin/branches.ts` (full, confirmed inline error-helper location),
   `packages/api/src/routes/admin/index.ts` (full, confirmed append-only aggregator pattern),
   `packages/api/src/index.ts` (confirmed `requireAdmin`+`adminCors` mount at `/api/admin`),
   `apps/admin/src/features/branches/**` (full, incl. `deactivate-branch-dialog.tsx` as the
   confirm-dialog generalization source), `apps/admin/src/components/` (dir listing — confirmed no
   composites exist yet).
5. **Next step for a fresh agent picking up mid-execution:** run Step 5 (EXECUTE) — spawn
   `vc-execute-agent` against this plan file with the validate-contract's test gate commands and
   Execute-Agent Instructions (E1/E2 below) in context. Do not re-run RESEARCH/INNOVATE/PVL —
   Decisions 1-3 are locked and the Gate is PASS.

---

## Validate Contract

Status: PASS
Date: 15-07-26
date: 2026-07-15
generated-by: inner-pvl: phase-3

Parallel strategy: parallel-subagents (recommended; executed as a single deep-mode direct-evidence
pass in this session — see Rationale)
Rationale: Signal score 5/7 (S1 — multi-package scope, `packages/api` + `apps/admin`; S2 — new
`/api/admin/products/*` and `/api/admin/categories/*` public route surface added; S4 — phase-program
classification, Phase 3 of 8; S5 — user explicitly requested a deep, evidence-backed validation pass
naming specific correctness spines to nail down; S7 — ~16-19 files in blast radius). Per the
CREATION-vs-read-only-VALIDATE reconciliation rule, this is a read-only two-layer VALIDATE fan-out
(4 Layer-1 dimension checks + 4 Layer-2 section checks, no mid-run coordination needed between
checks) that would normally run as 8 parallel subagents. This validate-agent instance had no
Agent/Task spawning tool available in its runtime, so the fan-out was executed as a single deep-mode
pass: every Layer 1/Layer 2 claim below is backed by a direct `Read`/`grep`/`find` citation against
the real file, not an inference — functionally equivalent rigor to the parallel-subagent plan, run
sequentially. Flagging this transparently rather than silently claiming a fan-out that didn't happen.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Editing a product's `base_price` via the new admin route MUST NOT mutate any existing `order_items.unit_price`/`total_price` row for orders placed before the edit (HARD invariant, Known-Gap banned) | Fully-Automated | `pnpm --filter @jojopotato/api test -- admin-products` (new file, `packages/api/src/lib/__tests__/admin-products.integration.test.ts`) | A |
| AC2 | Categories: create/read/update/soft-delete; slug uniqueness enforced server-side (409 via `isUniqueViolation`, not a raw constraint leak) | Fully-Automated | `pnpm --filter @jojopotato/api test -- admin-categories` (new file, `packages/api/src/lib/__tests__/admin-categories.integration.test.ts`) | A |
| AC3 | Products: create/read/update/soft-delete; `category_id` FK validated (400 on invalid/inactive); `base_price` round-trips cents→numeric→cents with no drift | Fully-Automated | same command as AC1 | A |
| AC4 | Product options: create/read/update/soft-delete per product; `option_type` enum (`size\|flavor\|add_on`) validated server-side; `price_delta` round-trips | Fully-Automated | same command as AC1 | A |
| AC5 | Branch-product-availability: `.onConflictDoUpdate()` upsert on `bpa_branch_product_idx` is idempotent, no duplicate rows on repeated PATCH | Fully-Automated | same command as AC1 | A |
| AC6 | All new `/api/admin/products/*` and `/api/admin/categories/*` routes reject non-admin/non-super_admin callers (403) | Fully-Automated | same command as AC1 and AC2, dedicated `staff`-role fixture via `makeUser('staff')` | A |
| AC7 | Soft-delete only for all four entities — `PATCH .../deactivate` sets the flag false, row survives (row count unchanged) | Fully-Automated | same commands as AC1/AC2 | A |
| AC8 | `apps/admin` categories→products→options→availability CRUD round-trip against a real dev Postgres, with a confirmation step before destructive/price-changing actions | Agent-Probe | Manual walkthrough scenario (see "What This Coverage Does NOT Prove" below for exact judgment points) | A |
| Regression guard | `centsToNumeric` export refactor (Step 1) does not change order-placement money math | Fully-Automated | `pnpm --filter @jojopotato/api test -- orders` (existing `packages/api/src/routes/__tests__/orders.test.ts`) | A |
| Regression guard | error-helper relocation (Step 2) does not change branches CRUD behavior | Fully-Automated | `pnpm --filter @jojopotato/api test -- admin-branches` (existing `packages/api/src/lib/__tests__/admin-branches.integration.test.ts`) | A |
| Decision 3 residual | No realtime/websocket sync on `branch_product_availability` writes — refetch-on-focus only (consistent with the app's existing 30s `staleTime` staleness model, not new debt) | Known-Gap | — (documented; no automated coverage possible within this phase's scope) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated /
Hybrid / Agent-Probe). Known-Gap is never a `strategy:` value — it is the named residual row for the
Decision 3 realtime-sync gap, carried via gap-resolution D.

Legacy line form (retained so existing validate-contract consumers still parse):
- API CRUD (AC1-AC7): Fully-automated: `pnpm --filter @jojopotato/api test -- admin-products` /
  `-- admin-categories` (precondition: local Postgres reachable via `DATABASE_URL`, migrated —
  either `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate`, or this dev machine's
  native Postgres per `all-tests.md`'s Debugging Quick Reference)
- Regression guards: Fully-automated: `pnpm --filter @jojopotato/api test -- orders` and
  `pnpm --filter @jojopotato/api test -- admin-branches`
- App walkthrough (AC8): agent-probe: manual categories→products→options→availability walkthrough in
  the running `apps/admin` dev server against the real API, including a price-edit confirmation step
- Decision 3 realtime-sync gap: known-gap: documented as accepted residual — consistent with the
  app's existing staleness model, not blocked on any future phase (unlike P2's `is_accepting_pickup`
  gap, this one has no external mobile-write consumer yet)

**Failing stubs (Fully-Automated rows only, TDD red-first starting point for EXECUTE):**

```text
test("AC1 — should not mutate order_items.unit_price/total_price when a product's base_price is edited after order placement", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1")
})
test("AC2 — should create/read/update/soft-delete a category and reject a duplicate slug with 409", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC2")
})
test("AC3 — should create/read/update/soft-delete a product, reject invalid category_id, and round-trip base_price with no drift", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3")
})
test("AC4 — should create/read/update/soft-delete a product option and validate option_type enum server-side", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC4")
})
test("AC5 — should upsert branch_product_availability idempotently via onConflictDoUpdate, no duplicate rows", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC5")
})
test("AC6 — should reject a staff-role session with 403 on any /api/admin/products/* or /api/admin/categories/* route", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC6")
})
test("AC7 — should soft-deactivate (is_active/is_available=false) without deleting the row, for all four entities", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC7")
})
```

**Execute-Agent Instructions** (concerns found during VALIDATE that could not be fixed in plan text
alone — follow these while implementing):

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | The plan's cited line numbers for `centsToNumeric` in `orders.ts` are stale (VALIDATE confirmed the real locations differ from the plan text — declaration is at `orders.ts:55-57`, not 49-51; there are THREE call sites, at `orders.ts:175-176` and `orders.ts:291-293`, not two at 150-151). Re-grep (`grep -n "centsToNumeric" packages/api/src/routes/orders.ts`) before editing Step 1 rather than trusting the plan's hardcoded line numbers, and update all three call sites. | Implementation Checklist Step 1 |
| E2 | Exact new test filenames (`admin-products.integration.test.ts`, `admin-categories.integration.test.ts`) must be confirmed once created — vitest's CLI filter is filename-substring based (this bit P2's original AC7 command, corrected in P2's validate-contract E2). Lock the exact command in the EXECUTE report once the files exist; do not assume the names above are final if EXECUTE picks different filenames for any reason. | Implementation Checklist Steps 7-8, running the Fully-Automated gates |
| E3 | At UPDATE PROCESS / closeout, file a backlog note for AC8's Agent-Probe walkthrough-owed (mirroring P2's `adm-002-ac7-manual-walkthrough-owed_NOTE_14-07-26.md` precedent) so the project-wide `apps/admin` E2E-runner gap is tracked per-phase, not only implicitly in this plan's `## Test Infra Improvement Notes`. | UPDATE PROCESS (Step 7) |

Dimension findings:
- Infra fit: PASS — confirmed `routes/admin/index.ts` aggregator is append-only exactly as the plan
  describes (`.use('/branches', branchesRouter)` today; adding `.use('/products', ...)` and
  `.use('/categories', ...)` follows the identical pattern); confirmed the `/api/admin` mount at
  `index.ts:212` (`app.use('/api/admin', adminCors, requireAdmin(auth), adminRouter)`) will
  automatically gate the two new sub-routers with zero additional wiring, matching the plan's claim.
  No container/port/infra surface is touched by this phase.
- Test coverage: PASS — tier assignments (Fully-Automated ×9 rows incl. 2 regression guards,
  Agent-Probe ×1, Known-Gap ×1) match `all-tests.md`'s confirmed test infra (`packages/api`
  vitest+supertest, self-seeding `makeUser(role)` fixture already proven reusable by
  `admin-branches.integration.test.ts`, no `apps/admin` E2E/browser runner yet). AC1's
  snapshot-integrity test is mechanically well-specified: `order_items.unit_price`/`total_price`
  are physically stored `numeric` columns populated once, at order-placement time, from a live read
  of `product.base_price` inside the placement transaction (`orders.ts:141-176`) — there is no live
  join or recomputation at read time, so the invariant is safe by construction; the regression test
  correctly locks this against a future refactor regressing it, rather than testing a fact already
  guaranteed today. 1 CONCERN found and resolved via Execute-Agent Instruction E1 (stale line
  numbers in the plan text, corrected inline in the Implementation Steps section above and here).
- Breaking changes: PASS — purely additive new route files (`admin/products.ts`,
  `admin/categories.ts`) + aggregator append + local serializer/type additions
  (`packages/types` explicitly untouched, matching P2's local-declaration convention); the two
  refactor touchpoints (`orders.ts`'s `centsToNumeric` export, `branches.ts`'s error-helper import
  swap) are both internal-only moves with no external contract change, and both carry an explicit
  regression-guard re-run in the Implementation Checklist and this contract's Test Gates table
  (confirmed: `orders.test.ts` and `admin-branches.integration.test.ts` both exist and are
  runnable today). No schema migration — all four tables (`categories`, `products`,
  `product_options`, `branch_product_availability`) confirmed to already exist with the exact
  columns the plan describes (read all four schema files in full).
- Security surface: PASS — every new route inherits `requireAdmin` at the router-aggregator mount
  (confirmed no per-handler role re-check pattern exists anywhere in `routes/admin/`, consistent
  with P1/P2); AC6 explicitly uses a `staff`-role fixture (not just unauthenticated), the same
  regression class P2's AC6 tests for and the class Phase 1's CORS incident taught the program to
  test directly; all four entities are soft-delete only (confirmed `is_active`/`is_available`
  columns exist on all four tables with no `DELETE` anywhere in the plan's route descriptions);
  slug uniqueness is enforced at the DB level (`categories.slug`/`products.slug` both
  `.unique().notNull()`) with the friendly 409 catch via the shared `isUniqueViolation` (confirmed
  correctly checks both `err.code` and `err.cause?.code` per the durable drizzle gotcha P2
  discovered). No new secrets, no new trust boundary, no CORS change (adminCors already established
  by P1, unmodified by this phase).
- Section A — Backend refactor (Steps 1-2: `centsToNumeric` export + error-helper relocation): PASS
  (1 CONCERN found and resolved via Execute-Agent Instruction E1 — stale line numbers). Mechanical
  feasibility HIGH confidence: `centsToNumeric` confirmed module-private in `orders.ts` (real
  location `55-57`, 3 call sites, not the plan's stated `49-51`/2 sites);
  `handleAdminError`/`isUniqueViolation` confirmed inline-only in `branches.ts` at lines 49/63 with
  zero external consumers (repo-wide grep confirmed). No conflicts against current file state. No
  gaps beyond E1. Highest-risk edit: the `orders.ts` refactor could silently miss a call site if
  grepped incorrectly — mitigated by the explicit `orders.test.ts` regression-guard re-run already
  planned as Step 1's final action.
- Section B — Categories (Step 3-4: composites + categories route/screens): PASS. Mechanical
  feasibility confirmed: `apps/admin/src/components/` currently holds only `admin-home.tsx` and the
  shadcn `ui/` subfolder — no composites exist yet, matching the plan's claim exactly.
  `deactivate-branch-dialog.tsx` read in full and confirmed as a clean generalization source
  (radix `Dialog.Root`/`Portal`/`Overlay`/`Content`/`Title`/`Description` structure, currently
  taking an `AdminBranch`-typed prop that the generic version must replace with
  `title`/`description`/`onConfirm`/`confirmLabel`, exactly as Decision 1 specifies). No gaps or
  conflicts found. Highest-risk edit: the plan's explicit "Categories MUST consume all 3 composites"
  requirement is a hard constraint with no escape hatch documented — low risk since the composites
  are being purpose-built by this same phase before Categories consumes them, so there's no
  version-mismatch risk.
- Section C — Products, options, availability (Step 5-6): PASS. Mechanical feasibility confirmed:
  `products.ts`, `product_options.ts`, and `branch_product_availability.ts` schemas read in full and
  match every field the plan's Public Contracts section describes, including the exact composite
  unique index name `bpa_branch_product_idx` on `(branch_id, product_id)` cited for Decision 3's
  `.onConflictDoUpdate()` target. No gaps found — the per-branch availability toggle grid issuing one
  `PATCH` per toggle (no bulk-upsert endpoint) is an acceptable design for a low-cardinality admin
  screen, not a missing capability. No conflicts found. Highest-risk edit: AC1's snapshot-integrity
  invariant (see Test coverage dimension above) — already correctly sequenced (products route built
  in Step 5, snapshot test written in Step 7, after the route exists to test against).
- Section D — Snapshot-integrity test + remaining CRUD/validation tests (Step 7-9): PASS. Mechanical
  feasibility confirmed: `order_items` schema read in full — `unit_price`/`total_price` are stored
  `numeric(10,2)` columns, not computed/joined at read time; `orders.ts:141-176` confirmed this
  transaction reads `product.base_price` live ONCE at placement time and writes the resulting cents
  value via `centsToNumeric` directly into the `order_items` insert — no later read path recomputes
  from `products.base_price`. This confirms the invariant is safe by construction today; the test
  this phase adds locks it against a future regression, which is the correct framing (not "proving a
  currently-false fact", but "guarding a currently-true fact against silent future breakage"). No
  gaps or conflicts found. This is the single highest-risk test in the entire 8-phase program per
  the umbrella's Program Goal Charter — Known-Gap is correctly banned for it, and the plan's
  sequencing and file-location conventions (mirroring P2's fixture pattern) are sound.

Open gaps:
- Decision 3 realtime-sync residual (`branch_product_availability` writes, no optimistic-concurrency
  guard, refetch-on-focus only): known-gap: documented as accepted residual — consistent with the
  app's existing 30s `staleTime` staleness model; no external mobile-write consumer exists yet
  (unlike P2's `is_accepting_pickup` gap, which is blocked on STAFF-004). Revisit if a future phase
  introduces a second writer to `branch_product_availability`.
- AC8 Agent-Probe walkthrough: not yet performed (this is expected — VALIDATE runs before EXECUTE).
  Execute-Agent Instruction E3 requires a dedicated backlog note be filed at UPDATE PROCESS mirroring
  P2's `adm-002-ac7-manual-walkthrough-owed_NOTE_14-07-26.md`, so the walkthrough-owed status is
  tracked per-phase rather than only inside this plan's prose.
- Plan-text line-number drift for `centsToNumeric` (Execute-Agent Instruction E1): non-blocking,
  resolved via re-grep at EXECUTE time, not a design or correctness issue.

What This Coverage Does NOT Prove:
- AC1-AC7 (Fully-Automated, supertest against a real local Postgres): prove server-side CRUD
  correctness, guard enforcement, money round-tripping, and the snapshot-integrity invariant under a
  Node/Express/supertest harness. They do NOT prove anything about the `apps/admin` browser UI
  rendering these responses correctly, nor about the per-branch availability toggle grid's actual
  click-through behavior, nor about real browser cookie/CORS behavior beyond what Phase 1's existing
  CORS regression tests already cover (this phase adds no new CORS surface).
- AC8 (Agent-Probe manual walkthrough): proves the categories→products→options→availability screens
  function together against a real running API in one operator's manual pass, including that a
  price-changing action shows a confirmation step. It does NOT prove behavior across browsers,
  concurrent-admin-session conflicts (see the Decision 3 Known-Gap above), or repeatable regression
  over time — there is no automated re-run of this scenario, so a future refactor could silently
  break it with no gate catching it (tracked as the project-wide `apps/admin` E2E-runner gap, not
  fixable within this phase).
- Known-Gap (Decision 3 realtime-sync residual): proves nothing — it is an explicitly unchecked
  residual, not a passing gate. No concurrency test exists or is claimed.
- The two regression-guard rows (`orders.test.ts`, `admin-branches.integration.test.ts`) prove the
  Step 1/2 refactors did not change existing behavior. They do NOT prove the NEW products/categories
  routes are correct — that is what AC1-AC7 are for.
- None of the above prove anything about Phases 4-7's reuse of the CRUD shape and the 3 newly
  extracted composites — that reuse is validated independently when those phases run their own PVL.

Gate: PASS (no FAILs; 0 unresolved CONCERNs — 1 CONCERN found during V2/V3 fan-out, resolved
directly in this contract via Execute-Agent Instruction E1)
Accepted by: N/A — Gate is PASS; no CONDITIONAL concerns remain requiring explicit user/session
acceptance. The Decision 3 Known-Gap and the AC8-owed/backlog-note items are pre-classified residuals
per the plan's own design and Execute-Agent Instruction E3, not CONCERNs needing sign-off.
