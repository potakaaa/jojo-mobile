import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Product } from '@jojopotato/types';
import { act, waitFor } from '@testing-library/react-native';

import DealsListScreen from '@/app/(tabs)/deals/index';
import { useCart } from '@/features/cart/hooks/use-cart';
import { getMenu } from '@/lib/api-client';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC3 — Deals pull-to-refresh.
 *
 * The real `useDealProducts` (useQuery) runs; only the api-client `getMenu` and
 * `useCart` (for the pickup branch id) are mocked. A pull forces `refetch()` →
 * `getMenu` fires a SECOND time; a failed refresh retains the prior deals.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/api-client', () => ({ getMenu: jest.fn() }));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));

const mockGetMenu = jest.mocked(getMenu);
const mockUseCart = jest.mocked(useCart);

const dealProduct: Product = {
  id: 'd1',
  name: 'Combo Deal',
  description: 'Fries + drink',
  basePriceCents: 999,
  options: { size: [], flavor: [], add_on: [] },
  isDeal: true,
  components: [{ componentProductId: 'p1', componentName: 'Loaded Fries', quantity: 2 }],
};

function menuWith(products: Product[]) {
  return { categories: [{ products }] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCart.mockReturnValue({
    cart: { pickupBranchId: 'b1' },
  } as unknown as ReturnType<typeof useCart>);
});

describe('DealsListScreen — pull-to-refresh (AC3)', () => {
  test('a pull triggers a refetch (getMenu fires a second time)', async () => {
    mockGetMenu.mockResolvedValue(menuWith([dealProduct]) as never);

    const screen = await renderWithProviders(<DealsListScreen />);
    expect(await screen.findByText('Combo Deal')).toBeTruthy();
    expect(mockGetMenu).toHaveBeenCalledTimes(1);

    const refreshControl = screen.getByTestId('deals-scroll').props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mockGetMenu).toHaveBeenCalledTimes(2));
  });

  test('a failed refresh preserves the previously-loaded deals', async () => {
    mockGetMenu.mockResolvedValueOnce(menuWith([dealProduct]) as never);
    mockGetMenu.mockRejectedValueOnce(new Error('network down'));

    const screen = await renderWithProviders(<DealsListScreen />);
    expect(await screen.findByText('Combo Deal')).toBeTruthy();

    const refreshControl = screen.getByTestId('deals-scroll').props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mockGetMenu).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Combo Deal')).toBeTruthy());
  });
});
