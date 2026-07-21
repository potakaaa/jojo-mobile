import {
  MARKETING_NOTIFICATION_TYPES,
  type MarketingNotificationType,
  type NotificationTargetScreen,
  type OrderNotificationType,
} from '@jojopotato/types';
import { and, eq, gte, inArray } from 'drizzle-orm';

import { db } from '../../db/client';
import { deviceTokens, notifications, orders, users } from '../../db/schema/index';
import { isWithinQuietHours } from '../../lib/marketing-quiet-hours';
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

/**
 * Per-user marketing frequency cap (PUSH-005 / #82, D4, micro-decision 3). Code-
 * level constants (tunable; SPEC's "≤3/24h, ~1–4/month" — 8/30d is the upper-safe
 * end of that range). NOT admin-configurable (SPEC out of scope).
 */
export const MAX_PER_24H = 3;
export const MAX_PER_30D = 8;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

/**
 * The marketing types that COUNT toward the frequency cap (E4). Deliberately
 * EXCLUDES `reward_unlocked`: its in-app `notifications` row is written
 * UNCONDITIONALLY by `notifyRewardUnlocked` (it is NOT opt-in-gated), so counting
 * it would let an earned-reward unlock the customer never opted into suppress a
 * coupon-expiry reminder they did — spending budget it should not spend. AC10b
 * locks this decision.
 */
const CAP_COUNTED_TYPES: readonly MarketingNotificationType[] = MARKETING_NOTIFICATION_TYPES.filter(
  (t) => t !== 'reward_unlocked',
);

/** Discriminated outcome of a guarded marketing dispatch (for testability). */
export type MarketingDispatchResult =
  'sent' | 'gated-opt-out' | 'gated-quiet-hours' | 'gated-frequency';

/**
 * Count the user's cap-counted marketing `notifications` rows in the 24h and 30d
 * windows ending at `now`. One read over the 30d window; the 24h count is a
 * client-side partition of the same rows (avoids a second round-trip).
 */
async function countRecentMarketingNotifications(
  userId: string,
  now: Date,
): Promise<{ within24h: number; within30d: number }> {
  const since30d = new Date(now.getTime() - THIRTY_DAYS_MS);
  const since24h = new Date(now.getTime() - ONE_DAY_MS);
  const rows = await db
    .select({ created_at: notifications.created_at })
    .from(notifications)
    .where(
      and(
        eq(notifications.user_id, userId),
        inArray(notifications.type, [...CAP_COUNTED_TYPES]),
        gte(notifications.created_at, since30d),
      ),
    );
  let within24h = 0;
  for (const row of rows) {
    if (row.created_at >= since24h) within24h += 1;
  }
  return { within24h, within30d: rows.length };
}

/**
 * The ONLY entry point marketing triggers use (PUSH-005 / #82, D4). Wraps the
 * marketing send with the full gate chain, checked in this exact order:
 *   1. opt-in (`users.marketingOptIn === true`) — unconditional, FIRST.
 *   2. quiet hours (fixed Manila +08:00, `isWithinQuietHours(now)`) — DROP.
 *   3. frequency cap (24h / 30d windows over cap-counted marketing rows).
 *   4. send — insert the `notifications` row (unless `writeRow === false`) then
 *      `loadPushTokens` + `sendAndPrune`.
 *
 * ENTITY dedup (D2 — one-shot per user/window/deal) happens in each trigger
 * BEFORE calling this guard, NOT here — a gated (dropped) send writes no row, so a
 * poll trigger naturally re-attempts on the next non-quiet tick.
 *
 * `writeRow: false` (reward-unlocked push): the in-app row already exists
 * (`notifyRewardUnlocked` wrote it unconditionally), so this only runs the gates +
 * push send, never a second row. Reuses the module-private `loadPushTokens` /
 * `sendAndPrune` directly (E3) — it must NOT delegate to
 * `dispatchMarketingNotification` (which would re-run opt-in and always write a
 * row, breaking the `writeRow:false` path and double-counting).
 *
 * Transactional `dispatchOrderNotification` is NEVER routed through this guard —
 * order-status pushes are always delivered and never counted against the cap.
 *
 * Never throws (swallow + log, like its siblings) — fail-safe: on an unexpected
 * error nothing is sent and the caller's flow (a trigger scan / the reward-unlock
 * path) is never broken.
 */
export async function dispatchMarketingNotificationIfAllowed(
  userId: string,
  type: MarketingNotificationType,
  payload: MarketingPayload,
  opts: { now?: () => Date; writeRow?: boolean } = {},
): Promise<MarketingDispatchResult> {
  const now = opts.now ? opts.now() : new Date();
  const writeRow = opts.writeRow !== false; // default true
  try {
    // 1. Opt-in gate — unconditional, FIRST. Only an explicit true opts in.
    const [user] = await db
      .select({ marketingOptIn: users.marketingOptIn })
      .from(users)
      .where(eq(users.id, userId));
    if (user?.marketingOptIn !== true) return 'gated-opt-out';

    // 2. Quiet hours — drop entirely (no row, no send).
    if (isWithinQuietHours(now)) return 'gated-quiet-hours';

    // 3. Frequency cap — over cap-counted marketing rows only.
    const { within24h, within30d } = await countRecentMarketingNotifications(userId, now);
    if (within24h >= MAX_PER_24H || within30d >= MAX_PER_30D) return 'gated-frequency';

    // 4. Send. Insert the row unless the caller already wrote it (writeRow:false).
    if (writeRow) {
      await db.insert(notifications).values({
        user_id: userId,
        type,
        title: payload.title,
        body: payload.body,
        target_screen: payload.targetScreen,
        target_params: payload.targetParams ?? null,
        // Stamp created_at at the logical `now` so cap windows are consistent
        // across multiple guarded sends in one logical tick/submission.
        created_at: now,
      });
    }

    const tokens = await loadPushTokens(userId);
    await sendAndPrune(tokens, { title: payload.title, body: payload.body, data: { type } });
    return 'sent';
  } catch (err) {
    // Fail-safe: a marketing dispatch failure must never break a trigger scan or
    // the reward-unlock path. Nothing was reliably sent → report as gated.
    console.error('[notify] guarded marketing dispatch failed', err);
    return 'gated-opt-out';
  }
}
