import type { StaffOrderSummary } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchCompletedStaffOrders } from '../lib/staff-api';

/**
 * Query hook for the branch-scoped completed/terminal orders list (STAFF-003).
 *
 * This is a historical view (completed, cancelled, rejected) — no polling since
 * terminal orders never change. The list is invalidated whenever a mutation
 * succeeds (via `useUpdateOrderStatus` onSuccess).
 */
export function useCompletedOrders(): UseQueryResult<StaffOrderSummary[], Error> {
  return useQuery({
    queryKey: ['staff', 'completed'],
    queryFn: fetchCompletedStaffOrders,
  });
}
