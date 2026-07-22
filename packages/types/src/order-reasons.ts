/**
 * Shared reason-code lookups for terminal order transitions.
 *
 * Single source of truth for BOTH sides of the wire:
 *   - `packages/api` imports the `code` values to build its zod enums (server-side
 *     validation of `PATCH /api/staff/orders/:orderId/reject` and
 *     `PATCH /orders/:orderId/cancel`).
 *   - `apps/mobile` imports the `label` values to render the reason pickers and to
 *     resolve a stored `reasonCode` back to display text.
 *
 * Because both sides read the same module, a copy/wording change can never drift
 * from server validation, and a new code can never be renderable-but-rejected.
 */

export const STAFF_REJECT_REASONS = [
  { code: 'out_of_stock', label: 'Item(s) out of stock' },
  { code: 'branch_busy', label: 'Branch too busy / at capacity' },
  { code: 'outside_hours', label: 'Outside service hours / closing soon' },
  { code: 'payment_issue', label: 'Payment issue' },
  { code: 'customer_requested', label: 'Customer requested' },
  { code: 'other', label: 'Other' },
] as const;
export type StaffRejectReasonCode = (typeof STAFF_REJECT_REASONS)[number]['code'];

export const CUSTOMER_CANCEL_REASONS = [
  { code: 'ordered_by_mistake', label: 'Ordered by mistake' },
  { code: 'changed_my_mind', label: 'Changed my mind' },
  { code: 'wrong_item_options', label: 'Wrong item or options' },
  { code: 'wrong_branch', label: 'Wrong branch' },
  { code: 'taking_too_long', label: 'Taking too long' },
  { code: 'other', label: 'Other' },
] as const;
export type CustomerCancelReasonCode = (typeof CUSTOMER_CANCEL_REASONS)[number]['code'];

/** Who wrote the terminal-transition reason. NULL on pre-feature rows. */
export type OrderReasonActor = 'staff' | 'customer';

/**
 * Resolve a stored `reasonCode` to its display label, choosing the lookup table
 * from `reasonActor`. Returns `null` when there is nothing to render; falls back
 * to the raw code when an unknown code is stored (never renders blank).
 */
export function resolveReasonLabel(
  reasonCode: string | null | undefined,
  reasonActor: OrderReasonActor | null | undefined,
): string | null {
  if (!reasonCode) return null;
  const table = reasonActor === 'customer' ? CUSTOMER_CANCEL_REASONS : STAFF_REJECT_REASONS;
  const match = table.find((r) => r.code === reasonCode);
  return match ? match.label : reasonCode;
}
