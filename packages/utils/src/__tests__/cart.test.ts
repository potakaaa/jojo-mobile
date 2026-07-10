import type { CartSelectedOption, Product } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { buildCartItemSnapshot, cartReducer, initialCartState } from '../cart';

function makeProduct(): Product {
  return {
    id: 'prod-1',
    categoryId: 'cat-1',
    name: 'Classic Fries',
    slug: 'classic-fries',
    description: 'Crispy',
    imageUrl: null,
    basePrice: 89,
    isActive: true,
    isRewardEligible: true,
  };
}

describe('cartReducer (AC10)', () => {
  it('appends an added item', () => {
    const product = makeProduct();
    const item = buildCartItemSnapshot(product, [], 89);
    const next = cartReducer(initialCartState, { type: 'ADD_ITEM', item });
    expect(next.items).toHaveLength(1);
    expect(next.items[0]).toBe(item);
  });

  it('does not mutate the previous state (immutable update)', () => {
    const product = makeProduct();
    const item = buildCartItemSnapshot(product, [], 89);
    cartReducer(initialCartState, { type: 'ADD_ITEM', item });
    expect(initialCartState.items).toHaveLength(0);
  });
});

describe('buildCartItemSnapshot immutability (AC10)', () => {
  it('is immune to later mutation of the source product', () => {
    const product = makeProduct();
    const item = buildCartItemSnapshot(product, [], 89);

    // Mutate the source product AFTER the snapshot was taken.
    product.name = 'Mutated Name';
    product.basePrice = 999;

    expect(item.name).toBe('Classic Fries');
    expect(item.basePrice).toBe(89);
    expect(item.unitPrice).toBe(89);
  });

  it('is immune to later mutation of the selected options array/objects', () => {
    const product = makeProduct();
    const options: CartSelectedOption[] = [
      { optionId: 'o1', optionType: 'size', name: 'Large', priceDelta: 30 },
    ];
    const item = buildCartItemSnapshot(product, options, 119);

    // Mutate the source option object and array after add.
    options[0]!.name = 'Small';
    options[0]!.priceDelta = 0;
    options.push({ optionId: 'o2', optionType: 'add_on', name: 'Cheese', priceDelta: 20 });

    expect(item.selectedOptions).toHaveLength(1);
    expect(item.selectedOptions[0]!.name).toBe('Large');
    expect(item.selectedOptions[0]!.priceDelta).toBe(30);
    expect(item.unitPrice).toBe(119);
  });

  it('assigns distinct line ids to repeated adds of the same product', () => {
    const product = makeProduct();
    const a = buildCartItemSnapshot(product, [], 89);
    const b = buildCartItemSnapshot(product, [], 89);
    expect(a.id).not.toBe(b.id);
  });
});
