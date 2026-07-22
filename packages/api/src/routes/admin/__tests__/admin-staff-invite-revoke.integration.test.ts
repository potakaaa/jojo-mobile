import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the ADM-013 (#149) REVOKE route
 * `POST /api/admin/staff/invites/:id/revoke`. Hermetic self-seeding, real Postgres.
 *
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers AC3 (revoke sets revoked_at, drops off the list, double-revoke 404,
 * consumed/expired/nonexistent 404) and AC8 (super_admin-only 401/403 matrix).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.RESEND_API_KEY = '';
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
const RANDOM_UUID = '00000000-0000-4000-8000-000000000000';

let superAdminCookies: string[];
let adminCookies: string[];

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
): Promise<{ email: string; cookies: string[] }> {
  const email = `${roleValue}-${unique()}@example.com`;
  const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
  if (roleValue !== 'customer') {
    await db.update(schema.users).set({ role: roleValue }).where(eq(schema.users.email, email));
  }
  return { email, cookies };
}

/** Create an invite via the real route; returns the created row's id. */
async function createInvite(intendedRole: 'staff' | 'admin' | 'super_admin'): Promise<string> {
  const email = `invitee-${unique()}@example.com`;
  const res = await request(app)
    .post('/api/admin/staff/invite')
    .set('Cookie', superAdminCookies.join('; '))
    .send({ email, intendedRole })
    .set('Content-Type', 'application/json');
  if (res.status !== 201) throw new Error(`invite create failed: ${res.status}`);
  const [row] = await db
    .select({ id: schema.staffInvites.id })
    .from(schema.staffInvites)
    .where(eq(schema.staffInvites.email, email));
  return row!.id;
}

function revoke(cookies: string[], id: string): Promise<request.Response> {
  return request(app)
    .post(`/api/admin/staff/invites/${id}/revoke`)
    .set('Cookie', cookies.join('; '))
    .set('Content-Type', 'application/json');
}

function listInvites(): Promise<request.Response> {
  return request(app).get('/api/admin/staff/invites').set('Cookie', superAdminCookies.join('; '));
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  schema = await import('../../../db/schema/index');
  ({ app } = await import('../../../index'));

  superAdminCookies = (await makeUser('super_admin')).cookies;
  adminCookies = (await makeUser('admin')).cookies;
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('POST /api/admin/staff/invites/:id/revoke (AC3)', () => {
  it('revokes a pending invite, sets revoked_at, and drops it off the list', async () => {
    const id = await createInvite('admin');

    const res = await revoke(superAdminCookies, id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id });

    // revoked_at is now set.
    const [row] = await db
      .select({ revokedAt: schema.staffInvites.revokedAt })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, id));
    expect(row!.revokedAt).not.toBeNull();

    // It no longer appears in the pending list.
    const list = await listInvites();
    const ids = (list.body.invites as { id: string }[]).map((i) => i.id);
    expect(ids).not.toContain(id);
  });

  it('404s a second revoke on the same invite (already revoked)', async () => {
    const id = await createInvite('admin');
    const first = await revoke(superAdminCookies, id);
    expect(first.status).toBe(200);

    const second = await revoke(superAdminCookies, id);
    expect(second.status).toBe(404);
  });

  it('404s revoking an already-consumed invite (no revoke over a consumed row)', async () => {
    const id = await createInvite('admin');
    await db
      .update(schema.staffInvites)
      .set({ consumedAt: new Date() })
      .where(eq(schema.staffInvites.id, id));

    const res = await revoke(superAdminCookies, id);
    expect(res.status).toBe(404);

    // The consumed row was not also marked revoked.
    const [row] = await db
      .select({ revokedAt: schema.staffInvites.revokedAt })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, id));
    expect(row!.revokedAt).toBeNull();
  });

  it('404s revoking an expired invite', async () => {
    const id = await createInvite('admin');
    await db
      .update(schema.staffInvites)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.staffInvites.id, id));

    const res = await revoke(superAdminCookies, id);
    expect(res.status).toBe(404);
  });

  it('404s revoking a non-existent invite id', async () => {
    const res = await revoke(superAdminCookies, RANDOM_UUID);
    expect(res.status).toBe(404);
  });

  it('404s a malformed (non-uuid) :id without hitting Postgres', async () => {
    const res = await revoke(superAdminCookies, 'not-a-uuid');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/staff/invites/:id/revoke — super_admin-only (AC8)', () => {
  it('rejects a plain admin with 403, zero mutation', async () => {
    const id = await createInvite('admin');
    const res = await revoke(adminCookies, id);
    expect(res.status).toBe(403);

    const [row] = await db
      .select({ revokedAt: schema.staffInvites.revokedAt })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, id));
    expect(row!.revokedAt).toBeNull();
  });

  it('rejects an unauthenticated request (401/403)', async () => {
    const id = await createInvite('admin');
    const res = await request(app)
      .post(`/api/admin/staff/invites/${id}/revoke`)
      .set('Content-Type', 'application/json');
    expect([401, 403]).toContain(res.status);
  });
});
