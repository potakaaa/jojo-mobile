import type { PlaceOrderRequest } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import {
  buildOrderFromRequest,
  generateOrderNumber,
  validatePlaceOrderRequest,
} from '../mock-order';

function makeRequest(overrides: Partial<PlaceOrderRequest> = {}): PlaceOrderRequest {
  return {
    branchId: 'branch-bgc',
    items: [
      {
        menuItemId: 'fries-classic',
        productNameSnapshot: 'Classic Fries',
        quantity: 2,
        unitPriceCents: 9900,
        selectedOptions: [],
      },
      {
        menuItemId: 'fries-cheddar',
        productNameSnapshot: 'Cheddar Loaded Fries',
        quantity: 1,
        unitPriceCents: 14900,
        selectedOptions: [],
      },
    ],
    discountTotalCents: 0,
    paymentMethod: 'pay_at_branch',
    ...overrides,
  };
}

describe('generateOrderNumber', () => {
  it('matches the JP-XXXXXX display format', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOrderNumber()).toMatch(/^JP-[A-Z0-9]{6}$/);
    }
  });
});

describe('validatePlaceOrderRequest', () => {
  it('returns ok for a normal request at an open branch with available items', () => {
    expect(validatePlaceOrderRequest(makeRequest(), true, [])).toEqual({ ok: true });
  });

  it('returns branch_unavailable when the branch is not available (AC4)', () => {
    expect(validatePlaceOrderRequest(makeRequest(), false, [])).toEqual({
      ok: false,
      reason: 'branch_unavailable',
    });
  });

  it('returns branch_unavailable even when items are also unavailable (branch precedence)', () => {
    expect(validatePlaceOrderRequest(makeRequest(), false, ['fries-classic'])).toEqual({
      ok: false,
      reason: 'branch_unavailable',
    });
  });

  it('returns item_unavailable with the offending line ids (AC5)', () => {
    expect(validatePlaceOrderRequest(makeRequest(), true, ['fries-cheddar'])).toEqual({
      ok: false,
      reason: 'item_unavailable',
      unavailableLineIds: ['fries-cheddar'],
    });
  });

  it('flags every unavailable line when multiple products are out', () => {
    const result = validatePlaceOrderRequest(makeRequest(), true, [
      'fries-classic',
      'fries-cheddar',
    ]);
    expect(result).toEqual({
      ok: false,
      reason: 'item_unavailable',
      unavailableLineIds: ['fries-classic', 'fries-cheddar'],
    });
  });
});

describe('buildOrderFromRequest', () => {
  it('maps request items to snapshot-preserving order items (AC2)', () => {
    const req = makeRequest();
    const order = buildOrderFromRequest(req, 'JP-4F8B2C', '2026-07-13T10:30:00.000Z');

    expect(order.orderNumber).toBe('JP-4F8B2C');
    expect(order.branchId).toBe('branch-bgc');
    expect(order.status).toBe('pending');
    expect(order.paymentStatus).toBe('unpaid');
    expect(order.paymentMethod).toBe('pay_at_branch');
    expect(order.estimatedReadyAt).toBe('2026-07-13T10:30:00.000Z');

    expect(order.items).toHaveLength(2);
    expect(order.items[0]).toEqual({
      id: 'JP-4F8B2C-0',
      productId: 'fries-classic',
      productNameSnapshot: 'Classic Fries',
      quantity: 2,
      unitPriceCents: 9900,
      totalPriceCents: 19800,
      selectedOptions: [],
    });
  });

  it('computes subtotal/discount/total from the snapshot prices, not live state', () => {
    const req = makeRequest({ discountTotalCents: 5000 });
    const order = buildOrderFromRequest(req, 'JP-ABC123', '2026-07-13T10:30:00.000Z');

    // 9900*2 + 14900*1 = 34700
    expect(order.subtotalCents).toBe(34700);
    expect(order.discountTotalCents).toBe(5000);
    expect(order.totalCents).toBe(29700);
  });

  it('never lets the total go negative when discount exceeds subtotal', () => {
    const req = makeRequest({ discountTotalCents: 999999 });
    const order = buildOrderFromRequest(req, 'JP-ABC123', '2026-07-13T10:30:00.000Z');
    expect(order.totalCents).toBe(0);
  });

  it('round-trips a concrete non-pay_at_branch PaymentMethod (gcash) unchanged (P4)', () => {
    const req = makeRequest({ paymentMethod: 'gcash' });
    const order = buildOrderFromRequest(req, 'JP-GCASH1', '2026-07-13T10:30:00.000Z');
    expect(order.paymentMethod).toBe('gcash');
    // payment_status stays unpaid for every method — nothing is charged.
    expect(order.paymentStatus).toBe('unpaid');
  });
});
