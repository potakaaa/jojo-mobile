import {
  MARKETING_NOTIFICATION_TYPES,
  ORDER_NOTIFICATION_TYPES,
  type AppNotification,
  type Coupon,
  type NotificationType,
  type OrderStatus,
} from '@jojopotato/types';
import { describe, expect, test } from 'vitest';

import {
  DEFAULT_MARKETING_OPT_IN,
  buildMarketingNotifications,
  buildOrderNotification,
  filterMarketingByOptIn,
  mergeNotification,
  resolveRoute,
  shouldNotifyCouponExpiring,
  shouldNotifyOneMoreOrder,
  sortNewestFirst,
  targetForType,
} from './notification-factory';
import {
  __resetPermissionSeam,
  requestNotificationPermission,
  shouldPromptPermission,
} from './notification-permission';

const ALL_TYPES: NotificationType[] = [
  ...ORDER_NOTIFICATION_TYPES,
  ...MARKETING_NOTIFICATION_TYPES,
];

function item(id: string, createdAt: string, type: NotificationType = 'new_deal'): AppNotification {
  return {
    id,
    userId: 'mock-user',
    type,
    title: id,
    body: id,
    targetScreen: targetForType(type),
    createdAt,
  };
}

// AC#1 — newest-first ordering + shape.
test('should order a shuffled notification list newest-first by createdAt', () => {
  const shuffled = [
    item('b', '2026-07-14T10:00:00.000Z'),
    item('d', '2026-07-14T12:00:00.000Z'),
    item('a', '2026-07-14T09:00:00.000Z'),
    item('c', '2026-07-14T11:00:00.000Z'),
  ];
  const sorted = sortNewestFirst(shuffled);
  expect(sorted.map((n) => n.id)).toEqual(['d', 'c', 'b', 'a']);
  // shape assertion
  const first = sorted[0]!;
  expect(first).toMatchObject({
    title: expect.any(String),
    body: expect.any(String),
    createdAt: expect.any(String),
  });
  expect(first.readAt).toBeUndefined();
  // does not mutate input
  expect(shuffled[0]!.id).toBe('b');
});

// AC#2 (map) — every type resolves a non-null targetScreen + correct route/params.
test('should resolve a non-null targetScreen+params for every one of the 9 notification types', () => {
  expect(ALL_TYPES).toHaveLength(9);
  for (const type of ALL_TYPES) {
    const target = targetForType(type);
    expect(target).toBeTruthy();
  }
  // order → tracking with orderId params
  const order = buildOrderNotification('O1', 'ready')!;
  expect(resolveRoute(order)).toEqual({
    pathname: '/(tabs)/tracking',
    params: { orderId: 'O1' },
  });
  // deal → deal details with dealId params
  const deal = item('deal:x', '2026-07-14T10:00:00.000Z', 'new_deal');
  deal.targetParams = { dealId: 'x' };
  expect(resolveRoute(deal)).toEqual({
    pathname: '/(tabs)/deals/deal/[dealId]',
    params: { dealId: 'x' },
  });
  // coupon → rewards tab (coupons-wallet screen removed; no params by design)
  expect(resolveRoute(item('c', '2026-07-14T10:00:00.000Z', 'coupon_expiring'))).toEqual({
    pathname: '/(tabs)/rewards',
  });
  // rewards
  expect(resolveRoute(item('r', '2026-07-14T10:00:00.000Z', 'reward_unlocked'))).toEqual({
    pathname: '/(tabs)/rewards',
  });
});

// AC#3 — documented default + filter.
test('should return the documented default for marketingOptIn and filter marketing when off', () => {
  expect(DEFAULT_MARKETING_OPT_IN).toBe(false);

  const mixed = [
    item('deal', '2026-07-14T10:00:00.000Z', 'new_deal'),
    buildOrderNotification('O1', 'ready')!,
  ];
  expect(filterMarketingByOptIn(mixed, true)).toHaveLength(2);
  const off = filterMarketingByOptIn(mixed, false);
  expect(off).toHaveLength(1);
  expect(off[0]!.type).toBe('order_ready');
});

// AC#4 — marketing gated by opt-in; transactional never gated.
test('should build no NEW marketing when opt-in is off but always build transactional', () => {
  const inputs = {
    newDeals: [{ dealId: 'd1', title: 't', body: 'b' }],
    promos: [{ promoId: 'p1', title: 't', body: 'b' }],
  };
  expect(buildMarketingNotifications(inputs, false)).toEqual([]);
  expect(buildMarketingNotifications(inputs, true).length).toBe(2);
  // transactional is unaffected by opt-in in both cases
  expect(buildOrderNotification('O1', 'accepted')).not.toBeNull();
});

// AC#5 — one item per transition, no dupes; non-notifiable → null.
test('should produce exactly one item per order transition with no duplicates', () => {
  const notifiable: OrderStatus[] = ['accepted', 'preparing', 'ready', 'cancelled'];
  const nonNotifiable: OrderStatus[] = ['pending', 'flavoring', 'completed', 'rejected'];
  for (const s of notifiable) expect(buildOrderNotification('O1', s)).not.toBeNull();
  for (const s of nonNotifiable) expect(buildOrderNotification('O1', s)).toBeNull();

  let list: AppNotification[] = [];
  const n = buildOrderNotification('O1', 'ready')!;
  list = mergeNotification(list, n);
  list = mergeNotification(list, buildOrderNotification('O1', 'ready')!); // same transition again
  expect(list).toHaveLength(1);
});

// AC#6 — one-more-order boundary.
test('should fire one-more-order only at required-1 stars', () => {
  const required = 5;
  expect(shouldNotifyOneMoreOrder(3, required)).toBe(false); // N-2
  expect(shouldNotifyOneMoreOrder(4, required)).toBe(true); // N-1
  expect(shouldNotifyOneMoreOrder(5, required)).toBe(false); // N
  expect(shouldNotifyOneMoreOrder(6, required)).toBe(false); // N+1
});

// AC#7 — coupon-expiring lead window.
test('should fire coupon-expiring only inside the lead window', () => {
  const lead = 2 * 24 * 60 * 60 * 1000; // 2 days
  const expiresAtMs = Date.parse('2026-07-14T00:00:00.000Z');
  const coupon: Coupon = {
    id: 'c1',
    code: 'C1',
    title: 'C1',
    discountLabel: 'x',
    expiresAt: new Date(expiresAtMs).toISOString(),
    isRedeemed: false,
  };
  expect(shouldNotifyCouponExpiring(coupon, expiresAtMs - lead - 1, lead)).toBe(false); // before window
  expect(shouldNotifyCouponExpiring(coupon, expiresAtMs - lead, lead)).toBe(true); // window opens
  expect(shouldNotifyCouponExpiring(coupon, expiresAtMs - 1, lead)).toBe(true); // inside
  expect(shouldNotifyCouponExpiring(coupon, expiresAtMs, lead)).toBe(false); // at expiry
  expect(shouldNotifyCouponExpiring(coupon, expiresAtMs + 1, lead)).toBe(false); // after expiry
  // no expiresAt → never
  expect(
    shouldNotifyCouponExpiring({ ...coupon, expiresAt: undefined }, expiresAtMs - 1, lead),
  ).toBe(false);
});

// AC#8 — reward-unlocked idempotency.
test('should fire reward-unlocked once per event (idempotent)', () => {
  const built = buildMarketingNotifications(
    { rewardUnlockEvents: [{ eventId: 'e1', title: 't', body: 'b' }] },
    true,
  );
  expect(built).toHaveLength(1);
  let list: AppNotification[] = [];
  list = mergeNotification(list, built[0]!);
  list = mergeNotification(list, built[0]!); // same event again
  expect(list).toHaveLength(1);
});

// AC#11 — zero-notification branch.
test('should report unreadCount 0 and empty list for a zero-notification user', () => {
  const empty: AppNotification[] = [];
  expect(sortNewestFirst(empty)).toEqual([]);
  expect(empty.filter((n) => n.readAt == null)).toHaveLength(0);
});

// AC#12 — exhaustiveness over both union arrays.
test('should map every type in both union arrays to a non-null targetScreen (exhaustive)', () => {
  for (const type of ALL_TYPES) {
    expect(targetForType(type)).not.toBeUndefined();
    expect(targetForType(type)).not.toBeNull();
  }
});

// E4 — permission fire-once guard (lifts AC#10 fire-once from Agent-Probe to automated).
describe('permission fire-once guard', () => {
  test('should prompt only when not already asked', () => {
    expect(shouldPromptPermission(false)).toBe(true);
    expect(shouldPromptPermission(true)).toBe(false);
  });

  test('should fire at most once per session', async () => {
    __resetPermissionSeam('granted');
    expect(await requestNotificationPermission()).toBe('granted');
    // second call does not re-prompt
    expect(await requestNotificationPermission()).toBe('undetermined');
  });

  test('should support a __DEV__ denied override without throwing', async () => {
    __resetPermissionSeam('denied');
    await expect(requestNotificationPermission()).resolves.toBe('denied');
  });
});
