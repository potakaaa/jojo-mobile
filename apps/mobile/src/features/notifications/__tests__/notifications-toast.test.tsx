import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Spacing } from '@jojopotato/ui';
import { fireEvent } from '@testing-library/react-native';

import NotificationsScreen from '@/app/(tabs)/account/notifications';
import { useNotifications } from '@/features/notifications/hooks/use-notifications';
import { renderWithProviders, toastOverlayBottom } from '@/test-utils/render';

/** AC4 / AC7 — the marketing-preference failure notice. */

jest.mock('@/features/notifications/hooks/use-notifications', () => ({
  useNotifications: jest.fn(),
}));

const mockUseNotifications = jest.mocked(useNotifications);

function setup(setMarketingOptIn: jest.Mock) {
  mockUseNotifications.mockReturnValue({
    notifications: [],
    markRead: jest.fn(),
    marketingOptIn: false,
    setMarketingOptIn,
  } as unknown as ReturnType<typeof useNotifications>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NotificationsScreen — preference-update failure (AC4)', () => {
  test('a failed toggle fires an error toast carrying the server message', async () => {
    const setMarketingOptIn = jest.fn(async () => ({ ok: false, error: 'Network unavailable.' }));
    setup(setMarketingOptIn as unknown as jest.Mock);

    const { getByRole, findByText } = await renderWithProviders(<NotificationsScreen />);
    await fireEvent(getByRole('switch'), 'valueChange', true);

    // The underlying call still happens — only the notice changed.
    expect(setMarketingOptIn).toHaveBeenCalledWith(true);
    expect(await findByText('Network unavailable.')).toBeTruthy();
  });

  test('a failure with no server message falls back to the generic copy', async () => {
    const setMarketingOptIn = jest.fn(async () => ({ ok: false }));
    setup(setMarketingOptIn as unknown as jest.Mock);

    const { getByRole, findByText } = await renderWithProviders(<NotificationsScreen />);
    await fireEvent(getByRole('switch'), 'valueChange', true);

    expect(await findByText('Please try again.')).toBeTruthy();
  });

  test('a successful toggle fires no toast at all', async () => {
    const setMarketingOptIn = jest.fn(async () => ({ ok: true }));
    setup(setMarketingOptIn as unknown as jest.Mock);

    const { getByRole, queryByTestId } = await renderWithProviders(<NotificationsScreen />);
    await fireEvent(getByRole('switch'), 'valueChange', true);

    expect(queryByTestId('toast-card')).toBeNull();
  });
});

describe('NotificationsScreen — toast clearance (AC7 automated leg)', () => {
  test('the toast clears the bottom safe area on this footer-less screen', async () => {
    const setMarketingOptIn = jest.fn(async () => ({ ok: false, error: 'Network unavailable.' }));
    setup(setMarketingOptIn as unknown as jest.Mock);

    const { getByRole, findByText, getByTestId } = await renderWithProviders(
      <NotificationsScreen />,
    );
    await fireEvent(getByRole('switch'), 'valueChange', true);
    await findByText('Network unavailable.');

    // TEST_SAFE_AREA_METRICS pins insets.bottom to 0, so this resolves to Spacing.four.
    expect(toastOverlayBottom(getByTestId('toast-card'))).toBe(0 + Spacing.four);
  });
});
