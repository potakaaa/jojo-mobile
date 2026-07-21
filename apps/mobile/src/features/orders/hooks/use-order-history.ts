import { useInfiniteQuery } from '@tanstack/react-query';

import { fetchOrderHistory } from '@/features/orders/lib/api-client';

/**
 * Load the caller's order history (newest first) with cursor pagination.
 *
 * Returns the raw `useInfiniteQuery` result (mirrors `apps/admin`'s
 * `use-admin-orders.ts`); consumers select what they need:
 * - History flattens `data.pages.flatMap(p => p.orders)` and calls `fetchNextPage()`.
 * - Home reads `data?.pages[0]?.orders` only (page 1 on mount, never paginates).
 * - Deal-usage flattens the pages then filters by `dealId`.
 */
export function useOrderHistory() {
  return useInfiniteQuery({
    queryKey: ['orders', 'history'],
    queryFn: ({ pageParam }) => fetchOrderHistory({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
