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
const APP_CALLBACK_URL = Linking.createURL('/', { scheme: 'jojopotato' });

/**
 * How a caller asks `signIn` to authenticate. One dispatcher covers every
 * method the login screen needs — Google OAuth, magic link, and the two-step
 * phone OTP flow. Email/password is enabled server-side (better-auth); its only
 * client entry point is the dev-only `[DEV] Temp Login` button, which is behind
 * a `__DEV__` guard on the login screen (not a production sign-in path).
 */
export type SignInInput =
  | { method: 'google' }
  | { method: 'magic-link'; email: string }
  | { method: 'phone-send'; phoneNumber: string }
  | { method: 'phone-verify'; phoneNumber: string; code: string }
  | { method: 'email-password'; email: string; password: string };

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
  /**
   * Whether the signed-in user has completed post-auth account onboarding
   * (per-account, server-owned — derived from `user.onboardedAt`).
   */
  hasCompletedProfile: boolean;
  /**
   * Marketing push opt-in (PUSH-004), derived from the session. Requires
   * affirmative consent — only an explicit true reads as opted-IN, matching the
   * server default.
   */
  marketingOptIn: boolean;
  /** Persist the marketing opt-in flag and refresh the session. */
  setMarketingOptIn: (value: boolean) => Promise<SignInResult>;
  signIn: (input: SignInInput) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  completeOnboarding: () => void;
  /**
   * Save the required profile fields and stamp `onboardedAt`, completing
   * post-auth account onboarding. Refreshes the session so the nav gate flips
   * to `(tabs)` without an app restart.
   */
  completeProfile: (info: {
    name: string;
    birthday: string;
    address: string;
  }) => Promise<SignInResult>;
  /**
   * Save the editable profile fields for an already-onboarded user WITHOUT
   * touching `onboardedAt`. Deliberately separate from `completeProfile`, which
   * re-stamps `onboardedAt` — reusing that here would corrupt onboarding state
   * and re-trigger the onboarding nav gate. `role` is server-owned and never
   * sent. Refreshes the session so the profile view reflects the change.
   */
  updateProfile: (info: {
    name: string;
    birthday: string;
    address: string;
  }) => Promise<SignInResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toResult(
  error: { message?: string; status?: number; statusText?: string } | null | undefined,
): SignInResult {
  if (!error) {
    return { ok: true };
  }
  // better-fetch's error branch spreads the parsed JSON body into `error`, but a
  // non-JSON response (e.g. a proxy/tunnel serving an HTML error page instead of
  // proxying through, or any unexpected upstream shape) leaves `message` empty —
  // `status`/`statusText` still survive since they're always attached separately.
  // Surfacing them keeps a failure diagnosable instead of a dead-end generic string.
  const fallback = error.status
    ? `Something went wrong (${error.status}${error.statusText ? ` ${error.statusText}` : ''}). Please try again.`
    : 'Something went wrong. Please try again.';
  return { ok: false, error: error.message || fallback };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending, refetch } = authClient.useSession();
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

  const signIn = useCallback(
    async (input: SignInInput): Promise<SignInResult> => {
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
          // Establishes the session in-app (no redirect round-trip), so force a
          // session refetch — `useSession()` does not reliably auto-refresh on
          // Expo (same reason completeProfile refetches). Without it the nav gate
          // never flips and the user stays on the login screen.
          if (!error) await refetch();
          return toResult(error);
        }
        case 'email-password': {
          const { error } = await authClient.signIn.email({
            email: input.email,
            password: input.password,
          });
          // Same as phone-verify: refetch so the freshly-established session
          // propagates and the nav gate flips without an app restart.
          if (!error) await refetch();
          return toResult(error);
        }
      }
    },
    [refetch],
  );

  const signOut = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const completeOnboarding = useCallback(() => setHasOnboarded(true), []);

  const setMarketingOptIn = useCallback(
    async (value: boolean): Promise<SignInResult> => {
      const { error } = await authClient.updateUser({ marketingOptIn: value });
      if (error) {
        return toResult(error);
      }
      // Refetch so the new flag propagates to consumers reading `marketingOptIn`.
      await refetch();
      return toResult(null);
    },
    [refetch],
  );

  const completeProfile = useCallback(
    async (info: { name: string; birthday: string; address: string }): Promise<SignInResult> => {
      const { error } = await authClient.updateUser({
        name: info.name,
        birthday: info.birthday,
        address: info.address,
        onboardedAt: new Date(),
      });
      if (error) {
        return toResult(error);
      }
      // Force a server round-trip so the freshly-stamped `onboardedAt`
      // propagates and the nav gate flips to `(tabs)` without an app restart,
      // regardless of whether `useSession()` auto-refreshes.
      await refetch();
      return toResult(null);
    },
    [refetch],
  );

  const updateProfile = useCallback(
    async (info: { name: string; birthday: string; address: string }): Promise<SignInResult> => {
      // Explicit field-by-field payload — never spread a form-state object, so a
      // server-owned field like `role` can never ride along. `onboardedAt` is
      // intentionally omitted (that is `completeProfile`'s job, not this one).
      const { error } = await authClient.updateUser({
        name: info.name,
        birthday: info.birthday,
        address: info.address,
      });
      if (error) {
        return toResult(error);
      }
      // Force a server round-trip so the edited values propagate to the session
      // and the profile view updates without an app restart.
      await refetch();
      return toResult(null);
    },
    [refetch],
  );

  const value = useMemo<AuthContextValue>(() => {
    const sessionUser = data?.user as
      | {
          id: string;
          name: string;
          email: string;
          phoneNumber?: string | null;
          role?: string | null;
          birthday?: string | null;
          address?: string | null;
          onboardedAt?: string | Date | null;
          marketingOptIn?: boolean | null;
        }
      | undefined;
    const user: AuthUser | null = sessionUser
      ? {
          id: sessionUser.id,
          name: sessionUser.name,
          email: sessionUser.email,
          phoneNumber: sessionUser.phoneNumber ?? undefined,
          role: (sessionUser.role as UserRole) ?? 'customer',
          birthday: sessionUser.birthday ?? null,
          address: sessionUser.address ?? null,
          // `onboardedAt` rides the session as a Date (additionalField type:'date')
          // or an ISO string — normalize to `string | null` for the AuthUser contract.
          onboardedAt: sessionUser.onboardedAt
            ? new Date(sessionUser.onboardedAt).toISOString()
            : null,
        }
      : null;
    const role = user?.role ?? null;
    const isStaff = role !== null && STAFF_ROLES.includes(role as StaffRole);
    // Requires affirmative consent — only an explicit true is opted IN.
    const marketingOptIn = sessionUser?.marketingOptIn === true;
    return {
      user,
      role,
      isStaff,
      isLoading: isPending,
      hasOnboarded,
      hasCompletedProfile: user?.onboardedAt != null,
      marketingOptIn,
      setMarketingOptIn,
      signIn,
      signOut,
      completeOnboarding,
      completeProfile,
      updateProfile,
    };
  }, [
    data,
    isPending,
    hasOnboarded,
    setMarketingOptIn,
    signIn,
    signOut,
    completeOnboarding,
    completeProfile,
    updateProfile,
  ]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
