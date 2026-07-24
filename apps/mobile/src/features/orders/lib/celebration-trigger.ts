import type { OrderStatus } from '@jojopotato/types';

/**
 * Pure predicate deciding whether the completion celebration should fire for a
 * status change (order-completion-celebration, AC9/AC2).
 *
 * Fires ONLY when a real, observed transition INTO `completed` happened:
 *   - `prevStatus` is defined (so a first render / a screen that mounts already
 *     `completed` never fires — AC2: `shouldCelebrate(undefined, 'completed')`
 *     is `false`),
 *   - `prevStatus` was non-terminal (a genuine progression, not e.g. a
 *     `completed → completed` re-render), and
 *   - `nextStatus` is exactly `completed`.
 *
 * Deterministic and side-effect-free so the hook that owns the prev-status ref
 * can be verified in isolation.
 */
export function shouldCelebrate(
  prevStatus: OrderStatus | undefined,
  nextStatus: OrderStatus,
): boolean {
  if (prevStatus === undefined) return false;
  if (nextStatus !== 'completed') return false;

  const prevIsTerminal =
    prevStatus === 'completed' || prevStatus === 'cancelled' || prevStatus === 'rejected';
  if (prevIsTerminal) return false;

  return true;
}
