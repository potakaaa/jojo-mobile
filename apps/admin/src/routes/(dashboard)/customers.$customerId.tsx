import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';

import { PageHeader } from '@/components/page-header';
import { QueryStates } from '@/components/query-states';
import { CustomerDetail } from '@/features/customers/components/customer-detail';
import { AdminApiError } from '@/features/customers/lib/admin-customers-api';
import { useAdminCustomer } from '@/features/customers/hooks/use-admin-customers';

export const Route = createFileRoute('/(dashboard)/customers/$customerId')({
  component: CustomerDetailPage,
});

/**
 * Customer detail screen (ADM-010) — READ-ONLY. Sibling child route of
 * `(dashboard)`, admin-guarded, mounted into `customers.tsx`'s `<Outlet/>`. A 404
 * from the API (unknown id, or a non-customer id) renders a clear not-found state
 * via `QueryStates` (mirrors ADM-006's precedent), not a raw error dump. No action
 * controls — this is a lookup surface (SPEC "Out Of Scope").
 */
function CustomerDetailPage() {
  const { customerId } = useParams({ from: '/(dashboard)/customers/$customerId' });
  const navigate = useNavigate();
  const customerQuery = useAdminCustomer(customerId);
  const customer = customerQuery.data;
  // A 404 (unknown or non-customer id) is a "not found" empty state, not a load
  // failure — fold it into isEmpty and suppress the error branch so QueryStates
  // shows the emptyLabel. Any other error still surfaces as an error.
  const isNotFound =
    customerQuery.error instanceof AdminApiError && customerQuery.error.status === 404;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader
        title="Customer"
        backLabel="← Customers"
        onBack={() => void navigate({ to: '/customers' })}
      />

      <QueryStates
        isLoading={customerQuery.isLoading}
        error={isNotFound ? null : customerQuery.error}
        isEmpty={!customer || isNotFound}
        loadingLabel="Loading customer…"
        errorLabel="Failed to load customer"
        emptyLabel="Customer not found."
      >
        {customer ? <CustomerDetail customer={customer} /> : null}
      </QueryStates>
    </main>
  );
}
