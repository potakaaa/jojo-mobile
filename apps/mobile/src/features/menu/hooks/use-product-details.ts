import type { ProductDetail } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useBranch } from '@/features/branch/hooks/use-branch';
import { getProductDetails } from '@/lib/api-client';

/**
 * Single-product details query, keyed on product + selected branch. Polls every
 * 20s while mounted and refetches on window focus so a mid-session availability
 * flip is reflected without a restart (AC11).
 */
export function useProductDetails(productId: string): UseQueryResult<ProductDetail> {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;

  return useQuery({
    queryKey: ['product', productId, branchId],
    queryFn: () => getProductDetails(productId, branchId as string),
    enabled: Boolean(productId && branchId),
    refetchOnWindowFocus: true,
    refetchInterval: 20_000,
  });
}
