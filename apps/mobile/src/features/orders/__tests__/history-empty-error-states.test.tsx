import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Order, PickupBranch } from '@jojopotato/types';
import { act, waitFor } from '@testing-library/react-native';

import OrderHistoryScreen from '@/app/(tabs)/history/index';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { fetchOrderHistory } from '@/features/orders/lib/api-client';
import { useReorder } from '@/features/orders/hooks/use-reorder';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC8 / AC9 — distinct empty vs error states, and error-path data retention.
 *
 * The real hook runs; only `fetchOrderHistory` is mocked. Zero orders → the
 * distinct "No orders yet" empty state (never the error copy). An initial fetch
 * failure → the "Couldn't load your orders" error state. A failed REFRESH after a
 * successful load retains the previously-loaded orders (AC9).
 */
jest.mock('@/features/orders/lib/api-client', () => ({ fetchOrderHistory: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/orders/hooks/use-reorder', () => ({ useReorder: jest.fn() }));

const mockFetch = jest.mocked(fetchOrderHistory);
const mockUseBranch = jest.mocked(useBranch);
const mockUseReorder = jest.mocked(useReorder);

const ORDER_NUMBER = 'JP-260717-0009';

function order(): Order {
  return {
    id: 'o1',
    orderNumber: ORDER_NUMBER,
    branchId: 'b1',
    items: [],
    status: 'completed',
    subtotalCents: 1000,
    discountTotalCents: 0,
    totalCents: 1000,
    paymentMethod: 'pay_at_branch',
    paymentStatus: 'paid',
    estimatedReadyAt: null,
    placedAt: '2026-07-13T10:00:00.000Z',
    dealId: null,
  };
}

function branch(): PickupBranch {
  return {
    id: 'b1',
    name: 'Downtown',
    address: '1 Test St',
    latitude: 0,
    longitude: 0,
    phone: '000',
    openingHours: '{}',
    estimatedPrepMinutes: 15,
    isAcceptingPickup: true,
    priority: 0,
    isOpen: true,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseBranch.mockReturnValue({ branches: [branch()] } as unknown as ReturnType<
    typeof useBranch
  >);
  mockUseReorder.mockReturnValue({
    reorder: jest.fn(),
    isReordering: false,
    error: null,
  } as unknown as ReturnType<typeof useReorder>);
});

describe('OrderHistoryScreen — empty and error states (AC8/AC9)', () => {
  test('zero orders renders the distinct "No orders yet" empty state (not an error)', async () => {
    mockFetch.mockResolvedValue({ orders: [], nextCursor: null });

    const screen = await renderWithProviders(<OrderHistoryScreen />);

    expect(await screen.findByText('No orders yet')).toBeTruthy();
    expect(screen.queryByText("Couldn't load your orders")).toBeNull();
  });

  test('an initial fetch failure renders the error state', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));

    const screen = await renderWithProviders(<OrderHistoryScreen />);

    expect(await screen.findByText("Couldn't load your orders")).toBeTruthy();
    expect(screen.queryByText('No orders yet')).toBeNull();
  });

  test('a failed refresh retains the previously-loaded orders (does not blank)', async () => {
    mockFetch.mockResolvedValueOnce({ orders: [order()], nextCursor: null });
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const screen = await renderWithProviders(<OrderHistoryScreen />);
    expect(await screen.findByText(ORDER_NUMBER)).toBeTruthy();

    const refreshControl = screen.getByTestId('order-history-list').props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(ORDER_NUMBER)).toBeTruthy());
  });
});
