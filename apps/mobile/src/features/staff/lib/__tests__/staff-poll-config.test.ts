import { describe, expect, it } from 'vitest';

import { STAFF_ORDERS_POLL_INTERVAL, STAFF_POLL_OPTIONS } from '../staff-poll-config';

/**
 * AC-1/AC-2 — the shared staff-order poll convention value.
 *
 * `STAFF_POLL_OPTIONS` is spread into Active Orders, Order Detail, and Completed
 * Orders `useQuery` calls. Pinning its exact shape here guarantees all three
 * screens poll on the same 10s cadence and pause in the background — they cannot
 * silently drift apart, since they share this one constant.
 */
describe('staff poll config', () => {
  it('STAFF_ORDERS_POLL_INTERVAL is 10s', () => {
    expect(STAFF_ORDERS_POLL_INTERVAL).toBe(10_000);
  });

  it('STAFF_POLL_OPTIONS is the shared 10s + background-pause convention', () => {
    expect(STAFF_POLL_OPTIONS).toEqual({
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
    });
  });

  it('STAFF_POLL_OPTIONS.refetchInterval matches the exported interval constant', () => {
    expect(STAFF_POLL_OPTIONS.refetchInterval).toBe(STAFF_ORDERS_POLL_INTERVAL);
  });
});
