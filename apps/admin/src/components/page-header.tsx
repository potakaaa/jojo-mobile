import type { ReactNode } from 'react';

/**
 * Shared page header (ADM-003, Decision 1) — a title with an optional back link
 * and an optional primary action slot (e.g. a "New …" button). Generalizes the
 * inline header P2's `branches.tsx` hand-rolled so every admin CRUD screen shares
 * one consistent title/back/action layout.
 */
interface PageHeaderProps {
  title: string;
  backLabel?: string;
  onBack?: () => void;
  action?: ReactNode;
}

export function PageHeader({ title, backLabel = '← Dashboard', onBack, action }: PageHeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex flex-col gap-1">
        {onBack ? (
          <button
            type="button"
            className="self-start text-sm text-muted-foreground hover:underline"
            onClick={onBack}
          >
            {backLabel}
          </button>
        ) : null}
        <h1 className="font-display text-h2 font-bold text-primary">{title}</h1>
      </div>
      {action}
    </header>
  );
}
