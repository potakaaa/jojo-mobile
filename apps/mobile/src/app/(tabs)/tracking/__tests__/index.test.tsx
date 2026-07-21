import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Order, OrderStatus } from '@jojopotato/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import OrderTrackingScreen from '@/app/(tabs)/tracking/index';
import { useCompleteOrder } from '@/features/orders/hooks/use-complete-order';
import { useOrderQuery } from '@/features/orders/hooks/use-order-query';
import { renderWithProviders } from '@/test-utils/render';

/*
  Screen test for the customer "Mark as picked up" action (AC9 + AC10).

  `use-order-query` is mocked with `requireActual` spread so the REAL
  `isTerminalStatus` still runs — the screen's own `live` flag depends on it, and
  stubbing it would let a broken terminal-status check pass unnoticed.

  This suite is only possible because `test-utils/jest-setup.ts` now mocks
  reanimated's `Easing` and `withRepeat`: the screen's LiveBadge calls
  `Easing.inOut(Easing.ease)` at mount, which threw before that mock existed.
*/

// The global stub returns no route params; this screen needs a concrete
// `orderId`, and the mutation must be sent for THAT id (it is also the id the
// screen's react-query cache is keyed on).
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

const mockUseOrderQuery = jest.mocked(useOrderQuery);
const mockUseCompleteOrder = jest.mocked(useCompleteOrder);

const mutate = jest.fn();

function orderWithStatus(status: OrderStatus): Order {
  return {
    id: 'order-1',
    orderNumber: 'JP-260721-0001',
    status,
    estimatedReadyAt: null,
  } as unknown as Order;
}

function renderWith(status: OrderStatus, overrides: Record<string, unknown> = {}) {
  mockUseOrderQuery.mockReturnValue({
    data: orderWithStatus(status),
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useOrderQuery>);

  mockUseCompleteOrder.mockReturnValue({
    mutate,
    isPending: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useCompleteOrder>);

  return renderWithProviders(<OrderTrackingScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AC9 — the button renders only when the order is ready', () => {
  test('renders the button when status is ready', async () => {
    const { getByTestId } = await renderWith('ready');

    expect(getByTestId('mark-picked-up-button')).toBeTruthy();
  });

  // Every non-`ready` status, not just a sample: the gate must be an equality
  // check on `ready`, and a `!isTerminalStatus(...)`-style mistake would still
  // pass if only terminal statuses were checked.
  const nonReady: OrderStatus[] = [
    'pending',
    'accepted',
    'preparing',
    'flavoring',
    'completed',
    'cancelled',
    'rejected',
  ];

  test.each(nonReady)('does not render the button when status is %s', async (status) => {
    const { queryByTestId } = await renderWith(status);

    expect(queryByTestId('mark-picked-up-button')).toBeNull();
  });
});

describe('AC10 — tapping asks for confirmation before sending anything', () => {
  test('tapping opens the confirm dialog and sends no request yet', async () => {
    const { getByTestId, findByTestId } = await renderWith('ready');

    await fireEvent.press(getByTestId('mark-picked-up-button'));

    // The dialog is up...
    expect(await findByTestId('confirm-dialog-confirm')).toBeTruthy();
    // ...but nothing has been sent.
    expect(mutate).not.toHaveBeenCalled();
  });

  test('dismissing the dialog sends nothing', async () => {
    const { getByTestId, findByTestId, queryByTestId } = await renderWith('ready');

    await fireEvent.press(getByTestId('mark-picked-up-button'));
    await fireEvent.press(await findByTestId('confirm-dialog-cancel'));

    await waitFor(() => expect(queryByTestId('confirm-dialog-confirm')).toBeNull());
    expect(mutate).not.toHaveBeenCalled();
  });

  test('confirming sends exactly one completion request for this order', async () => {
    const { getByTestId, findByTestId } = await renderWith('ready');

    await fireEvent.press(getByTestId('mark-picked-up-button'));
    await fireEvent.press(await findByTestId('confirm-dialog-confirm'));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith('order-1');
  });
});
