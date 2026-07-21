import { pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { offers } from './offers';
import { products } from './products';

// ADM-008 Coupons — `deal_products` renamed to `offer_products`, `deal_id`
// renamed to `offer_id` (migration 0011). The physical unique-index name is left
// as `deal_products_deal_product_idx`: `ALTER TABLE ... RENAME` preserves index
// names, so the schema string must match the physical name to stay in sync.
export const offerProducts = pgTable(
  'offer_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offer_id: uuid('offer_id')
      .references(() => offers.id)
      .notNull(),
    product_id: uuid('product_id')
      .references(() => products.id)
      .notNull(),
  },
  (t) => [uniqueIndex('deal_products_deal_product_idx').on(t.offer_id, t.product_id)],
);
