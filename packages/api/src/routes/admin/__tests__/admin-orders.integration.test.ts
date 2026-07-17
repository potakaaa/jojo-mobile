import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin Orders view (ADM-006, #44) — run against a real
 * local Postgres, mirroring `admin-rewards.integration.test.ts`'s hermetic
 * self-seeding pattern.
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers the validate-contract Test Gates (all Fully-Automated):
 *   AC1  — branch filter (only that branch's orders); filters AND-compose; cursor pagination.
 *   AC2  — status filter cross-branch (no branchId); all 8 enum values; unknown → 400.
 *   D6   — date-range boundaries (inclusive start-of-day / end-of-day).
 *   AC3  — admin detail vs staff detail parity on shared fields; 404 unknown id.
 *   AC4  — customer/staff → 403; unauthenticated → 401/403.
 *   AC5  — no mutation endpoint (POST/PATCH/PUT/DELETE → 404).
 *   AC6  — PII boundary: name + phone present; email + auth fields absent.
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

// Hermetic fixtures.
let branchAId: string;
let branchBId: string;
let categoryId: string;
let productId: string;
let optionId: string;
let customer1Id: string;
let customer1Email: string;
let customer1Phone: string;
let customer2Id: string;
let staffUserId: string;

// Seeded order ids (all distinct placed_at so cursor pagination is deterministic).
const o: Record<string, string> = {};

const createdUserIds: string[] = [];
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

/** Seed an order row directly, with items. Returns the order id. */
async function seedOrder(values: {
  userId: string;
  branchId: string;
  status: (typeof schema.orderStatusEnum.enumValues)[number];
  placedAt: Date;
  discountTotal?: string;
  withItems?: boolean;
}): Promise<string> {
  const [row] = await db
    .insert(schema.orders)
    .values({
      user_id: values.userId,
      branch_id: values.branchId,
      order_number: `JP-ORD-${unique().toUpperCase()}`,
      status: values.status,
      subtotal: '10.00',
      discount_total: values.discountTotal ?? '0',
      total: values.discountTotal ? '8.50' : '10.00',
      payment_method: 'pay_at_branch',
      placed_at: values.placedAt,
    })
    .returning();
  const orderId = row!.id;
  createdOrderIds.push(orderId);

  if (values.withItems) {
    await db.insert(schema.orderItems).values({
      order_id: orderId,
      product_id: productId,
      product_name_snapshot: 'Loaded Fries',
      quantity: 2,
      unit_price: '5.00',
      total_price: '10.00',
      selected_options: [
        {
          optionId,
          optionType: 'size',
          name: 'Large',
          priceDeltaCents: 0,
        },
      ],
    });
  }
  return orderId;
}

async function listOrders(query: string, cookies: string[]): Promise<request.Response> {
  return request(app).get(`/api/admin/orders${query}`).set('Cookie', cookies.join('; '));
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  schema = await import('../../../db/schema/index');
  ({ app } = await import('../../../index'));

  adminCookies = (await makeUser('admin')).cookies;
  const staffUser = await makeUser('staff');
  staffCookies = staffUser.cookies;
  staffUserId = staffUser.id;
  customerCookies = (await makeUser('customer')).cookies;

  const customer1 = await makeUser('customer');
  customer1Id = customer1.id;
  customer1Email = customer1.email;
  const customer2 = await makeUser('customer');
  customer2Id = customer2.id;

  const suffix = unique();
  // Give customer1 a known phone so the PII assertion can verify it appears.
  customer1Phone = `+63917${Math.floor(1000000 + Math.random() * 8999999)}`;
  await db
    .update(schema.users)
    .set({ phoneNumber: customer1Phone })
    .where(eq(schema.users.id, customer1Id));

  const [category] = await db
    .insert(schema.categories)
    .values({ name: `OrdCat ${suffix}`, slug: `ord-cat-${suffix}`, sort_order: 1 })
    .returning();
  categoryId = category!.id;

  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `OrdProduct ${suffix}`,
      slug: `ord-product-${suffix}`,
      base_price: '5.00',
    })
    .returning();
  productId = product!.id;

  const [option] = await db
    .insert(schema.productOptions)
    .values({
      product_id: productId,
      option_type: 'size',
      name: 'Large',
      price_delta: '0',
    })
    .returning();
  optionId = option!.id;

  const [branchA] = await db
    .insert(schema.branches)
    .values({
      name: `OrdBranchA ${suffix}`,
      slug: `ord-branch-a-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000001',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 15,
    })
    .returning();
  branchAId = branchA!.id;

  const [branchB] = await db
    .insert(schema.branches)
    .values({
      name: `OrdBranchB ${suffix}`,
      slug: `ord-branch-b-${suffix}`,
      address: '2 St',
      latitude: '14.6',
      longitude: '121.0',
      phone: '+639170000002',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 20,
    })
    .returning();
  branchBId = branchB!.id;

  // Assign the staff user to branchA so the AC3 parity test can read the same order.
  await db
    .update(schema.users)
    .set({ assignedBranchId: branchAId })
    .where(eq(schema.users.id, staffUserId));

  // Orders — all distinct placed_at (deterministic cursor pagination).
  // branchA: oA1(pending, Jan), oA2(ready, Jun-20), oA3(completed+discount, Jun-21), oA4(rejected, Mar-15)
  // branchB: oB1(cancelled, Jun-22), oB2(rejected, Mar-16), oB3(pending, Mar-10)
  o.oA1 = await seedOrder({
    userId: customer1Id,
    branchId: branchAId,
    status: 'pending',
    placedAt: new Date('2026-01-01T10:00:00Z'),
    withItems: true,
  });
  o.oA2 = await seedOrder({
    userId: customer1Id,
    branchId: branchAId,
    status: 'ready',
    placedAt: new Date('2026-06-20T10:00:00Z'),
    withItems: true,
  });
  o.oA3 = await seedOrder({
    userId: customer1Id,
    branchId: branchAId,
    status: 'completed',
    placedAt: new Date('2026-06-21T10:00:00Z'),
    discountTotal: '1.50',
    withItems: true,
  });
  o.oA4 = await seedOrder({
    userId: customer1Id,
    branchId: branchAId,
    status: 'rejected',
    placedAt: new Date('2026-03-15T10:00:00Z'),
    withItems: true,
  });
  o.oB1 = await seedOrder({
    userId: customer2Id,
    branchId: branchBId,
    status: 'cancelled',
    placedAt: new Date('2026-06-22T10:00:00Z'),
    withItems: true,
  });
  o.oB2 = await seedOrder({
    userId: customer2Id,
    branchId: branchBId,
    status: 'rejected',
    placedAt: new Date('2026-03-16T10:00:00Z'),
    withItems: true,
  });
  o.oB3 = await seedOrder({
    userId: customer2Id,
    branchId: branchBId,
    status: 'pending',
    placedAt: new Date('2026-03-10T10:00:00Z'),
    withItems: true,
  });
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await db.delete(schema.orderItems).where(inArray(schema.orderItems.order_id, createdOrderIds));
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  await db.delete(schema.productOptions).where(eq(schema.productOptions.id, optionId));
  await db.delete(schema.products).where(eq(schema.products.id, productId));
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  // Clear the staff→branch FK before deleting branches (users_assigned_branch_id_fk).
  await db
    .update(schema.users)
    .set({ assignedBranchId: null })
    .where(eq(schema.users.id, staffUserId));
  await db.delete(schema.branches).where(inArray(schema.branches.id, [branchAId, branchBId]));
  logSpy?.mockRestore();
  vi.restoreAllMocks();
});

describe('AC1 — branch filter', () => {
  it('?branchId=B returns only branch B orders; branch A orders absent', async () => {
    const res = await listOrders(`?branchId=${branchBId}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const ids = res.body.orders.map((r: { id: string }) => r.id);
    for (const r of res.body.orders) expect(r.branchId).toBe(branchBId);
    expect(ids).toEqual(expect.arrayContaining([o.oB1, o.oB2, o.oB3]));
    expect(ids).not.toContain(o.oA1);
    expect(ids).not.toContain(o.oA2);
  });

  it('filters AND-compose (branchId + status → intersection only)', async () => {
    const res = await listOrders(`?branchId=${branchBId}&status=rejected&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const ids = res.body.orders.map((r: { id: string }) => r.id);
    expect(ids).toContain(o.oB2); // branchB + rejected
    expect(ids).not.toContain(o.oA4); // rejected but branchA
    expect(ids).not.toContain(o.oB3); // branchB but pending
  });

  it('newest-first ordering by placed_at', async () => {
    const res = await listOrders(`?branchId=${branchAId}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const times = res.body.orders.map((r: { placedAt: string }) => new Date(r.placedAt).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });
});

describe('AC2 — status filter cross-branch + enum validation', () => {
  it('?status=rejected returns rejected orders across BOTH branches (no branchId)', async () => {
    const res = await listOrders(`?status=rejected&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    for (const r of res.body.orders) expect(r.status).toBe('rejected');
    const ids = res.body.orders.map((r: { id: string }) => r.id);
    expect(ids).toEqual(expect.arrayContaining([o.oA4, o.oB2])); // branchA + branchB rejected
  });

  it('accepts all 8 order_status enum values (200, never 400)', async () => {
    for (const status of schema.orderStatusEnum.enumValues) {
      const res = await listOrders(`?status=${status}&limit=1`, adminCookies);
      expect(res.status).toBe(200);
    }
  });

  it('unknown status value → 400', async () => {
    const res = await listOrders(`?status=not_a_status`, adminCookies);
    expect(res.status).toBe(400);
  });

  it('malformed branchId (not a uuid) → 400', async () => {
    const res = await listOrders(`?branchId=not-a-uuid`, adminCookies);
    expect(res.status).toBe(400);
  });
});

describe('D6 — date-range boundaries + composition', () => {
  it('dateFrom/dateTo select only in-range orders (branchB March window)', async () => {
    const res = await listOrders(
      `?branchId=${branchBId}&dateFrom=2026-03-01&dateTo=2026-03-31&limit=50`,
      adminCookies,
    );
    expect(res.status).toBe(200);
    const ids = res.body.orders.map((r: { id: string }) => r.id);
    expect(ids).toEqual(expect.arrayContaining([o.oB2, o.oB3])); // Mar-16, Mar-10
    expect(ids).not.toContain(o.oB1); // Jun-22 out of range
  });

  it('inclusive end-of-day: dateTo equal to the order day still includes it', async () => {
    const res = await listOrders(
      `?branchId=${branchBId}&dateFrom=2026-03-16&dateTo=2026-03-16&limit=50`,
      adminCookies,
    );
    expect(res.status).toBe(200);
    const ids = res.body.orders.map((r: { id: string }) => r.id);
    expect(ids).toContain(o.oB2); // placed 2026-03-16T10:00Z — inside inclusive end-of-day
    expect(ids).not.toContain(o.oB3); // 2026-03-10 before dateFrom
  });
});

describe('AC1/D3 — cursor pagination round-trip', () => {
  it('paginates branch A (4 orders) via nextCursor with no dupes/skips', async () => {
    const collected: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const query: string = `?branchId=${branchAId}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res: request.Response = await listOrders(query, adminCookies);
      expect(res.status).toBe(200);
      for (const r of res.body.orders) collected.push(r.id);
      cursor = res.body.nextCursor;
      guard += 1;
    } while (cursor !== null && guard < 10);

    // All 4 branchA orders collected exactly once, newest-first.
    expect(collected).toEqual([o.oA3, o.oA2, o.oA4, o.oA1]);
    expect(new Set(collected).size).toBe(collected.length);
  });
});

describe('AC3 — admin/staff detail parity + 404', () => {
  it('admin detail shared fields equal the staff detail for the same order', async () => {
    const adminRes = await request(app)
      .get(`/api/admin/orders/${o.oA1}`)
      .set('Cookie', adminCookies.join('; '));
    expect(adminRes.status).toBe(200);
    const staffRes = await request(app)
      .get(`/api/staff/orders/${o.oA1}`)
      .set('Cookie', staffCookies.join('; '));
    expect(staffRes.status).toBe(200);

    const admin = adminRes.body.order;
    const staff = staffRes.body; // staff detail is flat (no envelope)

    // Shared StaffOrderDetail fields must be byte-identical (composition guarantees it).
    expect(admin.id).toBe(staff.id);
    expect(admin.orderNumber).toBe(staff.orderNumber);
    expect(admin.status).toBe(staff.status);
    expect(admin.placedAt).toBe(staff.placedAt);
    expect(admin.estimatedReadyAt).toBe(staff.estimatedReadyAt);
    expect(admin.totalCents).toBe(staff.totalCents);
    expect(admin.items).toEqual(staff.items);
  });

  it('admin detail exposes discount context (amount + coupon/deal ids)', async () => {
    const res = await request(app)
      .get(`/api/admin/orders/${o.oA3}`)
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(200);
    const order = res.body.order;
    expect(order.discountTotalCents).toBe(150);
    expect(order).toHaveProperty('couponId');
    expect(order).toHaveProperty('dealId');
    expect(order.branchName).toBeTruthy();
    expect(order.branchId).toBe(branchAId);
  });

  it('unknown order id → 404', async () => {
    const res = await request(app)
      .get(`/api/admin/orders/00000000-0000-0000-0000-000000000000`)
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(404);
  });

  it('malformed order id → 404', async () => {
    const res = await request(app)
      .get(`/api/admin/orders/not-a-uuid`)
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(404);
  });
});

describe('AC4 — role matrix', () => {
  it('customer and staff receive 403 on list and detail', async () => {
    for (const cookies of [customerCookies, staffCookies]) {
      const list = await listOrders('', cookies);
      expect(list.status).toBe(403);
      const detail = await request(app)
        .get(`/api/admin/orders/${o.oA1}`)
        .set('Cookie', cookies.join('; '));
      expect(detail.status).toBe(403);
    }
  });

  it('unauthenticated requests receive 401/403', async () => {
    const list = await request(app).get('/api/admin/orders');
    expect([401, 403]).toContain(list.status);
    const detail = await request(app).get(`/api/admin/orders/${o.oA1}`);
    expect([401, 403]).toContain(detail.status);
  });
});

describe('AC5 — no mutation endpoint (read-only)', () => {
  it('POST/PATCH/PUT/DELETE on the collection → 404 (never handled)', async () => {
    const cookie = adminCookies.join('; ');
    expect((await request(app).post('/api/admin/orders').set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).patch('/api/admin/orders').set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).put('/api/admin/orders').set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).delete('/api/admin/orders').set('Cookie', cookie)).status).toBe(404);
  });

  it('POST/PATCH/PUT/DELETE on a specific order → 404 (never handled)', async () => {
    const cookie = adminCookies.join('; ');
    const url = `/api/admin/orders/${o.oA1}`;
    expect((await request(app).post(url).set('Cookie', cookie)).status).toBe(404);
    expect(
      (await request(app).patch(url).set('Cookie', cookie).send({ status: 'accepted' })).status,
    ).toBe(404);
    expect((await request(app).put(url).set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).delete(url).set('Cookie', cookie)).status).toBe(404);
  });
});

describe('AC6 — PII boundary (name + phone in; email + auth out)', () => {
  it('list rows carry customer name + phone and never email/auth fields', async () => {
    const res = await listOrders(`?branchId=${branchAId}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const row = res.body.orders.find((r: { id: string }) => r.id === o.oA1);
    expect(row).toBeTruthy();
    expect(row.customerName).toBeTruthy();
    expect(row.customerPhone).toBe(customer1Phone);
    // No PII beyond name + phone.
    expect(row).not.toHaveProperty('customerEmail');
    expect(row).not.toHaveProperty('email');
    expect(JSON.stringify(res.body)).not.toContain(customer1Email);
  });

  it('detail carries customer name + phone and never email/auth fields', async () => {
    const res = await request(app)
      .get(`/api/admin/orders/${o.oA1}`)
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(200);
    const order = res.body.order;
    expect(order.customerName).toBeTruthy();
    expect(order.customerPhone).toBe(customer1Phone);
    expect(order).not.toHaveProperty('customerEmail');
    expect(order).not.toHaveProperty('email');
    expect(order).not.toHaveProperty('password');
    expect(order).not.toHaveProperty('emailVerified');
    expect(JSON.stringify(res.body)).not.toContain(customer1Email);
  });
});
