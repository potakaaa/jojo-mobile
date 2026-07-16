import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { deals } from './deals';
import { rewards } from './rewards';
import { users } from './users';

export const couponStatusEnum = pgEnum('coupon_status', ['available', 'used', 'expired']);

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
  (t) => [
    index('coupons_user_status_idx').on(t.user_id, t.status),
    // Reward-unlock idempotency arbiter (STAR-003): at most one coupon per
    // (user_id, reward_id) for reward-coupons. PARTIAL — deal-coupons carry a
    // NULL reward_id (and Postgres treats NULLs as distinct), so confining the
    // constraint to `reward_id IS NOT NULL` lets a user hold many deal-coupons
    // while blocking a duplicate reward-coupon. Model exactly on the 0005
    // `star_transactions_order_type_unique` partial index.
    uniqueIndex('coupons_user_reward_unique')
      .on(t.user_id, t.reward_id)
      .where(sql`${t.reward_id} IS NOT NULL`),
  ],
);
