import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { AdminBranch } from '@/features/branches/lib/admin-branches-api';

import type { AdminStaffMember } from '../lib/admin-staff-api';

/**
 * Staff table (ADM-009) — a consumer of the shared `DataTable` composite.
 * Presentational only (the parent route supplies query data + callbacks). Columns:
 * Name/email, Role, and Branch.
 *
 * The Role column renders a native `<select>` ONLY for a super_admin viewer
 * (`isSuperAdmin`); a plain `admin` viewer sees a read-only `StatusBadge`. The
 * super_admin gate is COSMETIC — the server's `POST /api/admin/users/:id/role`
 * route enforces the real super_admin-only 403 boundary (D3).
 *
 * D4: the role `<select>` intentionally offers ONLY the three staff-level roles
 * (staff/admin/super_admin), NOT `customer` — even though the underlying route
 * technically accepts a `customer` target. Demoting a staff member out of the
 * staff level entirely is a distinct workflow this screen does not own (once
 * demoted, the row would vanish from this list anyway). That action stays
 * reachable only via direct API call; a general Users screen (ADM-010, out of
 * scope) is its natural home.
 */
interface StaffListProps {
  staff: AdminStaffMember[] | undefined;
  /** Pre-filtered to isActive branches by the parent. */
  branches: AdminBranch[] | undefined;
  isLoading: boolean;
  error: unknown;
  isSuperAdmin: boolean;
  /**
   * The signed-in user's id — the "Remove from staff" action is hidden on their own
   * row (client mirror of the server's self-modification guard). ADM-013 (#149).
   */
  currentUserId: string | null;
  onBranchChange: (member: AdminStaffMember, branchId: string | null) => void;
  onRoleChange: (member: AdminStaffMember, role: AdminStaffMember['role']) => void;
  /** Demote a staff member to `customer` (Part B — reuses the role route). */
  onRemove: (member: AdminStaffMember) => void;
}

const selectClass =
  'h-9 rounded-md border-2 border-border bg-background px-2 text-sm text-foreground';

// D4: staff-level roles only — never `customer`.
const ROLE_OPTIONS: { value: AdminStaffMember['role']; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super admin' },
];

function roleLabel(role: AdminStaffMember['role']): string {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

export function StaffList({
  staff,
  branches,
  isLoading,
  error,
  isSuperAdmin,
  currentUserId,
  onBranchChange,
  onRoleChange,
  onRemove,
}: StaffListProps) {
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  // Derived (not effect-held): once the removed member is demoted they drop off the
  // roster, so this becomes null and the dialog closes on its own — no setState in
  // an effect (which this app's lint config forbids).
  const removeTarget = confirmingRemoveId
    ? (staff?.find((s) => s.id === confirmingRemoveId) ?? null)
    : null;

  const columns: DataTableColumn<AdminStaffMember>[] = [
    {
      key: 'identity',
      header: 'Name / email',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-semibold">{r.name}</span>
          <span className="text-xs text-muted-foreground">{r.email}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (r) =>
        isSuperAdmin ? (
          <select
            className={selectClass}
            aria-label={`Role for ${r.email}`}
            value={r.role}
            onChange={(e) => onRoleChange(r, e.target.value as AdminStaffMember['role'])}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <StatusBadge tone="neutral">{roleLabel(r.role)}</StatusBadge>
        ),
    },
    {
      key: 'branch',
      header: 'Assigned branch',
      cell: (r) => {
        // Only `staff` are branch-scoped — `assertBranchScope` bypasses admin/super_admin,
        // so a branch has no effect on them. Offer the editable control (and
        // `onBranchChange`) for staff only; admin/super_admin get a read-only marker.
        if (r.role !== 'staff') {
          return <StatusBadge tone="neutral">Not branch-scoped</StatusBadge>;
        }
        // Keep a currently-assigned but now-inactive branch (absent from the active
        // `branches` list) selectable, so the row's value always has a matching option
        // instead of silently rendering as "No branch assigned".
        const assignedMissing =
          r.assignedBranchId != null && !branches?.some((b) => b.id === r.assignedBranchId);
        return (
          <select
            className={selectClass}
            aria-label={`Branch for ${r.email}`}
            value={r.assignedBranchId ?? ''}
            onChange={(e) => onBranchChange(r, e.target.value || null)}
          >
            <option value="">No branch assigned</option>
            {assignedMissing && (
              <option value={r.assignedBranchId as string}>
                {r.branchName ?? 'Assigned branch'} (inactive)
              </option>
            )}
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (r) =>
        // Hide the action entirely on the signed-in user's own row — the client
        // mirror of the server's `Cannot modify own role` self-modification guard.
        r.id === currentUserId ? null : (
          <Button type="button" variant="destructive" onClick={() => setConfirmingRemoveId(r.id)}>
            Remove from staff
          </Button>
        ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={staff}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        error={error}
        loadingLabel="Loading staff…"
        errorLabel="Failed to load staff"
        emptyLabel="No staff members yet."
      />

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove from staff"
        description={
          removeTarget
            ? `Remove ${removeTarget.name} from staff? They will immediately lose staff access. This cannot be undone from here.`
            : ''
        }
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={false}
        error={null}
        onOpenChange={(open) => {
          if (!open) setConfirmingRemoveId(null);
        }}
        onConfirm={() => {
          if (removeTarget) onRemove(removeTarget);
        }}
      />
    </>
  );
}
