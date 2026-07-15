---
name: plan:admin-phase-04-deals
description: "Admin Dashboard Phase 4a — Deals-as-products (products.is_deal + deal_components), ADM-004 RE-PLAN, supersedes the discount-shaped deals CRUD (commit d5070d8)"
date: 15-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 4a
---

# Phase 4a — Deals-as-Products (ADM-004 RE-PLAN)

**Date**: 15-07-26 (full re-plan — supersedes the 14-07-26 discount-shaped plan and its Gate: PASS
validate-contract)
**Complexity**: COMPLEX (phase-program phase)
**Status**: 🔨 RE-PLANNED — pivot from discount-object deals to deals-as-products; ready for VALIDATE
(Step 4 PVL fresh run required — the prior contract validated a discarded model and does not carry
forward)

Depends on: Phase 2 (Branches CRUD, ✅ VERIFIED), Phase 3 (Products/Categories CRUD, ✅ VERIFIED —
this phase is now built directly ON TOP of the products CRUD pattern, not beside it), and the
now-discarded Phase 4 discount-shaped CRUD (commit `d5070d8`, superseded, preserved in git history).

Umbrella: `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`

Companion mobile handoff (standalone, non-executed by this program):
`process/features/admin-dashboard/active/admin-dashboard_14-07-26/deals-mobile-repoint_HANDOFF_15-07-26.md`

---

## Why This Plan Supersedes the Prior One (read this first)

The 14-07-26 plan built Deals as a **standalone discount object** (`deals` table + `deal_products`/
`deal_branches` many-to-many junctions + a coupon-cascade deactivation flow), fully EXECUTEd on
commit `d5070d8` (31/31 new tests, 214/214 full suite, all green). That code is now **discarded**,
not deleted from history — the underlying `deals`/`deal_products`/`deal_branches`/`coupons` schema
stays dormant and untouched (see `## Legacy Deals Stays Dormant` below); ADM-008 may resume it later.

INNOVATE has re-decided the model: a "Deal" is now simply **a product** with `is_deal = true`, whose
"what's inside" is described by a `deal_components` junction to other products, priced at its own
`base_price`. This reuses the ENTIRE existing product → menu → cart → checkout → order_items
pipeline with **zero new pricing/cart/order code** — the single biggest scope reduction versus the
discarded model, which needed its own coupon-cascade transaction and duplicate discount math.

This plan (4a) covers the BUILD: schema, API, admin UI. A companion document (4b, see Companion
above) hands off the mobile-side repoint to a different, non-RIPER-aware teammate — it is a SPEC,
not executed by this program.

---

## Overview

Build:
1. **Migration 0007** — `products.is_deal boolean not null default false` + a new self-referential
   `deal_components` junction table (deal product → member product, with quantity).
2. **Seed** — a "Deals" category (required because `products.category_id` is `NOT NULL`, so every
   is_deal product needs a real category row to attach to).
3. **API** — `packages/api/src/routes/admin/deals.ts`, a dedicated admin Deals page's backing route
   (composes product-CRUD-equivalent semantics for `is_deal=true` products + `deal_components`
   attach/detach), mounted on the existing append-only `/api/admin` aggregator.
4. **4 filter-site changes** — every place products are queried gets an explicit `is_deal` decision
   (see `## The 4 is_deal Filter Sites`).
5. **Admin UI** — a new `features/deals/**` + 3 TanStack Start routes, following the products
   pattern (Outlet layout split from the start), reusing the 5 shared composites Phase 3/4-discarded
   already built (`data-table`, `form-dialog`, `confirm-dialog`, `query-states`, `page-header`).
6. **Discard** the commit-`d5070d8` discount-shaped code (see `## Discard Plan` below) as part of
   this phase's own EXECUTE scope.

---

## Decision Summary (INNOVATE, consumed verbatim)

### Decision 1 — Deals get their own admin page, built on the products CRUD pattern

`routes/admin/deals.ts` is a **separate file** from `products.ts`, not a query-param mode of the
Products admin screen. It reuses the SHAPE of product CRUD (same Zod-before-Postgres conventions,
same `AdminApiError`/`handleAdminError`/`isUniqueViolation` reuse, same `centsToNumeric`/
`numericToCents` cents-at-boundary convention) but is its own route file, its own admin nav item, and
its own `apps/admin/src/features/deals/**` folder — because a deal has UI needs (the `deal_components`
quantity-aware chip editor) that products do not, and keeping it separate avoids overloading the
Products screen with a deal-only sub-mode. Concretely: `routes/admin/deals.ts` internally reuses
Drizzle inserts against the SAME `products` table (`is_deal: true`); it does not proxy/wrap
`products.ts`'s exported handlers — there is no genuine code-sharing opportunity beyond the already-
shared helpers (`errors.ts`, `serializers.ts` money helpers), since the two domains diverge
immediately on `deal_components` vs `product_options`/`branch_product_availability`.

**Rejected:** thin wrapper composing `products.ts` handlers directly — rejected because `products.ts`
handlers are not designed to take an `is_deal` mode flag, and forcibly injecting one would couple two
independently-evolving domains (product options/availability vs deal components) for no real
duplication savings.

Second-order effect: `routes/admin/products.ts`'s `GET /` list route gains a default-exclude of
`is_deal=true` rows plus an explicit `?isDeal=` param (see filter site (c) below) so the Products
admin screen never accidentally shows deal-products mixed into the catalog list.

### Decision 2 — `deal_components` shape

```
deal_components
  id                    uuid primary key default random
  deal_product_id       uuid not null references products(id)      -- NO ACTION
  component_product_id  uuid not null references products(id)      -- NO ACTION
  quantity               integer not null default 1
  uniqueIndex on (deal_product_id, component_product_id)
```

This is the **first self-referential FK into `products`** in the schema — flagged with a header
comment in the new schema file, mirroring how `errors.ts` flags the drizzle `err.cause.code` gotcha
and how the discarded deals plan flagged its own first-`db.transaction()` precedent.

### Decision 3 — Self-reference / deal-of-deals guard: app-layer, zero extra query

The `deal_components` attach route rejects, in the Zod/handler layer (not a DB `CHECK`, which cannot
express a cross-row rule):
- `componentProductId === dealProductId` (a deal cannot contain itself), and
- a `componentProductId` whose product row has `is_deal = true` (no deals-of-deals in v1).

Both checks piggyback on the FK-existence read the route already needs before inserting (mirrors the
discarded plan's D3 FK-pre-check pattern) — no additional query cost.

**Rejected:** a DB `CHECK` constraint — Postgres `CHECK` cannot reference another row's `is_deal`
value, so this must be app-layer regardless.

### Decision 4 — Filtering at all 4 sites (see full detail below)

`branches.ts` menu query excludes deals by default and gains an `?isDeal=true` param on the SAME
route (no new endpoint) to serve the mobile Deals tab; `admin/products.ts` list defaults to
excluding deals with an `?isDeal=` override; `orders.ts` placement and `staff.ts` availability need
NO changes (deals are ordinary products from their point of view).

**Rejected:** a dedicated `/deals-menu` endpoint — the umbrella's "don't add API surface without a
real second need" principle; a query param on the existing menu route is strictly less surface.

### Decision 5 — Deal price = product base_price; deal_components is metadata only

`deal_components` rows are NEVER read by pricing, cart, or order-placement code. The deal's price is
its own `products.base_price`, exactly like any other product — set by the admin when creating the
deal. `deal_components` exists purely to drive the "what's inside" display on the deal detail screen
(admin) and the mobile deal detail screen (4b). No `product_options` (size/flavor/add-on) support for
deal products in v1 — a deal is a single fixed-price line item.

### Decision 6 — `orders.ts` deal-apply block (lines ~182-272) stays dormant

The dormant discount-apply code path (against the legacy `deals`/`deal_id` FK, `orders.ts`) is left
in place, untouched, for ADM-008 to potentially resume. `orders.test.ts`'s ~15 deal-apply test cases
now exercise a caller-less code path — this is accepted, deliberate test debt (regression insurance
against ADM-008, not dead-code rot) and is called out with a header comment on the dormant block
(added as part of this phase's checklist, see Implementation Checklist item 1).

**Rejected:** physically deleting the dormant block — would destroy real, working discount-apply
logic that ADM-008 (coupon domain) is expected to need again in a modified form.

### Decision 7 — Snapshot-integrity: an ADDED direct regression test, not proof-by-construction alone

Editing an `is_deal=true` product's `base_price` must not mutate `order_items.unit_price`/
`total_price` on any order already placed containing that deal-product. This is safe BY
CONSTRUCTION (order_items snapshot columns are populated once at placement time — see Phase 3's
proven P3 AC1 pattern, which relies on the identical mechanism), but per Decision 7 this phase adds
its OWN direct integration test against an `is_deal=true` product specifically — mirroring P3's AC1
exactly — rather than relying on "it's the same table, it must already be covered." This is the
program's highest-stakes correctness bar and Known-Gap is explicitly banned for it.

### Decision 8 — `products.category_id` NOT NULL → seed a "Deals" category

Since `category_id` has no nullable escape hatch, the FIRST implementation checklist item seeds a
"Deals" category via the EXISTING Categories CRUD (no new seed mechanism, no schema change) so
deal-creation cannot 500 on a missing FK. The admin deal-creation form pins/defaults `categoryId` to
this seeded category (the admin never picks a category for a deal — it is implicit).

**Rejected:** making `products.category_id` nullable — would touch the FK contract for the entire
existing product catalog surface (Phase 3, ✅ VERIFIED) for a single new caller's convenience;
seeding one row is strictly lower blast radius.

**vc-predict verdict:** GO, no STOP triggers. Named risks and their mitigations: `category_id`
NOT NULL (mitigated — Decision 8, first checklist item); dormant deal-apply confusion (mitigated —
Decision 6 header comment + Known Gaps section); `is_deal` filter missed at a site (mitigated — all
4 sites enumerated as individual checklist items below); interim mobile staleness (mitigated —
called out in both this plan and the 4b handoff doc).

---

## The 4 `is_deal` Filter Sites (enumerate individually — do not batch)

| # | File:lines | Current behavior | Required change | Reason |
|---|---|---|---|---|
| (a) | `packages/api/src/routes/branches.ts:100-113` (customer menu query) | Inner-joins `products` × `branchProductAvailability`, filters `products.is_active = true`, no `is_deal` awareness | Add `eq(products.is_deal, false)` to the existing `where(and(...))` clause | The customer menu must never silently include deal-products mixed into regular categories |
| (b) | Same route as (a) — `GET /branches/:id/menu` | No `isDeal` query param | Add `?isDeal=true` param that FLIPS the filter to `eq(products.is_deal, true)` instead of `false` — same route, same response shape, no new endpoint | Serves the mobile Deals tab (4b) without adding API surface (Decision 4) |
| (c) | `packages/api/src/routes/admin/products.ts` `GET /` (line ~85-99) | Lists ALL products (active+inactive), optional `?categoryId=` filter, no `is_deal` awareness | Default-exclude `is_deal=true` rows (`eq(products.is_deal, false)` when no override given) + add `?isDeal=true` param mirroring the existing `?categoryId=` precedent for admins who want to see deal-products via the Products screen for debugging | The Products admin screen must not show deal-products mixed into the regular catalog list (Decision 1) |
| (d) | `packages/api/src/routes/orders.ts:100-125` (order placement) | Joins `products` × `branchProductAvailability` filtered by `is_active`, no `is_deal` check | **NO CHANGE** | Order placement is deliberately `is_deal`-blind — a deal-product must be orderable through the exact same path as any other product (that is the entire point of the deals-as-products model); adding an `is_deal` check here would need to REJECT deal-products from checkout, which is wrong |
| (e) | `packages/api/src/routes/staff.ts:335-358` (staff availability toggle) | Left-joins `products` × `branchProductAvailability`, filtered by `is_active`, no `is_deal` check | **NO CHANGE** | Deals need per-branch availability exactly like any other product (a branch may not carry every deal); staff must be able to toggle a deal-product's availability the same way as any product — `is_deal`-blindness here is correct, not an oversight |

Sites (d) and (e) are listed explicitly (not silently skipped) precisely so EXECUTE has to confirm
each one rather than assume — this is the RESEARCH-flagged risk mitigation for "is_deal filter
missed at a site."

---

## Cross-Cutting Compliance

Per the umbrella plan's 4 mandatory per-phase gates:

1. **Modularity** — one new route file `packages/api/src/routes/admin/deals.ts`, mounted on the
   existing `adminRouter` aggregator (append-only, still the same aggregator file, now with the
   discount-shaped `dealsRouter` import SWAPPED for the new products-based one — see Discard Plan).
   Reuses `AdminApiError`/`handleAdminError`/`isUniqueViolation` (`routes/admin/lib/errors.ts`,
   unchanged) and `centsToNumeric`/`numericToCents` (`routes/lib/serializers.ts`, unchanged) — zero
   per-domain reimplementation.
2. **Clarity** — Zod `safeParse` validation on every write, mirroring `products.ts`'s exact
   conventions (this phase is deliberately styled as a sibling of `products.ts`, not a divergent new
   shape); `{deal}`/`{deals}` response envelopes; kebab-case files, camelCase functions, PascalCase
   components.
3. **Safety** — deactivate via `products.is_active` toggle only (reusing the EXISTING products
   deactivate semantics — no new deactivate route needed, since a deal IS a product row); never a
   hard `DELETE` on a deal-product or a `deal_components` link beyond the link row itself.
4. **Security** — `/api/admin/deals/*` inherits `requireAdmin` at the router-mount level (admin-level,
   NOT super_admin-only, consistent with every prior admin-CRUD phase). All inputs (quantity, self-
   reference, category pin) are Zod-validated server-side before touching Postgres.
5. **UI component modularity & reusability** — Deals consumes ALL 5 existing shared composites
   (`data-table`, `form-dialog`, `confirm-dialog`, `query-states`, `page-header` — built by Phase 3 +
   the now-discarded Phase 4 discount plan; kept, not rebuilt). The `deal_components` quantity-aware
   chip editor extends the discarded plan's `junction-chip-editor.tsx` SHAPE with a quantity field —
   reusing the file/pattern, not the deal-specific junction semantics inside it.

---

## Touchpoints

**New:**
- `packages/api/drizzle/0007_*.sql` (migration — `products.is_deal` + `deal_components` table)
- `packages/api/src/db/schema/deal_components.ts` (new schema file — first self-referential FK into
  `products`, header comment)
- `packages/api/src/routes/admin/deals.ts` (rewritten from scratch — replaces the discount-shaped
  file at the same path)
- `apps/admin/src/features/deals/**` (rewritten — replaces the discount-shaped folder at the same
  path; keeps the file-layout SHAPE: `lib/`, `hooks/`, `components/`)
- `apps/admin/src/routes/(dashboard)/{deals.tsx,deals.index.tsx,deals.$dealId.tsx}` (rewritten —
  same 3-file Outlet-split shape, new content)

**Modified (additive only unless noted):**
- `packages/api/src/db/schema/products.ts` — add `is_deal` column
- `packages/api/src/db/schema/index.ts` — add `export * from './deal_components'`
- `packages/api/src/routes/branches.ts:100-113` — filter site (a) + (b)
- `packages/api/src/routes/admin/products.ts:85-99` — filter site (c)
- `packages/api/src/routes/lib/serializers.ts` — extend `AdminProduct`/`serializeAdminProduct` (or a
  local `AdminDealProduct` — EXECUTE decides based on how much the deal DTO actually diverges from
  `AdminProduct`; see Implementation Checklist item 5) to carry `isDeal` + `components` array
- `packages/api/src/routes/orders.ts` — add a **header comment only** on the dormant deal-apply block
  (lines ~182-272), no functional change (Decision 6)
- `packages/api/db/seed.ts` (or equivalent seed script) — add the "Deals" category row (Decision 8)
- `packages/types/src/menu.ts` (or wherever `Product`/admin-product-equivalent types live) — add
  `isDeal: boolean` + a new `DealComponent` type
- `apps/admin/src/config/nav-config.ts` — Deals nav item already exists (discount plan added it);
  confirm it still points at the same `(dashboard)/deals` route path, update label/description only
  if needed

**Removed (as part of this phase's EXECUTE, see Discard Plan):**
- Discount-shaped `packages/api/src/routes/admin/deals.ts` content (file path reused, content
  replaced)
- Discount-shaped `apps/admin/src/features/deals/**` content (folder path reused, content replaced)
- `packages/api/src/lib/__tests__/admin-deals.integration.test.ts` (discount-shaped tests — replaced
  with new deals-as-products tests at the same path)
- `packages/api/src/routes/lib/serializers.ts`'s discount-shaped `AdminDeal`/`AdminDealExtras`/
  `serializeAdminDeal` (VALIDATE V2 Layer 2 finding, 15-07-26 — the discount-shaped admin serializer
  becomes orphaned dead code once `admin/deals.ts` is rewritten; confirmed via grep it has zero other
  consumers)

**Explicitly NOT touched:**
- `deals`, `deal_products`, `deal_branches`, `coupons` tables/schema files (dormant, see below)
- `packages/api/src/routes/deals.ts` (public discount-deals read routes — dormant, still live for
  mobile's interim reads, see 4b handoff §6)
- `packages/api/src/routes/lib/serializers.ts`'s `serializeDeal`/`ApiDeal` (public, dormant)
- `orders.ts`'s deal-apply block body (header comment only, no logic change)

---

## Public Contracts

Mirrors `products.ts`'s exact conventions (`z.uuid()` path-param pre-validation, Zod `safeParse`
body validation, `{deal}`/`{deals}` envelopes, `AdminApiError` + `handleAdminError`).

- `GET /api/admin/deals` — list ALL is_deal=true products (active + inactive), optional
  `?isActive=true|false` filter → `200 { deals: AdminDealProduct[] }`
- `GET /api/admin/deals/:id` — single deal-product incl. its `components` array
  (`{ componentProductId, componentName, quantity }[]`, resolved via a join for display) →
  `200 { deal: AdminDealProduct }`, `404` if id doesn't resolve or `is_deal !== true`
- `POST /api/admin/deals` — create a product with `isDeal: true` (same body shape as
  `createProductSchema` minus `categoryId`, which is server-pinned to the seeded "Deals" category per
  Decision 8) → `201 { deal: AdminDealProduct }`, `400` on validation failure
- `PATCH /api/admin/deals/:id` — update deal-product fields (name/description/basePriceCents/
  imageUrl/isActive) — same shape as `updateProductSchema` → `200 { deal: AdminDealProduct }`, `400`/
  `404`
- `POST /api/admin/deals/:id/components` — attach a component product; body
  `{ componentProductId: string, quantity?: number }` (default `quantity: 1`); rejects self-reference
  and deal-of-deals (Decision 3) → `201 { attached: true }`, `400` on self-ref/deal-of-deals, `404` if
  component id doesn't resolve, `409` on duplicate attach
- `DELETE /api/admin/deals/:id/components/:componentProductId` — detach a component →
  `204`, `404` if the pair isn't currently attached
- All routes: `admin`/`super_admin` only (inherited `requireAdmin`), `403` for `staff`/`customer`

Money (`basePriceCents`) is integer cents in every request/response body — conversion via
`numericToCents`/`centsToNumeric` happens only in the route layer.

**Menu read contract (filter sites a/b, consumed by 4b):**
`GET /branches/:id/menu` (existing route, unchanged shape) gains `?isDeal=true` — when present,
returns deal-products (`is_deal = true`) instead of regular catalog products, in the SAME
`MenuResponse` envelope. See the 4b handoff doc for the exact response shape example including how
`deal_components` are surfaced for the "what's inside" display.

---

## Blast Radius

- **Packages touched:** `packages/api` (1 new migration, 1 new schema file, 1 rewritten admin route
  file, 2 filter-site edits, 1 header-comment-only edit, serializer extension, seed addition),
  `apps/admin` (1 rewritten feature folder, 3 rewritten route files — same paths as before),
  `packages/types` (additive `isDeal`/`DealComponent`).
- **Risk class:** none of the umbrella's 6 high-risk classes apply directly at the API-contract level
  (internal admin CRUD behind `requireAdmin`, no external public-API break, no billing). **The
  migration itself (schema change) is the one item that DOES cross the "schema/data migration" risk
  class** — additive-only (`NOT NULL DEFAULT false` column + new table, zero data migration), but
  still flagged per the umbrella's risk-class list; the snapshot-integrity regression test (Decision
  7) is the concrete mitigation gate.
- **Migration:** 0007 — additive only, no backfill needed (`is_deal` defaults `false` for every
  existing product row; the new `deal_components` table starts empty).
- **File count estimate:** ~16-19 new/modified files (1 migration, 1 schema file, 1 schema index
  export line, 1 rewritten route file, 2 filter-site edits, 1 header-comment edit, 1 serializer
  extension, 1 seed addition, 1 types addition, 1 rewritten feature folder with several files, 3
  rewritten TanStack Start route files) — MEDIUM blast radius, spans `packages/api` + `apps/admin` +
  `packages/types`, WITH a schema migration (unlike the discarded Phase 4 plan, which needed none).
- **Shared-surface note (for umbrella Pre-PVL Conflict Resolution):** `packages/api/src/routes/
  admin/index.ts` is UNCHANGED (the `dealsRouter` mount line already exists from the discarded plan
  and is reused verbatim — the router variable name and mount path do not change, only the file it
  imports from). `products.ts`'s list-route filter change (site c) touches Phase 3's ✅ VERIFIED
  surface — flag as the phase's primary regression-checkpoint target.

---

## Discard Plan (part of EXECUTE scope, git mechanic recommendation for orchestrator)

The commit-`d5070d8` discount-shaped code is superseded, not deleted from history. **Recommended git
mechanic: a follow-up removal commit at EXECUTE time** (delete the discount-shaped file contents and
write the new deals-as-products content in the same paths), NOT a `git revert d5070d8` — a revert
would also attempt to undo the SHARED composites (`data-table.tsx`, `form-dialog.tsx`, the
`confirm-dialog.tsx` `children` slot) that this phase's own Discard Plan explicitly KEEPS, since they
are genuinely reusable UI infrastructure independent of the deal model. A `git revert` would need a
manual conflict-resolution pass to re-add those files anyway, so a clean forward-only "replace
content at the same paths" commit is simpler and the history stays linear. The orchestrator should
surface this exact recommendation to the user/EXECUTE before starting Implementation Checklist item
9 (Discard).

**Discard, specifically:**
- `packages/api/src/routes/admin/deals.ts` — full content replacement (old discount CRUD → new
  deals-as-products CRUD)
- `apps/admin/src/features/deals/**` — full content replacement (old discount UI → new deal-product
  UI); KEEP the folder's existing `lib/`/`hooks/`/`components/` layout shape
- `packages/api/src/lib/__tests__/admin-deals.integration.test.ts` — full content replacement (old
  AC1-AC10 discount tests → new deals-as-products tests)
- `packages/api/src/routes/lib/serializers.ts` — remove the discount-shaped `AdminDeal` interface,
  `AdminDealExtras` interface, and `serializeAdminDeal` function (~lines 460-530 pre-EXECUTE).
  Confirmed via grep: their ONLY importer is the old `admin/deals.ts` (being rewritten in this same
  phase), so they become orphaned exported dead code otherwise — `tsc --noEmit` does not flag unused
  EXPORTS, so this would silently survive typecheck if not explicitly removed. KEEP the PUBLIC
  `ApiDeal`/`serializeDeal` (dormant, consumed by the still-live `routes/deals.ts` read routes) —
  do not confuse the two; only the ADMIN-prefixed symbols are discarded. (VALIDATE V2 Layer 2
  finding, 15-07-26 — added to the Discard Plan; not in the original RE-PLAN text.)

**KEEP verbatim (genuinely reusable, not deal-specific):**
- `apps/admin/src/components/data-table.tsx`
- `apps/admin/src/components/form-dialog.tsx`
- `apps/admin/src/components/confirm-dialog.tsx`'s additive `children` slot
- `apps/admin/src/components/{query-states,page-header}.tsx` (Phase 3, untouched by either deals plan)

**Legacy deals stays dormant (do NOT touch):**
`deals`, `deal_products`, `deal_branches`, `coupons.deal_id`, `orders.deal_id`,
`packages/api/src/routes/deals.ts` (public read routes), `serializeDeal`/`ApiDeal`
(`packages/types/src/deals.ts` and `serializers.ts`), the `orders.ts` deal-apply block
(lines ~182-272, gains a header comment only per Decision 6). All preserved for ADM-008 (coupon
domain — Promotion→Offer→Coupon) to potentially resume in a modified form.

---

## Implementation Checklist

1. **Seed the "Deals" category** (Decision 8) via the existing Categories admin CRUD (or seed
   script) — MUST be the first checklist item so deal-creation cannot 500 on a missing FK. Add a
   header comment on `orders.ts`'s dormant deal-apply block (Decision 6) — a documentation-only edit,
   bundled here since it's a one-line comment, not functional.
2. **Write migration 0007**: `products.is_deal boolean not null default false` (additive column) +
   new `deal_components` table (Decision 2 shape, first self-referential FK — header comment in the
   new schema file). Run `db:generate` then `db:migrate` locally; confirm the snapshot/journal are
   consistent.
3. **Update `packages/api/src/db/schema/index.ts`** — add `export * from './deal_components'` in the
   correct dependency-order comment block (mirrors the existing `deals`/`deal_products`/
   `deal_branches` block's own dependency-order comments).
4. **Filter site edits (a)+(b)+(c)** — `branches.ts:100-113` add `eq(products.is_deal, false)` to the
   menu where-clause + add the `?isDeal=true` param flip; `admin/products.ts:85-99` default-exclude
   `is_deal=true` + add `?isDeal=` override param. Explicitly verify (d) `orders.ts:100-125` and (e)
   `staff.ts:335-358` need NO change (per the table above) — do not silently skip verifying them.
5. **Extend the serializer** — EXECUTE decides: extend `AdminProduct`/`serializeAdminProduct`
   additively with `isDeal`/`components`, OR declare a local `AdminDealProduct`/
   `serializeAdminDealProduct` (mirroring the local-declaration convention every prior admin DTO has
   used). Base the decision on how much the deal response shape actually diverges once the components
   array is added — document whichever is chosen with a one-line rationale comment in
   `serializers.ts`.
6. **Build `admin/deals.ts`** — CRUD core (`GET`/`GET :id`/`POST`/`PATCH`) styled as a sibling of
   `admin/products.ts`, `categoryId` server-pinned to the Decision 8 seeded category on create; the
   `deal_components` attach/detach routes (Decision 3 self-ref + deal-of-deals guard, FK pre-check →
   insert → 409-on-dup via `isUniqueViolation`; delete→returning→404-on-empty).
7. **Rewrite `admin/index.ts`'s import target only** — the existing `adminRouter.use('/deals',
   dealsRouter)` line is UNCHANGED; only the `import dealsRouter from './deals'` target file's
   CONTENT changes (Discard Plan). No structural edit to `index.ts` itself.
8. **Add `isDeal`/`DealComponent` types** to `packages/types` (wherever `Product`-equivalent shared
   types live) — additive only.
9. **Discard the old admin UI, build the new one** — replace `apps/admin/src/features/deals/**`
   content (KEEP the `lib/hooks/components` folder shape); build the quantity-aware component chip
   editor by extending the discarded `junction-chip-editor.tsx` shape with a `quantity` field; build
   the deal list (consumes `data-table` + `page-header`), create/edit form (consumes `form-dialog`,
   pins category invisibly), and the deactivate flow (reuses the EXISTING products deactivate route
   semantics — `PATCH .../isActive: false` — no new deactivate route needed).
10. **Rewrite the 3 TanStack Start route files** (`deals.tsx` thin `<Outlet/>` layout,
    `deals.index.tsx` list, `deals.$dealId.tsx` detail/edit) — apply the Outlet split from the start
    (durable gotcha carry-forward, below). Confirm `nav-config.ts`'s existing Deals nav item still
    resolves correctly.
11. **Write the snapshot-integrity regression test (Decision 7, REQUIRED)** — mirror P3's AC1
    pattern exactly, but against an `is_deal=true` product: place an order containing a deal-product,
    edit the deal-product's `base_price` via the new admin route, assert the order's
    `order_items.unit_price`/`total_price` are unchanged.
12. **Write remaining automated tests** per Verification Evidence below (TDD red-first).
13. **Run regression checkpoint** against Phase 3 (products/categories — filter site (c) touches
    its ✅ VERIFIED surface directly) and the public menu route (filter sites (a)/(b)): re-run
    `admin-products.integration.test.ts`/`admin-categories.integration.test.ts` and the existing
    `branches`/menu integration suite once, confirming 0 regressions against the current baseline.
14. **Discard the old test file, write the new one** at the same path
    (`admin-deals.integration.test.ts`), per the Discard Plan.

Test procedure: run `pnpm --filter @jojopotato/api test admin-deals` (no `--` before the filter
argument — the pnpm-filter CLI-passthrough gotcha, see Test Infra Improvement Notes) after each
checklist section; do not batch all gates to the end, per `process/context/tests/all-tests.md`.

---

## Acceptance Criteria

1. `products.is_deal` column exists, defaults `false`, and every pre-existing product row is
   unaffected (still `is_deal = false`, no other column changed) after migration 0007 — proven by:
   `migration-0007-additive-no-regression` | strategy: Fully-Automated.
2. `POST /api/admin/deals` creates a product with `isDeal: true`, server-pinned to the seeded
   "Deals" category, and returns it with `201` — proven by: `deal-create-happy-path` | strategy:
   Fully-Automated.
3. `POST /api/admin/deals/:id/components` attaches a component product with a `quantity`; re-attaching
   the same pair is rejected cleanly with `409` — proven by:
   `deal-component-attach-and-duplicate-reject` | strategy: Fully-Automated.
4. `POST /api/admin/deals/:id/components` with `componentProductId === dealProductId` (self-ref) is
   rejected with `400`; attaching a component whose own `is_deal === true` (deal-of-deals) is
   rejected with `400` — proven by: `deal-component-self-ref-and-deal-of-deals-reject` | strategy:
   Fully-Automated.
5. `DELETE .../components/:componentProductId` detaches cleanly (`204`); detaching a non-attached
   pair returns `404` — proven by: `deal-component-detach-and-not-found` | strategy: Fully-Automated.
6. Only `admin`/`super_admin` roles can call any `/api/admin/deals/*` write route; `staff`/`customer`
   get `403` — proven by: `deal-route-authz-rejection` | strategy: Fully-Automated.
7. `GET /branches/:id/menu` (no param) EXCLUDES `is_deal=true` products; `GET /branches/:id/menu?isDeal=true`
   returns ONLY `is_deal=true` products — proven by: `menu-isDeal-filter-both-directions` | strategy:
   Fully-Automated.
8. `GET /api/admin/deals` returns ONLY `is_deal=true` products (incl. inactive/out-of-catalog);
   `GET /api/admin/products` (existing route) EXCLUDES `is_deal=true` products by default and
   includes them only with `?isDeal=true` — proven by: `admin-products-and-deals-list-mutually-exclusive`
   | strategy: Fully-Automated.
9. **[HARD, Known-Gap banned]** Editing an `is_deal=true` product's `base_price` via
   `PATCH /api/admin/deals/:id` after an order containing it has been placed does NOT mutate that
   order's `order_items.unit_price`/`total_price` — proven by: `deal-product-snapshot-integrity`
   | strategy: Fully-Automated.
10. A deal-product can be ordered through the normal customer order-placement flow
    (`POST /orders`) exactly like any other product, with no `is_deal`-based rejection — proven by:
    `deal-product-orderable-via-normal-checkout` | strategy: Fully-Automated.
11. A deal-product's per-branch availability can be toggled by staff via the existing
    `GET/PATCH /api/staff/products` flow exactly like any other product, with no `is_deal`-based
    exclusion — proven by: `deal-product-staff-availability-toggle` | strategy: Fully-Automated.
12. Admin UI: deal list (`data-table`) and create/edit form (`form-dialog`) round-trip all fields
    incl. the quantity-aware component chip attach/detach editor; deactivating a deal-product reuses
    the existing products deactivate flow correctly — proven by: `admin-deals-ui-manual-walkthrough`
    | strategy: Agent-Probe (no `apps/admin` browser/E2E runner exists yet — project-wide gap,
    matching P2 AC7/P3 AC8/discarded-P4 AC11 precedent).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `migration-0007-additive-no-regression` — column defaults false, no existing row mutated | Fully-Automated | AC1 |
| `deal-create-happy-path` — create with `isDeal:true`, server-pinned category, 201 | Fully-Automated | AC2 |
| `deal-component-attach-and-duplicate-reject` — attach writes `deal_components`; re-attach → 409 | Fully-Automated | AC3 |
| `deal-component-self-ref-and-deal-of-deals-reject` — self-ref → 400; component with is_deal=true → 400 | Fully-Automated | AC4 |
| `deal-component-detach-and-not-found` — detach removes row (204); non-attached pair → 404 | Fully-Automated | AC5 |
| `deal-route-authz-rejection` — staff/customer session → 403 on all deal write routes | Fully-Automated | AC6 |
| `menu-isDeal-filter-both-directions` — default excludes deals; `?isDeal=true` returns only deals | Fully-Automated | AC7 |
| `admin-products-and-deals-list-mutually-exclusive` — products list excludes deals by default; deals list is deals-only | Fully-Automated | AC8 |
| `deal-product-snapshot-integrity` — placed order + base_price edit → order_items unchanged | Fully-Automated | AC9 (HARD, Known-Gap banned) |
| `deal-product-orderable-via-normal-checkout` — POST /orders with a deal-product line succeeds normally | Fully-Automated | AC10 |
| `deal-product-staff-availability-toggle` — staff PATCH toggles a deal-product's branch availability | Fully-Automated | AC11 |
| `admin-deals-ui-manual-walkthrough` — create deal → attach/detach components with quantity → edit → deactivate | Agent-Probe | AC12 |
| Existing `admin-products.integration.test.ts` / `admin-categories.integration.test.ts` / menu + branches suites re-run after this phase's filter-site edits | Fully-Automated | Regression guard (no SPEC criterion — filter-site safety) |

**Failing stubs (Fully-Automated tier, TDD red-first starting point for EXECUTE):**

```text
test("AC1 — migration 0007 should add is_deal defaulting false without mutating existing rows", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1")
})
test("AC2 — should create a deal-product with isDeal true, server-pinned to the Deals category", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC2")
})
test("AC3 — should attach a component product with quantity and cleanly reject a duplicate attach with 409", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3")
})
test("AC4 — should reject self-reference and deal-of-deals component attachment with 400", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC4")
})
test("AC5 — should detach a component (204) and 404 on a non-attached pair", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC5")
})
test("AC6 — should reject staff/customer role sessions with 403 on all /api/admin/deals/* write routes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC6")
})
test("AC7 — GET /branches/:id/menu should exclude deals by default and return only deals with ?isDeal=true", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC7")
})
test("AC8 — admin products list should exclude deals by default; admin deals list should return only deals", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC8")
})
test("AC9 — editing a deal-product's base_price after order placement must not mutate order_items snapshot", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC9")
})
test("AC10 — a deal-product should be orderable via normal POST /orders checkout with no rejection", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC10")
})
test("AC11 — staff should be able to toggle a deal-product's per-branch availability like any product", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC11")
})
```

Test file path: replaces `admin-deals.integration.test.ts` content at the same path under
`packages/api/src/lib/__tests__/`, still reusing the `makeUser(role)` self-seeding fixture. Run:
`pnpm --filter @jojopotato/api test admin-deals` (no `--` before the filter argument). Requires local
Postgres migrated. Baseline to beat: the pre-existing suite count minus the 31 discarded discount
tests, plus these new tests, with 0 regressions elsewhere.

---

## Security

- **Zod-before-Postgres, always** — every write route validates the full request body before any DB
  call: `quantity` non-negative-int, self-reference/deal-of-deals rejection (Decision 3), category
  server-pin (never client-suppliable for a deal).
- **`requireAdmin` inheritance, no per-handler re-check** — deals CRUD is admin-level, not
  super_admin-only, consistent with every prior admin-CRUD phase.
- **No hard deletes** — a deal is a `products` row; deactivation reuses the existing products
  `is_active` toggle; `deal_components` `DELETE` removes only the link row, never a product.
- **FK pre-checks before junction insert** (Decision 3) — attaching a non-existent component product
  returns a clean 404, mirroring P3's precedent.
- **Junction unique-violation → clean 409** — reuses `isUniqueViolation`/`handleAdminError` verbatim.
- **Cents-at-boundary money handling** — `basePriceCents` is integer cents in every request/response;
  conversion only in the route layer.
- **Migration safety** — 0007 is additive-only (new column with a default, new table); no existing
  column is altered or dropped, no data migration/backfill script is required.
- **No new secrets, no new trust boundary, no CORS change.**

---

## Durable Gotcha Carry-Forwards

- **TanStack Start nested-detail-route `<Outlet/>` gotcha** (discovered P3, reused by discarded P4):
  a `foo.$id.tsx` file auto-nests under `foo.tsx`; the parent MUST render `<Outlet/>`. This phase's
  rewritten `deals.tsx`/`deals.index.tsx`/`deals.$dealId.tsx` apply the fix pattern from the start.
- **Drizzle `err.cause?.code` unique-violation gotcha** — already fully handled by the shared
  `isUniqueViolation()` helper this phase imports unmodified.

---

## Known Gaps (state plainly, not silently)

- **`orders.ts` dormant deal-apply block test debt** — `orders.test.ts`'s ~15 deal-apply test cases
  now exercise a caller-less code path (the legacy `deals`/`deal_id` mechanism is dormant). This is
  accepted regression insurance for ADM-008, not silently-dropped coverage — a header comment on the
  dormant block (Implementation Checklist item 1) documents this explicitly.
- **Interim mobile staleness** — until the 4b handoff doc is executed by its own team, the mobile
  Deals tab continues reading the OLD `GET /deals` public route (still live, dormant-model), so it
  shows stale/legacy-shaped deals data. This is a known, called-out interim state — not a regression,
  since the old route is untouched and still functions on its own terms.
- **Admin UI Agent-Probe gap** — no `apps/admin` browser/E2E runner exists yet (project-wide gap,
  P2/P3/discarded-P4 precedent); AC12 is Agent-Probe only.

---

## Clean-Code / Modularity Notes

- `admin/deals.ts` is deliberately styled as a sibling of `admin/products.ts` (Decision 1) — same
  Zod/error/serializer conventions — so a future reader can diff the two files to understand exactly
  where deal-products diverge from regular products (categoryId pin, components junction, no
  product_options).
- The component chip editor reuses the discarded plan's `junction-chip-editor.tsx` FILE/PATTERN
  (multi-select-with-remove-chips), extended with a quantity field — not rebuilt from scratch.
- All 5 shared composites (`data-table`, `form-dialog`, `confirm-dialog`, `query-states`,
  `page-header`) are consumed, closing the loop the discarded Phase 4 plan opened — no new composite
  needed for this pivot.

---

## Test Infra Improvement Notes

(none identified yet)

---

## Phase Completion Rules

This phase is CODE DONE when Implementation Checklist items 1-14 are complete and all Fully-Automated
gates in Verification Evidence are green; VERIFIED requires additionally AC12 (Agent-Probe) confirmed
via a real manual walkthrough and a clean regression checkpoint against Phase 3 + the public menu
route. Do not mark ✅ VERIFIED without both phase-gate evidence and regression evidence.

This phase plan is the primary execute anchor for Phase 4a; the companion 4b handoff doc is a
separate, non-executed artifact (see Companion above) and is never treated as part of this phase's
own EXECUTE scope.

## Phase Loop Progress

- [x] 1. RESEARCH (prior pass, 15-07-26 — discount model; superseded)
- [x] 2. INNOVATE (this pass, 15-07-26 — deals-as-products pivot; Decisions 1-8 above)
- [x] 3. PLAN-SUPPLEMENT / RE-PLAN (this pass, 15-07-26 — full rewrite superseding the prior
  discount-shaped plan and its Gate: PASS contract)
- [x] 4. PVL (validate-contract) (15-07-26 — Gate: CONDITIONAL, 0 FAILs / 0 blocking CONCERNs,
  1 non-blocking CONCERN accepted (schema-migration risk class, no full 5-artifact risk-evidence-pack
  — mitigated by the hard AC9 regression test) + 1 plan gap found and fixed in-plan (serializers.ts
  orphaned-symbol Discard Plan addition, see Touchpoints/Discard Plan above); see `## Validate
  Contract` below)
- [x] 5. EXECUTE (15-07-26 — all 14 checklist items complete; 28-test deals-as-products suite green;
  full API suite 211/211, 0 regressions; API + admin + types typecheck clean; format clean for all
  touched files; see `## Deviations` below and the co-located REPORT)
- [ ] 6. EVL
- [ ] 7. UPDATE-PROCESS

**Enhancement E1 loop (2-step create dialog + transactional create-with-components, added
15-07-26 PLAN-SUPPLEMENT — see `## Enhancement E1` below):**
- [x] E1-3. PLAN-SUPPLEMENT (this pass, 15-07-26 — E1 spec captured, user-approved design)
- [x] E1-4. PVL (15-07-26 — Gate: PASS, 0 FAILs / 0 CONCERNs; see `### Validate Contract (E1)`)
- [x] E1-5. EXECUTE (15-07-26 — transactional create-with-components + 2-step wizard shipped;
  admin-deals suite 39/39 green (28 base + 11 new E1 across AC-E1..E5); full API suite 222/222,
  0 regressions; deal-savings unit test 7 cases green; API + admin typecheck clean; touched files
  format-clean + lint-clean. AC-E6 wizard UI walkthrough is Agent-Probe, owed at EVL. See
  `## Deviations (E1)` below.)
- [ ] E1-6. EVL
- [ ] E1-7. UPDATE-PROCESS

Note: 4a's own Steps 6 (EVL) and 7 (UPDATE-PROCESS) are independent of the E1 loop — 4a can be
EVL'd/archived on its own shipped scope, or the orchestrator may choose to fold E1 into the same
UPDATE-PROCESS pass once E1 also reaches EXECUTE. Either sequencing is valid; do not block one on
the other.

## Deviations (EXECUTE, 15-07-26 — all within-blast-radius)

1. **Deals category resolution is route-side resolve-or-ensure, not seed-only.** Decision 8 / item 1
   said seed the "Deals" category (it already exists in `seed/data.ts:130` as slug `deals`). In
   addition, `admin/deals.ts` `resolveDealsCategoryId()` idempotently finds-or-creates the reserved
   category (by unique slug, `onConflictDoUpdate`). Rationale: the integration suite is hermetic (no
   `runSeed`), so relying on the seed alone would 500 on the missing FK — this fully realizes
   Decision 8's stated goal ("deal-creation cannot 500 on a missing FK") in ALL environments. Both
   the deals route + categories table are in-scope; no new surface.
2. **`packages/types` `Product.isDeal` is optional (`isDeal?`), plus an optional `components?`.** The
   touchpoint said "add `isDeal: boolean`". Made it optional because the public `ApiMenuProduct`
   serializer does not emit `isDeal` yet (that is the 4b handoff's job) — a required field would be a
   type/runtime mismatch and force a menu-serializer change outside this phase's scope. Additive-only,
   backward-compatible.
3. **AC9 snapshot test covers the base_price variant only.** P3's AC1 had a second option-delta
   variant; deals have no `product_options` by design (Decision 5), so only the base_price snapshot
   variant applies. Not a coverage gap — deal-products are single fixed-price line items.

Migration 0007 stayed strictly additive (`NOT NULL DEFAULT false` column + new empty table, zero
backfill), so the VALIDATE-accepted CONDITIONAL (schema-migration risk class without a full
5-artifact risk-evidence-pack, mitigated by the hard AC9 test) holds unchanged — no risk pack built.

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-04-deals_PLAN_14-07-26.md`
2. **Last completed phase or step:** Step 3 — RE-PLAN (15-07-26). Ready for Step 4 (PVL) — a fresh
   validate-contract run is required; the prior 15-07-26 PASS contract validated the now-discarded
   discount-shaped model and does not carry forward to this rewrite.
3. **Validate-contract status:** written 15-07-26, Gate: CONDITIONAL (0 FAILs, 1 accepted
   non-blocking CONCERN, `generated-by: inner-pvl: phase-4`) — see `## Validate Contract` below.
   EXECUTE is authorized to proceed on this contract.
4. **Supporting context files loaded:**
   - `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
   - `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-03-products_PLAN_14-07-26.md` (CRUD-shape template)
   - Prior (superseded) `phase-04-deals_PLAN_14-07-26.md` content + `phase-04-deals_REPORT_15-07-26.md` (discarded model, EXECUTEd on commit `d5070d8`)
   - `packages/api/src/db/schema/products.ts`, `deals.ts`, `deal_products.ts`, `deal_branches.ts`, `coupons.ts` (full)
   - `packages/api/src/routes/branches.ts:90-120` (menu query), `admin/products.ts` (GET list + imports), `admin/index.ts` (full), `admin/lib/errors.ts` (full), `orders.ts:100-130` (placement), `staff.ts:330-360` (availability)
   - `packages/api/drizzle/` directory listing (confirmed next migration slot is 0007)
   - Companion doc: `deals-mobile-repoint_HANDOFF_15-07-26.md`
5. **Next step for a fresh agent picking up mid-execution:** run vc-context-discovery +
   vc-plan-discovery, confirm this plan's Phase Loop Progress shows Step 4 (PVL) as the last checked
   box (Gate: CONDITIONAL, 15-07-26), then proceed to Step 5 (EXECUTE) — spawn vc-execute-agent
   against THIS plan file, following the Test Gates table in `## Validate Contract` below and the
   Implementation Checklist in order. Do not reuse the prior discount-model Gate: PASS contract as
   evidence for this rewrite.
6. **Enhancement E1 (added 15-07-26, PLAN-SUPPLEMENT — see `## Enhancement E1` above 4a's shipped
   scope was frozen):** E1 is at Step E1-3 (PLAN-SUPPLEMENT complete). Next step: spawn
   vc-validate-agent for a FRESH E1-scoped PVL pass (Step E1-4) — do not reuse 4a's CONDITIONAL
   contract. Once E1 reaches `Gate: PASS` or an accepted CONDITIONAL, proceed to Step E1-5
   (EXECUTE) against the `## Enhancement E1` section's Touchpoints/Implementation content.

---

## Validate Contract

Status: CONDITIONAL
Date: 15-07-26
date: 2026-07-15
generated-by: inner-pvl: phase-4
supersedes: 15-07-26 (outer-pvl) — the prior contract validated the now-discarded discount-shaped
deals model (commit d5070d8) and does not carry forward to this deals-as-products rewrite; this is
a fresh V1-V7 pass against entirely new plan content, not a re-validation of the same design.

Parallel strategy: sequential (single-agent synthesis)
Rationale: The 7-signal score for this fan-out is 5/7 (S1 multi-package: packages/api + apps/admin +
packages/types; S2 schema/API surface touched; S4 phase-program classification; S6 high-risk class
present (schema/migration); S7 5+ files in blast radius) — HIGH tier, which would normally recommend
parallel-subagents (4 Layer 1 + ~5 Layer 2 section agents ≈ 9 agents). No Agent/Task spawning tool
was available in this validate-agent's toolset for this invocation, so all Layer 1 (4 dimensions)
and Layer 2 (per-section feasibility) checks were performed directly, sequentially, by this single
agent instance, each backed by a direct source-file read (not inference) — see Dimension findings
and Layer 2 sections below for the evidence trail. This is noted as a process deviation, not hidden.
EXECUTE strategy recommendation (separate from this VALIDATE fan-out): **sequential, single
vc-execute-agent (opus)** — despite the same 5/7 HIGH signal score, the work is one cohesive
route-file rewrite + one UI-folder rewrite with a strict 14-item ordered checklist (explicitly
"do not batch all gates to the end") and shared-file touch risk (`serializers.ts` is edited by both
the filter-site work and the deals-route rewrite) — splitting it across parallel agents would risk
mid-file conflicts for no time benefit. This matches the established P1-P3 EXECUTE pattern in this
program (each ran as a single sequential vc-execute-agent pass, not parallel).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | migration 0007 additive-safe, no existing row mutated | Fully-Automated | `pnpm --filter @jojopotato/api test admin-deals` — `migration-0007-additive-no-regression` | A |
| AC2 | create deal-product, server-pinned Deals category, 201 | Fully-Automated | same suite — `deal-create-happy-path` | A |
| AC3 | attach component + quantity; duplicate attach → 409 | Fully-Automated | same suite — `deal-component-attach-and-duplicate-reject` | A |
| AC4 | self-ref / deal-of-deals rejected with 400 | Fully-Automated | same suite — `deal-component-self-ref-and-deal-of-deals-reject` | A |
| AC5 | detach component (204); non-attached pair → 404 | Fully-Automated | same suite — `deal-component-detach-and-not-found` | A |
| AC6 | staff/customer → 403 on all deal write routes | Fully-Automated | same suite — `deal-route-authz-rejection` | A |
| AC7 | menu `?isDeal=` filter both directions | Fully-Automated | same suite — `menu-isDeal-filter-both-directions` | A |
| AC8 | admin products/deals lists mutually exclusive | Fully-Automated | same suite — `admin-products-and-deals-list-mutually-exclusive` | A |
| AC9 (HARD, Known-Gap banned) | base_price edit after order placement never mutates order_items snapshot | Fully-Automated | same suite — `deal-product-snapshot-integrity` | A |
| AC10 | deal-product orderable via normal `POST /orders` | Fully-Automated | same suite — `deal-product-orderable-via-normal-checkout` | A |
| AC11 | staff can toggle a deal-product's branch availability | Fully-Automated | same suite — `deal-product-staff-availability-toggle` | A |
| AC12 | admin UI: deal CRUD + component chip editor + deactivate | Agent-Probe | manual walkthrough (no `apps/admin` browser/E2E runner — project-wide gap, P2 AC7/P3 AC8 precedent) | D |
| Regression guard (no SPEC id) | Phase 3 products/categories + public menu route unaffected | Fully-Automated | `pnpm --filter @jojopotato/api test` (full suite, 0 regressions vs pre-EXECUTE baseline) | A |
| Regression guard (no SPEC id) | no cross-package type breakage | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` + `pnpm --filter @jojopotato/admin generate-routes && pnpm --filter @jojopotato/admin typecheck` | A |
| Style guard (no SPEC id) | formatting clean before commit | Fully-Automated | `pnpm format:check` | A |

gap-resolution legend: A — proven now (gate passes in this cycle) once EXECUTE writes the real test
file; B — fixed in this plan; C — deferred to a named later phase/plan; D — backlog test-building
stub (named residual, keep-active, continue).

Legacy line form:
- deals-as-products core (AC1-AC11): Fully-automated: `pnpm --filter @jojopotato/api test admin-deals`
  (no `--` before the filter arg; requires local Postgres migrated — `docker compose up -d` or the
  native-Postgres dev-machine fallback documented in `all-tests.md`, then `pnpm --filter
  @jojopotato/api db:migrate`)
- full-suite regression (Phase 3 + menu route): Fully-automated: `pnpm --filter @jojopotato/api test`
- typecheck (both packages): Fully-automated: `pnpm --filter @jojopotato/api typecheck` and
  `pnpm --filter @jojopotato/admin generate-routes && pnpm --filter @jojopotato/admin typecheck`
- format: Fully-automated: `pnpm format:check`
- admin UI walkthrough (AC12): agent-probe: create deal → attach/detach 2+ components with
  varying quantity → edit base_price → deactivate → confirm deal list/detail round-trip correctly;
  known-gap: no `apps/admin` browser/E2E runner exists yet (project-wide, documented, not silently
  dropped)

Failing stub (Fully-Automated rows only — copied verbatim from the plan's own stub block, which
already matches this table's scenario names 1:1):

```text
test("AC1 — migration 0007 should add is_deal defaulting false without mutating existing rows", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1")
})
test("AC2 — should create a deal-product with isDeal true, server-pinned to the Deals category", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC2")
})
test("AC3 — should attach a component product with quantity and cleanly reject a duplicate attach with 409", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3")
})
test("AC4 — should reject self-reference and deal-of-deals component attachment with 400", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC4")
})
test("AC5 — should detach a component (204) and 404 on a non-attached pair", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC5")
})
test("AC6 — should reject staff/customer role sessions with 403 on all /api/admin/deals/* write routes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC6")
})
test("AC7 — GET /branches/:id/menu should exclude deals by default and return only deals with ?isDeal=true", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC7")
})
test("AC8 — admin products list should exclude deals by default; admin deals list should return only deals", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC8")
})
test("AC9 — editing a deal-product's base_price after order placement must not mutate order_items snapshot", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC9")
})
test("AC10 — a deal-product should be orderable via normal POST /orders checkout with no rejection", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC10")
})
test("AC11 — staff should be able to toggle a deal-product's per-branch availability like any product", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC11")
})
```

Dimension findings:
- Infra fit: PASS — no container/infra/worker surface touched; migration slot 0007 confirmed free
  (`packages/api/drizzle/` listing checked directly — last file is `0006_legal_daredevil.sql`); local
  Postgres provisioning path already documented (`all-tests.md` dev-machine native-Postgres note).
- Test coverage: PASS — every AC1-AC11 has a named Fully-Automated proving test + matching TDD stub;
  AC12 is correctly Agent-Probe (a genuine proving strategy, not a coverage-less Known-Gap — no
  vacuous-green violation); regression checkpoint against Phase 3 + the public menu route is an
  explicit checklist item (#13), not assumed.
- Breaking changes: PASS (with note) — `admin/deals.ts`'s API shape fully replaces the discarded
  discount-shaped contract, but this is a safe atomic swap: the ONLY consumer (`apps/admin/src/
  features/deals/**`) is replaced in the SAME phase's EXECUTE scope (confirmed via grep — no
  external/mobile consumer of `/api/admin/deals/*` exists); `admin/products.ts`'s list-route
  default-exclude-is_deal change has zero practical effect today (no `is_deal=true` rows exist until
  this phase creates the first one) and is directly proven safe by AC8's test; `GET /branches/:id/
  menu`'s `?isDeal=` param is purely additive (default behavior unchanged, verified against the live
  route at `branches.ts:100-113`).
- Security surface: PASS — `requireAdmin` inheritance confirmed unchanged at the router-mount level
  (`admin/index.ts` read directly — only the `dealsRouter` import target changes, the mount line
  itself is untouched); Zod-before-Postgres on every write; no hard deletes (soft `is_active` toggle
  reused verbatim); FK pre-check-then-insert on the junction table (zero extra query, confirmed
  mechanically sound against the read the route already performs); cents-at-boundary discipline
  matches every prior admin route; migration is additive-only (`NOT NULL DEFAULT false` + new empty
  table, no backfill); no new secret/CORS/trust-boundary surface. STRIDE quick-scan: no new
  information-disclosure surface (deal-products are meant to be publicly visible menu items, same as
  regular products — no PII); no new elevation-of-privilege path.

Layer 2 — per-section feasibility:
- Section: Schema (Decisions 2, 3, 8) — Status: PASS. Mechanical feasibility: `deal_components`
  shape is well-formed Drizzle (self-referential double FK into `products`, `NO ACTION`, composite
  unique index) — first-of-kind precedent correctly flagged for a header comment. Self-ref/deal-of-
  deals guard piggybacks on the FK-existence read the route already performs before insert — verified
  against the exact analogous pattern in `admin/products.ts` (`assertActiveCategory` reads once,
  reused before insert) — zero extra query, mechanically sound. `products.category_id NOT NULL`
  confirmed directly from `schema/products.ts:6-8` — Decision 8's seeded-category mitigation is
  correctly sequenced as Implementation Checklist item 1 (first item, before migration even runs is
  fine since seeding is independent of the is_deal column). Gaps found: none. Conflicts found: none.
  Highest-risk edit: the migration's additive column default — mitigated by Postgres semantics
  (`NOT NULL DEFAULT false` back-fills existing rows automatically, no manual UPDATE needed) and
  proven by AC1's own regression test.
- Section: Filter Sites (Decision 4, the 5-site table) — Status: PASS. Mechanical feasibility: all 5
  site line ranges verified against LIVE source (not the plan's cited line numbers alone):
  `branches.ts:100-113` (menu inner-join, matches plan exactly), `admin/products.ts:~85-99` (GET /
  list route, matches), `orders.ts:100-125` region (product-availability join inside the placement
  transaction, confirmed no `is_deal` check exists today and none is needed — the plan's "NO CHANGE"
  call is correct), `staff.ts:334-368` (availability GET, confirmed LEFT JOIN with no `is_deal` check,
  "NO CHANGE" is correct — staff must toggle deal-product availability exactly like any product).
  Gaps found: none — all 5 sites individually enumerated as required. Conflicts found: none. Highest-
  risk edit: site (c)'s default-exclude change touches Phase 3's ✅ VERIFIED surface directly —
  mitigated by checklist item 13's explicit regression re-run requirement.
- Section: Discard Plan — Status: CONCERN → FIXED IN PLAN. Mechanical feasibility: the 3 originally-
  listed discard targets (`admin/deals.ts`, `apps/admin/src/features/deals/**`, `admin-deals.
  integration.test.ts`) are all real, correctly-scoped, and confirmed to have no consumer outside
  themselves. Gap found (and fixed): `packages/api/src/routes/lib/serializers.ts`'s discount-shaped
  `AdminDeal`/`AdminDealExtras`/`serializeAdminDeal` (lines ~460-530) was NOT in the original discard
  list — confirmed via `grep -rn "AdminDeal\b|serializeAdminDeal\b"` that their only importer is the
  old `admin/deals.ts` being rewritten in this same phase, so they would become orphaned exported dead
  code (invisible to `tsc --noEmit`, which does not flag unused exports) if left unaddressed. This
  finding was applied directly to the plan (added to both the Touchpoints "Removed" list and the
  Discard Plan's "Discard, specifically:" list, dated 15-07-26) rather than deferred to an execute-
  agent instruction, since it is a small, unambiguous, single-file text addition. The public
  `ApiDeal`/`serializeDeal` (dormant, still consumed by the live `routes/deals.ts` read routes) is
  explicitly called out as NOT part of this removal — confirmed distinct in the same file. Conflicts
  found: none, after the fix. Highest-risk edit: none additional — this is a cleanup-only fix.
- Section: Snapshot Integrity (Decision 7 / AC9) — Status: PASS. Mechanical feasibility: verified by
  direct read of `admin/products.ts`'s `PATCH /:productId` handler — it writes ONLY to the `products`
  table (`db.update(products).set(updates)...`), never touches `order_items`; confirmed via
  `grep -rn "order_items|orderItems" packages/api/src/routes/admin/*.ts` that no admin route file
  references `order_items` at all. `admin/deals.ts`'s PATCH will mirror this pattern exactly (Decision
  1). This is the SAME mechanism Phase 3's AC1 already proved for regular products — AC9 duplicates
  that proof against an `is_deal=true` product specifically, which is the correct approach per
  Decision 7 (not relying on "same table, must already be covered"). Gaps found: none. Conflicts
  found: none. Highest-risk edit: none beyond the already-covered PATCH path.
- Section: Public Contracts / route shapes — Status: PASS. Mechanical feasibility: response envelopes
  (`{deal}`/`{deals}`) match the established `products.ts` convention exactly; test command syntax
  (`pnpm --filter @jojopotato/api test admin-deals`) verified valid — `packages/api`'s vitest `test`
  script is a bare `vitest run` with `include: ['src/**/__tests__/**/*.test.ts']`, so a positional
  arg filters by filename substring (matches `admin-deals.integration.test.ts`), consistent with
  every prior phase's test-gate command. `apps/admin generate-routes` script confirmed present
  (`tsr generate`) before the typecheck gate that depends on it. Gaps found: none. Conflicts found:
  none.
- Section: Admin UI (AC12) — Status: PASS (with accepted known-gap). Mechanical feasibility: consumes
  all 5 existing shared composites (`data-table.tsx`, `form-dialog.tsx`, `confirm-dialog.tsx`,
  `query-states.tsx`, `page-header.tsx` — all confirmed present in `apps/admin/src/components/`); the
  `deals.tsx` Outlet-layout route already exists from the discarded plan and already applies the
  `<Outlet/>` fix pattern (confirmed by direct read) — only `deals.index.tsx`/`deals.$dealId.tsx`
  content needs rewriting, `deals.tsx` itself needs no change. `nav-config.ts`'s Deals nav item
  confirmed present and correctly pointed at `/deals` (no change needed). Gaps found: none beyond the
  already-documented project-wide Agent-Probe gap. Conflicts found: none.

Net gate: 0 FAILs / 1 accepted non-blocking CONCERN (schema-migration risk class, see below) / 1
CONCERN found-and-fixed-in-plan (Discard Plan gap, resolved above, no longer open) / 13 PASS.

Known-gap exclusion note: AC12 (Agent-Probe) is NOT a Known-Gap-tier row for net-gate purposes — it
is a legitimate proving strategy per the C-4 3-strategy reconciliation. The Net-gate vacuous-green
ban does not apply here: every developed behavior in this phase's blast radius has either a
Fully-Automated gate (AC1-AC11 + regressions) or an Agent-Probe gate (AC12 admin UI) — none rests on
Known-Gap alone.

Open gaps:
- Schema/data-migration risk class (orchestration.md's 6 high-risk classes) applies to migration
  0007. A full 5-artifact risk-evidence-pack (`risk-gate.json`/`context-snippets.json`/
  `verification.json`/`review-decision.json`/`adversarial-validation.json`) was NOT built for this
  phase. Accepted as CONDITIONAL rather than requiring the full pack, for two reasons: (1) precedent
  — Phase 2's branches migration (0003, also additive-only) shipped ✅ VERIFIED without a dedicated
  risk-evidence-pack in this same program (only Phase 1's auth/identity surface got one, per the
  program's own risk-class judgment); (2) the migration itself is strictly additive (new column with
  a default, new empty table, zero backfill, zero destructive operation), and the concrete
  correctness risk this migration enables — silent snapshot mutation — already has a HARD,
  Known-Gap-banned automated regression test (AC9) that is a stronger, code-level guarantee than a
  manual evidence pack would add for this specific additive-only case. If EXECUTE discovers the
  migration needs to become non-additive (e.g. a backfill, a column rename) at any point, STOP and
  build the full risk-evidence-pack before proceeding — that would change the risk profile this
  acceptance is based on.
- `orders.ts` dormant deal-apply block test debt (Decision 6, ~15 test cases exercising a
  caller-less code path) — accepted, documented in-plan, not a new gap introduced by VALIDATE.
- Interim mobile staleness (4b handoff, non-executed by this program) — accepted, documented in-plan,
  not a new gap introduced by VALIDATE.
- Admin UI Agent-Probe gap (AC12) — accepted, project-wide precedent (P2 AC7/P3 AC8), documented
  in-plan, not a new gap introduced by VALIDATE.

What this coverage does NOT prove:
- AC1-AC11's Fully-Automated gates prove server-side correctness (schema, CRUD, filters, authz,
  snapshot integrity, orderability, staff availability) against a real local Postgres — they do NOT
  prove the admin UI actually round-trips these operations correctly through real browser
  interaction; that is AC12's job, and AC12 is Agent-Probe only (no automated browser assertion).
- The full-suite regression gate (`pnpm --filter @jojopotato/api test`) proves no OTHER existing
  route/suite broke — it does NOT prove the admin UI's TypeScript types are structurally correct
  against the new API shapes; that is what the `apps/admin typecheck` gate (run after
  `generate-routes`) proves instead.
- None of these gates exercise the companion 4b mobile-repoint handoff — that document is explicitly
  out of this phase's EXECUTE scope and carries its own (unwritten, future) acceptance checks.
- The accepted schema-migration-risk CONCERN above means EXECUTE has NOT gone through a manual
  adversarial-validation pass on the migration; the mitigation is AC9's automated regression test,
  not a human review artifact — if that distinction matters for a future audit, treat this as an
  explicit gap, not an oversight.

Gate: CONDITIONAL (0 FAILs; 1 non-blocking CONCERN accepted with documented rationale — schema-
migration risk class without a full risk-evidence-pack, mitigated by AC9's hard regression test; 1
additional CONCERN found during VALIDATE was fixed directly in the plan text before this contract was
written, so it does not carry forward as an open item)
Accepted by: session (autonomous inner-PVL validate pass, no interactive user present in this
subagent invocation) — accepted concern: "schema/data-migration risk class present without a full
5-artifact risk-evidence-pack" — rationale recorded above under Open gaps; if a human reviewer later
disagrees, the fix is to build the pack retroactively before Phase 4a is marked ✅ VERIFIED (not
before EXECUTE starts — EXECUTE is authorized to proceed now).


---

## Deviations (E1 EXECUTE, 15-07-26 — all within-blast-radius)

1. **`slugify` is a new local helper in the wizard, not a shared util.** The UI Spec said
   "same slugify convention as the existing product/branch create forms" — but those forms
   (`product-form.tsx`/`branch-form.tsx`) have NO auto-derive (manual slug fields) and no shared
   slugify util exists anywhere in `apps/admin`/`packages/utils`. Implemented a small local
   `slugify()` inside `deal-create-wizard.tsx` (lowercase → non-alphanumerics collapsed to hyphens
   → trim) with a hand-edit override (`slugEdited` flag), fully realizing the spec's stated intent
   (auto-derive from Name, still editable). Feature-local, no new shared surface.
2. **Wizard mirrors `DealForm`'s `onSubmit(input)` signature and reuses the existing
   `handleSubmit`.** Rather than give the wizard its own mutation call, it takes the same
   `submitting`/`error`/`onSubmit`/`onCancel` props as `DealForm` and the create branch of
   `deals.index.tsx`'s existing `handleSubmit` routes it to `createMutation.mutate(input)` (now
   carrying `components`). Cleanest wiring, no duplicate mutation logic. `use-admin-deals.ts` /
   `admin-deals-api.ts`'s `createDeal()` needed no body change (they already forward the full
   input object) — only `DealCreateInput` gained the optional `components?` field.
3. **AC-E4 returns 400 (not 422).** The AC allowed "422/400"; the route returns 400 on Zod
   `safeParse` failure, matching every existing write route's convention in this program.
4. **Duplicate-pair reject proven purely via the DB unique index inside the transaction** (no
   hand-rolled dedup pass), exactly as the Layer-2 feasibility analysis anticipated: the bulk
   `deal_components` insert fires the composite unique index → `isUniqueViolation` → 409 → whole
   transaction rolls back (no orphan product). AC-E2's duplicate variant proves this.

None are hard-stop deviations. No schema change (E1 is API+UI only), no auth/billing/public-API
break — the `POST /api/admin/deals` delta is a single additive OPTIONAL field, backward-compat
proven byte-for-byte by AC-E3. The base-4a create-handler was the only base-4a behavior touched,
per D-E1; edit/detail flow untouched, per D-E3.

---

## Enhancement E1 — 2-Step Create Dialog + Transactional Create-With-Components

**Date added**: 15-07-26 (PLAN-SUPPLEMENT, post-EXECUTE enhancement to the shipped 4a deals-as-
products feature). Design is user-approved. This section is additive to the shipped 4a scope above
— it does NOT reopen or restate 4a's Decisions 1-8; it enhances the CREATE path only (D-E3 below).

### Why

The shipped `DealForm` (`apps/admin/src/features/deals/components/deal-form.tsx`) creates a bare
deal-product with no components — an admin must create, then separately open the detail screen and
use `DealComponentEditor` to attach items one at a time, with no visibility into whether the deal
price is actually a good deal. E1 replaces the CREATE flow only with a 2-step wizard that captures
components AND shows a live savings calculation before the deal is created, and makes deal creation
atomic (product + all components in one transaction) so a create can never leave an orphan
component-less deal when the admin's intent was to seed it with items.

### Locked Decisions (user-approved)

**D-E1 — Transactional create-with-components.** `POST /api/admin/deals` gains an OPTIONAL
`components: [{ productId: uuid, quantity: int>=1 }]` field. When present, the handler wraps (a)
insert the `is_deal=true` product and (b) insert all `deal_components` rows in ONE
`db.transaction()` (mirrors the `orders.ts` `db.transaction()` precedent at
`packages/api/src/routes/orders.ts:~100`, read above). Reuses the SAME app-layer guards the
attach-component route already applies: FK-existence per component (component product must exist),
component-is-itself-a-deal reject (no deals-of-deals at create — there is no self-reference case
at create time since the deal's own id doesn't exist yet, but a component with `is_deal=true` is
still rejected), and duplicate-component-in-payload reject (the same `(dealProductId,
componentProductId)` unique index constraint the attach route relies on — surfaced as a clean
400/409, not a raw constraint violation). Omitting `components` behaves EXACTLY like today's
shipped create (100% backward-compatible — no existing caller breaks). The `components` array is
Zod-validated (`z.array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1) }))`,
optional, default `undefined`).

**D-E2 — Require ≥1 item, UI-only.** The wizard's `Create deal` button (step 2) is disabled until
≥1 component row has been added. The SERVER does NOT hard-require `components` — the field stays
optional at the API layer (backward-compat + any future non-wizard caller). This is a deliberate
split: UI guard, not a server-side Zod `.min(1)` on the array.

**D-E3 — Wizard is CREATE-ONLY.** Editing an existing deal keeps using the existing detail page
(`deals.$dealId.tsx` → `DealForm` in edit mode + `DealComponentEditor`, unchanged). This enhancement
does NOT touch the edit/detail flow, `useUpdateDeal()`, or `useAttachComponent()`/
`useDetachComponent()` — those remain exactly as shipped in 4a.

### UI Spec

**2-step create dialog** replacing the current single-step `DealForm` create path (the dialog shell
itself — `form-dialog.tsx` — is reused; only the create-mode BODY changes to a wizard). Step rail
shows ①Details / ②Items with active/done states, brutalist theme (2px ink borders, jyellow active
state, hard offset shadow, Fredoka headings) — same visual language already established across
`apps/admin` (product-form, branch-form, etc.).

- **Step 1 — Details:** Name, Slug (auto-derived from Name — same slugify convention as the
  existing product/branch create forms; user can still hand-edit), Description (optional), Deal
  price (₱, same PHP-input → cents-on-submit convention as the shipped `DealForm`). `Next` is
  disabled until Name is non-empty AND price parses to a valid non-negative number.
- **Step 2 — What's inside:** a product picker reusing `DealComponentEditor`'s selection logic
  (`useAdminProducts()` — which already excludes `is_deal=true` products by construction, so a deal
  can never be seeded with another deal from the UI; dup-prevention against already-added rows in
  local wizard state, mirroring the existing `attachedIds` Set pattern). Each added item row shows:
  a thumbnail from the product's `imageUrl` (Lucide `Package`/placeholder icon fallback when
  `imageUrl` is null — NO emoji, per repo convention), the product's à-la-carte `basePriceCents`,
  a quantity stepper (− n +, minimum 1), and a computed line subtotal (`unitCents × qty`). Empty
  state: "No items yet — add the products this deal includes." (mirrors `DealComponentEditor`'s
  existing empty-state copy).
- **Savings panel (visual centerpiece, step 2 only):** à-la-carte total = Σ(`component.
  basePriceCents × qty`) across all added rows, computed CLIENT-SIDE from the already-loaded
  `useAdminProducts()` data (no extra fetch) — shown muted/secondary. Below it: Deal price (from
  step 1). Below that: a jyellow, ink-bordered, hard-shadow box reading "Customer saves ₱X · Y% off"
  when `dealPriceCents < aLaCarteTotalCents` (savings = à-la-carte − deal price; percent =
  savings / à-la-carte × 100, one decimal). When `dealPriceCents >= aLaCarteTotalCents`, flip to a
  warning-styled box: "⚠ This deal costs ₱X more than buying separately." (no crash/blocking — this
  is informational only, the admin can still create the deal). With 0 items, the panel is omitted
  entirely (à-la-carte total of 0 is not a meaningful comparison).
- **Footer:** Step 1 → `[Cancel] [Next: items →]`. Step 2 → `[← Back] [Create deal]` (disabled per
  D-E2 until ≥1 item). Submit shows a loading state on the button (`isLoading` prop, same as the
  shipped `Button` component already supports) then closes the dialog on success or shows the
  server error inline on failure (same `role="alert"` pattern as the shipped `DealForm`).
- Accessibility/UX: real `<label>` elements for every input (matches shipped `DealForm`/
  `DealComponentEditor` convention), visible focus states (inherited from the shared `Input`/
  `Button`/`select` primitives — no new focus-ring work needed), `cursor-pointer` on interactive
  rows (quantity stepper buttons, remove-item buttons), keyboard/tab order follows visual order
  (Name → Slug → Description → Price → Next; then product-select → qty → Add → item rows'
  remove-buttons → Back/Create).

### Touchpoints (E1)

**Modified:**
- `packages/api/src/routes/admin/deals.ts` — `createDealSchema` gains optional `components:
  z.array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1) })).optional()`;
  `POST /` handler rewritten to wrap product-insert + component-inserts in `db.transaction()` when
  `components` is present (falls through to the existing single-insert path when absent).
- `packages/api/src/lib/__tests__/admin-deals.integration.test.ts` — new test cases (see Verification
  Evidence below); existing AC1-AC11 cases untouched (backward-compat is asserted, not just assumed).
- `apps/admin/src/features/deals/lib/admin-deals-api.ts` — `DealCreateInput` gains optional
  `components?: { productId: string; quantity: number }[]`; `createDeal()` passes it through
  unchanged (already forwards the full input object as the request body — no change to the function
  body needed beyond the type).
- `apps/admin/src/features/deals/hooks/use-admin-deals.ts` — `useCreateDeal()` unchanged (already
  generic over `DealCreateInput`); no edit needed here.
- `apps/admin/src/features/deals/components/deal-form.tsx` — the CREATE-mode usage of this component
  is replaced by the new wizard (see New files below); this file is KEPT UNCHANGED and continues to
  serve the EDIT-mode path on `deals.$dealId.tsx` (D-E3) — no edit to this file's content.
- The route/screen that currently renders `<DealForm>` for create (the deals list screen's "New
  Deal" action, in `apps/admin/src/features/deals/components/deal-list.tsx` or the
  `deals.index.tsx` route — confirm exact current wiring during EXECUTE research) is updated to
  render the new wizard component instead, in create mode only.

**New:**
- `apps/admin/src/features/deals/components/deal-create-wizard.tsx` — the 2-step wizard container:
  step state, step-1 fields, step-2 fields, footer nav, calls `useCreateDeal()` on final submit with
  the full `DealCreateInput` incl. `components`.
- `apps/admin/src/features/deals/lib/deal-savings.ts` — small pure function(s): `computeALaCarteTotalCents(items: {unitCents: number; quantity: number}[]): number` and a savings-derivation helper (percent + saves/costs-more flag). Cents-based, unit-testable if `apps/admin`'s vitest runner is used for it (see Verification Evidence — this is the one client-logic unit worth a real test).
- Step-2 item-row sub-component (either inline in `deal-create-wizard.tsx` or a small
  `deal-wizard-item-row.tsx` — EXECUTE decides based on file-length; keep `deal-create-wizard.tsx`
  under a reasonable size per the repo's existing file-size guidance).

**Explicitly NOT touched:** `deals.$dealId.tsx` (detail/edit route), `DealComponentEditor` (still
used verbatim for post-create component editing on the detail screen), `useAttachComponent`/
`useDetachComponent` (unchanged), `useUpdateDeal` (unchanged), `admin/products.ts`,
`data-table.tsx`/`form-dialog.tsx`/`confirm-dialog.tsx`/`query-states.tsx`/`page-header.tsx` (reused
as-is, no edits).

### Public Contract Delta

`POST /api/admin/deals` — request body gains an OPTIONAL field:

```
components?: { productId: string; quantity: number }[]   // quantity >= 1
```

Response shape (`201 { deal: AdminDealProduct }`) is UNCHANGED — `AdminDealProduct.components` is
already populated on the detail response shape (per the shipped `fetchComponents()`/
`serializeAdminDealProduct`); the create response's `components` field will now reflect the
just-attached components when the wizard supplies them (previously always `[]` on create since no
components could be attached in the same call). No other response-shape change.

Errors: `400` on malformed `components` entries (Zod), `400` on a `components` entry whose
`productId` resolves to an `is_deal=true` product (deal-of-deals reject, same rule as the standalone
attach route), `404` on a `components` entry whose `productId` does not resolve to any product,
`409` on a duplicate `productId` within the same `components` array (same unique-constraint-backed
guard the standalone attach route uses — reuse `isUniqueViolation`, do not hand-roll a separate
duplicate-detection pass, so the failure mode is identical to the existing attach-route behavior).
On ANY of these failures, the WHOLE request rolls back — no product row is created (AC-E2 below is
the hard proof of this).

### Acceptance Criteria (E1)

1. `POST /api/admin/deals` with a valid `components` array creates the `is_deal=true` product AND
   all `deal_components` rows atomically in one transaction — proven by:
   `deal-create-with-components-atomic-happy-path` | strategy: Fully-Automated.
2. **[HARD — atomicity, Known-Gap banned]** If one entry in the `components` array is invalid
   (nonexistent `productId`, OR a `productId` whose product is itself `is_deal=true`, OR a
   duplicate `productId` within the array), the ENTIRE create request rolls back — no orphan
   `products` row is left behind (verified by querying `products` for the attempted name/slug after
   the failed request and asserting zero rows) — proven by:
   `deal-create-with-components-atomicity-rollback` | strategy: Fully-Automated.
3. `POST /api/admin/deals` with NO `components` field behaves exactly as the shipped 4a create path
   (backward-compatibility regression guard against the existing AC2 behavior) — proven by:
   `deal-create-without-components-backward-compat` | strategy: Fully-Automated (re-run of the
   existing AC2 `deal-create-happy-path` case, unmodified, as a regression guard for this change).
4. Malformed `components` entries (missing `productId`, non-uuid `productId`, `quantity` < 1 or
   non-integer) are rejected with `422`/`400` by Zod before any DB write — proven by:
   `deal-create-components-zod-rejection` | strategy: Fully-Automated.
5. The self-reference/deal-of-deals guard applies at create time exactly as it does on the
   standalone attach route (a `components` entry whose product `is_deal=true` is rejected; there is
   no create-time self-reference case since the new deal's id does not exist yet — this AC covers
   the deal-of-deals half only) — proven by: `deal-create-components-deal-of-deals-reject` |
   strategy: Fully-Automated.
6. Admin UI: the 2-step wizard navigates Details → Items and back correctly; `Next` is gated on
   Name+valid-price; `Create deal` is gated on ≥1 item (D-E2); the savings panel renders the correct
   à-la-carte total, savings amount, and percent-off when deal price < à-la-carte total, and flips to
   the "costs more" warning when deal price ≥ à-la-carte total; the empty-items state renders
   correctly; product thumbnails render from `imageUrl` with a non-emoji fallback icon when absent —
   proven by: `deal-create-wizard-ui-manual-walkthrough` | strategy: Agent-Probe (no `apps/admin`
   browser/E2E runner exists yet — same project-wide gap as 4a's AC12).
7. `computeALaCarteTotalCents` (and the savings-percent derivation) is a pure function that correctly
   sums `unitCents × quantity` across N items and computes savings/percent-off given a deal price —
   proven by: `deal-savings-calc-pure-function` | strategy: Fully-Automated (unit test in
   `apps/admin`'s existing vitest runner — this is the one client-logic surface in this enhancement
   worth an automated unit test, per the plan's own guidance to prefer automated tests where a real
   runner already exists).

### Verification Evidence (E1)

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `deal-create-with-components-atomic-happy-path` — create + N components in one transaction, all rows exist | Fully-Automated | AC-E1 |
| `deal-create-with-components-atomicity-rollback` — one invalid component entry → whole create rolls back, zero orphan product row | Fully-Automated | AC-E2 (HARD, Known-Gap banned) |
| `deal-create-without-components-backward-compat` — omitting `components` behaves identically to shipped 4a create (AC2 re-run) | Fully-Automated | AC-E3 |
| `deal-create-components-zod-rejection` — malformed components array entries rejected before DB write | Fully-Automated | AC-E4 |
| `deal-create-components-deal-of-deals-reject` — a components entry that is itself `is_deal=true` rejected at create | Fully-Automated | AC-E5 |
| `deal-create-wizard-ui-manual-walkthrough` — 2-step nav, gating, savings math, warning state, empty state, thumbnails | Agent-Probe | AC-E6 |
| `deal-savings-calc-pure-function` — à-la-carte total + savings/percent-off pure-function correctness | Fully-Automated | AC-E7 |

**Failing stubs (Fully-Automated tier, TDD red-first starting point for EXECUTE):**

```text
test("AC-E1 — should create a deal-product and all deal_components rows atomically in one transaction", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E1")
})
test("AC-E2 — should roll back the entire create (zero orphan product row) when one components entry is invalid", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E2")
})
test("AC-E3 — should behave identically to the shipped create path when components is omitted", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E3")
})
test("AC-E4 — should reject malformed components array entries with a validation error before any DB write", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E4")
})
test("AC-E5 — should reject a components entry whose product is itself is_deal=true", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E5")
})
test("AC-E7 — computeALaCarteTotalCents and savings derivation should be correct for N items", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E7")
})
```

Server test file: same file, same command as 4a — `packages/api/src/lib/__tests__/admin-deals.
integration.test.ts`, run via `pnpm --filter @jojopotato/api test admin-deals` (no `--` before the
filter argument). Client unit test (AC-E7): new file `apps/admin/src/features/deals/lib/
deal-savings.test.ts` (or colocated per the existing `apps/admin` vitest convention — confirm exact
convention during EXECUTE by checking for existing `apps/admin` `.test.ts` files), run via `pnpm
--filter @jojopotato/admin test`.

### Security / Clean-Code (E1)

- Zod-before-Postgres on the `components` array, exactly like every other write route in this
  program — validate the full array shape before the transaction opens.
- `requireAdmin` is inherited unchanged (admin-level, not super_admin-only) — no new authz surface.
- No hard deletes introduced. The transaction wraps two INSERTs only (product + N component rows);
  no UPDATE/DELETE semantics change.
- Reuse, do not duplicate: the deal-of-deals guard, the FK-existence check, and the duplicate-
  attach 409 mapping (`isUniqueViolation`) are the SAME guards the standalone attach route already
  uses — the create-with-components path calls the same guard logic (extracted into a shared
  helper if the code would otherwise be duplicated verbatim across both routes — EXECUTE decides
  based on how much divergence the transaction context actually requires).
- Cents-at-boundary discipline unchanged — `basePriceCents` in, `centsToNumeric` at the DB boundary,
  same as every other write in this program.
- The core correctness property of E1 is transaction atomicity (AC-E2) — this is the HARD gate;
  Known-Gap is explicitly banned for it, mirroring 4a's own AC9 precedent.

### Validate Contract (E1)

Status: PASS
Date: 15-07-26
date: 2026-07-15
generated-by: inner-pvl: phase-4
Scope note: this contract validates ONLY Enhancement E1 (2-step create wizard + transactional
create-with-components) — it does NOT reuse, overwrite, or extend the `## Validate Contract`
section above (Gate: CONDITIONAL, dated 15-07-26), which is scoped to the shipped base 4a deals-
as-products feature and is left untouched. No `supersedes:` line applies here — this is a fresh
contract for previously-unvalidated scope (the Enhancement E1 subsection was a PLACEHOLDER, not a
completed prior contract).

Parallel strategy: sequential (single-agent synthesis)
Rationale: 7-signal score for this fan-out is 3/7 (S1 multi-package: packages/api + apps/admin;
S2 API surface touched — additive optional field only, no schema/auth change; S7 not met — E1's
blast radius is ~7 files, below the 5+ threshold is met actually... see note) — recomputed: S1
present (2 packages), S2 present (public API contract delta), S6 not present (no new high-risk
class — no new migration, no new auth/billing surface), S7 present (7 touchpoint files ≥ 5) →
3/7 MEDIUM, which would normally recommend parallel subagents. No Agent/Task spawning tool was
available in this validate-agent's invocation, so all Layer 1 (4 dimensions) and Layer 2
(per-section feasibility) checks were performed directly, sequentially, by this single agent
instance, each backed by a direct source-file read (not inference) — see Dimension findings and
Layer 2 sections below for the evidence trail. This mirrors the same documented process deviation
as the base 4a contract above.
EXECUTE strategy recommendation (separate from this VALIDATE fan-out): sequential, single
vc-execute-agent (opus) — one route-file edit (`admin/deals.ts`) + one new pure-function file +
one new wizard component, all within a tight dependency chain (server change must land before the
client wizard can call it meaningfully); no independent parallelizable workstreams.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-E1 | create deal-product + N components atomically in one `db.transaction()` | Fully-Automated | `admin-deals.integration.test.ts` — `deal-create-with-components-atomic-happy-path` | B |
| AC-E2 (HARD, Known-Gap banned) | one invalid `components` entry rolls back the ENTIRE create — zero orphan `products` row | Fully-Automated | same suite — `deal-create-with-components-atomicity-rollback` | B |
| AC-E3 | omitting `components` behaves identically to the shipped 4a create path (backward-compat regression) | Fully-Automated | same suite — `deal-create-without-components-backward-compat` (AC2 re-run, unmodified) | A |
| AC-E4 | malformed `components` entries rejected by Zod before any DB write | Fully-Automated | same suite — `deal-create-components-zod-rejection` | B |
| AC-E5 | a `components` entry whose product is itself `is_deal=true` rejected at create | Fully-Automated | same suite — `deal-create-components-deal-of-deals-reject` | B |
| AC-E6 | 2-step wizard nav/gating, savings panel math + warning flip, empty-item state, thumbnail fallback | Agent-Probe | manual walkthrough (no `apps/admin` browser/E2E runner — project-wide gap, P2 AC7 / P3 AC8 / 4a AC12 precedent) | D |
| AC-E7 | `computeALaCarteTotalCents` + savings/percent-off pure-function correctness across N items | Fully-Automated | `apps/admin` vitest — `deal-savings-calc-pure-function` | B |
| Regression guard (no SPEC id) | existing 4a AC1-AC11 unaffected by the `POST /` handler rewrite | Fully-Automated | `pnpm --filter @jojopotato/api test admin-deals` (full file re-run, no `--` before filter) | A |
| Regression guard (no SPEC id) | full API suite unaffected | Fully-Automated | `pnpm --filter @jojopotato/api test` | A |
| Regression guard (no SPEC id) | no cross-package type breakage | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` + `pnpm --filter @jojopotato/admin generate-routes && pnpm --filter @jojopotato/admin typecheck` | A |
| Style guard (no SPEC id) | formatting clean before commit | Fully-Automated | `pnpm format:check` | A |

gap-resolution legend: A — proven now, re-run of an already-existing gate; B — fixed in this plan
(new test added by this plan's own checklist, TDD stub already provided below); C — deferred to a
named later phase/plan (not used here); D — backlog test-building stub (named residual, keep-
active, continue — AC-E6 only).

Failing stubs (Fully-Automated rows only — copied verbatim from the Enhancement E1 section's own
stub block, which already matches this table's scenario names 1:1):

```text
test("AC-E1 — should create a deal-product and all deal_components rows atomically in one transaction", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E1")
})
test("AC-E2 — should roll back the entire create (zero orphan product row) when one components entry is invalid", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E2")
})
test("AC-E3 — should behave identically to the shipped create path when components is omitted", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E3")
})
test("AC-E4 — should reject malformed components array entries with a validation error before any DB write", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E4")
})
test("AC-E5 — should reject a components entry whose product is itself is_deal=true", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E5")
})
test("AC-E7 — computeALaCarteTotalCents and savings derivation should be correct for N items", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-E7")
})
```

Dimension findings:
- Infra fit: PASS — no container/infra/worker surface touched; no new migration (schema already
  shipped by base 4a — `is_deal` column and `deal_components` table both confirmed live in
  `packages/api/src/db/schema/{products,deal_components}.ts` and migration `0007_fearless_
  crystal.sql`, directly read); no new env/port/config surface.
- Test coverage: PASS — AC-E1 through AC-E7 each have a named proving test (5 Fully-Automated +
  1 Fully-Automated pure-unit + 1 Agent-Probe) with matching TDD stubs for every Fully-Automated
  row; no developed E1 behavior rests on Known-Gap alone (net-gate vacuous-green check: AC-E6 is a
  legitimate Agent-Probe proving strategy, same precedent as 4a's AC12/P2's AC7/P3's AC8 — not a
  coverage-less residual).
- Breaking changes: PASS — `POST /api/admin/deals` request-body delta is a single OPTIONAL field
  (`components?: {...}[]`); response envelope shape is unchanged (`{ deal: AdminDealProduct }`,
  `AdminDealProduct.components` already exists on the type from base 4a — verified directly in
  `packages/api/src/routes/lib/serializers.ts:480-501`); omitting the field is proven
  byte-for-byte backward-compatible by AC-E3's literal re-run of the existing AC2 test case, not
  merely asserted. No other route, consumer, or public contract touched.
- Security surface: PASS — `requireAdmin` inheritance unchanged (no new route file, no new mount);
  Zod-before-Postgres extended to the new `components` array field, consistent with every existing
  write route in this program; no new hard-delete path (the transaction only performs 2 INSERT
  statement classes — product + N component rows — confirmed by reading the current handler, no
  UPDATE/DELETE semantics added); no new secret/CORS/trust-boundary surface. STRIDE quick-scan: no
  new information-disclosure surface (same admin-only deal-product data as the existing detail
  response); no new elevation-of-privilege path (guard logic — FK-existence, deal-of-deals reject,
  duplicate-pair reject — is a superset composition of already-shipped, already-tested guard
  checks from the standalone attach route, not novel authorization logic).

Layer 2 — per-section feasibility:
- Section: Transactional create-with-components (D-E1, AC-E1, AC-E2) — Status: PASS. Mechanical
  feasibility: the `db.transaction()` throw-inside-callback-triggers-rollback pattern is
  live-verified against `packages/api/src/routes/orders.ts:100` (`db.transaction(async (tx) => {
  ... throw new OrderError(...) ... })`) — this exact mechanism is already proven correct in
  production code (order placement), not a novel pattern being introduced for the first time.
  Applying it to `admin/deals.ts`'s `POST /` handler (currently a single non-transactional
  `db.insert(products)` at lines 167-205, directly read) is a mechanical rewrite: wrap the product
  insert + a loop of `deal_components` inserts in one `db.transaction(async (tx) => {...})`, using
  `tx.select`/`tx.insert` instead of `db.select`/`db.insert` for every statement inside the
  callback. Gaps found: none — whether per-component guard checks (FK-existence, deal-of-deals)
  run before opening the transaction (pre-validate) or inside it (using `tx`) is left open by the
  plan; both preserve atomicity correctly (a pre-validate-then-transact design trivially satisfies
  AC-E2 for the existence/deal-of-deals failure modes; the duplicate-pair failure mode can ONLY be
  proven via the DB unique constraint — `deal_components_deal_component_idx`, confirmed present in
  `packages/api/src/db/schema/deal_components.ts` — which structurally REQUIRES the product to
  already exist in-transaction before the constraint can fire, which is exactly the scenario AC-E2
  is designed to catch: a broken/non-transactional implementation of the duplicate-pair check WOULD
  leak an orphan product row, so AC-E2's test is not redundant with the other failure modes — it is
  the one failure mode that mechanically forces genuine transactional proof). Conflicts found: none.
  Highest-risk edit + mitigation: the `POST /` handler rewrite is the single highest-risk edit in
  E1 (it modifies an already-shipped, already-tested route) — mitigated by AC-E3's literal re-run
  of the unmodified AC2 test as a structural regression guard, and by keeping the existing
  single-insert code path reachable (not deleted) when `components` is absent, per D-E2/D-E1.
- Section: Backward compatibility (D-E2, AC-E3) — Status: PASS. Mechanical feasibility: the new
  `components` Zod field is `.optional()` with no `.default()`, so `parsed.data.components ===
  undefined` for every existing caller that never sends it — confirmed the plan does not introduce
  a server-side `.min(1)` on the array (D-E2 correctly scopes the ≥1-item rule to the UI wizard
  only, not the Zod schema), so a non-wizard caller (or a future one) posting zero components is
  still accepted, exactly matching current behavior. Gaps found: none. Conflicts found: none.
  Highest-risk edit: none beyond the shared `POST /` handler already covered above.
- Section: Guard reuse mechanics (D-E1 "reuses the SAME app-layer guards") — Status: PASS
  (observation, not a CONCERN). Mechanical feasibility: read the live `POST /:id/components`
  handler (lines 265-323) directly — the FK-existence check, deal-of-deals reject, and duplicate-
  pair `isUniqueViolation` catch are currently INLINE in that single-component-attach handler, not
  extracted into a shared helper function. The plan's own Security/Clean-Code (E1) section already
  defers the extract-vs-duplicate-inline decision to EXECUTE ("extracted into a shared helper if
  the code would otherwise be duplicated verbatim... EXECUTE decides") — this is correctly flagged
  in-plan already, not a validate-time gap. Observation (non-blocking): the new `components` array
  field uses `productId` as its per-item key name, while the existing standalone attach route's
  schema uses `componentProductId` for the logically-equivalent value — a minor naming asymmetry
  between two related endpoints, intentional per the plan's own Zod schema
  (`z.array(z.object({ productId: z.uuid(), quantity: ... }))`), cosmetic only, no functional risk.
  Gaps found: none requiring plan changes. Conflicts found: none.
- Section: UI Spec / Savings Panel (AC-E6, AC-E7) — Status: PASS (with accepted known-gap on
  AC-E6). Mechanical feasibility: `apps/admin`'s vitest config (`apps/admin/vitest.config.ts`) has
  no restrictive `include` override — default vitest glob picks up any `*.test.ts` file under
  `src/`, confirmed against the one existing precedent test file
  (`apps/admin/src/routes/-index.test.tsx`) and the `"test": "vitest run --passWithNoTests"`
  script — so a new colocated `apps/admin/src/features/deals/lib/deal-savings.test.ts` next to the
  new `deal-savings.ts` pure-function file will be picked up automatically with no config change
  needed. The savings/percent-off math itself (à-la-carte total = Σ unitCents×qty; savings =
  à-la-carte − deal price; percent = savings/à-la-carte×100) is a pure integer-cents computation
  with no external dependency, fully unit-testable. Gaps found: none. Conflicts found: none.
  Highest-risk edit: none — this is the lowest-risk file in the enhancement (pure function, no I/O).
- Section: Public Contract Delta — Status: PASS. Mechanical feasibility: confirmed
  `serializeAdminDealProduct(product, components)` (already shipped, `serializers.ts:496-501`)
  already accepts a `components` array and is already used by the existing `GET /:id` handler to
  populate a non-empty `components` field on a detail response — the create-response change
  (populating `components` instead of always returning `[]`) reuses this exact same function
  signature; EXECUTE only needs to resolve the just-inserted components into `AdminDealComponent[]`
  shape (via a `fetchComponents()` call after commit, or an equivalent in-transaction resolution)
  before calling the same serializer. No new response type needed. Gaps found: none. Conflicts
  found: none.

Net gate: 0 FAILs / 0 CONCERNs / 4 Layer 1 PASS / 5 Layer 2 sections PASS (1 with a non-blocking
observation, 1 with an accepted known-gap on AC-E6 only) → **PASS**.

Known-gap exclusion note: AC-E6 (Agent-Probe) is NOT a Known-Gap-tier row for net-gate purposes —
it is a legitimate proving strategy per the C-4 3-strategy reconciliation, identical precedent to
4a's own AC12. The net-gate vacuous-green ban does not apply: every developed E1 behavior has
either a Fully-Automated gate (AC-E1–E5, AC-E7 + all regression/style guards) or an Agent-Probe
gate (AC-E6 wizard UI) — none rests on Known-Gap alone.

Open gaps:
- AC-E6 Agent-Probe manual walkthrough — accepted, project-wide precedent (no `apps/admin`
  browser/E2E runner exists yet; same gap already documented for 4a's AC12, P2's AC7, P3's AC8).
  Not a new gap introduced by this enhancement.
- Guard-logic extraction (shared helper vs. inline duplication between the standalone attach route
  and the new create-with-components path) is an EXECUTE-time implementation decision, already
  flagged in-plan (Security/Clean-Code E1 section) — not a blocking gap, tracked here for
  visibility only.

What this coverage does NOT prove:
- AC-E1/AC-E2/AC-E3/AC-E4/AC-E5/AC-E7's Fully-Automated gates prove server-side and pure-function
  correctness (transaction atomicity, rollback integrity, backward-compat, validation, deal-of-
  deals rejection, savings math) against a real local Postgres / in-process unit run — they do NOT
  prove the wizard UI actually calls the API correctly through real browser interaction, renders
  the savings panel with correct visual state transitions, or that keyboard/tab order works as
  specified; that is AC-E6's job, and AC-E6 is Agent-Probe only (no automated browser assertion).
- The full-suite regression gate (`pnpm --filter @jojopotato/api test`) and the admin-deals-scoped
  re-run prove no OTHER existing route/suite broke — they do NOT prove the admin UI's TypeScript
  types are structurally correct against the (unchanged) response shape; that is what the
  `apps/admin typecheck` gate (run after `generate-routes`) proves instead, and it was already
  proven for the unchanged response shape by 4a — E1 adds no new response type to re-verify there.
- None of these gates exercise the 4b mobile-repoint handoff — untouched by E1, out of scope.
- AC-E7's unit test proves `computeALaCarteTotalCents`/savings-derivation correctness in isolation;
  it does NOT prove the wizard component correctly WIRES that function's output into the rendered
  savings panel (e.g. a copy/paste error binding the wrong variable to the displayed percentage) —
  that residual risk is covered only by AC-E6's Agent-Probe walkthrough, which explicitly includes
  "the savings panel renders the correct à-la-carte total, savings amount, and percent-off."

Gate: PASS (0 FAILs, 0 CONCERNs; 1 project-wide Agent-Probe known-gap on AC-E6 accepted under the
same standing program-wide precedent as 4a AC12/P2 AC7/P3 AC8 — not a new exception created here)
Accepted by: N/A — Gate is PASS, no CONCERNs required acceptance. (AC-E6's Agent-Probe residual is
a proving-strategy choice, not an accepted CONCERN — see Known-gap exclusion note above.)

vc-validate-agent: this Enhancement E1 section (Locked Decisions, UI Spec, Touchpoints, Public
Contract Delta, Acceptance Criteria, Verification Evidence, Security, this Validate Contract) is
the full spec-under-test for E1 — the AC-E1..AC-E7 numbering is deliberately distinct from 4a's
AC1-AC12 so both sets of test gates coexist in the same test file without collision.

