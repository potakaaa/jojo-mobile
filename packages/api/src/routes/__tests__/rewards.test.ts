/* eslint-disable @typescript-eslint/no-explicit-any -- supertest JSON bodies are
   loosely typed at the test boundary; assertions narrow them per case. */
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the Phase 1 rewards backend:
 *   - Stars accrual on order completion (via the real staff PATCH path), gated by
 *     the ₱100 minimum subtotal, idempotent, and skipped for cancel/reject.
 *   - GET /rewards public catalog.
 *   - GET /rewards/balance (session-gated) shape.
 *   - POST /rewards/:id/redeem: decrement + coupon issue, insufficient → 400,
 *     and a row-locked concurrent-redeem race that cannot double-spend.
 *
 * Hermetic: seeds its OWN branch/staff/customers/rewards, asserts by id/user, and
 * cleans up in afterAll. Runs against a real local Postgres:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type AuthModule = typeof import('../../lib/auth');
type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type IndexModule = typeof import('../../index');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let schema: SchemaModule;
let app: IndexModule['app'];
let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();

let branchId: string;
let categoryId: string;
let productId: string;
let staffCookies: string[];

// Reward fixtures.
let activeRewardId: string; // required_stars 5, active
let inactiveRewardId: string; // active:false (catalog + redeem 404)

const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];
let orderCounter = 0;

async function signUpAndGetCookie(email: string, password: string): Promise<string[]> {
  await auth.api.signUpEmail({ body: { email, password, name: 'Test User' } });
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .set('Content-Type', 'application/json');
  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c: string) => c.split(';')[0]!);
}

/** Sign up a customer and return { id, cookies } (id read back from the users table). */
async function signUpCustomer(label: string): Promise<{ id: string; cookies: string[] }> {
  const email = `${label}-rw-${suffix}@example.com`;
  const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  createdUserIds.push(row!.id);
  return { id: row!.id, cookies };
}

/** Insert a raw (non-auth) customer used only as an order owner. */
async function insertRawUser(label: string): Promise<string> {
  const [row] = await db
    .insert(schema.users)
    .values({ name: label, email: `${label}-rw-${suffix}@example.com` })
    .returning({ id: schema.users.id });
  createdUserIds.push(row!.id);
  return row!.id;
}

async function insertOrder(opts: {
  userId: string;
  status: 'pending' | 'ready';
  subtotal: string;
}): Promise<string> {
  orderCounter += 1;
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: opts.userId,
      branch_id: branchId,
      order_number: `JP-RW-${suffix}-${String(orderCounter).padStart(3, '0')}`,
      status: opts.status,
      subtotal: opts.subtotal,
      total: opts.subtotal,
      payment_method: 'pay_at_branch',
      placed_at: new Date(Date.now() - orderCounter * 60_000),
    })
    .returning({ id: schema.orders.id });
  createdOrderIds.push(order!.id);
  return order!.id;
}

async function patchOrderStatus(orderId: string, status: string) {
  return request(app)
    .patch(`/api/staff/orders/${orderId}`)
    .set('Cookie', staffCookies.join('; '))
    .send({ status });
}

async function readStars(userId: string): Promise<{ current: number; lifetime: number } | null> {
  const [row] = await db
    .select()
    .from(schema.userStars)
    .where(eq(schema.userStars.user_id, userId));
  return row ? { current: row.current_stars, lifetime: row.lifetime_stars } : null;
}

async function seedStars(userId: string, current: number, lifetime: number): Promise<void> {
  await db
    .insert(schema.userStars)
    .values({ user_id: userId, current_stars: current, lifetime_stars: lifetime })
    .onConflictDoUpdate({
      target: schema.userStars.user_id,
      set: { current_stars: current, lifetime_stars: lifetime, updated_at: new Date() },
    });
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../lib/auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));

  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `RW Branch ${suffix}`,
      slug: `rw-branch-${suffix}`,
      address: '1 Reward St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000051',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 15,
    })
    .returning({ id: schema.branches.id });
  branchId = branch!.id;

  const [category] = await db
    .insert(schema.categories)
    .values({ name: `Cat RW ${suffix}`, slug: `cat-rw-${suffix}`, sort_order: 1 })
    .returning({ id: schema.categories.id });
  categoryId = category!.id;

  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `Fries RW ${suffix}`,
      slug: `fries-rw-${suffix}`,
      base_price: '5.00',
    })
    .returning({ id: schema.products.id });
  productId = product!.id;

  // Staff assigned to the branch (drives the order-completion accrual path).
  const staffEmail = `staff-rw-${suffix}@example.com`;
  staffCookies = await signUpAndGetCookie(staffEmail, 'sup3r-secret-pw');
  const [staffRow] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, staffEmail));
  createdUserIds.push(staffRow!.id);
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: branchId })
    .where(eq(schema.users.email, staffEmail));

  // Reward fixtures.
  const [activeReward] = await db
    .insert(schema.rewards)
    .values({
      name: `Free Fries ${suffix}`,
      required_stars: 5,
      reward_type: 'free_item',
      reward_value: '50.00',
      eligible_product_id: productId,
      is_active: true,
    })
    .returning({ id: schema.rewards.id });
  activeRewardId = activeReward!.id;

  const [inactiveReward] = await db
    .insert(schema.rewards)
    .values({
      name: `Inactive Reward ${suffix}`,
      required_stars: 3,
      reward_type: 'free_item',
      is_active: false,
    })
    .returning({ id: schema.rewards.id });
  inactiveRewardId = inactiveReward!.id;
});

afterAll(async () => {
  const { inArray } = await import('drizzle-orm');
  if (createdUserIds.length > 0) {
    // PUSH-004 merge: a `cancelled` transition now writes a real `notifications`
    // row (notifications_user_id_users_id_fk) — delete it before the user.
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.user_id, createdUserIds));
    await db.delete(schema.coupons).where(inArray(schema.coupons.user_id, createdUserIds));
    await db
      .delete(schema.starTransactions)
      .where(inArray(schema.starTransactions.user_id, createdUserIds));
    await db.delete(schema.userStars).where(inArray(schema.userStars.user_id, createdUserIds));
  }
  if (createdOrderIds.length > 0) {
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  await db
    .update(schema.users)
    .set({ assignedBranchId: null })
    .where(eq(schema.users.assignedBranchId, branchId));
  if (createdUserIds.length > 0) {
    await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
  }
  await db
    .delete(schema.rewards)
    .where(inArray(schema.rewards.id, [activeRewardId, inactiveRewardId]));
  await db.delete(schema.products).where(eq(schema.products.id, productId));
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  logSpy?.mockRestore();
});

// ─── Accrual on order completion ─────────────────────────────────────────────

describe('stars accrual on order completion', () => {
  it('credits exactly 1 star when a ≥₱100 order is completed, and does not double-credit on re-PATCH', async () => {
    const earnCustomer = await signUpCustomer('earn');
    const orderId = await insertOrder({
      userId: earnCustomer.id,
      status: 'ready',
      subtotal: '150.00',
    });

    const res = await patchOrderStatus(orderId, 'completed');
    expect(res.status).toBe(200);

    const stars = await readStars(earnCustomer.id);
    expect(stars).toEqual({ current: 1, lifetime: 1 });

    const earnedTx = await db
      .select()
      .from(schema.starTransactions)
      .where(
        and(
          eq(schema.starTransactions.order_id, orderId),
          eq(schema.starTransactions.type, 'earned'),
        ),
      );
    expect(earnedTx).toHaveLength(1);
    expect(earnedTx[0]!.stars).toBe(1);

    // Re-PATCH to completed is illegal (terminal) → 409, so no double-credit.
    const again = await patchOrderStatus(orderId, 'completed');
    expect(again.status).toBe(409);
    expect(await readStars(earnCustomer.id)).toEqual({ current: 1, lifetime: 1 });

    // Balance reflects the earned star with tier-free progress.
    const balance = await request(app)
      .get('/rewards/balance')
      .set('Cookie', earnCustomer.cookies.join('; '));
    expect(balance.status).toBe(200);
    expect(balance.body).toEqual({
      currentStars: 1,
      lifetimeStars: 1,
      rewardThreshold: 5,
      starsToNextReward: 4,
    });
  });

  it('credits 0 stars when a below-₱100 order is completed', async () => {
    const userId = await insertRawUser('noearn');
    const orderId = await insertOrder({ userId, status: 'ready', subtotal: '50.00' });

    const res = await patchOrderStatus(orderId, 'completed');
    expect(res.status).toBe(200);

    expect(await readStars(userId)).toBeNull(); // no user_stars row created
    const tx = await db
      .select()
      .from(schema.starTransactions)
      .where(eq(schema.starTransactions.order_id, orderId));
    expect(tx).toHaveLength(0);
  });

  it('credits 0 stars when an order is cancelled', async () => {
    const userId = await insertRawUser('cancel');
    const orderId = await insertOrder({ userId, status: 'pending', subtotal: '150.00' });

    const res = await patchOrderStatus(orderId, 'cancelled');
    expect(res.status).toBe(200);
    expect(await readStars(userId)).toBeNull();
  });

  it('credits 0 stars when an order is rejected', async () => {
    const userId = await insertRawUser('reject');
    const orderId = await insertOrder({ userId, status: 'pending', subtotal: '150.00' });

    const res = await patchOrderStatus(orderId, 'rejected');
    expect(res.status).toBe(200);
    expect(await readStars(userId)).toBeNull();
  });
});

// ─── GET /rewards (public catalog) ───────────────────────────────────────────

describe('GET /rewards', () => {
  it('returns active rewards (own fixture present, inactive absent) with cents money shape, no session', async () => {
    const res = await request(app).get('/rewards');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rewards)).toBe(true);
    const byId = new Map(res.body.rewards.map((r: any) => [r.id, r]));
    expect(byId.has(activeRewardId)).toBe(true);
    expect(byId.has(inactiveRewardId)).toBe(false);

    const active: any = byId.get(activeRewardId);
    expect(active.requiredStars).toBe(5);
    expect(active.rewardType).toBe('free_item');
    expect(active.rewardValue).toBe(5000); // ₱50.00 → cents
    expect(active.isActive).toBe(true);
  });
});

// ─── GET /rewards/balance ────────────────────────────────────────────────────

describe('GET /rewards/balance', () => {
  it('401s without a session', async () => {
    const res = await request(app).get('/rewards/balance');
    expect(res.status).toBe(401);
  });

  it('returns a zeroed tier-free balance for a user with no stars', async () => {
    const fresh = await signUpCustomer('freshbal');
    const res = await request(app).get('/rewards/balance').set('Cookie', fresh.cookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      currentStars: 0,
      lifetimeStars: 0,
      rewardThreshold: 5,
      starsToNextReward: 5,
    });
  });
});

// ─── POST /rewards/:id/redeem ────────────────────────────────────────────────

describe('POST /rewards/:id/redeem', () => {
  it('401s without a session', async () => {
    const res = await request(app).post(`/rewards/${activeRewardId}/redeem`);
    expect(res.status).toBe(401);
  });

  it('redeems: decrements current_stars by the cost, leaves lifetime untouched, and issues a coupon', async () => {
    const customer = await signUpCustomer('redeem');
    await seedStars(customer.id, 10, 10);

    const res = await request(app)
      .post(`/rewards/${activeRewardId}/redeem`)
      .set('Cookie', customer.cookies.join('; '));
    expect(res.status).toBe(201);
    expect(res.body.coupon.status).toBe('available');
    expect(res.body.coupon.rewardId).toBe(activeRewardId);
    expect(res.body.coupon.userId).toBe(customer.id);
    expect(typeof res.body.coupon.code).toBe('string');
    expect(res.body.coupon.code.length).toBeGreaterThan(0);
    expect(res.body.coupon.expiresAt).not.toBeNull();

    // current decremented by 5 (not reset); lifetime untouched.
    expect(await readStars(customer.id)).toEqual({ current: 5, lifetime: 10 });

    // A redeemed star_transaction + a coupon row exist.
    const redeemedTx = await db
      .select()
      .from(schema.starTransactions)
      .where(
        and(
          eq(schema.starTransactions.user_id, customer.id),
          eq(schema.starTransactions.type, 'redeemed'),
        ),
      );
    expect(redeemedTx).toHaveLength(1);
    expect(redeemedTx[0]!.stars).toBe(5);

    const couponRows = await db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.user_id, customer.id));
    expect(couponRows).toHaveLength(1);
    expect(couponRows[0]!.reward_id).toBe(activeRewardId);
    expect(couponRows[0]!.status).toBe('available');
  });

  it('rejects insufficient stars with 400 and makes no mutation', async () => {
    const customer = await signUpCustomer('insuf');
    await seedStars(customer.id, 2, 2);

    const res = await request(app)
      .post(`/rewards/${activeRewardId}/redeem`)
      .set('Cookie', customer.cookies.join('; '));
    expect(res.status).toBe(400);

    // Unchanged — no decrement, no coupon.
    expect(await readStars(customer.id)).toEqual({ current: 2, lifetime: 2 });
    const couponRows = await db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.user_id, customer.id));
    expect(couponRows).toHaveLength(0);
  });

  it('404s an unknown reward and a malformed id', async () => {
    const customer = await signUpCustomer('rw404');
    await seedStars(customer.id, 10, 10);
    const cookie = customer.cookies.join('; ');

    const unknown = await request(app)
      .post('/rewards/00000000-0000-4000-8000-000000000000/redeem')
      .set('Cookie', cookie);
    expect(unknown.status).toBe(404);

    const malformed = await request(app).post('/rewards/not-a-uuid/redeem').set('Cookie', cookie);
    expect(malformed.status).toBe(404);
  });

  it('serializes concurrent redeems via the row lock — exactly one succeeds, balance never goes negative', async () => {
    const customer = await signUpCustomer('race');
    await seedStars(customer.id, 5, 5); // exactly enough for ONE redeem.
    const cookie = customer.cookies.join('; ');

    const [a, b] = await Promise.all([
      request(app).post(`/rewards/${activeRewardId}/redeem`).set('Cookie', cookie),
      request(app).post(`/rewards/${activeRewardId}/redeem`).set('Cookie', cookie),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);

    // The row lock prevents a lost update: exactly one decrement, never negative.
    expect(await readStars(customer.id)).toEqual({ current: 0, lifetime: 5 });
    const couponRows = await db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.user_id, customer.id));
    expect(couponRows).toHaveLength(1);
  });
});
