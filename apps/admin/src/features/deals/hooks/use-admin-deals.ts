import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  attachBranch,
  attachProduct,
  createDeal,
  deactivateDeal,
  detachBranch,
  detachProduct,
  getDeal,
  listDeals,
  updateDeal,
  type CouponPolicy,
  type DealCreateInput,
  type DealUpdateInput,
} from '../lib/admin-deals-api';

/**
 * react-query hooks over the ADM-004 deals API. Mutations invalidate the
 * affected query keys on success (same 30s `staleTime`/refetch-on-focus model as
 * branches/products). Junction attach/detach and deactivate invalidate the single
 * deal detail so its `productIds`/`branchIds`/`outstandingCoupons` refresh.
 */
const DEALS_KEY = ['admin', 'deals'] as const;
const dealKey = (id: string) => ['admin', 'deal', id] as const;

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

export function useDeactivateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, couponPolicy }: { id: string; couponPolicy: CouponPolicy }) =>
      deactivateDeal(id, couponPolicy),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: DEALS_KEY });
      void qc.invalidateQueries({ queryKey: dealKey(result.deal.id) });
    },
  });
}

export function useAttachProduct(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => attachProduct(dealId, productId),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealKey(dealId) }),
  });
}

export function useDetachProduct(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => detachProduct(dealId, productId),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealKey(dealId) }),
  });
}

export function useAttachBranch(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (branchId: string) => attachBranch(dealId, branchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealKey(dealId) }),
  });
}

export function useDetachBranch(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (branchId: string) => detachBranch(dealId, branchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: dealKey(dealId) }),
  });
}
