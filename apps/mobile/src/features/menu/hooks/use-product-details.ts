import type { ProductDetail } from '@jojopotato/types';
import { useMemo } from 'react';

import { useMenu } from '@/features/menu/hooks/use-menu';

export interface ProductDetailsResult {
  data: ProductDetail | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Single-product details — a PURE DERIVATION over `useMenu()`'s cached branch
 * tree, not a network query (this branch's backend has no per-product endpoint —
 * see plan Gap B). The whole-menu query already polls every 20s and refetches on
 * focus, so a mid-session availability flip is reflected here too: when a product
 * becomes unavailable the backend drops it from the tree, so `find` returns
 * `undefined` (data absent = unavailable). A product present in the tree is
 * available (`isAvailable: true`).
 */
export function useProductDetails(productId: string): ProductDetailsResult {
  const menu = useMenu();

  const data = useMemo<ProductDetail | undefined>(() => {
    const found = menu.data?.categories
      .flatMap((category) => category.products)
      .find((product) => product.id === productId);
    return found ? { ...found, isAvailable: true } : undefined;
  }, [menu.data, productId]);

  return { data, isLoading: menu.isLoading, isError: menu.isError };
}
