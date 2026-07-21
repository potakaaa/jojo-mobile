import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(dashboard)/staff')({
  component: StaffLayout,
});

/**
 * Staff layout route (ADM-009). TanStack file-based routing nests the list
 * (`staff.index.tsx`) under this route via the shared `staff.` filename prefix.
 * This thin layout exists only to provide the `<Outlet/>` the index paints into —
 * applied from the START per the durable TanStack Start nested-route gotcha (a
 * child mounts nowhere without a parent `<Outlet/>`). Inherits the `(dashboard)`
 * admin guard.
 */
function StaffLayout() {
  return <Outlet />;
}
