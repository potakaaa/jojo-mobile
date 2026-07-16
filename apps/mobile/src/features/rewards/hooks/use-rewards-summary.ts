import type { RewardsSummary } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchRewardsSummary } from '../lib/rewards-api';

/**
 * The caller's star summary (`GET /rewards/summary`). Refetches on window focus
 * (global default in `query-client.ts`) so the screen reflects a server-side
 * star credit without an app restart (AC5).
 */
export function useRewardsSummary(): UseQueryResult<RewardsSummary> {
  return useQuery({
    queryKey: ['rewards', 'summary'],
    queryFn: fetchRewardsSummary,
  });
}
