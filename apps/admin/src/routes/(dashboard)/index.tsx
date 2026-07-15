import { createFileRoute } from '@tanstack/react-router';

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
  const { user, role } = useAdminAuth();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-display font-bold text-foreground">
        Overview
      </h1>

      <Card className="max-w-2xl rounded-3xl border-2 border-foreground shadow-[var(--shadow-offset-md)]">
        <CardHeader>
          <CardTitle className="font-display text-h3">Welcome to Jojo Potato Admin</CardTitle>
          <CardDescription>
            Signed in as {user?.email ?? 'admin'} ({role ?? 'unknown'}).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Back-office modules land here in the phases ahead — branches, products, deals, rewards,
            orders, and analytics.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
