---
name: plan:brn-001-branch-locator
description: "COMPLEX plan — Branch locator list view, distance sort, and branch selection (BRN-001)"
date: 10-07-26
feature: pickup-branches
phase: "brn-001"
---

# BRN-001: Branch Locator List View — Implementation Plan

**Date** 2026-07-10
**Status** PLANNED
**Complexity** COMPLEX (3 in-plan phases, 5 packages, schema migration)
**SPEC:** `brn-001-branch-locator_SPEC_10-07-26.md` (12 ACs)

---

## Overview

Build the Branches tab from a `<ComingSoon>` placeholder into a working branch locator list. Users
see all active branches, can search by name, see open/closed status, distance (if location granted),
and tap "Order from this branch" to select a branch and navigate to its detail screen. Three
sequential in-plan phases: DB + API, shared packages, then the mobile screen.

**TL;DR:** DB migration → Express route → utils (geo + hours) → types extension → UI list-item
component → mobile screen with location, search, sort, and CTA.

---

## Phase Completion Rules

A phase is CODE DONE when all checklist steps within it are complete and `pnpm typecheck` exits 0.
A phase is VERIFIED when all Verification Evidence gates for that phase are green (automated gates pass; hybrid gates pass manual review).

- **Phase 1 VERIFIED:** API returns correct data; migration applied cleanly; vitest suite passes.
- **Phase 2 VERIFIED:** typecheck passes across all 5 packages; BranchListItem renders correctly; BranchCard breaking change resolved.
- **Phase 3 VERIFIED:** all 12 ACs pass manual verification; typecheck + lint both exit 0.

A phase is never marked VERIFIED based on code-complete alone — runtime evidence or manual verification is required.

---

## Acceptance Criteria

Sourced from  (full text there). Summary:

| AC | Description | Strategy |
|---|---|---|
| AC-1 | Active branches appear; inactive do not | Hybrid |
| AC-2 | Distance sort when location granted | Hybrid |
| AC-3 | Priority sort when location denied; distance hidden | Hybrid |
| AC-4 | Priority field exists on branches (DB + API) | Hybrid |
| AC-5 | Open/closed status correct vs current time | Hybrid |
| AC-6 | Disabled CTA for closed or pickup-unavailable branches | Hybrid |
| AC-7 | Enabled CTA sets selected branch and navigates | Hybrid |
| AC-8 | Search filters by branch name | Hybrid |
| AC-9 | Branch row shows all required fields | Hybrid |
| AC-10 | Web renders without crash; distance degrades gracefully | Hybrid |
| AC-11 | TypeScript types compile cleanly (
> jojo-potato@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile
> turbo run typecheck


   • Packages in scope: @jojopotato/api, @jojopotato/config, @jojopotato/mobile, @jojopotato/types, @jojopotato/ui, @jojopotato/utils
   • Running typecheck in 6 packages
   • Remote caching disabled

@jojopotato/api:typecheck: cache miss, executing dd35913d1e1b0f5e
@jojopotato/utils:typecheck: cache miss, executing 0a02add9eba92785
@jojopotato/types:typecheck: cache miss, executing 53468af176cca155
@jojopotato/types:typecheck: 
@jojopotato/types:typecheck: > @jojopotato/types@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/types
@jojopotato/types:typecheck: > tsc --noEmit
@jojopotato/types:typecheck: 
@jojopotato/utils:typecheck: 
@jojopotato/utils:typecheck: > @jojopotato/utils@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/utils
@jojopotato/utils:typecheck: > tsc --noEmit
@jojopotato/utils:typecheck: 
@jojopotato/api:typecheck: 
@jojopotato/api:typecheck: > @jojopotato/api@0.0.1 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
@jojopotato/api:typecheck: > tsc --noEmit
@jojopotato/api:typecheck: 
@jojopotato/ui:typecheck: cache miss, executing caa3c8731d6334cd
@jojopotato/ui:typecheck: 
@jojopotato/ui:typecheck: > @jojopotato/ui@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/ui
@jojopotato/ui:typecheck: > tsc --noEmit
@jojopotato/ui:typecheck: 
@jojopotato/mobile:typecheck: cache miss, executing 9fbc0de58198468c
@jojopotato/mobile:typecheck: 
@jojopotato/mobile:typecheck: > @jojopotato/mobile@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile
@jojopotato/mobile:typecheck: > tsc --noEmit
@jojopotato/mobile:typecheck: 

 Tasks:    5 successful, 5 total
Cached:    0 cached, 5 total
  Time:    13.637s  exits 0) | Fully-Automated |
| AC-12 | ESLint passes (
> jojo-potato@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile
> turbo run lint


   • Packages in scope: @jojopotato/api, @jojopotato/config, @jojopotato/mobile, @jojopotato/types, @jojopotato/ui, @jojopotato/utils
   • Running lint in 6 packages
   • Remote caching disabled

@jojopotato/config:lint: cache miss, executing 1e2c4acfc38fc49d
@jojopotato/config:lint: 
@jojopotato/config:lint: > @jojopotato/config@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/config
@jojopotato/config:lint: > eslint .
@jojopotato/config:lint: 
@jojopotato/utils:lint: cache miss, executing 5ce011af47ed463b
@jojopotato/api:lint: cache miss, executing 81b8a42f0da1c0c0
@jojopotato/types:lint: cache miss, executing 1de1112c17a355c3
@jojopotato/utils:lint: 
@jojopotato/utils:lint: > @jojopotato/utils@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/utils
@jojopotato/utils:lint: > eslint .
@jojopotato/utils:lint: 
@jojopotato/api:lint: 
@jojopotato/api:lint: > @jojopotato/api@0.0.1 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
@jojopotato/api:lint: > eslint .
@jojopotato/api:lint: 
@jojopotato/types:lint: 
@jojopotato/types:lint: > @jojopotato/types@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/types
@jojopotato/types:lint: > eslint .
@jojopotato/types:lint: 
@jojopotato/api:lint: (node:33480) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api/eslint.config.js?mtime=1783567159965 is not specified and it doesn't parse as CommonJS.
@jojopotato/api:lint: Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
@jojopotato/api:lint: To eliminate this warning, add "type": "module" to /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api/package.json.
@jojopotato/api:lint: (Use `node --trace-warnings ...` to show where the warning was created)
@jojopotato/ui:lint: cache miss, executing 7fd7f7ab7a0a0ed3
@jojopotato/ui:lint: 
@jojopotato/ui:lint: > @jojopotato/ui@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/ui
@jojopotato/ui:lint: > eslint .
@jojopotato/ui:lint: 
@jojopotato/mobile:lint: cache miss, executing afb2dd41cb65274a
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: > @jojopotato/mobile@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile
@jojopotato/mobile:lint: > eslint .
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile/scripts/dev-with-tunnel.mjs
@jojopotato/mobile:lint:   29:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint:   63:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint:   69:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: ✖ 3 problems (0 errors, 3 warnings)
@jojopotato/mobile:lint:   0 errors and 3 warnings potentially fixable with the `--fix` option.
@jojopotato/mobile:lint: 

 Tasks:    6 successful, 6 total
Cached:    0 cached, 6 total
  Time:    16.163s  exits 0) | Fully-Automated |

---

## Out of Scope (Explicit)

- Map view (BRN-003)
- Directions deep-link (BRN-004)
- Branch Details screen content (BRN-002) — CTA lands on existing `[branchId]` placeholder
- Per-branch deals display
- Pickup scheduling / time-slot selection
- Order cart, payment, or checkout flow
- Admin branch management interface
- Real-time (WebSocket) branch status updates

---

## Goals

1. Add `priority` column to the branches schema, generate + apply the Drizzle migration, and update seed data.
2. Expose `GET /api/branches` returning all active branches with all required fields.
3. Add `distanceKm` (haversine) and `getIsOpenNow` (hours parser) utilities in `packages/utils`.
4. Extend `PickupBranch` type in `packages/types` to cover all API response fields plus client-computed `distanceKm`.
5. Build `BranchListItem` presentational component in `packages/ui`.
6. Replace the placeholder `branches/index.tsx` with a fully functional branch locator screen.
7. Pass `pnpm typecheck` (zero errors) and `pnpm lint` (zero errors). Baseline: `pnpm lint` currently exits 0 with 3 warnings in `dev-with-tunnel.mjs` (not errors). No pre-existing lint errors exist — do not introduce new ones.

---

## Touchpoints

### Files Changed

| File | Change type |
|---|---|
| `packages/api/src/db/schema/branches.ts` | Add `priority integer NOT NULL DEFAULT 0` column |
| `packages/api/src/db/seed/data.ts` | Add `priority` field to `SeedBranch` type + set values for all 3 seeded branches |
| `packages/api/src/db/seed/seed.ts` | No logic change — picks up new field automatically via spread; verify no type error |
| `packages/api/src/index.ts` | Add `GET /api/branches` route |
| `packages/api/src/db/schema/__tests__/smoke.test.ts` | Add `branches` table `priority` column export check (already exported but add a row-shape assertion) |
| `packages/api/drizzle/` | Generated migration SQL file (created by `db:generate`, committed after inspection) |
| `packages/types/src/pickup.ts` | Replace current `PickupBranch` interface with extended version |
| `packages/utils/src/geo.ts` | New — haversine `distanceKm` function |
| `packages/utils/src/hours.ts` | New — `getIsOpenNow` opening-hours parser |
| `packages/utils/src/index.ts` | Export both new modules |
| `packages/ui/src/components/branch-list-item.tsx` | New — full-row presentational branch card |
| `packages/ui/src/index.ts` | Export `BranchListItem` |
| `apps/mobile/src/lib/api-fetch.ts` | New — thin `apiFetch<T>` wrapper |
| `apps/mobile/src/hooks/use-user-location.ts` | New — native hook (expo-location) |
| `apps/mobile/src/hooks/use-user-location.web.ts` | New — web hook (navigator.geolocation) |
| `apps/mobile/src/features/branches/hooks/use-selected-branch.ts` | New — `SelectedBranchProvider` + `useSelectedBranch()` context |
| `apps/mobile/src/app/(tabs)/branches/index.tsx` | Replace placeholder with branch locator screen |
| `apps/mobile/src/app/_layout.tsx` | Wire `SelectedBranchProvider` around the tab tree |
| `apps/mobile/app.json` | Add `expo-location` plugin + iOS/Android permission declarations |
| `apps/mobile/package.json` | Add `expo-location` dependency |
| `apps/mobile/src/features/home/components/branch-selector.tsx` | Add `isOpen: boolean` prop (VALIDATE-added: unlisted consumer of `branch.isOpen`) |
| `apps/mobile/src/features/home/mock-home.ts` | Remove `isOpen` property from `MOCK_BRANCH` literal (VALIDATE-added: excess property after type change) |
| `apps/mobile/src/app/component-showcase.tsx` | Remove `isOpen` from `SAMPLE_BRANCH` and `SAMPLE_BRANCH_CLOSED` literals (VALIDATE-added: excess property after type change) |
| `packages/ui/src/components/__tests__/mocks.ts` | Remove `isOpen` from `MOCK_BRANCH` literal (VALIDATE-added: excess property after type change) |

### Files Read (not changed)

- `apps/mobile/src/app/(tabs)/_layout.ios.tsx` — confirms per-platform `Tabs` pattern; `SelectedBranchProvider` wired in root `_layout.tsx`, not here
- `apps/mobile/src/app/(tabs)/branches/_layout.tsx` — confirms `branches/[branchId]` route already declared
- `apps/mobile/src/features/auth/hooks/use-auth.ts` — pattern reference for the Context/Provider shape
- `apps/mobile/src/config/env.ts` — confirms `env.apiUrl` is the fetch base
- `packages/ui/src/components/branch-card.tsx` — confirmed insufficient; do NOT modify

---

## Public Contracts

### `GET /api/branches`

No authentication required (public endpoint, same style as the existing `GET /`).

**Request:** `GET /api/branches` — no query parameters.

**Response (200 OK):**
```json
{
  "branches": [
    {
      "id": "uuid",
      "name": "string",
      "slug": "string",
      "address": "string",
      "latitude": "string (numeric 9,6 — mobile converts to number)",
      "longitude": "string (numeric 9,6 — mobile converts to number)",
      "phone": "string",
      "opening_hours": "string (JSON-encoded per-day object)",
      "is_active": true,
      "is_accepting_pickup": true,
      "estimated_prep_minutes": 15,
      "priority": 0
    }
  ]
}
```

Filter: only rows where `is_active = true` are returned. `is_active: false` rows never appear.

**Response (500):** `{ "error": "Failed to fetch branches" }` — on DB query failure.

Note on `latitude`/`longitude`: Drizzle returns `numeric` columns as strings from `pg-core`. The
mobile mapping layer converts them to `number` via `parseFloat`. Do not change the API response to
parse them server-side — keep parity with the rest of the schema.

### `PickupBranch` type (packages/types/src/pickup.ts)

```typescript
export interface PickupBranch {
  id: string;
  name: string;
  slug: string;
  address: string;
  latitude: number;      // converted from API string by mobile mapping layer
  longitude: number;     // converted from API string by mobile mapping layer
  phone: string;
  openingHours: string;  // raw JSON string from API — parsed by getIsOpenNow
  isActive: boolean;
  isAcceptingPickup: boolean;
  estimatedPrepMinutes: number;
  priority: number;
  // Client-computed, optional — populated only when location status is 'granted'
  distanceKm?: number;
}
```

Note: `isOpen` (the old field) is **removed**. It was a client-computed boolean derived from
opening hours. Callers (BranchCard) that use `branch.isOpen` must compute it via `getIsOpenNow`
instead. `BranchCard` currently uses `branch.isOpen` — this is a BREAKING CHANGE to the type.
EXECUTE must update `BranchCard` to accept a pre-computed `isOpen: boolean` prop or compute it
inline (see checklist step 15 in Phase 2).

### `distanceKm` (packages/utils/src/geo.ts)

```typescript
export function distanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number
```

Pure function, no side effects. Uses the haversine formula with Earth radius 6371 km.

### `getIsOpenNow` (packages/utils/src/hours.ts)

```typescript
export function getIsOpenNow(
  openingHours: string,    // JSON string: { mon: {open:'09:00', close:'21:00'}, ... }
  now?: Date,              // defaults to new Date() — injectable for testing
  tzOffsetHours?: number   // defaults to 8 (UTC+8, Cebu) — TODO: replace with per-branch tz
): boolean
```

Pure function. Parses the opening_hours JSON, maps the current weekday (0=Sun→'sun'…6=Sat→'sat'),
compares local time (adjusted by tzOffsetHours from UTC) against `open` and `close` HH:MM strings.
A `close` of `'00:00'` is treated as midnight end-of-day (23:59:59), NOT as a same-day midnight
open time. Day keys must be lowercase 3-letter abbreviations (`mon`, `tue`, `wed`, `thu`, `fri`,
`sat`, `sun`). If a day key is missing from the JSON, the function returns `false` (closed).

### `BranchListItem` component (packages/ui/src/components/branch-list-item.tsx)

```typescript
export interface BranchListItemProps {
  branch: PickupBranch;
  isOpen: boolean;       // pre-computed by caller via getIsOpenNow
  showDistance: boolean; // true only when location status === 'granted'
  isEnabled: boolean;    // isOpen && branch.isAcceptingPickup
  onOrderPress?: () => void;
  mode?: ThemeMode;      // defaults to 'light'
}
```

The component is purely presentational. It does NOT call `getIsOpenNow` itself — the caller
(branches/index.tsx) pre-computes `isOpen` and passes it. This keeps the component testable and
stateless.

### `useSelectedBranch` context (apps/mobile)

```typescript
interface SelectedBranchContextValue {
  selectedBranchId: string | null;
  setSelectedBranch: (id: string | null) => void;
}
```

`SelectedBranchProvider` wraps `createElement(Context.Provider, { value }, children)` — same
pattern as `AuthProvider` in `use-auth.ts`. Value is memoized via `useMemo`.

### `apiFetch<T>` (apps/mobile/src/lib/api-fetch.ts)

```typescript
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>
```

Prepends `env.apiUrl` to `path`. Throws `Error` if `!res.ok` (message: `HTTP ${res.status}`).
Returns `res.json()` cast to `T`. No retry, no interceptors, no auth header — minimal.

---

## Blast Radius

| Package | Risk class | Change surface |
|---|---|---|
| `packages/api` | MEDIUM — schema migration + new route | `branches.ts` schema, migration file, `index.ts` route, `data.ts` seed |
| `packages/types` | LOW — type extension (BREAKING: removes `isOpen`) | `pickup.ts` |
| `packages/utils` | LOW — pure new functions | `geo.ts`, `hours.ts`, `index.ts` |
| `packages/ui` | LOW — new component only | `branch-list-item.tsx`, `index.ts` |
| `apps/mobile` | MEDIUM — new files + replaces screen + new dep | `branches/index.tsx`, 3 new hook files, `api-fetch.ts`, root `_layout.tsx`, `app.json`, `package.json` |

**Total files modified or created: ~20.** No auth, billing, payment, or secret surface is touched.

**Migration rollback note:** The `priority` column has `DEFAULT 0 NOT NULL`. Rolling back requires
running `ALTER TABLE branches DROP COLUMN priority;` against the dev DB manually (Drizzle does not
auto-generate rollback SQL). The migration SQL file should be inspected before applying. If rollback
is needed: `DROP COLUMN priority`, delete the migration file from `drizzle/`, remove the column
from `branches.ts`, and re-run `db:generate`.

**PickupBranch breaking change:** Removing `isOpen` from the interface causes TypeScript errors in multiple consumers. EXECUTE must fix ALL of the following as part of Phase 2:
- `packages/ui/src/components/branch-card.tsx` — reads `branch.isOpen` (step 15: add `isOpen` prop)
- `apps/mobile/src/features/home/components/branch-selector.tsx` — reads `branch.isOpen` (step 15b: add `isOpen` prop)
- `apps/mobile/src/features/home/mock-home.ts` — sets `isOpen: true` in `MOCK_BRANCH` (step 15c: remove field)
- `apps/mobile/src/app/component-showcase.tsx` — sets `isOpen: true/false` in sample data (step 15c: remove field)
- `packages/ui/src/components/__tests__/mocks.ts` — sets `isOpen: true` in `MOCK_BRANCH` (step 15c: remove field)

---

## Dependencies

- `expo-location` must be added to `apps/mobile/package.json` (`pnpm --filter @jojopotato/mobile add expo-location`). Check the current Expo SDK 57 compatible version; `expo-location` ~18.x is the expected range for SDK 57. Confirm with `npx expo install expo-location` (which picks the correct pinned version for the SDK).
- `expo-location` config plugin must be added to `app.json` → `plugins` array.
- iOS permission: add to `app.json` → `expo.ios.infoPlist`: `"NSLocationWhenInUseUsageDescription": "Jojo Potato uses your location to show you the nearest branches."`.
- Android permission: `expo-location` plugin auto-adds `ACCESS_FINE_LOCATION` to `AndroidManifest.xml` when declared in the plugin config. Use `["expo-location", { "locationAlwaysAndWhenInUsePermission": "..." }]` plugin syntax only if a custom permission string is needed; otherwise the bare `"expo-location"` string in the plugins array suffices for `requestForegroundPermissionsAsync`.

---

## Implementation Checklist

See per-phase sections below for atomic steps.

---

## Phase 1: DB + API

### Goal

Migrate the schema, update seed data, add the API route.

### Checklist

**Step 1 — Add `priority` column to Drizzle schema**

File: `packages/api/src/db/schema/branches.ts`

Add after `estimated_prep_minutes`:
```
priority: integer('priority').notNull().default(0),
```

Full nullability policy: `NOT NULL DEFAULT 0`. An existing branch without an explicit priority
value gets 0 (lowest priority, appears last in priority-sort). This is intentional — when new
branches are added to the DB without specifying priority, they fall to the bottom of the list,
not to the top where they could confuse users.

**Step 2 — Update `SeedBranch` type in data.ts**

File: `packages/api/src/db/seed/data.ts`

Add `priority: number` to the `SeedBranch` type. Assign distinct values to the 3 branches so
the priority-sort order is observable in testing:

- `jojo-poblacion`: `priority: 1` (appears first when location denied)
- `jojo-it-park`: `priority: 2` (appears second — even though pickup is off, still visible)
- `jojo-mabolo`: `priority: 3` (inactive — never shown, but seed value must be valid)

Rationale: `jojo-mabolo` has `is_active: false` so it will never appear in the API response, but
the seed row must still be valid (priority field is NOT NULL). Using 3 keeps the seed data honest.

**Step 3 — Generate Drizzle migration**

Command: `pnpm --filter @jojopotato/api db:generate`

This produces a new SQL file in `packages/api/drizzle/`. **INSPECT the generated SQL before
applying.** Expected SQL: `ALTER TABLE "branches" ADD COLUMN "priority" integer NOT NULL DEFAULT 0;`
plus an updated snapshot. If the generated SQL differs significantly (e.g. drops and recreates
the table), do NOT apply — investigate and regenerate.

**Step 4 — Apply migration**

Command: `pnpm --filter @jojopotato/api db:migrate`

Prerequisite: local Postgres running via `docker compose up -d`. Confirm the migration applies
cleanly (no errors). The `priority` column should now exist on the `branches` table.

**Step 5 — Re-run seed to populate priority values**

Command: `pnpm --filter @jojopotato/api db:seed` (or the equivalent script name — confirm in
`packages/api/package.json`). The seed uses `onConflictDoUpdate`, so it is safe to re-run and
will update the existing branch rows with the new `priority` values.

**Step 6 — Add `GET /api/branches` route in `packages/api/src/index.ts`**

Add after the existing routes but before `app.listen`. The route uses the Drizzle `db` client
imported from `./db/client` (same pattern as the auth handler) and the `branches` table from
`./db/schema/index`.

Route logic:
1. `const rows = await db.select().from(branches).where(eq(branches.is_active, true)).orderBy(asc(branches.priority));`
2. On success: `res.json({ branches: rows });`
3. On DB error (try/catch): `res.status(500).json({ error: 'Failed to fetch branches' });`

Required imports to add:
- `import { db } from './db/client';`
- `import { branches } from './db/schema/index';`
- `import { eq, asc } from 'drizzle-orm';`

The server-side sort by priority is applied for consistency but the mobile client re-sorts by
distance when location is granted. Server ordering is the fallback for clients that don't sort.

**Step 7 — Add vitest assertion for `GET /api/branches`**

File: `packages/api/src/db/schema/__tests__/smoke.test.ts`

The existing smoke test is a pure schema-export check (no DB connection required, no `docker
compose` needed). Add a vitest test in a **new file** to avoid mixing concerns:

File: `packages/api/src/__tests__/branches-route.test.ts`

This test requires a live DB (same as `auth.integration.test.ts`). Skip it if the DB connection
is not available (use a `try/catch` or `beforeAll` skip pattern matching the existing integration
test file). The test should:
1. Make a real HTTP request to the running server (or call the route handler directly with a
   mock Express request/response — prefer the lighter mock approach if the existing integration
   tests use it; otherwise HTTP against a test port).
2. Assert the response includes only `is_active: true` branches.
3. Assert every branch object in the response has a `priority` field (integer).

If the existing `auth.integration.test.ts` uses supertest or a similar HTTP-layer approach,
mirror that pattern exactly. If no supertest/HTTP layer exists, add a narrower unit-level test
that calls the route handler function directly with mock `req`/`res`. If neither approach fits
cleanly within the phase scope, mark this as **Known gap** and document it in the Test Infra
Improvement Notes section — do not force a new test infra pattern in this checklist step.

**Step 8 — Verify Phase 1 gates**

- `pnpm --filter @jojopotato/api test` — must exit 0 (vitest suite green, including new branch route test or skip with known-gap noted)
- `pnpm typecheck` — must exit 0 on all packages (including `packages/api`)
- Manual API smoke: `curl http://localhost:3000/api/branches` (with API server running) — confirm response contains `jojo-poblacion` and `jojo-it-park` but NOT `jojo-mabolo`, and that all objects include `priority`.

---

## Phase 2: Shared Packages

### Goal

Add geo/hours utilities to `packages/utils`, extend `PickupBranch` type, and build the
`BranchListItem` UI component.

### Checklist

**Step 9 — Create `packages/utils/src/geo.ts`**

```typescript
/**
 * Haversine formula — straight-line distance between two lat/lon points.
 * Returns distance in kilometres.
 */
export function distanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

Pure function. No imports. Exported from `packages/utils/src/index.ts`.

**Step 10 — Create `packages/utils/src/hours.ts`**

Full signature and semantics documented in Public Contracts above.

Implementation notes:
- Day key map: `[0,'sun', 1,'mon', 2,'tue', 3,'wed', 4,'thu', 5,'fri', 6,'sat']`
- To get Cebu local time: `const localMs = now.getTime() + tzOffsetHours * 3600 * 1000; const local = new Date(localMs);`
- Then use `local.getUTCHours()` and `local.getUTCMinutes()` (NOT `getHours()`/`getMinutes()` which would apply the runtime's local timezone on top of the manual offset — double-offset bug).
- A `close` of `'00:00'` is treated as end-of-day: when close is `'00:00'`, set close minutes to `24 * 60` (1440) so the comparison `currentMinutes < closeMinutes` passes for any time through 23:59.
- Return `false` if `openingHours` is invalid JSON (try/catch the `JSON.parse`).
- TODO comment: `// TODO(BRN-xxx): replace tzOffsetHours default with per-branch timezone field once the schema adds one`

Exported from `packages/utils/src/index.ts`.

**Step 11 — Export new utils from `packages/utils/src/index.ts`**

Add:
```typescript
export * from './geo';
export * from './hours';
```

**Step 12 — Extend `PickupBranch` in `packages/types/src/pickup.ts`**

Replace the existing 6-field interface with the full definition from Public Contracts (above).
Remove `isOpen` — this is intentional. See "PickupBranch breaking change" in Blast Radius.

**Step 13 — Add vitest unit tests for geo and hours (known-gap path)**

`packages/utils` does NOT currently have a test runner (see `all-tests.md`). A Vitest config
could be added (same approach as `packages/api` — it has a `vitest.config.ts`), but that
introduces a new test infrastructure decision outside this plan's scope.

Decision: **Mark as known-gap.** Add a backlog note. Manual verification is the fallback for
this phase (step 14 below). If the team adds Vitest to `packages/utils` in a follow-up, the
two functions are pure and trivially testable:
- `distanceKm(10.3157, 123.8915, 10.3305, 123.9058)` → approximately 2.0 km
- `getIsOpenNow('{"mon":{"open":"09:00","close":"21:00"}}', new Date('2024-01-08T12:00:00Z'), 8)` → `true` (12:00 UTC = 20:00 Cebu, Mon → within 09-21)

**Step 14 — Build `packages/ui/src/components/branch-list-item.tsx`**

Props interface defined in Public Contracts above. Component requirements:
- Full-width row card (not a compact chip — this is distinct from `BranchCard`).
- Renders: name (`FontFamily.body.bold`), address (`FontFamily.body.regular`), distance text
  `"X.X km"` (hidden when `showDistance` is false — render `null` or `undefined`, not an empty
  string or placeholder), open/closed badge (green or muted), pickup availability text, prep time
  text `"~N min"`, and the "Order from this branch" CTA button.
- Use `Button` from `@jojopotato/ui` for the CTA — it already supports `disabled` prop.
- When `!isEnabled`: `Button` receives `disabled={true}`, styled with `opacity: 0.4` or the
  Button's built-in disabled style. `onPress` is NOT wired when disabled (pass `undefined`).
- Use only `theme.ts` tokens for colors, spacing, radii, typography — no hardcoded values.
- `mode` prop (default `'light'`) is passed through to `Colors[mode]`.
- The component must NOT import `getIsOpenNow` or `distanceKm` — the parent computes these.
- Export as named export `BranchListItem` and `BranchListItemProps`.

**Step 15 — Fix `BranchCard` for `isOpen` removal**

File: `packages/ui/src/components/branch-card.tsx`

`BranchCard` currently reads `branch.isOpen` (line 54: `branch.isOpen ? 'Open' : 'Closed'`).
After removing `isOpen` from `PickupBranch`, this will fail typecheck. Fix: add an `isOpen`
prop to `BranchCardProps` and pass it from the parent instead of deriving from `branch`.

```typescript
export interface BranchCardProps {
  branch: PickupBranch;
  isOpen: boolean;       // ADD: was derived from branch.isOpen, now passed explicitly
  onPress?: () => void;
  mode?: ThemeMode;
}
```

Update the `BranchCard` function signature to accept `isOpen` as a prop and use it wherever
`branch.isOpen` was previously used. No changes to the visual rendering logic.

**Note:** `BranchCard` IS currently used on the Home tab (`apps/mobile/src/app/(tabs)/index.tsx` line 44: `<BranchCard branch={MOCK_BRANCH} />`). After adding the required `isOpen` prop to `BranchCardProps`, the call site must also be updated — but since `MOCK_BRANCH` will no longer have `isOpen` on its type (step 15c removes it from the literal), the call site can pass `isOpen={false}` as a static prop for now (the Home tab uses mock data, not live branch data).

**Step 15b — Fix `branch-selector.tsx` for `isOpen` removal (VALIDATE-added)**

File: `apps/mobile/src/features/home/components/branch-selector.tsx`

`BranchSelector` is a near-identical component to `BranchCard` that also reads `branch.isOpen` at lines 52 and 56. Apply the same fix: add `isOpen: boolean` to `BranchSelectorProps` and replace all `branch.isOpen` reads with the prop.

```typescript
export interface BranchSelectorProps {
  branch: PickupBranch;
  isOpen: boolean;       // ADD: was derived from branch.isOpen, now passed explicitly
  onPress?: () => void;
}
```

Update the `BranchSelector` function signature and replace `branch.isOpen` in the JSX with `isOpen`. No visual changes.

Find the caller of `BranchSelector` in `HomeScreen` (if any — it uses `MOCK_BRANCH` which currently has `isOpen: true`) and update the call site to pass `isOpen={false}` as a static value (mock data, no real open/closed logic on the Home tab yet).

**Step 15c — Remove `isOpen` from mock data objects (VALIDATE-added)**

After removing `isOpen` from `PickupBranch`, the following files have literal objects with the now-removed field — TypeScript will error on excess properties in strict mode:

1. `apps/mobile/src/features/home/mock-home.ts` line 95 — remove `isOpen: true` from `MOCK_BRANCH`
2. `apps/mobile/src/app/component-showcase.tsx` lines 83, 92 — remove `isOpen: true` from `SAMPLE_BRANCH` and `isOpen: false` from `SAMPLE_BRANCH_CLOSED`
3. `packages/ui/src/components/__tests__/mocks.ts` line 36 — remove `isOpen: true` from `MOCK_BRANCH`

After removing `isOpen` from these objects: update any call site that passes the mock directly to `BranchCard` or `BranchSelector` to provide the now-required `isOpen` prop explicitly (use `isOpen={false}` as a safe static default for mock/showcase contexts).

**Step 16 — Export `BranchListItem` from `packages/ui/src/index.ts`**

Add `export * from './components/branch-list-item';` to `packages/ui/src/index.ts`.

**Step 17 — Verify Phase 2 gates**

- `pnpm typecheck` — must exit 0 across all packages (the `BranchCard` fix in step 15 must resolve the `isOpen` type error)
- `pnpm lint` — must exit 0
- Manual spot-check: import `distanceKm` in a scratch context and compute a known Cebu distance pair (see step 13 values above); confirm result is plausible (~2 km for Poblacion → IT Park).

---

## Phase 3: Mobile Screen

### Goal

Wire `expo-location`, add the selected-branch context, build `apiFetch`, and replace the
placeholder screen with the full branch locator.

### Checklist

**VALIDATE NOTE — expo-location requires a dev build:**

Manual verification of AC-2 (distance sort when location granted) and AC-3 (priority sort when denied) requires `requestForegroundPermissionsAsync`, which is a native module NOT available in Expo Go. Use a dev build: `pnpm --filter @jojopotato/mobile ios` or `pnpm --filter @jojopotato/mobile android` (ensure a dev build is installed on the simulator/device). Do not attempt to verify location-based behaviour in Expo Go.

**Step 18 — Add `expo-location` dependency**

Command: `npx expo install expo-location` run from `apps/mobile/` (or `pnpm --filter @jojopotato/mobile add expo-location@~18.x` — use `npx expo install` to get the SDK-pinned version).

Confirm `expo-location` appears in `apps/mobile/package.json` → `dependencies` after this step.

**Step 19 — Declare location permission in `apps/mobile/app.json`**

Add to `expo.plugins` array:
```json
["expo-location", {
  "locationWhenInUsePermission": "Jojo Potato uses your location to show you the nearest branches."
}]
```

Add to `expo.ios.infoPlist`:
```json
"NSLocationWhenInUseUsageDescription": "Jojo Potato uses your location to show you the nearest branches."
```

Android `ACCESS_FINE_LOCATION` is automatically added to `AndroidManifest.xml` by the
`expo-location` config plugin when using EAS Build or `expo prebuild`. No manual `AndroidManifest`
edit is required for managed workflow.

**Step 20 — Create `apps/mobile/src/lib/api-fetch.ts`**

Full signature defined in Public Contracts above. Keep it under 20 lines.

```typescript
import { env } from '@/config/env';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
```

**Step 21 — Create `apps/mobile/src/hooks/use-user-location.ts` (native)**

Uses `expo-location`:

```typescript
// apps/mobile/src/hooks/use-user-location.ts
// Native (iOS + Android) — metro resolves this over the .web.ts sibling on native targets.
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type LocationStatus = 'loading' | 'granted' | 'denied';

export interface UserLocation {
  coords: { latitude: number; longitude: number } | null;
  status: LocationStatus;
}

export function useUserLocation(): UserLocation {
  const [state, setState] = useState<UserLocation>({ coords: null, status: 'loading' });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!mounted) return;
      if (status !== 'granted') {
        setState({ coords: null, status: 'denied' });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!mounted) return;
      setState({ coords: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }, status: 'granted' });
    })();
    return () => { mounted = false; };
  }, []);

  return state;
}
```

**Step 22 — Create `apps/mobile/src/hooks/use-user-location.web.ts` (web)**

Uses `navigator.geolocation`:

```typescript
// apps/mobile/src/hooks/use-user-location.web.ts
// Web — metro resolves this over the non-suffixed file on web targets.
import { useEffect, useState } from 'react';
import type { UserLocation, LocationStatus } from './use-user-location';

export { type UserLocation, type LocationStatus };

export function useUserLocation(): UserLocation {
  const [state, setState] = useState<UserLocation>({ coords: null, status: 'loading' });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ coords: null, status: 'denied' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude }, status: 'granted' }),
      () => setState({ coords: null, status: 'denied' }),
    );
  }, []);

  return state;
}
```

Note on type re-export: the web sibling re-exports `UserLocation` and `LocationStatus` from the
native file using a `type`-only import. This avoids duplicating the interface and ensures the
two hooks are structurally identical. Confirm `isolatedModules`-compatible re-export syntax (use
`export type { ... } from ...`).

**Step 23 — Create `apps/mobile/src/features/branches/hooks/use-selected-branch.ts`**

Mirror the `AuthProvider` / `useAuth` pattern from `apps/mobile/src/features/auth/hooks/use-auth.ts`:

```typescript
import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';

interface SelectedBranchContextValue {
  selectedBranchId: string | null;
  setSelectedBranch: (id: string | null) => void;
}

const SelectedBranchContext = createContext<SelectedBranchContextValue | null>(null);

export function SelectedBranchProvider({ children }: { children: ReactNode }) {
  const [selectedBranchId, setSelectedBranch] = useState<string | null>(null);
  const value = useMemo(() => ({ selectedBranchId, setSelectedBranch }), [selectedBranchId]);
  return createElement(SelectedBranchContext.Provider, { value }, children);
}

export function useSelectedBranch(): SelectedBranchContextValue {
  const ctx = useContext(SelectedBranchContext);
  if (!ctx) throw new Error('useSelectedBranch must be used within a SelectedBranchProvider');
  return ctx;
}
```

**Step 24 — Wire `SelectedBranchProvider` into the root layout**

File: `apps/mobile/src/app/_layout.tsx`

The root layout already wraps the tree in `AuthProvider`. Add `SelectedBranchProvider` as a
sibling wrapper:

```tsx
// Before: <AuthProvider><Stack ...>...</Stack></AuthProvider>
// After:  <AuthProvider><SelectedBranchProvider><Stack ...>...</Stack></SelectedBranchProvider></AuthProvider>
```

Check the exact current shape of `_layout.tsx` before editing (read it first). The
`SelectedBranchProvider` must wrap `<Stack>` (the router tree) but can be inside or outside
`AuthProvider` — inside is fine since auth and branch selection are independent.

Do NOT wire into `(tabs)/_layout.ios.tsx`, `_layout.android.tsx`, or `_layout.web.tsx`. Those
files manage Tabs rendering, not app-level state. The root `_layout.tsx` is the correct location.

**Step 25 — Replace `apps/mobile/src/app/(tabs)/branches/index.tsx`**

Full replacement of the placeholder. The new screen:

1. Calls `useUserLocation()` for `{ coords, status }`.
2. Calls `apiFetch<{ branches: ApiBranch[] }>('/api/branches')` in a `useEffect` (or `useState` + `useEffect`) pattern. Define a local `ApiBranch` type that matches the API response shape (snake_case, `latitude`/`longitude` as strings).
3. Maps `ApiBranch[]` → `PickupBranch[]`: converts `latitude`/`longitude` to `number` via `parseFloat`, converts snake_case fields to camelCase per the type definition.
4. Calls `getIsOpenNow(branch.openingHours)` for each branch to compute `isOpen`.
5. Sorts branches:
   - `status === 'granted'`: compute `distanceKm(coords.latitude, coords.longitude, branch.latitude, branch.longitude)` for each; sort ascending by `distanceKm`; populate `branch.distanceKm`. Set `showDistance = true`.
   - `status !== 'granted'` (loading or denied): sort ascending by `branch.priority`. Set `showDistance = false`.
6. Applies search filter: case-insensitive `branch.name.toLowerCase().includes(query.toLowerCase())` against the sorted array. Search state is a `useState<string>('')`.
7. Renders:
   - A `TextInput` search bar at the top (styled with theme tokens, `placeholder="Search branches..."`)
   - A `FlatList` (or `ScrollView` with mapped items — prefer `FlatList` for performance) of `BranchListItem` for each filtered branch.
   - Each `BranchListItem` receives: `branch`, `isOpen` (pre-computed), `showDistance`, `isEnabled = isOpen && branch.isAcceptingPickup`, `onOrderPress`.
   - `onOrderPress`: calls `setSelectedBranch(branch.id)` then `router.push({ pathname: '/(tabs)/branches/[branchId]', params: { branchId: branch.id } })`.
8. Loading state: show a loading indicator (use `ActivityIndicator` from `react-native`) while `apiFetch` is in flight OR while `locationStatus === 'loading'`.
9. Empty state: show a text message ("No branches match your search") when the filtered list is empty.
10. Error state: show an error message ("Could not load branches — please try again") if the fetch throws.
11. Remove the `<ComingSoon>` import and the "Dev: View Branch bgc-1" dev link entirely.

**Step 26 — Run expo start to refresh typed-routes codegen**

After any new route file additions or changes to `app.json` (adding a plugin), run:
`pnpm --filter @jojopotato/mobile start` (then `Ctrl+C` after Metro starts).

This triggers Expo Router's `typedRoutes` codegen to refresh `.expo/types/router.d.ts`. Run this
BEFORE running `pnpm typecheck`, or `tsc --noEmit` may report stale typed-route errors.

Note: No new dynamic route files are added in this phase (the `[branchId]` route already exists in
`apps/mobile/src/app/(tabs)/branches/_layout.tsx`). But `app.json` changes (adding `expo-location`
plugin) can occasionally trigger codegen drift. Running start is a safe precaution.

**Step 27 — Verify Phase 3 gates**

- `pnpm typecheck` — must exit 0 (all 5 packages: api, types, ui, utils, mobile)
- `pnpm lint` — must exit 0. Note: `apps/mobile/src/components/floating-tab-bar.tsx` at line 151
  has a **pre-existing** `@typescript-eslint/no-unsafe-member-access` lint error that is NOT
  caused by this change. Confirm that the lint output shows no NEW errors beyond that pre-existing
  one. If `pnpm lint` exits non-zero solely due to that known error, document it in the phase
  report and flag for the VALIDATE gate review.
- Manual verification checklist (see Verification Evidence section below).

---

## Rollback Plan

**If the migration causes issues:**
1. `ALTER TABLE branches DROP COLUMN priority;` — run manually against the dev DB.
2. Delete the generated migration file from `packages/api/drizzle/`.
3. Remove the `priority` column definition from `packages/api/src/db/schema/branches.ts`.
4. Remove `priority` from `SeedBranch` type and `seedBranches` array in `data.ts`.
5. Run `pnpm --filter @jojopotato/api db:generate` to re-snapshot the schema without the column.

**If the `PickupBranch` type change breaks downstream consumers:**
Revert `packages/types/src/pickup.ts` to the original 6-field interface. Then revert
`BranchCard` in the same commit. Both are in `packages/types` and `packages/ui` — no DB
changes are involved.

**If `expo-location` install breaks the Expo build:**
Remove from `apps/mobile/package.json` and revert `app.json` plugin and permission additions.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm typecheck` exits 0 | Fully-Automated | AC-11 (TypeScript types compile cleanly) |
| `pnpm lint` exits 0 (baseline: 3 warnings in dev-with-tunnel.mjs, 0 errors — do not add new errors) | Fully-Automated | AC-12 (ESLint passes) |
| `pnpm --filter @jojopotato/api test` exits 0 (vitest, includes branch route test or known-gap) | Hybrid (precondition: `docker compose up -d` + `db:migrate`) | AC-4 (priority field exists in API response) |
| Manual: `curl /api/branches` returns jojo-poblacion and jojo-it-park, NOT jojo-mabolo; all objects have `priority` integer | Hybrid | AC-1 (active filter), AC-4 (priority field) |
| Manual iOS/Android: grant location → list is ordered closest-first; distance shown on each row | Hybrid | AC-2 (distance sort when location granted) |
| Manual iOS/Android: deny location → list ordered by priority (poblacion=1, it-park=2); no distance shown | Hybrid | AC-3 (priority sort when denied, distance hidden) |
| Manual: note opening hours for jojo-it-park (10:00–23:00); test at a time within that window → shows Open; test outside → shows Closed | Hybrid | AC-5 (open/closed status correct) |
| Manual: jojo-it-park CTA is disabled/greyed (is_accepting_pickup=false); tap does nothing — no navigation | Hybrid | AC-6 (disabled CTA for closed/unavailable) |
| Manual: tap jojo-poblacion CTA (active, within hours) → navigates to `/branches/[branchId]` without error; confirm `selectedBranchId` is set | Hybrid | AC-7 (enabled CTA navigates) |
| Manual: type "IT" in search → only jojo-it-park visible; type "xyz" → empty state shown; clear → full list | Hybrid | AC-8 (search filters) |
| Manual visual inspection: each row shows name, address, distance (or hidden), open/closed badge, pickup indicator, prep time, and CTA button | Hybrid | AC-9 (all required fields shown) |
| Manual web: open in browser with geolocation blocked → list renders, priority sort applied, no distance text; no crash | Hybrid | AC-10 (web renders without crash) |
| `BranchCard` renders correctly with explicit `isOpen` prop (manual spot-check on Home tab or component viewer) | Hybrid | AC-11 (type safety — BranchCard breaking change is resolved) |

**Test tier assignments (vc-test-coverage-plan):**

- **Fully-Automated:** `pnpm typecheck`, `pnpm lint`
- **Hybrid (precondition + manual outcome judgment):** `pnpm --filter @jojopotato/api test` (precondition: `docker compose up -d` + `db:migrate`); all 10 AC-1 through AC-10 manual checks. The precondition for AC-1/AC-4/route checks is: API server running + DB seeded. The precondition for AC-2/AC-3 is: dev-build on iOS/Android simulator or device (NOT Expo Go). The precondition for AC-10 is: `pnpm web` in a browser.
- **Agent-Probe:** none required for this plan.
- **Known-Gap:** unit tests for `distanceKm` and `getIsOpenNow` (packages/utils has no Vitest runner). Backlog note must be created at UPDATE PROCESS time: `brn-001-utils-unit-tests_NOTE_10-07-26.md` in `process/features/pickup-branches/backlog/`.

---

## Test Infra Improvement Notes

- `packages/utils` has no test runner. `distanceKm` and `getIsOpenNow` are pure functions that are trivially unit-testable with Vitest. Adding Vitest to `packages/utils` (following the same pattern as `packages/api`) would take ~30 minutes and would eliminate the known-gap above. Recommend as a follow-up before BRN-002.
- `packages/api` route testing: the existing `smoke.test.ts` is schema-export only (no DB). The `auth.integration.test.ts` uses a live DB. The new `GET /api/branches` route test should use the same live-DB integration pattern. If `supertest` is not already a dev dependency of `packages/api`, check whether it needs to be added or whether the test can call the route handler directly.
- No mobile-side (RN) test runner exists. `branches/index.tsx` logic (sort, filter, mapping) is untested beyond manual verification. A future `jest-expo` or Vitest + RN test renderer setup would allow unit testing the sort/filter logic. Flag for BRN-002 planning.
- Lint baseline confirmed by VALIDATE: `pnpm lint` exits 0 with 3 warnings in `apps/mobile/scripts/dev-with-tunnel.mjs` (not errors). No pre-existing errors exist. The previously-documented floating-tab-bar.tsx lint error does not appear in the current baseline — AC-12 is cleanly achievable without any pre-existing error workaround.

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/pickup-branches/active/brn-001-branch-locator_10-07-26/brn-001-branch-locator_PLAN_10-07-26.md`
2. **Last completed phase or step:** EXECUTE supplement run 10-07-26 (second pass) — the environment-BLOCKED DB-runtime steps are now DONE. Via an authorized clean-slate reset (`docker compose down -v` on this project's empty Postgres volume — zero data loss; `veent_wifiportal-db-1` left stopped, untouched): all 3 migrations (0000/0001/0002) applied cleanly and journaled (`drizzle.__drizzle_migrations` now has 3 rows), `priority integer NOT NULL DEFAULT 0` column confirmed on `branches`; `db:seed` populated 3 branches with priorities poblacion=1, it-park=2, mabolo=3; `curl /api/branches` smoke test PASSED all step-5 criteria (returns only the 2 active branches — poblacion, it-park — with priority + lat/lng + opening_hours + is_accepting_pickup + estimated_prep_minutes; inactive mabolo correctly absent). No application source re-edited this pass. First EXECUTE pass (all 27 code steps) remains typecheck + lint green across all 5 packages — see `brn-001-branch-locator_REPORT_10-07-26.md`. Remaining to close out: manual AC-1..AC-10 device/web verification on a dev build (expo-location AC-2/AC-3 need a native dev build, NOT Expo Go); then create the two Known-Gap backlog notes at UPDATE PROCESS. Classification: keep in active/testing (manual UI verification still pending).
3. **Validate-contract status:** written 10-07-26 (Gate: CONDITIONAL, 3 accepted concerns) — see `## Validate Contract` section
4. **Supporting context files loaded:**
   - `process/features/pickup-branches/active/brn-001-branch-locator_10-07-26/brn-001-branch-locator_SPEC_10-07-26.md`
   - `process/context/all-context.md`
   - `process/context/tests/all-tests.md`
   - Ground truth files: `packages/api/src/db/schema/branches.ts`, `packages/api/src/db/seed/data.ts`, `packages/api/src/index.ts`, `packages/types/src/pickup.ts`, `packages/ui/src/components/branch-card.tsx`, `packages/ui/src/index.ts`, `apps/mobile/src/app/(tabs)/branches/index.tsx`, `apps/mobile/src/features/auth/hooks/use-auth.ts`, `apps/mobile/src/config/env.ts`, `apps/mobile/app.json`, `apps/mobile/src/app/(tabs)/branches/_layout.tsx`
5. **Next step for a fresh agent:** Read this plan from the top, then begin at Step 1 (Phase 1). Confirm local Postgres is running before Step 4 (`db:migrate`). Execute phases in order: Phase 1 (Steps 1–8) → Phase 2 (Steps 9–17) → Phase 3 (Steps 18–27). Run `pnpm typecheck` after each phase, not only at the end. The `SelectedBranchProvider` wiring (Step 24) must be done before the screen (Step 25) or the `useSelectedBranch()` hook will throw at runtime. Read `apps/mobile/src/app/_layout.tsx` before editing it (Step 24).

---

## Validate Contract

Status: CONDITIONAL
Date: 10-07-26
date: 2026-07-10
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 3/7 signals — multi-package scope, schema/API surface, 5+ files. Sequential strategy recommended for execute (3-phase ordering dependency; no independent workstreams that benefit from parallel subagents).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-11a | TypeScript types compile cleanly across all 5 packages | Fully-Automated | 
> jojo-potato@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile
> turbo run typecheck


   • Packages in scope: @jojopotato/api, @jojopotato/config, @jojopotato/mobile, @jojopotato/types, @jojopotato/ui, @jojopotato/utils
   • Running typecheck in 6 packages
   • Remote caching disabled

@jojopotato/utils:typecheck: cache hit, replaying logs 0a02add9eba92785
@jojopotato/utils:typecheck: 
@jojopotato/utils:typecheck: > @jojopotato/utils@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/utils
@jojopotato/utils:typecheck: > tsc --noEmit
@jojopotato/utils:typecheck: 
@jojopotato/types:typecheck: cache hit, replaying logs 53468af176cca155
@jojopotato/types:typecheck: 
@jojopotato/types:typecheck: > @jojopotato/types@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/types
@jojopotato/types:typecheck: > tsc --noEmit
@jojopotato/types:typecheck: 
@jojopotato/api:typecheck: cache hit, replaying logs dd35913d1e1b0f5e
@jojopotato/api:typecheck: 
@jojopotato/api:typecheck: > @jojopotato/api@0.0.1 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
@jojopotato/api:typecheck: > tsc --noEmit
@jojopotato/api:typecheck: 
@jojopotato/ui:typecheck: cache hit, replaying logs caa3c8731d6334cd
@jojopotato/ui:typecheck: 
@jojopotato/ui:typecheck: > @jojopotato/ui@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/ui
@jojopotato/ui:typecheck: > tsc --noEmit
@jojopotato/ui:typecheck: 
@jojopotato/mobile:typecheck: cache hit, replaying logs 9fbc0de58198468c
@jojopotato/mobile:typecheck: 
@jojopotato/mobile:typecheck: > @jojopotato/mobile@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile
@jojopotato/mobile:typecheck: > tsc --noEmit
@jojopotato/mobile:typecheck: 

 Tasks:    5 successful, 5 total
Cached:    5 cached, 5 total
  Time:    20ms >>> FULL TURBO exits 0 | A |
| AC-12a | ESLint exits 0 (no new errors) | Fully-Automated | 
> jojo-potato@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile
> turbo run lint


   • Packages in scope: @jojopotato/api, @jojopotato/config, @jojopotato/mobile, @jojopotato/types, @jojopotato/ui, @jojopotato/utils
   • Running lint in 6 packages
   • Remote caching disabled

@jojopotato/config:lint: cache hit, replaying logs 1e2c4acfc38fc49d
@jojopotato/config:lint: 
@jojopotato/config:lint: > @jojopotato/config@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/config
@jojopotato/config:lint: > eslint .
@jojopotato/config:lint: 
@jojopotato/utils:lint: cache hit, replaying logs 5ce011af47ed463b
@jojopotato/utils:lint: 
@jojopotato/utils:lint: > @jojopotato/utils@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/utils
@jojopotato/utils:lint: > eslint .
@jojopotato/utils:lint: 
@jojopotato/api:lint: cache hit, replaying logs 81b8a42f0da1c0c0
@jojopotato/api:lint: 
@jojopotato/api:lint: > @jojopotato/api@0.0.1 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
@jojopotato/api:lint: > eslint .
@jojopotato/api:lint: 
@jojopotato/api:lint: (node:33480) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api/eslint.config.js?mtime=1783567159965 is not specified and it doesn't parse as CommonJS.
@jojopotato/api:lint: Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
@jojopotato/api:lint: To eliminate this warning, add "type": "module" to /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api/package.json.
@jojopotato/api:lint: (Use `node --trace-warnings ...` to show where the warning was created)
@jojopotato/types:lint: cache hit, replaying logs 1de1112c17a355c3
@jojopotato/types:lint: 
@jojopotato/types:lint: > @jojopotato/types@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/types
@jojopotato/types:lint: > eslint .
@jojopotato/types:lint: 
@jojopotato/ui:lint: cache hit, replaying logs 7fd7f7ab7a0a0ed3
@jojopotato/ui:lint: 
@jojopotato/ui:lint: > @jojopotato/ui@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/ui
@jojopotato/ui:lint: > eslint .
@jojopotato/ui:lint: 
@jojopotato/mobile:lint: cache hit, replaying logs afb2dd41cb65274a
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: > @jojopotato/mobile@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile
@jojopotato/mobile:lint: > eslint .
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile/scripts/dev-with-tunnel.mjs
@jojopotato/mobile:lint:   29:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint:   63:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint:   69:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: ✖ 3 problems (0 errors, 3 warnings)
@jojopotato/mobile:lint:   0 errors and 3 warnings potentially fixable with the `--fix` option.
@jojopotato/mobile:lint: 

 Tasks:    6 successful, 6 total
Cached:    6 cached, 6 total
  Time:    19ms >>> FULL TURBO exits 0 | A |
| AC-4a | GET /api/branches returns only active branches with priority field | Hybrid | 
> @jojopotato/api@0.0.1 test /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
> vitest run


 RUN  v3.2.7 /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api

 ✓ src/db/schema/__tests__/smoke.test.ts (16 tests) 7ms
 ❯ src/lib/__tests__/auth.integration.test.ts (5 tests | 5 failed) 1253ms
   × email/password > signs up a new user defaulting role=customer, email_verified=false, then signs in 56ms
     → Failed query: select "id", "name", "email", "email_verified", "phone_number", "phone_number_verified", "image", "birthday", "favorite_branch_id", "role", "created_at", "updated_at" from "users" where "users"."email" = $1
params: ep-piyp9032@example.com
   × email/password > never lets a client self-assign a privileged role (additionalFields input:false) 19ms
     → Failed query: select "id", "name", "email", "email_verified", "phone_number", "phone_number_verified", "image", "birthday", "favorite_branch_id", "role", "created_at", "updated_at" from "users" where "users"."email" = $1
params: role-5vzqczjw@example.com
   × phone OTP > sends a (stubbed/logged) OTP and verifies it, provisioning a session 17ms
     → Failed query: insert into "verification" ("id", "identifier", "value", "expires_at", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5) returning "id", "identifier", "value", "expires_at", "created_at", "updated_at"
params: +15550267315,530405:0,2026-07-10T03:23:20.163Z,2026-07-10T03:18:20.163Z,2026-07-10T03:18:20.163Z
   × magic link > issues a verification token and authenticates when it is verified 15ms
     → Failed query: insert into "verification" ("id", "identifier", "value", "expires_at", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5) returning "id", "identifier", "value", "expires_at", "created_at", "updated_at"
params: orWUEFMveiOOJKVBlkfpUZwsJNqnoXBB,{"email":"magic-q5imsj9f@example.com"},2026-07-10T03:23:20.181Z,2026-07-10T03:18:20.181Z,2026-07-10T03:18:20.181Z
   × google oauth (config-level wiring) > constructs a Google authorization redirect (no live round-trip) 13ms
     → Failed query: insert into "verification" ("id", "identifier", "value", "expires_at", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5) returning "id", "identifier", "value", "expires_at", "created_at", "updated_at"
params: Q_562swcEr89kZs0vyC82MaRYhsn3GoD,{"callbackURL":"jojopotato://","codeVerifier":"KJ7CfkB-p1WHeT-mJx1yFHU8dQa0ZmugTmCQHHd4J44d715aMHtC1Y0mOcwGWqpe47NhNLsfJq92LgwSoehs72fMn0k-6OaVuibx7KC_d-DaSmiCItgTdzkpX0EO_X3p","expiresAt":1783654100196,"oauthState":"Q_562swcEr89kZs0vyC82MaRYhsn3GoD"},2026-07-10T03:28:20.197Z,2026-07-10T03:18:20.197Z,2026-07-10T03:18:20.197Z

 Test Files  1 failed | 1 passed (2)
      Tests  5 failed | 16 passed (21)
   Start at  11:18:18
   Duration  2.20s (transform 234ms, setup 0ms, collect 1.31s, tests 1.26s, environment 1ms, prepare 236ms)

/home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @jojopotato/api@0.0.1 test: `vitest run`
Exit status 1 exits 0 — precondition:  + 
> @jojopotato/api@0.0.1 db:migrate /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
> drizzle-kit migrate

No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api/drizzle.config.ts'
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
Using 'pg' driver for database querying
[⣷] applying migrations...[2K[1G[⣷] applying migrations.../home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @jojopotato/api@0.0.1 db:migrate: `drizzle-kit migrate`
Exit status 1 | A |
| AC-1 | Active branches appear; inactive do not | Hybrid | Manual:  — confirms jojo-poblacion and jojo-it-park, NOT jojo-mabolo | A |
| AC-2 | Distance sort when location granted | Hybrid | Manual dev-build iOS/Android: grant location — list ordered closest-first; distance shown per row | A |
| AC-3 | Priority sort when location denied | Hybrid | Manual dev-build iOS/Android: deny location — list ordered by priority (poblacion=1, it-park=2); no distance | A |
| AC-5 | Open/closed status correct | Hybrid | Manual: test jojo-it-park within/outside its opening hours; badge shows correct state | A |
| AC-6 | Disabled CTA for closed/unavailable | Hybrid | Manual: jojo-it-park CTA is disabled/greyed (is_accepting_pickup=false) | A |
| AC-7 | Enabled CTA navigates | Hybrid | Manual: tap jojo-poblacion CTA — navigates to /branches/[branchId]; selectedBranchId set | A |
| AC-8 | Search filters by name | Hybrid | Manual: type IT — only jojo-it-park visible; xyz → empty state; clear → full list | A |
| AC-9 | All required fields shown | Hybrid | Manual visual inspection of each BranchListItem row | A |
| AC-10 | Web renders without crash | Hybrid | Manual: browser with geolocation blocked — list renders, priority sort, no distance, no crash | A |
| utils-unit | distanceKm and getIsOpenNow unit coverage | Known-Gap | — | D |
| api-http | HTTP-layer test for GET /api/branches via supertest | Known-Gap | — | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- D — backlog test-building stub (named residual; keep-active; continue)

Failing stubs (Fully-Automated rows):



Legacy line form:
- typecheck: Fully-automated: 
> jojo-potato@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile
> turbo run typecheck


   • Packages in scope: @jojopotato/api, @jojopotato/config, @jojopotato/mobile, @jojopotato/types, @jojopotato/ui, @jojopotato/utils
   • Running typecheck in 6 packages
   • Remote caching disabled

@jojopotato/utils:typecheck: cache hit, replaying logs 0a02add9eba92785
@jojopotato/utils:typecheck: 
@jojopotato/utils:typecheck: > @jojopotato/utils@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/utils
@jojopotato/utils:typecheck: > tsc --noEmit
@jojopotato/utils:typecheck: 
@jojopotato/api:typecheck: cache hit, replaying logs dd35913d1e1b0f5e
@jojopotato/api:typecheck: 
@jojopotato/api:typecheck: > @jojopotato/api@0.0.1 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
@jojopotato/api:typecheck: > tsc --noEmit
@jojopotato/api:typecheck: 
@jojopotato/types:typecheck: cache hit, replaying logs 53468af176cca155
@jojopotato/types:typecheck: 
@jojopotato/types:typecheck: > @jojopotato/types@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/types
@jojopotato/types:typecheck: > tsc --noEmit
@jojopotato/types:typecheck: 
@jojopotato/ui:typecheck: cache hit, replaying logs caa3c8731d6334cd
@jojopotato/ui:typecheck: 
@jojopotato/ui:typecheck: > @jojopotato/ui@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/ui
@jojopotato/ui:typecheck: > tsc --noEmit
@jojopotato/ui:typecheck: 
@jojopotato/mobile:typecheck: cache hit, replaying logs 9fbc0de58198468c
@jojopotato/mobile:typecheck: 
@jojopotato/mobile:typecheck: > @jojopotato/mobile@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile
@jojopotato/mobile:typecheck: > tsc --noEmit
@jojopotato/mobile:typecheck: 

 Tasks:    5 successful, 5 total
Cached:    5 cached, 5 total
  Time:    18ms >>> FULL TURBO
- lint: Fully-automated: 
> jojo-potato@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile
> turbo run lint


   • Packages in scope: @jojopotato/api, @jojopotato/config, @jojopotato/mobile, @jojopotato/types, @jojopotato/ui, @jojopotato/utils
   • Running lint in 6 packages
   • Remote caching disabled

@jojopotato/config:lint: cache hit, replaying logs 1e2c4acfc38fc49d
@jojopotato/config:lint: 
@jojopotato/config:lint: > @jojopotato/config@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/config
@jojopotato/config:lint: > eslint .
@jojopotato/config:lint: 
@jojopotato/types:lint: cache hit, replaying logs 1de1112c17a355c3
@jojopotato/types:lint: 
@jojopotato/api:lint: cache hit, replaying logs 81b8a42f0da1c0c0
@jojopotato/types:lint: > @jojopotato/types@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/types
@jojopotato/types:lint: > eslint .
@jojopotato/types:lint: 
@jojopotato/api:lint: 
@jojopotato/api:lint: > @jojopotato/api@0.0.1 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
@jojopotato/api:lint: > eslint .
@jojopotato/api:lint: 
@jojopotato/api:lint: (node:33480) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api/eslint.config.js?mtime=1783567159965 is not specified and it doesn't parse as CommonJS.
@jojopotato/api:lint: Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
@jojopotato/api:lint: To eliminate this warning, add "type": "module" to /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api/package.json.
@jojopotato/api:lint: (Use `node --trace-warnings ...` to show where the warning was created)
@jojopotato/utils:lint: cache hit, replaying logs 5ce011af47ed463b
@jojopotato/utils:lint: 
@jojopotato/utils:lint: > @jojopotato/utils@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/utils
@jojopotato/utils:lint: > eslint .
@jojopotato/utils:lint: 
@jojopotato/ui:lint: cache hit, replaying logs 7fd7f7ab7a0a0ed3
@jojopotato/ui:lint: 
@jojopotato/ui:lint: > @jojopotato/ui@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/ui
@jojopotato/ui:lint: > eslint .
@jojopotato/ui:lint: 
@jojopotato/mobile:lint: cache hit, replaying logs afb2dd41cb65274a
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: > @jojopotato/mobile@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile
@jojopotato/mobile:lint: > eslint .
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile/scripts/dev-with-tunnel.mjs
@jojopotato/mobile:lint:   29:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint:   63:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint:   69:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: ✖ 3 problems (0 errors, 3 warnings)
@jojopotato/mobile:lint:   0 errors and 3 warnings potentially fixable with the `--fix` option.
@jojopotato/mobile:lint: 

 Tasks:    6 successful, 6 total
Cached:    6 cached, 6 total
  Time:    20ms >>> FULL TURBO
- api-test: hybrid: 
> @jojopotato/api@0.0.1 test /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
> vitest run


 RUN  v3.2.7 /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api

 ✓ src/db/schema/__tests__/smoke.test.ts (16 tests) 6ms
 ❯ src/lib/__tests__/auth.integration.test.ts (5 tests | 5 failed) 1178ms
   × email/password > signs up a new user defaulting role=customer, email_verified=false, then signs in 53ms
     → Failed query: select "id", "name", "email", "email_verified", "phone_number", "phone_number_verified", "image", "birthday", "favorite_branch_id", "role", "created_at", "updated_at" from "users" where "users"."email" = $1
params: ep-uk5x3szm@example.com
   × email/password > never lets a client self-assign a privileged role (additionalFields input:false) 18ms
     → Failed query: select "id", "name", "email", "email_verified", "phone_number", "phone_number_verified", "image", "birthday", "favorite_branch_id", "role", "created_at", "updated_at" from "users" where "users"."email" = $1
params: role-zcaca270@example.com
   × phone OTP > sends a (stubbed/logged) OTP and verifies it, provisioning a session 17ms
     → Failed query: insert into "verification" ("id", "identifier", "value", "expires_at", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5) returning "id", "identifier", "value", "expires_at", "created_at", "updated_at"
params: +15550108468,160666:0,2026-07-10T03:23:25.681Z,2026-07-10T03:18:25.682Z,2026-07-10T03:18:25.682Z
   × magic link > issues a verification token and authenticates when it is verified 15ms
     → Failed query: insert into "verification" ("id", "identifier", "value", "expires_at", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5) returning "id", "identifier", "value", "expires_at", "created_at", "updated_at"
params: cOUXzgtZSURNUnlAZCyKIJKnYePssnZx,{"email":"magic-q0j47e5z@example.com"},2026-07-10T03:23:25.699Z,2026-07-10T03:18:25.699Z,2026-07-10T03:18:25.699Z
   × google oauth (config-level wiring) > constructs a Google authorization redirect (no live round-trip) 14ms
     → Failed query: insert into "verification" ("id", "identifier", "value", "expires_at", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5) returning "id", "identifier", "value", "expires_at", "created_at", "updated_at"
params: KU3B8skTMjY27-LpU-AwvEWjMwPXd68Y,{"callbackURL":"jojopotato://","codeVerifier":"pfAqycUm5Av5YrlfOy4uZDyl77FVmpjbWShGA_rWGJtAJfdBMDmlQBpEdOIgtdpqYbuL_rqbM48Y0RKoU4RUCJxHX8o0RLXNjIHMxsSFMt5p72QE-N1l2yaMY_ra2JVW","expiresAt":1783654105714,"oauthState":"KU3B8skTMjY27-LpU-AwvEWjMwPXd68Y"},2026-07-10T03:28:25.715Z,2026-07-10T03:18:25.715Z,2026-07-10T03:18:25.715Z

 Test Files  1 failed | 1 passed (2)
      Tests  5 failed | 16 passed (21)
   Start at  11:18:23
   Duration  2.14s (transform 222ms, setup 0ms, collect 1.39s, tests 1.18s, environment 1ms, prepare 254ms)

/home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @jojopotato/api@0.0.1 test: `vitest run`
Exit status 1 + precondition: docker compose up -d + db:migrate
- AC-1 through AC-10: hybrid: manual verification per Verification Evidence table
- utils unit tests: known-gap: documented as NEW PLAN REQUIRED — see backlog/brn-001-utils-unit-tests_NOTE_10-07-26.md
- api http test: known-gap: documented as NEW PLAN REQUIRED — see backlog/brn-001-api-route-supertest_NOTE_10-07-26.md

Dimension findings:
- Infra fit: CONDITIONAL — expo-location requires dev build for location testing (noted in plan); migration safety confirmed; rollback plan present
- Test coverage: CONDITIONAL — API test reclassified to Hybrid (live DB precondition); known-gaps documented for utils unit tests and HTTP-layer API test
- Breaking changes: PASS (after plan updates) — all isOpen consumers now listed and covered by steps 15, 15b, 15c; 4 previously-unlisted consumers added to blast radius and checklist
- Security surface: PASS — no auth/billing/secrets touched; public endpoint matches existing pattern

Open gaps:
- utils-unit: known-gap: documented as NEW PLAN REQUIRED — see backlog/brn-001-utils-unit-tests_NOTE_10-07-26.md
- api-http: known-gap: documented as NEW PLAN REQUIRED — see backlog/brn-001-api-route-supertest_NOTE_10-07-26.md

What this coverage does NOT prove:
- AC-11a (pnpm typecheck): does not prove runtime correctness, only type-level correctness; does not cover branches index logic correctness
- AC-12a (pnpm lint): does not prove correctness of business logic; only enforces code style
- AC-4a (vitest): does not prove HTTP response shape in production; does not test with concurrent requests; does not test the 500 error path unless a DB failure is simulated
- AC-2/AC-3 (hybrid manual): does not prove location accuracy or GPS hardware behaviour; does not prove sorting is stable for equidistant branches
- AC-5/AC-6 (hybrid manual): does not prove timezone correctness at DST boundaries; does not cover midnight edge cases programmatically
- AC-10 (hybrid manual web): does not prove the web bundle size or performance impact of the new hooks

Gate: CONDITIONAL (concerns noted, accepted by session)
Accepted by: session (autonomous /goal execution) — concerns accepted:
  1. expo-location dev-build requirement noted in plan; AC-2/AC-3 manual steps updated
  2. API test reclassified to Hybrid in plan
  3. Lint baseline confirmed as 0 errors; plan updated to remove stale floating-tab-bar.tsx caveat

Execute-agent instructions:
- E1: Before executing step 12 (PickupBranch type change), run apps/mobile/src/features/home/mock-home.ts:95:  isOpen: true,
apps/mobile/src/features/home/components/branch-selector.tsx:52:            { backgroundColor: branch.isOpen ? Palette.green : theme.accent },
apps/mobile/src/features/home/components/branch-selector.tsx:56:          {branch.isOpen ? 'Open' : 'Closed'}
packages/ui/src/components/branch-card.tsx:52:            { backgroundColor: branch.isOpen ? Palette.green : theme.accent },
packages/ui/src/components/branch-card.tsx:56:          {branch.isOpen ? 'Open' : 'Closed'}
packages/types/src/pickup.ts:7:  isOpen: boolean;
packages/ui/src/components/__tests__/mocks.ts:36:  isOpen: true,
apps/mobile/src/app/component-showcase.tsx:83:  isOpen: true,
apps/mobile/src/app/component-showcase.tsx:92:  isOpen: false, and fix ALL consumers before committing. Do NOT commit step 12 in isolation.
- E2: Manual verification of AC-2 and AC-3 requires a dev build. Do not use Expo Go for location tests.
- E3: 
> @jojopotato/api@0.0.1 test /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
> vitest run


 RUN  v3.2.7 /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api

 ✓ src/db/schema/__tests__/smoke.test.ts (16 tests) 6ms
 ❯ src/lib/__tests__/auth.integration.test.ts (5 tests | 5 failed) 1181ms
   × email/password > signs up a new user defaulting role=customer, email_verified=false, then signs in 53ms
     → Failed query: select "id", "name", "email", "email_verified", "phone_number", "phone_number_verified", "image", "birthday", "favorite_branch_id", "role", "created_at", "updated_at" from "users" where "users"."email" = $1
params: ep-c9kbavqe@example.com
   × email/password > never lets a client self-assign a privileged role (additionalFields input:false) 18ms
     → Failed query: select "id", "name", "email", "email_verified", "phone_number", "phone_number_verified", "image", "birthday", "favorite_branch_id", "role", "created_at", "updated_at" from "users" where "users"."email" = $1
params: role-gnb74tim@example.com
   × phone OTP > sends a (stubbed/logged) OTP and verifies it, provisioning a session 14ms
     → Failed query: insert into "verification" ("id", "identifier", "value", "expires_at", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5) returning "id", "identifier", "value", "expires_at", "created_at", "updated_at"
params: +15550670658,208779:0,2026-07-10T03:23:28.779Z,2026-07-10T03:18:28.780Z,2026-07-10T03:18:28.780Z
   × magic link > issues a verification token and authenticates when it is verified 12ms
     → Failed query: insert into "verification" ("id", "identifier", "value", "expires_at", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5) returning "id", "identifier", "value", "expires_at", "created_at", "updated_at"
params: qJbjnHvFVFBRtWyywggbZzlQtbVbyWhi,{"email":"magic-gu4zc5bj@example.com"},2026-07-10T03:23:28.794Z,2026-07-10T03:18:28.794Z,2026-07-10T03:18:28.794Z
   × google oauth (config-level wiring) > constructs a Google authorization redirect (no live round-trip) 15ms
     → Failed query: insert into "verification" ("id", "identifier", "value", "expires_at", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5) returning "id", "identifier", "value", "expires_at", "created_at", "updated_at"
params: 0uhu5wVpgHCiGvSHrdjJFH2iUpZhLCYy,{"callbackURL":"jojopotato://","codeVerifier":"5fex8G0zGrGyRNw4hOtJW4waWJz--wnyq8r5MULBvirMh9O344CPpUR7PCG_0O-2f_pWW_rx-RFyL_GiiOCEPZxYGjkRMtsWum2OJ2SR8uUKHQNUi1UArPDeA1i0G_ey","expiresAt":1783654108806,"oauthState":"0uhu5wVpgHCiGvSHrdjJFH2iUpZhLCYy"},2026-07-10T03:28:28.809Z,2026-07-10T03:18:28.809Z,2026-07-10T03:18:28.809Z

 Test Files  1 failed | 1 passed (2)
      Tests  5 failed | 16 passed (21)
   Start at  11:18:26
   Duration  2.15s (transform 240ms, setup 0ms, collect 1.39s, tests 1.19s, environment 1ms, prepare 236ms)

/home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @jojopotato/api@0.0.1 test: `vitest run`
Exit status 1 requires  +  first (Hybrid gate, not Fully-Automated).


## Autonomous Goal Block

SESSION GOAL: BRN-001 Branch Locator — build branch list, distance sort, and branch selection for the Branches tab
Charter + umbrella plan: N/A — single plan
Autonomy: apply fixes, proceed on CONDITIONAL; hard stop only on irreversible outward-facing actions
Hard stop conditions / safety constraints:
- Do not push to remote or submit EAS build without explicit user confirmation
- Do not apply migration () without first inspecting the generated SQL (step 3 in plan)
- Do not commit step 12 (PickupBranch type change) without fixing ALL isOpen consumers in the same commit (E1)
Next phase: EXECUTE: process/features/pickup-branches/active/brn-001-branch-locator_10-07-26/brn-001-branch-locator_PLAN_10-07-26.md
Validate contract: inline in plan (## Validate Contract section)
Execute start: 
> jojo-potato@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile
> turbo run typecheck


   • Packages in scope: @jojopotato/api, @jojopotato/config, @jojopotato/mobile, @jojopotato/types, @jojopotato/ui, @jojopotato/utils
   • Running typecheck in 6 packages
   • Remote caching disabled

@jojopotato/types:typecheck: cache hit, replaying logs 53468af176cca155
@jojopotato/types:typecheck: 
@jojopotato/types:typecheck: > @jojopotato/types@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/types
@jojopotato/types:typecheck: > tsc --noEmit
@jojopotato/types:typecheck: 
@jojopotato/api:typecheck: cache hit, replaying logs dd35913d1e1b0f5e
@jojopotato/api:typecheck: 
@jojopotato/api:typecheck: > @jojopotato/api@0.0.1 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
@jojopotato/api:typecheck: > tsc --noEmit
@jojopotato/api:typecheck: 
@jojopotato/utils:typecheck: cache hit, replaying logs 0a02add9eba92785
@jojopotato/utils:typecheck: 
@jojopotato/utils:typecheck: > @jojopotato/utils@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/utils
@jojopotato/utils:typecheck: > tsc --noEmit
@jojopotato/utils:typecheck: 
@jojopotato/ui:typecheck: cache hit, replaying logs caa3c8731d6334cd
@jojopotato/ui:typecheck: 
@jojopotato/ui:typecheck: > @jojopotato/ui@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/ui
@jojopotato/ui:typecheck: > tsc --noEmit
@jojopotato/ui:typecheck: 
@jojopotato/mobile:typecheck: cache hit, replaying logs 9fbc0de58198468c
@jojopotato/mobile:typecheck: 
@jojopotato/mobile:typecheck: > @jojopotato/mobile@0.1.0 typecheck /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile
@jojopotato/mobile:typecheck: > tsc --noEmit
@jojopotato/mobile:typecheck: 

 Tasks:    5 successful, 5 total
Cached:    5 cached, 5 total
  Time:    17ms >>> FULL TURBO (exits 0, baseline) | 
> jojo-potato@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile
> turbo run lint


   • Packages in scope: @jojopotato/api, @jojopotato/config, @jojopotato/mobile, @jojopotato/types, @jojopotato/ui, @jojopotato/utils
   • Running lint in 6 packages
   • Remote caching disabled

@jojopotato/config:lint: cache hit, replaying logs 1e2c4acfc38fc49d
@jojopotato/config:lint: 
@jojopotato/config:lint: > @jojopotato/config@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/config
@jojopotato/config:lint: > eslint .
@jojopotato/config:lint: 
@jojopotato/api:lint: cache hit, replaying logs 81b8a42f0da1c0c0
@jojopotato/utils:lint: cache hit, replaying logs 5ce011af47ed463b
@jojopotato/api:lint: 
@jojopotato/api:lint: > @jojopotato/api@0.0.1 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api
@jojopotato/api:lint: > eslint .
@jojopotato/api:lint: 
@jojopotato/api:lint: (node:33480) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api/eslint.config.js?mtime=1783567159965 is not specified and it doesn't parse as CommonJS.
@jojopotato/utils:lint: 
@jojopotato/api:lint: Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
@jojopotato/utils:lint: > @jojopotato/utils@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/utils
@jojopotato/api:lint: To eliminate this warning, add "type": "module" to /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/api/package.json.
@jojopotato/utils:lint: > eslint .
@jojopotato/api:lint: (Use `node --trace-warnings ...` to show where the warning was created)
@jojopotato/utils:lint: 
@jojopotato/types:lint: cache hit, replaying logs 1de1112c17a355c3
@jojopotato/types:lint: 
@jojopotato/types:lint: > @jojopotato/types@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/types
@jojopotato/types:lint: > eslint .
@jojopotato/types:lint: 
@jojopotato/ui:lint: cache hit, replaying logs 7fd7f7ab7a0a0ed3
@jojopotato/ui:lint: 
@jojopotato/ui:lint: > @jojopotato/ui@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/packages/ui
@jojopotato/ui:lint: > eslint .
@jojopotato/ui:lint: 
@jojopotato/mobile:lint: cache hit, replaying logs afb2dd41cb65274a
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: > @jojopotato/mobile@0.1.0 lint /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile
@jojopotato/mobile:lint: > eslint .
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: /home/aguynamedkent/projs/veent_work/jojo-mobile/apps/mobile/scripts/dev-with-tunnel.mjs
@jojopotato/mobile:lint:   29:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint:   63:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint:   69:5  warning  Unused eslint-disable directive (no problems were reported from 'no-await-in-loop')
@jojopotato/mobile:lint: 
@jojopotato/mobile:lint: ✖ 3 problems (0 errors, 3 warnings)
@jojopotato/mobile:lint:   0 errors and 3 warnings potentially fixable with the `--fix` option.
@jojopotato/mobile:lint: 

 Tasks:    6 successful, 6 total
Cached:    6 cached, 6 total
  Time:    19ms >>> FULL TURBO (exits 0, baseline) | manual curl /api/branches after Phase 1 | dev-build iOS/Android for AC-2/AC-3 | high-risk pack: no