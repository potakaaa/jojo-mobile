import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchRewardsHistory, type RewardsHistoryPage } from '../lib/rewards-api';

/**
 * The caller's star transaction history (`GET /rewards/history`), reverse-chron.
 * Refetches on window focus (global default) for AC5.
 */
export function useRewardsHistory(): UseQueryResult<RewardsHistoryPage> {
  return useQuery({
    queryKey: ['rewards', 'history'],
    queryFn: fetchRewardsHistory,
  });
}
