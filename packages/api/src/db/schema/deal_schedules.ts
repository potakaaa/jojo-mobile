import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { products } from './products';

/**
 * `deal_schedules` (DEAL-005 Phase 1) — an optional time window during which a
 * deal-product (`products.is_deal = true`) is live.
 *
 * SEMANTIC RULE (load-bearing — both enforcement points depend on it):
 *  - ZERO rows for a deal  → the deal is ALWAYS live (subject to `is_active` and
 *    branch/component availability, exactly as before this table existed). This is
 *    the no-backfill guarantee: every deal that predates DEAL-005 has zero rows and
 *    must behave identically to pre-Phase-1 behavior. Never express "always live"
 *    as a single all-null row.
 *  - ONE OR MORE rows → the deal is live only inside the UNION of those rows'
 *    windows.
 *
 * INCLUSIVITY: the window is HALF-OPEN, `starts_at <= now < ends_at`. `starts_at`
 * is inclusive (live at the exact instant it starts); `ends_at` is EXCLUSIVE (not
 * live at the exact instant it ends). An admin who wants a deal to run "through
 * end of day Sunday" sets `ends_at` to 23:59 that day (or 00:00 Monday) — the
 * `DateTimeField` "End of day" preset covers this. This boundary is implemented
 * ONCE, in `routes/lib/deal-schedule.ts`'s `isDealScheduleLive()`, and is called by
 * BOTH the menu read path and the order-placement write path so the two can never
 * disagree about the final instant of a window.
 *
 * Both bounds are NULLABLE and independently so: either alone means "open" on that
 * side (`starts_at` set + `ends_at` null = starts Friday, never ends on its own).
 * A row with BOTH null is meaningless and is rejected at the API boundary.
 *
 * WHY A TABLE, not two flat columns on `products`: Phase 2 adds recurrence
 * (day-of-week / time-of-day) as ADDITIVE columns on this same table plus multiple
 * rows per deal — so Phase 2 needs no data migration. Phase 1 only ever writes 0 or
 * 1 rows per deal, enforced at the API layer (replace-never-append), deliberately
 * NOT by a unique constraint on `deal_product_id`: such a constraint would have to
 * be dropped again for Phase 2's multi-row recurrence, which is the exact second
 * migration this table shape exists to avoid.
 *
 * Windows are real instants (plain `timestamp`), matching `offers.start_at`/`end_at`
 * verbatim. They are NOT date-only calendar buckets — do not route them through
 * `manilaDateRangeToUtc` (that helper buckets whole Manila calendar days for KPI
 * aggregation and would collapse a precise "6pm Friday" into a midnight boundary).
 */
export const dealSchedules = pgTable('deal_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  deal_product_id: uuid('deal_product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  starts_at: timestamp('starts_at'),
  ends_at: timestamp('ends_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
