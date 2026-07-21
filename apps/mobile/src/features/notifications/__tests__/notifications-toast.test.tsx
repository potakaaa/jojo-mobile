import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Spacing } from '@jojopotato/ui';
import { fireEvent } from '@testing-library/react-native';

import NotificationsScreen from '@/app/(tabs)/notifications/index';
import { useNotifications } from '@/features/notifications/hooks/use-notifications';
import { renderWithProviders, toastOverlayBottom } from '@/test-utils/render';

/** AC4 / AC7 — the marketing-preference failure notice. */

// NAV-002 moved this screen to the top-level `(tabs)/notifications` stack and it
// now calls `useIsFocused()` to gate `useHideTabBarWhile` — real expo-router's
// `useIsFocused` needs a navigation context this bare RTL render doesn't provide,
// so it must be mocked like the rest of expo-router already is elsewhere in this
// suite (see branch-detail-toast.test.tsx). `true` matches this screen's real
// focused state in every test here (no navigation-away scenario is exercised).
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useIsFocused: () => true,
}));

jest.mock('@/features/notifications/hooks/use-notifications', () => ({
  useNotifications: jest.fn(),
}));

const mockUseNotifications = jest.mocked(useNotifications);

function setup(setMarketingOptIn: jest.Mock) {
  mockUseNotifications.mockReturnValue({
    notifications: [],
    unreadCount: 0,
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    marketingOptIn: false,
    setMarketingOptIn,
    // notif-delete-pagination — the screen now destructures these 5 fields; the
    // mock must provide behavior-preserving stubs (this suite only exercises the
    // marketing-toggle path, not delete/pagination).
    deleteNotification: jest.fn(),
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    isFetchingNextPage: false,
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
