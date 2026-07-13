import { authClient } from '@/features/auth/lib/auth-client';

/**
 * Shared fetch wrapper for the custom `packages/api` routes (branches / menu /
 * orders). Rides `authClient.$fetch`, so requests reuse the persisted
 * better-auth session (cookie/bearer) and the base URL / ngrok header already
 * configured on the client — no separate auth wiring per feature. Public reads
 * work the same way (the session header is simply ignored server-side).
 *
 * Throws a plain `Error` on any non-2xx / transport failure so callers can use
 * one try/catch (or a data hook) instead of threading `{ data, error }`.
 */
export async function apiRequest<T>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const { data, error } = await authClient.$fetch<T>(path, {
    method: options?.method ?? 'GET',
    ...(options?.body !== undefined ? { body: options.body } : {}),
  });

  if (error) {
    const status = error.status ? ` (${error.status})` : '';
    throw new Error(error.message ?? `Request failed${status}: ${path}`);
  }

  return data as T;
}
