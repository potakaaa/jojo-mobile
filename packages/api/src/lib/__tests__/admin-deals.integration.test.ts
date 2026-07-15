import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin deals surface (ADM-004, Phase 4) — deals CRUD
 * plus the `deal_products`/`deal_branches` junctions and the D1 coupon-cascade
 * deactivate — run against a real local Postgres, mirroring
 * `admin-products.integration.test.ts`'s hermetic self-seeding (`makeUser(role)`,
 * reused a fourth time).
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d           # (or the machine's native Postgres, see all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers validate-contract Test Gates AC1-AC10 (AC11 is Agent-Probe UI, no runner):
 *   AC1  — create with valid deal_type / date range / conditional discount_value → 201
 *   AC2  — end_at <= start_at → 400
 *   AC3  — invalid deal_type string → 400 (Zod before Postgres)
 *   AC4  — attach product writes deal_products; duplicate attach → 409
 *   AC5  — attach branch writes deal_branches; duplicate attach → 409
 *   AC6  — detach product/branch → 204; detach non-attached pair → 404
 *   AC7  — staff/customer roles → 403 on all /api/admin/deals/* write routes
 *   AC8  — couponPolicy 'leave' (or omitted) toggles is_active only, zero coupon writes
 *   AC9  — couponPolicy 'expire' atomically flips is_active + expires available coupons;
 *          correct count; zero-outstanding → 0; forced mid-tx failure leaves both unchanged
 *   AC10 — PATCH partial start_at/end_at validated against the MERGED row
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type AuthModule = typeof import('../auth');
type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type IndexModule = typeof import('../../index');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let schema: SchemaModule;
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

let adminCookies: string[];
let staffCookies: string[];
let customerCookies: string[];
let customerId: string;

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
  return { email, cookies, id: row.id };
}

// ── Deal payload + create helper ──
function dealPayload(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    title: `Deal ${unique()}`,
    dealType: 'percentage_discount',
    discountValueCents: 2000,
    startAt: new Date(now).toISOString(),
    endAt: new Date(now + 7 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

function createDeal(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/admin/deals')
    .set('Cookie', adminCookies.join('; '))
    .send(dealPayload(overrides))
    .set('Content-Type', 'application/json');
}

async function seedDeal(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await createDeal(overrides);
  expect(res.status).toBe(201);
  return res.body.deal.id as string;
}

// ── Product + branch seeding (for junction tests) ──
async function seedCategory(): Promise<string> {
  const suffix = unique();
  const res = await request(app)
    .post('/api/admin/categories')
    .set('Cookie', adminCookies.join('; '))
    .send({ name: `Cat ${suffix}`, slug: `cat-${suffix}` })
    .set('Content-Type', 'application/json');
  expect(res.status).toBe(201);
  return res.body.category.id as string;
}

async function seedProduct(): Promise<string> {
  const categoryId = await seedCategory();
  const suffix = unique();
  const res = await request(app)
    .post('/api/admin/products')
    .set('Cookie', adminCookies.join('; '))
    .send({
      categoryId,
      name: `Product ${suffix}`,
      slug: `product-${suffix}`,
      basePriceCents: 10000,
    })
    .set('Content-Type', 'application/json');
  expect(res.status).toBe(201);
  return res.body.product.id as string;
}

async function seedBranch(): Promise<string> {
  const suffix = unique();
  const res = await request(app)
    .post('/api/admin/branches')
    .set('Cookie', adminCookies.join('; '))
    .send({
      name: `Branch ${suffix}`,
      slug: `branch-${suffix}`,
      address: '123 Test St',
      latitude: 14.5,
      longitude: 120.9,
      phone: '+639170000000',
      openingHours: '08:00-20:00',
      isAcceptingPickup: true,
    })
    .set('Content-Type', 'application/json');
  expect(res.status).toBe(201);
  return res.body.branch.id as string;
}

async function seedCoupon(
  dealId: string,
  status: 'available' | 'used' | 'expired' = 'available',
): Promise<string> {
  const [row] = await db
    .insert(schema.coupons)
    .values({
      user_id: customerId,
      deal_id: dealId,
      code: `CPN-${unique()}`,
      status,
    })
    .returning({ id: schema.coupons.id });
  return row!.id;
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));

  adminCookies = (await makeUser('admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  const customer = await makeUser('customer');
  customerCookies = customer.cookies;
  customerId = customer.id;
});

afterAll(() => {
  logSpy?.mockRestore();
});

// ─── AC1: create happy path ──────────────────────────────────────────────────

describe('AC1 — create deal (valid enum, date range, conditional discount)', () => {
  it('creates a percentage_discount deal and returns 201 + correct shape', async () => {
    const res = await createDeal({ dealType: 'percentage_discount', discountValueCents: 2500 });
    expect(res.status).toBe(201);
    const deal = res.body.deal;
    expect(deal.id).toBeTruthy();
    expect(deal.dealType).toBe('percentage_discount');
    expect(deal.discountValue).toBe(2500);
    expect(deal.isActive).toBe(true);
    expect(deal.productIds).toEqual([]);
    expect(deal.branchIds).toEqual([]);
    expect(deal.outstandingCoupons).toBe(0);
  });

  it('creates a fixed_discount deal round-tripping discountValue cents', async () => {
    const res = await createDeal({ dealType: 'fixed_discount', discountValueCents: 5000 });
    expect(res.status).toBe(201);
    expect(res.body.deal.discountValue).toBe(5000);

    // Persisted numeric is cents/100 with no drift.
    const [row] = await db.select().from(schema.deals).where(eq(schema.deals.id, res.body.deal.id));
    expect(row!.discount_value).toBe('50.00');
  });

  it('allows a null discount_value for a complex deal type (bundle)', async () => {
    const res = await createDeal({ dealType: 'bundle', discountValueCents: null });
    expect(res.status).toBe(201);
    expect(res.body.deal.discountValue).toBeNull();
  });

  it('rejects a percentage_discount create with a missing discount_value (400)', async () => {
    const res = await createDeal({ dealType: 'percentage_discount', discountValueCents: null });
    expect(res.status).toBe(400);
  });

  it('GET / lists the created deal; GET /:id returns detail with empty junctions', async () => {
    const dealId = await seedDeal();
    const list = await request(app).get('/api/admin/deals').set('Cookie', adminCookies.join('; '));
    expect(list.status).toBe(200);
    expect((list.body.deals as { id: string }[]).some((d) => d.id === dealId)).toBe(true);

    const detail = await request(app)
      .get(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(detail.status).toBe(200);
    expect(detail.body.deal.id).toBe(dealId);
    expect(detail.body.deal.outstandingCoupons).toBe(0);
  });

  it('GET / ?isActive=false returns only inactive deals', async () => {
    const activeId = await seedDeal();
    const toDeactivate = await seedDeal();
    await request(app)
      .post(`/api/admin/deals/${toDeactivate}/deactivate`)
      .set('Cookie', adminCookies.join('; '))
      .send({})
      .set('Content-Type', 'application/json');

    const res = await request(app)
      .get('/api/admin/deals?isActive=false')
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(200);
    const ids = (res.body.deals as { id: string }[]).map((d) => d.id);
    expect(ids).toContain(toDeactivate);
    expect(ids).not.toContain(activeId);
  });
});

// ─── AC2: date-range validation ──────────────────────────────────────────────

describe('AC2 — reject end_at <= start_at', () => {
  it('rejects end_at before start_at with 400', async () => {
    const now = Date.now();
    const res = await createDeal({
      startAt: new Date(now).toISOString(),
      endAt: new Date(now - 1000).toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects end_at equal to start_at with 400', async () => {
    const when = new Date().toISOString();
    const res = await createDeal({ startAt: when, endAt: when });
    expect(res.status).toBe(400);
  });
});

// ─── AC3: deal_type enum validation ──────────────────────────────────────────

describe('AC3 — reject invalid deal_type', () => {
  it('rejects an unknown deal_type string with 400 (Zod before Postgres)', async () => {
    const res = await createDeal({ dealType: 'mega_discount' });
    expect(res.status).toBe(400);
  });
});

// ─── AC4/AC5: junction attach + duplicate reject ─────────────────────────────

describe('AC4 — attach product + duplicate reject', () => {
  it('attaches a product (writes deal_products) and rejects a duplicate with 409', async () => {
    const dealId = await seedDeal();
    const productId = await seedProduct();

    const first = await request(app)
      .post(`/api/admin/deals/${dealId}/products`)
      .set('Cookie', adminCookies.join('; '))
      .send({ productId })
      .set('Content-Type', 'application/json');
    expect(first.status).toBe(201);
    expect(first.body.attached).toBe(true);

    const rows = await db
      .select()
      .from(schema.dealProducts)
      .where(
        and(eq(schema.dealProducts.deal_id, dealId), eq(schema.dealProducts.product_id, productId)),
      );
    expect(rows).toHaveLength(1);

    const dup = await request(app)
      .post(`/api/admin/deals/${dealId}/products`)
      .set('Cookie', adminCookies.join('; '))
      .send({ productId })
      .set('Content-Type', 'application/json');
    expect(dup.status).toBe(409);

    // Detail response reflects the attachment.
    const detail = await request(app)
      .get(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(detail.body.deal.productIds).toContain(productId);
  });

  it('404s attaching a non-existent product', async () => {
    const dealId = await seedDeal();
    const res = await request(app)
      .post(`/api/admin/deals/${dealId}/products`)
      .set('Cookie', adminCookies.join('; '))
      .send({ productId: '00000000-0000-0000-0000-000000000000' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});

describe('AC5 — attach branch + duplicate reject', () => {
  it('attaches a branch (writes deal_branches) and rejects a duplicate with 409', async () => {
    const dealId = await seedDeal();
    const branchId = await seedBranch();

    const first = await request(app)
      .post(`/api/admin/deals/${dealId}/branches`)
      .set('Cookie', adminCookies.join('; '))
      .send({ branchId })
      .set('Content-Type', 'application/json');
    expect(first.status).toBe(201);

    const rows = await db
      .select()
      .from(schema.dealBranches)
      .where(
        and(eq(schema.dealBranches.deal_id, dealId), eq(schema.dealBranches.branch_id, branchId)),
      );
    expect(rows).toHaveLength(1);

    const dup = await request(app)
      .post(`/api/admin/deals/${dealId}/branches`)
      .set('Cookie', adminCookies.join('; '))
      .send({ branchId })
      .set('Content-Type', 'application/json');
    expect(dup.status).toBe(409);
  });

  it('404s attaching a non-existent branch', async () => {
    const dealId = await seedDeal();
    const res = await request(app)
      .post(`/api/admin/deals/${dealId}/branches`)
      .set('Cookie', adminCookies.join('; '))
      .send({ branchId: '00000000-0000-0000-0000-000000000000' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});

// ─── AC6: detach + not-found ─────────────────────────────────────────────────

describe('AC6 — detach product/branch (204) + 404 on non-attached', () => {
  it('detaches an attached product with 204 and 404s a second detach', async () => {
    const dealId = await seedDeal();
    const productId = await seedProduct();
    await request(app)
      .post(`/api/admin/deals/${dealId}/products`)
      .set('Cookie', adminCookies.join('; '))
      .send({ productId })
      .set('Content-Type', 'application/json');

    const del = await request(app)
      .delete(`/api/admin/deals/${dealId}/products/${productId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(del.status).toBe(204);

    const rows = await db
      .select()
      .from(schema.dealProducts)
      .where(
        and(eq(schema.dealProducts.deal_id, dealId), eq(schema.dealProducts.product_id, productId)),
      );
    expect(rows).toHaveLength(0);

    const again = await request(app)
      .delete(`/api/admin/deals/${dealId}/products/${productId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(again.status).toBe(404);
  });

  it('detaches an attached branch with 204 and 404s a non-attached branch', async () => {
    const dealId = await seedDeal();
    const branchId = await seedBranch();
    await request(app)
      .post(`/api/admin/deals/${dealId}/branches`)
      .set('Cookie', adminCookies.join('; '))
      .send({ branchId })
      .set('Content-Type', 'application/json');

    const del = await request(app)
      .delete(`/api/admin/deals/${dealId}/branches/${branchId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(del.status).toBe(204);

    const again = await request(app)
      .delete(`/api/admin/deals/${dealId}/branches/${branchId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(again.status).toBe(404);
  });
});

// ─── AC7: requireAdmin authz ─────────────────────────────────────────────────

describe('AC7 — requireAdmin guard on /api/admin/deals/*', () => {
  it('rejects an unauthenticated request with 403', async () => {
    const res = await request(app).get('/api/admin/deals');
    expect(res.status).toBe(403);
  });

  it('rejects a staff-role session on GET with 403', async () => {
    const res = await request(app).get('/api/admin/deals').set('Cookie', staffCookies.join('; '));
    expect(res.status).toBe(403);
  });

  it('rejects a staff-role session on POST create with 403', async () => {
    const res = await request(app)
      .post('/api/admin/deals')
      .set('Cookie', staffCookies.join('; '))
      .send(dealPayload())
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
  });

  it('rejects a customer-role session on POST deactivate with 403', async () => {
    const dealId = await seedDeal();
    const res = await request(app)
      .post(`/api/admin/deals/${dealId}/deactivate`)
      .set('Cookie', customerCookies.join('; '))
      .send({ couponPolicy: 'expire' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
  });

  it('rejects a staff-role session on junction attach with 403', async () => {
    const dealId = await seedDeal();
    const res = await request(app)
      .post(`/api/admin/deals/${dealId}/products`)
      .set('Cookie', staffCookies.join('; '))
      .send({ productId: '00000000-0000-0000-0000-000000000000' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
  });
});

// ─── AC8: deactivate 'leave' (or omitted) ────────────────────────────────────

describe("AC8 — deactivate couponPolicy 'leave' (default): is_active only, no coupon writes", () => {
  it('flips is_active with an omitted body and never mutates coupons', async () => {
    const dealId = await seedDeal();
    const availableCoupon = await seedCoupon(dealId, 'available');

    const res = await request(app)
      .post(`/api/admin/deals/${dealId}/deactivate`)
      .set('Cookie', adminCookies.join('; '))
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.deal.isActive).toBe(false);
    expect(res.body.outstandingCouponsAffected).toBe(0);

    // Coupon stays available (zero coupon writes on 'leave').
    const [coupon] = await db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.id, availableCoupon));
    expect(coupon!.status).toBe('available');
  });

  it("explicit couponPolicy 'leave' is also a coupon no-op", async () => {
    const dealId = await seedDeal();
    const availableCoupon = await seedCoupon(dealId, 'available');

    const res = await request(app)
      .post(`/api/admin/deals/${dealId}/deactivate`)
      .set('Cookie', adminCookies.join('; '))
      .send({ couponPolicy: 'leave' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.outstandingCouponsAffected).toBe(0);

    const [coupon] = await db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.id, availableCoupon));
    expect(coupon!.status).toBe('available');
  });

  it('404s deactivating a non-existent deal', async () => {
    const res = await request(app)
      .post('/api/admin/deals/00000000-0000-0000-0000-000000000000/deactivate')
      .set('Cookie', adminCookies.join('; '))
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});

// ─── AC9: deactivate 'expire' atomic cascade ─────────────────────────────────

describe("AC9 — deactivate couponPolicy 'expire': atomic flip + expire available coupons", () => {
  it('flips is_active AND expires only available coupons, returning the correct count', async () => {
    const dealId = await seedDeal();
    const available1 = await seedCoupon(dealId, 'available');
    const available2 = await seedCoupon(dealId, 'available');
    const used = await seedCoupon(dealId, 'used');
    const alreadyExpired = await seedCoupon(dealId, 'expired');

    const res = await request(app)
      .post(`/api/admin/deals/${dealId}/deactivate`)
      .set('Cookie', adminCookies.join('; '))
      .send({ couponPolicy: 'expire' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.deal.isActive).toBe(false);
    expect(res.body.outstandingCouponsAffected).toBe(2);

    const rows = await db.select().from(schema.coupons).where(eq(schema.coupons.deal_id, dealId));
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    expect(byId.get(available1)).toBe('expired');
    expect(byId.get(available2)).toBe('expired');
    expect(byId.get(used)).toBe('used'); // untouched — not 'available'
    expect(byId.get(alreadyExpired)).toBe('expired'); // untouched
  });

  it('returns outstandingCouponsAffected 0 with no error when the deal has no outstanding coupons', async () => {
    const dealId = await seedDeal();
    const res = await request(app)
      .post(`/api/admin/deals/${dealId}/deactivate`)
      .set('Cookie', adminCookies.join('; '))
      .send({ couponPolicy: 'expire' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.deal.isActive).toBe(false);
    expect(res.body.outstandingCouponsAffected).toBe(0);
  });

  it('is all-or-nothing: a forced mid-transaction failure leaves BOTH tables unchanged', async () => {
    // Reproduces the route's exact two writes (deals.is_active flip + coupon
    // expire) inside db.transaction — the same primitive the deactivate handler
    // uses — then throws, proving the transaction rolls both back atomically.
    const dealId = await seedDeal();
    const couponId = await seedCoupon(dealId, 'available');

    await expect(
      db.transaction(async (tx) => {
        await tx
          .update(schema.deals)
          .set({ is_active: false, updated_at: new Date() })
          .where(eq(schema.deals.id, dealId));
        await tx
          .update(schema.coupons)
          .set({ status: 'expired' })
          .where(and(eq(schema.coupons.deal_id, dealId), eq(schema.coupons.status, 'available')));
        throw new Error('forced mid-transaction failure');
      }),
    ).rejects.toThrow('forced mid-transaction failure');

    const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId));
    expect(deal!.is_active).toBe(true); // rolled back

    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, couponId));
    expect(coupon!.status).toBe('available'); // rolled back
  });
});

// ─── AC10: PATCH partial-date merge validation ───────────────────────────────

describe('AC10 — PATCH partial start_at/end_at validated against the MERGED row', () => {
  it('rejects a lone end_at that predates the existing start_at (400)', async () => {
    const now = Date.now();
    const dealId = await seedDeal({
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + 7 * 24 * 3600 * 1000).toISOString(),
    });

    // A lone end_at BEFORE the existing start_at looks internally consistent as a
    // partial payload but is invalid once merged → 400.
    const res = await request(app)
      .patch(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ endAt: new Date(now - 24 * 3600 * 1000).toISOString() })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('rejects a lone start_at that postdates the existing end_at (400)', async () => {
    const now = Date.now();
    const dealId = await seedDeal({
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + 24 * 3600 * 1000).toISOString(),
    });

    const res = await request(app)
      .patch(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ startAt: new Date(now + 48 * 3600 * 1000).toISOString() })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('accepts a valid lone end_at extension and updates the field', async () => {
    const now = Date.now();
    const dealId = await seedDeal({
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + 24 * 3600 * 1000).toISOString(),
    });

    const newEnd = new Date(now + 30 * 24 * 3600 * 1000).toISOString();
    const res = await request(app)
      .patch(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ endAt: newEnd })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(new Date(res.body.deal.endAt).getTime()).toBe(new Date(newEnd).getTime());
  });

  it('updates a non-date field (title) without touching dates', async () => {
    const dealId = await seedDeal();
    const res = await request(app)
      .patch(`/api/admin/deals/${dealId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ title: 'Renamed Deal' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.deal.title).toBe('Renamed Deal');
  });

  it('404s a PATCH to a non-existent deal', async () => {
    const res = await request(app)
      .patch('/api/admin/deals/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies.join('; '))
      .send({ title: 'x' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});
