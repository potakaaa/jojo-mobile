import { pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { offers } from './offers';

// ADM-008 Coupons — `deal_branches` renamed to `offer_branches`, `deal_id`
// renamed to `offer_id` (migration 0011). The physical unique-index name is left
// as `deal_branches_deal_branch_idx`: `ALTER TABLE ... RENAME` preserves index
// names, so the schema string must match the physical name to stay in sync.
export const offerBranches = pgTable(
  'offer_branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offer_id: uuid('offer_id')
      .references(() => offers.id)
      .notNull(),
    branch_id: uuid('branch_id')
      .references(() => branches.id)
      .notNull(),
  },
  (t) => [uniqueIndex('deal_branches_deal_branch_idx').on(t.offer_id, t.branch_id)],
);
