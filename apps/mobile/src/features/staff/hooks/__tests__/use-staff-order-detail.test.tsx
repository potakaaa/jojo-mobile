import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { StaffOrderDetail } from '@jojopotato/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useStaffOrderDetail } from '@/features/staff/hooks/use-staff-order-detail';
import { fetchStaffOrderDetail } from '@/features/staff/lib/staff-api';

/**
 * AC-1 — the staff Order Detail hook re-fetches on the shared 10s poll while
 * mounted, so a customer self-completing their own order is reflected on the
 * screen without a manual refresh.
 *
 * Drives react-query's `refetchInterval` under fake timers: render, flush the
 * initial fetch, then advance one poll interval and assert the mocked fetch
 * fired a SECOND time. (The on-device visual status flip is AC-8 / Agent-Probe.)
 *
 * Teardown is deliberate: a `refetchInterval` query owns a live `setInterval`.
 * Each test UNMOUNTS its hook (so react-query cancels that interval) and the
 * shared `queryClient` is cleared, THEN fake timers are cleared and restored —
 * without this the interval leaks into the jest worker pool and poisons sibling
 * suites (observed as flaky failures/hangs in unrelated refresh tests).
 */

jest.mock('@/features/staff/lib/staff-api', () => ({
  fetchStaffOrderDetail: jest.fn(),
}));

const mockFetch = jest.mocked(fetchStaffOrderDetail);

function orderDetail(status: StaffOrderDetail['status']): StaffOrderDetail {
  return {
    id: 'o1',
    orderNumber: 'JP-260722-0001',
    status,
    placedAt: '2026-07-22T10:00:00.000Z',
    estimatedReadyAt: null,
    totalCents: 12000,
    items: [],
  };
}

let queryClient: QueryClient;

function makeWrapper() {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryWrapper';
  return Wrapper;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  // Cancel any query-owned refetch intervals, then drain + restore timers so no
  // interval leaks into the shared worker pool.
  queryClient.clear();
  queryClient.unmount();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('useStaffOrderDetail — polling (AC-1)', () => {
  test('re-fetches after a 10s poll while mounted', async () => {
    mockFetch.mockResolvedValue(orderDetail('ready'));

    // renderHook + the initial-fetch flush share ONE act scope: react-query's
    // async render (expo-font Suspense) leaves a pending act that would overlap a
    // separate one. Flushing timer 0 settles the notifyManager batch + microtask.
    await act(async () => {
      renderHook(() => useStaffOrderDetail('o1'), { wrapper: makeWrapper() });
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance one poll interval → the hook re-fetches on its own.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Interval cleanup is handled by afterEach (queryClient.clear/unmount +
    // clearAllTimers) plus RNTL's auto-unmount — no per-test unmount needed.
  });

  test('does not fetch while disabled (no orderId)', async () => {
    mockFetch.mockResolvedValue(orderDetail('ready'));

    await act(async () => {
      renderHook(() => useStaffOrderDetail(''), { wrapper: makeWrapper() });
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
