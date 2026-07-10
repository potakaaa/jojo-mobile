import { expoClient } from '@better-auth/expo/client';
import {
  inferAdditionalFields,
  magicLinkClient,
  phoneNumberClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { env } from '@/config/env';

/**
 * better-auth client for the mobile app. Talks to the `packages/api` server
 * (`{apiUrl}/api/auth/*`). Session token is persisted in the device keychain via
 * `expo-secure-store` (through the `expoClient` plugin), so sessions survive app
 * restarts until explicit sign-out.
 *
 * `inferAdditionalFields` mirrors the server's read-only `role` field so
 * `session.user.role` is typed WITHOUT importing any server code into the bundle.
 */
export const authClient = createAuthClient({
  baseURL: env.apiUrl,
  // Skip free-tier ngrok's HTML browser-warning interstitial so API responses stay JSON.
  fetchOptions: {
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
  },
  plugins: [
    expoClient({
      scheme: 'jojopotato',
      storagePrefix: 'jojopotato',
      storage: SecureStore,
    }),
    phoneNumberClient(),
    magicLinkClient(),
    inferAdditionalFields({
      user: {
        // Read-only on the client too (mirrors the server's `input: false`), so
        // `role` is never a required/allowed signup input — it is server-owned.
        role: { type: 'string', input: false },
      },
    }),
  ],
});
