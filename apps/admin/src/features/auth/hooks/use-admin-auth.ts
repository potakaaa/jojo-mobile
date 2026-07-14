import { ADMIN_ROLES } from '@jojopotato/types';
import type { UserRole } from '@jojopotato/types';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import { authClient } from '@/features/auth/lib/auth-client';

/** Result-object return so screens can surface errors without try/catch. */
export interface SignInResult {
  ok: boolean;
  error?: string;
}

/** The signed-in admin-web user (subset of the session user payload). */
export interface AdminAuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AdminAuthContextValue {
  /** The signed-in user, or `null` when unauthenticated. */
  user: AdminAuthUser | null;
  /** Convenience accessor for `user.role`, or `null` when unauthenticated. */
  role: UserRole | null;
  /** True while the (cookie) session is still being restored. */
  isLoading: boolean;
  /** True when the signed-in user's role is admin or super_admin. */
  isAdmin: boolean;
  /** Email/password sign-in — the only method the admin web needs. */
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function toResult(error: { message?: string } | null | undefined): SignInResult {
  return error ? { ok: false, error: error.message ?? 'Something went wrong' } : { ok: true };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    const { error } = await authClient.signIn.email({ email, password });
    return toResult(error);
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const value = useMemo<AdminAuthContextValue>(() => {
    const sessionUser = data?.user as
      { id: string; name: string; email: string; role?: string | null } | undefined;
    const user: AdminAuthUser | null = sessionUser
      ? {
          id: sessionUser.id,
          name: sessionUser.name,
          email: sessionUser.email,
          role: (sessionUser.role as UserRole) ?? 'customer',
        }
      : null;
    const role = user?.role ?? null;
    const isAdmin = role !== null && (ADMIN_ROLES as readonly string[]).includes(role);
    return { user, role, isLoading: isPending, isAdmin, signIn, signOut };
  }, [data, isPending, signIn, signOut]);

  return createElement(AdminAuthContext.Provider, { value }, children);
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return ctx;
}
