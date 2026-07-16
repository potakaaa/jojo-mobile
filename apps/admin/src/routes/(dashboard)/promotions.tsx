import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(dashboard)/promotions')({
  component: PromotionsLayout,
});

/**
 * Promotions layout route (ADM-008). Thin `<Outlet/>` layout so the index route
 * (`promotions.index.tsx`) mounts into it — applied from the START per the durable
 * TanStack Start nested-route gotcha (a child under a shared filename prefix
 * mounts nowhere without a parent `<Outlet/>`). Inherits the `(dashboard)` admin
 * guard.
 */
function PromotionsLayout() {
  return <Outlet />;
}
