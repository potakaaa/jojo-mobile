import { env } from '@/config/env';
import { authClient } from '@/features/auth/lib/auth-client';

/**
 * DEV-ONLY auto-login (client side).
 *
 * In local development, ask the API's `/dev/session` endpoint for a magic-link
 * token for the server-configured dev account, then verify it through the app's
 * own `authClient` — the SAME real verification path the emailed link would use
 * — so the expo client stores the session itself. This skips the login screen;
 * it never forges a session. A plain fetch cannot establish the session cookie:
 * only a request made THROUGH authClient persists it.
 *
 * Guarded by `__DEV__`, so Metro strips it from production bundles. It fails
 * closed and silently: a 404 (route not registered — plain `pnpm dev`) or any
 * thrown error returns false, leaving the normal login path untouched. This must
 * NEVER break normal login.
 */
export async function tryDevAutoLogin(): Promise<boolean> {
  if (!__DEV__) return false;

  try {
    const res = await fetch(`${env.apiUrl}/dev/session`, { method: 'POST' });

    if (!res.ok) {
      // 404 is the normal "auto-login not enabled" case — stay silent. Only warn
      // on unexpected failures.
      if (res.status !== 404) {
        console.warn(`[dev-auto-login] unavailable (HTTP ${res.status})`);
      }
      return false;
    }

    const { token } = (await res.json()) as { token?: string };
    if (!token) return false;

    const { error } = await authClient.magicLink.verify({ query: { token } });
    return !error;
  } catch (err) {
    console.warn('[dev-auto-login] failed', err);
    return false;
  }
}
