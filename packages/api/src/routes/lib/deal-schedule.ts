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

/** The two window bounds this module reasons about. Structurally typed so callers
 *  can pass raw drizzle rows without importing the table type. */
export interface DealScheduleWindow {
  starts_at: Date | null;
  ends_at: Date | null;
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
 */
export function isDealScheduleLive(rows: DealScheduleWindow[], now: Date): boolean {
  if (rows.length === 0) return true;

  const t = now.getTime();
  return rows.some((row) => {
    // `starts_at` INCLUSIVE: live at the exact instant it starts.
    if (row.starts_at !== null && t < row.starts_at.getTime()) return false;
    // `ends_at` EXCLUSIVE: NOT live at the exact instant it ends.
    if (row.ends_at !== null && t >= row.ends_at.getTime()) return false;
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
    })
    .from(dealSchedules)
    .where(inArray(dealSchedules.deal_product_id, dealProductIds));

  const windowsByDeal = new Map<string, DealScheduleWindow[]>();
  for (const row of rows) {
    const list = windowsByDeal.get(row.dealProductId) ?? [];
    list.push({ starts_at: row.starts_at, ends_at: row.ends_at });
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
