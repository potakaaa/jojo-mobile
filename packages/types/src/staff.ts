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
}
