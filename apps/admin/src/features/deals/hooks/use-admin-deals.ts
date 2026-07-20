import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listAvailability, setAvailability } from '@/features/products/lib/admin-products-api';

import {
  attachComponent,
  createDeal,
  detachComponent,
  getDeal,
  listDeals,
  updateDeal,
  type DealCreateInput,
  type DealUpdateInput,
} from '../lib/admin-deals-api';

/**
 * react-query hooks over the ADM-004 deals-as-products API. Mutations invalidate
 * the affected query keys on success (same 30s `staleTime`, refetch-on-focus
 * staleness model as products/branches). Component attach/detach invalidate the
 * specific deal's detail key so the "what's inside" editor refreshes.
 */
const DEALS_KEY = ['admin', 'deals'] as const;
const dealKey = (id: string) => ['admin', 'deal', id] as const;
const dealAvailabilityKey = (id: string) => ['admin', 'deal', id, 'availability'] as const;

export function useAdminDeals(isActive?: boolean) {
  return useQuery({
    queryKey: [...DEALS_KEY, { isActive: isActive ?? null }],
    queryFn: () => listDeals(isActive),
  });
}

export function useAdminDeal(id: string) {
  return useQuery({
    queryKey: dealKey(id),
    queryFn: () => getDeal(id),
    enabled: id.length > 0,
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DealCreateInput) => createDeal(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEALS_KEY }),
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DealUpdateInput }) => updateDeal(id, input),
    onSuccess: (deal) => {
      void qc.invalidateQueries({ queryKey: DEALS_KEY });
      void qc.invalidateQueries({ queryKey: dealKey(deal.id) });
    },
  });
}

export function useAttachComponent(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      componentProductId,
      quantity,
    }: {
      componentProductId: string;
      quantity?: number;
    }) => attachComponent(dealId, componentProductId, quantity),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealKey(dealId) }),
  });
}

export function useDetachComponent(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (componentProductId: string) => detachComponent(dealId, componentProductId),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealKey(dealId) }),
  });
}

/**
 * A deal IS a `products` row (`is_deal = true`), so its per-branch availability is
 * managed through the exact same `/api/admin/products/:id/availability` endpoints
 * (they do not filter on `is_deal`) — reused here rather than duplicating a
 * deals-scoped route (post-merge Fix 4). Keyed under the deal's own namespace so it
 * never collides with the products editor's cache entry for the same id.
 */
export function useDealAvailability(dealId: string) {
  return useQuery({
    queryKey: dealAvailabilityKey(dealId),
    queryFn: () => listAvailability(dealId),
    enabled: dealId.length > 0,
  });
}

export function useSetDealAvailability(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, isAvailable }: { branchId: string; isAvailable: boolean }) =>
      setAvailability(dealId, branchId, isAvailable),
    onSuccess: () => {
      // Refresh the toggle grid AND the visibility badges (list + detail), whose
      // available/active branch counts change with every availability write.
      void qc.invalidateQueries({ queryKey: dealAvailabilityKey(dealId) });
      void qc.invalidateQueries({ queryKey: dealKey(dealId) });
      void qc.invalidateQueries({ queryKey: DEALS_KEY });
    },
  });
}
