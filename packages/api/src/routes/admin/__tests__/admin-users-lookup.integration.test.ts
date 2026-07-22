import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the ADM-011 (#141) `GET /api/admin/users/lookup?email=`
 * route — the exact-match user lookup that powers the "+ Add staff" promote path.
 * Run against a real local Postgres, mirroring the hermetic self-seeding pattern of
 * `require-admin.integration.test.ts`.
 *
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers AC1 (found/not-found, no 500) + the lookup half of AC5's 401/403 matrix.
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
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

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

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  ({ users } = await import('../../../db/schema/index'));
  ({ app } = await import('../../../index'));
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('GET /api/admin/users/lookup', () => {
  it('returns the exact-match user (id/name/email/role) for a super_admin caller (AC1 found)', async () => {
    const superAdmin = await makeUser('super_admin');
    const target = await makeUser('customer');

    const res = await request(app)
      .get('/api/admin/users/lookup')
      .query({ email: target.email })
      .set('Cookie', superAdmin.cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: target.id,
      email: target.email,
      role: 'customer',
    });
    expect(typeof res.body.user.name).toBe('string');
  });

  it('returns { user: null } (200, NOT 404) for an email with no account (AC1 not-found)', async () => {
    const superAdmin = await makeUser('super_admin');

    const res = await request(app)
      .get('/api/admin/users/lookup')
      .query({ email: `nobody-${unique()}@example.com` })
      .set('Cookie', superAdmin.cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });

  it('returns 400 for a malformed email query', async () => {
    const superAdmin = await makeUser('super_admin');

    const res = await request(app)
      .get('/api/admin/users/lookup')
      .query({ email: 'not-an-email' })
      .set('Cookie', superAdmin.cookies.join('; '));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid email' });
  });

  it('returns 403 for a plain admin caller (super_admin-only) (AC5)', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('customer');

    const res = await request(app)
      .get('/api/admin/users/lookup')
      .query({ email: target.email })
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 for an unauthenticated caller (requireAdmin, AC5)', async () => {
    const res = await request(app)
      .get('/api/admin/users/lookup')
      .query({ email: `x-${unique()}@example.com` });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});
