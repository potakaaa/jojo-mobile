import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const dealTypeEnum = pgEnum('deal_type', [
  'percentage_discount',
  'fixed_discount',
  'buy_one_take_one',
  'free_item',
  'free_upgrade',
  'bundle',
]);

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title').notNull(),
  description: text('description'),
  image_url: text('image_url'),
  deal_type: dealTypeEnum('deal_type').notNull(),
  discount_value: numeric('discount_value', { precision: 10, scale: 2 }),
  minimum_order_amount: numeric('minimum_order_amount', {
    precision: 10,
    scale: 2,
  })
    .default('0')
    .notNull(),
  start_at: timestamp('start_at').notNull(),
  end_at: timestamp('end_at').notNull(),
  usage_limit_per_user: integer('usage_limit_per_user'),
  total_usage_limit: integer('total_usage_limit'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
