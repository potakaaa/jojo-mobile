import type { StaffOrderSummary } from '@jojopotato/types';

/**
 * Pure new-order diff for the staff new-order toast. Returns the ids present in
 * `next` but not in `prev`.
 *
 * Node-env-vitest safe: imports only the `StaffOrderSummary` type.
 *
 * - `prev === undefined` → `[]`. The FIRST poll after mount has no baseline to
 *   diff against; treating everything as "new" there would toast on first load.
 *   Callers pass the raw (undefined-while-loading) query data so this baseline
 *   case fires exactly once.
 * - A status-only change of an existing order is NOT new — its id was already in
 *   `prev`, so it never appears in the result (no repeat toast on a status flip).
 */
export function detectNewOrders(
  prev: readonly StaffOrderSummary[] | undefined,
  next: readonly StaffOrderSummary[],
): string[] {
  if (prev === undefined) return [];
  const prevIds = new Set(prev.map((order) => order.id));
  return next.filter((order) => !prevIds.has(order.id)).map((order) => order.id);
}
