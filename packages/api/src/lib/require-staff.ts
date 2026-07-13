import type { StaffRole } from '@jojopotato/types';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';

import type { db as dbInstance } from '../db/client';
import { users } from '../db/schema/index';
import type { auth as authInstance } from './auth';

type Db = typeof dbInstance;
type Auth = typeof authInstance;

/**
 * Roles admitted through the staff guard. `staff` is branch-scoped;
 * `admin`/`super_admin` are admitted but NOT branch-restricted here — see the
 * `assertBranchScope` TODO seam (STAFF-ADM is a post-STAFF-001 concern).
 */
export const STAFF_ROLES = ['staff', 'admin', 'super_admin'] as const satisfies readonly StaffRole[];

// Attach the resolved staff session to the Express request so downstream
// handlers (canary + future STAFF-002/003/004 routes) can read it type-safely.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staffSession?: {
        userId: string;
        role: StaffRole;
        assignedBranchId: string | null;
      };
    }
  }
}

function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role != null && (STAFF_ROLES as readonly string[]).includes(role);
}

/**
 * Convert Express `IncomingHttpHeaders` into a WHATWG `Headers` object so
 * better-auth's `getSession` can read the session cookie/token. Array header
 * values (rare, e.g. `set-cookie`) are joined with `, `.
 */
function toHeaders(reqHeaders: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(reqHeaders).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]),
  );
}

/**
 * Express middleware factory guarding `/api/staff/*`. Reuses the existing
 * better-auth instance — NO forked auth logic. Rejects any request whose
 * session role is not in `STAFF_ROLES` with `403 { error: 'Forbidden' }`.
 *
 * On success attaches `req.staffSession` and calls `next()`.
 */
export function requireStaff(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    try {
      const session = await auth.api.getSession({ headers: toHeaders(req.headers) });
      const role = (session?.user as { role?: string | null } | undefined)?.role;
      if (!session || !isStaffRole(role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // TODO(STAFF-ADM): admin/super_admin branch bypass goes here — for now they
      // are admitted with whatever assignedBranchId they carry (typically null),
      // and branch scoping is enforced only for pure `staff` by assertBranchScope.
      req.staffSession = {
        userId: session.user.id,
        role,
        assignedBranchId:
          (session.user as { assignedBranchId?: string | null }).assignedBranchId ?? null,
      };
      next();
    } catch {
      // Never leak internals; an auth failure is a 403, not a 500.
      res.status(403).json({ error: 'Forbidden' });
    }
  };
}

/**
 * Look up the branch a staff user is scoped to. Returns `null` when the user is
 * unassigned. The single source of truth for branch scope (the session may not
 * carry the freshest `assignedBranchId`).
 */
export async function resolveBranchScope(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ assignedBranchId: users.assignedBranchId })
    .from(users)
    .where(eq(users.id, userId));
  return row?.assignedBranchId ?? null;
}

/**
 * Pure branch-scope guard for staff data routes (STAFF-002+).
 *
 * - Unassigned staff (`assignedBranchId === null`) can access nothing → false.
 * - No branch filter requested (`requestedBranchId === null`) → true (return own
 *   branch data).
 * - Otherwise the requested branch must exactly match the assigned branch.
 *
 * // TODO(STAFF-ADM): admin/super_admin bypass — callers check `role` before
 * calling this; admins should skip the scope check entirely once STAFF-ADM lands.
 */
export function assertBranchScope(
  assignedBranchId: string | null,
  requestedBranchId: string | null,
): boolean {
  if (assignedBranchId === null) return false;
  if (requestedBranchId === null) return true;
  return assignedBranchId === requestedBranchId;
}
