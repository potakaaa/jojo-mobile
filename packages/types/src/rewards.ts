export type RewardsTier = 'bronze' | 'silver' | 'gold';

export interface RewardsAccount {
  userId: string;
  points: number;
  tier: RewardsTier;
}

export interface RewardsTierProgress {
  currentPoints: number;
  pointsToNextTier: number;
  nextTier: RewardsTier | null;
}
