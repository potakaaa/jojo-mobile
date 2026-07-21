import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch } from '@jojopotato/types';
import { act, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import BranchLocatorScreen from '@/app/(tabs)/branches/index';
import { getBranches } from '@/lib/api-client';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC1 — Branches pull-to-refresh (WEB `FlatList` variant).
 *
 * The native `BottomSheetFlatList` Android gesture is Agent-Probe (AC12) — jest
 * cannot render gorhom's native `ScrollableContainer.android.tsx`. This test
 * forces the list-only WEB path (the automatable half) and asserts the OBSERVABLE
 * outcome: a pull calls `refetch` (real `useQuery` → the mocked `getBranches`
 * fires a SECOND time), and a failed refresh retains the previously-loaded list.
 */
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
});

jest.mock('@gorhom/bottom-sheet', () => ({
  __esModule: true,
  default: () => null,
  BottomSheetFlatList: () => null,
}));
jest.mock('@/features/branches/components/branch-map', () => ({ BranchMap: () => null }));
jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ coords: null, status: 'denied' }),
}));
jest.mock('@/lib/api-client', () => ({ getBranches: jest.fn() }));

const mockGetBranches = jest.mocked(getBranches);

const ALWAYS_OPEN = JSON.stringify(
  Object.fromEntries(
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [
      day,
      { open: '00:00', close: '00:00' },
    ]),
  ),
);

function branch(over: Partial<PickupBranch> = {}): PickupBranch {
  return {
    id: 'b1',
    name: 'Test Branch',
    address: '123 Test St',
    latitude: 10,
    longitude: 123,
    phone: '000',
    openingHours: ALWAYS_OPEN,
    estimatedPrepMinutes: 15,
    isAcceptingPickup: true,
    priority: 0,
    isOpen: true,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BranchLocatorScreen — pull-to-refresh (AC1)', () => {
  test('a pull triggers a refetch (getBranches fires a second time)', async () => {
    mockGetBranches.mockResolvedValue([branch({ name: 'Open Cafe' })]);

    const screen = await renderWithProviders(<BranchLocatorScreen />);
    expect(await screen.findByText('Open Cafe')).toBeTruthy();
    expect(mockGetBranches).toHaveBeenCalledTimes(1);

    // Pull-to-refresh: invoke the RefreshControl's onRefresh (AC5 stale-time
    // bypass — refetch fires even though the just-loaded data is still fresh).
    const refreshControl = screen.getByTestId('branches-list').props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mockGetBranches).toHaveBeenCalledTimes(2));
  });

  test('a failed refresh preserves the previously-loaded branch list', async () => {
    mockGetBranches.mockResolvedValueOnce([branch({ name: 'Open Cafe' })]);
    mockGetBranches.mockRejectedValueOnce(new Error('network down'));

    const screen = await renderWithProviders(<BranchLocatorScreen />);
    expect(await screen.findByText('Open Cafe')).toBeTruthy();

    const refreshControl = screen.getByTestId('branches-list').props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mockGetBranches).toHaveBeenCalledTimes(2));
    // The prior list is retained on a failed background refetch — not blanked.
    await waitFor(() => expect(screen.getByText('Open Cafe')).toBeTruthy());
  });
});
