import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  generateCoupons,
  listOfferCoupons,
  type GenerateCouponsInput,
} from '../lib/admin-offers-api';

import { OFFERS_KEY } from './use-admin-offers';

/**
 * react-query hooks for an Offer's issued coupons: the per-offer coupon list and
 * the "Generate Coupons" mutation. The mutation invalidates the offer's
 * coupon-list query on success so the freshly issued codes appear in the list
 * sub-view without a manual refetch.
 */
export function offerCouponsKey(offerId: string) {
  return [...OFFERS_KEY, offerId, 'coupons'] as const;
}

export function useOfferCoupons(offerId: string) {
  return useQuery({
    queryKey: offerCouponsKey(offerId),
    queryFn: () => listOfferCoupons(offerId),
    enabled: offerId.length > 0,
  });
}

export function useGenerateCoupons(offerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateCouponsInput) => generateCoupons(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: offerCouponsKey(offerId) }),
  });
}
