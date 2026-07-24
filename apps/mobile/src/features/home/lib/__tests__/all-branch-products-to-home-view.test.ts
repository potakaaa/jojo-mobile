import type { MenuResponse, Product } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { flattenAllBranchProducts } from '../all-branch-products-to-home-view';
import { filterProductsByCategory } from '../filter-products-by-category';

/**
 * home-all-branches AC1/AC4/AC10 — flattening the all-branch catalog into the
 * Home grid's view model.
 *
 * Non-vacuous by construction: a passthrough implementation drops `branches`
 * (fails the threading cases), a naive concat duplicates the repeated product
 * (fails the dedup case), and dropping the empty-`branches` product fails AC4.
 */
function product(id: string, over: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    basePriceCents: 1000,
    options: { size: [], flavor: [], add_on: [] },
    branches: [],
    ...over,
  };
}

function menu(categories: MenuResponse['categories']): MenuResponse {
  return { categories };
}

describe('flattenAllBranchProducts', () => {
  it("threads each product's carrying branches onto its MenuItem", () => {
    const view = flattenAllBranchProducts(
      menu([
        {
          id: 'c1',
          name: 'Fries',
          products: [
            product('p1', {
              branches: [
                { id: 'b1', name: 'Cogon' },
                { id: 'b2', name: 'Centrio' },
              ],
            }),
          ],
        },
      ]),
    );

    expect(view.products[0]!.branches).toEqual([
      { id: 'b1', name: 'Cogon' },
      { id: 'b2', name: 'Centrio' },
    ]);
  });

  // AC1 — one card per product, never one per branch or per repeated appearance.
  it('emits ONE MenuItem per distinct product id even if the id repeats', () => {
    const view = flattenAllBranchProducts(
      menu([
        {
          id: 'c1',
          name: 'Fries',
          products: [product('p1', { branches: [{ id: 'b1', name: 'Cogon' }] }), product('p2')],
        },
        {
          id: 'c2',
          name: 'Drinks',
          // Same product id appearing a second time must NOT produce a second card.
          products: [product('p1', { branches: [{ id: 'b2', name: 'Centrio' }] })],
        },
      ]),
    );

    expect(view.products.map((p) => p.id)).toEqual(['p1', 'p2']);
    // First occurrence wins, so the card keeps its original category + branches.
    expect(view.products[0]!.categoryId).toBe('c1');
    expect(view.products[0]!.branches).toEqual([{ id: 'b1', name: 'Cogon' }]);
  });

  // AC4 — a product no branch carries is still a card. It just has no subtext.
  it('keeps a product whose branches array is empty', () => {
    const view = flattenAllBranchProducts(
      menu([{ id: 'c1', name: 'Fries', products: [product('p1', { branches: [] })] }]),
    );

    expect(view.products.map((p) => p.id)).toEqual(['p1']);
    expect(view.products[0]!.branches).toEqual([]);
  });

  it('tolerates a product with no branches field at all', () => {
    const bare = product('p1');
    delete bare.branches;

    const view = flattenAllBranchProducts(menu([{ id: 'c1', name: 'Fries', products: [bare] }]));

    expect(view.products).toHaveLength(1);
    expect(view.products[0]!.branches).toBeUndefined();
  });

  it('maps categories in tree order with an ascending sortOrder', () => {
    const view = flattenAllBranchProducts(
      menu([
        { id: 'c1', name: 'Fries', products: [product('p1')] },
        { id: 'c2', name: 'Drinks', products: [product('p2')] },
      ]),
    );

    expect(view.categories).toEqual([
      { id: 'c1', name: 'Fries', sortOrder: 0 },
      { id: 'c2', name: 'Drinks', sortOrder: 1 },
    ]);
  });

  it('renames basePriceCents to priceCents without changing the value', () => {
    const view = flattenAllBranchProducts(
      menu([{ id: 'c1', name: 'Fries', products: [product('p1', { basePriceCents: 12345 })] }]),
    );

    expect(view.products[0]!.priceCents).toBe(12345);
  });

  it('returns an empty view for an empty catalog', () => {
    expect(flattenAllBranchProducts(menu([]))).toEqual({ categories: [], products: [] });
  });

  // AC4, stated as the real screen condition: the SELECTED branch carries nothing
  // (it appears in no product's `branches[]`) yet the grid is still populated.
  it('still yields products when the selected branch carries none of them', () => {
    const view = flattenAllBranchProducts(
      menu([
        {
          id: 'c1',
          name: 'Fries',
          products: [
            product('p1', { branches: [{ id: 'b2', name: 'Centrio' }] }),
            product('p2', { branches: [{ id: 'b3', name: 'Limketkai' }] }),
          ],
        },
      ]),
    );

    const selectedBranchId = 'b1'; // stocks nothing
    expect(view.products.some((p) => p.branches?.some((b) => b.id === selectedBranchId))).toBe(
      false,
    );
    // ...and yet there is a full grid to render.
    expect(view.products).toHaveLength(2);
  });

  // AC10 — the category filter operates on the MERGED list unchanged.
  it('produces a list the existing category filter still narrows correctly', () => {
    const view = flattenAllBranchProducts(
      menu([
        { id: 'c1', name: 'Fries', products: [product('p1'), product('p2')] },
        { id: 'c2', name: 'Drinks', products: [product('p3')] },
      ]),
    );

    expect(filterProductsByCategory(view.products, 'c2').map((p) => p.id)).toEqual(['p3']);
    expect(filterProductsByCategory(view.products, null)).toHaveLength(3);
  });
});
