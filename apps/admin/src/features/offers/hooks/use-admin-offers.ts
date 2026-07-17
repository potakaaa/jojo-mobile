import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createOffer,
  getOffer,
  listOffers,
  updateOffer,
  type OfferCreateInput,
  type OfferUpdateInput,
} from '../lib/admin-offers-api';

/**
 * react-query hooks over the ADM-008 offers API. Mirrors `use-admin-branches.ts`
 * — every mutation invalidates the list (and, for updates, the detail) query on
 * success so the UI reflects the change without a manual refetch.
 */
export const OFFERS_KEY = ['admin', 'offers'] as const;

export function useAdminOffers() {
  return useQuery({ queryKey: OFFERS_KEY, queryFn: listOffers });
}

export function useAdminOffer(id: string) {
  return useQuery({
    queryKey: [...OFFERS_KEY, id],
    queryFn: () => getOffer(id),
    enabled: id.length > 0,
  });
}

export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OfferCreateInput) => createOffer(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: OFFERS_KEY }),
  });
}

export function useUpdateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OfferUpdateInput }) => updateOffer(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: OFFERS_KEY }),
  });
}
