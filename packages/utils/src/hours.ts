/**
 * Opening-hours parser. Returns whether a branch is open at `now`.
 *
 * @param openingHours JSON string of a per-day object, e.g.
 *   `{ mon: { open: '09:00', close: '21:00' }, ... }`. Day keys are lowercase
 *   3-letter abbreviations (`mon`..`sun`). A missing day key means closed.
 * @param now Defaults to `new Date()` — injectable for testing.
 * @param tzOffsetHours Hours to add to UTC to reach branch-local time.
 *   Defaults to 8 (UTC+8, Cebu).
 *
 * A `close` of `'00:00'` is treated as midnight end-of-day (24:00 / 1440
 * minutes), NOT a same-day midnight open. Invalid JSON returns `false`.
 *
 * TODO(BRN-xxx): replace tzOffsetHours default with per-branch timezone field
 * once the schema adds one.
 */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

interface DayHours {
  open: string;
  close: string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function getIsOpenNow(
  openingHours: string,
  now: Date = new Date(),
  tzOffsetHours = 8,
): boolean {
  let parsed: Record<string, DayHours | undefined>;
  try {
    parsed = JSON.parse(openingHours) as Record<string, DayHours | undefined>;
  } catch {
    return false;
  }

  // Shift into branch-local time by adding the offset to the UTC instant, then
  // read the UTC parts of the shifted date (getUTC* avoids double-applying the
  // runtime's own timezone on top of the manual offset).
  const local = new Date(now.getTime() + tzOffsetHours * 3600 * 1000);
  const dayKey = DAY_KEYS[local.getUTCDay()];
  const today = dayKey ? parsed[dayKey] : undefined;
  if (!today || typeof today.open !== 'string' || typeof today.close !== 'string') {
    return false;
  }

  const currentMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const openMinutes = toMinutes(today.open);
  // '00:00' close means end-of-day (24:00), not a same-day midnight open.
  const closeMinutes = today.close === '00:00' ? 24 * 60 : toMinutes(today.close);

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

// Display order (Mon-first), independent of getIsOpenNow's Sun-first getUTCDay()
// index ordering above.
const DISPLAY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<(typeof DISPLAY_DAYS)[number], string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** '09:00' → '9:00 AM', '21:00' → '9:00 PM', '00:00' → '12:00 AM'. */
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
 * Human-readable opening-hours lines from the per-day JSON string, grouping
 * consecutive days that share the same open/close (or are both Closed).
 *
 * @param openingHoursJson Same JSON shape `getIsOpenNow` consumes, e.g.
 *   `{ mon: { open: '09:00', close: '21:00' }, ... }`.
 * @returns One display string per run of consecutive identical days, e.g.
 *   `['Mon–Thu: 9:00 AM – 9:00 PM', 'Fri–Sat: 9:00 AM – 10:00 PM', 'Sun: 10:00 AM – 8:00 PM']`.
 *   Invalid JSON → `['Hours unavailable']`.
 */
export function formatOpeningHours(openingHoursJson: string): string[] {
  let parsed: Record<string, DayHours | undefined>;
  try {
    parsed = JSON.parse(openingHoursJson) as Record<string, DayHours | undefined>;
  } catch {
    return ['Hours unavailable'];
  }

  // Normalize each display day to a comparable hours string, or 'Closed'.
  const dayHoursStr = DISPLAY_DAYS.map((day) => {
    const entry = parsed[day];
    if (!entry || typeof entry.open !== 'string' || typeof entry.close !== 'string') {
      return 'Closed';
    }
    return `${to12Hour(entry.open)} – ${to12Hour(entry.close)}`;
  });

  // Group consecutive days sharing the same hours string.
  const lines: string[] = [];
  let runStart = 0;
  for (let i = 1; i <= DISPLAY_DAYS.length; i++) {
    if (i < DISPLAY_DAYS.length && dayHoursStr[i] === dayHoursStr[runStart]) {
      continue;
    }
    const startDay = DISPLAY_DAYS[runStart] ?? 'mon';
    const endDay = DISPLAY_DAYS[i - 1] ?? 'sun';
    const startLabel = DAY_LABELS[startDay];
    const endLabel = DAY_LABELS[endDay];
    const isSingle = runStart === i - 1;
    const dayRange = isSingle ? startLabel : `${startLabel}–${endLabel}`;
    const hours = dayHoursStr[runStart] ?? 'Closed';
    // A single closed day renders as bare 'Closed' (no day prefix); a run of
    // closed days keeps the range prefix, e.g. 'Mon–Fri: Closed'.
    if (hours === 'Closed' && isSingle) {
      lines.push('Closed');
    } else {
      lines.push(`${dayRange}: ${hours}`);
    }
    runStart = i;
  }

  return lines;
}
