import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';

import type { AdminPendingStaffInvite } from '../lib/admin-staff-api';

/**
 * Pending staff invites table (ADM-013, #149). Presentational only — the parent
 * route supplies the query data + callbacks, mirroring `staff-list.tsx`. Revoke is
 * destructive → confirm-gated via the shared `ConfirmDialog`. Resend is a low-stakes
 * refresh → a direct click, no confirm (SPEC framing).
 *
 * The revoke dialog's target is DERIVED from `invites` (not held in an effect), so
 * when a successful revoke drops the row from the list the dialog auto-closes — no
 * `setState`-in-`useEffect` (which this app's lint config forbids).
 */
interface PendingInvitesListProps {
  invites: AdminPendingStaffInvite[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRevoke: (invite: AdminPendingStaffInvite) => void;
  onResend: (invite: AdminPendingStaffInvite) => void;
  /** The invite id currently being revoked (for the confirm dialog's busy state). */
  revokePendingId: string | null;
  /** The invite id currently being resent (for the row's busy label). */
  resendPendingId: string | null;
  /** A revoke/resend mutation error message, surfaced inside the confirm dialog. */
  revokeError: string | null;
}

const ROLE_LABEL: Record<AdminPendingStaffInvite['intendedRole'], string> = {
  staff: 'Staff',
  admin: 'Admin',
  super_admin: 'Super admin',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function PendingInvitesList({
  invites,
  isLoading,
  error,
  onRevoke,
  onResend,
  revokePendingId,
  resendPendingId,
  revokeError,
}: PendingInvitesListProps) {
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);
  // Derived (not effect-held): once the revoked row leaves `invites`, this becomes
  // null and the dialog closes on its own.
  const revokeTarget = confirmingRevokeId
    ? (invites?.find((i) => i.id === confirmingRevokeId) ?? null)
    : null;

  const columns: DataTableColumn<AdminPendingStaffInvite>[] = [
    {
      key: 'email',
      header: 'Email',
      cell: (r) => <span className="font-semibold">{r.email}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      cell: (r) => <StatusBadge tone="neutral">{ROLE_LABEL[r.intendedRole]}</StatusBadge>,
    },
    {
      key: 'branch',
      header: 'Branch',
      cell: (r) => <span>{r.intendedBranchName ?? '—'}</span>,
    },
    {
      key: 'invitedBy',
      header: 'Invited by',
      cell: (r) => (
        <div className="flex flex-col">
          <span>{r.invitedByName}</span>
          <span className="text-xs text-muted-foreground">{r.invitedByEmail}</span>
        </div>
      ),
    },
    {
      key: 'sent',
      header: 'Sent',
      cell: (r) => <span className="text-sm">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'expires',
      header: 'Expires',
      cell: (r) => <span className="text-sm">{formatDate(r.expiresAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (r) => (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onResend(r)}
            isLoading={resendPendingId === r.id}
          >
            {resendPendingId === r.id ? 'Resending…' : 'Resend'}
          </Button>
          <Button type="button" variant="destructive" onClick={() => setConfirmingRevokeId(r.id)}>
            Revoke
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={invites}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        error={error}
        loadingLabel="Loading pending invites…"
        errorLabel="Failed to load pending invites"
        emptyLabel="No pending invites."
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke invite"
        description={
          revokeTarget ? `Revoke invite for ${revokeTarget.email}? This cannot be undone.` : ''
        }
        confirmLabel="Revoke"
        pendingLabel="Revoking…"
        pending={revokePendingId !== null && revokePendingId === revokeTarget?.id}
        error={revokeError}
        onOpenChange={(open) => {
          if (!open) setConfirmingRevokeId(null);
        }}
        onConfirm={() => {
          if (revokeTarget) onRevoke(revokeTarget);
        }}
      />
    </>
  );
}
