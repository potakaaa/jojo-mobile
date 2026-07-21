import type { Order } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { formatOrderTimestamp, groupOrdersByDate } from './group-orders-by-date';

const NOW = new Date('2026-07-21T15:00:00'); // a Tuesday afternoon (local)

/** Minimal Order fixture — only `id` and `placedAt` matter to the grouping. */
function makeOrder(id: string, placedAt: string): Order {
  return {
    id,
    orderNumber: `JP-${id}`,
    branchId: 'b1',
    items: [],
    status: 'completed',
    subtotalCents: 0,
    discountTotalCents: 0,
    totalCents: 0,
    paymentMethod: 'pay_at_branch',
    paymentStatus: 'unpaid',
    estimatedReadyAt: null,
    placedAt,
    dealId: null,
  };
}

describe('groupOrdersByDate', () => {
  it('buckets orders into Today / Yesterday / This Week / Earlier', () => {
    const orders = [
      makeOrder('today', '2026-07-21T09:00:00'),
      makeOrder('yesterday', '2026-07-20T20:00:00'),
      makeOrder('thisWeek', '2026-07-17T12:00:00'),
      makeOrder('earlier', '2026-06-30T12:00:00'),
    ];

    const sections = groupOrdersByDate(orders, NOW);

    expect(sections.map((s) => s.title)).toEqual(['Today', 'Yesterday', 'This Week', 'Earlier']);
    expect(sections.map((s) => s.data.map((o) => o.id))).toEqual([
      ['today'],
      ['yesterday'],
      ['thisWeek'],
      ['earlier'],
    ]);
  });

  it('treats a late-night order as "Today" by calendar day, not 24h', () => {
    const sections = groupOrdersByDate([makeOrder('a', '2026-07-21T00:30:00')], NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Today');
  });

  it('omits empty buckets and preserves input order within a bucket', () => {
    const orders = [makeOrder('t1', '2026-07-21T14:00:00'), makeOrder('t2', '2026-07-21T08:00:00')];
    const sections = groupOrdersByDate(orders, NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Today');
    expect(sections[0]?.data.map((o) => o.id)).toEqual(['t1', 't2']);
  });

  it('loses no order — every input lands in exactly one bucket', () => {
    const orders = Array.from({ length: 20 }, (_, i) =>
      makeOrder(String(i), new Date(NOW.getTime() - i * 36 * 60 * 60 * 1000).toISOString()),
    );
    const sections = groupOrdersByDate(orders, NOW);
    const total = sections.reduce((n, s) => n + s.data.length, 0);
    expect(total).toBe(orders.length);
  });

  it('returns an empty array for no orders', () => {
    expect(groupOrdersByDate([], NOW)).toEqual([]);
  });
});

describe('formatOrderTimestamp', () => {
  it('shows a weekday for earlier-this-week orders', () => {
    expect(formatOrderTimestamp('2026-07-17T12:00:00', NOW)).toBe('Friday');
  });

  it('shows a short date for older same-year orders', () => {
    expect(formatOrderTimestamp('2026-06-30T12:00:00', NOW)).toBe('Jun 30');
  });

  it('includes the year for a different-year order', () => {
    expect(formatOrderTimestamp('2025-12-01T12:00:00', NOW)).toBe('Dec 1, 2025');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(formatOrderTimestamp('not-a-date', NOW)).toBe('');
  });
});
