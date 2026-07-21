import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the better-auth wiring — one per auth method — run
 * against a real local Postgres (the same DB the `db:migrate` flow uses).
 *
 * Requires a running Postgres reachable via DATABASE_URL (default:
 * postgres://jojo:jojo@localhost:5432/jojopotato) with migrations applied:
 *   docker compose up -d   # (or any local Postgres)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * These tests exercise the server auth surface directly via `auth.api`; the
 * mobile client hook is a documented known-gap (no RN test runner yet).
 */

// Server-only env — set BEFORE auth is imported so the instance picks it up.
// Dummy Google creds let us assert OAuth redirect-URL construction (config-level
// wiring) without a live Google round-trip (a documented known-gap).
process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';

type AuthModule = typeof import('../auth');
type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let users: SchemaModule['users'];

// Capture server-side logs so we can read the stubbed OTP code and the
// (dev-fallback) magic-link URL that would otherwise be emailed via Resend.
const logs: string[] = [];
let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  ({ auth } = await import('../auth'));
  ({ db } = await import('../../db/client'));
  ({ users } = await import('../../db/schema/index'));
});

afterAll(() => {
  logSpy?.mockRestore();
});

describe('email/password', () => {
  it('signs up a new user defaulting role=customer, email_verified=false, then signs in', async () => {
    const email = `ep-${unique()}@example.com`;
    const password = 'sup3r-secret-pw';

    const signUp = await auth.api.signUpEmail({
      body: { email, password, name: 'Email Person' },
    });
    expect(signUp.user.email).toBe(email);

    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row).toBeDefined();
    expect(row!.role).toBe('customer');
    expect(row!.emailVerified).toBe(false);

    const signIn = await auth.api.signInEmail({ body: { email, password } });
    expect(signIn.user.email).toBe(email);
    expect(signIn.token).toBeTruthy();
  });

  it('never lets a client self-assign a privileged role (additionalFields input:false)', async () => {
    const email = `role-${unique()}@example.com`;
    // better-auth rejects any attempt to set the input:false `role` field.
    await expect(
      auth.api.signUpEmail({
        body: { email, password: 'sup3r-secret-pw', name: 'Sneaky', role: 'admin' } as never,
      }),
    ).rejects.toThrow(/role is not allowed to be set/i);

    // And no elevated user leaked into the DB.
    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row).toBeUndefined();
  });
});

describe('phone OTP', () => {
  it('sends a (stubbed/logged) OTP and verifies it, provisioning a session', async () => {
    const phoneNumber = `+15550${Math.floor(100000 + Math.random() * 899999)}`;
    logs.length = 0;

    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber } });
    const logged = logs.find((l) => l.includes(`phone OTP for ${phoneNumber}`));
    expect(logged, 'sendOTP stub should log the code').toBeTruthy();
    const code = logged!.split(':').pop()!.trim();
    expect(code).toMatch(/^\d{4,8}$/);

    const verified = await auth.api.verifyPhoneNumber({ body: { phoneNumber, code } });
    expect(verified).toBeTruthy();

    const [row] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
    expect(row).toBeDefined();
    expect(row!.phoneNumberVerified).toBe(true);
    expect(row!.role).toBe('customer');
  });
});

describe('magic link', () => {
  it('issues a verification token and authenticates when it is verified', async () => {
    const email = `magic-${unique()}@example.com`;
    logs.length = 0;

    await auth.api.signInMagicLink({
      body: { email, callbackURL: 'jojopotato://' },
      headers: new Headers(),
    });
    const logged = logs.find((l) => l.includes(`magic link for ${email}`));
    expect(logged, 'magic-link fallback should log the URL').toBeTruthy();
    const token = new URL(logged!.split(' ').pop()!).searchParams.get('token');
    expect(token, 'magic-link URL should carry a token').toBeTruthy();

    // Verifying the token establishes a session (needs a Headers sink for the
    // Set-Cookie the server writes).
    const result = await auth.api.magicLinkVerify({
      query: { token: token! },
      headers: new Headers(),
    });
    expect(result).toBeTruthy();

    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row).toBeDefined();
    expect(row!.role).toBe('customer');
  });
});

describe('google oauth (config-level wiring)', () => {
  it('constructs a Google authorization redirect (no live round-trip)', async () => {
    const res = await auth.api.signInSocial({
      body: { provider: 'google', callbackURL: 'jojopotato://' },
    });
    expect(res.url).toBeTruthy();
    expect(res.url!).toContain('accounts.google.com');
    expect(res.url!).toContain('client_id=test-google-client-id');
  });
});

/**
 * Reconstruct a `Cookie` request header from the `Set-Cookie`(s) a better-auth
 * response wrote, so a follow-up server API call is authenticated as that user.
 * Takes each cookie's `name=value` (drops attributes) and joins them — exactly
 * what a browser sends back.
 */
function cookieFromHeaders(headers: Headers): string {
  const all =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie') ?? ''];
  return all
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

describe('profile fields (updateUser self-write, additionalFields input:true)', () => {
  // B0: proves the high-risk auth API-contract change — a signed-in user may
  // write their OWN birthday/address/onboardedAt and read them back, but a
  // `role` write is still ignored (elevation guard). Also documents the
  // read-back shape (Date vs ISO string) that `use-auth.ts` maps to string|null.
  it('lets a signed-in user write birthday/address/onboardedAt and read them back, but ignores a role write', async () => {
    const email = `profile-${unique()}@example.com`;
    const password = 'sup3r-secret-pw';

    // Sign up to get an authenticated session cookie.
    const { headers: signUpHeaders } = await auth.api.signUpEmail({
      body: { email, password, name: 'Profile Person' },
      returnHeaders: true,
    });
    const cookie = cookieFromHeaders(signUpHeaders);
    expect(cookie, 'signUpEmail should set a session cookie').toBeTruthy();
    const authedHeaders = new Headers({ cookie });

    const birthday = '1990-05-15';
    const address = '123 Spud Lane';
    const onboardedAt = new Date();

    // Self-write the three input:true profile fields.
    await auth.api.updateUser({
      body: { birthday, address, onboardedAt },
      headers: authedHeaders,
    });

    // Read back on the session — additionalFields ride the session user payload.
    const session = await auth.api.getSession({ headers: authedHeaders });
    expect(session, 'session should resolve for the authed caller').toBeTruthy();
    const sessionUser = session!.user as Record<string, unknown>;
    expect(sessionUser.address).toBe(address);
    // birthday is additionalField type:'string' — read back as an ISO date string.
    expect(String(sessionUser.birthday).slice(0, 10)).toBe(birthday);
    // onboardedAt is additionalField type:'date' — present and non-null after write.
    expect(sessionUser.onboardedAt).not.toBeNull();
    expect(sessionUser.onboardedAt).toBeDefined();

    // Persistence proof direct from Postgres (drizzle column read-back shape):
    // `birthday` (date column) → 'YYYY-MM-DD' string; `onboarded_at` (timestamp) → Date.
    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row).toBeDefined();
    expect(row!.address).toBe(address);
    expect(String(row!.birthday)).toContain(birthday);
    expect(row!.onboardedAt).not.toBeNull();
    expect(row!.onboardedAt).toBeInstanceOf(Date);

    // Elevation guard: attempting to set `role` (input:false) must NOT persist —
    // better-auth either throws or strips the field; either way the role is
    // unchanged. This mirrors the signup role-rejection test's intent.
    let roleWriteThrew = false;
    try {
      await auth.api.updateUser({
        body: { role: 'admin' } as never,
        headers: authedHeaders,
      });
    } catch {
      roleWriteThrew = true;
    }

    const [afterRoleWrite] = await db.select().from(users).where(eq(users.email, email));
    expect(afterRoleWrite!.role, 'role must stay customer (input:false guard)').toBe('customer');
    // Document behavior: whether it threw or silently stripped, role stayed customer.
    expect(typeof roleWriteThrew).toBe('boolean');
  });
});
