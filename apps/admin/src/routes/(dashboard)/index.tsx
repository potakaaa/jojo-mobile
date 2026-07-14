import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminAuth } from '@/features/auth/hooks/use-admin-auth';

export const Route = createFileRoute('/(dashboard)/')({
  component: DashboardHome,
});

/**
 * Dashboard landing shell — the ONLY child route in the `(dashboard)` group this
 * phase. Reached at `/` only after the group's `beforeLoad` guard confirms an
 * admin/super_admin session. Later phases (ADM-002..007) add sibling routes.
 */
function DashboardHome() {
  const { user, role, signOut } = useAdminAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    void navigate({ to: '/login' });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-8 text-foreground">
      <h1 className="font-display text-display font-bold text-primary [text-shadow:var(--shadow-offset-sm)]">
        Jojo Potato Admin
      </h1>

      <Card className="w-full max-w-md rounded-3xl border-2 border-foreground shadow-[var(--shadow-offset-md)]">
        <CardHeader>
          <CardTitle className="font-display text-h3">Dashboard</CardTitle>
          <CardDescription>
            Signed in as {user?.email ?? 'admin'} ({role ?? 'unknown'}).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Back-office modules land here in the phases ahead — branches, products, deals, rewards,
            orders, and analytics.
          </p>
          <Button
            variant="secondary"
            onClick={handleSignOut}
            className="self-start border-2 border-foreground shadow-[var(--shadow-offset-sm)]"
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
