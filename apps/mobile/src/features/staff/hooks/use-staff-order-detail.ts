import type { StaffOrderDetail } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchStaffOrderDetail } from '../lib/staff-api';
import { STAFF_POLL_OPTIONS } from '../lib/staff-poll-config';

/**
 * Single staff order detail query (STAFF-002). Polls on the shared 10s staff
 * convention (`STAFF_POLL_OPTIONS`, paused in background) so that a customer
 * self-completing their own order is reflected on this screen while the staff
 * member has it open — without a manual refresh or a leave-and-return.
 * Disabled until an `orderId` is present. Returns `null` data for a 404.
 */
export function useStaffOrderDetail(
  orderId: string,
): UseQueryResult<StaffOrderDetail | null, Error> {
  return useQuery({
    queryKey: ['staff', 'orders', orderId],
    queryFn: () => fetchStaffOrderDetail(orderId),
    enabled: Boolean(orderId),
    ...STAFF_POLL_OPTIONS,
  });
}
