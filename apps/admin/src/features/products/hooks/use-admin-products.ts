import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createOption,
  createProduct,
  deactivateOption,
  deactivateProduct,
  getProduct,
  listAvailability,
  listOptions,
  listProducts,
  setAvailability,
  updateOption,
  updateProduct,
  type OptionCreateInput,
  type OptionUpdateInput,
  type ProductCreateInput,
  type ProductUpdateInput,
} from '../lib/admin-products-api';

/**
 * react-query hooks over the ADM-003 product/option/availability API. Mutations
 * invalidate the affected query keys on success (30s `staleTime`, refetch-on-
 * focus — same staleness model as branches; the accepted Decision 3 Known-Gap is
 * that concurrent admin sessions see stale availability until refetch).
 */
const PRODUCTS_KEY = ['admin', 'products'] as const;
const optionsKey = (productId: string) => ['admin', 'product', productId, 'options'] as const;
const availabilityKey = (productId: string) =>
  ['admin', 'product', productId, 'availability'] as const;

export function useAdminProducts(categoryId?: string) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, { categoryId: categoryId ?? null }],
    queryFn: () => listProducts(categoryId),
  });
}

export function useAdminProduct(id: string) {
  return useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => getProduct(id),
    enabled: id.length > 0,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductCreateInput) => createProduct(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductUpdateInput }) =>
      updateProduct(id, input),
    onSuccess: (product) => {
      void qc.invalidateQueries({ queryKey: PRODUCTS_KEY });
      void qc.invalidateQueries({ queryKey: ['admin', 'product', product.id] });
    },
  });
}

export function useDeactivateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}

export function useProductOptions(productId: string) {
  return useQuery({
    queryKey: optionsKey(productId),
    queryFn: () => listOptions(productId),
    enabled: productId.length > 0,
  });
}

export function useCreateOption(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OptionCreateInput) => createOption(productId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: optionsKey(productId) }),
  });
}

export function useUpdateOption(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ optionId, input }: { optionId: string; input: OptionUpdateInput }) =>
      updateOption(productId, optionId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: optionsKey(productId) }),
  });
}

export function useDeactivateOption(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (optionId: string) => deactivateOption(productId, optionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: optionsKey(productId) }),
  });
}

export function useProductAvailability(productId: string) {
  return useQuery({
    queryKey: availabilityKey(productId),
    queryFn: () => listAvailability(productId),
    enabled: productId.length > 0,
  });
}

export function useSetAvailability(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, isAvailable }: { branchId: string; isAvailable: boolean }) =>
      setAvailability(productId, branchId, isAvailable),
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityKey(productId) }),
  });
}
