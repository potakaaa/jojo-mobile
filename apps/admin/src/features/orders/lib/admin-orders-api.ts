import { env } from '@/config/env';

import type { StatusTone } from '@/components/status-badge';

/**
 * Fetch wrapper for the ADM-006 read-only `/api/admin/orders` surface. Mirrors
 * `features/rewards/lib/admin-rewards-api.ts` (same `credentials: 'include'` cookie
 * convention + status-carrying error). This is the FIRST filtered + cursor-paginated
 * list consumer in `apps/admin` (E3) — every other admin list is an unfiltered full
 * GET. Read-only: there are no create/update/delete functions here by design (D1).
 */

/** The 8 order_status enum values (mirrors the server `order_status` pgEnum). */
export type AdminOrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'flavoring'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export const ORDER_STATUS_OPTIONS: { value: AdminOrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'flavoring', label: 'Flavoring' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
];

export function orderStatusLabel(status: AdminOrderStatus): string {
  return ORDER_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

/**
 * Map an order status to a `StatusBadge` tone (feature-local — reuses the shared
 * status-chip vocabulary). `ready`/`completed` read as success; `rejected` as a
 * warning; `cancelled` as muted; in-flight states as neutral.
 */
export function orderStatusTone(status: AdminOrderStatus): StatusTone {
  switch (status) {
    case 'ready':
    case 'completed':
      return 'success';
    case 'rejected':
      return 'warning';
    case 'cancelled':
      return 'muted';
    default:
      return 'neutral';
  }
}

interface AdminOrderItem {
  productId: string;
  productName: string;
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

/** Admin list row — mirrors the server's `AdminOrderSummary` (serializers.ts). */
export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;
  placedAt: string;
  totalCents: number;
  itemSummary: string;
  branchId: string;
  branchName: string;
  customerName: string;
  customerPhone: string | null;
  discountTotalCents: number;
  couponId: string | null;
  dealId: string | null;
}

/** Admin detail — mirrors the server's `AdminOrderDetail` (serializers.ts). */
export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;
  placedAt: string;
  estimatedReadyAt: string | null;
  totalCents: number;
  items: AdminOrderItem[];
  branchId: string;
  branchName: string;
  customerName: string;
  customerPhone: string | null;
  discountTotalCents: number;
  couponId: string | null;
  dealId: string | null;
}

export interface OrderFilters {
  branchId?: string;
  status?: AdminOrderStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface OrdersPage {
  orders: AdminOrderSummary[];
  nextCursor: string | null;
}

/** Carries the HTTP status alongside the server's error message. */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

const API = `${env.apiUrl}/api/admin`;

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body — keep the default message */
    }
    throw new AdminApiError(res.status, message);
  }

  return (await res.json()) as T;
}

/** Build the `?branchId=…&status=…&dateFrom=…&dateTo=…&cursor=…` query string. */
function buildQuery(filters: OrderFilters, cursor: string | null): string {
  const params = new URLSearchParams();
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (filters.status) params.set('status', filters.status);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listOrders(
  filters: OrderFilters,
  cursor: string | null = null,
): Promise<OrdersPage> {
  return request<OrdersPage>(`${API}/orders${buildQuery(filters, cursor)}`);
}

export function getOrder(id: string): Promise<AdminOrderDetail> {
  return request<{ order: AdminOrderDetail }>(`${API}/orders/${id}`).then((r) => r.order);
}
