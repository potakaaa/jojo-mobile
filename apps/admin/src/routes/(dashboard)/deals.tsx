import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(dashboard)/deals')({
  component: DealsLayout,
});

/**
 * Deals layout route (ADM-004). TanStack file-based routing nests both the list
 * (`deals.index.tsx`) and the detail (`deals.$dealId.tsx`) under this route via
 * the shared `deals.` filename prefix. This thin layout exists only to provide
 * the `<Outlet/>` those children paint into — applied from the START per the
 * durable TanStack Start nested-detail-route gotcha (a `foo.$id.tsx` child mounts
 * nowhere without a parent `<Outlet/>`). Inherits the `(dashboard)` admin guard.
 */
function DealsLayout() {
  return <Outlet />;
}
