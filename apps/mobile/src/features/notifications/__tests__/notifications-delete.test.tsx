import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import NotificationsScreen from '@/app/(tabs)/notifications/index';
import { useNotifications } from '@/features/notifications/hooks/use-notifications';
import { renderWithProviders } from '@/test-utils/render';

/*
 * This file is the heaviest full-screen mount in the mobile jest suite: it renders
 * the whole NotificationsScreen (FlatList + gesture-handler + the reanimated-backed
 * SwipeableRow + Ionicons + the ConfirmDialog Modal) through the async expo-font
 * Suspense render helper. In isolation that render is fast (~250–450ms) and the
 * screen mounts cleanly.
 *
 * The one observed failure mode (caught by an EVL re-run) is a rare `renderWithProviders`
 * breach of jest's 5s default: the cold first-render occasionally queued behind other
 * suites on a contended shared jest worker. This is NOT a hang or an unresolved promise
 * — the render resolves in every isolated and full-suite run at sub-500ms — it is
 * genuine cold-render cost. `jest.setTimeout(15_000)` gives that cold render honest
 * headroom under contention; the runtime stays sub-500ms, the 15s is only a ceiling.
 *
 * Note on the residual "update to VirtualizedList not wrapped in act(...)" console
 * warning: VirtualizedList schedules cell-render updates on ~50ms timers that fire
 * mid-`findByText`-poll; jest-expo does not fail on console.error (these tests pass
 * with the warning present), so it is cosmetic, not the failure cause. The `afterEach`
 * below flushes whatever batchinator timer is still pending at the test boundary inside
 * `act()`, which trims leaked-timer backlog handed to later suites on the shared worker
 * (worker hygiene); it does not claim to silence every mid-test warning.
 */
jest.setTimeout(15_000);

/**
 * AC5 / AC7 (automated legs) — the full-swipe-to-delete confirm flow.
 *
 * AC5: triggering the row's full-swipe action opens the ConfirmDialog and fires
 *      NO delete on its own.
 * AC7: cancelling the dialog fires no delete and closes the dialog.
 *
 * The apps/mobile gesture-handler mock is a no-op passthrough (it never runs a
 * real gesture), so these tests drive the deterministic gesture-free path: the
 * row's `accessibilityAction` (name "Delete"), which fires the exact same
 * `onFullSwipe` a real swipe release would. The gesture/scroll/visual halves
 * remain Agent-Probe (no RN gesture runner). Mocks live in
 * `test-utils/jest-setup.ts`.
 */

/** Fire the row's "Delete" accessibility action — the gesture-free onFullSwipe path. */
function fullSwipe(row: Parameters<typeof fireEvent>[0]) {
  fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'Delete' } });
}

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useIsFocused: () => true,
}));

jest.mock('@/features/notifications/hooks/use-notifications', () => ({
  useNotifications: jest.fn(),
}));

const mockUseNotifications = jest.mocked(useNotifications);

const deleteNotification = jest.fn();

function setup() {
  mockUseNotifications.mockReturnValue({
    notifications: [
      {
        id: 'notif-1',
        userId: 'user-1',
        type: 'order_ready',
        title: 'Order ready',
        body: 'Your order is ready for pickup.',
        targetScreen: 'order_tracking',
        createdAt: new Date().toISOString(),
      },
    ],
    unreadCount: 1,
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    marketingOptIn: false,
    setMarketingOptIn: jest.fn(async () => ({ ok: true })),
    deleteNotification,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    isFetchingNextPage: false,
    refetch: jest.fn(),
    isRefetching: false,
    isPending: false,
  } as unknown as ReturnType<typeof useNotifications>);
}

beforeEach(() => {
  jest.clearAllMocks();
  setup();
});

afterEach(async () => {
  // Settle any FlatList (VirtualizedList) batchinator timer still pending at the test
  // boundary inside `act()`, so a real `setTimeout`-scheduled cell-render update does
  // not leak past this suite onto the shared jest worker for later files. 60ms clears
  // the ~50ms batchinator delay. (Worker hygiene — see the header note; it does not
  // silence mid-test warnings, which are cosmetic and non-fatal here.)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
});

describe('NotificationsScreen — swipe-to-delete confirm flow', () => {
  test('AC5 — a full swipe opens the confirm dialog and does NOT delete', async () => {
    const { getByTestId, findByText, queryByText } = await renderWithProviders(
      <NotificationsScreen />,
    );

    // Dialog is not shown before any interaction.
    expect(queryByText('Delete notification?')).toBeNull();

    fullSwipe(getByTestId('swipeable-row-content'));

    // The confirm dialog appears...
    expect(await findByText('Delete notification?')).toBeTruthy();
    // ...but nothing is deleted yet (delete only fires on explicit confirm).
    expect(deleteNotification).not.toHaveBeenCalled();
  });

  test('AC7 — cancelling the dialog fires no delete and closes it', async () => {
    const { getByTestId, findByText, queryByText } = await renderWithProviders(
      <NotificationsScreen />,
    );

    fullSwipe(getByTestId('swipeable-row-content'));
    await findByText('Delete notification?');

    fireEvent.press(getByTestId('confirm-dialog-cancel'));

    // The dialog closes (state flush) and no delete ever fires.
    await waitFor(() => expect(queryByText('Delete notification?')).toBeNull());
    expect(deleteNotification).not.toHaveBeenCalled();
  });

  test('confirming the dialog deletes exactly the tapped notification', async () => {
    const { getByTestId, findByText } = await renderWithProviders(<NotificationsScreen />);

    fullSwipe(getByTestId('swipeable-row-content'));
    await findByText('Delete notification?');

    fireEvent.press(getByTestId('confirm-dialog-confirm'));

    expect(deleteNotification).toHaveBeenCalledTimes(1);
    expect(deleteNotification).toHaveBeenCalledWith('notif-1');
  });
});
