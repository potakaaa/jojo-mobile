---
name: plan:menu-003-branch-availability
description: "Hide deals with unavailable components, reject placement server-side, fix reorder reconciliation for deals (MENU-003, issue #98)"
date: 17-07-26
feature: ordering-cart
---

# MENU-003 — Branch Availability for Deals — PLAN

**Date**: 17-07-26
**Status**: Validated — Gate: PASS — awaiting explicit ENTER EXECUTE MODE
**Complexity**: SIMPLE

TL;DR: add one new shared helper that both the deals-menu read path and order-placement write
path call to check "is every component of this deal available at this branch" — batched, no raw
SQL, no new tables. Comment-fix the stale doc on `deal_components`. Fix reorder by fetching the
deals menu alongside the regular menu so `reconcileReorder` (unchanged) naturally treats an
available deal as reorderable instead of always flagging it unavailable. One HARD money-safety AC
(placement rejection) — Known-Gap banned there, real automated test required.

## Overview

Today a deal can be shown and even ordered at a branch even when one of its components is out of
stock there, because the server never checks a deal's individual components before accepting
payment. Reorder also currently treats every past deal line as unavailable, unconditionally. This
plan closes both gaps with one shared availability-check helper used by both the read (menu list)
and write (order placement) paths, plus a client-side fix so reorder fetches the deals menu too.
Full requirements: `menu-003-branch-availability_SPEC_17-07-26.md` in this same task folder.

## Branch

New feature branch cut from `development`: `feat/menu-003-deal-branch-availability`.

## Touchpoints

| File | Change |
|---|---|
| `packages/api/src/routes/lib/deal-availability.ts` | NEW — shared `resolveAvailableDealProductIds()` helper |
| `packages/api/src/routes/lib/coupon-apply.ts` | edit — export the existing `Queryer` type alias (currently module-private) so `deal-availability.ts` can import/reuse it |
| `packages/api/src/routes/branches.ts` | edit inside the `isDealMenu` block only (~line 158-181) — filter deal list by the new helper |
| `packages/api/src/routes/orders.ts` | edit — one new rejection block after the AC6 coupon guard (after line 231, before line 234's dormant block) |
| `packages/api/src/db/schema/deal_components.ts` | comment-only — correct the stale "never read by ... order-placement code" claim |
| `apps/mobile/src/features/orders/hooks/use-reorder.ts` | edit — fetch regular + deals menu, merge `categories`, pass merged menu to unchanged `reconcileReorder` |
| `packages/api/src/routes/__tests__/branches.test.ts` | new test cases (AC1, 2, 3, 6, 7, 8, no-bpa-row residual) |
| `packages/api/src/routes/__tests__/orders.test.ts` | new test cases (AC5, AC8-placement, multi-deal-line) |
| `packages/utils/src/__tests__/reorder.test.ts` | new test cases (AC9a, AC9b) — `reconcileReorder` itself untouched |

## Public Contracts

- `GET /branches/:id/menu?isDeal=true` — response shape UNCHANGED. Only which deal-products appear
  in the list changes (fewer rows when a component is unavailable). No new fields.
- `POST /orders` — response shape UNCHANGED for success. New 400 rejection case added for a
  deal-product with unavailable component(s), reusing the existing `OrderError(400, message)`
  pattern already used for the sibling "Product X is not available at this branch" case.
- No schema/migration changes. No new endpoints.

## Blast Radius

Small — 1 new lib file (~40 lines), 1 small export-only edit to `coupon-apply.ts`, 2 edited route
files (each edit is a scoped, additive block), 1 comment-only schema edit, 1 edited mobile hook
(2-call merge, no new deps), plus tests. Risk class: none new (no schema/auth/billing/migration
surface) — but AC5 IS a money-safety trust boundary per SPEC Constraints, so its test tier is
locked Fully-Automated, Known-Gap banned.

Must NOT touch (verified unchanged in this plan): `admin/deals.ts`, `GET /deals`/`GET /deals/:id`,
`apply-deal.ts`, `eligibility.ts`, `use-deal-usage.ts`, the regular (non-deal) filtering code paths
in `branches.ts` (outside the `isDealMenu` block) and `orders.ts:134-146`, `reconcileReorder`'s
signature/body in `packages/utils/src/reorder.ts`, and the behavior of `resolveCouponDiscount`/
`buildCartFromItems` in `coupon-apply.ts` (only the `Queryer` type's export visibility changes,
not its definition or any function body).

## Acceptance Criteria

Carried verbatim from the locked SPEC (see `menu-003-branch-availability_SPEC_17-07-26.md` for
full detail, flow diagrams, and rationale):

1. A deal whose deal-product and every component are available (and active) at Branch A is
   listed in Branch A's Deals view. — Fully-Automated.
2. Marking exactly one component of an already-listed deal unavailable at Branch A removes that
   deal from Branch A's Deals list on the next fetch — no other deals are affected. — Fully-Automated.
3. The same deal remains listed normally at Branch B where all of its components are still
   available, even while it is hidden at Branch A. — Fully-Automated.
4. Regular (non-deal) products keep behaving exactly as they do today — zero behavior change to
   the existing product-availability filter. — Fully-Automated (existing suite + no-diff check).
5. **(HARD, trust boundary, Known-Gap banned)** `POST /orders` rejects an attempt to place an
   order containing a deal-product whose deal-level or component-level availability at the target
   branch fails; no charge/order row is created. — Fully-Automated.
6. A deal with 2+ components, where exactly one is unavailable, is excluded from the branch list. — Fully-Automated.
7. A deal with zero attached components is never listed at any branch, under any availability
   state. — Fully-Automated.
8. A component available at the branch (`branch_product_availability.is_available=true`) but
   globally deactivated (`products.is_active=false`) does NOT count as available — excluded from
   both the list and order placement. — Fully-Automated.
9. Reorder correctly reconciles deal lines against real, current availability in both directions
   (9a: still-available deal reorders normally; 9b: no-longer-available deal surfaces as an
   explicit conflict, never silently dropped or added). — Fully-Automated.
10. Opening a deal that has become unavailable via a deep link does not let the customer reach an
    orderable state for it. — Agent-Probe (structural consequence of AC1-3 + AC5 backstop).

## Implementation Checklist

### 0. Pre-flight (before any code change)

1. Run the production (or production-equivalent) zero-component-deal count check per SPEC
   Constraints: `SELECT p.id, p.name FROM products p WHERE p.is_deal = true AND NOT EXISTS (SELECT 1 FROM deal_components dc WHERE dc.deal_product_id = p.id);` against the production DB (or the closest available production-mirror environment). **Owner: whoever runs EXECUTE for this plan, before Section 1 lands** — record the row count and any deal names found in the phase report. If any zero-component deals with real orders/traffic are found, flag it to the user before merging (do not silently let AC7's "hide everywhere" behavior surprise a live deal) — this is a report-and-continue check, not a blocking gate, per SPEC ("must be checked as part of PLAN, not assumed safe" — satisfied by running this query and recording the result before EXECUTE completes).
2. `git checkout development && git pull && git checkout -b feat/menu-003-deal-branch-availability`

### 1. New shared helper — `packages/api/src/routes/lib/deal-availability.ts`

3. **First, export the existing `Queryer` type from `packages/api/src/routes/lib/coupon-apply.ts`**
   (currently module-private at line 27: `type Queryer = typeof db | Parameters<Parameters<typeof
   db.transaction>[0]>[0];`) — change `type Queryer` to `export type Queryer`. This is the exact
   proven db-or-tx type already used in production by `resolveCouponDiscount`/`buildCartFromItems`
   and called with `tx` from `orders.ts:351`. Do NOT change its definition — export-only edit.
4. Create the file with a single exported async function, importing and reusing `Queryer` from
   `coupon-apply.ts` for the db-or-tx parameter type — **do NOT declare a new `DbOrTx` type**:
   ```ts
   import type { Queryer } from './coupon-apply';

   resolveAvailableDealProductIds(
     dbOrTx: Queryer,           // reused from coupon-apply.ts — accepts either `db` or a drizzle tx object
     branchId: string,
     dealProductIds: string[],
   ): Promise<Set<string>>
   ```
   Logic (batched, 2 queries, no raw SQL):
   - Query 1: fetch `deal_components` rows where `deal_product_id IN dealProductIds` (reuse the
     exact query shape already at `branches.ts:158-181` — same 3-column select, same inner join to
     `products` for the component's own row, just don't select `componentName` here since this
     helper only needs `dealProductId`/`componentProductId`).
   - Build `componentIdsByDeal: Map<string, string[]>` from those rows.
   - If a `dealProductId` has ZERO rows in `componentIdsByDeal` → it is a zero-component deal
     (SPEC AC7) → never available; exclude it from the result set unconditionally, do not run
     query 2 for it.
   - Query 2: for the deal-products that DO have ≥1 component, collect the full flat set of
     `componentProductId`s referenced, and in ONE `inArray` query fetch `branch_product_availability`
     joined to `products` for those ids at `branchId`, requiring BOTH
     `branch_product_availability.is_available = true` AND `products.is_active = true` (SPEC
     Constraints — both signals required, mirrors the exact join shape already used at
     `branches.ts:109-128` / `orders.ts:134-146` for the deal-product's own row). Because this is
     an INNER join, a component with NO `branch_product_availability` row at all for this branch
     falls out of the result exactly like a row with `is_available=false` would — both are
     "unavailable" (see the dedicated regression test added in Section 6, step 11).
   - Build `availableComponentIds: Set<string>` from query 2's result rows.
   - For each deal-product with ≥1 component: it is available iff EVERY one of its
     `componentIds` is in `availableComponentIds` (`Array.every`).
   - Return the `Set<string>` of available `dealProductId`s (deal-products with zero components,
     or with any missing/inactive component, are simply absent from the returned set).
   - Function does NOT check the deal-product's OWN availability/active row — callers already do
     that separately (both `branches.ts` and `orders.ts` already have that check for the
     deal-product's own row; this helper is purely the component-availability layer, composed with
     the existing own-row check by each caller).

### 2. Read path — `packages/api/src/routes/branches.ts`

5. Inside the existing `if (isDealMenu && productIds.length) { ... }` block (~line 159-181):
   after the existing `componentsByProduct` map is built (unchanged — still needed for the
   `components[]` display field), call
   `const availableDealIds = await resolveAvailableDealProductIds(db, branchId, productIds);`
   using the SAME already-fetched `componentRows` if reuse is straightforward, or run its own
   query — do not double-query if the existing `componentRows` fetch can be reused by passing it
   through, but do NOT change the existing `componentsByProduct` map's shape or its `components[]`
   consumer.
6. Filter `productRows` (or the later `productsByCategory`/`categoryOrder` build) so that, ONLY
   when `isDealMenu` is true, a `product.id` not present in `availableDealIds` is excluded from
   the response entirely (not shown with an "unavailable" flag — SPEC says "not shown", full stop).
   **The ONLY mechanically sound placement is inside the main `for (const {product, category} of
   productRows)` loop (~line 188) — e.g. `if (isDealMenu && !availableDealIds.has(product.id))
   continue;` as the first line of that loop body. Filtering "before the `productIds` derivation"
   (line 130) is NOT possible: `availableDealIds` requires `productIds` as its own input and can
   only be computed after the `if (isDealMenu...)` block runs. Do not attempt the
   before-productIds ordering.**
7. Verify: the `if (isDealMenu && productIds.length)` guard means the component-lookup code path
   is a structural no-op when `isDealMenu` is false. The per-product-loop skip added in step 6 is
   ALSO gated by `isDealMenu &&` and is therefore a guaranteed no-op (never skips) for the regular
   menu — see the AC4 regression-lock wording in Section 7, step 16.

### 3. Write path — `packages/api/src/routes/orders.ts`

8. Insert a new block immediately after the existing AC6 coupon-guard block (ends at line 231,
   `throw new OrderError(400, 'Coupon codes cannot be combined with Deal products.');`) and
   BEFORE the dormant legacy `dealId` block comment at line 234. Do not touch the dormant block.
9. New block:
   - Collect all cart lines whose resolved `product.is_deal === true` (using the already-loaded
     `productById` map from line 148) — **must batch over ALL deal lines in the cart, not assume
     a single deal per order** (mandatory checklist item from INNOVATE review; see Validate
     Contract Execute-Agent Instruction E2 — one `resolveAvailableDealProductIds` call for the
     whole cart, never one call per deal line).
   - If there are zero deal lines, skip entirely (no query) — regular-only carts take an
     unchanged path.
   - Call `resolveAvailableDealProductIds(tx, body.branchId, dealProductIds)` (pass the
     transaction object `tx`, not `db` — this must run inside the existing placement transaction
     so it reads consistent state with the rest of the order).
   - For each deal line, if its `product.id` is NOT in the returned available set, throw
     `OrderError(400, ...)` with a clear, customer-facing reason (e.g.
     `` `Deal "${product.name}" is no longer fully available at this branch` ``) — reject the
     WHOLE order (existing transaction-rollback behavior on any `OrderError` throw already
     guarantees no order row or side effect is written; do not add new rollback logic).
   - No `FOR UPDATE` locking — explicitly matches the existing unlocked bpa read pattern at
     `orders.ts:134-146` (INNOVATE decision B, do not add locking here).

### 4. Comment fix — `packages/api/src/db/schema/deal_components.ts`

10. Replace the "Metadata ONLY: these rows are NEVER read by pricing/cart/order-placement code
   (Decision 5)." sentence with: "Metadata for display AND branch-availability gating — never
   read for pricing or discount math; order-placement reads it solely to reject a cart containing
   an unavailable deal before payment, never to influence `unit_price`/`total_price` (MENU-003)."
   Comment-only change, no code/behavior diff.

### 5. Reorder fix — `apps/mobile/src/features/orders/hooks/use-reorder.ts`

11. Replace the single `getMenu(order.branchId)` fetchQuery call with two fetches — regular menu
    and deals menu — then merge:
    ```ts
    const [regularMenu, dealsMenu] = await Promise.all([
      queryClient.fetchQuery({ queryKey: ['menu', order.branchId], queryFn: () => getMenu(order.branchId) }),
      queryClient.fetchQuery({ queryKey: ['menu', order.branchId, 'deals'], queryFn: () => getMenu(order.branchId, { isDeal: true }) }),
    ]);
    const menu: MenuResponse = { ...regularMenu, categories: [...regularMenu.categories, ...dealsMenu.categories] };
    ```
    Pass this merged `menu` into the EXISTING, UNCHANGED `reconcileReorder(order, menu)` call —
    no signature or body change to `reconcileReorder`. Because Section 2 already makes the
    `isDeal=true` menu exclude unavailable deals, an unavailable deal line is simply absent from
    `menu.categories` and `reconcileReorder`'s existing `product_unavailable` branch fires
    naturally (SPEC AC9b, "no new reason enum value" — confirmed, none added).
    Note the two query keys must be distinct (`['menu', branchId]` vs `['menu', branchId,
    'deals']`) so react-query doesn't collide the two cache entries.
    All deal-products are pinned to a single, idempotently-created "Deals" category
    (`packages/api/src/routes/admin/deals.ts`'s `resolveDealsCategoryId()`), and the regular-menu
    query filters `is_deal=false`, so the "Deals" category never appears in
    `regularMenu.categories` — the merge cannot produce a duplicate category id.

### 6. Tests

12. `packages/api/src/routes/__tests__/branches.test.ts` — add cases for AC1 (all-available deal
    listed), AC2 (one component flipped unavailable → deal removed, sibling deals unaffected),
    AC3 (two-branch isolation — same deal listed at Branch B, hidden at Branch A), AC6
    (2-component deal, one unavailable → excluded), AC7 (zero-component deal → excluded
    regardless of the deal-product's own availability), AC8 (component `is_available=true` but
    `products.is_active=false` → excluded), and a dedicated **no-bpa-row residual case**: a deal
    whose component has NO `branch_product_availability` row at all for the branch (distinct from
    a row that exists with `is_available=false`) → the deal is excluded from the list, exactly
    like the explicit-false case. Reuse the existing seed pattern at `branches.test.ts:142-166`
    (this new case simply omits seeding a bpa row for the component instead of seeding one with
    `is_available=false`).
13. `packages/api/src/routes/__tests__/orders.test.ts` — add cases for AC5 (order attempt against
    a deal with an unavailable component → 400, no order row written, no charge; and the
    contrasting success case — same deal placed against a branch where it IS fully available →
    201) and the **multi-deal-line cart case** (two different deal lines in one cart, one deal
    available and one deal unavailable → whole order rejected 400, batched check covers both, not
    just the first). Also cover the AC8 `is_active=false` variant at placement (component
    available at branch but globally deactivated → rejected). Reuse the existing `is_deal` seed
    pattern at `orders.test.ts:858-906` (ADM-008 offer-coupon section) as a starting point.
14. `packages/utils/src/__tests__/reorder.test.ts` — **`reconcileReorder`'s own signature/body is
    untouched**, so these are new test CASES using the existing test helpers, not new logic:
    AC9a (a deal line present and matched in a merged-shape `MenuResponse` → lands in
    `available`), AC9b-i (deal pulled entirely — deal-product absent from merged menu →
    `unavailable`/`product_unavailable`), AC9b-ii (deal present but with a component now
    unavailable — since Section 2 already excludes such deals from the `isDeal=true` fetch, the
    merged menu simply won't contain that deal-product id either → same
    `unavailable`/`product_unavailable` path, confirming no new reason value is needed).

### 7. Regression lock (AC4)

15. Run the full existing `branches.test.ts` suite unmodified and confirm 0 diffs/failures on the
    regular-menu assertions (`branches.test.ts:237-276`) — this is the explicit no-diff proof for
    AC4, per the ADM-004/ADM-008 snapshot-integrity precedent cited in the SPEC.
16. Confirm via code review (not a test) that the diff to `branches.ts` touches ONLY: (a) lines
    inside the `if (isDealMenu ...)` block (~159-181), OR (b) exactly one new
    `isDealMenu &&`-gated skip line inside the per-product loop that builds `productsByCategory`
    (~line 188, per Section 2 step 6). If a diff line exists that is NEITHER (a) NOR (b) — i.e.
    any line not gated by `isDealMenu` at all, or any change to the regular-menu's own code path —
    stop and reconsider (the regular-menu path must remain a structurally identical code path with
    zero new BEHAVIOR for `isDealMenu === false`, even though one new no-op branch instruction is
    now evaluated per product).

### 8. Backlog note (SPEC Out Of Scope)

17. Write a backlog note at
    `process/features/admin-dashboard/backlog/menu-003-admin-invisible-deal-indicator_NOTE_17-07-26.md`
    documenting the accepted gap: no admin-facing indicator exists for "this deal is invisible due
    to an unavailable component" or "this deal is invisible because it has zero components" — a
    parallel to the existing `availableBranchCount`/`activeBranchCount` admin fields from ADM-008
    Fix 3, out of scope for this SPEC. (Placed under `admin-dashboard` backlog since it's an
    admin-UI-facing gap, not an `ordering-cart` one — cross-reference from the ordering-cart task
    folder if useful, but the note itself belongs in `admin-dashboard/backlog/`.)

## Test Commands

- `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test`
- `pnpm --filter @jojopotato/utils test`
- `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/mobile typecheck && pnpm --filter @jojopotato/utils typecheck`
- `pnpm format:check`

(Verified against `process/context/tests/all-tests.md` — vitest in `packages/api` requires the
docker Postgres + migrate step first; `packages/utils` vitest needs no DB; `apps/mobile` has no RN
runner so use-reorder.ts's runtime behavior is Agent-Probe, see below.)

## Test Tiers (per vc-test-coverage-plan)

| AC | Tier | Notes |
|---|---|---|
| AC1 (listed when all available) | Fully-Automated | `branches.test.ts` |
| AC2 (one component flip removes only that deal) | Fully-Automated | `branches.test.ts` |
| AC3 (per-branch isolation) | Fully-Automated | `branches.test.ts` |
| AC4 (regular menu byte-identical, no-diff) | Fully-Automated | existing suite unmodified + code-review diff check (see Section 7) |
| AC5 (placement rejection) | **Fully-Automated, Known-Gap BANNED (HARD/trust-boundary)** | `orders.test.ts` — money-safety AC, must be a real passing test |
| AC6 (2-component, one unavailable) | Fully-Automated | `branches.test.ts` |
| AC7 (zero-component deal hidden) | Fully-Automated | `branches.test.ts` |
| AC8 (`is_active=false` counts as unavailable) | Fully-Automated | `branches.test.ts` + `orders.test.ts` (both list AND placement) |
| No-bpa-row residual (component has no `branch_product_availability` row at all) | Fully-Automated | `branches.test.ts` — Section 6 step 12 |
| AC9a/9b (reorder reconciliation, both directions) | Fully-Automated | `reorder.test.ts` — pure function, real vitest runner |
| AC10 (deep-link — structural + Agent-Probe backstop) | Agent-Probe | manual walkthrough — no RN runner exists (project-wide gap); AC5 is the automated backstop for the "cannot actually place" part |
| Multi-deal-line cart (mandatory checklist item) | Fully-Automated | `orders.test.ts` |
| Production pre-flight count | N/A — manual DB query, not a test | recorded in phase report, Section 0 step 1 |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `branches.test.ts` — all-available deal listed | Fully-Automated | AC1 |
| `branches.test.ts` — one component unavailable removes only that deal | Fully-Automated | AC2 |
| `branches.test.ts` — two-branch isolation | Fully-Automated | AC3 |
| `branches.test.ts` — existing regular-menu suite unmodified + diff-scope check | Fully-Automated | AC4 |
| `orders.test.ts` — placement rejected for unavailable-component deal, no order row; contrasting success case | Fully-Automated | AC5 |
| `branches.test.ts` — 2-component deal, one unavailable | Fully-Automated | AC6 |
| `branches.test.ts` — zero-component deal hidden everywhere | Fully-Automated | AC7 |
| `branches.test.ts` + `orders.test.ts` — `is_active=false` component | Fully-Automated | AC8 |
| `branches.test.ts` — component with no bpa row at all (distinct from explicit `is_available=false`) → deal hidden | Fully-Automated | no-bpa-row residual (closes prior VALIDATE-named gap) |
| `reorder.test.ts` — available deal reconciles to `available`; unavailable (pulled or component-down) reconciles to `unavailable`/`product_unavailable` | Fully-Automated | AC9a, AC9b |
| Manual Agent-Probe — deep-linked unavailable deal shows "not found"/"not available", no orderable state reached | Agent-Probe | AC10 |
| `orders.test.ts` — two deal lines in one cart, one unavailable, whole order rejected | Fully-Automated | mandatory multi-deal-line checklist item |

## Test Infra Improvement Notes

(none identified yet)

## Known Gaps / Backlog (carried from SPEC Out Of Scope)

- No admin-facing indicator for invisible-due-to-component or invisible-due-to-zero-components
  deals — backlog note filed in Checklist step 17.
- `apps/mobile` has no RN component/E2E runner (project-wide, pre-existing gap) — AC10's UI
  behavior stays Agent-Probe only, never claimed automated.

## Phase Completion Rules

This is a SIMPLE, single-plan (non-phase-program) task. It is considered CODE DONE when all
Implementation Checklist items are complete and all Fully-Automated test gates (Section 6, "Test
Tiers" table) are green. It is considered VERIFIED only after:
- all Fully-Automated gates pass (`pnpm --filter @jojopotato/api test`, `pnpm --filter
  @jojopotato/utils test`, typechecks, `pnpm format:check`),
- the AC4 regression-lock diff-scope check (Checklist step 16) is confirmed,
- the Section 0 production pre-flight count has been run and recorded, and
- the AC10 Agent-Probe walkthrough has been performed and its outcome recorded.
Do not mark this plan `VERIFIED` on Fully-Automated-green alone if the pre-flight count or the
Agent-Probe walkthrough are still outstanding — record them as pending in the phase report instead.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/ordering-cart/active/menu-003-branch-availability_17-07-26/menu-003-branch-availability_PLAN_17-07-26.md`
2. **Last completed phase or step:** VALIDATE re-run from V1 complete (PVL cycle 2). All three cycle-1 gaps independently re-verified against current source, not taken on trust: Gap 1 (chronologically-impossible checklist step) — confirmed both corrected passages (Section 2 step 6, Section 7 step 16) are present and mutually consistent, and match the real line numbers in `branches.ts` today. Gap 2 (`Queryer` reuse) — confirmed `type Queryer` at `coupon-apply.ts:27` is genuinely module-private today (not exported), so the added export-only checklist steps 3-4 are real and correctly scoped (type-only change, zero runtime/behavior surface, near-zero risk despite the small blast-radius addition). Gap 3 (no-bpa-row residual) — confirmed the described INNER JOIN design makes a missing `branch_product_availability` row behave identically to an explicit `is_available=false` row, so the new test case would actually prove the claim. `Gate: PASS` — 0 FAILs, 0 open CONCERNs (2 named residuals remain, both correctly tiered Agent-Probe/manual-query per the SPEC, not silently dropped).
3. **Validate-contract status:** written — **PASS** (cycle 2, 17-07-26). Supersedes the CONDITIONAL contract from cycle 1 (same day).
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, this task folder's SPEC, prior art at `process/features/ordering-cart/completed/menu-product-browsing_10-07-26/`, plus this cycle's direct reads of every touched/reused source file: `packages/api/src/routes/{branches,orders}.ts`, `packages/api/src/routes/lib/{coupon-apply,serializers}.ts`, `packages/api/src/db/schema/deal_components.ts`, `apps/mobile/src/features/orders/hooks/use-reorder.ts`, `packages/utils/src/reorder.ts`, `apps/mobile/src/lib/api-client.ts`, `packages/api/src/routes/admin/deals.ts`, and the three test files whose seed patterns the plan reuses (`branches.test.ts`, `orders.test.ts`, `reorder.test.ts`). Empirically ran `pnpm --filter @jojopotato/utils test` live (35/35 green, confirming the `reorder.ts`/`reorder.test.ts` baseline this plan builds on) plus `pnpm --filter @jojopotato/api typecheck`, `pnpm --filter @jojopotato/utils typecheck`, and `pnpm --filter @jojopotato/mobile typecheck` (all clean) — not inferred from prior context claims alone.
5. **Next step for a fresh agent:** the mechanical EXECUTE gate is satisfied (`Gate: PASS` present in this file). Orchestrator may route to EXECUTE on explicit "ENTER EXECUTE MODE". EXECUTE starts by cutting the branch (`feat/menu-003-deal-branch-availability`) from `development` per the SPEC constraint, then runs Section 0 (production pre-flight count — owned, report-and-continue, record result in the phase report), then Sections 1-8 in checklist order.

## Validate Contract

Status: PASS
Date: 17-07-26
date: 2026-07-17
generated-by: outer-pvl
supersedes: 2026-07-17 (outer-pvl) — this cycle-2 outer PVL pass has current evidence (all 3
cycle-1 CONCERNs independently re-verified against live source + one live test run, not
re-accepted on trust)

Parallel strategy: parallel-subagents
Rationale: signal score 4/7 (S1 multi-package scope — packages/api, apps/mobile, packages/utils;
S5 user explicitly requested a real adversarial fan-out, not a rubber stamp; S6 AC5 is a
trust-boundary/money-safety class; S7 8-file blast radius) — HIGH by count, but the review work
itself is fire-and-forget (4 Layer-1 dimension checks + 9 Layer-2 section checks, none depending
on another's output), so parallel subagents fits better than an agent team; no mid-run
coordination between findings was ever needed. Executed in this cycle as a single structured pass
organized per the Layer 1/Layer 2 role specs (no Agent/Task tool available to vc-validate-agent in
this context) — findings below are backed by direct reads of every touched/reused source file
(not inference) plus one live empirical test run, not a re-stamp of the cycle-1 findings.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | all-available deal listed at branch | Fully-Automated | `packages/api/src/routes/__tests__/branches.test.ts` — new case | A |
| AC2 | one component flip removes only that deal, siblings unaffected | Fully-Automated | `branches.test.ts` — new case | A |
| AC3 | per-branch isolation (hidden at A, shown at B) | Fully-Automated | `branches.test.ts` — new case | A |
| AC4 | regular-menu path byte-identical (no-diff) | Fully-Automated | existing `branches.test.ts` suite unmodified + code-review diff-scope check (Section 7, step 16) | A |
| AC5 (HARD, Known-Gap banned) | `POST /orders` rejects a deal with an unavailable component; no order row/charge; contrasting success case | Fully-Automated | `packages/api/src/routes/__tests__/orders.test.ts` — new cases | A |
| AC6 | 2-component deal, one unavailable → excluded | Fully-Automated | `branches.test.ts` — new case | A |
| AC7 | zero-component deal hidden everywhere | Fully-Automated | `branches.test.ts` — new case | A |
| AC8 | `is_active=false` component counts as unavailable (list + placement) | Fully-Automated | `branches.test.ts` + `orders.test.ts` — new cases | A |
| No-bpa-row residual | component with no `branch_product_availability` row at all → deal hidden (distinct from explicit `is_available=false`) | Fully-Automated | `branches.test.ts` — new case (Section 6 step 12) | A |
| AC9a | reorder: still-available deal reconciles to `available` | Fully-Automated | `packages/utils/src/__tests__/reorder.test.ts` — new case | A |
| AC9b | reorder: unavailable deal (pulled or component-down) reconciles to conflict | Fully-Automated | `reorder.test.ts` — new cases (both sub-cases) | A |
| Multi-deal-line cart | 2 deal lines, one unavailable → whole order rejected, both lines checked | Fully-Automated | `orders.test.ts` — new case | A |
| AC10 | deep-linked unavailable deal never reaches orderable state | Agent-Probe | manual walkthrough — no RN E2E/navigation runner exists (project-wide gap); AC5 is the automated backstop | D |
| Production pre-flight | count existing zero-component deals in production before ship | N/A (manual DB query) | `SELECT p.id, p.name FROM products p WHERE p.is_deal=true AND NOT EXISTS (SELECT 1 FROM deal_components dc WHERE dc.deal_product_id = p.id);` — run once by whoever executes Section 0, recorded in the phase report | D |

gap-resolution legend: A — proven now (gate passes in this cycle); B — fixed in this plan (gate
added by this plan's checklist); C — deferred to a named later phase/plan; D — backlog
test-building stub / named residual with written justification, keep-active, continue.

C-4 reconciliation: every row's `strategy` value above is one of the 3 proving strategies
(Fully-Automated / Agent-Probe used only where genuinely no automated coverage is possible).
Known-Gap is never used as a strategy value — AC5 (banned from Known-Gap by the SPEC) is honored
as real Fully-Automated, and the two `D`-resolution rows (AC10, production pre-flight) are named
residuals with written justification, not silent passes.

Failing stubs (Fully-Automated rows):
```
test("should list a deal whose deal-product and every component are available at Branch A", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC1") })
test("should remove a deal from Branch A's list when exactly one component becomes unavailable, without affecting sibling deals", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC2") })
test("should keep a deal listed at Branch B while it is hidden at Branch A (per-branch isolation)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC3") })
test("should leave the regular (non-deal) menu byte-identical to today (no-diff regression lock)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC4") })
test("should reject POST /orders for a deal with an unavailable component, writing no order row, and accept the same deal when fully available", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC5") })
test("should exclude a 2-component deal from the branch list when exactly one component is unavailable", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC6") })
test("should hide a zero-component deal at every branch regardless of the deal-product's own availability", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC7") })
test("should treat a branch-available-but-globally-deactivated component as unavailable in both the list and at placement", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC8") })
test("should exclude a deal from the branch list when a component has no branch_product_availability row at all (not just an explicit is_available=false row)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: no-bpa-row residual") })
test("should reconcile a still-available deal line to `available` on reorder, at today's price", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC9a") })
test("should reconcile a no-longer-available deal line (pulled or component-down) to an explicit conflict on reorder", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC9b") })
test("should reject the whole order when a cart has 2+ deal lines and only one has become unavailable", () => { throw new Error("NOT IMPLEMENTED — TDD stub: multi-deal-line cart") })
```

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/api` deal-availability read/write paths: Fully-automated: `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test`
- `packages/utils` reorder reconciliation: Fully-automated: `pnpm --filter @jojopotato/utils test` (confirmed 35/35 green live this cycle, current baseline before AC9 additions)
- Typechecks: Fully-automated: `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/mobile typecheck && pnpm --filter @jojopotato/utils typecheck` (confirmed clean live this cycle for all three packages)
- Formatting: Fully-automated: `pnpm format:check`
- Deep-link details screen: agent-probe: manual walkthrough of an unavailable deal's deep link, confirm "not found"/"not available" state, no orderable state reached
- Production zero-component-deal count: known-gap: documented as a manual pre-flight query, owned by whoever runs EXECUTE Section 0, recorded in the phase report before VERIFIED (not a code gate)

Dimension findings:
- Infra fit: PASS — no container/infra/runtime/port surface touched; standard Express route edits + one RN hook edit, all within existing service boundaries. Unchanged from cycle 1.
- Test coverage: PASS — all 12 testable ACs/residuals correctly tiered Fully-Automated with real, verified commands sourced from `process/context/tests/all-tests.md`; AC5 (money-safety) correctly locked Fully-Automated/Known-Gap-banned, and honored. This cycle additionally confirmed `packages/utils` has a REAL, live vitest runner (`"test": "vitest run"` in `package.json`, 4 suites / 35 tests, run live this cycle — all green), which is MORE current than `all-tests.md`'s own text (that context doc still says "packages/{types,utils} still have no runner"; this is a stale-context finding, not a plan defect — flagged below as a context-maintenance follow-up, not a gate blocker). Test seed patterns the plan cites (`branches.test.ts:142-166`, `orders.test.ts:858-906` `is_deal` seed, `reorder.test.ts`'s existing fixture helpers) were verified present and reusable by direct read.
- Breaking changes: PASS — no schema/migration change (verified: `deal_components.ts`/`branch_product_availability.ts`/`products.ts` schema files read directly, no edit proposed to any of them beyond a comment, confirmed unchanged since cycle 1); `GET /branches/:id/menu` response shape unchanged (verified against current `branches.ts` source — line numbers cited in the plan match exactly); `POST /orders` gains an additive 400 case only (verified against current `orders.ts` source — the coupon-guard block ends at line 231/232 and the dormant legacy block's comment starts at line 234, exactly as the plan states); the `coupon-apply.ts` `Queryer` export-only edit does not change any exported function's signature or behavior (re-read `coupon-apply.ts` in full this cycle — `type Queryer` at line 27 is confirmed still module-private today, so the export is real, live-needed work, not already done).
- Security surface: PASS, with one named residual — the write-path re-check runs entirely server-side, inside the placement transaction (confirmed: the new block per the checklist lands between the existing coupon-guard's closing brace at line 232 and the dormant block's comment at line 234, both inside `db.transaction(async (tx) => {...})`), never trusting client state. The plan reuses the already-shipped `Queryer` type alias — confirmed genuinely used today by `resolveCouponDiscount`/`buildCartFromItems` and called with `tx` from `orders.ts:351` (re-verified this exact line number in the live file). Exporting `type Queryer` is a TypeScript-only change (zero runtime surface — types do not exist at runtime), so its blast-radius/risk characterization in the plan ("small... export-only") is honest and not understated. No new TOCTOU risk: skipping `FOR UPDATE` on component availability is consistent with the existing unlocked `branch_product_availability` read for regular products at `orders.ts:135-146` (re-confirmed this cycle — same unlocked pattern, same accepted app-wide race). Residual named explicitly below.
- Section 1 feasibility (new helper `deal-availability.ts`): PASS — mechanically buildable (file does not exist yet, no naming collision); this cycle re-confirmed `type Queryer` is exportable with a one-word change and that no `DbOrTx`-named symbol currently exists anywhere in `packages/api/src/routes/lib/` to collide with the ban.
- Section 2 feasibility (read-path filter, `branches.ts`): PASS — re-read the live file this cycle: the `if (isDealMenu && productIds.length)` block runs lines 159-181, `componentsByProduct` is built there for the `components[]` display field (unchanged use), and the main per-product loop the plan targets is at line 188 — step 6's "insert the skip as the first line of that loop body" instruction is mechanically exact against current source, not approximate.
- Section 3 feasibility (write-path rejection, `orders.ts`): PASS — re-confirmed this cycle: `productById` map is built at line 148 (exact match to the plan's citation), the coupon-guard `throw` is at line 231 with its closing brace at 232, and the dormant block's comment begins at line 234 — the plan's insertion point is precisely correct, not off-by-one in a way that matters. The ALL-deal-lines batching requirement (E2) is explicit in the checklist (step 9, first bullet: "must batch over ALL deal lines in the cart, not assume a single deal per order"). Rollback-on-throw semantics are proven by the existing `OrderError` → transaction-rollback pattern already exercised by the coupon/deal blocks in the same function.
- Section 4 feasibility (comment fix): PASS — re-read `deal_components.ts` this cycle: the exact target sentence ("Metadata ONLY: these rows are NEVER read by pricing/cart/order-placement code (Decision 5).") is present verbatim at line 15, unchanged since cycle 1.
- Section 5 feasibility (reorder fix, `use-reorder.ts`): PASS — re-read the live file this cycle: it currently calls `getMenu(order.branchId)` with no `isDeal` flag (confirmed the bug is real and current), and `getMenu(branchId, {isDeal:true})` is confirmed to already exist and work at `apps/mobile/src/lib/api-client.ts:93-114`. Re-confirmed `resolveDealsCategoryId()` in `admin/deals.ts` server-pins every deal-product to one idempotently-created "Deals" category, and the regular-menu query filters `is_deal=false` server-side (`branches.ts:125`), so the merge genuinely cannot produce a duplicate category id. `reconcileReorder` (`packages/utils/src/reorder.ts:66`) re-read in full this cycle — confirmed shape-agnostic (iterates `menu.categories` generically via `productsById()`), zero signature/body change required, and the live `reorder.test.ts` file currently has 6 passing tests with no deal-specific case yet, confirming this is genuinely new test surface, not a collision.
- Section 6 feasibility (tests): PASS — re-confirmed this cycle by direct read: `branches.test.ts:142-166`'s 1-component "Combo Deal" seed and `orders.test.ts:858-906`'s ADM-008 `is_deal` seed both exist exactly as cited and are reusable; the no-bpa-row residual test design (an INNER JOIN naturally excludes a component with zero `branch_product_availability` rows, identical to an explicit `is_available=false` row) is mechanically sound against the helper's described query shape.
- Section 7 feasibility (AC4 regression-lock check): PASS — correctly allows the one necessary `isDealMenu &&`-gated skip line outside the original block range; re-verified against current `branches.ts` line numbers.
- Section 8 feasibility (backlog note): PASS — target directory exists (`process/features/admin-dashboard/backlog/`), naming convention correct.
- Section 0 feasibility (pre-flight + branch cut): PASS — the SQL query is correct and safe (read-only `NOT EXISTS`); ownership is explicit; current branch is `development` with no uncommitted code changes (git status confirmed clean of source diffs this cycle — only the task-folder plan/spec/report files are new), so the branch-cut step is still pending and accurately described as not-yet-done.

Open gaps (post-cycle-2, both independently re-confirmed, neither new):
- known-gap: documented as a manual, owned pre-flight step (Section 0, step 1) — production
  zero-component-deal count is UNVERIFIED as of this VALIDATE pass (dev DB confirmed zero deals
  of any kind this session, per SPEC Background). Must be run and recorded in the phase report
  before this plan is marked VERIFIED, per the plan's own Phase Completion Rules.
- known-gap: documented — `apps/mobile` has no RN component/E2E runner for navigation-level flows
  (project-wide, pre-existing, per `all-tests.md`), so AC10's UI behavior is Agent-Probe only,
  never automated; AC5 is the automated backstop for the "cannot actually place the order" half
  of AC10.
- context-maintenance note (non-blocking, not a plan defect): `process/context/tests/all-tests.md`
  is stale — it still states `packages/{types,utils}` have no test runner, but `packages/utils`
  has had a real `vitest` runner since before this plan (confirmed live: 4 suites, 35 tests,
  green). Recommend a `vc-generate-context` delta pass to fix `all-tests.md` at the next UPDATE
  PROCESS — does not block this plan's EXECUTE.

What this coverage does NOT prove:
- AC1-AC9/multi-deal-line/no-bpa-row gates prove the DB-level availability logic (list filtering,
  order rejection, reorder reconciliation) is correct against a real Postgres instance with the
  exact schema shapes described. They do NOT prove the mobile UI actually renders the resulting
  empty/conflict states correctly on-device — that is AC10, Agent-Probe only.
- The unlocked (`FOR UPDATE`-free) component-availability read means a genuinely concurrent race
  (staff flips a component unavailable in the exact window between this plan's check and the
  order insert) is not tested and not prevented. This mirrors the existing, accepted risk for
  regular products and is not a new gap introduced by this plan, but no test in this contract
  covers it.
- The production pre-flight zero-component-deal count is a manual query, not a code gate — this
  contract does not prove production is safe until that query has actually been run and recorded.
- This cycle's `packages/utils test`/typecheck runs confirm the PRE-EXISTING baseline is green;
  they do not (and cannot, since the new code doesn't exist yet) prove the new AC1-AC9/multi-deal
  test cases themselves pass — that proof happens at EXECUTE/EVL, against the real new code.

Gate: PASS (0 FAILs, 0 open CONCERNs. All 3 cycle-1 CONCERNs independently re-verified against
live source this cycle, not re-accepted on trust — Gap 1 plan-text fix confirmed present and
consistent; Gap 2 Queryer export confirmed still-needed and correctly scoped; Gap 3 no-bpa-row
test design confirmed mechanically sound. The 2 remaining items are named known-gaps with written
justification carried from the SPEC's own Out Of Scope/Constraints, not concerns blocking EXECUTE.)
Accepted by: session (VALIDATE cycle 2) — both named known-gaps (production pre-flight query,
AC10 Agent-Probe) are pre-accepted by the SPEC itself (Constraints: "report-and-continue, not a
blocking gate"; Out Of Scope: no RN E2E runner exists project-wide). No unresolved concern remains
requiring separate user sign-off beyond the plan's own Phase Completion Rules (which already gate
VERIFIED, not EXECUTE, on the pre-flight count and AC10 walkthrough being recorded).

## Autonomous Goal Block

SESSION GOAL: Ship MENU-003 — hide deals with unavailable components from branch menus, reject
order placement for them server-side (money-safety, Known-Gap banned), and fix reorder so past
deal orders reconcile against real current availability instead of always failing.
Charter + umbrella plan: N/A — single SIMPLE plan, not a phase program.
Autonomy: standard RIPER-5 autonomy rules — CONDITIONAL findings may be applied/corrected in-plan
during VALIDATE/PVL-supplement (as done here for Gaps 1-3); EXECUTE requires explicit "ENTER
EXECUTE MODE" per plan-lifecycle.md; irreversible/outward-facing actions (branch cut, production DB
pre-flight query) require explicit confirmation before running.
Hard stop conditions / safety constraints:
- AC5 (order-placement rejection for a deal with an unavailable component) must be proven by a
  real, passing Fully-Automated test — Known-Gap is explicitly banned for this AC by the SPEC.
- Do not touch `admin/deals.ts` CRUD, the legacy `GET /deals`/`GET /deals/:id` routes,
  `apply-deal.ts`/`eligibility.ts`/`use-deal-usage.ts`, or the regular (non-deal) filtering code
  paths in `branches.ts`/`orders.ts:134-146` — these must stay byte-identical (AC4).
- `reconcileReorder`'s own signature/body in `packages/utils/src/reorder.ts` must not change.
- No schema/migration changes; no new endpoints; `POST /orders` and
  `GET /branches/:id/menu?isDeal=true` response shapes stay unchanged for success cases.
- Run the production zero-component-deal pre-flight query (Section 0, step 1) and record the
  result before this plan is marked VERIFIED — report-and-continue, not a code gate, but must not
  be silently skipped.
- Work lands on `feat/menu-003-deal-branch-availability`, cut from `development` — not `main`.
Next phase: EXECUTE — Gate: PASS confirmed (VALIDATE cycle 2, 17-07-26). Awaiting explicit "ENTER EXECUTE MODE".
Validate contract: inline in this plan file (see `## Validate Contract` above).
Execute start: `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test` (Fully-Automated) | AC10 deep-link walkthrough (Agent-Probe) | production pre-flight SQL query (Section 0) | high-risk pack: no (no auth/billing/schema/migration/deploy surface touched — AC5 is money-adjacent but is a rejection-only guard with no new write surface, and is fully covered by a real Fully-Automated test, so the standing 5-artifact risk-evidence-pack is not required; the Security surface dimension finding above stands as the risk review).
