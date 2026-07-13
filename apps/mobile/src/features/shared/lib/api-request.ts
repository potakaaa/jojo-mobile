import { env } from '@/config/env';
import { authClient } from '@/features/auth/lib/auth-client';

/**
 * Shared fetch wrapper for the custom `packages/api` app routes (branches /
 * menu / orders). Rides `authClient.$fetch` so requests reuse the persisted
 * better-auth session (cookie/bearer) and the ngrok header configured on the
 * client — no separate auth wiring per feature. Public reads work the same way
 * (the session header is simply ignored server-side).
 *
 * The `path` is resolved to an ABSOLUTE URL against `env.apiUrl` before hitting
 * `$fetch`. This is deliberate: the auth client's own base URL points at
 * better-auth's `/api/auth` mount, so a bare relative path (e.g. `/orders`)
 * would be sent to `{apiUrl}/api/auth/orders` and 404. Passing a full URL makes
 * better-fetch skip the auth base and hit the real app route (`{apiUrl}/orders`)
 * while still attaching the session.
 *
 * Throws a plain `Error` on any non-2xx / transport failure so callers can use
 * one try/catch (or a data hook) instead of threading `{ data, error }`.
 */
export async function apiRequest<T>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const { data, error } = await authClient.$fetch<T>(`${env.apiUrl}${path}`, {
    method: options?.method ?? 'GET',
    ...(options?.body !== undefined ? { body: options.body } : {}),
  });

  if (error) {
    const status = error.status ? ` (${error.status})` : '';
    throw new Error(error.message ?? `Request failed${status}: ${path}`);
  }

  return data as T;
}
