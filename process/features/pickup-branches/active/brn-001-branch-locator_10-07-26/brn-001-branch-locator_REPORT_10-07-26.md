---
phase: brn-001-branch-locator
date: 2026-07-10
status: COMPLETE_WITH_GAPS
feature: pickup-branches
plan: process/features/pickup-branches/active/brn-001-branch-locator_10-07-26/brn-001-branch-locator_PLAN_10-07-26.md
---

# BRN-001 Branch Locator — EXECUTE Report

## What Was Done

All 27 checklist steps implemented as code. Both Fully-Automated gates (typecheck, lint) green
across all 5 packages. DB-runtime verification steps are environment-BLOCKED (see below).

### Phase 1 — DB + API
- `packages/api/src/db/schema/branches.ts` — added `priority: integer('priority').notNull().default(0)`.
- `packages/api/src/db/seed/data.ts` — added `priority: number` to `SeedBranch`; set poblacion=1, it-park=2, mabolo=3.
- `packages/api/src/index.ts` — added `GET /api/branches` (active-only filter, `orderBy(asc(priority))`, 500 try/catch); imports `db`, `branches`, `eq`, `asc`.
- `packages/api/drizzle/0002_powerful_earthquake.sql` — generated. **Inspected SQL (verbatim):**
  `ALTER TABLE "branches" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;` — single additive
  column, no table drop/recreate. Safe. (`meta/_journal.json` + `0002_snapshot.json` also generated.)
- `packages/api/src/__tests__/branches-route.test.ts` — NEW. Integration test of the exact route
  query (active-filter + priority order + priority-field presence). Skips its body gracefully when
  the DB is unreachable so the `pnpm --filter @jojopotato/api test` command stays runnable without
  Postgres. HTTP-layer/supertest coverage is the contract's `api-http` Known-Gap.

### Phase 2 — Shared packages
- `packages/utils/src/geo.ts` — NEW `distanceKm` (haversine, R=6371).
- `packages/utils/src/hours.ts` — NEW `getIsOpenNow` (UTC+8 default, `'00:00'` close = 24:00, invalid-JSON→false, missing-day→false, includes the TODO per-branch-tz comment).
- `packages/utils/src/index.ts` — export geo + hours.
- `packages/types/src/pickup.ts` — replaced 6-field interface with full 12-field `PickupBranch` (removed `isOpen`, added slug/phone/openingHours/isActive/isAcceptingPickup/estimatedPrepMinutes/priority + optional distanceKm).
- `packages/ui/src/components/branch-list-item.tsx` — NEW `BranchListItem` (props contract exact; theme-token-only; uses `Button`; no getIsOpenNow/distanceKm import).
- `packages/ui/src/index.ts` — export `BranchListItem`.
- All `isOpen` consumers fixed (steps 15/15b/15c): `branch-card.tsx`, `branch-selector.tsx` (+`isOpen` prop); mock objects in `mock-home.ts`, `component-showcase.tsx`, `mocks.ts` (removed `isOpen`, added required fields); call sites in `(tabs)/index.tsx`, `component-showcase.tsx`, `branch-card.test.tsx` (pass `isOpen`).

### Phase 3 — Mobile screen
- `expo-location ~57.0.2` installed via `npx expo install` (SDK-57-pinned).
- `app.json` — added `expo-location` plugin (`locationWhenInUsePermission`) + iOS `NSLocationWhenInUseUsageDescription`.
- `apps/mobile/src/lib/api-fetch.ts` — NEW `apiFetch<T>`.
- `apps/mobile/src/hooks/use-user-location.ts` (native) + `.web.ts` (web) — NEW.
- `apps/mobile/src/features/branches/hooks/use-selected-branch.ts` — NEW context/provider.
- `apps/mobile/src/app/_layout.tsx` — wired `SelectedBranchProvider` inside `AuthProvider`, wrapping `RootNavigator`.
- `apps/mobile/src/app/(tabs)/branches/index.tsx` — full replacement: fetch+map(ApiBranch→PickupBranch, parseFloat lat/lng), getIsOpenNow per row, distance-sort (granted) / priority-sort (denied), name search, FlatList of BranchListItem, loading/empty/error states, CTA sets selectedBranch + router.push to `[branchId]`. Removed ComingSoon + dev link.
- `expo start` run once → `.expo/types/router.d.ts` regenerated before typecheck.

## What Was Skipped or Deferred

- **db:migrate / db:seed / curl smoke (Steps 4, 5, 8-manual)** — environment-BLOCKED. `docker compose up -d` cannot publish port 5432; it is held by another project's container (`veent_wifiportal-db-1`, confirmed via `docker ps` + `ss -ltnp`). Recreating this project's DB fails with `Bind for 0.0.0.0:5432 failed: port is already allocated`; `db:migrate` fails `password authentication failed for user "jojo"` against the squatting Postgres. Per EXECUTE instructions, migration/test results were NOT fabricated. Resolution requires the operator to free port 5432 (`docker stop veent_wifiportal-db-1`) then `docker compose down && docker compose up -d && pnpm --filter @jojopotato/api db:migrate && db:seed`. The migration file is generated and ready.
- **utils unit tests (Step 13)** — Known-Gap per validate-contract (`utils-unit`, gap-resolution D). packages/utils has no runner. Backlog note `brn-001-utils-unit-tests_NOTE_10-07-26.md` to be created at UPDATE PROCESS.
- **HTTP-layer API test (`api-http`)** — Known-Gap per contract. Backlog note `brn-001-api-route-supertest_NOTE_10-07-26.md` at UPDATE PROCESS.
- **AC-1..AC-10 manual verification** — Hybrid; require running API+DB and/or a dev build on iOS/Android/web. Not runnable in this headless env. Deferred to manual QA.

## Test Gate Outcomes

- `pnpm typecheck` → **exit 0** (5 packages, PRIMARY gate — AC-11a). Green.
- `pnpm lint` → **exit 0** (AC-12a). Only the 3 pre-existing `dev-with-tunnel.mjs` warnings (0 errors) — exact documented baseline. No new errors. Green. (Two new lint problems I introduced in `use-user-location.web.ts` — `set-state-in-effect` error + unused-import warning — were fixed to green before this result.)
- `pnpm --filter @jojopotato/api test` → **exit 1**, BUT solely from the 5 pre-existing `auth.integration.test.ts` failures caused by the BLOCKED DB precondition (`password authentication failed for user "jojo"`). My additions are healthy: `smoke.test.ts` (16) pass, new `branches-route.test.ts` (1) passes (skipped body, DB down). Test files went 21→22 tests, "1 failed | 2 passed" files. This is a Hybrid gate whose precondition is environment-BLOCKED — matches the validate-contract's recorded DB-down baseline exactly. NOT caused by this change.
- `git diff --check` → exit 0 (no conflict markers).

## Plan Deviations (all within-blast-radius, documented)

1. `packages/ui/src/components/__tests__/branch-card.test.tsx` — added `isOpen` prop to the `<BranchCard>` render. Not in the plan's explicit list but a same-package in-kind fix mandated by the required `isOpen` prop; typecheck fails otherwise.
2. Mock objects (`mock-home.ts`, `component-showcase.tsx`, `mocks.ts`) — plan said "remove `isOpen`"; I also ADDED the now-required extended `PickupBranch` fields. Removing `isOpen` alone leaves objects missing required fields → typecheck fail. Required for the PRIMARY gate.
3. `expo-location` version `~57.0.2` (SDK-pinned by `npx expo install`), not the plan's guessed `~18.x`. Plan explicitly directed using `npx expo install` for the correct version.
4. `use-user-location.web.ts` — wrapped setState in `Promise.resolve().then()` (+ mounted guards) to satisfy the `react-hooks/set-state-in-effect` lint rule. The plan's literal snippet would have failed the lint gate the plan mandates.

None touch auth/billing/schema-beyond-plan/API-contract/container/secrets. No hard-stop-class deviation.

Note: `eas.json` (root) appears as staged-added in git status but pre-existed this session in the index and was NOT created/modified by this work — left untouched (outside blast radius).

## Test Infra Gaps Found

- `packages/utils` has no test runner — `distanceKm`/`getIsOpenNow` are pure and trivially Vitest-testable; adding Vitest (mirroring `packages/api`) would close `utils-unit`.
- `packages/api` route testing uses live-DB integration; the new route test follows that pattern but skips when DB is down. A supertest HTTP-layer test (`api-http`) needs `supertest` added as a dev dep.
- No RN test runner — `branches/index.tsx` sort/filter/mapping logic is manual-verify only.
- Local Postgres port-conflict (port 5432 squatted by another project) blocks the Hybrid DB gate in this environment.

## Closeout Packet

- **Selected plan:** `process/features/pickup-branches/active/brn-001-branch-locator_10-07-26/brn-001-branch-locator_PLAN_10-07-26.md`
- **Finished:** all code for Phases 1–3; both Fully-Automated gates green; migration file generated + inspected.
- **Verified:** typecheck (exit 0), lint (exit 0, baseline only), branch-route test authored + green (DB-skip).
- **Still unverified:** db:migrate/seed application, `curl /api/branches`, AC-1..AC-10 manual (all need live DB / running API / dev build — environment-BLOCKED here).
- **Cleanup/context remaining:** create the two Known-Gap backlog notes; apply migration+seed once port 5432 is free; run manual AC verification.
- **Classification:** **Keep in active/testing** — code-complete and statically green, but DB-runtime application and manual AC verification are still pending (environment-BLOCKED). Not yet ready for UPDATE PROCESS archival.
- **Best next state:** operator frees port 5432 → `docker compose down && up -d` → `db:migrate` → `db:seed` → `curl /api/branches` → dev-build manual AC pass → then UPDATE PROCESS.

## Forward Preview

### Test Infra Found
Vitest live in `packages/api` (DB-precondition gate). No runner in utils/ui/mobile. New `branches-route.test.ts` uses a DB-skip guard so the api `test` script stays runnable without Postgres.

### Blast Radius Changes
Confirmed: packages/api (schema+route+migration+test), packages/types (breaking type), packages/utils (2 pure fns), packages/ui (BranchListItem + BranchCard prop), apps/mobile (screen, 3 hooks, api-fetch, context, layout, app.json, package.json). Additional in-kind consumers touched beyond the plan's explicit list: `branch-card.test.tsx`, `(tabs)/index.tsx` call site (both within packages the plan named).

### Commands to Stay Green
`pnpm typecheck` and `pnpm lint` (both exit 0 now). `pnpm --filter @jojopotato/api test` needs Postgres up + migrated + seeded to fully pass (auth integration tests are the DB-gated portion).

### Dependency Changes
Added `expo-location ~57.0.2` to `apps/mobile`. `pnpm-lock.yaml` updated. No other new deps.
