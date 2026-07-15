/**
 * Pure notification logic (zero React Native imports so the vitest node env can
 * import it directly). Every testable rule from the push-notifications-ui plan
 * lives here: type→target mapping, route resolution, sorting, order/marketing
 * builders, opt-in filtering, threshold/window boundary evaluators, and an
 * idempotent merge. The `useNotifications()` hook is a thin wrapper over these.
 */
import {
  MARKETING_NOTIFICATION_TYPES,
  type AppNotification,
  type CouponDisplay,
  type MarketingNotificationType,
  type NotificationTargetScreen,
  type NotificationType,
  type OrderNotificationType,
  type OrderStatus,
} from '@jojopotato/types';

/** Only these 4 order statuses produce a transactional notification. */
const STATUS_TO_ORDER_TYPE: Partial<Record<OrderStatus, OrderNotificationType>> = {
  accepted: 'order_accepted',
  preparing: 'order_preparing',
  ready: 'order_ready',
  cancelled: 'order_cancelled',
};

/**
 * Exhaustive type→target map. Being a full `Record<NotificationType, …>` gives
 * compile-time coverage of every one of the 9 notification types (the AC#12 guard).
 */
export const TYPE_TARGET: Record<NotificationType, NotificationTargetScreen> = {
  order_accepted: 'order_tracking',
  order_preparing: 'order_tracking',
  order_ready: 'order_tracking',
  order_cancelled: 'order_tracking',
  new_deal: 'deal_details',
  branch_promo: 'deal_details',
  coupon_expiring: 'coupon_wallet',
  reward_unlocked: 'rewards',
  one_more_order: 'rewards',
};

export function targetForType(type: NotificationType): NotificationTargetScreen {
  return TYPE_TARGET[type];
}

/** Static copy for each order transition (per PRD §6.12/§14 wording). */
const ORDER_COPY: Record<OrderNotificationType, { title: string; body: string }> = {
  order_accepted: { title: 'Order accepted', body: 'Your order has been accepted and is queued.' },
  order_preparing: { title: 'Order being prepared', body: 'The kitchen is preparing your order.' },
  order_ready: {
    title: 'Order ready for pickup',
    body: 'Your order is ready — head to the branch!',
  },
  order_cancelled: { title: 'Order cancelled', body: 'Your order was cancelled.' },
};

export interface ResolvedRoute {
  pathname: string;
  params?: Record<string, string>;
}

/** Map a notification to an Expo Router destination. */
export function resolveRoute(n: AppNotification): ResolvedRoute {
  switch (n.targetScreen) {
    case 'order_tracking':
      return { pathname: '/(tabs)/order/tracking/[orderId]', params: n.targetParams };
    case 'deal_details':
      return { pathname: '/(tabs)/deals/deal/[dealId]', params: n.targetParams };
    case 'coupon_wallet':
      // May 404 until the Coupon Wallet screen exists (A4 — accepted gap).
      return { pathname: '/(tabs)/rewards/coupons' };
    case 'rewards':
      return { pathname: '/(tabs)/rewards' };
  }
}

/** Descending by `createdAt` (newest first). Does not mutate the input. */
export function sortNewestFirst(items: AppNotification[]): AppNotification[] {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * Build a transactional notification for exactly the 4 notifiable statuses;
 * returns `null` for any other status. The id is deterministic
 * (`order:{orderId}:{status}`) so re-processing the same transition is idempotent.
 */
export function buildOrderNotification(
  orderId: string,
  status: OrderStatus,
  createdAt: string = new Date().toISOString(),
): AppNotification | null {
  const type = STATUS_TO_ORDER_TYPE[status];
  if (!type) return null;
  const copy = ORDER_COPY[type];
  return {
    id: `order:${orderId}:${status}`,
    userId: 'mock-user',
    type,
    title: copy.title,
    body: copy.body,
    targetScreen: targetForType(type),
    targetParams: { orderId },
    createdAt,
  };
}

/**
 * Return `[]` for marketing items when opt-in is off; pass transactional items
 * through untouched. Used to gate NEW marketing only (A3 — history is never
 * retroactively removed).
 */
export function filterMarketingByOptIn(
  items: AppNotification[],
  optIn: boolean,
): AppNotification[] {
  const MARKETING = new Set<NotificationType>(MARKETING_NOTIFICATION_TYPES);
  if (optIn) return items;
  return items.filter((n) => !MARKETING.has(n.type));
}

/** "One more order" fires only when stars are exactly one short of the threshold. */
export function shouldNotifyOneMoreOrder(stars: number, required: number): boolean {
  return stars === required - 1;
}

/**
 * "Coupon expiring" fires only inside the lead window: now is at or past
 * `expiresAt - leadWindowMs` and strictly before `expiresAt`. Returns false when
 * the coupon has no `expiresAt` (E1 — `expiresAt` is an ISO string, parse first).
 */
export function shouldNotifyCouponExpiring(
  coupon: CouponDisplay,
  now: number,
  leadWindowMs: number,
): boolean {
  if (!coupon.expiresAt) return false;
  const expiresAt = Date.parse(coupon.expiresAt);
  if (Number.isNaN(expiresAt)) return false;
  return now >= expiresAt - leadWindowMs && now < expiresAt;
}

/** Inputs the marketing evaluators read to build notifications. */
export interface MarketingInputs {
  newDeals?: { dealId: string; title: string; body: string; createdAt?: string }[];
  coupons?: { coupon: CouponDisplay; now: number; leadWindowMs: number; createdAt?: string }[];
  starProgress?: { stars: number; required: number; createdAt?: string };
  rewardUnlockEvents?: { eventId: string; title: string; body: string; createdAt?: string }[];
  promos?: { promoId: string; title: string; body: string; createdAt?: string }[];
}

function build(
  id: string,
  type: MarketingNotificationType,
  title: string,
  body: string,
  targetParams: Record<string, string> | undefined,
  createdAt: string,
): AppNotification {
  return {
    id,
    userId: 'mock-user',
    type,
    title,
    body,
    targetScreen: targetForType(type),
    targetParams,
    createdAt,
  };
}

/**
 * Evaluate the 5 marketing triggers against mock `inputs`. Returns `[]` when
 * `optIn` is false. Each item carries a deterministic id so it dedupes cleanly.
 */
export function buildMarketingNotifications(
  inputs: MarketingInputs,
  optIn: boolean,
): AppNotification[] {
  if (!optIn) return [];
  const nowIso = new Date().toISOString();
  const out: AppNotification[] = [];

  for (const d of inputs.newDeals ?? []) {
    out.push(
      build(
        `deal:${d.dealId}`,
        'new_deal',
        d.title,
        d.body,
        { dealId: d.dealId },
        d.createdAt ?? nowIso,
      ),
    );
  }
  for (const c of inputs.coupons ?? []) {
    if (shouldNotifyCouponExpiring(c.coupon, c.now, c.leadWindowMs)) {
      out.push(
        build(
          `coupon:${c.coupon.id}`,
          'coupon_expiring',
          'Coupon expiring soon',
          `Your coupon "${c.coupon.title}" is about to expire.`,
          { couponId: c.coupon.id },
          c.createdAt ?? nowIso,
        ),
      );
    }
  }
  if (inputs.starProgress) {
    const { stars, required, createdAt } = inputs.starProgress;
    if (shouldNotifyOneMoreOrder(stars, required)) {
      out.push(
        build(
          `stars:${required}`,
          'one_more_order',
          'One more order!',
          `Just one more order to unlock your reward.`,
          undefined,
          createdAt ?? nowIso,
        ),
      );
    }
  }
  for (const e of inputs.rewardUnlockEvents ?? []) {
    out.push(
      build(
        `reward:${e.eventId}`,
        'reward_unlocked',
        e.title,
        e.body,
        undefined,
        e.createdAt ?? nowIso,
      ),
    );
  }
  for (const p of inputs.promos ?? []) {
    out.push(
      build(
        `promo:${p.promoId}`,
        'branch_promo',
        p.title,
        p.body,
        { promoId: p.promoId },
        p.createdAt ?? nowIso,
      ),
    );
  }

  return out;
}

/**
 * Idempotent append: if an item with `incoming.id` already exists, return
 * `existing` unchanged (proves AC#5 no-dupes-per-transition + AC#8 fire-once).
 */
export function mergeNotification(
  existing: AppNotification[],
  incoming: AppNotification,
): AppNotification[] {
  if (existing.some((n) => n.id === incoming.id)) return existing;
  return [...existing, incoming];
}
