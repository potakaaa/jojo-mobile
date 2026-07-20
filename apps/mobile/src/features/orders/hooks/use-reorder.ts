import type { MenuResponse, Order } from '@jojopotato/types';
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
        // MENU-003: fetch the regular menu AND the deals menu, then merge their
        // categories into one `MenuResponse`. The regular menu structurally
        // excludes every deal-product (`is_deal=false` server-side), so fetching
        // it alone made `reconcileReorder` flag EVERY past deal line
        // `product_unavailable` unconditionally — deals were never reorderable.
        //
        // The deals menu already excludes deals whose components are unavailable
        // at this branch, so an unavailable deal is simply absent from the merged
        // tree and `reconcileReorder`'s existing `product_unavailable` branch
        // fires naturally — no signature change, no new reason value.
        //
        // Distinct query keys keep the two react-query cache entries from
        // colliding. All deal-products are server-pinned to a single "Deals"
        // category that the regular menu never returns, so the merge cannot
        // produce a duplicate category id.
        const [regularMenu, dealsMenu] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: ['menu', order.branchId],
            queryFn: () => getMenu(order.branchId),
          }),
          queryClient.fetchQuery({
            queryKey: ['menu', order.branchId, 'deals'],
            queryFn: () => getMenu(order.branchId, { isDeal: true }),
          }),
        ]);
        const menu: MenuResponse = {
          ...regularMenu,
          categories: [...regularMenu.categories, ...dealsMenu.categories],
        };

        // Fresh cart for the order's branch. `setBranch` no-ops (and does NOT
        // clear) when the id is unchanged, so `clearCart()` guarantees a clean
        // reorder cart in every case.
        //
        // ponytail: these three MUST stay below the fetches above. Both
        // `setBranch` (on a branch change) and `clearCart` empty `cart.items`,
        // and the `catch` below only alerts — it cannot restore. Running them
        // first meant a failed menu fetch silently destroyed the user's cart.
        clearConflicts();
        setBranch(order.branchId);
        clearCart();

        const { available, unavailable } = reconcileReorder(order, menu);
        for (const line of available) {
          addItem(productToMenuItem(line.product, true), line.optionsForCart, line.quantity);
        }
        setConflicts(unavailable);

        router.push('/(tabs)/cart');
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
