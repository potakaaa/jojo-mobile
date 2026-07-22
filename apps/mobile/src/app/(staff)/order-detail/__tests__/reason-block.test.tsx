import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { OrderStatus, StaffOrderDetail } from '@jojopotato/types';

import OrderDetailScreen from '@/app/(staff)/order-detail/[orderId]';
import { useRejectOrder } from '@/features/staff/hooks/use-reject-order';
import { useStaffOrderDetail } from '@/features/staff/hooks/use-staff-order-detail';
import { useUpdateOrderStatus } from '@/features/staff/hooks/use-update-order-status';
import { renderWithProviders } from '@/test-utils/render';

/**
 * Step-13b coverage (supports SPEC B2.6 + B3.9): the staff order-detail screen must
 * actually RENDER the terminal-transition reason. Without this the reason plumbing
 * would reach the wire and stop there — the API tests prove the fields are sent,
 * these prove a human can see them.
 *
 * Non-vacuity: deleting the `<OrderReasonBlock/>` render turns every positive case
 * red; dropping the `reasonActor`-keyed table lookup turns the customer-cancel case
 * red (it would show the staff label for the same code). Both verified in EXECUTE.
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
jest.mock('@/features/staff/hooks/use-staff-order-detail', () => ({
  useStaffOrderDetail: jest.fn(),
}));
jest.mock('@/features/staff/hooks/use-update-order-status', () => ({
  useUpdateOrderStatus: jest.fn(),
}));
jest.mock('@/features/staff/hooks/use-reject-order', () => ({
  useRejectOrder: jest.fn(),
}));

const mockUseStaffOrderDetail = jest.mocked(useStaffOrderDetail);
const mockUseUpdateOrderStatus = jest.mocked(useUpdateOrderStatus);
const mockUseRejectOrder = jest.mocked(useRejectOrder);

function orderWith(partial: Partial<StaffOrderDetail> & { status: OrderStatus }): StaffOrderDetail {
  return {
    id: 'order-1',
    orderNumber: 'JP-260722-0001',
    placedAt: new Date('2026-07-22T10:00:00Z').toISOString(),
    estimatedReadyAt: null,
    totalCents: 10000,
    items: [],
    reasonCode: null,
    reasonNote: null,
    reasonActor: null,
    ...partial,
  } as StaffOrderDetail;
}

function renderWith(order: StaffOrderDetail) {
  mockUseStaffOrderDetail.mockReturnValue({
    data: order,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useStaffOrderDetail>);
  mockUseUpdateOrderStatus.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useUpdateOrderStatus>);
  mockUseRejectOrder.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useRejectOrder>);

  return renderWithProviders(<OrderDetailScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('B2.6 — a rejected order shows the staff reason', () => {
  test('renders the reason label and note', async () => {
    const { getByTestId, getByText } = await renderWith(
      orderWith({
        status: 'rejected',
        reasonCode: 'out_of_stock',
        reasonNote: 'No large fries left',
        reasonActor: 'staff',
      }),
    );

    expect(getByTestId('order-reason-block')).toBeTruthy();
    expect(getByText('Item(s) out of stock')).toBeTruthy();
    expect(getByText('No large fries left')).toBeTruthy();
    expect(getByText('Rejected by staff')).toBeTruthy();
  });

  test('renders the label even when there is no note', async () => {
    const { getByTestId, getByText, queryByText } = await renderWith(
      orderWith({ status: 'rejected', reasonCode: 'branch_busy', reasonActor: 'staff' }),
    );

    expect(getByTestId('order-reason-block')).toBeTruthy();
    expect(getByText('Branch too busy / at capacity')).toBeTruthy();
    expect(queryByText('No large fries left')).toBeNull();
  });
});

describe('B3.9 — a customer-cancelled order shows the customer reason', () => {
  test('resolves the label from the CUSTOMER table, not the staff one', async () => {
    const { getByTestId, getByText } = await renderWith(
      orderWith({
        status: 'cancelled',
        reasonCode: 'changed_my_mind',
        reasonNote: 'Sorry!',
        reasonActor: 'customer',
      }),
    );

    expect(getByTestId('order-reason-block')).toBeTruthy();
    expect(getByText('Changed my mind')).toBeTruthy();
    expect(getByText('Sorry!')).toBeTruthy();
    expect(getByText('Cancelled by the customer')).toBeTruthy();
  });

  test('a cancel with only a free-text note still renders the note', async () => {
    const { getByTestId, getByText } = await renderWith(
      orderWith({ status: 'cancelled', reasonNote: 'Parking impossible', reasonActor: 'customer' }),
    );

    expect(getByTestId('order-reason-block')).toBeTruthy();
    expect(getByText('Parking impossible')).toBeTruthy();
  });
});

describe('the reason block stays hidden when there is nothing to show', () => {
  test('a rejected order with no reason at all renders no block (pre-migration row)', async () => {
    const { queryByTestId } = await renderWith(orderWith({ status: 'rejected' }));

    expect(queryByTestId('order-reason-block')).toBeNull();
  });

  // Non-terminal statuses can never carry a reason; the block must not appear even
  // if a stale/garbage reason somehow rode along on the row.
  const nonTerminal: OrderStatus[] = ['pending', 'accepted', 'preparing', 'flavoring', 'ready'];

  test.each(nonTerminal)('no block for a %s order even with a reason present', async (status) => {
    const { queryByTestId } = await renderWith(
      orderWith({ status, reasonCode: 'out_of_stock', reasonActor: 'staff' }),
    );

    expect(queryByTestId('order-reason-block')).toBeNull();
  });
});
