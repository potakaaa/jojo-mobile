import { and, eq, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the STAR-001 star-earning service
 * (`creditStarForCompletedOrder`, `reverseStarForRefundedOrder`).
 *
 * Hermetic: seeds its OWN branch / user / order rows and cleans them up in
 * afterAll. Does NOT rely on `db:seed`. Runs against the real per-run pristine
 * `_test` Postgres (packages/api/test/global-setup.ts recreates it and applies
 * all migrations incl. 0005 — the partial unique index that makes the credit
 * idempotent):
 *   docker compose up -d
 *   DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test
 *
 * Covers AC1–AC5 + 3 idempotency/refund edge cases from the plan's Verification
 * Evidence table. AC4 + the reversal-twice edge are the load-bearing proofs that
 * the E1 `where`/partial-index ON CONFLICT binding works LIVE (not just typecheck).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
// Guard app.listen in index.ts so importing anything transitively never binds a port.
process.env.VITEST = 'true';

type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type ServiceModule = typeof import('../star-earning');
type CodeModule = typeof import('../reward-coupon-code');

let db: DbModule['db'];
let schema: SchemaModule;
let creditStarForCompletedOrder: ServiceModule['creditStarForCompletedOrder'];
let reverseStarForRefundedOrder: ServiceModule['reverseStarForRefundedOrder'];
let STAR_EARNING_MINIMUM_CENTS: ServiceModule['STAR_EARNING_MINIMUM_CENTS'];
let rewardCouponCodeGenerator: CodeModule['rewardCouponCodeGenerator'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();

let branchId: string;
// Each test gets its OWN customer + order so their user_stars / star_transactions
// state is fully isolated (no cross-test bleed on the per-user counter).
const createdOrderIds: string[] = [];
const createdUserIds: string[] = [];
// STAR-003 unlock: track reward tiers + coupons + notifications created by tests
// so afterAll can tear them down (rewards deleted AFTER coupons — coupons FK rewards).
const createdRewardIds: string[] = [];

let orderCounter = 0;
let rewardCounter = 0;

/**
 * Seed a completed order owned by a fresh user, returning both ids. `totalCents`
 * controls eligibility (converted to the `numeric(10,2)` decimal the schema
 * expects). Status defaults to 'completed'; pass an override for AC2.
 */
async function seedCompletedOrder(opts: {
  totalCents: number;
  status?: 'pending' | 'accepted' | 'preparing' | 'flavoring' | 'ready' | 'completed' | 'cancelled';
}): Promise<{ orderId: string; userId: string }> {
  orderCounter += 1;
  const [user] = await db
    .insert(schema.users)
    .values({ name: 'Star Customer', email: `star-${suffix}-${orderCounter}@example.com` })
    .returning({ id: schema.users.id });
  const userId = user!.id;
  createdUserIds.push(userId);

  const total = (opts.totalCents / 100).toFixed(2);
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: userId,
      branch_id: branchId,
      order_number: `JP-STAR-${suffix}-${String(orderCounter).padStart(3, '0')}`,
      status: opts.status ?? 'completed',
      subtotal: total,
      total,
      payment_method: 'pay_at_branch',
      placed_at: new Date(Date.now() - orderCounter * 60_000),
    })
    .returning({ id: schema.orders.id });
  const orderId = order!.id;
  createdOrderIds.push(orderId);
  return { orderId, userId };
}

/**
 * Seed a completed order for an EXISTING user (STAR-003 follow-up-order tests),
 * so a second credit bumps the same user's lifetime instead of a fresh one.
 */
async function seedCompletedOrderForUser(
  userId: string,
  opts: { totalCents: number },
): Promise<{ orderId: string }> {
  orderCounter += 1;
  const total = (opts.totalCents / 100).toFixed(2);
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: userId,
      branch_id: branchId,
      order_number: `JP-STAR-${suffix}-${String(orderCounter).padStart(3, '0')}`,
      status: 'completed',
      subtotal: total,
      total,
      payment_method: 'pay_at_branch',
      placed_at: new Date(Date.now() - orderCounter * 60_000),
    })
    .returning({ id: schema.orders.id });
  const orderId = order!.id;
  createdOrderIds.push(orderId);
  return { orderId };
}

/** Read a user's counter row (or undefined if none exists yet). */
async function getUserStars(
  userId: string,
): Promise<{ current_stars: number; lifetime_stars: number } | undefined> {
  const [row] = await db
    .select()
    .from(schema.userStars)
    .where(eq(schema.userStars.user_id, userId));
  return row;
}

/** Read the star_transactions rows for an order, optionally of a given type. */
async function getStarTx(orderId: string, type?: 'earned' | 'adjusted') {
  const cond = type
    ? and(eq(schema.starTransactions.order_id, orderId), eq(schema.starTransactions.type, type))
    : eq(schema.starTransactions.order_id, orderId);
  return db.select().from(schema.starTransactions).where(cond);
}

/**
 * Seed an active reward tier (STAR-003 unlock fixtures). Tracks the id for
 * teardown. Name is uniquified per-call so tests never collide.
 */
async function seedRewardTier(requiredStars: number, label = 'tier'): Promise<string> {
  rewardCounter += 1;
  const [reward] = await db
    .insert(schema.rewards)
    .values({
      name: `Test ${label} ${suffix}-${rewardCounter} (${requiredStars}★)`,
      required_stars: requiredStars,
      reward_type: 'free_item',
      reward_value: null,
      is_active: true,
    })
    .returning({ id: schema.rewards.id });
  const rewardId = reward!.id;
  createdRewardIds.push(rewardId);
  return rewardId;
}

/** Read the reward-coupons a user holds (reward_id set), optionally for one reward. */
async function getRewardCoupons(userId: string, rewardId?: string) {
  const cond = rewardId
    ? and(eq(schema.coupons.user_id, userId), eq(schema.coupons.reward_id, rewardId))
    : and(eq(schema.coupons.user_id, userId), isNotNull(schema.coupons.reward_id));
  return db.select().from(schema.coupons).where(cond);
}

/**
 * Pre-seed a user's lifetime near a threshold WITHOUT going through the credit
 * path (so the next real credit crosses the boundary cleanly). Directly upserts
 * user_stars. `current_stars` mirrors `lifetime` here (fine for these tests).
 */
async function setUserLifetime(userId: string, n: number): Promise<void> {
  await db
    .insert(schema.userStars)
    .values({ user_id: userId, current_stars: n, lifetime_stars: n })
    .onConflictDoUpdate({
      target: schema.userStars.user_id,
      set: { current_stars: n, lifetime_stars: n, updated_at: new Date() },
    });
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ creditStarForCompletedOrder, reverseStarForRefundedOrder, STAR_EARNING_MINIMUM_CENTS } =
    await import('../star-earning'));
  ({ rewardCouponCodeGenerator } = await import('../reward-coupon-code'));

  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `Star Branch ${suffix}`,
      slug: `star-branch-${suffix}`,
      address: '1 Star St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000031',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branchId = branch!.id;
});

afterAll(async () => {
  // Reverse-FK cleanup (STAR-003 extends this): notifications → coupons →
  // star_transactions → user_stars → orders → users → branch. Rewards are deleted
  // AFTER coupons (coupons.reward_id FK → rewards).
  const { inArray } = await import('drizzle-orm');
  if (createdUserIds.length > 0) {
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.user_id, createdUserIds));
    await db.delete(schema.coupons).where(inArray(schema.coupons.user_id, createdUserIds));
  }
  if (createdOrderIds.length > 0) {
    await db
      .delete(schema.starTransactions)
      .where(inArray(schema.starTransactions.order_id, createdOrderIds));
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(schema.userStars).where(inArray(schema.userStars.user_id, createdUserIds));
    await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
  }
  if (createdRewardIds.length > 0) {
    await db.delete(schema.rewards).where(inArray(schema.rewards.id, createdRewardIds));
  }
  if (branchId) await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  logSpy?.mockRestore();
});

describe('creditStarForCompletedOrder', () => {
  // AC1
  it('credits 1 star (current +1, lifetime +1, one earned row) for a completed eligible order', async () => {
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });

    const result = await creditStarForCompletedOrder(orderId);
    // Additive STAR-003 field: a lifetime of 1 crosses no reward tier (min is 5).
    expect(result).toEqual({ credited: true, unlockedRewardIds: [] });

    const stars = await getUserStars(userId);
    expect(stars?.current_stars).toBe(1);
    expect(stars?.lifetime_stars).toBe(1);

    const earned = await getStarTx(orderId, 'earned');
    expect(earned).toHaveLength(1);
    expect(earned[0]!.stars).toBe(1);
  });

  // AC2
  it('never credits a star for a cancelled order (returns not-completed)', async () => {
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250, status: 'cancelled' });

    const result = await creditStarForCompletedOrder(orderId);
    expect(result).toEqual({ credited: false, reason: 'not-completed' });

    expect(await getStarTx(orderId)).toHaveLength(0);
    expect(await getUserStars(userId)).toBeUndefined();
  });

  // AC4 — load-bearing idempotency proof (the ON CONFLICT partial-index binding).
  it('credits exactly one earned star when order-completed fires twice (no double-credit)', async () => {
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 500 });

    const first = await creditStarForCompletedOrder(orderId);
    expect(first).toEqual({ credited: true, unlockedRewardIds: [] });

    const second = await creditStarForCompletedOrder(orderId);
    expect(second).toEqual({ credited: false, reason: 'already-credited' });

    expect(await getStarTx(orderId, 'earned')).toHaveLength(1);
    const stars = await getUserStars(userId);
    expect(stars?.current_stars).toBe(1);
    expect(stars?.lifetime_stars).toBe(1);
  });

  // AC5 — below-minimum earns nothing (uses a >0 override at the config seam).
  it('does not earn a star for an order below the configured minimum amount', async () => {
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 100 });

    // Force a >0 minimum for this assertion; the order total (100) is below it.
    // The service reads the threshold through getStarEarningMinimumCents(), so a
    // spy on the config seam cleanly intercepts the eligibility gate.
    const config = await import('../star-earning-config');
    const spy = vi.spyOn(config, 'getStarEarningMinimumCents').mockReturnValue(500);
    try {
      const result = await creditStarForCompletedOrder(orderId);
      expect(result).toEqual({ credited: false, reason: 'below-minimum' });
    } finally {
      spy.mockRestore();
    }

    expect(await getStarTx(orderId)).toHaveLength(0);
    expect(await getUserStars(userId)).toBeUndefined();
  });

  // EDGE-3 — default minimum is 0, so any-total (incl. 0) completed order earns.
  it('earns with the default STAR_EARNING_MINIMUM_CENTS = 0 for a zero-total order', async () => {
    expect(STAR_EARNING_MINIMUM_CENTS).toBe(0);
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 0 });

    const result = await creditStarForCompletedOrder(orderId);
    expect(result).toEqual({ credited: true, unlockedRewardIds: [] });
    expect(await getStarTx(orderId, 'earned')).toHaveLength(1);
    expect((await getUserStars(userId))?.current_stars).toBe(1);
  });

  // not-found guard.
  it('returns not-found for a non-existent order id', async () => {
    const result = await creditStarForCompletedOrder('00000000-0000-0000-0000-000000000000');
    expect(result).toEqual({ credited: false, reason: 'not-found' });
  });
});

describe('reverseStarForRefundedOrder', () => {
  // AC3 — refund of an earned order nets current_stars down, lifetime monotonic.
  it('writes one adjusted (-1) row and nets current_stars down when an earned order is refunded', async () => {
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await creditStarForCompletedOrder(orderId);

    const result = await reverseStarForRefundedOrder(orderId);
    expect(result).toEqual({ reversed: true });

    const adjusted = await getStarTx(orderId, 'adjusted');
    expect(adjusted).toHaveLength(1);
    expect(adjusted[0]!.stars).toBe(-1);

    const stars = await getUserStars(userId);
    // current nets back down to 0; lifetime stays monotonic at 1 (C2 known-gap).
    expect(stars?.current_stars).toBe(0);
    expect(stars?.lifetime_stars).toBe(1);
  });

  // EDGE-1 — reversal fired twice → exactly one adjusted row, decremented once.
  it('reverses exactly once when the refund event fires twice (already-reversed)', async () => {
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await creditStarForCompletedOrder(orderId);

    const first = await reverseStarForRefundedOrder(orderId);
    expect(first).toEqual({ reversed: true });

    const second = await reverseStarForRefundedOrder(orderId);
    expect(second).toEqual({ reversed: false, reason: 'already-reversed' });

    expect(await getStarTx(orderId, 'adjusted')).toHaveLength(1);
    const stars = await getUserStars(userId);
    expect(stars?.current_stars).toBe(0);
    expect(stars?.lifetime_stars).toBe(1);
  });

  // EDGE-2 — reverse an order that never earned → no-earned-star, no adjusted row.
  it('returns no-earned-star (no adjusted row) when the order never earned', async () => {
    const { orderId } = await seedCompletedOrder({ totalCents: 1250 });

    const result = await reverseStarForRefundedOrder(orderId);
    expect(result).toEqual({ reversed: false, reason: 'no-earned-star' });
    expect(await getStarTx(orderId, 'adjusted')).toHaveLength(0);
  });

  // not-found guard.
  it('returns not-found for a non-existent order id', async () => {
    const result = await reverseStarForRefundedOrder('00000000-0000-0000-0000-000000000000');
    expect(result).toEqual({ reversed: false, reason: 'not-found' });
  });
});

/**
 * STAR-003 reward-unlock coverage.
 *
 * The hermetic `_test` DB ALSO carries the seeded 5/10/15/20 roadmap, and the
 * battle-pass unlock legitimately mints a coupon for EVERY active tier at/below
 * lifetime. So when these tests push lifetime high (100+), the roadmap tiers
 * co-unlock alongside the per-test tier. To stay deterministic, assertions target
 * the test-OWNED reward id(s) via membership + per-owned-reward coupon counts —
 * never a global coupon total or an exact `unlockedRewardIds` array that would be
 * polluted by roadmap tiers. This mirrors the production truth: a real user
 * crossing tier 105 has genuinely also earned tiers 5/10/15/20 on the way.
 */
describe('reward unlock (STAR-003)', () => {
  // AC1 — one coupon on threshold crossing (crossing 4→5 of the owned tier).
  it('crossing 4→5 mints exactly one available coupon with reward_id set', async () => {
    const rewardId = await seedRewardTier(105, 'ac1');
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await setUserLifetime(userId, 104); // next credit → 105 = threshold

    const result = await creditStarForCompletedOrder(orderId);
    expect(result.credited).toBe(true);
    expect(result.unlockedRewardIds).toContain(rewardId);

    const coupons = await getRewardCoupons(userId, rewardId);
    expect(coupons).toHaveLength(1);
    expect(coupons[0]!.reward_id).toBe(rewardId);
    expect(coupons[0]!.status).toBe('available');
    expect(coupons[0]!.code).toMatch(/^JP-RWD-[2-9A-HJ-NP-Z]{4}$/);
  });

  // AC2 — no re-unlock on a later order for an already-unlocked reward.
  it('follow-up order does not mint a second coupon for an already-unlocked reward', async () => {
    const rewardId = await seedRewardTier(115, 'ac2');
    const { orderId: o1, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await setUserLifetime(userId, 114);

    const first = await creditStarForCompletedOrder(o1);
    expect(first.unlockedRewardIds).toContain(rewardId);

    // A second, distinct completed order for the same user → lifetime bumps again
    // (115→116), still ≥ threshold, but the reward is already unlocked → NOT
    // re-unlocked (nor are the roadmap tiers, already owned from the first credit).
    const { orderId: o2 } = await seedCompletedOrderForUser(userId, { totalCents: 1250 });
    const second = await creditStarForCompletedOrder(o2);
    expect(second.credited).toBe(true);
    expect(second.unlockedRewardIds).not.toContain(rewardId); // no re-unlock
    expect(second.unlockedRewardIds).toEqual([]); // nothing new at all

    expect(await getRewardCoupons(userId, rewardId)).toHaveLength(1);
  });

  // AC3 — unlock occurs strictly as a side-effect of the credit (same path).
  it('unlock occurs as side-effect of creditStarForCompletedOrder (same path)', async () => {
    const rewardId = await seedRewardTier(125, 'ac3');
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await setUserLifetime(userId, 124);

    // Before the credit: no coupon. After: exactly one — proving the credit call
    // is the sole trigger (no separate unlock entrypoint).
    expect(await getRewardCoupons(userId, rewardId)).toHaveLength(0);
    const result = await creditStarForCompletedOrder(orderId);
    expect(result.unlockedRewardIds).toContain(rewardId);
    expect(await getRewardCoupons(userId, rewardId)).toHaveLength(1);
  });

  // AC4 — LIVE threshold read: changing required_stars mid-life is picked up.
  it('changing rewards.required_stars mid-life is picked up for a future crossing', async () => {
    const rewardId = await seedRewardTier(200, 'ac4'); // unreachable initially
    const { orderId: o1, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await setUserLifetime(userId, 134);

    const first = await creditStarForCompletedOrder(o1); // lifetime → 135, below 200
    expect(first.unlockedRewardIds).not.toContain(rewardId);
    expect(await getRewardCoupons(userId, rewardId)).toHaveLength(0);

    // ADM-005: lower the threshold LIVE to at/below current lifetime.
    await db
      .update(schema.rewards)
      .set({ required_stars: 135, updated_at: new Date() })
      .where(eq(schema.rewards.id, rewardId));

    const { orderId: o2 } = await seedCompletedOrderForUser(userId, { totalCents: 1250 });
    const second = await creditStarForCompletedOrder(o2); // lifetime → 136 ≥ 135
    expect(second.unlockedRewardIds).toContain(rewardId); // now unlocked LIVE
    expect(await getRewardCoupons(userId, rewardId)).toHaveLength(1);
  });

  // AC5 — duplicate completion events do not duplicate coupons.
  it('duplicate completion event → exactly one coupon', async () => {
    const rewardId = await seedRewardTier(145, 'ac5');
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await setUserLifetime(userId, 144);

    const first = await creditStarForCompletedOrder(orderId);
    expect(first.unlockedRewardIds).toContain(rewardId);

    // Same order fired again → idempotent-skip at the star_transactions gate →
    // unlock never runs, so no second coupon.
    const second = await creditStarForCompletedOrder(orderId);
    expect(second).toEqual({ credited: false, reason: 'already-credited' });

    expect(await getRewardCoupons(userId, rewardId)).toHaveLength(1);
  });

  // EDGE-boundary — at exactly required_stars unlocks (`<=`, not `<`).
  it('user at exactly required_stars unlocks', async () => {
    const rewardId = await seedRewardTier(150, 'boundary');
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await setUserLifetime(userId, 149); // credit → exactly 150

    const result = await creditStarForCompletedOrder(orderId);
    expect(result.unlockedRewardIds).toContain(rewardId);
    expect(await getRewardCoupons(userId, rewardId)).toHaveLength(1);
  });

  // EDGE-multi-tier — a single credit crossing two OWNED tiers mints two coupons.
  it('single credit crossing two tiers mints two coupons', async () => {
    const tierA = await seedRewardTier(160, 'multiA');
    const tierB = await seedRewardTier(161, 'multiB');
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });
    // Jump lifetime so ONE credit lands at 161, crossing BOTH 160 and 161 at once.
    await setUserLifetime(userId, 160);

    const result = await creditStarForCompletedOrder(orderId); // → 161
    expect(result.credited).toBe(true);
    // Both owned tiers unlocked in a single credit call.
    expect(result.unlockedRewardIds).toContain(tierA);
    expect(result.unlockedRewardIds).toContain(tierB);
    expect(await getRewardCoupons(userId, tierA)).toHaveLength(1);
    expect(await getRewardCoupons(userId, tierB)).toHaveLength(1);
  });

  // EDGE-no-reset — refund after unlock does NOT revoke; lifetime stays monotonic.
  it('refund after unlock does not revoke coupon; lifetime stays monotonic', async () => {
    const rewardId = await seedRewardTier(170, 'noreset');
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await setUserLifetime(userId, 169);

    const credit = await creditStarForCompletedOrder(orderId); // → 170, unlocks
    expect(credit.unlockedRewardIds).toContain(rewardId);

    const refund = await reverseStarForRefundedOrder(orderId);
    expect(refund).toEqual({ reversed: true });

    // Coupon survives; lifetime stays 170 (current decrements to 169).
    expect(await getRewardCoupons(userId, rewardId)).toHaveLength(1);
    const stars = await getUserStars(userId);
    expect(stars?.lifetime_stars).toBe(170);
    expect(stars?.current_stars).toBe(169);
  });

  // EDGE-deal-coupon — a reward_id=NULL deal-coupon is exempt from the partial
  // index and never counted as an unlock.
  it('deal-coupon (reward_id NULL) does not block reward-coupon insert nor count as unlock', async () => {
    const rewardId = await seedRewardTier(180, 'deal');
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await setUserLifetime(userId, 179);

    // Seed TWO deal-coupons (reward_id NULL) for the user — allowed because the
    // partial unique index excludes NULL reward_id rows.
    await db.insert(schema.coupons).values([
      { user_id: userId, reward_id: null, code: `JP-DEAL-${suffix}-1` },
      { user_id: userId, reward_id: null, code: `JP-DEAL-${suffix}-2` },
    ]);

    const result = await creditStarForCompletedOrder(orderId); // → 180
    expect(result.unlockedRewardIds).toContain(rewardId); // reward unlocked
    // Deal-coupons (reward_id NULL) are never counted as an unlock.
    expect(result.unlockedRewardIds).not.toContain(null);

    // The reward-coupon still minted despite the two deal-coupons present.
    expect(await getRewardCoupons(userId, rewardId)).toHaveLength(1);
  });

  // Code-collision retry — a forced first-attempt code collision recovers via the
  // per-insert savepoint (in-tx retry).
  it('retries on a coupons.code collision and still mints exactly one coupon', async () => {
    // Owned tier BELOW every roadmap tier and pre-unlock the roadmap first, so the
    // ONLY new unlock (and thus the ONLY code-generating insert) in the measured
    // credit is this tier — making the forced single collision deterministic.
    const { orderId: warmupOrder, userId } = await seedCompletedOrder({ totalCents: 1250 });
    await setUserLifetime(userId, 189);
    await creditStarForCompletedOrder(warmupOrder); // → 190, unlocks all roadmap tiers

    const rewardId = await seedRewardTier(191, 'collision');
    const { orderId } = await seedCompletedOrderForUser(userId, { totalCents: 1250 });

    // Pre-occupy a code, then force the generator to return it once so the first
    // insert attempt hits the coupons_code_unique constraint and must retry.
    const takenCode = `JP-RWD-TAKN`;
    const { userId: otherUser } = await seedCompletedOrder({ totalCents: 100 });
    await db
      .insert(schema.coupons)
      .values({ user_id: otherUser, reward_id: null, code: takenCode });

    const realGen = rewardCouponCodeGenerator.generate;
    const spy = vi
      .spyOn(rewardCouponCodeGenerator, 'generate')
      .mockImplementationOnce(() => takenCode) // first attempt collides
      .mockImplementation(() => realGen());
    try {
      const result = await creditStarForCompletedOrder(orderId); // → 191, unlocks owned tier
      expect(result.unlockedRewardIds).toContain(rewardId);
    } finally {
      spy.mockRestore();
    }
    expect(await getRewardCoupons(userId, rewardId)).toHaveLength(1);
  });
});
