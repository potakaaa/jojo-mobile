import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(dashboard)/customers')({
  component: CustomersLayout,
});

/**
 * Customers layout route (ADM-010). TanStack file-based routing nests the list
 * (`customers.index.tsx`) and the detail (`customers.$customerId.tsx`) under this
 * route via the shared `customers.` filename prefix. This thin layout exists only
 * to provide the `<Outlet/>` the children paint into — applied from the START per
 * the durable TanStack Start nested-route gotcha (a child mounts nowhere without a
 * parent `<Outlet/>`). Inherits the `(dashboard)` admin guard.
 */
function CustomersLayout() {
  return <Outlet />;
}
