import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin Offer CRUD surface (ADM-008 Phase 3) — run
 * against a real local Postgres, mirroring `admin-branches.integration.test.ts`.
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers (validate-contract Test Gates, all Fully-Automated):
 *   AC2 — POST create WITH and WITHOUT a promotionId link → 201 + real row;
 *         POST with a non-existent promotionId → 404 (FK validated before write).
 *   AC9 — no-auth (403) + wrong-role (403) on the /api/admin/offers/* router.
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
let users: SchemaModule['users'];
let offers: SchemaModule['offers'];
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

let adminCookies: string[];
let staffCookies: string[];
let customerCookies: string[];

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

function offerPayload(overrides: Record<string, unknown> = {}) {
  const suffix = unique();
  return {
    title: `Offer ${suffix}`,
    description: `Save big ${suffix}`,
    offerType: 'fixed_discount',
    discountValueCents: 500,
    minimumOrderAmountCents: 2000,
    startAt: '2026-01-01T00:00:00.000Z',
    endAt: '2026-12-31T23:59:59.000Z',
    ...overrides,
  };
}

function createOffer(cookies: string[], overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/admin/offers')
    .set('Cookie', cookies.join('; '))
    .send(offerPayload(overrides))
    .set('Content-Type', 'application/json');
}

/** Create a Promotion via the real API, returning its id (for the link case). */
async function createPromotionId(): Promise<string> {
  const suffix = unique();
  const res = await request(app)
    .post('/api/admin/promotions')
    .set('Cookie', adminCookies.join('; '))
    .send({
      name: `Promo ${suffix}`,
      startAt: '2026-01-01T00:00:00.000Z',
      endAt: '2026-12-31T23:59:59.000Z',
    })
    .set('Content-Type', 'application/json');
  expect(res.status).toBe(201);
  return res.body.promotion.id as string;
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  ({ users, offers } = await import('../../../db/schema/index'));
  ({ app } = await import('../../../index'));

  adminCookies = (await makeUser('admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  customerCookies = (await makeUser('customer')).cookies;
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('POST /api/admin/offers (AC2)', () => {
  it('creates an offer WITHOUT a promotion link and persists cents at the boundary', async () => {
    const payload = offerPayload();
    const res = await request(app)
      .post('/api/admin/offers')
      .set('Cookie', adminCookies.join('; '))
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.offer).toMatchObject({
      title: payload.title,
      offerType: 'fixed_discount',
      discountValueCents: 500,
      minimumOrderAmountCents: 2000,
      promotionId: null,
    });

    const [row] = await db.select().from(offers).where(eq(offers.id, res.body.offer.id));
    expect(row).toBeDefined();
    expect(row!.title).toBe(payload.title);
    expect(row!.deal_type).toBe('fixed_discount');
    expect(Number(row!.discount_value)).toBe(5); // 500 cents → "5.00"
    expect(Number(row!.minimum_order_amount)).toBe(20); // 2000 cents → "20.00"
    expect(row!.promotion_id).toBeNull();
  });

  it('creates an offer WITH a valid promotion link', async () => {
    const promotionId = await createPromotionId();
    const res = await createOffer(adminCookies, { promotionId });
    expect(res.status).toBe(201);
    expect(res.body.offer.promotionId).toBe(promotionId);

    const [row] = await db.select().from(offers).where(eq(offers.id, res.body.offer.id));
    expect(row!.promotion_id).toBe(promotionId);
  });

  it('404s a create referencing a non-existent promotion (FK validated before write)', async () => {
    const before = await db.select().from(offers);
    const res = await createOffer(adminCookies, {
      promotionId: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Promotion not found' });

    // No offer row was written for the rejected request.
    const after = await db.select().from(offers);
    expect(after.length).toBe(before.length);
  });

  it('rejects an invalid payload with 400', async () => {
    const res = await request(app)
      .post('/api/admin/offers')
      .set('Cookie', adminCookies.join('; '))
      .send({ title: 'missing type and amounts' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('accepts every value of the reused 6-value offerType enum', async () => {
    const types = [
      'percentage_discount',
      'fixed_discount',
      'buy_one_take_one',
      'free_item',
      'free_upgrade',
      'bundle',
    ];
    for (const offerType of types) {
      const res = await createOffer(adminCookies, { offerType });
      expect(res.status).toBe(201);
      expect(res.body.offer.offerType).toBe(offerType);
    }
  });
});

describe('GET /api/admin/offers + /:id + ?promotionId= (AC2)', () => {
  it('lists offers, fetches one by id, and filters by promotionId', async () => {
    const promotionId = await createPromotionId();
    const linked = await createOffer(adminCookies, { promotionId });
    const unlinked = await createOffer(adminCookies);
    const linkedId = linked.body.offer.id as string;
    const unlinkedId = unlinked.body.offer.id as string;

    const detail = await request(app)
      .get(`/api/admin/offers/${linkedId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(detail.status).toBe(200);
    expect(detail.body.offer.id).toBe(linkedId);

    const filtered = await request(app)
      .get(`/api/admin/offers?promotionId=${promotionId}`)
      .set('Cookie', adminCookies.join('; '));
    expect(filtered.status).toBe(200);
    const filteredIds = (filtered.body.offers as { id: string }[]).map((o) => o.id);
    expect(filteredIds).toContain(linkedId);
    expect(filteredIds).not.toContain(unlinkedId);
  });

  it('404s an unknown / malformed offer id', async () => {
    const unknown = await request(app)
      .get('/api/admin/offers/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies.join('; '));
    expect(unknown.status).toBe(404);
    const malformed = await request(app)
      .get('/api/admin/offers/not-a-uuid')
      .set('Cookie', adminCookies.join('; '));
    expect(malformed.status).toBe(404);
  });
});

describe('PATCH /api/admin/offers/:id (AC2)', () => {
  it('updates only supplied fields and re-validates a supplied promotionId', async () => {
    const created = await createOffer(adminCookies);
    const id = created.body.offer.id as string;

    const newTitle = `Renamed ${unique()}`;
    const patch = await request(app)
      .patch(`/api/admin/offers/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ title: newTitle, discountValueCents: 750 })
      .set('Content-Type', 'application/json');
    expect(patch.status).toBe(200);
    expect(patch.body.offer.title).toBe(newTitle);
    expect(patch.body.offer.discountValueCents).toBe(750);

    const bad = await request(app)
      .patch(`/api/admin/offers/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ promotionId: '00000000-0000-0000-0000-000000000000' })
      .set('Content-Type', 'application/json');
    expect(bad.status).toBe(404);
  });

  it('toggles isActive off and back on, persisting is_active at the boundary', async () => {
    const created = await createOffer(adminCookies);
    const id = created.body.offer.id as string;
    // Offers default to active on create.
    expect(created.body.offer.isActive).toBe(true);

    const off = await request(app)
      .patch(`/api/admin/offers/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ isActive: false })
      .set('Content-Type', 'application/json');
    expect(off.status).toBe(200);
    expect(off.body.offer.isActive).toBe(false);

    const [offRow] = await db.select().from(offers).where(eq(offers.id, id));
    expect(offRow!.is_active).toBe(false);

    const on = await request(app)
      .patch(`/api/admin/offers/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ isActive: true })
      .set('Content-Type', 'application/json');
    expect(on.status).toBe(200);
    expect(on.body.offer.isActive).toBe(true);
  });
});

describe('requireAdmin guard on /api/admin/offers/* (AC9)', () => {
  it('rejects an unauthenticated request with 403', async () => {
    const res = await request(app).get('/api/admin/offers');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a customer-role session with 403', async () => {
    const res = await request(app)
      .get('/api/admin/offers')
      .set('Cookie', customerCookies.join('; '));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a staff-role session on POST with 403', async () => {
    const res = await request(app)
      .post('/api/admin/offers')
      .set('Cookie', staffCookies.join('; '))
      .send(offerPayload())
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});
