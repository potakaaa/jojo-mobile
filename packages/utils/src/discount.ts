import type { Cart, CouponStatus, Deal } from '@jojopotato/types';

/**
 * Shared, framework-agnostic discount + eligibility engine (STAR-004).
 *
 * The deal-side functions (`subtotalCents`, `checkDealEligibility`,
 * `computeDealDiscountCents`, `cheapestEligibleUnitPrice`) are ported VERBATIM
 * from the original mobile-only `apps/mobile/src/features/deals/lib/eligibility.ts`
 * so deal-code apply behaves identically after being unified onto the server.
 * The reward-side functions (`checkRewardEligibility`, `computeRewardDiscountCents`)
 * are new. Both consume the shared cents-based `Cart`/`Deal` contract, so the
 * SAME engine runs in `packages/api` (apply route + order-placement recompute)
 * and — for deal display — `apps/mobile`. Zero React Native dependencies.
 */

/**
 * Superset failure vocabulary. The first block is the original deal reasons
 * (unchanged — existing deal call sites never emit the reward-only reasons); the
 * second block adds the reward-coupon reasons.
 */
export type EligibilityFailReason =
  // deal reasons (verbatim from eligibility.ts)
  | 'inactive'
  | 'not_in_window'
  | 'branch_ineligible'
  | 'no_eligible_product_in_cart'
  | 'below_minimum_order'
  | 'user_usage_limit_reached'
  | 'total_usage_limit_reached'
  // reward-coupon reasons (new, STAR-004)
  | 'already_used'
  | 'expired'
  | 'no_eligible_product'
  | 'not_in_cart'
  // free-mechanic offer-coupon reason (ADM-008 Fix 6 P2). The two DO-NOT-TOUCH deal
  // functions never emit it and the mobile eligibility twin keeps its own local
  // copy, so adding this member leaves both byte-identical.
  | 'no_upgrade_to_waive';

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

/** Format a cents amount as a ₱ major-unit string, e.g. 5000 → "50.00". */
function pesos(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Runs the 6 ordered deal eligibility checks, short-circuiting on the first
 * failure. Order matches the #23 acceptance-criteria ordering.
 */
export function checkDealEligibility(
  deal: Deal,
  cart: Cart,
  pickupBranchId: string,
  usage: DealUsageRecord[],
  userId?: string,
): EligibilityResult {
  const now = Date.now();

  // 1. Active + within window (distinct reason codes).
  if (!deal.isActive) {
    return {
      eligible: false,
      reason: 'inactive',
      message: 'This deal is not currently available.',
    };
  }
  if (!isInWindow(deal, now)) {
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

  // 5. Per-user usage limit. Filters by `userId` when provided; callers without a
  // persisted usage source pass an empty `usage` array (documented STAR-004 known
  // limitation — no server-side deal-usage store exists this round).
  if (deal.usageLimitPerUser !== undefined) {
    const used = userId
      ? usage.filter((u) => u.dealId === deal.id && u.userId === userId).length
      : usage.filter((u) => u.dealId === deal.id).length;
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
      return Math.min(Math.round((subtotal * deal.discountValue) / 100), subtotal);
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

// ─── Reward-coupon side (STAR-004, new) ──────────────────────────────────────

/** Minimal reward shape needed for reward-coupon eligibility. */
export interface RewardForEligibility {
  eligibleProductId: string | null;
}

/** Minimal coupon shape needed for reward-coupon eligibility. */
export interface CouponForEligibility {
  status: CouponStatus;
  expiresAt: string | Date | null;
}

/**
 * Reward-coupon eligibility (mirrors the deal check's short-circuit shape).
 * Rejects a used/expired coupon, a reward with no configured eligible product
 * (AC7 — checked at BOTH apply and order placement), and a cart that does not
 * contain the reward's bound product (recompute-drop, LD5).
 *
 * `options.allowUsed` (order-placement only): skip the `used`-status pre-check so
 * a used coupon flows to the caller's authoritative `UPDATE ... WHERE
 * status='available'` single-use guard, which is what rejects a double-redeem
 * with 409 (STAR-004 LD4/AC6). At apply time (preview) `allowUsed` is false, so a
 * used coupon is reported up front as `already_used`.
 */
export function checkRewardEligibility(
  coupon: CouponForEligibility,
  reward: RewardForEligibility | null,
  cart: Cart,
  options: { allowUsed?: boolean } = {},
): EligibilityResult {
  if (!options.allowUsed && coupon.status === 'used') {
    return {
      eligible: false,
      reason: 'already_used',
      message: 'This reward has already been used.',
    };
  }
  if (coupon.status === 'expired') {
    return { eligible: false, reason: 'expired', message: 'This reward has expired.' };
  }
  if (coupon.expiresAt) {
    const exp = new Date(coupon.expiresAt).getTime();
    if (!Number.isNaN(exp) && exp < Date.now()) {
      return { eligible: false, reason: 'expired', message: 'This reward has expired.' };
    }
  }
  if (!reward) {
    return {
      eligible: false,
      reason: 'no_eligible_product',
      message: "This reward isn't available right now.",
    };
  }
  if (reward.eligibleProductId !== null) {
    const inCart = cart.items.some((it) => it.menuItemId === reward.eligibleProductId);
    if (!inCart) {
      return {
        eligible: false,
        reason: 'not_in_cart',
        message: 'Add the eligible item to your cart to use this reward.',
      };
    }
  }
  return { eligible: true };
}

/**
 * Reward discount (cents): zero one unit of the bound product — the cheapest
 * matching line's unit price (a single free item), mirroring the deal
 * `free_item`/`cheapestEligibleUnitPrice` semantics. 0 when the product is not
 * in the cart (caller should have already rejected via `checkRewardEligibility`).
 */
export function computeRewardDiscountCents(eligibleProductId: string, cart: Cart): number {
  const lines = cart.items.filter((it) => it.menuItemId === eligibleProductId);
  if (lines.length === 0) return 0;
  return Math.min(...lines.map((it) => it.unitPriceCents));
}

// ─── Free-mechanic offer-coupon side (ADM-008 Fix 6, new) ────────────────────
//
// Admin-authored `free_item` / `free_upgrade` OFFER coupons (distinct from the
// points-earned reward coupons above). `free_item` reuses `computeRewardDiscountCents`
// VERBATIM — one free unit of the benefit product = its cheapest matching line's
// unit price. `free_upgrade` waives one unit's paid size-upgrade charge. Both are
// framework-agnostic (no DB, no React Native): the resolver in `packages/api` reads
// the admin-configured `offers.benefit_product_id` and dispatches to these.

/**
 * Discount (cents) for a `free_upgrade` offer coupon: waive one unit's paid size
 * upgrade on the benefit product. A qualifying line is one whose
 * `menuItemId === benefitProductId` carrying at least one `size`-type option with a
 * POSITIVE `priceDeltaCents`; that line's waived amount is the SUM of its positive
 * size deltas. Across multiple qualifying lines the smallest waived amount is taken
 * (`Math.min`) — one unit per redemption, never scaled by `quantity`. Returns 0 when
 * the product is absent, has no size option, or has only zero/negative size deltas
 * (the caller rejects a computed 0 rather than resolving a ₱0-and-burn).
 */
export function computeFreeUpgradeDiscountCents(benefitProductId: string, cart: Cart): number {
  const perLineWaived = cart.items
    .filter((it) => it.menuItemId === benefitProductId)
    .map((it) =>
      it.selectedOptions
        .filter((opt) => opt.optionType === 'size' && opt.priceDeltaCents > 0)
        .reduce((sum, opt) => sum + opt.priceDeltaCents, 0),
    )
    .filter((waived) => waived > 0);
  if (perLineWaived.length === 0) return 0;
  return Math.min(...perLineWaived);
}

/**
 * Eligibility for a CONFIGURED `free_item` / `free_upgrade` offer coupon against a
 * cart (mirrors the reward check's short-circuit shape). `benefitProductId` is the
 * offer's configured product — the resolver rejects a NULL benefit BEFORE calling
 * this. Rejects a cart missing the benefit product (`not_in_cart`), and — for
 * `free_upgrade` only — a benefit line with no paid size upgrade to waive
 * (`no_upgrade_to_waive`), so a ₱0 upgrade never resolves as a burnable success.
 */
export function checkFreeBenefit(
  dealType: 'free_item' | 'free_upgrade',
  benefitProductId: string,
  cart: Cart,
): EligibilityResult {
  const inCart = cart.items.some((it) => it.menuItemId === benefitProductId);
  if (!inCart) {
    return {
      eligible: false,
      reason: 'not_in_cart',
      message: 'Add the eligible item to your cart to use this offer.',
    };
  }
  if (dealType === 'free_upgrade' && computeFreeUpgradeDiscountCents(benefitProductId, cart) <= 0) {
    return {
      eligible: false,
      reason: 'no_upgrade_to_waive',
      message: 'Add a size upgrade to the eligible item to use this offer.',
    };
  }
  return { eligible: true };
}
