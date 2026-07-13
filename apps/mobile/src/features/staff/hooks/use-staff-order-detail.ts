import type { StaffOrderDetail } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchStaffOrderDetail } from '../lib/staff-api';

/**
 * Single staff order detail query (STAFF-002). No polling — the detail screen is
 * transient; the user navigates back to the list (which polls) for freshness.
 * Disabled until an `orderId` is present. Returns `null` data for a 404.
 */
export function useStaffOrderDetail(
  orderId: string,
): UseQueryResult<StaffOrderDetail | null, Error> {
  return useQuery({
    queryKey: ['staff', 'orders', orderId],
    queryFn: () => fetchStaffOrderDetail(orderId),
    enabled: Boolean(orderId),
  });
}
