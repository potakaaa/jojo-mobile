---
phase: home-tab-navigation
date: 2026-07-08
status: COMPLETE_WITH_GAPS
feature: general-plans
plan: process/general-plans/active/home-tab-navigation_08-07-26/home-tab-navigation_PLAN_08-07-26.md
---

# Home Tab & Navigation — Execute Report

## What Was Done

All 19 Implementation Checklist items completed in order.

- **Dependency (item 1):** `@expo/vector-icons@^15.1.1` added to `apps/mobile/package.json`
  dependencies and `pnpm-lock.yaml` (was fully absent before, not even transitive). Resolved via
  `pnpm add ... --filter @jojopotato/mobile` so the version matches the SDK 57 toolchain.
- **Config verify (item 2):** `apps/mobile/app.json` confirmed to need no change — `expo-router`
  plugin present; SDK 57 / RN 0.86 is New-Architecture-only, so no legacy-arch flag or extra
  plugin exists to configure for native tabs. No edit made.
- **Shared placeholder (item 3):** `src/components/coming-soon.tsx` — presentational, `title` prop,
  themed via `@/constants/theme` + `useTheme`.
- **Mock data (item 4):** `src/features/home/mock-home.ts` — `MOCK_CATEGORIES` (4), `MOCK_PRODUCTS`
  (8), `MOCK_BRANCH`, `MOCK_REWARDS`, typed against `MenuCategory`/`MenuItem`/`PickupBranch`/
  `RewardsAccount` from the `@jojopotato/types` flat barrel. File-level comment marks it as
  placeholder. One product omits `imageUrl` and one is `isAvailable: false` to exercise graceful
  degradation.
- **Section components (items 5–11):** `home-header`, `branch-selector`, `promo-banner`,
  `rewards-teaser-card`, `category-selector`, `product-card`, `product-grid` under
  `src/features/home/components/`. Interactive ones (branch, rewards, category chips, product card)
  carry local `useState` pressed/selected visual state only; none navigate. `product-card` renders
  `expo-image` when `imageUrl` is present, else a themed placeholder block. `product-grid` uses
  `FlatList numColumns={2} scrollEnabled={false}` to nest safely inside the Home `ScrollView`.
- **Route group (items 12–15):** `(tabs)/_layout.tsx` (native `NativeTabs` with the compound
  `Trigger.Icon sf/md` + `Trigger.Label` API, 4 triggers in order index/order/rewards/account),
  `(tabs)/_layout.web.tsx` (stable `Tabs` + `Ionicons` focused/unfocused pairs), `(tabs)/index.tsx`
  (Home, composes the 6 sections), and `order/rewards/account.tsx` (each renders `ComingSoon`).
- **Deletion (item 16):** `src/app/index.tsx` design-token showcase removed. Confirmed no importers
  first (route leaf).
- **Root layout (item 17):** `src/app/_layout.tsx` left byte-for-byte unchanged — its bare
  `<Stack screenOptions={{ headerShown: false }} />` auto-discovers the new `(tabs)` group.

## What Was Skipped or Deferred

- **Live simulator / device walkthrough (checklist item 19):** No iOS/Android simulator or device
  is available in this execution environment. Substituted a static bundle-compile check (`expo
  export` for both `web` and `ios`) per the design-system plan's "no simulator" precedent. The
  visual Agent-Probe gates (Liquid Glass material on iOS 26+, live tap-through, splash→Home startup
  transition) remain visually UNVERIFIED — see Test Gate Outcomes and Test Infra Gaps.

## Test Gate Outcomes

| Gate | Tier | Command | Result |
|---|---|---|---|
| UI typecheck | Fully-Automated | `pnpm --filter @jojopotato/ui typecheck` | PASS |
| Mobile typecheck | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` | PASS |
| Mobile lint | Fully-Automated | `pnpm --filter @jojopotato/mobile lint` | PASS |
| Root typecheck | Fully-Automated | `pnpm typecheck` | PASS (4/4 packages) |
| Root lint | Fully-Automated | `pnpm lint` | PASS (5/5 packages) |
| Web bundle | Hybrid (substitute) | `expo export --platform web` | PASS — 10 static routes incl. `/`, `/order`, `/rewards`, `/account`, `(tabs)`; native-tabs web CSS emitted |
| iOS bundle | Hybrid (substitute) | `expo export --platform ios` | PASS — 2.8MB Hermes bytecode, native `unstable-native-tabs` path bundled, no resolution errors |
| Tab-bar / Home-content / placeholder / Liquid-Glass / startup visual probes | Agent-Probe | `pnpm ios` / `pnpm android` / `pnpm web` on a live device | NOT RUN — no simulator/device available |

**Alpha-API note (VALIDATE was skipped):** the primary risk from skipping VALIDATE — that the alpha
`expo-router/unstable-native-tabs` API shape might differ from the plan's documented `Trigger.Icon`
/`Trigger.Label` compound form — is now empirically cleared at compile/bundle level: the mobile
`tsc --noEmit` typecheck AND the iOS Metro bundle both succeeded with that exact API. What remains
unproven is only runtime visual behavior on a real iOS 26+ device (Liquid Glass material), which
requires a simulator.

## Plan Deviations

None material. Two within-blast-radius implementation-detail notes:

1. **`product-card` category tag** renders `product.categoryId` as the tag text (plan said "a
   category tag" without specifying the source string). Kept minimal; a future pass can map id →
   category display name. No scope/contract impact.
2. **Implementation Checklist has no `[ ]` markdown checkboxes** (items are numbered bold headers),
   so there were none to flip in that section; completion is recorded in `## Phase Loop Progress`
   step 3 instead.

## Test Infra Gaps Found

- No test runner exists in the repo (documented in `all-context.md` / `all-tests.md`), so there is
  no automated component/E2E coverage for the new navigation shell or Home sections — verification
  is typecheck + lint + bundle-compile only. Known gap carried from the plan's Out-of-Scope.
- No iOS/Android simulator in this environment: the 5 Agent-Probe visual gates (tab bar visible +
  Home selected, 6 sections render, styled placeholders, Liquid Glass material, startup transition)
  could not be executed and need a human/simulator pass before the plan can be marked ✅ VERIFIED.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/home-tab-navigation_08-07-26/home-tab-navigation_PLAN_08-07-26.md`
- **Finished:** all 19 checklist items; whole monorepo typechecks + lints clean; iOS + web bundles
  export with all routes resolved.
- **Verified vs unverified:** automated gates + bundle-compile VERIFIED; live-device visual
  behavior (Liquid Glass, tap-through, startup transition) UNVERIFIED (no simulator).
- **Cleanup remaining:** UPDATE PROCESS (archive plan, context notes) once a human confirms the
  device walkthrough.
- **Closeout classification:** `Keep in active/testing` — code-complete but manual/visual
  verification and user confirmation are still pending.
- **Best next state:** run `pnpm ios` / `pnpm android` / `pnpm web` on a device/simulator to clear
  the 5 Agent-Probe gates, then `ENTER UPDATE PROCESS MODE`.

## Forward Preview

- **Test Infra Found:** none added (no runner introduced by this plan, per scope).
- **Blast Radius Changes:** `apps/mobile` only — 15 new files, 1 deleted (`src/app/index.tsx`), 1
  manifest edit (`package.json`) + lockfile. No `packages/*` source changed. New precedent
  established: the `features/{name}/` screen-feature folder convention (`features/home/`) that
  `ordering-cart`, `pickup-branches`, `auth-accounts`, `rewards-notifications` can copy.
- **Commands to Stay Green:** `pnpm typecheck` and `pnpm lint` (root).
- **Dependency Changes:** added `@expo/vector-icons@^15.1.1` to `@jojopotato/mobile` (web tab icons
  only).

---

# Phase 6 — Custom Android Tab Bar — Execute Report (08-07-26)

**Status:** COMPLETE_WITH_GAPS (custom Android bar implemented; typechecks/lints/exports green on
all three platforms after the 08-07-26 web-export regression fix — see the "Web-export regression
RESOLVED" amendment below. Only live-device visual walkthroughs remain as known-gaps.)

## What Was Done (items 20-24)

- **Item 20 — rename `_layout.tsx` → `_layout.ios.tsx`:** DONE via `mv` (plain, not `git mv` — the
  `(tabs)/` dir is untracked because Phase 1-5 was never committed). Content byte-for-byte identical
  to the pre-rename NativeTabs file (verified by inspection; git cannot show a rename on untracked
  files, so the item-20/23 `git diff --stat` check was satisfied by direct content inspection
  instead).
- **Item 21 — `components/android-tab-bar.tsx`:** DONE. Floating pill bar: `position:'absolute'`,
  `bottom: insets.bottom + Spacing.two`, `left/right: Spacing.three`, `borderRadius: Radii.full`,
  `borderWidth: 2`, theme-aware `Colors.{mode}.background` / `.border`, `Shadows.offsetMd` spread on
  the container. Per-tab `Pressable` driven by `state.index === i`; active tab shows a
  `Palette.jyellow` 40x40 pill chip (`Radii.full`) behind the icon with `Palette.ink` icon color;
  inactive icon `Colors.{mode}.textSecondary`. NO vertical translate on activation (pill sits in
  place). Ionicons filled/-outline pairs match `_layout.web.tsx` exactly. Labels always visible
  (`FontFamily.body.semibold`, `TypeScale.caption`, active/inactive color rule). `useSafeAreaInsets()`
  called directly. Tap handling emits `navigation.emit({type:'tabPress', target:route.key,
  canPreventDefault:true})` and checks `event.defaultPrevented` before `navigation.navigate`.
  **Risk 6 fallback applied:** `@react-navigation/bottom-tabs` does NOT resolve through the pnpm
  workspace (`error TS2307: Cannot find module`), so a locally-declared minimal `BottomTabBarProps`
  type is used (per checklist item 21 authorization). No new dependency added.
- **Item 22 — `_layout.android.tsx`:** DONE. Stable `Tabs` from `expo-router` (not native-tabs),
  `tabBar={(props) => <AndroidTabBar {...props} />}`, 4 `Tabs.Screen` (index/order/rewards/account)
  with `title` + `tabBarIcon` render props reusing the same Ionicons pairs as `_layout.web.tsx`.
- **Item 23 — iOS/web unaffected:** VERIFIED. `_layout.web.tsx` untouched; `(tabs)/` now contains
  exactly the renamed `_layout.ios.tsx`, new `_layout.android.tsx`, new `components/android-tab-bar.tsx`,
  and the 4 unchanged route files. No route file touched.

## Test Gate Outcomes (item 24)

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/ui typecheck` | ✅ exit 0 |
| `pnpm --filter @jojopotato/mobile typecheck` | ✅ exit 0 |
| `pnpm --filter @jojopotato/mobile lint` | ✅ exit 0 |
| `pnpm typecheck` (root) | ✅ exit 0 (4/4 tasks) |
| `pnpm lint` (root) | ✅ exit 0 (5/5 tasks) |
| `npx expo export --platform android` | ✅ exit 0 — bundles clean (the new path) |
| `npx expo export --platform ios` | ✅ exit 0 — bundles clean (unaffected) |
| `npx expo export --platform web` | ✅ exit 0 (after 08-07-26 fix) — 12 static routes; was ❌ exit 1 REGRESSION, see amendment below |
| `pnpm android` live visual (jyellow pill, no float-up) | ⏳ KNOWN-GAP — no emulator in this env |
| `pnpm ios` / `pnpm web` live no-change | ⏳ KNOWN-GAP — no simulator/browser session |

## Plan Deviations / Blocking Concern

> **RESOLVED 08-07-26 — see "Web-export regression RESOLVED" amendment at the end of this report.**
> The concern below is retained verbatim for audit history; the fix (re-added base `_layout.tsx`
> fallback re-exporting `_layout.web.tsx`) has since cleared this regression on all three platforms.

**WEB EXPORT REGRESSION (genuine plan-mechanism gap — NOT silently patched):**
`npx expo export --platform web` now fails with:
`The file ./(tabs)/_layout.web.tsx does not have a fallback sibling file without a platform extension.`

Root cause: Expo Router's **static web export** requires every platform-suffixed route file to have
a plain (non-suffixed) fallback sibling. Before Phase 6, `(tabs)/_layout.tsx` (no suffix) was that
fallback. Item 20 renamed it to `_layout.ios.tsx`, leaving only `.ios` / `.android` / `.web`
variants and no plain fallback. Android and iOS exports do not enforce this rule; the web static
export does. This is exactly the convention Risk 7 flagged — the repo's existing two-way precedent
(`use-color-scheme.ts` + `.web.ts`) always kept a plain default; the plan's three-way all-suffixed
split for `_layout` removes it.

This contradiction has **no documented plan fallback** (unlike Risk 6's `BottomTabBarProps`), so per
the EXECUTE handoff instruction it was reported rather than silently patched. It was NOT fixed
in-place because the obvious fix — restoring a plain `_layout.tsx` fallback — would make checklist
item 23's assertion ("exactly 1 rename, 2 new files, 0 other changes") false, which is a PLAN
decision, not an EXECUTE one.

**Recommended fix (for PLAN reconciliation):** add a plain `apps/mobile/src/app/(tabs)/_layout.tsx`
that re-exports the web layout (or a neutral default) as the required non-suffixed fallback — OR
make one of the three platform files the plain default (e.g. keep iOS as `_layout.tsx` and only add
`_layout.android.tsx`, so iOS is the fallback and web/android override it). Either way item 23's
file-count assertion must be updated to allow a 4th layout file. Then re-run
`npx expo export --platform web` to confirm green.

## Test Infra Gaps Found

- No test runner exists (per plan scope) — automated coverage limited to typecheck/lint + bundle
  export. Live Android visual behavior (floating pill, jyellow active chip, no float-up animation,
  labels always visible) cannot be confirmed in this environment (no emulator). User must run
  `pnpm android` to visually confirm.

## Forward Preview

- **Test Infra Found:** none added.
- **Blast Radius Changes:** `apps/mobile` only — Phase 6 = 1 rename + 3 new files
  (`_layout.android.tsx`, `components/android-tab-bar.tsx`, and the re-added base `_layout.tsx`
  fallback — see amendment). Zero new dependencies.
- **Commands to Stay Green:** `pnpm typecheck` + `pnpm lint` (root) AND `expo export` for all three
  platforms (web/ios/android) — all green as of the 08-07-26 fix.
- **Dependency Changes:** none (Phase 6 adds no dependency).

---

# Web-export regression RESOLVED (08-07-26 amendment)

**What was fixed:** the `npx expo export --platform web` regression documented in the "Plan
Deviations / Blocking Concern" section above is now resolved. Orchestrator authorized a scoped
mechanical fix (no new PLAN/VALIDATE cycle) since it is a build-config repair, not a design change.

**Fix applied:** re-added `apps/mobile/src/app/(tabs)/_layout.tsx` as a thin base fallback:

```tsx
export { default } from './_layout.web';
```

This satisfies Expo Router's static-web-export requirement for a non-platform-suffixed `_layout`
sibling alongside `_layout.ios.tsx` / `_layout.android.tsx` / `_layout.web.tsx`. The file is never
selected at runtime on iOS/Android/web (Metro's platform-extension resolution always prefers the
matching platform sibling); it exists purely so the static-export tooling has a base layout to fall
through to, and it re-exports the web layout's default as the lowest-risk content. `_layout.ios.tsx`,
`_layout.android.tsx`, `android-tab-bar.tsx`, and `_layout.web.tsx` were NOT touched.

**Corrected Phase 6 file delta:** 1 rename (`_layout.tsx` → `_layout.ios.tsx`) + **3** new files
(`android-tab-bar.tsx`, `_layout.android.tsx`, re-added fallback `_layout.tsx`); `_layout.web.tsx`
untouched. Documented as an amendment to plan checklist items 20 and 23 (see plan EXECUTE STATUS
block, item 23, Touchpoints table, and Phase Loop Progress step 7).

**Full re-verification pass (08-07-26, all green):**

| Gate | Result |
|---|---|
| `npx expo export --platform web` (from `apps/mobile`) | ✅ exit 0 — 12 static routes, was the failing gate |
| `npx expo export --platform ios` | ✅ exit 0 — unaffected |
| `npx expo export --platform android` | ✅ exit 0 — unaffected |
| `pnpm --filter @jojopotato/mobile typecheck` | ✅ exit 0 |
| `pnpm --filter @jojopotato/mobile lint` | ✅ exit 0 |
| `pnpm typecheck` (root) | ✅ exit 0 (4/4 tasks) |
| `pnpm lint` (root) | ✅ exit 0 (5/5 tasks) |

**Remaining known-gaps (unchanged):** live-device visual walkthroughs (`pnpm android` floating pill
bar, `pnpm ios` / `pnpm web` no-change) still require a device/simulator/browser session not
available in this environment.

**Observational note — RESOLVED (08-07-26):** the web static export previously listed
`/components/android-tab-bar` and `/(tabs)/components/android-tab-bar` as routes — Expo Router was
treating the `(tabs)/components/android-tab-bar.tsx` file as a route because its file-based router
scans every `.tsx` under `app/` (a `components/` subfolder does NOT exclude files from routing;
only a leading-underscore name or a path outside `app/` does). Plan item 21's original
`components/`-subfolder-excludes-routing assumption was wrong.

**Fix applied:** moved `apps/mobile/src/app/(tabs)/components/android-tab-bar.tsx` →
`apps/mobile/src/components/android-tab-bar.tsx` (same directory as the existing `coming-soon.tsx`,
outside `app/`), removed the now-empty `(tabs)/components/` directory, and updated the import in
`_layout.android.tsx` from `./components/android-tab-bar` to `@/components/android-tab-bar` (the
`@/*` → `./src/*` alias, mirroring how `coming-soon.tsx` is imported in `order.tsx`/`rewards.tsx`/
`account.tsx`). No behavior change — the component is byte-identical apart from an added doc comment
noting why it lives outside `app/`.

**Verification (all re-run 08-07-26, all green):**

| Gate | Result |
|---|---|
| `npx expo export --platform web` | ✅ exit 0 — 10 static routes, NO `android-tab-bar` route (leak gone) |
| `npx expo export --platform ios` | ✅ exit 0 |
| `npx expo export --platform android` | ✅ exit 0 |
| `pnpm --filter @jojopotato/mobile typecheck` | ✅ exit 0 |
| `pnpm --filter @jojopotato/mobile lint` | ✅ exit 0 |
| `pnpm typecheck` (root) | ✅ exit 0 (4/4 tasks) |
| `pnpm lint` (root) | ✅ exit 0 (5/5 tasks) |

Web export route list after the fix: `/ (index)`, `/order`, `/account`, `/rewards`, `/_sitemap`,
`/+not-found`, `/(tabs)`, `/(tabs)/order`, `/(tabs)/account`, `/(tabs)/rewards` — the two
`android-tab-bar` entries are gone.

---

# Tab-switch animation (Android-only) — addition (08-07-26)

**What was added:** subtle tab-switch animation on the Android custom pill bar, using
`react-native-reanimated` (already an installed dependency, `4.5.0` — no new dependency added).
This is the first Reanimated usage in `apps/mobile/src` or `packages/ui/src` — grep confirmed zero
prior imports, so it introduces a new (but pre-approved) pattern, not a scope violation.

Three animation pieces:

1. **Active pill chip springs in** — the yellow `Palette.jyellow` chip behind the active icon now
   scales `0.6 → 1` and opacity-fades `0 → 1` via `withSpring` (`damping 15 / stiffness 180 /
   mass 0.6`) instead of snapping. Implemented as an absolutely-positioned `Animated.View`
   background inside the (now static) 40×40 `iconChip`, so scaling is center-origin and the icon
   column stays vertically fixed — the original "NO vertical shift" constraint is preserved (only
   scale / opacity / color animate, never position).
2. **Icon + label color cross-fade** — icon and label colors interpolate between active
   (`Palette.ink`) and inactive (`textSecondary`) with `interpolateColor` driven by the same spring
   progress value, instead of snapping. The Ionicons glyph swap (outline ↔ filled) stays discrete;
   the color cross-fades over it. Icon animation uses `Animated.createAnimatedComponent(Ionicons)`.
3. **Screen content fade** — `animation: 'fade'` added to the Android `Tabs` `screenOptions` in
   `_layout.android.tsx` only. Verified compatible: the `animation` screen option applies to the
   screen container, not the tab bar UI, so it coexists with the custom `tabBar` render prop; it
   typechecks cleanly against the resolved `expo-router@57.0.4` types (SDK 57 ships a vendored
   navigator — the lockfile has zero `@react-navigation/*` deps — but the `animation` option is
   still exposed on `Tabs`/`Tabs.Screen` options, confirmed via Expo docs and the passing typecheck).

Rules-of-hooks note: each tab cell was extracted into a `TabItem` child component so the Reanimated
hooks run at a stable position per tab rather than inside the `state.routes.map()` loop.

**Files changed (Android-only, additive):**
- `apps/mobile/src/components/android-tab-bar.tsx` — Reanimated icon-chip + color animation; `TabItem`
  extracted. Accessibility props, `android_ripple` borderless fix, and tabPress/`defaultPrevented`
  navigation semantics all preserved unchanged; all visual tokens unchanged.
- `apps/mobile/src/app/(tabs)/_layout.android.tsx` — added `animation: 'fade'` to `screenOptions`.
- iOS (`_layout.ios.tsx`), web (`_layout.web.tsx`), and the base `_layout.tsx` fallback were NOT touched.

**Gate results (all green, 08-07-26):**

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` | ✅ exit 0 |
| `pnpm --filter @jojopotato/mobile lint` | ✅ exit 0 (0 errors, 0 warnings) |
| `npx expo export --platform android` | ✅ exit 0 — bundles clean with new Reanimated usage |
| `npx expo export --platform ios` | ✅ exit 0 — no regression (untouched) |
| `npx expo export --platform web` | ✅ exit 0 — 10 routes, no `android-tab-bar` leak (untouched) |

**Known-gap (unchanged):** live-device visual confirmation of the animation feel (`pnpm android`)
still requires an emulator/device not available in this environment. The animation is verified at
typecheck/lint/bundle level only.

---

## Follow-up fix — tab-bar gap tightening + floating-bar content clearance (08-07-26)

Two Android-only polish issues on the custom floating pill tab bar, fixed without touching iOS
(`_layout.ios.tsx`), web (`_layout.web.tsx`), or their behavior.

**Issue 1 — icon-to-label gap too large.** `android-tab-bar.tsx` `styles.tab.gap` changed from
`Spacing.one` (4dp) to `Spacing.half` (2dp).

**Issue 2 — floating bar reserved no space, overlapping scrollable content.** Because the bar is a
custom `tabBar` render prop on the stable `Tabs`, React Navigation reserves no bottom inset, so
screens rendered full-height under the floating bar. Fix:
- Exported `getAndroidTabBarClearance(insetsBottom: number): number` from `android-tab-bar.tsx`,
  computed from the real styles (not a magic number): `BAR_CONTENT_HEIGHT = 40 (iconChip) +
  Spacing.half (gap, 2) + 15 (~1.2 × TypeScale.caption 12, one text line) + Spacing.two * 2 (bar
  paddingVertical, 16) = 73`, then `73 + insetsBottom + Spacing.two (bar bottom offset) +
  Spacing.two (breathing room)` = **89 + insetsBottom** dp. A function (not a static const) because
  `insets.bottom` is device-dependent.
- `apps/mobile/src/app/(tabs)/index.tsx` (Home) — added `Platform.OS === 'android'` conditional
  `paddingBottom: getAndroidTabBarClearance(insets.bottom)` to the ScrollView `contentContainerStyle`
  so the last product-grid row clears the bar. iOS/web unchanged (reserve space natively).
- `apps/mobile/src/components/coming-soon.tsx` (Order / Rewards / Account placeholders) — same
  Android-only conditional bottom padding on the centered content view.

iOS/web visuals are byte-identical (all new padding is behind a `Platform.OS === 'android'` guard).

**Gate results (all green, 08-07-26):**

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` | ✅ exit 0 |
| `pnpm --filter @jojopotato/mobile lint` | ✅ exit 0 |
| `npx expo export --platform android` | ✅ exit 0 |
| `npx expo export --platform ios` | ✅ exit 0 — no regression |
| `npx expo export --platform web` | ✅ exit 0 — no regression |
