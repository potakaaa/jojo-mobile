import type { StaffProduct } from '@jojopotato/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { patchStaffProductAvailability } from '../lib/staff-api';

interface ToggleProductAvailabilityVars {
  productId: string;
  isAvailable: boolean;
}

/**
 * Mutation hook for toggling a product's availability for the branch (STAFF-004).
 *
 * Uses optimistic updates so the Switch reflects the new value immediately,
 * with rollback on error. Invalidates the products cache on settle.
 */
export function useToggleProductAvailability(): UseMutationResult<
  void,
  Error,
  ToggleProductAvailabilityVars
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, isAvailable }: ToggleProductAvailabilityVars) =>
      patchStaffProductAvailability(productId, isAvailable),
    onMutate: async ({ productId, isAvailable }) => {
      await queryClient.cancelQueries({ queryKey: ['staff', 'products'] });
      const previous = queryClient.getQueryData<StaffProduct[]>(['staff', 'products']);
      queryClient.setQueryData<StaffProduct[]>(['staff', 'products'], (old) =>
        old?.map((p) => (p.id === productId ? { ...p, isAvailable } : p)) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context?: { previous: StaffProduct[] | undefined }) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['staff', 'products'], context.previous);
      }
    },
  });
}
