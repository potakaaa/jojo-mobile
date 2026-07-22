/**
 * Staff-side shared contracts (STAFF-001). Kept free of any better-auth or
 * server import so both `packages/api` (server authz) and `apps/mobile`
 * (role derivation + shell fetch) can depend on these without pulling in
 * server-side code.
 */

import type { OrderStatus } from './order';

/** Roles allowed through the staff guard. Subset of `UserRole` (see `auth.ts`). */
export const STAFF_ROLES = ['staff', 'admin', 'super_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** The branch a staff member is scoped to, as returned by `GET /api/staff/me`. */
export interface StaffBranch {
  id: string;
  name: string;
  slug: string;
}

/** Response shape of the canary `GET /api/staff/me` endpoint. */
export interface StaffMe {
  role: StaffRole;
  assignedBranch: StaffBranch | null;
}

// ─── STAFF-002: Active Orders dashboard contracts ───────────────────────────

/**
 * A single row in the staff Active Orders list (`GET /api/staff/orders`).
 * Lean by design (OC-2): the full item array is NOT included — only the
 * server-computed `itemSummary` string (OC-3). `status` is always a non-terminal
 * status in list responses (terminal orders are filtered server-side).
 */
export interface StaffOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string; // ISO 8601
  totalCents: number;
  itemSummary: string; // server-computed: "2× Loaded Fries, 1× Classic Soda"
  // Terminal-transition reason (B2 staff reject / B3 customer cancel). Optional AND
  // nullable — see the matching note on `Order` in `order.ts` for why both.
  reasonCode?: string | null;
  reasonNote?: string | null;
  reasonActor?: 'staff' | 'customer' | null;
}

/** A single order item on the staff Order Detail screen. */
export interface StaffOrderItem {
  productId: string;
  productName: string; // from product_name_snapshot
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  selectedOptions: Array<{
    optionId: string;
    optionType: 'size' | 'flavor' | 'add_on';
    name: string;
    priceDeltaCents: number;
  }>;
}

/**
 * Full order detail returned by `GET /api/staff/orders/:orderId`. Flat shape
 * (no envelope). Includes the full `items` array with `selectedOptions`.
 */
export interface StaffOrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string; // ISO 8601
  estimatedReadyAt: string | null;
  totalCents: number;
  items: StaffOrderItem[];
  // Terminal-transition reason (B2 staff reject / B3 customer cancel). Optional AND
  // nullable — see the matching note on `Order` in `order.ts` for why both.
  reasonCode?: string | null;
  reasonNote?: string | null;
  reasonActor?: 'staff' | 'customer' | null;
}

// ─── STAFF-004: Product availability + branch settings contracts ─────────────

/**
 * A single product row returned by `GET /api/staff/products`.
 *
 * `basePrice` is typed as `string` because the DB column is `numeric(10,2)` —
 * Drizzle returns it as a decimal string to avoid JS float precision loss.
 *
 * `isAvailable` reflects the branch-level override: `true` when no
 * `branch_product_availability` row exists (LEFT JOIN default) OR when the row
 * has `is_available = true`.
 */
export type StaffProduct = {
  id: string;
  name: string;
  categoryId: string; // products.category_id is NOT NULL
  basePrice: string; // numeric(10,2) returned as decimal string — NOT number
  isAvailable: boolean;
};

/**
 * Branch operational settings returned by `GET /api/staff/branch` and
 * updated via `PATCH /api/staff/branch`.
 */
export type StaffBranchSettings = {
  isAcceptingPickup: boolean;
  estimatedPrepMinutes: number;
};
