import { pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { deals } from './deals';
import { products } from './products';

export const dealProducts = pgTable(
  'deal_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deal_id: uuid('deal_id')
      .references(() => deals.id)
      .notNull(),
    product_id: uuid('product_id')
      .references(() => products.id)
      .notNull(),
  },
  (t) => [uniqueIndex('deal_products_deal_product_idx').on(t.deal_id, t.product_id)],
);
