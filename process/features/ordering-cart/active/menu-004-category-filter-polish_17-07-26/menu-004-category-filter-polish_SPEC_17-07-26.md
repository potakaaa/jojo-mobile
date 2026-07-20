---
name: spec:menu-004-category-filter-polish
description: Wire the Home category filter to actually filter products; bounded regression-guard + small-checklist polish for Order/Product screens (MENU-004, issue #103)
date: 17-07-26
feature: ordering-cart
metadata:
  node_type: memory
  type: spec
  feature: ordering-cart
  phase: SPEC
---

# SPEC — MENU-004: Category Filter Wiring + Order/Product Screen Polish

GitHub issue #103. Branch: `feat/menu-004-category-filter-polish` (already cut from MENU-003 `a055bde`).

**Status: all open decisions resolved by the user 17-07-26.** This revision reconciles the SPEC
against those decisions — see the "Resolved 17-07-26" markers throughout.

## Summary

On the Home tab, tapping a category chip (Classic, Cheesy, Spicy, Sweet & Savory) currently
highlights the chip but does nothing else — the product grid below it never changes. This SPEC
locks the fix: tapping a category actually filters the grid to that category, tapping it again
(or picking a different category) updates the grid accordingly, and a category with nothing to
show tells the user that clearly instead of leaving a confusing gap. Switching branches while a
category is active always resets to the full unfiltered grid for the new branch — a deliberate,
user-approved simplification (see Background for why this diverges from the original GitHub issue
wording). Alongside the filter fix, this SPEC also locks a short, testable checklist of small
polish items for the Order tab and Product Details screen — not an open-ended redesign. Research
found most of what the original issue worried about (theming, pricing correctness, missing
components) is already working; the real remaining scope is small, and the user has explicitly
endorsed keeping it that small rather than padding it out.

## User Stories / Jobs To Be Done

1. As a customer browsing the Home tab, I want tapping a category chip to actually narrow down the
   products shown, so that I can find what I'm craving (e.g. "just show me spicy") without scrolling
   past everything else.
2. As a customer, I want to tap the same category again (or see it visually toggle off) to go back
   to seeing everything, so I'm not stuck in a filtered view I didn't mean to stay in.
3. As a customer, when a category has nothing available at my current branch, I want a clear message
   instead of an empty white space, so I don't think the app is broken.
4. As a customer who switches branches while a category filter is active, I want my category
   selection to reset and see the new branch's full menu — a clean slate, not a filter carried over
   from the branch I just left. *(Resolved 17-07-26 — locked behavior, see Background for
   rationale.)*
5. As a customer using Product Details or browsing the Order tab in dark mode, I want everything I
   already rely on today (pricing, required-option gating, readable colors) to keep working exactly
   as it does now — this work must not regress it.

## What The User Wants (Behavioral Outcomes)

- Tapping an unselected category chip on Home highlights it and narrows the product grid to only
  that category's products.
- Tapping the currently-selected chip again clears the filter and restores the full product grid
  (single-select toggle — this is already how the chip UI behaves visually; it just needs to reach
  the grid).
- Selecting a different category while one is already active swaps the filter directly to the new
  category (no need to tap the old one off first).
- If the selected category has zero products at the current branch, the user sees an explicit
  "nothing here" message in place of the grid — never a blank scroll area.
- The filtered grid never shows a product that isn't actually available for pickup at the customer's
  selected branch (this is already guaranteed today by how the menu is fetched — filtering only
  narrows an already-available set, it never needs to add its own availability check).
- Switching branches while a category is selected always clears the filter and shows the new
  branch's full, unfiltered grid — never a stale grid held over from the old branch, and never an
  empty state caused by a category selection that doesn't apply to the new branch.
- The "Popular this week" section title never changes based on category selection — it stays fixed
  regardless of which (if any) category is active. The chip's own highlighted state is the only
  visual indicator of an active filter.
- Everything about Product Details pricing (size/flavor/add-on price math, required-option gating
  before Add to Cart) and about light/dark rendering on the Order tab and Product Details keeps
  working exactly as today — untouched by this change.

## Flow / State Diagram

```
Home tab — category filter state machine

                    ┌─────────────────────┐
                    │  No category active   │
                    │  (grid shows ALL      │
                    │   branch products)     │
                    └───────────┬───────────┘
                                │ tap category chip C
                                ▼
                    ┌─────────────────────┐
              ┌────►│  Category C active    │
              │     │  (grid shows only      │
              │     │   C's products)        │
              │     └───────────┬───────────┘
              │                 │
              │   tap C again   │  tap a different
              │   (toggle off)  │  category D
              │                 │
              └─────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │  Category D active    │
                    └───────────────────────┘

Branch off "Category C active":
  - C has 0 products at this branch → render EmptyState instead of grid (chip stays visibly selected)

Branch switch (locked 17-07-26 — applies from ANY state above):
  - user switches branch while a category is active
        │
        ▼
  - selection resets to "No category active"
  - grid shows the NEW branch's full, unfiltered product list
  - (never: carry the old category over; never: show a stale/empty grid)
```

```
Screen-level composition (existing, unchanged structurally — filter state lifts one level up)

  (tabs)/index.tsx  [Home]
    └── owns: menuView (all categories + all products for current branch)
    └── owns (NEW): selectedCategoryId
    └── renders: CategorySelector(categories, selectedId, onSelect)   ← gains 2 props
    └── renders: ProductGrid(products = filtered by selectedCategoryId)  ← receives pre-filtered list, no internal change expected
    └── "Popular this week" section title: fixed text, never derived from selectedCategoryId

  (tabs)/order/index.tsx  [Order tab]
    └── unaffected by category filtering — already lists every category as its own
        section (CategorySection), which is a different, already-complete browsing pattern.
        In scope here only for the regression-guard polish checklist below.
```

## Acceptance Criteria (Testable Outcomes)

1. **Tapping a category chip filters the grid to that category's products only.**
   proven by: new pure-function unit test for the category-filter logic (e.g.
   `filterProductsByCategory(products, categoryId)` in the same pure-utility style as
   `flattenMenuForHome`), run through the existing node-env vitest runner in `apps/mobile`.
   strategy: Fully-Automated.
   Supplementary Agent-Probe walkthrough confirms the chip tap visibly narrows the on-screen grid.
   strategy: Agent-Probe.

2. **Tapping the active category again clears the filter and restores the full grid.**
   proven by: same pure-function unit test suite (toggle-off case: selecting the currently-active
   id returns the unfiltered list).
   strategy: Fully-Automated.
   Agent-Probe confirms the visual toggle-off on-device.
   strategy: Agent-Probe.

3. **Selecting a different category while one is active swaps directly to the new filter.**
   proven by: pure-function unit test (switch case: from category A active, selecting B returns
   B's products, not A's or the union).
   strategy: Fully-Automated.

4. **A category with zero products at the current branch shows an explicit empty state, not a
   blank area.**
   proven by: pure-function unit test asserting the filter helper returns an empty array for a
   category with no matching products (component-level empty-state rendering itself is Agent-Probe,
   since there is no RN component runner).
   strategy: Hybrid (Fully-Automated for the data path, Agent-Probe for the on-screen rendering).

5. **The filtered grid never shows a product unavailable at the selected branch.**
   proven by: existing regression coverage on `flattenMenuForHome` / the `useMenu()` → branch-menu
   API path (already real and green) plus a new assertion that the filter helper only narrows,
   never re-adds, entries — i.e. filtering a server-scoped list can't reintroduce unavailable items.
   strategy: Fully-Automated (regression guard on an already-true invariant, not new behavior).

6. **Switching branches while a category is selected always clears the selection and shows the new
   branch's full, unfiltered grid — never a stale grid, and never an empty state caused by a
   category carried over from the old branch.** *(Resolved 17-07-26; supersedes the earlier
   draft's open-question framing and issue #103's AC4 as originally written — see Background.)*
   proven by: Agent-Probe walkthrough — select a category on branch A, switch to branch B, confirm
   the chip row shows no active selection and the grid shows branch B's full product list.
   strategy: Agent-Probe. **Tier note (honest, not inflated):** the "clear on branch switch"
   behavior is a reaction to a branch-id change in screen-level effect wiring, not a data
   transformation of a given input list — there is no meaningful pure-function seam here the way
   there is for the category-filter logic in ACs 1-5 (the reset condition is simply "did the
   branch id change", which isn't worth a unit test in its own right). This stays entirely
   Agent-Probe, consistent with the SPEC's rule against inflating automation claims. The
   already-real `useMenu(branchId)` re-fetch-on-branch-change behavior is separately covered by
   existing tests and is not re-tested here.

7. **The stale "no filtering required at this stage" comment in `category-selector.tsx` is
   removed**, and the component's own doc comment reflects that selection now propagates outward.
   proven by: source diff review at EXECUTE / EVL time (`grep` for the retired phrase returns 0
   matches).
   strategy: Fully-Automated (grep-checkable).

8. **Product Details still computes size/flavor/add-on pricing correctly and still gates the Add
   to Cart button on required-option selection (MENU-002 regression guard — no code path in this
   scope should touch this, but it must be re-confirmed untouched).**
   proven by: existing `packages/utils/src/__tests__/product-options.test.ts` suite stays green,
   re-run as part of this change's gate.
   strategy: Fully-Automated (pre-existing regression suite, re-run not re-written).

9. **The Order tab and Product Details screen continue to render correctly in both light and dark
   mode (UX-001 regression guard).**
   proven by: Agent-Probe visual walkthrough in both modes (no automated visual-regression tooling
   exists in this repo).
   strategy: Agent-Probe.

10. **Any new reusable UI introduced by this work is exported from `packages/ui/src/index.ts`,
    never written inline in a screen file.**
    proven by: source review at EXECUTE / EVL time — applies only if new UI is introduced; if the
    empty-state reuse and prop-lifting approach requires zero new components (the likely outcome
    per research), this criterion is vacuously satisfied.
    strategy: Fully-Automated (grep/review-checkable).

## Out Of Scope

- **Open-ended visual restyling of the Home, Order, or Product Details screens.** Nothing in this
  SPEC authorizes new spacing scales, new color choices, new typography, or a redesign pass. Any
  polish item not listed as a numbered Acceptance Criterion above is not in scope, no matter how
  reasonable it sounds mid-implementation — flag it as a backlog note instead of doing it inline.
  *(Resolved 17-07-26: the user has confirmed no additional polish scope exists beyond what's
  listed — see Background.)*
- **Multi-select category filtering.** Rejected per locked decision — single-select toggle only,
  matching the existing chip UI's built-in behavior.
- **Changing the "Popular this week" section title based on the active category.** Rejected per
  locked decision (Resolved 17-07-26) — the title stays fixed; the chip's own selected state is the
  only affordance for "a filter is active." See Background for the rejected alternative and why.
- **Changing the add-to-cart-bar bottom clearance.** Already fixed by NAV-001 (commit `f7c6fe7`).
  Do not re-touch `add-to-cart-bar.tsx`'s inset math.
- **Adding a category filter/chips to the Order tab.** The Order tab already shows every category
  as its own labeled section (`CategorySection`), a complete and different browsing pattern from
  Home's chip-and-grid. This SPEC does not add chip filtering there.
- **New shared UI components in `packages/ui`.** The PRD's "Important Components" list (§12) is
  already fully implemented and exported. This work is expected to recompose what exists, not add
  new components. If EXECUTE discovers a genuine gap, that is a new decision requiring its own
  scoping — not silently absorbed into this SPEC.
- **Category-to-emoji mapping expansion.** `CATEGORY_EMOJI` in `category-selector.tsx` is decorative
  only; unmapped categories already render without an emoji and are not filtered out. Out of scope
  to touch.
- **Any backend/API change.** The menu endpoint, availability filtering, and category data shape
  are already correct and untouched by this work — this is a pure frontend wiring + polish change.
- **Building an automated RN component or E2E test runner.** The project-wide gap (no RN
  component/E2E harness) is tracked separately
  (`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) and is not this
  issue's job to close.
- **Persisting or reconciling a category selection across a branch switch.** Explicitly rejected —
  see AC6 and Background. The behavior is always "reset to unfiltered," never "carry over if still
  valid."

## Constraints

- Category filter must remain a single-select toggle — tap to filter, tap again to clear. No
  multi-select UI.
- **The "Popular this week" section title is fixed text and must never be derived from or altered
  by `selectedCategoryId`.** *(Resolved 17-07-26 — locked.)* The chip's own highlighted/selected
  visual state is the sole indicator that a filter is active; do not introduce a second indicator.
- **A branch switch always resets `selectedCategoryId` to unselected, regardless of whether the
  previously-selected category exists at the new branch.** *(Resolved 17-07-26 — locked.)* No
  conditional "persist if still valid" logic — this is a deliberate simplification, not an
  oversight (see Background for the full rationale and its divergence from issue #103's original
  wording).
- Filtering must never re-introduce a product that the branch-scoped menu API did not return (i.e.
  filtering only narrows the already-available set fetched by `useMenu()`; it must not perform its
  own independent availability check or bypass the server-side filter).
- Category ids used for filtering must be the same ids the menu API returns (`Category.id` /
  `MenuItem.categoryId`) — no new id-reconciliation or mapping layer, since research confirmed these
  already align 1:1.
- Any new filtering logic must be expressed as a pure, side-effect-free function so it is coverable
  by the existing node-env vitest runner in `apps/mobile` — screen/UI wiring code inherently stays
  Agent-Probe-only, but the actual filter decision logic must not be buried inside a component where
  it becomes unautomatable. (The branch-switch reset itself is an exception — see AC6's tier note;
  it has no meaningful pure-function seam and stays Agent-Probe honestly, not inflated.)
- Must follow the shared `@jojopotato/ui` component convention (`EmptyState`, theme tokens via
  `useTheme()`/`useColorScheme()`) — no one-off screen markup, no hardcoded colors.
- Must not regress MENU-002 (Product Details pricing/gating) or UX-001 (light/dark theming) — both
  already pass today and must still pass after this change.
- **The remaining scope of this SPEC is deliberately small.** *(Resolved 17-07-26.)* Beyond the
  filter wiring (ACs 1-6), removing the stale comment (AC7), and the two regression guards (AC8,
  AC9), no additional "polish" line items are authorized. Any real gap discovered during EXECUTE
  that isn't covered by an existing AC must be filed as a backlog note, never implemented inline
  under this SPEC's authority.
- Branch: work happens on `feat/menu-004-category-filter-polish`.

## Open Questions

None. All three open questions from the initial draft were resolved by the user on 17-07-26:
section title stays fixed (see Constraints, AC list, Background), branch switch clears the filter
(see AC6, Constraints, Background), and the polish checklist is accepted as-is with no added scope
(see Background, Constraints).

## Background / Research Findings

- **The wiring gap is a state-lift, not new logic.** `category-selector.tsx` (25-27, 43-45) already
  has correct single-select toggle behavior via local `useState<string | null>` — it just never
  reports the selection to its parent. `(tabs)/index.tsx` (324, 329) already owns `menuView`
  (categories + products for the current branch, from `flattenMenuForHome()`) and renders both
  `CategorySelector` and `ProductGrid` side by side. The fix lifts `selectedId` state up one level
  and filters `menuView.products` by `categoryId` before handing them to `ProductGrid`.
- **Category ids already align 1:1** between `CategorySelector`'s chips and `ProductGrid`'s items —
  both come from the same `flattenMenuForHome()` output (`menu-to-home-view.ts`), which derives
  `MenuItem.categoryId` straight from the live API response. No reconciliation layer needed.
- **Three of the issue's original ACs are already true today, verified by source, not by this
  work:**
  - A product never shows for a category filter if it isn't available at the branch — the branch
    menu API (`GET /branches/:id/menu`) is already server-side filtered to available-only products
    before it ever reaches the Home screen; category filtering can only narrow that set further.
  - Category ids already reconcile (see above).
  - The add-to-cart-bar's bottom clearance issue was already fixed by NAV-001 (`f7c6fe7`); the
    original GitHub issue itself warned not to double-fix this.
- **Section title decision — RESOLVED 17-07-26 (Q1 in the original draft).** Locked: the "Popular
  this week" title stays fixed and never changes based on category selection. Rejected alternative:
  dynamically retitling the section to the active category's name (e.g. "Spicy this week") — this
  was considered and explicitly rejected because the section title communicates "these are our
  highlighted picks," a separate concept from "what category are you filtering to," and because a
  dynamic title risks reading awkwardly for category names that don't fit the sentence template.
  The chip's own highlighted state already communicates the active filter; a second indicator is
  redundant. This is now locked, not re-open for future re-litigation without a new decision.
- **Branch-switch behavior — RESOLVED 17-07-26 (Q2 in the original draft). This decision
  deliberately DIVERGES from GitHub issue #103's AC4 as originally written.** The issue text reads:
  *"Switching branches re-applies the active category filter against the new branch's menu without
  a stale grid"* — implying the filter should persist across a branch switch if the category still
  applies. The user has decided AGAINST that: a branch switch always clears
  `selectedCategoryId`, landing the customer on the new branch's full, unfiltered menu, regardless
  of whether the previously-active category exists at the new branch. Rationale (user-approved):
  (1) avoids stranding the customer in an empty state for a category the new branch doesn't carry;
  (2) avoids silently retaining a filter the customer may have forgotten was on, which could read as
  the app "hiding" products after a branch switch; (3) matches how most filter/search UIs
  conventionally treat a context change (like switching branches) as an implicit reset, rather than
  adding a second "persist if still valid" code path for a rare edge case. **This divergence from
  the issue's literal AC4 wording is intentional and user-approved — a future reader comparing this
  SPEC to issue #103 should treat this SPEC's version as the authoritative, superseding decision,
  not an oversight.**
- **Polish scope finding — RESOLVED 17-07-26 (Q3 in the original draft), user-endorsed.** Research
  confirmed, and the user has explicitly accepted, that theming (AC9), Product Details pricing/
  gating (AC8), the shared-component library (Out of Scope), and the empty-state pattern
  (`EmptyState`, already used ~6× on Home) are ALL already correct today. There is no evidence of a
  missing visual affordance, a broken spacing rule, or an unimplemented PRD §12 component. The only
  genuinely new user-facing surface this issue produces is: (a) the filter itself working (ACs 1-6),
  (b) the stale comment removed (AC7), and (c) the two regression guards proving nothing broke (AC8,
  AC9). The user has confirmed this is the correct, complete scope — no additional "polish" line
  items should be manufactured to pad the issue. Any real gap surfacing during EXECUTE that isn't
  covered by an AC above must be filed as a backlog note, not implemented inline under this SPEC's
  authority.
- **Theming is already fully compliant** across every screen this issue touches (Home, Order tab,
  Product Details, `category-selector.tsx`, `add-to-cart-bar.tsx`, `category-section.tsx`) — all
  use `useTheme()`/`useColorScheme()`, no stray raw hex colors. AC9 in this SPEC is a regression
  guard, not new work.
- **Product Details pricing/gating is real, tested, and already correct** —
  `getRequiredOptionTypes()` / `isRequiredSelectionComplete()` in `packages/utils/src/product-
  options.ts`, covered by a green existing test suite; `AddToCartBar` already gates the Add button
  correctly and shows an inline hint on a premature tap. AC8 is a regression guard.
- **PRD §12's "Important Components" list is fully implemented** in `packages/ui` (`DealCard`,
  `BranchCard`, `ProductCard`, `RewardProgressCard`, `StarProgressBar`, `OrderStatusTimeline`,
  `CouponCard`, `CartItem`, `FlavorSelector`, `SizeSelector`, `PickupTimeBadge`), and `EmptyState`
  (`packages/ui/src/components/empty-state.tsx`) is the established empty-state pattern, already
  used repeatedly on the Home screen. No new component appears necessary for this work.
- **Test reality:** `apps/mobile` has a pure-TS vitest runner (node env) but no RN component/E2E
  runner (project-wide gap, tracked separately). `menu-to-home-view.ts` is already pure and already
  tested this way — the same pattern (a pure `filterProductsByCategory` helper) is the lever that
  turns the core filtering behavior into real Fully-Automated coverage instead of Agent-Probe-only.
  Chip taps, screen composition, visual polish, and the branch-switch reset (see AC6's tier note)
  remain unavoidably Agent-Probe.
- **`process/context/tests/all-tests.md` is stale** on one point: it claims `packages/utils` has no
  test runner, but it does (vitest, 39/39 passing, verified live). Its general "no RN runner" claim
  for `apps/mobile` component/E2E coverage is accurate.
- **Prior art on this exact surface:** `process/features/ordering-cart/completed/menu-product-
  browsing_10-07-26/` (original MENU-001/MENU-002 SPEC/PLAN/REPORT) — establishes the
  `flattenMenuForHome()` pure-function pattern and the existing `EmptyState` usage this SPEC builds
  on. MENU-003 (`process/features/ordering-cart/active/menu-003-branch-availability_17-07-26/`) is
  the immediately-preceding, unrelated, already-completed sibling issue on the same branch lineage.
- **PRD references:** §6.2 (Home) and §6.4 (Menu/Product Browsing) describe the category-chip +
  grid interaction at a product-vision level; §12 (Design Requirements) gives adjective-level
  guidance ("fun, bright, snackable", "large product photos", "clear CTAs") with no testable
  definition of done — this SPEC's Acceptance Criteria section is what converts that into pass/fail
  conditions.
