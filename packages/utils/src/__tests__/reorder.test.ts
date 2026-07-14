import type {
  MenuResponse,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  SelectedOption,
} from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { reconcileReorder, reorderEligibility } from '../reorder';

// --- Fixtures -------------------------------------------------------------

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    basePriceCents: 1000,
    options: { size: [], flavor: [], add_on: [] },
    ...overrides,
  };
}

function menu(products: Product[]): MenuResponse {
  return { branchId: 'b1', categories: [{ id: 'c1', name: 'All', products }] };
}

function orderItem(
  overrides: Partial<OrderItem> & Pick<OrderItem, 'productId' | 'productName'>,
): OrderItem {
  return {
    quantity: 1,
    unitPriceCents: 999,
    totalPriceCents: 999,
    selectedOptions: [],
    ...overrides,
  };
}

function order(items: OrderItem[], status: OrderStatus = 'completed'): Order {
  return {
    id: 'o1',
    orderNumber: 'JP-260713-0001',
    branchId: 'b1',
    status,
    subtotalCents: 0,
    discountTotalCents: 0,
    totalCents: 0,
    paymentMethod: 'pay_at_branch',
    paymentStatus: 'unpaid',
    estimatedReadyAt: '2026-07-13T00:00:00Z',
    placedAt: '2026-07-13T00:00:00Z',
    items,
  };
}

// --- reorderEligibility ---------------------------------------------------

describe('reorderEligibility', () => {
  it('is true for completed and cancelled, false for the other 5 statuses', () => {
    expect(reorderEligibility('completed')).toBe(true);
    expect(reorderEligibility('cancelled')).toBe(true);
    for (const status of [
      'pending',
      'accepted',
      'preparing',
      'flavoring',
      'ready',
    ] as OrderStatus[]) {
      expect(reorderEligibility(status)).toBe(false);
    }
  });
});

// --- reconcileReorder -----------------------------------------------------

describe('reconcileReorder', () => {
  it('prices available lines from CURRENT basePriceCents/priceDeltaCents, not historical unitPriceCents', () => {
    const currentMenu = menu([
      product({
        id: 'p1',
        name: 'Fries',
        basePriceCents: 1500, // today's price (historical was 999)
        options: {
          size: [{ optionId: 's-lg', optionType: 'size', name: 'Large', priceDeltaCents: 300 }],
          flavor: [],
          add_on: [],
        },
      }),
    ]);
    const past = order([
      orderItem({
        productId: 'p1',
        productName: 'Fries',
        unitPriceCents: 999, // stale snapshot — must NOT be used
        quantity: 2,
        selectedOptions: [
          { optionId: 's-lg', optionType: 'size', name: 'Large', priceDeltaCents: 100 }, // stale delta
        ],
      }),
    ]);

    const { available, unavailable } = reconcileReorder(past, currentMenu);

    expect(unavailable).toHaveLength(0);
    expect(available).toHaveLength(1);
    const line = available[0]!;
    expect(line.product.basePriceCents).toBe(1500); // current, not 999
    expect(line.quantity).toBe(2); // carried
    expect(line.optionsForCart[0]!.priceDeltaCents).toBe(300); // current, not stale 100
    expect(line.optionsForCart[0]!.id).toBe('s-lg');
  });

  it('flags a product absent from the current menu tree as product_unavailable', () => {
    const currentMenu = menu([product({ id: 'p-other', name: 'Nuggets' })]);
    const past = order([orderItem({ productId: 'p-gone', productName: 'Discontinued Dip' })]);

    const { available, unavailable } = reconcileReorder(past, currentMenu);

    expect(available).toHaveLength(0);
    expect(unavailable).toEqual([
      { productName: 'Discontinued Dip', reason: 'product_unavailable' },
    ]);
  });

  it('flags a line whose selected optionId is gone as option_unavailable, never silently simplified', () => {
    const currentMenu = menu([
      product({
        id: 'p1',
        name: 'Fries',
        options: {
          size: [{ optionId: 's-sm', optionType: 'size', name: 'Small', priceDeltaCents: 0 }],
          flavor: [{ optionId: 'f-bbq', optionType: 'flavor', name: 'BBQ', priceDeltaCents: 0 }],
          add_on: [],
        },
      }),
    ]);
    const selectedOptions: SelectedOption[] = [
      { optionId: 's-sm', optionType: 'size', name: 'Small', priceDeltaCents: 0 },
      { optionId: 'f-cheese', optionType: 'flavor', name: 'Cheese', priceDeltaCents: 0 }, // gone
    ];
    const past = order([orderItem({ productId: 'p1', productName: 'Fries', selectedOptions })]);

    const { available, unavailable } = reconcileReorder(past, currentMenu);

    expect(available).toHaveLength(0);
    expect(unavailable).toEqual([{ productName: 'Fries', reason: 'option_unavailable' }]);
  });

  it('carries a fully-available multi-option line intact with options mapped from the current menu', () => {
    const currentMenu = menu([
      product({
        id: 'p1',
        name: 'Loaded Fries',
        basePriceCents: 2000,
        options: {
          size: [{ optionId: 's-lg', optionType: 'size', name: 'Large', priceDeltaCents: 500 }],
          flavor: [{ optionId: 'f-bbq', optionType: 'flavor', name: 'BBQ', priceDeltaCents: 0 }],
          add_on: [
            { optionId: 'a-bacon', optionType: 'add_on', name: 'Bacon', priceDeltaCents: 700 },
          ],
        },
      }),
    ]);
    const selectedOptions: SelectedOption[] = [
      { optionId: 's-lg', optionType: 'size', name: 'Large', priceDeltaCents: 400 },
      { optionId: 'f-bbq', optionType: 'flavor', name: 'BBQ', priceDeltaCents: 0 },
      { optionId: 'a-bacon', optionType: 'add_on', name: 'Bacon', priceDeltaCents: 600 },
    ];
    const past = order([
      orderItem({ productId: 'p1', productName: 'Loaded Fries', quantity: 3, selectedOptions }),
    ]);

    const { available, unavailable } = reconcileReorder(past, currentMenu);

    expect(unavailable).toHaveLength(0);
    expect(available).toHaveLength(1);
    const line = available[0]!;
    expect(line.quantity).toBe(3);
    expect(line.optionsForCart).toHaveLength(3); // all 3 carried, none dropped
    expect(line.optionsForCart.map((o) => o.id).sort()).toEqual(['a-bacon', 'f-bbq', 's-lg']);
    // current deltas, not stale
    expect(line.optionsForCart.find((o) => o.id === 's-lg')!.priceDeltaCents).toBe(500);
    expect(line.optionsForCart.find((o) => o.id === 'a-bacon')!.priceDeltaCents).toBe(700);
  });

  it('partitions a mixed order into available and unavailable lines', () => {
    const currentMenu = menu([product({ id: 'p1', name: 'Fries' })]);
    const past = order([
      orderItem({ productId: 'p1', productName: 'Fries' }),
      orderItem({ productId: 'p-gone', productName: 'Gone Item' }),
    ]);

    const { available, unavailable } = reconcileReorder(past, currentMenu);

    expect(available.map((l) => l.product.id)).toEqual(['p1']);
    expect(unavailable).toEqual([{ productName: 'Gone Item', reason: 'product_unavailable' }]);
  });
});
