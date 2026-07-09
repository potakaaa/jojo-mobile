import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { categories } from './categories';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  category_id: uuid('category_id')
    .references(() => categories.id)
    .notNull(),
  name: varchar('name').notNull(),
  slug: varchar('slug').unique().notNull(),
  description: text('description'),
  image_url: text('image_url'),
  base_price: numeric('base_price', { precision: 10, scale: 2 }).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  is_reward_eligible: boolean('is_reward_eligible').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
