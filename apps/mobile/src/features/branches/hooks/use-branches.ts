import { useCallback } from 'react';

import { fetchBranch, fetchBranches } from '@/features/branches/lib/api-client';
import { useAsyncData } from '@/features/shared/hooks/use-async-data';

/** Load the active pickup-branch list. */
export function useBranches() {
  const fetcher = useCallback(() => fetchBranches(), []);
  return useAsyncData(fetcher, []);
}

/** Load a single branch's detail by id. */
export function useBranch(branchId: string) {
  const fetcher = useCallback(() => fetchBranch(branchId), [branchId]);
  return useAsyncData(fetcher, [branchId]);
}
