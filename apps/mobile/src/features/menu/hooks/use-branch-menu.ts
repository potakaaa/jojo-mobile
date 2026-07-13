import { useCallback } from 'react';

import { fetchBranchMenu } from '@/features/menu/lib/api-client';
import { useAsyncData } from '@/features/shared/hooks/use-async-data';

/** Load a branch's full menu (categories with products and grouped options). */
export function useBranchMenu(branchId: string) {
  const fetcher = useCallback(() => fetchBranchMenu(branchId), [branchId]);
  return useAsyncData(fetcher, [branchId]);
}
