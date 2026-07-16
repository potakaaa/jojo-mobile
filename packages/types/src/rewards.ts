/**
 * Jojo Stars shared domain types (STAR-001).
 *
 * Mirrors the DB `star_tx_type` enum and the `user_stars` counter table. Visible
 * to all `@jojopotato/*` consumers. Replaces the earlier points/tier placeholder
 * (no consumer relied on it — grep-confirmed safe overwrite).
 */

/** Mirrors the DB `star_tx_type` pgEnum verbatim. */
export type StarTransactionType = 'earned' | 'redeemed' | 'adjusted' | 'expired';

/** A user's star counters: redeemable balance + monotonic cumulative history. */
export interface UserStars {
  currentStars: number;
  lifetimeStars: number;
}

/** A single star-ledger row. `orderId` is null for non-order-linked transactions. */
export interface StarTransaction {
  id: string;
  userId: string;
  orderId: string | null;
  type: StarTransactionType;
  stars: number;
  description: string | null;
  createdAt: string;
}

/**
 * A reward configuration row (mirrors the DB `rewards` table). `rewardValue` is
 * `numericToCents`-converted (integer cents) or `null` when the reward carries no
 * monetary value. Added by STAR-002 for the Rewards screen's reward preview /
 * available-rewards list.
 */
export interface Reward {
  id: string;
  name: string;
  requiredStars: number;
  rewardType: string;
  rewardValue: number | null;
  isActive: boolean;
}

/**
 * The caller's star state + the reward being progressed toward. Powers the
 * Rewards screen's top progress tracker (STAR-002). `requiredStars` is the MIN
 * active reward threshold; `reward` is that same reward (or `null` when none is
 * active). `isUnlocked` = `currentStars >= requiredStars`.
 */
export interface RewardsSummary {
  currentStars: number;
  lifetimeStars: number;
  requiredStars: number;
  isUnlocked: boolean;
  reward: Reward | null;
}
