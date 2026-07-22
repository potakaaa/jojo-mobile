import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the ADM-013 (#149) pending-invite LIST route
 * `GET /api/admin/staff/invites`. Hermetic self-seeding, real local Postgres.
 *
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers AC1 (pending-only list shape + state filtering, never tokenHash) and
 * AC2 (super_admin-only: 403 non-super_admin, 401/403 unauthenticated).
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

let superAdminCookies: string[];
let adminCookies: string[];
let activeBranchId: string;
let activeBranchName: string;

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

async function seedBranch(): Promise<{ id: string; name: string }> {
  const suffix = unique();
  const name = `ListBranch ${suffix}`;
  const [branch] = await db
    .insert(schema.branches)
    .values({
      name,
      slug: `list-branch-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000099',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 15,
      is_active: true,
    })
    .returning();
  return { id: branch!.id, name };
}

/** Create an invite via the real route; returns the created row's id + email. */
async function createInvite(
  intendedRole: 'staff' | 'admin' | 'super_admin',
  intendedBranchId?: string,
): Promise<{ id: string; email: string }> {
  const email = `invitee-${unique()}@example.com`;
  const body: Record<string, unknown> = { email, intendedRole };
  if (intendedBranchId) body.intendedBranchId = intendedBranchId;
  const res = await request(app)
    .post('/api/admin/staff/invite')
    .set('Cookie', superAdminCookies.join('; '))
    .send(body)
    .set('Content-Type', 'application/json');
  if (res.status !== 201) throw new Error(`invite create failed: ${res.status}`);
  const [row] = await db
    .select({ id: schema.staffInvites.id })
    .from(schema.staffInvites)
    .where(eq(schema.staffInvites.email, email));
  return { id: row!.id, email };
}

function listInvites(cookies: string[]): Promise<request.Response> {
  return request(app).get('/api/admin/staff/invites').set('Cookie', cookies.join('; '));
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  schema = await import('../../../db/schema/index');
  ({ app } = await import('../../../index'));

  superAdminCookies = (await makeUser('super_admin')).cookies;
  adminCookies = (await makeUser('admin')).cookies;
  const branch = await seedBranch();
  activeBranchId = branch.id;
  activeBranchName = branch.name;
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('GET /api/admin/staff/invites — pending-only list (AC1)', () => {
  it('returns exactly the pending invite (excludes consumed/revoked/expired) with the full shape and no tokenHash', async () => {
    // One PENDING staff invite (with a branch, so intendedBranchName joins).
    const pending = await createInvite('staff', activeBranchId);
    // One CONSUMED invite.
    const consumed = await createInvite('admin');
    await db
      .update(schema.staffInvites)
      .set({ consumedAt: new Date() })
      .where(eq(schema.staffInvites.id, consumed.id));
    // One REVOKED invite.
    const revoked = await createInvite('admin');
    await db
      .update(schema.staffInvites)
      .set({ revokedAt: new Date() })
      .where(eq(schema.staffInvites.id, revoked.id));
    // One EXPIRED invite.
    const expired = await createInvite('admin');
    await db
      .update(schema.staffInvites)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.staffInvites.id, expired.id));

    const res = await listInvites(superAdminCookies);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.invites)).toBe(true);

    const ids = (res.body.invites as { id: string }[]).map((i) => i.id);
    expect(ids).toContain(pending.id);
    expect(ids).not.toContain(consumed.id);
    expect(ids).not.toContain(revoked.id);
    expect(ids).not.toContain(expired.id);

    const row = (res.body.invites as Record<string, unknown>[]).find((i) => i.id === pending.id)!;
    expect(row).toMatchObject({
      id: pending.id,
      email: pending.email,
      intendedRole: 'staff',
      intendedBranchId: activeBranchId,
      intendedBranchName: activeBranchName,
    });
    expect(typeof row.invitedByName).toBe('string');
    expect(typeof row.invitedByEmail).toBe('string');
    expect(typeof row.createdAt).toBe('string');
    expect(typeof row.expiresAt).toBe('string');

    // The raw token / hash must NEVER appear anywhere in the response body. Check
    // the sensitive FIELD names precisely — a plain 'token' substring would false-
    // positive on legitimate data (e.g. a seeded `tokenonly-…@example.com` email).
    expect(JSON.stringify(res.body)).not.toContain('tokenHash');
    expect(JSON.stringify(res.body)).not.toContain('token_hash');
  });
});

describe('GET /api/admin/staff/invites — super_admin-only (AC2)', () => {
  it('rejects a plain admin with 403', async () => {
    const res = await listInvites(adminCookies);
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request (401/403)', async () => {
    const res = await request(app).get('/api/admin/staff/invites');
    expect([401, 403]).toContain(res.status);
  });
});
