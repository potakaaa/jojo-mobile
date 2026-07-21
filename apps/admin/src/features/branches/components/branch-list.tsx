import { Button } from '@/components/ui/button';

import type { AdminBranch } from '../lib/admin-branches-api';

/**
 * Branch table with loading / empty / error states. Inactive (soft-deleted)
 * rows stay visible (dimmed) with a "Reactivate" action, since the admin view —
 * unlike the public one — must show deactivated branches.
 */
interface BranchListProps {
  branches: AdminBranch[] | undefined;
  isLoading: boolean;
  error: unknown;
  onEdit: (branch: AdminBranch) => void;
  onDeactivate: (branch: AdminBranch) => void;
  onReactivate: (branch: AdminBranch) => void;
}

export function BranchList({
  branches,
  isLoading,
  error,
  onEdit,
  onDeactivate,
  onReactivate,
}: BranchListProps) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading branches…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Failed to load branches: {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }
  if (!branches || branches.length === 0) {
    return <p className="text-sm text-muted-foreground">No branches yet. Create the first one.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border-2 border-foreground">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b-2 border-foreground bg-secondary/40">
          <tr>
            <th className="px-4 py-2 font-semibold">Name</th>
            <th className="px-4 py-2 font-semibold">Slug</th>
            <th className="px-4 py-2 font-semibold">Pickup</th>
            <th className="px-4 py-2 font-semibold">Status</th>
            <th className="px-4 py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {branches.map((branch) => (
            <tr
              key={branch.id}
              className={`border-b border-foreground/20 ${branch.isActive ? '' : 'opacity-50'}`}
            >
              <td className="px-4 py-2">{branch.name}</td>
              <td className="px-4 py-2 font-mono text-xs">{branch.slug}</td>
              <td className="px-4 py-2">{branch.isAcceptingPickup ? 'Accepting' : 'Paused'}</td>
              <td className="px-4 py-2">{branch.isActive ? 'Active' : 'Inactive'}</td>
              <td className="px-4 py-2">
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => onEdit(branch)}>
                    Edit
                  </Button>
                  {branch.isActive ? (
                    <Button size="sm" variant="destructive" onClick={() => onDeactivate(branch)}>
                      Deactivate
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => onReactivate(branch)}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
