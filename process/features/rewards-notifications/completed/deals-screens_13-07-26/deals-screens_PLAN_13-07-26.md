---
name: plan:deals-screens
description: "Screens-only, mock-data Deals feature (list, details, cart apply) for GitHub issues #22/#23/#24"
date: 13-07-26
feature: rewards-notifications
---

# Deals Screens (Mock Data) — Plan

## SUPERSEDED (14-07-26) — executed, then superseded by real-API wiring

**This plan WAS executed** (EVL-confirmed clean, see `deals-screens-evl-iteration-001_REPORT_13-07-26.md`
and `results.tsv` — cycle 2 `HALTED_SUCCESS`, `tsc+lint` pass, deals blast radius clean). It shipped
the screens-only, mock-data Deals feature (list #22, details #23, cart-apply #24, PR #68).

That mock-data implementation was then **entirely superseded** by
`process/features/rewards-notifications/completed/deals-api-integration_13-07-26/`, a 3-phase
program that replaced the mock deal source with real backend wiring end-to-end (DEAL-001/002/003,
#22/#23/#24) — see that program's umbrella plan, which explicitly names this plan as its
predecessor. The current, real Deals implementation is described in
`process/context/all-context.md` under "Deals feature (backend wiring COMPLETE, 14-07-26)"; do not
use this file as a description of the current Deals architecture.

Archived as **Superseded** (code shipped, then fully replaced by later real-API work), not left
active — its own scope is complete and no further action is expected against this plan.

---

**Date**: 13-07-26  
**Complexity**: Complex  
**Status**: ⏳ PLANNED

## Overview

Build the **screens-only, mock-data** slice of the Deals feature covering GitHub issues:

- **#22 DEAL-001** — Deals list screen
- **#23 DEAL-002** — Deal details screen
- **#24 DEAL-003** — Apply deal in cart

No backend/DB wiring, no seed data, no automated tests this round (accepted known-gap — `apps/mobile`
has no test runner). Interactive client-side logic (eligibility checks, discount calculation, apply/clear
in cart) IS in scope — this is not a static-UI-only build.

## Goals

1. A reachable Deals list (not a tab) showing active, in-window, branch-scoped, non-expired deals.
2. A Deal Details screen that runs real eligibility checks against the mock cart and shows a specific
   pass/fail reason, with a working Apply CTA.
3. Cart's existing stubbed 10%-flat "Apply coupon" replaced with real deal-code resolution + eligibility
   + discount computation, wired through the existing `AppliedDiscount` cart contract.

## Scope

**In scope:** new `(tabs)/deals/*` stack, `features/deals/*` mock+logic modules, Home entry point,
cart apply-flow rewire, `Deal` type extension mirroring the committed server schema.

**Out of scope (see Known Gaps):** DB/API wiring, seed data, automated tests, standalone Coupon Wallet
(CPN-001), real selected-branch source, order-placement usage-limit decrement, "Add to Wallet".

## LOCKED Decisions (do not re-litigate)

1. **Nav = Option B.** New `apps/mobile/src/app/(tabs)/deals/` stack: `_layout.tsx`, `index.tsx` (list,
   #22), `deal/[dealId].tsx` (details, #23). NOT a tab — not registered in `_layout.ios/.android/.web.tsx`
   and the root `Tabs.Screen` keys are untouched. Reached via `router.push('/(tabs)/deals')` from a new
   Home-screen entry point.
   **VALIDATE finding (confirmed via `expo-router` source, `useScreens.js`/`withLayoutContext.js`):**
   leaving `deals` undeclared in the `Tabs.Screen` list is NOT sufficient to keep it off the tab bar.
   `useSortedScreens` (`useOnlyUserDefinedScreens = false` for `<Tabs>`) appends every undeclared
   file-system child of `(tabs)/` to the navigator's `state.routes` automatically — so `deals` WOULD
   render as an unstyled 6th tab button. Worse, `href: null` on a `Tabs.Screen` (the documented
   Expo Router way to hide a route from the tab bar) only works with the *default* tab bar renderer;
   this app uses a fully custom `tabBar={(props) => <FloatingTabBar {...props} />}` (see
   `apps/mobile/src/components/floating-tab-bar.tsx`) that iterates `state.routes` directly and ignores
   `tabBarButton`/`tabBarItemStyle`. **Required mitigation (added as Touchpoint #10 / Checklist step
   5b):** `floating-tab-bar.tsx` must filter `state.routes` to the known 5-tab allowlist (the existing
   `ICONS` map keys: `index`, `order`, `rewards`, `branches`, `account`) before rendering, so the new
   `deals` route stays reachable via `router.push` but never appears as a tab button. This does not
   change the decision (Option B / not-a-tab is still correct) — it corrects the mechanism needed to
   achieve it.
2. Mock data + engine live in new `apps/mobile/src/features/deals/`: `mock-deals.ts`, `lib/eligibility.ts`.
3. Applied-deal display in cart = re-lookup by `refId` from mock deals at render time. **No changes** to
   `packages/types/src/cart.ts` — `AppliedDiscount` + `useCart().applyDiscount/clearDiscount` + live
   subtotal/discount/total recompute already suffice.
4. Coupon/deal model is **deal-centric**. The existing cart "Apply coupon/deal" input resolves a typed
   code to a mock `Deal` (extend `Deal` with optional `code`). Standalone Coupon Wallet (CPN-001) is OUT
   of scope.
5. #23 CTAs: primary **Apply** (works via engine, routes into cart apply flow); **Add to Wallet** rendered
   but stubbed (`Alert.alert('Coming soon')`).
6. **Branch source for eligibility** (research finding — not pre-decided by the brief): a real
   `useBranch()` seam exists (`apps/mobile/src/features/branch/hooks/use-branch.ts`, API-backed,
   persisted), but the **cart** does not consume it — cart is scoped by `cart.pickupBranchId`
   (`useCart()`), currently seeded from `MOCK_CART_BRANCH`. Because deal eligibility must agree with
   what the cart will actually apply against, **use `cart.pickupBranchId` (via `useCart()`) as the
   branch source for both the Deals list and Deal Details eligibility checks** — not `useBranch()`.
   Document the `useBranch()`/cart split as a known gap (see below); do not attempt to reconcile it
   this round.

## Touchpoints

| # | File | Action |
|---|---|---|
| 1 | `packages/types/src/deals.ts` | Extend `Deal` interface |
| 2 | `apps/mobile/src/features/deals/lib/eligibility.ts` | New — pure eligibility + discount-calc engine |
| 3 | `apps/mobile/src/features/deals/mock-deals.ts` | New — mock deal catalog + usage history |
| 4 | `apps/mobile/src/app/(tabs)/deals/_layout.tsx` | New — Stack layout |
| 5 | `apps/mobile/src/app/(tabs)/deals/index.tsx` | New — Deals list (#22) |
| 6 | `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` | New — Deal details (#23) |
| 7 | `apps/mobile/src/app/(tabs)/index.tsx` | Edit — add "Deals" entry point section |
| 8 | `apps/mobile/src/app/(tabs)/order/cart.tsx` | Edit — rewire `handleApplyCoupon`, applied-deal display, one-deal-per-cart, expiry-at-checkout |
| 9 | `apps/mobile/src/app/(tabs)/order/checkout.tsx` | Edit (read first — not yet read in research) — expiry-at-checkout removal notice, if that's the better home than cart.tsx |
| 10 | `apps/mobile/src/components/floating-tab-bar.tsx` | Edit — filter `state.routes` to the known 5-tab allowlist so the new unregistered `(tabs)/deals` route does not render as an unintended 6th tab button (VALIDATE finding — see Decision #1 note, Checklist step 5b) |

## Public Contracts

- `Deal` (packages/types) — extended shape is a **superset**; existing consumers (`DealCard`, current
  `mock-home.ts` deal usages if any — none found in research) are unaffected because `discountLabel`
  and `imageUrl` are retained.
- `checkDealEligibility(deal, cart, pickupBranchId, usageHistory): EligibilityResult` — new pure function,
  no existing caller.
- `computeDealDiscountCents(deal, cart): number` — new pure function (folded into eligibility.ts per item B).
- No changes to `AppliedDiscount`, `useCart()` method signatures, or any `packages/api` schema/route
  (server `deals`/`deal_products`/`deal_branches` tables already exist per `db-schema` plan — read-only
  reference for field mirroring, not touched by this plan).

## Blast Radius

- **Packages touched:** `packages/types` (1 file, additive interface extension — low risk).
- **App touched:** `apps/mobile/src/app/(tabs)/{deals (new),order/cart.tsx,order/checkout.tsx (maybe),index.tsx}`,
  `apps/mobile/src/features/deals/` (new), `apps/mobile/src/components/floating-tab-bar.tsx` (small,
  additive route-filter edit — VALIDATE finding, see Decision #1 note).
- **Read-only reuse:** `@jojopotato/ui` (`DealCard`, `EmptyState`, `Button`, `Card`, `Badge`, `CouponCard`,
  `Input`), `packages/api/src/db/schema/{deals,deal_products,deal_branches}.ts` (shape reference only).
- **Risk class:** none of the high-risk classes (auth/billing/schema-migration/public-API/deploy/secrets)
  apply — this is UI + client-side mock logic only. No server files touched.
- **File count:** ~10 touchpoints, 1 package. Below the 3+ package / 5+ file phase-program threshold —
  this stays a single SIMPLE-leaning-COMPLEX plan (medium complexity per the task brief), not a phase
  program.

## Implementation Checklist

### A. Types

1. In `packages/types/src/deals.ts`, extend `Deal`:
   ```
   dealType: 'percentage_discount' | 'fixed_discount' | 'buy_one_take_one' | 'free_item' | 'free_upgrade' | 'bundle'
   discountValue: number
   minimumOrderAmount: number   // cents; default-equivalent 0 in mock data
   startAt: string              // ISO
   endAt: string                // ISO
   isActive: boolean
   usageLimitPerUser?: number
   totalUsageLimit?: number
   eligibleProductIds: string[] // empty = all products
   eligibleBranchIds: string[]  // empty = branch-agnostic
   code?: string                // for the cart "Apply coupon/deal" input
   ```
   Keep `discountLabel` and `imageUrl` (consumed by `DealCard`). Field names camelCase, mirroring the
   Drizzle schema (`packages/api/src/db/schema/deals.ts`: `deal_type`, `discount_value`,
   `minimum_order_amount`, `start_at`, `end_at`, `usage_limit_per_user`, `total_usage_limit`,
   `is_active`) 1:1 minus casing, plus `eligibleProductIds`/`eligibleBranchIds` mirroring the
   `deal_products`/`deal_branches` join tables (flattened to id arrays for the mock/client layer — no
   join-table types needed client-side).
   **VALIDATE note (value-unit divergence, confirmed via `packages/api/src/db/schema/deals.ts`):** the
   server columns `discount_value` and `minimum_order_amount` are `numeric(10,2)` — a decimal amount in
   major PHP units (e.g. `"500.00"`), not cents. This plan's client `Deal.minimumOrderAmount`/
   `discountValue` are deliberately **cents**, for internal consistency with the rest of the client cart
   (`unitPriceCents`, `amountCents`). This is a conscious per-round decision, not an oversight — but it
   means a future API-wiring plan must convert server decimal-PHP values to cents (×100) when populating
   the client `Deal` shape. Recorded explicitly in Known Gaps below so it isn't lost.
2. Do **not** touch `packages/types/src/coupons.ts` — confirmed unnecessary; the cart's existing
   `CouponCard` prop shape and `AppliedDiscount.source: 'coupon' | 'deal' | 'reward'` already cover a
   deal-sourced discount without a separate coupon type.

### B. Eligibility + discount engine

3. Create `apps/mobile/src/features/deals/lib/eligibility.ts`:
   - Types: `EligibilityFailReason = 'inactive' | 'not_in_window' | 'branch_ineligible' | 'no_eligible_product_in_cart' | 'below_minimum_order' | 'user_usage_limit_reached' | 'total_usage_limit_reached'`;
     `EligibilityResult = { eligible: true } | { eligible: false; reason: EligibilityFailReason; message: string }`.
   - `checkDealEligibility(deal: Deal, cart: Cart, pickupBranchId: string, usage: DealUsageRecord[]): EligibilityResult`
     runs 6 ordered checks, short-circuiting on first failure (order matters — matches #23 AC ordering):
     1. `isActive` and `now` within `[startAt, endAt]` → else `not_in_window` ("This deal is not currently
        available.")
     2. `eligibleBranchIds.length === 0 || eligibleBranchIds.includes(pickupBranchId)` → else
        `branch_ineligible` ("Not available at your selected branch.")
     3. `eligibleProductIds.length === 0 || cart.items.some(i => eligibleProductIds.includes(i.menuItemId))`
        → else `no_eligible_product_in_cart` ("Add an eligible item to your cart to use this deal.")
     4. `subtotalCents(cart) >= minimumOrderAmount` → else `below_minimum_order` with the **exact
        shortfall in ₱** interpolated, e.g. `` `Add ₱${((minimumOrderAmount - subtotal)/100).toFixed(2)} more to use this deal.` ``
     5. `usageLimitPerUser` — count matching `usage` entries for this deal id → else
        `user_usage_limit_reached` ("You've already used this deal.")
     6. `totalUsageLimit` — count all `usage` entries for this deal id → else
        `total_usage_limit_reached` ("This deal has reached its usage limit.")
   - `computeDealDiscountCents(deal: Deal, cart: Cart): number` — per `dealType`:
     - `percentage_discount`: `round(subtotal * discountValue/100)`
     - `fixed_discount`: `min(discountValue, subtotal)` (discountValue already cents)
     - `buy_one_take_one`, `free_item`, `free_upgrade`, `bundle`: compute against the cheapest eligible
       matching line's `unitPriceCents` (documented simplification — real BOGO/bundle pricing engines are
       a backend concern; comment this explicitly as a mock-round simplification, not a real pricing
       engine).
   - Export a `DealUsageRecord = { dealId: string; userId: string }` type and a small
     `deriveDiscountLabel(deal: Deal): string` helper (e.g. `"20% OFF"`, `"₱50 OFF"`, `"BOGO"`, `"FREE
     ITEM"`, `"FREE UPGRADE"`, `"BUNDLE DEAL"`) used by mock data so `DealCard.discountLabel` stays
     consistent with `dealType`/`discountValue` instead of being hand-typed per mock entry.

### C. Mock data

4. Create `apps/mobile/src/features/deals/mock-deals.ts` with a `PLACEHOLDER / MOCK DATA` doc-comment
   banner (matching `mock-cart.ts`/`mock-home.ts` convention). Import branch ids from
   `@/features/cart/mock-cart` (`MOCK_CART_BRANCH`, `MOCK_OTHER_BRANCH`) and product ids from
   `@/features/home/mock-home` (`MOCK_PRODUCTS`). Required coverage (≥1 deal per case, reuse
   `deriveDiscountLabel`):
   - one deal per `dealType` (6 deals minimum)
   - ≥1 branch-scoped to `MOCK_CART_BRANCH.id`; ≥1 branch-agnostic (`eligibleBranchIds: []`)
   - ≥1 with `eligibleProductIds` referencing real `MOCK_PRODUCTS` ids
   - ≥1 **expired** (`endAt` in the past) — proves hidden-from-list + `not_in_window` reason
   - ≥1 with `usageLimitPerUser: 1` + a paired `MOCK_DEAL_USAGE: DealUsageRecord[]` export containing a
     matching used record — proves `user_usage_limit_reached`
   - ≥1 with `minimumOrderAmount` above `MOCK_CART` subtotal (compute from `mock-cart.ts` seed: 2×
     `fries-classic` (99) + 1× `fries-cheddar` (149) = 347 → use e.g. 500 (₱5.00, i.e. 50000 if cents...
     **note:** confirm cents convention — `Product.basePrice` is whole-PHP per mock-home.ts comment, but
     `CartItem.unitPriceCents`/`AppliedDiscount.amountCents` are cents; `minimumOrderAmount` on `Deal`
     must be **cents** to match `subtotalCents` comparison — use e.g. `50000` cents = ₱500) — proves
     `below_minimum_order` with a nonzero shortfall message
   - at least one `code` set (e.g. `"WELCOME20"`) on a deal usable via the cart text-input path
   - export `MOCK_DEAL_USAGE: DealUsageRecord[]` (may be empty array plus the one used-limit record above)

### D. Deals list screen (#22)

5. `apps/mobile/src/app/(tabs)/deals/_layout.tsx`: `Stack` mirroring `order/_layout.tsx` pattern —
   `index` `headerShown:false` (tab-root-equivalent), `deal/[dealId]` `headerShown:true` with
   `title: 'Deal Details'`.
5b. **(VALIDATE-added — required, do not skip)** In `apps/mobile/src/components/floating-tab-bar.tsx`,
   filter `state.routes` to the known tab allowlist before mapping to `TabItem` — e.g.
   `state.routes.filter((route) => route.name in ICONS)` (the `ICONS` map already only has the 5 real
   tab names: `index`, `order`, `rewards`, `branches`, `account`). This must land alongside the
   `(tabs)/deals/` folder creation (step 4/5), not after — otherwise the app will briefly show an
   unstyled 6th tab button. See Decision #1 note for why this is required.
6. `apps/mobile/src/app/(tabs)/deals/index.tsx`:
   - `useCart()` for `cart.pickupBranchId`; filter `MOCK_DEALS` to `isActive && now within [startAt,endAt]
     && (eligibleBranchIds.length===0 || eligibleBranchIds.includes(pickupBranchId))`.
   - Render via `ScrollView`/`FlatList` of `DealCard` (pass `deal={deal}` — note `DealCard` renders
     `deal.discountLabel` directly, already covered by `deriveDiscountLabel` at mock-data-authoring time).
   - `EmptyState` (`iconName:'pricetag-outline'` or similar Ionicons glyph, `title:'No deals right now'`)
     when filtered list is empty.
   - `Platform.OS !== 'web'` floating-tab-bar clearance via `getFloatingTabBarClearance(insets.bottom)`
     on the scroll content, matching `cart.tsx`/`(tabs)/index.tsx` convention (this screen is NOT a tab
     root itself but sits under the same safe-area/no-native-tab-bar behavior as any pushed screen inside
     a tab stack — confirm at EXECUTE whether clearance is needed here since it's a pushed, headered
     screen, not a tab-root; if headered, native header likely handles spacing and clearance may be
     unnecessary — decide empirically during EXECUTE and note the decision in the phase report).
   - Tap → `router.push({ pathname: '/(tabs)/deals/deal/[dealId]', params: { dealId: deal.id } })`.
   - Expired deals must be absent (proven by the window filter above).

### E. Deal details screen (#23)

7. `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx`:
   - `useLocalSearchParams<{ dealId: string }>()`, resolve `deal = MOCK_DEALS.find(d => d.id === dealId)`;
     if not found render a simple not-found state (`EmptyState` or plain text — pick `EmptyState` for
     consistency).
   - `useCart()` for `cart`/`cart.pickupBranchId`; run
     `checkDealEligibility(deal, cart, cart.pickupBranchId, MOCK_DEAL_USAGE)`.
   - Render hero image (or placeholder, matching `DealCard`'s placeholder pattern), title, description,
     a derived terms block (min order, window, branch scope, usage limits — plain text, not a new UI
     component).
   - Eligible: **Apply** button enabled. Not eligible: **Apply** button disabled/greyed + the specific
     `result.message` shown inline (not a generic "not eligible" string).
   - **Add to Wallet**: `Button variant="outline"` → `Alert.alert('Coming soon', 'Deal wallet is not available yet.')`.
   - Apply CTA behavior: call the same apply logic used by cart (extract a shared helper — see item H
     step 10 — reused here so list/detail/cart share one code path) → `useCart().applyDiscount(...)` →
     `router.push('/(tabs)/order/cart')`.

### F. Home entry point

8. `apps/mobile/src/app/(tabs)/index.tsx`: add one new section between `RewardProgressCard` and
   `CategorySelector` (or immediately after `PromoBanner` — pick whichever reads better; do not disturb
   existing section order otherwise). Use existing shared UI only — e.g. a `Card` wrapping a `Text`
   heading + `Button` ("View deals") that calls `router.push('/(tabs)/deals')`, OR reuse `DealCard` for a
   1-2 item teaser strip pulled from `MOCK_DEALS` (prefer the teaser-strip approach for visual parity with
   the `RewardsTeaserCard` component's visual style — **VALIDATE correction:** `RewardsTeaserCard`
   (`apps/mobile/src/features/home/components/rewards-teaser-card.tsx`) is confirmed **not currently
   imported/rendered anywhere** (the live Home screen uses `RewardProgressCard` from `@jojopotato/ui`
   instead) — so this is a style reference for an existing-but-unused local component, not "an existing
   pattern already on this screen." Treat it as an optional style cue only; do not assume visual
   continuity with something currently visible). Check
   `apps/mobile/src/features/home/components/rewards-teaser-card.tsx` at EXECUTE time and mirror its
   shape for a new `features/home/components/deals-teaser-section.tsx` if it reads better than the
   simpler Card+Button option.
   Do not rename `(tabs)/index.tsx`, do not touch platform tab-layout files, do not touch `Tabs.Screen`
   keys.

### G. Cart apply-flow rewire (#24)

9. Read `apps/mobile/src/app/(tabs)/order/checkout.tsx` in full before editing anything in this section —
   it was not read during PLAN research; confirm whether expiry-at-checkout removal belongs there instead
   of cart.tsx before implementing step 12. **VALIDATE note:** `checkout.tsx` is currently a bare
   `ComingSoon` placeholder with a single "Dev: Place Order" link and no real render logic — read it
   anyway per this step, but expect the eligibility-recheck `useEffect` to most naturally land in
   `cart.tsx` since there is no meaningful mount-time state in `checkout.tsx` yet to hook into.
10. In `apps/mobile/src/features/deals/lib/eligibility.ts` (or a small new `apps/mobile/src/features/deals/lib/apply-deal.ts`
    if it reads cleaner), add a shared `resolveAndApplyDeal(code: string, cart: Cart, pickupBranchId: string, usage: DealUsageRecord[]): { ok: true; discount: AppliedDiscount } | { ok: false; reason: 'not_found' | EligibilityFailReason; message: string }`
    that: looks up `MOCK_DEALS.find(d => d.code?.toUpperCase() === code.trim().toUpperCase())`, on miss
    returns `{ ok:false, reason:'not_found', message:'Deal code not found.' }`, on hit runs
    `checkDealEligibility`, on pass computes `amountCents` via `computeDealDiscountCents` and returns
    `{ ok:true, discount:{ source:'deal', refId: deal.id, label: deal.title, amountCents } }`. Reused by
    both cart.tsx and deal/[dealId].tsx Apply CTA (deal-details Apply passes the deal's own `code` if set,
    else applies by `deal.id` directly via a small overload/second function
    `applyDealById(dealId, cart, pickupBranchId, usage)` — simplest: give `resolveAndApplyDeal` an
    overload that accepts either a `code` string or reuse a shared internal `applyResolvedDeal(deal, cart, pickupBranchId, usage)`
    that both entry points call).
11. In `apps/mobile/src/app/(tabs)/order/cart.tsx`, replace `handleApplyCoupon`'s current blind
    `Math.round(subtotalCents * 0.1)` stub (the `// Real coupon pricing is stubbed (CART-002)` comment)
    with a call to `resolveAndApplyDeal(code, cart, cart.pickupBranchId, MOCK_DEAL_USAGE)`:
    - `ok:false` → `Alert.alert('Cannot apply deal', result.message)` (same `Alert` pattern already used
      in this file for the branch-switch confirmations), do not clear `couponCode` input on failure so the
      user can see what they typed.
    - `ok:true` → `applyDiscount(result.discount)`, clear `couponCode`.
    - **One-deal-per-cart enforcement**: if `cart.appliedDiscount` is already set when Apply is pressed,
      show a confirmation `Alert` ("Replace applied deal? This cart already has '<label>' applied.") with
      Cancel/Replace actions — **replace-with-confirmation**, not silent block (chosen because it matches
      the existing branch-switch confirmation UX pattern in this same file, and is more forgiving than a
      hard block). Document this choice inline as a code comment referencing this plan.
    - **Applied-deal display**: when rendering the applied `CouponCard`, re-lookup the full `Deal` by
      `cart.appliedDiscount.refId` from `MOCK_DEALS` (not just the stored label) so richer display data
      (e.g. `discountLabel`) stays sourced from the mock catalog, matching the plan's Decision #3. If the
      lookup misses (e.g. `refId` doesn't resolve — shouldn't happen in-session but guard anyway), fall
      back to the currently-stored `label`/`amountCents` as today.
12. **Expiry-at-checkout**: wherever step 9's read determines is correct (cart.tsx render-time check vs.
    checkout.tsx on-mount check) — re-run `checkDealEligibility` for the currently-applied deal (by
    re-looking it up via `refId`) and auto-call `clearDiscount()` + show a one-time
    `Alert.alert('Deal removed', '<message>')` if it has become ineligible (most commonly: expired window
    or dropped below minimum order after item removal). Implement as a `useEffect` keyed on the relevant
    dependencies (cart contents / pickupBranchId) in whichever screen step 9 selects.
13. **Usage-limit consumption**: applying a deal in this mock round does **not** persist a new
    `DealUsageRecord` (order placement — where real consumption should happen — is out of scope). Add a
    one-line code comment at the `resolveAndApplyDeal`/`applyDiscount` call site: `// Known gap: usage is
    not persisted here — real consumption happens at order placement (out of scope this round).`

## Verification Evidence

No automated test runner exists for `apps/mobile` (`process/context/tests/all-tests.md` — confirmed
known project-wide gap). All gates below are typecheck/lint (Fully-Automated) plus manual simulator
walk-throughs (Agent-Probe), mapped explicitly to each issue's acceptance criteria.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm -C apps/mobile exec expo start` once, then Ctrl-C, then `pnpm -C apps/mobile exec tsc --noEmit` | Fully-Automated | Typed-routes codegen picks up new `deals/index`, `deals/deal/[dealId]` routes; no type errors across all edited/new files |
| `pnpm -C apps/mobile exec eslint src` (or repo lint script) | Fully-Automated | Code style / import conventions honored |
| Manual: open app → Home → tap Deals entry → list renders, expired/ineligible-branch deals absent | Agent-Probe | #22 AC: list shows only active, in-window, branch-scoped deals |
| Manual: tap a deal card → details screen shows correct title/description/terms | Agent-Probe | #22 AC: navigation to details; #23 AC: details content |
| Manual: open the branch-agnostic deal with no product restriction and a cart meeting minimum order → Apply enabled, tapping applies and routes to cart with discount visible | Agent-Probe | #23 AC: eligible state + Apply CTA; #24 AC: apply reflected in cart totals |
| Manual: open the deal with `minimumOrderAmount` above mock subtotal → Apply disabled, exact ₱ shortfall shown | Agent-Probe | #23 AC: minimum-order ineligibility with specific reason |
| Manual: open the deal requiring an eligible product not in the mock cart → Apply disabled, "add eligible item" reason shown | Agent-Probe | #23 AC: product-eligibility reason |
| Manual: open the branch-scoped deal while cart is on the other mock branch (use existing Dev: add item from another branch flow to switch) → Apply disabled, branch reason shown | Agent-Probe | #23 AC: branch-eligibility reason |
| Manual: open the usage-limited deal (already "used" per `MOCK_DEAL_USAGE`) → Apply disabled, usage-limit reason shown | Agent-Probe | #23 AC: usage-limit reason |
| Manual: open the expired deal directly via its known id (bypassing the list filter, e.g. temporary dev link) → not-in-window reason shown | Agent-Probe | #23 AC: window/active reason |
| Manual: tap "Add to Wallet" → `Alert` "Coming soon" appears, no crash | Agent-Probe | #23 AC: wallet CTA present but stubbed |
| Manual: cart screen → type a valid deal `code` → Apply → discount applied, total recomputed | Agent-Probe | #24 AC: coupon-code-driven apply path |
| Manual: cart screen → type an invalid/unknown code → Apply → `Alert` shows "Deal code not found." | Agent-Probe | #24 AC: invalid-code handling |
| Manual: with a deal already applied, apply a second deal/code → replace-confirmation `Alert` appears; Cancel keeps original, Replace swaps | Agent-Probe | #24 AC: one-deal-per-cart |
| Manual: applied deal displayed via `CouponCard` shows correct re-looked-up label/discountLabel | Agent-Probe | #24 AC / Decision #3: refId re-lookup display |
| Manual: remove cart items until subtotal drops below the applied deal's minimum order → deal auto-clears with a notice | Agent-Probe | #24 AC: expiry/ineligibility-at-checkout auto-removal |
| Manual: open app → confirm bottom tab bar still shows exactly 5 tabs (Home/Order/Rewards/Branches/Account) with no unstyled 6th "deals" button | Agent-Probe | VALIDATE finding: `floating-tab-bar.tsx` route-filter (step 5b) correctly hides the unregistered `deals` route from the tab bar |

## Phase Completion Rules

- **CODE DONE** -- all sections A-G implemented, `tsc --noEmit` and lint pass. Does not imply manual verification has occurred.
- **VERIFIED** -- CODE DONE, plus every Agent-Probe row in Verification Evidence has been walked through on a simulator/device and passed, and the Known Gaps table has been reviewed and accepted as-is.
- This plan has no sub-phases (single-session medium-complexity build) -- the whole checklist (A-G) reaches CODE DONE or VERIFIED together, not phase-by-phase.

## Known Gaps / Follow-ups

| Gap | Why deferred | Suggested resolution |
|---|---|---|
| No automated tests for `eligibility.ts` | `apps/mobile` has no test runner configured project-wide | Backlog stub: add Vitest to `apps/mobile` (or a lightweight standalone `packages/deals-engine` testable via existing `packages/*` Vitest setup) and unit-test the 6-check waterfall + discount calc — cheap, high-value follow-up since the engine is pure functions |
| Order-placement usage-limit decrement | Order placement flow itself is out of scope this round | Follow-up plan once order placement / `packages/api` order-write path exists; wire `DealUsageRecord` persistence there |
| Standalone Coupon Wallet (CPN-001) | Explicitly out of scope per locked decision #4 | Separate future feature plan |
| Real selected-branch source for deals (`useBranch()` vs `cart.pickupBranchId`) | Cart itself doesn't consume `useBranch()` yet (pre-existing app-wide inconsistency, not introduced by this plan) | Reconcile in a future cart/branch-selection alignment plan — see Decision #6 |
| BOGO/free-item/free-upgrade/bundle discount calc is a documented simplification (cheapest matching line), not a real pricing engine | Real multi-line/promo-stacking pricing logic is a backend/checkout-engine concern | Revisit once `packages/api` owns discount computation server-side |
| "Add to Wallet" stub | Explicitly locked as stubbed this round (Decision #5) | Wire once Coupon Wallet (CPN-001) or a Deal Wallet feature is planned |
| Client `Deal.minimumOrderAmount`/`discountValue` are cents; server `deals.minimum_order_amount`/`discount_value` are `numeric(10,2)` decimal PHP amounts (confirmed via `packages/api/src/db/schema/deals.ts`) | Deliberate this-round choice for internal consistency with the cents-based cart contract; server schema was not touched | Future API-wiring plan must convert server decimal-PHP values to cents (×100) when populating the client `Deal` shape |

## Test Infra Improvement Notes

`apps/mobile` has no test runner (Jest/Vitest/Detox) configured. The `eligibility.ts` module is pure
functions with zero React Native dependencies — cheapest possible test-infra win would be adding Vitest
to `apps/mobile` (or extracting the engine into a plain `packages/` module that already has Vitest
wired, per `packages/api`'s existing Vitest setup) purely to unit-test this module. Not done this round
per the mock-data/screens-only scope; flagged for `process/context/tests/all-tests.md` follow-up.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/rewards-notifications/active/deals-screens_13-07-26/deals-screens_PLAN_13-07-26.md`
2. **Last completed phase/step:** VALIDATE (this file) — validated 13-07-26, gate PASS (see Validate Contract below); not yet executed.
3. **Validate-contract status:** written — see `## Validate Contract` below.
4. **Supporting context files loaded during PLAN:** `process/context/all-context.md`,
   `packages/types/src/{deals,cart}.ts`, `apps/mobile/src/features/cart/{hooks/use-cart.ts,mock-cart.ts}`,
   `apps/mobile/src/app/(tabs)/order/{_layout.tsx,cart.tsx,product/[productId].tsx}`,
   `apps/mobile/src/app/(tabs)/index.tsx`, `packages/ui/src/components/deal-card.tsx`,
   `packages/ui/src/components/empty-state.tsx`, `packages/ui/src/index.ts`,
   `packages/api/src/db/schema/{deals,deal_products,deal_branches}.ts`,
   `apps/mobile/src/features/home/mock-home.ts`, `apps/mobile/src/features/branch/hooks/use-branch.ts`.
5. **Supporting context files additionally loaded during VALIDATE:**
   `node_modules/.pnpm/expo-router@57.0.4_.../expo-router/build/layouts/{TabsClient.js,withLayoutContext.js}`,
   `node_modules/.pnpm/expo-router@57.0.4_.../expo-router/build/useScreens.js` (confirmed the tab-bar
   auto-registration mechanism), `apps/mobile/src/components/floating-tab-bar.tsx`,
   `apps/mobile/src/app/(tabs)/_layout.{ios,web}.tsx`, `apps/mobile/src/app/(tabs)/order/_layout.tsx`,
   `apps/mobile/src/app/(tabs)/order/{cart.tsx,checkout.tsx}` (full read),
   `apps/mobile/src/features/home/components/rewards-teaser-card.tsx`,
   `apps/mobile/src/features/cart/lib/product-to-menu-item.ts`,
   `packages/types/src/coupons.ts`, `packages/ui/src/components/coupon-card.tsx`,
   `packages/api/src/db/schema/{deal_products,deal_branches}.ts`.
6. **Next step for a fresh agent:** run EXECUTE section-by-section (A → B → C → D [incl. step 5b] → E →
   F → G in order — G depends on B/C, D/E depend on B/C, F depends on C, 5b lands alongside 4/5). Read
   `apps/mobile/src/app/(tabs)/order/checkout.tsx` and
   `apps/mobile/src/features/home/components/rewards-teaser-card.tsx` at the start of EXECUTE (already
   read during VALIDATE — see note 5 above — but execute-agent should still open them fresh) before
   touching sections G/step-9 and F respectively.

## Validate Contract

Status: PASS
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 1/7 (only S7 — 10 touchpoints/blast-radius files present; no multi-package,
no schema/API/auth surface, no 3+ viable directions to compare, not a phase program, no high-risk
class). LOW score → sequential: vc-validate-agent performed the Layer 1 + Layer 2 fan-out directly in
one context rather than spawning additional parallel subagents.

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| typed-routes-typecheck | New `deals/index`, `deals/deal/[dealId]` routes resolve with no type errors across all edited/new files | Fully-Automated | `pnpm -C apps/mobile exec expo start` once (Ctrl-C after codegen), then `pnpm -C apps/mobile exec tsc --noEmit` | A |
| lint | Code style / import conventions honored | Fully-Automated | `pnpm -C apps/mobile exec eslint src` (or repo `pnpm lint` for the mobile package) | A |
| deals-list-filter | #22 AC — list shows only active, in-window, branch-scoped, non-expired deals | Agent-Probe | Manual: Home → Deals entry → list renders; expired/ineligible-branch deals absent | A |
| deal-details-nav-content | #22/#23 AC — navigation to details; correct title/description/terms rendered | Agent-Probe | Manual: tap a deal card → details screen content matches mock data | A |
| eligible-apply-happy-path | #23/#24 AC — eligible state enables Apply; apply reflects in cart totals | Agent-Probe | Manual: branch-agnostic, no-product-restriction, subtotal-meets-minimum deal → Apply → cart shows discount | A |
| below-minimum-reason | #23 AC — minimum-order ineligibility with exact ₱ shortfall | Agent-Probe | Manual: deal with `minimumOrderAmount` above mock subtotal → Apply disabled, exact shortfall shown | A |
| product-ineligible-reason | #23 AC — product-eligibility reason | Agent-Probe | Manual: deal requiring a product not in cart → Apply disabled, "add eligible item" reason shown | A |
| branch-ineligible-reason | #23 AC — branch-eligibility reason | Agent-Probe | Manual: branch-scoped deal while cart on other mock branch (via Dev: add item from other branch) → Apply disabled, branch reason shown | A |
| usage-limit-reason | #23 AC — usage-limit reason | Agent-Probe | Manual: usage-limited deal already "used" per `MOCK_DEAL_USAGE` → Apply disabled, usage-limit reason shown | A |
| window-reason | #23 AC — window/active reason | Agent-Probe | Manual: expired deal opened directly by id → not-in-window reason shown | A |
| wallet-stub | #23 AC — wallet CTA present but stubbed | Agent-Probe | Manual: tap "Add to Wallet" → Alert "Coming soon", no crash | A |
| code-apply-happy-path | #24 AC — coupon-code-driven apply path | Agent-Probe | Manual: cart screen, valid deal code → Apply → discount applied, total recomputed | A |
| code-invalid | #24 AC — invalid-code handling | Agent-Probe | Manual: cart screen, unknown code → Apply → Alert "Deal code not found." | A |
| one-deal-per-cart | #24 AC — one-deal-per-cart replace-confirmation | Agent-Probe | Manual: apply a second deal/code with one already applied → replace-confirmation Alert; Cancel/Replace behave correctly | A |
| applied-deal-display | #24 AC / Decision #3 — refId re-lookup display | Agent-Probe | Manual: applied `CouponCard` shows correct re-looked-up label/discountLabel | A |
| expiry-at-checkout-autoclear | #24 AC — expiry/ineligibility-at-checkout auto-removal | Agent-Probe | Manual: remove items until subtotal < applied deal's minimum → deal auto-clears with notice | A |
| tab-bar-no-6th-tab | VALIDATE finding — `floating-tab-bar.tsx` route-filter (step 5b) hides the unregistered `deals` route from the tab bar | Agent-Probe | Manual: open app → bottom tab bar shows exactly 5 tabs, no unstyled 6th button | A |
| eligibility-engine-unit-logic | 6-check eligibility waterfall + discount-calc math (percentage/fixed/BOGO-simplification) | Known-Gap | — (no `apps/mobile` test runner; behavior is proven via the Agent-Probe rows above, not via unit test) | D |

gap-resolution legend: A — proven now (gate passes in this cycle). D — backlog test-building stub
(named residual; keep-active; continue). See `## Known Gaps / Follow-ups` row 1 for the D-resolution
backlog stub (add Vitest to `apps/mobile` or extract `eligibility.ts` into a Vitest-covered package).

C-4 reconciliation: all rows above use only the 3 proving strategies (Fully-Automated / Agent-Probe);
`eligibility-engine-unit-logic` is the one Known-Gap row, and it is NOT the sole proof of the
eligibility engine's behavior — every one of its 6 fail-reasons and both discount-calc branches is
independently proven by an Agent-Probe row above (below-minimum-reason, product-ineligible-reason,
branch-ineligible-reason, usage-limit-reason, window-reason, eligible-apply-happy-path). This satisfies
the net-gate vacuous-green ban: no developed behavior in this plan rests on Known-Gap alone.

Legacy line form:
- Typecheck/lint: `pnpm -C apps/mobile exec tsc --noEmit` (after one `expo start`/Ctrl-C for typed-routes codegen) | `pnpm -C apps/mobile exec eslint src`
- Deals list/details/cart-apply/eligibility-reasons/tab-bar: agent-probe — manual simulator walkthrough, one scenario per row above
- Eligibility engine unit-level correctness: known-gap — documented, `apps/mobile` has no test runner; behavior-level coverage via agent-probe rows stands in for this round

### Dimension findings

- Infra fit: PASS — expo-router file-based routing confirmed compatible; the one real mechanical gap
  found (undeclared `(tabs)/deals` folder auto-registering as a 6th tab button, since `<Tabs>` includes
  all undeclared file-system children by default and the custom `FloatingTabBar` bypasses `href:null`)
  was fixed in-plan: Touchpoint #10 + Checklist step 5b (filter `state.routes` to the known 5-tab
  allowlist in `floating-tab-bar.tsx`), verified against `expo-router@57.0.4` source
  (`useScreens.js`/`withLayoutContext.js`) and confirmed absent from any current codebase precedent.
- Test coverage: PASS — no `apps/mobile` runner is a pre-existing, accepted project-wide known-gap (not
  introduced by this plan); every AC across #22/#23/#24 maps to an explicit Fully-Automated or
  Agent-Probe row; the one Known-Gap row (eligibility engine unit-level testing) is not the sole proof
  of that behavior — see C-4 reconciliation above.
- Breaking changes: PASS — `Deal` extension is a strict superset (existing fields `discountLabel`/
  `imageUrl` retained; `DealCard` reads only those + `title`/`description`, confirmed by source read).
  No `AppliedDiscount`/`useCart()` signature changes; no `packages/api` schema/route touched.
- Security surface: PASS — no auth, billing, secrets, migration, deploy, or public-API surface touched;
  confirmed via Blast Radius + file reads (client-only mock UI/logic, server schema read-only reference).
- Section A (Types): PASS (after plan fix) — mechanically feasible; VALIDATE found and documented a
  client/server value-unit divergence (cents vs. server `numeric(10,2)` decimal PHP) that was a
  deliberate but previously undocumented decision — now recorded as a Known Gaps row for future
  API-wiring plans.
- Section B (Eligibility engine): PASS — types and math check out against real `Cart`/`CartItem`
  contracts (`unitPriceCents`, `subtotalCents` derivation confirmed via `use-cart.ts`).
- Section C (Mock data): PASS — all imported mock symbols (`MOCK_CART_BRANCH`, `MOCK_OTHER_BRANCH`,
  `MOCK_PRODUCTS`) confirmed to exist with matching shapes in `mock-cart.ts`/`mock-home.ts`; the
  ₱347-subtotal vs. ₱500-minimum arithmetic in the plan is correct once both sides are read as PHP
  major units before the ×100 cents conversion.
- Section D (Deals list #22): PASS (after plan fix) — same tab-bar mitigation as Infra fit, now a
  checklist step (5b); `EmptyState` `iconName` prop confirmed to accept `'pricetag-outline'` as a valid
  `Ionicons.glyphMap` key.
- Section E (Deal details #23): PASS — `useLocalSearchParams` typed-route pattern matches the existing
  `order/product/[productId].tsx` convention; `EmptyState` reuse mechanically sound.
- Section F (Home entry point): PASS (after plan fix) — corrected an inaccurate premise (`RewardsTeaserCard`
  is confirmed unused/orphaned, not "already on this screen" — the real Home screen uses
  `RewardProgressCard` from `@jojopotato/ui`); plan text now frames it as a style reference only.
- Section G (Cart apply-flow rewire #24): PASS — `handleApplyCoupon`'s current stub comment and `Alert`
  pattern match the plan's description verbatim (confirmed via full read of `cart.tsx`); `checkout.tsx`
  confirmed to be a bare `ComingSoon` placeholder, consistent with the plan's own "read first" gate.

Open gaps: none blocking. See `## Known Gaps / Follow-ups` for the 7 documented out-of-scope/deferred
items (all pre-existing project decisions or explicitly out-of-scope this round, not blockers).

What this coverage does NOT prove:
- The Fully-Automated typecheck/lint gate proves the code compiles and matches style conventions — it
  does NOT prove any runtime behavior (eligibility outcomes, discount math, navigation correctness, or
  the tab-bar fix actually rendering 5 tabs).
- The Agent-Probe rows prove the specific scenario walked through on one simulator/device session — they
  do NOT prove behavior across all device sizes, OS versions, or concurrent-session conditions, and they
  are not repeatable/regression-safe (no automated re-run without a human re-walking each scenario).
- The Known-Gap row (`eligibility-engine-unit-logic`) means the 6-check waterfall and discount-calc
  branches are proven only at the outcome level (via Agent-Probe scenarios), not at the unit/function
  level — a future refactor of `eligibility.ts` could silently break internal logic while still passing
  every currently-listed Agent-Probe scenario if the refactor happens to preserve those specific outcomes.
- Nothing in this coverage proves DB/API correctness — there is no DB/API in this round's scope.

Gate: PASS (no FAILs, plan updated — 3 VALIDATE-found gaps fixed in-plan: tab-bar auto-registration
mitigation (Touchpoint #10 / step 5b / new Verification Evidence + test-gate row), client/server
value-unit divergence documented in Known Gaps, and the `RewardsTeaserCard` premise corrected in
Section F step 8)
Accepted by: N/A — Gate is PASS; no unresolved CONCERNs required user acceptance. All 3 gaps VALIDATE
found were fixed directly in the plan text (see Dimension findings) rather than deferred as accepted
concerns.

## Autonomous Goal Block

SESSION GOAL: Ship the screens-only, mock-data Deals feature (list #22, details #23, cart-apply #24) for `apps/mobile`, client-side eligibility/discount logic included, no backend wiring.
Charter + umbrella plan: N/A — single plan (no umbrella/phase-program plan exists for `rewards-notifications`; this is a standalone COMPLEX plan).
Autonomy: Standard /goal autonomous execution rules (`process/development-protocols/orchestration.md` §Autonomous /goal Phase Program Execution) — self-decide at V5-equivalent gates; CONDITIONAL → apply fixes, proceed; BLOCKED → backlog + continue; irreversible/outward-facing action without explicit contract instruction → hard stop (none apply to this plan — no deploy/publish/destructive-data actions in scope).
Hard stop conditions / safety constraints:
- Do not touch `packages/types/src/cart.ts`, `AppliedDiscount`, or `useCart()` method signatures (Locked Decision #3).
- Do not touch `packages/types/src/coupons.ts` (Locked Decision #4 / Checklist A.2).
- Do not register `deals` as a `Tabs.Screen` / do not add it to any platform `_layout.{ios,android,web}.tsx` Tabs list (Locked Decision #1) — reachability is via `router.push` + the `floating-tab-bar.tsx` route filter (step 5b) only.
- Do not touch `packages/api` schema/routes or any DB/migration surface (out of scope this round).
- Do not skip Checklist step 5b (`floating-tab-bar.tsx` route filter) — required to avoid an unintended 6th tab button (VALIDATE finding).
Next phase: EXECUTE: `process/features/rewards-notifications/active/deals-screens_13-07-26/deals-screens_PLAN_13-07-26.md` (section order A → B → C → D[incl. 5b] → E → F → G).
Validate contract: inline in plan (`## Validate Contract` section, this file).
Execute start: Fully-auto: `pnpm -C apps/mobile exec expo start` (once, Ctrl-C) then `pnpm -C apps/mobile exec tsc --noEmit` && `pnpm -C apps/mobile exec eslint src` | Agent-probe pack: 17 manual scenario rows in Verification Evidence / Test gates table | high-risk pack: no (no high-risk class present).
