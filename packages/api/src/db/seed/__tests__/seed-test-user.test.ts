import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Unit coverage for the dev-only `seedTestUser()` seed step, run against a real
 * local Postgres (same DB the `db:migrate` flow uses).
 *
 * Requires a running Postgres reachable via DATABASE_URL (default:
 * postgres://jojo:jojo@localhost:5432/jojopotato) with migrations applied:
 *   docker compose up -d   # (or any local Postgres)
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * seedTestUser() is imported and exercised directly (not through runSeed()) so
 * these cases don't depend on the rest of the seed data.
 */

// Server-only env — set BEFORE auth is imported so the instance picks it up.
process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';

type SeedModule = typeof import('../seed');
type AuthModule = typeof import('../../../lib/auth');
type DbModule = typeof import('../../client');
type SchemaModule = typeof import('../../schema/index');

let seedTestUser: SeedModule['seedTestUser'];
let auth: AuthModule['auth'];
let db: DbModule['db'];
let users: SchemaModule['users'];

const TEST_EMAIL = 'jojo@test.com';
// 8-char minimum enforced by better-auth (SPEC's jojo123 is 7 chars); mirrors seed.ts TEST_USER.
const TEST_PASSWORD = 'jojo1234';

const rowsForTestUser = () =>
  db.select().from(users).where(eq(users.email, TEST_EMAIL));

const deleteTestUser = () => db.delete(users).where(eq(users.email, TEST_EMAIL));

const originalNodeEnv = process.env.NODE_ENV;

beforeAll(async () => {
  ({ seedTestUser } = await import('../seed'));
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../client'));
  ({ users } = await import('../../schema/index'));
  // Clean slate so a leftover row from a previous run can't mask a failure.
  await deleteTestUser();
});

afterEach(() => {
  // Guard against the prod-guard case's NODE_ENV leaking into other cases/suites.
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

afterAll(async () => {
  await deleteTestUser();
});

describe('seedTestUser', () => {
  it('creates a jojo@test.com users row with role customer and allows sign-in with jojo123', async () => {
    await seedTestUser();

    const [row] = await rowsForTestUser();
    expect(row).toBeDefined();
    expect(row!.email).toBe(TEST_EMAIL);
    expect(row!.role).toBe('customer');

    const signIn = await auth.api.signInEmail({
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(signIn.token).toBeTruthy();
  });

  it('leaves exactly one row and does not throw when called twice (idempotent)', async () => {
    // Ensure the row exists from the create case; a second call must be a no-op.
    await expect(seedTestUser()).resolves.toBeUndefined();

    const rows = await rowsForTestUser();
    expect(rows).toHaveLength(1);
  });

  it('throws and creates no row when NODE_ENV is production (fail-closed)', async () => {
    await deleteTestUser();
    process.env.NODE_ENV = 'production';

    await expect(seedTestUser()).rejects.toThrow(/NODE_ENV=production/i);

    // env restored by afterEach; assert nothing was written.
    const rows = await rowsForTestUser();
    expect(rows).toHaveLength(0);
  });
});
