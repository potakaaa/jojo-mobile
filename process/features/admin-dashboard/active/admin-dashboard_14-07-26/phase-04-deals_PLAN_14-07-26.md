---
name: plan:admin-phase-04-deals
description: "Admin Dashboard Phase 4 — Deals CRUD (deals + deal_products + deal_branches junctions), ADM-004 #42"
date: 15-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 4
---

# Phase 4 — Deals CRUD (ADM-004, #42)

**Date**: 15-07-26 (PLAN-SUPPLEMENT pass — RESEARCH + INNOVATE resolved)
**Complexity**: COMPLEX (phase-program phase)
**Status**: 🔨 PLAN-SUPPLEMENTED — ready for PVL (Step 4)

Depends on: Phase 2 (Branches CRUD, ✅ VERIFIED) and Phase 3 (Products/Categories CRUD, ✅ VERIFIED)
— deals reference both products (via `deal_products`) and branches (via `deal_branches`); requires
the shared `requireAdmin` middleware + `/api/admin` mount from Phase 1.

Umbrella: `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`

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
- `deals.discount_value` is `numeric(10,2)` and **nullable** (`deals.ts:28` — no `.notNull()`).
  Which deal types require it is an app-level rule (D5 below), not a DB constraint.
- `deals.start_at` / `deals.end_at` are both `timestamp(...).notNull()` (`deals.ts:35-36`) — no DB
  constraint enforces `end_at > start_at`. This must be enforced app-side.
- `deals.is_active` is `boolean().default(true).notNull()` (`deals.ts:39`) — soft-delete/deactivate
  target, per the umbrella's Global Constraint (prefer `is_active` over hard-delete).
- `deal_products` and `deal_branches` are pure many-to-many join tables (`id`, `deal_id`, FK'd
  column) each with a `uniqueIndex` on the pair (`deal_products.ts:16`, `deal_branches.ts:16`) —
  DB itself rejects duplicate attach rows via `NO ACTION` FKs; the route layer surfaces that as a
  clean 409, never a raw Postgres constraint-violation leak.
- `coupons` (`packages/api/src/db/schema/coupons.ts:9-25`) has a nullable `deal_id` FK
  (`coupons.ts:16`, Drizzle default `NO ACTION` — confirmed no `onDelete` specified) and a
  `status` enum (`available | used | expired`, `coupons.ts:7,19`, default `'available'`).

---

## Decision Summary (RESEARCH + user-approved INNOVATE, 15-07-26)

### D1 — Coupon cascade on deactivation: CONFIGURABLE at deactivation time (USER-APPROVED)

This resolves the plan's prior OPEN QUESTION and becomes **AC9** (concrete, below).

**Chosen:** `POST /api/admin/deals/:id/deactivate` accepts an optional body
`{ couponPolicy?: 'leave' | 'expire' }`, Zod-validated (`z.enum(['leave','expire']).optional()`),
**default `'leave'`** when omitted.

- **`'leave'`** (default): flips `is_active=false` only. Zero coupon writes. This is RESEARCH
  Option 1 — existing `available` coupons keep honoring their own `expires_at`.
- **`'expire'`**: inside a SINGLE `db.transaction()`, runs
  `UPDATE coupons SET status='expired' WHERE deal_id=:id AND status='available'` **and** flips
  `is_active=false` atomically. This is RESEARCH Option 2, now gated behind an explicit admin
  choice instead of an unconditional default. **This is the first admin-initiated coupon-state
  mutation in the codebase and the first explicit `db.transaction()` in any `routes/admin/*` file
  — call out both as deliberate new precedents (not silent scope creep) in the route file's
  header comment, mirroring how `errors.ts` documents the P2/P3 precedents it set.**
- Response body: `{ deal: AdminDeal, outstandingCouponsAffected: number }` — the count of coupons
  actually transitioned to `expired` (0 when `couponPolicy: 'leave'` or omitted).
- Read-path support for the UI confirm dialog: `GET /api/admin/deals/:id` response includes an
  additive `outstandingCoupons: number` field (count of `status='available'` coupons for this
  deal). **Chosen surface: inline on the existing detail read, not a separate count endpoint** —
  lowest additional route-surface, and the admin UI already fetches the deal detail before
  offering the deactivate action, so no extra round trip is introduced.

**REJECTED alternatives (recorded per the plan's own contract):**
- *Per-deal `coupon_cascade_policy` enum column* — needs a migration; deferred. Add only when a
  deal's cascade policy must be FIXED AT CREATION time, independent of whichever admin happens to
  deactivate it later. One-line backlog pointer: this decision itself (D1) is the trigger — if a
  future phase needs a creation-time-fixed policy, start from this paragraph.
- *Global env-var policy* — too coarse; different deals plausibly want different outcomes (e.g. a
  mistakenly-created deal vs. a legitimately-expiring promo), and a single env flag can't express
  that per-instance.
- *Hard-block deactivation until coupons resolved* — its only real value ("make the admin look
  before leaping") is already delivered by the new `outstandingCoupons` count shown in the confirm
  dialog; Cancel in that dialog is the block. A hard server-side block adds friction with no extra
  safety once the count is visible.

**Safety confirmation:** neither cascade path touches `order_items` or `star_transactions` (the
umbrella's hard-banned invariants — see umbrella `## Hard Safety Constraints`). `is_active` stays
soft-delete; `deals` rows are never `DELETE`d. `coupons.status` is the ONLY table D1 ever writes
beyond `deals.is_active`, and only the `available → expired` transition, only for rows already
scoped to `deal_id = :id`.

### D2 — Serializer: local `AdminDeal` + `serializeAdminDeal()`, NOT an extension of the public serializer

**Chosen:** declare a new, separate `AdminDeal` interface and `serializeAdminDeal()` function as
LOCAL additions to `packages/api/src/routes/lib/serializers.ts`, following the exact
`AdminBranch`/`serializeAdminBranch` local-declaration convention P2 established and P3 reused for
its admin-facing DTOs. Do **NOT** extend or branch the existing public `serializeDeal`/`ApiDeal`
(`serializers.ts:375-458`).

**Why:** the public serializer intentionally collapses `discountValue` polymorphically per
`deal_type` (percent vs cents vs `0`) and adds a mobile-only `discountLabel` string
(`serializers.ts:369-373`'s VALUE-UNIT NOTE). Admin editing needs the RAW `discount_value` field
(so the edit form pre-fills the actual stored number, not a derived label) and cents-at-boundary
consistency applied UNCONDITIONALLY via `numericToCents` — no per-`deal_type` branching — so the
admin API contract stays uniform across all 6 deal types the way every other admin serializer
already is.

Concrete differences `serializeAdminDeal()` must have vs. the public one:
- Returns raw `discountValue: number | null` (cents, via `numericToCents`, unconditionally — no
  `deal_type`-based collapsing, no `discountLabel`).
- Returns `isActive: boolean` (the public serializer omits this — mobile only ever sees active
  deals via the existing `deals.ts` public route's filter).
- List route (`GET /api/admin/deals`) returns **ALL** deals including `is_active=false` and
  out-of-window (start/end outside "now") — mirrors P3's `admin/products.ts:85` "returns all incl.
  inactive" behavior. The admin list is a management view, not a customer-facing feed; it must NOT
  reuse the public route's active/in-window filter.

**Open Question #2 resolution (packages/types):** do **NOT** add `Deal`/`DealType`/
`DealProductLink`/`DealBranchLink` to `packages/types/src/admin.ts`. Per the umbrella's "second
consumer" rule and P2/P3's proven local-declaration convention, no genuine second cross-boundary
consumer of an admin-deal DTO exists yet (only `apps/admin` reads it, and it does so via the same
route-response-shape pattern every other admin feature uses — no shared-package import needed).
The prior plan draft's Touchpoints line listing `packages/types/src/admin.ts` is stale and is
REMOVED in this supplement.

### D3 — Junction writes: imperative per-row attach/detach, no upsert

**Chosen:**
- `POST /api/admin/deals/:id/products` (and the `.../branches` sibling): first FK-existence
  pre-check the referenced product/branch id (mirrors P3's `admin/products.ts:401-410`
  FK-pre-check-before-insert pattern for `branch_product_availability` — `404 AdminApiError` if
  the product/branch id doesn't resolve to a real row), then a plain `db.insert(deal_products)
  .values(...)`. The insert is wrapped in the shared `isUniqueViolation(err)` catch
  (`errors.ts:44-49`) → `409 AdminApiError('Product already attached to this deal')`. This is a
  **clean 409 on re-attach, never a silent upsert** — matches AC4/AC5's exact wording ("re-attaching
  the same product+deal pair is rejected cleanly").
- `DELETE /api/admin/deals/:id/products/:productId` (and `.../branches/:branchId`):
  `db.delete(deal_products).where(and(eq(deal_products.deal_id, id), eq(deal_products.product_id,
  productId))).returning()`; an empty `returning()` array → `404 AdminApiError('Attachment not
  found')`.
- Both endpoints reuse `handleAdminError`/`isUniqueViolation` from
  `routes/admin/lib/errors.ts:29-49` (confirmed signature — checks both `err.code` and
  `err.cause?.code` for pg `23505`, per the durable drizzle gotcha P2 discovered and P3 reused
  verbatim) — zero reimplementation.

**REJECTED:** a full-replace ("set the whole product list for this deal in one PATCH") or an
`onConflictDoUpdate()` upsert (P3's Decision 3 pattern for `branch_product_availability`) — the
umbrella's own D3 rationale for P3 was that availability toggling is idempotent-by-nature
(`is_available: true/false` on an existing row). Deal↔product/branch attachment is not a toggle —
it's a presence/absence relationship where "attach the same pair twice" is a genuine caller error
worth surfacing as 409, not silently swallowing into a no-op upsert. Full-replace was rejected
because it would require the client to always resend the complete list, which doesn't fit the
"add one product to the multi-select chip editor" UI interaction (D4) as cleanly as an imperative
attach/detach pair.

### D4 — Shared UI composite extraction: EXTRACT `data-table` + `form-dialog` now; retrofit deferred (lower regression risk)

Deals is the umbrella's own flagged **4th CRUD consumer** and the explicit re-eval trigger named in
P3's Decision 1 deferral (`phase-03-products_PLAN_14-07-26.md:74-79`) and the umbrella's own
tracking (`admin-dashboard_UMBRELLA_PLAN_14-07-26.md:370`). 3 composites already exist
(`query-states.tsx`, `confirm-dialog.tsx`, `page-header.tsx`, extracted by P3) proving the
"second-consumer" extraction pattern works; branches/categories/products are 3 proven-stable
hand-rolled precedents behind them.

**Chosen — extract now, retrofit deferred (Option b, with explicit justification, not speculation):**
- Extract `apps/admin/src/components/data-table.tsx` (generic sortable/paginated table shell —
  column defs + row-render slot) and `apps/admin/src/components/form-dialog.tsx` (generic
  create/edit modal shell — title/fields-slot/submit/cancel) into `apps/admin/src/components/`,
  joining the 3 existing composites.
- **Deals CONSUMES both new composites** for its list screen (`data-table`) and its
  create/edit deal form (`form-dialog`) — this is the real second-consumer proof the umbrella
  program has been building toward.
- **Retrofitting the 3 already-shipped, already-✅-VERIFIED domains (branches, categories,
  products) onto the new composites is explicitly NOT done in this phase.** Rationale for choosing
  (b) over (a):
  1. All 3 existing domains are ✅ VERIFIED with real passing regression coverage (P2: 134/134 →
     P3: 183/183, 0 regressions each time). Retrofitting them here would touch already-closed,
     already-archived-report phases purely for stylistic consistency, widening this phase's blast
     radius into 3 unrelated feature folders for zero new user-facing capability.
  2. This directly satisfies the umbrella's own stated boundary: "foundation proof" work (P2/P3
     building the pattern) is separate from "expansion" work (P4 consuming it). Retrofitting is
     expansion-of-cleanup, not expansion-of-capability — it belongs in its own dedicated cleanup
     task once the pattern has a 2nd real consumer to prove it against (this phase provides that
     proof).
  3. Lower regression risk: this phase's `packages/api` test suite baseline (183/183) has zero
     touchpoints in `branches.ts`/`categories.ts`/`products.ts` admin route files or their `apps/admin`
     screens under this decision — a pure-composite-extraction retrofit of 3 domains would need its
     own full-suite + full-typecheck regression pass with no functional payoff this phase, which is
     a worse cost/benefit than filing a follow-up.
- **Addressing the "single-consumer abstraction" smell directly** (since after this phase both
  composites technically have exactly ONE real consumer — Deals): the justification is NOT
  speculative reuse. It is the same "3 proven-stable hand-rolled precedents already exist and prove
  the shape is reusable" argument P3 used for its 3 composites — `data-table`/`form-dialog` are
  being extracted FROM a genuinely reusable shape that 3 domains already hand-rolled independently
  (branches/categories/products all have a list table + a create/edit form), not invented ahead of
  need. A follow-up backlog note is filed (see Backlog below) to retrofit the 3 existing domains
  onto the new composites — this makes the "1 consumer" state explicitly temporary and tracked, not
  silently accepted as permanent.
- **Recommended path chosen: (b)** — deals-only consumption this phase, retrofit filed as a
  dedicated backlog follow-up task (not a vague TODO).

**Deal-feature-local (NOT extracted, per the P3 precedent for feature-specific sub-editors):** the
product/branch attach-editor (a multi-select-with-remove-chips UI for `deal_products`/
`deal_branches`) is a genuinely new interaction shape — nothing in branches/categories/products has
a many-to-many junction editor. Mirrors how P3 kept its per-product option list and per-branch
availability grid feature-local rather than forcing them into a shared composite. If a 5th domain
(Phase 5 Rewards, Phase 6 Orders) needs the same chip-multi-select shape, THAT is the real
second-consumer trigger to extract it — not speculatively building it now.

### D5 — App-side validation constraints (Zod, no DB constraint backs these)

- **`end_at > start_at`** — Zod `.refine()` on the base create schema. **PATCH cross-field edge
  case (explicit AC, see AC10):** a `PATCH` payload may supply only `start_at` OR only `end_at`
  (partial update). A `.refine()` on the raw partial body cannot correctly validate an isolated
  single-field change (e.g. `{ end_at: '2020-01-01' }` alone looks internally consistent to a naive
  refine). **Resolution:** the `PATCH` handler fetches the existing row first, merges the partial
  body onto the fetched row's `start_at`/`end_at` fields, THEN validates the MERGED result against
  the same `end_at > start_at` rule before issuing the `UPDATE`. Reject with 400 if the merged
  result is invalid, even if the raw partial payload looked fine in isolation.
- **`deal_type`** — `z.enum([...6 values])` validated before ever reaching the Postgres enum
  (mirrors P3's `option_type` enum validation, `admin-products.integration.test.ts`'s AC4
  precedent).
- **`discount_value` requiredness** — nullable in schema (`deals.ts:28`); app-level rule:
  `percentage_discount` and `fixed_discount` REQUIRE a non-null, non-negative `discount_value`
  (Zod `.refine()` conditional on `deal_type`); `buy_one_take_one | free_item | free_upgrade |
  bundle` ALLOW `discount_value` to be `null` (these deal types don't carry a simple numeric
  discount — their mechanics are described by `title`/`description` and the attached
  products/branches, consistent with the public serializer's existing 0-for-complex-types
  collapsing behavior at `serializers.ts:369-373`).
- **List filter** — `GET /api/admin/deals?isActive=true|false` optional filter, mirroring P3's
  `admin/products.ts`'s `?categoryId=` precedent (`Public Contracts` above).

---

## Cross-Cutting Compliance

Per the umbrella plan's 4 mandatory per-phase gates:

1. **Modularity** — one new route file `packages/api/src/routes/admin/deals.ts`, mounted under the
   existing `adminRouter` aggregator (`routes/admin/index.ts`, append-only — the FOURTH confirmed
   consumer after P1's `users.ts`, P2's `branches.ts`, P3's `categories.ts`/`products.ts`). One new
   app feature folder `apps/admin/src/features/deals/**`. Reuses `AdminApiError`,
   `handleAdminError`, `isUniqueViolation` (from `routes/admin/lib/errors.ts`, unchanged since P3),
   `numericToCents`/`centsToNumeric` (from `routes/lib/serializers.ts`, exported since P3) — zero
   per-domain reimplementation.
2. **Clarity** — Zod `safeParse` request validation mirroring `orders.ts`/P2/P3 convention;
   response envelope `{ deal }` / `{ deals }` matching the existing `{resource}`/`{resources}`
   family; typed errors via `AdminApiError`; serializer helpers live in `routes/lib/serializers.ts`,
   never inlined in handlers; kebab-case files, camelCase functions, PascalCase components.
3. **Safety** — deactivate via `is_active` toggle only, never a hard `DELETE` on a `deals` row with
   `deal_products`/`deal_branches`/`coupons` references. D1's `couponPolicy: 'expire'` path is the
   phase's primary Safety-flagged surface — it is explicit opt-in (never default), atomic
   (single transaction), and scoped ONLY to `coupons.status` rows already pointing at this
   `deal_id` — see Security section below for the full STRIDE-style reasoning.
4. **Security** — `/api/admin/deals/*` inherits `requireAdmin` at the router-mount level (no
   per-handler re-check); deals CRUD is **admin-level, NOT super_admin-only** (unlike P1's role-
   management route) — both `admin` and `super_admin` roles may create/edit/deactivate deals and
   manage their coupon cascade, consistent with P2/P3's admin-level (not super_admin-only) CRUD
   surfaces. All inputs (enum membership, date ordering, numeric ranges, `couponPolicy` enum) are
   Zod-validated server-side before touching Postgres.
5. **UI component modularity & reusability** — see D4. Deals consumes the newly-extracted
   `data-table`/`form-dialog` plus the existing `query-states`/`confirm-dialog`/`page-header`
   (5 of 5 composites now have a real consumer). The junction chip-multi-select editor stays
   feature-local per the D4 second-consumer rule. Token-driven styling only, no hardcoded
   colors/spacing.

---

## Touchpoints

- `packages/api/src/routes/admin/deals.ts` (new) — CRUD routes for deals + attach/detach
  products/branches + deactivate-with-coupon-policy route
- `packages/api/src/routes/admin/index.ts` (modified, append-only) — mount `dealsRouter` at
  `/deals`, matching the existing P2/P3 append pattern (`adminRouter.use('/deals', dealsRouter)`)
- `packages/api/src/routes/lib/serializers.ts` (modified, additive) — add local `AdminDeal`
  interface + `serializeAdminDeal()` (D2); reuse existing `numericToCents`/`centsToNumeric`,
  no new money-helper code
- `apps/admin/src/components/data-table.tsx` (new, D4)
- `apps/admin/src/components/form-dialog.tsx` (new, D4)
- `apps/admin/src/features/deals/**` (new) — deal list (`data-table`), deal create/edit form
  (`form-dialog`), product/branch multi-select chip attach/detach UI (feature-local)
- `apps/admin/src/routes/(dashboard)/deals.tsx` (new) — thin `<Outlet/>` layout, applying the
  durable TanStack Start nested-detail-route gotcha (see Durable Gotcha Carry-Forwards below)
  **from the start**, not retrofitted after a bug like P3's `products.tsx` was
- `apps/admin/src/routes/(dashboard)/deals.index.tsx` (new) — deal list screen
- `apps/admin/src/routes/(dashboard)/deals.$dealId.tsx` (new) — deal detail/edit screen with the
  attach/detach chip editors
- Read-only reference (no write access from this phase): `packages/api/src/db/schema/coupons.ts`
  (D1's `status` transition target — the only cross-table write this phase performs outside
  `deals`/`deal_products`/`deal_branches`)
- **NOT touched** (explicitly, per D2/D4): `packages/types/src/admin.ts` (no new exports — D2),
  `apps/admin/src/features/{branches,categories,products}/**` (D4 retrofit deferred to backlog)

## Public Contracts

Route file/method conventions follow P2/P3 exactly: `Router()`, Zod
`createDealSchema`/`updateDealSchema` (`.partial()` for PATCH), `z.uuid()` pre-validation on path
params (404 on malformed id before hitting the DB), `{deal}`/`{deals}` envelopes, soft-delete only
via a dedicated `POST .../deactivate` route (never a generic `DELETE`).

- `GET /api/admin/deals` — list ALL deals incl. inactive/out-of-window (admin view, per D2), optional
  `?isActive=true|false` filter → `200 { deals: AdminDeal[] }`
- `GET /api/admin/deals/:id` — single deal incl. attached product/branch id arrays and
  `outstandingCoupons: number` (D1) → `200 { deal: AdminDeal }`, `404` if id doesn't resolve
- `POST /api/admin/deals` — create deal; validates `deal_type` enum (D5), `end_at > start_at` (D5),
  conditional `discount_value` requiredness by `deal_type` (D5), non-negative
  `discount_value`/`minimum_order_amount` → `201 { deal: AdminDeal }`, `400` on any validation
  failure
- `PATCH /api/admin/deals/:id` — update deal fields (NOT `is_active` — deactivation is its own
  route, D1); merge-then-validate for `start_at`/`end_at` partial updates (D5) → `200 { deal:
  AdminDeal }`, `400` on validation failure, `404` if id doesn't resolve
- `POST /api/admin/deals/:id/deactivate` — soft-deactivate; body
  `{ couponPolicy?: 'leave' | 'expire' }` (Zod-validated, default `'leave'`, D1) →
  `200 { deal: AdminDeal, outstandingCouponsAffected: number }`, `404` if id doesn't resolve
- `POST /api/admin/deals/:id/products` — attach a product (D3); body `{ productId: string }` →
  `201 { attached: true }`, `404` if product id doesn't resolve, `409` on duplicate attach
- `DELETE /api/admin/deals/:id/products/:productId` — detach a product (D3) →
  `204`, `404` if the pair isn't currently attached
- `POST /api/admin/deals/:id/branches` — attach a branch (D3); body `{ branchId: string }` →
  `201 { attached: true }`, `404` if branch id doesn't resolve, `409` on duplicate attach
- `DELETE /api/admin/deals/:id/branches/:branchId` — detach a branch (D3) →
  `204`, `404` if the pair isn't currently attached
- All routes: `admin`/`super_admin` only (server-side `requireAdmin`, inherited at mount — D4
  Cross-Cutting §4), `403` for `staff`/`customer` roles

All responses use `{ deal }` / `{ deals }` envelopes (D2). All errors use `AdminApiError` thrown
and caught by the shared `handleAdminError`. All money fields (`discountValue`,
`minimumOrderAmount`) are integer cents in requests/responses; conversion happens only in the
route layer via `numericToCents`/`centsToNumeric`, never in `apps/admin`.

---

## Blast Radius

- **Packages touched:** `packages/api` (1 new admin route file, `admin/index.ts` append,
  `serializers.ts` additive extension — no existing serializer function modified), `apps/admin`
  (2 new shared composites + 1 new feature folder + 3 new route files). `packages/types`
  explicitly NOT touched (D2).
- **Risk class:** none of the 6 program-level high-risk classes apply directly (no auth/billing/
  schema-migration/public-external-API-breaking-change/deploy/secrets change) — this is an
  internal admin CRUD surface behind `requireAdmin`. The D1 `couponPolicy: 'expire'` write path is
  the phase's one genuinely novel risk surface (first admin-initiated write to `coupons`, first
  `db.transaction()` in `routes/admin/*`) and is treated as a hard safety-review item per
  Cross-Cutting Compliance §3 — not classified as a schema/migration/billing risk class, since no
  schema change occurs and `coupons.status` transitions are an existing, already-defined column
  (this phase is the first ADMIN-initiated writer to it, not the first writer overall).
- **No migration needed** — `deals`, `deal_products`, `deal_branches`, `coupons` schema already
  exists.
- **File count estimate:** ~14-17 new/modified files (1 new route file, 1 modified `admin/
  index.ts`, 1 modified `serializers.ts`, 2 new shared composites, 1 new admin feature folder with
  several screen/hook/lib files, 3 new TanStack Start route files) — MEDIUM blast radius, single
  package family (api + admin app), no schema migration.
- **Shared-surface note (for umbrella Pre-PVL Conflict Resolution):** this phase modifies
  `packages/api/src/routes/admin/index.ts` (P1-created, extended by P2/P3, now extended again —
  purely additive `.use('/deals', dealsRouter)` line, zero conflict risk with any file-level
  content P2/P3 already wrote) and `packages/api/src/routes/lib/serializers.ts` (P3-extended,
  additive-only new interface + function, no existing export modified). None of these are
  concurrently-claimed by another active phase per the umbrella's Phase Ordering (P5-P7 have not
  started); flag as `parallel-safe` (additive-only) at the umbrella's Pre-PVL Conflict Resolution
  step if other phases begin concurrent execution before this phase's EXECUTE lands.

---

## Implementation Checklist (Implementation Steps)

1. **Build `admin/deals.ts` route — CRUD core**: Zod schemas (`createDealSchema` with `deal_type`
   enum + `end_at > start_at` `.refine()` + conditional `discount_value` requiredness per D5;
   `updateDealSchema` as `.partial()`); `GET`/`POST`/`PATCH` handlers following the P2/P3
   `z.uuid()`-path-param + `safeParse`-body + `AdminApiError` conventions; PATCH implements the
   fetch-merge-validate flow for `start_at`/`end_at` (D5). List route supports `?isActive=` filter,
   returns ALL deals incl. inactive (D2).
2. **Build `serializeAdminDeal()`** in `routes/lib/serializers.ts` (D2) — local `AdminDeal`
   interface, raw `discountValue`/`minimumOrderAmount` via `numericToCents`, `isActive` field,
   attached product/branch id arrays, `outstandingCoupons` count (D1) computed via a `COUNT(*)`
   query against `coupons WHERE deal_id = :id AND status = 'available'` inside the `GET :id`
   handler (not inside the serializer itself — serializer stays a pure row→DTO mapper, matching
   P2/P3 convention; the count is fetched alongside the deal row and passed in).
3. **Build the deactivate route** (D1): `POST .../deals/:id/deactivate`, Zod-validates
   `{ couponPolicy?: 'leave'|'expire' }` defaulting to `'leave'`; `'leave'` path is a single
   `UPDATE deals SET is_active=false`; `'expire'` path wraps both the coupon `UPDATE` and the
   `deals` `UPDATE` in one `db.transaction()`, returns the count of rows actually transitioned.
   Document both new precedents (first admin coupon write, first admin-route transaction) in the
   route file's header comment (mirrors `errors.ts`'s own precedent-documentation style).
4. **Build the junction attach/detach routes** (D3): FK-existence pre-check → `db.insert()` wrapped
   in `isUniqueViolation` → 409 catch for attach; `db.delete().returning()` → 404-on-empty for
   detach. Four handlers total (products attach/detach, branches attach/detach), sharing a small
   internal helper to avoid duplicating the pre-check/catch logic across the 2 domains.
5. **Mount `dealsRouter`** in `routes/admin/index.ts` (append-only, `.use('/deals', dealsRouter)`).
6. **Extract `data-table.tsx` and `form-dialog.tsx`** into `apps/admin/src/components/` (D4) —
   generic column-defs + row-render-slot table shell and generic title/fields-slot/submit/cancel
   modal shell, informed by (but not copy-pasted from) the 3 existing hand-rolled list+form pairs
   in `features/{branches,categories,products}/`.
7. **Build `apps/admin/src/features/deals/**`**: list screen (consumes `data-table` + `page-header`),
   create/edit form (consumes `form-dialog` — `deal_type` select, date-range inputs, discount
   fields conditional on `deal_type` per D5), product/branch multi-select chip attach/detach editor
   (feature-local, D4), deactivate confirm dialog (consumes existing `confirm-dialog`, showing
   `outstandingCoupons` count + the `couponPolicy` radio choice per D1).
8. **Wire the 3 new TanStack Start routes** (`deals.tsx` thin `<Outlet/>` layout,
   `deals.index.tsx` list, `deals.$dealId.tsx` detail/edit) — apply the nested-detail-route
   `<Outlet/>` split from the start (Durable Gotcha Carry-Forwards, below), not retrofitted.
9. **Write automated tests** per Verification Evidence below (TDD red-first — write the failing
   stubs, confirm red, then implement each handler to green).
10. **Run regression checkpoint** against Phase 2 (branches) and Phase 3 (products/categories)
    surfaces this phase's attach/detach FK pre-checks depend on: re-run
    `admin-branches.integration.test.ts` and `admin-products.integration.test.ts` /
    `admin-categories.integration.test.ts` once, confirming the full `packages/api` suite is still
    green with 0 regressions (baseline: 183/183).

Test procedure: run `pnpm --filter @jojopotato/api test admin-deals` (see Test Infra Improvement
Notes for the `--` CLI-flag gotcha) after each checklist section; do not batch all gates to the
end, per `process/context/tests/all-tests.md`.

---

## Acceptance Criteria

1. `POST /api/admin/deals` with a valid `deal_type` (one of the 6 enum values, `deals.ts:13-20`),
   `end_at > start_at`, and a `discount_value` present when required by `deal_type` (D5) creates a
   deal and returns `{ deal: AdminDeal }` with 201 — proven by: `deal-create-happy-path` | strategy:
   Fully-Automated.
2. `POST /api/admin/deals` with `end_at <= start_at` is rejected with 400 — proven by:
   `deal-create-rejects-invalid-date-range` | strategy: Fully-Automated.
3. `POST /api/admin/deals` with an invalid `deal_type` string is rejected with 400 (Zod enum
   validation before Postgres) — proven by: `deal-create-rejects-invalid-deal-type` | strategy:
   Fully-Automated.
4. `POST /api/admin/deals/:id/products` attaches a product (writes `deal_products`,
   `deal_products.ts:5-17`); re-attaching the same product+deal pair is rejected cleanly with 409
   (not a raw Postgres unique-violation) per `deal_products.ts:16` — proven by:
   `deal-product-attach-and-duplicate-reject` | strategy: Fully-Automated.
5. `POST /api/admin/deals/:id/branches` attaches a branch (writes `deal_branches`,
   `deal_branches.ts:5-17`); same duplicate-handling requirement as AC4, per `deal_branches.ts:16` —
   proven by: `deal-branch-attach-and-duplicate-reject` | strategy: Fully-Automated.
6. `DELETE .../products/:productId` and `DELETE .../branches/:branchId` detach cleanly (204); a
   detach call for a pair that isn't attached returns 404 — proven by:
   `deal-junction-detach-and-not-found` | strategy: Fully-Automated.
7. Only `admin`/`super_admin` roles can call any `/api/admin/deals/*` write route; `staff` and
   `customer` roles are rejected with 403 (mirrors `requireStaff`/P2's AC6/P3's AC6 role-check
   pattern) — proven by: `deal-route-authz-rejection` | strategy: Fully-Automated.
8. Deactivating a deal with `couponPolicy: 'leave'` (or omitted) never hard-deletes the row, never
   mutates `coupons`, and never mutates unrelated deals/products/branches — proven by:
   `deal-deactivate-leave-policy-no-coupon-writes` | strategy: Fully-Automated.
9. **[RESOLVED — was PENDING PLAN-SUPPLEMENT]** Deactivating a deal with `couponPolicy: 'expire'`
   atomically (a) flips `is_active=false` and (b) transitions every `available`-status coupon for
   that `deal_id` to `expired`, returning the correct `outstandingCouponsAffected` count; a deal
   with zero outstanding coupons returns `outstandingCouponsAffected: 0` with no error; the
   transaction is all-or-nothing (a forced failure mid-transaction leaves BOTH `deals.is_active`
   and all `coupons.status` rows unchanged) — proven by:
   `deal-deactivate-expire-policy-atomic-cascade` | strategy: Fully-Automated.
10. `PATCH /api/admin/deals/:id` with a partial body supplying only `start_at` OR only `end_at`
    correctly validates against the MERGED (existing + partial) `start_at`/`end_at` pair, not the
    partial body in isolation — a partial update that would violate `end_at > start_at` once merged
    with the existing row is rejected 400, even though the raw partial payload looks internally
    consistent — proven by: `deal-patch-partial-date-merge-validation` | strategy: Fully-Automated.
11. Admin UI: deal list (`data-table`) and create/edit form (`form-dialog`) round-trip all fields
    incl. the product/branch multi-select chip attach/detach editor; the deactivate confirm dialog
    shows the `outstandingCoupons` count and the leave/expire radio choice before submitting —
    proven by: `admin-deals-ui-manual-walkthrough` | strategy: Agent-Probe (no `apps/admin`
    browser/E2E runner exists yet — project-wide gap, matching P2 AC7/P3 AC8 precedent).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `deal-create-happy-path` — valid 6-type enum, valid date range, correct conditional `discount_value` → 201 + correct shape | Fully-Automated | AC1 |
| `deal-create-rejects-invalid-date-range` — `end_at <= start_at` → 400 | Fully-Automated | AC2 |
| `deal-create-rejects-invalid-deal-type` — invalid enum string → 400 | Fully-Automated | AC3 |
| `deal-product-attach-and-duplicate-reject` — attach writes `deal_products` row; re-attach same pair → 409 | Fully-Automated | AC4 |
| `deal-branch-attach-and-duplicate-reject` — attach writes `deal_branches` row; re-attach same pair → 409 | Fully-Automated | AC5 |
| `deal-junction-detach-and-not-found` — detach removes junction row (204); detach non-attached pair → 404 | Fully-Automated | AC6 |
| `deal-route-authz-rejection` — `staff`/`customer` role session (via `makeUser(role)`) → 403 on all deal write routes | Fully-Automated | AC7 |
| `deal-deactivate-leave-policy-no-coupon-writes` — `couponPolicy: 'leave'` (and omitted-body default) toggles `is_active` only, zero `coupons` row mutations | Fully-Automated | AC8 |
| `deal-deactivate-expire-policy-atomic-cascade` — `couponPolicy: 'expire'` atomically flips `is_active` + expires all `available` coupons for the deal; correct `outstandingCouponsAffected` count; zero-outstanding case returns count 0 with no error | Fully-Automated | AC9 |
| `deal-patch-partial-date-merge-validation` — PATCH with only `start_at` or only `end_at` validates against the merged row, rejecting a merge-invalid result even when the raw partial payload looks valid alone | Fully-Automated | AC10 |
| `admin-deals-ui-manual-walkthrough` — create deal → attach products/branches via chip editor → edit → deactivate with `outstandingCoupons` count visible → choose leave/expire | Agent-Probe | AC11 |
| Existing `admin-branches.integration.test.ts` / `admin-products.integration.test.ts` / `admin-categories.integration.test.ts` re-run after this phase's additive `admin/index.ts` mount | Fully-Automated | Regression guard (no SPEC criterion — mount-append safety) |

**Failing stubs (Fully-Automated tier, TDD red-first starting point for EXECUTE):**

```text
test("AC1 — should create a deal with valid deal_type, date range, and conditional discount_value, returning 201", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1")
})
test("AC2 — should reject deal creation when end_at <= start_at with 400", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC2")
})
test("AC3 — should reject deal creation with an invalid deal_type string with 400", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3")
})
test("AC4 — should attach a product to a deal and cleanly reject a duplicate attach with 409", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC4")
})
test("AC5 — should attach a branch to a deal and cleanly reject a duplicate attach with 409", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC5")
})
test("AC6 — should detach a product/branch from a deal (204) and 404 on a non-attached pair", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC6")
})
test("AC7 — should reject staff/customer role sessions with 403 on all /api/admin/deals/* write routes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC7")
})
test("AC8 — should deactivate a deal with couponPolicy 'leave' (or omitted), toggling only is_active with zero coupon writes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC8")
})
test("AC9 — should deactivate a deal with couponPolicy 'expire', atomically flipping is_active and expiring all available coupons for that deal", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC9")
})
test("AC10 — should validate a PATCH supplying only start_at or only end_at against the merged existing+partial row, not the partial body alone", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC10")
})
```

Note: exact test file path follows the P2/P3 convention — new supertest integration file as a peer
of `admin-products.integration.test.ts` under `packages/api/src/lib/__tests__/`
(`admin-deals.integration.test.ts`), reusing the `makeUser(role)` self-seeding fixture a FOURTH
time. `packages/api` uses vitest + supertest — the run command is
`pnpm --filter @jojopotato/api test admin-deals` (**note: NO `--` before the filter argument** —
see Test Infra Improvement Notes for the gotcha this repeats from P2's E2/P3's E2 corrections),
requires local Postgres migrated (either `docker compose up -d` + `pnpm --filter @jojopotato/api
db:migrate`, or this dev machine's already-running native Postgres per
`process/context/tests/all-tests.md`'s Debugging Quick Reference). Current suite baseline:
183/183 (post-Phase-3).

---

## Security

- **Zod-before-Postgres, always**: every write route (`create`, `update`, `deactivate`, both
  attach endpoints) validates the full request body with a Zod schema BEFORE any DB call. `deal_type`
  enum membership, `couponPolicy` enum membership, date ordering (D5), and numeric non-negativity
  are all rejected client-side-trust-free.
- **`requireAdmin` inheritance, no per-handler re-check**: `/api/admin/deals/*` inherits the guard
  applied once at the `/api/admin` mount (`index.ts`, confirmed unchanged since P1). Deals CRUD is
  **admin-level, not super_admin-only** — both roles get full write access, consistent with P2/P3
  and distinct from P1's role-management route (the ONLY super_admin-gated route in the program).
- **No hard deletes anywhere in this phase** — `deals`/`deal_products`/`deal_branches` rows are
  never `DELETE`d as a *deal*; the junction `DELETE` endpoints (AC6) delete only the many-to-many
  LINK row, never the underlying `deals`/`products`/`branches` row itself. This is consistent with
  soft-delete-only across the whole admin program.
- **Transaction atomicity for the D1 `'expire'` cascade path**: the ONLY multi-table write in this
  phase (`coupons.status` + `deals.is_active`) is wrapped in a single `db.transaction()` —
  partial-failure cannot leave the two tables inconsistent. This is called out explicitly because
  it is the first `db.transaction()` used anywhere in `routes/admin/*` (P1/P2/P3 routes are all
  single-statement writes) — a deliberate new precedent, documented in the route file itself.
- **FK pre-checks before junction insert** (D3): attaching a product/branch that doesn't exist
  returns a clean 404 rather than surfacing a raw Postgres FK-violation 500, mirroring P3's
  `admin/products.ts:401-410` precedent for `branch_product_availability`.
- **Junction unique-violation → clean 409, never a raw constraint leak** (D3): reuses
  `isUniqueViolation`/`handleAdminError` verbatim — checks both `err.code` and `err.cause?.code`
  per the durable drizzle gotcha (P2 discovered, P3 reused, this phase reuses a third time).
- **Cents-at-boundary money handling** (D2): `discountValue`/`minimumOrderAmount` are integer cents
  in every request/response body; conversion via `numericToCents`/`centsToNumeric` happens ONLY in
  the route layer, never in `apps/admin` — consistent with every prior admin phase's money
  convention.
- **No new secrets, no new trust boundary, no CORS change** — `adminCors` established by P1 is
  unmodified by this phase; this phase adds no new external-facing surface (all routes sit behind
  the existing `/api/admin` mount).

---

## Durable Gotcha Carry-Forwards

- **TanStack Start nested-detail-route `<Outlet/>` gotcha** (discovered during P3's AC8 walkthrough
  and fixed same-session — see `phase-03-products_PLAN_14-07-26.md` §Locked Decisions / EVL note):
  a `foo.$id.tsx` file auto-nests under `foo.tsx` (shared filename prefix); the parent MUST render
  `<Outlet/>` or the child route mounts nowhere. This phase applies the fix pattern **from the
  start** — `deals.tsx` is written as a thin `<Outlet/>` layout and `deals.index.tsx` holds the
  list UI, exactly matching the corrected P3 shape, never the buggy single-file shape P3 initially
  shipped.
- **Drizzle `err.cause?.code` unique-violation gotcha** (P2 discovered, P3 reused): already fully
  handled by the shared `isUniqueViolation()` helper this phase imports unmodified — no new code
  needed, just correct reuse (D3).

---

## Clean-Code / Modularity Notes

- D4's composite extraction (`data-table.tsx`, `form-dialog.tsx`) is the umbrella's flagged
  "real second-consumer proof" moment — Deals is deliberately built to consume both from day one
  rather than hand-rolling a 4th list/form pair, closing the loop P3 opened.
- The junction attach/detach helper (Step 4 of the Implementation Checklist) is shared between the
  products-junction and branches-junction handlers inside `deals.ts` itself (a small internal
  function, not a new exported module) — avoids duplicating the FK-pre-check + `isUniqueViolation`
  catch twice in the same file, without over-engineering a new shared package for 2 call sites.
- `serializeAdminDeal()` stays a pure row→DTO mapper (D2's Step 2 note) — the `outstandingCoupons`
  count is computed by the route handler and passed in as a parameter, keeping the serializer free
  of any DB-query responsibility, consistent with every other admin serializer in the codebase.

---

## Backlog Follow-Up (filed as part of this supplement, not a vague TODO)

- **`data-table`/`form-dialog` retrofit for branches/categories/products** — once this phase lands,
  file `process/features/admin-dashboard/backlog/adm-004-data-table-form-dialog-retrofit_NOTE_<date>.md`
  during UPDATE PROCESS, naming the 3 domains to retrofit and the exact regression-guard scope
  (full `packages/api` suite is unaffected since these are `apps/admin`-only files; a full
  `apps/admin` typecheck + a manual Agent-Probe re-walkthrough of all 3 domains would be the
  retrofit's own gate).
- **Coupon `code`-based redemption / per-deal policy column** — the D1 REJECTED-alternative
  (per-deal `coupon_cascade_policy` enum column) stays a backlog pointer inside D1 itself; no
  separate note filed unless a future phase concretely needs it.

---

## Test Infra Improvement Notes

- No `apps/admin` browser/E2E runner exists yet (project-wide gap, unchanged since P0/P2/P3) —
  AC11's Agent-Probe manual walkthrough is the only coverage for the actual chip-editor and
  confirm-dialog interactions.
- `pnpm --filter @jojopotato/api test admin-deals` — **no `--` before the filter argument**
  (vitest's pnpm-filter CLI-passthrough gotcha first hit in P2's E2 and corrected again in P3's
  E2; repeating the note here so EXECUTE doesn't rediscover it a third time).
- The D1 `'expire'` transaction test (`deal-deactivate-expire-policy-atomic-cascade`) is the first
  test in the admin suite that needs to assert transaction atomicity under a forced mid-transaction
  failure — if the existing `db.transaction()` test-harness pattern from `orders.ts`'s own
  transaction tests (order placement) isn't directly reusable, this may need a small new test
  helper; flag as a concrete gap to resolve during EXECUTE, not before (no speculative
  infrastructure ahead of need).

---

## Phase Completion Rules

This phase is CODE DONE when Implementation Checklist Steps 1-10 are complete and all
Fully-Automated gates in Verification Evidence are green; VERIFIED requires additionally the
Agent-Probe row (AC11) confirmed via a real manual walkthrough (not left owed) and a clean
regression checkpoint against Phases 2/3. Do not mark ✅ VERIFIED without both phase-gate evidence
and regression evidence against Phases 2/3.

This phase plan is the primary execute anchor for Phase 4 (Deals CRUD); it has no supporting phase
files — all detail lives in this single file.

## Phase Loop Progress

- [x] 1. RESEARCH (15-07-26 — confirmed schema facts for `deals`/`deal_products`/`deal_branches`/
  `coupons`; confirmed P2/P3's `AdminApiError`/`errors.ts`/aggregator/serializer conventions are
  live and unchanged; confirmed no shared `data-table`/`form-dialog` composites exist yet)
- [x] 2. INNOVATE (15-07-26 — user approved D1's configurable coupon-cascade resolution; locked
  D1-D5 per `## Decision Summary` above)
- [x] 3. PLAN-SUPPLEMENT (15-07-26 — this pass: resolved AC9, added AC10/AC11, full Touchpoints/
  Public Contracts/Blast Radius/Verification Evidence/Security/Clean-Code sections, removed the
  stale `packages/types` touchpoint per D2)
- [x] 4. PVL (validate-contract) — 15-07-26, Gate: PASS (see `## Validate Contract` below)
- [x] 5. EXECUTE — 15-07-26, CODE DONE. All 10 checklist steps complete; AC1-AC10 automated gates
  green (31/31 new tests); full API suite 214/214 (183 baseline + 31, 0 regressions); API + admin
  typechecks green; format + lint clean. AC11 (UI Agent-Probe) owed at EVL. Report:
  `phase-04-deals_REPORT_15-07-26.md`
- [ ] 6. EVL
- [ ] 7. UPDATE-PROCESS

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-04-deals_PLAN_14-07-26.md`
2. **Last completed phase or step:** Step 4 — PVL (15-07-26). Validate-contract written, Gate: PASS.
   Ready for Step 5 (EXECUTE) — do NOT start EXECUTE without an explicit `ENTER EXECUTE MODE`
   command per this session's constraints.
3. **Validate-contract status:** written (15-07-26), Gate: PASS — see `## Validate Contract` below.
4. **Supporting context files loaded:**
   - `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
   - `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-03-products_PLAN_14-07-26.md` (full, incl. its validate-contract — CRUD-shape + composite-extraction template)
   - `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-02-branches_PLAN_14-07-26.md` (reference CRUD shape)
   - `process/context/all-context.md`, `process/context/tests/all-tests.md`
   - `packages/api/src/db/schema/deals.ts`, `deal_products.ts`, `deal_branches.ts`, `coupons.ts` (full)
   - `packages/api/src/routes/admin/lib/errors.ts` (full, 50 lines — `AdminApiError`, `handleAdminError`, `isUniqueViolation`)
   - `packages/api/src/routes/admin/index.ts` (full — confirmed append-only aggregator, current mounts: users/branches/categories/products)
   - `packages/api/src/routes/admin/products.ts` (lines 1-50, 380-420 — FK-pre-check + serializer import precedent)
   - `packages/api/src/routes/lib/serializers.ts` (grep for `AdminProduct`/`AdminBranch`/`serializeDeal`/`numericToCents`/`centsToNumeric` — confirmed local-declaration convention + existing public `serializeDeal` at lines 418-458)
   - `packages/api/src/routes/orders.ts` (Zod + typed-error conventions; `db.transaction()` precedent at line 100)
   - `apps/admin/src/routes/(dashboard)/products.tsx`, `products.index.tsx` (full/partial — confirmed thin-`<Outlet/>` layout pattern and hand-rolled list+form shape D4 extracts from)
   - `apps/admin/src/components/{confirm-dialog,query-states,page-header}.tsx` (line counts — confirmed existing composite sizes/shapes)
   - `docs/jojo-potato-mobile-prd.md` §9.7-9.10
5. **Next step for a fresh agent picking up mid-execution:** run vc-context-discovery +
   vc-plan-discovery, confirm this plan's Phase Loop Progress still shows Step 4 as the last
   checked box, then proceed directly to Step 5 (EXECUTE) upon explicit `ENTER EXECUTE MODE` —
   spawn vc-execute-agent (opus) against this plan file, sequential strategy (see `## Validate
   Contract` §Parallel strategy for EXECUTE below). Do NOT re-run INNOVATE or PVL; D1-D5 are locked
   and the validate-contract Gate is PASS. If EXECUTE finds any of D1-D5's citations stale (e.g.
   `errors.ts`/`admin/index.ts` line numbers drifted), re-grep at EXECUTE time per the P3 precedent
   (Execute-Agent Instruction E1 below) rather than trusting this plan's hardcoded references
   blindly.

---

## Validate Contract

Status: PASS
Date: 15-07-26
date: 2026-07-15
generated-by: inner-pvl: phase-4

Parallel strategy: parallel-subagents (recommended for the V2 fan-out; executed as a single
deep-mode direct-evidence pass in this session — see Rationale)
Rationale: Signal score 4/7 for the V2 fan-out (S2 — new `/api/admin/deals/*` public route surface
added; S4 — phase-program classification, Phase 4 of 8; S5 — user explicitly requested a deep,
evidence-backed validation pass naming 6 specific correctness spines to nail down; S7 — ~14-17
files in blast radius). Per the CREATION-vs-read-only-VALIDATE reconciliation rule, this is a
read-only two-layer fan-out (4 Layer-1 dimension checks + 5 Layer-2 section checks, no mid-run
coordination needed between checks) that would normally run as parallel subagents. This
vc-validate-agent instance had no Agent/Task spawning tool available in its runtime (tool grant:
Read/Bash/Write only), so the fan-out was executed as a single deep-mode direct-evidence pass —
every Layer 1/Layer 2 claim below is backed by a direct `Read`/`grep`/`find` citation against the
real file (schema files, `errors.ts`, `admin/index.ts`, `serializers.ts`, `products.ts`,
`orders.ts`, `apps/admin` route/component files), not an inference — functionally equivalent
rigor to the parallel-subagent plan, run sequentially. Flagging this transparently rather than
silently claiming a fan-out that didn't happen (matches the Phase 3 precedent for the same
runtime constraint).

For EXECUTE (next phase step): Signal score 3/7 (S2, S4, S7 — no S1 multi-package-3+, no S6
formal high-risk class per the plan's own Blast Radius classification). Score alone suggests
parallel subagents, but the Strategy-by-fit rule overrides on this occasion: Implementation
Checklist Steps 1-10 are tightly sequential (schemas before handlers before router mount before
UI components before UI routes before tests before regression), matching the P2/P3 precedent of
a single sequential `vc-execute-agent` (opus model per the Model Selection Policy — EXECUTE is the
only opus leg) working the checklist top to bottom. Recommended: **Sequential, 1 agent (opus)**.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Create a deal with valid `deal_type`, `end_at > start_at`, and conditionally-required `discount_value` → 201 | Fully-Automated | `pnpm --filter @jojopotato/api test admin-deals` — `deal-create-happy-path` | A |
| AC2 | `end_at <= start_at` on create → 400 | Fully-Automated | same command — `deal-create-rejects-invalid-date-range` | A |
| AC3 | Invalid `deal_type` string on create → 400 (Zod before Postgres) | Fully-Automated | same command — `deal-create-rejects-invalid-deal-type` | A |
| AC4 | Attach product writes `deal_products`; duplicate attach → 409 (not raw constraint leak) | Fully-Automated | same command — `deal-product-attach-and-duplicate-reject` | A |
| AC5 | Attach branch writes `deal_branches`; duplicate attach → 409 | Fully-Automated | same command — `deal-branch-attach-and-duplicate-reject` | A |
| AC6 | Detach product/branch → 204; detach non-attached pair → 404 | Fully-Automated | same command — `deal-junction-detach-and-not-found` | A |
| AC7 | `staff`/`customer` roles rejected 403 on all `/api/admin/deals/*` write routes | Fully-Automated | same command — `deal-route-authz-rejection` | A |
| AC8 | `couponPolicy: 'leave'` (or omitted) toggles `is_active` only, zero `coupons` writes | Fully-Automated | same command — `deal-deactivate-leave-policy-no-coupon-writes` | A |
| AC9 | `couponPolicy: 'expire'` atomically flips `is_active` + expires all `available` coupons for the deal; correct count; zero-outstanding → count 0, no error; forced mid-tx failure leaves both tables unchanged | Fully-Automated | same command — `deal-deactivate-expire-policy-atomic-cascade` | A |
| AC10 | PATCH with only `start_at` or only `end_at` validated against the MERGED row, not the isolated partial body | Fully-Automated | same command — `deal-patch-partial-date-merge-validation` | A |
| AC11 | Admin UI: deal list + create/edit form round-trip via `data-table`/`form-dialog`; chip attach/detach editor; deactivate confirm dialog shows `outstandingCoupons` count + leave/expire choice | Agent-Probe | `admin-deals-ui-manual-walkthrough` — manual scenario in the running `apps/admin` dev server against a real dev DB | A |
| REG | Additive `admin/index.ts` mount and additive `serializers.ts` extension introduce zero regressions in existing admin CRUD suites | Fully-Automated | `pnpm --filter @jojopotato/api test admin-branches` / `test admin-products` / `test admin-categories`, then full `pnpm --filter @jojopotato/api test` (baseline 183/183) | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated /
Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value — no row in this table uses Known-Gap;
every developed behavior (AC1-AC11 + regression guard) has a real proving gate, satisfying the
Net-gate vacuous-green ban (no behavior rests on Known-Gap alone).

Legacy line form (retained so existing validate-contract consumers still parse):
- Deal CRUD core + junction writes + coupon-cascade (AC1-AC10): Fully-automated:
  `pnpm --filter @jojopotato/api test admin-deals` (precondition: local Postgres reachable via
  `DATABASE_URL`, migrated — either `docker compose up -d` + `pnpm --filter @jojopotato/api
  db:migrate`, or this dev machine's native Postgres per `all-tests.md`'s Debugging Quick
  Reference)
- Admin UI walkthrough (AC11): agent-probe: manual create→attach→edit→deactivate walkthrough in
  the running `apps/admin` dev server against the real API, showing the `outstandingCoupons` count
  and leave/expire choice before submit
- Regression guards: Fully-automated: `pnpm --filter @jojopotato/api test admin-branches`,
  `test admin-products`, `test admin-categories`, then full `pnpm --filter @jojopotato/api test`
- Typecheck gates: Fully-automated: `pnpm --filter @jojopotato/api typecheck` and
  `pnpm --filter @jojopotato/admin generate-routes && pnpm --filter @jojopotato/admin typecheck`
  (route codegen MUST run before typecheck — the 3 new TanStack Start route files are not resolved
  by `tsc` until `tsr generate` has run once, per the P0/P3 precedent)
- Format gate: Fully-automated: `pnpm format:check`

**Failing stubs (Fully-Automated rows only, verbatim from the plan's Verification Evidence section
above — TDD red-first starting point for EXECUTE):**

```text
test("AC1 — should create a deal with valid deal_type, date range, and conditional discount_value, returning 201", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1")
})
test("AC2 — should reject deal creation when end_at <= start_at with 400", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC2")
})
test("AC3 — should reject deal creation with an invalid deal_type string with 400", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3")
})
test("AC4 — should attach a product to a deal and cleanly reject a duplicate attach with 409", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC4")
})
test("AC5 — should attach a branch to a deal and cleanly reject a duplicate attach with 409", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC5")
})
test("AC6 — should detach a product/branch from a deal (204) and 404 on a non-attached pair", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC6")
})
test("AC7 — should reject staff/customer role sessions with 403 on all /api/admin/deals/* write routes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC7")
})
test("AC8 — should deactivate a deal with couponPolicy 'leave' (or omitted), toggling only is_active with zero coupon writes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC8")
})
test("AC9 — should deactivate a deal with couponPolicy 'expire', atomically flipping is_active and expiring all available coupons for that deal", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC9")
})
test("AC10 — should validate a PATCH supplying only start_at or only end_at against the merged existing+partial row, not the partial body alone", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC10")
})
```

Dimension findings:
- Infra fit: PASS — new route file mounted via the existing append-only `adminRouter` pattern
  (`admin/index.ts` — confirmed unchanged aggregator shape, current mounts: users/branches/
  categories/products; `.use('/deals', dealsRouter)` is a one-line, zero-conflict addition). New
  `apps/admin` TanStack Start routes (`deals.tsx`/`deals.index.tsx`/`deals.$dealId.tsx`) follow the
  corrected thin-`<Outlet/>`-layout convention confirmed by direct read of the live
  `products.tsx` (17 lines, exactly this shape) — applied from the start, not retrofitted. No
  container/port/env/deploy surface touched.
- Test coverage: PASS — all 11 ACs + the regression guard have a real, runnable proving gate (10
  Fully-Automated + 1 Agent-Probe); zero Known-Gap rows (Net-gate vacuous-green ban satisfied).
  Every gate command verified against the actual `package.json` scripts in this session
  (`packages/api`: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`; `apps/admin`:
  `"generate-routes": "tsr generate"`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run
  --passWithNoTests"`; root: `"format:check": "prettier --check . --ignore-unknown"`) — none are
  placeholders. AC11 Agent-Probe is a project-wide, precedent-consistent gap (no `apps/admin`
  browser/E2E runner — same as P2 AC7/P3 AC8), not new debt.
- Breaking changes: PASS — purely additive: 1 new route file, 1 additive router-mount line, 1
  additive serializer interface+function (no existing `serializers.ts` export modified — confirmed
  `serializeDeal` at line ~424 is untouched by this plan's design). `packages/types` explicitly
  NOT touched (D2), eliminating any cross-package consumer ripple. No existing test file's
  behavior is altered by this phase's changes.
- Security surface: PASS — `requireAdmin` inherited at mount (no per-handler bypass risk); every
  write route Zod-validates before touching Postgres; FK pre-checks avoid raw 500 leaks on
  attach; `isUniqueViolation` (confirmed signature at `errors.ts:44-49`, checks both `err.code`
  and `err.cause?.code`) avoids a raw constraint-violation leak on duplicate attach; D1's
  `couponPolicy: 'expire'` path — the phase's one genuinely novel write surface — is opt-in
  (never default), atomic (single `db.transaction()`, confirmed reusable pattern already proven
  at `orders.ts:100`), and scoped only to `coupons.status` rows already pointing at the target
  `deal_id`; confirmed via grep that no existing `routes/admin/*.ts` file currently touches
  `coupons` or uses `db.transaction()` — the plan's own claim that this is a genuinely new
  precedent is accurate, not overstated. No new secrets, no CORS change, no `order_items`/
  `star_transactions` touch anywhere in this phase (umbrella hard-invariant respected).

- Section D1 (Coupon-cascade transaction): PASS — Mechanical feasibility: `db.transaction(async
  (tx) => {...})` is a proven, already-working pattern in this exact codebase (`orders.ts:100`,
  confirmed by direct read), so wrapping the coupon `UPDATE` + `deals.is_active` `UPDATE` in one
  transaction is a mechanical, deterministic operation with zero runtime uncertainty — no
  VC-FEASIBILITY-PROBE-NEEDED required. Gaps found: none blocking; the plan's own Test Infra
  Improvement Notes correctly and appropriately defers the "how to force a mid-transaction failure
  in the test" mechanic to EXECUTE time (no speculative infra ahead of need — acceptable per the
  plan's stated principle). Conflicts found: none. Highest-risk edit + mitigation: deriving
  `outstandingCouponsAffected` — Execute-Agent Instruction E1 below locks this down to avoid an
  unnecessary pre/post COUNT race window.
- Section D2 (Serializer separation): PASS — Mechanical feasibility: the public `serializeDeal`
  (confirmed at `serializers.ts:~424`, using `InferSelectModel<typeof deals>`) and the
  `AdminBranch`/`serializeAdminBranch` (`:266`) / `AdminProduct`/`serializeAdminProduct` (`:94,
  133`) local-declaration precedents are both confirmed live and directly reusable as the template
  for `AdminDeal`/`serializeAdminDeal`. Gaps found: the plan doesn't explicitly state whether the
  LIST route (`GET /deals`) includes the attached product/branch id arrays (only the DETAIL route
  is explicit about this) — Execute-Agent Instruction E2 below resolves it. Conflicts found: none.
  Highest-risk edit: none — straightforward additive serializer.
- Section D3 (Junction attach/detach): PASS — Mechanical feasibility: confirmed verbatim-reusable
  FK-pre-check pattern at `products.ts:401-410` (read directly — product/branch existence checked
  via `db.select().from(...).where(eq(...))` before the write, 404 on miss) and confirmed
  `isUniqueViolation`/`handleAdminError` signature at `errors.ts:44-49`. Confirmed unique indexes
  exist on both junction tables (`deal_products_deal_product_idx`, `deal_branches_deal_branch_idx`)
  enabling clean 409 detection. Gaps found: none. Conflicts found: none. Highest-risk edit: the
  shared internal pre-check/catch helper (Step 4) — low risk, plan correctly scopes it as an
  unexported in-file helper, not a new package.
- Section D4 (Shared UI composite extraction — data-table/form-dialog): PASS (advisory note, not a
  blocking CONCERN — per the task's own framing this is "advisory unless it introduces a concrete
  defect," and it does not). Mechanical feasibility: confirmed `data-table.tsx`/`form-dialog.tsx`
  do not yet exist (`apps/admin/src/components/` currently holds `admin-home.tsx`, `app-sidebar
  .tsx`, `confirm-dialog.tsx` [82 lines], `nav-user.tsx`, `page-header.tsx` [34 lines], `query-
  states.tsx` [46 lines], `ui/`) and confirmed `products.index.tsx` (163 lines) / `products.
  $productId.tsx` (124 lines) are genuine hand-rolled list+form pairs the extraction can be
  informed by. Gaps found / Risk assessment: the "single real consumer after this phase" concern
  is real in the narrow technical sense but the plan already self-mitigates it correctly — same
  reasoning P3 used for its 3 composites, explicit REJECTED-alternatives recorded, and a concrete
  backlog follow-up filed (not a vague TODO) rather than silently accepted as permanent debt.
  Conflicts found: none. Highest-risk edit + mitigation: over-fitting the composites to deals'
  exact shape — Execute-Agent Instruction E3 below keeps them deliberately generic.
- Section D5 (PATCH partial-date merge-validate): PASS — Mechanical feasibility: fetch-merge-
  validate is ordinary deterministic application logic (read existing row → merge partial body →
  validate merged result → conditionally `UPDATE`), fully within codebase control, no runtime/
  network/third-party uncertainty — no VC-FEASIBILITY-PROBE-NEEDED required (this is exactly the
  kind of "mechanical check" the probe-emission rule excludes, not a probe candidate). This is
  correctly identified by the user as the subtlest correctness item in the plan, and the design
  (fetch-merge-validate) is the right shape — AC10 directly covers it. Gaps found: the plan doesn't
  explicitly state whether the fetch+merge+validate path should run when NEITHER `start_at` nor
  `end_at` is present in the PATCH body — Execute-Agent Instruction E4 below resolves it (skip the
  extra read when neither date field is touched). Conflicts found: none. Highest-risk edit +
  mitigation: fetch-merge-validate ordering — as stated, correctly designed; AC10 is the direct
  proving test.

Execute-Agent Instructions (written to the validate-contract for EXECUTE to follow; not blocking
gaps, targeted clarifications only):
- E1 (D1): Derive `outstandingCouponsAffected` from the coupon `UPDATE ... RETURNING` array's
  `.length` INSIDE the transaction, not from a separate pre-count `SELECT` — avoids an unnecessary
  extra query and keeps the count provably consistent with what was actually mutated.
- E2 (D2): Before deciding whether `GET /api/admin/deals` (list) includes the attached product/
  branch id arrays, check what the `data-table` list columns actually display (Step 7) — if the
  list UI doesn't need them, omit them from the list-serializer call to avoid unnecessary N+1
  joins on a list endpoint; keep them on the detail (`GET /:id`) response only, where the plan
  already specifies them explicitly.
- E3 (D4): Keep `data-table.tsx`/`form-dialog.tsx` deliberately generic (column-defs + row-render
  slot; title/fields-slot/submit/cancel) — if a prop or behavior feels deal-specific, it belongs
  in the deals feature-local wrapper, not the composite itself. This preserves the composites'
  2nd-consumer value ahead of the backlog-filed retrofit.
- E4 (D5): Only run the fetch-existing-row + merge + validate flow on `PATCH` when the request
  body includes `start_at` and/or `end_at`. Skip it (no extra `SELECT`) for updates that touch
  neither date field — those fields are already known-valid from a prior create/PATCH.
- E5 (general, mirrors P3's Execute-Agent Instruction E1 precedent): if any of D1-D5's hardcoded
  file:line citations have drifted by the time EXECUTE runs, re-grep the current file rather than
  trusting this plan's line numbers blindly; document any corrected path in the phase report.
- E6 (regression): re-run `admin-branches.integration.test.ts` / `admin-products.integration.
  test.ts` / `admin-categories.integration.test.ts` explicitly (not just the full suite) after
  Step 5 (mount) lands, before proceeding to Step 6+ — catches an aggregator-mount regression as
  early as possible rather than only at the final full-suite run.
- E7 (route codegen ordering): run `pnpm --filter @jojopotato/admin generate-routes` (`tsr
  generate`) BEFORE `pnpm --filter @jojopotato/admin typecheck` — the 3 new TanStack Start route
  files will not resolve under `tsc` until the route tree is regenerated once, per the P0/P3
  precedent (`admin-sidebar-nav` and P3's `products.tsx` split both required this same ordering).

Open gaps: none blocking EXECUTE. Named residuals (not silently dropped):
- AC11 (UI manual walkthrough) remains Agent-Probe only — no `apps/admin` browser/E2E runner
  exists yet (project-wide gap, consistent with P2 AC7/P3 AC8 precedent, not new debt for this
  phase). Must be ACTUALLY PERFORMED (not left owed) before this phase is marked ✅ VERIFIED, per
  the plan's own Phase Completion Rules — matching P3's precedent of performing AC8 in-session
  rather than deferring it.
- D1's forced-mid-transaction-failure test harness reusability is an explicitly-named,
  appropriately-deferred implementation detail (plan's own Test Infra Improvement Notes) —
  resolve during EXECUTE, not before; not a PVL blocker.
- `data-table`/`form-dialog` retrofit for branches/categories/products is explicitly deferred to a
  backlog follow-up (to be filed at this phase's UPDATE PROCESS) — tracked, not silent debt.

What This Coverage Does NOT Prove:
- The Fully-Automated integration suite (AC1-AC10, REG) proves server-side request/response
  correctness against a real local Postgres. It does NOT prove: the `apps/admin` UI actually
  renders the chip attach/detach editor correctly, that the deactivate confirm dialog's
  `outstandingCoupons` count/leave-expire radio are wired to the real API response, or that the
  `data-table`/`form-dialog` composites render/behave correctly across browsers — AC11's
  Agent-Probe walkthrough is the only coverage for those, and it is a single manual pass, not a
  regression-guarded automated suite.
- The transaction-atomicity assertion in AC9 proves atomicity for the specific forced-failure
  scenario the test constructs; it does NOT prove atomicity under every possible Postgres-level
  failure mode (e.g. a connection drop mid-transaction, a deadlock with a concurrent writer) —
  those are infra-level failure modes outside this plan's test harness scope.
- The regression guard (REG) proves the existing P2/P3 admin suites stay green after this phase's
  additive changes; it does NOT re-verify P2/P3's own original acceptance criteria from scratch
  (e.g. it does not re-prove AC1's snapshot-integrity invariant from Phase 3) — it only proves no
  NEW regression was introduced by this phase's specific edits.
- The typecheck/format gates prove type-safety and formatting compliance; they do NOT prove
  runtime correctness of any business logic.

Gate: PASS
Accepted by: N/A (Gate: PASS — no unresolved CONCERNs requiring user acceptance; all Layer 1/Layer 2
findings resolved to PASS with non-blocking Execute-Agent Instructions only, zero FAILs, zero
CONCERNs)
