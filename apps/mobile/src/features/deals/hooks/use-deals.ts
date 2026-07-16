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
 *
 * NB (ADM-004 deals-as-products repoint, Phase B): this OLD-model hook (public
 * `GET /deals`) is retained because the Home deals strip (`(tabs)/index.tsx`) —
 * a frozen Phase-A-in-flight file — still consumes it. The Deals TAB (list +
 * detail) was migrated to the new `products.is_deal` model via the sibling
 * `use-deal-products.ts` hooks. Migrating the Home strip is a deferred follow-up
 * (it requires editing the frozen Home screen). See
 * `process/general-plans/backlog/home-deals-strip-repoint_NOTE_16-07-26.md`.
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
