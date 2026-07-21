/**
 * Shared typed error for all `/api/admin/*` routes. Mirrors the `OrderError`
 * pattern in `packages/api/src/routes/orders.ts:39-47` — always THROWN inside a
 * handler and CAUGHT by a single try/catch wrapping the handler body, which
 * converts it into `res.status(err.status).json({ error: err.message })`.
 * NEVER constructed and returned directly as a response body.
 *
 * Every later admin phase (ADM-002..007) reuses this same error class.
 */
import type { Response } from 'express';

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

/**
 * Convert a thrown error into an HTTP response. `AdminApiError` (thrown by the
 * admin handlers and by the Postgres unique-violation catch) maps to its own
 * status; anything else is an unexpected 500. Shared by every admin route file
 * (branches, products, categories) — relocated from `branches.ts` (ADM-003,
 * Decision 2) so there is one copy, not one per domain.
 */
export function handleAdminError(err: unknown, res: Response, context: string): void {
  if (err instanceof AdminApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(`[admin] unexpected error ${context}`, err);
  res.status(500).json({ error: `Failed while ${context}` });
}

/**
 * Postgres `unique_violation` (node-postgres/pg code `23505`) — e.g. a duplicate
 * `slug` insert/update. Drizzle wraps driver errors in a `DrizzleQueryError`
 * carrying the original pg error on `.cause`, so check BOTH the error itself and
 * its cause (a top-level-only check silently misses the violation → 500 not 409).
 */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: string }).code;
  const causeCode = (err as { cause?: { code?: string } }).cause?.code;
  return code === '23505' || causeCode === '23505';
}
