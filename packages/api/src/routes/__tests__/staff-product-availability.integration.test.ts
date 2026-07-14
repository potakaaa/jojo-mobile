/* eslint-disable @typescript-eslint/no-explicit-any -- fetch/supertest JSON
   bodies are loosely typed at the test boundary; assertions narrow them. */
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the STAFF-004 product availability and branch settings
 * endpoints.
 *
 * Covers:
 *   AC-1 — GET /products: absent bpa row → isAvailable: true (staff LEFT JOIN default)
 *   AC-2 — PATCH /products/:id/availability false → product removed from customer menu
 *   AC-3 — PATCH /products/:id/availability true → product restored to customer menu
 *   AC-4 — branch isolation on products: staff2 cannot touch branch1 products
 *   AC-5 — PATCH /branch { isAcceptingPickup: false } → POST /orders → 400
 *   AC-6 — PATCH /branch { isAcceptingPickup: true } → branch restored
 *   AC-7 — PATCH /branch { estimatedPrepMinutes: 30 } → GET /branch reflects update
 *   AC-8 — branch isolation: staff2 PATCH /branch only affects branch2, not branch1
 *   Edge cases: empty body 422, invalid UUID 404, prep time out of range 422
 *   Unassigned staff 403 on GET /products
 *
 * Hermetic: seeds its OWN branches / staff / customer / products and cleans up in afterAll.
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
const suffix = unique();

let branch1Id: string;
let branch2Id: string;
let product1Id: string;
let product2Id: string;
let categoryId: string;
let customerId: string;

let staff1Cookies: string[];
let staff2Cookies: string[];
let unassignedStaffCookies: string[];
let customerCookies: string[];

const createdBpaIds: string[] = [];

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
      name: `PA B1 ${suffix}`,
      slug: `pa-b1-${suffix}`,
      address: '1 Avail St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000071',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 15,
    })
    .returning({ id: schema.branches.id });
  branch1Id = b1!.id;

  // Branch-2 (staff2's branch — for isolation tests).
  const [b2] = await db
    .insert(schema.branches)
    .values({
      name: `PA B2 ${suffix}`,
      slug: `pa-b2-${suffix}`,
      address: '2 Avail Ave',
      latitude: '10.300000',
      longitude: '123.900000',
      phone: '+639170000072',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 20,
    })
    .returning({ id: schema.branches.id });
  branch2Id = b2!.id;

  // Category + 2 products (globally active).
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `Cat PA ${suffix}`, slug: `cat-pa-${suffix}`, sort_order: 1 })
    .returning({ id: schema.categories.id });
  categoryId = category!.id;

  const [p1] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `Product PA1 ${suffix}`,
      slug: `prod-pa1-${suffix}`,
      base_price: '8.00',
    })
    .returning({ id: schema.products.id });
  product1Id = p1!.id;

  const [p2] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `Product PA2 ${suffix}`,
      slug: `prod-pa2-${suffix}`,
      base_price: '12.50',
    })
    .returning({ id: schema.products.id });
  product2Id = p2!.id;

  // Customer (for customer-side menu/order assertions and AC-5 order placement).
  const customerEmail = `cust-pa-${suffix}@example.com`;
  customerCookies = await signUpAndGetCookie(customerEmail, 'sup3r-secret-pw');
  const [customer] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, customerEmail));
  customerId = customer!.id;

  // Staff-1 → branch-1.
  const staff1Email = `staff1-pa-${suffix}@example.com`;
  staff1Cookies = await signUpAndGetCookie(staff1Email, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: branch1Id })
    .where(eq(schema.users.email, staff1Email));

  // Staff-2 → branch-2.
  const staff2Email = `staff2-pa-${suffix}@example.com`;
  staff2Cookies = await signUpAndGetCookie(staff2Email, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: branch2Id })
    .where(eq(schema.users.email, staff2Email));

  // Unassigned staff (no branch).
  const unassignedEmail = `staff-unassigned-pa-${suffix}@example.com`;
  unassignedStaffCookies = await signUpAndGetCookie(unassignedEmail, 'sup3r-secret-pw');
  await db
    .update(schema.users)
    .set({ role: 'staff', assignedBranchId: null })
    .where(eq(schema.users.email, unassignedEmail));
});

afterAll(async () => {
  const { inArray } = await import('drizzle-orm');

  // Clean up bpa rows created during tests.
  if (createdBpaIds.length > 0) {
    await db
      .delete(schema.branchProductAvailability)
      .where(inArray(schema.branchProductAvailability.id, createdBpaIds));
  }
  // Clean up any bpa rows for our test products (created by UPSERT during tests).
  await db
    .delete(schema.branchProductAvailability)
    .where(inArray(schema.branchProductAvailability.product_id, [product1Id, product2Id]));

  // Detach all staff from both branches before deleting.
  await db
    .update(schema.users)
    .set({ assignedBranchId: null })
    .where(inArray(schema.users.assignedBranchId, [branch1Id, branch2Id]));

  await db.delete(schema.users).where(eq(schema.users.id, customerId));
  await db.delete(schema.products).where(eq(schema.products.id, product1Id));
  await db.delete(schema.products).where(eq(schema.products.id, product2Id));
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  await db.delete(schema.branches).where(eq(schema.branches.id, branch1Id));
  await db.delete(schema.branches).where(eq(schema.branches.id, branch2Id));

  logSpy?.mockRestore();
});

// ─── AC-1: GET /products — absent bpa row = available ─────────────────────────

describe('GET /api/staff/products — AC-1 absent bpa row → isAvailable: true', () => {
  it('returns both products with isAvailable: true when no bpa row exists', async () => {
    const res = await request(app)
      .get('/api/staff/products')
      .set('Cookie', staff1Cookies.join('; '));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);

    const ids = res.body.products.map((p: any) => p.id);
    expect(ids).toContain(product1Id);
    expect(ids).toContain(product2Id);

    // Absent bpa row → isAvailable defaults to true (staff LEFT JOIN COALESCE).
    const p1 = res.body.products.find((p: any) => p.id === product1Id);
    const p2 = res.body.products.find((p: any) => p.id === product2Id);
    expect(p1?.isAvailable).toBe(true);
    expect(p2?.isAvailable).toBe(true);

    // Verify shape: basePrice is a string (decimal string from numeric(10,2)).
    expect(typeof p1?.basePrice).toBe('string');
    expect(p1?.categoryId).toBe(categoryId);
  });

  it('returns 403 for unassigned staff', async () => {
    const res = await request(app)
      .get('/api/staff/products')
      .set('Cookie', unassignedStaffCookies.join('; '));
    expect(res.status).toBe(403);
  });
});

// ─── AC-2: toggle off → removed from customer menu ────────────────────────────

describe('PATCH /api/staff/products/:productId/availability — AC-2 toggle off', () => {
  it('toggle isAvailable: false → product absent from customer menu (INNER JOIN)', async () => {
    // Staff-1 marks product1 unavailable at branch-1.
    const patchRes = await request(app)
      .patch(`/api/staff/products/${product1Id}/availability`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ isAvailable: false });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.productId).toBe(product1Id);
    expect(patchRes.body.isAvailable).toBe(false);

    // Staff-side GET /products now shows isAvailable: false.
    const staffRes = await request(app)
      .get('/api/staff/products')
      .set('Cookie', staff1Cookies.join('; '));
    const p1Staff = staffRes.body.products.find((p: any) => p.id === product1Id);
    expect(p1Staff?.isAvailable).toBe(false);

    // Customer-side GET /branches/:id/menu uses INNER JOIN with is_available=true.
    // A row with is_available=false → product NOT in customer menu.
    const menuRes = await request(app).get(`/branches/${branch1Id}/menu`);
    const customerProductIds: string[] = [];
    for (const cat of menuRes.body.categories ?? []) {
      for (const p of cat.products ?? []) {
        customerProductIds.push(p.id);
      }
    }
    expect(customerProductIds).not.toContain(product1Id);
  });
});

// ─── AC-3: toggle on → restored to customer menu ──────────────────────────────

describe('PATCH /api/staff/products/:productId/availability — AC-3 toggle on', () => {
  it('toggle isAvailable: true → product restored to customer menu', async () => {
    // Toggle product1 back on (it was set false in AC-2).
    const patchRes = await request(app)
      .patch(`/api/staff/products/${product1Id}/availability`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ isAvailable: true });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.isAvailable).toBe(true);

    // Customer-side menu should now include product1.
    // The bpa row now has is_available=true → INNER JOIN picks it up.
    const menuRes = await request(app).get(`/branches/${branch1Id}/menu`);
    const customerProductIds: string[] = [];
    for (const cat of menuRes.body.categories ?? []) {
      for (const p of cat.products ?? []) {
        customerProductIds.push(p.id);
      }
    }
    expect(customerProductIds).toContain(product1Id);
  });
});

// ─── AC-4: branch isolation — products ────────────────────────────────────────

describe('PATCH /api/staff/products/:productId/availability — AC-4 branch isolation', () => {
  it('staff2 cannot toggle availability for product at branch1 → operates on branch2 scope only', async () => {
    // Staff-2 is assigned to branch-2. They call PATCH on product1.
    // This succeeds for branch-2's scope (creates a bpa row for branch-2 x product1),
    // but does NOT touch branch-1's availability.
    const patchRes = await request(app)
      .patch(`/api/staff/products/${product1Id}/availability`)
      .set('Cookie', staff2Cookies.join('; '))
      .send({ isAvailable: false });
    expect(patchRes.status).toBe(200);

    // Branch-1 customer menu still shows product1 (staff-2's PATCH only affects branch-2).
    const b1MenuRes = await request(app).get(`/branches/${branch1Id}/menu`);
    const b1ProductIds: string[] = [];
    for (const cat of b1MenuRes.body.categories ?? []) {
      for (const p of cat.products ?? []) {
        b1ProductIds.push(p.id);
      }
    }
    expect(b1ProductIds).toContain(product1Id);

    // Branch-2 customer menu does NOT show product1 (staff-2's PATCH applied).
    const b2MenuRes = await request(app).get(`/branches/${branch2Id}/menu`);
    const b2ProductIds: string[] = [];
    for (const cat of b2MenuRes.body.categories ?? []) {
      for (const p of cat.products ?? []) {
        b2ProductIds.push(p.id);
      }
    }
    expect(b2ProductIds).not.toContain(product1Id);
  });
});

// ─── AC-5: pickup toggle off → POST /orders → 400 ────────────────────────────

describe('PATCH /api/staff/branch — AC-5 pickup toggle off', () => {
  it('isAcceptingPickup: false → customer POST /orders → 400', async () => {
    const patchRes = await request(app)
      .patch('/api/staff/branch')
      .set('Cookie', staff1Cookies.join('; '))
      .send({ isAcceptingPickup: false });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.isAcceptingPickup).toBe(false);

    // Customer attempts to place an order at branch-1 — should be blocked with 400.
    // Use a minimal valid order body (product1 is available for ordering).
    const orderRes = await request(app)
      .post('/orders')
      .set('Cookie', customerCookies.join('; '))
      .send({
        branchId: branch1Id,
        items: [{ productId: product1Id, quantity: 1, selectedOptions: [] }],
        paymentMethod: 'pay_at_branch',
      });

    expect(orderRes.status).toBe(400);
  });
});

// ─── AC-6: pickup toggle on → branch restored ────────────────────────────────

describe('PATCH /api/staff/branch — AC-6 pickup toggle on', () => {
  it('isAcceptingPickup: true → GET /api/staff/branch reflects restored state', async () => {
    const patchRes = await request(app)
      .patch('/api/staff/branch')
      .set('Cookie', staff1Cookies.join('; '))
      .send({ isAcceptingPickup: true });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.isAcceptingPickup).toBe(true);

    // Confirm via GET /api/staff/branch.
    const getRes = await request(app)
      .get('/api/staff/branch')
      .set('Cookie', staff1Cookies.join('; '));
    expect(getRes.status).toBe(200);
    expect(getRes.body.isAcceptingPickup).toBe(true);
  });
});

// ─── AC-7: prep time edit ────────────────────────────────────────────────────

describe('PATCH /api/staff/branch — AC-7 prep time edit', () => {
  it('estimatedPrepMinutes: 30 → GET /api/staff/branch reflects 30', async () => {
    const patchRes = await request(app)
      .patch('/api/staff/branch')
      .set('Cookie', staff1Cookies.join('; '))
      .send({ estimatedPrepMinutes: 30 });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.estimatedPrepMinutes).toBe(30);

    const getRes = await request(app)
      .get('/api/staff/branch')
      .set('Cookie', staff1Cookies.join('; '));
    expect(getRes.status).toBe(200);
    expect(getRes.body.estimatedPrepMinutes).toBe(30);
  });
});

// ─── AC-8: branch isolation — branch settings ────────────────────────────────

describe('PATCH /api/staff/branch — AC-8 branch isolation', () => {
  it('staff2 PATCH /branch only affects branch2; branch1 settings unchanged', async () => {
    // Get branch-1 current state (from AC-7 we know estimatedPrepMinutes = 30).
    const b1Before = await request(app)
      .get('/api/staff/branch')
      .set('Cookie', staff1Cookies.join('; '));
    const b1PrepBefore = b1Before.body.estimatedPrepMinutes;

    // Staff-2 patches THEIR own branch (branch-2) with different values.
    const patchRes = await request(app)
      .patch('/api/staff/branch')
      .set('Cookie', staff2Cookies.join('; '))
      .send({ estimatedPrepMinutes: 45 });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.estimatedPrepMinutes).toBe(45);

    // Branch-1 should be unchanged.
    const b1After = await request(app)
      .get('/api/staff/branch')
      .set('Cookie', staff1Cookies.join('; '));
    expect(b1After.body.estimatedPrepMinutes).toBe(b1PrepBefore);

    // Branch-2 (staff-2's view) shows the new value.
    const b2Res = await request(app)
      .get('/api/staff/branch')
      .set('Cookie', staff2Cookies.join('; '));
    expect(b2Res.body.estimatedPrepMinutes).toBe(45);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('empty body to PATCH /api/staff/branch → 422', async () => {
    const res = await request(app)
      .patch('/api/staff/branch')
      .set('Cookie', staff1Cookies.join('; '))
      .send({});
    expect(res.status).toBe(422);
  });

  it('invalid UUID to PATCH /api/staff/products/:productId/availability → 404', async () => {
    const res = await request(app)
      .patch('/api/staff/products/not-a-uuid/availability')
      .set('Cookie', staff1Cookies.join('; '))
      .send({ isAvailable: false });
    expect(res.status).toBe(404);
  });

  it('estimatedPrepMinutes: 0 → 422 (below min of 1)', async () => {
    const res = await request(app)
      .patch('/api/staff/branch')
      .set('Cookie', staff1Cookies.join('; '))
      .send({ estimatedPrepMinutes: 0 });
    expect(res.status).toBe(422);
  });

  it('estimatedPrepMinutes: 121 → 422 (above max of 120)', async () => {
    const res = await request(app)
      .patch('/api/staff/branch')
      .set('Cookie', staff1Cookies.join('; '))
      .send({ estimatedPrepMinutes: 121 });
    expect(res.status).toBe(422);
  });

  it('GET /api/staff/products for unassigned staff → 403', async () => {
    const res = await request(app)
      .get('/api/staff/products')
      .set('Cookie', unassignedStaffCookies.join('; '));
    expect(res.status).toBe(403);
  });

  it('non-existent UUID to PATCH /api/staff/products/:productId/availability → 404', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .patch(`/api/staff/products/${fakeUuid}/availability`)
      .set('Cookie', staff1Cookies.join('; '))
      .send({ isAvailable: false });
    expect(res.status).toBe(404);
  });
});
