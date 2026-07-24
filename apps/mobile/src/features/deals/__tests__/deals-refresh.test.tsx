import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Product } from '@jojopotato/types';
import { act, waitFor } from '@testing-library/react-native';

import DealsListScreen from '@/app/(tabs)/deals/index';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { getDealProducts } from '@/lib/api-client';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC3 — Deals pull-to-refresh.
 *
 * The real `useDealProducts` (useQuery) runs; only the api-client
 * `getDealProducts` (DEAL-004 all-branch listing) and `useCart` (for the pickup
 * branch id) are mocked. A pull forces `refetch()` → `getDealProducts` fires a
 * SECOND time; a failed refresh retains the prior deals.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/api-client', () => ({ getDealProducts: jest.fn() }));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
// home-all-branches: the Deals tab now reads `useBranch()` (via the shared
// confirm-then-switch hook) to decide whether a tapped deal needs a branch
// switch. Mocked here purely so the screen renders outside a BranchProvider —
// no assertion in this file changed.
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));

const mockGetDealProducts = jest.mocked(getDealProducts);
const mockUseCart = jest.mocked(useCart);
const mockUseBranch = jest.mocked(useBranch);

const dealProduct: Product = {
  id: 'd1',
  name: 'Combo Deal',
  description: 'Fries + drink',
  basePriceCents: 999,
  options: { size: [], flavor: [], add_on: [] },
  isDeal: true,
  available: true,
  components: [{ componentProductId: 'p1', componentName: 'Loaded Fries', quantity: 2 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCart.mockReturnValue({
    cart: { items: [], pickupBranchId: 'b1' },
    setBranch: jest.fn(),
    clearCart: jest.fn(),
  } as unknown as ReturnType<typeof useCart>);
  mockUseBranch.mockReturnValue({
    selectedBranch: null,
    branches: [],
    setSelectedBranch: jest.fn(),
  } as unknown as ReturnType<typeof useBranch>);
});

describe('DealsListScreen — pull-to-refresh (AC3)', () => {
  test('a pull triggers a refetch (getDealProducts fires a second time)', async () => {
    mockGetDealProducts.mockResolvedValue([dealProduct]);

    const screen = await renderWithProviders(<DealsListScreen />);
    expect(await screen.findByText('Combo Deal')).toBeTruthy();
    expect(mockGetDealProducts).toHaveBeenCalledTimes(1);

    const refreshControl = screen.getByTestId('deals-scroll').props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mockGetDealProducts).toHaveBeenCalledTimes(2));
  });

  test('a failed refresh preserves the previously-loaded deals', async () => {
    mockGetDealProducts.mockResolvedValueOnce([dealProduct]);
    mockGetDealProducts.mockRejectedValueOnce(new Error('network down'));

    const screen = await renderWithProviders(<DealsListScreen />);
    expect(await screen.findByText('Combo Deal')).toBeTruthy();

    const refreshControl = screen.getByTestId('deals-scroll').props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mockGetDealProducts).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Combo Deal')).toBeTruthy());
  });
});
