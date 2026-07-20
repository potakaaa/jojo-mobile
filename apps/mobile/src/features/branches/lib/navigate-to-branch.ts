/**
 * The ONLY approved way any screen navigates into Branch Details.
 *
 * Both entry points (Home tab's branch card / promo banner, Branches tab's list)
 * route through this hook so back-from-Branch behaves identically from each. Do
 * not re-add a direct `router.push(...)` at any call site: routing every entry
 * through one hook is what makes the behavior identical by construction, and
 * keeps the route path in exactly one place to change.
 *
 * ── MECHANISM: a plain push to a static-index anchor (NAV-006) ────────────────
 * Branch Details is a TOP-LEVEL route (`app/(tabs)/branch/index.tsx`, singular
 * `branch/` — deliberately distinct from the `branches` TAB) — it belongs to no
 * tab. Its stack anchor is a STATIC `index` route (mirroring `tracking/` and
 * `notifications/`), and `branchId` rides along as a push param (a query param,
 * no longer a path segment). That static-index anchor is what makes this push
 * safe: the push target resolves to the `'tab'` navigator, so expo-router
 * downgrades `PUSH`→`NAVIGATE` and NO duplicate anchor is created — fixing the
 * NAV-006 double-open (opening two different branches in sequence used to stack,
 * so back landed on the previous branch, not the tab root).
 *
 * This is why the previous shape (a dynamic `[branchId]` anchor) doubled: a
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

/** Route path of the top-level Branch Details screen (`app/(tabs)/branch/index.tsx`). */
export const BRANCH_DETAIL_PATHNAME = '/(tabs)/branch';

/**
 * Returns `navigateToBranch(branchId)` — pushes the top-level Branch Details
 * route. Safe to call from any tab; back returns to wherever it was called from.
 */
export function useNavigateToBranch(): (branchId: string) => void {
  return useCallback((branchId: string) => {
    router.push({ pathname: BRANCH_DETAIL_PATHNAME, params: { branchId } });
  }, []);
}
