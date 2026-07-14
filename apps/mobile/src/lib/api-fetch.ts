import { env } from '@/config/env';

/** Default request timeout: aborts a fetch that never settles so callers can't
 * hang forever (e.g. a screen stuck on its loading spinner). */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Minimal typed fetch wrapper. Prepends `env.apiUrl` to `path`, throws on a
 * non-2xx response, and returns the parsed JSON cast to `T`. No retry, no
 * interceptors, no auth header.
 *
 * A caller-supplied `init.signal` is honoured; independently, a default timeout
 * aborts the request if it hangs. The timeout is always cleared once the request
 * settles.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  // Chain a caller-provided signal into our controller so either source can
  // cancel the request.
  const external = init?.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(`${env.apiUrl}${path}`, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}
