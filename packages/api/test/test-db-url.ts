import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';

/**
 * Test-only DB URL helpers. Used by vitest setup files to route every DB
 * connection onto a dedicated per-run test database instead of the shared
 * dev database. Not imported by any production/runtime code.
 */

/**
 * Return `baseUrl` with the database name (last path segment) swapped for
 * `<name>_test`. E.g. `postgres://u:p@host:5432/jojopotato` →
 * `postgres://u:p@host:5432/jojopotato_test`.
 */
export function deriveTestDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const dbName = url.pathname.replace(/^\//, '');
  if (!dbName) {
    throw new Error(`deriveTestDatabaseUrl: base URL has no database name in its path: ${baseUrl}`);
  }
  url.pathname = `/${dbName}_test`;
  return url.toString();
}

/**
 * Load `.env` (if `DATABASE_URL` isn't already set in the environment) and
 * return the base `DATABASE_URL`. Throws a clear error if still unset.
 *
 * IMPORTANT: this reads ONLY the `DATABASE_URL` key out of `.env` — it does NOT
 * populate every `.env` var into `process.env`. Test files set their own dummy
 * env (`GOOGLE_CLIENT_ID`, `BETTER_AUTH_URL`, etc.) via top-level `??=` guards;
 * eagerly loading all of `.env` here would clobber those guards with the real
 * dev/ngrok values and break config-level auth assertions. So we parse `.env`
 * out-of-band and copy only the one key we need.
 *
 * An already-set shell `DATABASE_URL` wins over `.env` (matching drizzle.config.ts
 * `override: false`).
 */
export function getBaseDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    const fromEnvFile = readDatabaseUrlFromEnvFile();
    if (fromEnvFile) process.env.DATABASE_URL = fromEnvFile;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'getBaseDatabaseUrl: DATABASE_URL is not set (checked process.env and .env). ' +
        'Set it in packages/api/.env or the shell before running tests.',
    );
  }
  return url;
}

/**
 * Parse `packages/api/.env` and return only its `DATABASE_URL` value (or
 * undefined). Uses dotenv's parser but writes NOTHING to `process.env`.
 */
function readDatabaseUrlFromEnvFile(): string | undefined {
  const envPath = resolve(process.cwd(), '.env');
  let raw: string;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return undefined; // no .env file — caller falls back to the shell env
  }
  const parsed = dotenv.parse(raw);
  return parsed.DATABASE_URL;
}
