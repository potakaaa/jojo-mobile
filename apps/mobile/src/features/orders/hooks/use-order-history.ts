import { useCallback } from 'react';

import { fetchOrderHistory } from '@/features/orders/lib/api-client';
import { useAsyncData } from '@/features/shared/hooks/use-async-data';

/** Load the caller's order history (newest first). */
export function useOrderHistory() {
  const fetcher = useCallback(() => fetchOrderHistory(), []);
  return useAsyncData(fetcher, []);
}
