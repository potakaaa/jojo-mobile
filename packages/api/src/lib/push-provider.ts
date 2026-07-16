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
 * transaction that triggered it. Callers (e.g. the staff order-status PATCH
 * handler) currently await this synchronously, so each send is bounded by
 * `SEND_TIMEOUT_MS` — a slow/hanging provider caps the caller's wait instead of
 * blocking it indefinitely. (Full out-of-band/queued delivery is a larger infra
 * decision deliberately deferred — see PUSH-004 plan's INNOVATE notes on the
 * scheduler substrate for the same reasoning.)
 */
export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Per-token outcome of a `sendPush` call. Consumed ONLY by `sendAndPrune`
 * (`notification-dispatch.ts`) to decide which `device_tokens` rows to prune.
 * `errorType` carries the Expo ticket error code (e.g. `DeviceNotRegistered`)
 * when `status === 'error'`.
 */
export interface PushSendResult {
  token: string;
  status: 'ok' | 'error';
  errorType?: string;
}

/**
 * Expo ticket error codes that mean the token is PERMANENTLY dead and its
 * `device_tokens` row should be pruned. Transient errors (rate-limit, provider
 * hiccup, message-too-big) are intentionally excluded — only a token that will
 * never deliver again is removed.
 */
export const PERMANENT_PUSH_ERROR_CODES: ReadonlySet<string> = new Set(['DeviceNotRegistered']);

/** True when an Expo ticket error code means the token is permanently invalid. */
export function isPermanentPushError(errorType?: string): boolean {
  return errorType !== undefined && PERMANENT_PUSH_ERROR_CODES.has(errorType);
}

const SEND_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T | void> {
  return Promise.race([
    promise,
    new Promise<void>((resolve) => setTimeout(() => resolve(onTimeout()), ms)),
  ]);
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
export async function sendPush(
  tokens: string[],
  notification: PushPayload,
): Promise<PushSendResult[]> {
  const accessToken = process.env.EXPO_ACCESS_TOKEN;

  if (!accessToken) {
    console.log('[push] would send (EXPO_ACCESS_TOKEN unset):', {
      recipients: tokens.length,
      title: notification.title,
    });
    // Log-fallback: no live call, no per-token error possible. Report every
    // input token as 'ok' so this path can NEVER trigger a prune (plan Risk #4).
    return tokens.map((token) => ({ token, status: 'ok' }));
  }

  // Drop malformed tokens before hitting the network.
  const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));
  if (validTokens.length === 0) {
    console.log('[push] no valid Expo push tokens to send to');
    return tokens.map((token) => ({ token, status: 'ok' }));
  }

  const expo = new Expo({ accessToken });
  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    sound: 'default',
    title: notification.title,
    body: notification.body,
    // Background/killed-app delivery: 'high' priority + content-available wakes
    // the app to process the notification instead of relying purely on the OS's
    // default visible-alert handling.
    priority: 'high',
    _contentAvailable: true,
    ...(notification.data ? { data: notification.data } : {}),
  }));

  // Chunk even a single message — the SDK enforces its own batch-size limits.
  const chunks = expo.chunkPushNotifications(messages);
  const results: PushSendResult[] = [];
  try {
    for (const chunk of chunks) {
      let timedOut = false;
      const tickets = await withTimeout(
        expo.sendPushNotificationsAsync(chunk),
        SEND_TIMEOUT_MS,
        () => {
          timedOut = true;
          console.error('[push] send timed out', { recipients: chunk.length });
        },
      );

      if (timedOut || !Array.isArray(tickets)) {
        // Transient — treat every token in this (and any later) chunk as 'ok',
        // never prune on a timeout/hang.
        for (const message of chunk) {
          results.push({ token: tokenOf(message), status: 'ok' });
        }
        break;
      }

      // Correlate each ticket to its token by position WITHIN this chunk (nth
      // ticket ↔ nth message — SDK contract). The token is recovered from the
      // message we actually sent (built from validTokens), NEVER by zipping
      // against the raw `tokens` argument, which may contain filtered-out
      // non-Expo tokens and misalign indices (plan Risk #6 / checklist #5a).
      // Prefer the token the SDK echoes back on an error ticket when present.
      tickets.forEach((ticket, i) => {
        const message = chunk[i];
        const positionalToken = message ? tokenOf(message) : '';
        if (ticket.status === 'error') {
          const token = ticket.details?.expoPushToken ?? positionalToken;
          results.push({ token, status: 'error', errorType: ticket.details?.error });
        } else {
          results.push({ token: positionalToken, status: 'ok' });
        }
      });
    }
  } catch (err) {
    // Swallow: a push transport failure must never break the caller's flow.
    console.error('[push] send failed', err);
  }

  return results;
}

/** Recover the single recipient token from a constructed message. */
function tokenOf(message: ExpoPushMessage): string {
  return Array.isArray(message.to) ? (message.to[0] ?? '') : message.to;
}
