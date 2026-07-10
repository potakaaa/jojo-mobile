---
name: spec:brn-003-map-view
description: "Map view toggle for the Branch Locator — BRN-003 product requirements"
date: 10-07-26
feature: pickup-branches
---

# BRN-003: Map View for Branch Locator — SPEC

**Date:** 2026-07-10
**Issue:** BRN-003 (P2 stretch)
**PRD reference:** §6.3 Branch Locator ("Map view can be included if already easy to implement")

---

## Summary

The Branch Locator screen (BRN-001) defaults to a scrollable list of active branches. BRN-003 adds a
toggle so users can switch to a map view that shows every branch as a pin on an interactive map —
the same set of branches the list already shows, filtered the same way. Tapping a pin navigates to
that branch's details screen. Closed or pickup-off branches appear as muted/dimmed pins to match
the visual treatment they already receive in list view. The list remains the default. Switching
views preserves whatever search or filter the user had in place — no data re-fetch, no state loss.

On web, the map toggle and map component are hidden entirely (expo-maps has no web support). Web
users always see the list. iOS uses Apple Maps (expo-maps native rendering); Android uses Google
Maps (requires a provisioned Google Maps API key).

---

## User Stories / Jobs To Be Done

**US-1 — See branches on a map**
As a customer, I want to switch the Branch Locator to a map view so that I can see where all pickup
branches are relative to each other and to my location, rather than scanning a text list.

**US-2 — Tap a pin to go to that branch**
As a customer viewing the map, I want to tap a branch pin and be taken to that branch's details
screen, so that I can confirm hours and place an order without leaving the flow I am already in.

**US-3 — Know which branches are open from the map**
As a customer, I want closed or pickup-unavailable branches to look visually different on the map
(muted pins) so that I do not waste time tapping a branch that cannot accept my order right now.

**US-4 — Keep my search when I switch views**
As a customer who has typed a search term in list view, I want that filter to still be active when
I switch to map view (and vice versa), so that I do not have to re-type my search every time I
toggle between views.

---

## What The User Wants (Behavioral Outcomes)

**Toggle control.** A toggle (the exact control style — segmented, icon button, etc. — is an
INNOVATE decision) appears on the Branch Locator screen. It switches the main content area between
the existing branch list and a new map view. List is the default on every screen load. Web users
never see the toggle.

**Map pins.** The map shows one pin per branch in the current `filteredBranches` result — the same
set already computed by the existing search/filter logic. If the user's search reduces the list to
two branches, only two pins appear. Inactive branches (already excluded from the list) are never
pinned.

**Pin open/closed distinction.** A pin for a branch that is currently closed (outside opening
hours) or not accepting pickup (`isAcceptingPickup = false`) is visually muted or dimmed — matching
how those branches look in list view. Open, pickup-available branches use the default (full-color)
pin. The exact visual treatment (color, opacity, custom marker asset) is an INNOVATE decision; the
SPEC requires only that the distinction is visible.

**Pin tap navigation.** Tapping any pin navigates immediately to the Branch Details screen for that
branch (`/(tabs)/branches/[branchId]`), the same route the list's branch-row tap already uses.

**Initial map region.** When the user switches to map view, the map centers on the user's location
if location permission is granted. If permission is denied or unavailable, the map opens at a
fallback centroid (~lat 10.323, lng 123.900, delta ~0.05) that covers all seeded Cebu branches.

**Search/filter preservation.** Toggling between list and map never resets the search bar text or
any active filter. The same `filteredBranches` array is what both views consume — no re-fetch, no
filter recalculation triggered by the toggle.

**Web fallback.** On web (react-native-web), the toggle is not rendered and the map component is
not loaded or imported. The list view is shown unconditionally. The web build must not throw or
fail to compile because of the map code.

---

## Flow / State Diagram

```
User opens Branches tab (BRN-001 list loads as default)
         |
         v
  [filteredBranches computed from search + filter state]
         |
         +----------------------------+
         |                            |
     LIST VIEW (default)         WEB PLATFORM
         |                       (list only, no toggle shown)
         |
  User taps [Map] toggle
         |
         v
  MAP VIEW renders
  (same filteredBranches, no re-fetch)
         |
  Map centers on:
    +-----------+-----------+
    |                       |
  LOCATION GRANTED       DENIED / UNAVAILABLE
  Center on user lat/lng  Center on Cebu fallback
  delta from useUserLocation  (~10.323, 123.900, Δ0.05)
    |                       |
    +-----------+-----------+
         |
  Pins rendered:
  ┌───────────────────────────────────────────┐
  │ For each branch in filteredBranches:      │
  │   isOpen AND isAcceptingPickup → full pin │
  │   else → muted / dimmed pin              │
  └───────────────────────────────────────────┘
         |
  User taps a pin
         |
         v
  Navigate → /(tabs)/branches/[branchId]
  (same route as list-row tap in BRN-001)
         |
  User taps [List] toggle
         |
         v
  LIST VIEW resumes
  (same filteredBranches, search state unchanged)

  [At any point: user types in search bar]
         |
         v
  filteredBranches updates → both list AND map
  pins update to the new filtered set
```

---

## Acceptance Criteria (Testable Outcomes)

**AC-1 — Map shows exactly the branches in the current filtered list**
When the user switches to map view, the number of visible pins equals the number of branches shown
in list view under the same search/filter state. Adding a search term that reduces the list also
reduces the pin count to match.
- proven by: manual verification on a native dev build — compare pin count to list item count
  before and after typing a search term; must always match
- strategy: Hybrid (pnpm typecheck confirms type safety; map-pin-count parity is manual)
- known-gap: no mobile unit test runner; automated pin-count assertion not available

**AC-2 — Toggle preserves current search and filter state**
After the user has typed a search term (e.g. "IT") in list view, switching to map view shows only
pins for the matching branches (not all branches). Switching back to list view still shows the same
filtered list with the same search text in the input field — no text is cleared, no list is reset.
- proven by: manual verification — type a search term, toggle to map, confirm reduced pins, toggle
  back, confirm search text and filtered list are unchanged
- strategy: Hybrid
- known-gap: no mobile unit test runner

**AC-3 — Tapping a pin navigates to the correct Branch Details screen**
Tapping any pin on the map navigates to `/(tabs)/branches/[branchId]` for that specific branch.
The branchId in the route matches the tapped branch's ID. No navigation errors occur.
- proven by: manual verification — tap pins for each seeded branch; confirm each navigates to the
  correct branch details route (URL/route param visible in dev tooling or screen title)
- strategy: Hybrid
- known-gap: no mobile unit test runner; Expo Router typed-routes navigation is type-checked by
  pnpm typecheck (AC-9 below)

**AC-4 — Closed/pickup-off branches have visually distinct (muted) pins**
Any branch where `getIsOpenNow(openingHours)` returns false OR `isAcceptingPickup` is false renders
as a muted/dimmed pin on the map. Open, pickup-available branches render as full-color pins. The
visual distinction matches the closed/disabled treatment those same branches receive in list view.
- proven by: manual verification — jojo-it-park has isAcceptingPickup = false; it must show a
  muted pin while jojo-poblacion (open, pickup on) shows a full pin; test at a time when at least
  one branch is closed by hours to verify the hours-based mute path too
- strategy: Hybrid
- known-gap: no mobile unit test runner

**AC-5 — Map opens at user location when permission is granted**
When location permission is granted on the device, the map's initial camera region centers on the
user's current location at a zoom level where all nearby branches are visible. Uses
`useUserLocation` coordinates as the initial region.
- proven by: manual verification on iOS/Android simulator with a simulated location set
- strategy: Hybrid
- known-gap: no mobile unit test runner

**AC-6 — Map opens at Cebu fallback centroid when location is denied**
When location permission is denied or unavailable, the map opens centered at approximately
lat 10.323, lng 123.900 with a delta of ~0.05 (covering all three seeded Cebu branches). No error
is shown; the map simply opens at the fallback.
- proven by: manual verification — deny location on simulator; switch to map view; confirm map
  is centered in the Cebu area and all three branch pins are visible
- strategy: Hybrid
- known-gap: no mobile unit test runner

**AC-7 — Web build does not include or load the map component**
On web, the Branch Locator screen renders the list only. The map toggle is not visible. No runtime
error occurs. The web build (pnpm web) compiles and the Branches screen loads without crashing.
- proven by: pnpm typecheck (type-safe web stub compiles cleanly); manual browser verification
  (Branches tab shows list, no toggle, no map, no JS errors in console)
- strategy: Hybrid (typecheck automated; runtime web verification manual)

**AC-8 — Web build remains type-safe and lint-clean**
The platform guard (web stub / `.web.ts` file) for the map component compiles without TypeScript
errors. `pnpm typecheck` and `pnpm lint` both exit 0 on the full monorepo after implementation.
- proven by: `pnpm typecheck` (exit 0); `pnpm lint` (exit 0, no new errors)
- strategy: Fully-Automated

**AC-9 — TypeScript types compile cleanly across all packages**
Running `pnpm typecheck` after implementation produces zero type errors. The map component's props
(branch data, pin state, region) and the toggle component's props are fully type-annotated. The
Expo Router `router.push` call for pin-tap navigation uses the typed route path correctly.
- proven by: `pnpm typecheck` (exit 0)
- strategy: Fully-Automated

**AC-10 — ESLint passes with no new errors**
Running `pnpm lint` after implementation produces zero ESLint errors or warnings beyond any
pre-existing baseline.
- proven by: `pnpm lint` (exit 0)
- strategy: Fully-Automated

---

## Out Of Scope

- **Web map support:** expo-maps has no web implementation. Map view is native-only. Web users always
  see the list. Any future web map (e.g. via react-native-maps or a web-specific lib) is a separate
  issue.
- **Marker clustering:** when many branches are close together on the map, pins are not clustered
  into a grouped marker. Each branch always has its own individual pin. Clustering is a future
  enhancement.
- **Directions from map:** tapping a pin navigates to the Branch Details screen (which already has
  directions via BRN-002/BRN-004). Opening directions directly from a map pin, or a "Get Directions"
  callout on the map, is out of scope.
- **Search-on-map / draw-region:** the user cannot draw a region on the map to filter branches, nor
  does the map re-query branches as the user pans. The pin set is always derived from the
  already-computed `filteredBranches`.
- **Custom map styling or themes:** beyond the open/closed pin distinction, no custom map style
  (dark mode map, custom road colors, branded map tiles) is included.
- **Offline maps or tile caching:** the map renders via the native map SDK (Apple Maps on iOS,
  Google Maps on Android) and requires a network connection. No offline tile caching.
- **Google Maps on iOS:** expo-maps uses Apple Maps on iOS. The user has accepted this as a fixed
  constraint.
- **Callout/preview bubble on pin tap:** a mid-air callout showing branch summary before navigation
  is an open/deferred design question. The default behavior if not chosen in INNOVATE is direct
  navigation to Branch Details on pin tap.

---

## Constraints

1. **Library is expo-maps (alpha, SDK 57):** this is the chosen library. The API may change before
   stable release. No alternative library (react-native-maps, Mapbox, etc.) is in scope for this
   issue.
2. **iOS minimum deployment target: iOS 18.0.** expo-maps requires this. This is an accepted
   constraint even if it raises the minimum supported iOS version for the app.
3. **iOS maps provider: Apple Maps.** expo-maps on iOS uses Apple Maps exclusively. No Google Maps
   on iOS.
4. **Android requires a Google Maps API key (external prerequisite).** expo-maps on Android uses
   Google Maps. The key must be provisioned by the developer (Google Cloud project, Maps SDK for
   Android enabled, key restricted to the app's bundle ID `ph.jojopotato.mobile`), then placed in
   `apps/mobile/app.json` under the expo-maps plugin config. This is NOT an `EXPO_PUBLIC_*`
   variable — it is a build-time config value. The map renders blank on Android without this key.
   **The feature code can be built and reviewed independently; the key is wired when available.**
5. **A dev-client rebuild is required before testing on device/simulator.** expo-maps is a native
   module — it cannot be tested in Expo Go. A new Expo development client build must be run after
   adding expo-maps. This is a delivery prerequisite, not a blocker for implementation work.
6. **Web is platform-guarded, not removed.** The map component and toggle must not break the web
   build. A `.web.ts` stub (or equivalent platform guard) must ensure the web entry point never
   imports the native map module.
7. **No new data fetch on toggle.** The toggle shares `filteredBranches` computed in
   `apps/mobile/src/app/(tabs)/branches/index.tsx` (BRN-001's output). The map view is a second
   rendering surface for the same data — not a new data source.
8. **Pin tap uses existing Expo Router navigation.** `router.push({ pathname: '/(tabs)/branches/[branchId]', params: { branchId: id } })` is the established pattern from BRN-001. Pin tap must reuse it exactly, typed correctly.
9. **Open/closed determination reuses `getIsOpenNow`.** The same utility from
   `packages/utils/src/hours.ts` used in BRN-001/002 must be used for pin state, not a
   re-implementation.
10. **`isAcceptingPickup` from `PickupBranch` type.** The pickup-off state for pins comes from the
    existing `isAcceptingPickup` field on `PickupBranch` (already used in BRN-001). No new field
    or API change is needed.
11. **Fallback centroid: lat 10.323, lng 123.900, delta ~0.05.** This covers all three seeded Cebu
    branches. It is the same centroid used by `useUserLocation` as its no-permission fallback.
12. **Shared UI component library:** any new toggle UI or map wrapper component must use
    `@jojopotato/ui` theme tokens and must not hardcode colors or spacing outside of
    `theme.ts` values.
13. **TypeScript strict mode:** all new code must compile cleanly under `pnpm typecheck`.

---

## Open Questions

None. All product decisions are locked (library, iOS constraints, Android key prerequisite, web
descope, toggle placement, data reuse). Open design choices (callout vs direct nav, toggle control
style, pin visual treatment, component placement) are intentionally deferred to INNOVATE and are
not unresolved product questions blocking this SPEC.

---

## Background / Research Findings

**BRN-001 established substrate (confirmed, reused as-is):**
- `filteredBranches: PickupBranch[]` is already computed in `apps/mobile/src/app/(tabs)/branches/index.tsx` from the search/filter state. Both list and map consume this array — no duplication.
- `PickupBranch` in `packages/types/src/pickup.ts` carries numeric `latitude` and `longitude` fields (added in BRN-001). These are the coordinates passed to map pins.
- `getIsOpenNow(openingHours)` in `packages/utils/src/hours.ts` determines open/closed state for each branch. Pin muting uses this same function.
- `isAcceptingPickup` on `PickupBranch` is the pickup-off flag. Already used for list-row disabled state; reused for pin muting.
- `router.push({ pathname: '/(tabs)/branches/[branchId]', params: { branchId: id } })` is the established Expo Router navigation call for branch nav. Pin tap reuses it identically.
- `useUserLocation` in `apps/mobile/src/hooks/use-user-location.ts` provides the initial map region when location is granted and the Cebu fallback centroid (~lat 10.323, lng 123.900, delta ~0.05) when denied.
- `ApiBranch`/`mapApiBranch` in `apps/mobile/src/features/branches/api.ts` already produce numeric coords for all seeded branches.

**BRN-002 reuse:**
- Branch Details screen (`/(tabs)/branches/[branchId]`) is the navigation destination for pin taps — delivered by BRN-002. No new route or screen is created by BRN-003.
- Directions from the branch details screen are also BRN-002 scope (absorbing BRN-004) — not duplicated here.

**Locked design decisions (user-approved this session):**
1. Library: `expo-maps` (Expo's own module, ~v57 for SDK 57, alpha status accepted).
2. iOS: Apple Maps, iOS 18.0 minimum — accepted constraints, user is Android-focused.
3. Android: Google Maps via expo-maps; developer must provision Google Cloud project + Maps SDK for Android API key restricted to `ph.jojopotato.mobile`; key placed in `app.json` plugin config (build-time, not `EXPO_PUBLIC_*`). Feature code buildable independently.
4. Web: descoped (expo-maps has no web support). List-only on web. Platform guard (`.web.ts` stub or equivalent) required so web build does not fail.
5. Toggle in `apps/mobile/src/app/(tabs)/branches/index.tsx` as conditional render on the same `filteredBranches` — no re-fetch, no state reset on toggle.
6. Dev-client rebuild required before map can be tested (native module — does not work in Expo Go).

**PRD §6.3 excerpt (source of truth):**
- "Map view can be included if already easy to implement" — classified P2 stretch.
- List is the default view. Map is additive.
- No additional product requirements for the map beyond showing branches and enabling navigation to branch details.

**Test reality:**
- No mobile-side unit/component test runner exists (`apps/mobile` has no Jest/Vitest/Detox).
- Automated gates: `pnpm typecheck` (exit 0) and `pnpm lint` (no new errors) — fully automated.
- All map behavior ACs (pin count parity, toggle state preservation, pin-tap nav, closed-pin
  styling, location fallback) are Hybrid — typecheck covers types; runtime behavior requires
  manual verification on a native dev build (iOS simulator or Android device/emulator).
- Google Maps API key and dev-client rebuild are delivery prerequisites, not automated gate items.
- Known-gap label used throughout: "no mobile unit test runner" — consistent with BRN-001/002
  and the project-wide test gap documented in `process/context/tests/all-tests.md`.
