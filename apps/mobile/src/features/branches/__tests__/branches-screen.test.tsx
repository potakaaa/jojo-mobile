import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch } from '@jojopotato/types';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import BranchLocatorScreen from '@/app/(tabs)/branches/index';
import { getBranches } from '@/lib/api-client';
import { renderWithProviders } from '@/test-utils/render';

// The native render path pulls in `expo-maps` (via BranchMap) and
// `@gorhom/bottom-sheet`, neither of which imports cleanly under jest. Force the
// list-only WEB path and stub those native-only modules so the screen's
// data/sort/badge logic can be exercised in the DOM-less RN test environment.
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
});

jest.mock('@gorhom/bottom-sheet', () => ({
  __esModule: true,
  default: () => null,
  BottomSheetFlatList: () => null,
}));

jest.mock('@/features/branches/components/branch-map', () => ({
  BranchMap: () => null,
}));

// No location granted → the screen sorts by ascending `priority` (the AC6 path).
jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ coords: null, status: 'denied' }),
}));

// `getBranches` is the react-query queryFn the migrated screen now uses (AC1);
// mocking it lets the real `useQuery` integration run against fixed data.
jest.mock('@/lib/api-client', () => ({
  getBranches: jest.fn(),
}));

const mockGetBranches = jest.mocked(getBranches);

/** Opening-hours JSON that reads as OPEN every day, all day (deterministic). */
const ALWAYS_OPEN = JSON.stringify(
  Object.fromEntries(
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [
      day,
      { open: '00:00', close: '00:00' },
    ]),
  ),
);
/** Empty hours → every day missing → reads as CLOSED (deterministic). */
const NEVER_OPEN = '{}';

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

describe('BranchLocatorScreen', () => {
  test('renders both open and closed branches with the correct status badge', async () => {
    mockGetBranches.mockResolvedValue([
      branch({ id: 'open', name: 'Open Cafe', openingHours: ALWAYS_OPEN, isAcceptingPickup: true }),
      branch({
        id: 'closed',
        name: 'Closed Cafe',
        openingHours: NEVER_OPEN,
        isAcceptingPickup: false,
        priority: 1,
      }),
    ]);

    const { findByText, getByText } = await renderWithProviders(<BranchLocatorScreen />);

    // Both branches render — the closed one is NOT dropped (the closed-branch
    // regression guard: the migration must keep showing closed branches).
    expect(await findByText('Open Cafe')).toBeTruthy();
    expect(getByText('Closed Cafe')).toBeTruthy();

    // Per-item open/closed badge computed from openingHours (getIsOpenNow).
    expect(getByText('Open')).toBeTruthy();
    expect(getByText('Closed')).toBeTruthy();
  });

  test('preserves ascending-priority sort order when no location is granted (AC6)', async () => {
    // Fixtures deliberately out of priority order; expected render order is P0,P1,P2.
    mockGetBranches.mockResolvedValue([
      branch({ id: 'a', name: 'Branch P2', priority: 2 }),
      branch({ id: 'b', name: 'Branch P0', priority: 0 }),
      branch({ id: 'c', name: 'Branch P1', priority: 1 }),
    ]);

    const { findAllByText } = await renderWithProviders(<BranchLocatorScreen />);

    const names = await findAllByText(/^Branch P/);
    expect(names.map((node) => node.props.children)).toEqual([
      'Branch P0',
      'Branch P1',
      'Branch P2',
    ]);
  });

  test('shows a loading indicator while the branches query is pending', async () => {
    // A never-resolving promise keeps react-query in the pending state.
    mockGetBranches.mockReturnValue(new Promise<PickupBranch[]>(() => {}));

    const { getByTestId } = await renderWithProviders(<BranchLocatorScreen />);

    expect(getByTestId('branches-loading')).toBeTruthy();
  });

  test('shows an error + retry state, and retry re-runs the branches query', async () => {
    mockGetBranches.mockRejectedValue(new Error('boom'));

    const { findByText, getByRole } = await renderWithProviders(<BranchLocatorScreen />);

    expect(await findByText('Could not load branches — please try again')).toBeTruthy();
    expect(mockGetBranches).toHaveBeenCalledTimes(1);

    fireEvent.press(getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mockGetBranches).toHaveBeenCalledTimes(2));
  });
});
