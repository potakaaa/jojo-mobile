import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { StaffBranchSettings, StaffMe, StaffOrderSummary } from '@jojopotato/types';
import { act, fireEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import ActiveOrdersScreen from '@/app/(staff)/active-orders';
import StaffDashboard from '@/app/(staff)/index';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useStaffBranchSettings } from '@/features/staff/hooks/use-staff-branch-settings';
import { useStaffMe } from '@/features/staff/hooks/use-staff-me';
import { useStaffOrders } from '@/features/staff/hooks/use-staff-orders';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC-6 — a newly-arrived order (an id not in the prior poll) raises a toast
 * naming it, on both `useStaffOrders` mount points (Active Orders + dashboard).
 * AC-7 — a status-only change of an existing order does NOT toast again, and the
 * first poll (baseline) never toasts. The toast tap-dismisses.
 *
 * Successive polls are simulated by re-rendering with a fresh mocked
 * `useStaffOrders` dataset. Hook mocking keeps this deterministic. The physical
 * on-device toast appearance/tap is AC-8 (Agent-Probe).
 */

jest.mock('@/features/staff/hooks/use-staff-orders', () => ({ useStaffOrders: jest.fn() }));
jest.mock('@/features/staff/hooks/use-staff-me', () => ({ useStaffMe: jest.fn() }));
jest.mock('@/features/staff/hooks/use-staff-branch-settings', () => ({
  useStaffBranchSettings: jest.fn(),
}));
jest.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: jest.fn() }));

const mockUseStaffOrders = jest.mocked(useStaffOrders);
const mockUseStaffMe = jest.mocked(useStaffMe);
const mockUseStaffBranchSettings = jest.mocked(useStaffBranchSettings);
const mockUseAuth = jest.mocked(useAuth);

const STAFF_ME: StaffMe = {
  role: 'staff',
  assignedBranch: { id: 'b1', name: 'Downtown', slug: 'dt' },
};
const BRANCH_SETTINGS: StaffBranchSettings = { isAcceptingPickup: true, estimatedPrepMinutes: 15 };

function summary(id: string, status: StaffOrderSummary['status'] = 'pending'): StaffOrderSummary {
  return {
    id,
    orderNumber: `JP-260722-${id.padStart(4, '0')}`,
    status,
    placedAt: '2026-07-22T10:00:00.000Z',
    totalCents: 12000,
    itemSummary: '1× Loaded Fries',
  };
}

/** Set the next `useStaffOrders` poll result (a fresh array ref = a new poll). */
function setOrders(data: StaffOrderSummary[] | undefined) {
  mockUseStaffOrders.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    isRefetching: false,
    refetch: jest.fn(() => Promise.resolve()),
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseStaffMe.mockReturnValue({
    data: STAFF_ME,
    isLoading: false,
    error: null,
    refetch: jest.fn(() => Promise.resolve()),
  } as never);
  mockUseStaffBranchSettings.mockReturnValue({
    data: BRANCH_SETTINGS,
    isLoading: false,
    isError: false,
    error: null,
    isRefetching: false,
    refetch: jest.fn(() => Promise.resolve()),
  } as never);
  mockUseAuth.mockReturnValue({ signOut: jest.fn() } as never);
});

async function rerender(screen: { rerender: (ui: ReactElement) => void }, ui: ReactElement) {
  await act(async () => {
    screen.rerender(ui);
  });
}

describe('Active Orders — new-order toast (AC-6/AC-7)', () => {
  test('first poll seeds the baseline without toasting; a later new order toasts', async () => {
    setOrders([summary('1')]);
    const screen = await renderWithProviders(<ActiveOrdersScreen />);

    // Baseline poll: no toast.
    expect(screen.queryByTestId('toast-card')).toBeNull();

    // A new order id arrives → toast names it.
    setOrders([summary('1'), summary('2')]);
    await rerender(screen, <ActiveOrdersScreen />);

    expect(screen.getByTestId('toast-card')).toBeTruthy();
    expect(screen.getByText('New order — JP-260722-0002')).toBeTruthy();
  });

  test('a status-only change of an existing order does not toast (AC-7)', async () => {
    setOrders([summary('1', 'pending')]);
    const screen = await renderWithProviders(<ActiveOrdersScreen />);

    setOrders([summary('1', 'preparing')]);
    await rerender(screen, <ActiveOrdersScreen />);

    expect(screen.queryByTestId('toast-card')).toBeNull();
  });

  test('several orders in one poll produce one "N new orders" toast', async () => {
    setOrders([summary('1')]);
    const screen = await renderWithProviders(<ActiveOrdersScreen />);

    setOrders([summary('1'), summary('2'), summary('3')]);
    await rerender(screen, <ActiveOrdersScreen />);

    expect(screen.getByText('2 new orders')).toBeTruthy();
  });

  test('tapping the toast dismisses it', async () => {
    setOrders([summary('1')]);
    const screen = await renderWithProviders(<ActiveOrdersScreen />);
    setOrders([summary('1'), summary('2')]);
    await rerender(screen, <ActiveOrdersScreen />);

    expect(screen.getByTestId('toast-card')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('toast-card'));
    });

    expect(screen.queryByTestId('toast-card')).toBeNull();
  });
});

describe('Staff Dashboard — new-order toast (AC-6)', () => {
  test('a new order toasts on the dashboard mount point too', async () => {
    setOrders([summary('1')]);
    const screen = await renderWithProviders(<StaffDashboard />);

    expect(screen.queryByTestId('toast-card')).toBeNull();

    setOrders([summary('1'), summary('2')]);
    await rerender(screen, <StaffDashboard />);

    expect(screen.getByTestId('toast-card')).toBeTruthy();
    expect(screen.getByText('New order — JP-260722-0002')).toBeTruthy();
  });
});
