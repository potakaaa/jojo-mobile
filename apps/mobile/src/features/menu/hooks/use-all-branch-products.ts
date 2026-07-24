import type { MenuResponse } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getAllBranchProducts } from '@/lib/api-client';

/**
 * The ALL-BRANCH regular catalog (home-all-branches D1). Reads `GET /products`,
 * which takes no branch id — so there is deliberately NO `enabled` gate and no
 * branch in the query key, mirroring `useDealProducts()`'s no-gate pattern. The
 * Home grid can therefore render the full catalog even before (or without) a
 * branch selection, and never falls into the "this branch is empty" dead end.
 *
 * Lives ALONGSIDE `useMenu()`, which is unchanged and still owns the
 * single-branch, ordering-committed view the Order tab and Product Details need.
 */
export function useAllBranchProducts(): UseQueryResult<MenuResponse> {
  return useQuery({
    queryKey: ['all-branch-products'],
    queryFn: getAllBranchProducts,
    refetchOnWindowFocus: true,
  });
}
