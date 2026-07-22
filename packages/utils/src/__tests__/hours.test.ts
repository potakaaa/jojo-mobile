import { describe, expect, it } from 'vitest';

import { getIsOpenNow } from '../hours';

/**
 * Boundary-instant unit suite for `getIsOpenNow`.
 *
 * Mirrors `packages/api/src/routes/lib/__tests__/deal-schedule.test.ts`'s
 * half-open-boundary block: exact instants are constructed and injected via the
 * function's own `now` parameter, so nothing races the wall clock.
 *
 * The closing-minute assertion below is what actually proves the
 * closed-branch-order-gate SPEC's AC5 ("no grace window") — mutating
 * `getIsOpenNow`'s `currentMinutes < closeMinutes` to `<=` turns exactly that
 * one assertion red and no other, which is the point of stating it separately
 * from the surrounding cases.
 *
 * All instants are UTC; branch-local time is UTC+8 (the function's default
 * `tzOffsetHours`), so `2026-07-20T01:00:00Z` reads as Monday 09:00 local.
 */

const t = (iso: string) => new Date(iso);

/** Monday 09:00–15:00 branch-local, every other day closed. */
const MON_9_TO_15 = JSON.stringify({
  mon: { open: '09:00', close: '15:00' },
});

describe('getIsOpenNow — closing-minute boundary (no grace window)', () => {
  it('is open one minute before close (Mon 14:59 local)', () => {
    expect(getIsOpenNow(MON_9_TO_15, t('2026-07-20T06:59:00Z'))).toBe(true);
  });

  it('is CLOSED at the exact closing minute (Mon 15:00 local) — close is exclusive', () => {
    expect(getIsOpenNow(MON_9_TO_15, t('2026-07-20T07:00:00Z'))).toBe(false);
  });

  it('is closed one minute after close (Mon 15:01 local)', () => {
    expect(getIsOpenNow(MON_9_TO_15, t('2026-07-20T07:01:00Z'))).toBe(false);
  });

  it('is open at the exact opening minute (Mon 09:00 local) — open is inclusive', () => {
    expect(getIsOpenNow(MON_9_TO_15, t('2026-07-20T01:00:00Z'))).toBe(true);
  });

  it('is closed one minute before open (Mon 08:59 local)', () => {
    expect(getIsOpenNow(MON_9_TO_15, t('2026-07-20T00:59:00Z'))).toBe(false);
  });
});

describe('getIsOpenNow — day-key resolution', () => {
  it('is closed on a day with no entry (Tue, same window object)', () => {
    // 2026-07-21T04:00:00Z -> Tue 12:00 local, mid-window if the day were open.
    expect(getIsOpenNow(MON_9_TO_15, t('2026-07-21T04:00:00Z'))).toBe(false);
  });

  it('resolves the day in BRANCH-LOCAL time, not UTC', () => {
    // Sun 23:00 UTC is already Mon 07:00 local — still before the 09:00 open,
    // but the day key must have advanced to `mon` for that to be the reason.
    expect(getIsOpenNow(MON_9_TO_15, t('2026-07-19T23:00:00Z'))).toBe(false);
    // Mon 16:30 UTC is Tue 00:30 local — past the local Monday entirely.
    expect(getIsOpenNow(MON_9_TO_15, t('2026-07-20T16:30:00Z'))).toBe(false);
  });
});

describe("getIsOpenNow — '00:00' close means end-of-day", () => {
  const ALL_DAY_MON = JSON.stringify({ mon: { open: '00:00', close: '00:00' } });

  it('reads an open 00:00 / close 00:00 day as open for the whole day', () => {
    expect(getIsOpenNow(ALL_DAY_MON, t('2026-07-19T16:00:00Z'))).toBe(true); // Mon 00:00 local
    expect(getIsOpenNow(ALL_DAY_MON, t('2026-07-20T04:00:00Z'))).toBe(true); // Mon 12:00 local
    expect(getIsOpenNow(ALL_DAY_MON, t('2026-07-20T15:59:00Z'))).toBe(true); // Mon 23:59 local
  });

  it('does not leak into the following day', () => {
    expect(getIsOpenNow(ALL_DAY_MON, t('2026-07-20T16:00:00Z'))).toBe(false); // Tue 00:00 local
  });
});

describe('getIsOpenNow — malformed input', () => {
  it('returns false (never throws) for a non-JSON opening_hours string', () => {
    expect(getIsOpenNow('08:00-20:00', t('2026-07-20T04:00:00Z'))).toBe(false);
  });

  it('returns false for a day entry missing open/close strings', () => {
    const broken = JSON.stringify({ mon: { open: '09:00' } });
    expect(getIsOpenNow(broken, t('2026-07-20T04:00:00Z'))).toBe(false);
  });

  it('returns false for an empty-range day (open === close, not 00:00)', () => {
    const neverOpen = JSON.stringify({ mon: { open: '23:59', close: '23:59' } });
    expect(getIsOpenNow(neverOpen, t('2026-07-20T15:59:00Z'))).toBe(false);
  });
});
