/**
 * Marketing quiet-hours gate (PUSH-005 / #82, D4).
 *
 * Pure, DB-import-free predicate so it can be unit-tested with an injected clock
 * (AC11) independently of the DB-backed dispatch guard that consumes it. Mirrors
 * the fixed Asia/Manila `+08:00` convention used by `analytics-range.ts`
 * (`MANILA_OFFSET_MS`) — the Philippines has no DST, so a UTC instant's Manila
 * local hour is just `(UTC hour + 8) mod 24`.
 *
 * Quiet hours = Manila local hour ≥ 21 (9pm) OR < 8 (8am). A marketing send that
 * lands inside this window is DROPPED by the guard (no row, no push); a
 * transactional order-status push never routes through this gate and is exempt.
 */

/** Milliseconds in Manila's fixed +08:00 offset. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Quiet hours start at 21:00 Manila (inclusive). */
export const QUIET_START_HOUR = 21;
/** Quiet hours end at 08:00 Manila (exclusive) — sends resume at 08:00. */
export const QUIET_END_HOUR = 8;

/**
 * True when `now` falls inside the Manila quiet-hours window
 * (`[21:00, 24:00) ∪ [00:00, 08:00)` Manila local time).
 */
export function isWithinQuietHours(now: Date): boolean {
  const manilaHour = new Date(now.getTime() + MANILA_OFFSET_MS).getUTCHours();
  return manilaHour >= QUIET_START_HOUR || manilaHour < QUIET_END_HOUR;
}
