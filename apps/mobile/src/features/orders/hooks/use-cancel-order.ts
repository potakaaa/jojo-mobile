import type { Order } from '@jojopotato/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { cancelOrder } from '@/features/orders/lib/api-client';

export interface CancelOrderVars {
  orderId: string;
  reasonCode?: string;
  note?: string;
}

/**
 * Mutation hook for the customer cancelling their own PENDING order
 * (`PATCH /orders/:orderId/cancel`). Mirrors `use-complete-order.ts` exactly.
 *
 * On success it invalidates the two surfaces that show this order's status:
 *   - `['order', orderId]` — the tracking screen's own query. Refetching it is
 *     what makes the screen show `cancelled` and, because the order is now
 *     terminal, is also what stops `useOrderQuery`'s poll.
 *   - `['orders', 'history']` — the Order History list, where the same order
 *     appears with its status.
 *
 * Deliberately does NOT touch `use-order-query.ts`: its `staleTime` /
 * `refetchInterval` / `refetchIntervalInBackground` options are a hard contract
 * (LIVE-001 validate-contract E4). Invalidating the key from the outside is
 * enough — the existing terminal-status check there stops the poll.
 *
 * Errors arrive as a plain `Error` from `apiRequest` (message only — the status
 * code is folded into the text there), so callers surface `error.message` inline
 * and cannot branch on 409 specifically. That is acceptable here: a 409 means the
 * order stopped being `pending` (staff accepted it first), and since nothing was
 * invalidated the screen is still polling, so the next `useOrderQuery` tick brings
 * the real status in on its own.
 */
export function useCancelOrder(): UseMutationResult<Order, Error, CancelOrderVars> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, reasonCode, note }: CancelOrderVars) =>
      cancelOrder(orderId, reasonCode, note),
    onSuccess: (_order, { orderId }) => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'history'] });
    },
  });
}
