import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { offers } from './offers';
import { rewards } from './rewards';
import { users } from './users';

export const couponStatusEnum = pgEnum('coupon_status', ['available', 'used', 'expired']);

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // ADM-008 Coupons: user_id is now nullable — a bulk-issued coupon (user_id
    // NULL) is claimed on redeem via COALESCE in the atomic burn UPDATE (Phase 2).
    user_id: uuid('user_id').references(() => users.id),
    // ADM-008 Coupons: `deal_id` renamed to `offer_id` (migration 0011); FK now
    // targets the renamed `offers` table.
    offer_id: uuid('offer_id').references(() => offers.id),
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
    // Reward XOR offer mutual-exclusivity (migration 0015). A coupon row is one
    // identity: reward-coupon (reward_id set), offer-coupon (offer_id set), or
    // neither (pre-issuance/targeting) — never BOTH. Without this, a dual-FK row
    // would silently take the resolver's reward branch (checked first) and skip
    // the entire offer path, including the free-mechanic guard. An admin wanting
    // both benefits mints two separate coupons.
    check('coupons_reward_offer_mutex', sql`${t.reward_id} IS NULL OR ${t.offer_id} IS NULL`),
  ],
);
