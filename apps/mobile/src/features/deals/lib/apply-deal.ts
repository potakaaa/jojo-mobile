import type { AppliedDiscount, Cart, Deal } from '@jojopotato/types';

import { getDeal } from '@/lib/api-client';
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
 * Apply a deal directly by id — the ONLY real apply path (browse → Deal Details →
 * Apply CTA → cart). Fetches the real deal from `GET /deals/:id`, rejects the four
 * complex deal types (they compute no real discount — the server rejects them at
 * placement, so the client must not carry a guessed discount there), then runs
 * eligibility and produces the `AppliedDiscount`.
 */
export async function applyDealById(
  dealId: string,
  cart: Cart,
  pickupBranchId: string,
  usage: DealUsageRecord[],
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
  return applyResolvedDeal(deal, cart, pickupBranchId, usage);
}
