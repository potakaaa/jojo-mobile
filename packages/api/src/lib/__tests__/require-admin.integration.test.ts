import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin authz surface (ADM-001, Phase 1) — run against
 * a real local Postgres, mirroring `require-staff.integration.test.ts`'s hermetic
 * self-seeding (signUpAndGetCookie + inline env + VITEST guard).
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d           # (or any local Postgres)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers:
 *   AC1 — requireAdmin role matrix (unauth/customer/staff → 403; admin/super_admin
 *         → 200 + req.adminSession populated), via the GET /api/admin/me route + a
 *         direct middleware call.
 *   AC2 — self-escalation on POST /api/admin/users/:ownId/role rejected (400), DB
 *         row unchanged. Under the LOCKED guard order (5.1 super_admin check FIRST),
 *         the self-escalation 400 is only reachable by a super_admin — a plain
 *         admin self-call is rejected 403 by the earlier super_admin gate.
 *   AC3 — a plain admin session is forbidden (403) from the role-management route;
 *         target row unchanged.
 *   AC4 — a super_admin promotes/demotes another user (200, DB row updated).
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
type RequireAdminModule = typeof import('../require-admin');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let users: SchemaModule['users'];
let app: IndexModule['app'];
let requireAdmin: RequireAdminModule['requireAdmin'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

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

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../auth'));
  ({ db } = await import('../../db/client'));
  ({ users } = await import('../../db/schema/index'));
  ({ app } = await import('../../index'));
  ({ requireAdmin } = await import('../require-admin'));
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('requireAdmin role matrix (AC1)', () => {
  it('should return 200 with req.adminSession for admin and super_admin sessions, 403 for unauthenticated/customer/staff', async () => {
    // Unauthenticated → 403 (via GET /api/admin/me route).
    const unauth = await request(app).get('/api/admin/me');
    expect(unauth.status).toBe(403);
    expect(unauth.body).toEqual({ error: 'Forbidden' });

    // Customer → 403.
    const customer = await makeUser('customer');
    const custRes = await request(app).get('/api/admin/me').set('Cookie', customer.cookies.join('; '));
    expect(custRes.status).toBe(403);
    expect(custRes.body).toEqual({ error: 'Forbidden' });

    // Staff → 403 (staff is NOT admitted by requireAdmin).
    const staff = await makeUser('staff');
    const staffRes = await request(app).get('/api/admin/me').set('Cookie', staff.cookies.join('; '));
    expect(staffRes.status).toBe(403);
    expect(staffRes.body).toEqual({ error: 'Forbidden' });

    // Admin → 200 + { role: 'admin' }.
    const admin = await makeUser('admin');
    const adminRes = await request(app).get('/api/admin/me').set('Cookie', admin.cookies.join('; '));
    expect(adminRes.status).toBe(200);
    expect(adminRes.body).toEqual({ role: 'admin' });

    // super_admin → 200 + { role: 'super_admin' }.
    const superAdmin = await makeUser('super_admin');
    const superRes = await request(app)
      .get('/api/admin/me')
      .set('Cookie', superAdmin.cookies.join('; '));
    expect(superRes.status).toBe(200);
    expect(superRes.body).toEqual({ role: 'super_admin' });

    // Direct middleware call proves req.adminSession is populated for an admin.
    const req = { headers: { cookie: admin.cookies.join('; ') } } as {
      headers: Record<string, string>;
      adminSession?: unknown;
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as never;
    let nextCalled = false;
    await requireAdmin(auth)(req as never, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(req.adminSession).toMatchObject({ role: 'admin', userId: admin.id });
  });
});

describe('cross-origin cookie session + CORS (AC6, Hybrid)', () => {
  // IMPLEMENTATION NOTE: this is the supertest-with-manual-Origin-header variant
  // (no headless-browser runner exists in this repo — project-wide gap). It
  // proves (a) the sign-in Set-Cookie round-trips and is recognized on a
  // follow-up request carrying the admin web Origin, and (b) the server's
  // credentialed CORS response echoes the exact admin origin (never a wildcard)
  // and allows credentials. It does NOT prove real browser SameSite=Lax
  // enforcement — that needs a browser automation runner (AC8 Agent-Probe /
  // future E2E harness).
  const ADMIN_ORIGIN = 'http://localhost:3100';

  it('answers a credentialed CORS preflight for the admin origin (echoes origin, allows credentials, not a wildcard)', async () => {
    const res = await request(app)
      .options('/api/admin/me')
      .set('Origin', ADMIN_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    // cors() short-circuits OPTIONS with 204 before requireAdmin runs.
    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('round-trips the session cookie on a cross-origin GET /api/admin/me and returns the admin CORS headers', async () => {
    const admin = await makeUser('admin');

    const res = await request(app)
      .get('/api/admin/me')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: 'admin' });
    expect(res.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('auth-route CORS for the admin browser origin (post-AC8 regression)', () => {
  // REGRESSION GUARD: Phase 1 originally mounted CORS only on /api/admin, but the
  // admin browser client ALSO calls /api/auth/* cross-origin (get-session,
  // sign-in/email, sign-out). Those responses carried NO Access-Control-Allow-Origin
  // header, so the browser blocked login entirely. AC6 only covered /api/admin CORS
  // and never /api/auth — this closes that gap. The fix mounts the shared adminCors
  // middleware on /api/auth BEFORE the better-auth handler.
  const ADMIN_ORIGIN = 'http://localhost:3100';

  it('answers a credentialed CORS preflight on /api/auth/sign-in/email for the admin origin (not a 404)', async () => {
    const res = await request(app)
      .options('/api/auth/sign-in/email')
      .set('Origin', ADMIN_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    // Before the fix this fell through to the better-auth handler and 404'd with
    // no CORS headers. cors() now short-circuits OPTIONS with 204 + the headers.
    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('adds the ACAO header to a real POST /api/auth/sign-in/email response for the admin origin', async () => {
    const email = `auth-cors-${unique()}@example.com`;
    await auth.api.signUpEmail({ body: { email, password: 'sup3r-secret-pw', name: 'Test User' } });

    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', ADMIN_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ email, password: 'sup3r-secret-pw' });

    // The actual (non-preflight) sign-in must echo the admin origin so the browser
    // does not block the Set-Cookie response.
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('still serves /api/auth/sign-in/email for a request WITHOUT an Origin header (mobile-path guard)', async () => {
    const email = `auth-noorigin-${unique()}@example.com`;
    await auth.api.signUpEmail({ body: { email, password: 'sup3r-secret-pw', name: 'Test User' } });

    // The Expo app sends no Origin header — cors() must pass it through untouched
    // (no ACAO added, never blocked).
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Content-Type', 'application/json')
      .send({ email, password: 'sup3r-secret-pw' });

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('POST /api/admin/users/:id/role', () => {
  it('should reject self-escalation with 400 "Cannot modify own role" and leave the DB row unchanged (AC2)', async () => {
    // super_admin calling with its OWN id passes 5.1 (super_admin) and hits the
    // self-escalation guard (5.2) → 400. Role must stay super_admin.
    const superAdmin = await makeUser('super_admin');
    const res = await request(app)
      .post(`/api/admin/users/${superAdmin.id}/role`)
      .set('Cookie', superAdmin.cookies.join('; '))
      .send({ role: 'customer' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Cannot modify own role' });

    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, superAdmin.id));
    expect(row!.role).toBe('super_admin');
  });

  it('should reject a plain admin session calling the role-management route with 403, target row unchanged (AC3)', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('customer');

    const res = await request(app)
      .post(`/api/admin/users/${target.id}/role`)
      .set('Cookie', admin.cookies.join('; '))
      .send({ role: 'staff' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });

    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, target.id));
    expect(row!.role).toBe('customer');
  });

  it('should let a super_admin promote/demote another user and persist the change (AC4)', async () => {
    const superAdmin = await makeUser('super_admin');
    const target = await makeUser('customer');

    const res = await request(app)
      .post(`/api/admin/users/${target.id}/role`)
      .set('Cookie', superAdmin.cookies.join('; '))
      .send({ role: 'admin' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.resource).toMatchObject({ id: target.id, email: target.email, role: 'admin' });

    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, target.id));
    expect(row!.role).toBe('admin');
  });
});
