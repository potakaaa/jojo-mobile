import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createPromotion,
  getPromotion,
  listPromotions,
  type PromotionCreateInput,
} from '../lib/admin-promotions-api';

/**
 * react-query hooks over the ADM-008 promotions API. Mirrors
 * `use-admin-branches.ts` — the create mutation invalidates the list query on
 * success so the table reflects the new promotion without a manual refetch.
 */
const PROMOTIONS_KEY = ['admin', 'promotions'] as const;

export function useAdminPromotions() {
  return useQuery({ queryKey: PROMOTIONS_KEY, queryFn: listPromotions });
}

export function useAdminPromotion(id: string) {
  return useQuery({
    queryKey: [...PROMOTIONS_KEY, id],
    queryFn: () => getPromotion(id),
    enabled: id.length > 0,
  });
}

export function useCreatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PromotionCreateInput) => createPromotion(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROMOTIONS_KEY }),
  });
}
