import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { StaffOrderSummary } from '@jojopotato/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useCompletedOrders } from '@/features/staff/hooks/use-completed-orders';
import { fetchCompletedStaffOrders } from '@/features/staff/lib/staff-api';

/**
 * AC-2 — the staff Completed Orders hook re-fetches on the shared 10s poll while
 * mounted, so an order a customer self-completes shows up in the list without the
 * staff member leaving and re-entering the screen.
 *
 * Drives react-query's `refetchInterval` under fake timers: render, flush the
 * initial fetch, then advance one poll interval and assert the mocked fetch
 * fired a SECOND time. (On-device visual confirmation is AC-8 / Agent-Probe.)
 *
 * Teardown is deliberate: a `refetchInterval` query owns a live `setInterval`.
 * Each test UNMOUNTS its hook (so react-query cancels that interval) and the
 * shared `queryClient` is cleared, THEN fake timers are cleared and restored —
 * without this the interval leaks into the jest worker pool and poisons sibling
 * suites (observed as flaky failures/hangs in unrelated refresh tests).
 */

jest.mock('@/features/staff/lib/staff-api', () => ({
  fetchCompletedStaffOrders: jest.fn(),
}));

const mockFetch = jest.mocked(fetchCompletedStaffOrders);

function completed(): StaffOrderSummary[] {
  return [
    {
      id: 'o1',
      orderNumber: 'JP-260722-0001',
      status: 'completed',
      placedAt: '2026-07-22T10:00:00.000Z',
      totalCents: 12000,
      itemSummary: '1× Loaded Fries',
    },
  ];
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

describe('useCompletedOrders — polling (AC-2)', () => {
  test('re-fetches after a 10s poll while mounted', async () => {
    mockFetch.mockResolvedValue(completed());

    // renderHook + the initial-fetch flush share ONE act scope: react-query's
    // async render (expo-font Suspense) leaves a pending act that would overlap a
    // separate one. Flushing timer 0 settles the notifyManager batch + microtask.
    await act(async () => {
      renderHook(() => useCompletedOrders(), { wrapper: makeWrapper() });
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Interval cleanup is handled by afterEach (queryClient.clear/unmount +
    // clearAllTimers) plus RNTL's auto-unmount — no per-test unmount needed.
  });
});
