import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { env } from '@/config/env';
import { authClient } from '@/features/auth/lib/auth-client';

export const Route = createFileRoute('/staff-invite-accept')({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: StaffInviteAcceptScreen,
});

/**
 * Route wrapper: reads `?token=` and wires navigation into the shell. The accept
 * logic lives in `StaffInviteAccept` (exported) so it can be rendered directly in
 * jsdom tests without a router harness (matches this app's test convention).
 */
function StaffInviteAcceptScreen() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  return <StaffInviteAccept token={token} onSignedIn={() => void navigate({ to: '/' })} />;
}

type Phase = 'signing-in' | 'profile' | 'password' | 'staff-done' | 'error';

/** Accepts a real `YYYY-MM-DD` calendar date (rejects e.g. `2020-13-40`). Ported
 *  verbatim from the mobile onboarding screen's `isValidBirthday`. */
function isValidBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/** UX-only 0–4 password strength score (length + character-class diversity). Does
 *  NOT gate submission — only the 8–128 length bound does (D7). */
function passwordStrength(pw: string): { score: number; label: string } {
  let bits = 0;
  if (pw.length >= 12) bits++;
  if (/[a-z]/.test(pw)) bits++;
  if (/[A-Z]/.test(pw)) bits++;
  if (/\d/.test(pw)) bits++;
  if (/[^a-zA-Z0-9]/.test(pw)) bits++;
  const score = Math.min(4, bits);
  return { score, label: STRENGTH_LABELS[score]! };
}

/**
 * Web staff-invite accept surface (ADM-012, #142) — the browser-first replacement
 * for the mobile `invite-accept.tsx` deep-link flow. Lives OUTSIDE the `(dashboard)`
 * route group (unguarded — the invitee has no admin session yet).
 *
 * Flow:
 *   1. POST /staff-invite/start (unauthenticated) → a minted magic-link token
 *   2. authClient.magicLink.verify → the browser sets the HttpOnly session cookie
 *      (role still 'customer' at this instant)
 *   3. POST /staff-invite/consume (credentials:'include') → applies the invite's
 *      stored role/branch; the response's `role` drives post-setup routing
 *   4. Profile step (required: full name, birthday, address) →
 *      authClient.updateUser({ name, birthday, address, onboardedAt }) — `role`
 *      is NEVER sent (server-owned, input:false)
 *   5. Password step (required: 8–128 + confirm; strength meter is UX only) →
 *      POST /staff-invite/set-password
 *   6. Route by role: admin/super_admin → dashboard (`onSignedIn`); staff → a
 *      terminal "sign in on the app" confirmation (no dashboard access)
 *
 * The account is only usable once profile + password are set — the screen never
 * routes to the dashboard on verify/consume alone.
 */
export function StaffInviteAccept({
  token,
  onSignedIn,
}: {
  token?: string;
  onSignedIn: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('signing-in');
  const [error, setError] = useState<string>();
  const [consumedRole, setConsumedRole] = useState<string>();
  // Guard against a double-run (React strict mode) consuming the single-use token twice.
  const attempted = useRef(false);

  const { data: session, refetch: refetchSession } = authClient.useSession();

  // Profile step state. `nameInput` is null until the user types — the displayed
  // full name derives from the session until then (prefill without a sync effect).
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [bMonth, setBMonth] = useState('');
  const [bDay, setBDay] = useState('');
  const [bYear, setBYear] = useState('');
  const [address, setAddress] = useState('');
  const [profilePending, setProfilePending] = useState(false);
  const name = nameInput ?? session?.user?.name ?? '';

  // Password step state.
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwPending, setPwPending] = useState(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    void (async () => {
      if (!token) {
        setError('This invite link is missing its token. Ask for a new invite.');
        setPhase('error');
        return;
      }

      // Step 1 — start (unauthenticated plain fetch): validate the invite + mint a
      // magic-link token for the invited email.
      let magicLinkToken: string;
      try {
        const res = await fetch(`${env.apiUrl}/staff-invite/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          setError('This invite is invalid, expired, or has already been used.');
          setPhase('error');
          return;
        }
        const body = (await res.json()) as { magicLinkToken?: string };
        if (!body.magicLinkToken) {
          setError('Something went wrong accepting your invite. Please try again.');
          setPhase('error');
          return;
        }
        magicLinkToken = body.magicLinkToken;
      } catch {
        setError('Could not reach the server. Check your connection and try again.');
        setPhase('error');
        return;
      }

      // Step 2 — verify through authClient so the browser stores the session cookie.
      const { error: verifyError } = await authClient.magicLink.verify({
        query: { token: magicLinkToken },
      });
      if (verifyError) {
        setError(verifyError.message ?? 'This invite link is invalid or has expired.');
        setPhase('error');
        return;
      }

      // Step 3 — consume (session cookie rides along via credentials:'include'):
      // apply the invite's stored role/branch and capture the resulting role.
      try {
        const res = await fetch(`${env.apiUrl}/staff-invite/consume`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          setError('We signed you in, but could not finish setting up your staff access.');
          setPhase('error');
          return;
        }
        const body = (await res.json()) as { role?: string };
        setConsumedRole(body.role);
      } catch {
        setError('We signed you in, but could not finish setting up your staff access.');
        setPhase('error');
        return;
      }

      // Nudge the session so the profile step can prefill the full name.
      void refetchSession();
      setPhase('profile');
    })();
  }, [token, refetchSession]);

  const birthday =
    bYear.length === 4 && bMonth.length > 0 && bDay.length > 0
      ? `${bYear}-${bMonth.padStart(2, '0')}-${bDay.padStart(2, '0')}`
      : '';
  const canSubmitProfile =
    name.trim().length > 0 && address.trim().length > 0 && isValidBirthday(birthday);

  const strength = passwordStrength(password);
  const confirmMismatch = confirm.length > 0 && password !== confirm;
  const canSubmitPassword = password.length >= 8 && password.length <= 128 && password === confirm;

  async function handleProfileSubmit() {
    if (!canSubmitProfile || profilePending) return;
    setProfilePending(true);
    setError(undefined);
    const { error: updateError } = await authClient.updateUser({
      name: name.trim(),
      birthday,
      address: address.trim(),
      onboardedAt: new Date(),
    });
    setProfilePending(false);
    if (updateError) {
      setError(updateError.message ?? 'Could not save your details. Please try again.');
      return;
    }
    setPhase('password');
  }

  async function handlePasswordSubmit() {
    if (!canSubmitPassword || pwPending) return;
    setPwPending(true);
    setError(undefined);
    try {
      const res = await fetch(`${env.apiUrl}/staff-invite/set-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      });
      setPwPending(false);
      if (!res.ok) {
        setError('Your password must be 8–128 characters. Please try again.');
        return;
      }
      // Post-setup routing (D5) — resolves synchronously from the captured consume
      // role, no new fetch. admin/super_admin land in the dashboard; staff get a
      // terminal card.
      if (consumedRole === 'admin' || consumedRole === 'super_admin') {
        onSignedIn();
      } else {
        setPhase('staff-done');
      }
    } catch {
      setPwPending(false);
      setError('Could not save your password. Check your connection and try again.');
    }
  }

  // Numeric-only setter for the birthday sub-fields.
  const onlyDigits = (v: string) => v.replace(/\D/g, '');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-foreground">
      <Card className="w-full max-w-sm rounded-3xl border-2 border-foreground shadow-[var(--shadow-offset-md)]">
        {phase === 'signing-in' ? (
          <>
            <CardHeader>
              <CardTitle className="font-display text-h3">Signing you in…</CardTitle>
              <CardDescription>Accepting your staff invite.</CardDescription>
            </CardHeader>
            <CardContent>
              <p role="status" className="text-sm text-muted-foreground">
                Please wait while we set up your staff access.
              </p>
            </CardContent>
          </>
        ) : phase === 'profile' ? (
          <>
            <CardHeader>
              <CardTitle className="font-display text-h3">Tell us about you</CardTitle>
              <CardDescription>
                A few details to finish setting up your Jojo Potato account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleProfileSubmit();
                }}
              >
                <Input
                  placeholder="Full name"
                  aria-label="Full name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    setError(undefined);
                  }}
                  disabled={profilePending}
                  required
                />
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">Birthday</span>
                  <div className="flex gap-2">
                    <Input
                      placeholder="MM"
                      aria-label="Birth month"
                      inputMode="numeric"
                      maxLength={2}
                      className="text-center"
                      value={bMonth}
                      onChange={(e) => {
                        setBMonth(onlyDigits(e.target.value));
                        setError(undefined);
                      }}
                      disabled={profilePending}
                    />
                    <Input
                      placeholder="DD"
                      aria-label="Birth day"
                      inputMode="numeric"
                      maxLength={2}
                      className="text-center"
                      value={bDay}
                      onChange={(e) => {
                        setBDay(onlyDigits(e.target.value));
                        setError(undefined);
                      }}
                      disabled={profilePending}
                    />
                    <Input
                      placeholder="YYYY"
                      aria-label="Birth year"
                      inputMode="numeric"
                      maxLength={4}
                      className="text-center"
                      value={bYear}
                      onChange={(e) => {
                        setBYear(onlyDigits(e.target.value));
                        setError(undefined);
                      }}
                      disabled={profilePending}
                    />
                  </div>
                </div>
                <Input
                  placeholder="Address"
                  aria-label="Address"
                  autoComplete="street-address"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setError(undefined);
                  }}
                  disabled={profilePending}
                  required
                />
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  isLoading={profilePending}
                  disabled={!canSubmitProfile || profilePending}
                  className="border-2 border-foreground shadow-[var(--shadow-offset-sm)]"
                >
                  Continue
                </Button>
              </form>
            </CardContent>
          </>
        ) : phase === 'password' ? (
          <>
            <CardHeader>
              <CardTitle className="font-display text-h3">Set a password</CardTitle>
              <CardDescription>You&apos;ll use this to sign in from now on.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handlePasswordSubmit();
                }}
              >
                <Input
                  type="password"
                  placeholder="Password"
                  aria-label="Password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(undefined);
                  }}
                  disabled={pwPending}
                  required
                />
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${
                          password.length > 0 && i < strength.score ? 'bg-primary' : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  {password.length > 0 ? (
                    <span role="status" className="text-xs text-muted-foreground">
                      Password strength: {strength.label}
                    </span>
                  ) : null}
                </div>
                <Input
                  type="password"
                  placeholder="Confirm password"
                  aria-label="Confirm password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setError(undefined);
                  }}
                  disabled={pwPending}
                  required
                />
                {confirmMismatch ? (
                  <p role="alert" className="text-sm text-destructive">
                    Passwords don&apos;t match.
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  isLoading={pwPending}
                  disabled={!canSubmitPassword || pwPending}
                  className="border-2 border-foreground shadow-[var(--shadow-offset-sm)]"
                >
                  Finish setup
                </Button>
              </form>
            </CardContent>
          </>
        ) : phase === 'staff-done' ? (
          <>
            <CardHeader>
              <CardTitle className="font-display text-h3">You&apos;re all set</CardTitle>
              <CardDescription>
                Sign in to the Jojo Potato app to start your shifts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your staff account is ready. Open the Jojo Potato mobile app and sign in with your
                email and new password.
              </p>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="font-display text-h3">Invite failed</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/login" className="text-sm font-semibold underline underline-offset-4">
                Back to log in
              </a>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
