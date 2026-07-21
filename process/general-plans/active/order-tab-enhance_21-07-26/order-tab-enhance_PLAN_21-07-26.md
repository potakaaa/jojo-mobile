---
name: plan:order-tab-enhance
description: "Implementation plan for the mobile Order tab visual/UX enhancement (header, cart badge, category quick-nav, skeleton, EmptyState, ProductCard glyph)"
date: 21-07-26
feature: general-plans
---

# Order Tab Enhancement — PLAN

**Date**: 21-07-26
**Status**: CODE DONE — EVL-confirmed green (all 10 automated ACs, AC1–AC10). NOT YET VERIFIED —
AC11 on-device Agent-Probe walkthrough owed by the user. Stays in `active/`, not archived. See
co-located `order-tab-enhance_REPORT_21-07-26.md` for full EXECUTE + EVL evidence.
**Complexity**: SIMPLE

## Overview

The Order tab (`apps/mobile/src/app/(tabs)/order/index.tsx`) is the branch-scoped menu-browse
screen. It works but looks unfinished. This plan restyles it into a polished, theme-aware screen
without changing what it does. Context loaded: the locked SPEC (same task folder),
`process/context/all-context.md` (theming + test-runner reality),
`process/context/tests/all-tests.md`, and `process/context/planning/all-planning.md`. Implements
the 7 locked INNOVATE decisions verbatim.

**TL;DR:** SIMPLE plan. Presentation/UX-only polish of the mobile Order tab across ~7 files
(1 screen, 1 component edit, 1 new shared `Skeleton` primitive, 1 `ProductCard` glyph swap, 3 new
test files + 1 extended). No schema/API/auth/cart-logic changes. All logic/render behavior is
jest-expo Fully-Automated; on-device visual polish (AC11) is Agent-Probe (standing project-wide
gap). Implements the 7 locked INNOVATE decisions verbatim.

---

## Complexity Classification: SIMPLE

Confirmed against `process/context/planning/all-planning.md` calibration:

- **Single feature slice, one session.** One screen (`order/index.tsx`) + its directly-composed
  components + one reused-elsewhere shared primitive (`ProductCard`) + one new shared primitive
  (`Skeleton`).
- **~7 touchpoint files, no cross-phase dependency, no phase gates.** Below the COMPLEX/phase-program
  threshold (3+ dependent phases, multi-runtime, repeated validation gates).
- **No high-risk surface** — no schema, auth, API contract, billing, or migration. INNOVATE's
  signal score was low; the only cross-consumer caution (`ProductCard`) is resolved by keeping the
  change additive/visual-only (see Blast Radius).
- **Decision:** SIMPLE, single plan artifact. Not a phase program.

---

## Goals

1. Make the Order tab header read as a real branded screen header (AC1), reusing `ScreenHeader`.
2. Show a live cart-count badge on the header cart icon, hidden at zero (AC2), wired to `useCart().itemCount`.
3. Preserve cart/history icon navigation exactly (AC3).
4. Add a sticky category quick-nav chip bar that scrolls to a category section, shown only above a
   category-count threshold (AC4).
5. Replace the bare spinner with a menu-shaped skeleton (AC5) via a new shared `Skeleton` primitive.
6. Replace inline error/empty text with the shared `EmptyState` (AC6/AC7) — Retry wired to `refetch`,
   empty-menu wired to a "Switch branch" scroll-to-top action.
7. Restyle `ProductCard`'s `+` glyph to a neutral chevron/view icon so the affordance is unambiguous (AC8).
8. Keep everything theme-aware in light + dark (AC9) and regress nothing (AC10).

## Scope

In scope: `order/index.tsx`, its header/skeleton/state composition, a new `Skeleton` shared
primitive, `ProductCard` glyph swap, and tests. Out of scope: everything in the SPEC's Out Of Scope
list (Home banner, ProductCard behavior change, RN E2E runner, data/API/cart-logic changes, other
screens, search).

---

## Touchpoints

| # | File | Action | What changes |
|---|---|---|---|
| T1 | `packages/ui/src/components/skeleton.tsx` | **CREATE** | New shared themed skeleton primitive (`Skeleton` rectangle, `mode`-prop-driven, `Colors[mode]`/`Radii`). Follows `badge.tsx` file shape. |
| T2 | `packages/ui/src/index.ts` | MODIFY | Add `export * from './components/skeleton';` (alongside existing component exports). |
| T3 | `packages/ui/src/components/product-card.tsx` | MODIFY | Swap the `+` `<Text>` glyph in the footer add-button for a neutral `Ionicons` `chevron-forward` (view affordance). Internal-only; props/behavior unchanged. Update the outdated doc comment. |
| T4 | `apps/mobile/src/app/(tabs)/order/index.tsx` | MODIFY | Replace inline header with `ScreenHeader` (cart+history icons in `right` slot, cart badge); add outer `ScrollView` ref + `scrollTo`; add category quick-nav chip bar; add `onLayout` Y-capture per category; replace loading `ActivityIndicator` with skeleton; replace error/empty `View`+`Text` with `EmptyState`. Derive `mode` via `useColorScheme` (needed for `mode`-prop components). |
| T5 | `apps/mobile/src/features/menu/components/category-section.tsx` | MODIFY | Accept an optional `onLayoutY?: (y: number) => void` prop; wire it to the section `View`'s `onLayout` so the screen can record each category's scroll offset. Additive/optional — existing callers unaffected. |
| T6 | `apps/mobile/src/features/menu/components/category-quick-nav.tsx` | **CREATE (local)** | New Order-tab-local chip bar matching `BranchSwitcher`'s visual language (horizontal `ScrollView`, pill chips, theme tokens). One chip per category; `onSelect(categoryId)` → screen scrolls to that section. |

**Reference-only (read, likely no edit):** `branch-switcher.tsx` (chip visual template for T6),
`empty-state.tsx`, `screen-header.tsx`, `badge.tsx` (all reused as-is via existing props),
`use-cart.ts` (`itemCount` read only).

### Decision note on T6 placement (local vs `packages/ui`)

SPEC constraint says a plausibly-reusable new component "should be added to `packages/ui`". The
quick-nav is tightly coupled to (a) the Order screen's outer-`ScrollView` ref and (b) per-section Y
offsets it does not own — a `packages/ui` component cannot own that scroll plumbing without leaking
RN refs across the package boundary. **Decision: build it Order-tab-local first** (`features/menu/components/`),
matching `BranchSwitcher`'s existing local placement precedent. If the Deals tab later wants the same
control, extract then. Recorded as a deliberate deviation from the "prefer `packages/ui`" default,
justified by the scroll-coupling.

### Category-count threshold for quick-nav (AC4 "more than a few")

**Decision: render the quick-nav only when `data.categories.length > 3`.** Rationale: at ≤3
categories the whole menu is typically within one or two screens, so a jump control adds chrome
without saving meaningful scrolling; >3 is the point where scanning-past becomes the friction the
user story describes. Concrete, testable, and mirrors the SPEC/INNOVATE "small threshold (e.g. >3)"
guidance.

---

## Public Contracts

- **`ProductCard` (T3):** public prop contract (`product`, `imageSource`, `onPress`, `mode`) and tap
  behavior are UNCHANGED. Only the internal footer glyph node changes (`+` text → chevron icon).
  This is the SPEC's "additive/visual-only, must not alter default rendering for Home/Deals consumers"
  requirement. No new prop is added.
- **`CategorySection` (T5):** gains one OPTIONAL prop `onLayoutY?: (y: number) => void`. Backward
  compatible — existing call sites that omit it are unaffected.
- **`Skeleton` (T1):** new public export. Contract: `{ width?, height?, radius?, mode, style? }`
  (final shape locked in EXECUTE against `badge.tsx` conventions). Additive to the barrel; no
  existing export changes.
- **`useCart` / `useMenu` / `useBranch`:** read-only. No contract change (SPEC constraint).

---

## Blast Radius

- **Scope:** ~7 files — `packages/ui` (2 edits + 1 new + 1 barrel), `apps/mobile` (1 screen edit +
  1 component edit + 1 new local component) + tests. Risk class: **presentation/UX only — LOW.**
- **`ProductCard` cross-consumer check (must verify, not assume):** confirmed consumers of
  `ProductCard` are — `apps/mobile/src/features/menu/components/category-section.tsx` (Order tab),
  `apps/mobile/src/features/home/components/product-grid.tsx` (Home tab), and
  `apps/mobile/src/app/component-showcase.tsx` (dev showcase), plus `packages/ui` test fixtures
  (`__tests__/mocks.ts`, `barrel-import.test.tsx`, `product-card.test.tsx`). The Deals tab renders
  its deal grid through the same `ProductCard`/menu path. **Checked assumption:** every consumer
  passes only `product`/`imageSource`/`onPress`/`mode` and relies on default rendering; the glyph
  swap changes no prop and no tap behavior, so it is non-breaking for Home, Deals, and the showcase.
  EXECUTE must re-grep consumers before finalizing and confirm no consumer inspects the glyph.
- **Rollback:** each touchpoint is an isolated visual edit; revert any single file independently.
  No data/migration/state to unwind.

---

## Implementation Checklist

**All 12 steps ✅ COMPLETE (EVL-confirmed green 21-07-26) — see `order-tab-enhance_REPORT_21-07-26.md`.**

1. **T1 — Create `packages/ui/src/components/skeleton.tsx`.** New `Skeleton` component: themed
   rectangle using `Colors[mode].backgroundElement` (or nearest neutral token), `Radii.md`, sizing
   via `width`/`height`/`radius` props + `style` passthrough. Match `badge.tsx`'s file shape
   (imports from `../theme`, `StyleSheet`, `type ThemeMode`). Static fill (no animation) to avoid the
   known jest reanimated layout-animation gap (`all-tests.md` Known Gaps) — pulsing is optional and
   must not use reanimated layout animations if added.
2. **T2 — Export `Skeleton`** from `packages/ui/src/index.ts` (`export * from './components/skeleton';`).
3. **Write `packages/ui/src/components/__tests__/skeleton.test.tsx`** — assert it renders and resolves
   different fills for `mode="dark"` vs `mode="light"` (mutation-style assertion, per the repo's
   `card.test.tsx` precedent — not prop-presence only).
4. **T3 — Restyle `ProductCard` glyph.** Replace the footer `<Text>+</Text>` add-button label with an
   `Ionicons` `chevron-forward` (size fits the existing 28×28 circle; color `Palette.ink` to keep the
   yellow-circle-on-ink contrast). Keep the circle wrapper, `Shadows.offsetSm`, and disabled opacity
   as-is. Update the stale doc comment ("an 'Add' affordance" → "a view/open affordance").
   **[E1] Add a queryable handle** — put `testID="product-card-affordance"` on the affordance node
   (the icon or its wrapping `View`) so the AC8 test can find it. Without a handle the current
   `<View>+<Text>+</Text>` has no accessible query target (repo asserts icons via a wrapper handle,
   e.g. `getByLabelText` in `screen-header.test.tsx`).
5. **Extend `packages/ui/src/components/__tests__/product-card.test.tsx`** — assert the resolved
   affordance is a navigation/view glyph (chevron icon present, queried via the `testID` from step 4
   or a `toJSON()` traversal asserting the resolved icon node — mutation-style, per `card.test.tsx`,
   not prop-presence) and that pressing the card fires only the passed `onPress` (no separate
   add-to-cart handler exists on `ProductCard`). Covers AC8.
6. **T5 — Add optional `onLayoutY` to `CategorySection`.** Add `onLayoutY?: (y: number) => void` to
   props; wire `onLayout={(e) => onLayoutY?.(e.nativeEvent.layout.y)}` on the section root `View`.
   No behavior change when omitted.
7. **T6 — Create `category-quick-nav.tsx`** (`apps/mobile/src/features/menu/components/`). Horizontal
   `ScrollView` of pill chips (one per category, `category.name`), matching `BranchSwitcher` chip
   styling (tokens, `Radii.full`, 2px border). Props: `{ categories, onSelect: (categoryId) => void }`.
   Theme via `useTheme()` + `useColorScheme` mode like `category-section.tsx`.
8. **Write `apps/mobile/src/features/menu/components/__tests__/category-quick-nav.test.tsx`** — render
   with a multi-category fixture; assert one chip per category and that pressing a chip calls
   `onSelect` with the correct category id. Covers AC4 (nav render + wiring; real scroll offset is
   Agent-Probe per jsdom limitation noted in SPEC).
9. **T4 — Rework `order/index.tsx`:**
   a. Derive `mode` (`const scheme = useColorScheme(); const mode = scheme === 'dark' ? 'dark' : 'light';`)
      for the `mode`-prop shared components.
   b. Create an outer `ScrollView` ref (`useRef<ScrollView>(null)`).
   c. Replace the inline `<View style={header}>` block with `<ScreenHeader title="Menu" mode={mode}
      right={<cart+history row>} />`. `onBack` omitted (tab root). The `right` node is a
      `flexDirection:'row'` View holding the two `Pressable` icons; overlay a `Badge` on the cart
      `Pressable` via `position:'absolute'` local style, rendered only when `itemCount > 0`
      (`label={String(itemCount)}`). Navigation handlers unchanged (`router.push('/(tabs)/cart')`,
      `/(tabs)/history`).
   d. Maintain a `categoryOffsets` ref/map keyed by category id; pass `onLayoutY` to each
      `CategorySection` to record its Y. Add a `scrollToCategory(id)` that calls
      `scrollRef.current?.scrollTo({ y: offset, animated: true })`.
   e. Render `<CategoryQuickNav categories={data.categories} onSelect={scrollToCategory} />` only when
      `data && data.categories.length > 3` (threshold decision above), positioned above the category
      sections.
   f. Replace the loading branch `ActivityIndicator` with a skeleton block: 2–3 `Skeleton` bars
      shaped like category titles + a grid of card-shaped `Skeleton` blocks (reuse the 2-col row
      layout).
   g. Replace the error branch with `<EmptyState iconName="cloud-offline-outline" title="Couldn't
      load the menu" description=... actionLabel="Retry" onAction={() => refetch()} mode={mode} />`.
   h. Replace the empty branch (`categories.length === 0`) with `<EmptyState iconName="restaurant-outline"
      title="No menu available for this branch yet" description=... actionLabel="Switch branch"
      onAction={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} mode={mode} />` — the
      "Switch branch" action scrolls back to the `BranchSwitcher` at top, reusing the same scroll ref
      (OQ-3 resolution).
10. **Extend/create the Order-tab screen test** (`apps/mobile/src/app/(tabs)/order/__tests__/index.test.tsx`,
    or a co-located header test `order-tab-header.test.tsx` per SPEC AC1/AC2/AC3). Mock `useMenu`/`useBranch`/`useCart`/`useNavigateToProduct`
    (jest-expo pattern per `branches/index.test.tsx`; the global `expo-router` + `@/lib/api-client`
    + `auth-client` mocks are provided by `jest-setup.ts`).
    Assert: header structure (AC1); badge shows for itemCount 0/1/N (AC2); cart/history press → `router.push`
    correct routes (AC3); `isLoading` renders skeleton not spinner (AC5); `isError` renders `EmptyState`
    + Retry calls `refetch` (AC6); `categories:[]` renders empty `EmptyState` (AC7).
11. **Run the full gate matrix** (see Verification Evidence). Fix inline until green. **[E2]**
    `guard:theme-mode` is GREEN on this branch (`feat/product-ux-enhance` — the mobile-dark-mode-audit
    merge is already present; the plan's earlier "red 25-violation baseline" caveat was stale and is
    corrected below). Treat `guard:theme-mode` as a HARD green gate: it must stay `OK` after your
    changes; any red exit is a real NEW violation you introduced and must fix — do NOT excuse it as a
    pre-existing baseline.
12. **Re-grep `ProductCard` consumers** and confirm no consumer inspects the glyph (Blast Radius
    final check) before declaring done. (Confirmed at VALIDATE: `product-grid.tsx` (Home),
    `category-section.tsx` (Order/Deals), `component-showcase.tsx`, and `packages/ui` fixtures all
    pass only the 4 documented props — re-verify no new consumer appeared.)

---

## Acceptance Criteria → proof mapping

Each SPEC criterion, its proving scenario and strategy (REQ-TEST-LINK):

| AC | proven by | strategy |
|---|---|---|
| AC1 header hierarchy/branding | `order-tab-header` render test — `ScreenHeader` structure + themed styling | Fully-Automated |
| AC2 cart badge live count, hidden at 0 | header test — mocked `useCart()` 0/1/N cases | Fully-Automated |
| AC3 cart/history nav unchanged | header test — assert `router.push` route per press | Fully-Automated |
| AC4 category quick-nav present + scrolls | `category-quick-nav.test.tsx` — chip-per-category + `onSelect` wiring (scroll offset Agent-Probe) | Fully-Automated (wiring) |
| AC5 skeleton while loading | screen test — `isLoading:true` renders `Skeleton`, not `ActivityIndicator` | Fully-Automated |
| AC6 error → `EmptyState` + Retry→refetch | screen test — `isError:true` asserts EmptyState props + Retry calls `refetch` | Fully-Automated |
| AC7 empty menu → `EmptyState` | screen test — `categories:[]` asserts empty EmptyState copy | Fully-Automated |
| AC8 ProductCard glyph unambiguous | extended `product-card.test.tsx` — chevron present (via testID), no add-on-press | Fully-Automated |
| AC9 light+dark themed, no hardcoded colors | `guard:theme-mode` + `check-tokens` + light/dark render asserts in new tests | Fully-Automated |
| AC10 no browse-behavior regression | full mobile jest+vitest suite + `packages/ui` suite re-run green + typecheck | Fully-Automated |
| AC11 on-device polish/quick-nav/skeleton feel | manual Agent-Probe walkthrough (owed by user) | Agent-Probe (Known-Gap: no RN E2E runner) |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/ui test` (jest-expo — `skeleton.test.tsx`, extended `product-card.test.tsx`) | Fully-Automated | AC8, AC9 (Skeleton dark/light), Skeleton render |
| `pnpm --filter @jojopotato/mobile test` (vitest + jest — new header/screen/quick-nav tests) | Fully-Automated | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC10 |
| `pnpm --filter @jojopotato/ui typecheck` + `pnpm --filter @jojopotato/mobile typecheck` | Fully-Automated | AC10 (no type regression), all wiring |
| `pnpm --filter @jojopotato/ui lint` + `pnpm --filter @jojopotato/mobile lint` | Fully-Automated | code standards |
| `pnpm --filter @jojopotato/mobile guard:theme-mode` | Fully-Automated | AC9 (no hardcoded colors, tracked `mode` props) — GREEN gate, see corrected note |
| `pnpm --filter @jojopotato/ui check-tokens` | Fully-Automated | AC9 (`packages/ui` hex-literal guard, covers new `skeleton.tsx`) |
| `pnpm format:check` (touched files) | Fully-Automated | commit hygiene |
| On-device light/dark walkthrough: header, badge, quick-nav scroll, skeleton, empty/error states | Agent-Probe | AC11 |

**`guard:theme-mode` baseline note (CORRECTED at VALIDATE, 21-07-26):** the earlier caveat said this
guard is RED on `development` with 25 pre-existing violations pending the `mobile-dark-mode-audit`
merge. **That is stale for the actual execution branch.** On `feat/product-ux-enhance` @ `dd28851`
the guard runs GREEN (`OK — 31 themed components tracked, 206 call sites, 0 violations`) — the
dark-mode-audit merge is already present. EXECUTE must therefore treat `guard:theme-mode` as a hard
green gate (see checklist E2): it must remain `OK`; a red result is a genuine new violation to fix,
not a baseline to diff around. The stash-baseline-diff instruction is unnecessary on this branch.
`check-tokens` and the per-component light/dark render assertions remain the additional AC9 gates.

**TDD-first note:** vc-test-coverage-plan tiering was applied during drafting — all 10 automated ACs
are Fully-Automated (jest-expo component tier, the established RN component runner per `all-tests.md`);
AC11 is the sole Agent-Probe. No developed behavior is assigned Known-Gap. AC11's Agent-Probe residual
is a named standing gap (no RN E2E runner), recorded in Test Infra Improvement Notes, not a silent
terminal PASS — the plan's on-device verification stays owed until the user walkthrough is performed
(plan stays in `active/` until then, matching every prior UI-polish plan in this repo).

---

## Test Infra Improvement Notes

- No RN E2E/navigation runner exists project-wide (`all-tests.md` Known Gaps) — AC11 (on-device
  visual/scroll feel) is Agent-Probe-only. Not fixed by this plan; tracked as the standing gap.
- Real scroll-offset behavior (AC4 actual `scrollTo`) cannot be measured under jsdom/jest-expo — the
  quick-nav test asserts handler wiring only; on-device scroll is folded into the AC11 walkthrough.
- If a pulsing skeleton is ever wanted, note the shared jest reanimated mock lacks layout-animation
  exports (`all-tests.md`) — keep `Skeleton` static or use a non-reanimated pulse to stay testable.

---

## Dependencies, Risks, Integration Notes

- **Dependencies:** none external. All reused components (`ScreenHeader`, `EmptyState`, `Badge`) and
  `useCart().itemCount` already exist and are confirmed present (VALIDATE-verified: `ScreenHeader`
  `right` is `ReactNode`, `EmptyState` renders a `<Button>` when `actionLabel`+`onAction` set,
  `Badge` accepts `style` for absolute positioning, `useCart` exposes `itemCount: number` at
  `use-cart.ts:45/344`).
- **Risk 1 — `ScreenHeader` `right` slot hosting two icons + overlay badge.** `right` is `ReactNode`,
  accepts a wrapping `View`; `Badge` accepts `style` for absolute positioning. Mitigation: local
  composition only, no component edits (matches INNOVATE decisions 4 & 5). Verified via props above.
- **Risk 2 — nested horizontal ScrollView (quick-nav) inside the outer vertical ScrollView.**
  `BranchSwitcher` already nests a horizontal ScrollView in the same outer ScrollView without the
  RN nested-VirtualizedList warning (horizontal scroll of a plain ScrollView is fine; the warning is
  FlatList/VirtualizedList-specific per `category-section.tsx`'s comment). Quick-nav follows the same
  safe pattern.
- **Risk 3 — `guard:theme-mode`** — GREEN on this branch (Risk downgraded at VALIDATE; treat as a
  hard gate per E2, no stash-diff needed).
- **Backwards compatibility:** `CategorySection`'s new prop is optional; `ProductCard`/`Skeleton`
  changes are additive/visual-only. No consumer breakage expected.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/order-tab-enhance_21-07-26/order-tab-enhance_PLAN_21-07-26.md`
2. **Last completed step:** EXECUTE + EVL complete 21-07-26 (CODE DONE, all gates green). Only the
   AC11 Agent-Probe walkthrough remains before VERIFIED. See
   `order-tab-enhance_REPORT_21-07-26.md`.
3. **Validate-contract status:** written 21-07-26 (Gate: CONDITIONAL — see `## Validate Contract`).
   All 3 CONCERNs (E1–E3) resolved during EXECUTE.
4. **Supporting context loaded:** SPEC (same task folder), `all-context.md` (theming + test-runner
   reality), `all-tests.md` (jest-expo component runner, guard:theme-mode caveat, no RN E2E),
   `all-planning.md` (SIMPLE calibration). Source files read: `order/index.tsx`, `product-card.tsx`,
   `badge.tsx`, `screen-header.tsx`, `empty-state.tsx`, `branch-switcher.tsx`, `category-section.tsx`,
   `use-cart.ts` (itemCount), `packages/ui/src/index.ts`.
5. **Next step for a fresh agent:** on acceptance of the CONDITIONAL contract, EXECUTE the 12-step
   checklist in order (T1→T6→T4 last, since `order/index.tsx` composes everything). Start EXECUTE
   with the new `Skeleton` primitive + its test (red-first), then the `ProductCard` glyph, then the
   screen rework. Apply execute-agent instructions E1–E2 (queryable AC8 handle; guard:theme-mode is a
   hard green gate). Plan stays in `active/` until the AC11 Agent-Probe walkthrough is performed by
   the user.

---

## Phase Completion Rules

- **CODE DONE** — all 12 checklist steps applied and all Fully-Automated gates in Verification
  Evidence are green (typecheck, lint, jest-expo ui + mobile suites, check-tokens, format:check;
  guard:theme-mode confirmed GREEN/`OK`). **✅ REACHED 21-07-26** — all 12 checklist steps applied;
  all gates independently EVL-confirmed green by a spawned vc-tester (see
  `order-tab-enhance_REPORT_21-07-26.md`).
- **✅ VERIFIED** — CODE DONE **plus** the AC11 on-device Agent-Probe walkthrough performed and
  confirmed working by the user (light + dark: header, cart badge, quick-nav scroll, skeleton,
  empty/error states). Until the user confirms, the plan stays in `active/` and MUST NOT be marked
  VERIFIED or archived — matching every prior UI-polish plan in this repo (no RN E2E runner exists).
  **NOT YET REACHED** — AC11 walkthrough is owed by the user.

## Next Step

Perform the AC11 on-device Agent-Probe walkthrough (light + dark: header, cart badge, quick-nav
scroll, skeleton, empty/error states). Once confirmed, this plan is eligible for archival via
UPDATE PROCESS. A branch/commit decision for `feat/product-ux-enhance` is also pending — see the
EXECUTE report's "Commit Recommendation" section.

~~Accept the CONDITIONAL validate-contract (E1–E2 are the accepted concerns) → ENTER EXECUTE
MODE.~~ (superseded — EXECUTE is complete, see above)

## Validate Contract

Status: CONDITIONAL
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: signal score 1/7 (only S7 — ~7 files in blast radius). SIMPLE, single-package-family
presentation change, one execute agent. No multi-package (2 packages), no schema/API/auth, no phase
program, no high-risk class. Sequential is the correct fit.

Test gates (C3 5-column table — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Order header renders `ScreenHeader` structure + themed styling | Fully-Automated | `order-tab-header`/screen test — assert header title + right slot; `pnpm --filter @jojopotato/mobile test` | A |
| AC2 | Cart badge shows live `useCart().itemCount`, hidden at 0 | Fully-Automated | screen test — mocked `useCart()` 0/1/N; assert badge presence/text per case | A |
| AC3 | Cart→`/(tabs)/cart`, history→`/(tabs)/history` unchanged | Fully-Automated | screen test — assert `router.push` route per press | A |
| AC4 | Quick-nav renders one chip per category; press calls `onSelect(id)` | Fully-Automated | `category-quick-nav.test.tsx` — chip-per-category + wiring (real scroll = AC11 Agent-Probe) | A |
| AC5 | Loading renders `Skeleton`, not `ActivityIndicator` | Fully-Automated | screen test — `isLoading:true`; assert Skeleton present, spinner absent | A |
| AC6 | Error renders `EmptyState`; Retry calls `refetch()` | Fully-Automated | screen test — `isError:true`; assert EmptyState props + Retry→refetch | A |
| AC7 | Empty menu (`categories:[]`) renders `EmptyState` | Fully-Automated | screen test — assert empty-menu EmptyState copy | A |
| AC8 | ProductCard glyph is a view/chevron affordance; card-tap fires only `onPress` | Fully-Automated | extended `product-card.test.tsx` — chevron queried via `testID="product-card-affordance"`; no add-on-press | B |
| AC9 | New/changed UI themed light+dark, no hardcoded colors | Fully-Automated | `guard:theme-mode` (GREEN gate) + `check-tokens` + `skeleton.test.tsx` resolved-fill light≠dark | A |
| AC10 | Menu browse behavior unregressed | Fully-Automated | full mobile jest+vitest + `packages/ui` jest suites re-run green + typecheck | A |
| AC11 | On-device polish/quick-nav-scroll/skeleton feel (light+dark) | Agent-Probe | manual user walkthrough (owed) — no RN E2E runner | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist — E1 adds the `testID` handle AC8 needs)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy` column carries ONLY the 3 proving strategies
(Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy; AC11's on-device residual
is carried as gap-resolution D (named standing gap: no RN E2E runner), not as a strategy that proves
a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- packages/ui (Skeleton, ProductCard glyph): Fully-automated: `pnpm --filter @jojopotato/ui test` + `pnpm --filter @jojopotato/ui check-tokens` + `pnpm --filter @jojopotato/ui typecheck`
- apps/mobile (header/screen/quick-nav/CategorySection): Fully-automated: `pnpm --filter @jojopotato/mobile test` + `pnpm --filter @jojopotato/mobile typecheck` + `pnpm --filter @jojopotato/mobile guard:theme-mode`
- commit hygiene: Fully-automated: `pnpm format:check` (touched files)
- on-device visual/scroll polish (AC11): agent-probe: user walkthrough, light+dark, header/badge/quick-nav/skeleton/empty+error — Known-Gap-adjacent residual (no RN E2E runner)

Failing stubs (Fully-Automated rows — red-first starting points for EXECUTE):

AC2 — cart badge:
```
test("should show the cart badge with the live itemCount and hide it at 0", () => { throw new Error("NOT IMPLEMENTED — TDD stub: cart badge live count, hidden at 0") })
```
AC5 — skeleton while loading:
```
test("should render Skeleton (not ActivityIndicator) while the menu is loading", () => { throw new Error("NOT IMPLEMENTED — TDD stub: skeleton while loading") })
```
AC6 — error EmptyState + Retry:
```
test("should render EmptyState on error and call refetch when Retry is pressed", () => { throw new Error("NOT IMPLEMENTED — TDD stub: error EmptyState + Retry→refetch") })
```
AC8 — ProductCard affordance:
```
test("should render a view/chevron affordance (testID product-card-affordance) and fire only onPress on card tap", () => { throw new Error("NOT IMPLEMENTED — TDD stub: ProductCard chevron affordance, no add-on-press") })
```
AC9 — Skeleton resolves different fills per mode:
```
test("should resolve a different fill color for mode=dark vs mode=light", () => { throw new Error("NOT IMPLEMENTED — TDD stub: Skeleton light≠dark resolved fill") })
```

Dimension findings:
- Infra fit: PASS — jest-expo is the established RN component runner (`all-tests.md`); `guard:theme-mode` + `check-tokens` present and GREEN on this branch; no container/infra/worker/deploy surface. All reused component contracts (`ScreenHeader.right: ReactNode`, `EmptyState` CTA, `Badge.style`, `useCart.itemCount`) VALIDATE-verified on disk.
- Test coverage: CONCERN — AC8's "chevron present" assertion had no queryable handle (repo asserts icons via a wrapper handle, e.g. `getByLabelText`); resolved by E1/checklist step 4 adding `testID="product-card-affordance"`. AC10 originally cited "existing order/category-section/branch-switcher suites" that do not exist as named suites — corrected to "full mobile + packages/ui suites re-run + typecheck." No developed behavior rests on Known-Gap alone (AC1–AC10 Fully-Automated; AC11 legitimately Agent-Probe) — not vacuously green.
- Breaking changes: PASS — `ProductCard` glyph swap verified non-breaking across ALL consumers (`product-grid.tsx` Home, `category-section.tsx` Order/Deals, `component-showcase.tsx`, `packages/ui` fixtures — every one passes only `product`/`imageSource`/`onPress`/`mode`, none inspect the glyph). `CategorySection.onLayoutY` additive/optional. `Skeleton` additive export. No public contract broken.
- Security surface: PASS — presentation/UX-only; no auth, billing, schema, migration, public API, secret, or trust-boundary surface. STRIDE scan clean.
- Section A (T1/T2/T3 packages/ui): CONCERN — mechanically feasible (`badge.tsx` is a clean `Skeleton` template; barrel export additive; glyph is a one-node swap). Gap: AC8 assertion needs a query handle (E1). Highest-risk edit: the ProductCard glyph must stay a pure visual swap with no behavior change — proven by the extended test + non-breaking-consumer re-grep (step 12).
- Section B (T4 order/index.tsx): CONCERN — largest edit; the screen has no pre-existing test to regress against, so the new screen test is written fresh (feasible via the `branches/index.test.tsx` jest-expo mock pattern; global `expo-router`/`api-client`/`auth-client` mocks provided by `jest-setup.ts`). All wiring (mode derivation, `ScreenHeader` right-slot icon row + absolute `Badge`, `ScrollView` ref + `scrollTo`, EmptyState branches) feasible against verified component contracts. Highest-risk edit: build it LAST (already sequenced), mock `useMenu`/`useBranch`/`useCart`/`useNavigateToProduct`.
- Section C (T5 CategorySection): PASS — additive optional `onLayoutY` prop, one-line `onLayout` wire on the section root `View`. No behavior change when omitted.
- Section D (T6 category-quick-nav): PASS — new Order-tab-local component mirroring `BranchSwitcher`'s safe horizontal-ScrollView pattern; test asserts chip-per-category + `onSelect` wiring.

Open gaps:
- AC11 (on-device visual/scroll/skeleton polish, light+dark) — Agent-Probe only; no RN E2E/navigation runner exists project-wide (`all-tests.md` standing gap). gap-resolution D — named residual, owed by the user; plan stays in `active/` until performed. Not the silent reason any behavior passes.
- AC4 real scroll-offset behavior — not measurable under jsdom/jest-expo; the quick-nav test proves handler wiring only; real `scrollTo` folded into the AC11 walkthrough.

What this coverage does NOT prove:
- `pnpm --filter @jojopotato/mobile test` / `pnpm --filter @jojopotato/ui test` — prove render structure, badge/count logic, nav-route dispatch, EmptyState/skeleton branch selection, chip wiring, and Skeleton light≠dark resolved fill. They do NOT prove: real on-device pixel layout, actual scroll animation/offset landing on the right section, gesture feel, safe-area behavior on physical hardware, or light/dark appearance as a human perceives it (AC11).
- `guard:theme-mode` + `check-tokens` — prove no raw hex/`useColorScheme` misuse and that tracked `mode` props exist. They do NOT prove the resolved colors are visually correct or legible on device (AC11).
- `typecheck`/`lint`/`format:check` — prove type-soundness, style, and formatting. They do NOT prove runtime behavior or visual outcome.
- The ProductCard non-breaking check (step 12 re-grep + extended test) proves no consumer inspects the glyph and no new prop/behavior changed. It does NOT prove the Home/Deals grids look unchanged on device — that remains an on-device visual check folded into AC11.

Gate: CONDITIONAL (0 FAILs; 3 CONCERNs, all resolved as plan corrections + execute-agent instructions E1–E2; AC11 Agent-Probe residual named as a standing gap)
Accepted by: pending orchestrator/user — accept the following to proceed to EXECUTE:
- C1 (AC8 query handle): resolved in-plan via E1 / checklist step 4 (add `testID="product-card-affordance"`).
- C2 (stale guard:theme-mode baseline): corrected in-plan (guard is GREEN on `feat/product-ux-enhance`); E2 makes it a hard green gate.
- C3 (AC10 named-suite overstatement): corrected in-plan to "full mobile + packages/ui suites re-run + typecheck."

## Autonomous Goal Block

```
SESSION GOAL: Polish the mobile Order tab (branch-scoped menu browse) — branded ScreenHeader with a live cart-count badge, category quick-nav chip bar, menu-shaped Skeleton loading state, shared EmptyState for error/empty, and an unambiguous ProductCard view-affordance glyph — presentation/UX only, no data/API/cart-logic change.
Charter + umbrella plan: N/A — single plan (process/general-plans/active/order-tab-enhance_21-07-26/order-tab-enhance_PLAN_21-07-26.md)
Autonomy: standard RIPER-5 gates apply; SIMPLE presentation-only plan, sequential single execute agent. No irreversible/outward-facing actions in scope.
Hard stop conditions / safety constraints:
- Do NOT change the public behavior of useCart/useMenu/useBranch (read-only).
- Do NOT alter ProductCard's default rendering/behavior for Home/Deals consumers — glyph swap must stay additive/visual-only, no new prop, no tap-behavior change.
- Do NOT introduce hardcoded colors — guard:theme-mode must stay GREEN (OK); a red result is a real new violation to fix.
- Plan stays in active/ until the AC11 on-device Agent-Probe walkthrough is performed by the user — do NOT mark VERIFIED or archive before that.
Next phase: EXECUTE (order-tab-enhance_PLAN_21-07-26.md) — 12-step checklist, order T1→T6→T4 last; start with Skeleton primitive + test (red-first).
Validate contract: inline in plan (## Validate Contract — Gate: CONDITIONAL, generated-by: outer-pvl)
Execute start: Fully-auto gates — `pnpm --filter @jojopotato/ui test` | `pnpm --filter @jojopotato/mobile test` | `pnpm --filter @jojopotato/ui check-tokens` | `pnpm --filter @jojopotato/mobile guard:theme-mode` | `pnpm --filter @jojopotato/{ui,mobile} typecheck` | `pnpm format:check`. Agent-Probe: AC11 on-device light/dark walkthrough (owed). High-risk pack: no.
```
