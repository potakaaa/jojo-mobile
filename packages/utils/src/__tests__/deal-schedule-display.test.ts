import type { DealScheduleWindow } from '@jojopotato/types';
import { describe, expect, it } from 'vitest';

import { formatDealScheduleSummary } from '../deal-schedule-display';

/** A recurring window (Manila wall-clock days/times, no absolute bounds). */
function recur(days: number[], start: string, end: string): DealScheduleWindow {
  return {
    startsAt: null,
    endsAt: null,
    recurDays: days,
    recurStartTime: start,
    recurEndTime: end,
  };
}

/** An absolute-only window (real UTC instants, no recurrence). */
function absolute(endsAt: string | null, startsAt: string | null = null): DealScheduleWindow {
  return {
    startsAt,
    endsAt,
    recurDays: null,
    recurStartTime: null,
    recurEndTime: null,
  };
}

describe('formatDealScheduleSummary', () => {
  // (a) — AC3 at the formatter layer.
  it('returns undefined for undefined or empty input', () => {
    expect(formatDealScheduleSummary(undefined)).toBeUndefined();
    expect(formatDealScheduleSummary([])).toBeUndefined();
  });

  // (b) — AC1 consecutive-day grouping.
  it('collapses consecutive recurring days into a range (Mon–Fri)', () => {
    expect(formatDealScheduleSummary([recur([1, 2, 3, 4, 5], '08:00', '20:25')])).toBe(
      'Available Mon–Fri, 8:00 AM – 8:25 PM',
    );
  });

  // (c) — AC1 non-consecutive fallback.
  it('joins non-consecutive recurring days with commas (Mon, Wed, Fri)', () => {
    expect(formatDealScheduleSummary([recur([1, 3, 5], '09:00', '17:00')])).toBe(
      'Available Mon, Wed, Fri, 9:00 AM – 5:00 PM',
    );
  });

  // (d) — AC1 single day.
  it('renders a single recurring day with no range dash', () => {
    expect(formatDealScheduleSummary([recur([3], '10:00', '14:00')])).toBe(
      'Available Wed, 10:00 AM – 2:00 PM',
    );
  });

  // (e) — AC1 all seven days.
  it('collapses all seven days into Sun–Sat', () => {
    expect(formatDealScheduleSummary([recur([0, 1, 2, 3, 4, 5, 6], '06:00', '23:00')])).toBe(
      'Available Sun–Sat, 6:00 AM – 11:00 PM',
    );
  });

  // (f) — AC1 12-hour edge values (midnight / noon).
  it('formats midnight and noon boundaries correctly', () => {
    expect(formatDealScheduleSummary([recur([2], '00:00', '12:00')])).toBe(
      'Available Tue, 12:00 AM – 12:00 PM',
    );
    expect(formatDealScheduleSummary([recur([2], '08:25', '13:05')])).toBe(
      'Available Tue, 8:25 AM – 1:05 PM',
    );
  });

  // E1 (Execute-Agent Instruction) — weekend set does NOT wrap Sat↔Sun; renders "Sun, Sat".
  it('renders a weekend (Sat+Sun) set as "Sun, Sat" (linear grouping, no wraparound)', () => {
    expect(formatDealScheduleSummary([recur([0, 6], '11:00', '15:00')])).toBe(
      'Available Sun, Sat, 11:00 AM – 3:00 PM',
    );
  });

  // (g) — AC2 absolute-only window.
  it('renders an absolute-only window as "Available until …" with no recurrence text', () => {
    // 2026-07-25T10:00:00Z + 8h = 2026-07-25 18:00 Manila.
    const summary = formatDealScheduleSummary([absolute('2026-07-25T10:00:00.000Z')]);
    expect(summary).toBe('Available until Jul 25, 6:00 PM');
    expect(summary).not.toContain('Mon');
    expect(summary).not.toContain('Available Sun');
  });

  // (h) — AC4 Manila boundary-crossing regression: Fri 23:30 UTC = Sat 07:30 Manila.
  it('applies the fixed +08:00 Manila shift across a UTC day boundary (not a host-local read)', () => {
    // 2026-07-24T23:30:00Z is Jul 24 in UTC but Jul 25 07:30 in Manila.
    const summary = formatDealScheduleSummary([absolute('2026-07-24T23:30:00.000Z')]);
    expect(summary).toBe('Available until Jul 25, 7:30 AM');
    // The bug this guards against would show the UTC date (Jul 24).
    expect(summary).not.toContain('Jul 24');
  });

  // (i) — AC8 multi-row: recurring row wins over an absolute row; never throws.
  it('picks the recurring row deterministically when a deal has multiple rows', () => {
    const windows = [absolute('2026-07-25T10:00:00.000Z'), recur([5], '17:00', '21:00')];
    const summary = formatDealScheduleSummary(windows);
    expect(summary).toBe('Available Fri, 5:00 PM – 9:00 PM');
  });

  it('produces valid non-throwing output for two non-overlapping absolute rows', () => {
    const windows = [absolute('2026-07-20T10:00:00.000Z'), absolute('2026-07-28T10:00:00.000Z')];
    // First row with a defined endsAt wins; deterministic and non-throwing.
    expect(() => formatDealScheduleSummary(windows)).not.toThrow();
    expect(formatDealScheduleSummary(windows)).toBe('Available until Jul 20, 6:00 PM');
  });

  // (j) — rows present but none informative (open-ended startsAt only) → undefined.
  it('returns undefined when rows exist but none are informative', () => {
    const windows = [absolute(null, '2026-07-01T00:00:00.000Z')];
    expect(formatDealScheduleSummary(windows)).toBeUndefined();
  });
});
