import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Product } from '@jojopotato/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useCart } from '@/features/cart/hooks/use-cart';
import { useDealProduct, useDealProducts } from '@/features/deals/hooks/use-deal-products';
import { getDealProducts } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  getDealProducts: jest.fn(),
}));
jest.mock('@/features/cart/hooks/use-cart', () => ({
  useCart: jest.fn(),
}));

const mockGetDealProducts = jest.mocked(getDealProducts);
const mockUseCart = jest.mocked(useCart);

const dealProduct: Product = {
  id: 'd1',
  name: 'Combo Deal',
  basePriceCents: 999,
  options: { size: [], flavor: [], add_on: [] },
  isDeal: true,
  available: true,
  components: [{ componentProductId: 'p1', componentName: 'Loaded Fries', quantity: 2 }],
};

const unavailableDeal: Product = {
  id: 'd2',
  name: 'Family Bundle',
  basePriceCents: 1999,
  options: { size: [], flavor: [], add_on: [] },
  isDeal: true,
  available: false,
  components: [],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCart.mockReturnValue({
    cart: { pickupBranchId: 'b1' },
  } as unknown as ReturnType<typeof useCart>);
});

describe('useDealProducts — GET /deals/products (all-branch)', () => {
  test('reads getDealProducts(branchId) and returns the Product[] (with available flags)', async () => {
    mockGetDealProducts.mockResolvedValue([dealProduct, unavailableDeal]);
    const { result } = await renderHook(() => useDealProducts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetDealProducts).toHaveBeenCalledWith('b1');
    expect(result.current.data).toEqual([dealProduct, unavailableDeal]);
    // `available` threads through unchanged.
    expect(result.current.data?.find((d) => d.id === 'd2')?.available).toBe(false);
  });

  // AC1 — no branch selection is required to list deals.
  test('fetches all-branch deals with NO pickup branch selected (not disabled)', async () => {
    mockUseCart.mockReturnValue({
      cart: { pickupBranchId: '' },
    } as unknown as ReturnType<typeof useCart>);
    mockGetDealProducts.mockResolvedValue([dealProduct]);
    const { result } = await renderHook(() => useDealProducts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // No branch → getDealProducts called with undefined (all-branch, available:true).
    expect(mockGetDealProducts).toHaveBeenCalledWith(undefined);
    expect(result.current.data).toEqual([dealProduct]);
  });
});

describe('useDealProduct — derived from the cached deal-products list', () => {
  test('returns the single deal-product whose id matches', async () => {
    mockGetDealProducts.mockResolvedValue([dealProduct, unavailableDeal]);
    const { result } = await renderHook(() => useDealProduct('d2'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual(unavailableDeal);
  });

  test('returns undefined for an unknown deal id', async () => {
    mockGetDealProducts.mockResolvedValue([dealProduct, unavailableDeal]);
    const { result } = await renderHook(() => useDealProduct('nope'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
  });
});
