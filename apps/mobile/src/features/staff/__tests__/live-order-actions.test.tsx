import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { StaffOrderDetail } from '@jojopotato/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import OrderDetailScreen from '@/app/(staff)/order-detail/[orderId]';
import { useRejectOrder } from '@/features/staff/hooks/use-reject-order';
import { useStaffOrderDetail } from '@/features/staff/hooks/use-staff-order-detail';
import { useUpdateOrderStatus } from '@/features/staff/hooks/use-update-order-status';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC5 — the staff destructive confirms are themed dialogs, not raw system alerts:
 * cancelling does nothing, confirming runs the action.
 *
 * B2 UPDATE: the REJECT path no longer routes through the two-choice
 * `ConfirmDialog` + `useUpdateOrderStatus`. A reject without a reason is now an
 * invalid request (the server 422s it), so Reject opens the reason picker and
 * submits through `useRejectOrder`. The `ready`-order Cancel path below is
 * UNCHANGED and still uses `ConfirmDialog` + `useUpdateOrderStatus` — the two are
 * asserted separately so a regression in either is attributable.
 */

jest.mock('@/features/staff/hooks/use-staff-order-detail', () => ({
  useStaffOrderDetail: jest.fn(),
}));
jest.mock('@/features/staff/hooks/use-update-order-status', () => ({
  useUpdateOrderStatus: jest.fn(),
}));
jest.mock('@/features/staff/hooks/use-reject-order', () => ({
  useRejectOrder: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ orderId: 'o1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

const mockUseStaffOrderDetail = jest.mocked(useStaffOrderDetail);
const mockUseUpdateOrderStatus = jest.mocked(useUpdateOrderStatus);
const mockUseRejectOrder = jest.mocked(useRejectOrder);

function order(status: string): StaffOrderDetail {
  return {
    id: 'o1',
    orderNumber: 'JP-260717-0001',
    status,
    items: [],
    subtotalCents: 12000,
    totalCents: 12000,
    placedAt: '2026-07-17T10:00:00.000Z',
  } as unknown as StaffOrderDetail;
}

function setup(status: string) {
  const mutate = jest.fn();
  const rejectMutate = jest.fn();
  mockUseStaffOrderDetail.mockReturnValue({
    data: order(status),
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useStaffOrderDetail>);
  mockUseUpdateOrderStatus.mockReturnValue({
    mutate,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useUpdateOrderStatus>);
  mockUseRejectOrder.mockReturnValue({
    mutate: rejectMutate,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useRejectOrder>);
  return { mutate, rejectMutate };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LiveOrderActions — reject path (AC5)', () => {
  test('Reject opens the themed ConfirmDialog and does NOT transition yet', async () => {
    const { mutate } = setup('pending');

    const { getByRole, findByText } = await renderWithProviders(<OrderDetailScreen />);
    await fireEvent.press(getByRole('button', { name: 'Reject' }));

    expect(await findByText('Reject order?')).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
  });

  test('submitting a reason rejects through useRejectOrder, NOT the generic status PATCH', async () => {
    const { mutate, rejectMutate } = setup('pending');

    const { getByRole, getByTestId, findByText, queryByText } = await renderWithProviders(
      <OrderDetailScreen />,
    );
    await fireEvent.press(getByRole('button', { name: 'Reject' }));
    await findByText('Reject order?');

    // B2: a reason must be picked before the dialog will submit.
    await fireEvent.press(getByTestId('reject-reason-out_of_stock'));
    await fireEvent.press(getByTestId('reject-submit'));

    expect(rejectMutate).toHaveBeenCalledTimes(1);
    expect(rejectMutate).toHaveBeenCalledWith({
      orderId: 'o1',
      reasonCode: 'out_of_stock',
      note: undefined,
    });
    // The generic status PATCH must NOT also fire — a reject that went through it
    // would land with no reason at all, which is the bug B2 exists to close.
    expect(mutate).not.toHaveBeenCalled();
    await waitFor(() => expect(queryByText('Reject order?')).toBeNull());
  });

  test('submitting without picking a reason rejects nothing (B2.1 client gate)', async () => {
    const { mutate, rejectMutate } = setup('pending');

    const { getByRole, getByTestId, findByText } = await renderWithProviders(<OrderDetailScreen />);
    await fireEvent.press(getByRole('button', { name: 'Reject' }));
    await findByText('Reject order?');
    await fireEvent.press(getByTestId('reject-submit'));

    expect(rejectMutate).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  test('cancelling Reject never transitions and closes the dialog', async () => {
    const { mutate, rejectMutate } = setup('pending');

    const { getByRole, getByTestId, findByText, queryByText } = await renderWithProviders(
      <OrderDetailScreen />,
    );
    await fireEvent.press(getByRole('button', { name: 'Reject' }));
    await findByText('Reject order?');
    // The dismiss button is "Keep order", not "Cancel": a bare "Cancel" would be
    // ambiguous against the ready-order Cancel ACTION button on the same screen.
    await fireEvent.press(getByTestId('reject-cancel'));

    expect(mutate).not.toHaveBeenCalled();
    expect(rejectMutate).not.toHaveBeenCalled();
    await waitFor(() => expect(queryByText('Reject order?')).toBeNull());
  });
});

describe('LiveOrderActions — accept path is NOT gated by a confirm (AC5)', () => {
  test('Accept transitions immediately, with no confirm dialog', async () => {
    const { mutate } = setup('pending');

    const { getByRole, queryByText } = await renderWithProviders(<OrderDetailScreen />);
    await fireEvent.press(getByRole('button', { name: 'Accept' }));

    expect(mutate).toHaveBeenCalledWith({ orderId: 'o1', status: 'accepted' });
    expect(queryByText('Accept order?')).toBeNull();
  });
});

describe('LiveOrderActions — cancel path on a ready order (AC5)', () => {
  test('Cancel opens a confirm rather than cancelling the order outright', async () => {
    const { mutate } = setup('ready');

    const { getByRole, findByText } = await renderWithProviders(<OrderDetailScreen />);
    await fireEvent.press(getByRole('button', { name: 'Cancel' }));

    expect(await findByText('Cancel order?')).toBeTruthy();
    // The destructive action must not fire until confirmed.
    expect(mutate).not.toHaveBeenCalled();
  });

  test('the ready-order confirm still routes to the unchanged cancelled transition', async () => {
    const { mutate } = setup('ready');

    const { getByRole, getByTestId, findByText } = await renderWithProviders(<OrderDetailScreen />);
    await fireEvent.press(getByRole('button', { name: 'Cancel' }));
    await findByText('Cancel order?');

    // "Cancel" is triply ambiguous here — the screen trigger, the dialog's
    // dismiss, AND the dialog's confirm all carry that label. Target the confirm
    // by testID instead of relying on render order.
    await fireEvent.press(getByTestId('confirm-dialog-confirm'));

    expect(mutate).toHaveBeenCalledWith({ orderId: 'o1', status: 'cancelled' });
  });
});
