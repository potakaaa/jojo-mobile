import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

import { env } from '@/config/env';

/**
 * Pathless `(dashboard)` layout route. Its `beforeLoad` guard wraps EVERY child
 * route in the group. Later phases (ADM-002..007) ADD sibling child routes here
 * — they never restructure this layout.
 *
 * The guard verifies the session against the REAL server (`GET /api/admin/me`),
 * NOT a client-cached role flag: `GET /api/admin/me` returns 403 for both the
 * unauthenticated case AND the authenticated-but-not-admin case (customer/staff)
 * — either way a non-OK response redirects to `/login` (a rejection, never a
 * silent fallback). admin/super_admin get 200 → the shell renders.
 *
 * This client gate is convenience ONLY — the source of truth is `requireAdmin`
 * on the server, which independently guards every `/api/admin/*` call. The check
 * runs client-side (the browser holds the HttpOnly session cookie); it is skipped
 * during SSR, where the cookie is not forwarded and the check would false-negative.
 */
export const Route = createFileRoute('/(dashboard)')({
  beforeLoad: async () => {
    if (typeof document === 'undefined') return; // SSR: defer to client + server guard.

    let res: Response;
    try {
      res = await fetch(`${env.apiUrl}/api/admin/me`, { credentials: 'include' });
    } catch {
      throw redirect({ to: '/login' });
    }
    if (!res.ok) {
      throw redirect({ to: '/login' });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  return <Outlet />;
}
