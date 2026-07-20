import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

import { env } from '@/config/env';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';

/**
 * Read the persisted sidebar collapse state from the browser's own cookie. The
 * sidebar primitive writes `sidebar_state` via a plain `document.cookie`
 * assignment (not `HttpOnly`), so it is readable from client JS.
 *
 * This used to be a `createServerFn` reading the cookie server-side, to keep
 * server-rendered HTML and client hydration in agreement. That is no longer
 * needed: this route sets `ssr: false` (see below), so there is no
 * server-rendered HTML to mismatch against — the loader runs once on the
 * client, synchronously, before the sidebar mounts. Reading `document.cookie`
 * directly also avoids an RPC round-trip before the sidebar can paint.
 *
 * Fallback semantics are unchanged from the old server-side read: an absent or
 * unrecognised cookie means open; only an explicit `'false'` closes.
 */
function readSidebarState(): boolean {
  if (typeof document === 'undefined') return true; // non-browser eval guard only
  const match = document.cookie.match(/(?:^|; )sidebar_state=([^;]*)/);
  return match?.[1] !== 'false';
}

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
 * must run client-side because the browser holds the session cookie, and that
 * cookie belongs to the API's origin — it is never attached to this app's own
 * SSR page request, so a server-side check here would always false-negative.
 * Making this a server-side check requires a same-origin/reverse-proxy change
 * first; do not "fix" it back without that.
 *
 * Hence `ssr: false`: with SSR enabled the server resolved `beforeLoad` to a
 * no-op and hydration REUSED that resolved match, so a hard load / direct URL /
 * refresh rendered the dashboard shell without ever running the guard. With
 * `ssr: false` the whole `(dashboard)` subtree renders client-only and
 * `beforeLoad` genuinely executes on EVERY load, closing that gap. The flag
 * cascades to every child route in the group, so children need not repeat it.
 */
export const Route = createFileRoute('/(dashboard)')({
  ssr: false,
  beforeLoad: async () => {
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
  loader: () => readSidebarState(),
  component: DashboardLayout,
});

function DashboardLayout() {
  const defaultOpen = Route.useLoaderData();
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <main className="flex min-h-screen w-full flex-col bg-background">
        <div className="flex items-center p-4 md:hidden">
          <SidebarTrigger />
        </div>
        <div className="flex-1 p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  );
}
