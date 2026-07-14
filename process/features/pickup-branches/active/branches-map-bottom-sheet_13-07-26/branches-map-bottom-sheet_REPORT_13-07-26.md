---
phase: branches-map-bottom-sheet
date: 2026-07-13
status: COMPLETE_WITH_GAPS
feature: pickup-branches
plan: process/features/pickup-branches/active/branches-map-bottom-sheet_13-07-26/branches-map-bottom-sheet_PLAN_13-07-26.md
---

# EXECUTE Report — Branch Locator Redesign (Map Base + Bottom Sheet)

**TL;DR:** All 8 checklist steps applied. 5 Fully-Automated gates green (mobile typecheck,
mobile lint, root typecheck, `git diff --check`, AC-8 protected-files-untouched). Status is
CODE DONE, not VERIFIED — the on-device Agent-Probe manual pass over USB is still required
(no RN runner exists; documented Known-Gap). `@gorhom/bottom-sheet` resolved to **5.2.14**
(>= 5.1.8, reanimated-4 OK). iOS enum members resolved from installed type defs, not guessed.

## What Was Done

- **Phase A1 — dep install + E1 gate.** `pnpm --filter @jojopotato/mobile add @gorhom/bottom-sheet`
  → resolved `5.2.14`, pinned `^5.2.14` in `apps/mobile/package.json`. Version >= 5.1.8 confirmed
  (reanimated-4 support). Typecheck passes with `BottomSheet`/`BottomSheetFlatList` imported.
- **Phase A2 — GestureHandlerRootView.** `apps/mobile/src/app/_layout.tsx` — imported
  `GestureHandlerRootView` from `react-native-gesture-handler`; wrapped the outermost returned
  element (outside `ThemeProvider`) in `<GestureHandlerRootView style={{ flex: 1 }}>`.
- **Phase B3 — map-style.ts (NEW).** `apps/mobile/src/features/branches/map-style.ts` exports
  `MAP_STYLE_JSON: string` (JSON.stringify of a warm brand style array — cream land `#FFF6E6` /
  `#EFE7D2`, soft-yellow roads from `#FFD21E`/`#F7B500`, muted-brown labels `#5F3A22`, toned water
  `#CFE0DA`, de-emphasized/hidden POI). Not inlined in the screen. Cites mapstyle.withgoogle.com.
- **Phase B4 — map theming.** `apps/mobile/src/features/branches/components/branch-map.tsx` —
  Android `GoogleMaps.View` gets `properties={{ mapStyleOptions: { json: MAP_STYLE_JSON } }}`;
  iOS `AppleMaps.View` gets `colorScheme={AppleMaps.MapColorScheme.LIGHT}` (top-level prop) +
  `properties={{ emphasis: AppleMapsMapStyleEmphasis.MUTED, pointsOfInterest: { excluding: [...] } }}`.
  Both platforms wrap map + a `pointerEvents="none"` low-opacity warm overlay
  (`rgba(255,246,230,0.12)`) in a `flex:1` `View`. Markers / cameraPosition / onMarkerClick
  byte-unchanged.
- **Phase C5 — screen rewrite.** `apps/mobile/src/app/(tabs)/branches/index.tsx` — data/state block
  (fetch, sort, filter, select+navigate) preserved verbatim; `viewMode` state + both toggle `Button`s
  + `toggleRow` style + `Button` import removed. Web (`Platform.OS === 'web'`) renders the current
  search `Input` + `FlatList` (byte-for-byte). Native renders full-bleed `<BranchMap>` base +
  absolute floating search pill (`box-none` wrap, `top: insets.top + Spacing.two`, cream/ink/comic
  style) + `<BottomSheet index={0} snapPoints={['50%','92%']}>` holding `<BottomSheetFlatList>` with
  the same `renderItem`; loading/error/empty render inside the sheet; list bottom padding =
  `getFloatingTabBarClearance(insets.bottom)`.
- **Phase C6 — z-order sanity.** Bottom→top: map base → warm overlay (`pointerEvents="none"`) →
  floating search pill (`box-none`) → bottom sheet (rendered last). Nothing between
  `GestureHandlerRootView` and `BottomSheet` swallows gestures.
- **Phase D7 — optional handle extraction.** n/a — inline `handleIndicatorStyle` sufficient (YAGNI).
- **Phase E8 — verify.** All Fully-Automated gates green (see Test Gate Outcomes).

## What Was Skipped or Deferred

- Phase D7 shared-UI sheet-handle extraction — skipped (handle is a single style prop, not reusable
  markup; YAGNI per plan's conditional).
- On-device Agent-Probe manual pass (AC-1..AC-6, boot probe) — deferred to the human on the running
  dev client over USB. Cannot be automated (no RN runner). This is why status is COMPLETE_WITH_GAPS
  (CODE DONE), not VERIFIED.

## Test Gate Outcomes

| Gate | Strategy | Result |
|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` | Fully-Automated | PASS (exit 0) |
| `pnpm --filter @jojopotato/mobile lint` | Fully-Automated | PASS (0 errors; 3 pre-existing warnings in untouched `scripts/dev-with-tunnel.mjs`) |
| `pnpm typecheck` (root, 5 pkgs) | Fully-Automated | PASS (5/5) |
| `git diff --check` | Fully-Automated | PASS (no conflict markers) |
| AC-8: `git diff --name-only` protected-file scan | Fully-Automated | PASS (api.ts, use-selected-branch.ts, use-user-location.ts, [branchId].tsx absent) |
| @gorhom/bottom-sheet >= 5.1.8 + reanimated-4 (E1) | Fully-Automated (cheap-local) | PASS (5.2.14) |
| App boot / map / sheet / search / theming / overlay / web runtime (AC-1..AC-7) | Agent-Probe (on-device) | DEFERRED — requires manual USB pass |
| Automated map/sheet interaction test | Known-Gap | No RN runner project-wide |

## Plan Deviations

1. **iOS `colorScheme` is a direct `AppleMaps.View` prop, not inside `properties`.** The plan's
   exact-prop-shape reference placed it in `properties`, but installed `expo-maps@57.0.0` type defs
   define `colorScheme` on `AppleMapsViewProps` (top-level), NOT `AppleMapsProperties`. Corrected to
   the real API — this is precisely the E2 "resolve from .d.ts, don't guess" instruction catching a
   stale plan assumption. Within blast radius (branch-map.tsx). No behavior change (forced-light map).
2. **Absolute fill via explicit `top/left/right/bottom:0`** instead of `StyleSheet.absoluteFill`.
   Installed RN typings expose `absoluteFill` as a non-spreadable registered-style number and have no
   `absoluteFillObject` (typecheck error TS2551). Semantically identical full-bleed absolute fill;
   `pointerEvents="none"` preserved. Within blast radius (branch-map.tsx).

Both are within-blast-radius library-shape corrections, not design changes. Locked decisions D1–D6
all honored. No hard-stop-class deviations.

## Test Infra Gaps Found

- No RN test runner for `apps/mobile` (pre-existing, project-wide). Map/sheet/gesture/theming runtime
  behavior is on-device manual only. Backlog stub exists:
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` — add
  "map-base + bottom-sheet branch locator" scenario at UPDATE PROCESS.

## Closeout Packet

- **Selected plan:** `process/features/pickup-branches/active/branches-map-bottom-sheet_13-07-26/branches-map-bottom-sheet_PLAN_13-07-26.md`
- **Finished:** all 8 checklist steps; 5 Fully-Automated gates green; new dep pinned; new file created.
- **Verified vs unverified:** VERIFIED = code compiles/lints/types-source-compatible + protected files
  untouched. UNVERIFIED = all runtime map/sheet/search/theming behavior (Agent-Probe, needs on-device
  manual pass over USB — Metro hot-reload, JS-only, no rebuild).
- **Cleanup/context remaining (UPDATE PROCESS):** (a) record this supersedes the BRN-003 list/map
  toggle in the BRN-003 task folder; (b) add map-base+sheet scenario to the e2e-navigation-harness
  backlog note; (c) Android closed-pin muting remains open/orthogonal.
- **Closeout classification:** Keep in active/testing — CODE DONE but on-device manual verification
  pending; not yet archivable.
- **Best next state:** perform the on-device Agent-Probe pass on the running dev client. If green →
  ENTER UPDATE PROCESS MODE for this plan.

## Forward Preview

### Test Infra Found
- No RN runner; on-device manual is the only runtime proof path. `packages/api` has vitest (unrelated).

### Blast Radius Changes
- Modified: `apps/mobile/src/app/(tabs)/branches/index.tsx`, `apps/mobile/src/app/_layout.tsx`,
  `apps/mobile/src/features/branches/components/branch-map.tsx`, `apps/mobile/package.json`,
  `pnpm-lock.yaml`. Created: `apps/mobile/src/features/branches/map-style.ts`. Untouched (AC-8):
  api.ts, use-selected-branch.ts, use-user-location.ts, [branchId].tsx, branch-map.web.ts.

### Commands to Stay Green
- `pnpm --filter @jojopotato/mobile typecheck` · `pnpm --filter @jojopotato/mobile lint`
  · `pnpm typecheck` · `git diff --check`

### Dependency Changes
- Added `@gorhom/bottom-sheet@^5.2.14` (JS-only; native peers already installed — NO dev-client
  rebuild required).

## Unresolved Questions
- None blocking. Only open item is the human on-device Agent-Probe pass (expected, by design).
