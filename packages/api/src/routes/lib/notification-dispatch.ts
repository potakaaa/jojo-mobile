import type {
  MarketingNotificationType,
  NotificationTargetScreen,
  OrderNotificationType,
} from '@jojopotato/types';
import { and, eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { deviceTokens, notifications, orders, users } from '../../db/schema/index';
import { isPermanentPushError, sendPush, type PushPayload } from '../../lib/push-provider';

type OrderRow = typeof orders.$inferSelect;

/**
 * The 4 transactional order events that fire a customer push. Narrowed from the
 * old `'completed' | 'rejected' | 'cancelled'` stub signature — this is an
 * INTERNAL contract confined to `staff.ts`'s call sites (not a public API).
 */
export type OrderNotificationEvent = 'accepted' | 'preparing' | 'ready' | 'cancelled';

const EVENT_TO_TYPE: Record<OrderNotificationEvent, OrderNotificationType> = {
  accepted: 'order_accepted',
  preparing: 'order_preparing',
  ready: 'order_ready',
  cancelled: 'order_cancelled',
};

/** Static copy per order transition (mirrors the mobile `ORDER_COPY`, PRD §6.12/§14). */
const ORDER_COPY: Record<OrderNotificationType, { title: string; body: string }> = {
  order_accepted: { title: 'Order accepted', body: 'Your order has been accepted and is queued.' },
  order_preparing: { title: 'Order being prepared', body: 'The kitchen is preparing your order.' },
  order_ready: {
    title: 'Order ready for pickup',
    body: 'Your order is ready — head to the branch!',
  },
  order_cancelled: { title: 'Order cancelled', body: 'Your order was cancelled.' },
};

/** All order notifications deep-link to the order tracking screen. */
const ORDER_TARGET_SCREEN: NotificationTargetScreen = 'order_tracking';

/**
 * Load the Expo push tokens registered for a user.
 */
async function loadPushTokens(userId: string): Promise<string[]> {
  const rows = await db
    .select({ push_token: deviceTokens.push_token })
    .from(deviceTokens)
    .where(eq(deviceTokens.user_id, userId));
  return rows.map((row) => row.push_token);
}

/**
 * Send a push to `tokens`, then hard-delete the `device_tokens` row for any
 * token the provider reported as PERMANENTLY dead (`DeviceNotRegistered`).
 * Transient errors leave the row untouched. Shared by both dispatchers so the
 * pruning rule lives in exactly one place.
 *
 * Never throws — a prune failure (e.g. a DB error deleting the row) must not
 * break the caller's flow any more than a send failure does. The delete is
 * scoped by `push_token`, which is assumed globally unique per Expo push
 * registration (`device_tokens` has a unique index on `device_id`, NOT
 * `push_token`; Expo push tokens are themselves globally unique in practice, so
 * this removes exactly the one dead device's row — plan Risk #5).
 */
async function sendAndPrune(tokens: string[], payload: PushPayload): Promise<void> {
  const results = await sendPush(tokens, payload);
  for (const result of results) {
    if (result.status === 'error' && isPermanentPushError(result.errorType)) {
      try {
        await db.delete(deviceTokens).where(eq(deviceTokens.push_token, result.token));
      } catch (err) {
        console.error('[notify] token prune failed', err);
      }
    }
  }
}

/**
 * Real dispatcher behind `notifyCustomer` (PUSH-004). Writes exactly ONE
 * notification row for the transition and sends a push. Transactional
 * notifications are NEVER gated by marketing opt-in.
 *
 * Idempotency: the deterministic transition identity is `(type, orderId)` — a
 * given order transitions each status at most once. Enforced at the APPLICATION
 * layer via a SELECT-before-INSERT check (NOT a DB unique constraint on a derived
 * id column — the `notifications` PK stays a plain random uuid; see plan Public
 * Contracts). A duplicate identical transition writes/sends nothing.
 *
 * Never throws — a push/DB failure here must not break the order transition.
 */
export async function dispatchOrderNotification(
  order: OrderRow,
  event: OrderNotificationEvent,
): Promise<void> {
  try {
    const type = EVENT_TO_TYPE[event];
    const copy = ORDER_COPY[type];
    const targetParams = { orderId: order.id };

    // Application-layer dedupe on the deterministic (user_id, type, orderId) key.
    const priorRows = await db
      .select({ targetParams: notifications.target_params })
      .from(notifications)
      .where(and(eq(notifications.user_id, order.user_id), eq(notifications.type, type)));
    const alreadySent = priorRows.some(
      (row) => (row.targetParams as { orderId?: string } | null)?.orderId === order.id,
    );
    if (alreadySent) return;

    await db.insert(notifications).values({
      user_id: order.user_id,
      type,
      title: copy.title,
      body: copy.body,
      target_screen: ORDER_TARGET_SCREEN,
      target_params: targetParams,
    });

    const tokens = await loadPushTokens(order.user_id);
    await sendAndPrune(tokens, {
      title: copy.title,
      body: copy.body,
      data: { type, orderId: order.id },
    });
  } catch (err) {
    console.error('[notify] order notification dispatch failed', err);
  }
}

/** Payload for a marketing notification (target screen + optional route params). */
export interface MarketingPayload {
  title: string;
  body: string;
  targetScreen: NotificationTargetScreen;
  targetParams?: Record<string, string>;
}

/**
 * Dispatch a marketing notification (PUSH-003 will build the real campaigns; this
 * is the substrate). MUST check `marketing_opt_in` FIRST, unconditionally — no
 * code path (including scheduler-triggered calls) may bypass this gate (SPEC hard
 * constraint). Requires affirmative consent: only an explicit `true` opts in;
 * anything else (including a missing user) is treated as opted-out.
 *
 * Returns `true` when a notification was written+sent, `false` when gated out.
 */
export async function dispatchMarketingNotification(
  userId: string,
  type: MarketingNotificationType,
  payload: MarketingPayload,
): Promise<boolean> {
  const [user] = await db
    .select({ marketingOptIn: users.marketingOptIn })
    .from(users)
    .where(eq(users.id, userId));

  // Opt-in gate — unconditional. Only an explicit true opts in.
  const optedIn = user?.marketingOptIn === true;
  if (!optedIn) return false;

  await db.insert(notifications).values({
    user_id: userId,
    type,
    title: payload.title,
    body: payload.body,
    target_screen: payload.targetScreen,
    target_params: payload.targetParams ?? null,
  });

  const tokens = await loadPushTokens(userId);
  await sendAndPrune(tokens, {
    title: payload.title,
    body: payload.body,
    data: { type },
  });
  return true;
}
