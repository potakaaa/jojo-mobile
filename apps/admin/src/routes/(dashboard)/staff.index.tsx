import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useAdminAuth } from '@/features/auth/hooks/use-admin-auth';
import { useAdminBranches } from '@/features/branches/hooks/use-admin-branches';
import { AddStaffDialog } from '@/features/staff/components/add-staff-dialog';
import { PendingInvitesList } from '@/features/staff/components/pending-invites-list';
import { StaffList } from '@/features/staff/components/staff-list';
import {
  useAdminStaff,
  useAssignStaffBranch,
  useChangeStaffRole,
  useCreateStaffInvite,
  usePendingStaffInvites,
  useResendStaffInvite,
  useRevokeStaffInvite,
  useUserLookup,
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
  const lookupMutation = useUserLookup();
  const inviteMutation = useCreateStaffInvite();
  const pendingInvitesQuery = usePendingStaffInvites();
  const revokeMutation = useRevokeStaffInvite();
  const resendMutation = useResendStaffInvite();
  const { role, user } = useAdminAuth();
  const isSuperAdmin = role === 'super_admin';

  const [addOpen, setAddOpen] = useState(false);

  const activeBranches = branchesQuery.data?.filter((b) => b.isActive);

  // Surface a failed branch-assignment, role-change, or invite revoke/resend so the
  // user sees why an action failed, instead of the mutation failing silently.
  const mutationError =
    assignMutation.error ?? roleMutation.error ?? revokeMutation.error ?? resendMutation.error;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader
        title="Staff"
        onBack={() => void navigate({ to: '/' })}
        action={
          // Adding staff is super_admin-only (server enforces the real 403; this gate
          // is cosmetic — matches the role-<select> gate on the list itself).
          isSuperAdmin ? (
            <Button type="button" onClick={() => setAddOpen(true)}>
              + Add staff
            </Button>
          ) : undefined
        }
      />

      {mutationError != null && (
        <p
          role="alert"
          className="rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {mutationError instanceof Error
            ? mutationError.message
            : 'Update failed. Please try again.'}
        </p>
      )}

      <StaffList
        staff={staffQuery.data}
        branches={activeBranches}
        isLoading={staffQuery.isLoading}
        error={staffQuery.error}
        isSuperAdmin={isSuperAdmin}
        currentUserId={user?.id ?? null}
        onBranchChange={(member, branchId) => assignMutation.mutate({ id: member.id, branchId })}
        onRoleChange={(member, newRole) => roleMutation.mutate({ id: member.id, role: newRole })}
        onRemove={(member) => roleMutation.mutate({ id: member.id, role: 'customer' })}
      />

      {isSuperAdmin ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-h3">Pending invites</h2>
          <PendingInvitesList
            invites={pendingInvitesQuery.data}
            isLoading={pendingInvitesQuery.isLoading}
            error={pendingInvitesQuery.error}
            onRevoke={(invite) => revokeMutation.mutate(invite.id)}
            onResend={(invite) => resendMutation.mutate(invite.id)}
            revokePendingId={revokeMutation.isPending ? (revokeMutation.variables ?? null) : null}
            resendPendingId={resendMutation.isPending ? (resendMutation.variables ?? null) : null}
            revokeError={
              revokeMutation.error instanceof Error ? revokeMutation.error.message : null
            }
          />
        </section>
      ) : null}

      {isSuperAdmin ? (
        <AddStaffDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          branches={activeBranches}
          onLookup={(email) => lookupMutation.mutateAsync(email)}
          onPromote={async ({ userId, role: newRole, branchId }) => {
            await roleMutation.mutateAsync({ id: userId, role: newRole });
            if (newRole === 'staff') {
              await assignMutation.mutateAsync({ id: userId, branchId });
            }
          }}
          onInvite={(input) => inviteMutation.mutateAsync(input).then(() => undefined)}
        />
      ) : null}
    </main>
  );
}
