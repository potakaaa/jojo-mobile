import { useEffect, useState } from 'react';
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
  pendingComponent: DashboardPending,
});

function DashboardLayout() {
  const defaultOpen = Route.useLoaderData();
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <main className="flex min-h-screen w-full flex-col bg-background">
        {/*
         * Mobile-only trigger. Below `md` the sidebar is an offcanvas sheet, so
         * its own header trigger is unreachable while closed — the opener has to
         * live out here. At `md` and up this row disappears and the sidebar
         * header owns the trigger, so exactly one is ever visible.
         */}
        <div className="flex items-center p-4 md:hidden">
          <SidebarTrigger />
        </div>
        {/*
         * Desktop restores its own top padding here, since the trigger row above
         * no longer supplies it at that breakpoint.
         */}
        <div className="flex-1 px-4 pb-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  );
}

/**
 * Delay before the pending state becomes visible, in ms.
 *
 * The auth round-trip is usually well under this, so on a healthy connection the
 * loader never paints at all — the user goes straight from the cream field to
 * the real shell, with no indicator flashing up and vanishing. Only a genuinely
 * slow check crosses the threshold and earns an indicator.
 */
const PENDING_REVEAL_MS = 160;

/**
 * Loading state for the whole `(dashboard)` subtree. NOT decoration — do not delete.
 *
 * Because this route sets `ssr: false`, the server sends no markup for this
 * subtree at all, and `beforeLoad` has to round-trip to `GET /api/admin/me`
 * before anything can render. Without a `pendingComponent` that window is a
 * blank page on every hard load / refresh / direct URL.
 *
 * Design notes, because the obvious choice here is the wrong one:
 *
 * - This is deliberately NOT a content skeleton. A skeleton is a promise about
 *   the shape of what is coming, and this component covers a route GROUP whose
 *   children (analytics, orders, products, deals…) look nothing like each other
 *   — so any content skeleton drawn here mispredicts almost every time, and
 *   resolves with a jarring re-layout. What is actually being awaited is an auth
 *   check, which is identical for every child route and has no shape at all.
 *
 * - So it renders only what is genuinely KNOWN: the sidebar column and its
 *   header, verbatim, because those are structurally identical on every child
 *   route. Those are not placeholders — they are the real chrome, so the real
 *   shell paints over them with no shift. Where content is UNKNOWN, it shows one
 *   honest activity indicator rather than fake rows.
 *
 * - The indicator is the brand's own press interaction (`animate-press`, see
 *   globals.css) on the same J tile the sidebar header uses, so the loader reads
 *   as this app rather than as a generic spinner bolted on.
 */
function DashboardPending() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), PENDING_REVEAL_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background" aria-busy="true">
      {/*
       * Sidebar column. Mirrors AppSidebar's 16rem width, 2px ink right border,
       * and header block — including the wordmark, which is real content here,
       * not a placeholder. Hidden below `md` to match the real sidebar.
       */}
      <div className="hidden w-64 shrink-0 flex-col border-r-2 border-foreground md:flex">
        <div className="border-b-2 border-foreground p-4">
          <div className="flex items-center gap-2 px-2 font-display text-h3 font-bold tracking-tight text-foreground">
            <span className="flex size-8 items-center justify-center rounded border-2 border-foreground bg-primary shadow-[2px_2px_0_var(--color-ink)]">
              J
            </span>
            Jojo Potato
          </div>
        </div>
      </div>

      {/* Content area — one activity indicator, revealed only on a slow check. */}
      <div className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div
          className={`flex flex-col items-center gap-4 transition-opacity duration-200 ${
            revealed ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-md border-2 border-foreground bg-primary font-display text-h1 font-bold text-foreground shadow-offset-md animate-press motion-reduce:animate-none"
          >
            J
          </span>
          <p
            role="status"
            aria-live="polite"
            className="font-display text-body-small font-semibold tracking-wide text-muted-foreground"
          >
            Checking your session…
          </p>
        </div>
      </div>
    </div>
  );
}
