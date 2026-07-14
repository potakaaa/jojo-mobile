import type { OrderItem } from '@jojopotato/types';

/**
 * DECISION 2: compact one-line summary of an order's items for the history row.
 *
 * - `[]`            → `''`
 * - one item        → `"{qty}× {productName}"`
 * - multiple items  → `"{qty}× {firstName} + {n} more"` where `n = items.length - 1`
 *
 * Uses the multiplication sign `×` (U+00D7), not the letter `x`. Pure — no I/O,
 * no React, cents-agnostic.
 */
export function summarizeOrderItems(items: OrderItem[]): string {
  if (items.length === 0) return '';
  const first = items[0]!;
  const head = `${first.quantity}× ${first.productName}`;
  if (items.length === 1) return head;
  return `${head} + ${items.length - 1} more`;
}
