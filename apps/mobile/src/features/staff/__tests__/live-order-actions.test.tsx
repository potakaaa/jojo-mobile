import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { StaffOrderDetail } from '@jojopotato/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import OrderDetailScreen from '@/app/(staff)/order-detail/[orderId]';
import { useStaffOrderDetail } from '@/features/staff/hooks/use-staff-order-detail';
import { useUpdateOrderStatus } from '@/features/staff/hooks/use-update-order-status';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC5 — the staff destructive confirm uses the shared themed `ConfirmDialog`,
 * with two-choice semantics IDENTICAL to the raw system alert it replaced:
 * cancel does nothing, confirm runs the same unchanged `handleTransition`.
 */

jest.mock('@/features/staff/hooks/use-staff-order-detail', () => ({
  useStaffOrderDetail: jest.fn(),
}));
jest.mock('@/features/staff/hooks/use-update-order-status', () => ({
  useUpdateOrderStatus: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ orderId: 'o1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

const mockUseStaffOrderDetail = jest.mocked(useStaffOrderDetail);
const mockUseUpdateOrderStatus = jest.mocked(useUpdateOrderStatus);

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
  return { mutate };
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

  test('confirming Reject runs the unchanged handleTransition exactly once', async () => {
    const { mutate } = setup('pending');

    const { getByRole, getByTestId, findByText, queryByText } = await renderWithProviders(
      <OrderDetailScreen />,
    );
    await fireEvent.press(getByRole('button', { name: 'Reject' }));
    await findByText('Reject order?');

    // The dialog's confirm button carries the SAME label as the screen button
    // behind it ("Reject"), so target it by testID rather than by role+name.
    await fireEvent.press(getByTestId('confirm-dialog-confirm'));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ orderId: 'o1', status: 'rejected' });
    await waitFor(() => expect(queryByText('Reject order?')).toBeNull());
  });

  test('cancelling Reject never transitions and closes the dialog', async () => {
    const { mutate } = setup('pending');

    const { getByRole, findByText, queryByText } = await renderWithProviders(<OrderDetailScreen />);
    await fireEvent.press(getByRole('button', { name: 'Reject' }));
    await findByText('Reject order?');
    await fireEvent.press(getByRole('button', { name: 'Cancel' }));

    expect(mutate).not.toHaveBeenCalled();
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
