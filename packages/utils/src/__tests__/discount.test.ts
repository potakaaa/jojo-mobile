import type { Cart, CartItem, CartItemOption } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import {
  checkFreeBenefit,
  computeFreeUpgradeDiscountCents,
  computeRewardDiscountCents,
} from '../discount';

/**
 * Pure-unit tests for the ADM-008 Fix 6 (P2) free-mechanic discount engine —
 * `computeFreeUpgradeDiscountCents` + `checkFreeBenefit` (plus the reused
 * `computeRewardDiscountCents`, which `free_item` dispatches to verbatim). These
 * are the money-correctness ACs (AC2/AC5/AC6/AC7) at the pure level: exact cents,
 * multi-line `Math.min`, the one-unit-per-redemption rule, and the zero/negative
 * size-delta exclusions. `packages/utils`' first tests for `discount.ts`.
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

function option(overrides: Partial<CartItemOption> = {}): CartItemOption {
  return {
    id: `opt-${Math.random().toString(36).slice(2, 8)}`,
    optionType: 'size',
    name: 'Large',
    priceDeltaCents: 150,
    ...overrides,
  };
}

function line(overrides: Partial<CartItem> & Pick<CartItem, 'menuItemId'>): CartItem {
  return {
    lineId: `line-${overrides.menuItemId}`,
    quantity: 1,
    productNameSnapshot: 'Item',
    unitPriceCents: 500,
    selectedOptions: [],
    ...overrides,
  };
}

function cart(items: CartItem[]): Cart {
  return { id: 'test-cart', items, pickupBranchId: 'branch-1' };
}

// ─── computeFreeUpgradeDiscountCents ──────────────────────────────────────────

describe('computeFreeUpgradeDiscountCents', () => {
  it('waives a single positive size delta on the benefit line', () => {
    const c = cart([
      line({ menuItemId: 'p1', selectedOptions: [option({ priceDeltaCents: 150 })] }),
    ]);
    expect(computeFreeUpgradeDiscountCents('p1', c)).toBe(150);
  });

  it('sums multiple positive size deltas on one line', () => {
    const c = cart([
      line({
        menuItemId: 'p1',
        selectedOptions: [option({ priceDeltaCents: 100 }), option({ priceDeltaCents: 50 })],
      }),
    ]);
    expect(computeFreeUpgradeDiscountCents('p1', c)).toBe(150);
  });

  it('takes the Math.min across multiple qualifying lines (one unit per redemption)', () => {
    const c = cart([
      line({ lineId: 'l1', menuItemId: 'p1', selectedOptions: [option({ priceDeltaCents: 150 })] }),
      line({ lineId: 'l2', menuItemId: 'p1', selectedOptions: [option({ priceDeltaCents: 100 })] }),
    ]);
    expect(computeFreeUpgradeDiscountCents('p1', c)).toBe(100);
  });

  it('does not scale by quantity — one unit only', () => {
    const c = cart([
      line({
        menuItemId: 'p1',
        quantity: 3,
        selectedOptions: [option({ priceDeltaCents: 150 })],
      }),
    ]);
    expect(computeFreeUpgradeDiscountCents('p1', c)).toBe(150);
  });

  it('returns 0 when the benefit line has no size option', () => {
    const c = cart([line({ menuItemId: 'p1', selectedOptions: [] })]);
    expect(computeFreeUpgradeDiscountCents('p1', c)).toBe(0);
  });

  it('excludes zero and negative size deltas (never returns a negative)', () => {
    const c = cart([
      line({
        menuItemId: 'p1',
        selectedOptions: [option({ priceDeltaCents: 0 }), option({ priceDeltaCents: -200 })],
      }),
    ]);
    expect(computeFreeUpgradeDiscountCents('p1', c)).toBe(0);
  });

  // Mutation-killer (F7a): mixed-sign deltas on ONE line — a positive-filter removal
  // would sum +150 + -200 = -50 (or waive 0); the size>0 filter waives exactly 150.
  it('waives only the positive delta when a line mixes positive and negative size deltas', () => {
    const c = cart([
      line({
        menuItemId: 'p1',
        selectedOptions: [option({ priceDeltaCents: 150 }), option({ priceDeltaCents: -200 })],
      }),
    ]);
    expect(computeFreeUpgradeDiscountCents('p1', c)).toBe(150);
  });

  it('excludes non-size options (flavor / add_on) even with a positive delta', () => {
    const c = cart([
      line({
        menuItemId: 'p1',
        selectedOptions: [
          option({ optionType: 'add_on', name: 'Bacon', priceDeltaCents: 700 }),
          option({ optionType: 'flavor', name: 'BBQ', priceDeltaCents: 300 }),
        ],
      }),
    ]);
    expect(computeFreeUpgradeDiscountCents('p1', c)).toBe(0);
  });

  it('returns 0 when the benefit product is absent from the cart', () => {
    const c = cart([
      line({ menuItemId: 'other', selectedOptions: [option({ priceDeltaCents: 150 })] }),
    ]);
    expect(computeFreeUpgradeDiscountCents('p1', c)).toBe(0);
  });

  it('ignores non-benefit lines when picking the min', () => {
    const c = cart([
      line({ lineId: 'l1', menuItemId: 'p1', selectedOptions: [option({ priceDeltaCents: 250 })] }),
      line({
        lineId: 'l2',
        menuItemId: 'other',
        selectedOptions: [option({ priceDeltaCents: 10 })],
      }),
    ]);
    expect(computeFreeUpgradeDiscountCents('p1', c)).toBe(250);
  });
});

// ─── computeRewardDiscountCents (free_item math, reused verbatim) ─────────────

describe('computeRewardDiscountCents (free_item reuse)', () => {
  it('waives one cheapest matching unit price (NOT the cheapest cart line)', () => {
    const c = cart([
      line({ lineId: 'l1', menuItemId: 'p1', unitPriceCents: 500 }),
      line({ lineId: 'l2', menuItemId: 'cheap', unitPriceCents: 300 }),
    ]);
    // benefit is p1 (500), never the cheaper 300 line.
    expect(computeRewardDiscountCents('p1', c)).toBe(500);
  });

  it('returns the min across multiple benefit lines (one unit)', () => {
    const c = cart([
      line({ lineId: 'l1', menuItemId: 'p1', unitPriceCents: 650 }),
      line({ lineId: 'l2', menuItemId: 'p1', unitPriceCents: 500 }),
    ]);
    expect(computeRewardDiscountCents('p1', c)).toBe(500);
  });

  it('returns 0 when the product is absent', () => {
    expect(computeRewardDiscountCents('p1', cart([line({ menuItemId: 'other' })]))).toBe(0);
  });
});

// ─── checkFreeBenefit ─────────────────────────────────────────────────────────

describe('checkFreeBenefit', () => {
  it('free_item: eligible when the benefit product is in the cart', () => {
    const result = checkFreeBenefit('free_item', 'p1', cart([line({ menuItemId: 'p1' })]));
    expect(result).toEqual({ eligible: true });
  });

  it('free_item: not_in_cart when the benefit product is absent', () => {
    const result = checkFreeBenefit('free_item', 'p1', cart([line({ menuItemId: 'other' })]));
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('not_in_cart');
  });

  it('free_upgrade: eligible when the benefit line has a paid size upgrade', () => {
    const c = cart([
      line({ menuItemId: 'p1', selectedOptions: [option({ priceDeltaCents: 200 })] }),
    ]);
    expect(checkFreeBenefit('free_upgrade', 'p1', c)).toEqual({ eligible: true });
  });

  it('free_upgrade: no_upgrade_to_waive when present but no paid size upgrade', () => {
    const result = checkFreeBenefit('free_upgrade', 'p1', cart([line({ menuItemId: 'p1' })]));
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('no_upgrade_to_waive');
  });

  it('free_upgrade: not_in_cart takes precedence over no_upgrade_to_waive when absent', () => {
    const result = checkFreeBenefit('free_upgrade', 'p1', cart([line({ menuItemId: 'other' })]));
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('not_in_cart');
  });
});
