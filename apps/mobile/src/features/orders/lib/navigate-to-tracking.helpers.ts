/**
 * Pure target-stack description for navigating into Order Tracking.
 *
 * This module MUST NOT import `expo-router`, `react-native`, or any RN runtime.
 * It is imported by a vitest node-env unit test
 * (`__tests__/navigate-to-tracking.test.ts`), which cannot resolve those modules
 * — so the pure builder lives here and the impure dispatcher that consumes it
 * lives in `../navigate-to-tracking.ts`. Same split, and same reason, as
 * `components/floating-tab-bar.helpers.ts`.
 */

/** Route name of the Order tab within the `(tabs)` navigator. */
export const ORDER_TAB_NAME = 'order';

/** Screen names within the Order tab's nested Stack (`app/(tabs)/order/_layout.tsx`). */
export const ORDER_ROOT_SCREEN = 'index';
export const ORDER_TRACKING_SCREEN = 'tracking/[orderId]';

export interface TrackingRoute {
  name: string;
  params?: Record<string, unknown>;
}

export interface TrackingResetAction {
  /** Index of the focused route within `routes` — always the Tracking screen. */
  index: number;
  routes: TrackingRoute[];
}

/**
 * The stack the Order tab must end up with after navigating to Tracking:
 * exactly `[index, tracking/[orderId]]`, focused on Tracking.
 *
 * This is the fix for the back-stack trap (issue #96): entering Tracking used to
 * `router.push` onto whatever the Order stack already held — e.g. a stale
 * `product/[productId]` the user browsed earlier — so back from Tracking landed
 * on that stale screen instead of the Order root. Describing the WHOLE target
 * stack (rather than a relative push) makes the outcome identical from all three
 * entry points (Home banner, Order History, Order Confirmation) — SPEC AC4.
 *
 * Pure: it only describes the target. Realizing it is the dispatcher's job — see
 * `useNavigateToOrderTracking` for why that is currently a 2-step `navigate`
 * sequence rather than a single `reset` dispatch.
 *
 * `orderId` is not validated here; callers pass a real `order.id`.
 */
export function buildTrackingResetAction(orderId: string): TrackingResetAction {
  return {
    index: 1,
    routes: [{ name: ORDER_ROOT_SCREEN }, { name: ORDER_TRACKING_SCREEN, params: { orderId } }],
  };
}
