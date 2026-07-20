import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(dashboard)/rewards')({
  component: RewardsLayout,
});

/**
 * Rewards layout route (ADM-005). TanStack file-based routing nests the list
 * (`rewards.index.tsx`) under this route via the shared `rewards.` filename prefix.
 * This thin layout exists only to provide the `<Outlet/>` the index paints into —
 * applied from the START per the durable TanStack Start nested-route gotcha (a
 * child mounts nowhere without a parent `<Outlet/>`). Inherits the `(dashboard)`
 * admin guard.
 */
function RewardsLayout() {
  return <Outlet />;
}
