import type { Deal } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getDeal } from '@/lib/api-client';

/**
 * Single-deal query (OLD discount model, `GET /deals/:id`). RETAINED because
 * `(tabs)/cart/index.tsx` — a frozen Phase-A-in-flight file — still consumes it
 * for its applied-discount (coupon/STAR-004) cart-line display path. The Deals
 * TAB detail screen was migrated to the new `products.is_deal` model via
 * `use-deal-products.ts`'s `useDealProduct()`; this hook is left untouched so the
 * cart's OLD-model path keeps working. Takes an explicit `dealId`.
 */
export function useDeal(dealId: string): UseQueryResult<Deal> {
  return useQuery({
    queryKey: ['deal', dealId],
    queryFn: () => getDeal(dealId),
    enabled: !!dealId,
  });
}
