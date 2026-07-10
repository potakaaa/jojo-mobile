import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
  (t) => [index('star_transactions_user_idx').on(t.user_id)],
);
