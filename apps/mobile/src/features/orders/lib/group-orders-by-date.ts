import type { Order } from '@jojopotato/types';

/** One date bucket of orders, ready to feed a `SectionList`. */
export interface OrderDateSection {
  /** Human bucket label, e.g. `"Today"`. */
  title: string;
  data: Order[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight (local) of the given date, as epoch ms. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Whole-calendar-day distance between `iso` and `now` (0 = same day, 1 =
 * yesterday, ...). Uses local midnights so a 9pm→7am gap still counts as one
 * day, matching how people read dates.
 */
function calendarDaysAgo(iso: string, now: Date): number {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((startOfLocalDay(now) - startOfLocalDay(then)) / MS_PER_DAY);
}

/** The bucket label an order falls into relative to `now`. */
function bucketFor(iso: string, now: Date): string {
  const days = calendarDaysAgo(iso, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This Week';
  return 'Earlier';
}

// Fixed display order; empty buckets are dropped before returning.
const BUCKET_ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'] as const;

/**
 * Group orders (assumed already newest-first) into date buckets for the Order
 * History `SectionList`. `now` is injectable so the bucketing is pure and
 * unit-testable. Every input order lands in exactly one bucket; input order is
 * preserved within each bucket; empty buckets are omitted.
 */
export function groupOrdersByDate(orders: Order[], now: Date = new Date()): OrderDateSection[] {
  const byBucket = new Map<string, Order[]>();
  for (const order of orders) {
    const key = bucketFor(order.placedAt, now);
    const list = byBucket.get(key);
    if (list) list.push(order);
    else byBucket.set(key, [order]);
  }

  return BUCKET_ORDER.filter((title) => byBucket.has(title)).map((title) => ({
    title,
    data: byBucket.get(title) ?? [],
  }));
}

/**
 * A friendly per-order timestamp that complements the section header: the
 * time-of-day for recent orders (the header already says the day), a weekday
 * for the rest of the week, and a short date for older orders.
 */
export function formatOrderTimestamp(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = calendarDaysAgo(iso, now);
  if (days <= 1) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(
    [],
    sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  );
}
