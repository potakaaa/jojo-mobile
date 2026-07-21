import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Category, MenuResponse } from '@jojopotato/types';
import { fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import OrderScreen from '@/app/(tabs)/order';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useMenu } from '@/features/menu/hooks/use-menu';
import { renderWithProviders } from '@/test-utils/render';

/**
 * Order-tab screen tests (AC1/AC2/AC3/AC5/AC6/AC7). Data hooks are mocked so each
 * state (loading / error / empty / success) and the header/badge/nav wiring can be
 * asserted deterministically. Real on-device scroll/visual polish is AC11
 * (Agent-Probe) — not covered here.
 */

jest.mock('@/features/menu/hooks/use-menu', () => ({ useMenu: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
jest.mock('@/features/menu/lib/navigate-to-product', () => ({
  useNavigateToProduct: () => jest.fn(),
}));

const mockUseMenu = jest.mocked(useMenu);
const mockUseBranch = jest.mocked(useBranch);
const mockUseCart = jest.mocked(useCart);
const mockRouterPush = jest.mocked(router.push);

function makeCategory(id: string, name: string): Category {
  return { id, name, products: [] };
}

const refetch = jest.fn<() => Promise<unknown>>();

function seedBranch() {
  mockUseBranch.mockReturnValue({
    branches: [{ id: 'b1', name: 'Downtown' }],
    selectedBranch: { id: 'b1', name: 'Downtown' },
    setSelectedBranch: jest.fn(),
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useBranch>);
}

function seedMenu(over: Partial<ReturnType<typeof useMenu>> = {}) {
  mockUseMenu.mockReturnValue({
    data: { categories: [] } as MenuResponse,
    isLoading: false,
    isError: false,
    refetch,
    ...over,
  } as unknown as ReturnType<typeof useMenu>);
}

function seedCart(itemCount: number) {
  mockUseCart.mockReturnValue({ itemCount } as unknown as ReturnType<typeof useCart>);
}

beforeEach(() => {
  jest.clearAllMocks();
  seedBranch();
  seedMenu();
  seedCart(0);
});

describe('OrderScreen — header + nav (AC1/AC3)', () => {
  test('renders a branded "Menu" header', async () => {
    const { getByText } = await renderWithProviders(<OrderScreen />);
    const title = getByText('Menu');
    expect(title).toBeTruthy();
    expect(title.props.accessibilityRole).toBe('header');
  });

  test('cart icon navigates to /(tabs)/cart', async () => {
    const { getByLabelText } = await renderWithProviders(<OrderScreen />);
    fireEvent.press(getByLabelText('View cart'));
    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/cart');
  });

  test('history icon navigates to /(tabs)/history', async () => {
    const { getByLabelText } = await renderWithProviders(<OrderScreen />);
    fireEvent.press(getByLabelText('Order history'));
    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/history');
  });
});

describe('OrderScreen — cart badge (AC2)', () => {
  test('hides the badge when the cart is empty', async () => {
    seedCart(0);
    const { queryByText } = await renderWithProviders(<OrderScreen />);
    expect(queryByText('0')).toBeNull();
  });

  test('shows the live count for a single item', async () => {
    seedCart(1);
    const { getByText } = await renderWithProviders(<OrderScreen />);
    expect(getByText('1')).toBeTruthy();
  });

  test('shows the live count for N items', async () => {
    seedCart(7);
    const { getByText } = await renderWithProviders(<OrderScreen />);
    expect(getByText('7')).toBeTruthy();
  });
});

describe('OrderScreen — loading / error / empty states (AC5/AC6/AC7)', () => {
  test('renders the menu skeleton (not a bare spinner) while loading', async () => {
    seedMenu({ isLoading: true } as Partial<ReturnType<typeof useMenu>>);
    const { getByTestId } = await renderWithProviders(<OrderScreen />);
    expect(getByTestId('menu-skeleton')).toBeTruthy();
  });

  test('renders EmptyState on error and Retry calls refetch', async () => {
    seedMenu({ isError: true } as Partial<ReturnType<typeof useMenu>>);
    const { getByText } = await renderWithProviders(<OrderScreen />);
    expect(getByText('Couldn’t load the menu')).toBeTruthy();
    fireEvent.press(getByText('Retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test('renders EmptyState when the branch has no menu', async () => {
    seedMenu({ data: { categories: [] } as MenuResponse });
    const { getByText } = await renderWithProviders(<OrderScreen />);
    expect(getByText('No menu available for this branch yet')).toBeTruthy();
  });

  test('renders the category quick-nav only above the threshold', async () => {
    const many: Category[] = [
      makeCategory('c1', 'Fries'),
      makeCategory('c2', 'Burgers'),
      makeCategory('c3', 'Drinks'),
      makeCategory('c4', 'Desserts'),
    ];
    seedMenu({ data: { categories: many } as MenuResponse });
    const { getByTestId } = await renderWithProviders(<OrderScreen />);
    expect(getByTestId('quick-nav-chip-c1')).toBeTruthy();
  });
});
