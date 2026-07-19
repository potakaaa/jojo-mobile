/**
 * Pure Asia/Manila calendar-date → UTC-instant helpers for the admin analytics
 * route (ADM-007, D3). Deliberately DB-import-free so they can be unit-tested in
 * isolation (Execute-Agent Instruction E3), separate from the DB-backed AC5
 * integration fixture that exercises the same math end-to-end.
 *
 * Manila is a fixed `+08:00` offset (the Philippines has no DST), so a Manila
 * calendar date's midnight is that date's UTC midnight minus 8 hours.
 */

/** Milliseconds in Manila's fixed +08:00 offset. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse a `YYYY-MM-DD` string as a Manila calendar date and return the UTC
 * `Date` instant of that date's Manila midnight (`00:00:00+08:00`). Returns
 * `null` for a malformed string OR an impossible calendar date (e.g.
 * `2026-02-30`, which JS `Date` would otherwise silently roll into March).
 *
 * Example: `parseManilaDate('2026-07-17')` → `2026-07-16T16:00:00.000Z`.
 */
export function parseManilaDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Manila midnight = UTC midnight of the same calendar date, minus 8 hours.
  const instant = new Date(Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS);

  // Reject rollover: reconstruct the Manila calendar date from the instant and
  // require it to match the input exactly (catches 2026-02-30, 2026-13-01, ...).
  const manila = new Date(instant.getTime() + MANILA_OFFSET_MS);
  if (
    manila.getUTCFullYear() !== year ||
    manila.getUTCMonth() !== month - 1 ||
    manila.getUTCDate() !== day
  ) {
    return null;
  }
  return instant;
}

/** Half-open UTC bounds for a Manila calendar-date range. */
export interface ManilaUtcRange {
  /** Inclusive lower bound: `from` at Manila midnight, as a UTC instant. */
  lower: Date;
  /** Exclusive upper bound: `to + 1 day` at Manila midnight, as a UTC instant. */
  upper: Date;
}

/**
 * Convert an inclusive Manila calendar-date range `[from, to]` into the half-open
 * UTC instant interval `[from 00:00+08:00, (to + 1 day) 00:00+08:00)`. Returns
 * `null` if either date is malformed/impossible.
 *
 * The half-open upper bound makes the last day fully inclusive: an order at
 * 23:30 Manila on `to` (= 15:30 UTC) is < upper and counts; 00:30 Manila the next
 * day (= 16:30 UTC the same UTC day) is >= upper and does not.
 */
export function manilaDateRangeToUtc(from: string, to: string): ManilaUtcRange | null {
  const lower = parseManilaDate(from);
  const toMidnight = parseManilaDate(to);
  if (!lower || !toMidnight) return null;
  return { lower, upper: new Date(toMidnight.getTime() + ONE_DAY_MS) };
}
