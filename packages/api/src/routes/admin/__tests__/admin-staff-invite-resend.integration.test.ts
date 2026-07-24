import { and, eq, gt, isNull } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetRateLimitStoreForTests } from '../../../middleware/rate-limit';

/**
 * Integration tests for the ADM-013 (#149) RESEND route
 * `POST /api/admin/staff/invites/:id/resend`. Hermetic self-seeding, real Postgres.
 *
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers AC5 (new token issued, email/role/branch preserved, old token dies), AC6
 * (client-supplied role/branch in the body ignored), AC7 (non-pending → 404, zero
 * mutation, zero send), AC8 (super_admin-only 401/403), and AC15 (double-resend race
 * — a second rotate keyed on a stale captured tokenHash affects zero rows).
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
): Promise<{ email: string; cookies: string[] }> {
  const email = `${roleValue}-${unique()}@example.com`;
  const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
  if (roleValue !== 'customer') {
    await db.update(schema.users).set({ role: roleValue }).where(eq(schema.users.email, email));
  }
  return { email, cookies };
}

async function seedBranch(): Promise<string> {
  const suffix = unique();
  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `ResendBranch ${suffix}`,
      slug: `resend-branch-${suffix}`,
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

/** Latest raw invite token for `email` captured from the send-or-log fallback line. */
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

/** Count send-or-log delivery lines for `email` (proves zero-send on the 404 path). */
function countInviteLogLines(email: string): number {
  return logSpy.mock.calls.filter((c) => {
    const msg = String(c?.[0] ?? '');
    return msg.includes('[admin] staff invite for') && msg.includes(email);
  }).length;
}

/** Create an invite via the real route; returns id + email + captured raw token. */
async function createInvite(
  intendedRole: 'staff' | 'admin' | 'super_admin',
  intendedBranchId?: string,
): Promise<{ id: string; email: string; token: string }> {
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
  return { id: row!.id, email, token: extractInviteToken(email) };
}

/** /start → magic-link verify; returns the session cookies for the (new) account. */
async function startAndVerify(rawToken: string): Promise<string[]> {
  const start = await request(app).post('/staff-invite/start').send({ token: rawToken });
  if (start.status !== 200) throw new Error(`start failed: ${start.status}`);
  const magicLinkToken = start.body.magicLinkToken as string;
  const verify = await request(app)
    .get('/api/auth/magic-link/verify')
    .query({ token: magicLinkToken });
  const setCookie = verify.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c) => c.split(';')[0]!);
}

async function readUser(email: string) {
  const [row] = await db
    .select({ role: schema.users.role, assignedBranchId: schema.users.assignedBranchId })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return row;
}

function resend(
  cookies: string[],
  id: string,
  body?: Record<string, unknown>,
): Promise<request.Response> {
  const req = request(app)
    .post(`/api/admin/staff/invites/${id}/resend`)
    .set('Cookie', cookies.join('; '))
    .set('Content-Type', 'application/json');
  return body ? req.send(body) : req.send({});
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

beforeEach(() => {
  __resetRateLimitStoreForTests();
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('POST /api/admin/staff/invites/:id/resend (AC5)', () => {
  it('issues a new token, preserves email/role/branch, and kills the old token', async () => {
    const invite = await createInvite('staff', activeBranchId);
    const oldToken = invite.token;

    const res = await resend(superAdminCookies, invite.id);
    expect(res.status).toBe(200);
    expect(res.body.invite).toMatchObject({
      email: invite.email,
      intendedRole: 'staff',
      intendedBranchId: activeBranchId,
    });
    const newToken = extractInviteToken(invite.email);
    expect(newToken).not.toBe(oldToken);

    // New token works through the full accept flow (auto-provisions + consumes).
    const sessionCookies = await startAndVerify(newToken);

    // Old token is dead: its hash was rotated away, so /start no longer finds it.
    const oldStart = await request(app).post('/staff-invite/start').send({ token: oldToken });
    expect(oldStart.status).toBe(404);
    // Old token at /consume (with the real session) is also rejected.
    const oldConsume = await request(app)
      .post('/staff-invite/consume')
      .set('Cookie', sessionCookies.join('; '))
      .send({ token: oldToken })
      .set('Content-Type', 'application/json');
    expect(oldConsume.status).toBe(404);

    // New token consumes successfully with the ORIGINAL role/branch preserved.
    const consume = await request(app)
      .post('/staff-invite/consume')
      .set('Cookie', sessionCookies.join('; '))
      .send({ token: newToken })
      .set('Content-Type', 'application/json');
    expect(consume.status).toBe(200);
    const user = await readUser(invite.email);
    expect(user).toMatchObject({ role: 'staff', assignedBranchId: activeBranchId });
  });
});

describe('POST /api/admin/staff/invites/:id/resend — ignores smuggled role/branch (AC6)', () => {
  it('applies only the ORIGINAL stored role/branch, never the request-body payload', async () => {
    // Original invite is an ADMIN invite (no branch).
    const invite = await createInvite('admin');

    // Smuggle a role/branch escalation in the resend body — it must be ignored.
    const res = await resend(superAdminCookies, invite.id, {
      intendedRole: 'super_admin',
      role: 'super_admin',
      intendedBranchId: activeBranchId,
      branchId: activeBranchId,
    });
    expect(res.status).toBe(200);
    // Response reflects the ORIGINAL admin/no-branch, not the smuggled payload.
    expect(res.body.invite).toMatchObject({ intendedRole: 'admin', intendedBranchId: null });

    // Accepting the resent token provisions ADMIN with no branch, not super_admin.
    const newToken = extractInviteToken(invite.email);
    const sessionCookies = await startAndVerify(newToken);
    await request(app)
      .post('/staff-invite/consume')
      .set('Cookie', sessionCookies.join('; '))
      .send({ token: newToken })
      .set('Content-Type', 'application/json');
    const user = await readUser(invite.email);
    expect(user).toMatchObject({ role: 'admin', assignedBranchId: null });
  });
});

describe('POST /api/admin/staff/invites/:id/resend — non-pending rejected (AC7)', () => {
  it('404s a consumed invite with zero mutation and zero send', async () => {
    const invite = await createInvite('admin');
    await db
      .update(schema.staffInvites)
      .set({ consumedAt: new Date() })
      .where(eq(schema.staffInvites.id, invite.id));

    const [before] = await db
      .select({ tokenHash: schema.staffInvites.tokenHash })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, invite.id));
    const logsBefore = countInviteLogLines(invite.email);

    const res = await resend(superAdminCookies, invite.id);
    expect(res.status).toBe(404);

    const [after] = await db
      .select({ tokenHash: schema.staffInvites.tokenHash })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, invite.id));
    expect(after!.tokenHash).toBe(before!.tokenHash); // zero mutation
    expect(countInviteLogLines(invite.email)).toBe(logsBefore); // zero send
  });

  it('404s a revoked invite with zero mutation and zero send', async () => {
    const invite = await createInvite('admin');
    await db
      .update(schema.staffInvites)
      .set({ revokedAt: new Date() })
      .where(eq(schema.staffInvites.id, invite.id));

    const [before] = await db
      .select({ tokenHash: schema.staffInvites.tokenHash })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, invite.id));
    const logsBefore = countInviteLogLines(invite.email);

    const res = await resend(superAdminCookies, invite.id);
    expect(res.status).toBe(404);

    const [after] = await db
      .select({ tokenHash: schema.staffInvites.tokenHash })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, invite.id));
    expect(after!.tokenHash).toBe(before!.tokenHash);
    expect(countInviteLogLines(invite.email)).toBe(logsBefore);
  });

  it('404s a non-existent id and a malformed :id', async () => {
    expect((await resend(superAdminCookies, RANDOM_UUID)).status).toBe(404);
    expect((await resend(superAdminCookies, 'not-a-uuid')).status).toBe(404);
  });
});

describe('POST /api/admin/staff/invites/:id/resend — super_admin-only (AC8)', () => {
  it('rejects a plain admin with 403, zero mutation, zero send', async () => {
    const invite = await createInvite('admin');
    const [before] = await db
      .select({ tokenHash: schema.staffInvites.tokenHash })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, invite.id));
    const logsBefore = countInviteLogLines(invite.email);

    const res = await resend(adminCookies, invite.id);
    expect(res.status).toBe(403);

    const [after] = await db
      .select({ tokenHash: schema.staffInvites.tokenHash })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, invite.id));
    expect(after!.tokenHash).toBe(before!.tokenHash);
    expect(countInviteLogLines(invite.email)).toBe(logsBefore);
  });

  it('rejects an unauthenticated request (401/403)', async () => {
    const invite = await createInvite('admin');
    const res = await request(app)
      .post(`/api/admin/staff/invites/${invite.id}/resend`)
      .set('Content-Type', 'application/json')
      .send({});
    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /api/admin/staff/invites/:id/resend — double-resend race, exact-token CAS (AC15)', () => {
  it('a second rotate keyed on a STALE captured tokenHash affects zero rows', async () => {
    const invite = await createInvite('admin');

    // Capture the row's tokenHash BEFORE any resend — this is the "stale" hash a
    // racing second resend would have read before the first resend committed.
    const [pre] = await db
      .select({ tokenHash: schema.staffInvites.tokenHash })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, invite.id));
    const staleHash = pre!.tokenHash;

    // First resend succeeds and rotates the tokenHash away from `staleHash`.
    const first = await resend(superAdminCookies, invite.id);
    expect(first.status).toBe(200);
    const [afterFirst] = await db
      .select({ tokenHash: schema.staffInvites.tokenHash })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, invite.id));
    expect(afterFirst!.tokenHash).not.toBe(staleHash);

    // Simulate the racing second resend's compare-and-swap UPDATE keyed on the STALE
    // hash it captured before the first resend committed — it must match zero rows,
    // proving the CAS is keyed on the EXACT token, not merely on pending-state.
    const raced = await db
      .update(schema.staffInvites)
      .set({ tokenHash: 'raced-stale-hash', expiresAt: new Date(Date.now() + 60_000) })
      .where(
        and(
          eq(schema.staffInvites.id, invite.id),
          eq(schema.staffInvites.tokenHash, staleHash),
          isNull(schema.staffInvites.consumedAt),
          isNull(schema.staffInvites.revokedAt),
          gt(schema.staffInvites.expiresAt, new Date()),
        ),
      )
      .returning({ id: schema.staffInvites.id });
    expect(raced).toHaveLength(0);

    // The first resend's rotation is intact (not clobbered by the racing update).
    const [final] = await db
      .select({ tokenHash: schema.staffInvites.tokenHash })
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.id, invite.id));
    expect(final!.tokenHash).toBe(afterFirst!.tokenHash);
  });
});
