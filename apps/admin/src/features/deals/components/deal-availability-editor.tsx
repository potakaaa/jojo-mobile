import { QueryStates } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { useAdminBranches } from '@/features/branches/hooks/use-admin-branches';

import { useDealAvailability, useSetDealAvailability } from '../hooks/use-admin-deals';

/**
 * Per-branch availability toggle grid for a deal-product (post-merge Fix 4). Ports
 * the products `ProductAvailabilityEditor` verbatim (a deal is a product), but uses
 * the deal-scoped hooks so every toggle also refreshes the deal's visibility badge
 * counts. A deal is ONLY visible on the customer menu at branches where it has an
 * `is_available = true` row — so a deal with zero available branches is invisible
 * everywhere, which the list/detail status badge flags.
 */
interface DealAvailabilityEditorProps {
  dealId: string;
}

export function DealAvailabilityEditor({ dealId }: DealAvailabilityEditorProps) {
  const branchesQuery = useAdminBranches();
  const availabilityQuery = useDealAvailability(dealId);
  const setMutation = useSetDealAvailability(dealId);

  const availableByBranch = new Map(
    (availabilityQuery.data ?? []).map((row) => [row.branchId, row.isAvailable]),
  );

  const isLoading = branchesQuery.isLoading || availabilityQuery.isLoading;
  const error = branchesQuery.error ?? availabilityQuery.error;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-h3">Branch availability</h2>
      <p className="text-sm text-muted-foreground">
        A deal only shows on the customer menu at branches where it is available.
      </p>

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
