import type { ProductOption } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { getRequiredOptionTypes, isRequiredSelectionComplete } from '../product-options';

function opt(partial: Partial<ProductOption> & Pick<ProductOption, 'optionType'>): ProductOption {
  return {
    id: `${partial.optionType}-${partial.name ?? 'x'}`,
    productId: 'p1',
    name: partial.name ?? 'Option',
    priceDelta: partial.priceDelta ?? 0,
    isActive: partial.isActive ?? true,
    sortOrder: partial.sortOrder ?? 0,
    ...partial,
  };
}

const FLAVOR_ONLY: ProductOption[] = [
  opt({ optionType: 'flavor', name: 'Classic' }),
  opt({ optionType: 'flavor', name: 'Cheese-filled', priceDelta: 15 }),
];

const SIZE_AND_FLAVOR: ProductOption[] = [
  opt({ optionType: 'size', name: 'Regular' }),
  opt({ optionType: 'size', name: 'Large', priceDelta: 20 }),
  opt({ optionType: 'flavor', name: 'Original' }),
  opt({ optionType: 'flavor', name: 'Strawberry', priceDelta: 15 }),
];

const ADD_ON_ONLY: ProductOption[] = [
  opt({ optionType: 'add_on', name: 'Extra Cheese', priceDelta: 20 }),
];

describe('getRequiredOptionTypes (AC8)', () => {
  it('flavor-required product', () => {
    expect(getRequiredOptionTypes(FLAVOR_ONLY)).toEqual(['flavor']);
  });

  it('size + flavor required product', () => {
    expect(getRequiredOptionTypes(SIZE_AND_FLAVOR).sort()).toEqual(['flavor', 'size']);
  });

  it('add-on-only product requires nothing', () => {
    expect(getRequiredOptionTypes(ADD_ON_ONLY)).toEqual([]);
  });

  it('ignores inactive options when deciding required groups', () => {
    const inactiveFlavor = [opt({ optionType: 'flavor', name: 'Gone', isActive: false })];
    expect(getRequiredOptionTypes(inactiveFlavor)).toEqual([]);
  });
});

describe('isRequiredSelectionComplete (AC8/AC9)', () => {
  it('incomplete when a required flavor is unselected', () => {
    expect(isRequiredSelectionComplete(FLAVOR_ONLY, {})).toBe(false);
  });

  it('complete when the required flavor is selected', () => {
    expect(isRequiredSelectionComplete(FLAVOR_ONLY, { flavor: 'flavor-Classic' })).toBe(true);
  });

  it('incomplete when only one of two required groups is filled', () => {
    expect(isRequiredSelectionComplete(SIZE_AND_FLAVOR, { size: 'size-Regular' })).toBe(false);
  });

  it('complete when both required groups are filled', () => {
    expect(
      isRequiredSelectionComplete(SIZE_AND_FLAVOR, {
        size: 'size-Regular',
        flavor: 'flavor-Original',
      }),
    ).toBe(true);
  });

  it('add-on-only product is always complete', () => {
    expect(isRequiredSelectionComplete(ADD_ON_ONLY, {})).toBe(true);
  });

  it('treats an empty-string selection as unselected', () => {
    expect(isRequiredSelectionComplete(FLAVOR_ONLY, { flavor: '' })).toBe(false);
  });
});
