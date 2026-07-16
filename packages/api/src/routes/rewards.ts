import type { Reward, RewardsSummary, StarTransaction } from '@jojopotato/types';
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { Router } from 'express';

import { db } from '../db/client';
import { rewards, starTransactions, userStars } from '../db/schema/index';
import { numericToCents } from './lib/serializers';

/**
 * Rewards routes (STAR-002). Read-only, session-gated. `requireSession` is
 * applied ONCE at mount in `index.ts` (`app.use('/rewards', requireSession,
 * rewardsRouter)`), so every handler here can assume `req.user!.id` is the
 * server-owned better-auth session user — never a client-supplied id. Cross-user
 * reads are structurally impossible: every query scopes on `req.user!.id`.
 */
export const rewardsRouter: Router = Router();

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;

type RewardRow = typeof rewards.$inferSelect;

/** Serialize a DB `rewards` row → the shared `Reward` shape (cents-native). */
function serializeReward(row: RewardRow): Reward {
  return {
    id: row.id,
    name: row.name,
    requiredStars: row.required_stars,
    rewardType: row.reward_type,
    rewardValue: row.reward_value === null ? null : numericToCents(row.reward_value),
    isActive: row.is_active,
  };
}

/**
 * `GET /rewards/summary` → `RewardsSummary`.
 *
 * The caller's star counters + the reward being progressed toward (the MIN
 * active reward by `required_stars`). A missing `user_stars` row reads as 0
 * stars (STAR-001 creates the row lazily on first credit — new users legitimately
 * have none). When NO active reward exists, `requiredStars` falls back to 0,
 * `reward` is null, and `isUnlocked` is false (defensive; with the seeded 5-star
 * reward one active reward always exists in seeded envs).
 */
rewardsRouter.get('/summary', async (req, res) => {
  const userId = req.user!.id;

  const [stars] = await db.select().from(userStars).where(eq(userStars.user_id, userId));

  const currentStars = stars?.current_stars ?? 0;
  const lifetimeStars = stars?.lifetime_stars ?? 0;

  // The reward being progressed toward = the MIN active reward by required_stars.
  const [targetReward] = await db
    .select()
    .from(rewards)
    .where(eq(rewards.is_active, true))
    .orderBy(asc(rewards.required_stars))
    .limit(1);

  const requiredStars = targetReward?.required_stars ?? 0;
  const reward = targetReward ? serializeReward(targetReward) : null;
  const isUnlocked = reward !== null && currentStars >= requiredStars;

  const body: RewardsSummary = {
    currentStars,
    lifetimeStars,
    requiredStars,
    isUnlocked,
    reward,
  };
  res.json(body);
});

/**
 * `GET /rewards/available` → `{ rewards: Reward[] }`.
 *
 * All active rewards, ordered by `required_stars` ascending. Kept separate from
 * `/summary` (the available-rewards list is a distinct screen concern from the
 * top progress tracker; one endpoint per section, matching `staff.ts`).
 */
rewardsRouter.get('/available', async (_req, res) => {
  const rows = await db
    .select()
    .from(rewards)
    .where(eq(rewards.is_active, true))
    .orderBy(asc(rewards.required_stars));

  res.json({ rewards: rows.map(serializeReward) });
});

/**
 * `GET /rewards/history` → `{ transactions: StarTransaction[], nextCursor }`.
 *
 * The caller's `star_transactions` rows in reverse-chronological order
 * (`desc(created_at)` — AC3), cursor-paginated (mirrors `orders.ts` history:
 * `limit + 1` look-ahead, `nextCursor` = last row's `created_at` ISO string).
 * Includes `adjusted` (refund reversal, -1) rows — nothing is filtered out.
 */
rewardsRouter.get('/history', async (req, res) => {
  const userId = req.user!.id;

  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_HISTORY_LIMIT)
    : DEFAULT_HISTORY_LIMIT;

  const cursor = typeof req.query.cursor === 'string' ? new Date(req.query.cursor) : null;
  const hasCursor = cursor !== null && !Number.isNaN(cursor.getTime());

  const whereClause = hasCursor
    ? and(eq(starTransactions.user_id, userId), lt(starTransactions.created_at, cursor))
    : eq(starTransactions.user_id, userId);

  const rows = await db
    .select()
    .from(starTransactions)
    .where(whereClause)
    .orderBy(desc(starTransactions.created_at))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const transactions: StarTransaction[] = page.map((row) => ({
    id: row.id,
    userId: row.user_id,
    orderId: row.order_id,
    type: row.type,
    stars: row.stars,
    description: row.description,
    createdAt: row.created_at.toISOString(),
  }));

  const nextCursor = hasMore ? page[page.length - 1]!.created_at.toISOString() : null;

  res.json({ transactions, nextCursor });
});

export default rewardsRouter;
