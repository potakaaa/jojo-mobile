import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { getCustomer, listCustomers } from '../lib/admin-customers-api';

/**
 * react-query hooks over the ADM-010 READ-ONLY customers API. The list uses
 * `useInfiniteQuery` for native cursor pagination (mirrors ADM-006's
 * `useAdminOrders`). The caller passes the ALREADY-DEBOUNCED search value into
 * `useAdminCustomers` — debouncing happens in the component before the query key
 * is built, not inside this hook. No `refetchInterval`: a customer directory is
 * not a live-status surface (unlike orders).
 */
const CUSTOMERS_KEY = ['admin', 'customers'] as const;
const CUSTOMER_KEY = ['admin', 'customer'] as const;

export function useAdminCustomers(q: string) {
  return useInfiniteQuery({
    queryKey: [...CUSTOMERS_KEY, q],
    queryFn: ({ pageParam }) => listCustomers(q, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useAdminCustomer(id: string) {
  return useQuery({
    queryKey: [...CUSTOMER_KEY, id],
    queryFn: () => getCustomer(id),
    enabled: id.length > 0,
  });
}
