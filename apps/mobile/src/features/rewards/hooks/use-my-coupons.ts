import type { CouponWithReward } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchMyCoupons } from '../lib/rewards-api';

/**
 * The caller's coupons (`GET /coupons`, STAR-004). Refetches on window focus
 * (global default in `query-client.ts`) so a coupon that was just consumed at
 * checkout reflects as `used` without an app restart.
 */
export function useMyCoupons(): UseQueryResult<CouponWithReward[]> {
  return useQuery({
    queryKey: ['coupons', 'mine'],
    queryFn: fetchMyCoupons,
  });
}
