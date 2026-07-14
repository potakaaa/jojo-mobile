import { ADMIN_ROLES } from '@jojopotato/types';
import type { AdminRole } from '@jojopotato/types';
import type { RequestHandler } from 'express';

import type { auth as authInstance } from './auth';

type Auth = typeof authInstance;

// Attach the resolved admin session to the Express request so downstream
// handlers (the `me` canary + role-management route + future ADM-002..007
// routes) can read it type-safely. Mirrors the `req.staffSession` pattern in
// `require-staff.ts`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminSession?: {
        userId: string;
        role: AdminRole;
      };
    }
  }
}

function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role != null && (ADMIN_ROLES as readonly string[]).includes(role);
}

/**
 * Convert Express `IncomingHttpHeaders` into a WHATWG `Headers` object so
 * better-auth's `getSession` can read the session cookie/token. Array header
 * values (rare, e.g. `set-cookie`) are joined with `, `. Duplicated from
 * `require-staff.ts` intentionally — that module does not export its private
 * `toHeaders`, matching the existing small-helper duplication precedent.
 */
function toHeaders(reqHeaders: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(reqHeaders).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]),
  );
}

/**
 * Express middleware factory guarding `/api/admin/*`. Reuses the existing
 * better-auth instance — NO forked auth logic. Rejects any request whose
 * session role is not in `ADMIN_ROLES` (`admin` | `super_admin`; NEVER plain
 * `staff`) with `403 { error: 'Forbidden' }`.
 *
 * On success attaches `req.adminSession` and calls `next()`.
 */
export function requireAdmin(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    try {
      const session = await auth.api.getSession({ headers: toHeaders(req.headers) });
      const role = (session?.user as { role?: string | null } | undefined)?.role;
      if (!session || !isAdminRole(role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      req.adminSession = {
        userId: session.user.id,
        role,
      };
      next();
    } catch (err) {
      // A throw here is an infra/session-service failure (DB down, malformed
      // cookie) — NOT a legitimate authorization rejection. Log it so the two
      // don't look identical in prod; still respond 403 (never leak internals).
      console.error('[require-admin] session check failed:', err);
      res.status(403).json({ error: 'Forbidden' });
    }
  };
}
