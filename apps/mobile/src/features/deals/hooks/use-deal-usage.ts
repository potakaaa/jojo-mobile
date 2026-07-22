import { useMemo } from 'react';

import { useAuth } from '@/features/auth/hooks/use-auth';
import type { DealUsageRecord } from '@/features/deals/lib/eligibility';
import { useOrderHistory } from '@/features/orders/hooks/use-order-history';

/**
 * Real per-user deal usage, derived from order history's `dealId` field
 * (DEAL-003's `orders.deal_id`) — mirrors the server's own usage-limit count
 * in `packages/api/src/routes/orders.ts` (counts all orders with a matching
 * deal_id + user_id, any status). Replaces the interim `usage: []` / mock
 * usage previously passed to `checkDealEligibility` (the coupon-path eligibility
 * recheck; `applyDealById` was removed by DEAL-004).
 */
export function useDealUsage(): DealUsageRecord[] {
  const { user } = useAuth();
  const { data } = useOrderHistory();

  // Memo keyed on `data` (the raw InfiniteData), not a freshly-flattened array —
  // flattening inside the memo avoids a new `flatMap` result defeating it each render (E1).
  return useMemo(() => {
    if (!data || !user) return [];
    const orders = data.pages.flatMap((page) => page.orders);
    return orders
      .filter((order) => order.dealId !== null)
      .map((order) => ({ dealId: order.dealId as string, userId: user.id }));
  }, [data, user]);
}
