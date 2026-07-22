import type { CouponWithReward, Reward } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { deriveRewardTiers } from '../derive-reward-tiers';

/** Minimal active reward factory. */
function reward(id: string, requiredStars: number, over: Partial<Reward> = {}): Reward {
  return {
    id,
    name: `Reward ${id}`,
    requiredStars,
    rewardType: 'free_item',
    rewardValue: null,
    isActive: true,
    eligibleProductId: null,
    ...over,
  };
}

/** Minimal available reward-coupon factory. */
function coupon(
  id: string,
  rewardId: string,
  over: Partial<CouponWithReward> = {},
): CouponWithReward {
  return {
    id,
    userId: 'u1',
    dealId: null,
    rewardId,
    code: `CODE-${id}`,
    status: 'available',
    expiresAt: null,
    usedAt: null,
    createdAt: '2026-07-21T00:00:00.000Z',
    reward: { name: `Reward ${rewardId}`, requiredStars: 0 },
    ...over,
  };
}

describe('deriveRewardTiers', () => {
  it('returns locked with correct starsNeeded when currentStars < requiredStars', () => {
    const { tiers } = deriveRewardTiers([reward('a', 10)], 4, []);
    expect(tiers).toHaveLength(1);
    const [tier] = tiers;
    expect(tier?.status).toBe('locked');
    expect(tier?.starsNeeded).toBe(6);
    expect(tier?.couponCode).toBeNull();
  });

  it('returns unlocked only when stars sufficient AND matching available coupon exists', () => {
    // Stars sufficient + matching available coupon → unlocked, carries the code.
    const unlocked = deriveRewardTiers([reward('a', 10)], 12, [coupon('c1', 'a')]);
    expect(unlocked.tiers[0]?.status).toBe('unlocked');
    expect(unlocked.tiers[0]?.starsNeeded).toBe(0);
    expect(unlocked.tiers[0]?.couponCode).toBe('CODE-c1');

    // Stars sufficient but coupon is for a DIFFERENT reward → not unlocked.
    const otherCoupon = deriveRewardTiers([reward('a', 10)], 12, [coupon('c2', 'b')]);
    expect(otherCoupon.tiers[0]?.status).toBe('claimable_no_coupon');

    // Stars sufficient but coupon is not `available` (e.g. used) → not unlocked.
    const usedCoupon = deriveRewardTiers([reward('a', 10)], 12, [
      coupon('c3', 'a', { status: 'used' }),
    ]);
    expect(usedCoupon.tiers[0]?.status).toBe('claimable_no_coupon');
  });

  it('returns claimable_no_coupon when stars sufficient but no available coupon', () => {
    const { tiers } = deriveRewardTiers([reward('a', 10)], 15, []);
    expect(tiers[0]?.status).toBe('claimable_no_coupon');
    expect(tiers[0]?.starsNeeded).toBe(0);
    expect(tiers[0]?.couponCode).toBeNull();
  });

  it('nextLockedThreshold is smallest locked requiredStars, or null when all unlocked', () => {
    // Three tiers, current 8 → 5 unlocked, 10 & 20 locked → smallest locked = 10.
    const mixed = deriveRewardTiers([reward('a', 20), reward('b', 5), reward('c', 10)], 8, []);
    expect(mixed.nextLockedThreshold).toBe(10);

    // All unlocked → null.
    const allUnlocked = deriveRewardTiers([reward('a', 5), reward('b', 10)], 50, []);
    expect(allUnlocked.nextLockedThreshold).toBeNull();
  });

  it('sorts tiers ascending by requiredStars and returns empty tiers for empty rewards', () => {
    const { tiers, nextLockedThreshold } = deriveRewardTiers(
      [reward('a', 30), reward('b', 5), reward('c', 15)],
      0,
      [],
    );
    expect(tiers.map((t) => t.reward.requiredStars)).toEqual([5, 15, 30]);

    const empty = deriveRewardTiers([], 100, []);
    expect(empty.tiers).toEqual([]);
    expect(empty.nextLockedThreshold).toBeNull();
  });

  it('excludes inactive rewards from the tier list', () => {
    const { tiers } = deriveRewardTiers(
      [reward('a', 5), reward('b', 10, { isActive: false })],
      0,
      [],
    );
    expect(tiers).toHaveLength(1);
    expect(tiers[0]?.reward.id).toBe('a');
  });

  // AC8 — eligibleProductId propagates input → output unchanged.
  it('propagates eligibleProductId from input Reward to output RewardTier unchanged', () => {
    const { tiers } = deriveRewardTiers(
      [reward('a', 5, { eligibleProductId: 'prod-123' }), reward('b', 10)],
      100,
      [],
    );
    expect(tiers[0]?.reward.eligibleProductId).toBe('prod-123');
    // A reward with no eligible product round-trips as null.
    expect(tiers[1]?.reward.eligibleProductId).toBeNull();
  });
});
