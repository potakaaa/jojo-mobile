import type { MenuItem } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { filterProductsByCategory } from '../filter-products-by-category';

/** Build a `MenuItem` with the fields this filter actually reads (`categoryId`). */
function makeItem(id: string, categoryId: string): MenuItem {
  return {
    id,
    name: id,
    priceCents: 9900,
    categoryId,
    isAvailable: true,
  };
}

/** Two categories with 2 + 1 products; `spicy` is a real category with 0 products. */
const CLASSIC_A = makeItem('fries-classic', 'classic');
const CLASSIC_B = makeItem('nuggets-classic', 'classic');
const CHEESY_A = makeItem('fries-cheddar', 'cheesy');

const PRODUCTS: MenuItem[] = [CLASSIC_A, CLASSIC_B, CHEESY_A];

describe('filterProductsByCategory', () => {
  it("filters to only the selected category's products (AC1)", () => {
    expect(filterProductsByCategory(PRODUCTS, 'classic')).toEqual([CLASSIC_A, CLASSIC_B]);
  });

  it('returns the full unfiltered list when categoryId is null (AC2)', () => {
    expect(filterProductsByCategory(PRODUCTS, null)).toEqual(PRODUCTS);
  });

  it("switching from category A to category B returns exactly B's products (AC3)", () => {
    const fromA = filterProductsByCategory(PRODUCTS, 'classic');
    const thenB = filterProductsByCategory(PRODUCTS, 'cheesy');

    // B's products only — not A's, and not the union of both.
    expect(thenB).toEqual([CHEESY_A]);
    expect(thenB).not.toContain(CLASSIC_A);
    expect(thenB).not.toContain(CLASSIC_B);
    expect(thenB.length).toBeLessThan(fromA.length + thenB.length);
  });

  it('returns an empty array for a category with zero matching products (AC4, data path)', () => {
    expect(filterProductsByCategory(PRODUCTS, 'spicy')).toEqual([]);
  });

  it('never returns a product that was not present in the input array (AC5)', () => {
    // The branch-menu API is already server-side filtered to available-only
    // products; filtering may only narrow that set, never re-add to it.
    for (const categoryId of ['classic', 'cheesy', 'spicy', null] as const) {
      const result = filterProductsByCategory(PRODUCTS, categoryId);
      expect(result.every((item) => PRODUCTS.includes(item))).toBe(true);
      expect(result.length).toBeLessThanOrEqual(PRODUCTS.length);
    }
  });

  it('preserves input order within the filtered category (AC1 ordering)', () => {
    expect(filterProductsByCategory(PRODUCTS, 'classic').map((p) => p.id)).toEqual([
      'fries-classic',
      'nuggets-classic',
    ]);
  });

  it('returns an empty array for an empty product list', () => {
    expect(filterProductsByCategory([], 'classic')).toEqual([]);
    expect(filterProductsByCategory([], null)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [...PRODUCTS];
    filterProductsByCategory(input, 'classic');
    expect(input).toEqual(PRODUCTS);
  });
});
