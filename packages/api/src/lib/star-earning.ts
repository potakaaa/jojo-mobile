import { and, eq, lte, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { coupons, orders, rewards, starTransactions, userStars } from '../db/schema/index';
import { numericToCents } from '../routes/lib/serializers';
import { rewardCouponCodeGenerator } from './reward-coupon-code';
import { notifyRewardUnlocked } from './reward-unlock-notify';
import { getStarEarningMinimumCents, STAR_EARNING_MINIMUM_CENTS } from './star-earning-config';

/**
 * Jojo Stars earning service (STAR-001).
 *
 * Two standalone, idempotent, retry-safe service functions:
 *   - creditStarForCompletedOrder(orderId): earn exactly 1 star for a completed
 *     eligible order.
 *   - reverseStarForRefundedOrder(orderId): write an `adjusted` (-1) reversal for
 *     a refunded order that previously earned a star.
 *
 * Idempotency source of truth = the partial unique index on
 * `star_transactions (order_id, type) WHERE order_id IS NOT NULL` (migration
 * 0005). Every mutation runs inside a single `db.transaction`: the ledger row is
 * inserted FIRST (guarded by `onConflictDoNothing`); the `user_stars` counter is
 * bumped ONLY when a row was actually inserted, so a double-fire (even
 * concurrent) can never double-count.
 *
 * NOTE (E1): the `onConflictDoNothing` calls MUST carry `targetWhere` matching
 * the partial index predicate — the bare `target: [...]` form raises a runtime
 * `no unique or exclusion constraint matching the ON CONFLICT specification`
 * error against a partial index (empirically confirmed in VALIDATE).
 *
 * This module has NO live caller yet — STAFF-003 owns wiring these into the
 * staff status-update / refund endpoints:
 *   TODO(STAFF-003): call creditStarForCompletedOrder(order.id) after status → 'completed'
 *   TODO(STAFF-003): call reverseStarForRefundedOrder(order.id) after payment_status → 'refunded'
 *
 * REWARD UNLOCK (STAR-003): a credit that pushes the user's monotonic
 * `lifetime_stars` across one or more active reward thresholds mints exactly one
 * `coupons` row per newly-crossed tier — battle-pass cumulative model (LD1),
 * each tier unlocks once per user forever (lifetime never resets, so a refund
 * does NOT revoke an unlocked tier). The unlock runs INSIDE the credit
 * transaction on the credited path only (behind the `inserted.length > 0`
 * gate), idempotent via the `coupons_user_reward_unique` partial index
 * (migration 0006) + ON CONFLICT DO NOTHING. A best-effort notification row is
 * written AFTER the transaction commits (never inside it).
 */

/** Max attempts to dodge a `coupons.code` UNIQUE collision (E5, ≤5). */
const COUPON_CODE_MAX_ATTEMPTS = 5;

/** pg unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = '23505';

/** The `coupons.code` unique constraint name (migration 0000). */
const COUPON_CODE_CONSTRAINT = 'coupons_code_unique';

function isCouponCodeCollision(err: unknown): boolean {
  // Drizzle wraps the pg driver error, so the SQLSTATE/constraint may sit on the
  // top-level object OR on `err.cause`. Check both so the bounded retry loop
  // recognizes the collision and mints a fresh code instead of failing the txn.
  const matches = (e: unknown): boolean =>
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === PG_UNIQUE_VIOLATION &&
    (e as { constraint?: string }).constraint === COUPON_CODE_CONSTRAINT;
  return matches(err) || matches((err as { cause?: unknown } | null)?.cause);
}

/**
 * Minimum order total (in integer cents) required to earn a star. Default `0`
 * — every completed order is eligible. Re-exported from `star-earning-config`
 * (the ADM-005-ready seam) so callers keep importing it from this module per the
 * plan's Public Contract, while the live eligibility check reads it through
 * `getStarEarningMinimumCents()` (mockable at one point). Unit: integer cents.
 */
export { STAR_EARNING_MINIMUM_CENTS };

type OrderRow = typeof orders.$inferSelect;

export interface StarCreditResult {
  credited: boolean;
  reason?: 'not-found' | 'not-completed' | 'below-minimum' | 'already-credited';
  /**
   * Reward ids for which a coupon was minted on THIS call (STAR-003). `[]` when a
   * credit occurred but crossed no new threshold; absent (undefined) when no
   * credit occurred (not-found / not-completed / below-minimum / already-credited).
   */
  unlockedRewardIds?: string[];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Reward-unlock side-effect (STAR-003), run INSIDE the credit transaction on the
 * credited path only. Queries all active reward tiers at/below the post-bump
 * `lifetimeStars` LIVE (no cached constant — AC4), then mints one coupon per
 * tier the user does not already hold (idempotent via the 0006 partial index +
 * ON CONFLICT DO NOTHING — AC2). Returns the ids of the tiers newly unlocked on
 * this call (empty when nothing crossed). A `coupons.code` UNIQUE collision (the
 * conflict target is (user_id, reward_id), NOT code) is retried with a fresh
 * code, bounded to {@link COUPON_CODE_MAX_ATTEMPTS} (E5).
 */
async function unlockRewardsForLifetime(
  tx: Tx,
  userId: string,
  lifetimeStars: number,
): Promise<string[]> {
  const candidateTiers = await tx
    .select({ id: rewards.id })
    .from(rewards)
    .where(and(eq(rewards.is_active, true), lte(rewards.required_stars, lifetimeStars)));

  const unlockedRewardIds: string[] = [];
  for (const tier of candidateTiers) {
    let inserted: { reward_id: string | null }[] = [];
    for (let attempt = 0; attempt < COUPON_CODE_MAX_ATTEMPTS; attempt += 1) {
      try {
        // Wrap each insert in a SAVEPOINT (nested tx): a `coupons.code` collision
        // aborts only the savepoint, not the whole outer credit transaction, so
        // the retry can proceed. (In Postgres a raw error inside a transaction
        // poisons the entire tx until rollback — the savepoint is what makes an
        // in-tx retry possible at all.)
        inserted = await tx.transaction(async (sp) =>
          sp
            .insert(coupons)
            .values({
              user_id: userId,
              reward_id: tier.id,
              code: rewardCouponCodeGenerator.generate(),
            })
            // Partial-index arbiter — MUST carry the `where` predicate matching
            // the 0006 `WHERE reward_id IS NOT NULL` index (E1: the bare
            // `target`-only form throws against a partial index). Deal-coupons
            // (reward_id NULL) are exempt via the predicate.
            .onConflictDoNothing({
              target: [coupons.user_id, coupons.reward_id],
              where: sql`${coupons.reward_id} IS NOT NULL`,
            })
            .returning({ reward_id: coupons.reward_id }),
        );
        break;
      } catch (err) {
        // Retry ONLY on a `coupons.code` collision — never on the (user,reward)
        // conflict (that is handled by ON CONFLICT DO NOTHING, returning [] not
        // throwing). Exhausting the retry budget rethrows (fail-safe).
        if (isCouponCodeCollision(err) && attempt < COUPON_CODE_MAX_ATTEMPTS - 1) continue;
        throw err;
      }
    }
    // Non-empty `.returning()` = a coupon was actually minted (already-owned
    // tiers hit the conflict and return []).
    if (inserted.length > 0) unlockedRewardIds.push(tier.id);
  }
  return unlockedRewardIds;
}

export interface StarReversalResult {
  reversed: boolean;
  reason?: 'not-found' | 'no-earned-star' | 'already-reversed';
}

/**
 * Pure eligibility check: is the order total at or above the configured minimum?
 * `orders.total` is `numeric(10,2)` (decimal string from the pg driver) — convert
 * to integer cents via the exported `numericToCents` helper before comparing.
 */
export function isOrderEligibleForStar(order: OrderRow): boolean {
  return numericToCents(order.total) >= getStarEarningMinimumCents();
}

/**
 * Credit exactly 1 star for a completed, eligible order. Idempotent and
 * retry-safe: re-firing for an already-credited order is a no-op (returns
 * `already-credited`, never double-bumps the counter).
 */
export async function creditStarForCompletedOrder(orderId: string): Promise<StarCreditResult> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { credited: false, reason: 'not-found' };
  if (order.status !== 'completed') return { credited: false, reason: 'not-completed' };
  if (!isOrderEligibleForStar(order)) return { credited: false, reason: 'below-minimum' };

  const result = await db.transaction(async (tx): Promise<StarCreditResult> => {
    // 1. Insert the `earned` ledger row FIRST, guarded by the partial unique
    //    index. A second `earned` insert for this order is a no-op (empty set).
    const inserted = await tx
      .insert(starTransactions)
      .values({
        user_id: order.user_id,
        order_id: order.id,
        type: 'earned',
        stars: 1,
        description: 'Earned 1 star for completed order',
      })
      .onConflictDoNothing({
        target: [starTransactions.order_id, starTransactions.type],
        // Partial-index predicate — MUST match the `WHERE order_id IS NOT NULL`
        // arbiter or Postgres raises "no unique or exclusion constraint matching
        // the ON CONFLICT specification" (E1, VALIDATE-proven). In this Drizzle
        // version the predicate key on onConflictDoNothing is `where` (the
        // insert-config equivalent of `targetWhere`); it emits
        // `ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING`.
        where: sql`${starTransactions.order_id} IS NOT NULL`,
      })
      .returning();

    // 2. Only bump user_stars when a row was actually inserted. Empty set →
    //    already credited → leave the counter untouched (proves AC4). This gate
    //    ALSO guards the reward unlock below (AC3/AC5: unlock only on a real
    //    credit, never on a duplicate completion event).
    if (inserted.length === 0) return { credited: false, reason: 'already-credited' };

    // 3. Lazily upsert the user's counter (+1 current, +1 lifetime). No row is
    //    seeded, so upsert keyed on the unique user_id. `.returning()` gives the
    //    post-bump lifetime_stars in-tx (E2) — used as the LIVE unlock threshold.
    const [counter] = await tx
      .insert(userStars)
      .values({ user_id: order.user_id, current_stars: 1, lifetime_stars: 1 })
      .onConflictDoUpdate({
        target: userStars.user_id,
        set: {
          current_stars: sql`${userStars.current_stars} + 1`,
          lifetime_stars: sql`${userStars.lifetime_stars} + 1`,
          updated_at: new Date(),
        },
      })
      .returning({ lifetime_stars: userStars.lifetime_stars });
    if (!counter) throw new Error('user_stars upsert returned no row');

    // 4. Reward unlock (STAR-003): mint a coupon per newly-crossed active tier.
    //    Inside the same transaction — a coupon-insert failure rolls back the
    //    credit atomically.
    const unlockedRewardIds = await unlockRewardsForLifetime(
      tx,
      order.user_id,
      counter.lifetime_stars,
    );

    return { credited: true, unlockedRewardIds };
  });

  // 5. Best-effort notification AFTER the transaction commits (LD4) — never
  //    inside it, so a notification failure can never roll back a real coupon.
  //    The helper already swallows its own errors; the extra try/catch is
  //    belt-and-suspenders against an unexpected synchronous throw.
  if (result.credited && result.unlockedRewardIds && result.unlockedRewardIds.length > 0) {
    try {
      await notifyRewardUnlocked(order.user_id, result.unlockedRewardIds);
    } catch (err) {
      console.error('[star-earning] post-commit reward-unlock notification failed', err);
    }
  }

  return result;
}

/**
 * Reverse a previously-earned star for a refunded order. Writes an `adjusted`
 * (-1) ledger row and decrements `current_stars` ONLY (lifetime stays monotonic
 * — cumulative earning history is never rolled back; see plan §Logic C2).
 * Idempotent: a second reversal for the same order is a no-op.
 *
 * Keys off an existing `earned` star_transaction rather than `payment_status`,
 * so it works regardless of when the refund is recorded. (`refunded` lives on
 * `order.payment_status`, not `order.status` — order.status stays 'completed'.)
 */
export async function reverseStarForRefundedOrder(orderId: string): Promise<StarReversalResult> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { reversed: false, reason: 'not-found' };

  return db.transaction(async (tx) => {
    const earned = await tx
      .select()
      .from(starTransactions)
      .where(and(eq(starTransactions.order_id, orderId), eq(starTransactions.type, 'earned')));
    if (earned.length === 0) return { reversed: false, reason: 'no-earned-star' };

    // Idempotent reversal: insert `adjusted` (-1) guarded by the same partial
    // unique index (order_id, 'adjusted'). A repeated refund event is a no-op.
    const inserted = await tx
      .insert(starTransactions)
      .values({
        user_id: earned[0]!.user_id,
        order_id: orderId,
        type: 'adjusted',
        stars: -1,
        description: 'Reversed star for refunded order',
      })
      .onConflictDoNothing({
        target: [starTransactions.order_id, starTransactions.type],
        // Partial-index predicate — MUST match the `WHERE order_id IS NOT NULL`
        // arbiter or Postgres raises "no unique or exclusion constraint matching
        // the ON CONFLICT specification" (E1, VALIDATE-proven). In this Drizzle
        // version the predicate key on onConflictDoNothing is `where` (the
        // insert-config equivalent of `targetWhere`); it emits
        // `ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING`.
        where: sql`${starTransactions.order_id} IS NOT NULL`,
      })
      .returning();
    if (inserted.length === 0) return { reversed: false, reason: 'already-reversed' };

    // Decrement current_stars only; lifetime_stars stays monotonic.
    await tx
      .update(userStars)
      .set({
        current_stars: sql`${userStars.current_stars} - 1`,
        updated_at: new Date(),
      })
      .where(eq(userStars.user_id, earned[0]!.user_id));

    return { reversed: true };
  });
}
