import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createCategory,
  deactivateCategory,
  listCategories,
  updateCategory,
  type CategoryCreateInput,
  type CategoryUpdateInput,
} from '../lib/admin-categories-api';

/**
 * react-query hooks over the ADM-003 category API. All mutations invalidate the
 * list query on success so the table reflects the change without a manual
 * refetch (30s `staleTime`, refetch-on-focus — same staleness model as branches).
 */
const CATEGORIES_KEY = ['admin', 'categories'] as const;

export function useAdminCategories() {
  return useQuery({ queryKey: CATEGORIES_KEY, queryFn: listCategories });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryCreateInput) => createCategory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryUpdateInput }) =>
      updateCategory(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useDeactivateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}
