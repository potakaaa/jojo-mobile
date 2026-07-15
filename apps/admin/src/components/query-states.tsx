import type { ReactNode } from 'react';

/**
 * Shared loading / error / empty render helper for react-query-backed lists
 * (ADM-003, Decision 1 — first extraction pass). Renders a state message while a
 * query is loading, errored, or returned no rows; otherwise renders `children`.
 * Generalizes the inline loading/empty/error branches P2's `branch-list.tsx`
 * hand-rolled, so every admin CRUD list shares one consistent state surface.
 */
interface QueryStatesProps {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  loadingLabel?: string;
  errorLabel?: string;
  emptyLabel?: string;
  children: ReactNode;
}

export function QueryStates({
  isLoading,
  error,
  isEmpty,
  loadingLabel = 'Loading…',
  errorLabel = 'Failed to load',
  emptyLabel = 'Nothing here yet.',
  children,
}: QueryStatesProps) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{loadingLabel}</p>;
  }
  // Only block the whole surface on error when there is no content to show.
  // On a background refetch error react-query keeps the last data (isEmpty
  // stays false), so cached rows remain visible instead of being replaced.
  if (error && isEmpty) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {errorLabel}: {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }
  if (isEmpty) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return <>{children}</>;
}
