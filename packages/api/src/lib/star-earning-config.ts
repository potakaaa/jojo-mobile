/**
 * Star-earning eligibility configuration (STAR-001).
 *
 * The minimum order total (integer cents) required to earn a star lives here,
 * behind a getter, so:
 *   1. ADM-005 can later swap `getStarEarningMinimumCents` for a config-table
 *      read without touching the credit logic in `star-earning.ts`.
 *   2. Tests can override the threshold at this single seam (the service reads
 *      it through the getter, so a `vi.spyOn(..., 'getStarEarningMinimumCents')`
 *      cleanly intercepts the eligibility gate).
 *
 * Unit: integer cents. Default `0` — every completed order is eligible.
 */

export const STAR_EARNING_MINIMUM_CENTS = 0;

export function getStarEarningMinimumCents(): number {
  return STAR_EARNING_MINIMUM_CENTS;
}
