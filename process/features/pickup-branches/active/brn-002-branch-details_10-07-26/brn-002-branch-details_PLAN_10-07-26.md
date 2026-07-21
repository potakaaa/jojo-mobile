---
name: plan:brn-002-branch-details
description: "Branch Details screen — API endpoint, utils, types/UI, screen, and gates for BRN-002 (absorbs BRN-004 directions)"
date: 10-07-26
feature: pickup-branches
---

# BRN-002: Branch Details Screen — PLAN

**Date** 2026-07-10
**Status** PLANNED
**SPEC:** `brn-002-branch-details_SPEC_10-07-26.md` (11 ACs)
**Complexity** COMPLEX
**Absorbs:** BRN-004 (Directions — delivered by Phase 2 `buildDirectionsUrl`)

---

## Overview

Implement the Branch Details screen end-to-end across five phases. The screen is reached by navigating from the BRN-001 branch list; it receives only a `branchId` route param, fetches all data itself, and presents branch info, deals, a directions link, and an Order CTA.

Phases 1, 2, and 3 are disjoint-package and **parallel-safe** (Phase 1 = `packages/api`, Phase 2 = `packages/utils`, Phase 3 = `packages/types` + `packages/ui` + a 2-line refactor in `apps/mobile`). Phase 4 (the detail screen in `apps/mobile`) depends on Phases 1, 2, and 3 being complete. Phase 5 is gate-only (no new code).

---

## Goals

1. Add `GET /api/branches/:id` returning combined `{ branch, deals }` with server-computed `discountLabel`.
2. Add `formatOpeningHours` to `packages/utils/src/hours.ts` and `buildDirectionsUrl` to a new `packages/utils/src/maps.ts`.
3. Extract `ApiBranch`/`mapApiBranch` from `branches/index.tsx` to `features/branches/api.ts`; add optional `validUntil` row to `DealCard`.
4. Build out `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` with all required UI, fetch logic, CTA, and directions.
5. Run all automated gates + manual AC checklist.

---

## Acceptance Criteria

Mapped from SPEC (11 ACs). See Verification Evidence table for strategy and gate per AC.

- **AC-1** All required branch fields displayed with real values (Hybrid — manual dev build)
- **AC-2** Deals: 5 for it-park, 4 for poblacion; exclusive excluded from poblacion (Hybrid — vitest + manual)
- **AC-3** CTA disabled when closed or not accepting pickup (Hybrid — manual dev build)
- **AC-4** CTA enabled and navigates when open and accepting pickup (Hybrid — manual dev build)
- **AC-5** Get Directions opens correct maps app with branch coordinates (Hybrid — manual on sim/device)
- **AC-6** Distance shown when location granted; hidden when unavailable (Hybrid — manual dev build)
- **AC-7** Opening hours rendered in human-readable format matching seed data (Hybrid — manual dev build)
- **AC-8** Loading state visible during fetch; error state on failure with back action (Hybrid — manual dev build)
- **AC-9** API returns branch fields + deals with correct shape and filtering (Hybrid — vitest + typecheck)
- **AC-10** `pnpm typecheck` exits 0 (Fully-Automated)
- **AC-11** `pnpm lint` no new errors (Fully-Automated)

---

## Out of Scope

- **BRN-003** (embedded map view) — deferred
- Deal redemption / apply-to-cart
- Full menu display on this screen
- Pickup time slot selection
- Real-time branch status updates
- BRN-004 is absorbed; close it after this ships

---

## Touchpoints

| File | Change type |
|---|---|
| `packages/api/src/index.ts` | Add `GET /api/branches/:id` route |
| `packages/api/src/__tests__/branch-detail-route.test.ts` | New vitest integration test |
| `packages/api/src/db/schema/deals.ts` | Read-only reference (no change) |
| `packages/api/src/db/schema/deal_branches.ts` | Read-only reference (no change) |
| `packages/api/src/db/schema/branches.ts` | Read-only reference (no change) |
| `packages/utils/src/hours.ts` | Add `formatOpeningHours` export |
| `packages/utils/src/maps.ts` | New file: `buildDirectionsUrl` |
| `packages/utils/src/index.ts` | Re-export `maps.ts` |
| `packages/types/src/deals.ts` | Confirm `discountLabel` + `validUntil` exist (no change expected) |
| `packages/ui/src/components/deal-card.tsx` | Add optional `validUntil` text row |
| `packages/ui/src/index.ts` | Verify `DealCard` is exported (no change expected) |
| `apps/mobile/src/features/branches/api.ts` | New file: extracted `ApiBranch`, `mapApiBranch`, `ApiBranchDeal`, `mapApiBranchDeal`, `BranchDetailResponse` |
| `apps/mobile/src/app/(tabs)/branches/index.tsx` | 2-line change: import from `../../../features/branches/api` |
| `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` | Build out from placeholder to full detail screen |

---

## Public Contracts

### API — `GET /api/branches/:id`

**Request:** `id` is a UUID (branch `id` column, not slug).

**Success response (200):**
```
{
  branch: {
    id: string,
    name: string,
    slug: string,
    address: string,
    phone: string,
    latitude: string,       // pg numeric → string; client parses to float
    longitude: string,
    opening_hours: string,  // JSON string, per-day {open,close}
    is_active: boolean,
    is_accepting_pickup: boolean,
    estimated_prep_minutes: number,
    priority: number
  },
  deals: Array<{
    id: string,
    title: string,
    description: string | null,
    image_url: string | null,
    deal_type: DealTypeEnum,
    discount_value: string | null,  // pg numeric → string
    start_at: string,               // ISO timestamp
    end_at: string,
    is_active: boolean,
    discountLabel: string            // server-computed
  }>
}
```

**Error responses:**
- `404 { error: "Branch not found" }` — branch ID not in DB or `is_active = false` for an inactive branch (active branches only returned)
- `500 { error: "Failed to fetch branch" }` — DB error

### `ApiBranchDeal` (client type, `features/branches/api.ts`)

Extends the raw API deal fields with `validUntil: string` (client-formatted from `end_at`).

### `DealCard` (packages/ui)

`validUntil?: string` added as optional prop. When present, renders a text row below description. No breaking change to existing usage.

### `buildDirectionsUrl` (packages/utils/src/maps.ts)

```ts
export function buildDirectionsUrl(
  lat: number,
  lng: number,
  name: string,
  platform: 'ios' | 'android' | 'web'
): string
```

---

## Blast Radius

**Packages touched:** `packages/api`, `packages/utils`, `packages/types` (read-only confirm), `packages/ui`, `apps/mobile`

**Risk class:** medium — new API route + new screen; no schema migration, no auth change, no billing surface.

**Files modified:** ~8 new or changed files (plus 2 read-only confirms)

**BRN-001 code touched:** `apps/mobile/src/app/(tabs)/branches/index.tsx` — 2-line import change only; behavior unchanged.

---

## Deal Type → discountLabel Mapping

The API computes `discountLabel` server-side from `deal_type` (enum) and `discount_value` (string from pg numeric). Full mapping:

| `deal_type` | `discount_value` | `discountLabel` |
|---|---|---|
| `percentage_discount` | e.g. `"20"` | `"20% off"` |
| `fixed_discount` | e.g. `"50"` | `"₱50 off"` |
| `buy_one_take_one` | any / null | `"Buy 1 Get 1"` |
| `free_item` | any / null | `"Free Item"` |
| `free_upgrade` | any / null | `"Free Upgrade"` |
| `bundle` | e.g. `"199"` | `"Bundle ₱199"` |

For `percentage_discount` and `fixed_discount`: if `discount_value` is null or `"0"`, fall back to `"Deal"`. Strip trailing `.00` from the parsed number (e.g. `"20.00"` → `"20"`).

---

## Global Deals SQL (Drizzle Expression)

The endpoint returns deals that are either (a) explicitly mapped to this branch OR (b) global (no `deal_branches` rows at all), filtered to active and within time window.

**Drizzle query pattern (two queries, union in application layer):**

```
// Query A — explicit deals mapped to this branch
db.select({ deal: deals })
  .from(deals)
  .innerJoin(dealBranches, eq(dealBranches.deal_id, deals.id))
  .where(
    and(
      eq(dealBranches.branch_id, branchId),
      eq(deals.is_active, true),
      lte(deals.start_at, now),
      gte(deals.end_at, now)
    )
  )

// Query B — global deals (NOT EXISTS in deal_branches at all)
db.select()
  .from(deals)
  .where(
    and(
      notExists(
        db.select({ one: sql`1` })
          .from(dealBranches)
          .where(eq(dealBranches.deal_id, deals.id))
      ),
      eq(deals.is_active, true),
      lte(deals.start_at, now),
      gte(deals.end_at, now)
    )
  )
```

`notExists` is imported from `drizzle-orm`. `sql` is imported from `drizzle-orm`. The two result arrays are merged and deduplicated by `id` before returning. `now` is `new Date()` at request time.

**Important:** Do NOT use `NOT IN (SELECT branch_id FROM deal_branches WHERE deal_id = deals.id)` — the `notExists` subquery correctly identifies deals with NO `deal_branches` rows at all, not just deals not linked to this branch.

---

## Phase 1 — API Endpoint (packages/api)

**Dependency:** none. Parallel-safe with Phases 2 and 3.

### Steps

1. **Add imports to `packages/api/src/index.ts`**: add `and`, `eq`, `gte`, `lte`, `notExists`, `sql` from `drizzle-orm`; add `dealBranches`, `deals` from `./db/schema/index`.

2. **Add `discountLabel` helper function** (private, above the new route handler in `index.ts`):
   ```
   function computeDiscountLabel(dealType: string, discountValue: string | null): string
   ```
   Implements the mapping table above. Parses `discountValue` with `parseFloat`, strips `.00` via `Number(x).toString()` when the result is an integer.

3. **Add the new route** `app.get('/api/branches/:id', async (req, res) => {...})` to `packages/api/src/index.ts` after the existing `GET /api/branches` route:
   - Extract `req.params.id` (UUID string).
   - Query `branches` table: `db.select().from(branches).where(eq(branches.id, id))` — returns 0 or 1 rows.
   - If 0 rows: `res.status(404).json({ error: 'Branch not found' })`.
   - Run the two deal queries (Query A and Query B from the SQL section above) in parallel via `Promise.all`.
   - Merge and deduplicate results by `id`.
   - Map each deal to add `discountLabel` via `computeDiscountLabel`.
   - Return `res.json({ branch: branchRow, deals: mappedDeals })`.
   - Wrap in try/catch: `res.status(500).json({ error: 'Failed to fetch branch' })`.

4. **Create `packages/api/src/__tests__/branch-detail-route.test.ts`** — mirrors `branches-route.test.ts` structure:
   - `beforeAll`: import db + schema, probe with `db.select().from(branches).limit(1)`, set `dbAvailable`.
   - `describe('GET /api/branches/:id query logic')`:
     - Test helper: look up `jojo-it-park` and `jojo-poblacion` branch rows by slug to get their UUIDs.
     - `it('returns 5 deals for jojo-it-park (4 global + 1 exclusive)')`: run the two deal queries for it-park's UUID, merge, assert length === 5.
     - `it('returns 4 deals for jojo-poblacion (4 global only)')`: run the two deal queries for poblacion's UUID, assert length === 4.
     - `it('IT Park exclusive deal is absent from jojo-poblacion response')`: assert the it-park-exclusive deal title (or its known ID) does not appear in the poblacion deals array.
     - `it('returns branch fields for jojo-it-park')`: assert `id`, `name`, `slug`, `is_accepting_pickup === false` for the branch row.
   - All tests: `if (!dbAvailable) { return; }` guard (skip-when-DB-down pattern).

5. **Verify `packages/api/src/db/schema/index.ts` exports `dealBranches` and `deals`** — read to confirm; add exports if missing (likely already present from BRN-001 migration work).

---

## Phase 2 — Utility Functions (packages/utils)

**Dependency:** none. Parallel-safe with Phases 1 and 3.

### Steps

6. **Add `formatOpeningHours` to `packages/utils/src/hours.ts`** (append after existing `getIsOpenNow`):

   ```ts
   export function formatOpeningHours(openingHoursJson: string): string[]
   ```

   Logic:
   - Parse the JSON string. On parse error, return `['Hours unavailable']`.
   - Ordered day sequence: `['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']`.
   - For each day: if the key is missing or has no `open`/`close`, the day is "Closed".
   - Format `open`/`close` to 12h AM/PM: e.g. `'09:00'` → `'9:00 AM'`, `'21:00'` → `'9:00 PM'`, `'00:00'` → `'12:00 AM'`. Use integer hour, drop leading zero for hours 1–9 and 13–23.
   - Group consecutive days with identical open+close strings (or both "Closed"): e.g. Mon, Tue, Wed, Thu all `09:00–21:00` → `'Mon–Thu: 9:00 AM – 9:00 PM'`. Single days: `'Sun: 10:00 AM – 8:00 PM'`. Closed day: `'Closed'` (no day prefix when single) or `'Mon–Fri: Closed'` for a run.
   - Return an array of display strings, one per run of consecutive identical days.
   - Use abbreviated day names: `'Mon'`, `'Tue'`, `'Wed'`, `'Thu'`, `'Fri'`, `'Sat'`, `'Sun'`.

   **Expected output for jojo-poblacion seed hours** (Mon–Thu 09:00–21:00, Fri–Sat 09:00–22:00, Sun 10:00–20:00):
   ```
   ['Mon–Thu: 9:00 AM – 9:00 PM', 'Fri–Sat: 9:00 AM – 10:00 PM', 'Sun: 10:00 AM – 8:00 PM']
   ```

7. **Create `packages/utils/src/maps.ts`**:

   ```ts
   export function buildDirectionsUrl(
     lat: number,
     lng: number,
     name: string,
     platform: 'ios' | 'android' | 'web'
   ): string
   ```

   Implementations:
   - `'ios'`: `maps://?ll=${lat},${lng}&q=${encodeURIComponent(name)}`
   - `'android'`: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(name)})`
   - `'web'`: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

   Rules: no React Native import; handle negative lat/lng naturally (they serialize correctly in template literals); `encodeURIComponent` on `name` for all platforms.

8. **Add re-export to `packages/utils/src/index.ts`**: append `export * from './maps';`.

---

## Phase 3 — Shared Types + UI + Branches API Extraction (packages/types, packages/ui, apps/mobile)

**Dependency:** none for types/UI. Parallel-safe with Phases 1 and 2.
**Note:** The 2-line `index.tsx` change touches BRN-001 committed code — keep it minimal.

### Steps

9. **Confirm `packages/types/src/deals.ts`** already has `discountLabel: string` and `validUntil?: string`. Per the current file content these exist — no change required. **Document this as a no-op step.**

10. **Update `packages/ui/src/components/deal-card.tsx`** — add optional `validUntil` display:
    - Add `validUntil?: string` to the `DealCardProps` interface (destructure from props alongside `deal`).
    - Inside `<View style={styles.body}>`, after the description `Text` block, add:
      ```tsx
      {validUntil ? (
        <Text style={[styles.validUntil, { color: theme.textSecondary }]}>
          Valid until: {validUntil}
        </Text>
      ) : null}
      ```
    - Add `validUntil: styles.validUntil` entry to `StyleSheet.create`:
      ```
      validUntil: {
        fontFamily: FontFamily.body.regular,
        fontSize: TypeScale.caption,
      }
      ```
    - Backward-compatible: existing call sites that do not pass `validUntil` are unaffected.

11. **Create `apps/mobile/src/features/branches/api.ts`**:
    - Move `interface ApiBranch {...}` from `branches/index.tsx` here (verbatim).
    - Move `function mapApiBranch(row: ApiBranch): PickupBranch` from `branches/index.tsx` here (verbatim).
    - Add `interface ApiBranchDeal` for the raw deal shape from the API (snake_case fields + `discountLabel: string`):
      ```ts
      export interface ApiBranchDeal {
        id: string;
        title: string;
        description: string | null;
        image_url: string | null;
        deal_type: string;
        discount_value: string | null;
        start_at: string;
        end_at: string;
        is_active: boolean;
        discountLabel: string;
      }
      ```
    - Add `function mapApiBranchDeal(row: ApiBranchDeal): Deal` that maps to the `Deal` type from `@jojopotato/types`:
      ```ts
      import type { Deal, PickupBranch } from '@jojopotato/types';
      // ...
      export function mapApiBranchDeal(row: ApiBranchDeal): Deal {
        return {
          id: row.id,
          title: row.title,
          description: row.description ?? undefined,
          discountLabel: row.discountLabel,
          imageUrl: row.image_url ?? undefined,
          validUntil: row.end_at
            ? new Date(row.end_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
            : undefined,
        };
      }
      ```
    - Add `export interface BranchDetailResponse { branch: ApiBranch; deals: ApiBranchDeal[]; }`.
    - Export all: `ApiBranch`, `mapApiBranch`, `ApiBranchDeal`, `mapApiBranchDeal`, `BranchDetailResponse`.
    - Do NOT export anything from `index.ts` of the features folder — add to the file as standalone exports.

12. **Update `apps/mobile/src/app/(tabs)/branches/index.tsx`** — 2-line change:
    - Remove the inline `interface ApiBranch` declaration.
    - Remove the inline `function mapApiBranch` declaration.
    - Add import: `import { ApiBranch, mapApiBranch } from '@/features/branches/api';`
    - All call sites of `ApiBranch` and `mapApiBranch` in the file remain unchanged.

---

## Phase 4 — Detail Screen (apps/mobile)

**Dependency:** Phases 1, 2, and 3 must be complete.

### Steps

13. **Build out `apps/mobile/src/app/(tabs)/branches/[branchId].tsx`** — replace the current placeholder content with the full implementation:

    **Imports needed:**
    - `{ useLocalSearchParams, router }` from `expo-router`
    - `{ Platform, Linking, ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable }` from `react-native`
    - `{ SafeAreaView }` from `react-native-safe-area-context`
    - `{ Button, DealCard }` from `@jojopotato/ui`
    - `{ distanceKm, getIsOpenNow, formatOpeningHours, buildDirectionsUrl }` from `@jojopotato/utils`
    - `{ useUserLocation }` from `@/hooks/use-user-location`
    - `{ useSelectedBranch }` from `@/features/branches/hooks/use-selected-branch`
    - `{ apiFetch }` from `@/lib/api-fetch`
    - `{ BranchDetailResponse, mapApiBranch, mapApiBranchDeal }` from `@/features/branches/api`
    - Theme constants: `Colors`, `Spacing`, `TypeScale`, `FontFamily` from `@/constants/theme`

    **State:**
    ```ts
    const { branchId } = useLocalSearchParams<{ branchId: string }>();
    const [data, setData] = useState<BranchDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { coords, status: locationStatus } = useUserLocation();
    const { setSelectedBranch } = useSelectedBranch();
    ```

    **Fetch effect:**
    ```ts
    useEffect(() => {
      if (!branchId) return;
      apiFetch<BranchDetailResponse>(`/api/branches/${branchId}`)
        .then(setData)
        .catch(() => setError('Failed to load branch details'))
        .finally(() => setLoading(false));
    }, [branchId]);
    ```

    **Derived values (computed from `data` when available):**
    ```ts
    const branch = data ? mapApiBranch(data.branch) : null;
    const deals = data ? data.deals.map(mapApiBranchDeal) : [];
    const isOpen = branch ? getIsOpenNow(branch.openingHours) : false;
    const hoursLines = branch ? formatOpeningHours(branch.openingHours) : [];
    const distance = branch && locationStatus === 'granted' && coords
      ? distanceKm(coords.latitude, coords.longitude, branch.latitude, branch.longitude)
      : null;
    const canOrder = isOpen && branch?.isAcceptingPickup === true;
    ```

    **Render — loading state:** return `<ActivityIndicator />` centered.

    **Render — error state:** return error message text + a back button (`router.back()`).

    **Render — not found (data loaded but `data.branch` is effectively null):** covered by error state from 404 response.

    **Render — success:** `<SafeAreaView>` wrapping a `<ScrollView>`:
    - Branch name (heading text)
    - Address (body text)
    - Phone (body text)
    - Distance: `{distance !== null ? <Text>{distance.toFixed(1)} km away</Text> : null}`
    - Open/closed badge: Text showing "Open" or "Closed" based on `isOpen`
    - Prep time: `~{branch.estimatedPrepMinutes} min`
    - Pickup status: `{branch.isAcceptingPickup ? 'Accepting Pickup' : 'Not Accepting Pickup'}`
    - Hours section: `{hoursLines.map((line, i) => <Text key={i}>{line}</Text>)}`
    - Get Directions Pressable:
      ```tsx
      <Pressable onPress={() => {
        const url = buildDirectionsUrl(
          branch.latitude,
          branch.longitude,
          branch.name,
          Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android'
        );
        Linking.openURL(url);
      }}>
        <Text>Get Directions</Text>
      </Pressable>
      ```
    - Deals section heading + `FlatList` (or `ScrollView` map) rendering `<DealCard>` per deal with `validUntil` prop.
    - Order CTA using `<Button>` from `@jojopotato/ui`:
      - `disabled={!canOrder}`
      - `onPress` (when enabled only): `setSelectedBranch(branch.id)` then `router.push('/(tabs)/order')` (same target as BRN-001 CTA)
      - Label: `"Order from this branch"`

    **Style:** use `Colors`, `Spacing`, `TypeScale`, `FontFamily` from `@/constants/theme`. No hardcoded color/spacing values that duplicate theme tokens.

---

## Phase 5 — Gates

**Dependency:** Phases 1–4 must be complete.

### Steps

14. **Typed-routes codegen refresh:** `expo start` then Ctrl+C (stop after Metro initializes). This regenerates `.expo/types/router.d.ts` to include the `[branchId]` route. Required before `pnpm typecheck` will resolve `href` usages of `/(tabs)/branches/[branchId]`.

15. **`pnpm typecheck`** — must exit 0. Fix any type errors before proceeding.

16. **`pnpm lint`** — must produce no new errors. Pre-existing `floating-tab-bar.tsx:151` lint warning is excluded.

17. **`pnpm --filter @jojopotato/api test`** — runs `branch-detail-route.test.ts` (requires Postgres running). Confirm all 4 new test cases pass (or are skipped due to no-DB environment, in which case note the skip).

18. **Manual AC verification** — run in dev build (Expo Go or dev client):
    - AC-1: Load jojo-it-park detail screen. Confirm all 7 required fields are visible with real values.
    - AC-2: Confirm deals list shows 5 deals for it-park, 4 for poblacion.
    - AC-3: Confirm CTA is disabled/greyed for jojo-it-park (`is_accepting_pickup: false`); tapping does nothing.
    - AC-4: Confirm CTA is enabled for jojo-poblacion within opening hours; tapping sets selected branch and navigates.
    - AC-5: Confirm "Get Directions" opens Apple Maps (iOS sim) with correct coordinates.
    - AC-6: Confirm distance shown with location granted; hidden when denied.
    - AC-7: Confirm opening hours render as human-readable text matching seed data.
    - AC-8: Confirm loading spinner visible on fetch; stop API server and confirm error state + back button works.

---

## Phase Completion Rules

A phase is complete when all numbered steps in that phase are executed and the phase gate passes.

- **Phase 1 (API):** `pnpm --filter @jojopotato/api test` passes or is skipped (no-DB). `pnpm typecheck` exits 0.
- **Phase 2 (Utils):** `pnpm typecheck` exits 0 for utils package. `formatOpeningHours` output verified against seed hours.
- **Phase 3 (Types/UI/Extract):** `pnpm typecheck` exits 0 across packages. BRN-001 branch list behavior unchanged.
- **Phase 4 (Screen):** Detail screen renders all required sections in dev build (loading / success / CTA states).
- **Phase 5 (Gates):** All automated gates pass; all 8 manual ACs verified in dev build.

**Phase status key:** PLANNED | IN PROGRESS | CODE DONE | VERIFIED

Current: Phase 1 PLANNED | Phase 2 PLANNED | Phase 3 PLANNED | Phase 4 PLANNED | Phase 5 PLANNED

---

## Dependencies

| Phase | Requires |
|---|---|
| Phase 1 | Postgres running + `deal_branches`, `deals`, `branches` schemas exist (confirmed) |
| Phase 2 | Nothing (pure TS) |
| Phase 3 | Nothing for types/UI; BRN-001 committed code for the 2-line refactor |
| Phase 4 | Phases 1, 2, 3 complete |
| Phase 5 | Phase 4 complete; Postgres running for API test |

---

## Risks

| Risk | Mitigation |
|---|---|
| `notExists` Drizzle subquery returns unexpected results if `dealBranches.deal_id` references are inconsistent | Vitest test asserts exact counts — will catch filtering bugs before the screen ships |
| `formatOpeningHours` produces incorrect output for edge-case hours (all-closed day, midnight close) | Document exact expected output in step 6; validate manually against jojo-poblacion seed data in AC-7 |
| `Platform.OS` type narrowing in `[branchId].tsx` — TypeScript may complain about non-exhaustive match | Use explicit ternary chain; both `'ios'` and non-`'ios'`/non-`'web'` paths always produce a valid URL |
| `expo start` codegen step is easy to skip | Make it step 14 in the explicit gate checklist so it runs before typecheck |
| The 2-line refactor of `index.tsx` (Phase 3) introduces an import cycle | `features/branches/api.ts` imports from `@jojopotato/types` only — no cycle possible |
| `DealCard` `validUntil` prop breaks existing call sites | Prop is optional with a default `undefined` — backward-compatible; no break |

---

## Implementation Checklist

### Phase 1 - API (parallel-safe with Phases 2 and 3)
1. Add `and`, `eq`, `gte`, `lte`, `notExists`, `sql` imports from `drizzle-orm` to `packages/api/src/index.ts`
2. Add `dealBranches`, `deals` imports from `./db/schema/index` to `packages/api/src/index.ts`
3. Add private `computeDiscountLabel(dealType, discountValue)` helper above the new route
4. Add `app.get('/api/branches/:id', ...)` route with branch lookup, deal queries A+B, merge, and discountLabel mapping
5. Create `packages/api/src/__tests__/branch-detail-route.test.ts` with 4 test cases
6. Confirm `packages/api/src/db/schema/index.ts` exports `dealBranches` and `deals`

### Phase 2 - Utils (parallel-safe with Phases 1 and 3)
7. Add `export function formatOpeningHours(openingHoursJson: string): string[]` to `packages/utils/src/hours.ts`
8. Create `packages/utils/src/maps.ts` with `export function buildDirectionsUrl(lat, lng, name, platform)`
9. Append `export * from './maps'` to `packages/utils/src/index.ts`

### Phase 3 - Types/UI/Extraction (parallel-safe with Phases 1 and 2)
10. Confirm `packages/types/src/deals.ts` has `discountLabel` and `validUntil` (no-op if present)
11. Add `validUntil?: string` to `DealCardProps` in `packages/ui/src/components/deal-card.tsx`; render optional text row
12. Create `apps/mobile/src/features/branches/api.ts` with `ApiBranch`, `mapApiBranch`, `ApiBranchDeal`, `mapApiBranchDeal`, `BranchDetailResponse`
13. Remove inline `ApiBranch` and `mapApiBranch` from `apps/mobile/src/app/(tabs)/branches/index.tsx`; add import

### Phase 4 - Detail Screen (requires Phases 1, 2, 3)
14. Build out `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` with imports, state, fetch effect, derived values, and full render

### Phase 5 - Gates (requires Phase 4)
15. Run `expo start` then stop to refresh typed-routes codegen for `[branchId].tsx`
16. Run `pnpm typecheck` — must exit 0
17. Run `pnpm lint` — must produce no new errors
18. Run `pnpm --filter @jojopotato/api test` — new test cases must pass or skip with no-DB log
19. Manual AC verification on dev build: AC-1 through AC-8

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api test` — jojo-it-park returns 5 deals | Hybrid (needs Postgres) | AC-2 (deals count, it-park) |
| `pnpm --filter @jojopotato/api test` — jojo-poblacion returns 4 deals | Hybrid (needs Postgres) | AC-2 (deals count, poblacion) |
| `pnpm --filter @jojopotato/api test` — it-park exclusive absent from poblacion | Hybrid (needs Postgres) | AC-2 (deal exclusion) |
| `pnpm --filter @jojopotato/api test` — branch fields returned for jojo-it-park | Hybrid (needs Postgres) | AC-9 (response shape) |
| `pnpm typecheck` exits 0 | Fully-Automated | AC-10 (TypeScript clean) |
| `pnpm lint` no new errors | Fully-Automated | AC-11 (ESLint clean) |
| Manual: all 7 required branch fields displayed for jojo-it-park | Hybrid (dev build) | AC-1 (all fields) |
| Manual: CTA disabled for jojo-it-park (`is_accepting_pickup: false`) | Hybrid (dev build) | AC-3 (disabled CTA) |
| Manual: CTA enabled + navigates for jojo-poblacion within hours | Hybrid (dev build) | AC-4 (enabled CTA) |
| Manual: "Get Directions" opens Apple Maps with correct coords | Hybrid (dev build / sim) | AC-5 (directions) |
| Manual: distance shown with location grant; hidden without | Hybrid (dev build) | AC-6 (distance conditional) |
| Manual: opening hours render as human-readable text | Hybrid (dev build) | AC-7 (hours format) |
| Manual: loading + error states shown correctly | Hybrid (dev build) | AC-8 (loading/error) |

**Known gap:** HTTP layer (supertest against live Express server) is not tested — the vitest test exercises the query logic directly. Documented as `api-http` known gap consistent with the BRN-001 test strategy.

---

## Test Infra Improvement Notes

- No mobile test runner is configured. Manual AC verification is the only screen-level gate. This is a project-wide known gap — tracked in `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.
- HTTP layer of `GET /api/branches/:id` is not tested via supertest (known gap `api-http`). The Drizzle query logic is verified via the vitest integration test.
- `formatOpeningHours` and `buildDirectionsUrl` are pure functions and could have unit tests added to `packages/utils/src/__tests__/` in a follow-up without any infra work (pure TS, no DB needed). This is not required for the launch gate.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/pickup-branches/active/brn-002-branch-details_10-07-26/brn-002-branch-details_PLAN_10-07-26.md`
2. **Last completed phase or step:** none — plan written, not yet executed
3. **Validate-contract status:** written (2026-07-10) — CONDITIONAL
4. **Context routers:** `process/context/all-context.md` (root router), `process/context/tests/all-tests.md` (test strategy — no runner configured for mobile).
4. **Supporting context files loaded:**
   - `packages/api/src/index.ts` — existing route pattern
   - `packages/api/src/__tests__/branches-route.test.ts` — test structure to mirror
   - `packages/api/src/db/schema/branches.ts`, `deals.ts`, `deal_branches.ts` — schema
   - `packages/utils/src/hours.ts` — `getIsOpenNow` to extend with `formatOpeningHours`
   - `packages/types/src/deals.ts` — `Deal` interface (confirmed: `discountLabel` + `validUntil` already present)
   - `packages/ui/src/components/deal-card.tsx` — `DealCard` to extend with `validUntil`
   - `apps/mobile/src/app/(tabs)/branches/index.tsx` — `ApiBranch` + `mapApiBranch` to extract
5. **Next step for a fresh agent:** ENTER EXECUTE MODE with this plan. Start Phase 1 (step 1 — add imports to `packages/api/src/index.ts`). Phases 1, 2, 3 are parallel-safe. Phase 4 requires all three to be done. Run Phase 5 gates last. See Execute-Agent Instructions in the validate-contract below.

---

## Validate Contract

Status: CONDITIONAL
Date: 10-07-26
date: 2026-07-10
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 1/7 signals (S7 — 5+ files in blast radius). Single feature, independent dimensions, no cross-agent coordination required.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-10 | TypeScript compiles clean across all packages | Fully-Automated | `pnpm typecheck` exits 0 | A |
| AC-11 | No new ESLint errors | Fully-Automated | `pnpm lint` exits 0 | A |
| AC-2a | it-park returns 5 deals (4 global + 1 exclusive) | Hybrid | `pnpm --filter @jojopotato/api test` — precondition: Postgres running, migrations applied, seed applied | A |
| AC-2b | poblacion returns 4 deals (global only) | Hybrid | `pnpm --filter @jojopotato/api test` — same precondition | A |
| AC-2c | it-park exclusive absent from poblacion response | Hybrid | `pnpm --filter @jojopotato/api test` — same precondition | A |
| AC-9 | Branch fields returned with correct shape for jojo-it-park | Hybrid | `pnpm --filter @jojopotato/api test` — same precondition | A |
| AC-1 | All 7 required branch fields visible with real values | Hybrid | Dev build: `pnpm ios` — navigate to jojo-it-park detail screen | A |
| AC-3 | CTA disabled for jojo-it-park (is_accepting_pickup: false) | Hybrid | Dev build: navigate to jojo-it-park detail; confirm CTA disabled/greyed | A |
| AC-4 | CTA enabled + navigates for jojo-poblacion within hours | Hybrid | Dev build: navigate to jojo-poblacion within opening hours; confirm CTA tappable and navigates to order tab | A |
| AC-5 | Get Directions opens Apple Maps on iOS sim with correct coords | Hybrid | Dev build on iOS sim: tap Get Directions; confirm Apple Maps opens | A |
| AC-6 | Distance shown with location grant; hidden when denied | Hybrid | Dev build: grant then deny location permission; confirm distance conditional | A |
| AC-7 | Opening hours render as human-readable text | Hybrid | Dev build: load any branch detail; confirm hours display e.g. "Mon–Thu: 9:00 AM – 9:00 PM" | A |
| AC-8 | Loading spinner visible on fetch; error state on failure | Hybrid | Dev build: load branch; stop API server; confirm error state + back button | A |
| api-http | HTTP layer (supertest against live Express port) | Known-Gap | — | D |
| mobile-unit | Mobile unit/component test coverage | Known-Gap | — | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: Known-Gap rows above use gap-resolution D, not the `strategy:` column. The `strategy:` column carries ONLY Fully-Automated / Hybrid / Agent-Probe for the 3 proving strategies.

Legacy line form (retained for existing consumers):
- packages/api — new route: Hybrid: `pnpm --filter @jojopotato/api test` (Postgres required)
- packages/api — typecheck: Fully-automated: `pnpm typecheck`
- packages/api — lint: Fully-automated: `pnpm lint`
- packages/ui — DealCard validUntil: Fully-automated: `pnpm typecheck` (optional prop; backward-compat)
- apps/mobile — detail screen: Hybrid: `pnpm ios` dev build + manual AC checklist
- api-http: known-gap: documented, consistent with BRN-001 strategy
- mobile-unit: known-gap: project-wide gap, tracked in backlog

Failing stubs (Fully-Automated rows only):
```
test("should compile TypeScript clean across all packages", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: pnpm typecheck exits 0")
})
test("should produce no new lint errors", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: pnpm lint exits 0")
})
```

Dimension findings:
- Infra fit: CONCERN — useUserLocation destructuring mismatch in Phase 4 code block (fixed via plan update P1 applied above)
- Test coverage: PASS — strategy matches repo reality; known gaps documented
- Breaking changes: PASS — all changes additive or extract-only; DealCard prop optional; no existing consumers broken
- Security surface: PASS — new public read-only route, same security posture as existing GET /api/branches; no auth/billing/secrets touched

Section findings:
- Phase 1 API: PASS — all import targets confirmed; dealBranches/deals exported from schema/index; seed counts verified (5 it-park, 4 poblacion); all 6 deal_type enum values covered by computeDiscountLabel; notExists correctness verified
- Phase 2 Utils: PASS — edit targets exist; new maps.ts creates cleanly; 00:00 midnight display documented as 12:00 AM
- Phase 3 Types/UI/Extract: PASS — Deal type confirmed with discountLabel+validUntil; DealCard backward-compat verified (only 1 consumer: component-showcase.tsx, no validUntil passed); extraction path confirmed
- Phase 4 Screen: CONCERN — original plan used { location } from useUserLocation() but hook returns { coords, status }; FIXED in plan update P1 above
- Phase 5 Gates: PASS — all gate commands confirmed real and runnable

Execute-Agent Instructions:
- E1: When adding drizzle-orm imports (step 1), merge into existing `import { asc, eq } from 'drizzle-orm'` line — add only `and, gte, lte, notExists, sql`. DO NOT create a duplicate `eq` import.
- E2: Insert new route handler BEFORE `app.listen()` (currently line 61 of packages/api/src/index.ts). Position: after the existing GET /api/branches route and before app.listen.
- E3: In formatOpeningHours, treat close === '00:00' as midnight — display as '12:00 AM'. Apply same rule for open === '00:00' if encountered.
- E4: Phase 4 state uses `const { coords, status: locationStatus } = useUserLocation()` (ALREADY CORRECTED in plan above). Do not revert to `{ location }`.
- E5: If `Colors` is not exported from `@/constants/theme`, use `useTheme()` hook instead (pattern: `const theme = useTheme()` as used in branches/index.tsx). Check before writing Phase 4.

Open gaps:
- api-http: known-gap: documented as project-wide strategy — HTTP supertest layer not tested; Drizzle query logic tested instead. Consistent with BRN-001. No backlog action needed (already established pattern).
- mobile-unit: known-gap: documented as NEW PLAN REQUIRED — see `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`
- formatOpeningHours unit tests: known-gap: pure function, no infra needed; deferred to a follow-up plan when utils test runner is introduced

What this coverage does NOT prove:
- pnpm typecheck: does not prove runtime behavior, DB query correctness, UI rendering, or loading/error state timing
- pnpm lint: does not prove semantic correctness, runtime behavior, or visual layout
- pnpm --filter @jojopotato/api test (Hybrid): does not prove HTTP layer (supertest), 404/500 response shapes via HTTP, time-window edge cases with future/past dates, or concurrent request behavior
- Dev build manual ACs: does not prove automated regression; does not prove Android/web directions URL correctness; does not prove behavior under slow network beyond the manual AC-8 check

Gate: CONDITIONAL (concerns noted; P1 plan update applied; E1-E5 execute-agent instructions recorded; user accepted via autonomous /goal execution)
Accepted by: session (autonomous, /goal execution) — concerns accepted: (1) useUserLocation destructuring mismatch fixed via P1 plan update; (2) eq import dedup addressed via E1 execute-agent instruction

---

## Autonomous Goal Block

SESSION GOAL: Implement BRN-002 Branch Details Screen end-to-end — API endpoint, utility functions, types/UI, detail screen, and gate verification.
Charter + umbrella plan: N/A — single plan
Autonomy: auto-proceed on all reversible decisions; surface only hard stops
Hard stop conditions / safety constraints:
- Do not modify any schema file (branches.ts, deals.ts, deal_branches.ts) — plan explicitly marks these as read-only references
- Do not add auth guards or billing logic to GET /api/branches/:id — it is intentionally public
- Do not deviate from the Phase dependency order: Phases 1+2+3 parallel-safe; Phase 4 requires all three complete; Phase 5 last
- Phase 4 state: use { coords, status: locationStatus } from useUserLocation() — NOT { location } (see E4 in validate-contract)
- Insert new route handler BEFORE app.listen() (see E2)
- Merge drizzle-orm imports — do NOT duplicate eq (see E1)
Next phase: EXECUTE: process/features/pickup-branches/active/brn-002-branch-details_10-07-26/brn-002-branch-details_PLAN_10-07-26.md
Validate contract: inline in plan (## Validate Contract section)
Execute start: pnpm typecheck | pnpm lint | pnpm --filter @jojopotato/api test (Postgres required) | high-risk pack: no
