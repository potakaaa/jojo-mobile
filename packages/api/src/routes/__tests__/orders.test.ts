/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies and the
   getSession stub are loosely typed at the test boundary; assertions narrow them. */
import type { AddressInfo } from 'node:net';

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
  it('rejects a second placement using an already-used coupon (409), no double redeemed row', async () => {
    const { and, eq } = await import('drizzle-orm');
    const u = await freshUser('rw6');
    const code = freshCode();
    await mintCoupon(u, rewardId, code);

    const first = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(first.status).toBe(201);

    const second = await post('/orders', {
      user: u,
      body: { ...singleItemBody(branch20Id), couponCode: code },
    });
    expect(second.status).toBe(409);

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
});
