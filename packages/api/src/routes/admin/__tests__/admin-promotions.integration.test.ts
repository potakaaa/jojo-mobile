import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin Promotion CRUD surface (ADM-008 Phase 3) — run
 * against a real local Postgres, mirroring `admin-branches.integration.test.ts`'s
 * hermetic self-seeding (signUpAndGetCookie + inline env + VITEST guard).
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d           # (or the machine's native Postgres, see all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers (validate-contract Test Gates, all Fully-Automated):
 *   AC1 — POST valid → 201 + real Postgres row; GET /:id + GET / list return it.
 *   AC9 — no-auth (403) + wrong-role (403) on the /api/admin/promotions/* router.
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
let promotions: SchemaModule['promotions'];
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

function promotionPayload(overrides: Record<string, unknown> = {}) {
  const suffix = unique();
  return {
    name: `Promo ${suffix}`,
    description: `Seasonal campaign ${suffix}`,
    startAt: '2026-01-01T00:00:00.000Z',
    endAt: '2026-12-31T23:59:59.000Z',
    ...overrides,
  };
}

function createPromotion(cookies: string[], overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/admin/promotions')
    .set('Cookie', cookies.join('; '))
    .send(promotionPayload(overrides))
    .set('Content-Type', 'application/json');
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  ({ users, promotions } = await import('../../../db/schema/index'));
  ({ app } = await import('../../../index'));

  adminCookies = (await makeUser('admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  customerCookies = (await makeUser('customer')).cookies;
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('POST /api/admin/promotions (AC1)', () => {
  it('creates a promotion and persists exact field values in Postgres', async () => {
    const payload = promotionPayload();
    const res = await request(app)
      .post('/api/admin/promotions')
      .set('Cookie', adminCookies.join('; '))
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.promotion).toMatchObject({
      name: payload.name,
      description: payload.description,
      startAt: payload.startAt,
      endAt: payload.endAt,
    });

    const [row] = await db
      .select()
      .from(promotions)
      .where(eq(promotions.id, res.body.promotion.id));
    expect(row).toBeDefined();
    expect(row!.name).toBe(payload.name);
    expect(row!.description).toBe(payload.description);
    expect(row!.start_at.toISOString()).toBe(payload.startAt);
    expect(row!.end_at.toISOString()).toBe(payload.endAt);
  });

  it('creates a promotion without an optional description', async () => {
    const res = await createPromotion(adminCookies, { description: undefined });
    expect(res.status).toBe(201);
    expect(res.body.promotion.description).toBeNull();
  });

  it('rejects an invalid payload with 400', async () => {
    const res = await request(app)
      .post('/api/admin/promotions')
      .set('Cookie', adminCookies.join('; '))
      .send({ description: 'no name or dates' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('rejects an inverted window (endAt <= startAt) with 400', async () => {
    const res = await createPromotion(adminCookies, {
      startAt: '2026-12-31T00:00:00.000Z',
      endAt: '2026-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/promotions + /:id (AC1)', () => {
  it('lists created promotions and fetches one by id', async () => {
    const created = await createPromotion(adminCookies);
    const id = created.body.promotion.id as string;

    const detail = await request(app)
      .get(`/api/admin/promotions/${id}`)
      .set('Cookie', adminCookies.join('; '));
    expect(detail.status).toBe(200);
    expect(detail.body.promotion.id).toBe(id);

    const list = await request(app)
      .get('/api/admin/promotions')
      .set('Cookie', adminCookies.join('; '));
    expect(list.status).toBe(200);
    const ids = (list.body.promotions as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(id);
  });

  it('404s an unknown promotion id', async () => {
    const res = await request(app)
      .get('/api/admin/promotions/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(404);
  });

  it('404s a malformed (non-uuid) promotion id', async () => {
    const res = await request(app)
      .get('/api/admin/promotions/not-a-uuid')
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/promotions/:id (AC1)', () => {
  it('updates only supplied fields, leaving others unchanged', async () => {
    const created = await createPromotion(adminCookies);
    const id = created.body.promotion.id as string;
    const originalDescription = created.body.promotion.description as string;

    const newName = `Renamed ${unique()}`;
    const patch = await request(app)
      .patch(`/api/admin/promotions/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ name: newName })
      .set('Content-Type', 'application/json');

    expect(patch.status).toBe(200);
    expect(patch.body.promotion.name).toBe(newName);
    expect(patch.body.promotion.description).toBe(originalDescription);
  });

  it('404s a PATCH to an unknown promotion id', async () => {
    const res = await request(app)
      .patch('/api/admin/promotions/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies.join('; '))
      .send({ name: 'nope' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });

  it('rejects a PATCH that inverts the window against the stored dates with 400', async () => {
    const created = await createPromotion(adminCookies);
    const id = created.body.promotion.id as string;
    // Move startAt past the stored endAt (2026-12-31) with a single-date patch.
    const patch = await request(app)
      .patch(`/api/admin/promotions/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ startAt: '2027-06-01T00:00:00.000Z' })
      .set('Content-Type', 'application/json');
    expect(patch.status).toBe(400);
  });
});

describe('requireAdmin guard on /api/admin/promotions/* (AC9)', () => {
  it('rejects an unauthenticated request with 403', async () => {
    const res = await request(app).get('/api/admin/promotions');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a customer-role session with 403', async () => {
    const res = await request(app)
      .get('/api/admin/promotions')
      .set('Cookie', customerCookies.join('; '));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a staff-role session on POST with 403 (proves requireAdmin, not requireStaff)', async () => {
    const res = await request(app)
      .post('/api/admin/promotions')
      .set('Cookie', staffCookies.join('; '))
      .send(promotionPayload())
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});
