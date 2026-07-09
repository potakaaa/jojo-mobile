import { pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { deals } from './deals';

export const dealBranches = pgTable(
  'deal_branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deal_id: uuid('deal_id')
      .references(() => deals.id)
      .notNull(),
    branch_id: uuid('branch_id')
      .references(() => branches.id)
      .notNull(),
  },
  (t) => [uniqueIndex('deal_branches_deal_branch_idx').on(t.deal_id, t.branch_id)],
);
