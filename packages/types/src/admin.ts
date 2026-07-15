/**
 * Admin-side shared contracts (ADM-001, Phase 1). Kept free of any better-auth or
 * server import so both `packages/api` (server authz) and `apps/admin`
 * (role derivation + shell fetch) can depend on these without pulling in
 * server-side code. Mirrors `packages/types/src/staff.ts`.
 */

/**
 * Roles allowed through the admin guard. Subset of `UserRole` (see `auth.ts`).
 * NOTE: plain `staff` is NOT admitted — admin/super_admin only.
 */
export const ADMIN_ROLES = ['admin', 'super_admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Response shape of the canary `GET /api/admin/me` endpoint. No `assignedBranch`
 * concept — admin/super_admin are not branch-scoped (unlike `StaffMe`).
 *
 * `mfaPending` is the MFA/TOTP gateway seam field (see the phase plan's
 * `## MFA/TOTP Gateway` section) — always absent/false today; additive/optional,
 * a future phase (candidate ADM-0xx) sets it when a two-factor challenge is
 * pending. Do NOT remove.
 */
export interface AdminMe {
  role: AdminRole;
  mfaPending?: boolean;
}

/** A user row returned by `POST /api/admin/users/:id/role` on success. */
export interface AdminUserSummary {
  id: string;
  email: string;
  role: 'customer' | 'staff' | 'admin' | 'super_admin';
}
