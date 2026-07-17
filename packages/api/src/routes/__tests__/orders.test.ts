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
  const { couponsRouter } = await import('../coupons');
  const { requireSession } = await import('../../middleware/require-session');
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
  // Mounted for the ADM-008 P2 apply-then-place symmetry gate (AC8) — the same
  // shared resolver backs both /coupons/apply preview and /orders placement.
  app.use('/coupons', requireSession, couponsRouter);
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
    values: Partial<typeof schema.offers.$inferInsert> &
      Pick<typeof schema.offers.$inferInsert, 'title' | 'deal_type'>,
  ): Promise<string> => {
    const [row] = await db
      .insert(schema.offers)
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
    .insert(schema.offerBranches)
    .values({ offer_id: branchScopedDealId, branch_id: branch45Id });

  productScopedDealId = await seedDeal({
    title: `ProductScoped ${suffix}`,
    deal_type: 'percentage_discount',
    discount_value: '10.00',
  });
  await db
    .insert(schema.offerProducts)
    .values({ offer_id: productScopedDealId, product_id: otherProductId });

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
      await db
        .insert(schema.users)
        .values({ name: 'X', email: `exp-${uid()}@e.com` })
        .returning()
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
      await db
        .insert(schema.users)
        .values({ name: 'T1', email: `t1-${uid()}@e.com` })
        .returning()
    )[0]!.id;
    const u2 = (
      await db
        .insert(schema.users)
        .values({ name: 'T2', email: `t2-${uid()}@e.com` })
        .returning()
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

// ─── STAR-004: coupon redemption at order placement ──────────────────────────
describe('POST /orders — coupon redemption (STAR-004)', () => {
  let rewardId: string; // reward bound to `productId` (the shared fixture)
  let rewardNullId: string; // reward with no eligible_product_id
  let product2Id: string; // a product the reward is NOT bound to (LD5)

  const freshUser = async (label: string): Promise<string> => {
    const [u] = await db
      .insert(schema.users)
      .values({ name: label, email: `${label}-${uid()}@example.com` })
      .returning();
    return u!.id;
  };
  const mintCoupon = (userId: string, rewardIdArg: string, code: string) =>
    db.insert(schema.coupons).values({ user_id: userId, reward_id: rewardIdArg, code });
  const freshCode = () => `JP-RWD-${uid().slice(0, 4).toUpperCase()}`;

  beforeAll(async () => {
    const [reward] = await db
      .insert(schema.rewards)
      .values({
        name: `Free item ${uid()}`,
        required_stars: 5,
        reward_type: 'free_item',
        eligible_product_id: productId,
      })
      .returning();
    rewardId = reward!.id;

    const [rewardNull] = await db
      .insert(schema.rewards)
      .values({
        name: `Broken reward ${uid()}`,
        required_stars: 5,
        reward_type: 'free_item',
        eligible_product_id: null,
      })
      .returning();
    rewardNullId = rewardNull!.id;

    const [cat2] = await db
      .insert(schema.categories)
      .values({ name: `OrdCat2 ${uid()}`, slug: `ord-cat2-${uid()}`, sort_order: 9 })
      .returning();
    const [p2] = await db
      .insert(schema.products)
      .values({
        category_id: cat2!.id,
        name: `Other ${uid()}`,
        slug: `ord-other-${uid()}`,
        base_price: '3.00',
      })
      .returning();
    product2Id = p2!.id;
    await db.insert(schema.branchProductAvailability).values({
      branch_id: branch20Id,
      product_id: product2Id,
      is_available: true,
    });
  });

  // AC5
  it('marks the coupon used, sets used_at, writes one redeemed star_transactions row', async () => {
    const { and, eq } = await import('drizzle-orm');
    const u = await freshUser('rw5');
    const code = freshCode();
    await mintCoupon(u, rewardId, code);

    const res = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(res.status).toBe(201);
    // unit 650 (base 500 + size 150) * qty 2 = 1300 subtotal; one free unit = 650 off.
    expect(res.json.order.subtotalCents).toBe(1300);
    expect(res.json.order.discountTotalCents).toBe(650);
    expect(res.json.order.totalCents).toBe(650);

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('used');
    expect(coupon!.used_at).not.toBeNull();

    const redeemed = await db
      .select()
      .from(schema.starTransactions)
      .where(
        and(eq(schema.starTransactions.user_id, u), eq(schema.starTransactions.type, 'redeemed')),
      );
    expect(redeemed).toHaveLength(1);
    expect(redeemed[0]!.order_id).toBe(res.json.order.id);
    expect(redeemed[0]!.stars).toBe(0);
  });

  // AC6
  it('rejects a concurrent double placement of the same coupon (exactly one 201, one 409)', async () => {
    const { and, eq } = await import('drizzle-orm');
    const u = await freshUser('rw6');
    const code = freshCode();
    await mintCoupon(u, rewardId, code);

    // Fire both placements concurrently: the optimistic status-guard UPDATE must
    // let exactly one win (201) and force the other to roll back (409).
    const [a, b] = await Promise.all([
      post('/orders', { user: u, body: { ...singleItemBody(branch20Id), couponCode: code } }),
      post('/orders', { user: u, body: { ...singleItemBody(branch20Id), couponCode: code } }),
    ]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);

    // Exactly one coupon-backed order persisted; the 409 loser rolled back its insert.
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(1);

    const redeemed = await db
      .select()
      .from(schema.starTransactions)
      .where(
        and(eq(schema.starTransactions.user_id, u), eq(schema.starTransactions.type, 'redeemed')),
      );
    expect(redeemed).toHaveLength(1);
  });

  // AC7 (placement half)
  it('rejects placement for a reward with a null eligible_product_id', async () => {
    const u = await freshUser('rw7');
    const code = freshCode();
    await mintCoupon(u, rewardNullId, code);

    const res = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(res.status).toBe(400);
  });

  // LD5 recompute-drop
  it('rejects placement when the reward eligible item is not in the order items', async () => {
    const u = await freshUser('rwLd5');
    const code = freshCode();
    await mintCoupon(u, rewardId, code); // bound to productId, absent below

    const res = await post('/orders', {
      user: u,
      body: {
        branchId: branch20Id,
        paymentMethod: 'pay_at_branch',
        items: [{ productId: product2Id, quantity: 1, selectedOptions: [] }],
        couponCode: code,
      },
    });
    expect(res.status).toBe(400);
  });

  // REGRESSION
  it('leaves discount_total at 0.00 when no couponCode is supplied', async () => {
    const u = await freshUser('rwRegr');
    const res = await post('/orders', { user: u, body: singleItemBody(branch20Id) });
    expect(res.status).toBe(201);
    expect(res.json.order.discountTotalCents).toBe(0);
  });

  // Single-active-discount rule: a deal and a reward coupon are mutually exclusive
  // and must never both apply on one order. The guard fires BEFORE any discount
  // computation or DB write, so nothing is placed and the coupon is untouched.
  it('rejects (400) when BOTH dealId and couponCode are supplied; no order/side-effects', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('rwExcl');
    const code = freshCode();
    await mintCoupon(u, rewardId, code);

    const res = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), dealId: pctDealId, couponCode: code },
    });
    expect(res.status).toBe(400);

    // No order row was created for this user.
    const userOrders = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(userOrders).toHaveLength(0);

    // The coupon was NOT consumed — still available, no used_at.
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
  });
});

// ─── ADM-008: offer-coupon redemption + is_deal guard + bulk claim race ──────
describe('POST /orders — offer coupon + is_deal guard (ADM-008)', () => {
  let offerId: string; // agnostic percentage_discount 20% — no scope, no minimum
  let dealProductId: string; // products.is_deal = true, available at branch20

  const freshUser = async (label: string): Promise<string> => {
    const [u] = await db
      .insert(schema.users)
      .values({ name: label, email: `${label}-${uid()}@example.com` })
      .returning();
    return u!.id;
  };
  const offerCode = () => `JP-OFR-${uid().slice(0, 4).toUpperCase()}`;

  beforeAll(async () => {
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const nowMs = Date.now();
    const [offer] = await db
      .insert(schema.offers)
      .values({
        title: `OrdOffer ${uid()}`,
        deal_type: 'percentage_discount',
        discount_value: '20.00',
        start_at: new Date(nowMs - HOUR),
        end_at: new Date(nowMs + DAY),
        is_active: true,
      })
      .returning();
    offerId = offer!.id;

    const [cat] = await db
      .insert(schema.categories)
      .values({ name: `DealCat ${uid()}`, slug: `deal-cat-${uid()}`, sort_order: 8 })
      .returning();
    const [dealProduct] = await db
      .insert(schema.products)
      .values({
        category_id: cat!.id,
        name: `Bundle ${uid()}`,
        slug: `bundle-${uid()}`,
        base_price: '9.00',
        is_deal: true,
      })
      .returning();
    dealProductId = dealProduct!.id;
    await db
      .insert(schema.branchProductAvailability)
      .values({ branch_id: branch20Id, product_id: dealProductId, is_available: true });
  });

  // AC5 (order half) + re-apply-after-use: a targeted offer coupon redeems once,
  // burns, and a second placement of the now-used code is rejected (409).
  it('places an order redeeming a targeted offer coupon, then rejects re-use (409)', async () => {
    const { and, eq } = await import('drizzle-orm');
    const u = await freshUser('ofr5');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: offerId, code });

    const first = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(first.status).toBe(201);
    // subtotal 1300 (650 unit × 2); 20% => 260 discount; total 1040.
    expect(first.json.order.subtotalCents).toBe(1300);
    expect(first.json.order.discountTotalCents).toBe(260);
    expect(first.json.order.totalCents).toBe(1040);

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('used');
    expect(coupon!.used_at).not.toBeNull();
    expect(coupon!.user_id).toBe(u);
    // The consumed offer-coupon is persisted as the order's audit link.
    expect(first.json.order.couponId).toBe(coupon!.id);

    // C13: an offer coupon is NOT a reward redemption — it must NOT write a
    // "Redeemed reward" star_transactions ledger row (the atomic burn is shared,
    // but the loyalty ledger is reward-only).
    const ledger = await db
      .select()
      .from(schema.starTransactions)
      .where(
        and(eq(schema.starTransactions.user_id, u), eq(schema.starTransactions.type, 'redeemed')),
      );
    expect(ledger).toHaveLength(0);

    // Re-use of the now-used coupon by the same owner is rejected (single-use).
    const second = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(second.status).toBe(409);
  });

  // AC6 (LD6): a coupon code cannot be combined with an is_deal product. The guard
  // fires inside the placement tx before any write → 400, no order, coupon intact.
  it('rejects (400) a coupon code combined with an is_deal product; places no order', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('ofrDeal');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: offerId, code });

    const res = await post('/orders', {
      user: u,
      body: {
        branchId: branch20Id,
        paymentMethod: 'pay_at_branch',
        items: [{ productId: dealProductId, quantity: 1, selectedOptions: [] }],
        couponCode: code,
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('Coupon codes cannot be combined with Deal products.');

    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
  });

  // Claim-on-redeem atomicity — a BULK (user_id NULL) two-racer. Added ALONGSIDE
  // the STAR-004 reward-coupon race test (commit 43e9c13); exercises the COALESCE
  // claim path under concurrency: exactly one racer claims+burns, the other 409s.
  it('two racers claiming the SAME bulk offer code: exactly one 201, one 409; claimed to winner', async () => {
    const { eq } = await import('drizzle-orm');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: null, offer_id: offerId, code });
    const u1 = await freshUser('ofrRace1');
    const u2 = await freshUser('ofrRace2');

    const [a, b] = await Promise.all([
      post('/orders', { user: u1, body: { ...singleItemBody(branch20Id), couponCode: code } }),
      post('/orders', { user: u2, body: { ...singleItemBody(branch20Id), couponCode: code } }),
    ]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);

    // Claimed exactly once, to the winner (COALESCE set user_id on redeem).
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('used');
    expect(coupon!.used_at).not.toBeNull();
    const winner = a.status === 201 ? u1 : u2;
    expect(coupon!.user_id).toBe(winner);
  });
});

// ─── ADM-008 Fix 6 (P1): unconfigured free-mechanic offer coupons at placement ──
// A free_item/free_upgrade offer with no benefit_product_id has no real redemption
// meaning. The permanent resolver guard rejects it at placement BEFORE any burn or
// order write (single resolver, symmetric with the apply-preview reject) — killing
// the legacy cheapest-line mis-discount. The coupon stays available; no order lands.
describe('POST /orders — unconfigured free-mechanic offer coupon reject (ADM-008 Fix 6 P1)', () => {
  let freeItemOfferId: string;
  let freeUpgradeOfferId: string;

  const freshUser = async (label: string): Promise<string> => {
    const [u] = await db
      .insert(schema.users)
      .values({ name: label, email: `${label}-${uid()}@example.com` })
      .returning();
    return u!.id;
  };
  const offerCode = () => `JP-OFR-${uid().slice(0, 4).toUpperCase()}`;

  beforeAll(async () => {
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const nowMs = Date.now();
    const [fi] = await db
      .insert(schema.offers)
      .values({
        title: `FreeItemUnconfig ${uid()}`,
        deal_type: 'free_item',
        start_at: new Date(nowMs - HOUR),
        end_at: new Date(nowMs + DAY),
        is_active: true,
      })
      .returning();
    freeItemOfferId = fi!.id;
    const [fu] = await db
      .insert(schema.offers)
      .values({
        title: `FreeUpgradeUnconfig ${uid()}`,
        deal_type: 'free_upgrade',
        start_at: new Date(nowMs - HOUR),
        end_at: new Date(nowMs + DAY),
        is_active: true,
      })
      .returning();
    freeUpgradeOfferId = fu!.id;
  });

  it('rejects (400) an unconfigured free_item offer coupon; coupon not burned, no order placed', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('ofrFiUnconfig');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: freeItemOfferId, code });

    const res = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('This offer is not configured for redemption.');

    // No burn (still available, no used_at) and the whole placement rolled back.
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  });

  it('rejects (400) an unconfigured free_upgrade offer coupon; coupon not burned, no order placed', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('ofrFuUnconfig');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: freeUpgradeOfferId, code });

    const res = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('This offer is not configured for redemption.');

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  });
});

// ─── ADM-008 P1b→P2: permanent deny-guard at placement ──────────────────────
// buy_one_take_one / bundle offer coupons are PERMANENTLY denied at placement by
// the single shared resolver — symmetric with the apply-preview deny (b1t1/bundle
// deny survives P2 untouched). Two-line carts (finding 5) prove no cheapest-line
// discount is persisted: absent the guard the order would land with a 300c discount.
// Reason precedence is locked (eligibility runs BEFORE the mechanic deny), and a
// bulk (user_id NULL) coupon is denied BEFORE the claim-on-redeem. The CONFIGURED
// free-mechanic cases that P1b denied now REDEEM under P2 — see the P2 block below.
describe('POST /orders — P1b permanent deny-guard (ADM-008 Fix 6 P1b/P2)', () => {
  let b1t1OfferId: string;
  let bundleOfferId: string;
  let outOfWindowB1t1OfferId: string; // b1t1 offer whose window has closed
  let cheapProductId: string; // 300c second line, available at branch20

  const freshUser = async (label: string): Promise<string> => {
    const [u] = await db
      .insert(schema.users)
      .values({ name: label, email: `${label}-${uid()}@example.com` })
      .returning();
    return u!.id;
  };
  const offerCode = () => `JP-OFR-${uid().slice(0, 4).toUpperCase()}`;

  const seedOffer = async (
    values: Partial<typeof schema.offers.$inferInsert> &
      Pick<typeof schema.offers.$inferInsert, 'title' | 'deal_type'>,
  ): Promise<string> => {
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const nowMs = Date.now();
    const [row] = await db
      .insert(schema.offers)
      .values({
        start_at: new Date(nowMs - HOUR),
        end_at: new Date(nowMs + DAY),
        is_active: true,
        ...values,
      })
      .returning();
    return row!.id;
  };

  // Two-line cart: seeded product (650c w/ size) + cheaper product (300c). Absent
  // the guard, the cheapest-line path would persist a 300c discount.
  const twoLineBody = (branchId: string) => ({
    branchId,
    paymentMethod: 'pay_at_branch',
    items: [
      { productId, quantity: 1, selectedOptions: [{ optionId: sizeOptionId }] },
      { productId: cheapProductId, quantity: 1, selectedOptions: [] },
    ],
  });

  beforeAll(async () => {
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const nowMs = Date.now();
    b1t1OfferId = await seedOffer({ title: `P1bBt1 ${uid()}`, deal_type: 'buy_one_take_one' });
    bundleOfferId = await seedOffer({ title: `P1bBundle ${uid()}`, deal_type: 'bundle' });
    // Out-of-window b1t1 — proves checkDealEligibility (not_in_window) runs BEFORE
    // the mechanic deny (deterministic reason precedence).
    const [oow] = await db
      .insert(schema.offers)
      .values({
        title: `P1bBt1Oow ${uid()}`,
        deal_type: 'buy_one_take_one',
        start_at: new Date(nowMs - 2 * DAY),
        end_at: new Date(nowMs - DAY),
        is_active: true,
      })
      .returning();
    outOfWindowB1t1OfferId = oow!.id;

    const [cat] = await db
      .insert(schema.categories)
      .values({ name: `P1bCat ${uid()}`, slug: `p1b-cat-${uid()}`, sort_order: 9 })
      .returning();
    const [cheap] = await db
      .insert(schema.products)
      .values({
        category_id: cat!.id,
        name: `P1bCheap ${uid()}`,
        slug: `p1b-cheap-${uid()}`,
        base_price: '3.00',
      })
      .returning();
    cheapProductId = cheap!.id;
    await db
      .insert(schema.branchProductAvailability)
      .values({ branch_id: branch20Id, product_id: cheapProductId, is_available: true });
  });

  const expectDeniedAtPlacement = async (
    offerId: string,
    label: string,
    expectedMessage: string,
  ): Promise<void> => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser(label);
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: offerId, code });

    const res = await post('/orders', {
      user: u,
      body: { ...twoLineBody(branch20Id), couponCode: code },
    });
    expect(res.status).toBe(400);
    // Per-branch message pin (b1t1/bundle vs free-mechanic deny messages differ).
    expect(res.json.error).toBe(expectedMessage);

    // No burn + no order (the whole placement tx rolled back → no 300c leak lands).
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  };

  it('denies a buy_one_take_one offer coupon at placement (permanent)', async () => {
    await expectDeniedAtPlacement(
      b1t1OfferId,
      'p1bBt1',
      'This offer type cannot be redeemed with a coupon.',
    );
  });

  it('denies a bundle offer coupon at placement (permanent)', async () => {
    await expectDeniedAtPlacement(
      bundleOfferId,
      'p1bBundle',
      'This offer type cannot be redeemed with a coupon.',
    );
  });

  it('reason precedence: an out-of-window b1t1 coupon rejects with the eligibility message, not the deny', async () => {
    // checkDealEligibility runs BEFORE the mechanic deny, so an out-of-window offer
    // surfaces the not_in_window message — never the b1t1 deny message.
    await expectDeniedAtPlacement(
      outOfWindowB1t1OfferId,
      'p1bBt1Oow',
      'This deal is not currently available.',
    );
  });

  it('deny-before-claim: a BULK (user_id NULL) b1t1 coupon is denied without being claimed', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('p1bBulkDeny');
    const code = offerCode();
    // Bulk coupon: user_id NULL. If the deny ran AFTER the claim, the COALESCE
    // burn UPDATE would have set user_id — it must not, since the deny precedes it.
    await db.insert(schema.coupons).values({ user_id: null, offer_id: b1t1OfferId, code });

    const res = await post('/orders', {
      user: u,
      body: { ...twoLineBody(branch20Id), couponCode: code },
    });
    expect(res.status).toBe(400);

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.user_id).toBeNull(); // never claimed to the placing user
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  });
});

// ─── ADM-008 P2: CONFIGURED free-mechanic redemption at placement ────────────
// free_item waives one unit of the benefit product (reward math verbatim, NOT the
// cheapest cart line); free_upgrade waives one unit's paid size-upgrade delta. Exact
// cents on the stored total + atomic burn + re-use reject (409); reject on
// not_in_cart / no_upgrade_to_waive (no ₱0-and-burn), no order. The placement
// zero-floor clamp (AC7) keeps a corrupt negative discount_value from making the
// total exceed the subtotal, and AC8 proves preview == placement (single resolver).
describe('POST /orders — P2 configured free-mechanic redemption (ADM-008 Fix 6 P2)', () => {
  let fiOfferId: string; // free_item, benefit = productId (650c w/ size in cart)
  let fuOfferId: string; // free_upgrade, benefit = productId (150c size delta)
  let negativeFixedOfferId: string; // fixed_discount, NEGATIVE discount_value (SQL-only)
  let neutralProductId: string; // available at branch20, never a benefit product
  let zeroPercentOfferId: string; // percentage_discount, discount_value 0 (F1, SQL-only)
  let nullFixedOfferId: string; // fixed_discount, NULL discount_value (F1, SQL-only)
  let freeProductId: string; // ₱0-priced product (F7b: pins the free-branch <=0 guard)
  let fiZeroOfferId: string; // free_item, benefit = the ₱0 product (F7b)

  const freshUser = async (label: string): Promise<string> => {
    const [u] = await db
      .insert(schema.users)
      .values({ name: label, email: `${label}-${uid()}@example.com` })
      .returning();
    return u!.id;
  };
  const offerCode = () => `JP-OFR-${uid().slice(0, 4).toUpperCase()}`;

  const seedOffer = async (
    values: Partial<typeof schema.offers.$inferInsert> &
      Pick<typeof schema.offers.$inferInsert, 'title' | 'deal_type'>,
  ): Promise<string> => {
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const nowMs = Date.now();
    const [row] = await db
      .insert(schema.offers)
      .values({
        start_at: new Date(nowMs - HOUR),
        end_at: new Date(nowMs + DAY),
        is_active: true,
        ...values,
      })
      .returning();
    return row!.id;
  };

  beforeAll(async () => {
    fiOfferId = await seedOffer({
      title: `P2Fi ${uid()}`,
      deal_type: 'free_item',
      benefit_product_id: productId,
    });
    fuOfferId = await seedOffer({
      title: `P2Fu ${uid()}`,
      deal_type: 'free_upgrade',
      benefit_product_id: productId,
    });
    // Negative discount_value — only reachable by direct SQL now that admin Zod
    // forbids a non-positive value. ADM-008 Fix 6 F1: this now REJECTS at the resolver
    // (no zero-value burn), rather than clamping to a 0-discount placement.
    negativeFixedOfferId = await seedOffer({
      title: `P2Neg ${uid()}`,
      deal_type: 'fixed_discount',
      discount_value: '-5.00',
    });
    // ADM-008 Fix 6 F1: zero-redeemable-value percentage/fixed offers (SQL-only —
    // admin Zod forbids them). Both reject at placement, no burn, no order.
    zeroPercentOfferId = await seedOffer({
      title: `P2ZeroPct ${uid()}`,
      deal_type: 'percentage_discount',
      discount_value: '0.00',
    });
    nullFixedOfferId = await seedOffer({
      // discount_value omitted → NULL.
      title: `P2NullFixed ${uid()}`,
      deal_type: 'fixed_discount',
    });

    const [cat] = await db
      .insert(schema.categories)
      .values({ name: `P2Cat ${uid()}`, slug: `p2-cat-${uid()}`, sort_order: 7 })
      .returning();
    const [neutral] = await db
      .insert(schema.products)
      .values({
        category_id: cat!.id,
        name: `P2Neutral ${uid()}`,
        slug: `p2-neutral-${uid()}`,
        base_price: '3.00',
      })
      .returning();
    neutralProductId = neutral!.id;
    await db
      .insert(schema.branchProductAvailability)
      .values({ branch_id: branch20Id, product_id: neutralProductId, is_available: true });

    // ADM-008 Fix 6 F7b: a ₱0-priced product + a free_item offer whose benefit is it.
    // free_item waives one unit = ₱0 → computed 0 → the free-branch <=0 guard rejects.
    const [freeProd] = await db
      .insert(schema.products)
      .values({
        category_id: cat!.id,
        name: `P2Free ${uid()}`,
        slug: `p2-free-${uid()}`,
        base_price: '0.00',
      })
      .returning();
    freeProductId = freeProd!.id;
    await db
      .insert(schema.branchProductAvailability)
      .values({ branch_id: branch20Id, product_id: freeProductId, is_available: true });
    fiZeroOfferId = await seedOffer({
      title: `P2FiZero ${uid()}`,
      deal_type: 'free_item',
      benefit_product_id: freeProductId,
    });
  });

  // AC3
  it('redeems a free_item offer coupon at the exact benefit price, burns, rejects re-use (409)', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('p2fi');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: fiOfferId, code });

    const first = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(first.status).toBe(201);
    // singleItemBody: productId qty 2 + size → unit 650, subtotal 1300. free_item
    // waives ONE unit of the benefit (productId) = 650. total 650.
    expect(first.json.order.subtotalCents).toBe(1300);
    expect(first.json.order.discountTotalCents).toBe(650);
    expect(first.json.order.totalCents).toBe(650);

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('used');
    expect(coupon!.used_at).not.toBeNull();
    expect(first.json.order.couponId).toBe(coupon!.id);

    // Re-use of the now-burned coupon by the owner is rejected (single-use).
    const second = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(second.status).toBe(409);
  });

  // AC5
  it('redeems a free_upgrade offer coupon at the exact size-upgrade delta, burns', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('p2fu');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: fuOfferId, code });

    const res = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(res.status).toBe(201);
    // size delta 150 waived. subtotal 1300, discount 150, total 1150.
    expect(res.json.order.subtotalCents).toBe(1300);
    expect(res.json.order.discountTotalCents).toBe(150);
    expect(res.json.order.totalCents).toBe(1150);

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('used');
  });

  // AC6
  it('rejects a free_upgrade coupon when the benefit has no paid size upgrade (no_upgrade_to_waive)', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('p2fuNo');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: fuOfferId, code });

    // Cart holds the benefit product but with NO size option → nothing to waive.
    const res = await post('/orders', {
      user: u,
      body: {
        branchId: branch20Id,
        paymentMethod: 'pay_at_branch',
        items: [{ productId, quantity: 1, selectedOptions: [] }],
        couponCode: code,
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('Add a size upgrade to the eligible item to use this offer.');

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available'); // no ₱0-and-burn
    expect(coupon!.used_at).toBeNull();
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  });

  // AC4
  it('rejects a free_item coupon when the benefit product is absent from the cart (not_in_cart)', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('p2fiAbsent');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: fiOfferId, code });

    const res = await post('/orders', {
      user: u,
      body: {
        branchId: branch20Id,
        paymentMethod: 'pay_at_branch',
        items: [{ productId: neutralProductId, quantity: 1, selectedOptions: [] }],
        couponCode: code,
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('Add the eligible item to your cart to use this offer.');

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  });

  // AC7 / F1 — a corrupt NEGATIVE discount_value now REJECTS at placement (ADM-008 Fix
  // 6 F1: a percentage/fixed offer with no positive redeemable value must never burn a
  // coupon for zero benefit). The coupon stays available and no order is written.
  it('rejects a negative discount_value fixed offer coupon (F1: no zero-value burn)', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('p2neg');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: negativeFixedOfferId, code });

    const res = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('This offer has no redeemable value.');

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  });

  // F1 — a percentage_discount(0) and a fixed_discount(NULL) offer coupon both reject
  // at placement (zero redeemable value), no burn, no order.
  const expectZeroValueRejectAtPlacement = async (
    offerId: string,
    label: string,
  ): Promise<void> => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser(label);
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: offerId, code });

    const res = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('This offer has no redeemable value.');

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  };

  it('rejects a percentage_discount offer with discount_value 0 (F1)', async () => {
    await expectZeroValueRejectAtPlacement(zeroPercentOfferId, 'p2pctZero');
  });

  it('rejects a fixed_discount offer with a NULL discount_value (F1)', async () => {
    await expectZeroValueRejectAtPlacement(nullFixedOfferId, 'p2nullFixed');
  });

  // F7b — a free_item offer whose benefit product is ₱0-priced computes a 0 discount,
  // so the free-branch <=0 guard rejects it (no ₱0-and-burn). Cart holds the ₱0 benefit
  // product + a normal product (so the subtotal is non-zero).
  it('rejects a free_item coupon whose benefit product is ₱0-priced (F7b, no burn)', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('p2fiZero');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: fiZeroOfferId, code });

    const res = await post('/orders', {
      user: u,
      body: {
        branchId: branch20Id,
        paymentMethod: 'pay_at_branch',
        items: [
          { productId: freeProductId, quantity: 1, selectedOptions: [] },
          { productId: neutralProductId, quantity: 1, selectedOptions: [] },
        ],
        couponCode: code,
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('This offer is not configured for redemption.');

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  });

  // AC8 — single-resolver symmetry: the preview amount equals the placement amount
  // for the identical cart + code.
  it('computes the identical free_item discount at preview and at placement', async () => {
    const u = await freshUser('p2sym');
    const code = offerCode();
    await db.insert(schema.coupons).values({ user_id: u, offer_id: fiOfferId, code });

    const cartItems = [{ productId, quantity: 2, selectedOptions: [{ optionId: sizeOptionId }] }];
    const preview = await post('/coupons/apply', {
      user: u,
      body: { code, pickupBranchId: branch20Id, cartItems },
    });
    expect(preview.status).toBe(200);
    expect(preview.json.discount.amountCents).toBe(650);

    const placed = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(placed.status).toBe(201);
    expect(placed.json.order.discountTotalCents).toBe(preview.json.discount.amountCents);
  });
});

// ─── MENU-003: deal component availability at placement (AC5 — HARD, money) ──
//
// AC5 is a trust boundary: until this guard existed, a customer could place (and
// be charged for) an order containing a deal whose ingredient the branch had run
// out of. Fully-Automated by SPEC mandate — Known-Gap is banned for this AC.
describe('POST /orders — MENU-003 deal component availability', () => {
  let branchOkId: string; // deal fully available here
  let branchDownId: string; // deal's component unavailable here
  let categoryId: string;

  let dealId: string; // 1 component: available at branchOk, unavailable at branchDown
  let secondDealId: string; // fully available at branchOk — the multi-line partner
  let inactiveComponentDealId: string; // AC8: component branch-available but is_active=false

  const freshUser = async (label: string): Promise<string> => {
    const [u] = await db
      .insert(schema.users)
      .values({ name: label, email: `${label}-${uid()}@example.com` })
      .returning();
    return u!.id;
  };

  async function makeBranch(label: string, suffix: string): Promise<string> {
    const [branch] = await db
      .insert(schema.branches)
      .values({
        name: `MENU003 ${label} ${suffix}`,
        slug: `menu003-ord-${label.toLowerCase()}-${suffix}`,
        address: `${label} Rd`,
        latitude: '14.5',
        longitude: '120.9',
        phone: '+639170000011',
        opening_hours: '08:00-20:00',
        estimated_prep_minutes: 20,
      })
      .returning();
    return branch!.id;
  }

  async function makeProduct(
    suffix: string,
    opts: { isDeal?: boolean; isActive?: boolean } = {},
  ): Promise<string> {
    const [product] = await db
      .insert(schema.products)
      .values({
        category_id: categoryId,
        name: `MENU003 Ord ${suffix}`,
        slug: `menu003-ord-${suffix}`,
        base_price: '9.00',
        is_deal: opts.isDeal ?? false,
        is_active: opts.isActive ?? true,
      })
      .returning();
    return product!.id;
  }

  async function attach(dealProductId: string, componentProductId: string) {
    await db
      .insert(schema.dealComponents)
      .values({ deal_product_id: dealProductId, component_product_id: componentProductId });
  }

  async function setAvailability(branchId: string, productId: string, isAvailable: boolean) {
    await db
      .insert(schema.branchProductAvailability)
      .values({ branch_id: branchId, product_id: productId, is_available: isAvailable });
  }

  const orderBody = (branchId: string, productIds: string[]) => ({
    branchId,
    paymentMethod: 'pay_at_branch' as const,
    items: productIds.map((productId) => ({ productId, quantity: 1, selectedOptions: [] })),
  });

  beforeAll(async () => {
    const suffix = uid();
    branchOkId = await makeBranch('Ok', suffix);
    branchDownId = await makeBranch('Down', suffix);

    const [category] = await db
      .insert(schema.categories)
      .values({ name: `MENU003 Ord ${suffix}`, slug: `menu003-ord-cat-${suffix}`, sort_order: 9 })
      .returning();
    categoryId = category!.id;

    // The deal under test + its single component. The DEAL-PRODUCT ITSELF is
    // marked available at BOTH branches, so ONLY the component's availability
    // can decide the outcome — precisely the gap AC5 closes. The component is up
    // at branchOk and down at branchDown, which makes the very same deal
    // orderable at one branch and rejected at the other.
    const component = await makeProduct(`comp-${suffix}`);
    dealId = await makeProduct(`deal-${suffix}`, { isDeal: true });
    await attach(dealId, component);
    await setAvailability(branchOkId, component, true);
    await setAvailability(branchOkId, dealId, true);
    await setAvailability(branchDownId, component, false);
    await setAvailability(branchDownId, dealId, true);

    // A second deal that is fully available at BOTH branches — the partner line
    // for the multi-deal cart, proving the check covers EVERY deal in the cart
    // rather than stopping at the first one.
    const secondComponent = await makeProduct(`comp2-${suffix}`);
    secondDealId = await makeProduct(`deal2-${suffix}`, { isDeal: true });
    await attach(secondDealId, secondComponent);
    await setAvailability(branchOkId, secondComponent, true);
    await setAvailability(branchOkId, secondDealId, true);
    await setAvailability(branchDownId, secondComponent, true);
    await setAvailability(branchDownId, secondDealId, true);

    // AC8 at placement: component's bpa row says available, but the component is
    // globally deactivated. Both signals are required, so the deal is rejected.
    const inactiveComponent = await makeProduct(`comp-inactive-${suffix}`, { isActive: false });
    inactiveComponentDealId = await makeProduct(`deal-inactive-${suffix}`, { isDeal: true });
    await attach(inactiveComponentDealId, inactiveComponent);
    await setAvailability(branchOkId, inactiveComponent, true);
    await setAvailability(branchOkId, inactiveComponentDealId, true);
  });

  it('AC5: rejects (400) an order for a deal whose component is unavailable at the branch, writing no order row', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('menu003rej');

    const res = await post('/orders', { user: u, body: orderBody(branchDownId, [dealId]) });

    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/no longer fully available at this branch/);

    // Nothing was written — the throw rolled the whole placement back.
    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  });

  it('AC5 (contrast): accepts (201) the SAME deal at a branch where every component IS available', async () => {
    const u = await freshUser('menu003ok');

    const res = await post('/orders', { user: u, body: orderBody(branchOkId, [dealId]) });

    expect(res.status).toBe(201);
    expect(res.json.order.items).toHaveLength(1);
    expect(res.json.order.items[0].productId).toBe(dealId);
  });

  it('rejects the WHOLE order when a cart holds 2 deal lines and only one is unavailable', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('menu003multi');

    // At branchDown: secondDeal is fully available, dealId is NOT. The AVAILABLE
    // deal is listed FIRST, so a check that stopped at the first deal line (or
    // assumed one deal per order) would wrongly accept this cart.
    const res = await post('/orders', {
      user: u,
      body: orderBody(branchDownId, [secondDealId, dealId]),
    });

    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/no longer fully available at this branch/);

    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  });

  it('AC8: rejects (400) a deal whose component is branch-available but globally deactivated', async () => {
    const { eq } = await import('drizzle-orm');
    const u = await freshUser('menu003inactive');

    const res = await post('/orders', {
      user: u,
      body: orderBody(branchOkId, [inactiveComponentDealId]),
    });

    expect(res.status).toBe(400);

    const placed = await db.select().from(schema.orders).where(eq(schema.orders.user_id, u));
    expect(placed).toHaveLength(0);
  });

  it('leaves a regular (non-deal) product order unaffected by the deal check', async () => {
    const u = await freshUser('menu003regular');
    const regular = await makeProduct(`regular-${uid()}`);
    await setAvailability(branchOkId, regular, true);

    const res = await post('/orders', { user: u, body: orderBody(branchOkId, [regular]) });
    expect(res.status).toBe(201);
  });
});
