import { describe, expect, it } from 'vitest';

import {
  isDealScheduleLive,
  toManilaWallClock,
  validateRecurrence,
  validateWindow,
} from '../deal-schedule';

/**
 * DEAL-005 Phase 1 — pure unit coverage for the ONE shared window check both
 * enforcement points call. The half-open boundary (AC7) is proven here at the exact
 * instant, which a DB-level integration test cannot do without racing the clock.
 */

const NOW = new Date('2026-07-20T12:00:00Z');
const t = (iso: string) => new Date(iso);

describe('isDealScheduleLive — no-backfill guarantee (AC3)', () => {
  it('treats ZERO schedule rows as always live', () => {
    expect(isDealScheduleLive([], NOW)).toBe(true);
  });

  it('is live with zero rows at any instant, past or future', () => {
    expect(isDealScheduleLive([], t('1999-01-01T00:00:00Z'))).toBe(true);
    expect(isDealScheduleLive([], t('2099-01-01T00:00:00Z'))).toBe(true);
  });
});

describe('isDealScheduleLive — single window', () => {
  it('is live inside the window', () => {
    expect(
      isDealScheduleLive(
        [{ starts_at: t('2026-07-20T00:00:00Z'), ends_at: t('2026-07-21T00:00:00Z') }],
        NOW,
      ),
    ).toBe(true);
  });

  it('is NOT live before a future starts_at (AC1)', () => {
    expect(
      isDealScheduleLive(
        [{ starts_at: t('2026-07-21T00:00:00Z'), ends_at: t('2026-07-22T00:00:00Z') }],
        NOW,
      ),
    ).toBe(false);
  });

  it('is NOT live after a past ends_at (AC2)', () => {
    expect(
      isDealScheduleLive(
        [{ starts_at: t('2026-07-18T00:00:00Z'), ends_at: t('2026-07-19T00:00:00Z') }],
        NOW,
      ),
    ).toBe(false);
  });
});

describe('isDealScheduleLive — half-open boundary (AC7)', () => {
  const startsAt = t('2026-07-20T12:00:00Z');
  const endsAt = t('2026-07-20T18:00:00Z');
  const window = [{ starts_at: startsAt, ends_at: endsAt }];

  it('starts_at is INCLUSIVE — live at the exact starting instant', () => {
    expect(isDealScheduleLive(window, new Date(startsAt.getTime()))).toBe(true);
  });

  it('is NOT live one millisecond before starts_at', () => {
    expect(isDealScheduleLive(window, new Date(startsAt.getTime() - 1))).toBe(false);
  });

  it('is live one second before ends_at', () => {
    expect(isDealScheduleLive(window, new Date(endsAt.getTime() - 1000))).toBe(true);
  });

  it('ends_at is EXCLUSIVE — NOT live at the exact ending instant', () => {
    expect(isDealScheduleLive(window, new Date(endsAt.getTime()))).toBe(false);
  });
});

describe('isDealScheduleLive — open-ended bounds', () => {
  it('null starts_at means already started', () => {
    expect(isDealScheduleLive([{ starts_at: null, ends_at: t('2026-07-21T00:00:00Z') }], NOW)).toBe(
      true,
    );
    expect(isDealScheduleLive([{ starts_at: null, ends_at: t('2026-07-19T00:00:00Z') }], NOW)).toBe(
      false,
    );
  });

  it('null ends_at means never ends on its own', () => {
    expect(isDealScheduleLive([{ starts_at: t('2026-07-19T00:00:00Z'), ends_at: null }], NOW)).toBe(
      true,
    );
    expect(isDealScheduleLive([{ starts_at: t('2026-07-21T00:00:00Z'), ends_at: null }], NOW)).toBe(
      false,
    );
  });

  it('both bounds null is live (total function; the API boundary rejects writing one)', () => {
    expect(isDealScheduleLive([{ starts_at: null, ends_at: null }], NOW)).toBe(true);
  });
});

describe('isDealScheduleLive — union of multiple windows (Phase 2 forward-compat)', () => {
  it('is live when ANY window contains now', () => {
    expect(
      isDealScheduleLive(
        [
          { starts_at: t('2026-07-01T00:00:00Z'), ends_at: t('2026-07-02T00:00:00Z') },
          { starts_at: t('2026-07-20T00:00:00Z'), ends_at: t('2026-07-21T00:00:00Z') },
        ],
        NOW,
      ),
    ).toBe(true);
  });

  it('is NOT live when EVERY window misses now', () => {
    expect(
      isDealScheduleLive(
        [
          { starts_at: t('2026-07-01T00:00:00Z'), ends_at: t('2026-07-02T00:00:00Z') },
          { starts_at: t('2026-07-25T00:00:00Z'), ends_at: t('2026-07-26T00:00:00Z') },
        ],
        NOW,
      ),
    ).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * DEAL-005 Phase 2 — recurrence
 *
 * These assertions are only meaningful because `packages/api/vitest.config.ts` pins
 * `TZ: 'UTC'` (Execute-Agent Instruction E2). Several dev machines here run
 * `Asia/Manila`; without the pin, a regression to host-local `Date` accessors would
 * pass every case below VACUOUSLY on those machines, because host-local time already
 * equals the Manila time being asserted.
 * ══════════════════════════════════════════════════════════════════════════════ */

describe('toManilaWallClock — the dangerous UTC/Manila day-boundary offsets (AC1)', () => {
  it('reports SATURDAY for Friday-23:00Z, which is Saturday 07:00 in Manila', () => {
    // 2026-07-24 is a real Friday. +08:00 → Sat 2026-07-25 07:00 Manila.
    // A day-of-week read off the raw UTC instant would wrongly report 5 (Fri).
    expect(toManilaWallClock(t('2026-07-24T23:00:00Z'))).toEqual({ dayOfWeek: 6, hhmm: '07:00' });
  });

  it('reports SUNDAY for Saturday-16:30Z, which is Sunday 00:30 in Manila', () => {
    expect(toManilaWallClock(t('2026-07-25T16:30:00Z'))).toEqual({ dayOfWeek: 0, hhmm: '00:30' });
  });

  it('flips Sat→Sun exactly at 16:00:00.000Z, not one instant early or late', () => {
    // 2026-07-18 is a real Saturday.
    expect(toManilaWallClock(t('2026-07-18T15:59:59.999Z'))).toEqual({
      dayOfWeek: 6,
      hhmm: '23:59',
    });
    expect(toManilaWallClock(t('2026-07-18T16:00:00.000Z'))).toEqual({
      dayOfWeek: 0,
      hhmm: '00:00',
    });
  });

  it('zero-pads both fields so "HH:mm" strings stay lexicographically comparable', () => {
    // 2026-07-19T01:05:00Z → Manila 09:05. Guards against "9:5".
    expect(toManilaWallClock(t('2026-07-19T01:05:00Z')).hhmm).toBe('09:05');
  });
});

describe('isDealScheduleLive — recurrence end-to-end at the dangerous offset (AC1)', () => {
  const SAT_07_00_MANILA = t('2026-07-24T23:00:00Z');

  it('is live for a Saturday-only row at the Fri-23:00Z / Sat-07:00-Manila instant', () => {
    // The regression that silently fails if day-of-week is read off the raw UTC
    // instant (which would report Friday) instead of the Manila-shifted one.
    expect(
      isDealScheduleLive(
        [
          {
            starts_at: null,
            ends_at: null,
            recur_days: [6],
            recur_start_time: '06:00',
            recur_end_time: '09:00',
          },
        ],
        SAT_07_00_MANILA,
      ),
    ).toBe(true);
  });

  it('is NOT live for a Friday-only row at that same instant', () => {
    // The mirror assertion: reading the raw UTC day would wrongly make this true.
    expect(
      isDealScheduleLive(
        [
          {
            starts_at: null,
            ends_at: null,
            recur_days: [5],
            recur_start_time: '06:00',
            recur_end_time: '09:00',
          },
        ],
        SAT_07_00_MANILA,
      ),
    ).toBe(false);
  });
});

describe('isDealScheduleLive — recurrence by day and time-of-day (AC2)', () => {
  // 2026-07-22T06:00:00Z → Manila Wednesday (3) 14:00.
  const WED_14_00_MANILA = t('2026-07-22T06:00:00Z');
  const row = (over: Partial<Parameters<typeof isDealScheduleLive>[0][number]> = {}) => [
    {
      starts_at: null,
      ends_at: null,
      recur_days: [1, 2, 3, 4, 5],
      recur_start_time: '14:00',
      recur_end_time: '17:00',
      ...over,
    },
  ];

  it('is live inside its hours on a listed day', () => {
    expect(isDealScheduleLive(row(), WED_14_00_MANILA)).toBe(true);
  });

  it('is live at the INCLUSIVE start time and NOT at the EXCLUSIVE end time', () => {
    // 05:59:59.999Z → Manila 13:59; 09:00Z → Manila 17:00 (the exclusive bound).
    expect(isDealScheduleLive(row(), t('2026-07-22T05:59:59.999Z'))).toBe(false);
    expect(isDealScheduleLive(row(), t('2026-07-22T08:59:00Z'))).toBe(true); // 16:59
    expect(isDealScheduleLive(row(), t('2026-07-22T09:00:00Z'))).toBe(false); // 17:00
  });

  it('is NOT live outside its hours on a listed day', () => {
    // 2026-07-22T02:00:00Z → Manila Wed 10:00, before the 14:00 start.
    expect(isDealScheduleLive(row(), t('2026-07-22T02:00:00Z'))).toBe(false);
  });

  it('is NOT live on an unlisted day even during its hours', () => {
    // 2026-07-25T06:00:00Z → Manila Saturday (6) 14:00 — inside the hours, wrong day.
    expect(isDealScheduleLive(row(), t('2026-07-25T06:00:00Z'))).toBe(false);
  });
});

describe('isDealScheduleLive — recurrence NARROWS the absolute window, never overrides it (AC3)', () => {
  const WED_14_00_MANILA = t('2026-07-22T06:00:00Z');
  const recurring = (starts: Date | null, ends: Date | null) => [
    {
      starts_at: starts,
      ends_at: ends,
      recur_days: [3],
      recur_start_time: '14:00',
      recur_end_time: '17:00',
    },
  ];

  it('is live when inside BOTH the absolute window and the recurring hours', () => {
    expect(
      isDealScheduleLive(
        recurring(t('2026-07-01T00:00:00Z'), t('2026-08-01T00:00:00Z')),
        WED_14_00_MANILA,
      ),
    ).toBe(true);
  });

  it('is dead BEFORE the absolute window even during its recurring hours', () => {
    expect(
      isDealScheduleLive(
        recurring(t('2026-07-23T00:00:00Z'), t('2026-08-01T00:00:00Z')),
        WED_14_00_MANILA,
      ),
    ).toBe(false);
  });

  it('is dead AFTER the absolute window even during its recurring hours', () => {
    expect(
      isDealScheduleLive(
        recurring(t('2026-07-01T00:00:00Z'), t('2026-07-21T00:00:00Z')),
        WED_14_00_MANILA,
      ),
    ).toBe(false);
  });
});

describe('isDealScheduleLive — no-backfill guarantee, SECOND instance (AC4)', () => {
  // Every row that predates Phase 2 has all three recurrence columns null. Those
  // rows must behave EXACTLY as Phase 1 — this is a hard, Known-Gap-banned invariant.
  // Asserted at an instant chosen so a leaked recurrence branch would flip the answer.
  const SAT_07_00_MANILA = t('2026-07-24T23:00:00Z');

  it('an explicitly-null recurrence triple behaves exactly as Phase 1', () => {
    const phase1Only = { starts_at: null, ends_at: t('2026-08-01T00:00:00Z') };
    const nulledOut = {
      ...phase1Only,
      recur_days: null,
      recur_start_time: null,
      recur_end_time: null,
    };
    expect(isDealScheduleLive([nulledOut], SAT_07_00_MANILA)).toBe(
      isDealScheduleLive([phase1Only], SAT_07_00_MANILA),
    );
    expect(isDealScheduleLive([nulledOut], SAT_07_00_MANILA)).toBe(true);
  });

  it('is live on EVERY day of the week when recurrence is null, unlike a recurring row', () => {
    // Non-vacuous: walks all 7 Manila days. A row that wrongly took the recurrence
    // path would go dead on at least one of them.
    const nonRecurring = {
      starts_at: null,
      ends_at: null,
      recur_days: null,
      recur_start_time: null,
      recur_end_time: null,
    };
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const instant = new Date(t('2026-07-20T00:00:00Z').getTime() + dayOffset * 86_400_000);
      expect(isDealScheduleLive([nonRecurring], instant)).toBe(true);
    }
  });

  it('still honours its absolute window — null recurrence does not mean always-live', () => {
    expect(
      isDealScheduleLive(
        [
          {
            starts_at: null,
            ends_at: t('2026-07-01T00:00:00Z'),
            recur_days: null,
            recur_start_time: null,
            recur_end_time: null,
          },
        ],
        SAT_07_00_MANILA,
      ),
    ).toBe(false);
  });
});

describe('isDealScheduleLive — overlapping recurring rows union into one live period (AC5)', () => {
  // Proven at the pure-function level with two directly-constructed rows. The admin
  // CRUD surface in this plan is deliberately single-row-per-deal (E3), so this
  // composition is a property of the table shape + union logic, not an admin flow.
  const lunchAndDinner = [
    {
      starts_at: null,
      ends_at: null,
      recur_days: [3],
      recur_start_time: '11:00',
      recur_end_time: '14:00',
    },
    {
      starts_at: null,
      ends_at: null,
      recur_days: [3],
      recur_start_time: '14:00',
      recur_end_time: '20:00',
    },
  ];

  it('is live in the FIRST window', () => {
    // 2026-07-22T04:00:00Z → Manila Wed 12:00.
    expect(isDealScheduleLive(lunchAndDinner, t('2026-07-22T04:00:00Z'))).toBe(true);
  });

  it('is live in the SECOND window', () => {
    // 2026-07-22T08:00:00Z → Manila Wed 16:00.
    expect(isDealScheduleLive(lunchAndDinner, t('2026-07-22T08:00:00Z'))).toBe(true);
  });

  it('is live at the ADJOINING seam — no dead instant between the two windows', () => {
    // 2026-07-22T06:00:00Z → Manila Wed 14:00: exclusive end of one, inclusive start
    // of the other. Continuous coverage is the whole point of AC5.
    expect(isDealScheduleLive(lunchAndDinner, t('2026-07-22T06:00:00Z'))).toBe(true);
  });

  it('is NOT live outside the union', () => {
    // 2026-07-22T02:00:00Z → Manila Wed 10:00, before either window opens.
    expect(isDealScheduleLive(lunchAndDinner, t('2026-07-22T02:00:00Z'))).toBe(false);
    // 2026-07-22T13:00:00Z → Manila Wed 21:00, after both close.
    expect(isDealScheduleLive(lunchAndDinner, t('2026-07-22T13:00:00Z'))).toBe(false);
  });
});

describe('validateRecurrence (AC6, AC7)', () => {
  it('accepts an all-absent triple (a non-recurring row)', () => {
    expect(validateRecurrence(null, null, null)).toBeNull();
    expect(validateRecurrence(undefined, undefined, undefined)).toBeNull();
  });

  it('accepts a well-formed recurring triple', () => {
    expect(validateRecurrence([1, 2, 3, 4, 5], '14:00', '17:00')).toBeNull();
    expect(validateRecurrence([0, 6], '00:00', '23:59')).toBeNull();
  });

  it('rejects a partial combination — the three fields move as a unit (AC7)', () => {
    const expected = 'recurDays, recurStartTime and recurEndTime must be provided together';
    expect(validateRecurrence([1], null, null)).toBe(expected);
    expect(validateRecurrence(null, '14:00', '17:00')).toBe(expected);
    expect(validateRecurrence([1], '14:00', null)).toBe(expected);
    expect(validateRecurrence([1], null, '17:00')).toBe(expected);
  });

  it('rejects an empty day set (AC7)', () => {
    expect(validateRecurrence([], '14:00', '17:00')).toBe('recurDays must not be empty');
  });

  it('rejects out-of-range or non-integer days', () => {
    const expected = 'recurDays must contain integers between 0 (Sunday) and 6 (Saturday)';
    expect(validateRecurrence([7], '14:00', '17:00')).toBe(expected);
    expect(validateRecurrence([-1], '14:00', '17:00')).toBe(expected);
    expect(validateRecurrence([1.5], '14:00', '17:00')).toBe(expected);
  });

  it('rejects duplicate days', () => {
    expect(validateRecurrence([1, 1], '14:00', '17:00')).toBe(
      'recurDays must not contain duplicates',
    );
  });

  it('rejects malformed time strings', () => {
    expect(validateRecurrence([1], '9:00', '17:00')).toBe('recurStartTime must be a "HH:mm" time');
    expect(validateRecurrence([1], '24:00', '25:00')).toBe('recurStartTime must be a "HH:mm" time');
    expect(validateRecurrence([1], '14:00', '17:60')).toBe('recurEndTime must be a "HH:mm" time');
  });

  it('rejects an overnight span — end must be strictly after start (AC6, D5)', () => {
    const expected = 'recurEndTime must be after recurStartTime';
    expect(validateRecurrence([1], '22:00', '02:00')).toBe(expected);
    expect(validateRecurrence([1], '14:00', '14:00')).toBe(expected);
    expect(validateRecurrence([1], '17:00', '14:00')).toBe(expected);
  });
});

describe('validateWindow (AC5)', () => {
  it('rejects startsAt === endsAt', () => {
    const same = t('2026-07-20T12:00:00Z');
    expect(validateWindow(same, same)).toBe('endsAt must be after startsAt');
  });

  it('rejects startsAt > endsAt', () => {
    expect(validateWindow(t('2026-07-21T00:00:00Z'), t('2026-07-20T00:00:00Z'))).toBe(
      'endsAt must be after startsAt',
    );
  });

  it('accepts startsAt < endsAt', () => {
    expect(validateWindow(t('2026-07-20T00:00:00Z'), t('2026-07-21T00:00:00Z'))).toBeNull();
  });

  it('accepts an open-ended window (either bound alone) and no bounds at all', () => {
    expect(validateWindow(t('2026-07-20T00:00:00Z'), null)).toBeNull();
    expect(validateWindow(null, t('2026-07-20T00:00:00Z'))).toBeNull();
    expect(validateWindow(undefined, undefined)).toBeNull();
  });
});
