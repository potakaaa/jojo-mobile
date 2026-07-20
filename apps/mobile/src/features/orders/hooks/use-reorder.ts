import type { Order } from '@jojopotato/types';
import { reconcileReorder } from '@jojopotato/utils';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { useCart } from '@/features/cart/hooks/use-cart';
import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';
import { useReorderConflicts } from '@/features/cart/hooks/use-reorder-conflicts';
import { getMenu } from '@/lib/api-client';
import { queryClient } from '@/lib/query-client';

/**
 * HIST-002: runs the full reorder flow for one past order, then navigates to the
 * cart. Available lines are rebuilt against TODAY's menu (current price +
 * availability via `getMenu` — never the historical `unitPriceCents`) and pushed
 * into the real cart; now-unavailable lines are surfaced out-of-band through
 * `useReorderConflicts()` (DECISION 5) so the locked `Cart` contract stays clean.
 *
 * Failure is exposed as `error` DATA rather than the hook reaching for React
 * Native's `Alert` API itself: presentation is the consumer screen's decision,
 * not a hook's. `history.tsx` is the only consumer and renders it as a Toast.
 */
export function useReorder(): {
  reorder: (order: Order) => Promise<void>;
  isReordering: boolean;
  error: string | null;
} {
  const { addItem, setBranch, clearCart } = useCart();
  const { setConflicts, clearConflicts } = useReorderConflicts();
  const [isReordering, setIsReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reorder = useCallback(
    async (order: Order) => {
      setIsReordering(true);
      // Drop any stale failure from a previous attempt, so the user never sees
      // an old error next to a fresh, in-flight reorder.
      setError(null);
      try {
        // Fresh cart for the order's branch. `setBranch` no-ops (and does NOT
        // clear) when the id is unchanged, so `clearCart()` guarantees a clean
        // reorder cart in every case.
        clearConflicts();
        setBranch(order.branchId);
        clearCart();

        const menu = await queryClient.fetchQuery({
          queryKey: ['menu', order.branchId],
          queryFn: () => getMenu(order.branchId),
        });

        const { available, unavailable } = reconcileReorder(order, menu);
        for (const line of available) {
          addItem(productToMenuItem(line.product, true), line.optionsForCart, line.quantity);
        }
        setConflicts(unavailable);

        router.push('/(tabs)/order/cart');
      } catch {
        setError('We were unable to load the latest menu for this order. Please try again.');
      } finally {
        setIsReordering(false);
      }
    },
    [addItem, setBranch, clearCart, setConflicts, clearConflicts],
  );

  return { reorder, isReordering, error };
}
