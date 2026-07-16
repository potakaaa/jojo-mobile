import type { Reward } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchAvailableRewards } from '../lib/rewards-api';

/**
 * The active rewards catalog (`GET /rewards/available`), ascending by required
 * stars. Refetches on window focus (global default) for AC5.
 */
export function useAvailableRewards(): UseQueryResult<Reward[]> {
  return useQuery({
    queryKey: ['rewards', 'available'],
    queryFn: fetchAvailableRewards,
  });
}
