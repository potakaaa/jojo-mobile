import type { CouponWithReward, Reward } from '@jojopotato/types';

/**
 * A tier's redemption state on the unified rewards screen:
 * - `locked` — the caller does not have enough stars yet.
 * - `unlocked` — enough stars AND a minted `available` reward-coupon exists → Redeem.
 * - `claimable_no_coupon` — enough stars but no `available` coupon minted yet → disabled edge.
 */
export type RewardTierStatus = 'locked' | 'unlocked' | 'claimable_no_coupon';

/** One reward tier with its derived redemption state. */
export interface RewardTier {
  reward: Reward;
  status: RewardTierStatus;
  /** Stars still needed to reach this tier (0 once reached). */
  starsNeeded: number;
  /** The redeem code — set only when `status === 'unlocked'`, else `null`. Never shown to the user. */
  couponCode: string | null;
}

/** Result of {@link deriveRewardTiers}. */
export interface DerivedRewards {
  /** Active rewards, ascending by `requiredStars`, each with derived status. */
  tiers: RewardTier[];
  /** Smallest `requiredStars` among locked tiers (the progress-bar target), or `null` when all unlocked. */
  nextLockedThreshold: number | null;
}

/**
 * Derive the McDonald's-style unified tier list from the caller's rewards catalog,
 * their spendable star balance, and their coupons.
 *
 * Pure — no RN/react imports, node-vitest testable. A tier is `unlocked` only when
 * the caller has enough stars AND holds a still-`available` reward-coupon whose
 * `rewardId` matches; sufficient stars with no such coupon is `claimable_no_coupon`.
 */
export function deriveRewardTiers(
  rewards: Reward[],
  currentStars: number,
  coupons: CouponWithReward[],
): DerivedRewards {
  const tiers: RewardTier[] = rewards
    .filter((reward) => reward.isActive)
    .sort((a, b) => a.requiredStars - b.requiredStars)
    .map((reward) => {
      const starsNeeded = Math.max(0, reward.requiredStars - currentStars);
      const hasStars = currentStars >= reward.requiredStars;
      const matchingCoupon = coupons.find(
        (c) => c.status === 'available' && c.rewardId === reward.id,
      );

      let status: RewardTierStatus;
      let couponCode: string | null = null;
      if (!hasStars) {
        status = 'locked';
      } else if (matchingCoupon) {
        status = 'unlocked';
        couponCode = matchingCoupon.code;
      } else {
        status = 'claimable_no_coupon';
      }

      return { reward, status, starsNeeded, couponCode };
    });

  const lockedThresholds = tiers
    .filter((tier) => tier.status === 'locked')
    .map((tier) => tier.reward.requiredStars);
  const nextLockedThreshold = lockedThresholds.length > 0 ? Math.min(...lockedThresholds) : null;

  return { tiers, nextLockedThreshold };
}
