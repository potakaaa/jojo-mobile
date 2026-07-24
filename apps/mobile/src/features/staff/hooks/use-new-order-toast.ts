import type { StaffOrderSummary } from '@jojopotato/types';
import type { ToastSeverity } from '@jojopotato/ui';
import { useEffect, useRef } from 'react';

import { detectNewOrders } from '../lib/detect-new-orders';

/** Copy for the new-order toast: name the single order, else count the batch. */
function newOrderMessage(newIds: string[], orders: readonly StaffOrderSummary[]): string {
  if (newIds.length === 1) {
    const order = orders.find((o) => o.id === newIds[0]);
    return order ? `New order — ${order.orderNumber}` : 'New order';
  }
  return `${newIds.length} new orders`;
}

/**
 * Raise a `warning` toast when a genuinely-new order appears in a staff poll
 * result (Active Orders + dashboard home — the two places `useStaffOrders` is
 * mounted). Side-effecting; returns nothing.
 *
 * Pass the RAW query data (`undefined` while loading), NOT a `[]`-defaulted
 * value: the previous-poll ref stays `undefined` until the first real poll, so
 * the first load seeds the baseline WITHOUT toasting, and only a later poll
 * containing an id not seen before fires. The ref updates to the current set
 * each poll, so a given id toasts at most once (a status change of an existing
 * order is not "new"). `useToast` is replace-latest, so two orders arriving in
 * one poll produce one "N new orders" message rather than a queue.
 */
export function useNewOrderToast(
  orders: readonly StaffOrderSummary[] | undefined,
  showToast: (message: string, severity?: ToastSeverity) => void,
): void {
  const prevOrdersRef = useRef<readonly StaffOrderSummary[] | undefined>(undefined);

  useEffect(() => {
    if (orders === undefined) return; // still loading — no baseline yet
    const newIds = detectNewOrders(prevOrdersRef.current, orders);
    if (newIds.length > 0) {
      showToast(newOrderMessage(newIds, orders), 'warning');
    }
    prevOrdersRef.current = orders;
  }, [orders, showToast]);
}
