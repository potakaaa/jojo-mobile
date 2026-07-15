/**
 * Rewards / stars domain shapes, reconciled to the DB schema
 * (`rewards`/`user_stars` tables). Stars are a COUNT (integer), never a peso
 * amount. There is NO tier system — progress is expressed as "X / N stars to the
 * next reward" against a fixed reward threshold (PRD MVP: 5 stars).
 */

/** A redeemable reward from the `rewards` catalog. `rewardValue` is in cents. */
export interface Reward {
  id: string;
  name: string;
  requiredStars: number;
  rewardType: string;
  rewardValue: number | null;
  eligibleProductId: string | null;
  isActive: boolean;
}

/** A member's star balance (`user_stars`). `current` is spendable; `lifetime` only grows. */
export interface RewardsAccount {
  userId: string;
  currentStars: number;
  lifetimeStars: number;
}

/**
 * Progress toward the next reward. Tier-free: `rewardThreshold` is the fixed
 * number of stars a reward costs, `starsToNextReward` is how many more are
 * needed (0 once the balance can already redeem).
 */
export interface RewardsProgress {
  currentStars: number;
  rewardThreshold: number;
  starsToNextReward: number;
}
