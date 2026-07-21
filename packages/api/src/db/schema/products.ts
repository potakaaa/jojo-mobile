import { boolean, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
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
  // ADM-004 deals-as-products: a "deal" is simply a product with is_deal=true,
  // priced at its own base_price, whose "what's inside" is described by the
  // `deal_components` junction. Additive (default false) — every existing
  // product row is a regular catalog product. Filtered in/out at the menu,
  // admin-products, and admin-deals query sites (never at order placement or
  // staff availability, which treat a deal-product as any other product).
  is_deal: boolean('is_deal').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
