import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { products } from './products';

export const optionTypeEnum = pgEnum('option_type', [
  'size',
  'flavor',
  'add_on',
]);

export const productOptions = pgTable('product_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  product_id: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  option_type: optionTypeEnum('option_type').notNull(),
  name: varchar('name').notNull(),
  price_delta: numeric('price_delta', { precision: 10, scale: 2 })
    .default('0')
    .notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
