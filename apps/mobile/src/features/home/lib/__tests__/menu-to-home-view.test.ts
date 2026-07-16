import type { MenuResponse, Product, ProductOption } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { flattenMenuForHome } from '../menu-to-home-view';

/** Build a `Product` with the required grouped-options `Record` (empty buckets). */
function makeProduct(
  overrides: Partial<Product> & Pick<Product, 'id' | 'name' | 'basePriceCents'>,
): Product {
  const emptyOptions: Record<'size' | 'flavor' | 'add_on', ProductOption[]> = {
    size: [],
    flavor: [],
    add_on: [],
  };
  return {
    options: emptyOptions,
    ...overrides,
  };
}

const MULTI_CATEGORY_MENU: MenuResponse = {
  branchId: 'branch-1',
  categories: [
    {
      id: 'classic',
      name: 'Classic',
      products: [
        makeProduct({
          id: 'fries-classic',
          name: 'Classic Fries',
          description: 'Golden hand-cut fries.',
          basePriceCents: 9900,
        }),
        makeProduct({ id: 'nuggets-classic', name: 'Classic Nuggets', basePriceCents: 14900 }),
      ],
    },
    {
      id: 'cheesy',
      name: 'Cheesy',
      products: [
        makeProduct({
          id: 'fries-cheddar',
          name: 'Cheddar Fries',
          basePriceCents: 14900,
          imageUrl: 'https://example.test/cheddar.png',
        }),
      ],
    },
  ],
};

describe('flattenMenuForHome', () => {
  it('flattens nested Category[]/Product[] into flat MenuCategory[]/MenuItem[]', () => {
    const view = flattenMenuForHome(MULTI_CATEGORY_MENU);

    expect(view.categories).toEqual([
      { id: 'classic', name: 'Classic', sortOrder: 0 },
      { id: 'cheesy', name: 'Cheesy', sortOrder: 1 },
    ]);
    expect(view.products).toHaveLength(3);
  });

  it('derives sortOrder from category array index', () => {
    const view = flattenMenuForHome(MULTI_CATEGORY_MENU);

    expect(view.categories.map((c) => c.sortOrder)).toEqual([0, 1]);
  });

  it('maps basePriceCents to priceCents (rename, same cents unit)', () => {
    const view = flattenMenuForHome(MULTI_CATEGORY_MENU);

    expect(view.products.map((p) => p.priceCents)).toEqual([9900, 14900, 14900]);
  });

  it('derives categoryId from the parent category', () => {
    const view = flattenMenuForHome(MULTI_CATEGORY_MENU);

    expect(view.products.map((p) => ({ id: p.id, categoryId: p.categoryId }))).toEqual([
      { id: 'fries-classic', categoryId: 'classic' },
      { id: 'nuggets-classic', categoryId: 'classic' },
      { id: 'fries-cheddar', categoryId: 'cheesy' },
    ]);
  });

  it('sets isAvailable to true unconditionally (menu tree is available-only)', () => {
    const view = flattenMenuForHome(MULTI_CATEGORY_MENU);

    expect(view.products.every((p) => p.isAvailable === true)).toBe(true);
  });

  it('preserves category order and product-within-category order', () => {
    const view = flattenMenuForHome(MULTI_CATEGORY_MENU);

    expect(view.products.map((p) => p.id)).toEqual([
      'fries-classic',
      'nuggets-classic',
      'fries-cheddar',
    ]);
  });

  it('carries through description and imageUrl when present, undefined when absent', () => {
    const view = flattenMenuForHome(MULTI_CATEGORY_MENU);

    const classicFries = view.products.find((p) => p.id === 'fries-classic');
    const cheddar = view.products.find((p) => p.id === 'fries-cheddar');
    expect(classicFries?.description).toBe('Golden hand-cut fries.');
    expect(classicFries?.imageUrl).toBeUndefined();
    expect(cheddar?.imageUrl).toBe('https://example.test/cheddar.png');
    expect(cheddar?.description).toBeUndefined();
  });

  it('returns empty arrays for an empty menu', () => {
    const view = flattenMenuForHome({ branchId: 'branch-1', categories: [] });

    expect(view).toEqual({ categories: [], products: [] });
  });

  it('handles a category with no products (category kept, no products emitted)', () => {
    const view = flattenMenuForHome({
      branchId: 'branch-1',
      categories: [{ id: 'empty-cat', name: 'Empty', products: [] }],
    });

    expect(view.categories).toEqual([{ id: 'empty-cat', name: 'Empty', sortOrder: 0 }]);
    expect(view.products).toEqual([]);
  });
});
