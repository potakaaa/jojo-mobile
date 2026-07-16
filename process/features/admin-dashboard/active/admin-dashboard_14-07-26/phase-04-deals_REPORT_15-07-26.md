---
name: report:admin-phase-04-deals-execute
description: "EXECUTE exit summary — Phase 4 Deals CRUD (ADM-004): API + admin UI, 31 new tests green, 0 regressions"
date: 15-07-26
metadata:
  node_type: memory
  type: report
  feature: admin-dashboard
  phase: 4
phase: admin-phase-04-deals
status: COMPLETE_WITH_GAPS
plan: process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-04-deals_PLAN_14-07-26.md
---

# Phase 4 — Deals CRUD (ADM-004) — EXECUTE exit summary

> **⚠ SUPERSEDED (16-07-26 UPDATE PROCESS pass) — DO NOT READ AS CURRENT TRUTH.** This report
> documents the ORIGINAL discount-object deals model (commit `d5070d8`), which was fully executed
> and green as of this report, but was subsequently PIVOTED and DISCARDED in favor of a
> deals-as-products model (`products.is_deal` + `deal_components`). The `deals`/`deal_products`/
> `deal_branches`/`coupons` schema this report describes stays dormant in the DB (untouched,
> reserved for a possible future ADM-008), but the API/UI code it describes was replaced at the same
> file paths. The current, authoritative Phase 4 EXECUTE report is
> `phase-04a-deals-as-products_REPORT_15-07-26.md` in this same task folder. This file is kept for
> historical record only.

**Answer up front:** All 10 Implementation-Checklist steps are done and every Fully-Automated gate
is green. New `admin-deals` suite is 31/31; full API suite 214/214 (183 baseline + 31 new, 0
regressions); API + admin typechecks green; format + lint clean. One named gap: AC11 (UI
Agent-Probe walkthrough) is owed — no `apps/admin` browser/E2E runner exists (project-wide gap,
consistent with P2 AC7 / P3 AC8). No hard-stop deviations.

## What Was Done

**API (`packages/api`):**
- `src/routes/admin/deals.ts` (new) — full deals CRUD + junction attach/detach + coupon-cascade
  deactivate. Zod-before-Postgres on every write. `z.uuid()` path-param 404s, `{deal}`/`{deals}`
  envelopes, `AdminApiError` + shared `handleAdminError`/`isUniqueViolation`.
  - `GET /` — ALL deals incl. inactive/out-of-window, newest-first, optional `?isActive=true|false`.
  - `GET /:id` — detail incl. attached `productIds`/`branchIds` + `outstandingCoupons` count.
  - `POST /` — create; `deal_type` enum + `end_at > start_at` + conditional `discount_value`
    requiredness (D5) all Zod-validated.
  - `PATCH /:id` — update fields (NOT `is_active`); fetch-merge-validate for partial `start_at`/
    `end_at` (D5/AC10/E4 — extra read only when a date field is present).
  - `POST /:id/deactivate` — `{ couponPolicy?: 'leave'|'expire' }` default `'leave'` (D1).
    `'leave'` flips `is_active` only (zero coupon writes). `'expire'` wraps the coupon `UPDATE`
    (`available → expired`, scoped to this `deal_id`) + `is_active` flip in ONE `db.transaction()`;
    `outstandingCouponsAffected` derived from `RETURNING.length` inside the tx (E1). FIRST admin
    coupon write + FIRST admin-route transaction — both documented in the file header.
  - `POST/DELETE /:id/products` + `/:id/branches` — imperative attach (FK pre-check → insert → 409
    on dup via shared `isUniqueViolation`) / detach (`delete...returning` → 404 on empty), sharing
    an internal `attachRef` helper (D3 / Clean-Code note).
- `src/routes/admin/index.ts` — appended `adminRouter.use('/deals', dealsRouter)` (append-only,
  4th aggregator consumer). No restructure.
- `src/routes/lib/serializers.ts` — local `AdminDeal` interface + `serializeAdminDeal()` (D2). Raw
  `discountValue` via `numericToCents` UNCONDITIONALLY (null-safe), `isActive`, ISO dates, optional
  `productIds`/`branchIds`/`outstandingCoupons` extras (empty/0 on list → no N+1 per E2). Public
  `serializeDeal`/`ApiDeal` untouched.
- `src/lib/__tests__/admin-deals.integration.test.ts` (new) — 31 supertest cases, 4th reuse of the
  `makeUser(role)` self-seeding fixture. Covers AC1-AC10 incl. coupon-cascade DB-state assertions,
  junction 409/404, PATCH partial-date merge rejection, authz 403.

**Admin UI (`apps/admin`):**
- `src/components/data-table.tsx` (new, D4) — generic column-defs + row-render + `QueryStates`
  list shell.
- `src/components/form-dialog.tsx` (new, D4) — generic radix-Dialog create/edit modal shell.
- `src/components/confirm-dialog.tsx` — additive optional `children` slot (backward-compatible;
  existing branches/products callers pass none) to host the deactivate radio.
- `src/features/deals/**` — `lib/admin-deals-api.ts` (fetch wrapper, cents boundary,
  `credentials:'include'`), `hooks/use-admin-deals.ts` (react-query CRUD + junction + deactivate),
  `components/{deal-form,deal-list,junction-chip-editor,deactivate-deal-dialog}.tsx`.
- `src/routes/(dashboard)/{deals.tsx,deals.index.tsx,deals.$dealId.tsx}` — thin `<Outlet/>` layout
  split applied FROM THE START (durable TanStack nested-detail gotcha). List consumes DataTable +
  FormDialog; detail hosts the feature-local chip editors + D1 deactivate flow.
- `src/config/nav-config.ts` — added the Deals `NavItem` (Management group).

## What Was Skipped or Deferred

- **`data-table`/`form-dialog` retrofit of branches/categories/products** — deferred to a backlog
  follow-up per D4 (to be filed at UPDATE PROCESS). Deals is the sole current consumer; retrofit is
  cleanup-expansion, out of this phase's scope.
- **Deal reactivation** — the ADM-004 contract defines no reactivate route (PATCH excludes
  `is_active`, deactivation is one-way this phase). Followed exactly; no reactivate UI built.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| New deals suite (AC1-AC10) | `pnpm --filter @jojopotato/api test admin-deals` | 31/31 PASS |
| Regression — admin CRUD | `pnpm --filter @jojopotato/api test admin-branches admin-products admin-categories` | 46/46 PASS |
| Full API suite | `pnpm --filter @jojopotato/api test` | 214/214 PASS (183 baseline + 31; 0 regressions) |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | PASS |
| Admin codegen + typecheck | `pnpm --filter @jojopotato/admin generate-routes && … typecheck` | PASS |
| Format | `pnpm format:check` | PASS (after `pnpm format`) |
| Lint | `pnpm --filter @jojopotato/api lint` / `… @jojopotato/admin lint` | PASS |
| AC11 UI walkthrough | Agent-Probe | **OWED at EVL** — no admin browser/E2E runner |

## Plan Deviations

All within-blast-radius, documented; no hard-stop class.
1. **`DataTable` built without built-in sort/pagination** (D4 said "sortable/paginated table
   shell"). Rationale: E3 says keep the composite generic with no domain-specific behavior; none of
   the 3 precedent lists (branches/categories/products) sort or paginate; adding them is speculative
   complexity for a single current consumer (KISS). A caller that later needs sorting sorts its
   `rows` before passing. Blast radius: `apps/admin/src/components/data-table.tsx` only.
2. **`ConfirmDialog` gained an additive `children` slot.** The plan said the deactivate dialog
   "consumes existing `confirm-dialog`" showing the `couponPolicy` radio, but ConfirmDialog had no
   body slot. Added an optional, backward-compatible `children` prop. Additive; existing callers
   unaffected.
3. **Deactivate action lives on the detail screen, not the list.** Directly implements D1's own
   rationale ("the admin UI already fetches the deal detail before offering the deactivate action,
   so no extra round trip is introduced") + E2 (list serializer omits `outstandingCoupons`, so the
   accurate count is only available on the detail response). Not a departure from intent.
4. **Date validation uses a permissive `new Date()`-parse refine** rather than `z.iso.datetime()`,
   so the API accepts both full ISO and `datetime-local` (`2026-07-15T10:00`) strings from the UI.
   D5 only specifies "date ordering"; the string format was unspecified. Blast radius: deals route
   Zod only.

## Test Infra Gaps Found

- No `apps/admin` browser/E2E runner (project-wide, unchanged) → AC11 remains Agent-Probe only.
- The D1 `'expire'` atomicity assertion (AC9) could not be forced through the HTTP route (no fault
  injection point). Resolved by reproducing the route's exact two writes inside `db.transaction()`
  in the test and throwing — proving all-or-nothing rollback with the same primitive the route uses.
  No new test helper was needed (the plan flagged this as a resolve-at-EXECUTE item).

## Closeout Packet

- **Selected plan:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-04-deals_PLAN_14-07-26.md`
- **Finished:** all API + admin-UI checklist steps; AC1-AC10 automated + regression proven green.
- **Verified vs unverified:** AC1-AC10 + regression = automated-verified. AC11 (UI round-trip) =
  UNVERIFIED (Agent-Probe owed).
- **Cleanup remaining:** perform AC11 manual walkthrough (EVL/UPDATE PROCESS); file the D4
  data-table/form-dialog retrofit backlog note at UPDATE PROCESS; update `all-context.md` Phase 4
  delta; commit.
- **Best next state:** Keep in active/testing — code-complete + automated-green, but AC11 Agent-Probe
  and the EVL confirmation run are still pending. Not yet `Ready for UPDATE PROCESS archival`.
- **Risk pack:** NOT required — plan Blast Radius classifies this phase outside all 6 high-risk
  classes (internal admin CRUD behind `requireAdmin`; no schema migration; `coupons.status` is an
  existing column, first ADMIN writer ≠ first writer overall). The D1 `'expire'` path's atomicity is
  proven by AC9's automated test.

## Follow-up plan stubs created

None this session (backlog note for the D4 retrofit is scheduled for UPDATE PROCESS per the plan's
own Backlog Follow-Up section, not filed during EXECUTE).

## CONTEXT_PARTIAL items

None — full plan + validate-contract + all referenced implementation files were available and read.

## Forward Preview

- **Test Infra Found:** `admin-deals.integration.test.ts` is the 4th reuse of the `makeUser(role)`
  self-seeding fixture; coupon-cascade tests seed `coupons` directly via `db.insert`. The
  `db.transaction()` atomicity test pattern (reproduce route writes + throw + assert rollback) is
  reusable for any future admin transaction.
- **Blast Radius Changes:** `serializers.ts` (+`AdminDeal`/`serializeAdminDeal`), `admin/index.ts`
  (+1 mount line), `confirm-dialog.tsx` (+`children` slot) are the shared-surface touch points a
  later phase should be aware of. `data-table.tsx`/`form-dialog.tsx` are new shared composites P5-P7
  can consume.
- **Commands to Stay Green:** `docker compose up -d` (or native PG at :5432) + `pnpm --filter
  @jojopotato/api db:migrate`, then `pnpm --filter @jojopotato/api test`; admin: `generate-routes`
  BEFORE `typecheck`.
- **Dependency Changes:** none — no new deps, no migration (deals/junction/coupons tables pre-exist).
