import { integer, jsonb, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { carts } from './carts';
import { products } from './products';

/**
 * `cart_items` (CART-003) — one line per (cart, product, selected-options) combo.
 *
 * `cart_id` cascades on delete (`onDelete: 'cascade'`) so clearing/deleting a cart
 * removes its lines in one statement. `product_id` is a plain `NO ACTION` FK,
 * matching the `orders.deal_id`/`order_items.product_id` precedent.
 *
 * The snapshot columns (`product_name_snapshot`, `unit_price`, `selected_options`)
 * mirror `order_items` exactly. `unit_price` is the price AT ADD-TIME — a
 * cache/last-known value only. It is RE-CHECKED live against the current product +
 * option prices on every `GET /cart` (AC8, via `cart-revalidation.ts`), so a stale
 * cached value can never be what the customer actually pays.
 *
 * `quantity > 0` is enforced app-level in the route handlers (mirroring the
 * `deal_components.quantity` precedent — no DB CHECK). Line-merge on add (same
 * product + same selected options merges into one line, bumping quantity) is also an
 * app-level check in `POST /cart/items` (ported `lineIdFor()` logic), NOT a DB
 * constraint — regression-locked by a dedicated test.
 */
export const cartItems = pgTable('cart_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  cart_id: uuid('cart_id')
    .references(() => carts.id, { onDelete: 'cascade' })
    .notNull(),
  product_id: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  quantity: integer('quantity').default(1).notNull(),
  product_name_snapshot: varchar('product_name_snapshot').notNull(),
  unit_price: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  selected_options: jsonb('selected_options').default([]).notNull(),
  notes: varchar('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
