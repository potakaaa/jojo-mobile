---
name: plan:shared-ui-component-library
description: "Build the 16-component @jojopotato/ui shared library, migrate 3 app-local components, add packages/types placeholders, and wire up the repo's first test runner (jest-expo)"
date: 09-07-26
feature: none
phase: "outer"
---

# Shared UI Component Library — PLAN

**Source SPEC**: `process/general-plans/active/shared-ui-component-library_09-07-26/shared-ui-component-library_SPEC_09-07-26.md`
**Complexity**: COMPLEX (single package, but 16 new components + 1 package reorg + first-ever test infra + 3 migrations + 5 new types — exceeds SIMPLE's "one-session, 8-15 step" calibration per `process/context/planning/all-planning.md`)
**Builds on**: `jojopotato-design-system_08-07-26` (CODE DONE — `theme.ts` tokens + `JojoButton` are locked, not re-opened here)
**Date**: 09-07-26
**Status**: CODE NOT STARTED — plan validated (Gate: CONDITIONAL, one plan fix applied at VALIDATE), ready for EXECUTE

---

## Overview

Add 14 new components (`Button`, `Card`, `Badge`, `Input`, `DealCard`, `StarProgressBar`,
`OrderStatusBadge`, `OrderStatusTimeline`, `CouponCard`, `CartItem`, `FlavorSelector`,
`SizeSelector`, `PickupTimeBadge`, plus migrated `ProductCard`/`BranchCard`/`RewardProgressCard` —
16 total) to `packages/ui`, reorganize the package into a `components/` subfolder, migrate 3
app-local Home-screen components into the package (deleting the originals), add 5 new
`packages/types` placeholder types + 1 rewards addition, and install the repo's first test runner
(`jest-expo`) with one smoke-render test per component.

Note: `Button` is the single canonical button primitive for `packages/ui`. `JojoButton` (the earlier
proof-of-concept primitive from `jojopotato-design-system_08-07-26`) has since been removed in favor
of `Button` — there is no separate primitive to preserve or reconcile.

## Goals

1. All 16 named components importable from `@jojopotato/ui`, typed, theme-token-only.
2. `packages/ui/src/` reorganized to `{theme.ts, index.ts, components/*.tsx}` with zero behavior change to existing `JojoButton`/`BrandWordmark`.
3. 3 app-local Home components migrated (old files deleted, Home screen updated) with confirmed visual parity.
4. 5 new `packages/types` placeholder types + 1 rewards progress addition.
5. `jest-expo` installed and wired for `packages/ui`; 16 passing smoke-render tests.
6. `pnpm --filter @jojopotato/ui typecheck` and `lint` clean; no raw hex/magic numbers outside `theme.ts`.

## Scope

In scope: everything listed in the SPEC's Acceptance Criteria 1-7. Out of scope: exactly the SPEC's
"Out Of Scope" section (dark-mode values, new screens beyond Home call-sites, token rework,
Storybook, full E2E/Detox, backend/data wiring).

## Phase Completion Rules

This is a single-plan (non phase-program) COMPLEX plan — one execution pass, not multiple phases.
Completion status progresses: `NOT STARTED` -> `CODE DONE` (all Section A-J checklist items
implemented, all per-section test gates green) -> `VERIFIED` (Section J final gates green AND the
manual Home-screen visual-parity check in Section I recorded as PASS in the phase report). Do not
mark this plan `VERIFIED` on code completion alone — the manual/Agent-Probe visual-parity check is
a required condition, not optional polish.

---

## Architecture Note (from vc-sequential-thinking pass)

Data flow for every new/migrated component is uniform and one-directional:

```
caller screen
  -> passes typed props (data from packages/types + optional mode/style/onPress)
  -> component reads Colors[mode] + Spacing/Radii/Shadows/FontFamily/TypeScale from ./theme
  -> component renders View/Text/Pressable tree, no local state beyond ephemeral UI (e.g. pressed/selected)
  -> no network, no context, no external mutation
```

Failure modes are narrow because there is no async/data-fetching in scope: (a) a component receives
a prop shape TypeScript doesn't catch (mitigated by ACs 1/6 — typed props sourced from
`packages/types`), (b) a component accidentally hardcodes a token value (mitigated by AC3 grep gate),
(c) the jest-expo/RN 0.86/SDK 57 transform config doesn't resolve JSX/Flow-typed RN internals cleanly
(mitigated by Step 2's docs-seeker check + documented fallback, see Risks).

**Cross-service note**: none — this is entirely intra-package (`packages/ui`) plus one intra-app
consumer update (`apps/mobile`). No multi-service topology applies.

---

## packages/ui theme-token diff (apps/mobile vs packages/ui) — confirmed, not assumed

Read `apps/mobile/src/constants/theme.ts` in full: it is a **pure re-export** of
`packages/ui/src/theme.ts` (`export { Brand, Colors, FontFamily, Palette, Radii, Shadows, Spacing,
TypeScale, type ThemeColor, type ThemeMode } from '@jojopotato/ui'` + one app-only constant
`MaxContentWidth`). There is **no token drift to reconcile** — both are byte-identical because one
is a re-export of the other. This closes the INNOVATE follow-up item "diff app-local vs package
tokens before claiming visual parity": diff confirmed empty. Visual parity for the 3 migrations
therefore reduces to confirming (a) the `mode` prop convention selects the same `Colors[mode]`
values the app's `useTheme()` hook would have selected, and (b) no incidental style property was
dropped during the move.

**VALIDATE confirmation (09-07-26)**: `apps/mobile/src/hooks/use-theme.ts` read directly —
`useTheme()` returns `Colors[scheme === 'unspecified' ? 'light' : scheme]` verbatim. This confirms
the plan's `theme.text` -> `Colors[mode].text` migration mapping is exact, not approximate.

## Migration mechanics — image asset dependency (new finding, not in INNOVATE summary)

`ProductCard`'s current app-local implementation calls a local helper `getProductImage(categoryId)`
(`apps/mobile/src/features/home/product-images.ts`) that does `require('../../../assets/images/...')`
against **app-local asset paths**. `packages/ui` has no access to `apps/mobile/assets/` and packages
have no build step, so the migrated `ProductCard` **cannot** inline this helper.

**Decision**: the migrated `packages/ui` `ProductCard` accepts an optional
`imageSource?: ImageSourcePropType` prop (passthrough, defaults to `undefined` → renders the existing
placeholder-block fallback). The Home screen call site (via `ProductGrid`) computes
`getProductImage(product.categoryId)` locally (unchanged helper, stays in `apps/mobile`) and passes
it in as `imageSource`. This preserves 100% of current visual behavior with no asset-resolution logic
inside the package. Same pattern applies to any other migrated/new component that needs app-supplied
imagery (none of the other 2 migrations need this — `BranchCard`/`RewardProgressCard` use only
`Ionicons` + text).

**VALIDATE confirmation (09-07-26)**: this is the only reasonable design given the "no build step,
no cross-package asset access" constraint — accepted as-is, no plan change needed for this specific
decision. See Validate Contract for the related dependency gap this surfaced (`expo-image`).

---

## Implementation Checklist

### Section A — Reorg (own step, before any new component; INNOVATE requirement)

1. Create `packages/ui/src/components/` directory.
2. Move `packages/ui/src/jojo-button.tsx` → `packages/ui/src/components/jojo-button.tsx` (no content changes).
3. Move `packages/ui/src/brand-wordmark.tsx` → `packages/ui/src/components/brand-wordmark.tsx` (no content changes).
4. Update `packages/ui/src/index.ts` to `export * from './theme'; export * from './components/jojo-button'; export * from './components/brand-wordmark';` (theme stays at `src/theme.ts` root — not moved, since SPEC/INNOVATE only calls out moving components, and theme is the locked token source referenced directly by file path in comments elsewhere).
5. **Test gate**: `pnpm --filter @jojopotato/ui typecheck` and `pnpm --filter @jojopotato/ui lint` both clean. This proves the reorg alone introduced zero behavior change before any new code is added.

### Section B — packages/types additions

6. Add `packages/types/src/deals.ts`: `export interface Deal { id: string; title: string; description?: string; discountLabel: string; imageUrl?: string; validUntil?: string; }` (types-first placeholder, matching `menu.ts`/`pickup.ts` minimalism).
7. Add `packages/types/src/coupons.ts`: `export interface Coupon { id: string; code: string; title: string; discountLabel: string; expiresAt?: string; isRedeemed: boolean; }`.
8. Add `packages/types/src/flavors.ts`: `export interface Flavor { id: string; name: string; }`.
9. Add `packages/types/src/sizes.ts`: `export interface Size { id: string; label: string; priceModifierCents?: number; }`.
10. Add `packages/types/src/pickup-time.ts`: `export interface PickupTime { id: string; label: string; isoTime: string; isAvailable: boolean; }` (kept a distinct file from `pickup.ts`'s `PickupBranch` since it's a materially different concept — a time slot, not a branch).
11. Extend `packages/types/src/rewards.ts`: add `export interface RewardsTierProgress { currentPoints: number; pointsToNextTier: number; nextTier: RewardsTier | null; }` (nullable `nextTier` covers "already at top tier"). Keep `RewardsAccount`/`RewardsTier` untouched.
12. Update `packages/types/src/index.ts` (confirmed barrel — `export * from './{file}'` per file, 7 lines today — VALIDATE read the file directly) to include the 5 new files.
13. **Test gate**: `pnpm --filter @jojopotato/types typecheck` clean.

### Section C — @expo/vector-icons + expo-image dependencies

14. Add `@expo/vector-icons` to `packages/ui/package.json` `dependencies` (not peer — per INNOVATE decision). Before pinning a version, run a `vc-docs-seeker`-style check against the installed Expo SDK 57 lockfile version already resolved for `apps/mobile` (`pnpm why @expo/vector-icons` from repo root) and pin the same major/minor to avoid a duplicate/mismatched copy in the workspace. **VALIDATE confirmation (09-07-26)**: resolved workspace version is `@expo/vector-icons@15.1.1` (confirmed via `node_modules/.pnpm` listing — `pnpm why` produced no stdout in the validate shell, use the `.pnpm` store listing as a working fallback if `pnpm why` is silent). Pin `packages/ui`'s new dependency to `^15.1.1` to match.
15. `pnpm install` at repo root to link the new dependency.
16. **Test gate**: `pnpm --filter @jojopotato/ui typecheck` still clean (no version-resolution error).
16a. **[VALIDATE-added, 09-07-26]** Add `expo-image` (`~57.0.0` — confirmed resolved for `apps/mobile` via `node_modules/.pnpm` listing) to `packages/ui/package.json` `dependencies`. **Why this step exists**: the migrated `ProductCard` (Section D, item 17) renders its image via `expo-image`'s `Image` component (confirmed by reading `apps/mobile/src/features/home/components/product-card.tsx` directly), not React Native's built-in `Image`. The original SPEC/INNOVATE dependency callout only named `@expo/vector-icons` — `expo-image` was missed. Without this step, Section D's typecheck/lint gate (item 21) will fail on an unresolvable import. **Test gate**: `pnpm --filter @jojopotato/ui typecheck` clean after `pnpm install` picks up the new dependency, before Section D begins.

### Section D — Migrated components (move-then-adapt; do NOT delete-and-recreate)

17. Create `packages/ui/src/components/product-card.tsx`: copy `apps/mobile/src/features/home/components/product-card.tsx` body, then adapt: (a) replace `useTheme()` with `mode: ThemeMode = 'light'` prop + `Colors[mode]`, (b) replace `import { FontFamily, Palette, Radii, Shadows, Spacing, TypeScale } from '@/constants/theme'` with `from '../theme'`, (c) replace the inlined `getProductImage(product.categoryId)` call with a new optional prop `imageSource?: ImageSourcePropType` (see "Migration mechanics" above) — component renders the passed `imageSource` if present, else the existing placeholder-block fallback, (d) keep `formatCurrency` import from `@jojopotato/utils` unchanged (already a shared package), (e) keep the `expo-image` `Image` import as-is — it now resolves via Section C item 16a's new dependency. Export `ProductCardProps { product: MenuItem; imageSource?: ImageSourcePropType; mode?: ThemeMode; }`.
18. Create `packages/ui/src/components/branch-card.tsx`: copy `branch-selector.tsx` body, adapt `useTheme()` → `mode` prop, `@/constants/theme` → `../theme`, rename component `BranchCard` (props `{ branch: PickupBranch; onPress?: () => void; mode?: ThemeMode; }`). Ionicons import unchanged (`@expo/vector-icons`, now a direct package dependency).
19. Create `packages/ui/src/components/reward-progress-card.tsx`: copy `rewards-teaser-card.tsx` body, adapt `useTheme()` → `mode` prop, `@/constants/theme` → `../theme`, rename component `RewardProgressCard` (props `{ rewards: RewardsAccount; onPress?: () => void; mode?: ThemeMode; }`). Do NOT add `RewardsTierProgress` display logic to this component yet unless trivial — `StarProgressBar` (Section E, item 27 — [VALIDATE-corrected 09-07-26; was misnumbered "item 24" which is `Badge`, not `StarProgressBar`]) is the dedicated home for progress-to-next-tier visualization; keep `RewardProgressCard`'s scope identical to the original `RewardsTeaserCard` (points + tier label only) to avoid silently expanding behavior during a migration step.
20. Add all 3 to `packages/ui/src/index.ts` barrel exports.
21. **Test gate**: `pnpm --filter @jojopotato/ui typecheck` + `lint` clean for the 3 new files (old app-local versions still exist at this point — do not delete yet).

### Section E — New components (13 remaining: Button, Card, Badge, Input, DealCard, StarProgressBar, OrderStatusBadge, OrderStatusTimeline, CouponCard, CartItem, FlavorSelector, SizeSelector, PickupTimeBadge)

All follow the `JojoButton` authoring pattern (named export, `interface {Name}Props`, variant
unions via `Record<Variant,string>` lookup tables where applicable, `StyleSheet.create` at module
bottom, tokens imported directly from `../theme`, `style` passthrough prop, `mode: ThemeMode =
'light'` prop for any component reading `Colors`).

22. `packages/ui/src/components/button.tsx` — `ButtonProps { label: string; onPress: () => void; variant?: 'primary' | 'accent' | 'ink' | 'outline'; disabled?: boolean; mode?: ThemeMode; style?: ViewStyle; }`. General-purpose sibling to `JojoButton` (see Overview note on scope — do not merge/rename `JojoButton` in this plan). **VALIDATE note**: this redundancy is explicitly deferred, not resolved — see Validate Contract Open Gaps for the recommended backlog follow-up.
23. `packages/ui/src/components/card.tsx` — `CardProps { children: ReactNode; mode?: ThemeMode; style?: ViewStyle; }`. Plain themed container: `backgroundElement` background, `border` color border, `Radii.md`, optional `Shadows.offsetSm`.
24. `packages/ui/src/components/badge.tsx` — `BadgeProps { label: string; variant?: 'default' | 'success' | 'warning' | 'danger'; mode?: ThemeMode; style?: ViewStyle; }`. Small pill, `Radii.full`.
25. `packages/ui/src/components/input.tsx` — `InputProps` extending a safe subset of RN `TextInputProps` (`value`, `onChangeText`, `placeholder`, `editable`) plus `label?: string; error?: string; mode?: ThemeMode; style?: ViewStyle;`. Wraps RN `TextInput`, themed border/background/text colors, optional label + error text.
26. `packages/ui/src/components/deal-card.tsx` — `DealCardProps { deal: Deal; onPress?: () => void; mode?: ThemeMode; style?: ViewStyle; }` (uses new `Deal` type from Section B).
27. `packages/ui/src/components/star-progress-bar.tsx` — `StarProgressBarProps { progress: RewardsTierProgress; mode?: ThemeMode; style?: ViewStyle; }` (uses new `RewardsTierProgress` from Section B item 11). Renders a themed horizontal bar (`View` width % based on `currentPoints`/`(currentPoints+pointsToNextTier)`) + text label; no external progress-bar library — pure `View`/`StyleSheet`.
28. `packages/ui/src/components/order-status-badge.tsx` — `OrderStatusBadgeProps { status: OrderStatus; mode?: ThemeMode; style?: ViewStyle; }` (uses existing `OrderStatus` from `packages/types/src/order.ts`). `Record<OrderStatus, {label, color}>` lookup table.
29. `packages/ui/src/components/order-status-timeline.tsx` — `OrderStatusTimelineProps { currentStatus: OrderStatus; mode?: ThemeMode; style?: ViewStyle; }`. Renders the fixed `OrderStatus` sequence (`pending → confirmed → preparing → ready_for_pickup → completed`, with `cancelled` as a terminal alternate state rendered distinctly) as a themed step row; no navigation/interaction.
30. `packages/ui/src/components/coupon-card.tsx` — `CouponCardProps { coupon: Coupon; onPress?: () => void; mode?: ThemeMode; style?: ViewStyle; }` (uses new `Coupon` type).
31. `packages/ui/src/components/cart-item.tsx` — `CartItemProps { item: CartItem; product: MenuItem; flavor?: Flavor | string; size?: Size | string; onIncrement?: () => void; onDecrement?: () => void; mode?: ThemeMode; style?: ViewStyle; }` per INNOVATE decision (denormalize internally: compute `lineTotalCents = product.priceCents * item.quantity` (+ `size.priceModifierCents` if a `Size` object is passed), read `product.name`/`product.imageUrl` for display). **Flavor/Size typing decision**: accept `Flavor | string` / `Size | string` union — if a full typed object is passed, render its `.name`/`.label`; if a plain string is passed (common early-integration case before a real flavor/size catalog exists), render it directly. Documented reasoning: this avoids forcing every future caller to construct full placeholder `Flavor`/`Size` objects just to display a label, while still being able to consume the real types once catalogs exist — no new type needed for this union, it's a prop-level convenience, not a schema.
32. `packages/ui/src/components/flavor-selector.tsx` — `FlavorSelectorProps { flavors: Flavor[]; selectedFlavorId?: string; onSelect?: (flavor: Flavor) => void; mode?: ThemeMode; style?: ViewStyle; }`. Row of tappable pill chips (pattern similar to `branch-card.tsx`'s status pill), local `useState` only for ephemeral press feedback — selection state itself is controlled via props (`selectedFlavorId`), matching the "no new context/hook" convention.
33. `packages/ui/src/components/size-selector.tsx` — `SizeSelectorProps { sizes: Size[]; selectedSizeId?: string; onSelect?: (size: Size) => void; mode?: ThemeMode; style?: ViewStyle; }`. Same pattern as `FlavorSelector`.
34. `packages/ui/src/components/pickup-time-badge.tsx` — `PickupTimeBadgeProps { pickupTime: PickupTime; mode?: ThemeMode; style?: ViewStyle; }`. Small themed badge showing `pickupTime.label`, dimmed/struck-through style when `!pickupTime.isAvailable`.
35. Add all 13 to `packages/ui/src/index.ts` barrel exports (full barrel now: theme + 16 components = 17 export statements, `BrandWordmark` counted separately as pre-existing, not part of the 16).
36. **Test gate**: `pnpm --filter @jojopotato/ui typecheck` + `lint` clean across all 13 new files.

### Section F — Raw-token lint gate (AC3)

37. Add a small grep-based check script (e.g. `packages/ui/scripts/check-raw-tokens.mjs` or inline in a `package.json` script) that greps `packages/ui/src/components/*.tsx` (excluding `theme.ts`) for hex-literal patterns (`#[0-9a-fA-F]{3,8}`) and flags any match. This is the AC3 automated half (Hybrid tier — see Verification Evidence). Wire it as `pnpm --filter @jojopotato/ui run check-tokens` or fold into the existing `lint` script as an additional check; do not block on inventing a magic-number numeric-literal detector (SPEC explicitly notes numeric-literal checking needs human spot-check, not full automation).
38. **Test gate**: run the new check against all 16 new/migrated component files — zero hex-literal matches outside `theme.ts`.

### Section G — Test runner setup (jest-expo)

39. **Before writing config**, use `vc-docs-seeker` (or equivalent live-docs check) to confirm the exact `jest-expo` + `jest.config.js` + `transformIgnorePatterns` recipe for Expo SDK 57 / RN 0.86 / pnpm workspaces — this was NOT empirically confirmed in INNOVATE, and VALIDATE (single-agent, no live-docs tool invoked in this pass) also did not empirically confirm it — see Validate Contract Test Coverage dimension finding (CONCERN, accepted). If no live docs tool is available at EXECUTE time, use the standard Expo-documented `jest-expo` preset (`preset: 'jest-expo'`, `transformIgnorePatterns` covering `react-native|@react-native|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg` pattern family) as the starting config, and treat first-run failures as an expected EXECUTE-time config iteration, not a plan defect.
40. Add `jest-expo`, `jest`, `@testing-library/react-native`, `@types/jest` as devDependencies to `packages/ui/package.json`.
41. Add `packages/ui/jest.config.js` (or `jest` key in `package.json`) with `preset: 'jest-expo'` + the `transformIgnorePatterns` above, scoped to `packages/ui` only (no root-level jest config needed — first test runner in the repo, keep it package-scoped per SPEC Constraints: "no build step for packages/ui, must render without a full device/simulator").
42. Add `"test": "jest"` script to `packages/ui/package.json`.
43. **Test gate**: `pnpm install` succeeds, `pnpm --filter @jojopotato/ui test` runs (even with 0 tests / a trivial placeholder test) without a config/transform crash. If the standard config does not work cleanly (per Risks below), document the exact failure and the working adjustment in the phase report before continuing. **Execute-Agent Instruction (E1, from Validate Contract)**: if the first `jest-expo` run crashes, do not silently patch around it — record the exact error and the fix applied in the phase report per this plan's own Risk #1.

### Section H — Smoke-render tests (AC2, AC7)

44. Add `packages/ui/src/components/__tests__/` directory (or co-located `*.test.tsx` files — pick one convention and apply uniformly; co-located is closer to the package's flat/no-nesting-elsewhere convention, prefer `component-name.test.tsx` next to each component file inside `components/`).
45. Write one smoke-render test per component (16 total: 14 items above minus `Button`/others recount — exact list: `JojoButton` is pre-existing, NOT re-tested here unless currently untested (check); the 16 SPEC-named components are: Button, Card, Badge, Input, ProductCard, DealCard, BranchCard, RewardProgressCard, StarProgressBar, OrderStatusBadge, OrderStatusTimeline, CouponCard, CartItem, FlavorSelector, SizeSelector, PickupTimeBadge). Each test: render with minimal valid mock props via `@testing-library/react-native`'s `render()`, assert no throw (a bare `render(<X .../>)` call with no further assertion satisfies AC2's "renders without throwing").
46. **Test gate**: `pnpm --filter @jojopotato/ui test` — 16 passing tests, 0 failures.

### Section I — Home screen call-site migration + real-screen consumption (AC4)

47. Update `apps/mobile/src/features/home/components/product-grid.tsx`: import `ProductCard` from `@jojopotato/ui` instead of `./product-card`; pass `imageSource={getProductImage(product.categoryId)}` (keep `getProductImage` import from `../product-images`, unchanged) alongside existing `product={item}` prop. **VALIDATE confirmation**: current file confirmed to import `ProductCard` from `./product-card` and render `<ProductCard product={item} />` inside a `FlatList` `renderItem` — the described edit is a direct, unambiguous swap.
48. Update `apps/mobile/src/app/(tabs)/index.tsx`: import `BranchSelector` → `BranchCard` and `RewardsTeaserCard` → `RewardProgressCard`, both from `@jojopotato/ui`; update JSX tags accordingly (props are unchanged shape: `branch`/`onPress` and `rewards`/`onPress` respectively). **VALIDATE confirmation**: current file confirmed to import both from their app-local paths and render `<BranchSelector branch={MOCK_BRANCH} />` / `<RewardsTeaserCard rewards={MOCK_REWARDS} />` — exact edit targets match.
49. Delete `apps/mobile/src/features/home/components/product-card.tsx`, `branch-selector.tsx`, `rewards-teaser-card.tsx` (no parallel implementation left behind, per SPEC Constraints).
50. Consume at least one **net-new** (non-migrated) component in a real screen to satisfy AC4's "at least one net-new component" reading conservatively — add a `Badge` showing e.g. a "Popular" or item-count indicator near the "Popular this week" section title in `apps/mobile/src/app/(tabs)/index.tsx` (small, additive, does not require new mock data beyond a literal string).
51. **Test gate**: `pnpm --filter @jojopotato/mobile typecheck` clean after all import-path swaps.
52. **Manual verification** (Agent-Probe/Hybrid tier, cannot be automated): run `pnpm web` (or `pnpm ios`), visually confirm the Home screen renders identically to before the migration (branch selector, rewards teaser, product grid all visually unchanged) plus the new `Badge` is visible. Record outcome in the phase report.
53. Repo-wide search (`grep -r "features/home/components/product-card\|features/home/components/branch-selector\|features/home/components/rewards-teaser-card" apps/`) confirms zero remaining references to the deleted files.

### Section J — Final gates

54. `pnpm --filter @jojopotato/ui typecheck` clean.
55. `pnpm --filter @jojopotato/ui lint` clean.
56. `pnpm --filter @jojopotato/ui test` — 16/16 passing.
57. `pnpm typecheck` (full monorepo) clean — confirms no cross-package breakage from the barrel/type changes.
58. `pnpm lint` (full monorepo) clean.

---

## Touchpoints

- `packages/ui/src/` — full reorg (`theme.ts` stays at root; `index.ts` rewritten; new `components/` subfolder holding 2 moved files + 16 new/migrated files + `__tests__`/co-located test files)
- `packages/ui/package.json` — new deps (`@expo/vector-icons`, `expo-image` [VALIDATE-added], `jest-expo`, `jest`, `@testing-library/react-native`, `@types/jest`), new `test` script
- `packages/ui/jest.config.js` (new file)
- `packages/types/src/` — 5 new files (`deals.ts`, `coupons.ts`, `flavors.ts`, `sizes.ts`, `pickup-time.ts`), 1 edited file (`rewards.ts`), barrel/index update
- `apps/mobile/src/features/home/components/product-grid.tsx` — edited (import swap)
- `apps/mobile/src/app/(tabs)/index.tsx` — edited (import swaps + new `Badge` consumption)
- `apps/mobile/src/features/home/components/{product-card,branch-selector,rewards-teaser-card}.tsx` — deleted
- `apps/mobile/src/features/home/product-images.ts` — unchanged (still consumed by `product-grid.tsx`)
- Root `pnpm-lock.yaml` — updated via `pnpm install` after new dependency additions

## Public Contracts

- New public export surface: `@jojopotato/ui` barrel gains 16 named component exports + their prop interfaces (public API for every future feature screen).
- New public export surface: `@jojopotato/types` barrel gains `Deal`, `Coupon`, `Flavor`, `Size`, `PickupTime`, `RewardsTierProgress`.
- No changes to any existing exported name/signature (JojoButton, BrandWordmark, theme tokens, existing `packages/types` interfaces all unchanged — purely additive).
- No API/network contracts — this package is presentation-only (props in, JSX out).

## Blast Radius

- **Packages touched**: `packages/ui` (primary, full reorg + 16 new/migrated files), `packages/types` (5 new files + 1 edit), `apps/mobile` (2 files edited, 3 files deleted).
- **File count**: ~28 new/moved files in `packages/ui/src/components/` (2 moved + 16 new/migrated + up to 16 test files, depending on co-location choice) + 6 files in `packages/types/src/` (5 new + 1 edit) + 2 edited + 3 deleted in `apps/mobile`. Roughly 36-40 total touched files.
- **Risk class**: none of the SPEC/orchestration high-risk classes apply (no auth, billing, schema/migration in the DB sense, public network API, deploy/container, or secrets/trust-boundary logic). This is a presentational component-library change — lowest risk class.
- **Reversibility**: fully reversible via git revert; no destructive data operations; no irreversible external calls.

---

## Risks

1. **jest-expo + RN 0.86 / SDK 57 / pnpm workspace config may need iteration.** INNOVATE flagged this as unconfirmed; VALIDATE (this pass) also could not empirically confirm it (no live-docs tool invoked, no live install attempted — VALIDATE does not modify files outside `process/`). Mitigation: Step 39 requires a `vc-docs-seeker` check before writing config; if unavailable, use the standard documented preset and treat first-run failures as expected EXECUTE-time iteration, with the exact failure + fix documented in the phase report (not silently patched with no record). **Accepted as CONDITIONAL — see Validate Contract.**
2. **`@expo/vector-icons` version mismatch risk** between the new `packages/ui` dependency and the version already resolved for `apps/mobile`/other Expo packages in the pnpm workspace, potentially causing duplicate-copy warnings or type conflicts. Mitigation: Step 14 explicitly pins to the already-resolved workspace version, confirmed at VALIDATE to be `15.1.1`.
3. **`ProductCard` image-source scope change** — moving `getProductImage` out of the component (see "Migration mechanics" above) is a design decision made during PLAN, not explicitly pre-approved by INNOVATE. Flagged here for visibility; the alternative (hardcoding app-asset `require()` calls inside `packages/ui`) is not viable since packages cannot reach into `apps/mobile/assets/`. This is the only reasonable path and is documented, not silently done. **VALIDATE reviewed and accepted this decision — no plan change needed** (see Validate Contract Section D finding).
4. **`Button` vs `JojoButton` potential redundancy** — noted in Overview; explicitly deferred, not resolved, in this plan. **VALIDATE accepted as a documented known-gap — backlog follow-up recommended, see Validate Contract Open Gaps.**
5. **AC3's "magic spacing/radius number" grep detection is inherently partial** (numeric literals can't be safely regex-matched without false positives) — SPEC itself classifies this as Hybrid (automated hex-grep + human code-review spot-check), not a gap introduced by this plan.
6. **[VALIDATE-found, 09-07-26] `expo-image` dependency gap** — the original SPEC/INNOVATE dependency callout only named `@expo/vector-icons`; `ProductCard`'s current implementation also depends on `expo-image`. **Fixed in this plan** — see Section C item 16a.


## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/ui typecheck` — barrel imports all 16 components with no implicit `any` | Fully-Automated | AC1 |
| Barrel-import smoke check (test file importing every named export from `@jojopotato/ui`) | Fully-Automated | AC1 |
| `pnpm --filter @jojopotato/ui test` — 16 smoke-render tests, each renders without throwing | Fully-Automated | AC2, AC7 |
| `check-raw-tokens.mjs` grep across `packages/ui/src/components/*.tsx` (excl. `theme.ts`) for hex literals | Fully-Automated (hex half) | AC3 (partial) |
| Code-review spot-check of numeric literals in new component files for magic spacing/radius | Agent-Probe | AC3 (remaining half) |
| Repo-wide grep confirming `product-card.tsx`/`branch-selector.tsx`/`rewards-teaser-card.tsx` app-local files deleted | Fully-Automated | AC4 (deletion half) |
| `pnpm --filter @jojopotato/mobile typecheck` clean after import-path swap | Fully-Automated | AC4 (typecheck half) |
| Manual `pnpm web`/`pnpm ios` run confirming Home screen visual parity + new `Badge` visible | Agent-Probe | AC4 (visual-parity half) |
| `pnpm --filter @jojopotato/ui typecheck` — zero errors | Fully-Automated | AC5 (typecheck half) |
| `pnpm --filter @jojopotato/ui lint` — zero errors | Fully-Automated | AC5 (lint half) |
| `pnpm --filter @jojopotato/types typecheck` — 5 new + 1 edited type clean | Fully-Automated | AC6 (typecheck half) |
| Code-review confirming component props import types from `@jojopotato/types` (no parallel re-declaration) | Agent-Probe | AC6 (review half) |
| `pnpm --filter @jojopotato/ui test` exits 0, reports 16 passing | Fully-Automated | AC7 |
| `pnpm --filter @jojopotato/ui test` first run — jest-expo config resolves without a transform crash | Hybrid (precondition: Section G devDeps + config installed) | Test infra gate (Risk #1) |

## Test Infra Improvement Notes

- **[VALIDATE, 09-07-26]** jest-expo recipe for Expo SDK 57 / RN 0.86 / pnpm workspaces is not empirically pre-confirmed by either INNOVATE or VALIDATE — flag any first-run config failure explicitly in the phase report rather than silently iterating with no trace (see Risk #1, Section G item 39/43).
- **[VALIDATE, 09-07-26]** Consider a follow-up backlog note once EXECUTE completes: whether `Button` and `JojoButton` should be consolidated (see Open Gaps below).

---

## Resume and Execution Handoff

1. **Selected plan file path**: `process/general-plans/active/shared-ui-component-library_09-07-26/shared-ui-component-library_PLAN_09-07-26.md` (this file).
2. **Last completed phase or step**: VALIDATE — Gate: CONDITIONAL, one plan fix applied (`expo-image` dependency), ready for EXECUTE.
3. **Validate-contract status**: written 09-07-26 — see below.
4. **Supporting context files loaded**: `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`, `packages/ui/src/{theme.ts,jojo-button.tsx,brand-wordmark.tsx,index.ts,package.json}`, `apps/mobile/src/features/home/components/{product-card,branch-selector,rewards-teaser-card,product-grid}.tsx`, `apps/mobile/src/features/home/product-images.ts`, `apps/mobile/src/app/(tabs)/index.tsx`, `apps/mobile/src/constants/theme.ts`, `apps/mobile/src/hooks/use-theme.ts`, `packages/types/src/{auth,menu,pickup,rewards,order,cart,index}.ts`, `packages/utils/src/currency.ts`, prior plan `jojopotato-design-system_08-07-26/jojopotato-design-system_PLAN_08-07-26.md` (reference only).
5. **Next step for a fresh agent picking up mid-execution**: confirm which checklist sections (A-J) are complete by checking file existence (`packages/ui/src/components/` populated vs. still flat) and re-run the Section-level test gates listed above before resuming from the first incomplete section. Sections are designed to be resumable independently in order A→J.

---

## Validate Contract

Status: CONDITIONAL
Date: 09-07-26
date: 2026-07-09
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 7-signal score 2/7 (S1 multi-package scope: packages/ui + packages/types + apps/mobile; S7 5+ files in blast radius: ~36-40 files) → MEDIUM tier. Layer 1 (4 dimension checks) + Layer 2 (10 section checks, A-J) run as an independent, non-interdependent fan-out — no agent needed another agent's live output mid-run, so parallel subagents (not agent-team) is the right fit. For EXECUTE (next phase): recommend **Sequential** despite the MEDIUM score, because most checklist sections write to the same shared file (`packages/ui/src/index.ts` barrel, touched by Sections A/D/E) — parallelizing component authorship would create barrel-merge conflicts. A single vc-execute-agent (opus) working Section A→J in order is the correct EXECUTE strategy; do not fan out component creation across parallel agents.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | 16 components importable from `@jojopotato/ui`, typed, no implicit `any` | Fully-Automated | `pnpm --filter @jojopotato/ui typecheck` + barrel-import smoke test | B |
| AC2 | Each component renders without throwing | Fully-Automated | `pnpm --filter @jojopotato/ui test` (16 smoke-render tests) | B |
| AC3-hex | No raw hex color literal in component files (excl. theme.ts) | Fully-Automated | `check-raw-tokens.mjs` grep across `components/*.tsx` | B |
| AC3-numeric | No magic spacing/radius numeric literal | Agent-Probe | Code-review spot-check of numeric literals in new component files | B |
| AC4-deletion | 3 app-local duplicate files deleted, zero remaining references | Fully-Automated | repo-wide grep confirming 0 references to deleted files | B |
| AC4-typecheck | `apps/mobile` typechecks clean after import-path swap | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` | B |
| AC4-visual | Home screen renders identically + new `Badge` visible | Agent-Probe | manual `pnpm web`/`pnpm ios` run, visual confirm, recorded in phase report | B |
| AC5 | `packages/ui` typecheck + lint clean | Fully-Automated | `pnpm --filter @jojopotato/ui typecheck` && `pnpm --filter @jojopotato/ui lint` | B |
| AC6-typecheck | 5 new + 1 edited `packages/types` shape clean | Fully-Automated | `pnpm --filter @jojopotato/types typecheck` | B |
| AC6-review | Component props import from `@jojopotato/types`, no parallel re-declaration | Agent-Probe | code-review confirming import source per component | B |
| AC7 | Test runner installed, 16 tests via one command | Fully-Automated | `pnpm --filter @jojopotato/ui test` exits 0, 16 passing | B |
| test-infra-jest | jest-expo config resolves cleanly for RN 0.86 / SDK 57 / pnpm workspace | Hybrid | `pnpm --filter @jojopotato/ui test` first run (precondition: Section G devDeps + jest.config.js installed); document exact failure + fix in phase report if it crashes | B |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). No Known-Gap strategy row exists in this table — the one true known-gap in this plan (`Button`/`JojoButton` redundancy) is not a test-coverage gap, it is a design-debt item, carried below under Open Gaps instead.

Legacy line form (retained so existing validate-contract consumers still parse):
- packages/ui typecheck/lint: Fully-automated: `pnpm --filter @jojopotato/ui typecheck && pnpm --filter @jojopotato/ui lint`
- packages/ui smoke-render tests: Fully-automated: `pnpm --filter @jojopotato/ui test` (16/16 passing)
- raw-hex grep: Fully-automated: `check-raw-tokens.mjs`
- jest-expo config resolution: Hybrid: `pnpm --filter @jojopotato/ui test` first run + precondition (devDeps + jest.config.js installed)
- numeric-literal spot-check, AC4 visual parity, AC6 no-parallel-redeclaration: agent-probe: manual/code-review, recorded in phase report

Failing stub (AC1 barrel-import smoke test):
```
test("should import every named export from @jojopotato/ui with no implicit any", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: barrel-import smoke test for 16 components")
})
```

Failing stub (AC2 smoke-render — representative, one per component per Section H item 45):
```
test("should render ProductCard without throwing", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: ProductCard smoke-render")
})
```

Failing stub (AC3-hex):
```
test("should find zero raw hex-literal matches in packages/ui/src/components/*.tsx excl. theme.ts", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: check-raw-tokens.mjs hex grep")
})
```

Failing stub (AC4-deletion):
```
test("should find zero references to deleted app-local product-card/branch-selector/rewards-teaser-card files", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: repo-wide grep for deleted file references")
})
```

Failing stub (AC4-typecheck):
```
test("should typecheck apps/mobile clean after import-path swap", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: apps/mobile typecheck post-migration")
})
```

Failing stub (AC5):
```
test("should typecheck and lint packages/ui with zero errors", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: packages/ui typecheck+lint gate")
})
```

Failing stub (AC6-typecheck):
```
test("should typecheck packages/types with the 5 new + 1 edited shapes clean", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: packages/types typecheck gate")
})
```

Failing stub (AC7):
```
test("should run pnpm --filter @jojopotato/ui test and report 16 passing", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: full smoke-render suite exits 0 with 16 passing")
})
```

Dimension findings:
- Infra fit: PASS — no container/infra/worker/proxy/runtime surface touched; this is a pure monorepo package + intra-app import change. No port/env/container-table conflicts possible.
- Test coverage: CONCERN — the jest-expo + RN 0.86 / Expo SDK 57 / pnpm workspace transform recipe is not empirically pre-confirmed (INNOVATE flagged it as unconfirmed; this VALIDATE pass did not run a live install/test either — VALIDATE has no write access outside `process/` and no live-docs tool was invoked in this pass). The plan's own Risk #1 + Section G item 39/43 already carry a documented, concrete fallback (standard `jest-expo` preset + treat first failure as expected EXECUTE-time iteration, recorded in the phase report) — this is an acceptable Hybrid-tier risk for a presentation-only, fully-reversible change, not a blocker.
- Breaking changes: PASS — public surface is purely additive (16 new component exports + 6 new/extended types); no existing export name or signature changes; the two migrated-component design decisions below are scope/design concerns, not breaking-change concerns.
- Security surface: PASS — no auth, billing, secrets, schema/migration, public API, or trust-boundary surface anywhere in this plan. Presentation-only components, no network/data access.
- Section A (Reorg): PASS — mechanical feasibility HIGH (both source files confirmed present at their current paths, no barrel-export collisions). No gaps, no conflicts, no material risk.
- Section B (packages/types): PASS — mechanical feasibility HIGH. `packages/types/src/index.ts` confirmed as a 7-line flat barrel (`export * from './{file}'`) — item 12's "confirm it's a barrel" check is satisfied. No gaps or conflicts.
- Section C (dependencies): CONCERN (fixed in-plan) — `@expo/vector-icons` pin is fully feasible (`15.1.1` confirmed resolved via `node_modules/.pnpm`), but the original checklist was missing an `expo-image` dependency step needed by the migrated `ProductCard` (confirmed by reading the source file directly — it imports `Image` from `expo-image`, not React Native). **Applied as item 16a during this VALIDATE pass** — no longer an open gap.
- Section D (Migrated components): CONCERN (accepted, no plan change beyond Section C fix) — the `ProductCard` `imageSource` prop design decision (Risk #3) was reviewed: it is the only viable design given "no build step, no cross-package asset access," and it preserves AC4 visual-parity exactly (the same `getProductImage()` helper is still called, just at the call site instead of inside the component). Highest-risk edit in this section: the `expo-image`/RN-Image swap-free adaptation — mitigated by leaving the `expo-image` import untouched (Section C item 16a resolves the only real risk, a missing dependency). A pre-existing internal cross-reference error (item 19 cited "Section E, item 24" for `StarProgressBar`, which is actually item 27 — item 24 is `Badge`) was found and corrected during this VALIDATE pass.
- Section E (New components): CONCERN (accepted, documented) — mechanical feasibility HIGH for all 13 new components (props/patterns fully specified, no ambiguity). The `Button` vs `JojoButton` potential redundancy (Risk #4) is explicitly deferred by the plan, not resolved — accepted as a documented known-gap (see Open Gaps below), not a blocker for this presentation-only, fully-reversible plan. Highest-risk edit: `CartItem`'s denormalized prop shape (item 31) — mitigate by writing its smoke-render test with a full mock `Flavor`/`Size` object AND a plain-string variant to exercise both union branches.
- Section F (Raw-token lint gate): PASS — mechanical, low risk, script is small and self-contained.
- Section G (Test runner setup): CONCERN — same root cause as the Test coverage dimension finding above (jest-expo recipe unconfirmed). Accepted per Risk #1's documented fallback.
- Section H (Smoke-render tests): PASS (contingent on Section G) — test authoring itself is mechanical once the runner is wired; no gaps.
- Section I (Home screen call-site migration): PASS — mechanical feasibility HIGH. Both edit targets confirmed present verbatim: `product-grid.tsx` imports `ProductCard` from `./product-card` and renders `<ProductCard product={item} />` inside a `FlatList`; `(tabs)/index.tsx` imports `BranchSelector`/`RewardsTeaserCard` from their app-local paths and renders them with the exact props the plan describes. No gaps, no conflicts.
- Section J (Final gates): PASS — mechanical, standard full-monorepo gate commands, no risk.

Open gaps:
- `Button` vs `JojoButton` potential redundancy — known-gap: documented as NEW PLAN REQUIRED. Deferred per Overview + Risk #4. Recommended backlog note: `button-consolidation-review_NOTE_[date].md` in `process/general-plans/backlog/`, to be written after this plan's EXECUTE completes and both components have real call sites to compare.
- `vc-plan-discovery` scan reported 0 active plans despite this plan file having valid frontmatter (`name: plan:shared-ui-component-library`) — a harness data-quality note, not a plan defect. Does not block this VALIDATE pass; flagged for `vc-audit-plans` follow-up.

What this coverage does NOT prove:
- AC1/AC5 typecheck gates: do not prove a consuming screen uses a component correctly beyond the type system's static shape check; do not prove runtime prop validation (TypeScript types are erased at runtime).
- AC2/AC7 smoke-render gates: do not prove correct visual layout, pixel-accurate spacing, or interaction behavior — only that `render()` does not throw with a minimal valid prop set.
- AC3-hex grep: does not prove absence of hardcoded spacing/radius magic numbers (that is AC3-numeric's job, which is Agent-Probe, not mechanical).
- AC4-deletion/typecheck: does not prove visual parity (a separate Agent-Probe gate covers that) and is scoped to `apps/` — a reference from outside `apps/`/`packages/` (unlikely, but not grepped) would not be caught.
- AC4-visual Agent-Probe: proves only what the person running `pnpm web`/`pnpm ios` actually looks at; it does not prove pixel-perfect parity across both iOS and Android, only the platform actually run.
- AC6-review Agent-Probe: proves only what the reviewer actually checks; does not exhaustively enumerate every prop across all 16 components.
- test-infra-jest Hybrid gate: does not prove `jest-expo` works correctly with `react-native-reanimated` 4.5/worklets (no component in this plan animates, so this path is untested); does not prove behavior on a physical iOS/Android device or simulator — it is a Node/jsdom-based render environment only.

Gate: CONDITIONAL (0 FAILs, 4 CONCERNs — 1 fixed in-plan during this VALIDATE pass [Section C `expo-image` gap], 3 accepted as documented, low-severity, execute-time-mitigated risks: jest-expo config uncertainty, ProductCard imageSource design decision, Button/JojoButton deferred redundancy)
Accepted by: session (autonomous VALIDATE pass — single-plan COMPLEX change, no high-risk class present per Blast Radius, fully reversible, presentation-only. All 4 concerns either (a) already carry a documented plan-level mitigation the author wrote before VALIDATE, or (b) were fixed directly during this VALIDATE pass. No concern requires a new plan-validate-fix supplement cycle — nothing is missing from the checklist that VALIDATE could add; the one missing checklist item found [`expo-image` dependency] was added directly. Recommend the user review the Open Gaps section and the 3 accepted-as-documented risks above before EXECUTE; say "Return to PLAN" if any should instead block.)

## Autonomous Goal Block

SESSION GOAL: Build the 16-component @jojopotato/ui shared library (reorg + 3 migrations + packages/types additions + jest-expo test infra), validated CONDITIONAL and ready for EXECUTE.
Charter + umbrella plan: N/A — single plan (not a phase program).
Autonomy: standard RIPER-5 approval gates apply — EXECUTE requires explicit "ENTER EXECUTE MODE"; this is not a phase-program /goal with self-deciding autonomy.
Hard stop conditions / safety constraints:
- No auth/billing/schema/public-API/deploy/secrets surface in this plan — if EXECUTE discovers any of these appearing unexpectedly, stop and return to PLAN.
- Do not delete `apps/mobile/src/features/home/components/{product-card,branch-selector,rewards-teaser-card}.tsx` (Section I item 49) until the corresponding `packages/ui` replacements pass their Section D/H test gates and the Section I typecheck gate is green.
- Do not mark this plan `VERIFIED` on code completion alone — the Section I manual visual-parity check (item 52) must be recorded PASS in the phase report first (per Phase Completion Rules).
- If the jest-expo config crashes on first run (Risk #1), do not silently patch — document the exact failure and fix in the phase report before continuing (Execute-Agent Instruction E1).
Next phase: EXECUTE — `process/general-plans/active/shared-ui-component-library_09-07-26/shared-ui-component-library_PLAN_09-07-26.md`, starting at Section A, item 1.
Validate contract: inline in plan (see `## Validate Contract` above).
Execute start: Sequential single vc-execute-agent (opus), Section A → J in order | AC4 visual-parity Agent-Probe scenario: `pnpm web` after Section I completes | high-risk pack: no (lowest risk class, no high-risk surface present).
