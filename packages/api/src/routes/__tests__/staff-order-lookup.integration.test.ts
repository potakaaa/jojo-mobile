/* eslint-disable @typescript-eslint/no-explicit-any -- fetch/supertest JSON
   bodies are loosely typed at the test boundary; assertions narrow them. */
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the STAFF-005 (PUP-002) pickup-code lookup endpoint
 * `GET /api/staff/orders/lookup?code=`.
 *
 * Covers (plan Verification Evidence cases a–f + terminal-guard re-assert):
 *   (a) valid code + own branch → 200 with the matching order          [AC3]
 *   (b) valid code + DIFFERENT branch → 404                            [AC4]
 *   (c) nonexistent code → 404, body byte-identical to (b)'s body      [AC4/AC5]
 *   (d) unassigned/no-branch staff → 403                               [authz]
 *   (e) already-completed order's code → 200, status=completed         [AC6]
 *   (f) lowercase/whitespace input still matches (normalization)       [AC3]
 *   (g) re-completing a completed order still rejected by 409          [AC6/AC7]
 *
 * Hermetic: seeds its OWN branches / staff / customer / orders and cleans up in afterAll.
 * Runs against a real local Postgres:
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

const suffix = unique();

let branch1Id: string;
let branch2Id: string;
let productId: string;
let categoryId: string;
let customerId: string;
let staff1Email: string;
let staff1Cookies: string[];
let unassignedStaffCookies: string[];

const createdOrderIds: string[] = [];
let orderCounter = 0;

/**
 * Insert an order and RETURN its id AND seeded `order_number` (the pickup code)
 * so lookup cases can query by code (E3 — extends the STAFF-003 helper which
 * returned only the id).
 */
async function insertOrder(opts: {
  branchId: string;
  status:
    | 'pending'
    | 'accepted'
    | 'preparing'
    | 'flavoring'
    | 'ready'
    | 'completed'
    | 'cancelled'
    | 'rejected';
}): Promise<{ id: string; orderNumber: string }> {
  orderCounter += 1;
  const orderNumber = `JP-SL-${suffix}-${String(orderCounter).padStart(3, '0')}`.toUpperCase();
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: customerId,
      branch_id: opts.branchId,
      order_number: orderNumber,
      status: opts.status,
      subtotal: '10.00',
      total: '10.00',
      payment_method: 'pay_at_branch',
      placed_at: new Date(Date.now() - orderCounter * 60_000),
    })
    .returning({ id: schema.orders.id, order_number: schema.orders.order_number });
  const id = order!.id;
  createdOrderIds.push(id);
  return { id, orderNumber: order!.order_number };
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../lib/auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));

  // Branch-1 (staff1's branch).
  const [b1] = await db
    .insert(schema.branches)
    .values({
      name: `SL B1 ${suffix}`,
      slug: `sl-b1-${suffix}`,
      address: '1 Test St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000051',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branch1Id = b1!.id;

  // Branch-2 (for cross-branch isolation tests).
  const [b2] = await db
    .insert(schema.branches)
    .values({
      name: `SL B2 ${suffix}`,
      slug: `sl-b2-${suffix}`,
      address: '2 Test Ave',
      latitude: '10.300000',
      longitude: '123.900000',
      phone: '+639170000052',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branch2Id = b2!.id;

  // Category + product for order_items FK.
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `Cat SL ${suffix}`, slug: `cat-sl-${suffix}`, sort_order: 1 })
    .returning({ id: schema.categories.id });
  categoryId = category!.id;

  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `Fries SL ${suffix}`,
      slug: `fries-sl-${suffix}`,
      base_price: '5.00',
    })
    .returning({ id: schema.products.id });
  productId = product!.id;

  // Customer (order owner).
  const [customer] = await db
    .insert(schema.users)
    .values({ name: 'Customer SL', email: `cust-sl-${suffix}@example.com` })
    .returning({ id: schema.users.id });
  customerId = customer!.id;

  // Staff-1 assigned to branch-1.
  staff1Email = `staff1-sl-${suffix}@example.com`;
  staff1Cookies = await signUpAndGetCookie(staff1Email, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: branch1Id })
    .where(eq(schema.users.email, staff1Email));

  // Staff-2 assigned to branch-2 (seeded for isolation completeness).
  const staff2Email = `staff2-sl-${suffix}@example.com`;
  await signUpAndGetCookie(staff2Email, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: branch2Id })
    .where(eq(schema.users.email, staff2Email));

  // Unassigned staff (no branch).
  const unassignedEmail = `staff-unassigned-sl-${suffix}@example.com`;
  unassignedStaffCookies = await signUpAndGetCookie(unassignedEmail, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: null })
    .where(eq(schema.users.email, unassignedEmail));
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    const { inArray } = await import('drizzle-orm');
    await db.delete(schema.orderItems).where(inArray(schema.orderItems.order_id, createdOrderIds));
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  // Detach all staff from both branches before deleting (users.assignedBranchId FK).
  const { inArray: inArrayCleanup } = await import('drizzle-orm');
  await db
    .update(schema.users)
    .set({ assignedBranchId: null })
    .where(inArrayCleanup(schema.users.assignedBranchId, [branch1Id, branch2Id]));
  await db.delete(schema.users).where(eq(schema.users.id, customerId));
  await db.delete(schema.products).where(eq(schema.products.id, productId));
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  await db.delete(schema.branches).where(eq(schema.branches.id, branch1Id));
  await db.delete(schema.branches).where(eq(schema.branches.id, branch2Id));
  logSpy?.mockRestore();
});

// ─── (a) valid code + own branch → 200 with the matching order [AC3] ─────────

describe('GET /api/staff/orders/lookup — (a) valid code + own branch', () => {
  it('should return 200 with the matching order for a valid code at own branch', async () => {
    const { id, orderNumber } = await insertOrder({ branchId: branch1Id, status: 'ready' });
    const res = await request(app)
      .get(`/api/staff/orders/lookup?code=${encodeURIComponent(orderNumber)}`)
      .set('Cookie', staff1Cookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.orderNumber).toBe(orderNumber);
    expect(res.body.status).toBe('ready');
  });
});

// ─── (b) valid code + DIFFERENT branch → 404 [AC4] ───────────────────────────

describe('GET /api/staff/orders/lookup — (b) cross-branch code', () => {
  it('should return 404 for a code belonging to a different branch', async () => {
    const { orderNumber } = await insertOrder({ branchId: branch2Id, status: 'ready' });
    const res = await request(app)
      .get(`/api/staff/orders/lookup?code=${encodeURIComponent(orderNumber)}`)
      .set('Cookie', staff1Cookies.join('; '));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'No matching order found for your branch' });
  });
});

// ─── (c) nonexistent code → 404, byte-identical to (b) [AC4/AC5] ─────────────

describe('GET /api/staff/orders/lookup — (c) nonexistent code byte-identical 404', () => {
  it('should return a byte-identical 404 body for a nonexistent code and a cross-branch code', async () => {
    // (b) cross-branch response body.
    const { orderNumber: b2Code } = await insertOrder({ branchId: branch2Id, status: 'ready' });
    const bRes = await request(app)
      .get(`/api/staff/orders/lookup?code=${encodeURIComponent(b2Code)}`)
      .set('Cookie', staff1Cookies.join('; '));
    // (c) nonexistent-code response body.
    const cRes = await request(app)
      .get(`/api/staff/orders/lookup?code=JP-SL-${suffix}-DOES-NOT-EXIST`)
      .set('Cookie', staff1Cookies.join('; '));

    expect(bRes.status).toBe(404);
    expect(cRes.status).toBe(404);
    // Byte-identical body — staff can never infer a code belongs to another branch.
    expect(cRes.body).toEqual(bRes.body);
  });
});

// ─── (d) unassigned/no-branch staff → 403 [authz] ────────────────────────────

describe('GET /api/staff/orders/lookup — (d) unassigned staff', () => {
  it('should return 403 for unassigned/no-branch staff', async () => {
    const { orderNumber } = await insertOrder({ branchId: branch1Id, status: 'ready' });
    const res = await request(app)
      .get(`/api/staff/orders/lookup?code=${encodeURIComponent(orderNumber)}`)
      .set('Cookie', unassignedStaffCookies.join('; '));
    expect(res.status).toBe(403);
  });
});

// ─── (e) already-completed order → 200, status=completed [AC6] ───────────────

describe('GET /api/staff/orders/lookup — (e) completed order', () => {
  it('should return 200 with status=completed for an already-completed order code', async () => {
    const { id, orderNumber } = await insertOrder({ branchId: branch1Id, status: 'completed' });
    const res = await request(app)
      .get(`/api/staff/orders/lookup?code=${encodeURIComponent(orderNumber)}`)
      .set('Cookie', staff1Cookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.status).toBe('completed');
  });
});

// ─── (f) lowercase/whitespace input still matches (normalization) [AC3] ──────

describe('GET /api/staff/orders/lookup — (f) normalization', () => {
  it('should match on lowercase/whitespace input via normalization', async () => {
    const { id, orderNumber } = await insertOrder({ branchId: branch1Id, status: 'ready' });
    const messyCode = `  ${orderNumber.toLowerCase()}  `;
    const res = await request(app)
      .get(`/api/staff/orders/lookup?code=${encodeURIComponent(messyCode)}`)
      .set('Cookie', staff1Cookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('should return 400 for an empty/whitespace-only code', async () => {
    const res = await request(app)
      .get('/api/staff/orders/lookup?code=%20%20')
      .set('Cookie', staff1Cookies.join('; '));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing code' });
  });
});

// ─── (g) re-completing a completed order still rejected by 409 [AC6/AC7] ─────

describe('GET /api/staff/orders/lookup — (g) terminal-guard re-assert', () => {
  it('should still reject re-completing a completed order looked up by code with a 409', async () => {
    // Look up a completed order by its code, then attempt to re-transition it.
    const { orderNumber } = await insertOrder({ branchId: branch1Id, status: 'completed' });
    const lookupRes = await request(app)
      .get(`/api/staff/orders/lookup?code=${encodeURIComponent(orderNumber)}`)
      .set('Cookie', staff1Cookies.join('; '));
    expect(lookupRes.status).toBe(200);
    const foundId = lookupRes.body.id;

    // The state machine rejects any transition out of a terminal (completed) status.
    const patchRes = await request(app)
      .patch(`/api/staff/orders/${foundId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'completed' });
    expect(patchRes.status).toBe(409);
  });
});
