import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { MenuResponse, PickupBranch, Product } from '@jojopotato/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useDealProducts } from '@/features/deals/hooks/use-deal-products';
import { useAllBranchProducts } from '@/features/menu/hooks/use-all-branch-products';
import { useOrderHistory } from '@/features/orders/hooks/use-order-history';
import { useRewardsSummary } from '@/features/rewards/hooks/use-rewards-summary';
import { renderWithProviders } from '@/test-utils/render';

/**
 * home-all-branches AC4–AC8 — the Home grid + deals strip tap flow.
 *
 * These are the Hybrid-tier gates: they prove the RENDERED output and the
 * CALLBACK SEQUENCE (dialog shown/hidden, branch stores written, navigation
 * fired, in that order). They do NOT prove real on-device navigation timing —
 * that stays Agent-Probe (AC12), the standing project-wide no-RN-E2E-runner gap.
 */
const mockNavigateToProduct = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@/features/home/components/home-header', () => ({ HomeHeader: () => null }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
jest.mock('@/features/deals/hooks/use-deal-products', () => ({ useDealProducts: jest.fn() }));
jest.mock('@/features/menu/hooks/use-all-branch-products', () => ({
  useAllBranchProducts: jest.fn(),
}));
jest.mock('@/features/orders/hooks/use-order-history', () => ({ useOrderHistory: jest.fn() }));
jest.mock('@/features/rewards/hooks/use-rewards-summary', () => ({ useRewardsSummary: jest.fn() }));
jest.mock('@/features/branches/lib/navigate-to-branch', () => ({
  useNavigateToBranch: () => jest.fn(),
}));
jest.mock('@/features/menu/lib/navigate-to-product', () => ({
  useNavigateToProduct: () => mockNavigateToProduct,
}));
jest.mock('@/features/orders/lib/navigate-to-tracking', () => ({
  useNavigateToOrderTracking: () => jest.fn(),
}));

const mockUseBranch = jest.mocked(useBranch);
const mockUseCart = jest.mocked(useCart);
const mockUseDealProducts = jest.mocked(useDealProducts);
const mockUseAllBranchProducts = jest.mocked(useAllBranchProducts);
const mockUseOrderHistory = jest.mocked(useOrderHistory);
const mockUseRewardsSummary = jest.mocked(useRewardsSummary);

function branch(id: string, name: string): PickupBranch {
  return {
    id,
    name,
    address: '1 Test St',
    latitude: 0,
    longitude: 0,
    phone: '000',
    openingHours: '{}',
    estimatedPrepMinutes: 15,
    isAcceptingPickup: true,
    priority: 0,
    isOpen: true,
  } as PickupBranch;
}

const downtown = branch('b1', 'Downtown');
const north = branch('b2', 'North Branch');

function product(id: string, name: string, branches: { id: string; name: string }[]): Product {
  return {
    id,
    name,
    basePriceCents: 12000,
    options: { size: [], flavor: [], add_on: [] },
    branches,
  };
}

function catalog(products: Product[]): MenuResponse {
  return { categories: [{ id: 'c1', name: 'Fries', products }] };
}

let setBranch: jest.Mock;
let clearCart: jest.Mock;
let setSelectedBranch: jest.Mock;

function seed(
  opts: {
    products?: Product[];
    deals?: Product[];
    cartItems?: unknown[];
    cartBranchId?: string;
  } = {},
) {
  setBranch = jest.fn();
  clearCart = jest.fn();
  setSelectedBranch = jest.fn();

  mockUseBranch.mockReturnValue({
    selectedBranch: downtown,
    branches: [downtown, north],
    setSelectedBranch,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useBranch>);

  mockUseCart.mockReturnValue({
    cart: { items: opts.cartItems ?? [], pickupBranchId: opts.cartBranchId ?? 'b1' },
    setBranch,
    clearCart,
  } as unknown as ReturnType<typeof useCart>);

  mockUseAllBranchProducts.mockReturnValue({
    data: catalog(opts.products ?? []),
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useAllBranchProducts>);

  mockUseDealProducts.mockReturnValue({
    data: opts.deals ?? [],
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useDealProducts>);

  mockUseRewardsSummary.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useRewardsSummary>);

  mockUseOrderHistory.mockReturnValue({
    data: { pages: [{ orders: [], nextCursor: null }], pageParams: [null] },
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useOrderHistory>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HomeScreen — all-branch grid (AC2/AC3/AC4)', () => {
  // AC4 — the dead end is gone: the selected branch (b1) carries NOTHING here,
  // yet the grid is fully populated.
  test('renders the all-branch grid even when the selected branch carries nothing', async () => {
    seed({
      products: [product('p1', 'Loaded Fries', [north]), product('p2', 'Cheesy Fries', [north])],
    });

    const { getByText, queryByText } = await renderWithProviders(<HomeScreen />);

    expect(getByText('Loaded Fries')).toBeTruthy();
    expect(getByText('Cheesy Fries')).toBeTruthy();
    expect(queryByText('Menu coming soon')).toBeNull();
  });

  // AC2 — one carrying branch → its name.
  test('shows the branch NAME as subtext for a single-branch product', async () => {
    seed({ products: [product('p1', 'Loaded Fries', [north])] });

    const { getByText } = await renderWithProviders(<HomeScreen />);

    expect(getByText('North Branch')).toBeTruthy();
  });

  // AC3 — several carrying branches → the real count.
  test('shows "Available at N branches" for a multi-branch product', async () => {
    seed({ products: [product('p1', 'Loaded Fries', [downtown, north])] });

    const { getByText } = await renderWithProviders(<HomeScreen />);

    expect(getByText('Available at 2 branches')).toBeTruthy();
  });

  test('shows the genuinely-empty-catalog state only when there are no products at all', async () => {
    seed({ products: [] });

    const { getByText } = await renderWithProviders(<HomeScreen />);

    expect(getByText('Menu coming soon')).toBeTruthy();
  });
});

describe('HomeScreen — cross-branch tap (AC5/AC6/AC7)', () => {
  // AC5 — carried here → straight through, no dialog. Unchanged behaviour.
  test('a same-branch tap navigates immediately with no dialog', async () => {
    seed({ products: [product('p1', 'Loaded Fries', [downtown])] });

    const { getByText, queryByText } = await renderWithProviders(<HomeScreen />);
    fireEvent.press(getByText('Loaded Fries'));

    expect(queryByText('Switch branch?')).toBeNull();
    expect(mockNavigateToProduct).toHaveBeenCalledWith('p1', 'b1');
  });

  // AC6 — not carried here → a dialog NAMING the branch; cancel changes nothing.
  test('a cross-branch tap shows a dialog naming the branch, and cancel is a no-op', async () => {
    seed({ products: [product('p1', 'Loaded Fries', [north])] });

    const { getByText, findByText, getByTestId, queryByText } = await renderWithProviders(
      <HomeScreen />,
    );
    fireEvent.press(getByText('Loaded Fries'));

    expect(await findByText('Switch branch?')).toBeTruthy();
    expect(getByText(/This is from North Branch\./)).toBeTruthy();
    expect(mockNavigateToProduct).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('confirm-dialog-cancel'));

    await waitFor(() => expect(queryByText('Switch branch?')).toBeNull());
    // Nothing moved TO THE TARGET branch. (`setBranch` is also called with the
    // ALREADY-selected 'b1' by Home's pre-existing cart-sync effect on mount —
    // unrelated to this flow, hence the narrower assertion.)
    expect(setBranch).not.toHaveBeenCalledWith('b2');
    expect(setSelectedBranch).not.toHaveBeenCalled();
    expect(clearCart).not.toHaveBeenCalled();
    expect(mockNavigateToProduct).not.toHaveBeenCalled();
  });

  // AC7 — confirm switches BOTH stores, then navigates. The `setSelectedBranch`
  // assertion is the one that proves the destination screen can actually resolve
  // the product: `useMenu()`/`useProductDetails()` key off that store alone.
  test('confirming switches both branch stores BEFORE navigating', async () => {
    seed({ products: [product('p1', 'Loaded Fries', [north])] });

    const { getByText, findByText, getByTestId } = await renderWithProviders(<HomeScreen />);
    fireEvent.press(getByText('Loaded Fries'));
    await findByText('Switch branch?');

    // Nothing has moved yet.
    expect(setSelectedBranch).not.toHaveBeenCalled();
    expect(mockNavigateToProduct).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(mockNavigateToProduct).toHaveBeenCalledWith('p1', 'b2'));
    expect(setBranch).toHaveBeenCalledWith('b2');
    expect(setSelectedBranch).toHaveBeenCalledWith(north);
    // Empty cart → nothing to clear.
    expect(clearCart).not.toHaveBeenCalled();
  });

  test('confirming clears a cart that belongs to a different branch, and warns first', async () => {
    seed({
      products: [product('p1', 'Loaded Fries', [north])],
      cartItems: [{ lineId: 'l1' }],
      cartBranchId: 'b1',
    });

    const { getByText, findByText, getByTestId } = await renderWithProviders(<HomeScreen />);
    fireEvent.press(getByText('Loaded Fries'));
    await findByText('Switch branch?');

    // The customer is told what happens to the cart before confirming.
    expect(getByText(/Your current cart will be cleared\./)).toBeTruthy();

    fireEvent.press(getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(mockNavigateToProduct).toHaveBeenCalledWith('p1', 'b2'));
    expect(clearCart).toHaveBeenCalledTimes(1);
  });
});

describe('HomeScreen — deals strip (AC8)', () => {
  test('never renders the unavailable badge for a mere branch mismatch, and shows subtext', async () => {
    seed({
      deals: [
        {
          ...product('d1', 'Combo Deal', [north]),
          isDeal: true,
          // The per-branch flag says the SELECTED branch cannot fulfil it — the
          // exact case that used to dead-end the strip.
          available: false,
        },
      ],
    });

    const { getByText, queryByText } = await renderWithProviders(<HomeScreen />);

    expect(getByText('Combo Deal')).toBeTruthy();
    expect(queryByText('Unavailable at this branch')).toBeNull();
    expect(getByText('North Branch')).toBeTruthy();
  });

  test('a cross-branch deal tap switches branch first, then opens Deal Details', async () => {
    seed({
      deals: [{ ...product('d1', 'Combo Deal', [north]), isDeal: true, available: false }],
    });

    const { getByText, findByText, getByTestId } = await renderWithProviders(<HomeScreen />);
    fireEvent.press(getByText('Combo Deal'));
    await findByText('Switch branch?');

    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('confirm-dialog-confirm'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(tabs)/deals/deal/[dealId]',
        params: { dealId: 'd1' },
      }),
    );
    expect(setSelectedBranch).toHaveBeenCalledWith(north);
  });

  test('a same-branch deal tap opens Deal Details directly', async () => {
    seed({
      deals: [{ ...product('d1', 'Combo Deal', [downtown]), isDeal: true, available: true }],
    });

    const { getByText, queryByText } = await renderWithProviders(<HomeScreen />);
    fireEvent.press(getByText('Combo Deal'));

    expect(queryByText('Switch branch?')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/deals/deal/[dealId]',
      params: { dealId: 'd1' },
    });
  });
});
