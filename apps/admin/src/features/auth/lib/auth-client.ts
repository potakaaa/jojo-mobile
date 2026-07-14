import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { env } from '@/config/env';

/**
 * better-auth BROWSER client for the admin web app. Talks to the same
 * `packages/api` mount the Expo app uses (`{apiUrl}/api/auth/*`), but is a plain
 * cookie-session client — ZERO plugins (no `@better-auth/expo`, no cookie-cache /
 * `nextCookies` tweak). The Step 0 feasibility probe (VIABLE) proved the default
 * `better-auth.session_token` cookie round-trips end-to-end with no extra plugin.
 *
 * The browser persists the `HttpOnly` session cookie natively — no secure-store.
 * `credentials: 'include'` is required so the cookie is sent/accepted on the
 * cross-origin request (admin dev port → API port), paired with the server's
 * CORS `credentials: true` + `trustedOrigins` entry added in Phase 1 Step 3.
 *
 * `inferAdditionalFields` mirrors the server's read-only `role` field so
 * `session.user.role` is typed WITHOUT importing any server code into the bundle.
 */
export const authClient = createAuthClient({
  baseURL: env.apiUrl,
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [
    inferAdditionalFields({
      user: {
        // Read-only on the client (mirrors the server's `input: false`) — `role`
        // is server-owned and never a settable signup/update input.
        role: { type: 'string', input: false },
      },
    }),
  ],
});
