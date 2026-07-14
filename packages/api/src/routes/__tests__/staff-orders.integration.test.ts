/* eslint-disable @typescript-eslint/no-explicit-any -- fetch/supertest JSON
   bodies are loosely typed at the test boundary; assertions narrow them. */
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the STAFF-002 read-only order endpoints
 * (`GET /api/staff/orders`, `GET /api/staff/orders/:orderId`).
 *
 * Hermetic: seeds its OWN branches / staff user / customer / orders / items and
 * cleans them up in afterAll. Does NOT rely on `db:seed` (CI applies migrations
 * only). Runs against a real local Postgres:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers: AC-2 (branch isolation on list), AC-3 (non-terminal filter),
 * AC-4 (detail item + selectedOptions shape), AC-5 (cross-branch detail → 403),
 * plus unassigned-staff → 403 and empty-branch → 200 edge cases.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
// Guard the app.listen in index.ts so importing `app` never binds a port.
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

/**
 * Sign up + sign in an email/password user through the real HTTP surface, then
 * return the session cookie(s) so subsequent requests authenticate as that user.
 */
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

// Fixtures created in setup, referenced by assertions / cleanup.
const suffix = unique();
let branch1Id: string;
let branch2Id: string;
let productId: string;
let categoryId: string;
let customerId: string;
let staff1Email: string;
let staff1Cookies: string[];
let unassignedStaffCookies: string[];

// Order ids tracked for assertions + FK-ordered cleanup.
const createdOrderIds: string[] = [];
let branch1OrderIdA: string;
let branch1OrderIdB: string;
let branch2OrderId: string;
let branch1CompletedOrderId: string;
let branch1CancelledOrderId: string;
let branch1DetailOrderId: string;

let orderCounter = 0;
async function insertOrder(opts: {
  branchId: string;
  status: 'pending' | 'accepted' | 'preparing' | 'flavoring' | 'ready' | 'completed' | 'cancelled';
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    selectedOptions: unknown[];
  }>;
}): Promise<string> {
  orderCounter += 1;
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: customerId,
      branch_id: opts.branchId,
      order_number: `JP-TEST-${suffix}-${String(orderCounter).padStart(3, '0')}`,
      status: opts.status,
      subtotal: '10.00',
      total: '10.00',
      payment_method: 'pay_at_branch',
      placed_at: new Date(Date.now() - orderCounter * 60_000),
    })
    .returning({ id: schema.orders.id });
  const orderId = order!.id;
  createdOrderIds.push(orderId);

  const items = opts.items ?? [];
  if (items.length > 0) {
    await db.insert(schema.orderItems).values(
      items.map((item) => ({
        order_id: orderId,
        product_id: productId,
        product_name_snapshot: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        selected_options: item.selectedOptions as never,
      })),
    );
  }
  return orderId;
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../lib/auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));

  // Two branches.
  const [b1] = await db
    .insert(schema.branches)
    .values({
      name: `Staff Orders B1 ${suffix}`,
      slug: `staff-orders-b1-${suffix}`,
      address: '1 B1 St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000021',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branch1Id = b1!.id;

  const [b2] = await db
    .insert(schema.branches)
    .values({
      name: `Staff Orders B2 ${suffix}`,
      slug: `staff-orders-b2-${suffix}`,
      address: '2 B2 Ave',
      latitude: '10.300000',
      longitude: '123.900000',
      phone: '+639170000022',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branch2Id = b2!.id;

  // Category + product for the order_items FK.
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `Cat ${suffix}`, slug: `cat-so-${suffix}`, sort_order: 1 })
    .returning({ id: schema.categories.id });
  categoryId = category!.id;

  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `Loaded Fries ${suffix}`,
      slug: `loaded-fries-so-${suffix}`,
      base_price: '5.00',
    })
    .returning({ id: schema.products.id });
  productId = product!.id;

  // Customer (owns the orders — orders.user_id FK).
  const [customer] = await db
    .insert(schema.users)
    .values({ name: 'Customer', email: `cust-so-${suffix}@example.com` })
    .returning({ id: schema.users.id });
  customerId = customer!.id;

  // Staff assigned to branch-1.
  staff1Email = `staff1-so-${suffix}@example.com`;
  staff1Cookies = await signUpAndGetCookie(staff1Email, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: branch1Id })
    .where(eq(schema.users.email, staff1Email));

  // Unassigned staff (role staff, no branch).
  const unassignedEmail = `staff-unassigned-so-${suffix}@example.com`;
  unassignedStaffCookies = await signUpAndGetCookie(unassignedEmail, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: null })
    .where(eq(schema.users.email, unassignedEmail));

  // ── Fixture orders ──
  // Branch-1 active (AC-2, AC-3): two non-terminal orders.
  branch1OrderIdA = await insertOrder({ branchId: branch1Id, status: 'pending' });
  branch1OrderIdB = await insertOrder({ branchId: branch1Id, status: 'preparing' });
  // Branch-2 active (AC-2 isolation, AC-5 cross-branch).
  branch2OrderId = await insertOrder({ branchId: branch2Id, status: 'pending' });
  // Branch-1 terminal (AC-3): must NOT appear in list.
  branch1CompletedOrderId = await insertOrder({ branchId: branch1Id, status: 'completed' });
  branch1CancelledOrderId = await insertOrder({ branchId: branch1Id, status: 'cancelled' });
  // Branch-1 detail order with 2 items + options (AC-4).
  branch1DetailOrderId = await insertOrder({
    branchId: branch1Id,
    status: 'accepted',
    items: [
      {
        name: 'Loaded Fries',
        quantity: 2,
        unitPrice: '5.00',
        totalPrice: '10.00',
        selectedOptions: [
          { optionId: 'opt-1', optionType: 'flavor', name: 'BBQ Ranch', priceDeltaCents: 0 },
        ],
      },
      {
        name: 'Classic Soda',
        quantity: 1,
        unitPrice: '2.00',
        totalPrice: '2.00',
        selectedOptions: [
          { optionId: 'opt-2', optionType: 'size', name: 'Large', priceDeltaCents: 50 },
        ],
      },
    ],
  });
});

afterAll(async () => {
  // Reverse-FK cleanup: order_items → orders → users → products → categories → branches.
  if (createdOrderIds.length > 0) {
    const { inArray } = await import('drizzle-orm');
    await db.delete(schema.orderItems).where(inArray(schema.orderItems.order_id, createdOrderIds));
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  // Detach the branch-1 staff user before deleting branch-1 (users.assignedBranchId FK).
  await db
    .update(schema.users)
    .set({ assignedBranchId: null })
    .where(eq(schema.users.email, staff1Email));
  // Customer owns the orders (already deleted above) — safe to remove now.
  await db.delete(schema.users).where(eq(schema.users.id, customerId));
  await db.delete(schema.products).where(eq(schema.products.id, productId));
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  await db.delete(schema.branches).where(eq(schema.branches.id, branch1Id));
  await db.delete(schema.branches).where(eq(schema.branches.id, branch2Id));
  logSpy?.mockRestore();
});

describe('GET /api/staff/orders', () => {
  // D2 — AC-2 branch isolation.
  it('should return only branch-1 orders for branch-1 staff session', async () => {
    const res = await request(app).get('/api/staff/orders').set('Cookie', staff1Cookies.join('; '));
    expect(res.status).toBe(200);
    const ids = res.body.orders.map((o: any) => o.id);
    expect(ids).toContain(branch1OrderIdA);
    expect(ids).toContain(branch1OrderIdB);
    expect(ids).not.toContain(branch2OrderId);
  });

  // D3 — AC-3 non-terminal filter.
  it('should exclude completed and cancelled orders from list response', async () => {
    const res = await request(app).get('/api/staff/orders').set('Cookie', staff1Cookies.join('; '));
    expect(res.status).toBe(200);
    const ids = res.body.orders.map((o: any) => o.id);
    expect(ids).not.toContain(branch1CompletedOrderId);
    expect(ids).not.toContain(branch1CancelledOrderId);
  });

  // D6 — unassigned staff → 403.
  it('should return 403 for unassigned staff on list endpoint', async () => {
    const res = await request(app)
      .get('/api/staff/orders')
      .set('Cookie', unassignedStaffCookies.join('; '));
    expect(res.status).toBe(403);
  });

  // D7 — empty branch → 200 + empty array. Uses a fresh branch/staff with no orders.
  it('should return 200 and empty orders array for branch with no active orders', async () => {
    const emptySuffix = unique();
    const [emptyBranch] = await db
      .insert(schema.branches)
      .values({
        name: `Empty B ${emptySuffix}`,
        slug: `empty-b-${emptySuffix}`,
        address: '9 Empty Rd',
        latitude: '14.700000',
        longitude: '120.700000',
        phone: '+639170000099',
        opening_hours: '08:00-20:00',
      })
      .returning({ id: schema.branches.id });
    const emptyEmail = `staff-empty-${emptySuffix}@example.com`;
    const emptyCookies = await signUpAndGetCookie(emptyEmail, 'sup3r-secret-pw');
    await db
      .update(schema.users)
      .set({ role: 'staff', assignedBranchId: emptyBranch!.id })
      .where(eq(schema.users.email, emptyEmail));

    try {
      const res = await request(app)
        .get('/api/staff/orders')
        .set('Cookie', emptyCookies.join('; '));
      expect(res.status).toBe(200);
      expect(res.body.orders).toEqual([]);
    } finally {
      // Detach the staff user from the branch before deleting it (users.assignedBranchId FK).
      await db
        .update(schema.users)
        .set({ assignedBranchId: null })
        .where(eq(schema.users.email, emptyEmail));
      await db.delete(schema.branches).where(eq(schema.branches.id, emptyBranch!.id));
    }
  });
});

describe('GET /api/staff/orders/:orderId', () => {
  // D4 — AC-4 item + options shape.
  it('should return selectedOptions with all confirmed field names in detail response', async () => {
    const res = await request(app)
      .get(`/api/staff/orders/${branch1DetailOrderId}`)
      .set('Cookie', staff1Cookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(branch1DetailOrderId);
    expect(res.body.items).toHaveLength(2);

    const item = res.body.items[0];
    expect(typeof item.productName).toBe('string');
    expect(typeof item.quantity).toBe('number');
    expect(typeof item.unitPriceCents).toBe('number');
    expect(typeof item.totalPriceCents).toBe('number');

    const option = item.selectedOptions[0];
    expect(option).toHaveProperty('optionId');
    expect(option).toHaveProperty('optionType');
    expect(option).toHaveProperty('name');
    expect(option).toHaveProperty('priceDeltaCents');
  });

  // D5 — AC-5 cross-branch ID → exactly 403.
  it('should return 403 for cross-branch order ID on detail endpoint', async () => {
    const res = await request(app)
      .get(`/api/staff/orders/${branch2OrderId}`)
      .set('Cookie', staff1Cookies.join('; '));
    expect(res.status).toBe(403);
  });
});
