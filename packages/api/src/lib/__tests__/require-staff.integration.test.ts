import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the staff authz surface (STAFF-001) — run against a real
 * local Postgres, mirroring `auth.integration.test.ts`.
 *
 * Requires a running Postgres reachable via DATABASE_URL with migrations applied:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers: AC2 (customer → 403), AC1 server-side (staff → passes), AC3 (branch
 * scope pure function + route), AC4 (same better-auth session, no fork).
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
type RequireStaffModule = typeof import('../require-staff');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let users: SchemaModule['users'];
let branches: SchemaModule['branches'];
let app: IndexModule['app'];
let requireStaff: RequireStaffModule['requireStaff'];
let assertBranchScope: RequireStaffModule['assertBranchScope'];

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

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../auth'));
  ({ db } = await import('../../db/client'));
  ({ users, branches } = await import('../../db/schema/index'));
  ({ app } = await import('../../index'));
  ({ requireStaff, assertBranchScope } = await import('../require-staff'));
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('assertBranchScope (pure)', () => {
  // E4
  it('returns true for same branch uuid (AC3 positive)', () => {
    expect(assertBranchScope('branch-uuid-A', 'branch-uuid-A')).toBe(true);
  });

  // E5
  it('returns false for different branch uuid (AC3 negative)', () => {
    expect(assertBranchScope('branch-uuid-A', 'branch-uuid-B')).toBe(false);
  });

  it('returns false for unassigned staff (assignedBranchId null)', () => {
    expect(assertBranchScope(null, 'branch-uuid-A')).toBe(false);
  });

  it('returns true when no branch requested (own-branch data)', () => {
    expect(assertBranchScope('branch-uuid-A', null)).toBe(true);
  });
});

describe('requireStaff middleware', () => {
  // E2
  it('rejects a customer with 403 (AC2)', async () => {
    const email = `cust-${unique()}@example.com`;
    const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');

    let nextCalled = false;
    const req = { headers: { cookie: cookies.join('; ') } } as never;
    const statusFn = vi.fn().mockReturnThis();
    const jsonFn = vi.fn().mockReturnThis();
    const res = { status: statusFn, json: jsonFn } as never;

    await requireStaff(auth)(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  // E3
  it('passes a staff user and populates req.staffSession (AC1 server-side)', async () => {
    const email = `staff-${unique()}@example.com`;
    const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
    await db.update(users).set({ role: 'staff' }).where(eq(users.email, email));

    let nextCalled = false;
    const req = { headers: { cookie: cookies.join('; ') } } as {
      headers: Record<string, string>;
      staffSession?: unknown;
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as never;

    await requireStaff(auth)(req as never, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.staffSession).toMatchObject({ role: 'staff' });
  });
});

describe('GET /api/staff/me', () => {
  // E6
  it('returns 403 for a customer (AC2 route-level)', async () => {
    const email = `cust2-${unique()}@example.com`;
    const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');

    const res = await request(app).get('/api/staff/me').set('Cookie', cookies.join('; '));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  // E7
  it('returns 200 with own branch for a staff user (AC3 positive, AC4)', async () => {
    const email = `staff2-${unique()}@example.com`;
    const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');

    // Insert a dedicated branch fixture so the test is hermetic — it must NOT
    // depend on db:seed having run (CI applies migrations only, never seeds).
    const [branch] = await db
      .insert(branches)
      .values({
        name: 'Test Branch',
        slug: `test-branch-${unique()}`,
        address: '123 Test St',
        latitude: '10.300000',
        longitude: '123.900000',
        phone: '+639000000000',
        opening_hours: '9am-9pm',
      })
      .returning({ id: branches.id, name: branches.name, slug: branches.slug });
    if (!branch) {
      throw new Error('Test setup: failed to insert branch fixture');
    }

    await db
      .update(users)
      .set({ role: 'staff', assignedBranchId: branch.id })
      .where(eq(users.email, email));

    const res = await request(app).get('/api/staff/me').set('Cookie', cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      role: 'staff',
      assignedBranch: { id: branch.id, name: branch.name, slug: branch.slug },
    });
  });
});
