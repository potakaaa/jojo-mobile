import type { MenuItem } from '@jojopotato/types';
import { describe, expect, it, vi } from 'vitest';

import { MOCK_PRODUCTS } from '@/features/home/mock-home';
import { MOCK_ORDER_HISTORY } from '@/features/order-history/mock-order-history';
import { applyReorderPlan, buildReorderPlan } from '@/features/order-history/reorder';

function orderById(id: string) {
  const order = MOCK_ORDER_HISTORY.find((o) => o.id === id);
  if (!order) throw new Error(`fixture missing order ${id}`);
  return order;
}

function currentPrice(menuItemId: string): number {
  const p = MOCK_PRODUCTS.find((m) => m.id === menuItemId);
  if (!p) throw new Error(`fixture missing product ${menuItemId}`);
  return p.priceCents;
}

describe('buildReorderPlan', () => {
  it('AC6: re-prices available lines from the CURRENT catalog, not the historical snapshot', () => {
    const order = orderById('ord-1001'); // all-available, contains the price-drift line
    const plan = buildReorderPlan(order);

    const cheddar = plan.available.find((l) => l.originalItem.menuItemId === 'fries-cheddar');
    expect(cheddar).toBeDefined();

    // Historical snapshot price must differ from the current one (proves the fixture drift).
    const optionDeltas = cheddar!.originalItem.selectedOptions.reduce(
      (s, o) => s + o.priceDeltaCents,
      0,
    );
    const expectedCurrent = currentPrice('fries-cheddar') + optionDeltas;
    expect(cheddar!.originalItem.unitPriceCents).not.toBe(expectedCurrent);
    // Reorder must use the current price, not the snapshot.
    expect(cheddar!.currentUnitPriceCents).toBe(expectedCurrent);
    expect(cheddar!.isAvailable).toBe(true);
  });

  it('AC7: flags a now-unavailable line (nuggets-classic) as unavailable, not available', () => {
    const order = orderById('ord-1002'); // contains nuggets-classic (isAvailable:false)
    const plan = buildReorderPlan(order);

    const flagged = plan.unavailable.find((l) => l.originalItem.menuItemId === 'nuggets-classic');
    expect(flagged).toBeDefined();
    expect(flagged!.isAvailable).toBe(false);
    // It must NOT leak into the available bucket (never silently reorderable).
    expect(plan.available.some((l) => l.originalItem.menuItemId === 'nuggets-classic')).toBe(false);
    // The still-available line in the same order is bucketed correctly.
    expect(plan.available.some((l) => l.originalItem.menuItemId === 'fries-classic')).toBe(true);
  });

  it('AC9: reconstructs multi-option lines with every option intact', () => {
    const order = orderById('ord-1001');
    const plan = buildReorderPlan(order);

    const multi = plan.available.find((l) => l.originalItem.selectedOptions.length >= 2);
    expect(multi).toBeDefined();
    expect(multi!.originalItem.selectedOptions).toHaveLength(2);
    // Options are carried forward verbatim (id, name, optionType, delta).
    const ids = multi!.originalItem.selectedOptions.map((o) => o.id).sort();
    expect(ids).toEqual(['addon-bacon', 'size-large']);
    // Current price includes both option deltas on top of the current base.
    const base = currentPrice(multi!.originalItem.menuItemId);
    const deltas = multi!.originalItem.selectedOptions.reduce((s, o) => s + o.priceDeltaCents, 0);
    expect(multi!.currentUnitPriceCents).toBe(base + deltas);
  });
});

describe('applyReorderPlan', () => {
  it('sets the branch then re-adds only available lines via the supplied cart actions', () => {
    const order = orderById('ord-1002'); // 1 available + 1 unavailable
    const plan = buildReorderPlan(order);

    const setBranch = vi.fn();
    const addItem = vi.fn();
    applyReorderPlan(plan, order.branchId, { setBranch, addItem });

    expect(setBranch).toHaveBeenCalledWith(order.branchId);
    // Only the available line is added; the unavailable one is never added (D8).
    expect(addItem).toHaveBeenCalledTimes(plan.available.length);
    const addedMenuItems = addItem.mock.calls.map((c) => (c[0] as MenuItem).id);
    expect(addedMenuItems).toContain('fries-classic');
    expect(addedMenuItems).not.toContain('nuggets-classic');
  });

  it('passes the current MenuItem and carried-forward options+quantity to addItem', () => {
    const order = orderById('ord-1001');
    const plan = buildReorderPlan(order);
    const addItem = vi.fn();
    applyReorderPlan(plan, order.branchId, { setBranch: vi.fn(), addItem });

    const cheddarCall = addItem.mock.calls.find((c) => (c[0] as MenuItem).id === 'fries-cheddar');
    expect(cheddarCall).toBeDefined();
    const [menuItem, opts, qty] = cheddarCall!;
    expect((menuItem as MenuItem).priceCents).toBe(currentPrice('fries-cheddar'));
    expect(opts).toHaveLength(2);
    expect(qty).toBe(2);
  });
});
