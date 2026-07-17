import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(dashboard)/offers')({
  component: OffersLayout,
});

/**
 * Offers layout route (ADM-008). TanStack file-based routing nests both the list
 * (`offers.index.tsx`) and the detail (`offers.$offerId.tsx`) under this route via
 * the shared `offers.` filename prefix. This thin layout exists only to provide
 * the `<Outlet/>` those children paint into — applied from the START per the
 * durable TanStack Start nested-detail-route gotcha (a `foo.$id.tsx` child mounts
 * nowhere without a parent `<Outlet/>`). Inherits the `(dashboard)` admin guard.
 */
function OffersLayout() {
  return <Outlet />;
}
