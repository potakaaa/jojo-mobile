import type { MenuResponse, Product } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { findEligibleMenuItem } from '../find-eligible-menu-item';

/** Minimal menu Product factory (grouped-option shape per menu.ts). */
function product(id: string, name: string): Product {
  return {
    id,
    name,
    basePriceCents: 500,
    options: { size: [], flavor: [], add_on: [] },
  };
}

/** Two-category menu: fries + lemonade in cat-1, corndog in cat-2. */
const menu: MenuResponse = {
  branchId: 'b1',
  categories: [
    {
      id: 'cat-1',
      name: 'Sides',
      products: [product('fries', 'Fries'), product('lemonade', 'Lemonade')],
    },
    { id: 'cat-2', name: 'Mains', products: [product('corndog', 'Corndog')] },
  ],
};

describe('findEligibleMenuItem', () => {
  it('returns the Product when the eligible id is present in the menu', () => {
    const found = findEligibleMenuItem('lemonade', menu);
    expect(found).not.toBeNull();
    expect(found?.id).toBe('lemonade');
    expect(found?.name).toBe('Lemonade');
  });

  it('finds a product in a non-first category', () => {
    expect(findEligibleMenuItem('corndog', menu)?.id).toBe('corndog');
  });

  it('returns null when the eligible id is absent from the menu', () => {
    expect(findEligibleMenuItem('missing-product', menu)).toBeNull();
  });

  it('returns null when eligibleProductId is null', () => {
    expect(findEligibleMenuItem(null, menu)).toBeNull();
  });

  it('returns null when the menu is undefined', () => {
    expect(findEligibleMenuItem('fries', undefined)).toBeNull();
  });
});
