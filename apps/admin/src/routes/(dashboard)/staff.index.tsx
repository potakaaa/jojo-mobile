import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { PageHeader } from '@/components/page-header';
import { useAdminAuth } from '@/features/auth/hooks/use-admin-auth';
import { useAdminBranches } from '@/features/branches/hooks/use-admin-branches';
import { StaffList } from '@/features/staff/components/staff-list';
import {
  useAdminStaff,
  useAssignStaffBranch,
  useChangeStaffRole,
} from '@/features/staff/hooks/use-admin-staff';

export const Route = createFileRoute('/(dashboard)/staff/')({
  component: StaffPage,
});

/**
 * Staff list screen (ADM-009). Index route of the `/staff` layout — renders inside
 * `staff.tsx`'s `<Outlet/>`. Wires the staff list + branch-assign/role-change
 * mutations and the `useAdminAuth` super_admin gate. Branch options are pre-filtered
 * to ACTIVE branches. No confirm dialogs: branch changes are reversible/low-stakes,
 * and role changes rely on the server's own hard guards (self-escalation 400,
 * super_admin-only 403) — the client gate is cosmetic (D3). Inherits the
 * `(dashboard)` admin guard.
 */
function StaffPage() {
  const navigate = useNavigate();
  const staffQuery = useAdminStaff();
  const branchesQuery = useAdminBranches();
  const assignMutation = useAssignStaffBranch();
  const roleMutation = useChangeStaffRole();
  const { role } = useAdminAuth();
  const isSuperAdmin = role === 'super_admin';

  const activeBranches = branchesQuery.data?.filter((b) => b.isActive);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader title="Staff" onBack={() => void navigate({ to: '/' })} />

      <StaffList
        staff={staffQuery.data}
        branches={activeBranches}
        isLoading={staffQuery.isLoading}
        error={staffQuery.error}
        isSuperAdmin={isSuperAdmin}
        onBranchChange={(member, branchId) => assignMutation.mutate({ id: member.id, branchId })}
        onRoleChange={(member, newRole) => roleMutation.mutate({ id: member.id, role: newRole })}
      />
    </main>
  );
}
