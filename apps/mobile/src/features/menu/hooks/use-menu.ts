import type { MenuResponse } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useBranch } from '@/features/branch/hooks/use-branch';
import { getMenu } from '@/lib/api-client';

/**
 * Branch-scoped menu query. Keyed on the selected branch id so switching branches
 * refetches automatically (AC3). Disabled until a branch is selected. Polls every
 * 20s and refetches on window focus so a mid-session availability flip is
 * reflected without a restart (AC11) — these live on the whole-menu query since
 * per-product detail is now derived client-side from this tree (see
 * `use-product-details.ts`), not fetched per product.
 */
export function useMenu(): UseQueryResult<MenuResponse> {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;

  return useQuery({
    queryKey: ['menu', branchId],
    queryFn: () => getMenu(branchId as string),
    enabled: Boolean(branchId),
    refetchOnWindowFocus: true,
    refetchInterval: 20_000,
  });
}
