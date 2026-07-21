import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the ADM-011 (#141) add-staff PROMOTE path (composing the two
 * existing, byte-unmodified routes) and the `POST /api/admin/staff/invite` create
 * route. Hermetic self-seeding, real local Postgres.
 *
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers AC2 (promote end state), AC3 (admin promote omits branch), AC4 (already-staff
 * lookup no-op/distinguishable), AC6 (self-escalation), AC8 (invite persistence), AC9
 * (existing-account reject), the invite half of AC5's 401/403 matrix, the branch-only-
 * for-staff rule, and the VALIDATE-added supersede-then-old-token-rejected case.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
// Force the send-or-log fallback (AC13 premise: no real email provider) so the raw
// invite token is captured from the log. Empty (not unset) so dotenv/config in
// index.ts cannot repopulate it from .env when the app module is dynamically imported.
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

let superAdminCookies: string[];
let adminCookies: string[];
let activeBranchId: string;

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
  return { email, cookies, id: row.id };
}

async function seedBranch(): Promise<string> {
  const suffix = unique();
  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `InviteBranch ${suffix}`,
      slug: `invite-branch-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000099',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 15,
      is_active: true,
    })
    .returning();
  return branch!.id;
}

/** Extract the raw invite token from the send-or-log fallback line (RESEND unset). */
function extractInviteToken(email: string): string {
  const calls = logSpy.mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    const msg = String(calls[i]?.[0] ?? '');
    if (msg.includes('[admin] staff invite for') && msg.includes(email)) {
      const m = msg.match(/token=([^&\s]+)/);
      if (m) return decodeURIComponent(m[1]!);
    }
  }
  throw new Error(`invite token for ${email} not found in logs`);
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  schema = await import('../../../db/schema/index');
  ({ app } = await import('../../../index'));

  superAdminCookies = (await makeUser('super_admin')).cookies;
  adminCookies = (await makeUser('admin')).cookies;
  activeBranchId = await seedBranch();
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('Add-staff PROMOTE path (composes the two existing routes)', () => {
  it('promotes a looked-up customer to staff + assigns a branch, final DB state correct (AC2)', async () => {
    const target = await makeUser('customer');

    // 1. lookup finds the customer.
    const lookup = await request(app)
      .get('/api/admin/users/lookup')
      .query({ email: target.email })
      .set('Cookie', superAdminCookies.join('; '));
    expect(lookup.status).toBe(200);
    expect(lookup.body.user).toMatchObject({ id: target.id, role: 'customer' });

    // 2. role route (unmodified) → staff.
    const roleRes = await request(app)
      .post(`/api/admin/users/${target.id}/role`)
      .set('Cookie', superAdminCookies.join('; '))
      .send({ role: 'staff' })
      .set('Content-Type', 'application/json');
    expect(roleRes.status).toBe(200);

    // 3. branch route (unmodified) → assign active branch.
    const branchRes = await request(app)
      .patch(`/api/admin/staff/${target.id}/branch`)
      .set('Cookie', superAdminCookies.join('; '))
      .send({ branchId: activeBranchId })
      .set('Content-Type', 'application/json');
    expect(branchRes.status).toBe(200);

    const [row] = await db
      .select({ role: schema.users.role, assignedBranchId: schema.users.assignedBranchId })
      .from(schema.users)
      .where(eq(schema.users.id, target.id));
    expect(row).toMatchObject({ role: 'staff', assignedBranchId: activeBranchId });
  });

  it('promotes to admin without any branch write (AC3)', async () => {
    const target = await makeUser('customer');

    const roleRes = await request(app)
      .post(`/api/admin/users/${target.id}/role`)
      .set('Cookie', superAdminCookies.join('; '))
      .send({ role: 'admin' })
      .set('Content-Type', 'application/json');
    expect(roleRes.status).toBe(200);

    const [row] = await db
      .select({ role: schema.users.role, assignedBranchId: schema.users.assignedBranchId })
      .from(schema.users)
      .where(eq(schema.users.id, target.id));
    expect(row).toMatchObject({ role: 'admin', assignedBranchId: null });
  });

  it('lookup of an already-staff-level user returns a distinguishable role, no mutation (AC4)', async () => {
    const staff = await makeUser('staff');

    const lookup = await request(app)
      .get('/api/admin/users/lookup')
      .query({ email: staff.email })
      .set('Cookie', superAdminCookies.join('; '));
    expect(lookup.status).toBe(200);
    expect(lookup.body.user.role).toBe('staff');

    // lookup is read-only: role unchanged.
    const [row] = await db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, staff.id));
    expect(row!.role).toBe('staff');
  });

  it('rejects self-escalation on the promote path, role unchanged (AC6)', async () => {
    const superAdmin = await makeUser('super_admin');

    const res = await request(app)
      .post(`/api/admin/users/${superAdmin.id}/role`)
      .set('Cookie', superAdmin.cookies.join('; '))
      .send({ role: 'customer' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Cannot modify own role' });

    const [row] = await db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, superAdmin.id));
    expect(row!.role).toBe('super_admin');
  });
});

describe('POST /api/admin/staff/invite (create)', () => {
  it('creates a staff invite with a hashed token, future expiry, unconsumed (AC8)', async () => {
    const email = `invitee-${unique()}@example.com`;

    const res = await request(app)
      .post('/api/admin/staff/invite')
      .set('Cookie', superAdminCookies.join('; '))
      .send({ email, intendedRole: 'staff', intendedBranchId: activeBranchId })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.invite).toMatchObject({
      email,
      intendedRole: 'staff',
      intendedBranchId: activeBranchId,
    });
    expect(typeof res.body.invite.expiresAt).toBe('string');
    // The raw token / hash must NEVER appear in the response body.
    expect(JSON.stringify(res.body)).not.toContain('token');

    const [row] = await db
      .select()
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.email, email));
    expect(row).toBeDefined();
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(row!.consumedAt).toBeNull();
    expect(row!.intendedRole).toBe('staff');
    expect(row!.intendedBranchId).toBe(activeBranchId);
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // ~7 days out (allow generous slack).
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it('creates an admin invite with no branch (intendedBranchId null) (AC8/AC3)', async () => {
    const email = `admin-invitee-${unique()}@example.com`;

    const res = await request(app)
      .post('/api/admin/staff/invite')
      .set('Cookie', superAdminCookies.join('; '))
      .send({ email, intendedRole: 'admin' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.invite).toMatchObject({ email, intendedRole: 'admin', intendedBranchId: null });

    const [row] = await db
      .select()
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.email, email));
    expect(row!.intendedBranchId).toBeNull();
  });

  it('rejects an invite for an email that already has an account (409), no row written (AC9)', async () => {
    const existing = await makeUser('customer');

    const res = await request(app)
      .post('/api/admin/staff/invite')
      .set('Cookie', superAdminCookies.join('; '))
      .send({ email: existing.email, intendedRole: 'admin' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(409);

    const rows = await db
      .select()
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.email, existing.email));
    expect(rows).toHaveLength(0);
  });

  it('rejects a staff invite with no branch, and an admin invite WITH a branch (400)', async () => {
    const noBranch = await request(app)
      .post('/api/admin/staff/invite')
      .set('Cookie', superAdminCookies.join('; '))
      .send({ email: `sb-${unique()}@example.com`, intendedRole: 'staff' })
      .set('Content-Type', 'application/json');
    expect(noBranch.status).toBe(400);

    const adminWithBranch = await request(app)
      .post('/api/admin/staff/invite')
      .set('Cookie', superAdminCookies.join('; '))
      .send({
        email: `ab-${unique()}@example.com`,
        intendedRole: 'admin',
        intendedBranchId: activeBranchId,
      })
      .set('Content-Type', 'application/json');
    expect(adminWithBranch.status).toBe(400);
  });

  it('is super_admin-only: 403 for a plain admin, 403 for unauthenticated (AC5)', async () => {
    const asAdmin = await request(app)
      .post('/api/admin/staff/invite')
      .set('Cookie', adminCookies.join('; '))
      .send({ email: `x-${unique()}@example.com`, intendedRole: 'admin' })
      .set('Content-Type', 'application/json');
    expect(asAdmin.status).toBe(403);

    const unauth = await request(app)
      .post('/api/admin/staff/invite')
      .send({ email: `y-${unique()}@example.com`, intendedRole: 'admin' })
      .set('Content-Type', 'application/json');
    expect(unauth.status).toBe(403);
  });

  it('supersedes a prior live invite for the same email; the old token is then rejected at /start (VALIDATE-added)', async () => {
    const email = `supersede-${unique()}@example.com`;

    // Invite A.
    await request(app)
      .post('/api/admin/staff/invite')
      .set('Cookie', superAdminCookies.join('; '))
      .send({ email, intendedRole: 'admin' })
      .set('Content-Type', 'application/json');
    const tokenA = extractInviteToken(email);

    // Invite B for the SAME email — supersedes A inside the create transaction.
    await request(app)
      .post('/api/admin/staff/invite')
      .set('Cookie', superAdminCookies.join('; '))
      .send({ email, intendedRole: 'admin' })
      .set('Content-Type', 'application/json');
    const tokenB = extractInviteToken(email);
    expect(tokenB).not.toBe(tokenA);

    // A is superseded (consumed), B is live.
    const rows = await db
      .select({ consumedAt: schema.staffInvites.consumedAt })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.email, email));
    expect(rows).toHaveLength(2);
    const consumed = rows.filter((r) => r.consumedAt !== null);
    const live = rows.filter((r) => r.consumedAt === null);
    expect(consumed).toHaveLength(1);
    expect(live).toHaveLength(1);

    // A's original token is now rejected the same way a replay is (410).
    const startA = await request(app).post('/staff-invite/start').send({ token: tokenA });
    expect(startA.status).toBe(410);

    // B's token is still valid.
    const startB = await request(app).post('/staff-invite/start').send({ token: tokenB });
    expect(startB.status).toBe(200);
    expect(typeof startB.body.magicLinkToken).toBe('string');
  });
});
