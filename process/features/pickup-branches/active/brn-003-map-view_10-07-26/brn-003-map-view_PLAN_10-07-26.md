---
name: plan:brn-003-map-view
description: "Map view toggle for the Branch Locator — expo-maps install, BranchMap component, toggle wiring in index.tsx"
date: 10-07-26
feature: pickup-branches
phase: "brn-003"
---

# BRN-003: Map View Toggle for Branch Locator — PLAN

Date: 2026-07-10
**SPEC:** `process/features/pickup-branches/active/brn-003-map-view_10-07-26/brn-003-map-view_SPEC_10-07-26.md`
Status: ⏳ PLANNED
Complexity: SIMPLE (one session, 4 sequential phases)

---

## Overview

Add an interactive map view to the Branch Locator screen (`apps/mobile/src/app/(tabs)/branches/index.tsx`). Users toggle between the existing list view and the new map view. The map shares the same `filteredBranches` state — no re-fetch, no state reset on toggle. Web always shows list-only. iOS uses Apple Maps; Android uses Google Maps via expo-maps.

**Goals:**
- Install `expo-maps` and wire its native plugin into `app.json` (or `app.config.ts`).
- Create a native `BranchMap` component plus a `BranchMap.web.ts` null stub.
- Add a `viewMode` toggle in `index.tsx`, guarded by `Platform.OS !== 'web'`.
- Achieve 10 SPEC ACs with zero new typecheck/lint errors.

---

## Touchpoints

| File | Change type |
|---|---|
| `apps/mobile/app.json` (or new `apps/mobile/app.config.ts`) | Add expo-maps plugin + Android key config |
| `apps/mobile/package.json` | Add `expo-maps` (pinned alpha version) |
| `apps/mobile/src/app/(tabs)/branches/index.tsx` | Add `viewMode` state, toggle control, conditional render |
| `apps/mobile/src/features/branches/components/branch-map.tsx` | NEW — native map component |
| `apps/mobile/src/features/branches/components/branch-map.web.ts` | NEW — web null stub |
| `pnpm-lock.yaml` | Updated by `npx expo install expo-maps` |

**Read-only (no changes):**
- `apps/mobile/src/features/branches/api.ts` — `mapApiBranch`, `ApiBranch`
- `apps/mobile/src/hooks/use-user-location.ts` (+ `.web.ts`) — `coords`, `status`
- `packages/utils/src/hours.ts` — `getIsOpenNow`
- `packages/types/src/pickup.ts` — `PickupBranch` (numeric `latitude`, `longitude`)
- `packages/ui/src/index.ts` — `Button` (variant `outline`/`primary`)
- `apps/mobile/src/constants/theme.ts` — theme tokens (Spacing, Colors, etc.)
- `apps/mobile/src/app/(tabs)/branches/_layout.tsx` — no change
- `apps/mobile/src/features/branches/hooks/use-selected-branch.ts` — reused as-is

---

## Public Contracts

- **`BranchMap` props (native):** `branches: PickupBranch[]`, `coords: { latitude: number; longitude: number } | null`, `onBranchPress: (branchId: string) => void`, `mode?: ThemeMode`. No change to any external API, DB schema, or cross-package types.
- **`BranchMap.web.ts`:** exports `BranchMap` as `() => null` with the identical TS signature — ensures the web import is type-safe and the bundle is clean.
- **`index.tsx`:** no change to its exported default (`BranchLocatorScreen`). The new toggle and map view are internal to the component; no prop-surface change.

---

## Blast Radius

- **Packages touched:** `apps/mobile` only (all changes live here; no `packages/*` source changes).
- **Files modified:** 3 existing (`app.json` or new `app.config.ts`, `package.json`, `index.tsx`) + 2 new (`branch-map.tsx`, `branch-map.web.ts`).
- **Risk class:** MEDIUM — native module install (requires dev-client rebuild); alpha library (expo-maps) with a known-gap API surface; no schema/auth/billing/API changes.
- **Web build:** guarded entirely — web stub + `Platform.OS !== 'web'` toggle guard mean web bundle never imports expo-maps.

---

## Key Decisions and Notes

### Google Maps API key placement (IMPORTANT — correct the current misplacement)

The Google Maps API key is a **build-time native config for `apps/mobile`** — it must NOT live in `packages/api/.env` (where it was previously noted). It belongs in the Expo/mobile build config. Two options:

**Option A (quick path):** Place the key directly in `apps/mobile/app.json` under the expo-maps plugin config. The key is committed to git; it is acceptable only if restricted in Google Cloud to bundle ID `ph.jojopotato.mobile` + signing SHA-1.

**Option B (recommended):** Convert `app.json` to `apps/mobile/app.config.ts` (dynamic config). Read `process.env.GOOGLE_MAPS_API_KEY` at build time; store the real key in a `.env.local` (gitignored) or an EAS Secret. The key never enters the git history.

**Recommendation: Option B.** The extra effort is one file rename + a few lines of TS. The key stays out of git. If the team is not using EAS yet, `.env.local` + `.gitignore` achieves the same result for local builds.

Whichever option is chosen: the key must be restricted in Google Cloud (Maps SDK for Android, restricted to `ph.jojopotato.mobile` + the relevant SHA-1 fingerprint). This is a Google Cloud step, not a code step.

### expo-maps alpha API known-gap

expo-maps is in alpha as of SDK 57. The exact import paths, marker prop names (`annotation` vs `marker`), `tintColor` support, and region/camera API may differ from documentation snippets. During EXECUTE:
1. Confirm the installed version's type definitions (`node_modules/expo-maps/src/` or `.d.ts` files) before writing the component.
2. If `tintColor` is available on markers, use it for the muted pin instead of the opacity wrapper approach — but treat this as a VALIDATE probe, not an assumption.
3. If the alpha API shape diverges from what is in this plan, adjust the component props/import accordingly and note the deviation in the phase report.

### Dev-client rebuild requirement

expo-maps is a native module. It cannot run in Expo Go. After `npx expo install expo-maps` and plugin config, the developer must run a fresh Expo development client build (`npx expo run:ios` or `npx expo run:android`) before any map functionality can be verified on device/simulator. This is a delivery prerequisite for manual ACs, not a blocker for the code implementation steps.

### Pinned version

After `npx expo install expo-maps`, capture the resolved version and pin it explicitly in `apps/mobile/package.json` (e.g. `"expo-maps": "0.x.y-alpha.z"`). Do not leave it as `"*"` or a loose range — alpha packages can drift unexpectedly between installs.

---

## Implementation Checklist

### Phase 1 — Install and native config

- [ ] **Step 1.1** — In `apps/mobile/`, run `npx expo install expo-maps`. This updates `package.json` and `pnpm-lock.yaml` with the resolved alpha version.
- [ ] **Step 1.2** — Open `apps/mobile/package.json`. Pin the resolved `expo-maps` version explicitly (change any `*` or loose range to the exact `0.x.y-alpha.z` string installed in Step 1.1).
- [ ] **Step 1.3** — Choose key placement option (A or B from "Key Decisions" above).
  - **If Option A:** Open `apps/mobile/app.json`; add the expo-maps plugin entry under `plugins` and the `googleMapsApiKey` field under the plugin's config (key value is the real restricted Android key or a placeholder string `"PLACEHOLDER_REPLACE_BEFORE_ANDROID_BUILD"`).
  - **If Option B (recommended):** Create `apps/mobile/app.config.ts`. Copy the existing `app.json` content into the `export default` block as a JS object. Replace any `app.json` reference with `app.config.ts` in tooling (Expo auto-detects the `.ts` variant). Add `import 'dotenv/config'` at the top. Wire `googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? ''` in the plugin config. Add `GOOGLE_MAPS_API_KEY=your_key_here` to `apps/mobile/.env.local` (gitignored). Add `apps/mobile/.env.local` to `.gitignore` if not already present.
- [ ] **Step 1.4** — Verify that `apps/mobile/app.json` (or `app.config.ts`) includes the expo-maps plugin entry for both iOS (Apple Maps, no key needed) and Android (Google Maps, key wired). The minimum iOS deployment target must be set to `"18.0"` in the `ios` config block if not already set.
- [ ] **Step 1.5** — Note in a comment in `app.json`/`app.config.ts` that a **dev-client rebuild is required** before the map can be tested (`npx expo run:ios` or `npx expo run:android`).

### Phase 2 — BranchMap native component

- [ ] **Step 2.1** — Create the directory `apps/mobile/src/features/branches/components/` (if it does not exist).
- [ ] **Step 2.2** — Create `apps/mobile/src/features/branches/components/branch-map.tsx`. This is the native-only map component. Contents:
  - Import `PickupBranch` from `@jojopotato/types`.
  - Import `getIsOpenNow` from `@jojopotato/utils`.
  - Import the platform map component(s) from `expo-maps`. **Confirm the exact import names from the installed type defs** (e.g. `AppleMaps`, `GoogleMaps`, or a unified `MapView`) before writing the import. Use `Platform.OS === 'ios'` to choose `AppleMaps` vs `GoogleMaps` if they are separate exports; use a single `MapView` if the library provides one.
  - Import `Platform` from `react-native`.
  - Import `ThemeMode` from `@jojopotato/ui` (or `packages/ui` theme — check the export shape; use the correct import path).
  - Define `CEBU_FALLBACK` constant inside this file: `{ latitude: 10.323, longitude: 123.900, latitudeDelta: 0.05, longitudeDelta: 0.05 }`.
  - Export `BranchMap` as a named export (NOT default) so the web stub can re-export it by name.
  - Props interface: `{ branches: PickupBranch[]; coords: { latitude: number; longitude: number } | null; onBranchPress: (branchId: string) => void; mode?: ThemeMode }`.
  - Derive `initialRegion` from `coords` when non-null, else `CEBU_FALLBACK`.
  - For each `branch` in `branches`: compute `const isOpen = getIsOpenNow(branch.openingHours)` and `const isActive = isOpen && branch.isAcceptingPickup`. Muted treatment for `!isActive`: wrap the pin in a `<View style={{ opacity: 0.4 }}>` custom marker. Do NOT depend on a `tintColor` prop unless the installed type defs confirm it exists (probe at VALIDATE).
  - Marker `onPress` → `onBranchPress(branch.id)`.
  - The map container should be `flex: 1` and `width: '100%'` so it fills the content area.
  - Use `@jojopotato/ui` theme tokens (imported via `useTheme()` hook or passed via `mode` prop) for any background or overlay colors — no hardcoded hex.
- [ ] **Step 2.3** — Create `apps/mobile/src/features/branches/components/branch-map.web.ts`. This is the platform web stub. Contents:
  - Import ONLY the props type from a local types file or declare it inline — do NOT import from `expo-maps`.
  - Export `BranchMap` with the same signature as the native component but returning `null` (a `() => null` function with explicit type annotation).
  - The file extension `.web.ts` ensures Metro/Expo Router picks it up automatically on web builds instead of `branch-map.tsx`.

### Phase 3 — Toggle and wiring in index.tsx

- [ ] **Step 3.1** — Open `apps/mobile/src/app/(tabs)/branches/index.tsx`. Add the import for `BranchMap`:
  ```
  import { BranchMap } from '@/features/branches/components/branch-map';
  ```
  Metro resolves `.web.ts` on web and `.tsx` on native automatically — the import is unconditional.
- [ ] **Step 3.2** — Add import for `Button` from `@jojopotato/ui` (already partially imported; check existing imports to avoid a duplicate).
- [ ] **Step 3.3** — Add `viewMode` state inside `BranchLocatorScreen`:
  ```
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  ```
- [ ] **Step 3.4** — Add the toggle control JSX immediately after the `<Input ... />` search bar and before the loading/error/list block. Wrap it with `Platform.OS !== 'web'` so it never renders on web:
  ```jsx
  {Platform.OS !== 'web' && (
    <View style={styles.toggleRow}>
      <Button
        label="List"
        variant={viewMode === 'list' ? 'primary' : 'outline'}
        iconName="list-outline"
        onPress={() => setViewMode('list')}
        mode={mode}
      />
      <Button
        label="Map"
        variant={viewMode === 'map' ? 'primary' : 'outline'}
        iconName="map-outline"
        onPress={() => setViewMode('map')}
        mode={mode}
      />
    </View>
  )}
  ```
  Check the `Button` component's actual props in `packages/ui/src/components/button.tsx` during EXECUTE — adjust `iconName`, `label`, and `variant` to match the real prop names. A `Pressable` + theme-token row is a permitted substitution if `Button` feels heavy here; the toggle visual treatment must still use `@jojopotato/ui` theme tokens.
- [ ] **Step 3.5** — Wrap the existing loading/error/list render block in a conditional. Keep the loading and error states unconditional (they show for both views). For the success state, conditionally render list OR map:
  ```jsx
  ) : viewMode === 'map' && Platform.OS !== 'web' ? (
    <BranchMap
      branches={filteredBranches}
      coords={coords}
      onBranchPress={(id) => {
        setSelectedBranch(id);
        router.push({
          pathname: '/(tabs)/branches/[branchId]',
          params: { branchId: id },
        });
      }}
      mode={mode}
    />
  ) : (
    <FlatList ... />  // existing FlatList block unchanged
  )
  ```
  Ensure `setSelectedBranch` is called before `router.push` (matching the pattern on the existing list-row tap). The `filteredBranches` array is shared — toggling does NOT reset `query`, `branches`, or any sort state.
- [ ] **Step 3.6** — Add `toggleRow` to the `StyleSheet.create` call at the bottom of `index.tsx`:
  ```
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.two,  // use existing Spacing token
    marginBottom: Spacing.three,
    justifyContent: 'flex-end',
  },
  ```
  Adjust spacing using existing `Spacing` tokens from `@/constants/theme` — no hardcoded pixel values.

### Phase 4 — Verification gates

- [ ] **Step 4.1** — Run `pnpm typecheck` from the monorepo root. Exit must be 0. Fix any type errors before proceeding.
- [ ] **Step 4.2** — Run `pnpm lint` from the monorepo root. Exit must be 0 with no new lint errors. Fix any new errors before proceeding.
- [ ] **Step 4.3** — Run `pnpm --filter @jojopotato/mobile typecheck` as a scoped sanity check on the mobile package alone.
- [ ] **Step 4.4** — (MANUAL — requires dev-client rebuild) On iOS simulator: rebuild with `npx expo run:ios`. Verify ACs: AC-1 (pin count = list count), AC-2 (search preserved on toggle), AC-3 (pin-tap navigates correctly), AC-4 (muted pins for closed/pickup-off branches), AC-5 (map centers on user location when granted), AC-6 (Cebu fallback when denied), AC-7 (web list-only verified separately in browser).
- [ ] **Step 4.5** — (MANUAL — web) Run `pnpm web`. Open Branches tab in browser. Confirm: no toggle visible, no map component, no JS console errors. Confirms AC-7 and AC-8.
- [ ] **Step 4.6** — (KNOWN-GAP NOTE) expo-maps alpha API probe: before finalizing `branch-map.tsx`, read the installed type defs to confirm exact import names, marker prop shape, and whether `tintColor` is available. If `tintColor` is confirmed, prefer it over the opacity-wrapper approach for muted pins and document the change in the phase report.

---

## Acceptance Criteria Coverage

| AC | Description | Gate |
|---|---|---|
| AC-1 | Pin count = filteredBranches count | Hybrid (typecheck + manual native) |
| AC-2 | Search/filter preserved on toggle | Hybrid (state not reset by design; manual confirm) |
| AC-3 | Pin tap → Branch Details nav | Hybrid (typed route; manual confirm) |
| AC-4 | Closed/pickup-off pins visually muted | Hybrid (manual native; opacity wrapper safe path) |
| AC-5 | Map centers on user location | Hybrid (manual with simulator location) |
| AC-6 | Cebu fallback when location denied | Hybrid (manual: deny location, open map) |
| AC-7 | Web shows list-only, no JS errors | Hybrid (pnpm web + browser manual) |
| AC-8 | Web build type-safe + lint-clean | Fully-Automated (`pnpm typecheck && pnpm lint`) |
| AC-9 | TypeScript types compile cleanly | Fully-Automated (`pnpm typecheck`) |
| AC-10 | ESLint passes, no new errors | Fully-Automated (`pnpm lint`) |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm typecheck` exits 0 | Fully-Automated | AC-8, AC-9 — TS types clean across all packages |
| `pnpm lint` exits 0 (no new errors) | Fully-Automated | AC-10, AC-8 — ESLint clean |
| `pnpm --filter @jojopotato/mobile typecheck` exits 0 | Fully-Automated | AC-9 scoped to mobile |
| Manual: list count = pin count before/after search | Hybrid | AC-1 |
| Manual: type search term, toggle views, confirm search preserved | Hybrid | AC-2 |
| Manual: tap each branch pin, verify correct route param | Hybrid | AC-3 |
| Manual: confirm muted pin for jojo-it-park (isAcceptingPickup=false) | Hybrid | AC-4 |
| Manual: grant location on simulator, open map, confirm centering | Hybrid | AC-5 |
| Manual: deny location, open map, confirm Cebu fallback region | Hybrid | AC-6 |
| Manual: `pnpm web`, open Branches tab, no toggle, no errors | Hybrid | AC-7 |
| expo-maps type-def probe: tintColor availability (VALIDATE probe) | Agent-Probe | AC-4 (upgrade path for muted pins) |

---

## Dependencies and Prerequisites

| Item | Type | Status |
|---|---|---|
| `expo-maps` alpha package available on npm | External | Confirmed (Expo SDK 57 compatible) |
| Google Maps API key (Android) | External prerequisite | Developer must provision separately; map blank on Android without it; code builds independently |
| Dev-client rebuild (`npx expo run:ios` / `npx expo run:android`) | Build prerequisite | Required before any manual AC verification on device/simulator |
| BRN-001 (`filteredBranches`, `coords`, `useUserLocation`, `getIsOpenNow`) | Internal | DONE — substrate exists in index.tsx |
| BRN-002 (`/(tabs)/branches/[branchId]` details screen) | Internal | DONE — pin-tap destination exists |
| `packages/types/src/pickup.ts` — `PickupBranch` with numeric lat/lng | Internal | DONE — confirmed in SPEC background |
| iOS minimum deployment target 18.0 | Config | Must be set in `app.json` / `app.config.ts` `ios` block |

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| expo-maps alpha API differs from plan's assumed shape | HIGH | Step 4.6 explicitly probes installed type defs before finalizing component; plan allows deviation if documented |
| `tintColor` prop not available on alpha markers | MEDIUM | Default to opacity-wrapper approach (Step 2.2); probe at VALIDATE as Known-Gap upgrade path |
| `ThemeMode` import path incorrect | LOW | Check `packages/ui/src/index.ts` exports during EXECUTE; adjust import |
| `Button` prop names differ from plan's assumed shape | LOW | Check `packages/ui/src/components/button.tsx` during EXECUTE; a Pressable+tokens fallback is permitted |
| Web stub type mismatch if props interface diverges | LOW | Declare inline type in `.web.ts` that matches native component exactly; Step 4.1 (typecheck) catches this |
| `app.config.ts` conversion breaks existing Expo build | LOW | `app.config.ts` is the standard Expo dynamic config pattern; the `.json` to `.ts` migration is well-documented |

---

## Out of Scope (explicitly)

- Web map support (expo-maps has no web implementation — list-only on web is permanent for this issue)
- Marker clustering
- Directions from map pins (BRN-004 absorbed into BRN-002, already done)
- Callout/preview bubbles on pin tap
- Custom map theming or dark-mode map tiles
- Offline maps or tile caching
- Google Maps on iOS (expo-maps uses Apple Maps on iOS — fixed constraint)

---

## Test Infra Improvement Notes

No new test infrastructure is introduced or recommended by this plan. The project-wide mobile test runner gap (no Jest/Vitest/Detox for `apps/mobile`) is the same known gap documented in `process/context/tests/all-tests.md` and present in BRN-001/002. All map behavior ACs (AC-1 through AC-7) remain Hybrid because no automated assertion of React Native rendering or map pin state is possible without a runner. A future Detox or Maestro E2E harness (tracked in `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) would convert these Hybrid gates to Fully-Automated.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/pickup-branches/active/brn-003-map-view_10-07-26/brn-003-map-view_PLAN_10-07-26.md`
2. **Last completed phase/step:** None — plan freshly written, ready for VALIDATE then EXECUTE.
3. **Validate-contract status:** Pending — vc-validate-agent writes this section before EXECUTE begins.
4. **Supporting context files loaded:**
   - `process/features/pickup-branches/active/brn-003-map-view_10-07-26/brn-003-map-view_SPEC_10-07-26.md`
   - `apps/mobile/src/app/(tabs)/branches/index.tsx`
   - `process/context/tests/all-tests.md`
   - `process/context/all-context.md`
5. **Next step for a fresh agent:** Confirm `expo-maps` is installed in `apps/mobile` and the alpha version is pinned. Read installed type defs from `node_modules/expo-maps/` to confirm exact import names and marker prop shape before writing `branch-map.tsx`. Follow Phase 1 → Phase 2 → Phase 3 → Phase 4 in order. Check `packages/ui/src/components/button.tsx` and `packages/ui/src/index.ts` for exact `Button` prop names before Step 3.4.

---

## Phase Completion Rules

This plan is SIMPLE (one session). Phase completion rules:

- **CODE DONE:** all Implementation Checklist steps complete; `pnpm typecheck` and `pnpm lint` exit 0.
- **VERIFIED:** CODE DONE + all Hybrid manual ACs confirmed on a native dev build (iOS simulator or Android device) + web list-only confirmed in browser. Manual ACs require a dev-client rebuild (native module prerequisite).
- Do not mark **VERIFIED** on typecheck/lint alone — map rendering ACs (AC-1 through AC-7) require runtime confirmation.
- Google Maps API key and dev-client rebuild are delivery prerequisites; their absence blocks Android VERIFIED but does not block iOS VERIFIED or CODE DONE.

---

## Validate Contract

Status: CONDITIONAL
Date: 10-07-26
date: 2026-07-10
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 2/7 signals (S3: multiple concern dimensions, S7: 6 blast-radius files). Single package, single session, no cross-agent coordination needed.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-8/AC-9 | TypeScript types compile cleanly across all packages including new branch-map.tsx and web stub | Fully-Automated | `pnpm typecheck` exits 0 from monorepo root | A |
| AC-10/AC-8 | ESLint passes with no new errors across monorepo | Fully-Automated | `pnpm lint` exits 0 from monorepo root | A |
| AC-9-scoped | Mobile package alone typechecks (scoped sanity check) | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` exits 0 | A |
| AC-1 | Map pin count equals filteredBranches count before and after search | Hybrid | Rebuild dev client (`npx expo run:ios`); manual count: compare pin count to list item count with no search, then with "IT" search | B |
| AC-2 | Toggle preserves search state — type term, toggle views, confirm state unchanged | Hybrid | Manual: type search term → toggle to map → confirm reduced pins → toggle back → confirm search text and list unchanged | B |
| AC-3 | Pin tap navigates to correct branch details route with correct branchId param | Hybrid | Manual: tap each seeded branch pin; verify each navigates to correct `/(tabs)/branches/[branchId]` route | B |
| AC-4 | Closed/pickup-off branches render as muted/dimmed pins; open branches render full-color | Hybrid | Manual: verify jojo-it-park (isAcceptingPickup=false) shows muted pin; verify jojo-poblacion shows full pin; test at off-hours for hours-based mute | B |
| AC-5 | Map centers on user location when permission granted | Hybrid | Manual: grant location on iOS simulator with simulated location; switch to map; confirm camera centers on device location | B |
| AC-6 | Map centers at Cebu fallback (lat 10.323, lng 123.900, delta ~0.05) when location denied | Hybrid | Manual: deny location on simulator; switch to map; confirm fallback region shows all three seeded branches | B |
| AC-7 | Web shows list-only, no toggle, no JS errors | Hybrid | `pnpm web`; open browser Branches tab; confirm no toggle visible, no map component, no console errors | B |
| expo-maps-api-shape | expo-maps alpha import names, marker props, region API shape match installed package | Agent-Probe | Execute-agent: read `node_modules/expo-maps/` type defs before writing branch-map.tsx; document exact import names and region shape in phase report | D |
| mobile-runner-gap | Automated assertion of React Native rendering, pin count, and map state | Known-Gap | No mobile RN test runner (Detox/Maestro not configured) — pre-existing project-wide gap | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value — it is a named residual row carried via gap-resolution D.

Legacy line form:
- TypeScript type safety: Fully-Automated: `pnpm typecheck` exits 0
- ESLint clean: Fully-Automated: `pnpm lint` exits 0
- Map behavior ACs (AC-1 through AC-7): Hybrid: dev-client rebuild + manual device/browser verification
- expo-maps API shape: Agent-Probe: execute-agent reads installed type defs before writing component
- Automated RN assertions: Known-Gap: no mobile test runner; tracked in backlog

Failing stubs (Fully-Automated rows only):

```
// Stub for: TypeScript type safety across all packages
test("should compile branch-map.tsx and branch-map.web.ts without TypeScript errors", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run `pnpm typecheck` exits 0; this stub is a placeholder for the fully-automated gate")
})

// Stub for: ESLint passes with no new errors
test("should pass pnpm lint with no new errors after branch-map and index.tsx changes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run `pnpm lint` exits 0; this stub is a placeholder for the fully-automated gate")
})

// Stub for: Mobile package scoped typecheck
test("should pass pnpm --filter @jojopotato/mobile typecheck", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run `pnpm --filter @jojopotato/mobile typecheck` exits 0")
})
```

Dimension findings:
- Infra fit: CONCERN — iOS deploymentTarget 18.0 not set in app.json yet; must be added in Step 1.4; accepted per SPEC constraint
- Test coverage: PASS — tiers correctly assigned (Fully-Automated for type/lint gates; Hybrid for runtime ACs; Known-Gap documented for missing RN runner)
- Breaking changes: PASS — no existing consumers broken; BranchMap is new; index.tsx default export unchanged; app.json changes are build-time only
- Security surface: CONCERN — Google Maps API key must use Option B (app.config.ts + env var, never committed to git); Option A is security anti-pattern; EXECUTE-agent must default to Option B
- Section A feasibility (Phase 1): CONCERN — app.config.ts conversion is highest-risk step (bad TS = app won't build); .gitignore specificity for apps/mobile/.env.local not called out; .env.example needs GOOGLE_MAPS_API_KEY entry
- Section B feasibility (Phase 2): CONCERN — expo-maps alpha known-gap; .web.ts stub return type needs `React.ReactElement | null` annotation, not bare `null`; CEBU_FALLBACK region shape is provisional pending type-def inspection; type-def inspect must occur BEFORE Step 2.2, not at Step 4.6
- Section C feasibility (Phase 3): PASS — all wiring confirmed in ground-truth index.tsx; filteredBranches, coords, mode, setSelectedBranch, router.push all verified; Button props confirmed
- Section D feasibility (Phase 4): PASS — all gate commands verified from all-tests.md; hybrid manual prereqs correctly documented

Open gaps:
- expo-maps alpha API shape: known-gap: documented as accepted CONDITIONAL — execute-agent inspects type defs before writing component; opacity-wrapper is safe fallback path
- mobile-runner-gap: known-gap: documented as NEW PLAN REQUIRED — see `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`

What this coverage does NOT prove:
- pnpm typecheck: does NOT prove runtime map rendering correctness, pin count accuracy, toggle state preservation, pin-tap navigation success, location centering, Cebu fallback accuracy, or web visual appearance — type safety only
- pnpm lint: does NOT prove any runtime behavior — code style and ESLint rules only
- pnpm --filter @jojopotato/mobile typecheck: does NOT prove cross-package type correctness (root typecheck covers that); scoped sanity only
- Hybrid (manual device): does NOT prove correctness on Android (only iOS simulator unless the developer also runs Android device tests); does NOT prove load performance or behavior under slow network
- Agent-Probe (type-def inspection): does NOT prove the component renders correctly at runtime — only that the API shape is used correctly in source code
- Known-Gap rows: NOT proven by this plan; require future Detox/Maestro harness

Gate: CONDITIONAL (concerns noted — all accepted via execute-agent instructions and known-gap documentation)
Accepted by: session (autonomous, /goal execution) — accepted concerns: (1) iOS deploymentTarget 18.0 missing from app.json — instruction to add in Step 1.4; (2) Google Maps key must use Option B — instruction to default to app.config.ts; (3) app.config.ts conversion sequencing — execute-agent instruction to convert incrementally; (4) expo-maps alpha API known-gap — type-def inspect before Step 2.2; (5) web stub return type annotation; (6) .gitignore specificity for apps/mobile/.env.local

## Execute-Agent Instructions

These concerns cannot be fixed by plan text alone — they are instructions for the execute-agent to follow during implementation:

**E1 — Google Maps API key (REQUIRED, before Step 1.3):** Default to Option B (app.config.ts + process.env.GOOGLE_MAPS_API_KEY). Do NOT commit the real Google Maps API key to git under any circumstances. If the developer has not yet provisioned the key, use an empty string or placeholder in .env.local. Also update `apps/mobile/.env.example` to document `GOOGLE_MAPS_API_KEY=` as a required variable for Android map support.

**E2 — app.config.ts conversion sequencing (REQUIRED, at Step 1.3):** Convert incrementally: (a) copy app.json content into app.config.ts verbatim as a JS export default object; (b) run `pnpm typecheck` to confirm the TS conversion is valid before adding env var logic; (c) add `import 'dotenv/config'` and `googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? ''`; (d) run typecheck again. Note: once `app.config.ts` exists, Expo CLI ignores `app.json` automatically — do NOT maintain both files. Delete `app.json` after confirming `app.config.ts` loads correctly (or rename it to `app.json.bak` for safety).

**E3 — .gitignore update (REQUIRED, at Step 1.3):** Add `apps/mobile/.env.local` to `apps/mobile/.gitignore` (preferred) or the root `.gitignore`. Verify this line is present before completing Phase 1.

**E4 — expo-maps type-def inspection PRECONDITION (REQUIRED, before Step 2.2):** After `npx expo install expo-maps` completes (Step 1.1), read the installed type definitions from `node_modules/expo-maps/` (look for `.d.ts` files or `src/` TypeScript sources) BEFORE writing any line of `branch-map.tsx`. Determine: (a) exact import names for the map component(s); (b) exact prop names for markers/annotations; (c) whether `tintColor` exists on marker props; (d) the region/camera API shape (region object with lat/lng/delta vs camera position vs initialBounds). Document findings in the phase report. Adapt the CEBU_FALLBACK constant shape and all marker prop usage to match the installed API — treat the plan's assumed shapes as provisional until confirmed.

**E5 — web stub return type annotation (REQUIRED, at Step 2.3):** The `branch-map.web.ts` stub must annotate the return type as `React.ReactElement | null` (not bare TypeScript `null`) to be type-compatible with the native component's return type. Import `React` from `react` in the stub file even though it returns null, so the type annotation resolves correctly. Example:
```ts
import React from 'react';
import type { PickupBranch } from '@jojopotato/types';
import type { ThemeMode } from '@jojopotato/ui';

interface BranchMapProps {
  branches: PickupBranch[];
  coords: { latitude: number; longitude: number } | null;
  onBranchPress: (branchId: string) => void;
  mode?: ThemeMode;
}

export function BranchMap(_props: BranchMapProps): React.ReactElement | null {
  return null;
}
```

**E6 — run pnpm typecheck incrementally (RECOMMENDED):** Run `pnpm typecheck` after each phase (Phase 1, Phase 2, Phase 3) rather than only at Phase 4. Catch type errors early — expo-maps alpha types may cause unexpected breakage that is easier to fix before the full component is written.

**E7 — move Google Maps key out of packages/api/.env (REQUIRED, if key is already there):** If a `GOOGLE_MAPS_API_KEY` or similar entry exists in `packages/api/.env` or `packages/api/.env.example`, remove it from there. The key belongs only in `apps/mobile/app.config.ts` (read via `process.env.GOOGLE_MAPS_API_KEY` at Expo build time). It must NEVER be present in the API package's environment.

## Autonomous Goal Block

SESSION GOAL: BRN-003 Map View Toggle for Branch Locator — install expo-maps, create BranchMap component, wire toggle in branches/index.tsx, achieve 10 SPEC ACs with zero typecheck/lint errors.
Charter + umbrella plan: N/A — single plan
Autonomy: auto-proceed on all reversible decisions; surface hard stops only (irreversible/outward-facing actions not in this contract)
Hard stop conditions / safety constraints:
- Do NOT commit any real Google Maps API key to git — use Option B (app.config.ts + .env.local gitignored) exclusively
- Do NOT modify any file outside the blast radius (apps/mobile only; no packages/* source changes)
- Do NOT remove app.json until app.config.ts is confirmed loading correctly by Expo CLI
- Do NOT mark VERIFIED without running pnpm typecheck AND pnpm lint both exiting 0
- Hard stop if expo-maps install fails (package not found or incompatible with SDK 57) — surface to user
Next phase: EXECUTE: process/features/pickup-branches/active/brn-003-map-view_10-07-26/brn-003-map-view_PLAN_10-07-26.md
Validate contract: inline in plan (## Validate Contract section)
Execute start: `pnpm typecheck` | `pnpm lint` | manual: npx expo run:ios after install | high-risk pack: no
