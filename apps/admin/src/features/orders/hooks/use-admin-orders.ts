import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { getOrder, listOrders, type OrderFilters } from '../lib/admin-orders-api';

/**
 * react-query hooks over the ADM-006 read-only orders API. The list uses
 * `useInfiniteQuery` for native cursor pagination (E3 — no prior filtered/paginated
 * precedent in this app) and a `refetchInterval` so order statuses stay live while
 * the admin is on the page (D7 — poll-while-mounted, mirroring the app-wide
 * fetch-on-focus + polling convention; NOT websockets/push, which this stack lacks).
 */
export const ORDERS_KEY = ['admin', 'orders'] as const;
const ORDER_KEY = ['admin', 'order'] as const;

/** Poll cadence for the live-status list (D7). */
const LIST_POLL_INTERVAL_MS = 15_000;

export function useAdminOrders(filters: OrderFilters) {
  return useInfiniteQuery({
    queryKey: [...ORDERS_KEY, filters],
    queryFn: ({ pageParam }) => listOrders(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: LIST_POLL_INTERVAL_MS,
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: [...ORDER_KEY, id],
    queryFn: () => getOrder(id),
    enabled: id.length > 0,
  });
}
