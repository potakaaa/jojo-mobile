import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Order, OrderStatus } from '@jojopotato/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import OrderTrackingScreen from '@/app/(tabs)/tracking/index';
import { useCancelOrder } from '@/features/orders/hooks/use-cancel-order';
import { useCompleteOrder } from '@/features/orders/hooks/use-complete-order';
import { useOrderQuery } from '@/features/orders/hooks/use-order-query';
import { renderWithProviders } from '@/test-utils/render';

/**
 * B3.7 + B3.8 coverage for the customer self-cancel action on the tracking screen.
 *
 * `use-order-query` is mocked with a `requireActual` spread so the REAL
 * `isTerminalStatus` still runs — the screen's `live` flag depends on it and
 * stubbing it would let a broken terminal-status check pass unnoticed (same
 * rationale as the sibling mark-picked-up suite).
 *
 * Non-vacuity: widening the screen's `order.status === 'pending'` gate to
 * `!isTerminalStatus(order.status)` turns the B3.7 cases red; removing the
 * ReasonDialog so the button mutates directly turns the B3.8 cases red (both
 * verified during EXECUTE).
 */

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return {
    __esModule: true,
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({ orderId: 'order-1' }),
    usePathname: () => '/',
    useIsFocused: () => true,
  };
});
jest.mock('@/features/orders/hooks/use-order-query', () => {
  const actual = jest.requireActual(
    '@/features/orders/hooks/use-order-query',
  ) as typeof import('@/features/orders/hooks/use-order-query');
  return { ...actual, useOrderQuery: jest.fn() };
});
jest.mock('@/features/orders/hooks/use-complete-order', () => ({
  useCompleteOrder: jest.fn(),
}));
jest.mock('@/features/orders/hooks/use-cancel-order', () => ({
  useCancelOrder: jest.fn(),
}));

const mockUseOrderQuery = jest.mocked(useOrderQuery);
const mockUseCompleteOrder = jest.mocked(useCompleteOrder);
const mockUseCancelOrder = jest.mocked(useCancelOrder);

const cancelMutate = jest.fn();

function orderWithStatus(status: OrderStatus): Order {
  return {
    id: 'order-1',
    orderNumber: 'JP-260722-0001',
    status,
    estimatedReadyAt: null,
  } as unknown as Order;
}

function renderWith(status: OrderStatus) {
  mockUseOrderQuery.mockReturnValue({
    data: orderWithStatus(status),
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
    mutate: cancelMutate,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useCancelOrder>);

  return renderWithProviders(<OrderTrackingScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('B3.7 — Cancel order shows only while the order is pending', () => {
  test('renders the button when the status is pending', async () => {
    const { getByTestId } = await renderWith('pending');

    expect(getByTestId('cancel-order-button')).toBeTruthy();
  });

  // Every non-pending status, not a sample: `pending` is the only status the
  // server route accepts, so an `!isTerminalStatus(...)`-style mistake (which
  // would wrongly show it for accepted/preparing/flavoring/ready) must fail here.
  const nonPending: OrderStatus[] = [
    'accepted',
    'preparing',
    'flavoring',
    'ready',
    'completed',
    'cancelled',
    'rejected',
  ];

  test.each(nonPending)('does not render the button when the status is %s', async (status) => {
    const { queryByTestId } = await renderWith(status);

    expect(queryByTestId('cancel-order-button')).toBeNull();
  });
});

describe('B3.8 — tapping asks before sending anything', () => {
  test('tapping opens the reason dialog and sends no request yet', async () => {
    const { getByTestId, findByTestId } = await renderWith('pending');

    await fireEvent.press(getByTestId('cancel-order-button'));

    expect(await findByTestId('cancel-order-submit')).toBeTruthy();
    expect(cancelMutate).not.toHaveBeenCalled();
  });

  test('dismissing the dialog sends nothing', async () => {
    const { getByTestId, findByTestId, queryByTestId } = await renderWith('pending');

    await fireEvent.press(getByTestId('cancel-order-button'));
    await fireEvent.press(await findByTestId('cancel-order-cancel'));

    await waitFor(() => expect(queryByTestId('cancel-order-submit')).toBeNull());
    expect(cancelMutate).not.toHaveBeenCalled();
  });

  test('confirming with NO reason still sends exactly one cancel (the reason is optional)', async () => {
    const { getByTestId, findByTestId } = await renderWith('pending');

    await fireEvent.press(getByTestId('cancel-order-button'));
    await fireEvent.press(await findByTestId('cancel-order-submit'));

    expect(cancelMutate).toHaveBeenCalledTimes(1);
    expect(cancelMutate).toHaveBeenCalledWith({
      orderId: 'order-1',
      reasonCode: undefined,
      note: undefined,
    });
  });

  test('confirming with a picked reason forwards that code', async () => {
    const { getByTestId, findByTestId } = await renderWith('pending');

    await fireEvent.press(getByTestId('cancel-order-button'));
    await fireEvent.press(await findByTestId('cancel-order-reason-changed_my_mind'));
    await fireEvent.press(await findByTestId('cancel-order-submit'));

    expect(cancelMutate).toHaveBeenCalledWith({
      orderId: 'order-1',
      reasonCode: 'changed_my_mind',
      note: undefined,
    });
  });
});
