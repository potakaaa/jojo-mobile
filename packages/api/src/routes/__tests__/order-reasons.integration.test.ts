/* eslint-disable @typescript-eslint/no-explicit-any -- supertest JSON bodies are
   loosely typed at the test boundary; assertions narrow them. */
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the terminal-transition reason feature:
 *   B2 — `PATCH /api/staff/orders/:orderId/reject` (staff reject WITH a reason)
 *   B3 — `PATCH /orders/:orderId/cancel`           (customer self-cancel, pending-only)
 *
 * Both are order-state TRUST BOUNDARIES. Per the plan's Verification Evidence table,
 * every ownership check, illegal-transition rejection, required-reason gate, and the
 * concurrent compare-and-swap race is Fully-Automated with Known-Gap explicitly BANNED.
 *
 * SPEC criteria proven here:
 *   B2.2 — reject with no reasonCode → 422, order unchanged                (HARD)
 *   B2.3 — reject with valid code + note → 200, persisted, actor='staff'
 *   B2.4 — reject on a cross-branch order → 403, order unchanged           (HARD)
 *   B2.5 — reject on a non-pending order → 409, order unchanged            (HARD)
 *   B2.6 — staff AND admin detail both expose reasonCode/Note/Actor
 *   B2.8 — reasonCode='other' with empty/missing note → 422                (HARD)
 *   B3.1 — cancel own pending order → 200, cancelled, cancelled_at set
 *   B3.2 — cancel another user's order → 403, order unchanged              (HARD)
 *   B3.3 — cancel parameterized over all 7 non-pending statuses → 409       (HARD)
 *   B3.4 — GENUINE concurrent race (Promise.all) staff-accept vs customer-cancel (HARD)
 *   B3.5 — optional reason storage (none / preset code / free-text note only)
 *   B3.6 — unknown uuid → 404; malformed id → 404 (no existence oracle)
 *   reason_actor stamp — the pre-existing generic staff PATCH stamps 'staff' on
 *                        both `rejected` and `cancelled` targets
 *
 * Hermetic: seeds its OWN branches / staff / customers / orders and cleans up in
 * afterAll. Runs against a real local Postgres:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';
// Keep the push provider on its log-fallback path so B3's cancel notification
// dispatch never depends on ambient developer/CI credentials.
const originalExpoToken = process.env.EXPO_ACCESS_TOKEN;
delete process.env.EXPO_ACCESS_TOKEN;

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

let branch1Id: string;
let branch2Id: string;
let categoryId: string;
let productId: string;
let customerId: string;
let customerCookies: string[];
let otherCustomerId: string;
let otherCustomerCookies: string[];
let staff1Cookies: string[];
let staff2Cookies: string[];
let adminCookies: string[];

const createdOrderIds: string[] = [];
const createdUserIds: string[] = [];
let orderCounter = 0;

type SeedStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'flavoring'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'rejected';

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

async function insertOrder(opts: {
  branchId?: string;
  userId?: string;
  status: SeedStatus;
}): Promise<string> {
  orderCounter += 1;
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: opts.userId ?? customerId,
      branch_id: opts.branchId ?? branch1Id,
      order_number: `JP-RS-${suffix}-${String(orderCounter).padStart(3, '0')}`,
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

async function orderRow(orderId: string) {
  const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  return row!;
}

/** The exact fields every "order unchanged" assertion locks. */
function reasonSnapshot(row: Awaited<ReturnType<typeof orderRow>>) {
  return {
    status: row.status,
    reason_code: row.reason_code,
    reason_note: row.reason_note,
    reason_actor: row.reason_actor,
    cancelled_at: row.cancelled_at,
  };
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../lib/auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));
  delete process.env.EXPO_ACCESS_TOKEN;

  const [b1] = await db
    .insert(schema.branches)
    .values({
      name: `RS B1 ${suffix}`,
      slug: `rs-b1-${suffix}`,
      address: '1 Reason St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000041',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 15,
    })
    .returning({ id: schema.branches.id });
  branch1Id = b1!.id;

  const [b2] = await db
    .insert(schema.branches)
    .values({
      name: `RS B2 ${suffix}`,
      slug: `rs-b2-${suffix}`,
      address: '2 Reason Ave',
      latitude: '10.300000',
      longitude: '123.900000',
      phone: '+639170000042',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branch2Id = b2!.id;

  const [category] = await db
    .insert(schema.categories)
    .values({ name: `Cat RS ${suffix}`, slug: `cat-rs-${suffix}`, sort_order: 1 })
    .returning({ id: schema.categories.id });
  categoryId = category!.id;

  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `Fries RS ${suffix}`,
      slug: `fries-rs-${suffix}`,
      base_price: '5.00',
    })
    .returning({ id: schema.products.id });
  productId = product!.id;

  // Customer (order owner) — a REAL better-auth session, same as the staff users,
  // so the B3.4 race can fire a staff request and a customer request concurrently.
  const customerEmail = `cust-rs-${suffix}@example.com`;
  customerCookies = await signUpAndGetCookie(customerEmail, 'sup3r-secret-pw');
  const [cust] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, customerEmail));
  customerId = cust!.id;
  createdUserIds.push(customerId);

  // A second customer — proves B3.2 cross-user isolation.
  const otherEmail = `cust2-rs-${suffix}@example.com`;
  otherCustomerCookies = await signUpAndGetCookie(otherEmail, 'sup3r-secret-pw');
  const [other] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, otherEmail));
  otherCustomerId = other!.id;
  createdUserIds.push(otherCustomerId);

  const staff1Email = `staff1-rs-${suffix}@example.com`;
  staff1Cookies = await signUpAndGetCookie(staff1Email, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: branch1Id })
    .where(eq(schema.users.email, staff1Email));
  const [s1] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, staff1Email));
  createdUserIds.push(s1!.id);

  const staff2Email = `staff2-rs-${suffix}@example.com`;
  staff2Cookies = await signUpAndGetCookie(staff2Email, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: branch2Id })
    .where(eq(schema.users.email, staff2Email));
  const [s2] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, staff2Email));
  createdUserIds.push(s2!.id);

  // Admin — proves B2.6's "admin serializer inherits for free" half against the
  // real `GET /api/admin/orders/:orderId` route, not just the serializer function.
  const adminEmail = `admin-rs-${suffix}@example.com`;
  adminCookies = await signUpAndGetCookie(adminEmail, 'sup3r-secret-pw');
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));
  const [ad] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, adminEmail));
  createdUserIds.push(ad!.id);
});

afterAll(async () => {
  for (const uid of createdUserIds) {
    await db.delete(schema.starTransactions).where(eq(schema.starTransactions.user_id, uid));
    await db.delete(schema.coupons).where(eq(schema.coupons.user_id, uid));
    await db.delete(schema.userStars).where(eq(schema.userStars.user_id, uid));
  }
  if (createdOrderIds.length > 0) {
    await db.delete(schema.orderItems).where(inArray(schema.orderItems.order_id, createdOrderIds));
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  if (createdUserIds.length > 0) {
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.user_id, createdUserIds));
    await db
      .delete(schema.deviceTokens)
      .where(inArray(schema.deviceTokens.user_id, createdUserIds));
    await db
      .update(schema.users)
      .set({ assignedBranchId: null })
      .where(inArray(schema.users.assignedBranchId, [branch1Id, branch2Id]));
    await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
  }
  await db.delete(schema.products).where(eq(schema.products.id, productId));
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  await db.delete(schema.branches).where(inArray(schema.branches.id, [branch1Id, branch2Id]));
  logSpy?.mockRestore();
  if (originalExpoToken === undefined) delete process.env.EXPO_ACCESS_TOKEN;
  else process.env.EXPO_ACCESS_TOKEN = originalExpoToken;
});

// ─── B2 — PATCH /api/staff/orders/:orderId/reject ────────────────────────────

describe('B2 — PATCH /api/staff/orders/:orderId/reject', () => {
  it('B2.3: valid code + note → 200, status=rejected, reason persisted, actor=staff', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'out_of_stock', note: 'Ran out of large fries' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('rejected');
    expect(res.body.order.reasonCode).toBe('out_of_stock');
    expect(res.body.order.reasonNote).toBe('Ran out of large fries');
    expect(res.body.order.reasonActor).toBe('staff');

    const row = await orderRow(orderId);
    expect(row.status).toBe('rejected');
    expect(row.reason_code).toBe('out_of_stock');
    expect(row.reason_note).toBe('Ran out of large fries');
    expect(row.reason_actor).toBe('staff');
  });

  it('B2.3: a valid code with NO note → 200, reason_note null (note is optional off "other")', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'branch_busy' });

    expect(res.status).toBe(200);
    expect(res.body.order.reasonNote).toBeNull();
    const row = await orderRow(orderId);
    expect(row.reason_code).toBe('branch_busy');
    expect(row.reason_note).toBeNull();
    expect(row.reason_actor).toBe('staff');
  });

  // ── B2.2 (HARD, Known-Gap BANNED) ──────────────────────────────────────────
  it('B2.2: no reasonCode in body → 422 and the order is byte-unchanged', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    const before = reasonSnapshot(await orderRow(orderId));

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({});

    expect(res.status).toBe(422);
    expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
  });

  it('B2.2: an unrecognised reasonCode → 422 and the order is byte-unchanged', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    const before = reasonSnapshot(await orderRow(orderId));

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'i_just_felt_like_it' });

    expect(res.status).toBe(422);
    expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
  });

  it('B2.2: a client-sent `status` field cannot redirect the target — still rejected', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'payment_issue', status: 'completed' });

    expect(res.status).toBe(200);
    expect((await orderRow(orderId)).status).toBe('rejected');
  });

  // ── B2.8 (HARD, Known-Gap BANNED) ──────────────────────────────────────────
  it('B2.8: reasonCode="other" with NO note → 422, order byte-unchanged', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    const before = reasonSnapshot(await orderRow(orderId));

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'other' });

    expect(res.status).toBe(422);
    expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
  });

  it('B2.8: reasonCode="other" with a whitespace-only note → 422, order byte-unchanged', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    const before = reasonSnapshot(await orderRow(orderId));

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'other', note: '   ' });

    expect(res.status).toBe(422);
    expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
  });

  it('B2.8: reasonCode="other" WITH a real note → 200, both persisted', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'other', note: 'Freezer broke' });

    expect(res.status).toBe(200);
    const row = await orderRow(orderId);
    expect(row.reason_code).toBe('other');
    expect(row.reason_note).toBe('Freezer broke');
  });

  // ── B2.4 (HARD, Known-Gap BANNED) ──────────────────────────────────────────
  it('B2.4: rejecting an order at ANOTHER branch → 403 and the order is byte-unchanged', async () => {
    const orderId = await insertOrder({ branchId: branch2Id, status: 'pending' });
    const before = reasonSnapshot(await orderRow(orderId));

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; ')) // staff1 belongs to branch1
      .send({ reasonCode: 'out_of_stock' });

    expect(res.status).toBe(403);
    expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
  });

  it('B2.4: the SAME order rejected by the branch it belongs to → 200 (proves the 403 was scope, not a broken route)', async () => {
    const orderId = await insertOrder({ branchId: branch2Id, status: 'pending' });

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff2Cookies.join('; ')) // staff2 DOES belong to branch2
      .send({ reasonCode: 'out_of_stock' });

    expect(res.status).toBe(200);
    expect((await orderRow(orderId)).status).toBe('rejected');
  });

  it('B2.4: ownership/branch scope is checked BEFORE status — a cross-branch NON-pending order is still 403, never 409', async () => {
    const orderId = await insertOrder({ branchId: branch2Id, status: 'completed' });

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'out_of_stock' });

    // A 409 here would leak that someone else's branch has a non-pending order.
    expect(res.status).toBe(403);
  });

  // ── B2.5 (HARD, Known-Gap BANNED) ──────────────────────────────────────────
  const NON_PENDING: SeedStatus[] = [
    'accepted',
    'preparing',
    'flavoring',
    'ready',
    'completed',
    'cancelled',
    'rejected',
  ];
  it.each(NON_PENDING)(
    'B2.5: rejecting a %s order → 409 and the order is byte-unchanged',
    async (status) => {
      const orderId = await insertOrder({ status });
      const before = reasonSnapshot(await orderRow(orderId));

      const res = await request(app)
        .patch(`/api/staff/orders/${orderId}/reject`)
        .set('Cookie', staff1Cookies.join('; '))
        .send({ reasonCode: 'out_of_stock', note: 'nope' });

      expect(res.status).toBe(409);
      expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
    },
  );

  it('B2.5: a second reject of an already-rejected order does NOT overwrite the first reason', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'out_of_stock', note: 'first' });

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'branch_busy', note: 'second' });

    expect(res.status).toBe(409);
    const row = await orderRow(orderId);
    expect(row.reason_code).toBe('out_of_stock');
    expect(row.reason_note).toBe('first');
  });

  it('B2: a malformed order id and an unknown order id both → 404 (no existence oracle)', async () => {
    const malformed = await request(app)
      .patch('/api/staff/orders/not-a-uuid/reject')
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'out_of_stock' });
    const unknown = await request(app)
      .patch('/api/staff/orders/00000000-0000-0000-0000-000000000000/reject')
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'out_of_stock' });

    expect(malformed.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(malformed.body).toEqual(unknown.body);
  });

  it('B2: an unauthenticated caller is rejected and the order is byte-unchanged', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    const before = reasonSnapshot(await orderRow(orderId));

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .send({ reasonCode: 'out_of_stock' });

    // 403, not 401: `requireStaff` deliberately collapses EVERY auth failure to
    // 403 so it never leaks whether a session existed (require-staff.ts:61,77).
    // That is pre-existing, unmodified behaviour inherited by this new route.
    expect(res.status).toBe(403);
    expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
  });

  it('B2: a plain customer cannot reach the staff reject route → 403, order byte-unchanged', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    const before = reasonSnapshot(await orderRow(orderId));

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', customerCookies.join('; '))
      .send({ reasonCode: 'out_of_stock' });

    expect(res.status).toBe(403);
    expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
  });

  it('B2: the more specific /reject path wins over the generic PATCH /orders/:orderId', async () => {
    // If registration order regressed, `/reject` would be swallowed by `:orderId`
    // and parsed as a body-less status PATCH → 422, never 200.
    const orderId = await insertOrder({ status: 'pending' });
    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'customer_requested' });
    expect(res.status).toBe(200);
    expect(res.body.order.reasonCode).toBe('customer_requested');
  });
});

// ── B2.6 — the reason reaches BOTH the staff and admin wire shapes ───────────

describe('B2.6 — reason surfaces on staff AND admin order views', () => {
  it('B2.6: one rejected order exposes reasonCode/reasonNote/reasonActor on staff detail, staff list, and admin detail', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    await request(app)
      .patch(`/api/staff/orders/${orderId}/reject`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ reasonCode: 'outside_hours', note: 'Closing in 5 minutes' });

    const staffDetail = await request(app)
      .get(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '));
    expect(staffDetail.status).toBe(200);
    expect(staffDetail.body.reasonCode).toBe('outside_hours');
    expect(staffDetail.body.reasonNote).toBe('Closing in 5 minutes');
    expect(staffDetail.body.reasonActor).toBe('staff');

    // Staff COMPLETED list (a StaffOrderSummary consumer — rejected is terminal).
    const staffList = await request(app)
      .get('/api/staff/orders/completed')
      .set('Cookie', staff1Cookies.join('; '));
    expect(staffList.status).toBe(200);
    const listed = (staffList.body.orders as any[]).find((o) => o.id === orderId);
    expect(listed).toBeDefined();
    expect(listed.reasonCode).toBe('outside_hours');
    expect(listed.reasonActor).toBe('staff');

    // Admin detail inherits via `extends` + spread — ZERO admin-side code.
    const adminDetail = await request(app)
      .get(`/api/admin/orders/${orderId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(adminDetail.status).toBe(200);
    const adminOrder = adminDetail.body.order ?? adminDetail.body;
    expect(adminOrder.reasonCode).toBe('outside_hours');
    expect(adminOrder.reasonNote).toBe('Closing in 5 minutes');
    expect(adminOrder.reasonActor).toBe('staff');
  });

  it('B2.6: an untouched pending order serializes all three reason fields as null (not undefined/absent)', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    const staffDetail = await request(app)
      .get(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '));

    expect(staffDetail.body).toHaveProperty('reasonCode', null);
    expect(staffDetail.body).toHaveProperty('reasonNote', null);
    expect(staffDetail.body).toHaveProperty('reasonActor', null);
  });
});

// ── reason_actor stamp on the PRE-EXISTING generic staff PATCH ───────────────

describe('generic PATCH /api/staff/orders/:orderId stamps reason_actor=staff', () => {
  it('a staff cancel through the generic route stamps actor=staff (code/note stay null)', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const row = await orderRow(orderId);
    expect(row.status).toBe('cancelled');
    expect(row.reason_actor).toBe('staff');
    expect(row.reason_code).toBeNull();
    expect(row.reason_note).toBeNull();
  });

  it('a staff reject through the generic route stamps actor=staff', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'rejected' });

    expect(res.status).toBe(200);
    const row = await orderRow(orderId);
    expect(row.status).toBe('rejected');
    expect(row.reason_actor).toBe('staff');
  });

  it('a NON-terminal transition through the generic route leaves reason_actor null', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    await request(app)
      .patch(`/api/staff/orders/${orderId}`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ status: 'accepted' });

    expect((await orderRow(orderId)).reason_actor).toBeNull();
  });
});

// ─── B3 — PATCH /orders/:orderId/cancel ──────────────────────────────────────

describe('B3 — PATCH /orders/:orderId/cancel', () => {
  // ── B3.1 ───────────────────────────────────────────────────────────────────
  it('B3.1: cancelling own pending order → 200, status=cancelled, cancelled_at set', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', customerCookies.join('; '))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('cancelled');

    const row = await orderRow(orderId);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_at).not.toBeNull();
    expect(row.reason_actor).toBe('customer');
  });

  // ── B3.5 ───────────────────────────────────────────────────────────────────
  it('B3.5: cancel with no reason → 200, reason_code and reason_note both null, actor still customer', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', customerCookies.join('; '))
      .send({});

    expect(res.status).toBe(200);
    const row = await orderRow(orderId);
    expect(row.reason_code).toBeNull();
    expect(row.reason_note).toBeNull();
    expect(row.reason_actor).toBe('customer');
  });

  it('B3.5: cancel with a preset code → stored verbatim', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', customerCookies.join('; '))
      .send({ reasonCode: 'changed_my_mind' });

    expect(res.status).toBe(200);
    expect(res.body.order.reasonCode).toBe('changed_my_mind');
    const row = await orderRow(orderId);
    expect(row.reason_code).toBe('changed_my_mind');
    expect(row.reason_note).toBeNull();
  });

  it('B3.5: cancel with a free-text note ONLY (no code) → note stored, code null (no other-requires-note gate on B3)', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', customerCookies.join('; '))
      .send({ note: 'Parking is impossible today' });

    expect(res.status).toBe(200);
    const row = await orderRow(orderId);
    expect(row.reason_code).toBeNull();
    expect(row.reason_note).toBe('Parking is impossible today');
  });

  it('B3.5: cancel with code="other" and NO note → 200 (deliberately un-gated, unlike B2.8)', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', customerCookies.join('; '))
      .send({ reasonCode: 'other' });

    expect(res.status).toBe(200);
    expect((await orderRow(orderId)).reason_code).toBe('other');
  });

  it('B3.5: an unrecognised reasonCode → 422 and the order is byte-unchanged', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    const before = reasonSnapshot(await orderRow(orderId));

    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', customerCookies.join('; '))
      .send({ reasonCode: 'out_of_stock' }); // a STAFF code, not a customer code

    expect(res.status).toBe(422);
    expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
  });

  it('B3: a client-sent `status` field cannot redirect the target — still cancelled', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', customerCookies.join('; '))
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect((await orderRow(orderId)).status).toBe('cancelled');
  });

  // ── B3.2 (HARD, Known-Gap BANNED) ──────────────────────────────────────────
  it("B3.2: cancelling ANOTHER user's pending order → 403 and the order is byte-unchanged", async () => {
    const orderId = await insertOrder({ status: 'pending' }); // owned by `customerId`
    const before = reasonSnapshot(await orderRow(orderId));

    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', otherCustomerCookies.join('; '))
      .send({ reasonCode: 'changed_my_mind' });

    expect(res.status).toBe(403);
    expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
  });

  it('B3.2: the SAME order cancelled by its real owner → 200 (proves the 403 was ownership, not a broken route)', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', customerCookies.join('; '))
      .send({});

    expect(res.status).toBe(200);
  });

  it("B3.2: ownership is checked BEFORE status — another user's NON-pending order is still 403, never 409", async () => {
    const orderId = await insertOrder({ status: 'ready' });

    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', otherCustomerCookies.join('; '))
      .send({});

    // A 409 here would let a stranger probe the true state of someone else's order.
    expect(res.status).toBe(403);
  });

  it('B3.2: an unauthenticated caller gets 401 and the order is byte-unchanged', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    const before = reasonSnapshot(await orderRow(orderId));

    const res = await request(app).patch(`/orders/${orderId}/cancel`).send({});

    expect(res.status).toBe(401);
    expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
  });

  // ── B3.3 (HARD, Known-Gap BANNED) ──────────────────────────────────────────
  const NON_PENDING_FOR_CANCEL: SeedStatus[] = [
    'accepted',
    'preparing',
    'flavoring',
    'ready',
    'completed',
    'cancelled',
    'rejected',
  ];
  it.each(NON_PENDING_FOR_CANCEL)(
    'B3.3: cancelling a %s order → 409 and the order is byte-unchanged',
    async (status) => {
      const orderId = await insertOrder({ status });
      const before = reasonSnapshot(await orderRow(orderId));

      const res = await request(app)
        .patch(`/orders/${orderId}/cancel`)
        .set('Cookie', customerCookies.join('; '))
        .send({ reasonCode: 'changed_my_mind', note: 'too late' });

      expect(res.status).toBe(409);
      expect(reasonSnapshot(await orderRow(orderId))).toEqual(before);
    },
  );

  // ── B3.6 ───────────────────────────────────────────────────────────────────
  it('B3.6: a malformed order id and an unknown order id both → 404 (no existence oracle)', async () => {
    const malformed = await request(app)
      .patch('/orders/not-a-uuid/cancel')
      .set('Cookie', customerCookies.join('; '))
      .send({});
    const unknown = await request(app)
      .patch('/orders/00000000-0000-0000-0000-000000000000/cancel')
      .set('Cookie', customerCookies.join('; '))
      .send({});

    expect(malformed.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(malformed.body).toEqual(unknown.body);
  });

  it('B3: the more specific /cancel path wins over GET /orders/:orderId registration order', async () => {
    const orderId = await insertOrder({ status: 'pending' });
    const res = await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', customerCookies.join('; '))
      .send({});
    expect(res.status).toBe(200);
    // And `/complete` still behaves as before — untouched by this feature.
    const complete = await request(app)
      .patch(`/orders/${orderId}/complete`)
      .set('Cookie', customerCookies.join('; '))
      .send({});
    expect(complete.status).toBe(409); // cancelled is terminal
  });

  it('B3: a cancel writes a customer notification row (dispatchOrderNotification wired, not notifyCustomer)', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    await request(app)
      .patch(`/orders/${orderId}/cancel`)
      .set('Cookie', customerCookies.join('; '))
      .send({});

    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.user_id, customerId));
    expect(rows.some((r) => (r.target_params as any)?.orderId === orderId)).toBe(true);
  });
});

// ── B3.4 (HARD, Known-Gap BANNED) — GENUINE concurrent CAS race ──────────────

describe('B3.4 — concurrent staff-accept vs customer-cancel race', () => {
  it('B3.4: two genuinely concurrent requests against the same pending order → exactly one 200 and one 409, one consistent final state', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    // A REAL race (Promise.all of two live requests), mirroring orders.test.ts's
    // AC6 same-row-CAS precedent. A sequential "flip the status first, then call
    // cancel" simulation would be VACUOUS here: the cancel route's own pre-tx
    // `status !== 'pending'` check would 409 before ever reaching the
    // `WHERE status = 'pending'` compare-and-swap, so deleting that WHERE clause
    // would leave a pre-flip test green.
    const [staffRes, customerRes] = await Promise.all([
      request(app)
        .patch(`/api/staff/orders/${orderId}`)
        .set('Cookie', staff1Cookies.join('; '))
        .send({ status: 'accepted' }),
      request(app)
        .patch(`/orders/${orderId}/cancel`)
        .set('Cookie', customerCookies.join('; '))
        .send({ reasonCode: 'changed_my_mind' }),
    ]);

    expect([staffRes.status, customerRes.status].sort()).toEqual([200, 409]);

    const row = await orderRow(orderId);
    // Exactly one winner, and the row is internally consistent with that winner.
    expect(['accepted', 'cancelled']).toContain(row.status);
    if (row.status === 'cancelled') {
      expect(customerRes.status).toBe(200);
      expect(staffRes.status).toBe(409);
      expect(row.reason_actor).toBe('customer');
      expect(row.cancelled_at).not.toBeNull();
      expect(row.accepted_at).toBeNull();
    } else {
      expect(staffRes.status).toBe(200);
      expect(customerRes.status).toBe(409);
      expect(row.accepted_at).not.toBeNull();
      // The loser wrote NOTHING — not a partial cancel stamp.
      expect(row.reason_actor).toBeNull();
      expect(row.reason_code).toBeNull();
      expect(row.cancelled_at).toBeNull();
    }
  });

  it('B3.4: two concurrent customer cancels of the same order → exactly one 200 and one 409', async () => {
    const orderId = await insertOrder({ status: 'pending' });

    const [a, b] = await Promise.all([
      request(app)
        .patch(`/orders/${orderId}/cancel`)
        .set('Cookie', customerCookies.join('; '))
        .send({ reasonCode: 'ordered_by_mistake' }),
      request(app)
        .patch(`/orders/${orderId}/cancel`)
        .set('Cookie', customerCookies.join('; '))
        .send({ reasonCode: 'taking_too_long' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const row = await orderRow(orderId);
    expect(row.status).toBe('cancelled');
    // Exactly one of the two reasons landed — never a blended/overwritten row.
    expect(['ordered_by_mistake', 'taking_too_long']).toContain(row.reason_code);
  });
});
