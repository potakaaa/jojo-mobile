import type { AppliedDiscount, Cart, Deal } from '@jojopotato/types';

import { applyCouponCode } from '@/features/deals/lib/coupon-api';
import { getDeal } from '@/lib/api-client';

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

/**
 * Apply a deal directly by id — the deal-details "Apply" CTA. Fetches the real
 * deal from `GET /deals/:id` (development's real-deal source), rejects the four
 * complex deal types (they compute no real discount — the server rejects them at
 * placement, so the client must not carry a guessed discount there), then
 * resolves the deal's `code` and validates + applies it through the unified
 * server endpoint (`POST /coupons/apply`) — deal and reward codes share one
 * server-backed path (STAR-004). A code-less deal has no server representation
 * and cannot be applied this way (documented consequence of the unification).
 */
export async function applyDealById(
  dealId: string,
  cart: Cart,
  pickupBranchId: string,
): Promise<ApplyDealResult> {
  let deal: Deal;
  try {
    deal = await getDeal(dealId);
  } catch {
    return { ok: false, reason: 'not_found', message: 'Deal not found.' };
  }
  if (isComplexDealType(deal.dealType)) {
    return {
      ok: false,
      reason: 'not_found',
      message: "This deal can't be applied at checkout yet.",
    };
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
