import type { OrderStatus } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { shouldCelebrate } from '@/features/orders/lib/celebration-trigger';

/**
 * Pure-predicate coverage for the completion celebration trigger
 * (order-completion-celebration, AC9 + AC2). Non-vacuous: breaking the predicate
 * to a plain `next === 'completed'` passthrough would turn the AC2 stale-mount
 * and terminal-prev cases red.
 */
describe('shouldCelebrate (AC9 / AC2)', () => {
  it('AC9: fires on a real ready → completed transition', () => {
    expect(shouldCelebrate('ready', 'completed')).toBe(true);
  });

  it('AC2: does NOT fire when there is no previous status (stale / first mount)', () => {
    expect(shouldCelebrate(undefined, 'completed')).toBe(false);
  });

  it('AC2: does NOT fire when the previous status was already terminal', () => {
    const terminalPrev: OrderStatus[] = ['completed', 'cancelled', 'rejected'];
    for (const prev of terminalPrev) {
      expect(shouldCelebrate(prev, 'completed')).toBe(false);
    }
  });

  it('does NOT fire for any non-completed next status', () => {
    const nonCompleted: OrderStatus[] = [
      'pending',
      'accepted',
      'preparing',
      'flavoring',
      'ready',
      'cancelled',
      'rejected',
    ];
    for (const next of nonCompleted) {
      expect(shouldCelebrate('ready', next)).toBe(false);
    }
  });

  it('fires from every non-terminal previous status into completed', () => {
    const nonTerminalPrev: OrderStatus[] = [
      'pending',
      'accepted',
      'preparing',
      'flavoring',
      'ready',
    ];
    for (const prev of nonTerminalPrev) {
      expect(shouldCelebrate(prev, 'completed')).toBe(true);
    }
  });
});
