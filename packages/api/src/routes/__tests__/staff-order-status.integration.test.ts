/* eslint-disable @typescript-eslint/no-explicit-any -- fetch/supertest JSON
   bodies are loosely typed at the test boundary; assertions narrow them. */
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the STAFF-003 order-status PATCH endpoint and
 * Completed Orders GET endpoint.
 *
 * Covers:
 *   AC-1 — valid transitions → 200, new status, correct timestamp non-null
 *   AC-2 — invalid/terminal-source transitions → 409
 *   AC-3 — branch isolation on PATCH → 403 cross-branch/unassigned
 *   AC-4 — `rejected` valid terminal; re-PATCH → 409
 *   AC-5 — GET /orders/completed returns only assigned-branch terminal orders
 *   AC-6 — ETA set from branch default on accept (accept-time base ±5s); etaMinutes ignored
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
/** Branch-1 prep minutes — used for AC-6 ETA assertion. */
const BRANCH1_PREP_MINUTES = 15;

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
}): Promise<string> {
  orderCounter += 1;
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: customerId,
      branch_id: opts.branchId,
      order_number: `JP-SS-${suffix}-${String(orderCounter).padStart(3, '0')}`,
      status: opts.status,
      subtotal: '10.00',
      total: '10.00',
      payment_method: 'pay_at_branch',
      placed_at: new Date(Date.now() - orderCounter * 60_000),
    })
    .returning({ id: schema.orders.id });
  const orderId = order!.id;
  createdOrderIds.push(orderId);
  return orderId;
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../lib/auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));

  // Branch-1 (staff1's branch) with a known prep time for AC-6.
  const [b1] = await db
    .insert(schema.branches)
    .values({
      name: `SS B1 ${suffix}`,
      slug: `ss-b1-${suffix}`,
      address: '1 Test St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000031',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: BRANCH1_PREP_MINUTES,
    })
    .returning({ id: schema.branches.id });
  branch1Id = b1!.id;

  // Branch-2 (for cross-branch isolation tests).
  const [b2] = await db
    .insert(schema.branches)
    .values({
      name: `SS B2 ${suffix}`,
      slug: `ss-b2-${suffix}`,
      address: '2 Test Ave',
      latitude: '10.300000',
      longitude: '123.900000',
      phone: '+639170000032',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branch2Id = b2!.id;

  // Category + product for order_items FK.
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `Cat SS ${suffix}`, slug: `cat-ss-${suffix}`, sort_order: 1 })
    .returning({ id: schema.categories.id });
  categoryId = category!.id;

  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `Fries SS ${suffix}`,
      slug: `fries-ss-${suffix}`,
      base_price: '5.00',
    })
    .returning({ id: schema.products.id });
  productId = product!.id;

  // Customer (order owner).
  const [customer] = await db
    .insert(schema.users)
    .values({ name: 'Customer SS', email: `cust-ss-${suffix}@example.com` })
    .returning({ id: schema.users.id });
  customerId = customer!.id;

  // Staff-1 assigned to branch-1.
  staff1Email = `staff1-ss-${suffix}@example.com`;
  staff1Cookies = await signUpAndGetCookie(staff1Email, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: branch1Id })
    .where(eq(schema.users.email, staff1Email));

  // Staff-2 assigned to branch-2 (seeded for cross-branch isolation; cookies not needed since
  // the AC-3 test uses staff-1 cookies attempting to access a branch-2 order).
  const staff2Email = `staff2-ss-${suffix}@example.com`;
  await signUpAndGetCookie(staff2Email, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: branch2Id })
    .where(eq(schema.users.email, staff2Email));

  // Unassigned staff (no branch).
  const unassignedEmail = `staff-unassigned-ss-${suffix}@example.com`;
  unassignedStaffCookies = await signUpAndGetCookie(unassignedEmail, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: null })
    .where(eq(schema.users.email, unassignedEmail));
});

afterAll(async () => {
  // Star-earning side effects (wired into the completion transition) write
  // star_transactions / user_stars / coupons rows for the shared customer. None
  // of these FKs cascade, so they must be cleared BEFORE the orders and the
  // customer user are deleted.
  await db.delete(schema.starTransactions).where(eq(schema.starTransactions.user_id, customerId));
  await db.delete(schema.coupons).where(eq(schema.coupons.user_id, customerId));
  await db.delete(schema.userStars).where(eq(schema.userStars.user_id, customerId));
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

// ─── AC-1: valid transitions → 200, new status, correct timestamp non-null ───

describe('PATCH /api/staff/orders/:orderId — AC-1 valid transitions', () => {
  it('pending → accepted: 200, status=accepted, accepted_at non-null, estimated_ready_at non-null', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'pending' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'accepted' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('accepted');
    // estimatedReadyAt is non-null (set on accept)
    expect(res.body.order.estimatedReadyAt).not.toBeNull();
  });

  it('accepted → preparing: 200, status=preparing', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'accepted' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'preparing' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('preparing');
  });

  it('preparing → flavoring: 200, status=flavoring', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'preparing' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'flavoring' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('flavoring');
  });

  it('flavoring → ready: 200, status=ready', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'flavoring' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'ready' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('ready');
  });

  it('ready → completed: 200, status=completed', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'ready' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('completed');
  });

  it('pending → cancelled: 200, status=cancelled', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'pending' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('cancelled');
  });
});

// ─── AC-2: invalid/terminal-source transitions → 409 ────────────────────────

describe('PATCH /api/staff/orders/:orderId — AC-2 invalid transitions → 409', () => {
  it('pending → ready (skips states): 409', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'pending' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'ready' });
    expect(res.status).toBe(409);
  });

  it('accepted → ready (skips states): 409', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'accepted' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'ready' });
    expect(res.status).toBe(409);
  });

  it('completed (terminal source) → any: 409', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'completed' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'cancelled' });
    expect(res.status).toBe(409);
  });

  it('cancelled (terminal source) → any: 409', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'cancelled' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'pending' });
    expect(res.status).toBe(409);
  });
});

// ─── AC-3: branch isolation on PATCH → 403 cross-branch/unassigned ──────────

describe('PATCH /api/staff/orders/:orderId — AC-3 branch isolation', () => {
  it('branch-1 staff PATCHing a branch-2 order → 403', async () => {
    // Create an order in branch-2; staff-1 is assigned to branch-1 only.
    const branch2OrderId = await insertOrder({ branchId: branch2Id, status: 'pending' });
    const res = await request(app)
      .patch(`/api/staff/orders/${branch2OrderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'accepted' });
    expect(res.status).toBe(403);
    // Verify order was NOT mutated.
    const [unchanged] = await db
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(eq(schema.orders.id, branch2OrderId));
    expect(unchanged?.status).toBe('pending');
  });

  it('unassigned staff PATCHing any order → 403', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'pending' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', unassignedStaffCookies.join('; '))
      .send({ status: 'accepted' });
    expect(res.status).toBe(403);
  });
});

// ─── AC-4: rejected is a valid terminal status; re-PATCH → 409 ───────────────

describe('PATCH /api/staff/orders/:orderId — AC-4 rejected terminal', () => {
  it('pending → rejected: 200, status=rejected', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'pending' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'rejected' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('rejected');
  });

  it('rejected (terminal source) → re-PATCH: 409', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'rejected' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'accepted' });
    expect(res.status).toBe(409);
  });
});

// ─── AC-5: GET /orders/completed returns only assigned-branch terminal orders ─

describe('GET /api/staff/orders/completed — AC-5', () => {
  it('returns only terminal (completed/cancelled/rejected) orders for the assigned branch', async () => {
    // Seed: branch-1 terminal + non-terminal; branch-2 terminal.
    const b1Completed = await insertOrder({ branchId: branch1Id, status: 'completed' });
    const b1Cancelled = await insertOrder({ branchId: branch1Id, status: 'cancelled' });
    const b1Rejected = await insertOrder({ branchId: branch1Id, status: 'rejected' });
    const b1Pending = await insertOrder({ branchId: branch1Id, status: 'pending' });
    const b2Completed = await insertOrder({ branchId: branch2Id, status: 'completed' });

    const res = await request(app)
      .get('/api/staff/orders/completed')
      .set('Cookie', staff1Cookies.join('; '));

    expect(res.status).toBe(200);
    const ids = res.body.orders.map((o: any) => o.id);

    // Must include all branch-1 terminal orders.
    expect(ids).toContain(b1Completed);
    expect(ids).toContain(b1Cancelled);
    expect(ids).toContain(b1Rejected);

    // Must exclude non-terminal branch-1 order.
    expect(ids).not.toContain(b1Pending);

    // Must exclude branch-2 terminal order (cross-branch isolation).
    expect(ids).not.toContain(b2Completed);
  });

  it('returns 403 for unassigned staff on completed endpoint', async () => {
    const res = await request(app)
      .get('/api/staff/orders/completed')
      .set('Cookie', unassignedStaffCookies.join('; '));
    expect(res.status).toBe(403);
  });
});

// ─── AC-6: accept sets estimated_ready_at ≈ now()+prep (accept-time base ±5s) ─

describe('PATCH /api/staff/orders/:orderId — AC-6 ETA on accept', () => {
  it('accept sets estimated_ready_at ≈ now()+prep anchored to accept time; etaMinutes body ignored', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'pending' });

    // Record now BEFORE the PATCH (accept-time base per plan decision).
    const nowBeforePatch = Date.now();

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      // etaMinutes should be accepted but IGNORED by the server.
      .send({ status: 'accepted', etaMinutes: 999 });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('accepted');

    const eta = new Date(res.body.order.estimatedReadyAt).getTime();
    const expectedEta = nowBeforePatch + BRANCH1_PREP_MINUTES * 60 * 1000;

    // Allow ±5 seconds tolerance for request round-trip + DB write latency.
    const TOLERANCE_MS = 5_000;
    expect(eta).toBeGreaterThanOrEqual(expectedEta - TOLERANCE_MS);
    expect(eta).toBeLessThanOrEqual(expectedEta + TOLERANCE_MS);
  });
});

// ─── Star earning on completion: ready → completed credits exactly one star ───

describe('PATCH /api/staff/orders/:orderId — star earning on completion', () => {
  it('ready → completed credits exactly one `earned` star to the order customer', async () => {
    const orderId = await insertOrder({ branchId: branch1Id, status: 'ready' });

    // Baseline the customer's counter — the customer is shared across the suite
    // and other completions may already have credited stars, so assert a delta.
    const [before] = await db
      .select()
      .from(schema.userStars)
      .where(eq(schema.userStars.user_id, customerId));
    const currentBefore = before?.current_stars ?? 0;
    const lifetimeBefore = before?.lifetime_stars ?? 0;

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('completed');

    // Exactly one `earned` star_transactions row for THIS order, owned by the customer.
    const earned = await db
      .select()
      .from(schema.starTransactions)
      .where(
        and(
          eq(schema.starTransactions.order_id, orderId),
          eq(schema.starTransactions.type, 'earned'),
        ),
      );
    expect(earned).toHaveLength(1);
    expect(earned[0]!.user_id).toBe(customerId);
    expect(earned[0]!.stars).toBe(1);

    // Customer counter incremented by exactly 1 (current + lifetime).
    const [after] = await db
      .select()
      .from(schema.userStars)
      .where(eq(schema.userStars.user_id, customerId));
    expect(after!.current_stars).toBe(currentBefore + 1);
    expect(after!.lifetime_stars).toBe(lifetimeBefore + 1);
  });
});
