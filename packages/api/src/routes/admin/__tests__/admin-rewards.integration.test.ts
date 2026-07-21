import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin Reward CRUD surface (ADM-005, #43) — run against
 * a real local Postgres, mirroring `admin-offers.integration.test.ts`.
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers the validate-contract Test Gates (all Fully-Automated):
 *   G1 (AC2a, HARD) — required_stars PATCH 5→3 leaves every star_transactions row unchanged.
 *   G2 (AC2b, HARD) — required_stars/reward_value PATCH leaves every issued coupon row unchanged.
 *   G3 (AC3, HARD)  — deactivation stops NEW unlock minting; a pre-issued available
 *                     coupon is unchanged and still redeems at POST /coupons/apply.
 *   G4 (AC1)        — a reward created/edited via admin API is live-read by /rewards/summary + /available.
 *   G5 (AC4, D1)    — multi-tier determinism (MIN-active target, one coupon per tier,
 *                     lower→next-credit-only unlock, raise→no revocation).
 *   G6 (AC5)        — CRUD round-trips; no hard DELETE route exists.
 *   G7 (AC5)        — allow-list rejection, D4 cross-field 4xx, nonexistent product → 404.
 *   G8 (AC6)        — customer + staff → 403 on every /api/admin/rewards/* route.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type AuthModule = typeof import('../../../lib/auth');
type DbModule = typeof import('../../../db/client');
type SchemaModule = typeof import('../../../db/schema/index');
type IndexModule = typeof import('../../../index');
type StarEarningModule = typeof import('../../../lib/star-earning');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let schema: SchemaModule;
let app: IndexModule['app'];
let creditStarForCompletedOrder: StarEarningModule['creditStarForCompletedOrder'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

let adminCookies: string[];
let staffCookies: string[];
let customerCookies: string[];

// Hermetic fixtures created in beforeAll (a branch + category + product + its
// availability), cleaned up in afterAll.
let branchId: string;
let categoryId: string;
let productId: string; // active, non-deal, available at branchId — a valid eligible product

const createdUserIds: string[] = [];
const createdRewardIds: string[] = [];
const createdOrderIds: string[] = [];

async function signUpAndGetCookie(email: string, password: string): Promise<string[]> {
  await auth.api.signUpEmail({ body: { email, password, name: 'Test User' } });
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .set('Content-Type', 'application/json');
  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c) => c.split(';')[0]!);
}

async function makeUser(
  roleValue: 'customer' | 'staff' | 'admin' | 'super_admin',
): Promise<{ email: string; cookies: string[]; id: string }> {
  const email = `${roleValue}-${unique()}@example.com`;
  const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
  if (roleValue !== 'customer') {
    await db.update(schema.users).set({ role: roleValue }).where(eq(schema.users.email, email));
  }
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (!row) throw new Error('Test setup: failed to read back created user');
  createdUserIds.push(row.id);
  return { email, cookies, id: row.id };
}

function rewardPayload(overrides: Record<string, unknown> = {}) {
  const suffix = unique();
  return {
    name: `Reward ${suffix}`,
    requiredStars: 5,
    rewardType: 'free_item',
    eligibleProductId: productId,
    ...overrides,
  };
}

async function createReward(
  cookies: string[],
  overrides: Record<string, unknown> = {},
): Promise<request.Response> {
  const res = await request(app)
    .post('/api/admin/rewards')
    .set('Cookie', cookies.join('; '))
    .send(rewardPayload(overrides))
    .set('Content-Type', 'application/json');
  if (res.status === 201 && res.body.reward?.id) createdRewardIds.push(res.body.reward.id);
  return res;
}

function patchReward(
  cookies: string[],
  id: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(app)
    .patch(`/api/admin/rewards/${id}`)
    .set('Cookie', cookies.join('; '))
    .send(body)
    .set('Content-Type', 'application/json');
}

/** Directly seed a reward row (bypassing the admin route) — used where a test needs
 *  a specific pre-existing shape (e.g. a legacy/low-threshold tier). */
async function seedRewardRow(values: {
  name: string;
  required_stars: number;
  reward_type: string;
  reward_value?: string | null;
  eligible_product_id?: string | null;
  is_active?: boolean;
}): Promise<string> {
  const [row] = await db.insert(schema.rewards).values(values).returning();
  createdRewardIds.push(row!.id);
  return row!.id;
}

/** Seed a COMPLETED order for a user (so creditStarForCompletedOrder credits a star). */
async function seedCompletedOrder(userId: string): Promise<string> {
  const [row] = await db
    .insert(schema.orders)
    .values({
      user_id: userId,
      branch_id: branchId,
      order_number: `JP-TEST-${unique().toUpperCase()}`,
      status: 'completed',
      subtotal: '5.00',
      total: '5.00',
      payment_method: 'pay_at_branch',
      placed_at: new Date(),
    })
    .returning();
  createdOrderIds.push(row!.id);
  return row!.id;
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  schema = await import('../../../db/schema/index');
  ({ app } = await import('../../../index'));
  ({ creditStarForCompletedOrder } = await import('../../../lib/star-earning'));

  adminCookies = (await makeUser('admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  customerCookies = (await makeUser('customer')).cookies;

  const suffix = unique();
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `RwdCat ${suffix}`, slug: `rwd-cat-${suffix}`, sort_order: 1 })
    .returning();
  categoryId = category!.id;
  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `RwdProduct ${suffix}`,
      slug: `rwd-product-${suffix}`,
      base_price: '5.00',
    })
    .returning();
  productId = product!.id;
  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `RwdBranch ${suffix}`,
      slug: `rwd-branch-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000099',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 15,
    })
    .returning();
  branchId = branch!.id;
  await db
    .insert(schema.branchProductAvailability)
    .values({ branch_id: branchId, product_id: productId, is_available: true });
});

afterAll(async () => {
  // FK-safe teardown order.
  if (createdUserIds.length > 0) {
    await db.delete(schema.coupons).where(inArray(schema.coupons.user_id, createdUserIds));
  }
  if (createdRewardIds.length > 0) {
    await db.delete(schema.coupons).where(inArray(schema.coupons.reward_id, createdRewardIds));
  }
  if (createdUserIds.length > 0) {
    await db
      .delete(schema.starTransactions)
      .where(inArray(schema.starTransactions.user_id, createdUserIds));
    await db.delete(schema.userStars).where(inArray(schema.userStars.user_id, createdUserIds));
  }
  if (createdOrderIds.length > 0) {
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  if (createdRewardIds.length > 0) {
    await db.delete(schema.rewards).where(inArray(schema.rewards.id, createdRewardIds));
  }
  await db
    .delete(schema.branchProductAvailability)
    .where(eq(schema.branchProductAvailability.branch_id, branchId));
  await db.delete(schema.products).where(eq(schema.products.id, productId));
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  logSpy?.mockRestore();
  vi.restoreAllMocks();
});

describe('G1 (AC2a, HARD) — required_stars edit never rewrites star history', () => {
  it('PATCH required_stars 5→3 leaves every existing star_transactions row byte-for-byte unchanged', async () => {
    const user = await makeUser('customer');
    const rewardId = await seedRewardRow({
      name: `G1 Reward ${unique()}`,
      required_stars: 5,
      reward_type: 'free_item',
      eligible_product_id: productId,
    });

    // Seed some star history for this user (direct rows — order_id null, no unique
    // constraint applies).
    await db.insert(schema.starTransactions).values([
      { user_id: user.id, type: 'earned', stars: 1, description: 'seed 1' },
      { user_id: user.id, type: 'earned', stars: 1, description: 'seed 2' },
    ]);

    const before = await db
      .select()
      .from(schema.starTransactions)
      .where(eq(schema.starTransactions.user_id, user.id));

    const res = await patchReward(adminCookies, rewardId, { requiredStars: 3 });
    expect(res.status).toBe(200);
    expect(res.body.reward.requiredStars).toBe(3);

    const after = await db
      .select()
      .from(schema.starTransactions)
      .where(eq(schema.starTransactions.user_id, user.id));

    // Deep-equal snapshot: nothing about the ledger changed.
    expect(after).toEqual(before);
  });
});

describe('G2 (AC2b, HARD) — required_stars/reward_value edit never mutates issued coupons', () => {
  it('PATCH leaves every previously-issued coupons row byte-for-byte unchanged', async () => {
    const user = await makeUser('customer');
    // A discount reward so we can PATCH BOTH required_stars and reward_value.
    const rewardId = await seedRewardRow({
      name: `G2 Reward ${unique()}`,
      required_stars: 5,
      reward_type: 'fixed_discount',
      reward_value: '50.00',
    });
    // A pre-issued reward coupon linked to it.
    await db.insert(schema.coupons).values({
      user_id: user.id,
      reward_id: rewardId,
      code: `JP-G2-${unique().toUpperCase()}`,
    });

    const before = await db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.user_id, user.id));

    const res = await patchReward(adminCookies, rewardId, {
      requiredStars: 3,
      rewardValueCents: 7500,
    });
    expect(res.status).toBe(200);
    expect(res.body.reward.requiredStars).toBe(3);
    expect(res.body.reward.rewardValue).toBe(7500);

    const after = await db.select().from(schema.coupons).where(eq(schema.coupons.user_id, user.id));

    expect(after).toEqual(before);
  });
});

describe('G3 (AC3, HARD) — deactivate stops NEW unlocks; pre-issued coupon survives + still applies', () => {
  it('deactivating a reward mints no new coupon on the next crossing credit', async () => {
    const user = await makeUser('customer');
    const rewardId = await seedRewardRow({
      name: `G3a Reward ${unique()}`,
      required_stars: 1,
      reward_type: 'free_item',
      eligible_product_id: productId,
    });

    // Deactivate BEFORE any credit.
    const patch = await patchReward(adminCookies, rewardId, { isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body.reward.isActive).toBe(false);

    // A completed order → credit 1 star → lifetime crosses 1, but the reward is
    // inactive, so unlockRewardsForLifetime skips it.
    const orderId = await seedCompletedOrder(user.id);
    const result = await creditStarForCompletedOrder(orderId);
    expect(result.credited).toBe(true);
    expect(result.unlockedRewardIds).not.toContain(rewardId);

    const [minted] = await db
      .select()
      .from(schema.coupons)
      .where(and(eq(schema.coupons.user_id, user.id), eq(schema.coupons.reward_id, rewardId)));
    expect(minted).toBeUndefined();
  });

  it('a pre-issued available coupon stays unchanged and still redeems after deactivation', async () => {
    const user = await makeUser('customer');
    const rewardId = await seedRewardRow({
      name: `G3b Reward ${unique()}`,
      required_stars: 1,
      reward_type: 'free_item',
      eligible_product_id: productId,
    });
    const code = `JP-G3B-${unique().toUpperCase()}`;
    await db
      .insert(schema.coupons)
      .values({ user_id: user.id, reward_id: rewardId, code, status: 'available' });
    // Star Expendable: the shared resolver rejects a reward preview when the caller
    // can't afford `required_stars` (1 here). Seed a covering balance so this test
    // exercises what it means to (pre-issued coupon survives deactivation + redeems),
    // not the new insufficient-balance guard.
    await db
      .insert(schema.userStars)
      .values({ user_id: user.id, current_stars: 5, lifetime_stars: 5 });

    const before = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));

    // Deactivate the reward.
    const patch = await patchReward(adminCookies, rewardId, { isActive: false });
    expect(patch.status).toBe(200);

    // The pre-issued coupon still redeems (coupon-apply does NOT filter rewards.is_active).
    const apply = await request(app)
      .post('/coupons/apply')
      .set('Cookie', user.cookies.join('; '))
      .send({ code, pickupBranchId: branchId, cartItems: [{ productId, quantity: 1 }] })
      .set('Content-Type', 'application/json');
    expect(apply.status).toBe(200);
    expect(apply.body.discount.source).toBe('reward');
    expect(apply.body.discount.amountCents).toBe(500); // one free unit at base 5.00

    // Coupon row byte-for-byte unchanged (apply is zero-mutation).
    const after = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(after).toEqual(before);
  });
});

describe('G4 (AC1) — admin reward edits are live-read by the public rewards routes', () => {
  it('a created reward is reflected by /rewards/summary and /available without redeploy', async () => {
    const customer = await makeUser('customer');
    const name = `G4 Reward ${unique()}`;
    // required_stars 1 → the new global MIN active reward (seed min is 4).
    const created = await createReward(adminCookies, {
      name,
      requiredStars: 1,
      rewardType: 'free_item',
      eligibleProductId: productId,
    });
    expect(created.status).toBe(201);
    const rewardId = created.body.reward.id as string;

    const summary = await request(app)
      .get('/rewards/summary')
      .set('Cookie', customer.cookies.join('; '));
    expect(summary.status).toBe(200);
    expect(summary.body.requiredStars).toBe(1);
    expect(summary.body.reward.id).toBe(rewardId);

    const available = await request(app)
      .get('/rewards/available')
      .set('Cookie', customer.cookies.join('; '));
    expect(available.status).toBe(200);
    const found = available.body.rewards.find((r: { id: string }) => r.id === rewardId);
    expect(found).toBeDefined();
    expect(found.requiredStars).toBe(1);

    // Edit required_stars 1→2 → immediately reflected on the next request.
    const patched = await patchReward(adminCookies, rewardId, { requiredStars: 2 });
    expect(patched.status).toBe(200);
    const summary2 = await request(app)
      .get('/rewards/summary')
      .set('Cookie', customer.cookies.join('; '));
    expect(summary2.body.requiredStars).toBe(2);

    // Deactivate so this low tier doesn't pollute other suites' /summary global min.
    await patchReward(adminCookies, rewardId, { isActive: false });
  });
});

describe('G5 (AC4, D1) — multiple concurrent active rewards are deterministic', () => {
  it('MIN-active summary target, one coupon per crossed tier, lower→next-credit-only, raise→no revocation', async () => {
    // Three concurrent active tiers below the seed min (4) so THIS set is the world
    // the crediting user sees at lifetimes 1..3.
    const t1 = await seedRewardRow({
      name: `G5 T1 ${unique()}`,
      required_stars: 1,
      reward_type: 'free_item',
      eligible_product_id: productId,
    });
    const t2 = await seedRewardRow({
      name: `G5 T2 ${unique()}`,
      required_stars: 2,
      reward_type: 'free_item',
      eligible_product_id: productId,
    });
    const t3 = await seedRewardRow({
      name: `G5 T3 ${unique()}`,
      required_stars: 3,
      reward_type: 'free_item',
      eligible_product_id: productId,
    });

    // (a) MIN-active summary target = 1.
    const freshCustomer = await makeUser('customer');
    const summary = await request(app)
      .get('/rewards/summary')
      .set('Cookie', freshCustomer.cookies.join('; '));
    expect(summary.body.requiredStars).toBe(1);
    expect(summary.body.reward.id).toBe(t1);

    // (b) One coupon per crossed tier — a credit mints each tier exactly once and
    //     never re-mints an already-held tier. (Assertions are subset-based: other
    //     active rewards seeded by earlier tests may also be at/below these
    //     thresholds; the DETERMINISM being proven is "each tier crossed → exactly
    //     one coupon, never a duplicate", which holds regardless of the wider set.)
    const seq = await makeUser('customer');
    const o1 = await seedCompletedOrder(seq.id);
    const r1 = await creditStarForCompletedOrder(o1);
    expect(r1.unlockedRewardIds).toContain(t1); // lifetime 1 crosses t1
    const o2 = await seedCompletedOrder(seq.id);
    const r2 = await creditStarForCompletedOrder(o2);
    expect(r2.unlockedRewardIds).toContain(t2); // lifetime 2 crosses t2
    expect(r2.unlockedRewardIds).not.toContain(t1); // t1 already held — not re-minted
    const o3 = await seedCompletedOrder(seq.id);
    const r3 = await creditStarForCompletedOrder(o3);
    expect(r3.unlockedRewardIds).toContain(t3); // lifetime 3 crosses t3
    expect(r3.unlockedRewardIds).not.toContain(t1);
    expect(r3.unlockedRewardIds).not.toContain(t2);
    // Exactly one coupon per tier for seq across t1/t2/t3 (no double-mint).
    const seqTierCoupons = await db
      .select()
      .from(schema.coupons)
      .where(
        and(eq(schema.coupons.user_id, seq.id), inArray(schema.coupons.reward_id, [t1, t2, t3])),
      );
    expect(seqTierCoupons).toHaveLength(3);
    expect(new Set(seqTierCoupons.map((c) => c.reward_id))).toEqual(new Set([t1, t2, t3]));

    // (c) Multi-cross in ONE credit — pre-seed lifetime 2, credit once (→3) mints all
    //     three tiers the user does not yet hold, in a single credit.
    const multi = await makeUser('customer');
    await db
      .insert(schema.userStars)
      .values({ user_id: multi.id, current_stars: 2, lifetime_stars: 2 });
    const om = await seedCompletedOrder(multi.id);
    const rm = await creditStarForCompletedOrder(om);
    for (const id of [t1, t2, t3]) expect(rm.unlockedRewardIds).toContain(id);
    const multiTierCoupons = await db
      .select()
      .from(schema.coupons)
      .where(
        and(eq(schema.coupons.user_id, multi.id), inArray(schema.coupons.reward_id, [t1, t2, t3])),
      );
    expect(multiTierCoupons).toHaveLength(3);

    // (d) Lower a threshold → an already-past user is unlocked only on the NEXT credit.
    const highReward = await seedRewardRow({
      name: `G5 High ${unique()}`,
      required_stars: 20,
      reward_type: 'free_item',
      eligible_product_id: productId,
    });
    const lowerUser = await makeUser('customer');
    // Give them lifetime 5 (past the soon-to-be-lowered 3 threshold) but no coupon
    // for highReward yet.
    await db
      .insert(schema.userStars)
      .values({ user_id: lowerUser.id, current_stars: 5, lifetime_stars: 5 });
    await patchReward(adminCookies, highReward, { requiredStars: 3 }); // 20 → 3
    const noRetro = await db
      .select()
      .from(schema.coupons)
      .where(
        and(eq(schema.coupons.user_id, lowerUser.id), eq(schema.coupons.reward_id, highReward)),
      );
    expect(noRetro).toHaveLength(0); // NOT retroactively minted
    const oLower = await seedCompletedOrder(lowerUser.id);
    const rLower = await creditStarForCompletedOrder(oLower); // lifetime 6 → now mints
    expect(rLower.unlockedRewardIds).toContain(highReward);

    // (e) Raise a threshold → a previously-issued coupon is NOT revoked.
    const seqT1CouponBefore = await db
      .select()
      .from(schema.coupons)
      .where(and(eq(schema.coupons.user_id, seq.id), eq(schema.coupons.reward_id, t1)));
    expect(seqT1CouponBefore).toHaveLength(1);
    await patchReward(adminCookies, t1, { requiredStars: 50 }); // raise 1 → 50
    const seqT1CouponAfter = await db
      .select()
      .from(schema.coupons)
      .where(and(eq(schema.coupons.user_id, seq.id), eq(schema.coupons.reward_id, t1)));
    expect(seqT1CouponAfter).toEqual(seqT1CouponBefore); // unchanged, not revoked

    // Deactivate the low tiers so they don't pollute other suites' /summary global min.
    for (const id of [t1, t2, t3, highReward]) {
      await patchReward(adminCookies, id, { isActive: false });
    }
  });
});

describe('G6 (AC5) — CRUD round-trips; no hard DELETE', () => {
  it('creates, reads, and updates a reward (incl. isActive flip)', async () => {
    const created = await createReward(adminCookies, {
      name: 'Round Trip',
      requiredStars: 7,
      rewardType: 'percentage_discount',
      rewardValueCents: 1500,
      eligibleProductId: null,
    });
    expect(created.status).toBe(201);
    expect(created.body.reward).toMatchObject({
      name: 'Round Trip',
      requiredStars: 7,
      rewardType: 'percentage_discount',
      rewardValue: 1500,
      eligibleProductId: null,
      isActive: true,
    });
    const id = created.body.reward.id as string;

    const got = await request(app)
      .get(`/api/admin/rewards/${id}`)
      .set('Cookie', adminCookies.join('; '));
    expect(got.status).toBe(200);
    expect(got.body.reward.id).toBe(id);
    expect(typeof got.body.reward.createdAt).toBe('string');
    expect(typeof got.body.reward.updatedAt).toBe('string');

    const updated = await patchReward(adminCookies, id, { isActive: false, requiredStars: 9 });
    expect(updated.status).toBe(200);
    expect(updated.body.reward.isActive).toBe(false);
    expect(updated.body.reward.requiredStars).toBe(9);

    // List (admin) includes inactive rows, ordered required_stars ascending.
    const list = await request(app)
      .get('/api/admin/rewards')
      .set('Cookie', adminCookies.join('; '));
    expect(list.status).toBe(200);
    const ourRow = list.body.rewards.find((r: { id: string }) => r.id === id);
    expect(ourRow).toBeDefined();
    expect(ourRow.isActive).toBe(false);
    const stars = list.body.rewards.map((r: { requiredStars: number }) => r.requiredStars);
    expect(stars).toEqual([...stars].sort((a, b) => a - b));
  });

  it('exposes no hard DELETE route (soft-delete only, D3)', async () => {
    const created = await createReward(adminCookies, { name: 'No Delete Me' });
    const id = created.body.reward.id as string;
    const del = await request(app)
      .delete(`/api/admin/rewards/${id}`)
      .set('Cookie', adminCookies.join('; '));
    expect(del.status).toBe(404); // no DELETE handler → Express 404
  });
});

describe('G7 (AC5) — validation: allow-list, D4 cross-field, product FK', () => {
  it('rejects a reward_type outside the D2 allow-list (4xx, no write)', async () => {
    const res = await request(app)
      .post('/api/admin/rewards')
      .set('Cookie', adminCookies.join('; '))
      .send({ name: 'Bad Type', requiredStars: 3, rewardType: 'buy_one_take_one' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('rejects a free_item reward with no eligibleProductId (D4)', async () => {
    const res = await createReward(adminCookies, {
      name: 'Free no product',
      rewardType: 'free_item',
      eligibleProductId: null,
    });
    expect(res.status).toBe(400);
    expect(res.body.details ?? res.body.error).toBeDefined();
  });

  it('rejects a free_item reward that ALSO carries a rewardValueCents (D4)', async () => {
    const res = await createReward(adminCookies, {
      name: 'Free with value',
      rewardType: 'free_item',
      eligibleProductId: productId,
      rewardValueCents: 500,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a discount reward with no rewardValueCents (D4)', async () => {
    const res = await createReward(adminCookies, {
      name: 'Discount no value',
      rewardType: 'fixed_discount',
      eligibleProductId: null,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a discount reward that ALSO carries an eligibleProductId (D4)', async () => {
    const res = await createReward(adminCookies, {
      name: 'Discount with product',
      rewardType: 'percentage_discount',
      rewardValueCents: 1000,
      eligibleProductId: productId,
    });
    expect(res.status).toBe(400);
  });

  it('404s a create referencing a nonexistent eligibleProductId (never a raw 500)', async () => {
    const res = await createReward(adminCookies, {
      name: 'Bad product',
      rewardType: 'free_item',
      eligibleProductId: '00000000-0000-4000-8000-000000000000',
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });

  it('400s a create pointing eligibleProductId at a deal product', async () => {
    const [dealProduct] = await db
      .insert(schema.products)
      .values({
        category_id: categoryId,
        name: `DealProd ${unique()}`,
        slug: `deal-prod-${unique()}`,
        base_price: '9.00',
        is_deal: true,
      })
      .returning();
    const res = await createReward(adminCookies, {
      name: 'Deal benefit',
      rewardType: 'free_item',
      eligibleProductId: dealProduct!.id,
    });
    expect(res.status).toBe(400);
    await db.delete(schema.products).where(eq(schema.products.id, dealProduct!.id));
  });

  it('404s a GET/PATCH for a malformed id', async () => {
    const get = await request(app)
      .get('/api/admin/rewards/not-a-uuid')
      .set('Cookie', adminCookies.join('; '));
    expect(get.status).toBe(404);
    const patch = await patchReward(adminCookies, 'not-a-uuid', { requiredStars: 2 });
    expect(patch.status).toBe(404);
  });

  it('400s an empty PATCH body (no-op guard)', async () => {
    const created = await createReward(adminCookies, { name: 'Empty patch target' });
    const res = await patchReward(adminCookies, created.body.reward.id, {});
    expect(res.status).toBe(400);
  });
});

describe('G8 (AC6) — non-admin sessions are rejected 403 on every rewards route', () => {
  it('customer and staff receive 403 on read and write', async () => {
    for (const cookies of [customerCookies, staffCookies]) {
      const list = await request(app).get('/api/admin/rewards').set('Cookie', cookies.join('; '));
      expect(list.status).toBe(403);

      const create = await request(app)
        .post('/api/admin/rewards')
        .set('Cookie', cookies.join('; '))
        .send(rewardPayload())
        .set('Content-Type', 'application/json');
      expect(create.status).toBe(403);
    }
  });

  it('an unauthenticated request receives 401/403', async () => {
    const res = await request(app).get('/api/admin/rewards');
    expect([401, 403]).toContain(res.status);
  });
});
