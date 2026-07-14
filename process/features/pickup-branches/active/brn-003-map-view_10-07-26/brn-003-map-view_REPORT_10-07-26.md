---
phase: brn-003-map-view
date: 2026-07-10
status: COMPLETE_WITH_GAPS
feature: pickup-branches
plan: process/features/pickup-branches/active/brn-003-map-view_10-07-26/brn-003-map-view_PLAN_10-07-26.md
---

# BRN-003 Map View — EXECUTE Report

**TL;DR:** All 20 checklist steps implemented. All 3 Fully-Automated gates green
(`pnpm typecheck`, `pnpm lint`, scoped mobile typecheck — all exit 0). The real
expo-maps v57.0.0 API differs materially from the plan's assumed shape (declarative
marker arrays + view-level `onMarkerClick` + `CameraPosition`, not JSX children /
per-marker `onPress` / region-deltas) — adapted within blast radius. Map behavior ACs
(AC-1..AC-7) remain Hybrid/manual pending a dev-client rebuild. Two user prerequisites
below.

## What Was Done

### Phase 1 — Install + native config
- `npx expo install expo-maps` → resolved **`expo-maps@57.0.0`** (SDK-57-aligned stable,
  NOT the alpha `0.x.y` the plan assumed). Pinned exactly to `57.0.0` in
  `apps/mobile/package.json` (removed `~` range). `pnpm-lock.yaml` updated.
- Converted `apps/mobile/app.json` → **`apps/mobile/app.config.ts`** (Option B). Every
  app.json field preserved verbatim (name, slug, version, scheme, ios/android identifiers,
  all 6 existing plugins, `experiments.typedRoutes`, `extra.eas.projectId`, owner,
  adaptiveIcon, infoPlist). Added: `expo-maps` plugin (`requestLocationPermission` +
  `locationPermission`), `android.config.googleMaps.apiKey` from
  `process.env.GOOGLE_MAPS_API_KEY ?? ''`, and `ios.deploymentTarget: '18.0'`.
- Verified via `npx expo config --json`: config loads from app.config.ts, all fields
  resolve, `ios.deploymentTarget=18.0`, all 7 plugins present, key injected from env.
- Renamed `app.json` → `app.json.bak` (Expo uses app.config.ts exclusively; kept .bak for
  safety per E2). Added `.env.local`, `.env.*.local`, `app.json.bak` to
  `apps/mobile/.gitignore` (root already ignores `.env.*`).
- Dev-client-rebuild note added as a comment block in app.config.ts.

### Phase 2 — BranchMap component
- `apps/mobile/src/features/branches/components/branch-map.tsx` (native) — uses real API:
  `<AppleMaps.View>` (iOS) / `<GoogleMaps.View>` (Android), each with `markers` array,
  `cameraPosition`, and view-level `onMarkerClick`. One marker per branch; `event.id` →
  `onBranchPress(branch.id)`. `CEBU_FALLBACK` = `{ latitude: 10.323, longitude: 123.9,
  zoom: 13 }` (adapted to CameraPosition shape). Camera centres on `coords` when non-null
  (zoom 14), else fallback.
- `apps/mobile/src/features/branches/components/branch-map.web.ts` (web stub) — no
  expo-maps import; `BranchMap(_props): React.ReactElement | null` returns `null`; inline
  props interface mirrors native exactly (E5).

### Phase 3 — Toggle + wiring in index.tsx
- Added `Button` + `BranchMap` imports, `viewMode` state (`'list' | 'map'`, default
  `'list'`), toggle row (two Buttons, primary/outline, `list-outline`/`map-outline` icons)
  after `<Input>` guarded by `Platform.OS !== 'web'`, conditional map render
  (`viewMode === 'map' && Platform.OS !== 'web'`), and `toggleRow` style (Spacing tokens).
- Pin tap mirrors the existing list-row pattern: `setSelectedBranch(id)` then
  `router.push({ pathname: '/(tabs)/branches/[branchId]', params: { branchId: id } })`.
- **index.tsx behaviour/styling confirmed undisturbed:** all changes additive. `query`,
  `branches`, `sortedBranches`, `filteredBranches`, fetch effect, loading/error/empty
  states, and the FlatList block are byte-unchanged. Toggling is pure local state — no
  refetch, no query/sort reset. Yellow/Fredoka styling flows through the shared
  `@jojopotato/ui` Button (`Palette.jyellow` + `FontFamily.display.bold`), untouched.

## expo-maps ACTUAL API (E4 probe — verified against installed v57.0.0 type defs)

| Aspect | Plan assumed | Actual (v57.0.0) |
|---|---|---|
| Import | `AppleMaps`/`GoogleMaps` or unified `MapView` | Namespaces `AppleMaps`/`GoogleMaps`; use `AppleMaps.View` / `GoogleMaps.View` |
| Markers | JSX children with per-marker `onPress` | Declarative `markers={[...]}` prop array; NO JSX children |
| Marker tap | per-marker `onPress` | single view-level `onMarkerClick(event)`; `event.id` identifies pin |
| Initial camera | `region` w/ `latitudeDelta`/`longitudeDelta` | `cameraPosition={{ coordinates:{latitude,longitude}, zoom }}` — NO deltas |
| Marker shape | `tintColor` uncertain | Apple marker HAS `tintColor?: string`; Google marker does NOT (has `icon`, `zIndex`, `title`, `coordinates`, `id`) |
| Muted pins | opacity `<View>` wrapper | iOS: `tintColor` (jyellow active / neutral400 muted). Android: no tint/opacity prop → known-gap |

## Test Gate Outcomes

| Gate | Strategy | Result |
|---|---|---|
| `pnpm typecheck` (root, 6 pkgs) | Fully-Automated | **PASS** (exit 0) |
| `pnpm lint` (root, 6 pkgs) | Fully-Automated | **PASS** (exit 0; 3 pre-existing warnings in scripts/dev-with-tunnel.mjs, not my files) |
| `pnpm --filter @jojopotato/mobile typecheck` | Fully-Automated | **PASS** (exit 0) |
| `git diff --check` | — | PASS (no merge markers) |
| AC-1..AC-7 (map behaviour) | Hybrid | **PENDING** — require dev-client rebuild; NOT run (not fabricated) |
| AC-7/AC-8 web list-only | Hybrid | PENDING manual `pnpm web` browser check |
| expo-maps-api-shape | Agent-Probe | **DONE** — API documented above; `tintColor` confirmed on Apple markers |
| mobile-runner-gap | Known-Gap | Unchanged (no RN test runner project-wide) |

## Plan Deviations (all within blast radius — apps/mobile only, no schema/auth/API)

1. **expo-maps version `57.0.0` (stable, SDK-aligned), not alpha `0.x.y`.** Pinned exactly.
   Impact: none negative — stable is preferable to alpha. Plan's alpha assumption was stale.
2. **Real expo-maps API is declarative marker arrays + view-level `onMarkerClick` +
   `CameraPosition`** (not JSX children / per-marker onPress / region-deltas / opacity
   wrapper). Component built to the real API. Impact: same UX intent; CEBU_FALLBACK uses
   `zoom: 13` instead of `latitudeDelta/longitudeDelta: 0.05`.
3. **Muted pins:** iOS uses `tintColor` (E4-confirmed upgrade path over the opacity fallback).
   **Android has no marker tint/opacity prop** — muted state carried via `title` "(closed)"
   suffix + `zIndex` ordering only. True Android pin dimming needs custom icon-image assets =
   deferred (see Test Infra Gaps).
4. **Omitted `import 'dotenv/config'` from app.config.ts.** `dotenv` is an undeclared
   transitive dep (pnpm strict linking would risk a resolution failure). Expo CLI natively
   auto-loads `.env`/`.env.local` into `process.env` before config eval (proven: `expo config`
   resolved the key from env). Env-key behaviour is identical and verified working.

## Test Infra Gaps Found

- **Android muted-pin dimming** — Google markers expose no `tintColor`/opacity; visual muting
  on Android needs custom bitmap/icon assets (grey vs brand pin). Deferred as a follow-up
  enhancement. iOS muting works via `tintColor` today.
- **No RN test runner** (pre-existing project-wide gap) — AC-1..AC-7 cannot be automated;
  tracked in `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.

## Follow-up Stubs Created
- None as new files. Two residuals recorded here: (a) Android custom-icon muted pins;
  (b) map-behaviour E2E (blocked on the known RN-runner gap above).

## USER PREREQUISITES (action required before Android map works / to fix key placement)

1. **Google Maps key placement:** put the real restricted Android key in
   `apps/mobile/.env.local` as `GOOGLE_MAPS_API_KEY=<key>` (this file is gitignored). Expo
   auto-loads it at build time into `android.config.googleMaps.apiKey`. **REMOVE the key
   from `packages/api/.env`** where it was mistakenly placed — it does not belong in the API
   package's environment. (It is NOT committed to git anywhere — verified `git grep` finds no
   `GOOGLE_MAPS` in tracked files. The key value was NOT read or moved by this agent.)
   Also restrict the key in Google Cloud to bundle id `ph.jojopotato.mobile` + signing SHA-1.
2. **Dev-client rebuild:** expo-maps is a native module — it cannot run in Expo Go. Run
   `npx expo run:ios` (or `npx expo run:android`) once before verifying any map ACs.

## PENDING (privacy-gated, not blocking build)
- **E1 `.env.example` doc line NOT written** — the privacy hook blocks writes to
  `apps/mobile/.env.example`. Add this line manually (safe, non-secret template):
  ```
  # Google Maps (Android) API key — build-time native config read by app.config.ts via
  # process.env.GOOGLE_MAPS_API_KEY. Real key goes in apps/mobile/.env.local (gitignored),
  # never here and never in packages/api/.env. iOS (Apple Maps) needs no key.
  GOOGLE_MAPS_API_KEY=
  ```

## Closeout Packet
- **Selected plan:** brn-003-map-view_PLAN_10-07-26.md
- **Finished:** all 20 checklist steps; 3 Fully-Automated gates green; E1–E7 addressed
  (E1 `.env.example` line pending privacy approval — noted above).
- **Verified:** typecheck/lint/scoped-typecheck (automated). Expo config loads app.config.ts
  with all fields + env key. expo-maps API probe done.
- **Unverified:** AC-1..AC-7 map runtime behaviour (need dev-client rebuild — not run, not
  fabricated); web list-only browser check.
- **Cleanup remaining:** user prerequisites (1) + (2) above; E1 `.env.example` manual line.
- **Best next state:** Keep in active/testing — CODE DONE, but VERIFIED requires the manual
  Hybrid ACs on a native dev build per the plan's Phase Completion Rules.

## Forward Preview
### Test Infra Found
- No RN runner; Android custom-icon muting deferred (both above).
### Blast Radius Changes
- apps/mobile only: app.config.ts (new), branch-map.tsx + branch-map.web.ts (new),
  index.tsx / package.json / .gitignore (modified), app.json→app.json.bak (rename),
  pnpm-lock.yaml. No packages/* source changed.
### Commands to Stay Green
- `pnpm typecheck` · `pnpm lint` · `pnpm --filter @jojopotato/mobile typecheck`
### Dependency Changes
- Added `expo-maps@57.0.0` (exact-pinned) to apps/mobile.
