import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { MenuResponse, Order } from '@jojopotato/types';
import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useCart } from '@/features/cart/hooks/use-cart';
import { useReorderConflicts } from '@/features/cart/hooks/use-reorder-conflicts';
import { useReorder } from '@/features/orders/hooks/use-reorder';
import { queryClient } from '@/lib/query-client';

/**
 * Runner note: the plan specified this as a vitest `*.test.ts`, but `use-reorder.ts`
 * imports `expo-router` and `@/lib/api-client` (which pulls in `@better-auth/*`
 * ESM). `apps/mobile`'s vitest is `environment: 'node'` with no RN transform and
 * cannot parse those; jest/jest-expo owns `*.test.tsx` and already stubs them.
 *
 * D3: the hook must expose failure as DATA (`error`), never call `Alert` itself.
 */

jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
jest.mock('@/features/cart/hooks/use-reorder-conflicts', () => ({
  useReorderConflicts: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockUseCart = jest.mocked(useCart);
const mockUseReorderConflicts = jest.mocked(useReorderConflicts);

const FAILURE_MESSAGE = 'We were unable to load the latest menu for this order. Please try again.';

function order(): Order {
  return {
    id: 'o1',
    orderNumber: 'JP-260717-0001',
    branchId: 'b1',
    items: [],
    status: 'completed',
    subtotalCents: 0,
    discountTotalCents: 0,
    totalCents: 0,
    paymentMethod: 'pay_at_branch',
    paymentStatus: 'paid',
    estimatedReadyAt: null,
    placedAt: '2026-07-13T10:00:00.000Z',
    dealId: null,
  } as unknown as Order;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCart.mockReturnValue({
    addItem: jest.fn(),
    setBranch: jest.fn(),
    clearCart: jest.fn(),
  } as unknown as ReturnType<typeof useCart>);
  mockUseReorderConflicts.mockReturnValue({
    setConflicts: jest.fn(),
    clearConflicts: jest.fn(),
  } as unknown as ReturnType<typeof useReorderConflicts>);
});

describe('useReorder error lifecycle', () => {
  test('error is null before any reorder', async () => {
    const { result } = await renderHook(() => useReorder());
    expect(result.current.error).toBeNull();
  });

  test('a failed menu fetch sets error instead of firing an Alert', async () => {
    jest.spyOn(queryClient, 'fetchQuery').mockRejectedValue(new Error('network down'));

    const { result } = await renderHook(() => useReorder());
    await act(async () => {
      await result.current.reorder(order());
    });

    expect(result.current.error).toBe(FAILURE_MESSAGE);
    expect(result.current.isReordering).toBe(false);
  });

  // A stale failure must not sit next to a fresh, in-flight attempt.
  test('a stale error is cleared at the start of the next reorder', async () => {
    const fetchSpy = jest.spyOn(queryClient, 'fetchQuery');
    fetchSpy.mockRejectedValue(new Error('network down'));

    const { result } = await renderHook(() => useReorder());
    await act(async () => {
      await result.current.reorder(order());
    });
    expect(result.current.error).toBe(FAILURE_MESSAGE);

    // Second attempt succeeds — the previous error must not survive it.
    fetchSpy.mockResolvedValue({ categories: [] } as never);
    await act(async () => {
      await result.current.reorder(order());
    });
    expect(result.current.error).toBeNull();
  });
});

// Regression: CART-003 made the cart an async server resource, so the reorder
// must AWAIT its `addItem` writes before navigating — otherwise the cart screen
// paints empty (the reported bug), and a rejected add must not be swallowed.
describe('useReorder cart writes (CART-003 async cart)', () => {
  function orderWithItem(): Order {
    return {
      ...order(),
      items: [
        {
          id: 'li1',
          productId: 'p1',
          productNameSnapshot: 'Original Corndog',
          quantity: 2,
          unitPriceCents: 5000,
          totalPriceCents: 10000,
          selectedOptions: [],
        },
      ],
    } as unknown as Order;
  }

  function menuWithProduct(): MenuResponse {
    return {
      categories: [
        {
          id: 'c1',
          name: 'Corndogs',
          products: [
            {
              id: 'p1',
              name: 'Original Corndog',
              description: null,
              basePriceCents: 5000,
              imageUrl: null,
              options: {},
            },
          ],
        },
      ],
    } as unknown as MenuResponse;
  }

  test('awaits the item adds, then navigates to the cart', async () => {
    jest.spyOn(queryClient, 'fetchQuery').mockResolvedValue(menuWithProduct() as never);
    const addItem = jest.fn(async () => true);
    mockUseCart.mockReturnValue({
      addItem,
      setBranch: jest.fn(),
      clearCart: jest.fn(),
    } as unknown as ReturnType<typeof useCart>);

    const { result } = await renderHook(() => useReorder());
    await act(async () => {
      await result.current.reorder(orderWithItem());
    });

    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), [], 2);
    expect(jest.mocked(router.push)).toHaveBeenCalledWith('/(tabs)/cart');
    expect(result.current.error).toBeNull();
  });

  test('surfaces an error when an add fails, rather than silently landing on an empty cart', async () => {
    jest.spyOn(queryClient, 'fetchQuery').mockResolvedValue(menuWithProduct() as never);
    const addItem = jest.fn(async () => false); // server rejected the add
    mockUseCart.mockReturnValue({
      addItem,
      setBranch: jest.fn(),
      clearCart: jest.fn(),
    } as unknown as ReturnType<typeof useCart>);

    const { result } = await renderHook(() => useReorder());
    await act(async () => {
      await result.current.reorder(orderWithItem());
    });

    expect(result.current.error).toBe(
      'Some items could not be added to your cart. Please try again.',
    );
  });
});
