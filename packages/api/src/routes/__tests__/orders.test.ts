/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies and the
   getSession stub are loosely typed at the test boundary; assertions narrow them. */
import type { AddressInfo } from 'node:net';

import { and, eq } from 'drizzle-orm';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the session-gated order routes + the POST /orders
 * transaction (order_number uniqueness under forced collision & concurrency,
 * estimated_ready_at derivation, back-to-back independence, auth boundary).
 *
 * Run against a real local Postgres (same DB as `db:migrate`):
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Auth is stubbed at the `auth.api.getSession` seam (an `x-test-user` header
 * selects the caller) so the middleware + handler authorization paths are
 * exercised deterministically without the better-auth cookie/bearer plumbing,
 * which is covered separately in lib/__tests__/auth.integration.test.ts. All DB
 * writes (orders, order_items) are real.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';

type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type OrderNumberModule = typeof import('../lib/order-number');

let db: DbModule['db'];
let schema: SchemaModule;
let orderNumberGenerator: OrderNumberModule['orderNumberGenerator'];
let base: string;
let server: ReturnType<express.Express['listen']>;

const uid = () => Math.random().toString(36).slice(2, 10);

// Fixtures created in setup.
let userA: string;
let userB: string;
let branch20Id: string; // estimated_prep_minutes = 20
let branch45Id: string; // estimated_prep_minutes = 45
let productId: string;
let sizeOptionId: string;
let otherProductId: string; // real product, never in the test cart (product-scope reject)

// Deal fixtures (Phase 3 — DEAL-003). Assert by id; hermetic per-deal.
let pctDealId: string; // agnostic percentage_discount 20%, no minimum
let fixedSmallDealId: string; // agnostic fixed_discount ₱5.00 (500c) — partial
let fixedLargeDealId: string; // agnostic fixed_discount ₱50.00 (5000c) — clamps to subtotal
let branchScopedDealId: string; // scoped to branch45 (ordering at branch20 => ineligible)
let productScopedDealId: string; // scoped to otherProduct (not in cart => ineligible)
let minDealId: string; // minimum_order_amount ₱100 (10000c) > 1300 subtotal
let expiredDealId: string; // active but end_at in the past (not_in_window)
let perUserDealId: string; // usage_limit_per_user: 1 (sequential per-user reject)
let totalLimitDealId: string; // total_usage_limit: 1
let concurrencyDealId: string; // usage_limit_per_user: 1 (concurrency/row-lock)
let bogoDealId: string; // buy_one_take_one (complex type reject)
let inactiveDealId: string; // is_active: false

async function post(
  path: string,
  opts: { user?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.user) headers['x-test-user'] = opts.user;
  const res = await fetch(base + path, {
    method: 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function get(
  path: string,
  opts: { user?: string } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (opts.user) headers['x-test-user'] = opts.user;
  const res = await fetch(base + path, { headers });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function singleItemBody(branchId: string) {
  return {
    branchId,
    paymentMethod: 'pay_at_branch',
    items: [{ productId, quantity: 2, selectedOptions: [{ optionId: sizeOptionId }] }],
  };
}

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ orderNumberGenerator } = await import('../lib/order-number'));
  const { branchesRouter } = await import('../branches');
  const { ordersRouter } = await import('../orders');
  const { auth } = await import('../../lib/auth');

  // Deterministic session stub: x-test-user header -> that user id; absent -> 401.
  vi.spyOn(auth.api, 'getSession').mockImplementation((async ({ headers }: any) => {
    const id = headers.get('x-test-user');
    if (!id) return null;
    return { session: { id: `sess-${id}`, userId: id }, user: { id } };
  }) as any);

  const app = express();
  app.use(express.json());
  app.use('/branches', branchesRouter);
  app.use('/orders', ordersRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const suffix = uid();

  const [ua] = await db
    .insert(schema.users)
    .values({ name: 'User A', email: `a-${suffix}@example.com` })
    .returning();
  userA = ua!.id;
  const [ub] = await db
    .insert(schema.users)
    .values({ name: 'User B', email: `b-${suffix}@example.com` })
    .returning();
  userB = ub!.id;

  const [b20] = await db
    .insert(schema.branches)
    .values({
      name: `Prep20 ${suffix}`,
      slug: `prep20-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000010',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 20,
    })
    .returning();
  branch20Id = b20!.id;

  const [b45] = await db
    .insert(schema.branches)
    .values({
      name: `Prep45 ${suffix}`,
      slug: `prep45-${suffix}`,
      address: '2 St',
      latitude: '14.6',
      longitude: '120.8',
      phone: '+639170000011',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 45,
    })
    .returning();
  branch45Id = b45!.id;

  const [category] = await db
    .insert(schema.categories)
    .values({ name: `Cat ${suffix}`, slug: `cat-${suffix}`, sort_order: 1 })
    .returning();

  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: category!.id,
      name: `Fries ${suffix}`,
      slug: `fries-${suffix}`,
      base_price: '5.00',
    })
    .returning();
  productId = product!.id;

  const [sizeOption] = await db
    .insert(schema.productOptions)
    .values({
      product_id: productId,
      option_type: 'size',
      name: 'Large',
      price_delta: '1.50',
      sort_order: 1,
    })
    .returning();
  sizeOptionId = sizeOption!.id;

  // Product available at both branches.
  await db.insert(schema.branchProductAvailability).values([
    { branch_id: branch20Id, product_id: productId, is_available: true },
    { branch_id: branch45Id, product_id: productId, is_available: true },
  ]);

  // A second real product, never added to the test cart — for product-scoped
  // deal ineligibility.
  const [otherProduct] = await db
    .insert(schema.products)
    .values({
      category_id: category!.id,
      name: `Nuggets ${suffix}`,
      slug: `nuggets-${suffix}`,
      base_price: '3.00',
    })
    .returning();
  otherProductId = otherProduct!.id;

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const nowMs = Date.now();
  const win = { start_at: new Date(nowMs - HOUR), end_at: new Date(nowMs + DAY) };

  const seedDeal = async (
    values: Partial<typeof schema.deals.$inferInsert> &
      Pick<typeof schema.deals.$inferInsert, 'title' | 'deal_type'>,
  ): Promise<string> => {
    const [row] = await db
      .insert(schema.deals)
      .values({ start_at: win.start_at, end_at: win.end_at, is_active: true, ...values })
      .returning();
    return row!.id;
  };

  pctDealId = await seedDeal({
    title: `Pct20 ${suffix}`,
    deal_type: 'percentage_discount',
    discount_value: '20.00',
  });
  fixedSmallDealId = await seedDeal({
    title: `Fixed5 ${suffix}`,
    deal_type: 'fixed_discount',
    discount_value: '5.00',
  });
  fixedLargeDealId = await seedDeal({
    title: `Fixed50 ${suffix}`,
    deal_type: 'fixed_discount',
    discount_value: '50.00',
  });

  branchScopedDealId = await seedDeal({
    title: `BranchScoped ${suffix}`,
    deal_type: 'percentage_discount',
    discount_value: '10.00',
  });
  await db
    .insert(schema.dealBranches)
    .values({ deal_id: branchScopedDealId, branch_id: branch45Id });

  productScopedDealId = await seedDeal({
    title: `ProductScoped ${suffix}`,
    deal_type: 'percentage_discount',
    discount_value: '10.00',
  });
  await db
    .insert(schema.dealProducts)
    .values({ deal_id: productScopedDealId, product_id: otherProductId });

  minDealId = await seedDeal({
    title: `MinOrder ${suffix}`,
    deal_type: 'percentage_discount',
    discount_value: '10.00',
    minimum_order_amount: '100.00',
  });
  expiredDealId = await seedDeal({
    title: `Expired ${suffix}`,
    deal_type: 'percentage_discount',
    discount_value: '10.00',
    start_at: new Date(nowMs - 2 * DAY),
    end_at: new Date(nowMs - DAY),
  });
  perUserDealId = await seedDeal({
    title: `PerUser1 ${suffix}`,
    deal_type: 'percentage_discount',
    discount_value: '10.00',
    usage_limit_per_user: 1,
  });
  totalLimitDealId = await seedDeal({
    title: `TotalLimit1 ${suffix}`,
    deal_type: 'percentage_discount',
    discount_value: '10.00',
    total_usage_limit: 1,
  });
  concurrencyDealId = await seedDeal({
    title: `Concurrency1 ${suffix}`,
    deal_type: 'percentage_discount',
    discount_value: '10.00',
    usage_limit_per_user: 1,
  });
  bogoDealId = await seedDeal({
    title: `Bogo ${suffix}`,
    deal_type: 'buy_one_take_one',
  });
  inactiveDealId = await seedDeal({
    title: `Inactive ${suffix}`,
    deal_type: 'percentage_discount',
    discount_value: '10.00',
    is_active: false,
  });
});

afterAll(async () => {
  vi.restoreAllMocks();
  server?.close();
});

describe('POST /orders — auth boundary', () => {
  it('401s with no session', async () => {
    const { status } = await post('/orders', { body: singleItemBody(branch20Id) });
    expect(status).toBe(401);
  });

  it('creates an order and recomputes price server-side (cents)', async () => {
    const { status, json } = await post('/orders', {
      user: userA,
      body: singleItemBody(branch20Id),
    });
    expect(status).toBe(201);
    // base 500 + size delta 150 = 650 unit; qty 2 => 1300 subtotal/total.
    expect(json.order.subtotalCents).toBe(1300);
    expect(json.order.totalCents).toBe(1300);
    expect(json.order.discountTotalCents).toBe(0);
    expect(json.order.orderNumber).toMatch(/^JP-\d{6}-[2-9A-HJ-NP-Z]{4}$/);
    expect(json.order.items).toHaveLength(1);
    expect(json.order.items[0].unitPriceCents).toBe(650);
    expect(json.order.items[0].totalPriceCents).toBe(1300);
    expect(json.order.items[0].selectedOptions[0].priceDeltaCents).toBe(150);
  });

  it('rejects online_payment (no processor wired)', async () => {
    const { status } = await post('/orders', {
      user: userA,
      body: { ...singleItemBody(branch20Id), paymentMethod: 'online_payment' },
    });
    expect(status).toBe(400);
  });
});

describe('POST /orders — order_number uniqueness', () => {
  it('regenerates and succeeds after a forced first-attempt collision', async () => {
    // Create an order to obtain an existing order_number.
    const first = await post('/orders', { user: userA, body: singleItemBody(branch20Id) });
    expect(first.status).toBe(201);
    const existingNumber: string = first.json.order.orderNumber;

    // Force the next order to collide on its first attempt, then succeed.
    const freshNumber = `JP-999999-${uid().slice(0, 4).toUpperCase()}`;
    const spy = vi
      .spyOn(orderNumberGenerator, 'generate')
      .mockReturnValueOnce(existingNumber)
      .mockReturnValue(freshNumber);

    try {
      const second = await post('/orders', { user: userA, body: singleItemBody(branch20Id) });
      expect(second.status).toBe(201);
      expect(second.json.order.orderNumber).toBe(freshNumber);
      expect(second.json.order.orderNumber).not.toBe(existingNumber);
      // Two generate() calls: the colliding one + the successful retry.
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('produces distinct order_numbers under ~20 concurrent creates', async () => {
    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        post('/orders', { user: userA, body: singleItemBody(branch20Id) }),
      ),
    );
    results.forEach((r) => expect(r.status).toBe(201));
    const numbers = new Set(results.map((r) => r.json.order.orderNumber));
    expect(numbers.size).toBe(N);
  });
});

describe('POST /orders — estimated_ready_at derivation', () => {
  it('derives estimated_ready_at from the branch prep time (20 min)', async () => {
    const { json } = await post('/orders', { user: userA, body: singleItemBody(branch20Id) });
    const delta =
      new Date(json.order.estimatedReadyAt).getTime() - new Date(json.order.placedAt).getTime();
    expect(delta).toBeGreaterThan(20 * 60_000 - 3_000);
    expect(delta).toBeLessThan(20 * 60_000 + 3_000);
  });

  it('reads prep time from the branch row, not a hardcoded value (45 min)', async () => {
    const { json } = await post('/orders', { user: userA, body: singleItemBody(branch45Id) });
    const delta =
      new Date(json.order.estimatedReadyAt).getTime() - new Date(json.order.placedAt).getTime();
    expect(delta).toBeGreaterThan(45 * 60_000 - 3_000);
    expect(delta).toBeLessThan(45 * 60_000 + 3_000);
  });
});

describe('POST /orders — back-to-back independence', () => {
  it('two sequential orders are fully independent rows with correctly scoped items', async () => {
    const freshUser = (
      await db
        .insert(schema.users)
        .values({ name: 'Solo', email: `solo-${uid()}@example.com` })
        .returning()
    )[0]!.id;

    const o1 = await post('/orders', { user: freshUser, body: singleItemBody(branch20Id) });
    const o2 = await post('/orders', {
      user: freshUser,
      body: {
        branchId: branch20Id,
        paymentMethod: 'pay_at_branch',
        items: [{ productId, quantity: 1, selectedOptions: [] }],
      },
    });
    expect(o1.status).toBe(201);
    expect(o2.status).toBe(201);
    expect(o1.json.order.id).not.toBe(o2.json.order.id);
    expect(o1.json.order.orderNumber).not.toBe(o2.json.order.orderNumber);
    // Distinct totals prove items are scoped per order (1300 vs 500).
    expect(o1.json.order.totalCents).toBe(1300);
    expect(o2.json.order.totalCents).toBe(500);

    const history = await get('/orders', { user: freshUser });
    expect(history.status).toBe(200);
    expect(history.json.orders).toHaveLength(2);
    const ids = history.json.orders.map((o: any) => o.id);
    expect(new Set(ids).size).toBe(2);
    history.json.orders.forEach((o: any) => expect(o.items.length).toBeGreaterThanOrEqual(1));
  });
});

describe('POST /orders — deal apply (DEAL-003)', () => {
  const dealBody = (branchId: string, dealId: string) => ({
    ...singleItemBody(branchId),
    dealId,
  });

  async function countOrdersWithDeal(dealId: string, userId?: string): Promise<number> {
    const where = userId
      ? and(eq(schema.orders.deal_id, dealId), eq(schema.orders.user_id, userId))
      : eq(schema.orders.deal_id, dealId);
    const rows = await db.select().from(schema.orders).where(where);
    return rows.length;
  }

  it('percentage_discount: computes real discount, total, and persists deal_id', async () => {
    const { status, json } = await post('/orders', {
      user: userA,
      body: dealBody(branch20Id, pctDealId),
    });
    expect(status).toBe(201);
    // subtotal 1300; 20% => 260 discount; total 1040.
    expect(json.order.subtotalCents).toBe(1300);
    expect(json.order.discountTotalCents).toBe(260);
    expect(json.order.totalCents).toBe(1040);
    expect(json.order.dealId).toBe(pctDealId);
  });

  it('fixed_discount: computes cents discount (partial) and persists deal_id', async () => {
    const { status, json } = await post('/orders', {
      user: userA,
      body: dealBody(branch20Id, fixedSmallDealId),
    });
    expect(status).toBe(201);
    // ₱5.00 => 500c < 1300 subtotal => discount 500, total 800.
    expect(json.order.discountTotalCents).toBe(500);
    expect(json.order.totalCents).toBe(800);
    expect(json.order.dealId).toBe(fixedSmallDealId);
  });

  it('fixed_discount clamps the discount to the subtotal (never negative total)', async () => {
    const { status, json } = await post('/orders', {
      user: userA,
      body: dealBody(branch20Id, fixedLargeDealId),
    });
    expect(status).toBe(201);
    // ₱50.00 => 5000c > 1300 subtotal => clamped to 1300; total 0.
    expect(json.order.discountTotalCents).toBe(1300);
    expect(json.order.totalCents).toBe(0);
  });

  it('rejects (400) not_in_window (expired deal) and creates no order', async () => {
    const freshUser = (
      await db.insert(schema.users).values({ name: 'X', email: `exp-${uid()}@e.com` }).returning()
    )[0]!.id;
    const { status } = await post('/orders', {
      user: freshUser,
      body: dealBody(branch20Id, expiredDealId),
    });
    expect(status).toBe(400);
    expect(await countOrdersWithDeal(expiredDealId)).toBe(0);
  });

  it('rejects (400) branch-ineligible deal', async () => {
    const { status } = await post('/orders', {
      user: userA,
      body: dealBody(branch20Id, branchScopedDealId), // scoped to branch45
    });
    expect(status).toBe(400);
    expect(await countOrdersWithDeal(branchScopedDealId)).toBe(0);
  });

  it('rejects (400) product-ineligible deal', async () => {
    const { status } = await post('/orders', {
      user: userA,
      body: dealBody(branch20Id, productScopedDealId), // scoped to otherProduct
    });
    expect(status).toBe(400);
    expect(await countOrdersWithDeal(productScopedDealId)).toBe(0);
  });

  it('rejects (400) below-minimum-order deal', async () => {
    const { status } = await post('/orders', {
      user: userA,
      body: dealBody(branch20Id, minDealId), // min ₱100 > ₱13 subtotal
    });
    expect(status).toBe(400);
    expect(await countOrdersWithDeal(minDealId)).toBe(0);
  });

  it('rejects (400) a second placement once the per-user usage limit is reached', async () => {
    const first = await post('/orders', {
      user: userB,
      body: dealBody(branch20Id, perUserDealId),
    });
    expect(first.status).toBe(201);
    const second = await post('/orders', {
      user: userB,
      body: dealBody(branch20Id, perUserDealId),
    });
    expect(second.status).toBe(400);
    // Exactly one order consumed the limit.
    expect(await countOrdersWithDeal(perUserDealId, userB)).toBe(1);
  });

  it('rejects (400) once the total usage limit is reached', async () => {
    const u1 = (
      await db.insert(schema.users).values({ name: 'T1', email: `t1-${uid()}@e.com` }).returning()
    )[0]!.id;
    const u2 = (
      await db.insert(schema.users).values({ name: 'T2', email: `t2-${uid()}@e.com` }).returning()
    )[0]!.id;
    const first = await post('/orders', {
      user: u1,
      body: dealBody(branch20Id, totalLimitDealId),
    });
    expect(first.status).toBe(201);
    // Different user, but the total limit of 1 is already consumed.
    const second = await post('/orders', {
      user: u2,
      body: dealBody(branch20Id, totalLimitDealId),
    });
    expect(second.status).toBe(400);
    expect(await countOrdersWithDeal(totalLimitDealId)).toBe(1);
  });

  it('rejects (400) the buy_one_take_one complex type and never persists a deal_id', async () => {
    const { status, json } = await post('/orders', {
      user: userA,
      body: dealBody(branch20Id, bogoDealId),
    });
    expect(status).toBe(400);
    expect(json.error).toBe('This deal cannot be applied at checkout yet');
    expect(await countOrdersWithDeal(bogoDealId)).toBe(0);
  });

  it('rejects (400) an unknown dealId and an inactive deal', async () => {
    const unknown = await post('/orders', {
      user: userA,
      body: dealBody(branch20Id, '00000000-0000-4000-8000-000000000000'),
    });
    expect(unknown.status).toBe(400);

    const inactive = await post('/orders', {
      user: userA,
      body: dealBody(branch20Id, inactiveDealId),
    });
    expect(inactive.status).toBe(400);
    expect(await countOrdersWithDeal(inactiveDealId)).toBe(0);
  });

  it('atomicity: an eligibility 400 inserts no orders row for that placement', async () => {
    const freshUser = (
      await db
        .insert(schema.users)
        .values({ name: 'Atomic', email: `atomic-${uid()}@e.com` })
        .returning()
    )[0]!.id;
    const before = await get('/orders', { user: freshUser });
    expect(before.json.orders).toHaveLength(0);

    const { status } = await post('/orders', {
      user: freshUser,
      body: dealBody(branch20Id, minDealId), // rejected: below minimum
    });
    expect(status).toBe(400);

    const after = await get('/orders', { user: freshUser });
    expect(after.json.orders).toHaveLength(0); // whole tx rolled back
  });

  it('no-dealId placement still returns discount_total 0, total = subtotal, dealId null', async () => {
    const { status, json } = await post('/orders', {
      user: userA,
      body: singleItemBody(branch20Id),
    });
    expect(status).toBe(201);
    expect(json.order.discountTotalCents).toBe(0);
    expect(json.order.totalCents).toBe(json.order.subtotalCents);
    expect(json.order.dealId).toBeNull();
  });

  it('concurrency: two same-user placements of a usage_limit_per_user:1 deal => exactly one 201', async () => {
    const freshUser = (
      await db
        .insert(schema.users)
        .values({ name: 'Race', email: `race-${uid()}@e.com` })
        .returning()
    )[0]!.id;
    const [a, b] = await Promise.all([
      post('/orders', { user: freshUser, body: dealBody(branch20Id, concurrencyDealId) }),
      post('/orders', { user: freshUser, body: dealBody(branch20Id, concurrencyDealId) }),
    ]);
    const statuses = [a.status, b.status].sort();
    // FOR UPDATE serializes the two placements: exactly one succeeds.
    expect(statuses).toEqual([201, 400]);
    expect(await countOrdersWithDeal(concurrencyDealId, freshUser)).toBe(1);
  });
});

describe('GET /orders/:orderId — access control', () => {
  it("403s another user's order; 200s the owner", async () => {
    const created = await post('/orders', { user: userA, body: singleItemBody(branch20Id) });
    const orderId = created.json.order.id;

    const owner = await get(`/orders/${orderId}`, { user: userA });
    expect(owner.status).toBe(200);
    expect(owner.json.order.id).toBe(orderId);

    const other = await get(`/orders/${orderId}`, { user: userB });
    expect(other.status).toBe(403);
  });

  it('401s without a session', async () => {
    const created = await post('/orders', { user: userA, body: singleItemBody(branch20Id) });
    const { status } = await get(`/orders/${created.json.order.id}`);
    expect(status).toBe(401);
  });

  it('404s an unknown order id', async () => {
    const { status } = await get('/orders/00000000-0000-0000-0000-000000000000', { user: userA });
    expect(status).toBe(404);
  });
});
