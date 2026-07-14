import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Dialog } from 'radix-ui';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { BranchForm } from '@/features/branches/components/branch-form';
import { BranchList } from '@/features/branches/components/branch-list';
import { DeactivateBranchDialog } from '@/features/branches/components/deactivate-branch-dialog';
import {
  useAdminBranches,
  useCreateBranch,
  useDeactivateBranch,
  useUpdateBranch,
} from '@/features/branches/hooks/use-admin-branches';
import type { AdminBranch, BranchCreateInput } from '@/features/branches/lib/admin-branches-api';

export const Route = createFileRoute('/(dashboard)/branches')({
  component: BranchesPage,
});

/**
 * Branch management screen (ADM-002) — the FIRST real back-office CRUD screen.
 * A sibling child route of the `(dashboard)` group, so it inherits the group's
 * server-verified `beforeLoad` admin guard. Lists branches, opens a shared
 * create/edit form modal, and gates deactivation behind a confirmation dialog.
 */
function BranchesPage() {
  const navigate = useNavigate();
  const branchesQuery = useAdminBranches();
  const createMutation = useCreateBranch();
  const updateMutation = useUpdateBranch();
  const deactivateMutation = useDeactivateBranch();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBranch | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminBranch | null>(null);

  function openCreate() {
    createMutation.reset();
    updateMutation.reset();
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(branch: AdminBranch) {
    createMutation.reset();
    updateMutation.reset();
    setEditing(branch);
    setFormOpen(true);
  }

  function handleFormSubmit(input: BranchCreateInput) {
    if (editing) {
      updateMutation.mutate({ id: editing.id, input }, { onSuccess: () => setFormOpen(false) });
    } else {
      createMutation.mutate(input, { onSuccess: () => setFormOpen(false) });
    }
  }

  function handleReactivate(branch: AdminBranch) {
    updateMutation.mutate({ id: branch.id, input: { isActive: true } });
  }

  function handleDeactivateConfirm() {
    if (!deactivateTarget) return;
    deactivateMutation.mutate(deactivateTarget.id, {
      onSuccess: () => setDeactivateTarget(null),
    });
  }

  const formSubmitting = createMutation.isPending || updateMutation.isPending;
  const formError =
    (createMutation.error instanceof Error ? createMutation.error.message : null) ??
    (updateMutation.error instanceof Error ? updateMutation.error.message : null);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 bg-background p-8 text-foreground">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="self-start text-sm text-muted-foreground hover:underline"
            onClick={() => void navigate({ to: '/' })}
          >
            ← Dashboard
          </button>
          <h1 className="font-display text-h2 font-bold text-primary">Branches</h1>
        </div>
        <Button onClick={openCreate}>New branch</Button>
      </header>

      <BranchList
        branches={branchesQuery.data}
        isLoading={branchesQuery.isLoading}
        error={branchesQuery.error}
        onEdit={openEdit}
        onDeactivate={setDeactivateTarget}
        onReactivate={handleReactivate}
      />

      <Dialog.Root open={formOpen} onOpenChange={setFormOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-foreground bg-card p-6 text-card-foreground shadow-[var(--shadow-offset-md)]">
            <Dialog.Title className="font-display text-h3">
              {editing ? 'Edit branch' : 'New branch'}
            </Dialog.Title>
            <Dialog.Description className="mt-1 mb-4 text-sm text-muted-foreground">
              {editing ? `Update “${editing.name}”.` : 'Add a new pickup branch.'}
            </Dialog.Description>
            <BranchForm
              initial={editing ?? undefined}
              submitting={formSubmitting}
              error={formError}
              onSubmit={handleFormSubmit}
              onCancel={() => setFormOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DeactivateBranchDialog
        branch={deactivateTarget}
        open={deactivateTarget !== null}
        pending={deactivateMutation.isPending}
        error={deactivateMutation.error instanceof Error ? deactivateMutation.error.message : null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        onConfirm={handleDeactivateConfirm}
      />
    </main>
  );
}
