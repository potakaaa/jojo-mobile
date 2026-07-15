import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin category CRUD surface (ADM-003, Phase 3) — run
 * against a real local Postgres, mirroring `admin-branches.integration.test.ts`'s
 * hermetic self-seeding (signUpAndGetCookie + inline env + VITEST guard).
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d           # (or the machine's native Postgres, see all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers validate-contract Test Gates (all Fully-Automated):
 *   AC2 — category create/read/update/soft-delete; duplicate slug → 409.
 *   AC6 — a staff-role session on any /api/admin/categories/* route → 403.
 *   AC7 — soft-delete: deactivate sets is_active=false; the row still exists.
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
let users: SchemaModule['users'];
let categories: SchemaModule['categories'];
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

let adminCookies: string[];
let staffCookies: string[];

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

function categoryPayload(overrides: Record<string, unknown> = {}) {
  const suffix = unique();
  return { name: `Category ${suffix}`, slug: `category-${suffix}`, ...overrides };
}

function createCategory(cookies: string[], overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/admin/categories')
    .set('Cookie', cookies.join('; '))
    .send(categoryPayload(overrides))
    .set('Content-Type', 'application/json');
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../auth'));
  ({ db } = await import('../../db/client'));
  ({ users, categories } = await import('../../db/schema/index'));
  ({ app } = await import('../../index'));

  adminCookies = (await makeUser('admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('category CRUD (AC2)', () => {
  it('creates a category and persists exact field values in Postgres', async () => {
    const payload = categoryPayload({ sortOrder: 7 });
    const res = await request(app)
      .post('/api/admin/categories')
      .set('Cookie', adminCookies.join('; '))
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.category).toMatchObject({
      name: payload.name,
      slug: payload.slug,
      sortOrder: 7,
      isActive: true,
    });

    const [row] = await db.select().from(categories).where(eq(categories.id, res.body.category.id));
    expect(row).toBeDefined();
    expect(row!.name).toBe(payload.name);
    expect(row!.slug).toBe(payload.slug);
    expect(row!.sort_order).toBe(7);
    expect(row!.is_active).toBe(true);
  });

  it('lists categories including inactive ones for an admin session', async () => {
    const active = await createCategory(adminCookies);
    const activeId = active.body.category.id as string;
    const toDeactivate = await createCategory(adminCookies);
    const inactiveId = toDeactivate.body.category.id as string;
    await request(app)
      .patch(`/api/admin/categories/${inactiveId}/deactivate`)
      .set('Cookie', adminCookies.join('; '));

    const res = await request(app)
      .get('/api/admin/categories')
      .set('Cookie', adminCookies.join('; '));

    expect(res.status).toBe(200);
    const ids = (res.body.categories as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(activeId);
    expect(ids).toContain(inactiveId);
  });

  it('updates only supplied fields, leaving others unchanged', async () => {
    const created = await createCategory(adminCookies);
    const id = created.body.category.id as string;
    const originalSlug = created.body.category.slug as string;

    const newName = `Renamed ${unique()}`;
    const patch = await request(app)
      .patch(`/api/admin/categories/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ name: newName })
      .set('Content-Type', 'application/json');

    expect(patch.status).toBe(200);
    expect(patch.body.category.name).toBe(newName);
    expect(patch.body.category.slug).toBe(originalSlug);
  });

  it('rejects an invalid payload with 400', async () => {
    const res = await request(app)
      .post('/api/admin/categories')
      .set('Cookie', adminCookies.join('; '))
      .send({ name: '' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate slug with 409 and creates no duplicate row', async () => {
    const slug = `dup-${unique()}`;
    const first = await createCategory(adminCookies, { slug });
    expect(first.status).toBe(201);

    const second = await createCategory(adminCookies, { slug });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'Slug already in use' });

    const rows = await db.select().from(categories).where(eq(categories.slug, slug));
    expect(rows).toHaveLength(1);
  });

  it('409s a PATCH that collides an existing slug', async () => {
    const slug = `patch-dup-${unique()}`;
    await createCategory(adminCookies, { slug });
    const other = await createCategory(adminCookies);
    const otherId = other.body.category.id as string;

    const res = await request(app)
      .patch(`/api/admin/categories/${otherId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ slug })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(409);
  });

  it('404s a PATCH to an unknown category id and a malformed id', async () => {
    const unknown = await request(app)
      .patch('/api/admin/categories/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies.join('; '))
      .send({ name: 'nope' })
      .set('Content-Type', 'application/json');
    expect(unknown.status).toBe(404);

    const malformed = await request(app)
      .get('/api/admin/categories/not-a-uuid')
      .set('Cookie', adminCookies.join('; '));
    expect(malformed.status).toBe(404);
  });
});

describe('category soft-delete (AC7)', () => {
  it('soft-deactivates (is_active=false) without deleting the row', async () => {
    const created = await createCategory(adminCookies);
    const id = created.body.category.id as string;

    const res = await request(app)
      .patch(`/api/admin/categories/${id}/deactivate`)
      .set('Cookie', adminCookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body.category.isActive).toBe(false);

    const [row] = await db.select().from(categories).where(eq(categories.id, id));
    expect(row).toBeDefined();
    expect(row!.is_active).toBe(false);
  });

  it('reactivates via generic PATCH { isActive: true }', async () => {
    const created = await createCategory(adminCookies);
    const id = created.body.category.id as string;
    await request(app)
      .patch(`/api/admin/categories/${id}/deactivate`)
      .set('Cookie', adminCookies.join('; '));

    const res = await request(app)
      .patch(`/api/admin/categories/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ isActive: true })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.category.isActive).toBe(true);
  });
});

describe('requireAdmin guard on /api/admin/categories/* (AC6)', () => {
  it('rejects an unauthenticated request with 403', async () => {
    const res = await request(app).get('/api/admin/categories');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a staff-role session on GET with 403 (proves requireAdmin, not requireStaff)', async () => {
    const res = await request(app)
      .get('/api/admin/categories')
      .set('Cookie', staffCookies.join('; '));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a staff-role session on POST with 403', async () => {
    const res = await request(app)
      .post('/api/admin/categories')
      .set('Cookie', staffCookies.join('; '))
      .send(categoryPayload())
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
  });
});
