import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { deals } from './deals';
import { rewards } from './rewards';
import { users } from './users';

export const couponStatusEnum = pgEnum('coupon_status', [
  'available',
  'used',
  'expired',
]);

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    deal_id: uuid('deal_id').references(() => deals.id),
    reward_id: uuid('reward_id').references((): AnyPgColumn => rewards.id),
    code: varchar('code').unique().notNull(),
    status: couponStatusEnum('status').default('available').notNull(),
    expires_at: timestamp('expires_at'),
    used_at: timestamp('used_at'),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('coupons_user_status_idx').on(t.user_id, t.status)],
);
