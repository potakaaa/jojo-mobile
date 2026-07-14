import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAdminAuth } from '@/features/auth/hooks/use-admin-auth';

export const Route = createFileRoute('/login')({
  component: LoginScreen,
});

/**
 * Admin login screen (email/password). Lives OUTSIDE the `(dashboard)` route
 * group — unguarded, reachable while signed out. Composed from the P0 shadcn
 * primitives (Card, Input, Button) — no hand-rolled form controls.
 */
function LoginScreen() {
  const { signIn } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Sign-in failed');
      return;
    }

    // MFA-GATEWAY (ADM-0xx, future): a two-factor challenge step inserts here
    // between sign-in success and dashboard routing. No-op today — sign-in
    // success routes straight to the shell.
    void navigate({ to: '/' });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-foreground">
      <Card className="w-full max-w-sm rounded-3xl border-2 border-foreground shadow-[var(--shadow-offset-md)]">
        <CardHeader>
          <CardTitle className="font-display text-h3">Jojo Potato Admin</CardTitle>
          <CardDescription>Sign in to the back-office dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              type="email"
              placeholder="Email"
              aria-label="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={submitting}
              className="border-2 border-foreground shadow-[var(--shadow-offset-sm)]"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
