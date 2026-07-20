/**
 * The ONLY approved way any screen navigates into Order Tracking.
 *
 * All three entry points (Home's Active-Order banner, Order History, Order
 * Confirmation) route through this hook so back-from-Tracking behaves
 * identically from each — SPEC AC5. Do not re-add a direct
 * `router.push(...)` at any call site: routing every entry through one hook is
 * what makes the behavior identical by construction, and keeps the route path in
 * exactly one place to change.
 *
 * ── MECHANISM: a plain push to a static-index anchor (NAV-005) ────────────────
 * Tracking is a TOP-LEVEL route (`app/(tabs)/tracking/index.tsx`) — it belongs to
 * no tab. Its stack anchor is a STATIC `index` route (mirroring `notifications/`),
 * and `orderId` rides along as a push param (a query param, no longer a path
 * segment). That static-index anchor is what makes this push safe: the push target
 * resolves to the `'tab'` navigator, so expo-router downgrades `PUSH`→`NAVIGATE`
 * and NO duplicate anchor is created — fixing the NAV-005 double-open (Tracking
 * used to land 2-deep, taking two backs to leave).
 *
 * This is why the previous NAV-004 shape (a dynamic `[orderId]` anchor) doubled:
 * a dynamic anchor made the push target resolve to the `'stack'` navigator, which
 * skips the `PUSH`→`NAVIGATE` downgrade, so the push added a second entry on top of
 * the anchor the linking state had already realized.
 *
 * This also replaced the older NAV-001 mechanism (a 2-step `navigate` sequence that
 * realized a `[index, tracking]` stack inside the Order tab). That machinery — and
 * its `buildTrackingResetAction` builder — was deleted, not merely bypassed: it
 * described a stack reset that no longer exists.
 *
 * The reset approach was what CAUSED the bug this fixes. While Tracking lived in
 * the Order tab's stack, "being on Tracking" WAS "being in the Order tab", so
 * `router.back()` popped the router history (undoing the Home→Order tab switch)
 * without popping the Order stack — leaving the Order tab stuck on Tracking. A
 * sibling push onto the Tabs navigator's own history has no such residue: back
 * returns to the CALLING tab and no tab is left holding Tracking.
 *
 * NOTE: runtime nav-state behavior here is Agent-Probe only — no RN navigation
 * E2E runner exists (project-wide gap).
 */
import { router } from 'expo-router';
import { useCallback } from 'react';

/** Route path of the top-level Order Tracking screen (`app/(tabs)/tracking/index.tsx`). */
export const ORDER_TRACKING_PATHNAME = '/(tabs)/tracking';

/**
 * Returns `navigateToOrderTracking(orderId)` — pushes the top-level Tracking
 * route. Safe to call from any tab; back returns to wherever it was called from.
 */
export function useNavigateToOrderTracking(): (orderId: string) => void {
  return useCallback((orderId: string) => {
    router.push({ pathname: ORDER_TRACKING_PATHNAME, params: { orderId } });
  }, []);
}
