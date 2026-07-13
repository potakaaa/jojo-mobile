import type { AppliedDiscount, Cart, Deal } from '@jojopotato/types';

import { MOCK_DEALS } from '@/features/deals/mock-deals';
import {
  checkDealEligibility,
  computeDealDiscountCents,
  type DealUsageRecord,
  type EligibilityFailReason,
} from '@/features/deals/lib/eligibility';

export type ApplyDealResult =
  | { ok: true; discount: AppliedDiscount }
  | { ok: false; reason: 'not_found' | EligibilityFailReason; message: string };

/**
 * Shared apply path: run eligibility for a resolved deal and, on pass, produce
 * the `AppliedDiscount` to hand to `useCart().applyDiscount`. Used by both the
 * cart code-input flow and the deal-details Apply CTA so there is one code path.
 */
function applyResolvedDeal(
  deal: Deal,
  cart: Cart,
  pickupBranchId: string,
  usage: DealUsageRecord[],
): ApplyDealResult {
  const result = checkDealEligibility(deal, cart, pickupBranchId, usage);
  if (!result.eligible) {
    return { ok: false, reason: result.reason, message: result.message };
  }
  const amountCents = computeDealDiscountCents(deal, cart);
  return {
    ok: true,
    discount: { source: 'deal', refId: deal.id, label: deal.title, amountCents },
  };
}

/**
 * Resolve a typed deal `code` to a mock `Deal`, then apply it. Entry point for
 * the cart "Apply coupon/deal" text input.
 */
export function resolveAndApplyDeal(
  code: string,
  cart: Cart,
  pickupBranchId: string,
  usage: DealUsageRecord[],
): ApplyDealResult {
  const normalized = code.trim().toUpperCase();
  const deal = MOCK_DEALS.find((d) => d.code?.toUpperCase() === normalized);
  if (!deal) {
    return { ok: false, reason: 'not_found', message: 'Deal code not found.' };
  }
  return applyResolvedDeal(deal, cart, pickupBranchId, usage);
}

/**
 * Apply a deal directly by id. Entry point for the deal-details Apply CTA (which
 * already holds the resolved deal, code or not).
 */
export function applyDealById(
  dealId: string,
  cart: Cart,
  pickupBranchId: string,
  usage: DealUsageRecord[],
): ApplyDealResult {
  const deal = MOCK_DEALS.find((d) => d.id === dealId);
  if (!deal) {
    return { ok: false, reason: 'not_found', message: 'Deal not found.' };
  }
  return applyResolvedDeal(deal, cart, pickupBranchId, usage);
}
