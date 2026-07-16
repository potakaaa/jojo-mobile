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
import { products } from './products';
import { promotions } from './promotions';

export const dealTypeEnum = pgEnum('deal_type', [
  'percentage_discount',
  'fixed_discount',
  'buy_one_take_one',
  'free_item',
  'free_upgrade',
  'bundle',
]);

// ADM-008 Coupons — the legacy `deals` discount table, renamed to `offers`
// (migration 0011). The physical `deal_type` enum/column names are intentionally
// left unchanged (a rename would need extra, riskier ALTER TYPE / RENAME COLUMN
// statements not required by the Locked Decisions). `promotion_id` is the new
// nullable link to a parent Promotion (Phase 3 CRUD populates it).
export const offers = pgTable('offers', {
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
  promotion_id: uuid('promotion_id').references(() => promotions.id),
  // ADM-008 Fix 6 (free-mechanic redemption): the product a `free_item` /
  // `free_upgrade` offer's benefit applies to. Nullable + additive (migration
  // 0014): legacy free-mechanic offers created before this fix carry NULL and are
  // rejected at redemption by the permanent resolver guard (never a mis-discount).
  // Lazy FK callback mirrors `promotion_id` (avoids circular-init on the products
  // import); NO ACTION on delete (default) — matches the existing FK convention.
  benefit_product_id: uuid('benefit_product_id').references(() => products.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
