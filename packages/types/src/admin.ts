/**
 * Admin-side shared contracts (ADM-001, Phase 1). Kept free of any better-auth or
 * server import so both `packages/api` (server authz) and `apps/admin`
 * (role derivation + shell fetch) can depend on these without pulling in
 * server-side code. Mirrors `packages/types/src/staff.ts`.
 */

/**
 * Roles allowed through the admin guard. Subset of `UserRole` (see `auth.ts`).
 * NOTE: plain `staff` is NOT admitted — admin/super_admin only.
 */
export const ADMIN_ROLES = ['admin', 'super_admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Response shape of the canary `GET /api/admin/me` endpoint. No `assignedBranch`
 * concept — admin/super_admin are not branch-scoped (unlike `StaffMe`).
 *
 * `mfaPending` is the MFA/TOTP gateway seam field (see the phase plan's
 * `## MFA/TOTP Gateway` section) — always absent/false today; additive/optional,
 * a future phase (candidate ADM-0xx) sets it when a two-factor challenge is
 * pending. Do NOT remove.
 */
export interface AdminMe {
  role: AdminRole;
  mfaPending?: boolean;
}

/** A user row returned by `POST /api/admin/users/:id/role` on success. */
export interface AdminUserSummary {
  id: string;
  email: string;
  role: 'customer' | 'staff' | 'admin' | 'super_admin';
}

// ─── Admin analytics (ADM-007, Phase 7) ─────────────────────────────────────
//
// Response shapes for the read-only `GET /api/admin/analytics` dashboard. All
// money values are integer cents at the boundary (never float pesos). Additive —
// shared by `packages/api` (server assembly) and `apps/admin` (screen render).
// Aggregates only: NO per-customer identifying field appears in any shape (AC10).

/** One branch's order count in the range (0 for branches with no in-range orders). */
export interface AdminBranchOrderCount {
  branchId: string;
  branchName: string;
  orderCount: number;
}

/** One side of the deals-vs-no-deals partition. */
export interface AdminDealsSplitBucket {
  count: number;
  sumTotalCents: number;
}

/**
 * Deals-vs-no-deals partition of the in-range order set (D1). Invariant:
 * `withDeals.count + withoutDeals.count === orderCount` and the two sums add to
 * the total sum (an order matching multiple D1 deal signals is counted once).
 */
export interface AdminDealsSplit {
  withDeals: AdminDealsSplitBucket;
  withoutDeals: AdminDealsSplitBucket;
}

/** Repeat purchase rate: 2+-completed-order users ÷ any-order users. */
export interface AdminRepeatPurchaseRate {
  numerator: number;
  denominator: number;
  /** null when denominator = 0 (never divide by zero). */
  rate: number | null;
}

/** One row of the top-selling-products ranking. */
export interface AdminTopSellingProduct {
  productId: string;
  productName: string;
  quantitySold: number;
  revenueCents: number;
}

/** New-vs-returning customer split over the in-range order set (D8b). */
export interface AdminNewVsReturning {
  newCount: number;
  returningCount: number;
}

/** The full `GET /api/admin/analytics` payload (`{ resource: AdminAnalytics }`). */
export interface AdminAnalytics {
  range: { from: string; to: string; timezone: string };
  ordersPerBranch: AdminBranchOrderCount[];
  /** Post-discount AOV in cents; null when there are no in-range orders. */
  averageOrderValueCents: number | null;
  orderCount: number;
  dealsSplit: AdminDealsSplit;
  repeatPurchaseRate: AdminRepeatPurchaseRate;
  starsEarned: number;
  rewardsUnlocked: number;
  rewardsRedeemed: number;
  topSellingProducts: AdminTopSellingProduct[];
  newVsReturning: AdminNewVsReturning;
  /** true when the response is scoped to a single branch via ?branchId=. */
  branchScoped: boolean;
}
