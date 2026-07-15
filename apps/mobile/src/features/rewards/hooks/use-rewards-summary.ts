import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getRewardsBalance, type RewardsBalance } from '@/lib/api-client';

/**
 * Star balance + reward-progress summary for the signed-in customer, backed by
 * the session-gated `GET /rewards/balance` (Phase 1). Home is always rendered
 * behind auth, so the query is always enabled. Refetches on window focus so a
 * balance change (e.g. after redeeming) is reflected without a restart.
 */
export function useRewardsSummary(): UseQueryResult<RewardsBalance> {
  return useQuery({
    queryKey: ['rewards', 'balance'],
    queryFn: getRewardsBalance,
    refetchOnWindowFocus: true,
  });
}
