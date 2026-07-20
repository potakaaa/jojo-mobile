import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useAdminBranches } from '@/features/branches/hooks/use-admin-branches';
import { OrderFilterBar } from '@/features/orders/components/order-filter-bar';
import { OrderList } from '@/features/orders/components/order-list';
import { useAdminOrders } from '@/features/orders/hooks/use-admin-orders';
import type { OrderFilters } from '@/features/orders/lib/admin-orders-api';

export const Route = createFileRoute('/(dashboard)/orders/')({
  component: OrdersPage,
});

/**
 * Orders list screen (ADM-006) — READ-ONLY cross-branch oversight. Index route of
 * the `/orders` layout, rendered inside `orders.tsx`'s `<Outlet/>`. Reuses the
 * shared `PageHeader` and `DataTable` (via `OrderList`) composites; the filter bar
 * is feature-local (D7). No primary action — read-only, no create path. "View"
 * navigates to the order detail. "Load more" walks the cursor via
 * `useInfiniteQuery`. Inherits the `(dashboard)` admin guard.
 */
function OrdersPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<OrderFilters>({});
  const branchesQuery = useAdminBranches();
  const ordersQuery = useAdminOrders(filters);

  const orders = ordersQuery.data?.pages.flatMap((p) => p.orders);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader title="Orders" onBack={() => void navigate({ to: '/' })} />

      <OrderFilterBar
        filters={filters}
        branches={branchesQuery.data}
        onChange={setFilters}
        onReset={() => setFilters({})}
      />

      <OrderList
        orders={orders}
        isLoading={ordersQuery.isLoading}
        error={ordersQuery.error}
        onView={(order) => void navigate({ to: '/orders/$orderId', params: { orderId: order.id } })}
      />

      {ordersQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            isLoading={ordersQuery.isFetchingNextPage}
            onClick={() => void ordersQuery.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </main>
  );
}
