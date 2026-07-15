import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';

import CouponsScreen from '@/app/(tabs)/rewards/coupons';
import { useCoupons } from '@/features/coupons/hooks/use-coupons';
import { type ApiCouponWithLabel } from '@/lib/api-client';
import { renderWithProviders, spyOnAlert } from '@/test-utils/render';

// The coupons hook is mocked so the screen renders against fixed data. `jest.mock`
// is hoisted above these imports at runtime, so the imported binding is the mock.
jest.mock('@/features/coupons/hooks/use-coupons');

const mockCoupons = jest.mocked(useCoupons);

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

  test('the wallet is display-only: tapping an available coupon opens no confirm dialog', async () => {
    // Coupons are consumed atomically at checkout via the couponId flow — the
    // wallet no longer has a standalone "Use coupon" redeem action, so pressing a
    // coupon must NOT open a confirm Alert.
    mockCoupons.mockReturnValue(
      queryStub({ data: [coupon({ id: 'avail-1', code: 'RWD-AVAIL1', status: 'available' })] }),
    );
    const alertSpy = spyOnAlert();

    const { getByText } = await renderWithProviders(<CouponsScreen />);

    fireEvent.press(getByText('RWD-AVAIL1'));

    expect(alertSpy).not.toHaveBeenCalled();
  });
});
