---
name: spec:shared-ui-component-library
description: "Product-discovery SPEC for the shared @jojopotato/ui component library (16 components, 3 app-local migrations, packages/types additions, first test runner)"
date: 09-07-26
feature: none
---

# Shared UI Component Library — SPEC

**Source**: GitHub Issue #3 — `[FND-002] [P0] Build shared UI component library on existing design tokens`
**Date**: 09-07-26
**Complexity signal**: SIMPLE-to-COMPLEX borderline (single package, but 16 components + 3 migrations + new test infra — see Constraints)
**Builds on**: `process/general-plans/active/jojopotato-design-system_08-07-26/` (status: CODE DONE — ported the real design tokens into `packages/ui/src/theme.ts` and added the first component, `JojoButton`). **This SPEC does not re-open token values** — it treats `theme.ts` as the finished, locked source of truth and builds the component layer on top of it.

---

## Summary

Right now, every screen in the app that needs a button, a card, or a badge either doesn't have one yet or has to invent its own one-off version — three examples of this already exist inside `apps/mobile` (a product card, a branch selector, a rewards teaser card), each hand-rolled and each slightly different in how it reads the theme. This work builds the **one shared toolbox** of 16 UI building blocks that every current and future screen (ordering, cart, pickup, rewards, notifications) will pull from, so the app looks and behaves consistently everywhere, and so building a new screen means assembling existing pieces instead of reinventing them. It also closes a small data gap (a few missing shared type definitions) and adds the project's very first automated test setup, scoped just to proving these building blocks render safely.

## User Stories / Jobs To Be Done

- As a **mobile app developer** building the ordering/cart/pickup/rewards screens next, I want a ready-made, on-brand set of `Button`, `Card`, `Badge`, `Input`, `ProductCard`, `DealCard`, `BranchCard`, `RewardProgressCard`, `StarProgressBar`, `OrderStatusBadge`, `OrderStatusTimeline`, `CouponCard`, `CartItem`, `FlavorSelector`, `SizeSelector`, and `PickupTimeBadge`, so that I can build each feature screen by composing existing pieces instead of writing new one-off UI every time.
- As a **mobile app developer**, I want every shared component to read its colors, spacing, radii, and type styles from `theme.ts` (never a hardcoded hex or magic number), so that a future dark-mode pass or brand refresh updates the whole app from one file instead of hunting through every screen.
- As the **end user of the Jojo Potato app** (indirect beneficiary), I want every button, card, and badge across the ordering, pickup, and rewards experience to look and behave the same way, so that the app feels like one coherent product instead of a patchwork of different screens.
- As a **mobile app developer**, I want the three UI pieces that already exist ad hoc in `apps/mobile` (product card, branch selector, rewards teaser card) migrated into the shared library and the app's screens updated to import the shared versions, so that there is exactly one implementation of each, not a duplicate in the app and a duplicate in the package.
- As a **mobile app developer**, I want a minimal automated test setup that smoke-renders each shared component, so that a future change to `theme.ts` or a component's internals gets caught by an automated check instead of only being caught by a human clicking through every screen.

## What The User Wants (Behavioral Outcomes)

- Importing any of the 16 named components from `@jojopotato/ui` works immediately — no extra setup, no missing exports.
- Every component visually matches the existing brand system already established by `JojoButton` and `theme.ts` — same color roles, same spacing scale, same corner radii, same shadow style, same fonts and type scale.
- Components render correctly today in light mode. Nothing about how a component is built should make adding a dark variant later require rewriting the component (e.g. no colors baked in outside of a themed lookup).
- At least one real screen in the app (the Home screen, which today renders its own hand-rolled product card / branch selector / rewards teaser) visibly uses the new shared components instead of its local ones — a developer opening that screen's code sees imports from `@jojopotato/ui`, not local component files.
- Passing a prop of the wrong shape (e.g. a string where a `MenuItem` object is expected) is caught by TypeScript at compile time, not discovered at runtime.
- Running the package's typecheck and lint commands reports zero errors.
- Running the new test command renders every one of the 16 components without an exception being thrown.
- Nothing about a raw color code or a one-off spacing number should be discoverable by scanning component source files outside of `theme.ts`.

## Flow / State Diagram

**Component consumption flow (how a screen author uses the library going forward):**

```
Developer needs UI on a screen
        |
        v
 Is there a shared component for this? ---- no ----> (out of scope: propose new
        |                                              component via a future PR/spec)
       yes
        |
        v
 import { X } from '@jojopotato/ui'
        |
        v
 Pass typed props (compiler enforces shape)
        |
        v
 Component renders using theme.ts tokens
   (color role + spacing + radii + shadow + type scale)
        |
        v
 Screen looks consistent with rest of app
```

**Migration flow (for the 3 existing app-local components):**

```
apps/mobile/src/features/home/components/{product-card,branch-selector,rewards-teaser-card}.tsx
        |
        v
 Rebuilt inside packages/ui as ProductCard / BranchCard / RewardProgressCard
   - swap app-level useTheme() hook for the package's `mode` prop convention
   - swap data-shape assumptions to the (possibly newly added) packages/types shapes
        |
        v
 apps/mobile Home screen call sites updated to import from '@jojopotato/ui'
        |
        v
 Old app-local component files deleted (no duplicate implementation left behind)
        |
        v
 Home screen still renders correctly (manual check) -- visible proof of "real screen consumption" AC
```

**Theme-awareness state (present now, extensible later):**

```
[light mode token set] --(consumed via `mode` prop, default 'light')--> [component renders]

                              |
                              | (future work, OUT OF SCOPE here)
                              v
                  [dark mode token set added to theme.ts]
                              |
                              v
                  [same components, mode='dark', no rewrite needed]
```

## Acceptance Criteria (Testable Outcomes)

1. **Every one of the 16 named components (`Button`, `Card`, `Badge`, `Input`, `ProductCard`, `DealCard`, `BranchCard`, `RewardProgressCard`, `StarProgressBar`, `OrderStatusBadge`, `OrderStatusTimeline`, `CouponCard`, `CartItem`, `FlavorSelector`, `SizeSelector`, `PickupTimeBadge`) is importable from `@jojopotato/ui`'s package entrypoint, and each has a typed prop interface with no implicit `any`.**
   proven by: package typecheck gate (`pnpm --filter @jojopotato/ui typecheck`) + a barrel-import smoke check that imports every named export.
   strategy: Fully-Automated

2. **Each component renders without throwing, in a minimal render-only/snapshot test.**
   proven by: new component smoke-render test suite (one test per component, added as part of this work's first-ever test runner setup).
   strategy: Fully-Automated

3. **No component file (outside `theme.ts` itself) contains a raw hex color literal or a magic spacing/radius number.**
   proven by: a grep-based lint check across `packages/ui/src/*.tsx` for hex patterns (`#[0-9a-fA-F]{3,8}`) and bare numeric literals used as style values, excluding `theme.ts`.
   strategy: Hybrid (automatable grep + human spot-check in code review for cases a regex can't safely judge, e.g. numeric literals that are legitimately not spacing)

4. **The three migrated components (`ProductCard`, `BranchCard`, `RewardProgressCard`) are consumed by the Home screen in `apps/mobile` — actually imported and rendered from `@jojopotato/ui`, not just declared in the package — and the old app-local duplicate files no longer exist.**
   proven by: Home screen manual run (`pnpm ios` / `pnpm web`) confirming visual parity + `apps/mobile` typecheck passing after the import-path swap + repo-wide search confirming the three original app-local files are deleted.
   strategy: Hybrid (Fully-Automated for the typecheck/import-path check; Agent-Probe / manual for the visual-parity confirmation, since visual correctness isn't mechanically verifiable from source alone)

5. **`pnpm --filter @jojopotato/ui typecheck` and `pnpm --filter @jojopotato/ui lint` both pass with zero errors.**
   proven by: direct command run of both gates.
   strategy: Fully-Automated

6. **The new/extended `packages/types` shapes (`Deal`, `Coupon`, `Flavor`, `Size`, `PickupTime`, plus any small addition needed for rewards progress-to-next-tier) typecheck and are the shapes consumed by their corresponding components' props — no component re-declares its own parallel type for data `packages/types` already owns.**
   proven by: `pnpm --filter @jojopotato/types typecheck` + code review confirming component prop types import from `@jojopotato/types` rather than inlining equivalent shapes.
   strategy: Hybrid (typecheck is Fully-Automated; "no parallel re-declaration" is a review-only check)

7. **A test runner is installed and wired up (the repo's first) sufficient to run the 16 component smoke-render tests via a single command.**
   proven by: the new test command (e.g. `pnpm --filter @jojopotato/ui test`) exits zero and reports 16 passing render tests.
   strategy: Fully-Automated

## Out Of Scope

- **Dark-mode token values.** `theme.ts` already has a `Colors.dark` shape scaffolded by the prior design-system plan; this work does not populate real dark-mode values or add dark-mode visual QA — it only ensures components are *structured* so a future dark pass is a drop-in, not a rewrite.
- **Any new screens beyond call-site updates.** Only the existing Home screen's three call sites are updated to prove real-screen consumption. Building out ordering/cart/pickup/rewards/notifications screens themselves is separate, future feature work (see `process/features/{ordering-cart,pickup-branches,auth-accounts,rewards-notifications}/`).
- **A full design-token rework.** Tokens (`Palette`, `Colors`, `Spacing`, `Radii`, `Shadows`, `FontFamily`, `TypeScale`) already exist and are treated as locked/final for this SPEC. If a component needs a token that doesn't exist yet, that is a small, explicitly-called-out addition to `theme.ts` — not a rework.
- **Storybook or any standalone component-catalog app.** The "smoke render" requirement is satisfied by a lightweight test harness, not a visual catalog tool.
- **Full end-to-end or device-matrix testing.** The test runner introduced here is scoped to smoke-rendering 16 components, not general E2E, Detox, or cross-platform visual regression coverage.
- **Any backend, API, or data-fetching wiring.** Components accept props; where they get real data from (once auth/DB/payments are chosen) is out of scope here.

## Constraints

- Must build strictly on top of the already-ported `theme.ts` tokens (Palette / Brand / Colors / Spacing / Radii / Shadows / FontFamily / TypeScale) — no redefinition of token values.
- Must follow the existing `JojoButton` authoring pattern already established in `packages/ui`: named export, `interface {Name}Props`, variant unions mapped through lookup tables, `StyleSheet.create` at module bottom, tokens imported directly from `./theme`, `style` passthrough prop.
- Must follow the package's existing no-hook convention: components needing light/dark awareness take a `mode: ThemeMode = 'light'` prop and index `Colors[mode]` directly — they do not depend on an app-level `useTheme()` React context, since `packages/ui` has no such dependency today.
- `packages/{types,ui,utils}` have no build step (`"main": "./src/index.ts"`) — new components and types are added as raw TypeScript source, consumed via pnpm workspace links, same as today.
- Naming/style conventions: kebab-case files, camelCase functions/vars, PascalCase component exports (per repo convention).
- This is the repo's first test runner of any kind — whatever is chosen must not require a build step for `packages/ui` (no compiled output expected) and must be able to render React Native components without a full device/simulator.
- `packages/types` additions (`Deal`, `Coupon`, `Flavor`, `Size`, `PickupTime`) must follow the existing types-first placeholder convention already used for `auth.ts`/`cart.ts`/`menu.ts`/etc. — minimal, no consuming implementation required to justify their existence.
- The `CartItem` **component**'s props must be a denormalized display shape (e.g. name, unit price, quantity, line total, selected flavor/size) distinct from the `CartItem` **type** in `packages/types/src/cart.ts`, which is data-only (`{menuItemId, quantity, notes?}`). Do not conflate the two — the component needs richer display data than the raw cart-line type carries.
- Migrating the three app-local components must fully replace them (delete the old files) — this SPEC does not want two parallel implementations left behind "just in case."

## Open Questions

- **`@expo/vector-icons` as a new `packages/ui` dependency.** The three app-local components being migrated (and likely `OrderStatusBadge`/`OrderStatusTimeline`) currently use `@expo/vector-icons` (Ionicons) for iconography, but `packages/ui` has no icon dependency today. **Resolved with a reasoned default for this SPEC:** yes, add `@expo/vector-icons` as a `packages/ui` dependency — it is already a transitive Expo-ecosystem dependency used elsewhere in the app, multiple components in this list plausibly need icons, and avoiding it would just push the same dependency into every consuming screen instead. Flagged here for the user to override before INNOVATE/PLAN lock this in, if they'd prefer a different icon strategy (e.g. no icons at all in v1, or a different icon set). Owner: user (confirm or override) — if unaddressed, INNOVATE proceeds with the default above.
- **Test runner choice (Vitest + `@testing-library/react-native` vs. `jest-expo`).** This is an implementation-approach decision, not a product-requirement decision — deferred to INNOVATE to compare against the repo's TS-only-packages-plus-Expo-app shape and recommend one. Owner: INNOVATE.
- **Barrel/file layout convention (flat `packages/ui/src/*.tsx` vs. subfolder-per-component).** The existing barrel (`index.ts`) is flat with no nesting; whether 16 new components should stay flat or move to a `components/` subfolder is an implementation-approach decision, not a product requirement — deferred to INNOVATE/PLAN. Owner: INNOVATE.

*(No open questions block this SPEC from being considered locked for user review — the two deferred items are legitimately INNOVATE-level "how" decisions, and the icon dependency question has a stated reasoned default the user can override at any point before PLAN.)*

## Background / Research Findings

**Design tokens (from `packages/ui/src/theme.ts`, already ported and locked by the prior plan):** `Palette` (flat hex map), `Brand`, `Colors` (`{light, dark}`, each with `text/background/backgroundElement/backgroundSelected/textSecondary/tint/border/accent`; `ThemeMode`/`ThemeColor` types derived from it), `Spacing` (`half/one/two/three/four/five/six`), `Radii` (`xs/sm/md/lg/xl/2xl/3xl/full` — no `circle` token by design), `Shadows` (`offsetSm/Md/Lg` hard "comic" shadow + `softSm/Md/Lg` elevation, both iOS+Android keys), `FontFamily` (`display.{semibold,bold}`, `body.{regular,medium,semibold,bold,extrabold}`), `TypeScale` (`display/h1/h2/h3/body/bodySmall/caption`).

**Existing component pattern to replicate** (`packages/ui/src/components/button.tsx`): named export, `ButtonProps` interface, variant union type (`'primary' | 'accent' | 'ink' | 'outline'`) mapped through `Record<Variant,string>` lookup tables, built on RN `Pressable`, `style` passthrough prop, `StyleSheet.create` at module bottom, tokens imported directly from `./theme`. No `useTheme()` hook exists in the package — `BrandWordmark` instead takes a `mode: ThemeMode = 'light'` prop and indexes `Colors[mode]` directly (the package has no theme-context dependency on the app).

**Barrel:** `packages/ui/src/index.ts` is 3 lines, `export * from './{file}'` per component, flat, no subfolder nesting yet.

**`packages/types` coverage (confirmed gaps, user has decided to close them):**
- Already covered: `MenuItem`/`MenuCategory` (menu.ts) → `ProductCard`; `PickupBranch` (pickup.ts) → `BranchCard`; `RewardsAccount`/`RewardsTier` (rewards.ts) → `RewardProgressCard`/`StarProgressBar` (no progress-to-next-tier shape yet — may need a small addition); `Order`/`OrderStatus` (order.ts) → `OrderStatusBadge`/`OrderStatusTimeline`; `Cart`/`CartItem` (cart.ts) — but the `CartItem` type is data-only, so the `CartItem` component needs a denormalized prop shape, not the raw type.
- User decision: add minimal placeholder types for `Deal`, `Coupon`, `Flavor`, `Size`, `PickupTime` to `packages/types`, matching the existing types-first placeholder convention, rather than inlining prop types component-locally.

**Existing app-local component overlap (confirmed, user has decided to migrate):** `apps/mobile/src/features/home/components/product-card.tsx` (→ `ProductCard`, props `{product: MenuItem}`, uses a local `getProductImage()` helper + app-level `useTheme()` + `formatCurrency` from `@jojopotato/utils`), `branch-selector.tsx` (→ close to `BranchCard`, props `{branch: PickupBranch, onPress?}`), `rewards-teaser-card.tsx` (→ close to `RewardProgressCard`, props `{rewards: RewardsAccount, onPress?}`). These all use `@expo/vector-icons` (Ionicons) and the app-level `useTheme()` hook — migration must reconcile these against the package's no-hook/`mode`-prop convention (see Constraints).

**Test runner (confirmed, user has decided to add):** the repo has zero test infrastructure today — no Jest/Vitest/Detox anywhere (`process/context/tests/all-tests.md` confirms verification today is typecheck+lint+manual only). User decision: add a minimal test runner scoped to smoke-rendering the 16 components; this is in scope for this work, not a follow-up. Choice of runner is deferred to INNOVATE (see Open Questions).

**Prior related plan:** `process/general-plans/active/jojopotato-design-system_08-07-26/` (status: CODE DONE) ported the real jojopotato.ph tokens into `theme.ts` and added `JojoButton` as the first component proving the tokens work. This SPEC's work is the direct continuation — building the remaining component surface — and treats that plan's token output as finished, not to be re-litigated.
