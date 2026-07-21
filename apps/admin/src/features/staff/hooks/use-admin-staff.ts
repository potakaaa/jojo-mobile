import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listStaff,
  patchStaffBranch,
  postStaffRole,
  type AdminStaffMember,
} from '../lib/admin-staff-api';

/**
 * react-query hooks over the ADM-009 staff API. Mirrors `use-admin-rewards.ts` —
 * both mutations invalidate the list query on success so the table reflects the
 * change without a manual refetch.
 */
export const STAFF_KEY = ['admin', 'staff'] as const;

export function useAdminStaff() {
  return useQuery({ queryKey: STAFF_KEY, queryFn: listStaff });
}

export function useAssignStaffBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, branchId }: { id: string; branchId: string | null }) =>
      patchStaffBranch(id, branchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  });
}

export function useChangeStaffRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminStaffMember['role'] | 'customer' }) =>
      postStaffRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  });
}
