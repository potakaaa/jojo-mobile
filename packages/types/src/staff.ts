/**
 * Staff-side shared contracts (STAFF-001). Kept free of any better-auth or
 * server import so both `packages/api` (server authz) and `apps/mobile`
 * (role derivation + shell fetch) can depend on these without pulling in
 * server-side code.
 */

/** Roles allowed through the staff guard. Subset of `UserRole` (see `auth.ts`). */
export const STAFF_ROLES = ['staff', 'admin', 'super_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** The branch a staff member is scoped to, as returned by `GET /api/staff/me`. */
export interface StaffBranch {
  id: string;
  name: string;
  slug: string;
}

/** Response shape of the canary `GET /api/staff/me` endpoint. */
export interface StaffMe {
  role: StaffRole;
  assignedBranch: StaffBranch | null;
}
