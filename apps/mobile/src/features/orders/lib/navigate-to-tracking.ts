/**
 * The ONLY approved way any screen navigates into Order Tracking.
 *
 * All three entry points (Home's Active-Order banner, Order History, Order
 * Confirmation) route through this hook so back-from-Tracking behaves
 * identically from each — SPEC AC4. Do not re-add a direct
 * `router.push('/(tabs)/order/tracking/[orderId]')` at any call site: that is
 * exactly the back-stack trap this exists to fix (pushing onto whatever the
 * Order stack already held, e.g. a stale `product/[productId]`).
 *
 * ── MECHANISM: contingency path taken (PLAN Step 3.1 gate, NAV-001) ──────────
 * The plan's PRIMARY mechanism was `useNavigation('/order').reset(...)`. It was
 * REJECTED at the gate after reading the installed expo-router@57.0.4 source:
 * `useNavigation(parent)` (`build/useNavigation.js`) resolves its argument via
 * `navigation.getParent(parent)` — it walks ANCESTORS only, and throws
 * "Could not find parent navigation with route ..." otherwise. From Home, the
 * Order tab's nested Stack is a SIBLING subtree, never an ancestor, so the
 * cross-tab case that motivated this fix cannot obtain that handle at all.
 *
 * So this uses the plan's documented CONTINGENCY: the `navigate(name, { screen })`
 * pattern already empirically verified by the predecessor plan
 * (`fix-tab-bar-visibility-nav-trap_15-07-26`, its Fix B / "Step-1 gate"), applied
 * as a 2-step sequence that realizes `buildTrackingResetAction`'s target stack:
 *
 *   1. navigate(order → index)                  forces the Order stack to its root,
 *                                               dropping any stale pushed screens
 *                                               (navigate-to-existing pops back).
 *   2. navigate(order → tracking/[orderId])     pushes Tracking on top.
 *
 * Net stack `[index, tracking/[orderId]]` — back from Tracking lands on the Order
 * root from every entry point. `navigate` also mounts a not-yet-visited tab on
 * demand, which covers the cold-start case (app reopened with an active order,
 * Home banner tapped before the Order tab was ever focused) that `lazy: true`
 * bottom-tabs semantics would otherwise break.
 *
 * NOTE: runtime nav-state behavior here is Agent-Probe only — no RN navigation
 * E2E runner exists (project-wide gap). Only `buildTrackingResetAction` is
 * automated-tested.
 */
import { useNavigation } from 'expo-router';
import { useCallback } from 'react';

import { ORDER_TAB_NAME, buildTrackingResetAction } from './navigate-to-tracking.helpers';

/**
 * Minimal shape of the parts of the navigation object this hook uses. Declared
 * locally rather than imported from `@react-navigation/*` — that package is not a
 * dependency of this app (expo-router vendors its own internal fork), the same
 * reason `floating-tab-bar.tsx` locally re-declares its own tab-bar prop types.
 */
interface NestedTabNavigate {
  navigate: (name: string, params?: { screen: string; params?: Record<string, unknown> }) => void;
}

/**
 * Returns `navigateToOrderTracking(orderId)` — resets the Order tab's stack to
 * `[index, tracking/[orderId]]` and focuses Tracking. Safe to call from any tab.
 */
export function useNavigateToOrderTracking(): (orderId: string) => void {
  const navigation = useNavigation() as unknown as NestedTabNavigate;

  return useCallback(
    (orderId: string) => {
      const { routes } = buildTrackingResetAction(orderId);

      // Realize the target stack bottom-up: each navigate targets the Order tab
      // by name, so this works from inside the Order tab AND cross-tab from Home.
      for (const route of routes) {
        navigation.navigate(ORDER_TAB_NAME, { screen: route.name, params: route.params });
      }
    },
    [navigation],
  );
}
