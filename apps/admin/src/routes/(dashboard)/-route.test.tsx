import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { isRedirect } from '@tanstack/react-router';

import { Route } from './route';

/**
 * Guard + sidebar-state tests for the `(dashboard)` layout route.
 *
 * NOTE the leading `-` in this filename: any test file placed directly inside
 * `apps/admin/src/routes/` is otherwise swept into TanStack Start's file-based
 * route generator and becomes a bogus route (default `routeFileIgnorePrefix`
 * is `-`). Vitest still discovers it via the `*.test.tsx` glob.
 *
 * `createFileRoute(path)(options)` is a plain factory and `redirect()` throws a
 * plain `Response`, so `Route.options.beforeLoad()` / `Route.options.loader()`
 * can be invoked directly with a mocked `fetch` — no router test harness needed.
 *
 * These prove the guard's DECISION LOGIC (fetch outcome -> redirect/allow) and
 * the cookie-parse fallback. They do NOT prove the SSR timing fix end-to-end —
 * that needs a real browser hard-refresh and is covered by user-run Agent-Probe.
 */

const beforeLoad = () => (Route.options.beforeLoad as unknown as () => Promise<void>)();
const loader = () => (Route.options.loader as unknown as () => boolean)();

function clearSidebarCookie() {
  document.cookie = 'sidebar_state=; path=/; max-age=0';
}

beforeEach(clearSidebarCookie);

afterEach(() => {
  vi.unstubAllGlobals();
  clearSidebarCookie();
});

// --- beforeLoad guard (AC1/AC2) ---------------------------------------------

test('redirects to /login when GET /api/admin/me returns 403', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

  const err = await beforeLoad().then(
    () => null,
    (e: unknown) => e,
  );

  expect(err).not.toBeNull();
  expect(isRedirect(err)).toBe(true);
  expect((err as { options: { to: string } }).options.to).toBe('/login');
});

test('does not redirect when GET /api/admin/me returns 200', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

  await expect(beforeLoad()).resolves.toBeUndefined();
});

test('redirects to /login when the fetch itself fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

  const err = await beforeLoad().then(
    () => null,
    (e: unknown) => e,
  );

  expect(isRedirect(err)).toBe(true);
  expect((err as { options: { to: string } }).options.to).toBe('/login');
});

test('sends the session cookie with the /api/admin/me check', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  await beforeLoad();

  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/admin/me'), {
    credentials: 'include',
  });
});

// --- readSidebarState fallback semantics (AC3), exercised via the loader ----

test('sidebar state defaults to open when the cookie is missing', () => {
  expect(loader()).toBe(true);
});

test('sidebar state is open for a "true" or otherwise unrecognised cookie', () => {
  document.cookie = 'sidebar_state=true; path=/';
  expect(loader()).toBe(true);

  clearSidebarCookie();
  document.cookie = 'sidebar_state=garbage; path=/';
  expect(loader()).toBe(true);
});

test('sidebar state is closed only for an explicit "false" cookie', () => {
  document.cookie = 'sidebar_state=false; path=/';
  expect(loader()).toBe(false);
});

test('sidebar state reads its own key when other cookies are present', () => {
  document.cookie = 'other=false; path=/';
  document.cookie = 'sidebar_state=false; path=/';
  document.cookie = 'trailing=true; path=/';

  expect(loader()).toBe(false);

  document.cookie = 'other=; path=/; max-age=0';
  document.cookie = 'trailing=; path=/; max-age=0';
});
