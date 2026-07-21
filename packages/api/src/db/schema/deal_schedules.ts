import { pgTable, smallint, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEAL-005 Phase 2 — RECURRENCE (`recur_days` / `recur_start_time` / `recur_end_time`)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * MANILA WALL-CLOCK RULE (load-bearing — the single most dangerous thing in this
 * table): `recur_days` and the two time columns are WALL-CLOCK concepts in
 * Asia/Manila, but the stored `starts_at`/`ends_at` bounds and the injected `now`
 * are real UTC instants. Day-of-week and time-of-day MUST be derived through
 * `toManilaWallClock()` in `routes/lib/deal-schedule.ts` — which shifts the epoch by
 * a fixed +08:00 and then reads ONLY `getUTC*` accessors. Never call host-local
 * `Date` accessors (`getDay()`/`getHours()`/`getDate()`) on these: those read the
 * SERVER's timezone, so the deal would go live on the wrong calendar day on any
 * non-Manila host — silently, with no error. Concretely: Manila Saturday 07:00 is
 * Friday 23:00 UTC, so a naive UTC `getUTCDay()` reports Friday for a Saturday deal.
 *
 * INCLUSIVITY: half-open, matching the absolute window above —
 * `recur_start_time <= t < recur_end_time`. Both are zero-padded `"HH:mm"` 24-hour
 * strings, which compare correctly with plain `<`/`>=` (fixed-width fields, `:` sorts
 * above every digit), so no `Date` is constructed for the time-of-day comparison.
 *
 * `recur_days` uses the JS `Date#getDay()` convention: 0=Sun .. 6=Sat.
 *
 * LEGAL COMBINATIONS (enforced at the API boundary by `validateRecurrence()`, not by
 * a DB CHECK — matching this table's existing precedent of API-layer enforcement):
 *  - ALL THREE null → a NON-RECURRING row: Phase 1 shape, absolute window only.
 *    Every row that predates Phase 2 is this shape and its behavior is byte-identical
 *    to before — the second no-backfill guarantee.
 *  - ALL THREE set → a RECURRING row. `recur_days` must be a non-empty array of
 *    integers in 0..6; `recur_start_time < recur_end_time`.
 *  - ANY PARTIAL combination → rejected 400. The three columns are nullable
 *    individually only because Postgres requires it; semantically they move as a unit.
 *
 * OVERNIGHT SPANS ARE REJECTED (D5): `recur_end_time` must be strictly AFTER
 * `recur_start_time`. An admin wanting 22:00–02:00 authors two rows (22:00–23:59 and
 * 00:00–02:00 on the appropriate days). This keeps the live-check a plain same-day
 * comparison with no wrap case, and sidesteps "which calendar day does Saturday 01:00
 * belong to" entirely.
 *
 * RECURRENCE NARROWS, NEVER OVERRIDES (D6): recurrence sits on the SAME row as the
 * absolute window, so one row reads "within this absolute [starts_at, ends_at), live
 * only on these days, only during these hours." A row's absolute bounds always gate
 * its recurrence — never the reverse. Union-across-rows is unchanged.
 *
 * FIRST ARRAY COLUMN IN THIS SCHEMA: `recur_days` is the first native Postgres array
 * column anywhere in `db/schema/` — it is NOT an established convention being
 * followed. `smallint(...).array()` is standard `drizzle-orm/pg-core` and needs no
 * new dependency. A comma-separated `varchar` was considered and rejected: it would
 * push parsing and validation into every reader instead of letting Postgres and
 * Drizzle type it natively.
 */
export const dealSchedules = pgTable('deal_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  deal_product_id: uuid('deal_product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  starts_at: timestamp('starts_at'),
  ends_at: timestamp('ends_at'),
  /** Phase 2 recurrence. 0=Sun..6=Sat (JS `Date#getDay()`). Null = non-recurring. */
  recur_days: smallint('recur_days').array(),
  /** Phase 2 recurrence. Manila wall-clock `"HH:mm"`, INCLUSIVE lower bound. */
  recur_start_time: varchar('recur_start_time', { length: 5 }),
  /** Phase 2 recurrence. Manila wall-clock `"HH:mm"`, EXCLUSIVE upper bound. */
  recur_end_time: varchar('recur_end_time', { length: 5 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
