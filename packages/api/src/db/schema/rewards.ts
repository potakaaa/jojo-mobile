import {
  boolean,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { products } from './products';

export const rewards = pgTable('rewards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull(),
  required_stars: integer('required_stars').notNull(),
  reward_type: varchar('reward_type').notNull(),
  reward_value: numeric('reward_value', { precision: 10, scale: 2 }),
  eligible_product_id: uuid('eligible_product_id').references(
    () => products.id,
  ),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
