---
phase: phase-03-products
date: 2026-07-15
status: COMPLETE
evl_status: PASS (183/183 gates, 0 fix cycles)
feature: admin-dashboard
plan: process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-03-products_PLAN_14-07-26.md
---

# Phase 3 — Products/Categories CRUD (ADM-003, #41) — EXECUTE Report

## What Was Done

**API (packages/api) — the Fully-Automated gate surface:**
- `packages/api/src/routes/admin/products.ts` (new) — full CRUD for products, product_options
  (`size|flavor|add_on`), and branch_product_availability. Cents↔numeric conversion on write/read via
  the now-shared `centsToNumeric`/`numericToCents` pair; `category_id` FK validated (400 on
  invalid/inactive category); `base_price`/`price_delta` soft-deleted via `PATCH .../deactivate`;
  availability upsert via Drizzle `.onConflictDoUpdate()` targeting `bpa_branch_product_idx`
  (Decision 3 — no manual select-then-insert-or-update).
- `packages/api/src/routes/admin/categories.ts` (new) — categories CRUD + soft-delete; slug
  uniqueness enforced via the shared `isUniqueViolation` catch (409, not a raw constraint leak).
- `packages/api/src/routes/admin/lib/errors.ts` — `handleAdminError`/`isUniqueViolation` relocated
  here from `branches.ts` (Decision 2); both now exported and consumed by all three admin route
  files (`branches.ts`, `products.ts`, `categories.ts`) — third confirmed consumer of the
  append-only `/api/admin` aggregator pattern (`routes/admin/index.ts`), first confirmed consumer of
  the shared error-helper relocation.
- `packages/api/src/routes/lib/serializers.ts` — `centsToNumeric` exported here (moved from
  `orders.ts`, module-private no longer); local admin-facing serializers/types for category,
  product, product option, and branch-availability added, matching the `AdminBranch`/
  `serializeAdminBranch` local-declaration convention from P2 (`packages/types` untouched).
- `packages/api/src/routes/orders.ts` — `centsToNumeric` declaration removed; its 3 call sites
  (real locations, corrected per Execute-Agent Instruction E1: `orders.ts:175-176` for
  `unit_price`/`total_price`, `orders.ts:291-293` for `subtotal`/`discount_total`/`total` — not the
  plan's stale 2-site estimate) now import from `routes/lib/serializers.ts`.
- `packages/api/src/lib/__tests__/admin-products.integration.test.ts` (new) — 19 supertest cases
  (AC1, AC3-AC7 covering products/options/availability/authz/soft-delete), reusing `makeUser(role)`.
- `packages/api/src/lib/__tests__/admin-categories.integration.test.ts` (new) — 12 supertest cases
  (AC2, AC6-AC7).
- **AC1 snapshot-integrity regression test** (in `admin-products.integration.test.ts`): places a
  product, places a real order snapshotting its price via the real order-placement transaction, edits
  `base_price` via the new admin route, and asserts the historical `order_items.unit_price`/
  `total_price` rows are byte-for-byte unchanged. This is a REAL passing automated test — Known-Gap
  was never used for AC1, exactly as the umbrella's Hard Safety Constraints and Definition of Done
  #5 require.

**App (apps/admin) — Agent-Probe surface (partially now automated-adjacent via typecheck/lint):**
- `apps/admin/src/components/{query-states,confirm-dialog,page-header}.tsx` (new, Decision 1) — the
  program's FIRST shared-composite extraction. `confirm-dialog.tsx` generalizes P2's
  `deactivate-branch-dialog.tsx` (title/description/onConfirm/confirmLabel props replacing the
  branch-specific text). `data-table`/`form-dialog` were deliberately NOT extracted this phase — see
  Plan Deviations (none — this matches the plan's own Decision 1, not a deviation).
- `apps/admin/src/features/categories/**` (new) — list/create/edit screens, consuming all 3
  extracted composites (hard constraint per Decision 1 — verified, no local duplicates built).
- `apps/admin/src/features/products/**` (new) — product list/detail/create/edit screens, option
  sub-editor, per-branch availability toggle grid (feature-local, not extracted, per Decision 1).
  Route structure: `products.tsx` (list) + `products.$productId.tsx` (detail) as originally planned.
- `apps/admin/src/components/{app-sidebar,nav-user,sidebar,sheet,tooltip,separator,skeleton}.tsx`
  — landed via the concurrent cross-cutting Sidebar Navigation work (commit `fb0a8c8`, already
  closed out and archived to `completed/` before this phase's EXECUTE started); Phase 3's `products`/
  `categories` routes register into `nav-config.ts`, no conflict.

**Post-EXECUTE bug found + fixed (during AC8 manual walkthrough):**
- The "Manage" button on the product list navigated to `/products/:id`, but the detail screen never
  painted (URL changed, screen stayed on the list). Root cause: TanStack Start's file-based router
  auto-nests a `foo.$id.tsx` file under `foo.tsx` (shared filename prefix) — the parent `products.tsx`
  rendered the list UI directly with no `<Outlet/>`, so the child route had nowhere to mount.
  Fix (commit `79df222`): split `products.tsx` into a thin `<Outlet/>` layout, and moved the list UI
  into a new `products.index.tsx`. `apps/admin` routing only — no API/schema/categories changes.
  This is now the reference pattern for any future admin list→detail screen (P4-P7). See the
  `## Durable Learnings` section below.

## What Was Skipped or Deferred

- **`data-table` and `form-dialog` shared composites** — NOT extracted this phase, per Decision 1
  (explicit, planned deferral, not a gap). Re-eval trigger: Phase 4 (Deals) RESEARCH — the
  `deal_products`/`deal_branches` junction-table UI is the likely next real second-consumer test case.
- Nothing else — AC1-AC8 all ran; AC8 (Agent-Probe) was performed by the user this session, not
  deferred.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| AC1, AC3-AC7 (products/options/availability) | `pnpm --filter @jojopotato/api test admin-products` | PASS — 19/19 |
| AC2, AC6-AC7 (categories) | `pnpm --filter @jojopotato/api test admin-categories` | PASS — 12/12 |
| Regression guard — orders (`centsToNumeric` export refactor) | `pnpm --filter @jojopotato/api test orders` | PASS — 31/31 |
| Regression guard — admin-branches (error-helper relocation) | `pnpm --filter @jojopotato/api test admin-branches` | PASS — 15/15 |
| Full API suite | `pnpm --filter @jojopotato/api test` | PASS — 183/183, 0 regressions |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | PASS |
| Admin typecheck | `pnpm --filter @jojopotato/admin typecheck` | PASS |
| AC8 (Agent-Probe) | manual browser walkthrough (categories→products→options→availability, incl.
  price-edit confirmation) | DONE by user — found + fixed the products-detail-Outlet bug; re-walked
  and PASSED after the fix |

## Plan Deviations

1. **Execute-Agent Instruction E1 (stale line numbers) confirmed and applied as documented in the
   plan** — `centsToNumeric` was actually at `orders.ts:55-57` with 3 call sites
   (`orders.ts:175-176`, `orders.ts:291-293`), not the plan's stated `49-51`/2 sites. Re-grepped at
   EXECUTE time per E1's explicit instruction; all 3 call sites updated. Within-blast-radius, no
   contract change.
2. **Post-EXECUTE routing bug, found and fixed during AC8, not anticipated by the plan or
   validate-contract** — the `products.tsx`/`products.$productId.tsx` nested-route `<Outlet/>`
   requirement was not called out in Touchpoints or Public Contracts (TanStack Start's nesting
   convention was not yet a known gotcha in this codebase — P1/P2's `(dashboard)` route group and
   `branches.tsx` never hit it because neither has a detail sub-route). Fixed same session
   (commit `79df222`), scoped to `apps/admin` routing only, zero API/schema/categories impact.
   Surfaced here and captured as a durable pattern for P4-P7 (see below) rather than left implicit.

## Test Infra Gaps Found

- No `apps/admin` browser/E2E runner still exists (project-wide gap, unchanged since P0/P2) — AC8
  remains structurally Agent-Probe by design, not automatable within this phase's scope. Unlike P2's
  AC7, this phase's AC8 walkthrough was actually PERFORMED (not left owed) — see EVL Confirmation.
- Decision 3's realtime-sync residual (`branch_product_availability`, refetch-on-focus only, no
  optimistic-concurrency guard) — documented Known-Gap, consistent with the app's existing 30s
  `staleTime` staleness model, no automated coverage possible within this phase's scope; no external
  mobile-write consumer exists yet (contrast P2's `is_accepting_pickup`, blocked on STAFF-004).

## EVL Confirmation (UPDATE PROCESS pass, 15-07-26)

Independent re-run of all gates from the validate-contract — execute-agent's internal green claim
does not substitute for this confirmation:

| Gate | Command | Result |
|---|---|---|
| AC1, AC3-AC7 | `pnpm --filter @jojopotato/api test admin-products` | PASS — 19/19 |
| AC2, AC6-AC7 | `pnpm --filter @jojopotato/api test admin-categories` | PASS — 12/12 |
| Regression — orders | `pnpm --filter @jojopotato/api test orders` | PASS — 31/31 |
| Regression — admin-branches | `pnpm --filter @jojopotato/api test admin-branches` | PASS — 15/15 |
| Full API suite | `pnpm --filter @jojopotato/api test` | PASS — 183/183, 0 regressions |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | PASS |
| Admin typecheck | `pnpm --filter @jojopotato/admin typecheck` | PASS |

All 7 gates green, 0 fix cycles. AC8 (Agent-Probe) performed directly by the user this session —
found and fixed a real routing bug (products detail `<Outlet/>` gap), then re-walked and passed.

**Known gaps carried forward (not silently dropped):**
- Decision 3 realtime-sync residual (`branch_product_availability`) — accepted Known-Gap, consistent
  with the app's existing staleness model, no backlog note required beyond what's already documented
  in this plan's `## Locked Decisions` §3 and `## Test Infra Improvement Notes` (matches the plan's
  own framing: not new debt, no external writer yet).
- No `apps/admin` browser/E2E runner — project-wide gap, unchanged (see `process/context/tests/all-tests.md`).

**Closeout classification:** code-complete, automated-verified, AND Agent-Probe-verified (AC8 was
actually performed, unlike P2's AC7 which remained owed). Phase status advances to ✅ VERIFIED in the
umbrella plan's Program Status Table.

## SPEC Achievement

This phase runs under the phase-program inner loop (`R → I → P → PVL → E → EVL → UP`), which skips a
per-phase SPEC — the umbrella plan's Program Goal Charter governs. No per-phase `*_SPEC_*.md` exists
for Phase 3; acceptance criteria AC1-AC8 (defined directly in the phase plan) are the scoring surface:

| Criterion | Status | Note |
|---|---|---|
| AC1 (snapshot-integrity, HARD, Known-Gap banned) | met | Fully-Automated, real passing regression test, independently EVL-confirmed |
| AC2-AC7 | met | Fully-Automated, independently EVL-confirmed (183/183 whole-suite green) |
| AC8 | met | Agent-Probe walkthrough actually performed by the user; found + fixed a real bug, re-walked and passed |
| Decision 3 realtime-sync | N/A (Known-Gap, not a criterion) | documented residual, consistent with existing app staleness model |

## Durable Learnings

1. **TanStack Start nested-detail-route Outlet gotcha (durable, affects P4-P7):** a `foo.$id.tsx`
   detail route file is auto-nested under `foo.tsx` by TanStack Start's file-based router (shared
   filename prefix). The parent file MUST render `<Outlet/>` or the child route mounts nowhere — the
   URL changes but nothing paints. Reference fix pattern: split `foo.tsx` into a thin `<Outlet/>`
   layout, and move the list/index UI into a new `foo.index.tsx`. Branches (P2) never hit this (no
   detail sub-route exists there). Any future admin list→detail screen (P4 Deals, P5 Rewards, P6
   Orders) should apply this layout+index split from the start rather than discover it via a broken
   walkthrough.
2. **Validate-contract command-wording bug (process learning, corrected in the plan file this
   pass):** the narrow-test-command form must OMIT `--` — `pnpm --filter @jojopotato/api test
   admin-products`, not `pnpm --filter @jojopotato/api test -- admin-products`. The `--` causes pnpm
   to drop the positional filter argument, silently running the FULL suite instead of the narrowed
   one. This repeats P2's own E2 correction (vitest CLI filter is filename-substring based) — worth
   keeping in mind for P4-P7's own validate-contracts rather than copy-pasting the `--` form again.
3. **Snapshot-integrity is safe by construction in this codebase** — `order_items.unit_price`/
   `total_price` are physically stored `numeric` columns populated once, at order-placement time,
   from a live read of `product.base_price` inside the placement transaction; there is no later read
   path that recomputes from `products.base_price`. AC1's regression test locks this against future
   refactor regressions rather than proving a currently-false fact. Durable fact for any future
   order/pricing admin work (e.g. P5's reward-retroactivity test follows the identical shape).

## Closeout Packet

- **Selected plan:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-03-products_PLAN_14-07-26.md`
- **Finished:** full products+categories+options+availability CRUD (API + 31 new supertest cases) +
  3 extracted shared composites + full `apps/admin` categories/products feature slices + the
  snapshot-integrity regression test (AC1, HARD, real passing test) + the products-detail routing fix.
- **Verified:** AC1-AC8 all met, independently EVL-confirmed (183/183) AND AC8 Agent-Probe actually
  performed (not owed). **Unverified:** none outstanding for this phase.
- **Cleanup remaining:** none blocking. Decision 3's realtime-sync Known-Gap remains an accepted,
  documented residual (not new debt).
- **Best next state:** ✅ VERIFIED — EVL confirmed, AC8 walkthrough done, UPDATE PROCESS complete this
  pass. Next phase: Phase 4 — Deals CRUD (ADM-004, #42), Step 0 (RESEARCH), which should re-evaluate
  `data-table`/`form-dialog` extraction against the `deal_products`/`deal_branches` junction-table UI.

## Forward Preview

- **Test Infra Found:** `packages/api` vitest+supertest remains the hard gate for all admin CRUD;
  `makeUser(role)` self-seeding fixture reused a third time. No new `apps/admin` test infra added
  this phase (AC8 stayed Agent-Probe, same project-wide gap).
- **Blast Radius Changes:** new `routes/admin/products.ts`, `routes/admin/categories.ts`;
  `routes/admin/lib/errors.ts` gained 2 exported functions (relocated from `branches.ts`);
  `serializers.ts` gained exported `centsToNumeric` + local admin product/category/option/
  availability types; `orders.ts` lost its module-private `centsToNumeric` (now imports it); 3 new
  `apps/admin/src/components/` composites; new `apps/admin/src/features/{products,categories}/**`;
  post-hoc routing fix split `products.tsx` into `products.tsx` (layout) + `products.index.tsx` (list).
- **Commands to Stay Green:** `pnpm --filter @jojopotato/api test admin-products` (no `--`);
  `pnpm --filter @jojopotato/api test admin-categories` (no `--`); `pnpm --filter @jojopotato/api
  test orders`; `pnpm --filter @jojopotato/api test admin-branches`; `pnpm --filter @jojopotato/
  {api,admin} typecheck`; `pnpm --filter @jojopotato/admin generate-routes` after any new route
  file; `pnpm format:check` before commit.
- **Dependency Changes:** none — no new packages. P4 (Deals) should revisit `data-table`/
  `form-dialog` extraction against the deal junction-table UI, and apply the layout+index Outlet
  pattern from the start for any deal detail screen.
