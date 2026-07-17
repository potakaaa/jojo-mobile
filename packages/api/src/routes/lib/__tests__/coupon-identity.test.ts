import { describe, expect, it } from 'vitest';

import { couponIdentityIsExclusive } from '../coupon-identity';

/**
 * Unit tests for the reward XOR offer identity predicate (application-boundary
 * twin of the DB CHECK `coupons_reward_offer_mutex`, migration 0015). Pure
 * function — no DB. The DB CHECK itself is proven live in
 * `admin/__tests__/admin-coupon-issuance.integration.test.ts`.
 */
describe('couponIdentityIsExclusive', () => {
  it('accepts an offer-only identity', () => {
    expect(couponIdentityIsExclusive({ offer_id: 'o1', reward_id: null })).toBe(true);
  });

  it('accepts a reward-only identity', () => {
    expect(couponIdentityIsExclusive({ offer_id: null, reward_id: 'r1' })).toBe(true);
  });

  it('accepts a neither-set identity (pre-issuance / untargeted)', () => {
    expect(couponIdentityIsExclusive({ offer_id: null, reward_id: null })).toBe(true);
  });

  it('accepts undefined fields as absent', () => {
    expect(couponIdentityIsExclusive({})).toBe(true);
    expect(couponIdentityIsExclusive({ offer_id: 'o1' })).toBe(true);
    expect(couponIdentityIsExclusive({ reward_id: 'r1' })).toBe(true);
  });

  it('rejects a dual-FK identity (both reward_id and offer_id set)', () => {
    expect(couponIdentityIsExclusive({ offer_id: 'o1', reward_id: 'r1' })).toBe(false);
  });
});
