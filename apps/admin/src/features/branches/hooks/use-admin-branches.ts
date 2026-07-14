import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createBranch,
  deactivateBranch,
  getBranch,
  listBranches,
  updateBranch,
  type BranchCreateInput,
  type BranchUpdateInput,
} from '../lib/admin-branches-api';

/**
 * react-query hooks over the ADM-002 branch API. All mutations invalidate the
 * list query on success so the table reflects the change without a manual
 * refetch. This feature is the FIRST real consumer of `apps/admin`'s dedicated
 * `queryClient` (`lib/query-client.ts`, staleTime 30s).
 */
const BRANCHES_KEY = ['admin', 'branches'] as const;

export function useAdminBranches() {
  return useQuery({ queryKey: BRANCHES_KEY, queryFn: listBranches });
}

export function useAdminBranch(id: string) {
  return useQuery({
    queryKey: [...BRANCHES_KEY, id],
    queryFn: () => getBranch(id),
    enabled: id.length > 0,
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BranchCreateInput) => createBranch(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BRANCHES_KEY }),
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BranchUpdateInput }) =>
      updateBranch(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BRANCHES_KEY }),
  });
}

export function useDeactivateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateBranch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: BRANCHES_KEY }),
  });
}
