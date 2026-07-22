import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createStaffInvite,
  listStaff,
  lookupUserByEmail,
  patchStaffBranch,
  postStaffRole,
  type AdminStaffMember,
  type StaffInviteInput,
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

/**
 * Manual-trigger email lookup for the "+ Add staff" flow (ADM-011). Shaped as a
 * `useMutation` rather than a conditionally-enabled `useQuery` — the lookup is a
 * one-shot, button-triggered call, matching this codebase's preference for mutations
 * on on-demand server reads.
 */
export function useUserLookup() {
  return useMutation({ mutationFn: (email: string) => lookupUserByEmail(email) });
}

/**
 * Create a staff email invite (ADM-011). Invalidates the staff list on success for
 * symmetry with the other staff mutations — a no-op invalidation today (a freshly
 * invited user isn't in the roster yet), kept so caching assumptions stay consistent
 * if that changes later.
 */
export function useCreateStaffInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StaffInviteInput) => createStaffInvite(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  });
}
