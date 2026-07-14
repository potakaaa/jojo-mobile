/**
 * Shared typed error for all `/api/admin/*` routes. Mirrors the `OrderError`
 * pattern in `packages/api/src/routes/orders.ts:39-47` — always THROWN inside a
 * handler and CAUGHT by a single try/catch wrapping the handler body, which
 * converts it into `res.status(err.status).json({ error: err.message })`.
 * NEVER constructed and returned directly as a response body.
 *
 * Every later admin phase (ADM-002..007) reuses this same error class.
 */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}
