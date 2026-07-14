---
phase: brn-002-branch-details
date: 2026-07-10
status: COMPLETE_WITH_GAPS
feature: pickup-branches
plan: process/features/pickup-branches/active/brn-002-branch-details_10-07-26/brn-002-branch-details_PLAN_10-07-26.md
---

# BRN-002 Branch Details — EXECUTE Report

## What Was Done

All 18 automated/code steps of the 19-step checklist implemented. Step 19 (manual dev-build AC
verification) deferred — Hybrid gate, no mobile runner (Known-Gap).

**Phase 1 — API (`packages/api`)**
- `src/index.ts`: merged drizzle imports (`and, asc, eq, gte, lte, notExists, sql` — single `eq`, E1); added `dealBranches, deals` schema imports; added `computeDiscountLabel()` helper (all 6 enum values); added `GET /api/branches/:id` route placed BEFORE `app.listen()` (E2), grouped after `GET /api/branches`. Route: branch lookup → 404 if absent → Query A (explicit deal_branches) + Query B (global via `notExists`) in `Promise.all` → merge+dedupe by id → map `discountLabel` → 200 `{ branch, deals }`; try/catch → 500.
- `src/__tests__/branch-detail-route.test.ts` (NEW): 4 cases, skip-when-DB-down guard.

**Phase 2 — Utils (`packages/utils`)**
- `src/hours.ts`: added `formatOpeningHours(json): string[]` (Mon-first grouping; `'00:00'`→`'12:00 AM'` per E3; invalid JSON → `['Hours unavailable']`; single closed day → bare `'Closed'`).
- `src/maps.ts` (NEW): `buildDirectionsUrl(lat, lng, name, platform)` — ios/android/web.
- `src/index.ts`: `export * from './maps'`.

**Phase 3 — Types/UI/Extraction**
- `packages/types/src/deals.ts`: no-op (already had `discountLabel` + `validUntil`).
- `packages/ui/src/components/deal-card.tsx`: added optional `validUntil?: string` prop + caption row + style. Backward-compatible.
- `apps/mobile/src/features/branches/api.ts` (NEW): extracted `ApiBranch` + `mapApiBranch` verbatim; added `ApiBranchDeal`, `mapApiBranchDeal`, `BranchDetailResponse`.
- `apps/mobile/src/app/(tabs)/branches/index.tsx`: removed inline `ApiBranch`/`mapApiBranch`, added import. `PickupBranch` import retained (still used by state). Behavior identical.

**Phase 4 — Screen**
- `apps/mobile/src/app/(tabs)/branches/[branchId].tsx`: rebuilt from placeholder. Uses `{ coords, status: locationStatus }` (E4) and `useTheme()` + named tokens (E5 — `Colors` IS exported from `@/constants/theme` but app convention is `useTheme()`, matching BRN-001). Loading / error+back / success states; name/address/phone/distance/open badge/prep/pickup-status/hours/directions/deals/CTA. CTA `disabled={!canOrder}` (open && isAcceptingPickup); onPress → `setSelectedBranch` + `router.push('/(tabs)/order')`.

## What Was Skipped or Deferred

- Step 19 manual AC verification (AC-1 through AC-8) — requires live iOS sim/device dev build; no automated mobile runner exists (project-wide Known-Gap `mobile-unit`).

## Test Gate Outcomes

- `pnpm typecheck` → **exit 0** (5 packages: api, types, utils, ui, mobile). PRIMARY gate green.
- `pnpm lint` → **6 tasks successful, 0 errors**. Only 3 pre-existing WARNINGS in `scripts/dev-with-tunnel.mjs` (untouched). Excluded `floating-tab-bar.tsx:151` untouched.
- `pnpm --filter @jojopotato/api test` → **26/26 passed** (4 files). New `branch-detail-route.test.ts`: 4/4 pass (it-park→5, poblacion→4, exclusive absent from poblacion, branch fields incl. `is_accepting_pickup === false`).
- Codegen: `expo start` run+stopped; `[branchId]` present in `.expo/types/router.d.ts`.

**deal_type → discountLabel mapping implemented:**
| deal_type | value | label |
|---|---|---|
| percentage_discount | "20"/null | "20% off" / "Deal" |
| fixed_discount | "50"/null | "₱50 off" / "Deal" |
| buy_one_take_one | any | "Buy 1 Get 1" |
| free_item | any | "Free Item" |
| free_upgrade | any | "Free Upgrade" |
| bundle | "199"/null | "Bundle ₱199" / "Bundle" |
| (default) | — | "Deal" |

**Global-deals SQL:** Query A = `innerJoin(dealBranches)` on `branch_id = id`; Query B = `notExists(subquery selecting 1 from dealBranches where deal_id = deals.id)` — identifies deals with NO deal_branches rows at all. Both `and(is_active, lte(start_at, now), gte(end_at, now))`. Merged/deduped by id via Map.

## Plan Deviations

1. **`packages/utils/src/hours.ts`** — added `?? 'mon'` / `?? 'sun'` / `?? 'Closed'` fallbacks on loop index accesses in `formatOpeningHours`. Reason: `noUncheckedIndexedAccess` flags array-index as possibly `undefined`; loop-bounded indices are runtime-safe so fallbacks are unreachable, but required for typecheck. Impact: none — output verified identical to plan's expected strings. Within-blast-radius; no contract change.

## Test Infra Gaps Found

- No mobile test runner (Known-Gap `mobile-unit`) — manual AC verification is the only screen-level gate. Tracked in `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.
- HTTP layer of `GET /api/branches/:id` not tested via supertest (Known-Gap `api-http`) — Drizzle query logic tested directly. Consistent with BRN-001.
- `formatOpeningHours` / `buildDirectionsUrl` pure functions — unit tests deferred until a utils runner is introduced.

## Closeout Packet

- **Selected plan:** brn-002-branch-details_PLAN_10-07-26.md
- **Finished:** All code across Phases 1–4; all 3 automated gates (Phase 5 steps 15–18).
- **Verified:** typecheck 0, lint 0-errors, api test 26/26, codegen route present.
- **Unverified:** manual dev-build ACs (AC-1..AC-8) — Hybrid, needs sim/device.
- **Cleanup remaining:** UPDATE PROCESS archival + context capture; commit (on user request).
- **Best next state:** Keep in active/testing — code-complete + automated gates green; manual Hybrid AC verification pending before archival.

## Forward Preview

### Test Infra Found
No new runner. api vitest + typecheck + lint are the automated surface; mobile screen gates remain manual.

### Blast Radius Changes
`packages/api` (new route + test), `packages/utils` (hours + maps), `packages/ui` (DealCard prop), `apps/mobile` (new screen + api.ts + 1 import refactor). No schema/auth/billing change.

### Commands to Stay Green
`pnpm typecheck` · `pnpm lint` · `pnpm --filter @jojopotato/api test` (Postgres up on 5432). Run `expo start` once after adding new route files before typecheck.

### Dependency Changes
None. No new packages. BRN-004 (Directions) absorbed via `buildDirectionsUrl` — close it after ship.
