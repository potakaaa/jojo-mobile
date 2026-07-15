import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(dashboard)/products')({
  component: ProductsLayout,
});

/**
 * Products layout route (ADM-003). TanStack file-based routing nests both the
 * list (`products.index.tsx`) and the detail (`products.$productId.tsx`) under
 * this route because of the shared `products.` filename prefix. This layout
 * exists only to provide the `<Outlet/>` those children paint into — without
 * it, navigating to `/products/$productId` matches the route but has nowhere
 * to render (the original AC8 bug). Inherits the `(dashboard)` admin guard.
 */
function ProductsLayout() {
  return <Outlet />;
}
