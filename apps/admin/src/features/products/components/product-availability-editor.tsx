import { QueryStates } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { useAdminBranches } from '@/features/branches/hooks/use-admin-branches';

import { useProductAvailability, useSetAvailability } from '../hooks/use-admin-products';

/**
 * Feature-local per-branch availability toggle grid (ADM-003 — NOT extracted;
 * a product-specific matrix, deferred from `data-table` per Decision 1). Lists
 * every branch and toggles `is_available` for this product via the upsert
 * endpoint (Decision 3 `.onConflictDoUpdate()`). A branch with NO availability
 * row is treated as unavailable (the order-placement path requires a row with
 * `is_available = true`). One PATCH per toggle — acceptable for a low-cardinality
 * admin grid; the accepted Known-Gap is no realtime sync across sessions.
 */
interface ProductAvailabilityEditorProps {
  productId: string;
}

export function ProductAvailabilityEditor({ productId }: ProductAvailabilityEditorProps) {
  const branchesQuery = useAdminBranches();
  const availabilityQuery = useProductAvailability(productId);
  const setMutation = useSetAvailability(productId);

  const availableByBranch = new Map(
    (availabilityQuery.data ?? []).map((row) => [row.branchId, row.isAvailable]),
  );

  const isLoading = branchesQuery.isLoading || availabilityQuery.isLoading;
  const error = branchesQuery.error ?? availabilityQuery.error;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-h3">Branch availability</h2>

      <QueryStates
        isLoading={isLoading}
        error={error}
        isEmpty={!branchesQuery.data || branchesQuery.data.length === 0}
        loadingLabel="Loading branches…"
        errorLabel="Failed to load availability"
        emptyLabel="No branches yet — create a branch first."
      >
        <ul className="flex flex-col gap-1">
          {branchesQuery.data?.map((branch) => {
            const isAvailable = availableByBranch.get(branch.id) ?? false;
            const pending = setMutation.isPending && setMutation.variables?.branchId === branch.id;
            return (
              <li
                key={branch.id}
                className="flex items-center justify-between rounded-md border-2 border-foreground/20 px-3 py-2 text-sm"
              >
                <span>
                  {branch.name}{' '}
                  <span className={isAvailable ? 'text-primary' : 'text-muted-foreground'}>
                    · {isAvailable ? 'Available' : 'Unavailable'}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={isAvailable ? 'destructive' : 'secondary'}
                  isLoading={pending}
                  onClick={() =>
                    setMutation.mutate({ branchId: branch.id, isAvailable: !isAvailable })
                  }
                >
                  {isAvailable ? 'Make unavailable' : 'Make available'}
                </Button>
              </li>
            );
          })}
        </ul>
      </QueryStates>

      {setMutation.error instanceof Error ? (
        <p role="alert" className="text-sm text-destructive">
          {setMutation.error.message}
        </p>
      ) : null}
    </section>
  );
}
