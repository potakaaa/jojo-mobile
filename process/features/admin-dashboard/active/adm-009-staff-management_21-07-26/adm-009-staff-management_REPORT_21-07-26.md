---
phase: adm-009-staff-management
date: 2026-07-21
status: COMPLETE_WITH_GAPS
feature: admin-dashboard
plan: process/features/admin-dashboard/active/adm-009-staff-management_21-07-26/adm-009-staff-management_PLAN_21-07-26.md
---

# ADM-009 — Staff Management: EXECUTE Report

## What Was Done

All 12 code checklist items landed (item 13 = AC8 manual walkthrough, owed by the user).

Backend (`packages/api`):
- `src/routes/lib/serializers.ts` — appended `AdminStaffSummary` interface + `serializeAdminStaffSummary`, both carrying `name` alongside `email` (E1). Declared locally, matching the `AdminBranch`/`AdminReward` convention.
- `src/routes/admin/staff.ts` (NEW) — `GET /` (staff roster, left-joined to `branches` for the branch name, `WHERE role IN STAFF_ROLES`, no pagination) + `PATCH /:id/branch` (set/clear). Both DB selects include `name` (E1). Guard order per the locked spec.
- `src/routes/admin/index.ts` — appended `adminRouter.use('/staff', staffRouter)` (12th consumer of the append-only aggregator). Nothing else touched.
- `src/routes/admin/__tests__/admin-staff.integration.test.ts` (NEW) — 13 tests covering AC1–AC7, mirroring `admin-rewards.integration.test.ts`'s hermetic `makeUser(role)` self-seeding fixture.

Frontend (`apps/admin`):
- `src/features/staff/lib/admin-staff-api.ts` (NEW) — `listStaff`, `patchStaffBranch`, `postStaffRole`; `AdminStaffMember` includes `name` (E1). `postStaffRole` hits `${apiUrl}/api/admin/users/:id/role` via a distinct `USERS_API` const (never nested under `/staff`).
- `src/features/staff/hooks/use-admin-staff.ts` (NEW) — `useAdminStaff`, `useAssignStaffBranch`, `useChangeStaffRole` (list query + 2 invalidating mutations).
- `src/features/staff/components/staff-list.tsx` (+ `.test.tsx`, NEW) — presentational `DataTable`; Name/email first column (E1), role `<select>` (super_admin only) or read-only `StatusBadge`, branch `<select>` (active branches only). 6 component tests.
- `src/routes/(dashboard)/staff.tsx` + `staff.index.tsx` (NEW) — thin `<Outlet/>` layout + list screen wiring hooks + `useAdminAuth` super_admin gate.
- `src/config/nav-config.ts` — repurposed the disabled `users` entry → `label: 'Staff'`, `to: '/staff'`, `disabled` dropped (D2).

## What Was Skipped or Deferred

- AC8 (Agent-Probe admin-dashboard UI walkthrough) — owed by the user, standing project-wide no-E2E-runner residual (same class as Phase 5/6). Plan stays in `active/` until performed.

## Test Gate Outcomes

| Gate command | Result |
|---|---|
| `pnpm --filter @jojopotato/api test` | PASS — 679 passed / 679 (45 files); +13 new `admin-staff.integration.test.ts` |
| `pnpm --filter @jojopotato/api typecheck` | PASS — 0 errors |
| `pnpm --filter @jojopotato/admin test` | PASS — 169 passed / 169 (22 files); +6 new `staff-list.test.tsx` |
| `pnpm --filter @jojopotato/admin typecheck` | PASS — 0 errors |
| `pnpm --filter @jojopotato/admin build` | PASS — route tree regenerated, `staff.index` bundled |
| `pnpm format:check` | PASS — all files clean |

All AC1–AC7 (Fully-Automated) are proven green by an independent run in this session. AC8 (Agent-Probe) is owed.

## Plan Deviations

**D-1 (within-blast-radius): added a uuid-format 404 guard to `PATCH /api/admin/staff/:id/branch`.**
- The plan's Backend Implementation §1 note claimed "Malformed `:id` (non-uuid) falls through the `eq()` lookup and naturally 404s (same precedent as `branches.ts`) — no separate uuid-format guard needed." The validate-contract Security-surface finding echoed this as "empirically confirmed."
- Empirically FALSE for this route: `users.id` is a `uuid` PK column, so `eq(users.id, 'not-a-uuid')` makes Postgres throw `22P02 invalid input syntax for type uuid`, caught by `handleAdminError` as an unexpected error → **500, not 404**. (My added malformed-id test caught this on the first API run.)
- The `rewards.ts` precedent the plan cited actually **has** an explicit `uuidSchema.safeParse(...) → 404` guard for exactly this — so the "no guard needed" claim contradicted its own cited precedent.
- Fix: added `const uuidSchema = z.uuid();` + a `safeParse` 404 check placed at the target-resolution step (after Zod body validation, before the DB lookup), preserving the locked guard order (Zod body 400 → target 404 → customer 400 → null short-circuit → branch active 400 → write). This realizes the plan's own stated 404 intent and matches the codebase precedent.
- Scope/risk: new `staff.ts` file only; strict correctness improvement (404 instead of unhandled 500); no schema/auth/API-contract/billing change; the Public Contract already specifies 404 for a not-found target. Not hard-stop class. Surfaced here per interactive-EXECUTE deviation handling.

**D-2 (additive test coverage, no behavior change):** the integration test adds 3 cases beyond the plan's explicit test table — 404 for a non-existent target user, 404 for a malformed `:id`, and 400 for an invalid body shape. Each proves a guard step the plan's own guard order defines. No production behavior deviates.

## Test Infra Gaps Found

None new. `apps/admin` still has no browser/E2E runner (standing project-wide gap) — hence AC8 is Agent-Probe. `packages/api` vitest requires the local Postgres (native instance on :5432 here, per `tests/all-tests.md`).

## E2 — Locked Decision D4 (carried verbatim, per Execute-Agent Instruction E2)

> **D4** (VALIDATE-confirmed): the role `<select>` in `staff-list.tsx` intentionally offers only `staff`/`admin`/`super_admin` — NOT `customer` — even though the underlying `POST /api/admin/users/:id/role` route technically accepts a `customer` target. This is a deliberate UX-scope narrowing, not a defect: demoting a staff member out of the staff-level roles entirely (i.e. "remove them from being staff") is a distinct workflow this dedicated Staff screen does not own — once demoted, the user disappears from `GET /api/admin/staff`'s own result set anyway (it filters `role IN STAFF_ROLES`), so exposing a "demote to customer" control on a screen that would then immediately make that row vanish is a confusing UX shape. That action remains reachable only via direct API call today; a general Users screen (ADM-010, already out-of-scope per the SPEC) is the natural future home for it.

**AC8 walkthrough note (E2):** when the user performs the AC8 manual walkthrough, the ABSENCE of a `customer` option in the super_admin role `<select>` is EXPECTED behavior (D4), not a bug to report. `staff-list.test.tsx` asserts the option list is exactly `['staff','admin','super_admin']` and never contains `customer`.

## Constraint Compliance

- `packages/api/src/routes/admin/users.ts` — UNMODIFIED (confirmed; reused via `postStaffRole` → `/api/admin/users/:id/role`).
- No new server-side role/permission check added — the client `role === 'super_admin'` gate is cosmetic; the server's existing inline 403 + self-escalation 400 (users.ts) are the real boundary (D3).
- No schema/migration change.
- Role `<select>` offers only staff/admin/super_admin (D4) — test-asserted.
- PATCH guard order followed (with the uuid-404 guard folded into the target-resolution step; see D-1).
- E1 honored: `name` added to both DB selects, `AdminStaffSummary`, `AdminStaffMember`, `serializeAdminStaffSummary`, and the list's first column.
- E2 honored: D4 rationale carried verbatim above.

## Closeout Packet

- Selected plan path: `process/features/admin-dashboard/active/adm-009-staff-management_21-07-26/adm-009-staff-management_PLAN_21-07-26.md`
- Finished: all 12 code checklist items; all AC1–AC7 Fully-Automated gates green (independently re-run this session).
- Verified vs unverified: AC1–AC7 verified (automated). AC8 (UI walkthrough) UNVERIFIED — owed, user-run.
- Cleanup/context remaining: UPDATE PROCESS reconciliation (context doc + plan status stamp) after AC8, and the commit (owed by the user — not committed by this pass).
- Best next state: **Keep in `active/`** (CODE DONE, AC8 walkthrough owed). Not yet archivable.

## Forward Preview

### Test Infra Found
- `apps/admin` jsdom vitest renders components but cannot exercise real browser click-through / network — AC8 stays Agent-Probe.
- `packages/api` vitest needs the local Postgres (native :5432 here).

### Blast Radius Changes
- New `/api/admin/staff` route family (GET list + PATCH branch). New `apps/admin` `features/staff/**` + 2 `(dashboard)/staff*` routes. `nav-config.ts` `users`→Staff entry now enabled.

### Commands to Stay Green
- `pnpm --filter @jojopotato/api test && pnpm --filter @jojopotato/api typecheck`
- `pnpm --filter @jojopotato/admin test && pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin build`
- `pnpm format:check`

### Dependency Changes
- None. No new dependency, runtime surface, or auth mechanism (reuses the existing `requireAdmin` guard + `users.ts` role route unmodified).
