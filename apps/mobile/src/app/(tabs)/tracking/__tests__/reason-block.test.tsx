import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Order, OrderStatus } from '@jojopotato/types';

import OrderTrackingScreen from '@/app/(tabs)/tracking/index';
import { useCancelOrder } from '@/features/orders/hooks/use-cancel-order';
import { useCompleteOrder } from '@/features/orders/hooks/use-complete-order';
import { useOrderQuery } from '@/features/orders/hooks/use-order-query';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('@/features/orders/hooks/use-order-query', () => ({
  useOrderQuery: jest.fn(),
  isTerminalStatus: (s: string) => ['completed', 'cancelled', 'rejected'].includes(s),
}));
jest.mock('@/features/orders/hooks/use-complete-order', () => ({ useCompleteOrder: jest.fn() }));
jest.mock('@/features/orders/hooks/use-cancel-order', () => ({ useCancelOrder: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({ orderId: 'order-1' }),
}));

const mockUseOrderQuery = jest.mocked(useOrderQuery);
const mockUseCompleteOrder = jest.mocked(useCompleteOrder);
const mockUseCancelOrder = jest.mocked(useCancelOrder);

/**
 * Customer-facing terminal-reason block (CodeRabbit PR #156).
 *
 * The SPEC opened by promising "the customer never learns why" would be fixed,
 * but the reason was rendered only on the STAFF screen — the customer's tracking
 * screen never read `reasonCode`, so the stated gap was still open at merge time.
 *
 * The actor test below is the load-bearing one: an early draft hardcoded
 * `resolveReasonLabel(code, 'staff')`, which resolves a customer's OWN
 * cancellation reason against the staff table. That is silently wrong rather
 * than broken, so only an assertion on the resolved copy catches it.
 */
function render(order: Partial<Order> & { status: OrderStatus }) {
  mockUseOrderQuery.mockReturnValue({
    data: { id: 'order-1', orderNumber: 'JP-260722-0001', estimatedReadyAt: null, ...order },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useOrderQuery>);
  mockUseCompleteOrder.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useCompleteOrder>);
  mockUseCancelOrder.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useCancelOrder>);
  return renderWithProviders(<OrderTrackingScreen />);
}

describe('tracking screen — terminal reason is visible to the customer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('a staff rejection shows the reason label from the STAFF table', async () => {
    const { findByTestId, getByText } = await render({
      status: 'rejected',
      reasonCode: 'out_of_stock',
      reasonActor: 'staff',
      reasonNote: null,
    });

    await findByTestId('tracking-reason-block');
    // The staff table's copy for `out_of_stock`.
    getByText('Item(s) out of stock');
  });

  test('a staff note is shown alongside the label', async () => {
    const { getByText } = await render({
      status: 'rejected',
      reasonCode: 'other',
      reasonActor: 'staff',
      reasonNote: 'Fryer is down until Thursday.',
    });

    getByText('Fryer is down until Thursday.');
  });

  test('a CUSTOMER cancellation resolves against the CUSTOMER table, not the staff one', async () => {
    const { getByText, queryByText } = await render({
      status: 'cancelled',
      reasonCode: 'changed_my_mind',
      reasonActor: 'customer',
      reasonNote: null,
    });

    // Non-vacuity: hardcoding the actor to 'staff' makes resolveReasonLabel fall
    // through to returning the raw code, so this exact-copy assertion turns red.
    getByText('Changed my mind');
    expect(queryByText('changed_my_mind')).toBeNull();
  });

  test('a terminal order with no reason renders no empty block', async () => {
    const { queryByTestId } = await render({
      status: 'cancelled',
      reasonCode: null,
      reasonActor: null,
      reasonNote: null,
    });

    expect(queryByTestId('tracking-reason-block')).toBeNull();
  });

  test('a non-terminal order never shows the block, even if a reason somehow exists', async () => {
    const { queryByTestId } = await render({
      status: 'pending',
      reasonCode: 'out_of_stock',
      reasonActor: 'staff',
      reasonNote: null,
    });

    expect(queryByTestId('tracking-reason-block')).toBeNull();
  });
});
