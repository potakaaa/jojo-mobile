/**
 * DEAL-005 Phase 3 — pure client-side formatter for a deal's live schedule window,
 * producing the customer-facing annotation shown on the Deals tab, Home strip, and
 * Deal Details ("Available Mon–Fri, 8:00 AM – 8:25 PM" / "Available until Jul 25,
 * 6:00 PM").
 *
 * TIMEZONE RULE (the whole reason this is its own module):
 *  - `recurDays`/`recurStartTime`/`recurEndTime` are ALREADY Manila wall-clock
 *    values (Phase 2 stored them that way so no second timezone-aware reader is
 *    needed). This code does ZERO timezone math on them — only day-name + 12-hour
 *    STRING formatting, exactly like `hours.ts`'s `formatOpeningHours` precedent.
 *  - `startsAt`/`endsAt` are raw UTC instants (real `timestamp` columns). Formatting
 *    an absolute-window "Available until …" from `endsAt` DOES need the fixed +08:00
 *    Manila shift — the same shift-the-epoch-then-read-getUTC* technique as the
 *    server's `toManilaWallClock()` (REUSE, not new invention). Reading a host-local
 *    accessor here would silently mis-render for any device not set to Manila.
 *
 * The `to12Hour` helper is duplicated locally (~6 lines) rather than widening
 * `hours.ts`'s public surface for an unrelated input shape (a day-INDEX array +
 * per-row absolute bounds vs. `hours.ts`'s per-day-keyed JSON object).
 */

import type { DealScheduleWindow } from '@jojopotato/types';

/** Asia/Manila is a fixed +08:00 offset, no DST — same documented fact the server relies on. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 0=Sun..6=Sat, matching `Date#getDay()` / the stored `recurDays` convention. */
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** '08:00' → '8:00 AM', '12:00' → '12:00 PM', '00:00' → '12:00 AM'. */
function to12Hour(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, '0');
  return `${hour12}:${mm} ${period}`;
}

/**
 * Group a sorted, deduped set of day indices (0=Sun..6=Sat) into a readable label:
 * consecutive runs collapse to a range ("Mon–Fri"), single days stay single ("Wed"),
 * and non-adjacent runs join with ", " ("Mon, Wed, Fri").
 *
 * The grouping is LINEAR (no Sat↔Sun wraparound), matching `hours.ts`'s existing
 * non-wrapping precedent — a weekend-only set renders "Sun, Sat" rather than a
 * collapsed "Sat–Sun". Correct and readable, just not maximally collapsed for that
 * one edge (documented, intentional — see plan Execute-Agent Instruction E1).
 */
function formatDayRange(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const runs: string[] = [];
  let runStart = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i];
    if (i < sorted.length && curr === prev + 1) continue;
    const startDay = sorted[runStart]!;
    const endDay = prev;
    const startLabel = DAY_LABELS[startDay] ?? String(startDay);
    const endLabel = DAY_LABELS[endDay] ?? String(endDay);
    runs.push(runStart === i - 1 ? startLabel : `${startLabel}–${endLabel}`);
    runStart = i;
  }
  return runs.join(', ');
}

/**
 * Build the customer-facing schedule summary for a deal, or `undefined` when there
 * is nothing informative to show (a schedule-less/always-live deal, or a row with
 * only an open-ended `startsAt` and no recurrence/end).
 *
 * Priority (Decision 5 — deterministic, never throws):
 *  1. first row with a full recurrence triple → "Available {days}, {start} – {end}"
 *  2. else first row with a defined `endsAt` → "Available until {Manila month/day}, {Manila time}"
 *  3. else → undefined
 *
 * Pure and synchronous — every timestamp comes from the input, no clock read.
 */
export function formatDealScheduleSummary(
  windows: DealScheduleWindow[] | undefined,
): string | undefined {
  if (!windows || windows.length === 0) return undefined;

  // 1. Recurring row wins. Requires a non-empty day set + both times.
  const recurring = windows.find(
    (w) =>
      w.recurDays != null &&
      w.recurDays.length > 0 &&
      w.recurStartTime != null &&
      w.recurEndTime != null,
  );
  if (recurring) {
    const dayRange = formatDayRange(recurring.recurDays!);
    const start = to12Hour(recurring.recurStartTime!);
    const end = to12Hour(recurring.recurEndTime!);
    return `Available ${dayRange}, ${start} – ${end}`;
  }

  // 2. Absolute-window row with a defined end.
  const absolute = windows.find((w) => w.endsAt != null);
  if (absolute) {
    // `endsAt` is a raw UTC instant → shift by the fixed Manila offset, then read
    // ONLY getUTC* accessors (never a host-local read). Mirrors `toManilaWallClock`.
    const shifted = new Date(new Date(absolute.endsAt!).getTime() + MANILA_OFFSET_MS);
    const month = MONTH_LABELS[shifted.getUTCMonth()];
    const day = shifted.getUTCDate();
    const hh = String(shifted.getUTCHours()).padStart(2, '0');
    const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
    return `Available until ${month} ${day}, ${to12Hour(`${hh}:${mm}`)}`;
  }

  // 3. Nothing informative (e.g. an open-ended startsAt-only row).
  return undefined;
}
