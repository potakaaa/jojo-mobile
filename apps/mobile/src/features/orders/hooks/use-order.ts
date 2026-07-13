import { useCallback } from 'react';

import { fetchOrder } from '@/features/orders/lib/api-client';
import { useAsyncData } from '@/features/shared/hooks/use-async-data';

/** Load a single order by id (fetch-on-mount; `refetch` for fetch-on-focus). */
export function useOrder(orderId: string) {
  const fetcher = useCallback(() => fetchOrder(orderId), [orderId]);
  return useAsyncData(fetcher, [orderId]);
}
