import { STAFF_ROLES } from '@jojopotato/types';
import type { AuthUser, StaffRole, UserRole } from '@jojopotato/types';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { authClient } from '@/features/auth/lib/auth-client';
import { tryDevAutoLogin } from '@/features/auth/lib/dev-auto-login';
import * as Linking from 'expo-linking';

/** Deep-link the magic-link / OAuth flow redirects back into. */
const APP_CALLBACK_URL = Linking.createURL('/');

/**
 * How a caller asks `signIn` to authenticate. One dispatcher covers every
 * method the login screen needs — Google OAuth, magic link, and the two-step
 * phone OTP flow. Email/password remains enabled server-side (better-auth) but
 * has no client entry point today, so it is not part of this union.
 */
export type SignInInput =
  | { method: 'google' }
  | { method: 'magic-link'; email: string }
  | { method: 'phone-send'; phoneNumber: string }
  | { method: 'phone-verify'; phoneNumber: string; code: string };

/** Result-object return so screens can surface errors without try/catch. */
export interface SignInResult {
  ok: boolean;
  error?: string;
}

export interface AuthContextValue {
  /** The signed-in user, or `null` when unauthenticated. */
  user: AuthUser | null;
  /** Convenience accessor for `user.role`, or `null` when unauthenticated. */
  role: UserRole | null;
  /** True when the signed-in user's role is a staff role (staff/admin/super_admin). */
  isStaff: boolean;
  /** True while the persisted session is still being restored on cold start. */
  isLoading: boolean;
  /** Whether onboarding has been seen this session (local, non-auth state). */
  hasOnboarded: boolean;
  signIn: (input: SignInInput) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toResult(error: { message?: string } | null | undefined): SignInResult {
  return error ? { ok: false, error: error.message ?? 'Something went wrong' } : { ok: true };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const [hasOnboarded, setHasOnboarded] = useState(false);

  // DEV-ONLY boot attempt: no-ops in production and when `/dev/session` is not
  // registered (plain `pnpm dev` → 404). The `useRef` latch guarantees at most
  // one attempt, so a failure can never loop. On success the session flips and
  // `Stack.Protected` swaps to `(tabs)`, so the login screen is skipped.
  const autoLoginAttempted = useRef(false);
  useEffect(() => {
    if (!__DEV__ || isPending || data || autoLoginAttempted.current) return;
    autoLoginAttempted.current = true;
    void tryDevAutoLogin();
  }, [isPending, data]);

  const signIn = useCallback(async (input: SignInInput): Promise<SignInResult> => {
    switch (input.method) {
      case 'google': {
        const { error } = await authClient.signIn.social({
          provider: 'google',
          callbackURL: APP_CALLBACK_URL,
        });
        return toResult(error);
      }
      case 'magic-link': {
        const { error } = await authClient.signIn.magicLink({
          email: input.email,
          callbackURL: APP_CALLBACK_URL,
        });
        return toResult(error);
      }
      case 'phone-send': {
        const { error } = await authClient.phoneNumber.sendOtp({
          phoneNumber: input.phoneNumber,
        });
        return toResult(error);
      }
      case 'phone-verify': {
        const { error } = await authClient.phoneNumber.verify({
          phoneNumber: input.phoneNumber,
          code: input.code,
        });
        return toResult(error);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const completeOnboarding = useCallback(() => setHasOnboarded(true), []);

  const value = useMemo<AuthContextValue>(() => {
    const sessionUser = data?.user as
      | {
          id: string;
          name: string;
          email: string;
          phoneNumber?: string | null;
          role?: string | null;
        }
      | undefined;
    const user: AuthUser | null = sessionUser
      ? {
          id: sessionUser.id,
          name: sessionUser.name,
          email: sessionUser.email,
          phoneNumber: sessionUser.phoneNumber ?? undefined,
          role: (sessionUser.role as UserRole) ?? 'customer',
        }
      : null;
    const role = user?.role ?? null;
    const isStaff = role !== null && STAFF_ROLES.includes(role as StaffRole);
    return {
      user,
      role,
      isStaff,
      isLoading: isPending,
      hasOnboarded,
      signIn,
      signOut,
      completeOnboarding,
    };
  }, [data, isPending, hasOnboarded, signIn, signOut, completeOnboarding]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
