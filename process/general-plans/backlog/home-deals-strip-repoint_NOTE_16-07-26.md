---
name: note:home-deals-strip-repoint
description: "RESOLVED: Home tab deals strip repointed to products.is_deal same-day via quick-fix lane. Remaining deferred scope: cart applied-deal display (STAR-004 coupon-apply, separate concern)"
date: 16-07-26
metadata:
  node_type: memory
  type: note
  feature: general
---

# Home Deals Strip + Cart Applied-Deal → Repoint to `products.is_deal`

**Status:** PARTIALLY RESOLVED. Discovered during EXECUTE of
`kid-friendly-ui-deals-unification_PLAN_16-07-26.md` Phase B; the Home tab strip
half was closed the same day via the QUICK FIX lane (see Resolution below) once
Phase A was code-complete and the file freeze lifted. The cart applied-deal
display half (item 2) remains deferred — see "Remaining scope" below.

## What / Why

Phase B (deals model unification) repointed the mobile **Deals TAB** (list +
detail: `(tabs)/deals/index.tsx`, `(tabs)/deals/deal/[dealId].tsx`) from the OLD
discount-object model (`GET /deals`, `useDeals()`/`useDeal()`) to the new
deals-as-products model (`GET /branches/:id/menu?isDeal=true`, new
`useDealProducts()`/`useDealProduct()` in `features/deals/hooks/use-deal-products.ts`).

**Two other consumers of the OLD hooks were left on the old model and NOT migrated
this phase:**

1. **Home tab deals strip** (`apps/mobile/src/app/(tabs)/index.tsx`) — consumes
   `useDeals()` and renders `<DealCard deal={deal} />` from `Deal`-shaped data.
2. **Cart applied-deal display** (`apps/mobile/src/app/(tabs)/order/cart.tsx`) —
   consumes `useDeal(refId)` for its applied-discount (coupon / STAR-004) cart-line
   display + `checkDealEligibility` recheck path.

## Why deferred (not a bug, non-regressing)

- Both files were **frozen Phase-A-in-flight files** (uncommitted Phase A UI work
  in the same working tree). The Phase B EXECUTE task hard-constraint was: "do NOT
  touch/revert/interfere with any Phase A files" — which explicitly named the Home,
  cart, checkout, product, and account screens.
- The Phase B plan/validate-contract wrongly assumed `useDeals()`/`useDeal()` were
  consumed ONLY by the deals screens (grep during VALIDATE missed the Home strip
  `useDeals()` import and the cart `useDeal()` import). Repointing the shared hooks
  in place would have broken both frozen files' typecheck.
- Resolution taken: keep OLD `use-deals.ts`/`use-deal.ts` (Deal-based) untouched so
  Home + cart keep working exactly as before; add NEW sibling hooks for the tab.
- **Net: zero regression.** Home strip + cart applied-deal behave identically to
  pre-Phase-B. The Deals tab is fully migrated.

## Resolution (Home tab strip, closed same-day via QUICK FIX lane)

`(tabs)/index.tsx`'s deals strip now uses `useDealProducts()` + the extracted
`dealProductToCard()` adapter (moved to
`apps/mobile/src/features/deals/lib/deal-product-to-card.ts`, shared by both the
Deals tab and Home). Home strip and Deals tab now render from the same
`products.is_deal`/`deal_components` source — no more dual-model browse gap.
Scoped check green (typecheck, lint, deals test suites 8/8 + 37/37).

## Remaining scope (still deferred)

- Decide the disposition of `cart.tsx`'s applied-deal display: with the tab CTA now
  a plain add-to-cart (no `applyDiscount` for deals), the only remaining writer of a
  deal-typed `appliedDiscount` is STAR-004 coupon-apply — confirm whether the
  OLD-model `useDeal()` lookup is still needed there or can be simplified.
- Once no consumer remains, the OLD `use-deals.ts`/`use-deal.ts` (+ the
  RETIRE-BUT-DON'T-DELETE `apply-deal.ts`/`eligibility.ts`/`use-deal-usage.ts`) can
  be fully retired.
