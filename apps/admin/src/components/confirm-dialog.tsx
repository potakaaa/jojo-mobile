import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Generic confirmation modal (ADM-003, Decision 1 — extracted from P2's
 * `deactivate-branch-dialog.tsx`). The Safety requirement for any logically
 * destructive or price-changing admin action: it must never be a one-click
 * action. Built on the radix `Dialog` primitive directly; controlled by the
 * parent via `open`/`onOpenChange`. Text is fully parameterized (`title`/
 * `description`/`confirmLabel`) so branches, products, options, and availability
 * all share one modal instead of hand-rolling one per domain.
 */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  pending: boolean;
  error: string | null;
  /** When true, the confirm button uses the `destructive` variant. Default true. */
  destructive?: boolean;
  /** Optional extra body content between the description and the actions (e.g. a
   *  policy radio group). Additive — existing callers pass none. */
  children?: ReactNode;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  destructive = true,
  children,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-foreground bg-card p-6 text-card-foreground shadow-[var(--shadow-offset-md)]"
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <Dialog.Title className="font-display text-h3">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </Dialog.Description>

          {children ? <div className="mt-4">{children}</div> : null}

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
            <Button
              variant={destructive ? 'destructive' : 'default'}
              onClick={onConfirm}
              isLoading={pending}
            >
              {pending ? (pendingLabel ?? 'Working…') : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
