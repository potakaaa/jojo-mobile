import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Product } from '@jojopotato/types';
import { fireEvent } from '@testing-library/react-native';

import DealDetailsScreen from '@/app/(tabs)/deals/deal/[dealId]';
import DealsListScreen from '@/app/(tabs)/deals/index';
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

const mockUseDeals = jest.mocked(useDealProducts);
const mockUseDeal = jest.mocked(useDealProduct);
const mockUseCart = jest.mocked(useCart);

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
  mockUseCart.mockReturnValue({ addItem: jest.fn() } as unknown as ReturnType<typeof useCart>);
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
});
