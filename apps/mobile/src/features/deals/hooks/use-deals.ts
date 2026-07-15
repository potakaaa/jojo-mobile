import type { Deal } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useCart } from '@/features/cart/hooks/use-cart';
import { getDeals } from '@/lib/api-client';

/**
 * Deals list query. Keyed on the cart's current pickup branch so switching the
 * pickup branch refetches automatically (#22 AC3). Always enabled — branch-agnostic
 * deals show even with no branch selected (empty `pickupBranchId` → agnostic-only,
 * server-side). Reads the branch from `useCart` (not `useBranch`) to preserve the
 * screen's existing branch source.
 */
export function useDeals(): UseQueryResult<Deal[]> {
  const { cart } = useCart();
  const branchId = cart.pickupBranchId;

  return useQuery({
    queryKey: ['deals', branchId],
    queryFn: () => getDeals(branchId || undefined),
    refetchOnWindowFocus: true,
  });
}
