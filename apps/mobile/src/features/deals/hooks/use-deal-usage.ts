import { useMemo } from 'react';

import { useAuth } from '@/features/auth/hooks/use-auth';
import type { DealUsageRecord } from '@/features/deals/lib/eligibility';
import { useOrderHistory } from '@/features/orders/hooks/use-order-history';

/**
 * Real per-user deal usage, derived from order history's `dealId` field
 * (DEAL-003's `orders.deal_id`) — mirrors the server's own usage-limit count
 * in `packages/api/src/routes/orders.ts` (counts all orders with a matching
 * deal_id + user_id, any status). Replaces the interim `usage: []` / mock
 * usage previously passed to `checkDealEligibility`/`applyDealById`.
 */
export function useDealUsage(): DealUsageRecord[] {
  const { user } = useAuth();
  const { data: orders } = useOrderHistory();

  return useMemo(() => {
    if (!orders || !user) return [];
    return orders
      .filter((order) => order.dealId !== null)
      .map((order) => ({ dealId: order.dealId as string, userId: user.id }));
  }, [orders, user]);
}
