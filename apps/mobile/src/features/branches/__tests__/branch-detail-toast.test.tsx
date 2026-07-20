import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Spacing } from '@jojopotato/ui';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import BranchDetailsScreen from '@/app/(tabs)/branch/[branchId]';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { apiFetch } from '@/lib/api-fetch';
import { renderWithProviders, toastOverlayBottom } from '@/test-utils/render';

/** AC4 / AC7 — the "could not open maps" async-catch failure notice. */

jest.mock('@/lib/api-fetch', () => ({ apiFetch: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ coords: null, status: 'denied' }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ branchId: 'b1' }),
  router: { back: jest.fn(), push: jest.fn() },
  // NAV-005 added useHideTabBarWhile(useIsFocused()) to this screen; stubbed
  // true for the same reason as the global mock in jest-setup.ts (no real
  // navigation container in jsdom).
  useIsFocused: () => true,
}));

const mockApiFetch = jest.mocked(apiFetch);
const mockUseBranch = jest.mocked(useBranch);

const branchResponse = {
  branch: {
    id: 'b1',
    name: 'Downtown',
    slug: 'downtown',
    address: '1 Test St',
    latitude: '14.5',
    longitude: '121.0',
    phone: '000',
    opening_hours: '{}',
    is_active: true,
    is_accepting_pickup: true,
    estimated_prep_minutes: 15,
    priority: 0,
  },
  deals: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue(branchResponse as never);
  mockUseBranch.mockReturnValue({
    setSelectedBranch: jest.fn(),
  } as unknown as ReturnType<typeof useBranch>);
});

describe('BranchDetailsScreen — directions failure (AC4)', () => {
  test('a rejected openURL fires an error toast rather than an unhandled rejection', async () => {
    // The real `.catch(...)` path: no maps handler for the scheme.
    const openURL = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValue(new Error('no handler') as never);

    const { findByText } = await renderWithProviders(<BranchDetailsScreen />);
    await fireEvent.press(await findByText('Get Directions'));

    expect(openURL).toHaveBeenCalledTimes(1);
    expect(await findByText('No maps app is available to show directions.')).toBeTruthy();
  });

  test('a successful openURL fires no toast', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);

    const { findByText, queryByTestId } = await renderWithProviders(<BranchDetailsScreen />);
    await fireEvent.press(await findByText('Get Directions'));

    await waitFor(() => expect(queryByTestId('toast-card')).toBeNull());
  });
});

describe('BranchDetailsScreen — toast clearance (AC7 automated leg)', () => {
  test('the toast clears the bottom safe area on this footer-less screen', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler') as never);

    const { findByText, getByTestId } = await renderWithProviders(<BranchDetailsScreen />);
    await fireEvent.press(await findByText('Get Directions'));
    await findByText('No maps app is available to show directions.');

    // TEST_SAFE_AREA_METRICS pins insets.bottom to 0, so this resolves to Spacing.four.
    expect(toastOverlayBottom(getByTestId('toast-card'))).toBe(0 + Spacing.four);
  });
});
