import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { deriveTestDatabaseUrl, getBaseDatabaseUrl } from './test-db-url';

/**
 * vitest `globalSetup` — runs ONCE before all suites (in the main process,
 * NOT per worker). Guarantees a PRISTINE test database every run:
 *   1. drop the test DB if it exists (terminating any live connections first)
 *   2. create it fresh
 *   3. run all drizzle migrations against it
 *
 * Result: deterministic, zero fixture accumulation, and the shared dev DB is
 * never touched. Test-only — not imported by any production/runtime code.
 */

/** Swap the pathname of a DB URL to the maintenance `postgres` database. */
function toMaintenanceUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = '/postgres';
  return url.toString();
}

/** Extract the database name (last path segment) from a DB URL. */
function databaseNameOf(dbUrl: string): string {
  return new URL(dbUrl).pathname.replace(/^\//, '');
}

export default async function setup(): Promise<void> {
  const base = getBaseDatabaseUrl();
  const testUrl = deriveTestDatabaseUrl(base);
  const testDbName = databaseNameOf(testUrl);
  const maintenanceUrl = toMaintenanceUrl(base);

  // Recreate the test DB from the maintenance `postgres` database.
  const adminPool = new Pool({ connectionString: maintenanceUrl });
  try {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [testDbName],
    );
    // DROP/CREATE DATABASE cannot be parameterized; testDbName is derived from
    // our own DATABASE_URL (not user input), so interpolation is safe here.
    await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
    await adminPool.query(`CREATE DATABASE "${testDbName}"`);
  } finally {
    await adminPool.end();
  }

  // Migrate the fresh test DB up to the current schema.
  const migratePool = new Pool({ connectionString: testUrl });
  try {
    await migrate(drizzle(migratePool), { migrationsFolder: './drizzle' });
  } finally {
    await migratePool.end();
  }

  // Seed the pristine test DB with canonical fixtures (branches/deals/etc.) so
  // seed-dependent suites (e.g. branch-detail-route) have their required data.
  //
  // globalSetup runs in the MAIN process, BEFORE the per-worker `setup-env.ts`
  // setupFile — so `src/db/client.ts` (which builds its Pool from
  // process.env.DATABASE_URL at import time) would otherwise bind to the DEV DB
  // here. Point DATABASE_URL at the derived TEST url FIRST, then import the
  // seeder, so the seed writes to `<db>_test`, never the shared dev database.
  //
  // RESTORE the base URL afterward: with `fileParallelism: false`, workers can
  // share this process's env, and `setup-env.ts` re-derives `<db>_test` from
  // `getBaseDatabaseUrl()`. Leaving DATABASE_URL as `<db>_test` here would make
  // that re-derivation produce `<db>_test_test` (a nonexistent DB).
  const priorDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = testUrl;
  try {
    const { runSeed } = await import('../src/db/seed/seed');
    await runSeed();
  } finally {
    if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorDatabaseUrl;
  }
}
