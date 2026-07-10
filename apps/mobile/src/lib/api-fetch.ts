import { env } from '@/config/env';

/**
 * Minimal typed fetch wrapper. Prepends `env.apiUrl` to `path`, throws on a
 * non-2xx response, and returns the parsed JSON cast to `T`. No retry, no
 * interceptors, no auth header.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
