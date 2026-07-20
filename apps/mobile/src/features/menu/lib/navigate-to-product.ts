/**
 * The ONLY approved way any screen navigates into Product Details.
 *
 * Both entry points (Home tab's product cards, Order tab's menu) route through
 * this hook so back-from-Product behaves identically from each. Do not re-add a
 * direct `router.push(...)` at any call site: routing every entry through one
 * hook is what makes the behavior identical by construction, and keeps the route
 * path in exactly one place to change.
 *
 * ── MECHANISM: a plain push to a static-index anchor (NAV-006) ────────────────
 * Product Details is a TOP-LEVEL route (`app/(tabs)/product/index.tsx`) — it
 * belongs to no tab. Its stack anchor is a STATIC `index` route (mirroring
 * `tracking/` and `notifications/`), and `productId` rides along as a push param
 * (a query param, no longer a path segment). That static-index anchor is what
 * makes this push safe: the push target resolves to the `'tab'` navigator, so
 * expo-router downgrades `PUSH`→`NAVIGATE` and NO duplicate anchor is created —
 * fixing the NAV-006 double-open (opening two different products in sequence used
 * to stack, so back landed on the previous product, not the tab root).
 *
 * This is why the previous shape (a dynamic `[productId]` anchor) doubled: a
 * dynamic anchor made the push target resolve to the `'stack'` navigator, which
 * skips the `PUSH`→`NAVIGATE` downgrade, so each push added a second entry on top
 * of the anchor the linking state had already realized. This exactly mirrors the
 * Order Tracking fix (NAV-005) — see `navigate-to-tracking.ts`.
 *
 * NOTE: runtime nav-state behavior here is Agent-Probe only — no RN navigation
 * E2E runner exists (project-wide gap).
 */
import { router } from 'expo-router';
import { useCallback } from 'react';

/** Route path of the top-level Product Details screen (`app/(tabs)/product/index.tsx`). */
export const PRODUCT_DETAIL_PATHNAME = '/(tabs)/product';

/**
 * Returns `navigateToProduct(productId, branchId?)` — pushes the top-level
 * Product Details route. Safe to call from any tab; back returns to wherever it
 * was called from. `branchId` is passed along when the caller has it (Home tab).
 */
export function useNavigateToProduct(): (productId: string, branchId?: string) => void {
  return useCallback((productId: string, branchId?: string) => {
    router.push({
      pathname: PRODUCT_DETAIL_PATHNAME,
      params: { productId, ...(branchId ? { branchId } : {}) },
    });
  }, []);
}
