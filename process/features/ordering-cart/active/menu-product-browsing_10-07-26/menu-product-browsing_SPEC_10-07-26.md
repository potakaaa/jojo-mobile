---
name: plan:menu-product-browsing-spec
description: "Product-discovery SPEC for MENU-001 (branch-scoped category menu) + MENU-002 (product options + pricing + add to cart)"
date: 10-07-26
feature: ordering-cart
---

# SPEC — Menu Browsing & Product Details (MENU-001 + MENU-002)

## Summary

Right now the Order tab is an empty placeholder — there is no way for a customer to see what
Jojo Potato sells, let alone order it. This SPEC covers the first real slice of the ordering
experience: a customer opens the Order tab, sees the menu organized by category (Fries,
Corndogs, Nuggets, Lemonade, Combos, Deals) **for the branch they currently have selected**, taps
a product, picks the required size/flavor/add-ons while watching the price update live, and adds
it to their cart. This is the foundation everything else in ordering (cart review, checkout,
order history) will be built on top of — so it also has to establish three small pieces of shared
plumbing (selected-branch state, a minimal cart, and a way to fetch live data) that don't exist
in the app yet.

## User Stories / Jobs To Be Done

1. **As a customer**, I want to see the menu organized into categories (Fries, Corndogs, Nuggets,
   Lemonade, Combos, Deals), so that I can quickly find the kind of food I want.
2. **As a customer**, I want the menu to only show me what's actually available at my selected
   branch, so that I don't try to order something I can't actually pick up.
3. **As a customer**, when I switch branches, I want the menu to update automatically, so that I
   never see stale availability from the branch I left.
4. **As a customer**, when a category has nothing available right now, I want to be told that
   clearly instead of seeing a blank or broken-looking screen.
5. **As a customer**, I want to tap a product and see its full details (photo, description,
   price) before deciding to order it.
6. **As a customer configuring fries**, I want to choose a size and a flavor and watch the price
   update as I pick, so I always know what I'm about to pay before I commit.
7. **As a customer**, I want to be stopped (with a clear message) from adding an item to my cart
   if I haven't finished a required choice (like flavor), so I don't order something incomplete.
8. **As a customer**, I want "Add to Cart" to actually put the item — with my exact choices and
   the price I saw — into my cart, so what I ordered is what I get charged for.
9. **As a customer still looking at a product**, if that product stops being available at my
   branch while I'm on the screen, I want to find out immediately, not after I've already tried
   to order it.

## What The User Wants (Behavioral Outcomes)

- Opening the Order tab shows a list of categories and, per category, the products available at
  the customer's currently selected branch — each with a photo, name, price, and a way to add it
  quickly.
- Categories and products the branch doesn't currently offer never appear, even if that item is
  sold elsewhere.
- If the customer changes their branch (from Home or the Branches tab), the menu they see updates
  to match — no stale data, no manual refresh required.
- An empty category (branch doesn't currently offer anything in it) shows a friendly message
  instead of nothing.
- Tapping a product opens a details screen with its name, description, photo, and base price.
- On the details screen, choices are grouped (e.g. "Size", "Flavor", "Add-ons"). Selecting or
  changing a choice instantly updates the total price shown.
- If a choice is required (e.g. fries must have a flavor) and the customer hasn't made it,
  "Add to Cart" stays disabled/greyed out, and trying to add anyway shows a clear inline message
  telling them what's missing.
- Once all required choices are made, "Add to Cart" is enabled. Tapping it adds the item — with
  exactly the options chosen and the exact price shown — to the customer's cart.
- If the product the customer is looking at becomes unavailable at their branch while they're
  still on the screen, the screen reflects that immediately (no need to leave and come back, no
  app restart).

## Flow / State Diagram

```
                         ┌─────────────────────────────┐
                         │      Order tab opens         │
                         │ (branch already selected      │
                         │  elsewhere in the app)        │
                         └───────────────┬───────────────┘
                                         │
                                         ▼
                   ┌─────────────────────────────────────────┐
                   │  Load categories (active, sort_order)     │
                   │  Load products available at branch        │
                   └───────────────┬───────────────────────────┘
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                             ▼
        ┌────────────────────────┐   ┌──────────────────────────────┐
        │ Category has products   │   │ Category has 0 products here  │
        │  → show product grid    │   │  → show empty-state message   │
        └────────────┬─────────────┘   └──────────────────────────────┘
                     │
        (branch changed elsewhere) ──► menu re-fetches / re-filters automatically
                     │
                     ▼ tap a product
        ┌───────────────────────────────────────────┐
        │             Product Details                 │
        │  name, description, photo, base price        │
        │  option groups: Size / Flavor / Add-on        │
        └───────────────┬───────────────────────────────┘
                        │
          select/change any option
                        ▼
        ┌───────────────────────────────────────────┐
        │  price = base_price + Σ(selected deltas)     │
        │  (re-renders instantly on every change)      │
        └───────────────┬───────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          ▼                              ▼
 required group(s)                required group(s)
   still empty                        all filled
          │                              │
 "Add to Cart" disabled          "Add to Cart" enabled
          │                              │
  tap anyway → inline                    │ tap
  validation message,                    ▼
  nothing added              ┌────────────────────────────┐
                             │ Item appended to cart with   │
                             │ selected options + computed  │
                             │ unit price snapshot          │
                             └────────────────────────────────┘

  (any time while on Product Details)
        branch-side availability flips to false for this product
                        │
                        ▼
        Screen reflects "unavailable" state without restart
        ("Add to Cart" is blocked / product marked unavailable)
```

## Acceptance Criteria (Testable Outcomes)

### Menu screen (MENU-001)

1. **Only active categories appear, in the defined order.**
   The category list shows exactly the categories marked active, ordered the way they're
   configured to be ordered — nothing inactive ever shows up, nothing appears out of order.
   `proven by:` manual verification via `pnpm ios`/`pnpm android` walking the Order tab against
   seeded category data (mix of active/inactive, non-sequential sort order) — no automated mobile
   test runner exists yet (see Constraints). `strategy:` Agent-Probe (Known-Gap: mobile RN
   automated coverage — see Constraints).

2. **Only branch-available products appear.**
   A product only shows up in the menu if it's marked available for the customer's current
   branch. A product that's active everywhere else but not available at this branch never shows,
   and vice versa — a product inactive globally never shows even if flagged available at the
   branch. `proven by:` manual verification with seeded data covering both mismatch directions
   (available-at-branch-but-globally-inactive, and globally-active-but-not-available-here); if the
   branch-filter logic is extracted into a pure function (e.g. in `packages/utils` or a shared
   selector), that function gets a Vitest unit test. `strategy:` Hybrid.

3. **Switching branch refreshes the menu.**
   Changing the selected branch anywhere in the app (Home, Branches tab) is reflected on the Order
   tab without the customer needing to manually reload. `proven by:` manual verification —
   change branch, return to/stay on Order tab, confirm menu content changes to match.
   `strategy:` Agent-Probe (Known-Gap: no e2e/navigation harness exists yet — see Constraints).

4. **Empty category shows an explicit empty state.**
   A category with zero available products at the current branch shows a clear "nothing here
   right now" message, not a blank space or a broken-looking layout. `proven by:` manual
   verification with a seeded branch/category combo that has zero available products.
   `strategy:` Agent-Probe.

5. **Tapping a product opens Product Details.**
   Tapping any product tile navigates to that product's details screen (MENU-002). `proven by:`
   manual verification of the navigation hop; if Expo Router typed-route codegen is exercised,
   `pnpm typecheck` also catches a broken/missing route param contract. `strategy:` Hybrid.

### Product Details screen (MENU-002)

6. **Product Details renders core info.**
   The screen shows the product's name, description, image, and base price. `proven by:` manual
   verification against seeded product data. `strategy:` Agent-Probe.

7. **Selecting an option updates price by exactly that option's delta.**
   Choosing (or changing) any size/flavor/add-on option updates the displayed unit price by
   exactly that option's configured price delta — and combined selections (e.g. size + flavor +
   add-on) sum correctly. `proven by:` if price computation is a pure function
   (`base_price + Σ(selected price_delta)`), it gets a Vitest unit test (table-driven: single
   option, multiple option groups, zero-delta options); the on-screen re-render is confirmed by
   manual verification. `strategy:` Hybrid.

8. **"Add to Cart" is disabled until every required option group has a selection.**
   The button stays disabled while any required group (e.g. flavor for fries) is unselected.
   `proven by:` manual verification against a product configured with at least one required
   group; if required-group state is centralized in a hook/reducer, a Vitest unit test covers the
   enabled/disabled boolean directly. `strategy:` Hybrid.

9. **Attempting to add without a required selection is blocked with an inline message.**
   If a customer somehow triggers add-to-cart before required groups are filled, nothing is added
   and a clear inline validation message explains what's missing. `proven by:` manual
   verification triggering the blocked path directly. `strategy:` Agent-Probe.

10. **Adding to cart appends a correctly-snapshotted item.**
    Tapping "Add to Cart" (once enabled) appends an item to the cart with the exact selected
    options and the exact computed unit price at that moment — later changes to the product's
    price/options elsewhere must NOT retroactively change what's already in the cart.
    `proven by:` if cart-append is a pure reducer/store action, a Vitest unit test covers the
    snapshot shape; manual verification confirms the visible cart state after add.
    `strategy:` Hybrid.

11. **Mid-session unavailability is reflected without restart.**
    If the product the customer is viewing becomes unavailable at their branch while they're on
    the screen, the UI reflects "unavailable" (blocking further add-to-cart) without requiring an
    app restart or manual navigation away/back. `proven by:` manual verification only — this
    depends on a live-data mechanism this SPEC treats as an open question (see Open Questions);
    revisit `proven by:` once that decision is made in INNOVATE/PLAN. `strategy:` Agent-Probe.

## Out Of Scope

- Full checkout flow, order placement, and order confirmation (separate future ordering-cart
  work — PRD §6.5/§6.6).
- Payment processing of any kind.
- Cart persistence strategy beyond "the cart holds correct data during the session" (see
  Constraints — this SPEC only requires a minimal, addressable cart target for add-to-cart to
  write into; whether it survives app restart is explicitly deferred).
- Cart screen UI itself (`apps/mobile/src/app/(tabs)/order/cart.tsx` review/edit/remove
  experience) beyond having somewhere correct to append to.
- Deals/Combos business rules beyond listing them as a category and showing their products (e.g.
  combo-builder logic, bundle discount math) — deferred until a Deals/Combos-specific SPEC.
- Order history, reorder, favorites.
- Push notifications or any alerting tied to availability changes.
- Search or filtering beyond category browsing (no product search bar in this SPEC).
- Any general-purpose data-fetching library adoption for surfaces other than menu/product/branch
  data (the decision made here should be scoped to what INNOVATE proposes for this feature, not
  retroactively assumed to be an app-wide library swap without separate review).

## Constraints

- Must scope every menu/product query by `branch_product_availability.is_available = true` for
  the currently selected branch AND `products.is_active = true` — both conditions, always (from
  the GitHub issue requirements, non-negotiable).
- Must respect `categories.is_active` and `categories.sort_order` for category display.
- Price must always be computed as `base_price + sum(selected option price_delta)` — no other
  pricing formula.
- Added cart items must carry a full snapshot of chosen options and computed unit price at
  add-time; later product/price changes must not mutate historical cart entries.
- **No mobile-side (RN) automated test runner exists yet** (`apps/mobile` and shared packages have
  no Jest/Vitest/Detox/Playwright — see `process/context/tests/all-tests.md` §Known Gaps). Any
  acceptance criterion whose "proven by" above names an automated Vitest test assumes that pure
  logic (pricing, filtering, cart snapshot) is extracted into a testable function/package — if
  INNOVATE/PLAN instead keeps that logic inline in a component, the criterion falls back to
  Agent-Probe only and the test-runner gap becomes a tracked Known-Gap, not a silent downgrade.
- **No e2e/navigation harness exists yet** (Detox/Maestro/Playwright) — criteria that depend on
  cross-screen behavior (branch switch → menu refresh, product-detail live-unavailability) are
  Agent-Probe/manual until that harness exists; this SPEC does not mandate building the harness,
  but the gap must be carried forward, not silently dropped.
- Must reuse `@jojopotato/ui` shared components (`ProductCard`, `Badge`, `Button`, etc.) per
  existing project convention — no one-off screen markup duplicating shared component behavior.
- Existing `packages/types/src/menu.ts` and `packages/types/src/cart.ts` shapes are stale
  (`priceCents` vs. DB's `base_price`, no option/snapshot fields) and will need updating to match
  real data — this SPEC requires the final types to represent the DB shape accurately, but does
  not prescribe how.

## Open Questions

Each of these must be resolved by INNOVATE (not this SPEC) before PLAN can lock an approach.
Under an interactive session these block progression; under `/goal` they are recorded as backlog
notes and the run continues.

1. **Required-option-group semantics** — Owner: INNOVATE. The DB schema (`product_options`) has
   no `is_required` (or group-level required) column today. Is "required" inferred by convention
   (e.g. any product with `flavor`-type options requires a selection), or does this feature need a
   schema addition? This directly affects AC8/AC9 and needs a decision before implementation.
2. **Selected-branch state ownership** — Owner: INNOVATE. No app-wide "selected branch" state
   exists (Home's branch selector is local-only, hardcoded to a mock branch). Where should this
   live — a new context, a lightweight store, or an extension of an existing pattern? Note this is
   very likely also needed by Branches, Checkout, and Rewards later, not just this feature — the
   answer should not be menu-specific if avoidable.
3. **Cart state scope** — Owner: INNOVATE. Is an in-memory-only cart sufficient for this phase, or
   does even this minimal stub need some persistence (e.g. `expo-secure-store`/async-storage) so a
   cart survives an accidental app backgrounding? This SPEC intentionally does not resolve this —
   only that add-to-cart must write into something real and correctly snapshotted (see AC10,
   Out Of Scope).
4. **Data-fetching pattern** — Owner: INNOVATE. No client-side data-fetching convention exists
   anywhere in the app yet (Home uses local mock data only), and `packages/api` has no route layer
   beyond better-auth. Does this feature introduce the first pattern (raw fetch wrapper vs. a
   library like React Query), and if so, is that decision scoped to menu/product data only or
   intended as the app's general pattern going forward? This is a first-mover, cross-cutting
   decision that INNOVATE should treat carefully since other features (e.g. Coupon Wallet, per
   research) hit the identical gap.

## Background / Research Findings

- **Current state is ~0% built for both issues.** The Order tab root (`(tabs)/order/index.tsx`)
  is a bare `<ComingSoon>` placeholder; the product-details route
  (`(tabs)/order/product/[productId].tsx`) is a 2-line stub also rendering `<ComingSoon>`; the
  cart screen (`(tabs)/order/cart.tsx`) is likewise a placeholder, and there is no cart state
  (context/store) anywhere in the codebase.
- **Home tab has reusable UI patterns but they are not wired to real data or shared state.**
  `category-selector.tsx` is a chip-row selector that is explicitly local-only (code comment
  confirms selection doesn't filter anything). `product-grid.tsx` renders the shared
  `@jojopotato/ui` `ProductCard` but is backed by 100% local mock data. `ProductCard`'s "+" Add
  button is currently decorative/no-op. `branch-selector.tsx` is a local `useState` toggle that
  doesn't change any app-wide branch selection — Home is hardcoded to a single `MOCK_BRANCH`.
- **DB schema is ready for both issues with one real gap.** `categories` (sort_order, is_active),
  `products` (category_id, base_price, is_active), and `branch_product_availability` (branch_id,
  product_id, is_available, unique per branch+product) all match the ACs directly.
  `product_options` (option_type: size/flavor/add_on, price_delta, is_active, sort_order) matches
  the option-group + delta pricing model. The one gap: **no column or flag anywhere marks an
  option group as "required"** — this is Open Question 1, not something this SPEC should silently
  assume an answer to.
- **Three infra gaps block both issues and were independently found blocking a third feature**
  (Coupon Wallet, issue #25, per prior research): (1) no shared "selected branch" state anywhere
  except the per-screen local mocks described above; (2) no cart state of any kind; (3) no API
  route layer in `packages/api` beyond better-auth, and no client-side data-fetching convention
  anywhere in the mobile app (Home is 100% local mock data). These are treated in this SPEC as
  load-bearing prerequisites (see Constraints), not optional side-quests, and their concrete
  resolution is explicitly deferred to INNOVATE via Open Questions 2–4.
- **Type definitions are stale relative to the real DB shape.** `packages/types/src/menu.ts` uses
  `priceCents: number` (DB uses a numeric `base_price` string) and has no option/option-group
  shape; `MenuCategory` is missing `isActive`. `packages/types/src/cart.ts`'s `CartItem` has no
  `selectedOptions`, no computed unit price, and no snapshot fields — it cannot represent the
  AC10 requirement as-is.
- **PRD confirmation.** `docs/jojo-potato-mobile-prd.md` §6.4 matches both GitHub issues verbatim
  (category list, product fields, the Choose Fries → Choose Size → Choose Flavor → Add to Cart
  flow). PRD §16.x "Product Edge Cases" separately names "product becomes unavailable while in
  cart" and "product price changes before checkout" as known edge cases relevant to AC11 and the
  cart-snapshot requirement (AC10) — cited here as supporting context, not as new requirements
  beyond what the two issues already specify.
- **Sequencing.** MENU-002 (Product Details) is only reachable through MENU-001 (tap a product
  tile) — these are one dependent unit of work, not two independently shippable features, even
  though each issue's AC list is separately checkable above.
- **Test infra context** (`process/context/tests/all-tests.md`): no mobile-side (RN) test runner
  exists yet; verification for `apps/mobile` today means `pnpm typecheck` + `pnpm lint` + manual
  simulator verification. `packages/api` is the only package with Vitest. No e2e/navigation
  harness exists. Both gaps are carried into this SPEC's Constraints and into each acceptance
  criterion's `strategy:` annotation rather than assumed away.
