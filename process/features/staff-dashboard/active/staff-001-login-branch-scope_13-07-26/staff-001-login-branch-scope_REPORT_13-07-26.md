---
phase: staff-001-login-branch-scope
date: 2026-07-13
status: COMPLETE_WITH_GAPS
feature: staff-dashboard
plan: process/features/staff-dashboard/active/staff-001-login-branch-scope_13-07-26/staff-001-login-branch-scope_PLAN_13-07-26.md
---

# STAFF-001 EXECUTE Report

## What Was Done

All checklist phases A–G implemented except F3e (manual dev verification — Agent-Probe, deferred to operator).

- **Phase A** — `users.assignedBranchId` nullable FK added; migration `0002_elite_bishop.sql` generated + applied; column verified in Postgres.
- **Phase B** — `packages/api/src/lib/require-staff.ts` (requireStaff middleware, resolveBranchScope, assertBranchScope + TODO(STAFF-ADM) seam); `packages/api/src/routes/staff.ts` canary `GET /api/staff/me`; mounted at `app.use('/api/staff', requireStaff(auth), staffRouter)`; `app` exported.
- **Phase C** — `packages/types/src/staff.ts` (StaffRole, StaffBranch, StaffMe) + index export.
- **Phase D** — staff seed user `staff-branch1@jojopotato.local` via `auth.api.signUpEmail` + role/branch update; verified role=staff, has_branch=t.
- **Phase E** — `require-staff.integration.test.ts` (E2–E7 + extras, supertest E0 added); full api suite 34/34 green incl. auth regression (E8).
- **Phase F** — `isStaff` on `useAuth()`; `(staff)/_layout.tsx`; `features/staff/lib/staff-api.ts` + `features/staff/hooks/use-staff-me.ts`; designed `(staff)/index.tsx` shell (BrandWordmark+Staff badge, branch name from /api/staff/me, 4 inert nav cards, sign-out); role-aware root gate (three Stack.Protected).
- **Phase G** — Expo typed-routes codegen ran ((staff) in router.d.ts); mobile/types/api typecheck clean; lint clean.

## What Was Skipped or Deferred

- **F3e / F3d manual dev verification** — Agent-Probe (no RN test runner). Requires operator to sign in as staff on device and confirm shell. Deferred per Phase Completion Rule 5. Backlog: `mobile-e2e-navigation-harness_NOTE_09-07-26.md`.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| API suite (34 tests) | `pnpm --filter @jojopotato/api test` (docker + db:migrate) | PASS (34/34) |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | PASS |
| Types typecheck | `pnpm --filter @jojopotato/types typecheck` | PASS |
| Mobile typecheck | `pnpm --filter @jojopotato/mobile typecheck` (post-codegen) | PASS |
| Lint | `pnpm lint` | PASS (0 errors; 3 pre-existing unrelated warnings) |
| Mobile role-gate/hook/shell | Agent-Probe (manual) | DEFERRED (known-gap) |

## Plan Deviations (all within-blast-radius, documented)

1. `app.listen` guarded behind `NODE_ENV!=='test' && VITEST!=='true'` so supertest imports of `app` (E6/E7) don't bind port 3000. Necessary for the plan's route tests.
2. Explicit `Express` / `Router` type annotations on exported `app` / `staffRouter` (TS2883 once exported).
3. Added `@jojopotato/types` as a `packages/api` dependency (required by plan B1/P5; was not previously a dependency).

## Test Infra Gaps Found

- No RN test runner (existing gap) — mobile isStaff derivation, useStaffMe hook, and shell render are not automatically tested. Same backlog note as plan.

## Closeout Packet

- Selected plan: `.../staff-001-login-branch-scope_PLAN_13-07-26.md`
- Finished: all server + mobile code, tests, types, migration, seed, risk pack.
- Verified: all automated + hybrid gates green; risk pack valid (5/5, exit 0).
- Unverified: mobile Agent-Probe (operator device confirmation).
- Remaining: operator manual confirmation → then VERIFIED; UPDATE PROCESS archival; broader source commit (only migration SQL committed so far, on branch `feat/staff-001-login-branch-scope`).
- Best next state: Keep in active/testing (mobile Agent-Probe pending) → then UPDATE PROCESS.

## Risk Evidence Pack

5/5 artifacts valid at `harness/` — `validate-risk-artifacts.mjs` exit 0. riskClass "auth or identity", riskLevel high, mustStopBeforeFinalize true, decision approved.

## Follow-up Stubs Created

- None new. Known-gaps map to existing backlog notes: `mobile-e2e-navigation-harness_NOTE_09-07-26.md`, `wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`.

## Forward Preview

### Test Infra Found
Vitest + supertest now cover route-level staff authz in `packages/api`. RN runner still absent.

### Blast Radius Changes
`packages/api` (schema, lib, routes, index, seed, package.json), `packages/types`, `apps/mobile` (auth hook, root layout, new (staff) group + features/staff).

### Commands to Stay Green
`docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` before `pnpm --filter @jojopotato/api test`.

### Dependency Changes
Added `@jojopotato/types` (dep), `supertest` + `@types/supertest` (devDeps) to `packages/api`.
