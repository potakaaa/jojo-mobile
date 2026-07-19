import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin analytics view (ADM-007, #45) — run against a
 * real local Postgres, mirroring `admin-orders.integration.test.ts`'s hermetic
 * self-seeding pattern.
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * ISOLATION NOTE: the analytics route aggregates by DATE RANGE across ALL rows
 * (orders/stars/coupons are not user-scoped for most metrics). The shared seed +
 * sibling suites use `now`-relative (2026) dates, so ALL fixtures here live in
 * year 2099 — a window no other data touches — making the global aggregates exact.
 *
 * Covers the validate-contract Test Gates (all Fully-Automated):
 *   AC1  — ordersPerBranch exact counts; cancelled/rejected excluded; zero-order branch → 0.
 *   AC2  — averageOrderValueCents exact; cancelled excluded; post-discount total used.
 *   AC3  — dealsSplit partition sums to total; all 3 D1 signals; double-signal counted once (E2).
 *   AC4  — repeatPurchaseRate exact; pending-only user in denominator not numerator.
 *   AC5  — two-range recalculation + Manila 23:30/00:30 boundary edge.
 *   AC6  — starsEarned (earned-only) / rewardsUnlocked (mint) / rewardsRedeemed (burn); offers excluded.
 *   AC7  — staff/customer → 403.
 *   AC8  — 400 on missing/malformed/inverted params.
 *   AC11 — topSellingProducts exact qty/revenue, DESC order, 10-row cap, branch scoping.
 *   AC12 — newVsReturning exact incl. cancelled-first-order user counted `new` (E1).
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

let auth: AuthModule['auth'];
let db: DbModule['db'];
let schema: SchemaModule;
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

let adminCookies: string[];
let staffCookies: string[];
let customerCookies: string[];

// Ranges (Manila calendar dates). All disjoint, all in 2099.
const RANGE_A = { from: '2099-06-10', to: '2099-06-20' };
const RANGE_B = { from: '2099-03-01', to: '2099-03-31' };
const RANGE_CAP = { from: '2099-05-01', to: '2099-05-31' };
const RANGE_EDGE = { from: '2099-06-25', to: '2099-06-25' };

// In-range instants (10:00Z is mid-range for every window above).
const IN_A = new Date('2099-06-15T10:00:00Z');
const IN_B = new Date('2099-03-15T10:00:00Z');
const IN_CAP = new Date('2099-05-15T10:00:00Z');
const PRIOR = new Date('2099-01-10T10:00:00Z'); // outside all ranges
const PRIOR_CANCELLED = new Date('2099-01-05T10:00:00Z');
// Manila boundary edge for RANGE_EDGE (upper bound = 2099-06-25T16:00Z UTC).
const EDGE_IN = new Date('2099-06-25T15:30:00Z'); // 23:30 Manila on the last day → included
const EDGE_OUT = new Date('2099-06-25T16:30:00Z'); // 00:30 Manila next day → excluded

// Fixture ids.
let branchAId: string;
let branchBId: string;
let branchCId: string;
let categoryId: string;
let p1Id: string; // Fries @5
let p2Id: string; // Soda @10
let p3Id: string; // Burger @8
let pbId: string; // Combo @12 (is_deal = true)
let offerId: string;
let rewardId: string;
const capProductIds: string[] = [];
const userIds: Record<string, string> = {};

const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCouponIds: string[] = [];
const createdProductIds: string[] = [];

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
): Promise<{ cookies: string[]; id: string }> {
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
  return { cookies, id: row.id };
}

async function makeCustomer(key: string): Promise<string> {
  const { id } = await makeUser('customer');
  userIds[key] = id;
  return id;
}

interface OrderSpec {
  user: string;
  branch: string;
  status: (typeof schema.orderStatusEnum.enumValues)[number];
  placedAt: Date;
  totalCents: number;
  discountCents?: number;
  couponId?: string;
  dealId?: string;
  items?: { productId: string; quantity: number; totalPriceCents: number }[];
}

async function seedOrder(spec: OrderSpec): Promise<string> {
  const total = (spec.totalCents / 100).toFixed(2);
  const discount = ((spec.discountCents ?? 0) / 100).toFixed(2);
  const subtotalCents = spec.totalCents + (spec.discountCents ?? 0);
  const [row] = await db
    .insert(schema.orders)
    .values({
      user_id: userIds[spec.user]!,
      branch_id: spec.branch,
      order_number: `JP-ANALYTICS-${unique().toUpperCase()}`,
      status: spec.status,
      subtotal: (subtotalCents / 100).toFixed(2),
      discount_total: discount,
      total,
      payment_method: 'pay_at_branch',
      placed_at: spec.placedAt,
      ...(spec.couponId ? { coupon_id: spec.couponId } : {}),
      ...(spec.dealId ? { deal_id: spec.dealId } : {}),
    })
    .returning();
  const orderId = row!.id;
  createdOrderIds.push(orderId);

  for (const item of spec.items ?? []) {
    await db.insert(schema.orderItems).values({
      order_id: orderId,
      product_id: item.productId,
      product_name_snapshot: 'snapshot',
      quantity: item.quantity,
      unit_price: (item.totalPriceCents / item.quantity / 100).toFixed(2),
      total_price: (item.totalPriceCents / 100).toFixed(2),
    });
  }
  return orderId;
}

async function seedProduct(name: string, basePriceCents: number, isDeal = false): Promise<string> {
  const [row] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name,
      slug: `analytics-${unique()}`,
      base_price: (basePriceCents / 100).toFixed(2),
      is_deal: isDeal,
    })
    .returning();
  createdProductIds.push(row!.id);
  return row!.id;
}

async function seedCoupon(values: {
  rewardId?: string;
  offerId?: string;
  userKey?: string;
  createdAt: Date;
  usedAt?: Date;
}): Promise<string> {
  const [row] = await db
    .insert(schema.coupons)
    .values({
      code: `AN-${unique().toUpperCase()}`,
      ...(values.rewardId ? { reward_id: values.rewardId } : {}),
      ...(values.offerId ? { offer_id: values.offerId } : {}),
      ...(values.userKey ? { user_id: userIds[values.userKey]! } : {}),
      created_at: values.createdAt,
      ...(values.usedAt ? { used_at: values.usedAt, status: 'used' as const } : {}),
    })
    .returning();
  createdCouponIds.push(row!.id);
  return row!.id;
}

async function seedStar(values: {
  userKey: string;
  type: (typeof schema.starTxTypeEnum.enumValues)[number];
  stars: number;
  createdAt: Date;
}): Promise<void> {
  await db.insert(schema.starTransactions).values({
    user_id: userIds[values.userKey]!,
    type: values.type,
    stars: values.stars,
    created_at: values.createdAt,
  });
}

async function getAnalytics(query: string, cookies: string[]): Promise<request.Response> {
  return request(app).get(`/api/admin/analytics${query}`).set('Cookie', cookies.join('; '));
}

function rangeQuery(r: { from: string; to: string }, branchId?: string): string {
  return `?from=${r.from}&to=${r.to}${branchId ? `&branchId=${branchId}` : ''}`;
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  schema = await import('../../../db/schema/index');
  ({ app } = await import('../../../index'));

  adminCookies = (await makeUser('admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  customerCookies = (await makeUser('customer')).cookies;

  // u1..u6 are the RANGE_A base users; u7 owns the RANGE_B/CAP/EDGE orders so it
  // never appears in RANGE_A's base set (keeps new-vs-returning for A unmuddied).
  for (const key of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']) await makeCustomer(key);

  const suffix = unique();
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `AnCat ${suffix}`, slug: `an-cat-${suffix}`, sort_order: 1 })
    .returning();
  categoryId = category!.id;

  p1Id = await seedProduct('AZ Fries', 500);
  p2Id = await seedProduct('AZ Soda', 1000);
  p3Id = await seedProduct('AZ Burger', 800);
  pbId = await seedProduct('AZ Combo', 1200, true);
  for (let i = 0; i < 12; i += 1) capProductIds.push(await seedProduct(`Cap ${i}`, 100));

  const mkBranch = async (label: string) => {
    const [b] = await db
      .insert(schema.branches)
      .values({
        name: `AnBranch${label} ${suffix}`,
        slug: `an-branch-${label.toLowerCase()}-${suffix}`,
        address: '1 St',
        latitude: '14.5',
        longitude: '120.9',
        phone: `+63917${Math.floor(1000000 + Math.random() * 8999999)}`,
        opening_hours: '08:00-20:00',
        estimated_prep_minutes: 15,
      })
      .returning();
    return b!.id;
  };
  branchAId = await mkBranch('A');
  branchBId = await mkBranch('B');
  branchCId = await mkBranch('C');

  const [offer] = await db
    .insert(schema.offers)
    .values({
      title: `AnOffer ${suffix}`,
      deal_type: 'percentage_discount',
      discount_value: '10.00',
      start_at: new Date('2099-01-01T00:00:00Z'),
      end_at: new Date('2099-12-31T00:00:00Z'),
    })
    .returning();
  offerId = offer!.id;

  const [reward] = await db
    .insert(schema.rewards)
    .values({ name: `AnReward ${suffix}`, required_stars: 5, reward_type: 'free_item' })
    .returning();
  rewardId = reward!.id;

  // Coupons referenced by orders (offer coupons — reward_id null).
  const cpnA = await seedCoupon({ offerId, createdAt: IN_A });
  const cpnB = await seedCoupon({ offerId, createdAt: IN_A });
  const cpnBcoup = await seedCoupon({ offerId, createdAt: IN_B });

  // ── RANGE_A base orders (9 counted) + 2 excluded (cancelled/rejected). ──
  await seedOrder({
    user: 'u1',
    branch: branchAId,
    status: 'completed',
    placedAt: IN_A,
    totalCents: 1000,
    items: [{ productId: p1Id, quantity: 2, totalPriceCents: 1000 }],
  }); // o1 plain
  await seedOrder({
    user: 'u1',
    branch: branchAId,
    status: 'completed',
    placedAt: IN_A,
    totalCents: 850,
    discountCents: 150,
    couponId: cpnA,
    items: [{ productId: p1Id, quantity: 2, totalPriceCents: 1000 }],
  }); // o2 coupon (D1 signal a) + discount
  await seedOrder({
    user: 'u2',
    branch: branchAId,
    status: 'completed',
    placedAt: IN_A,
    totalCents: 2000,
    dealId: offerId,
    items: [{ productId: p2Id, quantity: 2, totalPriceCents: 2000 }],
  }); // o3 deal_id (D1 signal b)
  await seedOrder({
    user: 'u2',
    branch: branchAId,
    status: 'pending',
    placedAt: IN_A,
    totalCents: 500,
    items: [{ productId: p1Id, quantity: 1, totalPriceCents: 500 }],
  }); // o4 plain pending
  await seedOrder({
    user: 'u3',
    branch: branchBId,
    status: 'pending',
    placedAt: IN_A,
    totalCents: 1200,
    items: [{ productId: pbId, quantity: 1, totalPriceCents: 1200 }],
  }); // o5 bundle (D1 signal c)
  await seedOrder({
    user: 'u3',
    branch: branchBId,
    status: 'pending',
    placedAt: IN_A,
    totalCents: 800,
    items: [{ productId: p3Id, quantity: 1, totalPriceCents: 800 }],
  }); // o6 plain
  await seedOrder({
    user: 'u4',
    branch: branchAId,
    status: 'completed',
    placedAt: IN_A,
    totalCents: 1200,
    couponId: cpnB,
    items: [{ productId: pbId, quantity: 1, totalPriceCents: 1200 }],
  }); // o7 DOUBLE signal (coupon a + bundle c) → counts once
  await seedOrder({
    user: 'u5',
    branch: branchAId,
    status: 'completed',
    placedAt: IN_A,
    totalCents: 600,
    items: [{ productId: p3Id, quantity: 1, totalPriceCents: 600 }],
  }); // o8 plain (u5 returning)
  await seedOrder({
    user: 'u6',
    branch: branchAId,
    status: 'completed',
    placedAt: IN_A,
    totalCents: 700,
    items: [{ productId: p1Id, quantity: 1, totalPriceCents: 700 }],
  }); // o9 plain (u6 = E1 cancelled-first-order → new)

  // Excluded from every RANGE_A metric.
  await seedOrder({
    user: 'u1',
    branch: branchAId,
    status: 'cancelled',
    placedAt: IN_A,
    totalCents: 9900,
    items: [{ productId: p1Id, quantity: 9, totalPriceCents: 9900 }],
  });
  await seedOrder({
    user: 'u2',
    branch: branchBId,
    status: 'rejected',
    placedAt: IN_A,
    totalCents: 5000,
    items: [{ productId: p2Id, quantity: 5, totalPriceCents: 5000 }],
  });

  // History for new-vs-returning: u5 has a prior COUNTED order (→ returning);
  // u6's only prior order is CANCELLED (→ excluded by D2, so u6 is new — E1).
  await seedOrder({
    user: 'u5',
    branch: branchAId,
    status: 'completed',
    placedAt: PRIOR,
    totalCents: 500,
    items: [{ productId: p1Id, quantity: 1, totalPriceCents: 500 }],
  });
  await seedOrder({
    user: 'u6',
    branch: branchAId,
    status: 'cancelled',
    placedAt: PRIOR_CANCELLED,
    totalCents: 500,
    items: [{ productId: p1Id, quantity: 1, totalPriceCents: 500 }],
  });

  // ── RANGE_B (distinct metric values for AC5 two-range). Owned by u7 (not a
  // RANGE_A base user) so u1/u2's RANGE_A new-vs-returning stays unaffected. ──
  await seedOrder({
    user: 'u7',
    branch: branchAId,
    status: 'completed',
    placedAt: IN_B,
    totalCents: 3000,
    items: [{ productId: p2Id, quantity: 3, totalPriceCents: 3000 }],
  });
  await seedOrder({
    user: 'u7',
    branch: branchBId,
    status: 'completed',
    placedAt: IN_B,
    totalCents: 1000,
    couponId: cpnBcoup,
    items: [{ productId: p1Id, quantity: 2, totalPriceCents: 1000 }],
  });

  // ── RANGE_EDGE boundary: one included (23:30 Manila), one excluded (00:30 next). ──
  await seedOrder({
    user: 'u7',
    branch: branchAId,
    status: 'completed',
    placedAt: EDGE_IN,
    totalCents: 100,
    items: [{ productId: p1Id, quantity: 1, totalPriceCents: 100 }],
  });
  await seedOrder({
    user: 'u7',
    branch: branchAId,
    status: 'completed',
    placedAt: EDGE_OUT,
    totalCents: 100,
    items: [{ productId: p1Id, quantity: 1, totalPriceCents: 100 }],
  });

  // ── RANGE_CAP: one order with 12 distinct products (10-row cap + DESC test). ──
  await seedOrder({
    user: 'u7',
    branch: branchAId,
    status: 'completed',
    placedAt: IN_CAP,
    totalCents: 10000,
    items: capProductIds.map((productId, i) => ({
      productId,
      quantity: 12 - i, // strictly descending: 12, 11, ... 1
      totalPriceCents: (12 - i) * 100,
    })),
  });

  // ── Stars + reward/offer coupons for AC6. ──
  await seedStar({ userKey: 'u1', type: 'earned', stars: 10, createdAt: IN_A });
  await seedStar({ userKey: 'u2', type: 'earned', stars: 20, createdAt: IN_A });
  await seedStar({ userKey: 'u1', type: 'redeemed', stars: 5, createdAt: IN_A }); // excluded
  await seedStar({ userKey: 'u1', type: 'adjusted', stars: 3, createdAt: IN_A }); // excluded
  await seedStar({ userKey: 'u3', type: 'earned', stars: 100, createdAt: PRIOR }); // out of range
  await seedStar({ userKey: 'u1', type: 'earned', stars: 7, createdAt: IN_B }); // range B

  await seedCoupon({ rewardId, userKey: 'u1', createdAt: IN_A }); // unlocked-in-A
  await seedCoupon({ rewardId, userKey: 'u2', createdAt: PRIOR, usedAt: IN_A }); // redeemed-in-A
  await seedCoupon({ offerId, createdAt: IN_A }); // offer coupon — excluded from reward counts
  await seedCoupon({ rewardId, userKey: 'u3', createdAt: IN_B }); // unlocked-in-B
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await db.delete(schema.orderItems).where(inArray(schema.orderItems.order_id, createdOrderIds));
  }
  await db
    .delete(schema.starTransactions)
    .where(inArray(schema.starTransactions.user_id, createdUserIds));
  if (createdOrderIds.length > 0) {
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  if (createdCouponIds.length > 0) {
    await db.delete(schema.coupons).where(inArray(schema.coupons.id, createdCouponIds));
  }
  await db.delete(schema.offers).where(eq(schema.offers.id, offerId));
  await db.delete(schema.rewards).where(eq(schema.rewards.id, rewardId));
  if (createdProductIds.length > 0) {
    await db.delete(schema.products).where(inArray(schema.products.id, createdProductIds));
  }
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  await db
    .delete(schema.branches)
    .where(inArray(schema.branches.id, [branchAId, branchBId, branchCId]));
  logSpy?.mockRestore();
  vi.restoreAllMocks();
});

describe('AC1 — ordersPerBranch', () => {
  it('exact per-branch counts; cancelled/rejected excluded; zero-order branch → 0', async () => {
    const res = await getAnalytics(rangeQuery(RANGE_A), adminCookies);
    expect(res.status).toBe(200);
    const perBranch: { branchId: string; orderCount: number }[] = res.body.resource.ordersPerBranch;
    const byId = new Map(perBranch.map((b) => [b.branchId, b.orderCount]));
    expect(byId.get(branchAId)).toBe(7);
    expect(byId.get(branchBId)).toBe(2);
    expect(byId.get(branchCId)).toBe(0); // zero-order branch present with 0
    expect(res.body.resource.orderCount).toBe(9);
    expect(res.body.resource.branchScoped).toBe(false);
  });
});

describe('AC2 — averageOrderValueCents', () => {
  it('exact cents; cancelled excluded; post-discount total used', async () => {
    const res = await getAnalytics(rangeQuery(RANGE_A), adminCookies);
    // sum(total) over the 9 counted orders = 8850c; round(8850/9) = 983.
    // A cancelled 9900c order and the subtotal-vs-total (o2: 850 not 1000) both
    // move this number if mishandled.
    expect(res.body.resource.averageOrderValueCents).toBe(983);
  });

  it('returns null AOV for a range with no orders (no divide-by-zero)', async () => {
    const res = await getAnalytics(
      rangeQuery({ from: '2099-09-01', to: '2099-09-02' }),
      adminCookies,
    );
    expect(res.status).toBe(200);
    expect(res.body.resource.orderCount).toBe(0);
    expect(res.body.resource.averageOrderValueCents).toBeNull();
    expect(res.body.resource.repeatPurchaseRate.rate).toBeNull();
  });
});

describe('AC3 — dealsSplit (E2 double-signal counted once)', () => {
  it('partition sums to orderCount/total across all 3 D1 signals', async () => {
    const res = await getAnalytics(rangeQuery(RANGE_A), adminCookies);
    const split = res.body.resource.dealsSplit;
    expect(split.withDeals.count).toBe(4); // o2(coupon), o3(deal_id), o5(bundle), o7(coupon+bundle once)
    expect(split.withoutDeals.count).toBe(5);
    expect(split.withDeals.count + split.withoutDeals.count).toBe(res.body.resource.orderCount);
    expect(split.withDeals.sumTotalCents).toBe(5250);
    expect(split.withoutDeals.sumTotalCents).toBe(3600);
    expect(split.withDeals.sumTotalCents + split.withoutDeals.sumTotalCents).toBe(8850);
  });
});

describe('AC4 — repeatPurchaseRate', () => {
  it('2+-completed ÷ any-order users; pending-only user in denominator not numerator', async () => {
    const res = await getAnalytics(rangeQuery(RANGE_A), adminCookies);
    const rate = res.body.resource.repeatPurchaseRate;
    // u1 has 2 completed (numerator); u3 has 2 pending only (denominator, not numerator).
    expect(rate.numerator).toBe(1);
    expect(rate.denominator).toBe(6);
    expect(rate.rate).toBeCloseTo(1 / 6, 10);
  });
});

describe('AC5 — two-range recalculation + Manila boundary edge', () => {
  it('range B yields different values than range A', async () => {
    const a = (await getAnalytics(rangeQuery(RANGE_A), adminCookies)).body.resource;
    const b = (await getAnalytics(rangeQuery(RANGE_B), adminCookies)).body.resource;
    expect(b.orderCount).toBe(2);
    expect(b.orderCount).not.toBe(a.orderCount);
    // sum(total) B = 3000 + 1000 = 4000; round(4000/2) = 2000.
    expect(b.averageOrderValueCents).toBe(2000);
    expect(b.averageOrderValueCents).not.toBe(a.averageOrderValueCents);
    expect(b.starsEarned).toBe(7);
    expect(b.starsEarned).not.toBe(a.starsEarned);
    expect(b.rewardsUnlocked).toBe(1);
    expect(b.dealsSplit.withDeals.count).toBe(1); // the cpnBcoup order
    expect(b.dealsSplit.withDeals.count).not.toBe(a.dealsSplit.withDeals.count);
  });

  it('Manila boundary: 23:30 on the last day included, 00:30 next day excluded', async () => {
    const res = await getAnalytics(rangeQuery(RANGE_EDGE), adminCookies);
    expect(res.status).toBe(200);
    // Only EDGE_IN (15:30Z) is < upper (16:00Z); EDGE_OUT (16:30Z) is excluded.
    expect(res.body.resource.orderCount).toBe(1);
  });
});

describe('AC6 — stars / rewards', () => {
  it('starsEarned earned-only; rewardsUnlocked mint; rewardsRedeemed burn; offers excluded', async () => {
    const res = await getAnalytics(rangeQuery(RANGE_A), adminCookies);
    // earned 10 + 20 = 30 (redeemed/adjusted excluded; out-of-range earned excluded).
    expect(res.body.resource.starsEarned).toBe(30);
    // one reward coupon minted in range; one offer coupon in range must NOT count.
    expect(res.body.resource.rewardsUnlocked).toBe(1);
    // one reward coupon burned (used_at) in range; its mint was out of range.
    expect(res.body.resource.rewardsRedeemed).toBe(1);
  });
});

describe('AC7 — role matrix', () => {
  it('staff and customer receive 403', async () => {
    for (const cookies of [staffCookies, customerCookies]) {
      const res = await getAnalytics(rangeQuery(RANGE_A), cookies);
      expect(res.status).toBe(403);
    }
  });

  it('unauthenticated receives 401/403', async () => {
    const res = await request(app).get(`/api/admin/analytics${rangeQuery(RANGE_A)}`);
    expect([401, 403]).toContain(res.status);
  });
});

describe('AC8 — param validation', () => {
  it('missing from/to → 400', async () => {
    expect((await getAnalytics('', adminCookies)).status).toBe(400);
    expect((await getAnalytics('?from=2099-06-10', adminCookies)).status).toBe(400);
    expect((await getAnalytics('?to=2099-06-20', adminCookies)).status).toBe(400);
  });

  it('malformed date → 400', async () => {
    expect((await getAnalytics('?from=2099-6-10&to=2099-06-20', adminCookies)).status).toBe(400);
    expect((await getAnalytics('?from=2099-02-30&to=2099-06-20', adminCookies)).status).toBe(400);
    expect((await getAnalytics('?from=bad&to=2099-06-20', adminCookies)).status).toBe(400);
  });

  it('from > to → 400', async () => {
    expect((await getAnalytics('?from=2099-06-20&to=2099-06-10', adminCookies)).status).toBe(400);
  });

  it('malformed branchId → 400', async () => {
    expect(
      (await getAnalytics(`${rangeQuery(RANGE_A)}&branchId=not-a-uuid`, adminCookies)).status,
    ).toBe(400);
  });
});

describe('AC11 — topSellingProducts', () => {
  it('exact quantity/revenue per product, descending by quantity', async () => {
    const res = await getAnalytics(rangeQuery(RANGE_A), adminCookies);
    const top: { productId: string; quantitySold: number; revenueCents: number }[] =
      res.body.resource.topSellingProducts;
    const byId = new Map(top.map((t) => [t.productId, t]));
    expect(byId.get(p1Id)).toMatchObject({ quantitySold: 6, revenueCents: 3200 });
    expect(byId.get(p2Id)).toMatchObject({ quantitySold: 2, revenueCents: 2000 });
    expect(byId.get(pbId)).toMatchObject({ quantitySold: 2, revenueCents: 2400 });
    expect(byId.get(p3Id)).toMatchObject({ quantitySold: 2, revenueCents: 1400 });
    expect(top.length).toBe(4);
    expect(top[0]!.productId).toBe(p1Id); // highest quantity ranks first
    const quantities = top.map((t) => t.quantitySold);
    expect(quantities).toEqual([...quantities].sort((a, b) => b - a)); // descending
  });

  it('caps at 10 rows (12 distinct products seeded)', async () => {
    const res = await getAnalytics(rangeQuery(RANGE_CAP), adminCookies);
    expect(res.body.resource.topSellingProducts.length).toBe(10);
    expect(res.body.resource.topSellingProducts[0]!.quantitySold).toBe(12);
  });

  it('branch-scoped when branchId is provided', async () => {
    const res = await getAnalytics(rangeQuery(RANGE_A, branchBId), adminCookies);
    expect(res.status).toBe(200);
    expect(res.body.resource.branchScoped).toBe(true);
    const top: { productId: string; quantitySold: number; revenueCents: number }[] =
      res.body.resource.topSellingProducts;
    const ids = top.map((t) => t.productId);
    expect(ids).toContain(pbId); // o5 bundle at branch B
    expect(ids).toContain(p3Id); // o6 at branch B
    expect(ids).not.toContain(p1Id); // branch A only
    expect(ids).not.toContain(p2Id);
    // Branch-scoped ordersPerBranch returns only the scoped branch.
    expect(res.body.resource.ordersPerBranch).toEqual([
      { branchId: branchBId, branchName: expect.any(String), orderCount: 2 },
    ]);
  });
});

describe('AC12 — newVsReturning (E1 cancelled-first-order → new)', () => {
  it('classifies new vs returning; counts sum to distinct-user count', async () => {
    const res = await getAnalytics(rangeQuery(RANGE_A), adminCookies);
    const nvr = res.body.resource.newVsReturning;
    // new: u1,u2,u3,u4 (first order in range) + u6 (cancelled-first-order, E1) = 5.
    // returning: u5 (prior COUNTED order outside range) = 1.
    expect(nvr.newCount).toBe(5);
    expect(nvr.returningCount).toBe(1);
    expect(nvr.newCount + nvr.returningCount).toBe(
      res.body.resource.repeatPurchaseRate.denominator,
    );
  });
});
