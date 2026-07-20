import { inArray } from 'drizzle-orm';

import { dealSchedules } from '../../db/schema/index';
import type { Queryer } from './coupon-apply';

/**
 * DEAL-005 Phase 1 — the shared "is this deal inside its scheduled window right
 * now" check, used by BOTH the deals-menu read path (`branches.ts`) and the
 * order-placement write path (`orders.ts`) so a deal can never be browsable in its
 * final second but unorderable, or vice versa. Same shape and same rationale as
 * MENU-003's `deal-availability.ts`.
 *
 * This is the ONLY place the half-open boundary is expressed. Do not re-derive it
 * in raw SQL at a call site (Execute-Agent Instruction E1) — two hand-written
 * comparisons are exactly how `>=` at one site and `>` at the other diverge.
 */

/** The window bounds this module reasons about. Structurally typed so callers can
 *  pass raw drizzle rows without importing the table type.
 *
 *  The three Phase 2 recurrence fields are OPTIONAL, not just nullable: a caller
 *  that predates Phase 2 (or a test asserting Phase 1 behavior) can omit them
 *  entirely and gets byte-identical Phase 1 semantics. */
export interface DealScheduleWindow {
  starts_at: Date | null;
  ends_at: Date | null;
  recur_days?: number[] | null;
  recur_start_time?: string | null;
  recur_end_time?: string | null;
}

/** Asia/Manila is a fixed +08:00 offset with no DST — the same documented fact
 *  `routes/admin/lib/analytics-range.ts` relies on. Only the FACT is reused here;
 *  `manilaDateRangeToUtc` itself is NOT, because it buckets whole calendar days and
 *  would be actively wrong for a real-instant comparison. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Convert a UTC instant to its Asia/Manila WALL-CLOCK day-of-week (0=Sun..6=Sat,
 * matching `Date#getDay()`) and `"HH:mm"` time-of-day.
 *
 * THIS IS THE MOST DANGEROUS FUNCTION IN THIS MODULE. It shifts the epoch by a fixed
 * offset and then reads ONLY `getUTC*` accessors. It must NEVER call a host-local
 * accessor (`getDay()`/`getHours()`/`getDate()`/`getMonth()`): those read the SERVER's
 * timezone, which makes the result correct only by coincidence on a machine that
 * happens to be set to Manila, and wrong everywhere else — silently, with no error.
 *
 * Concretely: Manila Saturday 07:00 is Friday 23:00 UTC. A day-of-week read from the
 * raw UTC instant reports Friday, so every deal whose recurring window opens before
 * 08:00 Manila would fire on the wrong calendar day.
 *
 * Exported ONLY so the boundary can be asserted directly at the dangerous offsets.
 * Production code calls it EXACTLY ONCE — inside `isDealScheduleLive()` below
 * (Execute-Agent Instruction E1). Neither `branches.ts` nor `orders.ts` may compute
 * day-of-week or time-of-day themselves, and no second Manila helper may exist.
 */
export function toManilaWallClock(instant: Date): { dayOfWeek: number; hhmm: string } {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MS);
  const dayOfWeek = shifted.getUTCDay();
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return { dayOfWeek, hhmm: `${hh}:${mm}` };
}

/**
 * Is a deal live at `now`, given ITS OWN schedule rows?
 *
 * - `rows` EMPTY → `true`. The no-backfill guarantee: a deal with no schedule rows
 *   is always live, exactly as before DEAL-005 existed. This branch is why the
 *   menu enforcement point must not use an `INNER JOIN` — a join would silently
 *   drop every one of these deals.
 * - otherwise → `true` iff `now` falls inside the UNION of the rows' windows.
 *
 * Each window is HALF-OPEN: `starts_at <= now < ends_at`. A null bound is open on
 * that side (null `starts_at` = "already started"; null `ends_at` = "never ends").
 * A row with BOTH bounds null is therefore always-live for that row — the API
 * boundary rejects writing one, but this function stays total rather than throwing
 * on data it can reason about.
 *
 * Pure and synchronous — `now` is injected, never read from the clock here, so the
 * boundary is testable at the exact instant without freezing time globally.
 *
 * PHASE 2 — RECURRENCE NARROWS THE ROW IT SITS ON (D6). When a row carries all three
 * recurrence fields, it is live only on the listed Manila days AND inside the listed
 * Manila hours, AND still only inside its own absolute window. The absolute bounds
 * always gate the recurrence, never the reverse. A row whose recurrence fields are
 * absent/null skips the recurrence branch entirely and behaves EXACTLY as Phase 1 —
 * the second no-backfill guarantee, and the reason every pre-Phase-2 row is unaffected.
 */
export function isDealScheduleLive(rows: DealScheduleWindow[], now: Date): boolean {
  if (rows.length === 0) return true;

  const t = now.getTime();
  // Called EXACTLY ONCE per check (E1), hoisted out of the row loop so every row
  // reasons about the same wall-clock instant.
  const wall = toManilaWallClock(now);

  return rows.some((row) => {
    // `starts_at` INCLUSIVE: live at the exact instant it starts.
    if (row.starts_at !== null && t < row.starts_at.getTime()) return false;
    // `ends_at` EXCLUSIVE: NOT live at the exact instant it ends.
    if (row.ends_at !== null && t >= row.ends_at.getTime()) return false;

    // Non-recurring row (Phase 1 shape) → the absolute window alone decides.
    // Guarded on all three together: a partial combination is rejected at the API
    // boundary, but this function stays TOTAL rather than throwing on data it can
    // reason about, matching the both-bounds-null posture above.
    const days = row.recur_days;
    if (days == null || row.recur_start_time == null || row.recur_end_time == null) {
      return true;
    }

    if (!days.includes(wall.dayOfWeek)) return false;
    // Half-open, matching the absolute window: start INCLUSIVE, end EXCLUSIVE.
    // Zero-padded fixed-width `"HH:mm"` compares correctly as a plain string.
    if (wall.hhmm < row.recur_start_time) return false;
    if (wall.hhmm >= row.recur_end_time) return false;
    return true;
  });
}

/**
 * Batched schedule lookup → the subset of `dealProductIds` that are live at `now`.
 *
 * ONE query regardless of how many deals are passed (never one per deal), mirroring
 * `resolveAvailableDealProductIds`. Deals with no rows are included in the result
 * BY CONSTRUCTION: the result set starts from the full candidate list and rows only
 * ever narrow it, so a deal absent from `deal_schedules` can never be dropped by a
 * missing join row. That is the AC3 no-backfill guarantee expressed structurally,
 * not as a special case someone could later delete.
 *
 * @param dbOrTx `db` or an open transaction. Order placement MUST pass its `tx` so
 *   the check reads the same snapshot as the write.
 */
export async function resolveLiveDealProductIds(
  dbOrTx: Queryer,
  dealProductIds: string[],
  now: Date,
): Promise<Set<string>> {
  if (!dealProductIds.length) return new Set();

  const rows = await dbOrTx
    .select({
      dealProductId: dealSchedules.deal_product_id,
      starts_at: dealSchedules.starts_at,
      ends_at: dealSchedules.ends_at,
      recur_days: dealSchedules.recur_days,
      recur_start_time: dealSchedules.recur_start_time,
      recur_end_time: dealSchedules.recur_end_time,
    })
    .from(dealSchedules)
    .where(inArray(dealSchedules.deal_product_id, dealProductIds));

  const windowsByDeal = new Map<string, DealScheduleWindow[]>();
  for (const row of rows) {
    const list = windowsByDeal.get(row.dealProductId) ?? [];
    list.push({
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      recur_days: row.recur_days,
      recur_start_time: row.recur_start_time,
      recur_end_time: row.recur_end_time,
    });
    windowsByDeal.set(row.dealProductId, list);
  }

  const live = new Set<string>();
  for (const dealProductId of dealProductIds) {
    // `?? []` is the zero-rows case — `isDealScheduleLive([])` returns true.
    if (isDealScheduleLive(windowsByDeal.get(dealProductId) ?? [], now)) {
      live.add(dealProductId);
    }
  }
  return live;
}

/**
 * Validate a window pair at the API boundary. Returns an error message, or `null`
 * when the pair is acceptable. Shared by the admin create and update paths so both
 * reject the same shapes.
 *
 * Rejects `startsAt >= endsAt` when BOTH are present (a window that can never be
 * live). Either bound alone is valid — that is a deliberately open-ended window.
 * Both absent is handled by the caller as "clear the window" (delete the row),
 * never as a both-null row.
 */
export function validateWindow(
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
): string | null {
  if (startsAt != null && endsAt != null && startsAt.getTime() >= endsAt.getTime()) {
    return 'endsAt must be after startsAt';
  }
  return null;
}

/** Zero-padded 24-hour `"HH:mm"`, the only shape the recurrence columns accept. */
const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validate a recurrence triple at the API boundary. Returns an error message, or
 * `null` when the triple is acceptable. Shared by the admin create and update paths
 * so both reject the same shapes — the same role `validateWindow` plays above.
 *
 * The three fields move as a UNIT: either all absent (a non-recurring row, Phase 1
 * shape) or all present. A partial combination is rejected rather than silently
 * ignored, because a half-specified recurrence would read as "recurring" to an admin
 * while behaving as always-live to the enforcement points.
 *
 * Also rejects an empty day set (a row that could never be live) and, per D5, any
 * overnight span (`recur_end_time <= recur_start_time`). An admin wanting 22:00–02:00
 * authors two rows; this keeps the live-check a plain same-day comparison with no
 * wrap case.
 */
export function validateRecurrence(
  days: number[] | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string | null {
  const hasDays = days != null;
  const hasStart = startTime != null;
  const hasEnd = endTime != null;

  if (!hasDays && !hasStart && !hasEnd) return null;
  if (!hasDays || !hasStart || !hasEnd) {
    return 'recurDays, recurStartTime and recurEndTime must be provided together';
  }

  if (days.length === 0) return 'recurDays must not be empty';
  if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return 'recurDays must contain integers between 0 (Sunday) and 6 (Saturday)';
  }
  if (new Set(days).size !== days.length) return 'recurDays must not contain duplicates';

  if (!HHMM_PATTERN.test(startTime)) return 'recurStartTime must be a "HH:mm" time';
  if (!HHMM_PATTERN.test(endTime)) return 'recurEndTime must be a "HH:mm" time';

  // D5 — no overnight wrap. Fixed-width zero-padded strings compare correctly.
  if (startTime >= endTime) return 'recurEndTime must be after recurStartTime';

  return null;
}
