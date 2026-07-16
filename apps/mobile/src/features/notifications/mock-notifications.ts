/**
 * PLACEHOLDER / MOCK DATA — dev seed for the Notifications feature (#36/#37/#38).
 *
 * There is no notifications backend wired into `apps/mobile` yet — #75 (PUSH-004)
 * owns real delivery, server writes, and opt-in enforcement. Every value is typed
 * against the real `@jojopotato/types` `AppNotification` contract, and each item's
 * `targetScreen` is authored via `targetForType` so it can't drift from `type`.
 * These also feed the marketing evaluators in the factory/tests. Replace with
 * backend-backed data in #75.
 */
import type { AppNotification, Coupon, NotificationType, OrderStatus } from '@jojopotato/types';

import { targetForType } from '@/features/notifications/lib/notification-factory';

const MINUTE_MS = 60 * 1000;
const now = Date.now();
const minsAgo = (n: number) => new Date(now - n * MINUTE_MS).toISOString();

/** Deterministic-id mock item; `targetScreen` derived so it never drifts from `type`. */
function mock(
  id: string,
  type: NotificationType,
  title: string,
  body: string,
  targetParams: Record<string, string> | undefined,
  minutes: number,
  read: boolean,
): AppNotification {
  return {
    id,
    userId: 'mock-user',
    type,
    title,
    body,
    targetScreen: targetForType(type),
    targetParams,
    createdAt: minsAgo(minutes),
    readAt: read ? minsAgo(minutes - 1) : undefined,
  };
}

/** ≥1 item per of the 9 types, mixed read/unread, varied createdAt (newest-first observable). */
export const MOCK_NOTIFICATIONS: AppNotification[] = [
  mock(
    'order:JP-260714-0001:ready',
    'order_ready',
    'Order ready for pickup',
    'Your order is ready — head to the branch!',
    { orderId: 'JP-260714-0001' },
    2,
    false,
  ),
  mock(
    'order:JP-260714-0001:preparing',
    'order_preparing',
    'Order being prepared',
    'The kitchen is preparing your order.',
    { orderId: 'JP-260714-0001' },
    12,
    true,
  ),
  mock(
    'order:JP-260714-0001:accepted',
    'order_accepted',
    'Order accepted',
    'Your order has been accepted and is queued.',
    { orderId: 'JP-260714-0001' },
    18,
    true,
  ),
  mock(
    'order:JP-260714-0002:cancelled',
    'order_cancelled',
    'Order cancelled',
    'Your order was cancelled.',
    { orderId: 'JP-260714-0002' },
    30,
    true,
  ),
  mock(
    'deal:deal-welcome-20',
    'new_deal',
    'New deal: Welcome 20% Off',
    'Enjoy 20% off your first order.',
    { dealId: 'deal-welcome-20' },
    45,
    false,
  ),
  mock(
    'coupon:coupon-fries-free',
    'coupon_expiring',
    'Coupon expiring soon',
    'Your coupon "Free Classic Fries" is about to expire.',
    { couponId: 'coupon-fries-free' },
    90,
    false,
  ),
  mock(
    'stars:5',
    'one_more_order',
    'One more order!',
    'Just one more order to unlock your reward.',
    undefined,
    150,
    true,
  ),
  mock(
    'reward:reward-unlock-001',
    'reward_unlocked',
    'Reward unlocked!',
    'You unlocked a free upgrade — enjoy!',
    undefined,
    240,
    true,
  ),
  mock(
    'promo:promo-bgc-launch',
    'branch_promo',
    'BGC branch is now open',
    'Visit our new BGC branch for launch-week treats.',
    { promoId: 'promo-bgc-launch' },
    360,
    true,
  ),
];

/** Lead window used by the coupon-expiring evaluator (2 days). */
export const MOCK_COUPON_LEAD_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Coupon whose `expiresAt` sits inside the lead window (fires coupon_expiring). */
export const MOCK_COUPON: Coupon = {
  id: 'coupon-fries-free',
  code: 'FREEFRIES',
  title: 'Free Classic Fries',
  discountLabel: 'Free item',
  // 1 day out — inside the 2-day lead window above.
  expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
  isRedeemed: false,
  // For an out-of-window boundary check, use an expiresAt > 2 days out.
};

/** Stars set to the `required - 1` boundary so one_more_order fires. */
export const MOCK_STARS_REQUIRED = 5;
export const MOCK_STARS = MOCK_STARS_REQUIRED - 1;

/** A single reward-unlock event id (idempotency source). */
export const MOCK_REWARD_UNLOCK_EVENT = {
  eventId: 'reward-unlock-001',
  title: 'Reward unlocked!',
  body: 'You unlocked a free upgrade — enjoy!',
};

/** A branch promo input. */
export const MOCK_BRANCH_PROMO = {
  promoId: 'promo-bgc-launch',
  title: 'BGC branch is now open',
  body: 'Visit our new BGC branch for launch-week treats.',
};

/** A new-deal input (reuses a real MOCK_DEALS id). */
export const MOCK_NEW_DEAL = {
  dealId: 'deal-welcome-20',
  title: 'New deal: Welcome 20% Off',
  body: 'Enjoy 20% off your first order.',
};

/** Order transitions covering the 4 notifiable statuses (transition→notification source). */
export const MOCK_ORDER_TRANSITIONS: { orderId: string; status: OrderStatus }[] = [
  { orderId: 'JP-260714-0003', status: 'accepted' },
  { orderId: 'JP-260714-0003', status: 'preparing' },
  { orderId: 'JP-260714-0003', status: 'ready' },
  { orderId: 'JP-260714-0004', status: 'cancelled' },
];
