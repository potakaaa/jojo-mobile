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
