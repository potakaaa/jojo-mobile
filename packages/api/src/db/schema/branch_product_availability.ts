import {
  boolean,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { products } from './products';

export const branchProductAvailability = pgTable(
  'branch_product_availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branch_id: uuid('branch_id')
      .references(() => branches.id)
      .notNull(),
    product_id: uuid('product_id')
      .references(() => products.id)
      .notNull(),
    is_available: boolean('is_available').default(true).notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('bpa_branch_product_idx').on(t.branch_id, t.product_id),
  ],
);
