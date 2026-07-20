import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Order, PickupBranch } from '@jojopotato/types';
import { act, waitFor } from '@testing-library/react-native';

import OrderHistoryScreen from '@/app/(tabs)/history/index';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { fetchOrderHistory } from '@/features/orders/lib/api-client';
import { useReorder } from '@/features/orders/hooks/use-reorder';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC6 / AC7 — Order History pagination via `useInfiniteQuery`.
 *
 * The real hook runs; the mocked `fetchOrderHistory` serves page 1 (2 orders,
 * cursor "c1") then page 2 (1 order, null cursor). `onEndReached` appends the next
 * page (AC6: union of pages has no dup/missing IDs — breaking `getNextPageParam`
 * to always-null hides page 2 and turns this red). After `nextCursor` is null a
 * further `onEndReached` fires NO new fetch (AC7).
 */
jest.mock('@/features/orders/lib/api-client', () => ({ fetchOrderHistory: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/orders/hooks/use-reorder', () => ({ useReorder: jest.fn() }));

const mockFetch = jest.mocked(fetchOrderHistory);
const mockUseBranch = jest.mocked(useBranch);
const mockUseReorder = jest.mocked(useReorder);

function order(id: string, orderNumber: string): Order {
  return {
    id,
    orderNumber,
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

const PAGE_1 = { orders: [order('o1', 'JP-0001'), order('o2', 'JP-0002')], nextCursor: 'c1' };
const PAGE_2 = { orders: [order('o3', 'JP-0003')], nextCursor: null };

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
  // Cursor-driven paging: page 1 on mount (cursor null), page 2 on fetchNextPage.
  mockFetch.mockImplementation(async (params) => (params?.cursor === 'c1' ? PAGE_2 : PAGE_1));
});

describe('OrderHistoryScreen — pagination (AC6/AC7)', () => {
  test('onEndReached appends the next page; flattened list = union of both pages, no dup/missing', async () => {
    const screen = await renderWithProviders(<OrderHistoryScreen />);
    // Page 1 rendered on mount.
    expect(await screen.findByText('JP-0001')).toBeTruthy();
    expect(screen.getByText('JP-0002')).toBeTruthy();
    expect(screen.queryByText('JP-0003')).toBeNull();

    // Scroll-to-end → append page 2.
    await act(async () => {
      screen.getByTestId('order-history-list').props.onEndReached();
    });

    await waitFor(() => expect(screen.getByText('JP-0003')).toBeTruthy());
    // Union of both pages, no dup/missing.
    expect(screen.getByText('JP-0001')).toBeTruthy();
    expect(screen.getByText('JP-0002')).toBeTruthy();
    expect(screen.getByText('JP-0003')).toBeTruthy();
    // Exactly two fetches: page 1 (mount) + page 2 (fetchNextPage).
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('after nextCursor is null, a further onEndReached triggers no new fetch', async () => {
    const screen = await renderWithProviders(<OrderHistoryScreen />);
    expect(await screen.findByText('JP-0001')).toBeTruthy();

    // Load page 2 (end of data — nextCursor null → hasNextPage false).
    await act(async () => {
      screen.getByTestId('order-history-list').props.onEndReached();
    });
    await waitFor(() => expect(screen.getByText('JP-0003')).toBeTruthy());
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // A further end-reached must NOT fetch again (clean stop at end-of-data).
    await act(async () => {
      screen.getByTestId('order-history-list').props.onEndReached();
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
