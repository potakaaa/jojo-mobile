import type { Product } from '@jojopotato/types';
import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useCart } from '@/features/cart/hooks/use-cart';
import { getDealProducts } from '@/lib/api-client';

/**
 * Deals-as-products browse hooks (ADM-004 repoint, Phase B). A "deal" is a
 * `products` row with `is_deal = true`, so the Deals tab reads the SAME menu
 * route as the regular catalog with the `?isDeal=true` flip and treats the
 * results as `Product[]` — priced at their own `basePriceCents`, described by
 * their `components[]` ("what's inside"), added to the cart like any product.
 *
 * These are NEW hooks (siblings of the retained OLD-model `use-deals.ts`/
 * `use-deal.ts`, which the frozen Home-strip + cart screens still consume) — the
 * Deals TAB list/detail screens point here, leaving those frozen files untouched.
 */

/**
 * Deal-products list (DEAL-004 all-branch). Reads `GET /deals/products`, which is
 * ALL-BRANCH — no branch selection is required to see deals (AC1). The query runs
 * whether or not a branch is selected (no `enabled` gate). The cart's pickup
 * branch is still part of the query key so switching branches refetches the
 * per-branch `available` flag; when no branch is selected, every deal comes back
 * `available: true`. Flattens the returned `Category[]` into a single `Product[]`.
 */
export function useDealProducts(): UseQueryResult<Product[]> {
  const { cart } = useCart();
  // Empty pickupBranchId (no branch chosen) → fetch the all-branch catalog with
  // every deal available:true; a real branch id → per-branch availability flags.
  const branchId = cart.pickupBranchId || undefined;

  return useQuery({
    queryKey: ['deal-products', branchId ?? null],
    queryFn: () => getDealProducts(branchId),
    refetchOnWindowFocus: true,
  });
}

export interface DealProductResult {
  data: Product | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Single deal-product for the Deal Details screen — a PURE DERIVATION over
 * `useDealProducts()`'s cached list (mirrors `use-product-details.ts`; this
 * backend has no per-deal endpoint). The derived product carries its
 * `components` for the "What's inside" card.
 */
export function useDealProduct(dealId: string): DealProductResult {
  const deals = useDealProducts();

  const data = useMemo<Product | undefined>(
    () => deals.data?.find((product) => product.id === dealId),
    [deals.data, dealId],
  );

  return { data, isLoading: deals.isLoading, isError: deals.isError };
}
