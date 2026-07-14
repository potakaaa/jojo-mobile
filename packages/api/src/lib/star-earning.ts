import { and, eq, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { orders, starTransactions, userStars } from '../db/schema/index';
import { numericToCents } from '../routes/lib/serializers';
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
 */

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

  return db.transaction(async (tx) => {
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
    //    already credited → leave the counter untouched (proves AC4).
    if (inserted.length === 0) return { credited: false, reason: 'already-credited' };

    // 3. Lazily upsert the user's counter (+1 current, +1 lifetime). No row is
    //    seeded, so upsert keyed on the unique user_id.
    await tx
      .insert(userStars)
      .values({ user_id: order.user_id, current_stars: 1, lifetime_stars: 1 })
      .onConflictDoUpdate({
        target: userStars.user_id,
        set: {
          current_stars: sql`${userStars.current_stars} + 1`,
          lifetime_stars: sql`${userStars.lifetime_stars} + 1`,
          updated_at: new Date(),
        },
      });

    return { credited: true };
  });
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
