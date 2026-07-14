import { deriveTestDatabaseUrl, getBaseDatabaseUrl } from './test-db-url';

/**
 * vitest `setupFiles` entry — runs in EACH worker BEFORE the module graph is
 * imported. This is the critical ordering guarantee: by the time
 * `src/db/client.ts` constructs its Pool from `process.env.DATABASE_URL`,
 * we've already pointed that var at `<db>_test`, so no test ever connects to
 * the shared dev database.
 *
 * We only rewrite DATABASE_URL. Every other env var (DEV_AUTO_LOGIN, etc.) is
 * left exactly as-is.
 */
const base = getBaseDatabaseUrl();
process.env.DATABASE_URL = deriveTestDatabaseUrl(base);
