import { describe, expect, it } from 'vitest';

import { manilaDateRangeToUtc, parseManilaDate } from '../analytics-range';

/**
 * Direct unit tests for the pure Manila-boundary range helper (ADM-007, checklist
 * 2b / Execute-Agent Instruction E3). No DB — this pins the timezone math in
 * isolation, so a boundary regression localizes here rather than only surfacing
 * through the DB-backed AC5 integration fixture.
 */

describe('parseManilaDate', () => {
  it('maps a Manila calendar date to its UTC midnight instant (−8h)', () => {
    expect(parseManilaDate('2026-07-17')!.toISOString()).toBe('2026-07-16T16:00:00.000Z');
  });

  it('handles a month/year boundary', () => {
    // 2026-01-01 Manila midnight = 2025-12-31T16:00Z.
    expect(parseManilaDate('2026-01-01')!.toISOString()).toBe('2025-12-31T16:00:00.000Z');
  });

  it('rejects a malformed string', () => {
    expect(parseManilaDate('2026-7-1')).toBeNull();
    expect(parseManilaDate('not-a-date')).toBeNull();
    expect(parseManilaDate('2026-07-17T00:00:00Z')).toBeNull();
  });

  it('rejects an impossible calendar date (no silent rollover)', () => {
    expect(parseManilaDate('2026-02-30')).toBeNull();
    expect(parseManilaDate('2026-13-01')).toBeNull();
    expect(parseManilaDate('2026-00-10')).toBeNull();
  });
});

describe('manilaDateRangeToUtc', () => {
  it('returns the half-open [from, to+1day) UTC interval', () => {
    const range = manilaDateRangeToUtc('2026-07-17', '2026-07-17')!;
    expect(range.lower.toISOString()).toBe('2026-07-16T16:00:00.000Z');
    // upper = (2026-07-17 + 1 day) Manila midnight = 2026-07-17T16:00Z.
    expect(range.upper.toISOString()).toBe('2026-07-17T16:00:00.000Z');
  });

  it('includes 23:30 Manila on the last day and excludes 00:30 the next day', () => {
    const range = manilaDateRangeToUtc('2026-07-10', '2026-07-17')!;
    // 23:30 Manila on 2026-07-17 = 15:30 UTC — strictly before upper (16:00 UTC).
    const lastDay2330Utc = new Date('2026-07-17T15:30:00.000Z');
    expect(lastDay2330Utc.getTime()).toBeLessThan(range.upper.getTime());
    // 00:30 Manila on 2026-07-18 = 16:30 UTC — at/after upper.
    const nextDay0030Utc = new Date('2026-07-17T16:30:00.000Z');
    expect(nextDay0030Utc.getTime()).toBeGreaterThanOrEqual(range.upper.getTime());
  });

  it('returns null when either endpoint is invalid', () => {
    expect(manilaDateRangeToUtc('2026-02-30', '2026-07-17')).toBeNull();
    expect(manilaDateRangeToUtc('2026-07-17', 'bad')).toBeNull();
  });
});
