import type { StaffOrderSummary } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchCompletedStaffOrders } from '../lib/staff-api';
import { STAFF_POLL_OPTIONS } from '../lib/staff-poll-config';

/**
 * Query hook for the branch-scoped completed/terminal orders list (STAFF-003).
 *
 * This is a historical view (completed, cancelled, rejected). It now polls on the
 * shared 10s staff convention (`STAFF_POLL_OPTIONS`, paused in background) so an
 * order a customer self-completes shows up here while the staff member has the
 * screen open — without leaving and re-entering. External invalidation on a
 * staff-driven mutation (via `useUpdateOrderStatus` onSuccess) still applies; this
 * hook itself carries no `onSuccess`.
 */
export function useCompletedOrders(): UseQueryResult<StaffOrderSummary[], Error> {
  return useQuery({
    queryKey: ['staff', 'completed'],
    queryFn: fetchCompletedStaffOrders,
    ...STAFF_POLL_OPTIONS,
  });
}
