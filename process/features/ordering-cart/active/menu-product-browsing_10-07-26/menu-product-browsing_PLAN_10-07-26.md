---
name: plan:menu-product-browsing
description: "COMPLEX plan for MENU-001 (branch-scoped category menu) + MENU-002 (product options + dynamic pricing + add to cart) — Infra -> MENU-001 -> MENU-002"
date: 10-07-26
feature: ordering-cart
---

# PLAN — Menu Browsing & Product Details (MENU-001 + MENU-002)

TL;DR: Build the first real Order-tab experience — branch-scoped category menu (MENU-001) plus a
product details screen with required-option selection and live pricing (MENU-002) — on top of
three new pieces of shared plumbing (selected-branch context, in-memory cart, and the app's first
data-fetching layer via TanStack Query + two new Express routes). Sequenced Infra → MENU-001 →
MENU-002 per the locked INNOVATE decision. Touches 5 packages, ~32 files, no schema migration, no
auth/billing surface.

**Date**: 10-07-26
**Status**: PLANNED
**Complexity**: COMPLEX (multi-package, phase-gated Infra -> MENU-001 -> MENU-002)

Classification: **COMPLEX** (4+ packages, new dependency, new API surface, new shared plumbing
consumed by future features).

## Phase Completion Rules

A phase (Infra / MENU-001 / MENU-002 — see Implementation Checklist Sections 1-3) is NOT complete
until:

1. **Integration Test** — the relevant Vitest/integration suites for that section pass
   (`pnpm --filter @jojopotato/utils test` for Infra pricing/options/cart logic;
   `pnpm --filter @jojopotato/api test` for the new routes).
2. **Manual Test** — the section's Acceptance Criteria are walked in the simulator
   (`pnpm ios`/`pnpm android`) per the Test Plan table below.
3. **Data Verification** — seeded DB state (categories/products/branch availability) matches what
   the section's scenario requires, confirmed via the integration tests or a direct query.
4. **Error Handling** — invalid input (bad `branchId`, missing required option) is handled
   gracefully, not just the happy path.
5. **User Confirmation** — the section is walked with the user (or the orchestrator, under
   autonomous execution) and confirmed working before the next section starts.

Status meanings: `PLANNED` (not started) -> `IN PROGRESS` (checklist items being executed) ->
`CODE DONE` (all files written, typecheck/lint green, tests not yet all run) -> `VERIFIED` (all 5
Phase Completion Rules above satisfied for that section). A section may not be marked `VERIFIED`
until `pnpm typecheck` + `pnpm lint` are green AND all in-blast-radius automated/hybrid gates in
the Test Plan table are green.

## Overview / Goals

- **MENU-001** (GitHub #15): show the menu organized by category, scoped to the customer's
  currently selected branch, with automatic refresh on branch switch and explicit empty states.
- **MENU-002** (GitHub #16): tapping a product opens a details screen where the customer picks
  required/optional options, sees the price update live, and adds a correctly-snapshotted item to
  the cart — blocked with an inline message if a required choice is missing, and reflecting
  mid-session unavailability without a restart.
- Establish three pieces of shared plumbing this and future ordering-cart work depend on:
  selected-branch state, a minimal in-memory cart, and the app's first client-side data-fetching
  pattern (TanStack Query) backed by two new `packages/api` routes.
- P0, launch-blocking. Ties to SPEC `menu-product-browsing_SPEC_10-07-26.md` (read in full before
  touching this plan) and PRD §6.4/§16.x.

## Scope

**In scope:** everything in SPEC Acceptance Criteria 1–11 (both screens), the three infra
prerequisites named above, and the mechanical type-rewrite fallout in `packages/types` +
`apps/mobile/src/features/home` (plus two additional stale consumer files found during VALIDATE —
see Touchpoints) needed to keep the app compiling once `menu.ts`/`cart.ts` are rewritten to match
the real DB shape (Home stays 100% mock-data-driven — only its type conformance changes, not its
behavior).

**Out of scope (mirrors SPEC Out Of Scope verbatim):** full checkout/order placement, payment
processing, cart persistence beyond in-session correctness, the Cart screen's own review/edit/
remove UI, Deals/Combos business rules beyond category listing, order history/reorder/favorites,
push notifications, search/filtering, and any app-wide data-fetching library mandate beyond
menu/branch/product data.

## INNOVATE Decisions Carried Forward (locked — do not re-decide)

1. Required-option-group semantics: convention-based — any product with `flavor`-type options
   requires a selection; `size`-type is also required when present; `add_on` is always optional.
   No schema change.
2. Selected-branch state: new `apps/mobile/src/features/branch/hooks/use-branch.ts`
   (`BranchProvider`/`useBranch()`), wired into root `_layout.tsx`, persisted via
   `expo-secure-store` (mirrors `use-auth.ts`).
3. Cart state: new `apps/mobile/src/features/cart/` — Context + reducer, in-memory only, cart
   items carry a full options + computed-price snapshot at add-time.
4. Data-fetching: introduce `@tanstack/react-query`, scoped to menu/branch/product data only. New
   `packages/api/src/routes/menu.ts` + `routes/branches.ts`, server-side branch/active filtering,
   server validates `branchId` against the active branches list.
5. Mid-session unavailability: TanStack Query `refetchOnFocus` + a `refetchInterval` (~15–30s)
   while Product Details is mounted.
6. Type reconciliation: rewrite `packages/types/src/menu.ts` and `cart.ts` now, to match the real
   DB schema shape.
7. UI convention: option groups are visually labeled "Required"/"Optional" since the rule has no
   schema backing.

## Scope Decision Made In This Plan (not previously resolved by INNOVATE)

**Where does branch selection actually happen?** Neither Home nor the Branches tab has a real
branch switcher yet (Home's `branch-selector.tsx` toggles local-only visual state; Branches tab is
still a `<ComingSoon>` placeholder). AC3 requires the menu to update when the branch changes
"anywhere in the app." Rather than wait on a separate Branches-tab feature, this plan adds one
small, self-contained branch-switcher chip row directly inside the new Order tab screen
(`apps/mobile/src/features/menu/components/branch-switcher.tsx`), backed by the same
`useBranch()`/`BranchProvider` that any future screen (Home, Branches tab, Checkout) will also
consume. This keeps the blast radius inside `order/` — Home and the Branches tab are **not**
touched. `BranchProvider` defaults to the first `is_active` branch from `GET /api/branches` on
first load if nothing is persisted yet.

## Touchpoints

### Infra (shared plumbing — required by both MENU-001 and MENU-002)

| File | Action | Purpose |
|---|---|---|
| `packages/types/src/menu.ts` | MODIFY (rewrite) | `Category`, `Product`, `ProductOption`, `ProductOptionType`, `ProductDetail`, `MenuResponse` — matches real DB shape (`base_price` parsed to `number`, no more `priceCents`) |
| `packages/types/src/cart.ts` | MODIFY (rewrite) | `CartSelectedOption`, `CartItem` (full snapshot), `Cart`, `CartAction` |
| `packages/types/src/pickup.ts` | MODIFY (extend) | Extend `PickupBranch` with `slug`, `phone`, `openingHours`, `isActive`, `isAcceptingPickup`, `estimatedPrepMinutes` — additive/optional fields only, so existing `MOCK_BRANCH` and `BranchCard`/`BranchSelector` usages keep compiling unchanged |
| `packages/utils/package.json` | MODIFY | Add `vitest` devDependency + `"test": "vitest run"` script (mirrors `packages/api`) — this is the first test runner for `packages/utils` |
| `packages/utils/vitest.config.ts` | CREATE | Minimal vitest config (node environment, no DB dependency — these are pure functions) |
| `packages/utils/src/pricing.ts` | CREATE | `parsePriceString(value: string): number`, `computeUnitPrice(basePrice: number, selectedDeltas: number[]): number` — pure, AC7 |
| `packages/utils/src/product-options.ts` | CREATE | `getRequiredOptionTypes(options: ProductOption[]): ProductOptionType[]`, `isRequiredSelectionComplete(options, selectedByType): boolean` — pure, AC8/AC9 |
| `packages/utils/src/cart.ts` | CREATE | `cartReducer`, `buildCartItemSnapshot(product, selectedOptions, unitPrice)`, `initialCartState` — pure, AC10 |
| `packages/utils/src/currency.ts` | MODIFY | Add `formatPricePHP(amount: number): string` (whole-currency-unit formatter for `base_price`, distinct from the existing cents-based `formatCurrency`) |
| `packages/utils/src/index.ts` | MODIFY | Export `pricing`, `product-options`, `cart` |
| `packages/utils/src/__tests__/pricing.test.ts` | CREATE | Table-driven Vitest coverage for AC7 |
| `packages/utils/src/__tests__/product-options.test.ts` | CREATE | Vitest coverage for AC8/AC9 required-group boolean |
| `packages/utils/src/__tests__/cart.test.ts` | CREATE | Vitest coverage for AC10 snapshot correctness (later product/price changes must not mutate existing entries) |
| `packages/api/src/routes/branches.ts` | CREATE | `express.Router()` — `GET /api/branches` (active branches only) |
| `packages/api/src/routes/menu.ts` | CREATE | `express.Router()` — `GET /api/menu?branchId=`, `GET /api/menu/products/:productId?branchId=`; validates `branchId` against active branches before querying |
| `packages/api/src/index.ts` | MODIFY | Mount `branchesRouter` and `menuRouter` **after** the existing `express.json()` call, **without** disturbing the existing `/api/auth/*` mount order |
| `packages/api/src/routes/__tests__/branches.integration.test.ts` | CREATE | Integration test against local Postgres (mirrors `auth.integration.test.ts` pattern) — AC1/AC2 supporting evidence |
| `packages/api/src/routes/__tests__/menu.integration.test.ts` | CREATE | Integration test: mixed active/inactive categories + non-sequential `sort_order`, branch-availability mismatch in both directions, `branchId` validation rejection, and a product flipped to unavailable mid-test (AC11 API-layer evidence) |
| `packages/api/src/db/seed/data.ts` | MODIFY (verify/extend) | Confirm seed data already covers: an empty category for at least one branch (AC4), a product with a required `flavor` group (AC7/AC8/AC9), and an inactive category/product pair (AC1/AC2). Extend only if a scenario is missing — do not restructure existing seed data. |
| `apps/mobile/package.json` | MODIFY | Add `@tanstack/react-query` dependency |
| `apps/mobile/src/lib/query-client.ts` | CREATE | Shared `QueryClient` instance — default `refetchOnFocus: true`, sane `staleTime` for menu/branch queries |
| `apps/mobile/src/lib/api-client.ts` | CREATE | Typed fetch wrapper for `{env.apiUrl}/api/menu`, `/api/menu/products/:id`, `/api/branches` (reuses the `ngrok-skip-browser-warning` header pattern from `auth-client.ts`) |
| `apps/mobile/src/app/_layout.tsx` | MODIFY | Wrap `RootNavigator` in `QueryClientProvider` (outermost) → `AuthProvider` → `BranchProvider` → `CartProvider`, mirroring the existing `AuthProvider` wiring pattern |
| `apps/mobile/src/features/branch/hooks/use-branch.ts` | CREATE | `BranchProvider`/`useBranch()` — `{ selectedBranch, setSelectedBranch, branches, isLoading }`; fetches branches via React Query, persists selection via `expo-secure-store`, defaults to first active branch |
| `apps/mobile/src/features/cart/hooks/use-cart.ts` | CREATE | `CartProvider`/`useCart()` wrapping `useReducer(cartReducer, initialCartState)` from `@jojopotato/utils` — `{ cart, addItem }` |
| `apps/mobile/src/features/home/mock-home.ts` | MODIFY (mechanical) | Update `MOCK_CATEGORIES`/`MOCK_PRODUCTS` to the new `Category`/`Product` shape (rename `priceCents` → `basePrice`, `categoryId` stays, add `slug`/`isActive`/`isRewardEligible` placeholders) — **no behavior change**, compile-fix only |
| `apps/mobile/src/features/home/components/category-selector.tsx` | MODIFY (mechanical) | Update prop typing for the new `Category` shape (`category.id`/`.name` unchanged; drop reliance on any removed field) |
| `apps/mobile/src/features/home/components/product-grid.tsx` | MODIFY (mechanical) | Update prop typing for the new `Product` shape |
| `packages/ui/src/components/product-card.tsx` | MODIFY (mechanical + reused) | Update to consume `Product` (`basePrice: number` via `formatPricePHP`, not `priceCents`/`formatCurrency`); `isAvailable` prop passed explicitly by caller instead of read off the item (menu-context products are always available since the server already filtered; Home's mock data passes `true`/`false` as before) |
| `apps/mobile/src/features/home/components/product-card.tsx` | MODIFY (mechanical) or DELETE | **[Found during VALIDATE — not in original scope list]** Orphaned local `ProductCard` duplicate of the shared `packages/ui` component (no import site found anywhere under `apps/mobile/src` — grep-verified). It still imports `MenuItem` from `@jojopotato/types` and will fail `pnpm typecheck` once `menu.ts` is rewritten. Since `apps/mobile/src/features/home/components/product-grid.tsx` already renders via the shared `@jojopotato/ui` `ProductCard` (per the "always use shared `@jojopotato/ui`" convention), prefer **DELETE** over updating a dead duplicate; if execute-agent finds a live import site was missed, update it to the new `Product` shape instead of deleting. |
| `apps/mobile/src/app/component-showcase.tsx` | MODIFY (mechanical) | **[Found during VALIDATE — not in original scope list]** Dev component-showcase route imports `MenuItem`/`CartItem` from `@jojopotato/types` and constructs `SAMPLE_PRODUCT`, `SAMPLE_PRODUCT_SOLD_OUT`, `SAMPLE_CART_ITEM` fixtures rendered through `packages/ui`'s `ProductCard`/`CartItem`. Update these three fixtures to the new `Product`/`CartItem` shapes so the showcase route keeps compiling — no visual/behavioral change intended. |

### MENU-001 (category menu, branch-scoped)

| File | Action | Purpose |
|---|---|---|
| `apps/mobile/src/features/menu/hooks/use-menu.ts` | CREATE | `useQuery(['menu', selectedBranch?.id], ...)` — fetches `GET /api/menu?branchId=`, disabled until a branch is selected |
| `apps/mobile/src/features/menu/components/branch-switcher.tsx` | CREATE | Small chip row using `useBranch()` — see "Scope Decision" above |
| `apps/mobile/src/features/menu/components/category-section.tsx` | CREATE | Category header + `ProductGrid` (reused from Home's pattern, generalized) or a menu-local grid using the shared `ProductCard`; renders the empty-state message when `products.length === 0` |
| `apps/mobile/src/app/(tabs)/order/index.tsx` | MODIFY | Replace `<ComingSoon>` with the real menu screen: `BranchSwitcher` + `useMenu()` + list of `CategorySection`; loading/error states; navigates to Product Details on tap (remove the now-superseded "Dev: View Product 123" link, keep "Dev: View Cart"/"Dev: Order History" since Cart/History are still placeholders) |

### MENU-002 (product details, options, pricing, add to cart)

| File | Action | Purpose |
|---|---|---|
| `apps/mobile/src/features/menu/hooks/use-product-details.ts` | CREATE | `useQuery(['product', productId, selectedBranch?.id], ...)` — fetches `GET /api/menu/products/:id?branchId=`, `refetchOnFocus: true`, `refetchInterval: 20_000` while mounted (AC11) |
| `apps/mobile/src/features/menu/lib/group-options.ts` | CREATE | Pure grouping helper: flat `ProductOption[]` → `{ type, options }[]`, sorted by `sort_order` (display-only helper, not test-gated — see Test Plan) |
| `apps/mobile/src/features/menu/components/option-group-selector.tsx` | CREATE | Renders one option group: label + `Badge` ("Required"/"Optional" per INNOVATE #7) + the matching selector (`FlavorSelector` for `flavor`, `SizeSelector` for `size`, new `AddOnSelector` for `add_on`). **[Found during VALIDATE]** `FlavorSelector` expects `Flavor[]` (`{id, name}`) and `SizeSelector` expects `Size[]` (`{id, label}`) — neither is directly assignable from `ProductOption[]` (`{id, productId, optionType, name, priceDelta, isActive, sortOrder}`). This component must map each option-group's `ProductOption[]` into the target shape before rendering (e.g. `options.map(o => ({ id: o.id, name: o.name }))` for flavor, `options.map(o => ({ id: o.id, label: o.name }))` for size) — do not assume the existing selectors accept `ProductOption[]` directly. |
| `packages/ui/src/components/addon-selector.tsx` | CREATE | New shared component — multi-select toggle chip row for `add_on` options (no existing shared component covers multi-select; `FlavorSelector`/`SizeSelector` are single-select) |
| `packages/ui/src/index.ts` | MODIFY | Export `addon-selector` |
| `apps/mobile/src/features/menu/components/add-to-cart-bar.tsx` | CREATE | Sticky bottom bar: live computed price (`computeUnitPrice`), `Button` ("Add to Cart", disabled until `isRequiredSelectionComplete`), inline validation message on blocked attempt (AC9), "unavailable" state when `useProductDetails()` reports `isAvailable: false` (AC11) |
| `apps/mobile/src/app/(tabs)/order/product/[productId].tsx` | MODIFY | Replace the 2-line `<ComingSoon>` stub with the real screen: `useProductDetails()` + name/description/photo/base price + one `OptionGroupSelector` per group + `AddToCartBar`; on successful add, calls `useCart().addItem(buildCartItemSnapshot(...))` and navigates back or shows a brief confirmation |

## Public Contracts

### `GET /api/branches`

Response `200`:
```
{ branches: [{ id, name, slug, address, latitude, longitude, phone, openingHours, isActive, isAcceptingPickup, estimatedPrepMinutes }] }
```
Only `is_active = true` branches are returned.

### `GET /api/menu?branchId=<uuid>`

- `400` if `branchId` is missing or does not match an existing **active** branch (security
  follow-up from INNOVATE — never trust an arbitrary client-supplied ID).
- `200`:
```
{
  categories: [
    {
      id, name, slug, sortOrder, isActive,
      products: [
        { id, categoryId, name, slug, description, imageUrl, basePrice, isActive, isRewardEligible }
      ]
    }
  ]
}
```
- Categories are `WHERE is_active = true ORDER BY sort_order`. Products are joined against
  `branch_product_availability` for the given `branchId` (`is_available = true`) AND
  `products.is_active = true`. A category with zero matching products is still returned with an
  empty `products` array (client renders the empty state — server does not omit categories).

### `GET /api/menu/products/:productId?branchId=<uuid>`

- `400` for invalid/inactive `branchId` (same validation as above). `404` if `productId` doesn't
  exist or isn't active.
- `200`:
```
{
  id, categoryId, name, slug, description, imageUrl, basePrice, isActive, isRewardEligible,
  isAvailable, // computed: is_active AND exists in branch_product_availability(branchId) with is_available = true
  options: [{ id, productId, optionType, name, priceDelta, isActive, sortOrder }]
}
```
Only `is_active = true` options are included, sorted by `sort_order`.

### `useBranch()` / `BranchProvider`

```
{ selectedBranch: Branch | null, setSelectedBranch: (branch: Branch) => void, branches: Branch[], isLoading: boolean }
```
Persists `selectedBranch.id` via `expo-secure-store` under a `jojopotato.selectedBranchId` key;
resolves against the live `branches` list on load (falls back to the first active branch if the
persisted id no longer exists/isn't active).

### `useCart()` / `CartProvider`

```
{ cart: Cart, addItem: (item: CartItem) => void }
```
`Cart = { items: CartItem[] }`. In-memory only this phase (no persistence — matches SPEC Out Of
Scope). `CartItem` carries `unitPrice` and `selectedOptions` as a frozen snapshot at add-time.

## Blast Radius

- **Packages touched:** `apps/mobile`, `packages/api`, `packages/types`, `packages/utils`,
  `packages/ui` (5 of the repo's 5 non-config workspace packages).
- **Risk class:** none of auth/identity, billing/credits, schema/data-migration, public API
  contract for existing consumers, deploy/runtime, or secrets/trust-boundary. The two new API
  routes are net-new surface (no existing consumer to break) and read-only (`GET` only, no
  mutation of persisted state beyond an in-memory client cart). **No DB migration required** — all
  tables (`categories`, `products`, `product_options`, `branch_product_availability`, `branches`)
  already exist from the `db-schema` plan (confirmed against
  `packages/api/drizzle/0000_puzzling_lightspeed.sql` during VALIDATE — all five tables are
  present in the initial migration; `0001_daily_carnage.sql` only adds better-auth's
  `session`/`account`/`verification` tables and is unrelated).
- **File count:** ~32 files (15 CREATE + rewrite/MODIFY across Infra, 4 CREATE/MODIFY for
  MENU-001, 8 CREATE/MODIFY for MENU-002).
- **New dependency:** `@tanstack/react-query` in `apps/mobile` only (per SPEC Out Of Scope — not
  an app-wide mandate).
- **New test runner:** `vitest` added to `packages/utils` (net-new for that package; `packages/api`
  already has it).

## Implementation Checklist

### Section 1 — Infra (shared plumbing)

1. Rewrite `packages/types/src/menu.ts`: `ProductOptionType`, `ProductOption`, `Product`,
   `Category`, `ProductDetail`, `MenuResponse`.
2. Rewrite `packages/types/src/cart.ts`: `CartSelectedOption`, `CartItem`, `Cart`, `CartAction`
   (discriminated union — at minimum `{ type: 'ADD_ITEM'; item: CartItem }`).
3. Extend `packages/types/src/pickup.ts`'s `PickupBranch` additively (new optional fields only);
   confirm `apps/mobile/src/features/home/mock-home.ts`'s `MOCK_BRANCH` still typechecks unchanged.
4. Add `vitest` + `"test": "vitest run"` to `packages/utils/package.json`; add
   `packages/utils/vitest.config.ts` (node environment, no DB — copy the shape of any non-DB
   vitest config convention used elsewhere in the repo, or a minimal `defineConfig({ test: {} })`).
5. Implement `packages/utils/src/pricing.ts` (`parsePriceString`, `computeUnitPrice`) with Vitest
   coverage in `__tests__/pricing.test.ts` — table-driven: single option, multiple option groups,
   zero-delta options, no options selected.
6. Implement `packages/utils/src/product-options.ts` (`getRequiredOptionTypes`,
   `isRequiredSelectionComplete`) with Vitest coverage — covers a flavor-required product, a
   size+flavor-required product, and an add-on-only (nothing required) product.
7. Implement `packages/utils/src/cart.ts` (`cartReducer`, `buildCartItemSnapshot`,
   `initialCartState`) with Vitest coverage — asserts a later mutation to the source product/price
   does NOT retroactively change an already-added `CartItem`.
8. Add `formatPricePHP` to `packages/utils/src/currency.ts`; export new modules from
   `packages/utils/src/index.ts`.
9. Run `pnpm --filter @jojopotato/utils test` — confirm all new Vitest suites pass before moving on.
10. Create `packages/api/src/routes/branches.ts` (`GET /api/branches`, active-only).
11. Create `packages/api/src/routes/menu.ts` (`GET /api/menu`, `GET /api/menu/products/:id`) —
    both validate `branchId` against the active branches list before querying; both use `db` from
    `packages/api/src/db/client.ts` and the schema exports from `packages/api/src/db/schema`. Note:
    Drizzle column definitions in this repo are snake_case (`base_price`, `is_active`, etc.) —
    both routes must explicitly map query results to the camelCase Public Contract shape
    (`basePrice`, `isActive`, …), not return raw row objects.
12. Mount both routers in `packages/api/src/index.ts` **after** `app.use(express.json())`, without
    reordering the existing `/api/auth/*splat` mount.
13. Write `packages/api/src/routes/__tests__/branches.integration.test.ts` and
    `menu.integration.test.ts` (mirror `src/lib/__tests__/auth.integration.test.ts`'s local-Postgres
    integration pattern — `docker compose up -d` + `db:migrate` precondition). Cover: active-only
    branch filtering; mixed active/inactive categories with non-sequential `sort_order`; both
    availability-mismatch directions (available-at-branch-but-globally-inactive,
    globally-active-but-not-available-here); invalid/inactive `branchId` → `400`; a product whose
    `branch_product_availability.is_available` flips to `false` mid-test → subsequent
    `GET /api/menu/products/:id` returns `isAvailable: false`.
14. Verify `packages/api/src/db/seed/data.ts` already covers: an empty-category-at-a-branch
    scenario, a required-flavor product, and an inactive category/product pair. Extend the seed
    data only if a scenario is genuinely missing (do not restructure existing rows).
15. Add `@tanstack/react-query` to `apps/mobile/package.json`; run `pnpm install`.
16. Create `apps/mobile/src/lib/query-client.ts` (shared `QueryClient`, `refetchOnFocus: true`
    default).
17. Create `apps/mobile/src/lib/api-client.ts` (typed fetch wrapper — `getBranches()`, `getMenu(branchId)`,
    `getProductDetails(productId, branchId)` — using `env.apiUrl` and the `ngrok-skip-browser-warning`
    header, mirroring `auth-client.ts`'s pattern).
18. Create `apps/mobile/src/features/branch/hooks/use-branch.ts` (`BranchProvider`/`useBranch()`).
19. Create `apps/mobile/src/features/cart/hooks/use-cart.ts` (`CartProvider`/`useCart()`).
20. Wire `QueryClientProvider` → `AuthProvider` → `BranchProvider` → `CartProvider` into
    `apps/mobile/src/app/_layout.tsx`, preserving the existing font-loading/splash-screen logic.
21. Fix mechanical compile fallout: `apps/mobile/src/features/home/mock-home.ts`,
    `category-selector.tsx`, `product-grid.tsx`, `packages/ui/src/components/product-card.tsx` —
    update to the new `Category`/`Product` shape. **No visual or behavioral change to Home.**
    Also fix the two additional stale consumers found during VALIDATE:
    `apps/mobile/src/features/home/components/product-card.tsx` (delete — dead/orphaned, no
    import site found; update instead only if execute-agent finds a live import was missed) and
    `apps/mobile/src/app/component-showcase.tsx` (update `SAMPLE_PRODUCT`/
    `SAMPLE_PRODUCT_SOLD_OUT`/`SAMPLE_CART_ITEM` fixtures to the new shapes).
22. Run `pnpm typecheck` and `pnpm lint` across the whole repo — confirm zero errors before
    starting Section 2.

### Section 2 — MENU-001 (category menu)

23. Create `apps/mobile/src/features/menu/hooks/use-menu.ts` (branch-keyed `useQuery`, disabled
    until `selectedBranch` is set).
24. Create `apps/mobile/src/features/menu/components/branch-switcher.tsx` (reads/writes
    `useBranch()`).
25. Create `apps/mobile/src/features/menu/components/category-section.tsx` (category header +
    product grid using the shared, now-fixed `ProductCard`; explicit empty-state message when a
    category's `products` array is empty — AC4).
26. Rewrite `apps/mobile/src/app/(tabs)/order/index.tsx`: `BranchSwitcher` + loading/error states
    for `useMenu()` + a list of `CategorySection`s; tapping a product navigates to
    `/(tabs)/order/product/[productId]`; remove the superseded "Dev: View Product 123" link.
27. Manual verification pass (`pnpm ios`/`pnpm android`) against seeded data: AC1 (active-only,
    correct order), AC2 (branch-availability filtering both directions), AC3 (branch switch
    refresh), AC4 (empty category), AC5 (tap navigates).
28. Run `pnpm typecheck` + `pnpm lint` for `apps/mobile` — confirm green before Section 3.

### Section 3 — MENU-002 (product details + pricing + cart)

29. Create `apps/mobile/src/features/menu/hooks/use-product-details.ts` (`refetchOnFocus` +
    20s `refetchInterval` while mounted).
30. Create `apps/mobile/src/features/menu/lib/group-options.ts` (pure grouping helper — no test
    gate, display-only; see Test Plan for rationale).
31. Create `packages/ui/src/components/addon-selector.tsx` (multi-select chip row); export from
    `packages/ui/src/index.ts`.
32. Create `apps/mobile/src/features/menu/components/option-group-selector.tsx` (label + Required/
    Optional `Badge` + the matching selector per `optionType`). Map each group's `ProductOption[]`
    into the shape `FlavorSelector`/`SizeSelector` expect (`{id, name}` / `{id, label}`) before
    rendering — these components do not accept `ProductOption[]` directly (see Touchpoints note).
33. Create `apps/mobile/src/features/menu/components/add-to-cart-bar.tsx` (live price via
    `computeUnitPrice`, disabled/enabled `Button` via `isRequiredSelectionComplete`, inline
    blocked-attempt message, "unavailable" state).
34. Rewrite `apps/mobile/src/app/(tabs)/order/product/[productId].tsx`: real screen wiring
    `useProductDetails()`, the option groups, and `AddToCartBar`; on successful add, call
    `useCart().addItem(buildCartItemSnapshot(...))`.
35. Manual verification pass against seeded data: AC6 (core info renders), AC7 (price delta math,
    including a multi-group combo), AC8 (disabled until required groups filled), AC9 (blocked
    attempt shows inline message), AC10 (cart append snapshot — confirm a later mock price/option
    edit does not retroactively change the already-added item), AC11 (flip
    `branch_product_availability.is_available` for the viewed product mid-session via a direct DB
    update or the seed script, confirm the screen reflects "unavailable" without restart within
    the ~20s poll window).
36. Final full-repo `pnpm typecheck` + `pnpm lint` pass.

## Test Plan (SPEC AC → Verification Evidence)

| AC | Criterion | `proven by:` | `strategy:` |
|---|---|---|---|
| AC1 | Only active categories, correct order | `menu.integration.test.ts` (API-layer query correctness: mixed active/inactive + non-sequential sort_order) + manual sim walk | **Hybrid** (upgraded from SPEC's Agent-Probe-only — API layer is now automatable; UI rendering itself stays manual — mobile RN runner Known-Gap carried forward) |
| AC2 | Only branch-available products (both mismatch directions) | `menu.integration.test.ts` (both directions seeded and asserted) + manual verification | **Hybrid** |
| AC3 | Branch switch refreshes menu | Manual verification (switch via `BranchSwitcher`, confirm menu content changes) | **Agent-Probe** (Known-Gap: no e2e/navigation harness — carried from SPEC) |
| AC4 | Empty category shows explicit empty state | Manual verification with a seeded zero-product branch/category combo | **Agent-Probe** |
| AC5 | Tapping a product opens Product Details | Manual verification of the nav hop + `pnpm typecheck` (typed route param) | **Hybrid** |
| AC6 | Product Details renders core info | Manual verification against seeded product data | **Agent-Probe** |
| AC7 | Option selection updates price by exact delta | `pricing.test.ts` (table-driven: single option, multi-group, zero-delta) + manual re-render confirmation | **Hybrid** |
| AC8 | Add to Cart disabled until required groups filled | `product-options.test.ts` (`isRequiredSelectionComplete` boolean) + manual verification | **Hybrid** |
| AC9 | Blocked attempt shows inline message | Manual verification triggering the blocked path | **Agent-Probe** |
| AC10 | Add to cart appends correctly-snapshotted item, immune to later mutation | `cart.test.ts` (`buildCartItemSnapshot`/`cartReducer` — asserts no retroactive mutation) + manual visible-cart-state confirmation | **Hybrid** |
| AC11 | Mid-session unavailability reflected without restart | `menu.integration.test.ts` (API contract: `isAvailable` flips after DB update) + manual verification of the client poll/refetchOnFocus behavior | **Hybrid at API layer / Agent-Probe at UI layer** (Known-Gap: no e2e harness to automate the live-poll UI assertion) |

Every `Hybrid` row's precondition: local Postgres running (`docker compose up -d` + `db:migrate`),
same as `auth.integration.test.ts` already requires — no new infra pattern introduced.

**Missing/Known-Gap areas carried forward (not newly introduced by this plan):**
- No mobile-side (RN) automated component/screen test runner — every UI-rendering assertion above
  stays Agent-Probe until that infra exists (tracked in `process/context/tests/all-tests.md` §Known
  Gaps).
- No e2e/navigation harness — AC3's cross-screen branch-switch behavior and AC11's live UI-poll
  behavior stay Agent-Probe (tracked in
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`).

**Not test-gated (display-only, no AC maps to it):** `group-options.ts`'s pure sort/group helper is
intentionally left ungated — it has no independent acceptance criterion (AC7/AC8 already cover the
downstream pricing/required-selection logic it feeds) and adding a Vitest suite for a display-order
helper is unbounded busywork relative to the SPEC. Flagged here so it is not silently invisible.

## Verification Commands

```
pnpm typecheck                                    # whole repo, tsc --noEmit via turbo
pnpm lint                                          # whole repo, eslint flat config via turbo
pnpm --filter @jojopotato/utils test               # new: vitest — pricing/product-options/cart
pnpm --filter @jojopotato/api test                 # vitest — existing + new branches/menu integration tests (needs `docker compose up -d` + `db:migrate` first)
pnpm ios   # or: pnpm android / pnpm web           # manual Agent-Probe verification pass
```

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pricing.test.ts` table-driven suite | Fully-Automated (Vitest) | AC7 |
| `product-options.test.ts` required-group suite | Fully-Automated (Vitest) | AC8, AC9 (boolean gate only — inline message itself is Agent-Probe) |
| `cart.test.ts` snapshot-immutability suite | Fully-Automated (Vitest) | AC10 |
| `menu.integration.test.ts` (category filter/order) | Hybrid (needs local Postgres) | AC1 |
| `menu.integration.test.ts` (branch availability, both directions) | Hybrid | AC2 |
| `menu.integration.test.ts` (branchId validation → 400) | Hybrid | Constraint (security follow-up) |
| `menu.integration.test.ts` (mid-test availability flip) | Hybrid | AC11 (API-layer half) |
| `branches.integration.test.ts` (active-only) | Hybrid | Public Contract (`GET /api/branches`) |
| `pnpm typecheck` (typed route param for `/product/[productId]`) | Hybrid | AC5 |
| Manual sim walk — branch switch | Agent-Probe | AC3 |
| Manual sim walk — empty category | Agent-Probe | AC4 |
| Manual sim walk — product details rendering | Agent-Probe | AC6 |
| Manual sim walk — blocked add-to-cart message | Agent-Probe | AC9 |
| Manual sim walk — live unavailability poll | Agent-Probe | AC11 (UI-layer half) |

## Test Infra Improvement Notes

- **New:** this plan adds `vitest` to `packages/utils` — the first non-`packages/api` package with
  an automated test runner. Update `process/context/tests/all-tests.md`'s Commands table and Known
  Gaps section at UPDATE PROCESS to reflect this (currently says only `packages/api` has Vitest).
- **Still open:** no mobile-side (RN) component/screen test runner exists — every screen-rendering
  assertion in this plan's Test Plan stays Agent-Probe. Not resolved by this plan; carried forward
  per SPEC Constraints.
- **Still open:** no e2e/navigation harness — see
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. AC3 and AC11's
  UI-layer half remain manual until that harness exists.

## Dependencies, Risks, Integration Notes

- **Dependency ordering:** Infra must complete and typecheck cleanly before MENU-001 starts
  (MENU-001 consumes `useBranch()`/`useMenu()`/the rewritten types); MENU-001 must complete before
  MENU-002 starts (Product Details is only reachable by tapping a product tile — SPEC confirms
  these are one dependent unit of work, not independently shippable).
- **Risk — type-rewrite fallout underestimated:** rewriting `menu.ts`/`cart.ts` breaks Home's mock
  data and consuming files. Mitigated by making Section 1 step 21 an explicit checklist item
  (now covering all 6 known stale consumers — see Touchpoints) with a `pnpm typecheck` gate
  (step 22) before Section 2 begins — do not discover this breakage mid-MENU-001.
- **Risk — required-option convention has no schema backing.** If a future product is added with a
  `flavor` option that should NOT be required, this convention silently gets it wrong. Documented
  as a known limitation of the locked INNOVATE decision, not something this plan should re-litigate.
  UI Required/Optional labels (INNOVATE #7) make the current rule visible/auditable by content
  editors, which is the agreed mitigation. This convention also has no server-side enforcement —
  acceptable for this phase because cart/order submission (the only place a violation could persist
  or be billed) is explicitly out of scope; revisit when checkout/order-placement is planned.
- **Risk — branch-switcher scope creep.** The new `branch-switcher.tsx` in Order tab could be
  mistaken for "Branches tab work." It is intentionally minimal (a chip row, no map/list/detail
  view) and touches only `features/menu/` — explicitly not extending into `(tabs)/branches/`.
- **Integration note:** `apps/mobile/src/config/env.ts` already exposes `env.apiUrl` — no new env
  var needed. The dev-tunnel/ngrok wiring already in place (per recent commits) covers reaching the
  new routes from a device during development; no changes needed there.
- **No regression risk to auth:** the new routers mount strictly after the existing
  `/api/auth/*splat` handler and after `express.json()`, matching the existing comment in
  `packages/api/src/index.ts` about mount ordering — do not reorder.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/ordering-cart/active/menu-product-browsing_10-07-26/menu-product-browsing_PLAN_10-07-26.md`
2. **Last completed phase or step:** PLAN written and VALIDATE-supplemented (2 stale-consumer
   files + 1 component-shape adapter note added) — no EXECUTE steps started yet.
3. **Validate-contract status:** PASS (see below).
4. **Supporting context files loaded during PLAN:**
   - `process/features/ordering-cart/active/menu-product-browsing_10-07-26/menu-product-browsing_SPEC_10-07-26.md`
   - `process/context/all-context.md`, `process/context/tests/all-tests.md`,
     `process/context/planning/all-planning.md`
   - Codebase scout: `packages/ui/src/index.ts` + `src/components/{product-card,flavor-selector,
     size-selector,branch-card}.tsx`, `packages/types/src/{menu,cart,pickup,flavors,sizes,order}.ts`,
     `packages/api/src/db/schema/{branches,categories,products,product_options,
     branch_product_availability}.ts`, `packages/api/src/{index,db/client}.ts`,
     `packages/api/src/db/seed/{seed,data}.ts`, `apps/mobile/src/app/_layout.tsx`,
     `apps/mobile/src/features/{auth,home}/**`, `apps/mobile/src/app/(tabs)/order/**`,
     `packages/utils/src/{currency.ts,index.ts}`, `apps/mobile/package.json`,
     `packages/{api,utils}/package.json`.
5. **Next step for a fresh agent picking up mid-execution:** VALIDATE has run (PASS). Proceed to
   EXECUTE. If resuming mid-EXECUTE, check which Implementation Checklist sections (1/2/3) have a
   green `pnpm typecheck` + `pnpm lint` + relevant `pnpm --filter ... test` run recorded in the
   phase report, and resume from the first unchecked step in the earliest incomplete section
   (Infra steps must all be green before MENU-001 steps begin; MENU-001 steps must all be green
   before MENU-002 steps begin — this is a hard sequencing rule, not a suggestion).

## Validate Contract

Status: PASS
Date: 10-07-26
date: 2026-07-10
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 7-signal score 5/7 (S1 multi-package scope, S2 no schema/auth/billing touched but new
API surface counts under S6's public-API-surface class, S4 not a phase program, S6 high-risk-class
absent — net-new read-only routes are not an existing public contract at risk, S7 5+ files in
blast radius). Dominant signal: independent dimension/section checks with no cross-agent
dependency — Layer 1 (4 dimensions) + Layer 2 (3 sections: Infra/MENU-001/MENU-002) fan out
cleanly with no inter-agent coordination needed, consistent with a HIGH-score fan-out executed as
parallel subagents rather than an agent team (no mid-run coordination was required between
dimension/section checks).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC7 | Option selection updates price by exact delta | Fully-Automated | `pnpm --filter @jojopotato/utils test` — `pricing.test.ts` table-driven suite | A |
| AC8 | Add to Cart disabled until required groups filled | Fully-Automated | `pnpm --filter @jojopotato/utils test` — `product-options.test.ts` | A |
| AC10 | Cart append is a correctly-snapshotted, immutable-after-add item | Fully-Automated | `pnpm --filter @jojopotato/utils test` — `cart.test.ts` | A |
| AC1 | Only active categories, correct order | Hybrid | `pnpm --filter @jojopotato/api test` — `menu.integration.test.ts` (category filter/order case) — precondition: local Postgres via `docker compose up -d` + `db:migrate` | A |
| AC2 | Only branch-available products, both mismatch directions | Hybrid | `pnpm --filter @jojopotato/api test` — `menu.integration.test.ts` (branch-availability case) — same precondition | A |
| Constraint (branchId security follow-up) | `branchId` validated against active branches, invalid/inactive → 400 | Hybrid | `pnpm --filter @jojopotato/api test` — `menu.integration.test.ts` (branchId validation case) — same precondition | A |
| AC11 (API half) | Mid-session availability flip reflected in API response | Hybrid | `pnpm --filter @jojopotato/api test` — `menu.integration.test.ts` (mid-test flip case) — same precondition | A |
| Public Contract `GET /api/branches` | Active-only branch listing | Hybrid | `pnpm --filter @jojopotato/api test` — `branches.integration.test.ts` — same precondition | A |
| AC5 | Typed route param contract for Product Details nav | Hybrid | `pnpm typecheck` (whole repo, catches broken/missing typed route param) | A |
| Type-rewrite fallout (all 6 stale consumers) | Whole repo compiles after `menu.ts`/`cart.ts` rewrite | Hybrid | `pnpm typecheck` + `pnpm lint` (whole repo) — checklist step 22 hard gate before Section 2 | B |
| AC3 | Branch switch refreshes menu | Agent-Probe | Manual sim walk (`pnpm ios`/`pnpm android`) — switch branch via `BranchSwitcher`, confirm menu content changes | D |
| AC4 | Empty category shows explicit empty state | Agent-Probe | Manual sim walk — seeded zero-product branch/category combo | D |
| AC6 | Product Details renders core info | Agent-Probe | Manual sim walk against seeded product data | D |
| AC9 | Blocked add-to-cart attempt shows inline message | Agent-Probe | Manual sim walk triggering the blocked path | D |
| AC11 (UI half) | Mid-session unavailability reflected in UI without restart | Agent-Probe | Manual sim walk — flip `branch_product_availability.is_available` mid-session, confirm UI updates within ~20s poll window | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue) — carried-forward
  Known-Gap: no mobile-side (RN) test runner and no e2e/navigation harness exist yet (see
  `process/context/tests/all-tests.md` §Known Gaps and
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`). These 5 rows
  are Agent-Probe by necessity, not by omission — a Fully-Automated or Hybrid gate is not currently
  possible for cross-screen/live-poll UI behavior in this repo.

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/utils` pure logic: Fully-automated: `pnpm --filter @jojopotato/utils test` (pricing/product-options/cart, AC7/AC8/AC9-boolean/AC10)
- `packages/api` new routes: Hybrid: `pnpm --filter @jojopotato/api test` + precondition `docker compose up -d && pnpm db:migrate` (AC1/AC2/AC11-API-half/branchId-validation/branches-contract)
- Whole-repo compile safety: Hybrid: `pnpm typecheck && pnpm lint` (type-rewrite fallout across all 6 stale consumers, AC5 typed-route-param)
- Mobile UI/navigation behavior: Agent-probe: manual sim walk via `pnpm ios`/`pnpm android`/`pnpm web` (AC3/AC4/AC6/AC9/AC11-UI-half)
- No known-gap rows omitted from coverage — all 5 Agent-Probe rows above are explicitly named, not silently dropped.

Dimension findings:
- Infra fit: PASS — no container/proxy/gateway surface touched; new Express routes mount after
  `express.json()` without disturbing the existing `/api/auth/*splat` order; `env.apiUrl` already
  exists, no new env var needed; new `@tanstack/react-query` dependency is correctly scoped to
  `apps/mobile` only, matching SPEC Out Of Scope (not an app-wide mandate).
- Test coverage: PASS — Test Plan tier assignments (Hybrid/Agent-Probe/Known-Gap) correctly and
  honestly reflect `process/context/tests/all-tests.md`'s actual constraints (no mobile RN runner,
  no e2e harness); no criterion is overclaimed as automated when it isn't.
- Breaking changes: PASS (fixed in plan) — confirmed no DB migration is required by reading the
  actual schema files and the `0000_puzzling_lightspeed.sql` migration directly (all 5 tables
  present). Found 2 additional stale `@jojopotato/types` consumer files
  (`apps/mobile/src/features/home/components/product-card.tsx`,
  `apps/mobile/src/app/component-showcase.tsx`) not in the original Touchpoints/Checklist scope —
  both now added to the plan (Touchpoints table + checklist step 21) so the mandatory step-22
  typecheck gate has a complete file list instead of relying on discovery-by-failure.
- Security surface: PASS — `branchId` validation against the active branches list (the INNOVATE
  security follow-up) is implemented, not just mentioned: it's in the Public Contracts (400
  response), Implementation Checklist (step 11), and Test Plan (step 13 + a dedicated
  `menu.integration.test.ts` case). No auth/billing/secrets surface touched. The required-option
  convention's lack of server-side enforcement is honestly disclosed as a locked, accepted
  INNOVATE decision with no exploitable persistence/billing risk in this phase (no checkout exists
  yet) — correctly not re-litigated here.
- Section A feasibility (Infra): PASS (fixed in plan) — mechanical feasibility HIGH (all CREATE
  targets absent, all MODIFY targets present and grep-verified); gap found (2 missing touchpoint
  files) is now closed via plan update; no conflicts with repo conventions.
- Section B feasibility (MENU-001): PASS — `order/index.tsx`'s exact current dev-link content
  verified (3 links; checklist step 26 correctly says remove 1, keep 2); `product/[productId].tsx`
  verified as the exact 2-line `ComingSoon` stub described. No gaps or conflicts found.
- Section C feasibility (MENU-002): PASS (fixed in plan) — mechanical feasibility gap found
  (`FlavorSelector`/`SizeSelector` do not accept `ProductOption[]` directly; shape mismatch
  confirmed by reading `flavors.ts`/`sizes.ts`) is now closed via an explicit adapter-mapping note
  added to Touchpoints and checklist step 32. `Badge` component confirmed to support the
  Required/Optional label rendering as described.

Open gaps: none blocking. Carried-forward known-gaps (not new to this plan): no mobile-side (RN)
test runner, no e2e/navigation harness — both already tracked in
`process/context/tests/all-tests.md` §Known Gaps and the existing backlog note; this plan does not
resolve them and correctly does not claim to.

What this coverage does NOT prove:
- `pricing.test.ts`/`product-options.test.ts`/`cart.test.ts` prove pure-function correctness only —
  they do not prove the UI actually calls these functions correctly or re-renders on state change
  (that's the Agent-Probe manual pass).
- `menu.integration.test.ts`/`branches.integration.test.ts` prove API-layer contract correctness
  against a real local Postgres — they do not prove the mobile client correctly parses/displays
  the response, correctly triggers `refetchOnFocus`/`refetchInterval`, or correctly persists the
  selected branch via `expo-secure-store` (all Agent-Probe territory).
- `pnpm typecheck`/`pnpm lint` prove structural/type correctness across the whole repo — they do
  not prove runtime behavior, navigation correctness, or visual layout.
- None of the automated/hybrid gates prove AC3 (branch-switch cross-screen refresh) or the AC11
  UI-poll half — these remain fully dependent on the manual sim walk until an e2e harness exists.
- No gate proves the required-option-group convention stays correct as new products are added in
  the future (no schema backstop) — this is a standing, disclosed limitation of the locked
  INNOVATE decision, not something any test in this plan can catch.

Gate: PASS (no FAILs, plan updated — 2 concerns found during VALIDATE were fixed directly in the
plan text rather than deferred)
Accepted by: N/A — Gate is PASS; no unresolved concerns required acceptance (the 2 CONCERNs found during VALIDATE were fixed directly in the plan text, not deferred)

## Autonomous Goal Block

SESSION GOAL: Ship MENU-001 (branch-scoped category menu) + MENU-002 (product details, options, live pricing, add to cart) — Infra -> MENU-001 -> MENU-002
Charter + umbrella plan: N/A — single plan (not a phase program)
Autonomy: per feedback_autonomous_phase_execution.md — self-decide at V5-equivalent EXECUTE gates; CONDITIONAL findings apply-and-proceed; BLOCKED items go to backlog and continue; irreversible/outward-facing actions without explicit contract instruction are a hard stop.
Hard stop conditions / safety constraints:
- Do not reorder or disturb the existing `/api/auth/*splat` mount in `packages/api/src/index.ts` — new routers mount strictly after `express.json()`.
- No DB migration may be introduced — all 5 required tables already exist (confirmed against `0000_puzzling_lightspeed.sql`); if a migration is found necessary mid-EXECUTE, stop and return to PLAN.
- Section sequencing is a hard gate, not a suggestion: Infra must be fully green (`pnpm typecheck` + `pnpm lint` + `pnpm --filter @jojopotato/utils test`) before MENU-001 starts; MENU-001 must be fully green before MENU-002 starts.
- `apps/mobile/src/features/home/components/product-card.tsx` should be deleted (dead code) unless execute-agent finds a live import site was missed during EXECUTE — do not delete blind if a consumer turns up.
- No checkout/order-placement/payment logic may be added — explicitly out of scope per SPEC.
Next phase: EXECUTE: process/features/ordering-cart/active/menu-product-browsing_10-07-26/menu-product-browsing_PLAN_10-07-26.md
Validate contract: inline in plan (## Validate Contract section, this file)
Execute start: `pnpm typecheck && pnpm lint` (fully-auto baseline) | `pnpm --filter @jojopotato/utils test` (fully-auto, run after Infra step 8) | `pnpm --filter @jojopotato/api test` (hybrid — needs `docker compose up -d` + `db:migrate` first, run after Infra step 13) | manual sim walk via `pnpm ios`/`pnpm android` (agent-probe, per Test Plan) | high-risk pack: no (no auth/billing/schema/deploy/secrets surface touched)
