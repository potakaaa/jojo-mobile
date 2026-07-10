/**
 * Shared, provider-agnostic auth contract. Kept free of any better-auth import
 * so a future staff/admin app can depend on these types without pulling in the
 * mobile auth client.
 */

/** Matches the `user_role` enum in `packages/api` (PRD §9.1). */
export type UserRole = 'customer' | 'staff' | 'admin' | 'super_admin';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  role: UserRole;
}

/** Mirrors better-auth's session model (opaque token + expiry + owning user). */
export interface AuthSession {
  token: string;
  expiresAt: string;
  userId: string;
}
