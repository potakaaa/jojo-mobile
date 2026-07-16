import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orders } from './orders';
import { users } from './users';

export const starTxTypeEnum = pgEnum('star_tx_type', ['earned', 'redeemed', 'adjusted', 'expired']);

export const starTransactions = pgTable(
  'star_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    order_id: uuid('order_id').references(() => orders.id),
    type: starTxTypeEnum('type').notNull(),
    stars: integer('stars').notNull(),
    description: text('description'),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('star_transactions_user_idx').on(t.user_id),
    // Idempotency arbiter (STAR-001): exactly one row per (order_id, type) for
    // order-linked rows. PARTIAL — `order_id` is nullable, and future
    // redeemed/expired rows may carry NULL order_id (Postgres treats NULLs as
    // distinct). Confining the constraint to `order_id IS NOT NULL` keeps the
    // earn/adjust dedupe tight without blocking those future NULL-order rows.
    uniqueIndex('star_transactions_order_type_unique')
      .on(t.order_id, t.type)
      .where(sql`${t.order_id} IS NOT NULL`),
  ],
);
