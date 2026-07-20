import type { StaffOrderSummary } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { deriveDashboardCounts } from '../dashboard-counts';
import { NON_TERMINAL_STAFF_STATUSES } from '../staff-status-taxonomy';

/** Build a `StaffOrderSummary` with only the field this derivation reads (`status`). */
function makeOrder(id: string, status: StaffOrderSummary['status']): StaffOrderSummary {
  return {
    id,
    orderNumber: `JP-${id}`,
    status,
    placedAt: '2026-07-20T00:00:00.000Z',
    totalCents: 9900,
    itemSummary: '1× Loaded Fries',
  };
}

describe('deriveDashboardCounts', () => {
  it('should derive zero counts from an empty order array', () => {
    const counts = deriveDashboardCounts([]);
    expect(counts.awaitingAcceptance).toBe(0);
    expect(counts.activeByStatus).toEqual({
      pending: 0,
      accepted: 0,
      preparing: 0,
      flavoring: 0,
      ready: 0,
    });
  });

  it('should count awaiting-acceptance and per-status active counts keyed off NON_TERMINAL_STAFF_STATUSES', () => {
    const counts = deriveDashboardCounts([
      makeOrder('1', 'pending'),
      makeOrder('2', 'pending'),
      makeOrder('3', 'accepted'),
      makeOrder('4', 'preparing'),
      makeOrder('5', 'flavoring'),
      makeOrder('6', 'ready'),
      makeOrder('7', 'ready'),
    ]);

    // awaitingAcceptance is exactly the pending count.
    expect(counts.awaitingAcceptance).toBe(2);
    expect(counts.activeByStatus).toEqual({
      pending: 2,
      accepted: 1,
      preparing: 1,
      flavoring: 1,
      ready: 2,
    });
  });

  it('should exclude terminal statuses from activeByStatus (defensive)', () => {
    // DEFENSIVE: `useStaffOrders` list responses are already server-filtered to
    // non-terminal statuses only (packages/types/src/staff.ts:32-33), so terminal
    // statuses never reach this function at runtime. This asserts robustness, not
    // observed behavior (E4).
    const counts = deriveDashboardCounts([
      makeOrder('1', 'pending'),
      makeOrder('2', 'completed'),
      makeOrder('3', 'cancelled'),
      makeOrder('4', 'rejected'),
    ]);

    expect(counts.awaitingAcceptance).toBe(1);
    expect(counts.activeByStatus).toEqual({
      pending: 1,
      accepted: 0,
      preparing: 0,
      flavoring: 0,
      ready: 0,
    });
    // Terminal statuses must not appear as keys.
    expect(Object.keys(counts.activeByStatus)).not.toContain('completed');
    expect(Object.keys(counts.activeByStatus)).not.toContain('cancelled');
    expect(Object.keys(counts.activeByStatus)).not.toContain('rejected');
  });

  it('should key activeByStatus off the shared NON_TERMINAL_STAFF_STATUSES taxonomy (AC3 divergence guard)', () => {
    // The dashboard cannot structurally diverge from the Active Orders screen:
    // its per-status buckets are exactly the shared non-terminal taxonomy.
    const counts = deriveDashboardCounts([]);
    expect(Object.keys(counts.activeByStatus).sort()).toEqual(
      [...NON_TERMINAL_STAFF_STATUSES].sort(),
    );
  });
});
