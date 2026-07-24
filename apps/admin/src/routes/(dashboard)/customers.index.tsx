import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { CustomerList } from '@/features/customers/components/customer-list';
import { useAdminCustomers } from '@/features/customers/hooks/use-admin-customers';
import { useDebouncedValue } from '@/features/customers/hooks/use-debounced-value';

export const Route = createFileRoute('/(dashboard)/customers/')({
  component: CustomersPage,
});

/**
 * Customers list screen (ADM-010) — READ-ONLY customer directory. Index route of
 * the `/customers` layout, rendered inside `customers.tsx`'s `<Outlet/>`. Owns the
 * search + query state: the raw search value is debounced before it drives
 * `useAdminCustomers` (so keystrokes don't fire a request each). "View" navigates
 * to the customer detail; "Load more" walks the cursor via `useInfiniteQuery`.
 * Inherits the `(dashboard)` admin guard.
 */
function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const customersQuery = useAdminCustomers(debouncedSearch);

  const customers = customersQuery.data?.pages.flatMap((p) => p.customers);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader title="Customers" onBack={() => void navigate({ to: '/' })} />

      <CustomerList
        customers={customers}
        isLoading={customersQuery.isLoading}
        error={customersQuery.error}
        search={search}
        onSearchChange={setSearch}
        onView={(customer) =>
          void navigate({ to: '/customers/$customerId', params: { customerId: customer.id } })
        }
      />

      {customersQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            isLoading={customersQuery.isFetchingNextPage}
            onClick={() => void customersQuery.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </main>
  );
}
