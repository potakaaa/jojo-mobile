import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetRateLimitStoreForTests } from '../../middleware/rate-limit';

/**
 * Integration tests for the ADM-011 (#141) staff-invite ACCEPT flow
 * (`/staff-invite/start` → magic-link verify → `/staff-invite/consume`). Hermetic
 * self-seeding, real local Postgres.
 *
 *   docker compose up -d   (or a native instance — see tests/all-tests.md)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers AC10 (accept applies only stored role/branch, ignores smuggled payload,
 * second accept rejected), AC11 (expired token rejected, zero mutation), AC12 (accept
 * is token-only authz; garbage token rejected), AC13 (dev-log fallback captures the
 * link and drives the flow), the re-check-current-role-at-consume race, the
 * `/consume` write-shape matching a direct two-route call, and the SUPPLEMENT-added
 * rate-limit on `/staff-invite/start`.
 *
 * NOTE: the shared in-memory rate-limit store is reset in `beforeEach` so /start
 * calls across cases cannot leak 429s into each other (Section D items 9 & 12).
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

type AuthModule = typeof import('../../lib/auth');
type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type IndexModule = typeof import('../../index');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let schema: SchemaModule;
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

let superAdminCookies: string[];
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

async function makeSuperAdmin(): Promise<string[]> {
  const email = `super_admin-${unique()}@example.com`;
  const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
  await db.update(schema.users).set({ role: 'super_admin' }).where(eq(schema.users.email, email));
  return cookies;
}

async function seedBranch(): Promise<string> {
  const suffix = unique();
  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `InviteAcceptBranch ${suffix}`,
      slug: `invite-accept-branch-${suffix}`,
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

/** super_admin creates an invite; returns the raw token captured from the log. */
async function createInvite(
  email: string,
  intendedRole: 'staff' | 'admin' | 'super_admin',
  intendedBranchId?: string,
): Promise<string> {
  const body: Record<string, unknown> = { email, intendedRole };
  if (intendedBranchId) body.intendedBranchId = intendedBranchId;
  const res = await request(app)
    .post('/api/admin/staff/invite')
    .set('Cookie', superAdminCookies.join('; '))
    .send(body)
    .set('Content-Type', 'application/json');
  if (res.status !== 201) throw new Error(`invite create failed: ${res.status}`);
  return extractInviteToken(email);
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
    .select({
      id: schema.users.id,
      role: schema.users.role,
      assignedBranchId: schema.users.assignedBranchId,
    })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return row;
}

/** POST /staff-invite/set-password with the given session cookies (ADM-012). */
function setPassword(sessionCookies: string[], newPassword: string) {
  return request(app)
    .post('/staff-invite/set-password')
    .set('Cookie', sessionCookies.join('; '))
    .send({ newPassword })
    .set('Content-Type', 'application/json');
}

/** Independent email/password sign-in — proves a credential is durable. */
function signInEmail(email: string, password: string) {
  return request(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .set('Content-Type', 'application/json');
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../lib/auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));

  superAdminCookies = await makeSuperAdmin();
  activeBranchId = await seedBranch();
});

beforeEach(() => {
  // Prevent cross-case 429 leakage from the shared per-process limiter window.
  __resetRateLimitStoreForTests();
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('staff-invite accept flow', () => {
  it('accepts a valid staff invite, applying ONLY the stored role/branch (ignores smuggled payload); second accept rejected (AC10, AC13)', async () => {
    const email = `accept-staff-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'staff', activeBranchId);
    const sessionCookies = await startAndVerify(rawToken);

    // Smuggle role/branch overrides in the consume body — they must be ignored.
    const consume = await request(app)
      .post('/staff-invite/consume')
      .set('Cookie', sessionCookies.join('; '))
      .send({
        token: rawToken,
        role: 'super_admin',
        intendedRole: 'super_admin',
        branchId: '00000000-0000-4000-8000-000000000000',
        intendedBranchId: '00000000-0000-4000-8000-000000000000',
      })
      .set('Content-Type', 'application/json');

    expect(consume.status).toBe(200);
    expect(consume.body).toMatchObject({
      role: 'staff',
      assignedBranchId: activeBranchId,
      alreadyStaffLevel: false,
    });

    const user = await readUser(email);
    expect(user).toMatchObject({ role: 'staff', assignedBranchId: activeBranchId });

    // Second accept (replay) is rejected — the invite was single-use consumed.
    const replay = await request(app)
      .post('/staff-invite/consume')
      .set('Cookie', sessionCookies.join('; '))
      .send({ token: rawToken })
      .set('Content-Type', 'application/json');
    expect(replay.status).toBe(410);
  });

  it('consume write-shape matches a direct two-route call for a staff target', async () => {
    const email = `accept-shape-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'staff', activeBranchId);
    const sessionCookies = await startAndVerify(rawToken);

    const consume = await request(app)
      .post('/staff-invite/consume')
      .set('Cookie', sessionCookies.join('; '))
      .send({ token: rawToken })
      .set('Content-Type', 'application/json');

    expect(consume.status).toBe(200);
    // Role write, then branch write — same end state as POST role + PATCH branch.
    const user = await readUser(email);
    expect(user).toMatchObject({ role: 'staff', assignedBranchId: activeBranchId });
  });

  it('rejects an expired invite token at accept with zero account mutation (AC11)', async () => {
    const email = `expired-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'admin');

    // Force the invite expired.
    await db
      .update(schema.staffInvites)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.staffInvites.email, email));

    const start = await request(app).post('/staff-invite/start').send({ token: rawToken });
    expect(start.status).toBe(410);

    // No account was ever provisioned for this email (verify never ran).
    const user = await readUser(email);
    expect(user).toBeUndefined();
  });

  it('accept is reachable with NO admin session (token-only authz); a garbage token is rejected (AC12)', async () => {
    const email = `tokenonly-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'admin');

    // No admin session anywhere in this flow — /start works on token possession alone.
    const start = await request(app).post('/staff-invite/start').send({ token: rawToken });
    expect(start.status).toBe(200);

    // A garbage / never-issued token → 404.
    const garbage = await request(app)
      .post('/staff-invite/start')
      .send({ token: 'deadbeef'.repeat(8) });
    expect(garbage.status).toBe(404);

    // Malformed body → 400.
    const empty = await request(app).post('/staff-invite/start').send({});
    expect(empty.status).toBe(400);
  });

  it('no-ops gracefully when the target is already staff-level via another path before consume (re-check-role race)', async () => {
    const email = `race-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'admin');
    const sessionCookies = await startAndVerify(rawToken);

    // Simulate another path promoting this account to `staff` in the interim.
    await db.update(schema.users).set({ role: 'staff' }).where(eq(schema.users.email, email));

    const consume = await request(app)
      .post('/staff-invite/consume')
      .set('Cookie', sessionCookies.join('; '))
      .send({ token: rawToken })
      .set('Content-Type', 'application/json');

    expect(consume.status).toBe(200);
    expect(consume.body.alreadyStaffLevel).toBe(true);
    // The invite's `admin` role was NOT applied over the existing `staff` role.
    const user = await readUser(email);
    expect(user!.role).toBe('staff');
  });

  it('requires a session for /consume (401 without one)', async () => {
    const email = `nosession-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'admin');
    await request(app).post('/staff-invite/start').send({ token: rawToken });

    const consume = await request(app)
      .post('/staff-invite/consume')
      .send({ token: rawToken })
      .set('Content-Type', 'application/json');
    expect(consume.status).toBe(401);
  });

  it('rate-limits POST /staff-invite/start at 10/min/IP; a valid request under the limit still succeeds (SUPPLEMENT)', async () => {
    __resetRateLimitStoreForTests();

    // 10 requests are allowed (garbage tokens → 404, but each still counts).
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/staff-invite/start')
        .send({ token: `ratelimit-probe-${i}` });
      expect(res.status).not.toBe(429);
    }

    // The 11th within the window is throttled.
    const throttled = await request(app)
      .post('/staff-invite/start')
      .send({ token: 'ratelimit-probe-over' });
    expect(throttled.status).toBe(429);
    expect(throttled.body).toEqual({ error: 'Too many requests' });

    // After a reset, a valid request under the limit succeeds again.
    __resetRateLimitStoreForTests();
    const email = `postlimit-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'admin');
    const ok = await request(app).post('/staff-invite/start').send({ token: rawToken });
    expect(ok.status).toBe(200);
  });
});

/**
 * ADM-011 Section H (E-H1 / E-H2) — CORS on the `/staff-invite` mount.
 *
 * The Section-H delta added `adminCors` (the SAME single-origin credentialed object
 * already on /api/admin + /api/auth) to `app.use('/staff-invite', adminCors, ...)` so
 * the apps/admin WEB accept page can call /start + /consume cross-origin. These cases
 * prove — for BOTH handlers independently — that the credentialed CORS headers are
 * emitted for the admin origin (preflight + real response) and NOT for a disallowed
 * origin, and that the pre-Section-H mobile no-Origin path is not regressed. Mirrors
 * the ADM-001 `require-admin.integration.test.ts` CORS pattern.
 *
 * cors() short-circuits OPTIONS before the router (and its rate-limiter) runs, so the
 * preflight cases do not consume the /start rate-limit budget.
 */
/**
 * ADM-012 (#142) — set-password + profile setup on the web accept flow. The
 * invitee's account lands via magic-link verify (no credential yet); `/set-password`
 * gives it a durable password, and `auth.api.updateUser` persists the required
 * profile fields — both self-scoped to the session user, never touching role/branch.
 */
describe('staff-invite set-password + profile setup (ADM-012)', () => {
  it('persists a durable credential; a fresh independent sign-in with the new password succeeds (AC1)', async () => {
    const email = `setpw-fresh-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'admin');
    const sessionCookies = await startAndVerify(rawToken);

    const sp = await setPassword(sessionCookies, 'brandnew-pw-123');
    expect(sp.status).toBe(200);
    expect(sp.body).toEqual({ ok: true });

    // Fresh sign-in with the just-set password (no reuse of the magic-link session).
    const signin = await signInEmail(email, 'brandnew-pw-123');
    expect(signin.status).toBe(200);
    expect(signin.headers['set-cookie']).toBeTruthy();
  });

  it('is session-gated (401 unauthenticated); a set-password never mutates role/branch (AC2)', async () => {
    // 401 with no session.
    const unauth = await request(app)
      .post('/staff-invite/set-password')
      .send({ newPassword: 'x'.repeat(10) })
      .set('Content-Type', 'application/json');
    expect(unauth.status).toBe(401);

    // role/branch byte-identical before/after for an accepted staff invitee.
    const email = `setpw-scope-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'staff', activeBranchId);
    const sessionCookies = await startAndVerify(rawToken);
    await request(app)
      .post('/staff-invite/consume')
      .set('Cookie', sessionCookies.join('; '))
      .send({ token: rawToken })
      .set('Content-Type', 'application/json');

    const before = await readUser(email);
    const sp = await setPassword(sessionCookies, 'scoped-pw-1234');
    expect(sp.status).toBe(200);
    const after = await readUser(email);
    expect(after).toMatchObject({ role: before!.role, assignedBranchId: before!.assignedBranchId });
    expect(after!.role).toBe('staff');
    expect(after!.assignedBranchId).toBe(activeBranchId);
  });

  it('enforces the 8–128 length bound: 7 and 129 rejected (zero mutation), 8 and 128 succeed (AC3)', async () => {
    // Rejection cases reuse one fresh session — a 400 never mutates.
    const rejectEmail = `setpw-reject-${unique()}@example.com`;
    const rejectCookies = await startAndVerify(await createInvite(rejectEmail, 'admin'));

    const tooShort = await setPassword(rejectCookies, 'a'.repeat(7));
    expect(tooShort.status).toBe(400);
    const tooLong = await setPassword(rejectCookies, 'a'.repeat(129));
    expect(tooLong.status).toBe(400);

    // Zero mutation: the rejected 7-char password never becomes a valid credential.
    const rejectedSignin = await signInEmail(rejectEmail, 'a'.repeat(7));
    expect(rejectedSignin.status).not.toBe(200);

    // 8-char succeeds (fresh account).
    const minEmail = `setpw-min-${unique()}@example.com`;
    const minCookies = await startAndVerify(await createInvite(minEmail, 'admin'));
    const min = await setPassword(minCookies, 'a'.repeat(8));
    expect(min.status).toBe(200);

    // 128-char succeeds (fresh account).
    const maxEmail = `setpw-max-${unique()}@example.com`;
    const maxCookies = await startAndVerify(await createInvite(maxEmail, 'admin'));
    const max = await setPassword(maxCookies, 'a'.repeat(128));
    expect(max.status).toBe(200);
  });

  it('handles an existing-password account gracefully — no 500, original password still works (AC4)', async () => {
    const email = `setpw-existing-${unique()}@example.com`;
    const original = 'original-pw-123';
    // signUpAndGetCookie creates an account that ALREADY has a credential.
    const cookies = await signUpAndGetCookie(email, original);

    const sp = await setPassword(cookies, 'attempted-new-pw-456');
    expect(sp.status).toBe(200); // PASSWORD_ALREADY_SET treated as a no-op success
    expect(sp.body).toEqual({ ok: true });

    // The original password is untouched and still signs in.
    const signinOrig = await signInEmail(email, original);
    expect(signinOrig.status).toBe(200);

    // The attempted new password was never applied.
    const signinNew = await signInEmail(email, 'attempted-new-pw-456');
    expect(signinNew.status).not.toBe(200);
  });

  it('persists profile fields (name/birthday/address/onboardedAt) and reads them back (AC5)', async () => {
    const email = `profile-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'admin');
    const sessionCookies = await startAndVerify(rawToken);
    const authedHeaders = new Headers({ cookie: sessionCookies.join('; ') });

    const birthday = '1992-03-10';
    const address = '9 Fry Street';
    const onboardedAt = new Date();
    await auth.api.updateUser({
      body: { name: 'Freshly Onboarded', birthday, address, onboardedAt },
      headers: authedHeaders,
    });

    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    expect(row!.name).toBe('Freshly Onboarded');
    expect(String(row!.birthday)).toContain(birthday);
    expect(row!.address).toBe(address);
    expect(row!.onboardedAt).not.toBeNull();
  });

  it('a profile update never mutates role/branch, for staff/admin/super_admin (AC7)', async () => {
    const cases: Array<{ role: 'staff' | 'admin' | 'super_admin'; branch?: string }> = [
      { role: 'staff', branch: activeBranchId },
      { role: 'admin' },
      { role: 'super_admin' },
    ];

    for (const c of cases) {
      const email = `profile-scope-${c.role}-${unique()}@example.com`;
      const rawToken = await createInvite(email, c.role, c.branch);
      const sessionCookies = await startAndVerify(rawToken);
      await request(app)
        .post('/staff-invite/consume')
        .set('Cookie', sessionCookies.join('; '))
        .send({ token: rawToken })
        .set('Content-Type', 'application/json');

      const before = await readUser(email);
      await auth.api.updateUser({
        body: {
          name: 'Renamed Person',
          birthday: '1990-01-01',
          address: '1 Spud Lane',
          onboardedAt: new Date(),
        },
        headers: new Headers({ cookie: sessionCookies.join('; ') }),
      });
      const after = await readUser(email);

      expect(after!.role, `role unchanged for ${c.role}`).toBe(before!.role);
      expect(after!.assignedBranchId, `branch unchanged for ${c.role}`).toBe(
        before!.assignedBranchId,
      );
    }
  });
});

describe('staff-invite CORS for the admin web origin (Section H)', () => {
  const ADMIN_ORIGIN = process.env.ADMIN_WEB_ORIGIN ?? 'http://localhost:3100';
  const DISALLOWED_ORIGIN = 'http://evil.example.com';

  it('answers a credentialed preflight for /staff-invite/start (admin origin, not a wildcard)', async () => {
    const res = await request(app)
      .options('/staff-invite/start')
      .set('Origin', ADMIN_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('adds the credentialed CORS headers to a real POST /staff-invite/start for the admin origin', async () => {
    const email = `cors-start-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'admin');

    const res = await request(app)
      .post('/staff-invite/start')
      .set('Origin', ADMIN_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ token: rawToken });

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does NOT echo a disallowed origin on the /staff-invite/start preflight', async () => {
    const res = await request(app)
      .options('/staff-invite/start')
      .set('Origin', DISALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).not.toBe(DISALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a credentialed preflight for /staff-invite/consume (admin origin, not a wildcard)', async () => {
    const res = await request(app)
      .options('/staff-invite/consume')
      .set('Origin', ADMIN_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('adds the credentialed CORS headers to a real POST /staff-invite/consume for the admin origin', async () => {
    // No session → 401, but cors runs on the real response regardless of the handler's
    // status, so the ACAO/ACAC headers must still be present.
    const res = await request(app)
      .post('/staff-invite/consume')
      .set('Origin', ADMIN_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ token: 'no-session-probe' });

    expect(res.status).toBe(401);
    expect(res.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does NOT echo a disallowed origin on the /staff-invite/consume preflight', async () => {
    const res = await request(app)
      .options('/staff-invite/consume')
      .set('Origin', DISALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).not.toBe(DISALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('still serves POST /staff-invite/start with NO Origin header and adds no ACAO (mobile-path regression guard, E-H2)', async () => {
    const email = `cors-noorigin-${unique()}@example.com`;
    const rawToken = await createInvite(email, 'admin');

    // The Expo app sends no Origin header — cors() must pass it through untouched.
    const res = await request(app)
      .post('/staff-invite/start')
      .set('Content-Type', 'application/json')
      .send({ token: rawToken });

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
