import { Dialog } from 'radix-ui';

import { Button } from '@/components/ui/button';

import type { AdminBranch } from '../lib/admin-branches-api';

/**
 * Deactivation confirmation modal — the Safety requirement for the soft-delete
 * flow. Deactivating a branch is logically destructive to future ordering (even
 * though the row survives), so it must never be a one-click action. Built on the
 * radix Dialog primitive directly (no separate shadcn wrapper needed for one
 * consumer). Controlled by the parent via `open`/`onOpenChange`.
 */
interface DeactivateBranchDialogProps {
  branch: AdminBranch | null;
  open: boolean;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeactivateBranchDialog({
  branch,
  open,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: DeactivateBranchDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-foreground bg-card p-6 text-card-foreground shadow-[var(--shadow-offset-md)]">
          <Dialog.Title className="font-display text-h3">Deactivate branch</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {branch
              ? `“${branch.name}” will stop accepting new orders and be hidden from customers. The branch is not deleted — you can reactivate it later.`
              : ''}
          </Dialog.Description>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button variant="destructive" onClick={onConfirm} disabled={pending}>
              {pending ? 'Deactivating…' : 'Deactivate'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
