import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(dashboard)/orders')({
  component: OrdersLayout,
});

/**
 * Orders layout route (ADM-006). TanStack file-based routing nests the list
 * (`orders.index.tsx`) and the detail (`orders.$orderId.tsx`) under this route via
 * the shared `orders.` filename prefix. This thin layout exists only to provide the
 * `<Outlet/>` the children paint into — applied from the START per the durable
 * TanStack Start nested-route gotcha (a child mounts nowhere without a parent
 * `<Outlet/>`). Inherits the `(dashboard)` admin guard.
 */
function OrdersLayout() {
  return <Outlet />;
}
