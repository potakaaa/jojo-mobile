export type RewardsTier = 'bronze' | 'silver' | 'gold';

export interface RewardsAccount {
  userId: string;
  points: number;
  tier: RewardsTier;
}
