/**
 * Jojo Stars shared domain types (STAR-001).
 *
 * Mirrors the DB `star_tx_type` enum and the `user_stars` counter table. Visible
 * to all `@jojopotato/*` consumers. Replaces the earlier points/tier placeholder
 * (no consumer relied on it — grep-confirmed safe overwrite).
 */

/** Mirrors the DB `star_tx_type` pgEnum verbatim. */
export type StarTransactionType = 'earned' | 'redeemed' | 'adjusted' | 'expired';

/**
 * Admin allow-list of `reward_type` values (ADM-005, D2). The `rewards.reward_type`
 * column is an unconstrained `varchar` (no DB pgEnum), so this app-level runtime
 * constant is the ONLY gate on what an admin may configure. Mirrors the
 * `STAFF_ROLES` precedent (runtime array + derived union). `free_upgrade` is
 * included (D2): it has real reward-side redemption math (the resolver dispatches
 * a `free_upgrade` reward coupon to `computeFreeUpgradeDiscountCents`).
 */
export const REWARD_TYPES = [
  'free_item',
  'fixed_discount',
  'percentage_discount',
  'free_upgrade',
] as const;

/** The 4-value admin reward-type union (derived from {@link REWARD_TYPES}). */
export type RewardType = (typeof REWARD_TYPES)[number];

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
