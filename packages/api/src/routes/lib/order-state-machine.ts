import type { OrderStatus } from '@jojopotato/types';

/**
 * Pure state-machine for staff order transitions (STAFF-003).
 *
 * Implemented as a lookup table — no DB dependency, no switch/case.
 * The guard functions are unit-testable in isolation; they are also
 * exercised via the PATCH integration tests (AC-1..AC-4).
 */
const TRANSITIONS: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  pending: new Set<OrderStatus>(['accepted', 'rejected', 'cancelled']),
  accepted: new Set<OrderStatus>(['preparing', 'cancelled']),
  preparing: new Set<OrderStatus>(['flavoring', 'cancelled']),
  flavoring: new Set<OrderStatus>(['ready', 'cancelled']),
  ready: new Set<OrderStatus>(['completed', 'cancelled']),
  completed: new Set<OrderStatus>(),
  cancelled: new Set<OrderStatus>(),
  rejected: new Set<OrderStatus>(),
};

const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'completed',
  'cancelled',
  'rejected',
]);

/**
 * Returns `true` when the transition `from → to` is legal per the state machine.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].has(to);
}

/**
 * Returns `true` when `status` is a terminal state (no further transitions allowed).
 */
export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
