---
name: plan:home-tab-navigation
description: "Implementation plan for the bottom tab navigator + Home browse screen + placeholder tabs"
date: 08-07-26
metadata:
  node_type: plan
  type: plan
  status: draft
---

# Home Tab & Navigation - Plan

**Date**: 08-07-26
**Complexity**: Simple
**Status**: 🔨 CODE DONE (Phase 1-5 shipped; Phase 6 — custom Android tab bar — added
08-07-26, code not yet written)

## Overview

Build the app's first real navigation shell and first real screen: a 4-tab bottom navigator
(Home, Order, Rewards, Account) using `expo-router/unstable-native-tabs` on iOS/Android (Liquid
Glass "for free" on iOS 26+) with a stable `Tabs` web fallback, a composed Home browse screen
built from six new `features/home/` section components backed by local mock data, and a shared
`ComingSoon` placeholder for the other three tabs. This replaces the current design-token showcase
screen as the app's entry point. Implements the locked SPEC
(`home-tab-navigation_SPEC_08-07-26.md`) and the INNOVATE Decision Summary passed in by the
orchestrator — this plan does not re-decide the Liquid Glass approach, route structure, or file
layout; it sequences and specifies them precisely.

**Phase 6 addition (08-07-26):** after seeing the Android result, the user requested a fully
custom-styled Android tab bar matching the Jojo Potato brand, replacing Android's default Material
tab bar. iOS Liquid Glass (native tabs) stays completely untouched. This is implemented via
`expo-router`'s stable `Tabs` with a custom `tabBar` render prop on Android only, split from iOS by
Metro's `.ios.tsx` / `.android.tsx` platform-extension resolution (the same convention already used
for `.web.tsx`). See the new Implementation Checklist — Phase 6 section below for the full
INNOVATE-locked mechanism and visual spec.

## Quick Links

- [Goals and Success Metrics](#goals-and-success-metrics)
- [Phase Completion Rules](#phase-completion-rules)
- [Execution Brief](#execution-brief)
- [Scope](#scope)
- [Assumptions and Constraints](#assumptions-and-constraints)
- [Functional Requirements](#functional-requirements)
- [Non-Functional Requirements](#non-functional-requirements)
- [Acceptance Criteria](#acceptance-criteria)
- [Implementation Checklist](#implementation-checklist)
- [Implementation Checklist — Phase 6: Custom Android Tab Bar](#implementation-checklist--phase-6-custom-android-tab-bar)
- [Risks and Mitigations](#risks-and-mitigations)
- [Integration Notes](#integration-notes)
- [Touchpoints](#touchpoints)
- [Public Contracts](#public-contracts)
- [Blast Radius](#blast-radius)
- [Verification Evidence](#verification-evidence)
- [Test Infra Improvement Notes](#test-infra-improvement-notes)
- [Resume and Execution Handoff](#resume-and-execution-handoff)
- [Phase Loop Progress](#phase-loop-progress)
- [Validate Contract](#validate-contract)

## Goals and Success Metrics

**Goals:**
- Give the app a real navigation shell (4-tab bottom bar) and a real first screen (Home) in place
  of the design-token showcase.
- Get Liquid Glass on iOS 26+ "for free" via the native tabs API, without breaking older iOS,
  Android, or web.
- Establish the first `features/{name}/` screen-feature convention other planned areas
  (`ordering-cart`, `pickup-branches`, `auth-accounts`, `rewards-notifications`) can follow.
- Keep Order/Rewards/Account functional-but-placeholder so the tab bar is fully navigable today.

**Success Metrics:**
- App launches to Home with a visible, tappable 4-tab bar (Home selected by default).
- Home renders all 6 content sections without runtime errors, using clearly-marked mock data.
- Order/Rewards/Account show a styled "coming soon" screen, no crash, no bare/unstyled screen.
- iOS 26+ shows Liquid Glass tab bar material; iOS<26/Android/web show their normal
  platform tab bar with no crash and no blank screen.
- `pnpm typecheck` and `pnpm lint` pass cleanly across the whole monorepo.
- Splash → font-gate → ThemeProvider startup sequence is byte-for-byte unchanged.

---

## Phase Completion Rules

A phase is NOT complete until:

1. **Integration Test** - Works with other system pieces (e.g. the new `(tabs)/` route group
   composes cleanly with the unmodified root `_layout.tsx`)
2. **Manual Test** - A person can perform the action (open the app, see Home, tap through tabs)
3. **Data Verification** - N/A for this plan (no database/backend); substitute: mock data renders
   correctly and is visibly typed against the real shared shapes
4. **Error Handling** - No runtime crashes on any of iOS/Android/web; missing optional fields
   (e.g. `imageUrl`) degrade gracefully
5. **User Confirmation** - User says "it works"

Status meanings:
- ⏳ PLANNED - Not started
- 🔨 CODE DONE - Written but not E2E tested
- 🧪 TESTING - Currently being tested
- ✅ VERIFIED - Tested AND confirmed working
- 🚧 BLOCKED - Has issues

After each phase, document:
- [ ] What was tested manually
- [ ] Mock data verified to render correctly (no live DB — N/A)
- [ ] Errors encountered and fixed
- [ ] User confirmation received

---

## Execution Brief

**IMPORTANT:** This is a SIMPLE (one-session) plan — implement continuously without approval
gates once EXECUTE begins. The phases below are logical groupings for understanding flow, NOT stop
points.

Before EXECUTE begins, vc-validate-agent must write the Validate Contract section. Do not start
EXECUTE with an empty placeholder.

### Phase 1: Dependency + Config Verification
**What happens:** Add `@expo/vector-icons` explicitly to `apps/mobile/package.json` (confirmed
absent from the lockfile — not even a transitive dependency today). Confirm `app.json` needs no
new plugin entry for `unstable-native-tabs` (Expo SDK 57 / RN 0.86 ships New Architecture as the
only architecture — no `newArchEnabled` flag or extra plugin is needed; the feature is provided by
the already-declared `expo-router` plugin).

### Phase 2: Shared Placeholder + Mock Data
**What happens:** Create `src/components/coming-soon.tsx` (new `src/components/` dir) and
`src/features/home/mock-home.ts` (new `src/features/` dir), sourcing types from
`@jojopotato/types`'s flat barrel export.

### Phase 3: Home Section Components
**What happens:** Build the 7 `features/home/components/*` files (header, branch selector, promo
banner, rewards teaser, category selector, product card, product grid).

### Phase 4: Route Files
**What happens:** Create the `(tabs)/` route group — `_layout.tsx` (native tabs),
`_layout.web.tsx` (stable Tabs + Ionicons web fallback), `index.tsx` (Home, composes Phase 3
components), `order.tsx`, `rewards.tsx`, `account.tsx` (all three use `ComingSoon`). Delete the
superseded `src/app/index.tsx` showcase screen.

### Phase 5: Verification
**What happens:** Run `pnpm typecheck` and `pnpm lint` at the root, then manual `pnpm ios` /
`pnpm android` / `pnpm web` walkthroughs per the Verification Evidence table.

### Test Gates

After completing all implementation steps, verify the following:

1. **Typecheck:** `pnpm typecheck` — whole monorepo compiles clean `[automated]`
2. **Lint:** `pnpm lint` — whole monorepo lints clean `[automated]`
3. **Tab bar smoke test:** `pnpm ios` — app launches to Home, 4 tabs visible, Home selected
   `[agent-probe]`
4. **Home content test:** scroll through Home on `pnpm ios` — all 6 sections render, no red-box
   errors `[agent-probe]`
5. **Placeholder test:** tap Order/Rewards/Account on `pnpm ios` / `pnpm android` — styled
   "coming soon" screen, no crash `[agent-probe]`
6. **Liquid Glass visual test:** `pnpm ios` on an iOS 26+ simulator — translucent/blurred tab bar
   material visible `[agent-probe]`
7. **Cross-platform no-crash test:** `pnpm android` and `pnpm web` — app launches, tab bar
   visible, no blank screen `[agent-probe]`
8. **Startup-sequence regression test:** `pnpm ios` — splash → fonts-loaded → Home transition
   looks identical to pre-change behavior `[agent-probe]`

(tier: fully-automated | hybrid | agent-probe — assigned per item above)

### Expected Outcome
- 4-tab navigator with Liquid Glass on iOS 26+, functioning on all 4 platforms.
- Home screen fully composed from mock data, no runtime errors.
- Order/Rewards/Account show branded placeholders.
- Whole monorepo typechecks and lints clean.

---

## Scope

**In-Scope:**
- `(tabs)/` route group: native tabs layout, web tabs layout, 4 route files.
- `features/home/` — 7 section components, 1 mock data module, Home route composition.
- `src/components/coming-soon.tsx` shared placeholder, used by Order/Rewards/Account.
- Removal of the superseded `src/app/index.tsx` showcase screen.
- `@expo/vector-icons` added as an explicit dependency (web tab icons only).

**Out-of-Scope (carried from SPEC):**
- Real backend/API integration for menu, branches, or rewards.
- Product detail screens, cart, checkout, or ordering flow.
- Real branch-picker screen/logic, geolocation, or map integration.
- Real rewards/points calculation or notifications.
- Auth or account management screens beyond the placeholder.
- Building out Order/Rewards/Account beyond a placeholder screen.
- Automated end-to-end or component test coverage (no runner exists yet).
- EAS Build/Submit or CI wiring.
- Pixel-perfect Android/web parity.

## Assumptions and Constraints

**Assumptions:**
- `expo-router/unstable-native-tabs` compound `Trigger.Icon` / `Trigger.Label` syntax (confirmed
  via `docs.expo.dev/router/advanced/native-tabs`, SDK 55+ shape, applicable to the installed
  `expo-router@57.0.4`) is stable enough for this foundation-stage app; known alpha-API risk is
  accepted per SPEC/INNOVATE (see Risks).
- `@expo/vector-icons` (specifically `Ionicons`) is safe to add as a first-party, Expo-maintained
  package with near-zero install risk, even though it is currently fully absent from the lockfile.
- No `app.json` plugin changes are required for native tabs on Expo SDK 57 / RN 0.86 (New
  Architecture only, no legacy-arch toggle exists to configure).
- `packages/types/src/index.ts`'s flat barrel (`export * from './menu'` etc.) is the only import
  surface needed — no subpath imports like `@jojopotato/types/menu` are attempted.

**Constraints (carried from SPEC, do not re-litigate in EXECUTE):**
- Must nest inside the existing root `_layout.tsx` without altering its startup sequence.
- Must reuse only existing `@jojopotato/ui` tokens/components — no new ad-hoc design tokens.
- Must work fully offline with local mock data — no network calls.
- Must not crash or render blank on Android or web.
- No new test runner introduced by this plan.
- kebab-case files, camelCase functions/variables, PascalCase components, `@/*` alias inside
  `apps/mobile`.
- Mock data must be clearly commented as placeholder, structurally inspired (not copied) from
  jojopotato.ph menu content.

## Functional Requirements

1. **Tab Navigator (native, iOS/Android)** — `(tabs)/_layout.tsx` renders `NativeTabs` with 4
   `NativeTabs.Trigger` entries (`index`, `order`, `rewards`, `account`), each with a nested
   `NativeTabs.Trigger.Icon` (`sf` for iOS, `md` for Android) and `NativeTabs.Trigger.Label`.
2. **Tab Navigator (web fallback)** — `(tabs)/_layout.web.tsx` renders the stable `expo-router`
   `Tabs` component with the same 4 route names, `tabBarIcon` supplied by `Ionicons` from
   `@expo/vector-icons`, focused/unfocused icon pairs.
3. **Home Screen** — `(tabs)/index.tsx` renders, top to bottom, inside a `ScrollView`:
   `HomeHeader`, `BranchSelector`, `PromoBanner`, `RewardsTeaserCard`, `CategorySelector`,
   `ProductGrid`.
4. **Branch selector, rewards card, category chips, product cards** — each supports a local
   pressed/selected visual state on tap; none navigate anywhere.
5. **Category selector** — horizontal `ScrollView`/`FlatList` of category chips; tapping a chip
   toggles a local "selected" highlight state (no real filtering of the product grid required by
   SPEC, but cheap to wire so the visual state reads correctly).
6. **Product grid** — 2-column scrollable grid of `ProductCard`s (image, name, short description,
   category tag), backed by `MOCK_PRODUCTS`.
7. **Placeholder tabs** — `order.tsx`, `rewards.tsx`, `account.tsx` each render
   `<ComingSoon title="Order" />` / `"Rewards"` / `"Account"` — no other content.
8. **Shared placeholder component** — `src/components/coming-soon.tsx` exports a component
   parameterized by a `title` prop, styled with `@jojopotato/ui` tokens (not bare/unstyled).
9. **Mock data module** — `src/features/home/mock-home.ts` exports `MOCK_CATEGORIES`,
   `MOCK_PRODUCTS`, `MOCK_BRANCH`, `MOCK_REWARDS`, typed against `MenuCategory`, `MenuItem`,
   `PickupBranch`, `RewardsAccount` from `@jojopotato/types`.

## Non-Functional Requirements

- **Design:** All new UI uses only existing `@jojopotato/ui` exports (`Palette`, `Brand`,
  `Colors`, `Spacing`, `Radii`, `Shadows`, `FontFamily`, `TypeScale`, `JojoButton`,
  `BrandWordmark`) or the app-local re-export at `apps/mobile/src/constants/theme.ts`. No new
  tokens invented.
- **Platform behavior:** iOS-first, Android-ready — Android and web must run without crashing or
  showing a blank screen, even though visual polish is judged against iOS first.
- **Startup behavior:** the splash-screen / font-gate / `ThemeProvider` sequence in the root
  `_layout.tsx` is not modified in any way.
- **Dependency hygiene:** `@expo/vector-icons` is declared explicitly in
  `apps/mobile/package.json` per this repo's explicit-deps convention (do not rely on an assumed
  transitive install — confirmed absent from `pnpm-lock.yaml` today).
- **Type safety:** all new files pass `pnpm typecheck` with no new `any` usage; mock data is
  fully typed against the real shared types, not ad-hoc inline shapes.
- **Naming:** kebab-case filenames, camelCase functions/variables, PascalCase components
  (matches existing repo convention).

## Acceptance Criteria

(mirrors SPEC Acceptance Criteria 1-7 verbatim; each item below is also linked in
[Verification Evidence](#verification-evidence))

1. Launching the app shows a bottom tab bar with exactly 4 tabs — Home, Order, Rewards, Account —
   and Home is the initially selected tab.
2. The Home screen renders all six content sections without runtime errors, using placeholder
   data only.
3. Tapping each of the Order, Rewards, and Account tabs shows a styled "coming soon" placeholder
   screen with no crash.
4. On iOS 26+, the tab bar visually renders with the Liquid Glass system material; on older
   iOS/Android/web the app still launches and functions with a platform-appropriate tab bar.
5. App startup sequence behaves identically to pre-change behavior.
6. The whole monorepo passes `pnpm typecheck` and `pnpm lint` after the change.
7. The former design-token showcase content is not what users see on first app launch; its
   content is fully removed (per SPEC's "replace, don't relocate" disposition decision) since the
   showcase's purpose (proving tokens render) is now served by real usage.

## Implementation Checklist

1. **Add `@expo/vector-icons` dependency**
   - Edit `apps/mobile/package.json`: add `"@expo/vector-icons"` to `dependencies` (use the
     version already resolved for the installed Expo SDK 57 toolchain — resolve via `pnpm add
     @expo/vector-icons --filter @jojopotato/mobile` rather than hand-picking a version string).
   - Run `pnpm install` at the repo root to update `pnpm-lock.yaml`.
   - Verify: `grep -n "@expo/vector-icons" apps/mobile/package.json pnpm-lock.yaml` both show hits.

2. **Confirm no `app.json` changes needed**
   - Re-check `apps/mobile/app.json` `expo.plugins` — confirm `expo-router` is present (it is) and
     no additional plugin/config entry is required for `unstable-native-tabs` on Expo SDK 57 (New
     Architecture only; no legacy-arch flag exists to set).
   - This is a verification-only step — no file edit expected. If research during EXECUTE finds a
     plugin IS required, treat that as a plan deviation and flag it rather than silently adding
     config.

3. **Create `src/components/coming-soon.tsx`**
   - New file, new `apps/mobile/src/components/` directory.
   - Exports a component accepting a `title: string` prop, renders a centered `View` with
     `@jojopotato/ui`/`@/constants/theme` tokens (brand background, `TypeScale.h2` "coming soon"
     copy referencing `title`, e.g. `"${title} — Coming soon"`).
   - No navigation, no state — pure presentational.

4. **Create `src/features/home/mock-home.ts`**
   - New file, new `apps/mobile/src/features/` and `apps/mobile/src/features/home/` directories.
   - Imports `MenuItem`, `MenuCategory`, `PickupBranch`, `RewardsAccount` from
     `@jojopotato/types` (flat barrel export — `packages/types/src/index.ts` re-exports all 7
     domain modules with `export *`, so `import { MenuItem, MenuCategory, PickupBranch,
     RewardsAccount } from '@jojopotato/types'` resolves; do not attempt a subpath import like
     `@jojopotato/types/menu`).
   - Exports `MOCK_CATEGORIES: MenuCategory[]` (structurally inspired by jojopotato.ph flavor
     categories, e.g. "Classic", "Cheesy", "Spicy", "Sweet & Savory" — originals, not scraped
     copy), `MOCK_PRODUCTS: MenuItem[]` (structurally inspired by SPEC's Background research —
     Flavored Fries, Korean Corndog, Chicken Nuggets, Flavored Lemonade style items, with
     `priceCents` and `categoryId` matching `MOCK_CATEGORIES` ids), `MOCK_BRANCH: PickupBranch`,
     `MOCK_REWARDS: RewardsAccount`.
   - File-level comment block explicitly states this is placeholder/mock data, not real data, per
     SPEC constraint.

5. **Create `src/features/home/components/home-header.tsx`**
   - Greeting/header section (e.g. brand wordmark + short greeting line), pure presentational,
     styled with theme tokens.

6. **Create `src/features/home/components/branch-selector.tsx`**
   - Accepts `branch: PickupBranch` prop, renders a tappable chip/row showing `branch.name`.
   - Local `useState` pressed/selected visual state on tap; no navigation, no callback required by
     SPEC (may accept an optional `onPress` prop for future wiring, but default behavior is
     visual-only).

7. **Create `src/features/home/components/promo-banner.tsx`**
   - Static promo/banner visual (brand-colored panel with promo copy) — no props required beyond
     optional styling; no mock-data dependency needed (purely presentational banner).

8. **Create `src/features/home/components/rewards-teaser-card.tsx`**
   - Accepts `rewards: RewardsAccount` prop, renders a tappable card showing `points` and `tier`.
   - Local pressed/selected visual state on tap, same pattern as branch selector.

9. **Create `src/features/home/components/category-selector.tsx`**
   - Accepts `categories: MenuCategory[]` prop, renders a horizontal scrollable row of chips.
   - Local `useState<string | null>` for the selected category id; tapping a chip toggles its
     highlighted/selected visual state. No filtering wiring required by SPEC — component is
     self-contained (does not need to communicate the selection back up to `ProductGrid`).

10. **Create `src/features/home/components/product-card.tsx`**
    - Accepts a single `product: MenuItem` prop, renders image placeholder (or `expo-image` if an
      `imageUrl` is present — mock data may omit `imageUrl` and the card must handle that
      gracefully with a placeholder block), `name`, `description`, and a category tag.
    - Local pressed/selected visual state on tap.

11. **Create `src/features/home/components/product-grid.tsx`**
    - Accepts `products: MenuItem[]` prop, renders a 2-column scrollable grid of `ProductCard`s
      (`FlatList` with `numColumns={2}` or an equivalent wrapped-row layout — implementer's
      choice, must not break inside the parent `ScrollView` on `(tabs)/index.tsx`; if using
      `FlatList` inside a `ScrollView`, set `scrollEnabled={false}` on the inner `FlatList` to
      avoid nested-VirtualizedList warnings).

12. **Create `(tabs)/_layout.tsx`** — native tabs (iOS/Android)
    - `import { NativeTabs } from 'expo-router/unstable-native-tabs';`
    - Renders `<NativeTabs>` with 4 `<NativeTabs.Trigger name="...">` children in order: `index`
      (Home), `order` (Order), `rewards` (Rewards), `account` (Account).
    - Each `Trigger` contains `<NativeTabs.Trigger.Icon sf="house.fill" md="home" />` (Home),
      `sf="bag.fill" md="shopping_bag"` (Order), `sf="star.fill" md="star"` (Rewards),
      `sf="person.fill" md="person"` (Account), plus a matching
      `<NativeTabs.Trigger.Label>` (`"Home"` / `"Order"` / `"Rewards"` / `"Account"`).
    - Confirmed compound syntax: `NativeTabs.Trigger.Icon` and `NativeTabs.Trigger.Label` are
      nested under `NativeTabs.Trigger` (not sibling `Icon`/`Label` components) — verified against
      `docs.expo.dev/router/advanced/native-tabs` during PLAN research (SDK 55+ shape, applies to
      the installed `expo-router@57.0.4`).

13. **Create `(tabs)/_layout.web.tsx`** — stable Tabs (web fallback)
    - Metro auto-resolves this over `_layout.tsx` on web builds (same convention as
      `use-color-scheme.web.ts`).
    - `import { Tabs } from 'expo-router';` + `import { Ionicons } from '@expo/vector-icons';`
    - Renders `<Tabs>` with 4 `<Tabs.Screen name="..." options={{ tabBarIcon, title }} />` in the
      same order, `tabBarIcon={({ focused, color, size }) => <Ionicons name={focused ?
      'home' : 'home-outline'} color={color} size={size} />}` pattern per tab (Order:
      `bag`/`bag-outline`, Rewards: `star`/`star-outline`, Account: `person`/`person-outline`).

14. **Create `(tabs)/index.tsx`** — Home route
    - Thin route file: imports `MOCK_CATEGORIES`, `MOCK_PRODUCTS`, `MOCK_BRANCH`, `MOCK_REWARDS`
      from `@/features/home/mock-home` and the 6 section components from
      `@/features/home/components/*`.
    - Renders a `SafeAreaView` > `ScrollView` composing, in order: `HomeHeader`,
      `BranchSelector branch={MOCK_BRANCH}`, `PromoBanner`,
      `RewardsTeaserCard rewards={MOCK_REWARDS}`, `CategorySelector categories={MOCK_CATEGORIES}`,
      `ProductGrid products={MOCK_PRODUCTS}`.

15. **Create `(tabs)/order.tsx`, `(tabs)/rewards.tsx`, `(tabs)/account.tsx`**
    - Each is a thin route file rendering `<ComingSoon title="Order" />` /
      `<ComingSoon title="Rewards" />` / `<ComingSoon title="Account" />` from
      `@/components/coming-soon`.

16. **Delete `apps/mobile/src/app/index.tsx`**
    - Removes the design-token showcase route. Now that `(tabs)/index.tsx` exists, this avoids a
      duplicate/conflicting `index` route. Confirm no other file imports from the deleted
      `index.tsx` (it is a route leaf, expected to have no importers) before deleting.

17. **Root layout unchanged — verification only**
    - Confirm `apps/mobile/src/app/_layout.tsx` requires zero edits: its bare
      `<Stack screenOptions={{ headerShown: false }} />` auto-discovers the new `(tabs)` route
      group via Expo Router file-based routing; splash/font-gate/ThemeProvider sequence stays
      byte-for-byte the same. This is a verification-only step — no file edit expected.

18. **Run automated gates**
    - `pnpm typecheck` (root, via turbo) — all packages including `@jojopotato/mobile` pass clean.
    - `pnpm lint` (root, via turbo) — all packages pass clean.
    - `pnpm --filter @jojopotato/mobile typecheck` and `pnpm --filter @jojopotato/mobile lint` as
      a faster single-package pre-check before the root run, if desired.

19. **Run manual verification**
    - `pnpm ios` — confirm 4-tab bar, Home selected by default, all 6 Home sections render, tap
      through Order/Rewards/Account (styled placeholders, no crash), observe splash→Home startup
      transition is unchanged. If an iOS 26+ simulator is available, additionally confirm the
      Liquid Glass tab bar material.
    - `pnpm android` — confirm tab bar renders (standard Material style), all 4 tabs navigable, no
      crash, no blank screen.
    - `pnpm web` — confirm the `_layout.web.tsx` fallback renders, all 4 tabs navigable via
      `Ionicons`, no crash, no blank screen.

## Implementation Checklist — Phase 6: Custom Android Tab Bar

Added 08-07-26 after user feedback on the shipped Android result. Mechanism and visual spec are
locked by INNOVATE — do not re-decide during EXECUTE. iOS (native tabs / Liquid Glass) and web
(`_layout.web.tsx`) are explicitly out of scope for this phase and must not change.

**Locked mechanism (INNOVATE):** `expo-router`'s stable `Tabs` (import from `expo-router`, not
`unstable-native-tabs`) accepts a `tabBar={(props) => <CustomTabBar {...props} />}` render prop,
forwarded to `@react-navigation/bottom-tabs`. The custom component receives `state`/`descriptors`/
`navigation` (React Navigation `BottomTabBarProps`); call `useSafeAreaInsets()` directly inside the
component rather than relying on the `insets` prop. Tab presses must emit
`navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })` and check
`event.defaultPrevented` before calling `navigation.navigate(route.name)`, per React Navigation's
custom-tab-bar convention (preserves proper `tabPress` semantics, e.g. scroll-to-top / re-tap
behavior on the active tab).

**EXECUTE STATUS (08-07-26):**
- Item 20 ✅ DONE — renamed via `mv` (not `git mv`: `(tabs)/` is untracked, Phase 1-5 not yet
  committed). `_layout.ios.tsx` content is byte-for-byte identical to the pre-rename `_layout.tsx`
  (verified by inspection, since git can't show a rename on untracked files).
- Item 21 ✅ DONE — `android-tab-bar.tsx` created. **Risk 6 fallback applied:**
  `@react-navigation/bottom-tabs` does NOT resolve through the pnpm workspace (`error TS2307`), so
  a locally-declared minimal `BottomTabBarProps` type is used, per checklist item 21 authorization.
  No new dependency added.
- **Item 21 location correction (08-07-26 — route-leak fix):** The file was originally created at
  `apps/mobile/src/app/(tabs)/components/android-tab-bar.tsx`. That was WRONG: Expo Router scans
  every `.tsx` under `app/` (a `components/` subfolder does NOT exclude files from routing — only a
  leading-underscore name or living outside `app/` does), so the web export leaked
  `/components/android-tab-bar` and `/(tabs)/components/android-tab-bar` as routes. Fix: moved to
  `apps/mobile/src/components/android-tab-bar.tsx` (same dir as `coming-soon.tsx`, outside `app/`),
  removed the now-empty `(tabs)/components/` dir, and updated item 22's import to
  `@/components/android-tab-bar`. Verified: web export now lists 10 static routes with no
  `android-tab-bar` route; iOS/android exports + all typecheck/lint gates still green.
- Item 22 ✅ DONE — `_layout.android.tsx` created (stable `Tabs` + custom `tabBar`).
- Item 23 ✅ DONE (amended 08-07-26) — `_layout.web.tsx` untouched. Corrected file count: **1
  rename + 3 new files** (see item-20/23 amendment below), not 2 new files.
- Item 24 ✅ DONE (amended 08-07-26) — ui/mobile/root typecheck + root lint all exit 0; `expo
  export` for **all three** platforms (web ✅ / iOS ✅ / android ✅) now clean. Android/iOS manual
  walkthrough = known-gap (no emulator). See report for full detail.

**Item-20/23 amendment (08-07-26 — web-export regression fix):** Item 20's rename removed the
non-suffixed `(tabs)/_layout.tsx`, which Expo Router's static web export requires as a base
fallback sibling alongside the `.ios`/`.android`/`.web` variants (`_layout.web.tsx does not have a
fallback sibling file without a platform extension`). Fix: re-added a thin
`(tabs)/_layout.tsx` fallback that re-exports the web layout's default
(`export { default } from './_layout.web';`). Verified empirically — `expo export` now passes on
web, iOS, and android. This is a documented amendment to items 20 and 23, not a silent change:
the corrected Phase 6 file delta is **1 rename (`_layout.tsx` → `_layout.ios.tsx`), 3 new files
(`android-tab-bar.tsx`, `_layout.android.tsx`, and the re-added fallback `_layout.tsx`),
`_layout.web.tsx` still untouched.**

20. **Rename `apps/mobile/src/app/(tabs)/_layout.tsx` → `apps/mobile/src/app/(tabs)/_layout.ios.tsx`**
    - Content unchanged — still `NativeTabs` from `expo-router/unstable-native-tabs`. This is a
      pure rename (`git mv`), making the file iOS-only via Metro's `.ios.tsx` platform-extension
      resolution (same convention as `.web.tsx`).
    - Verify: `apps/mobile/src/app/(tabs)/_layout.tsx` no longer exists;
      `apps/mobile/src/app/(tabs)/_layout.ios.tsx` exists with identical content to the pre-rename
      file (`git diff --stat` shows a rename, not a content change).
    - `pnpm --filter @jojopotato/mobile typecheck`

21. **Create `apps/mobile/src/components/android-tab-bar.tsx`**
    - New file in the existing `apps/mobile/src/components/` directory (same dir as
      `coming-soon.tsx`), OUTSIDE `app/`. It MUST live outside `app/` so Expo Router's file-based
      router does not auto-discover it as a route — a `components/` subfolder under `app/` does NOT
      exclude files from routing; only a leading-underscore name or a path outside `app/` does.
      (Corrected 08-07-26: originally placed at `(tabs)/components/android-tab-bar.tsx`, which
      leaked as a route — see EXECUTE STATUS item 21 location correction.)
    - Exports the custom `tabBar` component consumed by `_layout.android.tsx` (checklist item 22).
    - Props: `BottomTabBarProps` (`state`, `descriptors`, `navigation`) imported from
      `@react-navigation/bottom-tabs` if it resolves cleanly through the pnpm workspace at
      typecheck time; otherwise fall back to a locally-declared minimal prop type in this file
      (see Risk 6) rather than adding a new explicit dependency.
    - Calls `useSafeAreaInsets()` from `react-native-safe-area-context` (already installed)
      directly inside the component.
    - Reads the active theme via the existing `use-theme.ts` hook (same pattern as other
      components in this plan) to select `Colors.light.*` / `Colors.dark.*`.
    - **Bar container:** `position: 'absolute'`, `bottom: insets.bottom + Spacing.two`,
      `left`/`right: Spacing.three`, `borderRadius: Radii.full`, `flexDirection: 'row'`,
      `justifyContent: 'space-around'`, background `Colors.{mode}.background` (cream light /
      panel dark), `borderWidth: 2`, `borderColor: Colors.{mode}.border` (ink light / panelBorder
      dark), shadow = spread `Shadows.offsetMd` onto the container (accept the documented Android
      elevation-only approximation already noted in `theme.ts` — no custom shadow workaround).
    - **Per-tab `Pressable`:** one per `state.routes[i]`, driven by `state.index === i` for active
      state (not by pressed/hover state). Active item renders a jyellow (`Palette.jyellow`)
      pill-shaped chip (`borderRadius: Radii.full`, ~40x40dp) behind the icon; icon color
      `Palette.ink` when active, `Colors.{mode}.textSecondary` when inactive. Use the same
      Ionicons filled/`-outline` pairs already used in `_layout.web.tsx` (`home`/`home-outline`,
      `bag`/`bag-outline`, `star`/`star-outline`, `person`/`person-outline`) as the second
      active/inactive signal, read from `descriptors[route.key].options.tabBarIcon` if set on the
      screen, or hardcode the same 4 icon pairs directly in this component (implementer's choice,
      but must render identically to the pairs used in `_layout.web.tsx`).
    - **No vertical translate/shift on activation** — explicitly avoid the native-Android
      float-up-on-select behavior the user disliked; the pill fades/scales in place, the icon
      column stays vertically fixed.
    - **Labels:** always visible in both active and inactive states, `fontFamily:
      FontFamily.body.semibold`, `fontSize: TypeScale.caption`, color follows the same
      active/inactive rule as the icon. Label text comes from
      `descriptors[route.key].options.title`.
    - **Tap handling:** on `Pressable` press, emit `navigation.emit({ type: 'tabPress', target:
      route.key, canPreventDefault: true })`; if `!event.defaultPrevented`, call
      `navigation.navigate(route.name)`.
    - `pnpm --filter @jojopotato/mobile typecheck`

22. **Create `apps/mobile/src/app/(tabs)/_layout.android.tsx`**
    - New file. `import { Tabs } from 'expo-router';` (stable Tabs, not native tabs) +
      `import AndroidTabBar from '@/components/android-tab-bar';` (the `@/*` → `./src/*` alias,
      matching how `coming-soon.tsx` is imported; corrected 08-07-26 from the old
      `./components/android-tab-bar` relative path).
    - Renders `<Tabs tabBar={(props) => <AndroidTabBar {...props} />}>` with the same 4
      `<Tabs.Screen name="..." options={{ title, tabBarIcon }} />` entries, same order, same
      `name`/`title` values as `_layout.web.tsx`: `index` (Home), `order` (Order), `rewards`
      (Rewards), `account` (Account).
    - `tabBarIcon` render props reuse the exact Ionicons name pairs already used in
      `_layout.web.tsx` (`home`/`home-outline`, `bag`/`bag-outline`, `star`/`star-outline`,
      `person`/`person-outline`) — kept on `Tabs.Screen.options` even though the custom bar may
      read icons directly, so `descriptors[route.key].options` stays a complete, self-describing
      source of truth per screen.
    - Metro auto-resolves this file over any non-platform-suffixed layout on Android builds (same
      convention as `.ios.tsx` and `.web.tsx`).
    - `pnpm --filter @jojopotato/mobile typecheck`

23. **Verify iOS and web layouts are completely unaffected**
    - Confirm `apps/mobile/src/app/(tabs)/_layout.web.tsx` has zero diff (git shows no changes to
      this file at all).
    - Confirm the only change to the former `_layout.tsx` content is the item-20 rename — diff the
      renamed `_layout.ios.tsx` against the pre-Phase-6 `_layout.tsx` content and confirm it is
      byte-for-byte identical.
    - Confirm no other file in `(tabs)/` was touched beyond the 3 new/renamed files in items 20-22.
    - `git status` / `git diff --stat` on `apps/mobile/src/app/(tabs)/` — expect exactly: 1 rename
      (`_layout.tsx` → `_layout.ios.tsx`, no content diff), 3 new files (`_layout.android.tsx`,
      `components/android-tab-bar.tsx`, and the re-added base fallback `_layout.tsx` — see item-20/23
      amendment in the EXECUTE STATUS block above), 0 changes to `_layout.web.tsx` or any route file
      (`index.tsx`, `order.tsx`, `rewards.tsx`, `account.tsx`).
    - **Note:** the re-added `_layout.tsx` is a base fallback required by Expo Router's static web
      export; it is not a native route layout and re-exports `_layout.web.tsx`'s default. It is
      never selected at runtime on iOS/Android/web (platform siblings always win).

24. **Run full verification pass**
    - `pnpm --filter @jojopotato/mobile typecheck` (fast pre-check).
    - `pnpm typecheck` (root, via turbo) — whole monorepo compiles clean.
    - `pnpm lint` (root, via turbo) — whole monorepo lints clean.
    - `pnpm android` — **agent-probe / manual gap, same honest-gap pattern as the rest of this
      plan**: confirms the custom pill tab bar renders (floating, rounded, jyellow active chip, no
      float-up-on-select animation, labels always visible, correct active/inactive Ionicons pair)
      only when a device/emulator is available to this session. If none is available, this step is
      an explicit known-gap — record it in the execute report rather than silently skipping.
    - `pnpm ios` — confirm zero visual/behavioral change versus the pre-Phase-6 shipped state
      (Liquid Glass native tabs untouched).
    - `pnpm web` — confirm zero visual/behavioral change versus the pre-Phase-6 shipped state.

## Risks and Mitigations

**Risk 1 (carried from SPEC/INNOVATE — alpha API):** `expo-router/unstable-native-tabs` is
explicitly alpha/unstable per Expo's own naming and docs; known edge-case bugs exist
(dark-mode header flicker on manual `Appearance.setColorScheme`, icon tint inversion,
scroll-to-top limitations, badge-clip under `role="search"`).
- **Mitigation:** None of the known edge cases are exercised by this SPEC's scope (no manual
  `Appearance.setColorScheme` calls, no `role="search"` trigger, no badges used). Accepted as a
  foundation-stage risk per INNOVATE — revisiting the choice later if the alpha API proves
  unstable in practice is explicitly acceptable at this project stage.

**Risk 2 (new — dependency surface):** `@expo/vector-icons` is being added as a brand-new,
previously-completely-absent dependency (not even transitive today).
- **Mitigation:** First-party Expo-maintained package, near-zero install risk; used only in the
  web fallback layout, so any issue is isolated to `pnpm web` and does not affect iOS/Android.

**Risk 3 (new — nested scrollables):** `ProductGrid`'s grid inside `(tabs)/index.tsx`'s outer
`ScrollView` risks nested-VirtualizedList warnings/perf issues if implemented naively.
- **Mitigation:** Checklist item 11 explicitly calls out `scrollEnabled={false}` on the inner grid
  if `FlatList` is used, or a non-virtualized wrapped-row layout as an alternative — implementer's
  choice, but the warning must not appear in `pnpm ios` console output during manual verification.

**Risk 4 (new — web-only native-tabs research finding):** PLAN research surfaced that
`unstable-native-tabs` docs state native tabs already "fall back to a basic implementation" on
web, which could be read as making the separate `_layout.web.tsx` unnecessary.
- **Mitigation:** This does not override the INNOVATE decision. INNOVATE explicitly chose a
  dedicated stable-`Tabs` + `Ionicons` web fallback (matching the repo's existing `.web.ts`
  platform-split convention) for a more polished, brand-consistent web experience rather than
  relying on native-tabs' generic web fallback. Proceed with the `_layout.web.tsx` file as
  specified in checklist item 13.

**Risk 5 (new — showcase route deletion):** Deleting `src/app/index.tsx` is a destructive,
non-trivial removal of the just-completed design-system plan's demo screen.
- **Mitigation:** Content is fully superseded by `(tabs)/index.tsx`; the file is a route leaf with
  no importers. If the team later wants a live token-swatch reference, that is an explicit,
  separately-scoped follow-up per the SPEC's disposition decision, not a reason to keep this file
  around unused.

**Risk 6 (new — Phase 6, transitive type resolution):** `BottomTabBarProps` is not a direct
dependency of `apps/mobile` — it comes transitively via `expo-router` → `@react-navigation/
bottom-tabs`. It may not resolve cleanly through the pnpm workspace at typecheck time (hoisting /
strict peer resolution issues are possible in a pnpm monorepo).
- **Mitigation:** Checklist item 21 explicitly authorizes falling back to a locally-declared
  minimal prop type (`{ state, descriptors, navigation }` shaped to only what
  `android-tab-bar.tsx` actually uses) inside `android-tab-bar.tsx` if the transitive import fails
  or produces type errors, rather than adding `@react-navigation/bottom-tabs` as a new explicit
  dependency. No new dependency is introduced by Phase 6 either way.

**Risk 7 (new — Phase 6, platform-split correctness):** the `.ios.tsx` / `.android.tsx` /
`.web.tsx` three-way platform split for `(tabs)/_layout` is a new pattern for this repo (prior
platform-split precedent was `.web.ts` vs default, a two-way split).
- **Mitigation:** Checklist item 20 is a pure rename with a diff check; checklist item 23
  explicitly verifies `_layout.web.tsx` has zero diff and the renamed iOS file is byte-for-byte
  identical to its pre-rename content, so no accidental cross-platform behavior change is
  possible via this refactor.

## Integration Notes

- **Expo Router file-based routing:** the `(tabs)/` folder is a route group — its name in
  parentheses does not appear in the URL/path. `(tabs)/_layout.tsx` and `(tabs)/_layout.web.tsx`
  are picked automatically by Metro's platform-extension resolution (`.web.tsx` wins on web
  builds), matching the existing `use-color-scheme.web.ts` precedent in this repo.
- **Root Stack auto-discovery:** the root `_layout.tsx`'s bare `<Stack screenOptions={{
  headerShown: false }} />` renders whatever routes exist under `src/app/` — no explicit
  `<Stack.Screen>` registration is needed for the new `(tabs)` group.
- **Theme token reuse:** all new components should import tokens via
  `apps/mobile/src/constants/theme.ts` (the app-local re-export) rather than importing
  `@jojopotato/ui` directly, matching the pattern already used in the (soon-deleted)
  `src/app/index.tsx` showcase screen.
- **Mock data isolation:** `mock-home.ts` lives inside `features/home/` (not promoted to
  `packages/types` or `packages/ui`) since no second consumer exists yet — matches the INNOVATE
  decision to avoid premature promotion.

## Touchpoints

| File | Change |
|---|---|
| `apps/mobile/package.json` | add `@expo/vector-icons` to `dependencies` |
| `pnpm-lock.yaml` | updated by `pnpm install` after the above |
| `apps/mobile/app.json` | verification only — confirmed no edit needed |
| `apps/mobile/src/app/_layout.tsx` | verification only — confirmed no edit needed |
| `apps/mobile/src/app/index.tsx` | **delete** — superseded by `(tabs)/index.tsx` |
| `apps/mobile/src/app/(tabs)/_layout.tsx` | new — native tabs (iOS/Android) |
| `apps/mobile/src/app/(tabs)/_layout.web.tsx` | new — stable Tabs web fallback |
| `apps/mobile/src/app/(tabs)/index.tsx` | new — Home route |
| `apps/mobile/src/app/(tabs)/order.tsx` | new — Order placeholder route |
| `apps/mobile/src/app/(tabs)/rewards.tsx` | new — Rewards placeholder route |
| `apps/mobile/src/app/(tabs)/account.tsx` | new — Account placeholder route |
| `apps/mobile/src/components/coming-soon.tsx` | new — shared placeholder component |
| `apps/mobile/src/features/home/mock-home.ts` | new — mock data module |
| `apps/mobile/src/features/home/components/home-header.tsx` | new |
| `apps/mobile/src/features/home/components/branch-selector.tsx` | new |
| `apps/mobile/src/features/home/components/promo-banner.tsx` | new |
| `apps/mobile/src/features/home/components/rewards-teaser-card.tsx` | new |
| `apps/mobile/src/features/home/components/category-selector.tsx` | new |
| `apps/mobile/src/features/home/components/product-card.tsx` | new |
| `apps/mobile/src/features/home/components/product-grid.tsx` | new |
| `apps/mobile/src/app/(tabs)/_layout.tsx` | **rename** → `_layout.ios.tsx` (Phase 6, content unchanged) |
| `apps/mobile/src/app/(tabs)/_layout.ios.tsx` | new path (renamed from `_layout.tsx`, Phase 6) |
| `apps/mobile/src/app/(tabs)/_layout.android.tsx` | new — Phase 6, stable Tabs + custom `tabBar` |
| `apps/mobile/src/components/android-tab-bar.tsx` | new — Phase 6, custom Android tab bar component (lives outside `app/` so Expo Router does not route it; corrected 08-07-26 from `(tabs)/components/`) |
| `apps/mobile/src/app/(tabs)/_layout.tsx` | **re-added** — Phase 6 amendment (08-07-26): thin base fallback re-exporting `_layout.web.tsx` default; required by Expo Router static web export |
| `apps/mobile/src/app/(tabs)/_layout.web.tsx` | **not touched** — Phase 6 verification confirms zero diff |

## Public Contracts

None — this plan is entirely app-local (`apps/mobile`). No `packages/*` barrel exports change; no
new exported package-level API surface is introduced. `@jojopotato/types`'s existing `MenuItem`,
`MenuCategory`, `PickupBranch`, `RewardsAccount` exports are consumed as-is, not modified.

## Blast Radius

- **Packages touched:** `apps/mobile` only (1 app). No `packages/*` source files change — only
  `@jojopotato/types` exports are *read*, not modified.
- **File count:** ~19 touchpoints (16 new files, 1 deleted file, 1 dependency-manifest edit + its
  generated lockfile diff, 1 config file verified-unchanged), **plus Phase 6: 1 rename, 3 new
  files (amended 08-07-26 — includes the re-added base `_layout.tsx` fallback), 1 file explicitly
  verified unchanged (25 touchpoints total).**
- **Risk class:** Low. No schema, auth, API, billing, or migration surface. No new runtime
  services. The one new dependency (`@expo/vector-icons`) is a first-party Expo package used only
  in a web-only fallback file. **Phase 6 introduces zero new dependencies.**
- **Runtime surface:** app startup / navigation shell — touches every screen's entry point
  (users now land on `(tabs)/index.tsx` instead of `index.tsx`), so it is a foundational change
  even though the file/package count is modest. This is the reason VALIDATE is recommended below
  despite the Low risk class. **Phase 6's runtime surface is Android-only** — the platform-split
  file naming (`.ios.tsx` / `.android.tsx` / `.web.tsx`) contains the change to Android builds; iOS
  and web are structurally unable to pick up `_layout.android.tsx`.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm typecheck` (root) | Fully-Automated | AC6 (whole monorepo typechecks) |
| `pnpm lint` (root) | Fully-Automated | AC6 (whole monorepo lints) |
| `pnpm ios` — launch to Home, 4-tab bar visible, Home selected | Agent-Probe | AC1 |
| `pnpm ios` — scroll through Home, all 6 sections render + `pnpm typecheck` on Home files | Hybrid | AC2 |
| `pnpm ios` / `pnpm android` — tap Order/Rewards/Account, styled placeholder, no crash | Agent-Probe | AC3 |
| `pnpm ios` on iOS 26+ simulator — Liquid Glass material visible; `pnpm android` / `pnpm web` — no crash, tab bar visible | Agent-Probe | AC4 |
| `pnpm ios` — observe splash→fonts-loaded→Home transition | Agent-Probe | AC5 |
| `pnpm ios` — confirm Home tab shows browse content, not the showcase + code review confirms `src/app/index.tsx` deleted | Hybrid | AC7 |
| `pnpm --filter @jojopotato/mobile typecheck` + `pnpm typecheck` (root) after Phase 6 files | Fully-Automated | Phase 6 — type safety |
| `pnpm lint` (root) after Phase 6 files | Fully-Automated | Phase 6 — lint clean |
| `pnpm android` — floating pill bar renders, jyellow active chip, no float-up animation, labels always visible | Agent-Probe (known-gap if no device/emulator available) | Phase 6 — visual spec |
| `git diff --stat` on `(tabs)/` — confirms `_layout.web.tsx` untouched and `_layout.ios.tsx` content-identical to pre-rename `_layout.tsx` | Fully-Automated | Phase 6 — iOS/web non-regression |
| `pnpm ios` / `pnpm web` — zero visual/behavioral change vs. pre-Phase-6 shipped state | Agent-Probe | Phase 6 — iOS/web non-regression |

## Test Infra Improvement Notes

(none identified yet)

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/general-plans/active/home-tab-navigation_08-07-26/home-tab-navigation_PLAN_08-07-26.md`
2. **Last completed phase or step:** PLAN written; no EXECUTE work has started.
3. **Validate-contract status:** skipped — user explicitly instructed "enter execute mode dont run
   validate anymore" on 08-07-26, overriding the VALIDATE recommendation below. No validate-contract
   was written; proceeding straight to EXECUTE per explicit user direction.
4. **Supporting context files loaded:**
   `process/general-plans/active/home-tab-navigation_08-07-26/home-tab-navigation_SPEC_08-07-26.md`,
   `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `process/context/planning/all-planning.md`, `apps/mobile/app.json`,
   `apps/mobile/package.json`, `apps/mobile/src/app/_layout.tsx`,
   `apps/mobile/src/app/index.tsx`, `apps/mobile/src/hooks/use-color-scheme.web.ts`,
   `apps/mobile/src/constants/theme.ts`, `packages/types/src/index.ts`,
   `packages/types/src/{menu,pickup,rewards}.ts`, `packages/ui/src/{index,theme}.ts`,
   `pnpm-lock.yaml` (confirmed `@expo/vector-icons` absent), Expo docs
   (`docs.expo.dev/router/advanced/native-tabs` — confirmed compound `Trigger.Icon`/`Trigger.Label`
   API shape).
5. **Next step for a fresh agent picking up mid-execution:** Phase 1-5 (checklist items 1-19) are
   CODE DONE and previously reported. **Phase 6 (checklist items 20-24, "Custom Android Tab Bar")
   is the current pending work** — a fresh agent should resume at checklist item 20 (rename
   `_layout.tsx` → `_layout.ios.tsx`) and proceed sequentially through item 24, per the locked
   INNOVATE mechanism and visual spec in the Phase 6 checklist section. Do not re-touch
   `_layout.web.tsx` or any Phase 1-5 file.

## VALIDATE Recommendation

Recommend running VALIDATE before EXECUTE rather than skipping it. Reasoning:

- The SPEC skip conditions require a single-file change under 15 lines with no schema/auth/API
  surface — this plan is ~19 touchpoints across 16 new files, well outside that bound.
- This introduces a brand-new navigation pattern (the app's first tab navigator) and a brand-new
  screen-feature folder convention (`features/home/`) that other planned feature areas will copy —
  worth an extra check that the structure is sound before it becomes precedent.
- It depends on an explicitly alpha/unstable Expo API (`unstable-native-tabs`), carried forward
  from SPEC/INNOVATE as an accepted risk, which is exactly the kind of risk VALIDATE's Layer 2
  feasibility-check dimension is designed to catch early rather than discovering issues mid-EXECUTE.
- It is a foundational, no-schema/no-auth Low-risk change — so VALIDATE is expected to be quick
  (no security/billing dimension work needed) even though it is recommended.

## Phase Loop Progress

- [x] 1a. Research updated — context and codebase scan complete
- [x] 1b. Plan supplemented — checklist reflects research findings
- [x] 2. Validate contract — SKIPPED by explicit user instruction (08-07-26); see Resume and
      Execution Handoff item 3 and Validate Contract section below.
- [x] 3. Execute complete (Phase 1-5) — checklist items 1-19 done; automated gates (typecheck +
      lint, whole monorepo) green; iOS + web bundles export clean. Manual simulator walkthrough
      not run (no simulator available) — see report for the honest gap.
- [ ] 4. Update process — plan archived, context docs updated, memory notes written (deferred:
      Phase 6 added before archival)
- [x] 5. Report written (Phase 1-5) — execute report filed inside this task folder
      (`home-tab-navigation_REPORT_08-07-26.md`)
- [x] 6. Phase 6 added (08-07-26) — custom Android tab bar, checklist items 20-24 — plan-supplement
      applied. Standing VALIDATE-skip instruction carries forward (see Validate
      Contract addendum below); no separate PVL cycle for this addition.
- [x] 7. Phase 6 execute (08-07-26) — items 20-24 DONE (item 24 amended). Custom Android tab bar
      implemented (Risk 6 local-type fallback applied — `@react-navigation/bottom-tabs` does not
      resolve). Gates: ui/mobile/root typecheck + root lint all green; `expo export` clean on
      **all three** platforms (web + iOS + android). **Web-export regression RESOLVED (08-07-26):**
      item 20's rename removed the non-suffixed `_layout.tsx` that Expo Router's static web export
      requires; fixed by re-adding a thin `(tabs)/_layout.tsx` fallback re-exporting
      `_layout.web.tsx`'s default. Documented as an item-20/23 amendment (not a silent change) —
      see the EXECUTE STATUS block, item 23, Touchpoints, and report.
- [x] 8. Phase 6 report (08-07-26) — execute report appended to task-folder REPORT file.

## Validate Contract

**SKIPPED.** The user explicitly instructed "enter execute mode dont run validate anymore" on
08-07-26, after being shown the VALIDATE Recommendation above (19 touchpoints, new nav pattern,
alpha-API dependency). This overrides that recommendation. No PASS/CONDITIONAL/BLOCKED gate was
run. EXECUTE proceeds directly against this plan's Implementation Checklist with no independent
feasibility pre-check on the `unstable-native-tabs` alpha API — that risk is accepted as-is per
user direction, not mitigated by VALIDATE.

**Phase 6 addendum (08-07-26):** the user has repeated the "dont run validate anymore" instruction
during this same session, so it is treated as a standing instruction covering the remainder of
this session's EXECUTE passes on this plan, including the Phase 6 custom-Android-tab-bar addition
above. No new Validate Contract gate is written for Phase 6. The one Phase 6-specific technical
risk that VALIDATE's Layer 2 feasibility check would ordinarily probe (`BottomTabBarProps`
resolving cleanly through the pnpm workspace) is instead covered by an explicit checklist-level
fallback (see Risk 6 and checklist item 21) rather than a pre-EXECUTE feasibility probe.
