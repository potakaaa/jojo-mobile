import type { StaffOrderSummary } from '@jojopotato/types';

import { NON_TERMINAL_STAFF_STATUSES, type NonTerminalStaffStatus } from './staff-status-taxonomy';

/** Live count block shown on the staff dashboard home (STAFF-005). */
export interface DashboardCounts {
  /** Orders awaiting staff acceptance (`status === 'pending'`). */
  awaitingAcceptance: number;
  /** Per-status counts, keyed off the 5 non-terminal statuses only. */
  activeByStatus: Record<NonTerminalStaffStatus, number>;
}

/**
 * Derive the staff dashboard's live counts from the SAME order list the Active
 * Orders screen consumes (`useStaffOrders`). Pure — no hooks, no fetch.
 *
 * `activeByStatus` is keyed off `NON_TERMINAL_STAFF_STATUSES` (the single
 * non-terminal source of truth in `staff-status-config.ts`), so the dashboard
 * can never structurally diverge from the Active Orders taxonomy (AC3).
 *
 * Terminal statuses (`completed`/`cancelled`/`rejected`) are excluded
 * DEFENSIVELY: `useStaffOrders` list responses are already server-filtered to
 * non-terminal only (`packages/types/src/staff.ts:32-33`), so this guards
 * robustness rather than an observed runtime input (E4).
 */
export function deriveDashboardCounts(orders: StaffOrderSummary[]): DashboardCounts {
  const activeByStatus = Object.fromEntries(
    NON_TERMINAL_STAFF_STATUSES.map((status) => [status, 0]),
  ) as Record<NonTerminalStaffStatus, number>;

  const nonTerminal: readonly string[] = NON_TERMINAL_STAFF_STATUSES;
  for (const order of orders) {
    if (nonTerminal.includes(order.status)) {
      activeByStatus[order.status as NonTerminalStaffStatus] += 1;
    }
  }

  return {
    awaitingAcceptance: activeByStatus.pending,
    activeByStatus,
  };
}
