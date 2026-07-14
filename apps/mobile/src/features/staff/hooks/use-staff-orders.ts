import type { StaffOrderSummary } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchStaffOrders } from '../lib/staff-api';

/** Poll interval for the staff Active Orders list (OC-4): 10s. */
export const STAFF_ORDERS_POLL_INTERVAL = 10_000;

/**
 * Branch-scoped active orders query for the staff dashboard (STAFF-002). Polls
 * every 10s so new orders surface without a manual refresh (AC-1). Polling is
 * paused while the app is backgrounded (`refetchIntervalInBackground: false`) to
 * spare battery/network. The branch is resolved server-side from the session —
 * no branch id is passed from the client.
 */
export function useStaffOrders(): UseQueryResult<StaffOrderSummary[], Error> {
  return useQuery({
    queryKey: ['staff', 'orders'],
    queryFn: fetchStaffOrders,
    refetchInterval: STAFF_ORDERS_POLL_INTERVAL,
    refetchIntervalInBackground: false,
  });
}
