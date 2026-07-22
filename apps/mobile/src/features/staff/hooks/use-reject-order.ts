import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { patchStaffOrderReject } from '../lib/staff-api';

interface RejectOrderVars {
  orderId: string;
  reasonCode: string;
  note?: string;
}

/**
 * Mutation hook for rejecting a staff order WITH a reason (B2).
 *
 * Invalidates the SAME three query surfaces `useUpdateOrderStatus` does — this is
 * load-bearing, not cosmetic: `useStaffOrderDetail` has no polling and no
 * focus-based refetch, and the global query client pins `staleTime: 30_000`, so
 * without these invalidations a successful reject would leave the screen showing
 * the stale `pending` state (and no reason) for up to 30 seconds.
 *
 *   - `['staff', 'orders']`            — Active Orders list (rejected leaves it).
 *   - `['staff', 'order', orderId]`    — the order detail cache.
 *   - `['staff', 'completed']`         — Completed Orders list (rejected enters it).
 *
 * On error, `error.status` carries the HTTP status so callers can distinguish 409
 * (the order already moved on) and 422 (server rejected the reason) from other
 * failures, matching `useUpdateOrderStatus`'s contract.
 */
export function useRejectOrder(): UseMutationResult<
  Awaited<ReturnType<typeof patchStaffOrderReject>>,
  Error & { status?: number },
  RejectOrderVars
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, reasonCode, note }: RejectOrderVars) =>
      patchStaffOrderReject(orderId, reasonCode, note),
    onSuccess: (_data, { orderId }) => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['staff', 'order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['staff', 'completed'] });
    },
  });
}
