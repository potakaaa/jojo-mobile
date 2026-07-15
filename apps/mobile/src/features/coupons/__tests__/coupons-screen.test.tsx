import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';

import CouponsScreen from '@/app/(tabs)/rewards/coupons';
import { useCoupons } from '@/features/coupons/hooks/use-coupons';
import { useRedeemCoupon } from '@/features/coupons/hooks/use-redeem-coupon';
import { ApiError, type ApiCouponWithLabel } from '@/lib/api-client';
import { renderWithProviders, spyOnAlert } from '@/test-utils/render';

// Hooks are mocked so the screen renders against fixed data. `jest.mock` is
// hoisted above these imports at runtime, so the imported bindings are the mocks.
jest.mock('@/features/coupons/hooks/use-coupons');
jest.mock('@/features/coupons/hooks/use-redeem-coupon');

const mockCoupons = jest.mocked(useCoupons);
const mockRedeemHook = jest.mocked(useRedeemCoupon);
const mockMutate = jest.fn();

function coupon(over: Partial<ApiCouponWithLabel> = {}): ApiCouponWithLabel {
  return {
    id: 'c1',
    userId: 'u1',
    code: 'RWD-CODE01',
    status: 'available',
    dealId: null,
    rewardId: 'r1',
    expiresAt: null,
    usedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    displayLabel: '₱50 OFF',
    ...over,
  };
}

function queryStub(
  over: Partial<{ data: ApiCouponWithLabel[]; isPending: boolean; isError: boolean }>,
) {
  return {
    data: over.data,
    isPending: over.isPending ?? false,
    isError: over.isError ?? false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCoupons>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRedeemHook.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useRedeemCoupon>);
});

describe('CouponsScreen', () => {
  test('groups coupons by status and renders each via the display adapter', async () => {
    mockCoupons.mockReturnValue(
      queryStub({
        data: [
          coupon({ id: 'a', code: 'RWD-AVAIL1', status: 'available', displayLabel: '₱50 OFF' }),
          coupon({ id: 'u', code: 'RWD-USED01', status: 'used', displayLabel: 'Free item' }),
          coupon({ id: 'e', code: 'RWD-EXP001', status: 'expired', displayLabel: '20% OFF' }),
        ],
      }),
    );

    const { getByText, getAllByText } = await renderWithProviders(<CouponsScreen />);

    // Group headers (Available is unique; Used/Expired also appear as card badges).
    expect(getByText('Available')).toBeTruthy();
    expect(getAllByText('Used').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Expired').length).toBeGreaterThanOrEqual(1);

    // Titles come from the adapter (title = server displayLabel).
    expect(getByText('₱50 OFF')).toBeTruthy();
    expect(getByText('Free item')).toBeTruthy();
    expect(getByText('20% OFF')).toBeTruthy();

    // Adapter status → badge line for the available coupon.
    expect(getByText('Ready to use')).toBeTruthy();
    // Codes rendered.
    expect(getByText('RWD-AVAIL1')).toBeTruthy();
  });

  test('shows an empty state when the wallet has no coupons', async () => {
    mockCoupons.mockReturnValue(queryStub({ data: [] }));

    const { getByText } = await renderWithProviders(<CouponsScreen />);

    expect(getByText('No coupons yet')).toBeTruthy();
  });

  test('shows an error + retry state when the query fails, and retry refetches', async () => {
    const result = queryStub({ isError: true });
    mockCoupons.mockReturnValue(result);

    const { getByText, getByRole } = await renderWithProviders(<CouponsScreen />);

    expect(getByText("Couldn't load your coupons")).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Retry' }));
    expect(result.refetch).toHaveBeenCalled();
  });

  test('redeeming an available coupon opens a confirm dialog, then fires the mutation', async () => {
    mockCoupons.mockReturnValue(
      queryStub({ data: [coupon({ id: 'avail-1', code: 'RWD-AVAIL1', status: 'available' })] }),
    );
    const alertSpy = spyOnAlert();

    const { getByText } = await renderWithProviders(<CouponsScreen />);

    fireEvent.press(getByText('RWD-AVAIL1')); // press bubbles to the CouponCard Pressable
    expect(alertSpy).toHaveBeenCalledTimes(1);

    // Invoke the confirm button's onPress (mutation is a jest.fn — no state update).
    const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Use coupon')?.onPress?.();

    expect(mockMutate.mock.calls[0]![0]).toBe('avail-1');
  });

  test('shows a friendly inline message when re-redeeming an already-used coupon (409)', async () => {
    mockCoupons.mockReturnValue(
      queryStub({ data: [coupon({ id: 'avail-1', code: 'RWD-AVAIL1', status: 'available' })] }),
    );
    // Simulate the mutation rejecting with a 409 by invoking the passed onError.
    mockMutate.mockImplementation((_id: unknown, opts: unknown) => {
      (opts as { onError?: (e: Error) => void })?.onError?.(new ApiError(409, 'gone'));
    });
    const alertSpy = spyOnAlert();

    const { getByText } = await renderWithProviders(<CouponsScreen />);

    // Press + confirm in one act scope; the mocked onError sets the inline 409 message.
    await act(async () => {
      fireEvent.press(getByText('RWD-AVAIL1'));
      const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
      buttons.find((b) => b.text === 'Use coupon')?.onPress?.();
    });

    expect(getByText(/no longer available/i)).toBeTruthy();
  });
});
