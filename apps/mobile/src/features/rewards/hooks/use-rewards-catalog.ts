import type { Reward } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getRewardsCatalog } from '@/lib/api-client';

/**
 * Active redeemable rewards catalog (`GET /rewards`). Rendered on the Rewards
 * tab alongside the star balance so the member can see what each reward costs.
 */
export function useRewardsCatalog(): UseQueryResult<Reward[]> {
  return useQuery({
    queryKey: ['rewards', 'catalog'],
    queryFn: getRewardsCatalog,
  });
}
