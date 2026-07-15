import type { CouponStatus } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getCoupons, type ApiCouponWithLabel } from '@/lib/api-client';

/**
 * The signed-in member's coupon wallet (`GET /coupons`), newest-first. Called
 * with no argument to fetch all coupons (the wallet groups them by status
 * client-side); an optional `status` scopes the server response.
 */
export function useCoupons(status?: CouponStatus): UseQueryResult<ApiCouponWithLabel[]> {
  return useQuery({
    queryKey: ['coupons', status ?? 'all'],
    queryFn: () => getCoupons(status),
  });
}
