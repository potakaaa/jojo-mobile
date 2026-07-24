---
name: plan:mobile-ui-batch-a
description: "Client-side mobile UI/UX fixes batch (Track A of 13): option price deltas, product-screen state reset, coupon card layout, order-history sticky header, tab-icon scroll-to-top, branches bottom-sheet drag-to-peek, star-history order linkback"
date: 22-07-26
feature: general
---

# PLAN — Mobile UI Batch A (Client-Side Polish, 7 items)

Date: 22-07-26
Status: VALIDATE PASS — ready for EXECUTE
Complexity: SIMPLE

**Complexity classification: SIMPLE.** Every item is a single-session, client-only fix with a known
file target and no schema/API/auth changes (per `planning/all-planning.md` and the SPEC's own Out of
Scope). I'm keeping INNOVATE's call — the batch is wide (7 unrelated items across 8+ files) but each
item individually is a 1-2 file change with a clear before/after. Treating it as one SIMPLE plan
(not 7 micro-plans) avoids process overhead while still tracking each item's checklist/gates
separately below.

## TL;DR

7 independent client-side UI fixes in `apps/mobile` + `packages/ui`. Widest blast radius is A1
(shared `FlavorSelector`/`SizeSelector`/`AddOnSelector` prop contract — affects every consumer).
A5's scope is smaller than it looks: pop-to-root already works, only scroll-to-top is new. A6 ships
a small, honestly-labeled peek snap point with map-pannability UNVERIFIED until the AC18 device
walkthrough. All 21 ACs are captured with tier-honest verification (10 Fully-Automated, 11
Agent-Probe — this repo has no RN E2E/navigation runner). VALIDATE re-verified every load-bearing
claim against source this pass (all confirmed accurate) and closed 3 mechanical gaps directly in
the checklist below (A2 prop-threading, A3 code-detection mechanism, A5 Branches scroll target) —
see `## Validate Contract`.

---

## Overview

Fix 7 small, user-reported UX defects in the customer-facing mobile app, all resolvable with
`apps/mobile` + `packages/ui` changes only (no `packages/api` work). See the locked SPEC at
`process/general-plans/active/mobile-ui-batch-a_22-07-26/mobile-ui-batch-a_SPEC_22-07-26.md` for
full behavioral outcomes, flow diagrams, and the 21 acceptance criteria — this plan does not restate
that content, it operationalizes it.

## Goals

- A1: show non-zero option price deltas on Flavor/Size/AddOn selector rows; hide zero-delta rows entirely.
- A2: reset Product Details screen state (quantity, selection, pendingSwitch) when `productId` changes.
- A3: fix the applied-coupon card so it never looks like a dead button and never wraps/clips text.
- A4: make the Order History sticky section header render opaque at every scroll position.
- A5: make tapping the active tab's icon reliably reset that tab (pop-to-root if nested, else scroll-to-top if already at root) — closing the scroll-to-top gap only; pop-to-root already exists.
- A6: give the Branches bottom sheet a smaller peek snap point so it's not stuck at 32% minimum (map-pannability-at-peek stays unverified pending device walkthrough).
- A7: link star-history rows with a non-null `orderId` to that order's detail screen.

## Scope

In scope: the 7 items above, `apps/mobile` + `packages/ui` only. Out of scope: everything listed in
the SPEC's `## Out Of Scope` section (Track B items, backend/API changes, admin-side option editing,
general scroll-restoration architecture, bottom-sheet redesign, building an E2E runner).

## Acceptance Criteria

This plan carries all 21 acceptance criteria from the locked SPEC (AC1-AC21) verbatim — see
`mobile-ui-batch-a_SPEC_22-07-26.md`'s `## Acceptance Criteria (Testable Outcomes)` section for the
full text of each. The `## Verification Evidence` table below maps every AC to its proving gate and
strategy tier. This plan does not restate the AC text to avoid drift between the two documents —
treat the SPEC as the source of truth for exact AC wording and this plan as the source of truth for
how each AC is proven.

---

## Touchpoints

| Item | Files (verified by direct read this session) |
|---|---|
| A1 | `packages/ui/src/components/{flavor,size,addon}-selector.tsx` (prop types + render), `apps/mobile/src/features/menu/components/option-group-selector.tsx` (lines 65-86, mapping), `packages/ui/src/components/component-showcase.tsx` (must keep typechecking), existing tests `packages/ui/src/components/__tests__/{flavor,size}-selector.test.tsx` (update — VALIDATE-confirmed these are currently 8-line smoke tests only, "renders without throwing"; real assertions are new work, not a rewrite of substantial existing coverage), new `addon-selector.test.tsx` (none exists today), `packages/ui/src/index.ts` if a new shared price-delta formatter is exported |
| A2 | `apps/mobile/src/app/(tabs)/product/index.tsx` (full file — extract inner keyed component); no existing test file for this screen — new file |
| A3 | `packages/ui/src/components/coupon-card.tsx` (full file, 98 lines — verified above), `apps/mobile/src/app/(tabs)/cart/index.tsx` (lines 460-473, call site — VALIDATE found this call site ALSO needs to change for the code-detection fix, not just verified-unchanged, see step 18a below), existing `packages/ui/src/components/__tests__/coupon-card.test.tsx` (update — VALIDATE-confirmed currently an 8-line smoke test only) |
| A4 | `apps/mobile/src/app/(tabs)/history/index.tsx` (lines 148, 165-166 — `stickySectionHeadersEnabled`, `renderSectionHeader`, `theme.background`), existing `apps/mobile/src/features/orders/__tests__/history-screen-dark-mode.test.tsx` (extend or add adjacent test) |
| A5 | `apps/mobile/src/components/floating-tab-bar.tsx` (lines 332-351, `onPress` handler), `apps/mobile/src/components/floating-tab-bar.helpers.ts` (add pure decision function here — already the vitest-safe, RN-free module with its own test file `apps/mobile/src/components/__tests__/floating-tab-bar.helpers.test.ts`), each tab-root screen needs a registered scroll ref/callback: `(tabs)/index.tsx` (Home), `(tabs)/order/index.tsx`, `(tabs)/rewards/index.tsx`, `(tabs)/branches/index.tsx` |
| A6 | `apps/mobile/src/app/(tabs)/branches/index.tsx` (line 315, `SNAP_POINTS` array; lines 250-258, `<BottomSheet>` props) |
| A7 | `apps/mobile/src/app/(tabs)/rewards/index.tsx` (lines 295-320, star-history `.map()`), `apps/mobile/src/features/orders/lib/navigate-to-tracking.ts` (reuse `useNavigateToOrderTracking()` verbatim, verified export at line 50), existing `apps/mobile/src/app/(tabs)/rewards/__tests__/rewards-screen.test.tsx` (extend) |

**Correction to inherited SPEC line numbers:** SPEC cites `option-group-selector.tsx:66-85` for the
mapping logic; direct read this session shows it's lines 65-86 (the `flavor`/`size`/`add_on`
ternary block including the closing `)}`). Off-by-one only, noted for EXECUTE's benefit.

**VALIDATE re-verification note:** every file/line citation in this table was re-confirmed by a
direct read this pass (not just trusted from PLAN) — `Size.priceModifierCents` exists and is
already consumed at `cart-item.tsx:30`; `floating-tab-bar.tsx:341-347` pop-to-root logic exists
exactly as described; `CouponCard` has exactly one real consumer (`cart/index.tsx`) besides the dev
showcase; no test files exist yet for `product/index.tsx` or `addon-selector.tsx`;
`useNavigateToOrderTracking()` exists at the cited path with the cited signature and its target
route (`/(tabs)/tracking`) is correct against the current NAV-004/NAV-005 route tree; the A5 tab
`_layout.tsx` nesting claim (only Account has genuinely-nested pushed screens) is confirmed by
direct read of all 5 tabs' layout files.

## Public Contracts

- **`FlavorSelectorProps.flavors: Flavor[]`** — `Flavor` (`packages/types/src/flavors.ts`) gains an
  optional `priceDeltaCents?: number` field. Additive, no breaking change to existing callers that
  omit it.
- **`AddOnOption` interface** (locally declared in `addon-selector.tsx`, not `packages/types`) gains
  an optional `priceDeltaCents?: number` field. Additive.
- **`SizeSelectorProps.sizes: Size[]`** — NO type change. `Size.priceModifierCents?: number` already
  exists (`packages/types/src/sizes.ts:4`) and is already read by `cart-item.tsx:30`.
  `SizeSelector` itself just needs to start reading it in render — this is a render-only change to
  `size-selector.tsx`, not a type change.
- **New shared formatter** (name TBD by EXECUTE, e.g. `formatPriceDelta(deltaCents: number, mode:
  ThemeMode): { text: string | null; style }` or similar) exported from `packages/ui`, consumed by
  all 3 selectors. Must return `null`/empty for `0`, a leading-`+` string via `formatCurrency` for
  positive, and a visually-distinct (non-`+`) treatment for negative. This is new shared surface —
  document its signature in the EXECUTE report once finalized. **VALIDATE note:** `formatCurrency`
  (`packages/utils/src/currency.ts`) does NOT prepend its own `-` sign for positive input and
  correctly renders a leading `-` for negative input via `Intl.NumberFormat`'s locale-default
  negative format — confirmed by direct read, so `` `+${formatCurrency(deltaCents)}` `` for
  positive and plain `formatCurrency(deltaCents)` for negative (already `-`-prefixed) produces the
  required visual distinction with no double-negative risk. For the "distinct color" half: `Colors[mode].accent`
  (`packages/ui/src/theme.ts`, resolves to `Palette.jred` in both light and dark) already exists and
  is already used elsewhere (`coupon-card.tsx`'s `discount` text) — reuse it for the negative-delta
  color rather than inventing a new token.
- **`option-group-selector.tsx`'s 3 mapping call sites** (lines 65-86) must stop dropping
  `option.priceDeltaCents` when building the `{id,name}`/`{id,label}` shapes passed to the 3
  selectors.
- No `packages/api` contract changes anywhere in this batch (SPEC-locked).

## Blast Radius

**A1 is the widest-radius item in this batch.** It changes the prop shape of 2 shared
`packages/ui` components (`Flavor`, `AddOnOption`) consumed by every screen that renders those
selectors — confirmed single real consumer chain is `option-group-selector.tsx` → `product/index.tsx`
(Product Details), but `packages/ui`'s own `component-showcase.tsx` dev route also renders all 3
selectors directly with fixture data and must keep typechecking/rendering. Existing selector test
suites are widened, not just added to (SPEC constraint, explicit — VALIDATE confirms these existing
suites are currently trivial 8-line smoke tests, so "widening" here means adding real assertions,
not modifying substantial pre-existing coverage). Risk class: low (pure additive prop, no
schema/API/auth surface) but wide file-count. Everything else (A2-A7) is single-file-or-two,
independent, and does not interact with A1 or each other.

**Risk-class check:** none of the 7 items touch auth/identity, billing/credits, schema/migration,
public API contracts, deploy/container/proxy, or secrets/trust-boundary logic (SPEC-locked, no
backend changes at all). No high-risk evidence pack required — VALIDATE confirms this by direct
grep: zero `packages/api` files anywhere in this plan's Touchpoints.

---

## Implementation Checklist

### A1 — Option price deltas (widest blast radius — do first, since A2 also touches `product/index.tsx`)

1. Add `priceDeltaCents?: number` to `Flavor` (`packages/types/src/flavors.ts`).
2. Add `priceDeltaCents?: number` to `AddOnOption` (`packages/ui/src/components/addon-selector.tsx`).
3. Confirm `Size.priceModifierCents?: number` (`packages/types/src/sizes.ts:4`) needs no type change (already exists).
4. Add a shared price-delta formatter to `packages/ui` (new small pure function + export from `packages/ui/src/index.ts`) that: returns `null` for `0`; returns a leading-`+`-prefixed string via `formatCurrency` (`packages/utils/src/currency.ts`) for positive; returns a visually-distinct (non-`+`, e.g. plain `formatCurrency` output, which already renders leading `-`) treatment for negative. Take a `mode: ThemeMode` param for the color token — use `Colors[mode].accent` for the negative case (see Public Contracts note above; do not invent a new token). Keep it a pure function returning `{text, style?}` or similar so it's trivially testable.
5. Update `flavor-selector.tsx` render to show the formatted delta next to each flavor's name when `flavor.priceDeltaCents` is non-zero/non-undefined.
6. Update `size-selector.tsx` render to show the formatted delta next to each size's label when `size.priceModifierCents` is non-zero/non-undefined.
7. Update `addon-selector.tsx` render to show the formatted delta next to each option's name when `option.priceDeltaCents` is non-zero/non-undefined.
8. Update `option-group-selector.tsx` (lines 65-86): stop dropping `priceDeltaCents` in all 3 mapping ternaries — pass it through to `{id, name, priceDeltaCents}` / `{id, label, priceModifierCents}` shapes.
9. Verify `component-showcase.tsx` still typechecks/renders — add a non-zero-delta fixture to its selector demo props if it currently only has zero-delta data (so the showcase actually demonstrates the new behavior).
10. Update `packages/ui/src/components/__tests__/flavor-selector.test.tsx` and `size-selector.test.tsx` for the new price-delta rendering rule (zero-hidden / positive-shown-with-plus / negative-visually-distinct). Add a new `packages/ui/src/components/__tests__/addon-selector.test.tsx` (none exists today) covering the same rule. Both existing files today are 8-line "renders without throwing" smoke tests — this is genuinely new assertion coverage, not a rewrite.
11. Add/extend a component test on `product/index.tsx` (or the price-total logic it already has) asserting `unitPriceCents` still equals `base + sum(selected deltas)` exactly once per-row display text is added (AC4) — this can ride the same new test file created for A2 (step 20 below), since both touch the same screen.

### A2 — Product Details state reset on navigate

12. In `apps/mobile/src/app/(tabs)/product/index.tsx`, extract the state-holding JSX (everything from the `groups`/`selectedOptions`/`unitPriceCents`/`canAdd` memos through the returned `<View>` tree, i.e. lines ~57-357 minus the loading/error early returns and the `useHideTabBarWhile`/`useToast` hooks) into an inner component, e.g. `ProductDetailsBody`, taking `product`/`selectedBranch`/`cart` (or the narrower props it actually needs) as props.
   - **12a (VALIDATE — closes a real gap):** the extracted body also references `showToast`/`hideToast`/`toast` (from the outer `useToast()`, used inside `handleAdd`, `confirmBranchSwitch`, and the `<Toast>` JSX) and `insets` (used in the `<Toast>` JSX's `bottomOffset`). These hooks stay in the OUTER `ProductDetailsScreen` per step 13, so they must be threaded into `ProductDetailsBody` as explicit props (`showToast`, `hideToast`, `toast`, and either `insets` as a prop or have the inner component call `useSafeAreaInsets()` itself — the latter is simpler since insets are not product-scoped and cheap to re-derive; EXECUTE's call). Missing this is a TypeScript compile error (caught by `pnpm --filter @jojopotato/mobile typecheck`), not a silent runtime bug, but listing it explicitly avoids a wasted edit-compile-fix cycle.
13. In the outer `ProductDetailsScreen`, keep: `useHideTabBarWhile(useIsFocused())`, `useToast()`, the `useProductDetails(productId)` fetch, `useCart()`, `useBranch()`, and the loading/error early-return branches (unchanged, still render their own `ScreenHeader`).
14. Render `<ProductDetailsBody key={productId} .../>` from the outer component once `product` is loaded — the `key={productId}` forces React to fully remount the inner component (and all its `useState`) on every `productId` change, resetting `quantity`, `selection`, and `pendingSwitch` in one mechanism (INNOVATE's chosen approach — no manual per-field reset list, no `useEffect`-driven reset which the repo's `react-hooks/set-state-in-effect` ESLint rule bans).
15. Re-verify `canAdd`/required-option validation reads the (now correctly reset) `selection` state — no code change expected here since it already derives from `selection`, but confirm after the extraction that the memo dependencies are still correct inside the inner component.

### A3 — Coupon card layout

16. In `packages/ui/src/components/coupon-card.tsx`: change `codeChip` to render conditionally — only render the `Palette.jyellow` pill treatment when `coupon.code` is present (non-empty/non-undefined). **(VALIDATE — replaces the original "detect a genuine short code via heuristic" framing, which had no deterministic mechanism.)** Do the genuine-code-vs-label decision at the CALL SITE (step 18a below), not inside `CouponCard` via string-shape guessing (e.g. length/format heuristics) — the call site already knows definitively whether a real code exists.
17. Add `numberOfLines={1}`/`flexShrink`/layout guards so the coupon `title` (already `numberOfLines={1}` at line 47 — confirm this still applies post-change) and `discountLabel` (line 50, currently NO `numberOfLines` guard) cannot clip to "Ap…" or wrap mid-number.
18. In `apps/mobile/src/app/(tabs)/cart/index.tsx` (line 468): route `discountLabel: appliedDeal?.discountLabel ?? \`-${(discountTotalCents / 100).toFixed(2)}\`` through the existing `formatCurrency` helper instead of hand-rolled `.toFixed(2)` math (matches the SPEC's money-formatting constraint) — becomes `` `-${formatCurrency(discountTotalCents)}` `` (VALIDATE-confirmed `formatCurrency` does not prepend its own `-`, so no double-negative risk).
   - **18a (VALIDATE — closes the A3 mechanism gap, pairs with step 16):** at this same call site (line 465), stop falling back to `cart.appliedDiscount.label` for the `code` field — pass `code: appliedDeal?.code` as-is (`undefined` when no real code exists). This requires `CouponCardProps.coupon.code` (currently `Coupon.code: string`, required, from `packages/types/src/coupons.ts`) to become optional for this call site — either widen `Coupon.code` to `string | undefined` (blast radius confirmed small: only `notification-factory.ts`/`.test.ts` and `component-showcase.tsx` import `Coupon`, and neither reads `.code`), or type `CouponCardProps.coupon` as a local variant with `code?: string`. EXECUTE picks whichever is less invasive; either is fine since `title`/`discountLabel` must still render the coupon's name/amount regardless of whether a real code exists (only the pill visibility changes).
19. Verify the `Pressable`'s `accessibilityRole={onPress ? 'button' : undefined}` (line 31) already correctly reflects tappability — `CouponCard`'s cart usage passes no `onPress`, so this should already be non-button; confirm no visual affordance elsewhere implies otherwise once the `codeChip` pill is removed for label-only cases.
20. Update `packages/ui/src/components/__tests__/coupon-card.test.tsx` (currently an 8-line smoke test): add a case with a long coupon title + long discount amount (e.g. "-₱1,289.00") asserting no truncated/ellipsized text node and no forced 2-line wrap on the amount; add a case asserting the pill is absent when `coupon.code` is undefined and present when it is a real code; add a case asserting the "Remove discount" button (rendered by the cart screen, not `CouponCard` itself — confirm whether this assertion belongs in a cart-level test instead) still fires.
21. **Blast-radius check (SPEC constraint):** grep for other `CouponCard` consumers beyond cart before finalizing — VALIDATE already confirmed (this session) there is exactly one real consumer (`cart/index.tsx`) besides the dev showcase, so this check is a final confirmation, not expected to surface anything new.

### A4 — Order History sticky header opacity

22. In `apps/mobile/src/app/(tabs)/history/index.tsx` (around lines 165-166), investigate why `backgroundColor: theme.background` on the section header (already present) isn't compositing opaquely against scrolling rows — likely fix is wrapping the header content in an explicitly-opaque container `View` (not relying on the `SectionList`'s own sticky-header layer to composite the background correctly), or adding `elevation`/`zIndex` if Android layering is the cause. EXECUTE decides the exact mechanism after reproducing on-device (this is a runtime compositing bug, not a static-source bug — see SPEC's Background section).
23. Add/extend a component-level regression test (new or in `history-screen-dark-mode.test.tsx`) asserting the section header element receives an explicit, non-transparent `backgroundColor` style tied to the current theme (AC13 — proves prop-wiring only, not on-screen compositing).

### A5 — Tab-icon tap two-stage reset (pop-to-root already exists; add scroll-to-top)

24. Confirm via direct verification (already done this session, see Background below): pop-to-root (`navigation.navigate(route.name, { screen: 'index' })`, `floating-tab-bar.tsx:347`) already exists and works for all 5 tabs. **Do not reimplement.**
25. Confirm which tabs have genuinely-nested (not sibling-of-tabs) pushed screens per NAV-005: per SPEC/INNOVATE, only Account (`edit-profile`, `help`) still nests inside its own tab stack; Home/Order/Rewards/Branches own only their root screen (their formerly-nested detail screens — Product/Cart/Tracking/History/Branch — moved to top-level `(tabs)/{...}` siblings). VALIDATE re-confirmed this by direct read of all 5 tabs' `_layout.tsx` files this session — the claim is accurate.
26. Add a module-level scroll-callback registry to `floating-tab-bar.tsx`, mirroring the existing `hideRequests`/`tabBarListeners` `Set` + subscribe convention already in the file (lines 30-43): e.g. `const scrollToTopCallbacks = new Map<string, () => void>()` keyed by route name, with a `registerScrollToTop(routeName, callback)` hook export.
27. In each tab-root screen with a scrollable list/ScrollView that should reset on stage-2 tap — Home (`(tabs)/index.tsx`), Order (`(tabs)/order/index.tsx`), Rewards (`(tabs)/rewards/index.tsx`) — call `registerScrollToTop(routeName, () => scrollRef.current?.scrollTo({y:0, animated:true}))` (or `scrollToOffset` for FlatList/SectionList) in a `useEffect`, unregistering on unmount.
   - **27a (VALIDATE — locks the Branches target, resolving a flagged ambiguity):** for Branches (`(tabs)/branches/index.tsx`), "scroll-to-top" means reset the `<BottomSheet>` to its lowest snap point via `sheetRef.current?.snapToIndex(0)` — NOT scrolling the `BottomSheetFlatList` contents. Rationale: the visible "top" of the Branches tab is the map; there is no independent page-level scroll position the way Home/Order/Rewards have, and the sheet's own position is the analogous "start of the tab" state. If the sheet is already at index 0, this call is a no-op, consistent with how a second tap on an already-scrolled-to-top list is a no-op elsewhere. This was previously left as an open EXECUTE judgment call in this plan; VALIDATE locks it here to avoid mid-EXECUTE ambiguity.
28. Update `floating-tab-bar.tsx`'s `onPress` handler (lines 332-351): when `isActive` AND the tab is already at root (use `isNestedTabRoute(focusedTab)` — already imported and used at line 290 for the bar-hide logic — reuse it here for the decision), call the registered scroll-to-top callback instead of (or in addition to, per the two-stage rule — actually INSTEAD of, since stage 1/2 are mutually exclusive per AC15) `navigation.navigate`. When `isActive` AND NOT at root, keep the existing pop-to-root call and do NOT also invoke scroll.
29. Add the pure decision function to `floating-tab-bar.helpers.ts` (RN-free, vitest-testable — same reasoning as the existing `isNestedTabRoute`): e.g. `decideTabTapAction(isSameTabReTap: boolean, isAtRoot: boolean): 'pop-to-root' | 'scroll-to-top' | 'no-op'`. This is what AC16 tests — isolated from actual navigation/scroll calls via injected/mocked callbacks.
30. Add tests to `apps/mobile/src/components/__tests__/floating-tab-bar.helpers.test.ts` for the new decision function (AC16): same-tab-re-tap + not-at-root → `pop-to-root`; same-tab-re-tap + at-root → `scroll-to-top`; different-tab tap → `no-op` (existing `navigation.navigate` behavior, untouched).

### A6 — Branches bottom sheet peek snap point

31. In `apps/mobile/src/app/(tabs)/branches/index.tsx` (line 315), change `SNAP_POINTS = ['32%', '50%', '92%']` to add a smaller peek value below 32%, e.g. `['12%', '32%', '50%', '92%']` (exact percentage is EXECUTE's call — should be small enough to feel like a genuine "peek" while the sheet's fixed header stays visible per lines 259-270's `sheetHeader`). Keep `index={0}` unless the new smallest snap point should NOT be the initial position (SPEC doesn't require changing the initial position, only that dragging down reaches a peek — verify with orchestrator/user intent if ambiguous, but default to leaving `index={0}` unchanged unless it breaks the peek-is-smallest assumption).
32. **Explicitly do NOT add** `enablePanDownToClose` (would fully dismiss the sheet — SPEC-rejected, and VALIDATE-confirmed absent from current props) or any `simultaneousHandlers`/gesture-arbitration config — INNOVATE's staged-fix decision is this ONE change only, nothing else.
33. No new automated test — AC17/AC18 are device-only per SPEC (native `@gorhom/bottom-sheet` gesture behavior, no automated coverage possible in this repo's test setup).

### A7 — Star history order linkback

34. In `apps/mobile/src/app/(tabs)/rewards/index.tsx`, import `useNavigateToOrderTracking` from `@/features/orders/lib/navigate-to-tracking` (VALIDATE-confirmed export, signature `(): (orderId: string) => void`).
35. Call `const navigateToOrderTracking = useNavigateToOrderTracking();` once near the top of `RewardsScreen`.
36. In the star-history `.map()` (lines 295-320), wrap the row (`historyRow` `View`) in `Pressable` ONLY when `tx.orderId != null`, calling `navigateToOrderTracking(tx.orderId)` on press; null-`orderId` rows stay a plain `View` unchanged.
37. Add a visible order reference to order-linked rows (e.g. a small "Order #..." or short label text — exact copy/format is EXECUTE's call; check whether `StarTransaction` exposes an order number or only `orderId` — if only the raw id, consider a short truncated reference or a generic "View order" affordance instead of a raw UUID).
38. Update `apps/mobile/src/app/(tabs)/rewards/__tests__/rewards-screen.test.tsx`: add cases for AC19 (non-null `orderId` row renders a reference + tappable + navigates with correct id) and AC20 (null-`orderId` row renders with no reference, not tappable).

### Cross-cutting

39. Run the full gate command list (below) after each item's checklist steps complete — do not batch all 7 items to the end; fix failures inline per-item before moving to the next.
40. Confirm `mode: ThemeMode` stays a REQUIRED prop (no default) on every touched/new `packages/ui` component — `guard:theme-mode` and `packages/ui` typecheck both enforce this.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `flavor-selector.test.tsx` mixed zero/non-zero fixture: zero row has no price text node, non-zero row has leading-`+` text | Fully-Automated | AC1, AC2 |
| `size-selector.test.tsx` same rule via `priceModifierCents` | Fully-Automated | AC2 |
| new `addon-selector.test.tsx` same rule via `AddOnOption.priceDeltaCents` | Fully-Automated | AC2 |
| synthetic negative-delta fixture: rendered text differs in sign/format from positive case | Fully-Automated | AC3 |
| product screen / total-math test: `unitPriceCents` still equals base+deltas after per-row display added | Fully-Automated | AC4 |
| on-device light+dark walkthrough: price-delta text legible, no crowd/truncate | Agent-Probe | AC5 |
| new product-details reset test: mount, simulate `productId` param change, assert `quantity`→1 and `selection`→{} | Fully-Automated | AC6 |
| same test extended: add-to-cart eligibility recomputes correctly for Product B | Fully-Automated | AC7 |
| on-device walkthrough: Product A→B→C via ≥2 real nav paths, no leftover state | Agent-Probe | AC8 |
| `coupon-card.test.tsx` short+long discount, long title: no truncated/ellipsized text, no forced 2-line wrap, pill absent when `code` undefined | Fully-Automated | AC9 |
| interaction test: "Remove discount" handler still fires after layout change | Fully-Automated | AC10 |
| on-device light+dark walkthrough: coupon row matches reference screenshot intent | Agent-Probe | AC11 |
| on-device walkthrough: sticky header opaque at every scroll position | Agent-Probe | AC12 |
| component test: section header receives explicit non-transparent background style tied to theme | Fully-Automated | AC13 |
| on-device walkthrough: tap active tab at root → smooth scroll to top (or `snapToIndex(0)` for Branches) | Agent-Probe | AC14 |
| on-device walkthrough: tap active tab while nested → pop to root, no scroll in same gesture | Agent-Probe | AC15 |
| `floating-tab-bar.helpers.test.ts` new decision-function unit tests (3 cases: pop/scroll/no-op) | Fully-Automated | AC16 |
| on-device walkthrough: drag sheet down from any snap point → settles at peek, handle visible | Agent-Probe | AC17 |
| on-device walkthrough: at peek, pan on visible map area pans map; sheet re-expands by drag/tap | Agent-Probe | AC18 (UNVERIFIED mechanism — see honest note below) |
| `rewards-screen.test.tsx` order-linked row: renders reference, tappable, navigates with correct id | Fully-Automated | AC19 |
| `rewards-screen.test.tsx` null-orderId row: no reference, not tappable | Fully-Automated | AC20 |
| on-device walkthrough: tap real linked row → correct order detail → back returns to Rewards | Agent-Probe | AC21 |

**Gate commands (run per-item, then full suite at the end):**

```
pnpm --filter @jojopotato/ui test
pnpm --filter @jojopotato/ui typecheck
pnpm --filter @jojopotato/ui check-tokens
pnpm --filter @jojopotato/mobile test
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/mobile guard:theme-mode
pnpm --filter @jojopotato/mobile lint
pnpm format:check
```

All 8 commands VALIDATE-confirmed to exist exactly as written (`apps/mobile/package.json`,
`packages/ui/package.json`, root `package.json` scripts read directly this session).

**Honest AC18 note (A6):** the SPEC and INNOVATE both flag that map-pannability-at-peek is
UNVERIFIED — RNGH-vs-native-`expo-maps` touch arbitration cannot be determined from source, and no
container/probe can settle it. The single checklist item (#31) is a staged fix, not a proven one.
The AC18 device walkthrough must record BOTH possible outcomes explicitly:
- **Outcome 1 — AC18 MET:** sheet collapses to peek AND panning the visible map pans the map → A6
  is fully done.
- **Outcome 2 — AC18 NOT MET, blocks VERIFIED:** sheet collapses but panning the visible map
  drags/expands the sheet instead → **the plan may NOT be stamped `VERIFIED`.** Record AC18 as
  failed, file a scoped gesture-tuning follow-up citing the real observed symptom, and keep this
  plan in `active/` until that follow-up lands and AC18 is re-walked to Outcome 1.

  Attribution note, which is NOT an acceptance clause: Outcome 2 is not a regression introduced by
  this plan — the cause would be a deeper RNGH/native-map interaction that predates it. That
  affects who fixes it and where, not whether the criterion is satisfied.

> **CORRECTION (CodeRabbit, PR #156).** Outcome 2 previously read "NOT a failure of this plan …
> do not treat as this plan's defect", with no statement about VERIFIED. That conflated two
> different questions and let one answer both: *whose fault is it* (not this plan's — true) and
> *is AC18 met* (no — the map does not pan). The original wording was written to stop the opposite
> error, over-claiming that pannability was fixed, and it did prevent that. But as written it also
> permitted a walkthrough to hit Outcome 2, file a follow-up, and still stamp the plan VERIFIED
> with a required acceptance criterion failing — the same vacuous-green pattern this PR's review
> cycles exist to catch. AC18 now blocks VERIFIED on Outcome 2 regardless of attribution.
>
> Status at time of correction: the sheet-collapse half IS genuinely fixed — removing the sheet
> list's `onRefresh` cleared gorhom's `refreshable && isSheetAtHighestSnapPoint` gesture bail-out
> (`useGestureEventsHandlersDefault`), which was why content drags could not collapse the sheet
> from its top snap. Map pannability at peek remains **unverified**; no device run has happened.

VALIDATE confirms this wording is precise enough to act on: it names exactly two outcomes, states
which one counts as "done", states plainly that the other blocks VERIFIED, and separates
attribution from acceptance so neither can be mistaken for the other.

---

## Test Infra Improvement Notes

(none identified yet)

---

## Phase Completion Rules

This plan is **CODE DONE** when all Fully-Automated gates above are green (all typecheck/lint/test/
guard commands in the Verification Evidence gate-command block pass) and the full Implementation
Checklist (items 1-40, including VALIDATE-added sub-items 12a/18a/27a) is complete.

This plan is **VERIFIED** only when, in addition to CODE DONE, ALL 11 Agent-Probe items above
(AC5, AC8, AC11, AC12, AC14, AC15, AC17, AC18, AC21, plus the light+dark passes implied by AC5/AC11)
have been performed on-device and recorded, including the AC18 dual-outcome note. A CODE-DONE-but-
not-VERIFIED state is expected and normal for this plan — do not archive to `completed/` until the
device walkthroughs are done; keep the task folder in `active/`.

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/mobile-ui-batch-a_22-07-26/mobile-ui-batch-a_PLAN_22-07-26.md`
2. **Last completed phase or step:** VALIDATE complete — Gate: PASS.
3. **Validate-contract status:** written below.
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`, locked SPEC at `mobile-ui-batch-a_SPEC_22-07-26.md`.
5. **Next step for a fresh agent:** route to EXECUTE with item A1 first (widest blast radius, and A2 also touches `product/index.tsx` so sequencing A1 before A2 avoids re-touching the same file twice mid-edit). Items A3-A7 are independent of each other and of A1/A2 and can run in any order after A1/A2 land.
6. **Next RIPER-5 instruction:** say "ENTER EXECUTE MODE" to proceed.

---

## Validate Contract

Status: PASS
Date: 22-07-26
date: 2026-07-22
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 0/7 signals present (single-package-pair scope confined to `apps/mobile` +
`packages/ui`; no schema/API/auth surface; the 7 items are independent 1-2-file fixes, not 3+
meaningfully divergent architectural directions; not a phase program; user did not request depth;
no high-risk class; blast radius is wide in file-COUNT for A1 only, not in complexity). A
sequential, per-item EXECUTE pass (as the plan's own Implementation Checklist already orders:
A1 → A2 → A3-A7 in any order) is the right fit — no parallel fan-out or agent team needed for
implementation. This VALIDATE pass itself used a single-agent read-through (not a multi-agent
fan-out) given the SIMPLE classification and the extensive source-verification the orchestrator
requested, which is better served by one agent building cumulative context across all 7 items than
by splitting Layer 1/Layer 2 across parallel agents for a plan this size.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | zero-delta option row shows no price text; non-zero shows leading `+` | Fully-Automated | `packages/ui/src/components/__tests__/flavor-selector.test.tsx` mixed-fixture case | A |
| AC2 | zero-hidden/non-zero-shown rule holds across Flavor/Size/AddOn selectors | Fully-Automated | `flavor-selector.test.tsx` + `size-selector.test.tsx` + new `addon-selector.test.tsx` | A |
| AC3 | negative delta renders visually distinct from positive | Fully-Automated | synthetic negative-delta fixture in the 3 selector test files | A |
| AC4 | `unitPriceCents` still equals base+deltas after per-row display added | Fully-Automated | new/extended `apps/mobile/src/app/(tabs)/product/__tests__/index.test.tsx` (total-math case) | A |
| AC5 | price-delta text legible in light+dark, no crowd/truncate | Agent-Probe | on-device walkthrough | A |
| AC6 | Product A→B navigation resets quantity=1, selection={} | Fully-Automated | new `apps/mobile/src/app/(tabs)/product/__tests__/index.test.tsx` (product-id-change reset case) | A |
| AC7 | add-to-cart eligibility recomputes correctly post-reset for Product B | Fully-Automated | same test file, extended | A |
| AC8 | A→B→C sequence via ≥2 real nav paths shows no leftover state | Agent-Probe | on-device walkthrough | A |
| AC9 | no truncated/ellipsized coupon text, no forced 2-line wrap, pill absent when no real code | Fully-Automated | `packages/ui/src/components/__tests__/coupon-card.test.tsx` (long-title/long-amount + code-absent cases) | A |
| AC10 | "Remove discount" handler still fires after layout change | Fully-Automated | cart-level interaction test | A |
| AC11 | reworked coupon row correct in light+dark at normal widths | Agent-Probe | on-device walkthrough | A |
| AC12 | sticky header fully opaque at every scroll position | Agent-Probe | on-device walkthrough (jsdom/RN cannot reproduce scroll-position compositing — see `all-tests.md`) | A |
| AC13 | section header receives explicit non-transparent background style tied to theme | Fully-Automated | `history-screen-dark-mode.test.tsx` extension | A |
| AC14 | tap active tab at root → smooth scroll to top (Branches: `snapToIndex(0)`) | Agent-Probe | on-device walkthrough | A |
| AC15 | tap active tab while nested → pop to root, no scroll in same gesture | Agent-Probe | on-device walkthrough | A |
| AC16 | tab-tap decision logic (pop/scroll/no-op) selects correctly from state | Fully-Automated | `apps/mobile/src/components/__tests__/floating-tab-bar.helpers.test.ts` (3 new cases) | A |
| AC17 | sheet drags to peek from any snap point, never dismissed | Agent-Probe | on-device walkthrough (native `@gorhom/bottom-sheet` gesture, no automated coverage possible) | A |
| AC18 | at peek, map pans on direct touch; sheet re-expands by drag/tap | Agent-Probe | on-device walkthrough — dual-outcome record required (see plan's honest note) | A |
| AC19 | order-linked star-history row renders reference, tappable, navigates correctly | Fully-Automated | `apps/mobile/src/app/(tabs)/rewards/__tests__/rewards-screen.test.tsx` extension | A |
| AC20 | null-orderId row renders with no reference, not tappable | Fully-Automated | same test file extension | A |
| AC21 | tapping a real linked row reaches correct order detail; back returns to Rewards | Agent-Probe | on-device walkthrough | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle, or — for Agent-Probe rows — proven via the required
  on-device walkthrough this plan's own Phase Completion Rules mandate before VERIFIED; none of the
  11 Agent-Probe rows are deferred/backlogged, all are integral to this plan reaching VERIFIED)

C-4 reconciliation: every row above uses Fully-Automated or Agent-Probe — the two proving strategies
applicable here. No row uses Hybrid (no infra precondition exists in this client-only batch) or
Known-Gap (no developed behavior in this plan is left with zero proving mechanism — the 11
Agent-Probe rows are a legitimate proving strategy per the SPEC's own no-RN-E2E-runner constraint,
not a silently-skipped gap).

Legacy line form (retained for existing validate-contract consumers):
- A1 (option price deltas): Fully-automated: `pnpm --filter @jojopotato/ui test` (flavor/size/addon selector suites) | Agent-probe: on-device light+dark legibility walkthrough (AC5)
- A2 (product state reset): Fully-automated: `pnpm --filter @jojopotato/mobile test` (new product/index reset test) | Agent-probe: on-device A→B→C navigation walkthrough (AC8)
- A3 (coupon card layout): Fully-automated: `pnpm --filter @jojopotato/ui test` (coupon-card suite) | Agent-probe: on-device light+dark walkthrough (AC11)
- A4 (sticky header opacity): Fully-automated: `pnpm --filter @jojopotato/mobile test` (history-screen-dark-mode extension, prop-wiring only) | Agent-probe: on-device scroll-compositing walkthrough (AC12)
- A5 (tab-icon two-stage reset): Fully-automated: `pnpm --filter @jojopotato/mobile test` (floating-tab-bar.helpers decision-function suite) | Agent-probe: on-device pop/scroll walkthroughs (AC14/AC15)
- A6 (branches peek snap point): Agent-probe only: on-device drag-to-peek + map-pan-at-peek walkthrough (AC17/AC18) — no automated coverage possible (native gorhom/bottom-sheet gesture)
- A7 (star-history order linkback): Fully-automated: `pnpm --filter @jojopotato/mobile test` (rewards-screen suite extension) | Agent-probe: on-device tap-through walkthrough (AC21)

Dimension findings:
- Infra fit: PASS — client-only change confined to `apps/mobile` + `packages/ui`; zero `packages/api`, container, or infra surface touched (confirmed by grep across all Touchpoints).
- Test coverage: PASS — test tiers match the repo's actual runner capabilities exactly (`all-tests.md` cross-checked live); all 8 gate commands confirmed to exist verbatim in the relevant `package.json` files; existing "to be widened" test files independently confirmed to be trivial 8-line smoke tests (not substantial coverage being discarded).
- Breaking changes: PASS — all A1 type changes are additive-optional (`priceDeltaCents?`); `CouponCardProps.coupon.code` optionality change (step 18a) has a confirmed-small blast radius (2 non-consumer-of-`.code` files); no public API/schema/auth surface anywhere in this batch.
- Security surface: PASS — no auth/billing/schema/secrets/trust-boundary logic touched; no high-risk evidence pack required.
- A1 (option price deltas): PASS — mechanically feasible, all cited file/line targets verified present and exact; gap found and closed (component-showcase fixture note already covered by plan step 9).
- A2 (product-screen state reset): CONCERN → RESOLVED via Plan Update — toast/insets prop-threading into the extracted `ProductDetailsBody` was unspecified; closed by new checklist item 12a. Highest-risk edit: the extraction itself (moving ~300 lines of JSX/handlers) — mitigated by the `key={productId}` mechanism being a single, well-understood React remount pattern with no partial-reset risk, and by typecheck immediately catching any missed prop-threading.
- A3 (coupon card layout): CONCERN → RESOLVED via Plan Update — the original "detect a genuine short code via heuristic" instruction had no deterministic mechanism (the call site had already collapsed code/label into one string before `CouponCard` ever sees it); closed by moving the decision to the call site (steps 16/18a), which is mechanically sound and low-blast-radius.
- A4 (sticky header opacity): PASS — correctly tiered as a runtime compositing bug (Agent-Probe primary proof), with a real automated regression (AC13) for the prop-wiring half; EXECUTE's mechanism choice is appropriately left open since root cause is not determinable from static source.
- A5 (tab-icon two-stage reset): CONCERN → RESOLVED via Plan Update — the Branches-tab scroll target (root screen vs. bottom sheet) was left as an open EXECUTE judgment call in the original plan; this was assessed as a real contract hole (not acceptable latitude) because it affects which ref/API EXECUTE wires into the scroll-callback registry, and an unresolved choice here could cause rework if EXECUTE picks the "wrong" one relative to the SPEC's intent. Closed by new checklist item 27a, locking `snapToIndex(0)` as the Branches target.
- A6 (branches bottom sheet peek): PASS — INNOVATE's staged-fix decision (one snap-point addition only) is correctly scoped and explicitly forbids scope creep (step 32); the AC18 dual-outcome note is precise enough for a non-engineer walkthrough-performer to follow (names exactly 2 outcomes, states which one is "done," explicitly states the other is not a defect of this plan) — no fix needed, kept as written.
- A7 (star-history order linkback): PASS — mechanically feasible, all cited file/line/signature targets verified present and exact; destination route (`/(tabs)/tracking`) confirmed correct against the current NAV-004/NAV-005 route tree.

Plan updates applied (this VALIDATE pass, before writing this contract):
- P1: added checklist item 12a (A2) — explicit toast/insets prop-threading requirement for the extracted `ProductDetailsBody`.
- P2: reworded checklist item 16 and added item 18a (A3) — moved the coupon code-vs-label detection from an unspecified in-component heuristic to a deterministic call-site fix (`cart/index.tsx` stops falling back to the label for the `code` field; `CouponCard` renders the pill only when `code` is present).
- P3: added checklist item 27a (A5) — locked the Branches-tab scroll-to-top target to `sheetRef.current?.snapToIndex(0)`, resolving a previously-open EXECUTE judgment call.
- All three are plan-text clarifications only (no source code touched by VALIDATE); no design trade-off requiring further user input was involved — each has one clearly-correct mechanism given the verified source facts.

Execute-agent instructions:
- E1: For step 18a's `Coupon.code` optionality choice, if widening the shared `Coupon` interface in `packages/types/src/coupons.ts` proves awkward (e.g. a future consumer is found that assumes `code` is always a string), fall back to a `CouponCard`-local prop type (`coupon: Omit<Coupon, 'code'> & { code?: string }` or similar) instead of touching the shared type — either satisfies step 16/18a's requirement.
- E2: For step 4's price-delta formatter, do not add a new `Colors`/`Palette` token for the negative case — reuse `Colors[mode].accent` (confirmed existing, already used by `coupon-card.tsx`'s `discount` text).
- E3: Run the gate command list after EACH item (per cross-cutting step 39) — do not defer all fixes to one final gate run at the end of the batch, since A1's shared-component changes can surface failures in files not directly touched by later items (e.g. `component-showcase.tsx`).

Backlog artifacts: none — all findings this pass were resolvable within this plan's own scope; no follow-up plan or backlog note required.

Open gaps: none unresolved. The 11 Agent-Probe items are not gaps — they are this plan's own required verification tier for native-only behavior (no RN E2E runner exists project-wide, per `all-tests.md`), tracked explicitly in Phase Completion Rules, not deferred or silently skipped.

What this coverage does NOT prove:
- The Fully-Automated selector/coupon-card tests (AC1-AC4, AC9-AC10) prove render-from-props correctness and total-math integrity; they do NOT prove the price-delta text is legible or non-crowding on a real device at real font scale (AC5, AC11 — Agent-Probe).
- The AC6/AC7 product-details reset test proves state resets correctly under a simulated `productId` param change in a jest RN-component harness; it does NOT prove the real Expo Router navigation (Home→Order tab, deep link, related-items list) actually triggers this remount identically across every real entry path (AC8 — Agent-Probe).
- The AC13 section-header test proves the `backgroundColor` style prop is wired correctly; it does NOT prove the header actually composites opaquely on a real device during a real scroll gesture (AC12 — Agent-Probe; jsdom/RN component rendering cannot reproduce scroll-position compositing, per `all-tests.md`'s documented limitation).
- The AC16 decision-function unit tests prove the pop/scroll/no-op decision logic is correct in isolation; they do NOT prove the real native pop or native animated scroll actually happens on screen (AC14/AC15 — Agent-Probe, no RN navigation/gesture E2E runner exists).
- Nothing in this batch's automated suite touches `@gorhom/bottom-sheet`'s native gesture arbitration — AC17/AC18 (drag-to-peek, map-pannability-at-peek) are 100% Agent-Probe, with AC18's real mechanism outcome genuinely unknown until the device walkthrough (see the plan's honest AC18 note).
- The AC19/AC20 rewards-screen tests prove render/tap/navigate-call-args correctness in a jest harness; they do NOT prove the real order-detail screen renders correctly or that back-navigation returns to Rewards on a real device (AC21 — Agent-Probe).

Gate: PASS (no FAILs, 3 CONCERNs found and resolved via Plan Updates applied in this pass — all 7 item-level Layer-2 verdicts and all 4 Layer-1 dimensions are PASS with no remaining open items)
Accepted by: N/A — Gate: PASS, no unresolved concerns require acceptance.

---

## Autonomous Goal Block

SESSION GOAL: Ship 7 independent client-side UI/UX fixes (option price deltas, product-screen state reset, coupon card layout, order-history sticky header, tab-icon scroll-to-top, branches bottom-sheet peek, star-history order linkback) in `apps/mobile` + `packages/ui`.
Charter + umbrella plan: N/A — single SIMPLE plan, not a phase program.
Autonomy: standard RIPER-5 autonomy rules — EXECUTE requires explicit "ENTER EXECUTE MODE"; no /goal autopilot active for this plan. CONDITIONAL findings would auto-apply-and-proceed if re-VALIDATE is ever needed; this pass reached PASS directly.
Hard stop conditions / safety constraints:
- No `packages/api` file may be touched by this plan (SPEC-locked, no backend work in scope).
- Do not widen `Coupon.code` (or any shared type) beyond the confirmed-small blast radius (`notification-factory.ts`/`.test.ts`, `component-showcase.tsx`) without re-checking for new consumers first.
- Do not add `enablePanDownToClose` or any bottom-sheet gesture-arbitration config beyond the single `SNAP_POINTS` addition (A6, step 31-32) — INNOVATE-locked staged fix only.
- `mode: ThemeMode` stays a REQUIRED prop (no default) on every touched/new `packages/ui` component.
Next phase: EXECUTE — same plan file, starting with A1 (see Resume and Execution Handoff above).
Validate contract: inline in this plan file (`## Validate Contract` section above).
Execute start: `pnpm --filter @jojopotato/ui test && pnpm --filter @jojopotato/mobile test` (fully-auto gate commands) | no e2e spec exists for this repo | probe scenario: on-device walkthrough per the 11 Agent-Probe rows in the Test Gates table above | high-risk pack: no.
