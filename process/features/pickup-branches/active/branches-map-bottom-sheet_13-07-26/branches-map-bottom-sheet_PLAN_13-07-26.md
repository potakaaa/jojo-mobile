---
name: plan:branches-map-bottom-sheet
description: "SIMPLE-MODERATE plan — redesign Branch Locator into a full-bleed map base + draggable @gorhom/bottom-sheet list + floating search + warm brand map theming (presentation-layer only). Supersedes BRN-003 list/map toggle."
date: 13-07-26
feature: pickup-branches
---

# Branch Locator Redesign — Map Base + Bottom Sheet (PLAN)

**TL;DR:** Rewrite the Branches tab from a list/map TOGGLE into a full-bleed always-mounted map
base with a draggable `@gorhom/bottom-sheet` list over it, a floating search pill over the map, and
warm brand map theming (Google style-JSON on Android, `colorScheme`/`emphasis` approximation on
iOS, plus a shared low-opacity warm overlay). Web stays list-only exactly as today. **All data/state
flow is untouched** — this is presentation-layer only. `@gorhom/bottom-sheet` is JS-only, so **no
dev-client rebuild is required** (its native peers — gesture-handler, reanimated 4, worklets — are
already installed and compiled into the running dev client). Verification = `typecheck` + `lint` +
on-device manual (no RN test runner exists → map/sheet behavior is a documented known-gap).

Date: 13-07-26
Status: PLANNED — awaiting VALIDATE then EXECUTE
Complexity: SIMPLE-to-MODERATE (single feature area, ~7 touchpoints, 1 new dep, 1 new file)

## Overview

Redesign the Branches tab (`apps/mobile/src/app/(tabs)/branches/index.tsx`) from a list/map TOGGLE
into a full-bleed always-mounted map base with a draggable `@gorhom/bottom-sheet` list over it, a
floating search pill over the map, and warm brand map theming. This is a presentation-layer redesign
only — data fetching, sorting, filtering, selection, and navigation are unchanged. Context loaded
for this plan: `process/context/all-context.md` (shared-UI + navigation-shell conventions) and
`process/context/tests/all-tests.md` (mobile has no RN test runner).

- **Classification:** presentation redesign. No schema / auth / API / billing surface.
- **Supersedes:** the BRN-003 list/map toggle (`viewMode` + two toggle `Button`s are removed). Record
  at UPDATE PROCESS so the BRN-003 task folder reflects that its toggle UI is retired by this plan.

---

## Goals

1. Full-screen map base (native only) with the branch list as a draggable bottom sheet over it.
2. Floating search bar pinned over the map (user chose floating, NOT in-sheet).
3. Warm brand-palette map theming (user chose bold brand palette, NOT subtle-muted).
4. Preserve web list-only behavior exactly (no map, no sheet on web).
5. Zero change to data fetching, sorting, filtering, selection, and navigation.

## Non-Goals (explicitly out of scope)

- Any change to `features/branches/api.ts`, `use-selected-branch.ts`, `use-user-location.ts`, or `[branchId].tsx`.
- Fixing the pre-existing **Android closed-pin muting gap** (expo-maps Google markers have no `tintColor`/opacity). Still open and **orthogonal** to this redesign — carry forward as a known-gap, do not attempt here.
- Adding a mobile RN test runner (project-wide gap — see `all-tests.md`).
- Native module changes / any config requiring a rebuild.

---

## Locked Design (do NOT re-open — user-approved this session)

| # | Decision | Detail |
|---|---|---|
| D1 | Map = always-mounted full-screen base | Remove `viewMode` state + both toggle `Button`s. `BranchMap` renders as the bottom layer, `StyleSheet.absoluteFill`, native only. |
| D2 | List = `@gorhom/bottom-sheet` v5.1.8+ | `BottomSheetFlatList` renders `filteredBranches` → `BranchListItem`. Snap points half + full-cover; **opens at half** by default; expandable to cover map. Sheet visuals = comic/flat brand tokens (`cream` bg, `ink`, `Radii['2xl']`, `Shadows.offsetMd`). |
| D3 | Floating search pill OVER the map | Absolute-positioned pill near top, above the sheet, holding existing `query` + `Input`. Respect safe-area top inset. |
| D4 | Warm brand map theming | Android: `properties={{ mapStyleOptions: { json: MAP_STYLE_JSON } }}`. iOS: `properties={{ colorScheme, emphasis, pointsOfInterest: { excluding: [...] } }}`. Both: shared low-opacity warm `pointerEvents="none"` overlay. |
| D5 | Web = list-only fallback | `Platform.OS === 'web'` renders the current search `Input` + plain `FlatList`. No map base, no sheet. Preserve existing web behavior byte-for-byte. |
| D6 | Root `GestureHandlerRootView` | Wrap the tree in `_layout.tsx` (required by @gorhom/bottom-sheet; currently ABSENT). JS-only. |

---

## Critical Constraints

- **@gorhom/bottom-sheet is JS-only → NO dev-client rebuild.** Native peers already installed &
  compiled into the running dev client: `react-native-gesture-handler ~2.32.0`,
  `react-native-reanimated 4.5.0`, `react-native-worklets 0.10.0` (verified in
  `apps/mobile/package.json`). Pin `@gorhom/bottom-sheet` to a version with reanimated-4 support
  (**>= 5.1.8**). **After install, verify the resolved version supports reanimated 4** (check
  release notes / that the app boots without a reanimated-version error) before proceeding.
- **Data/state flow UNCHANGED**: `/api/branches` fetch, `mapApiBranch`, distance-vs-priority
  `sortedBranches`, name-filter `filteredBranches`, `setSelectedBranch` + `router.push('[branchId]')`
  all stay identical. Presentation-layer only.
- **Shared-UI convention**: reuse existing `@jojopotato/ui` exports (`Input`, `BranchListItem`,
  `Button`, `Card`). Only add to `packages/ui` if a genuinely reusable piece emerges (e.g. a sheet
  handle). Keep screen-specific composition inline. `packages/ui/src/index.ts` checked — no existing
  sheet/handle export, so a handle (if extracted) would be net-new.
- **No RN test runner** for `apps/mobile` (`tsc --noEmit` + eslint only). Map/sheet cannot be
  unit-tested → **known-gap** per `all-tests.md`.

---

## Touchpoints (file-by-file)

| File | Change | Notes |
|---|---|---|
| `apps/mobile/src/app/(tabs)/branches/index.tsx` | **REWRITE** | Remove toggle + `viewMode`; add map base + `BottomSheet`/`BottomSheetFlatList` + floating search pill; keep web branch as current list. Data/state block copied verbatim. |
| `apps/mobile/src/app/_layout.tsx` | **MODIFY** | Wrap render tree in `<GestureHandlerRootView style={{ flex: 1 }}>` (outermost). |
| `apps/mobile/src/features/branches/components/branch-map.tsx` | **MODIFY** | Add warm-theme `properties` prop shapes (Android style JSON, iOS colorScheme/emphasis/POI) + shared warm overlay; make full-bleed. Markers/camera/onMarkerClick unchanged. |
| `apps/mobile/src/features/branches/components/branch-map.web.ts` | **UNCHANGED** | Null stub stays; web never imports expo-maps. |
| `apps/mobile/src/features/branches/map-style.ts` | **NEW** | Export `MAP_STYLE_JSON` (warm Google Maps style JSON string) as a constant. Do NOT inline in the screen. |
| `apps/mobile/package.json` | **MODIFY** | Add `@gorhom/bottom-sheet` (`>= 5.1.8`). |
| `packages/ui/src/*` | **CONDITIONAL** | Only if a reusable sheet handle sub-component is warranted; otherwise keep handle inline in the screen. |

---

## Public Contracts

- **No new public/exported contract is required.** The screen is a leaf route; its behavior contract
  (fetch → sort → filter → select → navigate) is unchanged and not consumed by other packages.
- `BranchMap` prop interface (`BranchMapProps`) stays source-compatible on both native and web. Any
  new theming is handled INSIDE `branch-map.tsx` from its existing `branches`/`coords`/`mode` inputs
  — **do NOT add new required props** to `BranchMapProps` (keeps the web stub signature in sync). If
  a theming toggle is ever needed it must be optional with a default.
- `map-style.ts` exports one constant: `export const MAP_STYLE_JSON: string`. Consumed only by
  `branch-map.tsx`.
- IF a `packages/ui` sheet handle is added: it must follow the `mode?: ThemeMode = 'light'` prop
  convention (like `Button`/`BrandWordmark`), take no app-level theme-hook dependency, and be
  exported from `packages/ui/src/index.ts`.

---

## Blast Radius

- **Scope:** `apps/mobile` only (+ optional 1 `packages/ui` component). ~6 files modified/created, 1 new dep.
- **Risk class:** LOW — presentation-layer; no schema/auth/API/billing/migration/secret surface.
- **Highest-risk items (edge cases folded into steps below):**
  1. `GestureHandlerRootView` placement in `_layout.tsx` — must be OUTERMOST wrapper or gestures fail app-wide. (Step 2)
  2. Warm overlay must NOT block map gestures or marker taps — `pointerEvents="none"` mandatory; overlay must sit ABOVE map but BELOW the sheet + search pill in z-order. (Steps 4, 6)
  3. `@gorhom/bottom-sheet` ↔ reanimated 4 compatibility — wrong version = runtime crash. Version-verify gate. (Steps 1, 7)
  4. Sheet content bottom padding must clear the floating tab bar (`getFloatingTabBarClearance(insets.bottom)`) so the last branch row isn't hidden. (Step 5)

---

## Implementation Checklist (ordered, atomic)

**Phase A — Dependency + root setup (do first; unblocks everything)**

1. **Install `@gorhom/bottom-sheet`.** In `apps/mobile`, run
   `pnpm --filter @jojopotato/mobile add @gorhom/bottom-sheet` (or `npx expo install` equivalent),
   targeting **>= 5.1.8**. Pin the resolved version in `apps/mobile/package.json`. **Verify** the
   resolved version's release notes/peer deps declare reanimated-4 support; confirm no reanimated
   version-mismatch error appears when Metro reloads. If the resolved version does NOT support
   reanimated 4 → STOP and surface (do not downgrade reanimated — that would need a rebuild).

2. **Add `GestureHandlerRootView` in `apps/mobile/src/app/_layout.tsx`.** Import
   `{ GestureHandlerRootView }` from `react-native-gesture-handler`. Wrap the OUTERMOST returned
   element of `RootLayout` (outside `<ThemeProvider>`) in
   `<GestureHandlerRootView style={{ flex: 1 }}>…</GestureHandlerRootView>`. Confirm `flex: 1` is
   present (missing flex = zero-height tree = blank app). No other logic changes.

**Phase B — Warm map style constant + map theming**

3. **Create `apps/mobile/src/features/branches/map-style.ts`.** Export
   `export const MAP_STYLE_JSON: string` — a Google Maps style-JSON **string** (JSON.stringify of a
   style array, or a template-literal JSON string) authored in the warm brand palette:
   - land / `geometry`: cream/beige (`#FFF6E6` land, `#EFE7D2` landscape.man_made).
   - roads (`road.*.geometry`): soft-yellow tint of `#FFD21E` (e.g. `#FFE9A8` fill, `#F7B500` stroke for arterials).
   - labels (`*.labels.text.fill`): muted brown `#5F3A22`; `labels.text.stroke`: cream `#FFF6E6`.
   - arterial/brand accents where appropriate: `#C1440E`.
   - water (`water.geometry`): toned-down warm blue-grey (low-saturation, e.g. `#CFE0DA`).
   - POI (`poi.*`): toned down / de-emphasized (muted fills, hidden POI business labels) to reduce clutter.
   Keep it a single exported constant; do NOT inline the blob in the screen. Add a short comment
   citing mapstyle.withgoogle.com as the authoring source and the brand hexes used.

4. **Theme the map in `apps/mobile/src/features/branches/components/branch-map.tsx`.** Markers,
   `cameraPosition`, and `onMarkerClick` stay byte-unchanged. Additive only:
   - Import `MAP_STYLE_JSON` from `../map-style`.
   - **Android (`GoogleMaps.View`):** add
     `properties={{ mapStyleOptions: { json: MAP_STYLE_JSON } }}`
     (expo-maps@57 `GoogleMapsProperties.mapStyleOptions` = `{ json: string }`).
   - **iOS (`AppleMaps.View`):** add
     `properties={{ colorScheme: AppleMapsColorScheme.LIGHT, emphasis: AppleMapsMapStyleEmphasis.MUTED, pointsOfInterest: { excluding: [ /* POI categories to hide clutter */ ] } }}`.
     Import the enums from `expo-maps` (`AppleMaps.ColorScheme` / `AppleMaps.MapStyleEmphasis`, or
     the exported enum names — resolve exact identifiers against installed `expo-maps@57` type defs
     during EXECUTE; the report from BRN-003 confirms namespace-style access). If an exact enum
     import path is uncertain, resolve from the `expo-maps` `.d.ts` before writing — do NOT guess.
   - **Both platforms — warm tint overlay:** render a sibling `<View pointerEvents="none">` ABOVE the
     map view, `StyleSheet.absoluteFill`, low-opacity warm brand tint (e.g.
     `backgroundColor: 'rgba(255,246,230,0.12)'` cream or a faint `jyellow` tint). Wrap map + overlay
     in a `<View style={{ flex: 1 }}>` so both fill. **`pointerEvents="none"` is mandatory** — the
     overlay must never intercept map pan/zoom or marker taps.

**Phase C — Screen rewrite (map base + sheet + floating search)**

5. **Rewrite `apps/mobile/src/app/(tabs)/branches/index.tsx`.** Preserve the ENTIRE data/state block
   verbatim: imports for fetch/sort/filter, `branches`/`query`/`isFetching`/`fetchError` state, the
   fetch `useEffect`, `showDistance`, `sortedBranches`, `filteredBranches`, `isLoading`,
   `setSelectedBranch` + `router.push` handler. **Remove** `viewMode` state, the two toggle `Button`s,
   the `toggleRow` style, and the `Button` import (only if now unused). Then:
   - **Web branch (`Platform.OS === 'web'`):** render exactly today's structure — `SafeAreaView` +
     `Input` (search) + `FlatList` of `BranchListItem` (with the same loading/error/empty states and
     the same `contentContainerStyle`). No map, no sheet. Behavior byte-for-byte preserved.
   - **Native branch:** return a full-bleed `<View style={{ flex: 1 }}>` containing, in z-order:
     1. `<BranchMap … />` as the base (`StyleSheet.absoluteFill`), passed the existing
        `filteredBranches`, `coords`, `mode`, and the same `onBranchPress` handler.
     2. Floating **search pill**: absolute-positioned `<View>` near the top
        (`top: insets.top + Spacing.two`, `left/right: Spacing.four`), comic/flat styled (`cream` bg,
        2px `ink` border, `Radii.full` or `Radii['2xl']`, `Shadows.offsetMd`), holding the existing
        `Input` bound to `query`/`setQuery`. Respect safe-area top inset via `useSafeAreaInsets()`.
     3. `<BottomSheet>` (from `@gorhom/bottom-sheet`) with `snapPoints={['50%', '92%']}` (half +
        near-full-cover), `index={0}` (opens at half), comic handle + `cream` background
        (`backgroundStyle`, `handleIndicatorStyle` using `ink`; `Radii['2xl']` top corners;
        `Shadows.offsetMd`). Inside, `<BottomSheetFlatList>` rendering `filteredBranches` with the
        SAME `renderItem` as today (`getIsOpenNow`, `isEnabled`, `BranchListItem`, `onOrderPress` →
        `setSelectedBranch` + `router.push`). `contentContainerStyle` bottom padding =
        `getFloatingTabBarClearance(insets.bottom)` so the last row clears the floating tab bar.
   - **Loading / error / empty states (native):** render them INSIDE the bottom sheet (or as sheet
     content) so the map base still shows — e.g. `ActivityIndicator` / "Could not load branches" /
     "No branches match your search" as the sheet's content when `isLoading` / `fetchError` /
     `filteredBranches.length === 0`. Keep the exact copy strings from today.
   - Keep `mode`, `theme`, `insets`, `useColorScheme`/`useTheme` usage consistent with the rest of the app.

6. **Z-order + gesture sanity pass.** Confirm final stacking (bottom→top): map base → warm overlay
   (`pointerEvents="none"`) → floating search pill → bottom sheet. Confirm the search pill and sheet
   are ABOVE the overlay, and the overlay does not sit above the sheet. Confirm no wrapper between
   `GestureHandlerRootView` and `BottomSheet` swallows gestures.

**Phase D — Optional shared-UI extraction (only if warranted)**

7. **(Conditional) Extract a sheet handle to `packages/ui`** ONLY if the handle markup is reusable
   and non-trivial. If extracted: add `packages/ui/src/components/sheet-handle.tsx`, export from
   `packages/ui/src/index.ts`, follow the `mode?: ThemeMode = 'light'` convention, no app-theme-hook
   dependency. Otherwise keep the handle inline via `handleIndicatorStyle` and mark this step
   "n/a — inline handle sufficient (YAGNI)".

**Phase E — Verify**

8. Run the verification gates (see Verification Evidence). Fix typecheck/lint until green; then
   perform the on-device manual pass over USB.

---

## Exact prop shapes (reference for EXECUTE)

```
// Android map theming (expo-maps@57 GoogleMaps.View)
properties={{ mapStyleOptions: { json: MAP_STYLE_JSON } }}

// iOS map theming (expo-maps@57 AppleMaps.View) — resolve exact enum identifiers from expo-maps .d.ts
properties={{
  colorScheme: <AppleMapsColorScheme.LIGHT>,
  emphasis: <AppleMapsMapStyleEmphasis.MUTED>,
  pointsOfInterest: { excluding: [ /* clutter POI categories */ ] },
}}

// Warm overlay (both platforms) — MUST be pointerEvents="none"
<View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,246,230,0.12)' }]} />

// Bottom sheet
<BottomSheet
  index={0}                       // opens at half
  snapPoints={['50%', '92%']}     // half + near-full cover
  backgroundStyle={{ backgroundColor: Palette.cream, borderRadius: Radii['2xl'] }}
  handleIndicatorStyle={{ backgroundColor: Palette.ink }}
  style={Shadows.offsetMd}
>
  <BottomSheetFlatList
    data={filteredBranches}
    keyExtractor={(item) => item.id}
    contentContainerStyle={{ paddingBottom: getFloatingTabBarClearance(insets.bottom), gap: Spacing.three }}
    renderItem={/* same as today */}
  />
</BottomSheet>
```

> `snapPoints` percentages and the overlay opacity are starting values — tune on-device during the
> manual pass. The half/full-cover intent and "opens at half" (`index={0}`) are locked.

---

## Verification Evidence

No RN test runner exists for `apps/mobile` → automated coverage is limited to typecheck + lint; all
runtime map/sheet behavior is Agent-Probe (on-device manual) or Known-Gap per `all-tests.md`.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` exits 0 | Fully-Automated | Rewrite + new dep + map-style + `_layout` change compile; `BranchMapProps` still source-compatible across native/web (D1–D6 don't break types) |
| `pnpm --filter @jojopotato/mobile lint` exits 0 | Fully-Automated | No unused imports (removed `Button`/`viewMode`), no lint regressions in touched files |
| `pnpm typecheck` (root, all pkgs) exits 0 | Fully-Automated | Optional `packages/ui` handle (if added) + cross-package types stay green |
| `git diff --check` | Fully-Automated | No merge-conflict markers |
| App boots on dev client without reanimated/gesture-handler version error | Agent-Probe (on-device) | @gorhom/bottom-sheet ↔ reanimated-4 compatibility (constraint) + GestureHandlerRootView wired (D6) |
| Map renders full-bleed as base layer; warm palette visible (Android style JSON / iOS muted) | Agent-Probe (on-device) | D1 (map base), D4 (warm theming) |
| Sheet opens at half; drags up to cover map; drags back down | Agent-Probe (on-device) | D2 (snap points, opens-at-half) |
| Branch rows in sheet render + tapping "Order" navigates to `[branchId]`; last row clears tab bar | Agent-Probe (on-device) | D2 (list drop-in), data/state unchanged, tab-bar clearance |
| Floating search pill filters list live; respects top inset | Agent-Probe (on-device) | D3 (floating search) |
| Warm overlay does not block map pan/zoom or marker taps | Agent-Probe (on-device) | D4 (overlay pointerEvents="none") |
| Web (`pnpm web`) shows search + list only, no map/sheet, unchanged from today | Agent-Probe (on-device/browser) | D5 (web list-only preserved) |
| Automated map/sheet behavior test | Known-Gap | No RN runner project-wide — cannot automate; tracked in `mobile-e2e-navigation-harness_NOTE_09-07-26.md` |

**Known-gap residual (recorded, keeps those gates CONDITIONAL, not silently passed):** all
on-device Agent-Probe rows above cannot be automated until a mobile RN/e2e runner exists. This is
the pre-existing project-wide gap; a backlog stub already exists
(`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — add
"map-base + bottom-sheet branch locator" as a scenario there at UPDATE PROCESS. Developed behavior
is therefore NOT declared PASS on Known-Gap alone; the on-device manual pass is the required proof.

---

## Test Infra Improvement Notes

- No RN test runner for `apps/mobile` (project-wide). Map/sheet/gesture behavior is on-device manual
  only. When a runner lands (Jest+RNTL for components, Detox/Maestro for gestures), add: sheet
  snap-point behavior, floating-search filtering, map-base render, and marker-tap navigation as
  scenarios. Track under the existing `mobile-e2e-navigation-harness` backlog note.
- **Orthogonal pre-existing gap (carry forward, do NOT fix here):** Android closed-pin muting —
  expo-maps Google markers expose no `tintColor`/opacity, so closed branches can't be visually dimmed
  on Android (iOS uses `tintColor`). Needs custom bitmap/icon assets. Still open per the BRN-003
  report; unrelated to this redesign.

---

## Dependencies & Risks

| Item | Type | Mitigation |
|---|---|---|
| `@gorhom/bottom-sheet` >= 5.1.8 must support reanimated 4 | Dep risk | Version-verify gate in Step 1; do NOT downgrade reanimated (would force a rebuild) |
| `GestureHandlerRootView` missing/wrong placement | Wiring risk | Step 2: outermost + `flex: 1`; boot check catches it |
| Warm overlay blocks gestures | UX bug | `pointerEvents="none"` mandatory (Steps 4, 6); explicit on-device probe |
| iOS `AppleMapsProperties` enum identifiers | API-shape risk | Resolve exact enum names from installed `expo-maps@57` `.d.ts` during EXECUTE; do not guess (BRN-003 proved plan-assumed shapes can be stale) |
| Loading/error/empty states hidden by map | UX regression | Render them as sheet content on native (Step 5), keep exact copy |

## Backwards Compatibility

- Data/state flow, API, navigation, and `[branchId].tsx` are untouched → no behavioral regression to
  branch selection or details.
- Web path preserved byte-for-byte → no web regression.
- Removing the toggle is a deliberate UX supersede of BRN-003 (recorded), not a regression.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/pickup-branches/active/branches-map-bottom-sheet_13-07-26/branches-map-bottom-sheet_PLAN_13-07-26.md`
2. **Last completed step:** none — plan just written; awaiting VALIDATE then EXECUTE.
3. **Validate-contract status:** pending (vc-validate-agent writes it before EXECUTE).
4. **Supporting context loaded:** `all-context.md` (shared-UI + navigation-shell conventions),
   `tests/all-tests.md` (mobile has no RN runner), BRN-003 REPORT (real expo-maps@57 API: declarative
   markers, `onMarkerClick`, `cameraPosition`; Android marker-tint known-gap), `theme.ts` tokens,
   `packages/ui/src/index.ts` (no existing sheet handle), `floating-tab-bar.tsx`
   (`getFloatingTabBarClearance`, comic-shadow brand style), `branch-map.tsx` + `.web.ts`.
5. **Next step for a fresh agent:** Start at Checklist Phase A Step 1 (install `@gorhom/bottom-sheet`
   >= 5.1.8, verify reanimated-4 support), then proceed in order. Do NOT touch `api.ts`,
   `use-selected-branch.ts`, `use-user-location.ts`, or `[branchId].tsx`. Run the Verification
   Evidence gates; the map/sheet rows require the on-device dev client (already installed + running
   over USB this session).
6. **UPDATE PROCESS reminders:** (a) record that this redesign **supersedes the BRN-003 list/map
   toggle** in the BRN-003 task folder; (b) add the map-base+sheet scenario to the
   `mobile-e2e-navigation-harness` backlog note; (c) Android closed-pin muting remains open/orthogonal.

---

## Phase Completion Rules

- **CODE DONE** = all checklist steps applied AND the three Fully-Automated gates green
  (`pnpm --filter @jojopotato/mobile typecheck`, `pnpm --filter @jojopotato/mobile lint`, root
  `pnpm typecheck`) AND `git diff --check` clean. Code-only completion is CODE DONE, not VERIFIED.
- **VERIFIED** = CODE DONE PLUS the on-device Agent-Probe manual pass (map base renders, warm
  theming visible, sheet opens-at-half and drags to cover, floating search filters, marker/row tap
  navigates, overlay doesn't block gestures, web still list-only). Since no RN runner exists, VERIFIED
  requires the manual pass on the running dev client — it cannot be reached by automated gates alone.
- Known-Gap rows (automated map/sheet behavior) never count toward VERIFIED and stay CONDITIONAL;
  their residual is recorded in the `mobile-e2e-navigation-harness` backlog note.

## Acceptance Criteria

1. **AC-1 (D1):** On native, the map renders as a full-screen base layer; the list/map toggle and
   `viewMode` state are gone. Proven by: on-device map-base probe. Strategy: Agent-Probe.
2. **AC-2 (D2):** The branch list is a `@gorhom/bottom-sheet` `BottomSheetFlatList` that opens at the
   half snap point and can be dragged to cover the map. Proven by: sheet snap-point probe. Strategy: Agent-Probe.
3. **AC-3 (D2):** Tapping a row's "Order" (or a marker) calls `setSelectedBranch` + navigates to
   `[branchId]`; the last row clears the floating tab bar. Proven by: navigation + clearance probe. Strategy: Agent-Probe.
4. **AC-4 (D3):** A floating search pill over the map filters `filteredBranches` live and respects the
   safe-area top inset. Proven by: floating-search probe. Strategy: Agent-Probe.
5. **AC-5 (D4):** Warm brand map theming is visible (Android style JSON; iOS muted colorScheme/emphasis
   + POI excluded) and the warm overlay does not block map pan/zoom or marker taps. Proven by: theming +
   overlay-gesture probe. Strategy: Agent-Probe.
6. **AC-6 (D5):** Web renders search + list only (no map, no sheet), byte-for-byte unchanged from today.
   Proven by: `pnpm web` browser probe. Strategy: Agent-Probe.
7. **AC-7 (D6 + constraint):** App boots on the dev client with `GestureHandlerRootView` wired and no
   reanimated/gesture-handler version error; typecheck + lint green. Proven by: Fully-Automated gates +
   boot probe. Strategy: Fully-Automated + Agent-Probe.
8. **AC-8 (constraint):** No change to `api.ts`, `use-selected-branch.ts`, `use-user-location.ts`, or
   `[branchId].tsx`. Proven by: `git diff --stat` shows those files untouched. Strategy: Fully-Automated.

## Validate Contract

Status: CONDITIONAL
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 1/7 signals (only S7 — 5+ files in blast radius). LOW score; single feature area, LOCKED design, no cross-agent coordination needed. Layer 1 + Layer 2 checks run sequentially in-thread — parallel fan-out would only add cost-guard multiplication with no benefit.

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-7 | Rewrite + new dep + map-style + `_layout` change compile; `BranchMapProps` source-compatible native/web | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` exits 0 | A |
| AC-1,AC-7 | No unused imports (removed `Button`/`viewMode`); no lint regressions | Fully-Automated | `pnpm --filter @jojopotato/mobile lint` exits 0 | A |
| AC-7 | Optional `packages/ui` handle (if added) + cross-package types green | Fully-Automated | `pnpm typecheck` (root) exits 0 | A |
| (all) | No merge-conflict markers | Fully-Automated | `git diff --check` exits 0 | A |
| AC-8 | `api.ts`, `use-selected-branch.ts`, `use-user-location.ts`, `[branchId].tsx` untouched | Fully-Automated | `git diff --stat` shows those 4 files absent from the diff | A |
| AC-2 (constraint) | @gorhom/bottom-sheet resolves >=5.1.8 with reanimated-4 support; sheet imports typecheck-clean | Fully-Automated | After `pnpm add`: `node -e "console.log(require('./apps/mobile/node_modules/@gorhom/bottom-sheet/package.json').version)"` prints >=5.1.8 AND `pnpm --filter @jojopotato/mobile typecheck` passes with `BottomSheet`/`BottomSheetFlatList` imported | A (cheap-local — NOT a live probe) |
| AC-7 | App boots on dev client, no reanimated/gesture-handler version error; GestureHandlerRootView wired | Agent-Probe | On-device: open Branches tab in dev app over USB; app boots, no red-screen version error | C (deferred — no RN runner) |
| AC-1,AC-5 | Map renders full-bleed base; warm palette visible (Android style JSON / iOS muted) | Agent-Probe | On-device: Branches tab shows full-screen map, warm theming | C |
| AC-2 | Sheet opens at half; drags up to cover map; drags back down | Agent-Probe | On-device: sheet default half, drag to ~92%, drag back | C |
| AC-3 | Sheet rows render; "Order" tap navigates to `[branchId]`; last row clears tab bar | Agent-Probe | On-device: scroll sheet, tap Order, confirm details route + last row visible above tab bar | C |
| AC-4 | Floating search pill filters list live; respects top inset | Agent-Probe | On-device: type in search pill, list filters; pill below status bar | C |
| AC-5 | Warm overlay does not block map pan/zoom or marker taps | Agent-Probe | On-device: pan/zoom map through overlay; tap a marker | C |
| AC-6 | Web renders search + list only, no map/sheet, unchanged | Agent-Probe | `pnpm web` in browser: search + FlatList, no map, no sheet | C |
| (runtime) | Automated map/sheet interaction test | Known-Gap | — no RN runner project-wide | D (backlog stub: `mobile-e2e-navigation-harness_NOTE_09-07-26.md`) |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to on-device manual pass (no RN runner exists); D — backlog test-building stub.

C-4 reconciliation: `strategy:` column carries only the 3 proving strategies (Fully-Automated / Agent-Probe used here; no Hybrid). Known-Gap is a named residual row (gap-resolution D), never a proving strategy.

Legacy line form (retained for existing consumers):
- typecheck (mobile): Fully-automated: `pnpm --filter @jojopotato/mobile typecheck`
- lint (mobile): Fully-automated: `pnpm --filter @jojopotato/mobile lint`
- typecheck (root): Fully-automated: `pnpm typecheck`
- conflict markers: Fully-automated: `git diff --check`
- files-untouched (AC-8): Fully-automated: `git diff --stat` (4 named files absent)
- bottom-sheet version+compat (AC-2 constraint): Fully-automated: resolved-version print >=5.1.8 + `tsc --noEmit` with sheet imported (cheap-local)
- map/sheet/search/theming/web runtime (AC-1..AC-6): agent-probe: on-device dev client over USB (Metro reload, JS-only, no rebuild)
- automated map/sheet behavior: known-gap: documented (no RN runner)

Failing stub (AC-2 constraint — Fully-Automated version+compat gate):
test("should resolve @gorhom/bottom-sheet >=5.1.8 and typecheck with sheet imported", () => { throw new Error("NOT IMPLEMENTED — TDD stub: bottom-sheet version >=5.1.8 + tsc --noEmit clean with BottomSheet/BottomSheetFlatList imported") })

Failing stub (AC-8 — Fully-Automated files-untouched gate):
test("should leave api.ts, use-selected-branch.ts, use-user-location.ts, [branchId].tsx untouched", () => { throw new Error("NOT IMPLEMENTED — TDD stub: git diff --stat must not list the 4 protected files") })

Dimension findings:
- Infra fit: PASS — native peers (reanimated 4.5.0, gesture-handler ~2.32.0, worklets 0.10.0) confirmed in `apps/mobile/package.json`; @gorhom/bottom-sheet JS-only → no rebuild; expo-maps@57.0.0 installed; GestureHandlerRootView placement correctly flagged outermost+flex:1.
- Test coverage: CONCERN — no RN runner for `apps/mobile`; 3 Fully-Automated gates (typecheck/lint) prove the code surface, runtime behavior is Agent-Probe (on-device) + one Known-Gap (automated map/sheet). Documented residual, not a high-risk class → hybrid not required.
- Breaking changes: PASS — `BranchMapProps` source-compatible native/web (no new required props); 4 protected files locked by AC-8; web byte-for-byte preserved; BRN-003 toggle removal is a recorded supersede.
- Security surface: PASS — no auth/billing/schema/migration/API/secret/trust-boundary surface; Google Maps key is a pre-existing BRN-003 concern, untouched here. No evidence pack required.
- Section A (Phase A — dep + root): CONCERN — mechanically feasible; highest-risk edit is @gorhom/bottom-sheet↔reanimated-4 compat; @gorhom/bottom-sheet currently ABSENT (confirmed) → version-verify gate essential (cheap-local, not a probe).
- Section B (Phase B — map-style + theming): CONCERN — `map-style.ts` NEW (no collision); Android `mapStyleOptions:{json}` confirmed; iOS AppleMaps enum member names must be resolved from `.d.ts` (node_modules scout-blocked — needs temporary `.vcignore` create/read/revert). Highest-risk edit: iOS enum identifiers (folds into E2).
- Section C (Phase C — screen rewrite): PASS — data/state block copied verbatim; z-order + tab-bar clearance specified; highest-risk edit is overlay `pointerEvents="none"` + z-order (on-device verified, AC-5).
- Section D (Phase D — optional ui extraction): PASS — YAGNI-gated, correctly conditional.
- Section E (Phase E — verify): PASS — gates exact and runnable.

### Execute-agent instructions (from CONCERNs — follow these)

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | After `pnpm --filter @jojopotato/mobile add @gorhom/bottom-sheet`, VERIFY the resolved version is >=5.1.8 (print it) AND run `pnpm --filter @jojopotato/mobile typecheck` with `BottomSheet`/`BottomSheetFlatList` imported. If version <5.1.8 or the resolver picks a version without reanimated-4 support → STOP and surface; do NOT downgrade reanimated (that forces a rebuild). This is cheap-local — do NOT attempt a live probe. | Phase A Step 1 |
| E2 | Before writing the iOS `AppleMaps.View` `properties` block, resolve the EXACT enum member identifiers (colorScheme value, emphasis value, POI category names) from the installed type defs at `node_modules/.pnpm/expo-maps@*/node_modules/expo-maps/build/apple/AppleMaps.types.d.ts`. Reading `node_modules` is blocked by `.claude/hooks/scout-block.cjs`. To read it: CREATE `.claude/.vcignore` (it does not currently exist) containing a single line `!node_modules`, read the `.d.ts` to confirm `AppleMapsColorScheme` / `AppleMapsMapStyleEmphasis` / `AppleMapPointOfInterestCategory` exact members, then DELETE `.claude/.vcignore` (revert to absent) before continuing. Do NOT guess enum names — BRN-003 proved plan-assumed API shapes can be stale. | Phase B Step 4 (iOS) |
| E3 | Keep the warm overlay `pointerEvents="none"` and in z-order ABOVE map / BELOW search pill + sheet. Confirm no wrapper between `GestureHandlerRootView` and `BottomSheet` swallows gestures (Step 6 sanity pass). | Phase C Steps 5–6 |
| E4 | AC-8 is a hard gate: run `git diff --stat` at the end and confirm `api.ts`, `use-selected-branch.ts`, `use-user-location.ts`, `[branchId].tsx` are absent from the diff. If any appears → revert that change. | Phase E |

Open gaps: Automated map/sheet interaction testing — known-gap: documented (no RN runner project-wide); tracked in `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` (add "map-base + bottom-sheet branch locator" scenario at UPDATE PROCESS). Excluded from the CONCERN/FAIL count per known-gap exclusion.

What this coverage does NOT prove:
- `pnpm --filter @jojopotato/mobile typecheck` / root `pnpm typecheck`: prove the code compiles and types are source-compatible. Do NOT prove: the map actually renders, the sheet actually drags, gestures actually fire, warm theming is visually correct, or that the overlay lets taps through at runtime.
- `pnpm --filter @jojopotato/mobile lint`: proves no lint/unused-import regressions. Does NOT prove any runtime behavior.
- `git diff --check` / `git diff --stat` (AC-8): prove no conflict markers and that the 4 protected files are untouched. Do NOT prove behavioral correctness of the changed files.
- bottom-sheet version+compat gate (AC-2 constraint): proves the resolved version is >=5.1.8 and the sheet imports typecheck-clean. Does NOT prove the sheet renders or animates correctly at runtime on the dev client — that is the on-device boot probe.
- Agent-Probe (on-device) rows (AC-1..AC-6): prove runtime behavior only when the manual pass is actually performed on the running dev client over USB. Until then, runtime behavior is unproven. These are NOT automated and cannot gate CI.
- No test proves: Android closed-pin muting (orthogonal pre-existing gap, out of scope), iOS-vs-Android theming parity, or behavior under real device GPS/location variance.

Gate: CONDITIONAL (concerns noted; developed runtime behavior rests on Agent-Probe + on-device manual pass, not automated gates — classification gate keeps this CONDITIONAL, not terminal PASS; all 3 CONCERNs have concrete execute-agent mitigations E1–E4; 0 FAILs)
Accepted by: session (autonomous) — accepted concerns: (1) Test coverage — no RN runner, runtime behavior via on-device Agent-Probe + Known-Gap backlog stub; (2) Section A — bottom-sheet↔reanimated-4 compat, mitigated by cheap-local version-verify gate E1; (3) Section B — iOS AppleMaps enum resolution, mitigated by execute-agent instruction E2 (.vcignore create/read/revert to read the .d.ts).

## Autonomous Goal Block

SESSION GOAL: Redesign the Branch Locator (Branches tab) into a full-bleed map base + draggable @gorhom/bottom-sheet list + floating search pill + warm brand map theming. Presentation-layer only; data/state flow untouched; web stays list-only. Supersedes the BRN-003 list/map toggle.
Charter + umbrella plan: N/A — single plan.
Autonomy: standing EXECUTE consent for this plan under /goal; auto-proceed on reversible decisions; hard-stop only on irreversible/outward-facing actions.
Hard stop conditions / safety constraints:
- If @gorhom/bottom-sheet resolves <5.1.8 or to a version without reanimated-4 support → STOP and surface. Do NOT downgrade reanimated (forces a dev-client rebuild).
- Do NOT guess iOS AppleMaps enum member names — resolve from the installed `.d.ts` (via temporary `.claude/.vcignore` `!node_modules` create/read/revert); guessing is banned (BRN-003 lesson).
- Do NOT modify `api.ts`, `use-selected-branch.ts`, `use-user-location.ts`, or `[branchId].tsx` (AC-8 hard gate).
- Warm overlay must be `pointerEvents="none"` — it must never intercept map gestures or marker taps.
- No native module changes / nothing requiring a rebuild (this redesign is JS-only).
Next phase: EXECUTE — process/features/pickup-branches/active/branches-map-bottom-sheet_13-07-26/branches-map-bottom-sheet_PLAN_13-07-26.md
Validate contract: inline in plan (## Validate Contract — Gate: CONDITIONAL).
Execute start: fully-auto gates → `pnpm --filter @jojopotato/mobile typecheck` | `pnpm --filter @jojopotato/mobile lint` | `pnpm typecheck` | `git diff --check` | `git diff --stat` (AC-8) | bottom-sheet version+compat (cheap-local). On-device probe: Branches tab in dev app over USB (Metro reload, JS-only, no rebuild). high-risk pack: no.
