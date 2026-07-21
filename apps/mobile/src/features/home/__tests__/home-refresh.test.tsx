import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useDealProducts } from '@/features/deals/hooks/use-deal-products';
import { useMenu } from '@/features/menu/hooks/use-menu';
import { useOrderHistory } from '@/features/orders/hooks/use-order-history';
import { useRewardsSummary } from '@/features/rewards/hooks/use-rewards-summary';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC4 — one Home pull-to-refresh gesture refetches EVERY mounted query
 * (menu + deals + branch + rewards + order-history — D5), and `refreshing` always
 * clears via `finally` even when one refetch rejects.
 *
 * All data hooks are mocked (Home composes five queries; mocking each hook's
 * `refetch` jest.fn is the honest way to assert the single-gesture fan-out).
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/home/components/home-header', () => ({ HomeHeader: () => null }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
jest.mock('@/features/deals/hooks/use-deal-products', () => ({ useDealProducts: jest.fn() }));
jest.mock('@/features/menu/hooks/use-menu', () => ({ useMenu: jest.fn() }));
jest.mock('@/features/orders/hooks/use-order-history', () => ({ useOrderHistory: jest.fn() }));
jest.mock('@/features/rewards/hooks/use-rewards-summary', () => ({ useRewardsSummary: jest.fn() }));
jest.mock('@/features/branches/lib/navigate-to-branch', () => ({
  useNavigateToBranch: () => jest.fn(),
}));
jest.mock('@/features/menu/lib/navigate-to-product', () => ({
  useNavigateToProduct: () => jest.fn(),
}));
jest.mock('@/features/orders/lib/navigate-to-tracking', () => ({
  useNavigateToOrderTracking: () => jest.fn(),
}));

const mockUseBranch = jest.mocked(useBranch);
const mockUseCart = jest.mocked(useCart);
const mockUseDealProducts = jest.mocked(useDealProducts);
const mockUseMenu = jest.mocked(useMenu);
const mockUseOrderHistory = jest.mocked(useOrderHistory);
const mockUseRewardsSummary = jest.mocked(useRewardsSummary);

type RefetchMock = jest.Mock<() => Promise<unknown>>;
let refetchBranch: RefetchMock;
let menuRefetch: RefetchMock;
let dealsRefetch: RefetchMock;
let rewardsRefetch: RefetchMock;
let orderHistoryRefetch: RefetchMock;

function seedHooks() {
  refetchBranch = jest.fn<() => Promise<unknown>>();
  menuRefetch = jest.fn<() => Promise<unknown>>();
  dealsRefetch = jest.fn<() => Promise<unknown>>();
  rewardsRefetch = jest.fn<() => Promise<unknown>>();
  orderHistoryRefetch = jest.fn<() => Promise<unknown>>();

  mockUseBranch.mockReturnValue({
    selectedBranch: null,
    isLoading: false,
    isError: false,
    refetch: refetchBranch,
  } as unknown as ReturnType<typeof useBranch>);
  mockUseCart.mockReturnValue({
    setBranch: jest.fn(),
    cart: { pickupBranchId: '' },
  } as unknown as ReturnType<typeof useCart>);
  mockUseMenu.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch: menuRefetch,
  } as unknown as ReturnType<typeof useMenu>);
  mockUseDealProducts.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    refetch: dealsRefetch,
  } as unknown as ReturnType<typeof useDealProducts>);
  mockUseRewardsSummary.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch: rewardsRefetch,
  } as unknown as ReturnType<typeof useRewardsSummary>);
  mockUseOrderHistory.mockReturnValue({
    data: { pages: [{ orders: [], nextCursor: null }], pageParams: [null] },
    refetch: orderHistoryRefetch,
  } as unknown as ReturnType<typeof useOrderHistory>);
}

beforeEach(() => {
  jest.clearAllMocks();
  seedHooks();
});

describe('HomeScreen — pull-to-refresh (AC4)', () => {
  test('one pull refetches menu + deals + branch + rewards + order-history', async () => {
    const screen = await renderWithProviders(<HomeScreen />);

    const refreshControl = screen.getByTestId('home-scroll').props.refreshControl;
    await act(async () => {
      await refreshControl.props.onRefresh();
    });

    expect(menuRefetch).toHaveBeenCalledTimes(1);
    expect(dealsRefetch).toHaveBeenCalledTimes(1);
    expect(refetchBranch).toHaveBeenCalledTimes(1);
    expect(rewardsRefetch).toHaveBeenCalledTimes(1);
    expect(orderHistoryRefetch).toHaveBeenCalledTimes(1);
  });

  test('refreshing clears via finally even when one refetch rejects', async () => {
    menuRefetch.mockRejectedValueOnce(new Error('menu down'));

    const screen = await renderWithProviders(<HomeScreen />);

    const refreshControl = screen.getByTestId('home-scroll').props.refreshControl;
    // Before a pull, not refreshing.
    expect(refreshControl.props.refreshing).toBe(false);

    await act(async () => {
      // Swallow the expected Promise.all rejection — the point is `finally`.
      await (refreshControl.props.onRefresh() as Promise<void>).catch(() => {});
    });

    // Every refetch still fired (Promise.all invokes them all before awaiting).
    expect(menuRefetch).toHaveBeenCalledTimes(1);
    expect(dealsRefetch).toHaveBeenCalledTimes(1);
    expect(refetchBranch).toHaveBeenCalledTimes(1);
    expect(rewardsRefetch).toHaveBeenCalledTimes(1);
    expect(orderHistoryRefetch).toHaveBeenCalledTimes(1);
    // `finally` reset the flag despite the rejection (re-read the fresh element).
    expect(screen.getByTestId('home-scroll').props.refreshControl.props.refreshing).toBe(false);
  });
});
