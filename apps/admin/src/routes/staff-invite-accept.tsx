import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

type Phase = 'signing-in' | 'error';

/**
 * Web staff-invite accept surface (ADM-011 Section H) — the browser sibling of
 * `apps/mobile/src/app/(auth)/invite-accept.tsx`. Lives OUTSIDE the `(dashboard)`
 * route group (unguarded — the invitee has no admin session yet). Three chained
 * steps, all kept under a single "Signing you in…" state:
 *   1. POST /staff-invite/start (unauthenticated) → a minted magic-link token
 *   2. authClient.magicLink.verify → the browser sets the HttpOnly session cookie
 *      natively (role still 'customer' at this instant)
 *   3. POST /staff-invite/consume (credentials:'include', cookie rides along) →
 *      applies the invite's stored role/branch, then navigate into the shell
 *
 * The screen NEVER shows a success state after verify alone — the staff-level
 * promotion has not landed on the session until consume completes (same discipline
 * as the mobile screen).
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
  // Guard against a double-run (React strict mode) consuming the single-use token twice.
  const attempted = useRef(false);

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
      // apply the invite's stored role/branch. Stay in the loading phase across this.
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
      } catch {
        setError('We signed you in, but could not finish setting up your staff access.');
        setPhase('error');
        return;
      }

      // Success — hand off to the shell. The `(dashboard)` beforeLoad guard re-checks
      // the now-real session and admits normally.
      onSignedIn();
    })();
  }, [token, onSignedIn]);

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
              <div className="flex flex-col gap-4">
                <p role="status" className="text-sm text-muted-foreground">
                  Please wait while we set up your staff access.
                </p>
                {token ? (
                  <a
                    href={`jojopotato://staff-invite?token=${encodeURIComponent(token)}`}
                    className="text-sm underline underline-offset-4"
                  >
                    Open in the app
                  </a>
                ) : null}
              </div>
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
