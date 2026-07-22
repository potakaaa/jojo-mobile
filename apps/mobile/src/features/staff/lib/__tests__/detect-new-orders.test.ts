import type { StaffOrderSummary } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { detectNewOrders } from '../detect-new-orders';

/** Build a `StaffOrderSummary` with only the fields this diff reads (`id`). */
function order(id: string, status: StaffOrderSummary['status'] = 'pending'): StaffOrderSummary {
  return {
    id,
    orderNumber: `JP-${id}`,
    status,
    placedAt: '2026-07-22T00:00:00.000Z',
    totalCents: 9900,
    itemSummary: '1× Loaded Fries',
  };
}

describe('detectNewOrders', () => {
  it('returns [] on the first poll (prev === undefined) — the baseline, AC-6', () => {
    expect(detectNewOrders(undefined, [order('1'), order('2')])).toEqual([]);
  });

  it('returns an id present in next but not prev', () => {
    expect(detectNewOrders([order('1')], [order('1'), order('2')])).toEqual(['2']);
  });

  it('returns [] when the id set is unchanged', () => {
    expect(detectNewOrders([order('1'), order('2')], [order('2'), order('1')])).toEqual([]);
  });

  it('returns [] for a status-only change of an existing id (no repeat toast, AC-7)', () => {
    expect(detectNewOrders([order('1', 'pending')], [order('1', 'preparing')])).toEqual([]);
  });

  it('returns every genuinely-new id when several arrive at once', () => {
    expect(detectNewOrders([order('1')], [order('1'), order('2'), order('3')])).toEqual(['2', '3']);
  });

  it('returns [] when next is empty', () => {
    expect(detectNewOrders([order('1')], [])).toEqual([]);
  });
});
