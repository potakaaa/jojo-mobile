import { numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { users } from './users';

/**
 * `carts` (CART-003) — the per-user, server-persisted shopping cart. Replaces the
 * old in-memory `useState<Cart>` seam so a cart survives app restart, sign-out/in,
 * and device switch.
 *
 * ONE cart per user, enforced at the DB level: `user_id` is `.unique().notNull()`,
 * copying the `user_stars.user_id` precedent verbatim. There is never a second cart
 * to reconcile — every access is an atomic find-or-create keyed on the session user.
 *
 * `branch_id` is nullable (a fresh cart has no branch until the first item add /
 * branch select). The single active discount (`AppliedDiscount`) is denormalized as
 * four flat nullable columns, mirroring how `orders.deal_id`/`orders.coupon_id`
 * denormalize the order-side discount rather than a separate table. `discount_amount`
 * is `numeric(10,2)` (decimal), converted at the API boundary via
 * `numericToCents`/`centsToNumeric` like every other money column.
 *
 * `updated_at` is set explicitly on every mutation in the route handlers
 * (`updated_at: new Date()`), matching the established repo-wide idiom — there is no
 * drizzle `$onUpdate()` trigger anywhere in this schema.
 */
export const carts = pgTable('carts', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .references(() => users.id)
    .unique()
    .notNull(),
  branch_id: uuid('branch_id').references(() => branches.id),
  // Denormalized single-active-discount columns (AppliedDiscount shape). All
  // nullable — a cart with no applied discount has all four NULL. `discount_source`
  // is a plain varchar (not a pgEnum): it mirrors `AppliedDiscount.source`'s
  // display-only string union ('coupon' | 'deal' | 'reward'), which is not a
  // DB-meaningful enum the way order status/payment_method are.
  discount_source: varchar('discount_source'),
  // Polymorphic reference (may point at coupons.id / offers.id / a rewards row
  // depending on `discount_source`) — NO FK constraint, same as AppliedDiscount.refId
  // has no DB backing today.
  discount_ref_id: uuid('discount_ref_id'),
  discount_label: varchar('discount_label'),
  discount_amount: numeric('discount_amount', { precision: 10, scale: 2 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
