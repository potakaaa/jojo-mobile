import { and, eq } from 'drizzle-orm';
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

let db: DbModule['db'];
let schema: SchemaModule;
let creditStarForCompletedOrder: ServiceModule['creditStarForCompletedOrder'];
let reverseStarForRefundedOrder: ServiceModule['reverseStarForRefundedOrder'];
let STAR_EARNING_MINIMUM_CENTS: ServiceModule['STAR_EARNING_MINIMUM_CENTS'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();

let branchId: string;
// Each test gets its OWN customer + order so their user_stars / star_transactions
// state is fully isolated (no cross-test bleed on the per-user counter).
const createdOrderIds: string[] = [];
const createdUserIds: string[] = [];

let orderCounter = 0;

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

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ creditStarForCompletedOrder, reverseStarForRefundedOrder, STAR_EARNING_MINIMUM_CENTS } =
    await import('../star-earning'));

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
  // Reverse-FK cleanup: star_transactions → user_stars → orders → users → branch.
  const { inArray } = await import('drizzle-orm');
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
  if (branchId) await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  logSpy?.mockRestore();
});

describe('creditStarForCompletedOrder', () => {
  // AC1
  it('credits 1 star (current +1, lifetime +1, one earned row) for a completed eligible order', async () => {
    const { orderId, userId } = await seedCompletedOrder({ totalCents: 1250 });

    const result = await creditStarForCompletedOrder(orderId);
    expect(result).toEqual({ credited: true });

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
    expect(first).toEqual({ credited: true });

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
    expect(result).toEqual({ credited: true });
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
