import type { Cart, Deal } from '@jojopotato/types';

/**
 * Pure eligibility + discount-calculation engine for deals (mock round). Zero
 * React Native dependencies — testable in isolation once a runner exists (see
 * plan Known Gaps: no `apps/mobile` test runner this round).
 */

export type EligibilityFailReason =
  | 'inactive'
  | 'not_in_window'
  | 'branch_ineligible'
  | 'no_eligible_product_in_cart'
  | 'below_minimum_order'
  | 'user_usage_limit_reached'
  | 'total_usage_limit_reached';

export type EligibilityResult =
  { eligible: true } | { eligible: false; reason: EligibilityFailReason; message: string };

/** A record of a deal already consumed by a user (mock usage history). */
export interface DealUsageRecord {
  dealId: string;
  userId: string;
}

/** Cart subtotal in cents (base + option deltas already folded into unit price). */
export function subtotalCents(cart: Cart): number {
  return cart.items.reduce((sum, it) => sum + it.unitPriceCents * it.quantity, 0);
}

/** Whether `now` falls within the deal's active window [startAt, endAt]. */
function isInWindow(deal: Deal, now: number): boolean {
  const start = new Date(deal.startAt).getTime();
  const end = new Date(deal.endAt).getTime();
  return now >= start && now <= end;
}

/**
 * Deals visible in the list for a branch: active, currently in-window, and
 * either branch-agnostic or scoped to `pickupBranchId`. Reads `Date.now()`
 * internally (module function, not a direct render-body call) so consumers can
 * call it from a `useMemo` without tripping the react-hooks purity rule.
 */
export function filterActiveBranchDeals(deals: Deal[], pickupBranchId: string): Deal[] {
  const now = Date.now();
  return deals.filter((deal) => {
    const branchOk =
      deal.eligibleBranchIds.length === 0 || deal.eligibleBranchIds.includes(pickupBranchId);
    return deal.isActive && isInWindow(deal, now) && branchOk;
  });
}

/** Format a cents amount as a ₱ major-unit string, e.g. 5000 → "50.00". */
function pesos(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Runs the 6 ordered eligibility checks, short-circuiting on the first failure.
 * Order matches the #23 acceptance-criteria ordering.
 */
export function checkDealEligibility(
  deal: Deal,
  cart: Cart,
  pickupBranchId: string,
  usage: DealUsageRecord[],
): EligibilityResult {
  const now = Date.now();

  // 1. Active + within window.
  if (!deal.isActive || !isInWindow(deal, now)) {
    return {
      eligible: false,
      reason: 'not_in_window',
      message: 'This deal is not currently available.',
    };
  }

  // 2. Branch scope.
  if (deal.eligibleBranchIds.length > 0 && !deal.eligibleBranchIds.includes(pickupBranchId)) {
    return {
      eligible: false,
      reason: 'branch_ineligible',
      message: 'Not available at your selected branch.',
    };
  }

  // 3. Eligible product present in cart.
  if (
    deal.eligibleProductIds.length > 0 &&
    !cart.items.some((it) => deal.eligibleProductIds.includes(it.menuItemId))
  ) {
    return {
      eligible: false,
      reason: 'no_eligible_product_in_cart',
      message: 'Add an eligible item to your cart to use this deal.',
    };
  }

  // 4. Minimum order amount (with exact shortfall in ₱).
  const subtotal = subtotalCents(cart);
  if (subtotal < deal.minimumOrderAmount) {
    return {
      eligible: false,
      reason: 'below_minimum_order',
      message: `Add ₱${pesos(deal.minimumOrderAmount - subtotal)} more to use this deal.`,
    };
  }

  // 5. Per-user usage limit.
  if (deal.usageLimitPerUser !== undefined) {
    const used = usage.filter((u) => u.dealId === deal.id).length;
    if (used >= deal.usageLimitPerUser) {
      return {
        eligible: false,
        reason: 'user_usage_limit_reached',
        message: "You've already used this deal.",
      };
    }
  }

  // 6. Total usage limit.
  if (deal.totalUsageLimit !== undefined) {
    const usedTotal = usage.filter((u) => u.dealId === deal.id).length;
    if (usedTotal >= deal.totalUsageLimit) {
      return {
        eligible: false,
        reason: 'total_usage_limit_reached',
        message: 'This deal has reached its usage limit.',
      };
    }
  }

  return { eligible: true };
}

/** Cheapest eligible line's unit price (cents), or 0 if none in cart. */
function cheapestEligibleUnitPrice(deal: Deal, cart: Cart): number {
  const eligibleLines =
    deal.eligibleProductIds.length === 0
      ? cart.items
      : cart.items.filter((it) => deal.eligibleProductIds.includes(it.menuItemId));
  if (eligibleLines.length === 0) return 0;
  return Math.min(...eligibleLines.map((it) => it.unitPriceCents));
}

/**
 * Discount amount (cents) for an eligible deal against the current cart.
 *
 * NOTE (mock-round simplification): `buy_one_take_one`, `free_item`,
 * `free_upgrade`, and `bundle` are computed against the cheapest eligible
 * matching line's unit price. Real BOGO/bundle/promo-stacking pricing is a
 * backend/checkout-engine concern — this is NOT a real pricing engine.
 */
export function computeDealDiscountCents(deal: Deal, cart: Cart): number {
  const subtotal = subtotalCents(cart);
  switch (deal.dealType) {
    case 'percentage_discount':
      return Math.round((subtotal * deal.discountValue) / 100);
    case 'fixed_discount':
      // discountValue is already cents; never discount more than the subtotal.
      return Math.min(deal.discountValue, subtotal);
    case 'buy_one_take_one':
    case 'free_item':
    case 'free_upgrade':
    case 'bundle':
      return cheapestEligibleUnitPrice(deal, cart);
    default:
      return 0;
  }
}

/** Derive a `DealCard.discountLabel` string consistent with type/value. */
export function deriveDiscountLabel(deal: Deal): string {
  switch (deal.dealType) {
    case 'percentage_discount':
      return `${deal.discountValue}% OFF`;
    case 'fixed_discount':
      return `₱${(deal.discountValue / 100).toFixed(0)} OFF`;
    case 'buy_one_take_one':
      return 'BOGO';
    case 'free_item':
      return 'FREE ITEM';
    case 'free_upgrade':
      return 'FREE UPGRADE';
    case 'bundle':
      return 'BUNDLE DEAL';
    default:
      return 'DEAL';
  }
}
