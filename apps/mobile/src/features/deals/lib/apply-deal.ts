import type { AppliedDiscount, Cart } from '@jojopotato/types';

import { MOCK_DEALS } from '@/features/deals/mock-deals';
import { applyCouponCode } from '@/features/deals/lib/coupon-api';

export type ApplyDealResult =
  { ok: true; discount: AppliedDiscount } | { ok: false; reason: string; message: string };

/**
 * Resolve + apply a typed coupon/deal `code` via the server (STAR-004). Entry
 * point for the cart "Enter coupon code" input. Deal codes and reward codes are
 * unified onto one server-backed endpoint (`POST /coupons/apply`) — this replaces
 * the previous 100%-client-side `MOCK_DEALS` matching. On success the returned
 * `AppliedDiscount` is handed to `useCart().applyDiscount`.
 */
export async function resolveAndApplyDeal(
  code: string,
  cart: Cart,
  pickupBranchId: string,
): Promise<ApplyDealResult> {
  return applyCouponCode(code.trim(), cart, pickupBranchId);
}

/**
 * Apply a deal directly by id (deal-details "Apply" CTA). The unified endpoint is
 * code-based (no id-based staging path — locked, STAR-004 LD6), so we resolve the
 * deal's `code` locally and apply through the same server path. A code-less mock
 * deal has no server representation and cannot be applied this way (documented
 * consequence of the deal/reward unification).
 */
export async function applyDealById(
  dealId: string,
  cart: Cart,
  pickupBranchId: string,
): Promise<ApplyDealResult> {
  const deal = MOCK_DEALS.find((d) => d.id === dealId);
  if (!deal) {
    return { ok: false, reason: 'not_found', message: 'Deal not found.' };
  }
  if (!deal.code) {
    return {
      ok: false,
      reason: 'not_found',
      message: 'This deal can only be applied with a code.',
    };
  }
  return applyCouponCode(deal.code, cart, pickupBranchId);
}
