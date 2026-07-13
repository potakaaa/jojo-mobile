import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';

import { auth } from '../lib/auth';

/**
 * Express middleware that gates a route behind a valid better-auth session.
 *
 * Resolves the session via `auth.api.getSession`, passing the incoming request
 * headers (NOTE: `fromNodeHeaders(req.headers)` — the raw Node headers object,
 * not `req` itself). On success it attaches `req.user`/`req.session` (typed via
 * `src/types/express.d.ts`) and calls `next()`; otherwise it responds 401 and
 * does not call `next()`.
 */
export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

  if (!result) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  req.user = result.user;
  req.session = result.session;
  next();
}
