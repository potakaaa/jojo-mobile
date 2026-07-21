import type { StaffBranchSettings } from '@jojopotato/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { patchStaffBranchSettings } from '../lib/staff-api';

/**
 * Mutation hook for updating the branch's operational settings (STAFF-004).
 *
 * Accepts a partial payload — callers pass only the field(s) they want to update
 * (e.g. `{ isAcceptingPickup: false }` or `{ estimatedPrepMinutes: 20 }`).
 *
 * On success, invalidates the branch settings query so the UI reflects the
 * updated state immediately without a manual refetch.
 */
export function usePatchBranchSettings(): UseMutationResult<
  StaffBranchSettings,
  Error,
  Partial<StaffBranchSettings>
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<StaffBranchSettings>) => patchStaffBranchSettings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'branch'] });
    },
  });
}
