---
phase: brn-001-branch-locator-db-runtime
date: 2026-07-10
status: COMPLETE
feature: pickup-branches
plan: process/features/pickup-branches/active/brn-001-branch-locator_10-07-26/brn-001-branch-locator_PLAN_10-07-26.md
---

# BRN-001 EXECUTE Supplement — DB-Runtime Steps Closeout

**TL;DR:** The environment-BLOCKED live-DB steps (Phase 1 Steps 4/5/8) are now GREEN. An authorized
clean-slate reset fixed the drizzle journal drift; all 3 migrations applied + journaled, seed landed
3 branches with correct priorities, and the `GET /api/branches` smoke test passed every step-5
criterion. No application source was re-edited. jojo Postgres left running; `veent_wifiportal-db-1`
remains stopped/untouched.

## What Was Done

1. **Clean-slate reset (authorized).** `docker compose down -v` removed this project's empty
   `jojo-mobile_jojopotato-db-data` volume (compose is scoped ONLY to `jojopotato-db` — jojo/jojo@jojopotato;
   `veent_wifiportal-db-1` is a separate project's container and was never referenced). `docker compose up -d`
   recreated a fresh empty volume. `docker compose ps` confirmed `0.0.0.0:5432->5432/tcp`. `pg_isready` green.
2. **Migrations (Step 3/4).** `pnpm --filter @jojopotato/api db:migrate` → "migrations applied successfully!"
   All 3 migrations (0000_puzzling_lightspeed, 0001_daily_carnage, 0002_powerful_earthquake) applied against
   the empty DB. Verified: `drizzle.__drizzle_migrations` now has 3 rows (was empty — the drift cause).
   `\d branches` confirms `priority | integer | not null | 0`.
3. **Seed (Step 4).** `pnpm --filter @jojopotato/api db:seed` → "branches: 3, categories: 6, products: 8,
   deals: 5". DB query confirms priorities: jojo-poblacion=1 (active), jojo-it-park=2 (active, pickup off),
   jojo-mabolo=3 (inactive). Priorities verified in `data.ts`, NOT duplicated.
4. **API smoke test (Step 5/8).** Route confirmed as `GET /api/branches` on port 3000 (`PORT ?? 3000`,
   from `packages/api/src/index.ts`). Started `pnpm --filter @jojopotato/api dev` in background
   ("jojopotato-api listening on port 3000"), curled the endpoint, then stopped the server (port 3000 free).

## Test Gate Outcomes

| Gate | Tier | Result |
|---|---|---|
| `db:migrate` — all 3 migrations apply + journal cleanly on empty DB | Hybrid (live-DB precondition) | PASS |
| `priority` column exists on `branches` (`\d branches`) | Hybrid | PASS — `integer NOT NULL DEFAULT 0` |
| `db:seed` — 3 branches with priorities 1/2/3 | Hybrid | PASS |
| `curl /api/branches` — only active branches, each has `priority` (AC-1, AC-4a) | Hybrid | PASS |

**Step-5 verification checklist (all PASS):**
- Only `is_active=true` branches returned → PASS: 2 branches (jojo-poblacion, jojo-it-park). jojo-mabolo (inactive) correctly ABSENT.
- Each has `priority` → PASS (1, 2).
- Each has `latitude`/`longitude` → PASS (strings "10.315700"/"123.891500" etc., per contract — mobile parseFloat converts).
- Each has `opening_hours` → PASS (JSON string).
- Each has `is_accepting_pickup` → PASS (poblacion true, it-park false).
- Each has `estimated_prep_minutes` → PASS (15, 20).
- Server order by priority asc → PASS (poblacion(1) before it-park(2)).

## What Was Skipped or Deferred

- Manual AC-1..AC-10 UI verification on a device/web dev build (this supplement pass covered only the
  DB-runtime + API-layer steps, per the handoff scope). AC-2/AC-3 (location-based sort) require a native
  dev build — NOT Expo Go — per the plan's VALIDATE NOTE.
- Two Known-Gap backlog notes (packages/utils unit-test infra; branches-route integration test infra) to
  be created at UPDATE PROCESS, per the first EXECUTE report.

## Plan Deviations

None. No application source re-edited. The only file changed was the plan's `## Resume and Execution
Handoff` section (status update — not code). The clean-slate reset was explicitly authorized by the user.

## Test Infra Gaps Found

None new. The pre-existing drizzle journal drift (empty `drizzle.__drizzle_migrations` vs on-disk
0000/0001) was resolved by the clean-slate reset rather than a hand-edited journal (per the STOP-if-genuine
instruction — this was an environment reset, not a forced journal edit).

## Closeout Packet

- **Selected plan:** `process/features/pickup-branches/active/brn-001-branch-locator_10-07-26/brn-001-branch-locator_PLAN_10-07-26.md`
- **What was finished:** all live-DB runtime steps (migrate + seed + API smoke), previously environment-BLOCKED.
- **Verified vs unverified:** DB + API layer fully verified with real command output. Mobile UI ACs (AC-1..AC-10)
  still unverified (manual dev-build verification pending).
- **Cleanup remaining:** manual UI verification; two Known-Gap backlog notes at UPDATE PROCESS.
- **Best next state:** Keep in active/testing. Not yet ready for archival — manual AC verification outstanding.

## Forward Preview

**Test Infra Found:** vitest configured in `packages/api` only. No runner in `packages/utils`, `packages/ui`,
`apps/mobile` (project-wide gap, tracked in `tests/all-tests.md`).

**Blast Radius Changes:** none this pass (no source edits). DB state: fresh volume, migrated + seeded.

**Commands to Stay Green:**
- Bring DB up: `docker compose up -d` (from repo root).
- Re-migrate: `pnpm --filter @jojopotato/api db:migrate`.
- Re-seed: `pnpm --filter @jojopotato/api db:seed`.
- API: `pnpm --filter @jojopotato/api dev` then `curl http://localhost:3000/api/branches`.

**Dependency Changes:** none.

## Environment Final State

- `jojo-mobile-jojopotato-db-1`: **Up**, `0.0.0.0:5432->5432/tcp` (left running per instruction).
- `veent_wifiportal-db-1`: **Exited (0)** — remains stopped, never touched this pass.
