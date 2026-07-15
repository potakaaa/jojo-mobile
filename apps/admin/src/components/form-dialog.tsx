import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';

/**
 * Generic create/edit modal shell (ADM-004, Decision 4 — extracted alongside
 * `data-table`). Wraps the radix `Dialog` primitive with the shared brutalist
 * styling; the actual form body (fields + its own submit/cancel buttons) is
 * passed as `children`, so this shell stays domain-agnostic (E3). Generalizes
 * the inline `Dialog.Root`/`Portal`/`Overlay`/`Content` markup P3's
 * `products.index.tsx` hand-rolled around `ProductForm`.
 */
interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'default' | 'wide';
  children: ReactNode;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'default',
  children,
}: FormDialogProps) {
  const maxWidth = size === 'wide' ? 'max-w-4xl' : 'max-w-lg';
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className={`fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-full ${maxWidth} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-foreground bg-card p-6 text-card-foreground shadow-[var(--shadow-offset-md)]`}
        >
          <Dialog.Title className="font-display text-h3">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-1 mb-4 text-sm text-muted-foreground">
              {description}
            </Dialog.Description>
          ) : (
            // Radix requires a Description (or aria-describedby) for a11y; render
            // a visually-hidden empty one when the caller supplies no text.
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
