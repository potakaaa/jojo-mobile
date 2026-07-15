/**
 * Pure redeem-affordability logic for the Rewards screen. Extracted so it is
 * vitest-coverable without rendering (AC3). No optimistic decrement — this only
 * answers "can the member afford this reward right now, and if not, by how much".
 */

export interface RewardAffordability {
  /** True when the member has at least `requiredStars`. */
  canAfford: boolean;
  /** How many more stars are needed (0 when affordable). */
  starsShort: number;
  /** Friendly gating message when unaffordable; `null` when affordable. */
  message: string | null;
}

/**
 * Compute affordability of a reward against the member's current star balance.
 * Negative or missing inputs are clamped to a safe 0.
 */
export function getRewardAffordability(
  currentStars: number,
  requiredStars: number,
): RewardAffordability {
  const current = Number.isFinite(currentStars) ? Math.max(0, currentStars) : 0;
  const required = Number.isFinite(requiredStars) ? Math.max(0, requiredStars) : 0;
  const starsShort = Math.max(0, required - current);
  const canAfford = starsShort === 0;

  return {
    canAfford,
    starsShort,
    message: canAfford ? null : `Need ${starsShort} more ${starsShort === 1 ? 'star' : 'stars'}`,
  };
}
