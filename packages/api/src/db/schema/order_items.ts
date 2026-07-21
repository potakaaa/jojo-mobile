import { integer, jsonb, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { orders } from './orders';
import { products } from './products';

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  order_id: uuid('order_id')
    .references(() => orders.id)
    .notNull(),
  product_id: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  product_name_snapshot: varchar('product_name_snapshot').notNull(),
  quantity: integer('quantity').notNull(),
  unit_price: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  total_price: numeric('total_price', { precision: 10, scale: 2 }).notNull(),
  selected_options: jsonb('selected_options').default([]).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
