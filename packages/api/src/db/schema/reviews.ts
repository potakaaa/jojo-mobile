import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orders } from './orders';
import { users } from './users';

/**
 * `reviews` (order-completion-celebration) — one customer review per completed
 * order. A customer who has picked up (self-confirm) or whose order was
 * staff-completed can leave a single overall rating (1–5) plus an optional short
 * comment for that order.
 *
 * ONE review per order, enforced at the DB level: `order_id` is `.unique()`
 * (copying the `user_stars.user_id`/`carts.user_id` one-row-per-key precedent).
 * This is the correctness backstop for the "no edit after submit" rule (D8): a
 * duplicate insert violates the unique constraint atomically → the route maps it
 * to a 409, so two concurrent submissions can never both land.
 *
 * `rating` carries a defense-in-depth `CHECK (rating BETWEEN 1 AND 5)`; the Zod
 * boundary in the route rejects an out-of-range rating with a 422 before it ever
 * reaches the DB, but the constraint guarantees the invariant even against a
 * direct SQL write. `comment` is nullable (rating-only reviews are valid).
 *
 * `created_at` follows the repo-wide `defaultNow().notNull()` idiom. Rating is a
 * plain integer (never money) — no numeric/cents conversion at the boundary.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    order_id: uuid('order_id')
      .references(() => orders.id)
      .unique()
      .notNull(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [check('reviews_rating_range', sql`${t.rating} BETWEEN 1 AND 5`)],
);
