import type { AppliedDiscount, Cart, Deal } from '@jojopotato/types';

import { applyCouponCode } from '@/features/deals/lib/coupon-api';

export type ApplyDealResult =
  { ok: true; discount: AppliedDiscount } | { ok: false; reason: string; message: string };

/**
 * Deal types that cannot be applied at checkout (no real server-side discount).
 * The client rejects them BEFORE applying so it never carries a guessed discount
 * to a placement that the server would reject with 400 (charter consistency).
 */
const COMPLEX_DEAL_TYPES: readonly Deal['dealType'][] = [
  'buy_one_take_one',
  'free_item',
  'free_upgrade',
  'bundle',
];

export function isComplexDealType(dealType: Deal['dealType']): boolean {
  return COMPLEX_DEAL_TYPES.includes(dealType);
}

/**
 * Resolve + apply a typed coupon/deal `code` via the server (STAR-004). Entry
 * point for the cart "Enter coupon code" input. Deal codes and reward codes are
 * unified onto one server-backed endpoint (`POST /coupons/apply`) — this replaces
 * the previous 100%-client-side matching. On success the returned
 * `AppliedDiscount` is handed to `useCart().applyDiscount`.
 */
export async function resolveAndApplyDeal(
  code: string,
  cart: Cart,
  pickupBranchId: string,
): Promise<ApplyDealResult> {
  return applyCouponCode(code.trim(), cart, pickupBranchId);
}

// DEAL-004: `applyDealById` (the OLD-model deal-details "Apply" CTA that read
// `GET /deals/:id` and applied a deal by id) was REMOVED — it had zero live
// callers (the deal-details screen now adds deal-PRODUCTS to the cart as plain
// lines via `useDealProduct` + `productToMenuItem`, no discount/eligibility math).
// The `code`-input coupon path (`resolveAndApplyDeal` above → `POST /coupons/apply`)
// is the sole surviving deal-apply surface and is unchanged.
