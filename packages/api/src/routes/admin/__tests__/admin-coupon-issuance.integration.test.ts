import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin coupon issuance surface (ADM-008 Phase 3) — run
 * against a real local Postgres, mirroring `admin-branches.integration.test.ts`.
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers (validate-contract Test Gates, all Fully-Automated):
 *   AC3  — bulk generate N=50 → 50 unique JP-OFR- codes, all user_id NULL;
 *          forced-collision spy on the generator → the bounded retry mints a
 *          fresh code (no 500, no duplicate).
 *   AC4  — targeted single issue (quantity=1 + userId) sets coupons.user_id.
 *   AC11 — quantity<=0 / missing offerId → 400 BEFORE any DB write (zero rows).
 *   AC9  — no-auth (403) + wrong-role (403) on the /api/admin/coupons/* router.
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
type CodeModule = typeof import('../../../lib/reward-coupon-code');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let users: SchemaModule['users'];
let offers: SchemaModule['offers'];
let coupons: SchemaModule['coupons'];
let app: IndexModule['app'];
let offerCouponCodeGenerator: CodeModule['offerCouponCodeGenerator'];

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
    await db.update(users).set({ role: roleValue }).where(eq(users.email, email));
  }
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!row) throw new Error('Test setup: failed to read back created user');
  return { email, cookies, id: row.id };
}

/** Create an Offer via the real API, returning its id. */
async function createOfferId(): Promise<string> {
  const suffix = unique();
  const res = await request(app)
    .post('/api/admin/offers')
    .set('Cookie', adminCookies.join('; '))
    .send({
      title: `Offer ${suffix}`,
      offerType: 'fixed_discount',
      discountValueCents: 500,
      minimumOrderAmountCents: 0,
      startAt: '2026-01-01T00:00:00.000Z',
      endAt: '2026-12-31T23:59:59.000Z',
    })
    .set('Content-Type', 'application/json');
  expect(res.status).toBe(201);
  return res.body.offer.id as string;
}

function generate(cookies: string[], body: Record<string, unknown>) {
  return request(app)
    .post('/api/admin/coupons/generate')
    .set('Cookie', cookies.join('; '))
    .send(body)
    .set('Content-Type', 'application/json');
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  ({ users, offers, coupons } = await import('../../../db/schema/index'));
  ({ app } = await import('../../../index'));
  ({ offerCouponCodeGenerator } = await import('../../../lib/reward-coupon-code'));

  adminCookies = (await makeUser('admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  const customer = await makeUser('customer');
  customerCookies = customer.cookies;
  customerId = customer.id;
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('POST /api/admin/coupons/generate — bulk (AC3)', () => {
  it('bulk-generates N=50 unique JP-OFR- coupons, all user_id NULL', async () => {
    const offerId = await createOfferId();
    const res = await generate(adminCookies, { offerId, quantity: 50 });

    expect(res.status).toBe(201);
    const issued = res.body.coupons as { code: string; userId: string | null; offerId: string }[];
    expect(issued).toHaveLength(50);

    const codes = new Set(issued.map((c) => c.code));
    expect(codes.size).toBe(50); // all unique
    for (const c of issued) {
      expect(c.code.startsWith('JP-OFR-')).toBe(true);
      expect(c.userId).toBeNull();
      expect(c.offerId).toBe(offerId);
    }

    // The DB actually holds 50 rows for this offer.
    const rows = await db.select().from(coupons).where(eq(coupons.offer_id, offerId));
    expect(rows).toHaveLength(50);
    expect(new Set(rows.map((r) => r.code)).size).toBe(50);
  });

  it('retries on a forced code collision instead of failing (generator retry path, AC3)', async () => {
    const offerId = await createOfferId();
    const takenCode = 'JP-OFR-TAKN';
    // Pre-seed a coupon that owns `takenCode` so the first generate() collides.
    await db.insert(coupons).values({ offer_id: offerId, code: takenCode });

    const realGen = offerCouponCodeGenerator.generate;
    const spy = vi
      .spyOn(offerCouponCodeGenerator, 'generate')
      .mockImplementationOnce(() => takenCode) // first attempt collides
      .mockImplementation(() => realGen());
    try {
      const res = await generate(adminCookies, { offerId, quantity: 1 });
      expect(res.status).toBe(201);
      const [issued] = res.body.coupons as { code: string }[];
      expect(issued!.code).not.toBe(takenCode); // retry minted a fresh code
      expect(issued!.code.startsWith('JP-OFR-')).toBe(true);
    } finally {
      spy.mockRestore();
    }

    // Exactly two rows exist for this offer: the pre-seed + the retried mint.
    const rows = await db.select().from(coupons).where(eq(coupons.offer_id, offerId));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.code)).size).toBe(2);
  });
});

describe('POST /api/admin/coupons/generate — targeted (AC4)', () => {
  it('issues a single targeted coupon with user_id set', async () => {
    const offerId = await createOfferId();
    const res = await generate(adminCookies, { offerId, quantity: 1, userId: customerId });

    expect(res.status).toBe(201);
    const issued = res.body.coupons as { code: string; userId: string | null }[];
    expect(issued).toHaveLength(1);
    expect(issued[0]!.userId).toBe(customerId);

    const [row] = await db.select().from(coupons).where(eq(coupons.code, issued[0]!.code));
    expect(row!.user_id).toBe(customerId);
    expect(row!.offer_id).toBe(offerId);
  });

  it('rejects userId when quantity > 1 with 400 (bulk cannot be targeted)', async () => {
    const offerId = await createOfferId();
    const res = await generate(adminCookies, { offerId, quantity: 2, userId: customerId });
    expect(res.status).toBe(400);

    const rows = await db.select().from(coupons).where(eq(coupons.offer_id, offerId));
    expect(rows).toHaveLength(0);
  });

  it('persists an explicit expiresAt when supplied', async () => {
    const offerId = await createOfferId();
    const expiresAt = '2026-06-30T00:00:00.000Z';
    const res = await generate(adminCookies, { offerId, quantity: 1, expiresAt });
    expect(res.status).toBe(201);
    expect(res.body.coupons[0].expiresAt).toBe(expiresAt);
  });
});

describe('POST /api/admin/coupons/generate — malformed (AC11)', () => {
  it('rejects quantity<=0 with 400 and writes zero rows', async () => {
    const offerId = await createOfferId();
    const zero = await generate(adminCookies, { offerId, quantity: 0 });
    expect(zero.status).toBe(400);
    const negative = await generate(adminCookies, { offerId, quantity: -5 });
    expect(negative.status).toBe(400);

    const rows = await db.select().from(coupons).where(eq(coupons.offer_id, offerId));
    expect(rows).toHaveLength(0);
  });

  it('rejects a missing offerId with 400 (no DB write)', async () => {
    const before = await db.select().from(coupons);
    const res = await generate(adminCookies, { quantity: 5 });
    expect(res.status).toBe(400);
    const after = await db.select().from(coupons);
    expect(after.length).toBe(before.length);
  });

  it('404s a generate referencing a non-existent offer', async () => {
    const res = await generate(adminCookies, {
      offerId: '00000000-0000-0000-0000-000000000000',
      quantity: 3,
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/coupons?offerId= (list)', () => {
  it('lists coupons for an offer and 400s when offerId is absent', async () => {
    const offerId = await createOfferId();
    await generate(adminCookies, { offerId, quantity: 3 });

    const list = await request(app)
      .get(`/api/admin/coupons?offerId=${offerId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(list.status).toBe(200);
    expect(list.body.coupons).toHaveLength(3);

    const missing = await request(app)
      .get('/api/admin/coupons')
      .set('Cookie', adminCookies.join('; '));
    expect(missing.status).toBe(400);
  });
});

describe('requireAdmin guard on /api/admin/coupons/* (AC9)', () => {
  it('rejects an unauthenticated generate with 403', async () => {
    const res = await request(app)
      .post('/api/admin/coupons/generate')
      .send({ offerId: '00000000-0000-0000-0000-000000000000', quantity: 1 })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a customer-role session with 403', async () => {
    const res = await request(app)
      .get('/api/admin/coupons?offerId=00000000-0000-0000-0000-000000000000')
      .set('Cookie', customerCookies.join('; '));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a staff-role session on generate with 403', async () => {
    const res = await request(app)
      .post('/api/admin/coupons/generate')
      .set('Cookie', staffCookies.join('; '))
      .send({ offerId: '00000000-0000-0000-0000-000000000000', quantity: 1 })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});
