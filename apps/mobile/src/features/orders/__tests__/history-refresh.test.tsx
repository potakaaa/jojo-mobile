import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Order, PickupBranch } from '@jojopotato/types';
import { act, waitFor } from '@testing-library/react-native';

import OrderHistoryScreen from '@/app/(tabs)/history/index';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { fetchOrderHistory } from '@/features/orders/lib/api-client';
import { useReorder } from '@/features/orders/hooks/use-reorder';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC2 / AC5 — Order History pull-to-refresh.
 *
 * The real `useOrderHistory` (useInfiniteQuery) runs; only the api-client
 * `fetchOrderHistory` is mocked, so a pull forcing `refetch()` fires the fetcher a
 * SECOND time (AC5: stale-time bypass — the mount data is still "fresh"). A failed
 * refresh retains the previously-loaded orders (AC2 error path).
 */
jest.mock('@/features/orders/lib/api-client', () => ({ fetchOrderHistory: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/orders/hooks/use-reorder', () => ({ useReorder: jest.fn() }));

const mockFetch = jest.mocked(fetchOrderHistory);
const mockUseBranch = jest.mocked(useBranch);
const mockUseReorder = jest.mocked(useReorder);

const ORDER_NUMBER = 'JP-260717-0001';

function order(): Order {
  return {
    id: 'o1',
    orderNumber: ORDER_NUMBER,
    branchId: 'b1',
    items: [],
    status: 'completed',
    subtotalCents: 12000,
    discountTotalCents: 0,
    totalCents: 12000,
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

describe('OrderHistoryScreen — pull-to-refresh (AC2/AC5)', () => {
  test('a pull refetches page 1 (fetcher call-count increments even when data is fresh)', async () => {
    mockFetch.mockResolvedValue({ orders: [order()], nextCursor: null });

    const screen = await renderWithProviders(<OrderHistoryScreen />);
    expect(await screen.findByText(ORDER_NUMBER)).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const refreshControl = screen.getByTestId('order-history-list').props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  test('a failed refresh retains the previously-loaded orders', async () => {
    mockFetch.mockResolvedValueOnce({ orders: [order()], nextCursor: null });
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const screen = await renderWithProviders(<OrderHistoryScreen />);
    expect(await screen.findByText(ORDER_NUMBER)).toBeTruthy();

    const refreshControl = screen.getByTestId('order-history-list').props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    // Prior orders stay visible after the failed refetch — nothing blanks.
    await waitFor(() => expect(screen.getByText(ORDER_NUMBER)).toBeTruthy());
  });
});
