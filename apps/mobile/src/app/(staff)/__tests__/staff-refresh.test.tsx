import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type {
  StaffBranchSettings,
  StaffMe,
  StaffOrderDetail,
  StaffOrderSummary,
  StaffProduct,
} from '@jojopotato/types';
import { act } from '@testing-library/react-native';

import ActiveOrdersScreen from '@/app/(staff)/active-orders';
import CompletedOrdersScreen from '@/app/(staff)/completed-orders';
import StaffDashboard from '@/app/(staff)/index';
import OrderDetailScreen from '@/app/(staff)/order-detail/[orderId]';
import BranchPickupSettingsScreen from '@/app/(staff)/branch-pickup-settings';
import ProductAvailabilityScreen from '@/app/(staff)/product-availability';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useCompletedOrders } from '@/features/staff/hooks/use-completed-orders';
import { usePatchBranchSettings } from '@/features/staff/hooks/use-patch-branch-settings';
import { useStaffBranchSettings } from '@/features/staff/hooks/use-staff-branch-settings';
import { useStaffMe } from '@/features/staff/hooks/use-staff-me';
import { useStaffOrderDetail } from '@/features/staff/hooks/use-staff-order-detail';
import { useStaffOrders } from '@/features/staff/hooks/use-staff-orders';
import { useStaffProducts } from '@/features/staff/hooks/use-staff-products';
import { useToggleProductAvailability } from '@/features/staff/hooks/use-toggle-product-availability';
import { useUpdateOrderStatus } from '@/features/staff/hooks/use-update-order-status';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC-3 — every staff data screen wires a working `RefreshControl` bound to its
 * query's `refetch`. AC-5 — a failed refresh (error while data is present)
 * leaves the prior rows on screen rather than blanking.
 *
 * Hooks are mocked (matching `live-order-actions.test.tsx`) so each test drives
 * the exact refetch/data/error state it asserts, deterministically and without
 * leaking react-query poll intervals. The refetch call is reached exactly as a
 * real pull would reach it: `getByTestId(<scroll>).props.refreshControl.props
 * .onRefresh()`. The physical pull gesture + platform spinner are AC-8 (Agent-Probe).
 */

jest.mock('@/features/staff/hooks/use-staff-orders', () => ({ useStaffOrders: jest.fn() }));
jest.mock('@/features/staff/hooks/use-staff-me', () => ({ useStaffMe: jest.fn() }));
jest.mock('@/features/staff/hooks/use-completed-orders', () => ({ useCompletedOrders: jest.fn() }));
jest.mock('@/features/staff/hooks/use-staff-order-detail', () => ({
  useStaffOrderDetail: jest.fn(),
}));
jest.mock('@/features/staff/hooks/use-update-order-status', () => ({
  useUpdateOrderStatus: jest.fn(),
}));
jest.mock('@/features/staff/hooks/use-staff-products', () => ({ useStaffProducts: jest.fn() }));
jest.mock('@/features/staff/hooks/use-toggle-product-availability', () => ({
  useToggleProductAvailability: jest.fn(),
}));
jest.mock('@/features/staff/hooks/use-staff-branch-settings', () => ({
  useStaffBranchSettings: jest.fn(),
}));
jest.mock('@/features/staff/hooks/use-patch-branch-settings', () => ({
  usePatchBranchSettings: jest.fn(),
}));
jest.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: jest.fn() }));

const mockUseStaffOrders = jest.mocked(useStaffOrders);
const mockUseStaffMe = jest.mocked(useStaffMe);
const mockUseCompletedOrders = jest.mocked(useCompletedOrders);
const mockUseStaffOrderDetail = jest.mocked(useStaffOrderDetail);
const mockUseUpdateOrderStatus = jest.mocked(useUpdateOrderStatus);
const mockUseStaffProducts = jest.mocked(useStaffProducts);
const mockUseToggleProductAvailability = jest.mocked(useToggleProductAvailability);
const mockUseStaffBranchSettings = jest.mocked(useStaffBranchSettings);
const mockUsePatchBranchSettings = jest.mocked(usePatchBranchSettings);
const mockUseAuth = jest.mocked(useAuth);

// ─── Fixtures ────────────────────────────────────────────────────────────────

function summary(over: Partial<StaffOrderSummary> = {}): StaffOrderSummary {
  return {
    id: 'o1',
    orderNumber: 'JP-260722-0001',
    status: 'pending',
    placedAt: '2026-07-22T10:00:00.000Z',
    totalCents: 12000,
    itemSummary: '1× Loaded Fries',
    ...over,
  };
}

function detail(): StaffOrderDetail {
  return {
    id: 'o1',
    orderNumber: 'JP-260722-0001',
    status: 'pending',
    placedAt: '2026-07-22T10:00:00.000Z',
    estimatedReadyAt: null,
    totalCents: 12000,
    items: [],
  };
}

function product(): StaffProduct {
  return {
    id: 'p1',
    name: 'Loaded Fries',
    categoryId: 'c1',
    basePrice: '120.00',
    isAvailable: true,
  };
}

const BRANCH_SETTINGS: StaffBranchSettings = { isAcceptingPickup: true, estimatedPrepMinutes: 15 };
const STAFF_ME: StaffMe = {
  role: 'staff',
  assignedBranch: { id: 'b1', name: 'Downtown', slug: 'dt' },
};

function queryReturn<T>(over: Partial<{ data: T }> & Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isRefetching: false,
    refetch: jest.fn(() => Promise.resolve()),
    ...over,
  } as never;
}

const IDLE_MUTATION = {
  mutate: jest.fn(),
  isPending: false,
  isError: false,
  error: null,
} as never;

async function pull(scroll: {
  props: { refreshControl?: { props: { onRefresh: () => unknown } } };
}) {
  const refreshControl = scroll.props.refreshControl;
  if (!refreshControl) throw new Error('screen ScrollView has no refreshControl');
  await act(async () => {
    refreshControl.props.onRefresh();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseStaffMe.mockReturnValue(
    queryReturn({ data: STAFF_ME }) as unknown as ReturnType<typeof useStaffMe>,
  );
  mockUseUpdateOrderStatus.mockReturnValue(IDLE_MUTATION);
  mockUseToggleProductAvailability.mockReturnValue(IDLE_MUTATION);
  mockUsePatchBranchSettings.mockReturnValue(IDLE_MUTATION);
  mockUseAuth.mockReturnValue({ signOut: jest.fn() } as never);
});

describe('Active Orders — pull-to-refresh (AC-3/AC-5)', () => {
  test('onRefresh triggers the orders refetch', async () => {
    const refetch = jest.fn(() => Promise.resolve());
    mockUseStaffOrders.mockReturnValue(queryReturn({ data: [summary()], refetch }));

    const screen = await renderWithProviders(<ActiveOrdersScreen />);
    await pull(screen.getByTestId('staff-active-orders-scroll'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test('a failed refresh (error with data present) keeps the prior rows', async () => {
    mockUseStaffOrders.mockReturnValue(
      queryReturn({ data: [summary({ orderNumber: 'JP-260722-0009' })], error: new Error('boom') }),
    );

    const screen = await renderWithProviders(<ActiveOrdersScreen />);

    // The order row is still rendered — the screen only shows its error state
    // when there is NO data (`error && orders.length === 0`).
    expect(screen.getByText('JP-260722-0009')).toBeTruthy();
  });
});

describe('Completed Orders — pull-to-refresh (AC-3)', () => {
  test('onRefresh triggers the completed-orders refetch', async () => {
    const refetch = jest.fn(() => Promise.resolve());
    mockUseCompletedOrders.mockReturnValue(
      queryReturn({ data: [summary({ status: 'completed' })], refetch }),
    );

    const screen = await renderWithProviders(<CompletedOrdersScreen />);
    await pull(screen.getByTestId('staff-completed-orders-scroll'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('Order Detail — pull-to-refresh (AC-3)', () => {
  test('onRefresh triggers the order-detail refetch', async () => {
    const refetch = jest.fn(() => Promise.resolve());
    mockUseStaffOrderDetail.mockReturnValue(queryReturn({ data: detail(), refetch }));

    const screen = await renderWithProviders(<OrderDetailScreen />);
    await pull(screen.getByTestId('staff-order-detail-scroll'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('Product Availability — pull-to-refresh (AC-3)', () => {
  test('onRefresh triggers the products refetch', async () => {
    const refetch = jest.fn(() => Promise.resolve());
    mockUseStaffProducts.mockReturnValue(queryReturn({ data: [product()], refetch }));

    const screen = await renderWithProviders(<ProductAvailabilityScreen />);
    await pull(screen.getByTestId('staff-product-availability-scroll'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('Branch Pickup Settings — pull-to-refresh (AC-3)', () => {
  test('onRefresh triggers the branch-settings refetch', async () => {
    const refetch = jest.fn(() => Promise.resolve());
    mockUseStaffBranchSettings.mockReturnValue(queryReturn({ data: BRANCH_SETTINGS, refetch }));

    const screen = await renderWithProviders(<BranchPickupSettingsScreen />);
    await pull(screen.getByTestId('staff-branch-settings-scroll'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('Staff Dashboard — pull-to-refresh (AC-3)', () => {
  test('onRefresh refetches all three dashboard queries', async () => {
    const refetchStaffMe = jest.fn(() => Promise.resolve());
    const refetchOrders = jest.fn(() => Promise.resolve());
    const refetchBranchSettings = jest.fn(() => Promise.resolve());
    mockUseStaffMe.mockReturnValue(
      queryReturn({ data: STAFF_ME, refetch: refetchStaffMe }) as unknown as ReturnType<
        typeof useStaffMe
      >,
    );
    mockUseStaffOrders.mockReturnValue(queryReturn({ data: [], refetch: refetchOrders }));
    mockUseStaffBranchSettings.mockReturnValue(
      queryReturn({ data: BRANCH_SETTINGS, refetch: refetchBranchSettings }),
    );

    const screen = await renderWithProviders(<StaffDashboard />);
    await pull(screen.getByTestId('staff-dashboard-scroll'));

    expect(refetchStaffMe).toHaveBeenCalledTimes(1);
    expect(refetchOrders).toHaveBeenCalledTimes(1);
    expect(refetchBranchSettings).toHaveBeenCalledTimes(1);
  });
});
