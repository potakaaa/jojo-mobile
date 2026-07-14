import type { OrderStatus } from '@jojopotato/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { patchStaffOrderStatus } from '../lib/staff-api';

interface UpdateOrderStatusVars {
  orderId: string;
  status: OrderStatus;
}

/**
 * Mutation hook for transitioning a staff order's status (STAFF-003).
 *
 * On success, invalidates all three affected query surfaces:
 *   - `['staff', 'orders']` — the Active Orders list (non-terminal).
 *   - `['staff', 'order', orderId]` — the order detail cache.
 *   - `['staff', 'completed']` — the Completed Orders list (terminal).
 *
 * On error, the `error` object carries an `.status` number so callers can
 * distinguish 409 (invalid transition) from other failures and render the
 * appropriate inline message.
 */
export function useUpdateOrderStatus(): UseMutationResult<
  Awaited<ReturnType<typeof patchStaffOrderStatus>>,
  Error & { status?: number },
  UpdateOrderStatusVars
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, status }: UpdateOrderStatusVars) =>
      patchStaffOrderStatus(orderId, status),
    onSuccess: (_data, { orderId }) => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['staff', 'order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['staff', 'completed'] });
    },
  });
}
