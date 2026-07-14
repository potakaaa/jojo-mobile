import type { OrderItem } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { summarizeOrderItems } from '../order-display';

function item(productName: string, quantity: number): OrderItem {
  return {
    productId: `p-${productName}`,
    productName,
    quantity,
    unitPriceCents: 500,
    totalPriceCents: 500 * quantity,
    selectedOptions: [],
  };
}

describe('summarizeOrderItems', () => {
  it('returns empty for 0, single for 1, and summary-plus-more for N', () => {
    // 0 items
    expect(summarizeOrderItems([])).toBe('');
    // 1 item
    expect(summarizeOrderItems([item('Classic Fries', 2)])).toBe('2× Classic Fries');
    // N items → first line + "+ n more" (n = length - 1)
    expect(
      summarizeOrderItems([item('Classic Fries', 2), item('Cheese Dip', 1), item('Soda', 3)]),
    ).toBe('2× Classic Fries + 2 more');
  });

  it('uses the multiplication sign U+00D7, not the letter x', () => {
    expect(summarizeOrderItems([item('Fries', 1)])).toContain('×');
    expect(summarizeOrderItems([item('Fries', 1)])).not.toMatch(/\dx /);
  });
});
