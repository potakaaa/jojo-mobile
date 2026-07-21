import { describe, expect, it } from 'vitest';

import { isWithinQuietHours, QUIET_END_HOUR, QUIET_START_HOUR } from '../marketing-quiet-hours';

/**
 * Pure unit coverage for the quiet-hours predicate (PUSH-005, AC11 math). Manila
 * is a fixed +08:00 offset, so a UTC instant's Manila local hour is
 * `(UTC hour + 8) mod 24`. Quiet = Manila hour ≥ 21 OR < 8.
 *
 * Each case picks a UTC time whose Manila-local hour is exactly the value under
 * test (comment shows the Manila hour), so the assertion is unambiguous.
 */
describe('isWithinQuietHours (Manila +08:00)', () => {
  it('exports the documented window boundaries', () => {
    expect(QUIET_START_HOUR).toBe(21);
    expect(QUIET_END_HOUR).toBe(8);
  });

  it('is NOT quiet during the day (Manila 12:00)', () => {
    // UTC 04:00 → Manila 12:00
    expect(isWithinQuietHours(new Date('2026-06-15T04:00:00.000Z'))).toBe(false);
  });

  it('is NOT quiet at 20:59 Manila (just before the window opens)', () => {
    // UTC 12:59 → Manila 20:59
    expect(isWithinQuietHours(new Date('2026-06-15T12:59:00.000Z'))).toBe(false);
  });

  it('IS quiet at exactly 21:00 Manila (window opens, inclusive)', () => {
    // UTC 13:00 → Manila 21:00
    expect(isWithinQuietHours(new Date('2026-06-15T13:00:00.000Z'))).toBe(true);
  });

  it('IS quiet at 22:00 Manila', () => {
    // UTC 14:00 → Manila 22:00
    expect(isWithinQuietHours(new Date('2026-06-15T14:00:00.000Z'))).toBe(true);
  });

  it('IS quiet at 00:00 Manila (past midnight)', () => {
    // UTC 16:00 → Manila 00:00 next day
    expect(isWithinQuietHours(new Date('2026-06-15T16:00:00.000Z'))).toBe(true);
  });

  it('IS quiet at 07:00 Manila (just before the window closes)', () => {
    // UTC 23:00 → Manila 07:00 next day
    expect(isWithinQuietHours(new Date('2026-06-15T23:00:00.000Z'))).toBe(true);
  });

  it('is NOT quiet at exactly 08:00 Manila (window closes, exclusive)', () => {
    // UTC 00:00 → Manila 08:00
    expect(isWithinQuietHours(new Date('2026-06-15T00:00:00.000Z'))).toBe(false);
  });
});
