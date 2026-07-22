import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin Customer Management view (ADM-010, #125) — run
 * against a real local Postgres, mirroring `admin-orders.integration.test.ts`'s
 * hermetic self-seeding pattern.
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * The test DB is SHARED across suites in a run, so content assertions are scoped
 * by a per-suite random search token (`csuite<sfx>` / `nm<sfx>` / `em<sfx>` /
 * numeric phone token) rather than asserting an unfiltered full-set equality.
 *
 * Covers the validate-contract Test Gates (all Fully-Automated):
 *   AC1 — list returns only role=customer rows, correct fields, newest-first.
 *   AC2 — cursor pagination round-trips (no dupes/gaps, null cursor on last page).
 *   AC3 — q= search matches name/email/phone (case-insensitive) + composes w/ pagination.
 *   AC4 — detail full locked field set (positive) + auth-internal absence (negative), null-safe.
 *   AC5 — detail 404 for non-customer id + unknown id; customer id succeeds.
 *   AC6 — no mutation endpoint (POST/PATCH/PUT/DELETE → 404).
 *   AC7 — role matrix (admin/super_admin pass, staff/customer 403, unauthenticated 401/403).
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
const digits = () => Math.floor(1000000 + Math.random() * 8999999).toString();

// Per-suite tokens — searches scoped to these never collide with other suites.
const SFX = unique();
const SUITE_TOKEN = `csuite${SFX}`; // in every content customer NAME (list/pagination scope)
const NAME_TOKEN = `nm${SFX}`; // name-only search target
const EMAIL_TOKEN = `em${SFX}`; // email-only search target
const PHONE_TOKEN = `99${digits()}`; // phone-only search target (digits only)

let adminCookies: string[];
let superAdminCookies: string[];
let staffCookies: string[];
let customerCookies: string[];

// Role-check contrast ids (match SUITE_TOKEN but are excluded by the role scope).
let rcStaffId: string;
let rcAdminId: string;

// Hermetic content-customer ids.
let cFullId: string;
let cFullEmail: string;
let cFullPhone: string;
let cSparseId: string;
let sNameId: string;
let sEmailId: string;
let sPhoneId: string;

// Pagination customers p1..p5 (distinct createdAt, all match SUITE_TOKEN).
const pageIds: string[] = [];

// Fixtures for cFull's orders.
let branchId: string;
let categoryId: string;
let productId: string;
let optionId: string;

const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];
const createdStarsUserIds: string[] = [];

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

/** Create a customer via signup, then apply controlled profile fields. Returns id. */
async function makeCustomer(fields: Partial<typeof schema.users.$inferInsert>): Promise<string> {
  const { id } = await makeUser('customer');
  await db.update(schema.users).set(fields).where(eq(schema.users.id, id));
  return id;
}

async function seedOrder(userId: string, placedAt: Date): Promise<string> {
  const [row] = await db
    .insert(schema.orders)
    .values({
      user_id: userId,
      branch_id: branchId,
      order_number: `JP-CUST-${unique().toUpperCase()}`,
      status: 'completed',
      subtotal: '10.00',
      discount_total: '0',
      total: '10.00',
      payment_method: 'pay_at_branch',
      placed_at: placedAt,
    })
    .returning();
  const orderId = row!.id;
  createdOrderIds.push(orderId);
  await db.insert(schema.orderItems).values({
    order_id: orderId,
    product_id: productId,
    product_name_snapshot: 'Loaded Fries',
    quantity: 2,
    unit_price: '5.00',
    total_price: '10.00',
    selected_options: [{ optionId, optionType: 'size', name: 'Large', priceDeltaCents: 0 }],
  });
  return orderId;
}

async function listCustomers(query: string, cookies: string[]): Promise<request.Response> {
  return request(app).get(`/api/admin/customers${query}`).set('Cookie', cookies.join('; '));
}

async function getCustomer(id: string, cookies: string[]): Promise<request.Response> {
  return request(app).get(`/api/admin/customers/${id}`).set('Cookie', cookies.join('; '));
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  schema = await import('../../../db/schema/index');
  ({ app } = await import('../../../index'));

  adminCookies = (await makeUser('admin')).cookies;
  superAdminCookies = (await makeUser('super_admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  customerCookies = (await makeUser('customer')).cookies;

  // Role-check contrast users: staff + admin whose NAME matches SUITE_TOKEN. They
  // must NEVER appear in the customer list even though they match the search.
  const rcStaff = await makeUser('staff');
  rcStaffId = rcStaff.id;
  await db
    .update(schema.users)
    .set({ name: `RoleCheck Staff ${SUITE_TOKEN}` })
    .where(eq(schema.users.id, rcStaffId));
  const rcAdmin = await makeUser('admin');
  rcAdminId = rcAdmin.id;
  await db
    .update(schema.users)
    .set({ name: `RoleCheck Admin ${SUITE_TOKEN}` })
    .where(eq(schema.users.id, rcAdminId));

  // Order fixtures (branch/category/product/option) for cFull's recent orders.
  const suffix = unique();
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `CustCat ${suffix}`, slug: `cust-cat-${suffix}`, sort_order: 1 })
    .returning();
  categoryId = category!.id;
  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `CustProduct ${suffix}`,
      slug: `cust-product-${suffix}`,
      base_price: '5.00',
    })
    .returning();
  productId = product!.id;
  const [option] = await db
    .insert(schema.productOptions)
    .values({ product_id: productId, option_type: 'size', name: 'Large', price_delta: '0' })
    .returning();
  optionId = option!.id;
  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `CustBranch ${suffix}`,
      slug: `cust-branch-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000001',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 15,
    })
    .returning();
  branchId = branch!.id;

  // Fully-populated customer (AC4 positive + AC5 success contrast).
  cFullEmail = `maria.full.${SFX}@example.com`;
  cFullPhone = `+63917${digits()}`;
  cFullId = await makeCustomer({
    name: `Maria Full ${SFX}`,
    email: cFullEmail,
    phoneNumber: cFullPhone,
    emailVerified: true,
    phoneNumberVerified: true,
    birthday: '1990-05-15',
    address: '123 Mabini St',
    marketingOptIn: true,
    onboardedAt: new Date('2026-02-01T08:00:00Z'),
    favoriteBranchId: branchId,
  });
  await db
    .insert(schema.userStars)
    .values({ user_id: cFullId, current_stars: 42, lifetime_stars: 100 });
  createdStarsUserIds.push(cFullId);
  await seedOrder(cFullId, new Date('2026-06-20T10:00:00Z'));
  await seedOrder(cFullId, new Date('2026-06-21T10:00:00Z'));

  // Sparsely-populated customer (AC4 null-safe): no phone/birthday/address/
  // favorite branch/onboarded-at, no user_stars row, no orders.
  cSparseId = await makeCustomer({
    name: `Sparse ${SFX}`,
    email: `sparse.${SFX}@example.com`,
    phoneNumber: null,
    emailVerified: false,
    phoneNumberVerified: false,
    birthday: null,
    address: null,
    marketingOptIn: false,
    onboardedAt: null,
    favoriteBranchId: null,
  });

  // Per-field search targets (each token appears in EXACTLY one field).
  sNameId = await makeCustomer({
    name: `NameHit ${NAME_TOKEN}`,
    email: `plain-name-${SFX}@example.com`,
    phoneNumber: `+63917${digits()}`,
  });
  sEmailId = await makeCustomer({
    name: `Plain Email Cust ${SFX}`,
    email: `${EMAIL_TOKEN}-hit@example.com`,
    phoneNumber: `+63917${digits()}`,
  });
  sPhoneId = await makeCustomer({
    name: `Plain Phone Cust ${SFX}`,
    email: `plain-phone-${SFX}@example.com`,
    phoneNumber: `+63917${PHONE_TOKEN}`,
  });

  // Pagination customers p1..p5 — distinct createdAt, all match SUITE_TOKEN.
  for (let i = 1; i <= 5; i += 1) {
    const id = await makeCustomer({
      name: `PageCust ${i} ${SUITE_TOKEN}`,
      email: `pagecust-${i}-${SFX}@example.com`,
      createdAt: new Date(`2025-01-0${i}T00:00:00Z`),
    });
    pageIds.push(id); // pageIds[0]=p1 (oldest) .. pageIds[4]=p5 (newest)
  }
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await db.delete(schema.orderItems).where(inArray(schema.orderItems.order_id, createdOrderIds));
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  if (createdStarsUserIds.length > 0) {
    await db.delete(schema.userStars).where(inArray(schema.userStars.user_id, createdStarsUserIds));
  }
  // Clear the favorite-branch FK before deleting the branch.
  if (cFullId) {
    await db
      .update(schema.users)
      .set({ favoriteBranchId: null })
      .where(eq(schema.users.id, cFullId));
  }
  await db.delete(schema.productOptions).where(eq(schema.productOptions.id, optionId));
  await db.delete(schema.products).where(eq(schema.products.id, productId));
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  if (branchId) await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  logSpy?.mockRestore();
  vi.restoreAllMocks();
});

describe('AC1 — list role scope + field shape + sort order', () => {
  it('returns only role=customer rows (staff/admin matching the token are excluded)', async () => {
    const res = await listCustomers(`?q=${SUITE_TOKEN}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const ids = res.body.customers.map((c: { id: string }) => c.id);
    // All 5 pagination customers present…
    expect(ids).toEqual(expect.arrayContaining(pageIds));
    // …but the SUITE_TOKEN-matching staff + admin are NEVER listed.
    expect(ids).not.toContain(rcStaffId);
    expect(ids).not.toContain(rcAdminId);
  });

  it('each list row exposes exactly the summary field set (no role/auth fields)', async () => {
    const res = await listCustomers(`?q=${SUITE_TOKEN}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const row = res.body.customers[0];
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('name');
    expect(row).toHaveProperty('email');
    expect(row).toHaveProperty('phoneNumber');
    expect(row).toHaveProperty('createdAt');
    expect(row).not.toHaveProperty('role');
    expect(row).not.toHaveProperty('password');
    expect(row).not.toHaveProperty('assignedBranchId');
  });

  it('newest-signup-first ordering by createdAt', async () => {
    const res = await listCustomers(`?q=${SUITE_TOKEN}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const times = res.body.customers.map((c: { createdAt: string }) =>
      new Date(c.createdAt).getTime(),
    );
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });
});

describe('AC2/AC3 — cursor pagination round-trip (scoped by search token)', () => {
  it('paginates the 5 SUITE_TOKEN customers via nextCursor with no dupes/gaps', async () => {
    const collected: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const query: string = `?q=${SUITE_TOKEN}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res: request.Response = await listCustomers(query, adminCookies);
      expect(res.status).toBe(200);
      for (const c of res.body.customers) collected.push(c.id);
      cursor = res.body.nextCursor;
      guard += 1;
    } while (cursor !== null && guard < 10);

    // All 5 collected exactly once, newest-first (p5 → p1).
    const expectedNewestFirst = [...pageIds].reverse();
    expect(collected).toEqual(expectedNewestFirst);
    expect(new Set(collected).size).toBe(collected.length);
  });

  it('the final page returns a null cursor', async () => {
    const res = await listCustomers(`?q=${SUITE_TOKEN}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBeNull();
  });
});

describe('AC3 — q= search across name / email / phone', () => {
  it('name-only token matches the name customer and excludes a control', async () => {
    const res = await listCustomers(`?q=${NAME_TOKEN}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const ids = res.body.customers.map((c: { id: string }) => c.id);
    expect(ids).toContain(sNameId);
    expect(ids).not.toContain(sEmailId);
    expect(ids).not.toContain(sPhoneId);
  });

  it('email-only token matches the email customer and excludes a control', async () => {
    const res = await listCustomers(`?q=${EMAIL_TOKEN}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const ids = res.body.customers.map((c: { id: string }) => c.id);
    expect(ids).toContain(sEmailId);
    expect(ids).not.toContain(sNameId);
  });

  it('phone-only token matches the phone customer and excludes a control', async () => {
    const res = await listCustomers(`?q=${PHONE_TOKEN}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const ids = res.body.customers.map((c: { id: string }) => c.id);
    expect(ids).toContain(sPhoneId);
    expect(ids).not.toContain(sNameId);
  });

  it('search is case-insensitive (uppercased token still matches)', async () => {
    const res = await listCustomers(`?q=${NAME_TOKEN.toUpperCase()}&limit=50`, adminCookies);
    expect(res.status).toBe(200);
    const ids = res.body.customers.map((c: { id: string }) => c.id);
    expect(ids).toContain(sNameId);
  });
});

describe('AC4 — detail field shape (positive presence + auth-internal absence + null-safe)', () => {
  it('fully-populated customer exposes the full locked field set', async () => {
    const res = await getCustomer(cFullId, adminCookies);
    expect(res.status).toBe(200);
    const c = res.body.customer;
    expect(c.id).toBe(cFullId);
    expect(c.name).toBe(`Maria Full ${SFX}`);
    expect(c.email).toBe(cFullEmail);
    expect(c.phoneNumber).toBe(cFullPhone);
    expect(c.emailVerified).toBe(true);
    expect(c.phoneNumberVerified).toBe(true);
    expect(c.birthday).toBe('1990-05-15');
    expect(c.address).toBe('123 Mabini St');
    expect(c.marketingOptIn).toBe(true);
    expect(c.favoriteBranchName).toBeTruthy();
    expect(c.onboardedAt).toBeTruthy();
    expect(c.starsBalance).toEqual({ current: 42, lifetime: 100 });
    expect(Array.isArray(c.recentOrders)).toBe(true);
    expect(c.recentOrders).toHaveLength(2);
    expect(c.recentOrders[0].customerName).toBe(`Maria Full ${SFX}`);
    expect(c.recentOrders[0].branchName).toBeTruthy();
  });

  it('never exposes any auth-internal field', async () => {
    const res = await getCustomer(cFullId, adminCookies);
    expect(res.status).toBe(200);
    const c = res.body.customer;
    expect(c).not.toHaveProperty('password');
    expect(c).not.toHaveProperty('passwordHash');
    expect(c).not.toHaveProperty('hashedPassword');
    expect(c).not.toHaveProperty('sessionToken');
    expect(c).not.toHaveProperty('verificationToken');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('sessionToken');
  });

  it('sparsely-populated customer serializes null fields safely', async () => {
    const res = await getCustomer(cSparseId, adminCookies);
    expect(res.status).toBe(200);
    const c = res.body.customer;
    expect(c.phoneNumber).toBeNull();
    expect(c.birthday).toBeNull();
    expect(c.address).toBeNull();
    expect(c.favoriteBranchName).toBeNull();
    expect(c.onboardedAt).toBeNull();
    expect(c.starsBalance).toBeNull();
    expect(c.recentOrders).toEqual([]);
  });
});

describe('AC5 — detail 404 contrast', () => {
  it('a staff id → 404', async () => {
    const res = await getCustomer(rcStaffId, adminCookies);
    expect(res.status).toBe(404);
  });

  it('an admin id → 404', async () => {
    const res = await getCustomer(rcAdminId, adminCookies);
    expect(res.status).toBe(404);
  });

  it('an unknown uuid → 404', async () => {
    const res = await getCustomer('00000000-0000-0000-0000-000000000000', adminCookies);
    expect(res.status).toBe(404);
  });

  it('a malformed (non-uuid) id → 404', async () => {
    const res = await getCustomer('not-a-uuid', adminCookies);
    expect(res.status).toBe(404);
  });

  it('a customer id → 200 (contrast)', async () => {
    const res = await getCustomer(cFullId, adminCookies);
    expect(res.status).toBe(200);
  });
});

describe('AC6 — no mutation endpoint (read-only)', () => {
  it('POST/PATCH/PUT/DELETE on the collection → 404 (never handled)', async () => {
    const cookie = adminCookies.join('; ');
    expect((await request(app).post('/api/admin/customers').set('Cookie', cookie)).status).toBe(
      404,
    );
    expect((await request(app).patch('/api/admin/customers').set('Cookie', cookie)).status).toBe(
      404,
    );
    expect((await request(app).put('/api/admin/customers').set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).delete('/api/admin/customers').set('Cookie', cookie)).status).toBe(
      404,
    );
  });

  it('POST/PATCH/PUT/DELETE on a specific customer → 404 (never handled)', async () => {
    const cookie = adminCookies.join('; ');
    const url = `/api/admin/customers/${cFullId}`;
    expect((await request(app).post(url).set('Cookie', cookie)).status).toBe(404);
    expect(
      (await request(app).patch(url).set('Cookie', cookie).send({ name: 'Hacked' })).status,
    ).toBe(404);
    expect((await request(app).put(url).set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).delete(url).set('Cookie', cookie)).status).toBe(404);
  });
});

describe('AC7 — role matrix', () => {
  it('admin and super_admin reach both list and detail (200)', async () => {
    for (const cookies of [adminCookies, superAdminCookies]) {
      const list = await listCustomers('?limit=1', cookies);
      expect(list.status).toBe(200);
      const detail = await getCustomer(cFullId, cookies);
      expect(detail.status).toBe(200);
    }
  });

  it('customer and staff receive 403 on list and detail', async () => {
    for (const cookies of [customerCookies, staffCookies]) {
      const list = await listCustomers('?limit=1', cookies);
      expect(list.status).toBe(403);
      const detail = await getCustomer(cFullId, cookies);
      expect(detail.status).toBe(403);
    }
  });

  it('unauthenticated requests receive 401/403', async () => {
    const list = await request(app).get('/api/admin/customers');
    expect([401, 403]).toContain(list.status);
    const detail = await request(app).get(`/api/admin/customers/${cFullId}`);
    expect([401, 403]).toContain(detail.status);
  });
});
