import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch, Product } from '@jojopotato/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import DealsListScreen from '@/app/(tabs)/deals/index';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useDealProducts } from '@/features/deals/hooks/use-deal-products';
import { renderWithProviders } from '@/test-utils/render';

/**
 * home-all-branches AC9 — the Deals tab gets the identical treatment to the Home
 * strip: never "Unavailable at this branch" for a mere branch mismatch, a
 * branch-count subtext on every card, and a confirm-then-switch flow that
 * resolves BEFORE Deal Details opens.
 */
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@/features/deals/hooks/use-deal-products', () => ({ useDealProducts: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));

const mockUseDealProducts = jest.mocked(useDealProducts);
const mockUseBranch = jest.mocked(useBranch);
const mockUseCart = jest.mocked(useCart);

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

function deal(over: Partial<Product> = {}): Product {
  return {
    id: 'd1',
    name: 'Combo Deal',
    description: 'Fries + drink',
    basePriceCents: 999,
    options: { size: [], flavor: [], add_on: [] },
    isDeal: true,
    components: [],
    branches: [],
    ...over,
  };
}

let setBranch: jest.Mock;
let clearCart: jest.Mock;
let setSelectedBranch: jest.Mock;

function seed(deals: Product[], opts: { cartItems?: unknown[] } = {}) {
  setBranch = jest.fn();
  clearCart = jest.fn();
  setSelectedBranch = jest.fn();

  mockUseDealProducts.mockReturnValue({
    data: deals,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useDealProducts>);

  mockUseBranch.mockReturnValue({
    selectedBranch: downtown,
    branches: [downtown, north],
    setSelectedBranch,
  } as unknown as ReturnType<typeof useBranch>);

  mockUseCart.mockReturnValue({
    cart: { items: opts.cartItems ?? [], pickupBranchId: 'b1' },
    setBranch,
    clearCart,
  } as unknown as ReturnType<typeof useCart>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DealsListScreen — all-branch treatment (AC9)', () => {
  test('a deal the selected branch cannot fulfil shows subtext, not an unavailable badge', async () => {
    seed([deal({ available: false, branches: [{ id: 'b2', name: 'North Branch' }] })]);

    const { getByText, queryByText } = await renderWithProviders(<DealsListScreen />);

    expect(getByText('Combo Deal')).toBeTruthy();
    expect(queryByText('Unavailable at this branch')).toBeNull();
    expect(getByText('North Branch')).toBeTruthy();
  });

  test('shows "Available at N branches" when several branches carry the deal', async () => {
    seed([
      deal({
        branches: [
          { id: 'b1', name: 'Downtown' },
          { id: 'b2', name: 'North Branch' },
        ],
      }),
    ]);

    const { getByText } = await renderWithProviders(<DealsListScreen />);

    expect(getByText('Available at 2 branches')).toBeTruthy();
  });

  test('a same-branch tap opens Deal Details directly, with no dialog', async () => {
    seed([deal({ branches: [{ id: 'b1', name: 'Downtown' }] })]);

    const { getByText, queryByText } = await renderWithProviders(<DealsListScreen />);
    fireEvent.press(getByText('Combo Deal'));

    expect(queryByText('Switch branch?')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/deals/deal/[dealId]',
      params: { dealId: 'd1' },
    });
  });

  test('a cross-branch tap asks first; cancel navigates nowhere and mutates nothing', async () => {
    seed([deal({ branches: [{ id: 'b2', name: 'North Branch' }] })]);

    const { getByText, findByText, getByTestId, queryByText } = await renderWithProviders(
      <DealsListScreen />,
    );
    fireEvent.press(getByText('Combo Deal'));

    expect(await findByText('Switch branch?')).toBeTruthy();
    expect(getByText(/This is from North Branch\./)).toBeTruthy();

    fireEvent.press(getByTestId('confirm-dialog-cancel'));

    await waitFor(() => expect(queryByText('Switch branch?')).toBeNull());
    expect(mockPush).not.toHaveBeenCalled();
    expect(setBranch).not.toHaveBeenCalled();
    expect(setSelectedBranch).not.toHaveBeenCalled();
    expect(clearCart).not.toHaveBeenCalled();
  });

  test('confirming switches both branch stores BEFORE opening Deal Details', async () => {
    seed([deal({ branches: [{ id: 'b2', name: 'North Branch' }] })]);

    const { getByText, findByText, getByTestId } = await renderWithProviders(<DealsListScreen />);
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
    expect(setBranch).toHaveBeenCalledWith('b2');
    expect(setSelectedBranch).toHaveBeenCalledWith(north);
  });

  test('confirming clears an other-branch cart, after warning about it', async () => {
    seed([deal({ branches: [{ id: 'b2', name: 'North Branch' }] })], {
      cartItems: [{ lineId: 'l1' }],
    });

    const { getByText, findByText, getByTestId } = await renderWithProviders(<DealsListScreen />);
    fireEvent.press(getByText('Combo Deal'));
    await findByText('Switch branch?');

    expect(getByText(/Your current cart will be cleared\./)).toBeTruthy();

    fireEvent.press(getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(clearCart).toHaveBeenCalledTimes(1));
  });

  // AC4's Deals-side equivalent: a deal no branch can fulfil is still listed, it
  // simply carries no subtext — never a dead-ended "unavailable" card.
  test('a deal no branch can fulfil is still listed, with no subtext and no badge', async () => {
    seed([deal({ available: false, branches: [] })]);

    const { getByText, queryByText, queryByTestId } = await renderWithProviders(
      <DealsListScreen />,
    );

    expect(getByText('Combo Deal')).toBeTruthy();
    expect(queryByText('Unavailable at this branch')).toBeNull();
    expect(queryByTestId('deal-card-subtext')).toBeNull();
  });
});
