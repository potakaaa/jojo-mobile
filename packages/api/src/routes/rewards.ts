import { randomBytes } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import { coupons, rewards, starTransactions, userStars } from '../db/schema/index';
import { requireSession } from '../middleware/require-session';
import { serializeCoupon, serializeReward } from './lib/serializers';

export const rewardsRouter: Router = Router();

/** Stars needed to unlock the next reward (PRD MVP: fixed at 5). */
export const REWARD_THRESHOLD = 5;

/** How long a redeemed reward coupon stays valid. */
const COUPON_VALIDITY_DAYS = 30;

const uuidSchema = z.string().uuid();

/** Carries an HTTP status through a thrown-inside-transaction rollback path. */
class RewardError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RewardError';
  }
}

/**
 * Generate a unique, human-readable reward coupon code. The random segment uses
 * `node:crypto` (cryptographically secure) rather than `Math.random`, since a
 * coupon code carries redeemable discount value and must not be guessable. Shape
 * stays `RWD-XXXXXXYYYY` — 6 secure-random hex chars + 4 base36 time chars — so
 * it still fits the human-readable, DB-unique `coupons.code` constraint.
 */
function generateCouponCode(): string {
  const rand = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  const time = Date.now().toString(36).slice(-4).toUpperCase();
  return `RWD-${rand}${time}`;
}

// GET /rewards — PUBLIC active rewards catalog (no session; mirrors /deals).
rewardsRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(rewards).where(eq(rewards.is_active, true));
  res.json({ rewards: rows.map(serializeReward) });
});

// GET /rewards/balance — session-gated star balance + tier-free progress.
rewardsRouter.get('/balance', requireSession, async (req, res) => {
  const userId = req.user!.id;
  const [row] = await db.select().from(userStars).where(eq(userStars.user_id, userId));
  const currentStars = row?.current_stars ?? 0;
  const lifetimeStars = row?.lifetime_stars ?? 0;
  const starsToNextReward = currentStars >= REWARD_THRESHOLD ? 0 : REWARD_THRESHOLD - currentStars;

  res.json({
    currentStars,
    lifetimeStars,
    rewardThreshold: REWARD_THRESHOLD,
    starsToNextReward,
  });
});

// POST /rewards/:id/redeem — session-gated. Atomic + row-locked: decrement
// current_stars by the reward cost, record a `redeemed` star_transaction, and
// issue a coupon. Stars spent are ALWAYS server-derived from the reward row.
rewardsRouter.post('/:id/redeem', requireSession, async (req, res) => {
  const userId = req.user!.id;
  const rewardId = String(req.params.id);
  if (!uuidSchema.safeParse(rewardId).success) {
    res.status(404).json({ error: 'Reward not found' });
    return;
  }

  try {
    const coupon = await db.transaction(async (tx) => {
      const [reward] = await tx
        .select()
        .from(rewards)
        .where(and(eq(rewards.id, rewardId), eq(rewards.is_active, true)));
      if (!reward) {
        throw new RewardError(404, 'Reward not found');
      }

      // Lock the caller's stars row FIRST (SELECT … FOR UPDATE) so two concurrent
      // redeems serialize — the second reads the already-decremented balance and
      // is rejected, instead of both passing the check and driving stars negative.
      const [stars] = await tx
        .select()
        .from(userStars)
        .where(eq(userStars.user_id, userId))
        .for('update');

      const currentStars = stars?.current_stars ?? 0;
      if (currentStars < reward.required_stars) {
        throw new RewardError(400, 'Insufficient stars');
      }

      // Decrement current_stars ONLY (lifetime_stars keeps accumulating).
      await tx
        .update(userStars)
        .set({ current_stars: currentStars - reward.required_stars, updated_at: new Date() })
        .where(eq(userStars.user_id, userId));

      await tx.insert(starTransactions).values({
        user_id: userId,
        type: 'redeemed',
        stars: reward.required_stars,
        description: `Redeemed reward ${reward.name}`,
      });

      const expiresAt = new Date(Date.now() + COUPON_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
      const [createdCoupon] = await tx
        .insert(coupons)
        .values({
          user_id: userId,
          reward_id: reward.id,
          code: generateCouponCode(),
          status: 'available',
          expires_at: expiresAt,
        })
        .returning();
      return createdCoupon!;
    });

    res.status(201).json({ coupon: serializeCoupon(coupon) });
  } catch (err) {
    if (err instanceof RewardError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[rewards] unexpected error redeeming reward', err);
    res.status(500).json({ error: 'Failed to redeem reward' });
  }
});
