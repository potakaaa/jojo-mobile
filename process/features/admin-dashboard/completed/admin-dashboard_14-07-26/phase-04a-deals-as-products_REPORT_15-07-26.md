---
phase: phase-04a-deals-as-products
date: 2026-07-15
status: COMPLETE
feature: admin-dashboard
plan: process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-04-deals_PLAN_14-07-26.md
---

# Phase 4a — Deals-as-Products (ADM-004 RE-PLAN) — EXECUTE Report

Supersedes the discount-model execution (`phase-04-deals_REPORT_15-07-26.md`, commit d5070d8, now
discarded). Code-complete against all 14 Implementation Checklist items. All Fully-Automated gates
green; AC12 (admin UI walkthrough) is Agent-Probe, owed at EVL (no browser runner — project-wide gap).

## What Was Done

**Schema + migration (items 2, 3)**
- `packages/api/src/db/schema/products.ts` — added `is_deal boolean not null default false` (additive).
- `packages/api/src/db/schema/deal_components.ts` (new) — first self-referential FK into `products`
  (both `deal_product_id` + `component_product_id` → `products.id`, NO ACTION), `quantity int not
  null default 1`, composite unique index `(deal_product_id, component_product_id)`. Header comment
  flags the first-of-kind precedent.
- `packages/api/src/db/schema/index.ts` — `export * from './deal_components'` (dep-order block 5b).
- Migration `packages/api/drizzle/0007_fearless_crystal.sql` — generated via `db:generate`, applied
  via `db:migrate`. Strictly additive (new column with default + new empty table, zero backfill).

**API (items 5, 6, 7)**
- `packages/api/src/routes/admin/deals.ts` — FULL rewrite to deals-as-products. Routes: `GET /`
  (is_deal=true list, optional `?isActive`), `GET /:id` (single deal + resolved `components`, 404 on
  non-deal), `POST /` (creates is_deal product, `categoryId` server-pinned to reserved Deals category
  via idempotent `resolveDealsCategoryId()`), `PATCH /:id` (update, scoped to is_deal rows, isActive
  is the deactivate path), `POST /:id/components` (attach + quantity; self-ref → 400, deal-of-deals →
  400, missing → 404, dup → 409 via `isUniqueViolation`), `DELETE /:id/components/:componentProductId`
  (detach → 204 / 404). Styled as a sibling of `admin/products.ts`; reuses `handleAdminError`/
  `isUniqueViolation`/`centsToNumeric` verbatim.
- `packages/api/src/routes/admin/index.ts` — mount line unchanged (append-only preserved); comment
  updated to reflect the deals-as-products model.
- `packages/api/src/routes/lib/serializers.ts` — added `isDeal` to `AdminProduct` +
  `serializeAdminProduct`; new `AdminDealComponent`/`AdminDealProduct`/`serializeAdminDealProduct`
  (reuses `serializeAdminProduct` — DRY). Removed the discarded discount `AdminDeal`/`AdminDealExtras`/
  `serializeAdminDeal`. Public `ApiDeal`/`serializeDeal` KEPT (dormant).

**Filter sites (item 4)**
- (a)+(b) `branches.ts:100-113` menu query — added `eq(products.is_deal, isDealMenu)`; `?isDeal=true`
  flips to deals-only (same route, same shape).
- (c) `admin/products.ts` GET `/` — default-excludes deals; `?isDeal=true` override.
- (d) `orders.ts` placement + (e) `staff.ts` availability — verified NO CHANGE (is_deal-blind by
  design; deal-products orderable + staff-toggle-able as any product). Confirmed by AC10/AC11 tests.

**Types (item 8)**
- `packages/types/src/menu.ts` — `Product.isDeal?` + `Product.components?` (optional/additive) + new
  `DealComponent` type.

**Admin UI (items 9, 10)**
- New/rewritten `apps/admin/src/features/deals/**`: `lib/admin-deals-api.ts`, `hooks/use-admin-deals.ts`,
  `components/deal-list.tsx` (DataTable), `components/deal-form.tsx` (no category picker — server-pinned),
  `components/deal-component-editor.tsx` (new — quantity-aware "what's inside" editor, extends the
  junction-chip-editor shape with a qty field). Deleted `junction-chip-editor.tsx` +
  `deactivate-deal-dialog.tsx`.
- Rewritten routes `(dashboard)/deals.index.tsx` (list + create/edit FormDialog + deactivate/reactivate
  via ConfirmDialog) and `(dashboard)/deals.$dealId.tsx` (base-price editor confirm-gated + component
  editor). `deals.tsx` Outlet layout unchanged (already correct). `nav-config.ts` Deals item unchanged.
- Reused all 5 KEPT composites (data-table, form-dialog, confirm-dialog, query-states, page-header).

**Discard (items 9, 14)** — d5070d8 discount code replaced at same paths (content swap, not `git
revert`, per Discard Plan). Orphaned serializer symbols removed. No live code imports discarded
symbols (grep-verified: zero importers outside `features/deals/` + typecheck passes).

**Dormant legacy (item 1)** — `orders.ts` deal-apply block (~182-272) gained a header comment marking
it dormant/ADM-008 test-debt; body untouched. `deals`/`deal_products`/`deal_branches`/`coupons`/
`routes/deals.ts` untouched. The "Deals" seed category (`seed/data.ts`, slug `deals`) already existed.

**Tests (items 11-14)** — `admin-deals.integration.test.ts` replaced with a 28-test deals-as-products
suite (AC1-AC11 incl. the HARD AC9 snapshot-integrity regression mirroring P3 AC1 against a
deal-product).

## What Was Skipped or Deferred

- AC12 admin-UI browser walkthrough — Agent-Probe, no `apps/admin` E2E runner exists (project-wide
  gap; P2 AC7 / P3 AC8 precedent). Owed at EVL, not claimed as automated.
- Companion 4b mobile-repoint handoff — explicitly out of this phase's EXECUTE scope.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Deals suite (AC1-AC11) | `pnpm --filter @jojopotato/api test admin-deals` | **28/28 PASS** |
| Full API regression | `pnpm --filter @jojopotato/api test` | **211/211 PASS** (0 regressions; 183 baseline + 28 new; 31 discount tests discarded) |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | PASS |
| Admin codegen + typecheck | `generate-routes` → `pnpm --filter @jojopotato/admin typecheck` | PASS |
| Types typecheck | `pnpm --filter @jojopotato/types typecheck` | PASS |
| Format | `pnpm format:check` | PASS for all touched files (only pre-existing untracked `UI_AUDIT.md` warns — outside blast radius) |
| Lint (admin + api) | `pnpm --filter @jojopotato/{admin,api} lint` | PASS |
| Admin vitest | `pnpm --filter @jojopotato/admin test` | 1/1 PASS |

Prereq used: native Postgres at `localhost:5432` (jojo/jojopotato), migration 0007 applied.

## Plan Deviations

All within-blast-radius (full detail in the plan's `## Deviations` section):
1. Deals category is resolved route-side (idempotent find-or-create by reserved slug) in addition to
   the seed row — needed for hermetic tests; realizes Decision 8's "cannot 500 on missing FK" goal.
2. `Product.isDeal` typed optional (`isDeal?`) + optional `components?` — the public menu serializer
   does not emit it yet (4b's job); required field would be a type/runtime mismatch.
3. AC9 snapshot test covers the base_price variant only (deals have no product_options by design).

## Test Infra Gaps Found

- No `apps/admin` browser/E2E runner (project-wide, pre-existing) — AC12 remains Agent-Probe.

## Closeout Packet

- **Selected plan:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-04-deals_PLAN_14-07-26.md`
- **Finished:** all 14 checklist items; API + UI + types + migration + discard.
- **Verified:** all Fully-Automated gates (AC1-AC11 + regression + typecheck + format + lint).
- **Unverified:** AC12 admin UI round-trip (Agent-Probe, owed at EVL).
- **Cleanup remaining:** context-doc update + archival at UPDATE PROCESS; independent EVL confirmation run.
- **Best next state:** Keep in active/testing → run EVL (independent vc-tester re-run of the gate
  commands) + AC12 Agent-Probe walkthrough, then UPDATE PROCESS.
- **Classification:** Keep in active/testing (code-complete; AC12 Agent-Probe + EVL confirmation pending).

## Forward Preview

**Test Infra Found:** native Postgres at :5432 is the working test DB (docker compose :5432 is blocked
by the native service — see all-tests.md). Set `DATABASE_URL=postgres://jojo:jojo@localhost:5432/jojopotato`
for `db:migrate` and the vitest suites.

**Blast Radius Changes:** `packages/api` (migration 0007, schema `products`+`deal_components`, routes
`admin/deals.ts`+`admin/products.ts`+`branches.ts`, serializers, orders.ts comment), `apps/admin`
(features/deals/** + 2 routes), `packages/types` (menu.ts). `admin/products.ts` list default-exclude
touches Phase 3's VERIFIED surface — proven safe by AC8 + the green full-suite regression.

**Commands to Stay Green:** `DATABASE_URL=... pnpm --filter @jojopotato/api test` and
`pnpm --filter @jojopotato/admin generate-routes && pnpm --filter @jojopotato/admin typecheck`.

**Dependency Changes:** none — no new packages, no new runtime surface, no CORS/secret change.
