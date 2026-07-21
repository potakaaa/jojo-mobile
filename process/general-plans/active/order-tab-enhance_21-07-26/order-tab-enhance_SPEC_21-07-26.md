---
name: plan:order-tab-enhance
description: "Requirements doc for a visual/UX enhancement of the mobile Order tab (branch-scoped menu browse screen)"
date: 21-07-26
feature: general-plans
---

# Order Tab Enhancement — SPEC

## Summary

The Order tab is where a customer picks a pickup branch and browses that branch's menu to start
an order. Today it works, but it looks and feels unfinished: a plain text "Menu" title, no visual
hierarchy, a cart icon that never shows how many items are in the basket, a bare spinner while
loading, and plain one-line text for empty/error states. This work makes the Order tab look and
feel like a real, polished part of the app — clearer at a glance, more inviting to browse, and
more informative about the customer's own basket — without changing what it does (browse a
branch's menu and open a product).

## User Stories / Jobs To Be Done

1. **As a customer opening the Order tab**, I want the screen to feel branded and intentional
   (not a bare list), so that I trust this is a finished, professional app.
2. **As a customer with items already in my cart**, I want to see how many items are in my basket
   from the Order tab's cart icon, so I don't have to open the cart just to check.
3. **As a customer browsing a branch with many menu categories**, I want an easy way to jump to a
   category, so I don't have to scroll through the whole menu to find what I want.
4. **As a customer waiting for the menu to load**, I want a loading state that looks like the
   content that's coming (not just a spinner), so the screen feels responsive and I know roughly
   what to expect.
5. **As a customer who hits an error or an empty branch menu**, I want a clear, friendly message
   with a next step (retry, or switch branch), so I'm not stuck looking at a plain line of text.
6. **As a customer scanning product cards**, I want it to be obvious what tapping a card's "+" icon
   does, so I'm not confused about whether it adds to my cart or opens product details.

## What The User Wants (Behavioral Outcomes)

- The Order tab header reads as a real screen header — clear title, consistent with the app's
  brand system, not a bare `<Text>` line.
- The cart icon in the header visibly shows the number of items currently in the customer's
  basket (a small badge/count). When the basket is empty, no count is shown (or the badge is
  hidden) — the icon itself is always present and tappable regardless.
- The branch switcher and category list keep working exactly as they do today (branch selection
  drives the menu; tapping a product opens Product Details) — this work changes appearance and
  navigation aids, not the underlying data flow.
- When a branch's menu has more than a few categories, the customer has a fast way to jump
  straight to a category instead of scrolling past everything above it.
- While the menu is loading, the customer sees a placeholder that resembles the shape of the menu
  (category title placeholders + a grid of card-shaped placeholders) instead of a single centered
  spinner.
- When the menu fails to load or a branch genuinely has no menu items, the customer sees a
  friendly icon + headline + short description + a clear action (Retry, or nothing beyond the
  message when there's truly nothing else to do) — using the same shared empty-state look already
  used elsewhere in the app (e.g. the Cart screen's empty state).
- Product cards read clearly: what the "+" glyph means is resolved one of three ways (see Open
  Questions) so it's never ambiguous whether tapping it adds to cart or opens details.
- The whole screen (header, category jump nav, skeleton, empty/error states, any new grid
  treatment) is fully theme-aware — correct in both light and dark mode, using the app's existing
  brand tokens, exactly like the rest of the screen already is.

## Flow / State Diagram

```
Order tab opened
      |
      v
+-----------------------+
| Branch + menu loading |---(loading)--> [Skeleton: category title
+-----------------------+                 placeholders + card-grid
      |                                    placeholders]
      | data resolves
      v
  +---------+       menu fetch failed
  | Result? |------------------------> [Error empty-state: icon +
  +---------+                            "Couldn't load the menu"
      |                                  + Retry action]
      | success, categories.length > 0
      v
+---------------------------------------------+
| Header: title + branded look + cart icon     |
| (badge = live item count from basket) +      |
| history icon                                 |
|                                               |
| Branch switcher (chip row, unchanged)         |
|                                               |
| [Optional] Category quick-nav (jump chips)    |
|                                               |
| Category sections, each:                      |
|   - Category title                            |
|   - 2-col grid of product cards                |
|     (tap card -> Product Details)              |
+---------------------------------------------+
      |
      | success, categories.length == 0
      v
[Empty empty-state: icon + "No menu available
 for this branch yet" + (optional switch-branch
 hint/action)]

Branch switched at any point --> menu re-fetches --> back to "loading" state
Cart item added/removed elsewhere in the app --> cart badge count updates live
```

## Acceptance Criteria (Testable Outcomes)

1. **The header renders with visual hierarchy (branding, spacing, type treatment) consistent with
   the app's brand system, replacing the current plain-text title.**
   proven by: `order-tab-header.test.tsx` (new) — jest-expo render snapshot/assertion of header
   structure and themed styling in both light and dark mode.
   strategy: Fully-Automated

2. **The cart icon shows a numeric badge equal to the live count of items in the customer's
   basket (`useCart()`), and the badge is absent/hidden when the basket has zero items.**
   proven by: `order-tab-header.test.tsx` (new) — render with a mocked `useCart()` returning 0,
   1, and N items; assert badge presence/text per case.
   strategy: Fully-Automated

3. **Tapping the cart icon still navigates to `/(tabs)/cart`; tapping the history icon still
   navigates to `/(tabs)/history` — unchanged from today.**
   proven by: existing/extended `order-tab-header.test.tsx` or the current order/index test file —
   assert `router.push` called with the correct route on press.
   strategy: Fully-Automated

4. **When a branch's menu has more categories than fit comfortably on one screen, a category
   quick-navigation control is present and, when tapped, scrolls the screen to that category's
   section.**
   proven by: `category-quick-nav.test.tsx` (new) — render with a multi-category menu fixture;
   assert the nav renders one entry per category and its press handler is wired (scroll
   invocation asserted via a mocked ref/handler, since jsdom/jest-expo cannot measure real
   scroll offsets — see Open Questions on threshold + exact mechanism).
   strategy: Fully-Automated

5. **While `useMenu()`/`useBranch()` report loading, the screen renders a skeleton placeholder
   (category-title-shaped bars + card-grid-shaped blocks) instead of a bare `ActivityIndicator`.**
   proven by: order-tab screen test — render with `isLoading: true` mocked; assert skeleton
   elements render and the old bare-spinner-only state does not.
   strategy: Fully-Automated

6. **On menu fetch error, the screen renders the shared `EmptyState` component (icon + title +
   description + Retry action) instead of the current plain-text-plus-link block; tapping Retry
   calls `refetch()`.**
   proven by: order-tab screen test — render with `isError: true` mocked; assert `EmptyState`
   props (icon/title/description/action) and that the action press calls the mocked `refetch`.
   strategy: Fully-Automated

7. **On a genuinely empty branch menu (`categories.length === 0`), the screen renders the shared
   `EmptyState` component with a friendly message (and, if in scope per the locked affordance
   decision, a "Switch branch" hint/action) instead of the current plain-text line.**
   proven by: order-tab screen test — render with `data.categories = []`; assert `EmptyState`
   renders with the empty-menu copy.
   strategy: Fully-Automated

8. **The product card's "+" affordance is resolved per the locked decision from Open Question
   OQ-1 (made functional as a real one-tap add-to-cart, OR relabeled/restyled as a pure
   navigation affordance, OR removed) — whichever is chosen, tapping anywhere on the card no
   longer produces ambiguous behavior between "add" and "open details."**
   proven by: `product-card.test.tsx` (existing, extended) — assert the resolved tap behavior
   (either the "+" triggers a distinct add-to-cart action separate from card-tap navigation, or
   the glyph/label no longer implies "add" while card-tap navigation is unchanged).
   strategy: Fully-Automated

9. **All new/changed UI elements (header, badge, quick-nav, skeleton, empty states) render
   correctly themed in both light and dark mode — no hardcoded colors, using `Colors[mode]` /
   theme tokens per the project's theming convention.**
   proven by: existing `guard:theme-mode` script (`apps/mobile/scripts/check-theme-mode.mjs`) run
   against all new/changed `packages/ui` components with a tracked `mode` prop, plus light/dark
   render assertions in the new component tests above.
   strategy: Fully-Automated

10. **The underlying menu browse behavior (branch selection drives menu fetch, tapping a product
    opens Product Details, category/product data shape) is unchanged — no regression in existing
    `order/index` and `category-section`/`branch-switcher` behavior.**
    proven by: existing order-tab / category-section / branch-switcher test suites, re-run green
    with zero behavioral assertion changes beyond what ACs 1–9 explicitly touch.
    strategy: Fully-Automated

11. **On a real device, the redesigned Order tab looks intentional and polished in both light and
    dark mode, the category quick-nav genuinely helps navigate a long menu, and the skeleton
    loading state reads as "menu is loading" rather than a generic spinner.**
    proven by: Agent-Probe manual walkthrough (owed by the user — no RN E2E/navigation runner
    exists in this repo; see `process/context/tests/all-tests.md`).
    strategy: Agent-Probe

## Out Of Scope

- The Home tab's "active order in progress" banner — that already exists on the Home tab
  (separate, recent, uncommitted work) and is explicitly not duplicated or touched here.
- Any breaking change to `packages/ui`'s `ProductCard` — it is also consumed by the Home tab and
  Deals tab grids. Any change to it in this work must be additive (e.g. a new optional prop) and
  must not alter its default rendering/behavior for those other consumers.
- Building a full RN E2E/navigation test runner — this repo has none today (project-wide gap);
  this work plans jest-expo component-level tests only, plus a manual Agent-Probe walkthrough for
  on-device/navigation verification.
- Any change to the underlying menu/branch/cart data layer, API contracts, or pricing/cart logic —
  this is a presentation/UX layer change only.
- Redesigning the Branches tab, Product Details screen, or Cart screen — only the Order tab (menu
  browse) screen and its directly composed components (`category-section`, `branch-switcher`,
  and the Order tab's own header) are in scope, plus the `ProductCard` affordance fix from OQ-1 if
  chosen (additive only, per above).
- Adding a search bar to the Order tab (not requested; would be a separate follow-up if wanted).

## Constraints

- Must follow the project's theming convention exactly: derive theme from `useColorScheme()` /
  `useTheme()`, never hardcode colors, use `Colors[mode]` / brand tokens from
  `packages/ui/src/theme.ts` (`Spacing`, `Radii`, `Shadows`, `TypeScale`, `FontFamily`).
- Must reuse existing shared `packages/ui` components wherever they fit (`EmptyState`,
  `ScreenHeader`, `Badge`, `Card`) per CLAUDE.md's "always use `@jojopotato/ui`, never one-off
  screen UI" rule — new one-off primitives should only be added when nothing reusable exists and
  the element is genuinely screen-specific.
- Any new shared component (e.g. a category quick-nav) should be added to `packages/ui` if it is
  plausibly reusable elsewhere (e.g. Deals tab has a similar long-list-of-categories shape),
  matching the existing pattern of extracting reusable brutalist-themed primitives.
- Must not change the public behavior of `useMenu()`, `useBranch()`, or `useCart()` — read from
  them, don't modify their contracts.
- Cart badge must reflect real basket state via the existing `useCart()` hook (`itemCount` field
  already exists — no new cart-count derivation needed).
- No RN E2E/navigation runner exists — plan jest-expo component tests for all logic/rendering
  behavior; on-device visual and navigation verification is Agent-Probe only (standing
  project-wide constraint, not something this work is expected to fix).
- Must not regress typecheck, lint, or the existing `apps/mobile` jest/vitest suites.

## Open Questions

- **OQ-1 (owner: INNOVATE / user during INNOVATE) — Product card "+" affordance.** The current
  "+" glyph on `ProductCard` looks like a one-tap "add to cart" button, but tapping anywhere on
  the card (including the "+") only navigates to Product Details — there is no quick-add. Three
  resolution paths, to be decided in INNOVATE: (a) make the "+" a real functional quick-add
  (requires a new interaction: distinguishing a tap on the "+" sub-region from a tap on the rest
  of the card, and calling into cart-add logic — bigger surface, touches `ProductCard`'s tap
  handling contract shared with Home/Deals tabs); (b) keep card-tap-only navigation but
  restyle/relabel the glyph so it no longer implies "add" (e.g. a plain chevron or "View" hint —
  smaller, presentation-only change); (c) remove the glyph entirely and rely on the whole-card tap
  affordance alone. This SPEC intentionally does not pre-select an option — it is a design/scope
  tradeoff for INNOVATE, since (a) has materially larger blast radius (shared component, new
  interaction, likely needs its own cart-mutation UX) than (b) or (c).
- **OQ-2 (owner: INNOVATE) — Category quick-nav mechanism.** AC4 requires a way to jump to a
  category on long menus, but the exact UI (sticky chip row of category names, a floating jump
  button, an alphabet-style index, etc.) and the "long enough to need it" threshold (e.g. show
  only when category count exceeds N) are not decided. INNOVATE should propose the simplest
  mechanism that satisfies the user story without adding a second scrollable region that fights
  the existing outer `ScrollView` (the codebase already avoids nested scrollables — see
  `category-section.tsx`'s comment on why it isn't a `FlatList`).
- **OQ-3 (owner: INNOVATE) — Empty-branch-menu action.** Should the "no menu at this branch"
  empty state offer a "Switch branch" action (e.g. scroll back up to the branch switcher, or open
  a branch picker), or just an informational message? Locked to "at minimum use the shared
  `EmptyState` component" (see AC7); the exact action, if any, is left to INNOVATE.

## Background / Research Findings

- **Current implementation** (`apps/mobile/src/app/(tabs)/order/index.tsx`): a single `ScrollView`
  composing an inline header (`<Text>Menu</Text>` + two `Ionicons` buttons, no cart badge), a
  `BranchSwitcher` chip row, and a list of `CategorySection`s, each a 2-column grid of
  `ProductCard`. Confirmed already theme-compliant (`useTheme()`, no hardcoded colors) — new work
  must follow the same convention.
- **`useCart()`** (`apps/mobile/src/features/cart/hooks/use-cart.ts`) already exposes a live
  `itemCount: number` field (sum of item quantities) — no new cart-state derivation is needed for
  the badge, just wiring.
- **`ProductCard`** (`packages/ui/src/components/product-card.tsx`) takes `product`,
  `imageSource`, `onPress`, `mode`; its own doc comment already states: "Tapping toggles a local
  pressed highlight — it does not navigate or add to a cart yet" inside the component file, while
  the actual card-level `onPress` passed in from `category-section.tsx` navigates to Product
  Details. The "+" is currently pure decoration. It is shared by the Home tab and Deals tab grids,
  so any behavioral change must stay additive/backward-compatible for those consumers (per
  CLAUDE.md's cross-consumer caution — matches the precedent set by prior `ProductCard`-adjacent
  work like BRN-006's badge-gating fix, which stayed presentation-only).
- **`packages/ui`** already has the components this work should reuse: `EmptyState` (icon + title
  + description + optional CTA button, mode-aware — already used by the Cart screen's empty
  state), `ScreenHeader` (back-arrow + title + optional single trailing `right` node — designed
  for pushed screens with a back target; the Order tab is a tab root with no back target, so
  `ScreenHeader` would need to be used with `onBack` omitted, and its single `right` slot would
  need to host both the cart and history icons together), and `Badge` (small themed pill,
  variant-driven color — not currently designed as an icon-overlay count badge, so using it for
  the cart-count badge will need either a positioning wrapper or a small additive layout prop).
- **Sibling in-flight precedent:** other per-screen visual/UX polish passes are already active in
  this repo under the same `process/general-plans/active/` convention (e.g.
  `account-tab-avatar-redesign`, `product-details-enhance`, `mobile-alert-toast-consistency`,
  `mobile-dark-mode-audit`) — this SPEC follows the same shape (general-plans, not a new feature
  folder) and the same theme-compliance bar those establish.
- **Test runner reality** (`process/context/tests/all-tests.md`): `apps/mobile` has jest-expo for
  component tests and vitest for pure-TS logic, but there is still no RN E2E/navigation runner —
  any on-device visual polish and real navigation behavior for this screen will remain an
  Agent-Probe walkthrough, consistent with every other UI-polish plan in this repo to date.
