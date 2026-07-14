import type { Deal } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getDeal } from '@/lib/api-client';

/**
 * Single-deal query for the Deal Details screen (#23). A GENUINE per-deal
 * `useQuery` against `GET /deals/:id` — NOT a derive-from-cached-list. Deals now
 * have a per-deal endpoint (Phase 1+2), and the details screen must fetch the
 * deal regardless of the current pickup branch (so a branch-scoped deal absent
 * from the current-branch list still resolves and the eligibility engine can
 * render `branch_ineligible`). The derive-from-list pattern used by
 * `use-product-details.ts` exists only because menu has no per-product endpoint;
 * it does not apply here. Takes an explicit `dealId` (no inheritance of
 * `useDeals()`'s parameterless branch-from-cart pattern).
 */
export function useDeal(dealId: string): UseQueryResult<Deal> {
  return useQuery({
    queryKey: ['deal', dealId],
    queryFn: () => getDeal(dealId),
    enabled: !!dealId,
  });
}
