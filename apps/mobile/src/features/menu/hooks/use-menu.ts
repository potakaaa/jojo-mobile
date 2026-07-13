import type { MenuResponse } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useBranch } from '@/features/branch/hooks/use-branch';
import { getMenu } from '@/lib/api-client';

/**
 * Branch-scoped menu query. Keyed on the selected branch id so switching branches
 * refetches automatically (AC3). Disabled until a branch is selected.
 */
export function useMenu(): UseQueryResult<MenuResponse> {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;

  return useQuery({
    queryKey: ['menu', branchId],
    queryFn: () => getMenu(branchId as string),
    enabled: Boolean(branchId),
  });
}
