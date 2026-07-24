import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { StaffOrderDetail } from '@jojopotato/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useRejectOrder } from '@/features/staff/hooks/use-reject-order';
import { patchStaffOrderReject } from '@/features/staff/lib/staff-api';

/**
 * Step-14 coverage: `useRejectOrder` must invalidate the SAME three query keys
 * `useUpdateOrderStatus` does.
 *
 * This is load-bearing, not cosmetic: `useStaffOrderDetail` has no polling and no
 * focus refetch, and the global client pins `staleTime: 30_000` — so without these
 * invalidations a successful reject leaves the screen showing the stale `pending`
 * state (and no reason) for up to 30 seconds.
 *
 * Non-vacuity: deleting any one `invalidateQueries` call in the hook turns the
 * matching assertion below red (verified during EXECUTE).
 */

jest.mock('@/features/staff/lib/staff-api', () => ({
  patchStaffOrderReject: jest.fn(),
}));

const mockPatch = jest.mocked(patchStaffOrderReject);

function wrapperWithSpy() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, invalidateSpy };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useRejectOrder', () => {
  test('sends the reason to the API and invalidates all three staff query surfaces', async () => {
    mockPatch.mockResolvedValue({ id: 'o-1' } as unknown as StaffOrderDetail);
    const { Wrapper, invalidateSpy } = wrapperWithSpy();

    const { result } = await renderHook(() => useRejectOrder(), { wrapper: Wrapper });
    result.current.mutate({ orderId: 'o-1', reasonCode: 'out_of_stock', note: 'gone' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPatch).toHaveBeenCalledWith('o-1', 'out_of_stock', 'gone');

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ['staff', 'orders'],
        ['staff', 'order', 'o-1'],
        ['staff', 'completed'],
      ]),
    );
  });

  test('a failed reject invalidates nothing (no false "it worked" refresh)', async () => {
    mockPatch.mockRejectedValue(Object.assign(new Error('boom'), { status: 409 }));
    const { Wrapper, invalidateSpy } = wrapperWithSpy();

    const { result } = await renderHook(() => useRejectOrder(), { wrapper: Wrapper });
    result.current.mutate({ orderId: 'o-1', reasonCode: 'out_of_stock' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
