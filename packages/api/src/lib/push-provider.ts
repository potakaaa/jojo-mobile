import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

/**
 * Push notification provider wrapper (PUSH-004 / #75).
 *
 * Sends Expo push notifications via `expo-server-sdk`. Mirrors the existing
 * `RESEND_API_KEY`-unset log-fallback precedent (`packages/api/src/lib/auth.ts`):
 * when `EXPO_ACCESS_TOKEN` is unset, the send is LOGGED instead of dispatched, so
 * local dev / CI never attempts a live outbound call and never needs credentials.
 *
 * `sendPush` NEVER throws — a push failure must not roll back or delay the order
 * transaction that triggered it.
 */
export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Send a push notification to the given Expo push tokens.
 *
 * - `EXPO_ACCESS_TOKEN` unset → log-instead-of-send fallback (ALWAYS exactly one
 *   log line per call, so callers/tests can observe a send attempt without a live
 *   provider). No `Expo` client is constructed and no HTTP call is made.
 * - Uses `chunkPushNotifications` even for a single recipient (vc-predict CAUTION
 *   item) — the SDK's batching contract is always honored.
 */
export async function sendPush(tokens: string[], notification: PushPayload): Promise<void> {
  const accessToken = process.env.EXPO_ACCESS_TOKEN;

  if (!accessToken) {
    console.log('[push] would send (EXPO_ACCESS_TOKEN unset):', {
      recipients: tokens.length,
      title: notification.title,
    });
    return;
  }

  // Drop malformed tokens before hitting the network.
  const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));
  if (validTokens.length === 0) {
    console.log('[push] no valid Expo push tokens to send to');
    return;
  }

  const expo = new Expo({ accessToken });
  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    sound: 'default',
    title: notification.title,
    body: notification.body,
    ...(notification.data ? { data: notification.data } : {}),
  }));

  // Chunk even a single message — the SDK enforces its own batch-size limits.
  const chunks = expo.chunkPushNotifications(messages);
  try {
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    // Swallow: a push transport failure must never break the caller's flow.
    console.error('[push] send failed', err);
  }
}
