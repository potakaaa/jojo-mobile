---
phase: phase-02-branches
date: 2026-07-14
status: COMPLETE_WITH_GAPS
feature: admin-dashboard
plan: process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-02-branches_PLAN_14-07-26.md
---

# Phase 2 — Branches CRUD (ADM-002, #40) — EXECUTE Report

## What Was Done

**API (packages/api) — the Fully-Automated gate surface:**
- `packages/api/src/routes/admin/branches.ts` (new) — full CRUD router. `GET /` (all branches
  incl. inactive, name-asc), `GET /:branchId` (no `is_active` filter), `POST /` (create,
  409-on-duplicate-slug), `PATCH /:branchId` (partial update + `{isActive:true}` reactivation,
  409-on-duplicate-slug), `PATCH /:branchId/deactivate` (soft-delete `is_active=false`, row survives).
  Reuses the existing `AdminApiError` (imported, no new error class). Soft-delete only — no `DELETE`.
- `packages/api/src/routes/lib/serializers.ts` — added `AdminBranch` interface (= `ApiBranch` + `slug`
  + `isActive`, minus the query-only `distanceKm`) and `serializeAdminBranch`, declared locally per the
  existing `ApiBranch`/`ApiOrder`/`ApiDeal` convention. `packages/types` untouched (as planned).
- `packages/api/src/routes/admin/index.ts` — append-only: `import branchesRouter from './branches'` +
  `adminRouter.use('/branches', branchesRouter)`. No restructure. `packages/api/src/index.ts` NOT edited
  (the `/api/admin` mount at `:212` already applies `adminCors` + `requireAdmin` to every sub-router).
- `packages/api/src/lib/__tests__/admin-branches.integration.test.ts` (new) — 12 supertest cases
  covering AC1-AC6, reusing the `makeUser(role)` self-seeding helper from `require-admin.integration.test.ts`.

**App (apps/admin) — Agent-Probe surface (no automated runner):**
- `src/features/branches/lib/admin-branches-api.ts` (new) — the FIRST fetch wrapper in `apps/admin`;
  `credentials:'include'` per `auth-client.ts`; local `AdminBranch` client type; `AdminApiError`.
- `src/features/branches/hooks/use-admin-branches.ts` (new) — react-query hooks (list/detail + create/
  update/deactivate mutations, each invalidating the `['admin','branches']` list key). First real
  consumer of `apps/admin`'s dedicated `queryClient`.
- `src/features/branches/components/{branch-list,branch-form,deactivate-branch-dialog}.tsx` (new) —
  list table (loading/empty/error states; inactive rows shown dimmed with Reactivate); shared
  create/edit form; radix-Dialog confirmation gate for deactivation (Safety requirement).
- `src/routes/(dashboard)/branches.tsx` (new) — sibling child route of the `(dashboard)` group
  (inherits the server-verified admin `beforeLoad` guard); orchestrates list + form modal + deactivate
  dialog. `routeTree.gen.ts` regenerated via `tsr generate`.
- `src/routes/(dashboard)/index.tsx` — added a "Manage branches" nav button (reach the new screen).

## What Was Skipped or Deferred

- **AC7 (Agent-Probe manual walkthrough)** — NOT executed. Requires a running `apps/admin` dev server +
  a browser against dev Postgres; no browser/E2E runner exists in this repo (project-wide gap). Owed
  manual walkthrough: list → create → edit → deactivate → duplicate-slug attempt.
- **The five speculative shared composites** from Cross-Cutting Compliance §5 (`components/{data-table,
  form-dialog,confirm-dialog,page-header,query-states}.tsx`) — NOT extracted. See Plan Deviations.
- **`branches.priority` column** — dormant, not exposed via CRUD this phase (matches validate-contract Open gaps).

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| AC1-AC6 (Fully-Automated) | `pnpm --filter @jojopotato/api test -- admin-branches` | PASS — 12/12 in suite; 134/134 whole API suite |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | PASS |
| API lint | `pnpm --filter @jojopotato/api lint` | PASS |
| Admin typecheck | `pnpm --filter @jojopotato/admin typecheck` | PASS |
| Admin lint | `pnpm --filter @jojopotato/admin lint` | PASS |
| Admin test | `pnpm --filter @jojopotato/admin test` | PASS — 1/1 (existing; no new component test — AC7 is Agent-Probe only) |
| Prettier (changed files) | `prettier --check` | PASS (3 files reformatted then clean) |
| AC7 (Agent-Probe) | manual browser walkthrough | NOT RUN — owed |
| Shared-state race (Known-Gap) | — | documented, blocked on STAFF-004 |

## Plan Deviations

1. **`isUniqueViolation` checks `err.cause.code` in addition to `err.code`** (Execute-Agent Instruction
   E1 named only top-level `(err as {code?}).code === '23505'`). drizzle-orm/node-postgres wraps the pg
   error in a `DrizzleQueryError` with the original on `.cause`, so the top-level-only check returned 500.
   AC3 caught this (red: 500≠409); the fix (check both) made it green. Faithful to E1's explicit
   directive to "verify against [AC3] directly rather than reasoning abstractly." Within-blast-radius
   (implementation detail, no contract change).
2. **The 5 shared UI composites (§5) were NOT extracted; feature-folder components were built instead.**
   The authoritative Implementation Checklist Step 6 lists only the feature components (branch-list/
   branch-form/deactivate-branch-dialog + route), which were delivered. §5's "then lift into shared
   composites" refactor was deferred because: (a) no gate exercises them and AC7 is manual-only;
   (b) YAGNI/KISS + the active concurrency constraint (a parallel agent editing `apps/admin` components)
   made adding 5 speculative shared files a collision/scope risk with no verification benefit this phase.
   The CRUD shapes are cleanly separated and reusable AS-IS for P3-P7 reference. **Recommend P3 RESEARCH
   revisits the extraction once a real second CRUD consumer exists** (the §5 "imminent second consumer"
   bar). Within-blast-radius (internal `apps/admin` structure only). SURFACED for orchestrator/user review.

## Test Infra Gaps Found

- No `apps/admin` browser/E2E runner — AC7 has no automated coverage (project-wide gap, pre-existing).
- `is_accepting_pickup` shared-state race (admin-write vs future STAFF-004 mobile-write) has no
  optimistic-concurrency guard anywhere on `branches` writes; last-write-wins accepted. No automated
  test possible until STAFF-004 exists — tracked Known-Gap, not silently dropped.

## Closeout Packet

- **Selected plan:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-02-branches_PLAN_14-07-26.md`
- **Finished:** all API CRUD routes + serializer + aggregator append + 12-case supertest suite (AC1-AC6
  green); full `apps/admin` branches feature (api/hooks/components/route) typecheck+lint clean.
- **Verified:** AC1-AC6 Fully-Automated (independent EVL re-run pending). **Unverified:** AC7 manual walkthrough.
- **Cleanup remaining:** run AC7 walkthrough; then UPDATE PROCESS (archive + context delta for the
  established admin-CRUD pattern + `auth/` group candidate reminder).
- **Best next state:** Keep in active/testing — EVL confirmation (vc-tester re-run AC1-AC6) + AC7 manual
  walkthrough owed before ✅ VERIFIED / archival.

## Forward Preview

- **Test Infra Found:** `packages/api` vitest+supertest is the hard gate for all admin CRUD; the
  `makeUser(role)` self-seeding fixture is the reuse pattern for P3-P7 admin route tests. `apps/admin`
  vitest+@testing-library/react exists but no branches component test was added (AC7 is Agent-Probe).
- **Blast Radius Changes:** new `routes/admin/branches.ts`; `serializers.ts` gained `AdminBranch`/
  `serializeAdminBranch` (additive); `routes/admin/index.ts` gained one sub-router mount; new
  `apps/admin/src/features/branches/**` + one `(dashboard)` route + one nav button on the dashboard home.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/api test -- admin-branches`;
  `pnpm --filter @jojopotato/{api,admin} typecheck`; `pnpm --filter @jojopotato/admin generate-routes`
  after any new route file; `pnpm format:check` before commit.
- **Dependency Changes:** none — no new packages; `radix-ui` Dialog (already a dep) used directly for the
  two modals. P3+ that build another admin CRUD screen should revisit the §5 shared-composite extraction
  and, if `branch ordering/display-priority` UI is built, expose the dormant `branches.priority` column.
