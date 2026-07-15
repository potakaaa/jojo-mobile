import type { Order, OrderStatus } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchOrder } from '@/features/orders/lib/api-client';

/** Poll interval for the customer order tracking screen (LIVE-001): 10s. */
export const ORDER_POLL_INTERVAL = 10_000;

/**
 * Returns true when the order has reached a terminal state (completed,
 * cancelled, or rejected). Terminal orders no longer change status, so
 * polling must stop for them.
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'rejected';
}

/**
 * React-query hook for a single customer order. Polls every 10s while the
 * order is non-terminal, then stops automatically once it reaches a terminal
 * state (completed / cancelled / rejected). Polling is suspended when the app
 * is backgrounded (`refetchIntervalInBackground: false`). `staleTime: 0`
 * overrides the global 30s stale time so focus refetches always hit the network
 * on return, keeping the screen current (AC-3).
 *
 * HARD CONTRACT (LIVE-001 validate-contract E4):
 *   - `staleTime: 0` — mandatory, overrides global 30_000
 *   - `refetchIntervalInBackground: false` — mandatory, foreground-only
 *   - `refetchInterval` callback returns `false` on terminal status — mandatory
 */
export function useOrderQuery(orderId: string): UseQueryResult<Order, Error> {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: () => fetchOrder(orderId),
    refetchInterval: (query) =>
      query.state.data && isTerminalStatus(query.state.data.status) ? false : ORDER_POLL_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}
