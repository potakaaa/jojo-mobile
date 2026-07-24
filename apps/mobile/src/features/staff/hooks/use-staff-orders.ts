import type { StaffOrderSummary } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchStaffOrders } from '../lib/staff-api';
import { STAFF_ORDERS_POLL_INTERVAL, STAFF_POLL_OPTIONS } from '../lib/staff-poll-config';

// Re-exported from the node-env-vitest-safe config module for back-compat: any
// existing importer of this constant off `use-staff-orders` keeps working.
export { STAFF_ORDERS_POLL_INTERVAL };

/**
 * Branch-scoped active orders query for the staff dashboard (STAFF-002). Polls
 * every 10s so new orders surface without a manual refresh (AC-1). Polling is
 * paused while the app is backgrounded (`refetchIntervalInBackground: false`) to
 * spare battery/network — both come from the shared `STAFF_POLL_OPTIONS` so this
 * screen, Order Detail, and Completed Orders can never drift apart. The branch is
 * resolved server-side from the session — no branch id is passed from the client.
 */
export function useStaffOrders(): UseQueryResult<StaffOrderSummary[], Error> {
  return useQuery({
    queryKey: ['staff', 'orders'],
    queryFn: fetchStaffOrders,
    ...STAFF_POLL_OPTIONS,
  });
}
