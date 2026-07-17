import { describe, expect, test } from 'vitest';

// Imports the PURE helpers module only — never `../navigate-to-tracking`, which
// pulls in `expo-router` and would crash this vitest node-env suite.
import {
  ORDER_ROOT_SCREEN,
  ORDER_TRACKING_SCREEN,
  buildTrackingResetAction,
} from '../navigate-to-tracking.helpers';

describe('buildTrackingResetAction', () => {
  test('returns the exact target stack for a given orderId', () => {
    expect(buildTrackingResetAction('order-123')).toEqual({
      index: 1,
      routes: [{ name: 'index' }, { name: 'tracking/[orderId]', params: { orderId: 'order-123' } }],
    });
  });

  test('routes has exactly 2 entries, root first and tracking second', () => {
    const { routes } = buildTrackingResetAction('order-123');

    expect(routes).toHaveLength(2);
    expect(routes.map((r) => r.name)).toEqual([ORDER_ROOT_SCREEN, ORDER_TRACKING_SCREEN]);
  });

  test('focuses the tracking screen (index points at the last route)', () => {
    const action = buildTrackingResetAction('order-123');

    expect(action.index).toBe(1);
    expect(action.routes.at(action.index)?.name).toBe(ORDER_TRACKING_SCREEN);
    expect(action.index).toBe(action.routes.length - 1);
  });

  test('passes orderId through to the tracking route params', () => {
    expect(buildTrackingResetAction('abc-987').routes.at(1)?.params).toEqual({
      orderId: 'abc-987',
    });
  });

  test('the root route carries no params', () => {
    expect(buildTrackingResetAction('order-123').routes.at(0)?.params).toBeUndefined();
  });

  test('never leaves a stale screen below tracking — the back-stack trap this fixes', () => {
    // The defect was back-from-Tracking landing on e.g. `product/[productId]`.
    // The built stack must contain nothing but the Order root and Tracking.
    const names = buildTrackingResetAction('order-123').routes.map((r) => r.name);

    expect(names).toEqual([ORDER_ROOT_SCREEN, ORDER_TRACKING_SCREEN]);
  });

  test('empty-string orderId still produces a structurally valid action', () => {
    // The builder does not validate orderId content — callers pass a real order.id.
    const action = buildTrackingResetAction('');

    expect(action.index).toBe(1);
    expect(action.routes).toHaveLength(2);
    expect(action.routes.at(1)?.params).toEqual({ orderId: '' });
  });

  test('returns a fresh object each call (no shared mutable state between callers)', () => {
    const a = buildTrackingResetAction('order-1');
    const b = buildTrackingResetAction('order-2');

    expect(a.routes).not.toBe(b.routes);
    expect(a.routes.at(1)?.params).toEqual({ orderId: 'order-1' });
    expect(b.routes.at(1)?.params).toEqual({ orderId: 'order-2' });
  });
});
