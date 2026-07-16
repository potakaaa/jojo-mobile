import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { MenuResponse, Product } from '@jojopotato/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useCart } from '@/features/cart/hooks/use-cart';
import { useDealProduct, useDealProducts } from '@/features/deals/hooks/use-deal-products';
import { getMenu } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  getMenu: jest.fn(),
}));
jest.mock('@/features/cart/hooks/use-cart', () => ({
  useCart: jest.fn(),
}));

const mockGetMenu = jest.mocked(getMenu);
const mockUseCart = jest.mocked(useCart);

const dealProduct: Product = {
  id: 'd1',
  name: 'Combo Deal',
  basePriceCents: 999,
  options: { size: [], flavor: [], add_on: [] },
  isDeal: true,
  components: [{ componentProductId: 'p1', componentName: 'Loaded Fries', quantity: 2 }],
};

const otherDeal: Product = {
  id: 'd2',
  name: 'Family Bundle',
  basePriceCents: 1999,
  options: { size: [], flavor: [], add_on: [] },
  isDeal: true,
  components: [],
};

const menuResponse: MenuResponse = {
  branchId: 'b1',
  categories: [
    { id: 'c1', name: 'Deals', products: [dealProduct] },
    { id: 'c2', name: 'More Deals', products: [otherDeal] },
  ],
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

describe('useDealProducts — ?isDeal=true menu, flattened', () => {
  test('reads getMenu(branchId, { isDeal: true }) and flattens categories to a Product[]', async () => {
    mockGetMenu.mockResolvedValue(menuResponse);
    const { result } = await renderHook(() => useDealProducts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetMenu).toHaveBeenCalledWith('b1', { isDeal: true });
    expect(result.current.data).toEqual([dealProduct, otherDeal]);
  });

  test('is disabled (no fetch) when no pickup branch is selected', async () => {
    mockUseCart.mockReturnValue({
      cart: { pickupBranchId: '' },
    } as unknown as ReturnType<typeof useCart>);
    const { result } = await renderHook(() => useDealProducts(), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockGetMenu).not.toHaveBeenCalled();
  });
});

describe('useDealProduct — derived from the cached deal-products list', () => {
  test('returns the single deal-product whose id matches', async () => {
    mockGetMenu.mockResolvedValue(menuResponse);
    const { result } = await renderHook(() => useDealProduct('d2'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual(otherDeal);
  });

  test('returns undefined for an unknown deal id', async () => {
    mockGetMenu.mockResolvedValue(menuResponse);
    const { result } = await renderHook(() => useDealProduct('nope'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
  });
});
