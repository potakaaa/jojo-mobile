import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin branch CRUD surface (ADM-002, Phase 2) — run
 * against a real local Postgres, mirroring `require-admin.integration.test.ts`'s
 * hermetic self-seeding (signUpAndGetCookie + inline env + VITEST guard).
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d           # (or the machine's native Postgres, see all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers (validate-contract Test Gates AC1-AC6, all Fully-Automated):
 *   AC1 — GET /api/admin/branches returns ALL branches (active + inactive) for an
 *         admin session; 403 for unauthenticated/customer.
 *   AC2 — POST valid payload → 201 + a real Postgres row matching every field.
 *   AC3 — POST duplicate slug → 409, no duplicate row created.
 *   AC4 — PATCH updates only supplied fields; unsupplied fields survive.
 *   AC5 — PATCH /:id/deactivate sets is_active=false; row still exists (soft-delete).
 *   AC6 — a staff-role session on any /api/admin/branches/* route → 403 (proves
 *         requireAdmin, not requireStaff, guards this router).
 */

// Server-only env — set BEFORE anything auth-related is imported.
process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
// Guard the app.listen in index.ts so importing `app` never binds a port.
process.env.VITEST = 'true';

type AuthModule = typeof import('../auth');
type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type IndexModule = typeof import('../../index');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let users: SchemaModule['users'];
let branches: SchemaModule['branches'];
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

// Cached role fixtures (created once in beforeAll).
let adminCookies: string[];
let staffCookies: string[];
let customerCookies: string[];

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

/** Create a signed-in user, force its role, and return { cookies, id }. */
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

/** A full valid create payload with unique name/slug; overridable per case. */
function branchPayload(overrides: Record<string, unknown> = {}) {
  const suffix = unique();
  return {
    name: `Branch ${suffix}`,
    slug: `branch-${suffix}`,
    address: '123 Test St',
    latitude: 14.5,
    longitude: 120.9,
    phone: '+639170000000',
    openingHours: '08:00-20:00',
    ...overrides,
  };
}

/** POST a branch as admin, returning the supertest response. */
function createBranch(cookies: string[], overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/admin/branches')
    .set('Cookie', cookies.join('; '))
    .send(branchPayload(overrides))
    .set('Content-Type', 'application/json');
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../auth'));
  ({ db } = await import('../../db/client'));
  ({ users, branches } = await import('../../db/schema/index'));
  ({ app } = await import('../../index'));

  adminCookies = (await makeUser('admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  customerCookies = (await makeUser('customer')).cookies;
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('GET /api/admin/branches (AC1)', () => {
  it('returns ALL branches (active + inactive) for an admin session', async () => {
    // Seed one active and one deactivated branch through the real API.
    const active = await createBranch(adminCookies);
    expect(active.status).toBe(201);
    const activeId = active.body.branch.id as string;

    const toDeactivate = await createBranch(adminCookies);
    const inactiveId = toDeactivate.body.branch.id as string;
    await request(app)
      .patch(`/api/admin/branches/${inactiveId}/deactivate`)
      .set('Cookie', adminCookies.join('; '));

    const res = await request(app)
      .get('/api/admin/branches')
      .set('Cookie', adminCookies.join('; '));

    expect(res.status).toBe(200);
    const ids = (res.body.branches as { id: string; isActive: boolean }[]).map((b) => b.id);
    expect(ids).toContain(activeId);
    expect(ids).toContain(inactiveId); // inactive rows ARE visible to admin
    const inactiveRow = (res.body.branches as { id: string; isActive: boolean }[]).find(
      (b) => b.id === inactiveId,
    );
    expect(inactiveRow!.isActive).toBe(false);
  });

  it('rejects an unauthenticated request with 403', async () => {
    const res = await request(app).get('/api/admin/branches');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a customer-role session with 403', async () => {
    const res = await request(app)
      .get('/api/admin/branches')
      .set('Cookie', customerCookies.join('; '));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});

describe('POST /api/admin/branches (AC2, AC3)', () => {
  it('creates a branch and persists exact field values in Postgres (AC2)', async () => {
    const payload = branchPayload({ isAcceptingPickup: false, estimatedPrepMinutes: 25 });
    const res = await request(app)
      .post('/api/admin/branches')
      .set('Cookie', adminCookies.join('; '))
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.branch).toMatchObject({
      name: payload.name,
      slug: payload.slug,
      address: payload.address,
      latitude: 14.5,
      longitude: 120.9,
      phone: payload.phone,
      openingHours: payload.openingHours,
      isAcceptingPickup: false,
      estimatedPrepMinutes: 25,
      isActive: true,
    });

    // Follow-up SELECT proves the row exists with the exact stored values.
    const [row] = await db.select().from(branches).where(eq(branches.id, res.body.branch.id));
    expect(row).toBeDefined();
    expect(row!.name).toBe(payload.name);
    expect(row!.slug).toBe(payload.slug);
    expect(row!.address).toBe(payload.address);
    expect(row!.phone).toBe(payload.phone);
    expect(row!.opening_hours).toBe(payload.openingHours);
    expect(row!.is_accepting_pickup).toBe(false);
    expect(row!.estimated_prep_minutes).toBe(25);
    expect(row!.is_active).toBe(true);
    expect(Number(row!.latitude)).toBe(14.5);
    expect(Number(row!.longitude)).toBe(120.9);
  });

  it('rejects an invalid payload with 400', async () => {
    const res = await request(app)
      .post('/api/admin/branches')
      .set('Cookie', adminCookies.join('; '))
      .send({ name: 'Missing everything else' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate slug with 409 and creates no duplicate row (AC3)', async () => {
    const slug = `dup-${unique()}`;
    const first = await createBranch(adminCookies, { slug });
    expect(first.status).toBe(201);

    const second = await createBranch(adminCookies, { slug });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'Slug already in use' });

    const rows = await db.select().from(branches).where(eq(branches.slug, slug));
    expect(rows).toHaveLength(1);
  });
});

describe('PATCH /api/admin/branches/:id (AC4)', () => {
  it('updates only supplied fields, leaving others unchanged', async () => {
    const created = await createBranch(adminCookies);
    const id = created.body.branch.id as string;
    const originalAddress = created.body.branch.address as string;

    const newName = `Renamed ${unique()}`;
    const patch = await request(app)
      .patch(`/api/admin/branches/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ name: newName })
      .set('Content-Type', 'application/json');

    expect(patch.status).toBe(200);
    expect(patch.body.branch.name).toBe(newName);
    expect(patch.body.branch.address).toBe(originalAddress); // untouched

    const get = await request(app)
      .get(`/api/admin/branches/${id}`)
      .set('Cookie', adminCookies.join('; '));
    expect(get.status).toBe(200);
    expect(get.body.branch.name).toBe(newName);
    expect(get.body.branch.address).toBe(originalAddress);
  });

  it('404s a PATCH to an unknown branch id', async () => {
    const res = await request(app)
      .patch('/api/admin/branches/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies.join('; '))
      .send({ name: 'nope' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });

  it('409s a PATCH that collides an existing slug', async () => {
    const slug = `patch-dup-${unique()}`;
    const first = await createBranch(adminCookies, { slug });
    expect(first.status).toBe(201);
    const second = await createBranch(adminCookies);
    const secondId = second.body.branch.id as string;

    const res = await request(app)
      .patch(`/api/admin/branches/${secondId}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ slug })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Slug already in use' });
  });
});

describe('GET /api/admin/branches/:id detail', () => {
  it('404s an unknown branch id', async () => {
    const res = await request(app)
      .get('/api/admin/branches/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(404);
  });

  it('404s a malformed (non-uuid) branch id', async () => {
    const res = await request(app)
      .get('/api/admin/branches/not-a-uuid')
      .set('Cookie', adminCookies.join('; '));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/branches/:id/deactivate (AC5)', () => {
  it('soft-deactivates (is_active=false) without deleting the row', async () => {
    const created = await createBranch(adminCookies);
    const id = created.body.branch.id as string;

    const res = await request(app)
      .patch(`/api/admin/branches/${id}/deactivate`)
      .set('Cookie', adminCookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body.branch.isActive).toBe(false);

    // The row SURVIVES (soft-delete Safety guarantee).
    const [row] = await db.select().from(branches).where(eq(branches.id, id));
    expect(row).toBeDefined();
    expect(row!.is_active).toBe(false);
  });

  it('reactivates via generic PATCH { isActive: true }', async () => {
    const created = await createBranch(adminCookies);
    const id = created.body.branch.id as string;
    await request(app)
      .patch(`/api/admin/branches/${id}/deactivate`)
      .set('Cookie', adminCookies.join('; '));

    const res = await request(app)
      .patch(`/api/admin/branches/${id}`)
      .set('Cookie', adminCookies.join('; '))
      .send({ isActive: true })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.branch.isActive).toBe(true);
  });
});

describe('requireAdmin guard on /api/admin/branches/* (AC6)', () => {
  it('rejects a staff-role session on GET with 403 (proves requireAdmin, not requireStaff)', async () => {
    const res = await request(app)
      .get('/api/admin/branches')
      .set('Cookie', staffCookies.join('; '));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects a staff-role session on POST with 403', async () => {
    const res = await request(app)
      .post('/api/admin/branches')
      .set('Cookie', staffCookies.join('; '))
      .send(branchPayload())
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});
