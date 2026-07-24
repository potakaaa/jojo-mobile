import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Product } from '@jojopotato/types';
import { fireEvent } from '@testing-library/react-native';

import DealDetailsScreen from '@/app/(tabs)/deals/deal/[dealId]';
import DealsListScreen from '@/app/(tabs)/deals/index';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useDealProduct, useDealProducts } from '@/features/deals/hooks/use-deal-products';
import { renderWithProviders } from '@/test-utils/render';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({ dealId: 'd1' }),
}));
jest.mock('@/features/deals/hooks/use-deal-products', () => ({
  useDealProducts: jest.fn(),
  useDealProduct: jest.fn(),
}));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
// home-all-branches: the Deals LIST now reads `useBranch()` (via the shared
// confirm-then-switch hook) to decide whether a tapped deal needs a branch
// switch. Mocked so the screen renders outside a BranchProvider.
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));

const mockUseDeals = jest.mocked(useDealProducts);
const mockUseDeal = jest.mocked(useDealProduct);
const mockUseCart = jest.mocked(useCart);
const mockUseBranch = jest.mocked(useBranch);

const dealProduct: Product = {
  id: 'd1',
  name: 'Combo Deal',
  description: 'Fries + drink',
  basePriceCents: 999,
  options: { size: [], flavor: [], add_on: [] },
  isDeal: true,
  components: [
    { componentProductId: 'p1', componentName: 'Loaded Fries', quantity: 2 },
    { componentProductId: 'p2', componentName: 'Classic Soda', quantity: 1 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCart.mockReturnValue({
    addItem: jest.fn(),
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

describe('DealsListScreen — renders from Product-shaped deals', () => {
  test('renders a card per deal-product (name + price) from the repointed data', async () => {
    mockUseDeals.mockReturnValue({
      data: [dealProduct],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useDealProducts>);

    const { getByText } = await renderWithProviders(<DealsListScreen />);

    expect(getByText('Combo Deal')).toBeTruthy();
    expect(getByText('₱9.99')).toBeTruthy();
  });

  test('shows the empty state when there are no deal-products', async () => {
    mockUseDeals.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useDealProducts>);

    const { getByText } = await renderWithProviders(<DealsListScreen />);

    expect(getByText('No deals right now')).toBeTruthy();
  });

  /*
    DEAL-004's flag-not-hide (deal still listed) is UNCHANGED — but its
    presentation is deliberately inverted by home-all-branches AC9: this list is
    branch-agnostic browse, so a deal the currently-selected branch cannot fulfil
    must NOT be stamped "Unavailable at this branch". Other branches may carry it
    right now, and tapping it offers to switch. The screen therefore stops passing
    `available` to `DealCard` entirely.

    (`available` still gates the CTA on Deal Details below, which IS branch-
    committed — see that describe block.)
  */
  test('lists a branch-unavailable deal WITHOUT the unavailable badge (AC9)', async () => {
    mockUseDeals.mockReturnValue({
      data: [{ ...dealProduct, available: false, branches: [{ id: 'b2', name: 'North Branch' }] }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useDealProducts>);

    const { getByText, queryByText } = await renderWithProviders(<DealsListScreen />);

    // The deal is still present in the list...
    expect(getByText('Combo Deal')).toBeTruthy();
    // ...and is NOT dead-ended with a branch-mismatch badge.
    expect(queryByText('Unavailable at this branch')).toBeNull();
    // Instead it says where it CAN be picked up.
    expect(getByText('North Branch')).toBeTruthy();
  });
});

describe('DealDetailsScreen — Product data, What’s inside, add-to-cart CTA', () => {
  beforeEach(() => {
    mockUseDeal.mockReturnValue({ data: dealProduct, isLoading: false, isError: false });
  });

  test('renders the deal name, price and the "What’s inside" components card', async () => {
    const { getByText } = await renderWithProviders(<DealDetailsScreen />);

    expect(getByText('Combo Deal')).toBeTruthy();
    expect(getByText('₱9.99')).toBeTruthy();
    expect(getByText("What's inside")).toBeTruthy();
    expect(getByText('2× Loaded Fries')).toBeTruthy();
    expect(getByText('1× Classic Soda')).toBeTruthy();
  });

  test('Add to cart adds the deal-product as a plain cart line and navigates to the cart', async () => {
    const addItem = jest.fn();
    mockUseCart.mockReturnValue({ addItem } as unknown as ReturnType<typeof useCart>);

    const { getByRole } = await renderWithProviders(<DealDetailsScreen />);

    fireEvent.press(getByRole('button', { name: 'Add to cart' }));

    expect(addItem).toHaveBeenCalledTimes(1);
    const [menuItem, opts] = addItem.mock.calls[0] as [Record<string, unknown>, unknown[]];
    expect(menuItem).toMatchObject({
      id: 'd1',
      name: 'Combo Deal',
      priceCents: 999,
      isAvailable: true,
    });
    expect(opts).toEqual([]);
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/cart');
  });

  // DEAL-004 AC3: when the selected branch can't fulfil the deal, the CTA is
  // gated — the button reads "Unavailable at this branch" and pressing it does
  // NOT add to cart or navigate.
  test('gates the CTA when the deal is unavailable at the selected branch', async () => {
    const addItem = jest.fn();
    mockUseCart.mockReturnValue({ addItem } as unknown as ReturnType<typeof useCart>);
    mockUseDeal.mockReturnValue({
      data: { ...dealProduct, available: false },
      isLoading: false,
      isError: false,
    });

    const { getByText, getByRole } = await renderWithProviders(<DealDetailsScreen />);

    // The unavailable CTA label renders instead of "Add to cart".
    expect(getByText("This deal isn't available at your selected branch right now.")).toBeTruthy();

    // Pressing the disabled CTA is a no-op — no add-to-cart, no navigation.
    fireEvent.press(getByRole('button', { name: 'Unavailable at this branch' }));
    expect(addItem).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
