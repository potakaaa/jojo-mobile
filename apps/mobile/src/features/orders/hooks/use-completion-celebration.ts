import type { OrderStatus } from '@jojopotato/types';
import { useCallback, useEffect, useRef, useState } from 'react';

import { shouldCelebrate } from '@/features/orders/lib/celebration-trigger';

export interface UseCompletionCelebrationResult {
  /** Whether the celebration + review prompt overlay is currently shown. */
  celebrationVisible: boolean;
  /**
   * Show the celebration once for the current order. Idempotent per order id per
   * session — safe to call from BOTH the self-confirm `onSuccess` path AND the
   * live-poll transition effect without double-firing.
   */
  showCelebration: () => void;
  /** Dismiss the overlay (Skip / submitted / scrim tap). */
  dismissCelebration: () => void;
}

/**
 * Owns the completion-celebration trigger for the tracking screen
 * (order-completion-celebration, D3). Fires the celebration on BOTH paths:
 *
 *  1. Self-confirm — the caller passes `showCelebration` as the per-call
 *     `onSuccess` of `useCompleteOrder().mutate` (deterministic, AC1).
 *  2. Staff-completed live poll — an internal effect holds the previous status in
 *     a ref and calls `showCelebration` when `shouldCelebrate(prev, next)` is
 *     true (a real `…→completed` transition observed while mounted, AC9).
 *
 * The prev-status ref seeds on first render WITHOUT firing (its initial value is
 * `undefined`, so a screen that mounts already `completed` never celebrates —
 * AC2). A per-order-id `shown` guard makes the two paths converge to exactly one
 * celebration: whichever fires first records the id; the second call is a no-op.
 */
export function useCompletionCelebration(
  orderId: string | undefined,
  status: OrderStatus | undefined,
): UseCompletionCelebrationResult {
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const prevStatusRef = useRef<OrderStatus | undefined>(undefined);
  const shownForOrderRef = useRef<Set<string>>(new Set());

  const showCelebration = useCallback(() => {
    if (!orderId) return;
    if (shownForOrderRef.current.has(orderId)) return;
    shownForOrderRef.current.add(orderId);
    setCelebrationVisible(true);
  }, [orderId]);

  const dismissCelebration = useCallback(() => {
    setCelebrationVisible(false);
  }, []);

  // Live-poll transition detection. Runs after commit (never during render), so
  // the ref seed on the first pass (prev = undefined) can never fire, and only a
  // genuine `…→completed` change on a later poll tick celebrates.
  useEffect(() => {
    if (status === undefined) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (shouldCelebrate(prev, status)) {
      showCelebration();
    }
  }, [status, showCelebration]);

  return { celebrationVisible, showCelebration, dismissCelebration };
}
