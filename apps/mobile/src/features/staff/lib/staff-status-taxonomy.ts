import type { OrderStatus } from '@jojopotato/types';

/**
 * The 5 non-terminal staff statuses, in active-order display order. Single
 * source of truth for "what counts as an active order" — the STAFF-005
 * dashboard stat block keys its per-status counts off this array so it can
 * never structurally diverge from the Active Orders screen's taxonomy (AC3).
 *
 * Kept in a PURE module (no theme/`Palette` import) so node-env unit tests
 * (e.g. `dashboard-counts.test.ts`) can import the taxonomy without pulling in
 * the react-native rendering chain that `staff-status-config.ts`'s colour
 * config requires. `staff-status-config.ts` re-exports these so any consumer
 * can still import them from the status-config module.
 */
export const NON_TERMINAL_STAFF_STATUSES = [
  'pending',
  'accepted',
  'preparing',
  'flavoring',
  'ready',
] as const satisfies readonly OrderStatus[];

/** A non-terminal (active-order) staff status. Subset of `StaffOrderStatus`. */
export type NonTerminalStaffStatus = (typeof NON_TERMINAL_STAFF_STATUSES)[number];
