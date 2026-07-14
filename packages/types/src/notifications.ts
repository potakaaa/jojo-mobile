/**
 * Notification domain types.
 *
 * BREAKING rewrite (push-notifications-ui, #36/#37/#38) of the earlier
 * 3-value placeholder. The `type` union now enumerates the 4 transactional
 * (order) kinds + 5 marketing kinds, and `AppNotification` carries `userId`
 * (mirrors the real DB `notifications.user_id`) and `targetScreen` (powers
 * tap-to-navigate). Values are widened here in the shared type only — #75
 * (PUSH-004) owns making the real DB table + send pipeline match.
 */

/** The 4 transactional (order-status) notification kinds. Always delivered — never gated by marketing opt-in. */
export type OrderNotificationType =
  | 'order_accepted'
  | 'order_preparing'
  | 'order_ready'
  | 'order_cancelled';

/** The 5 marketing notification kinds. Only surfaced when the marketing opt-in is on. */
export type MarketingNotificationType =
  | 'new_deal'
  | 'coupon_expiring'
  | 'one_more_order'
  | 'reward_unlocked'
  | 'branch_promo';

export type NotificationType = OrderNotificationType | MarketingNotificationType;

/** The 4 in-app destinations a notification can deep-link to on tap. */
export type NotificationTargetScreen =
  | 'order_tracking'
  | 'deal_details'
  | 'coupon_wallet'
  | 'rewards';

export interface AppNotification {
  id: string;
  /** Mirrors the real DB `notifications.user_id` (mock value in this UI-only pass). */
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetScreen: NotificationTargetScreen;
  /** Route params for the target screen, e.g. `{ orderId }` | `{ dealId }`. */
  targetParams?: Record<string, string>;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp; absent = unread. */
  readAt?: string;
}

/** Runtime array of every order notification type — used by opt-in filtering + exhaustiveness tests. */
export const ORDER_NOTIFICATION_TYPES: readonly OrderNotificationType[] = [
  'order_accepted',
  'order_preparing',
  'order_ready',
  'order_cancelled',
];

/** Runtime array of every marketing notification type — used by opt-in filtering + exhaustiveness tests. */
export const MARKETING_NOTIFICATION_TYPES: readonly MarketingNotificationType[] = [
  'new_deal',
  'coupon_expiring',
  'one_more_order',
  'reward_unlocked',
  'branch_promo',
];
