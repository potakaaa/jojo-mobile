import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Provider-agnostic mocked auth-state seam.
 *
 * No real auth provider (Supabase/Firebase/etc.) is decided yet, so this is a
 * pure in-memory mock backed by `useState` — a real seam (`AuthSessionState`)
 * that can be swapped for a live provider later WITHOUT touching any consumer
 * screen. When a provider is chosen, only this file changes: keep the
 * `AuthSessionState` shape and `useAuthSession()` signature stable.
 *
 * Persistence is intentionally in-memory only (no AsyncStorage/SecureStore):
 * the app resets to `unauthenticated` on every relaunch. Flagged as a near-term
 * follow-up once a provider lands.
 */

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthSessionState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Whether the user has completed the onboarding flow at least once. */
  hasOnboarded: boolean;
  signIn: (user: AuthUser) => void;
  signOut: () => void;
  completeOnboarding: () => void;
}

const AuthSessionContext = createContext<AuthSessionState | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  // Default cold-launch state: unauthenticated, not yet onboarded — matches what
  // a real first-time user sees (Splash → Onboarding → Login).
  const [status, setStatus] = useState<AuthStatus>('unauthenticated');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hasOnboarded, setHasOnboarded] = useState(false);

  const value = useMemo<AuthSessionState>(
    () => ({
      status,
      user,
      hasOnboarded,
      signIn: (nextUser: AuthUser) => {
        setUser(nextUser);
        setStatus('authenticated');
      },
      signOut: () => {
        // `hasOnboarded` intentionally persists across logout so logging out
        // returns to Login, not the full Onboarding flow.
        setUser(null);
        setStatus('unauthenticated');
      },
      completeOnboarding: () => setHasOnboarded(true),
    }),
    [status, user, hasOnboarded],
  );

  return createElement(AuthSessionContext.Provider, { value }, children);
}

export function useAuthSession(): AuthSessionState {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error('useAuthSession must be used within an AuthSessionProvider');
  }
  return ctx;
}
