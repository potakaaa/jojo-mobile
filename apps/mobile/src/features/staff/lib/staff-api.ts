import type {
  OrderStatus,
  StaffBranchSettings,
  StaffMe,
  StaffOrderDetail,
  StaffOrderSummary,
  StaffProduct,
} from '@jojopotato/types';

import { env } from '@/config/env';
import { authClient } from '@/features/auth/lib/auth-client';

/**
 * Staff API access layer (STAFF-001/002/003).
 *
 * These endpoints (`/api/staff/*`) are OUR OWN Express routes, NOT better-auth
 * routes. We therefore CANNOT use `authClient.$fetch('/api/staff/...')`: its
 * relative paths resolve against better-auth's baseURL, which already includes
 * the `/api/auth` basePath — so `$fetch('/api/staff/me')` hit
 * `GET /api/auth/api/staff/me` and returned 404 (observed on device).
 *
 * Instead we follow the documented @better-auth/expo pattern for calling your
 * own endpoints: a plain `fetch` against an ABSOLUTE URL (`env.apiUrl` — the
 * same base the rest of the app targets, so the dev-bypass LAN-IP injection and
 * device reachability are preserved), attaching the persisted session cookie
 * from `authClient.getCookie()` (the expoClient plugin reads it out of
 * SecureStore). No auth headers to wire by hand, no data-fetching library.
 */
async function staffFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { headers: callerHeaders, ...restInit } = init;
  return fetch(`${env.apiUrl}${path}`, {
    ...restInit,
    headers: {
      Cookie: authClient.getCookie(),
      ...(callerHeaders as Record<string, string>),
    },
  });
}

/**
 * Fetch the current staff member's role + assigned branch from the canary
 * `GET /api/staff/me` endpoint (STAFF-001).
 *
 * Returns `null` on ANY failure (non-OK response, thrown fetch, or bad JSON) so
 * the shell can show a graceful fallback instead of crashing; it never throws.
 */
export async function fetchStaffMe(): Promise<StaffMe | null> {
  try {
    const res = await staffFetch('/api/staff/me');
    if (!res.ok) return null;
    return (await res.json()) as StaffMe;
  } catch {
    return null;
  }
}

/**
 * Fetch the branch-scoped active orders list (`GET /api/staff/orders`, STAFF-002).
 *
 * Unlike `fetchStaffMe`, this THROWS on error instead of returning an empty value
 * (plan supplement P2): react-query only sets `isError: true` when the query
 * function throws. Swallowing the error and returning `[]` would leave the screen
 * unable to distinguish "no orders" from "request failed".
 */
export async function fetchStaffOrders(): Promise<StaffOrderSummary[]> {
  const res = await staffFetch('/api/staff/orders');
  if (!res.ok) throw new Error('Failed to fetch staff orders');
  const data = (await res.json()) as { orders: StaffOrderSummary[] };
  return data.orders ?? [];
}

/**
 * Fetch a single order's detail (`GET /api/staff/orders/:orderId`, STAFF-002).
 *
 * Returns `null` for a 404 (order not found — a benign, expected state the detail
 * screen renders as "Order not found"). Throws for any other error so react-query
 * surfaces `isError` (plan supplement P2).
 */
export async function fetchStaffOrderDetail(orderId: string): Promise<StaffOrderDetail | null> {
  const res = await staffFetch(`/api/staff/orders/${orderId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch order detail');
  return (await res.json()) as StaffOrderDetail;
}

/**
 * Look up a single order by its pickup code (`order_number`) at the staff
 * member's branch (`GET /api/staff/orders/lookup?code=`, STAFF-005/PUP-002).
 *
 * Returns `null` for a 404 (no matching order at this branch — the expected
 * "not found" state the lookup screen renders inline). Throws for any other
 * non-OK response so the caller can surface an error state.
 */
export async function fetchStaffOrderByCode(code: string): Promise<StaffOrderDetail | null> {
  const res = await staffFetch(`/api/staff/orders/lookup?code=${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to look up order by code: ${res.status}`);
  return (await res.json()) as StaffOrderDetail;
}

/**
 * Transition an order to the given status (`PATCH /api/staff/orders/:orderId`, STAFF-003).
 *
 * Throws an Error on non-OK responses. The error message carries the HTTP status
 * code so the calling hook can distinguish 409 (invalid transition) from other
 * errors and render an appropriate inline message.
 */
export async function patchStaffOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<StaffOrderDetail> {
  const res = await staffFetch(`/api/staff/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Failed to update order status: ${res.status}`), {
      status: res.status,
    });
  }
  const data = (await res.json()) as { order: StaffOrderDetail };
  return data.order;
}

/**
 * Reject an order WITH a required reason
 * (`PATCH /api/staff/orders/:orderId/reject`, B2).
 *
 * A dedicated route rather than the generic status PATCH: the target is always
 * `rejected`, so no `status` is sent. `note` is optional except when
 * `reasonCode === 'other'`, where the SERVER requires it (422) — the dialog's
 * client-side gate is a UX convenience, never the enforcement point.
 *
 * Throws an Error carrying the HTTP status so the calling hook can distinguish
 * 409 (the order moved on) from other failures, matching `patchStaffOrderStatus`.
 */
export async function patchStaffOrderReject(
  orderId: string,
  reasonCode: string,
  note?: string,
): Promise<StaffOrderDetail> {
  const res = await staffFetch(`/api/staff/orders/${orderId}/reject`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reasonCode, ...(note ? { note } : {}) }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Failed to reject order: ${res.status}`), {
      status: res.status,
    });
  }
  const data = (await res.json()) as { order: StaffOrderDetail };
  return data.order;
}

/**
 * Fetch the branch-scoped completed/terminal orders list
 * (`GET /api/staff/orders/completed`, STAFF-003).
 *
 * Throws on error so react-query surfaces `isError`.
 */
export async function fetchCompletedStaffOrders(): Promise<StaffOrderSummary[]> {
  const res = await staffFetch('/api/staff/orders/completed');
  if (!res.ok) throw new Error('Failed to fetch completed orders');
  const data = (await res.json()) as { orders: StaffOrderSummary[] };
  return data.orders ?? [];
}

/**
 * Fetch all products for the staff's branch (`GET /api/staff/products`, STAFF-004).
 *
 * Returns the branch-scoped product list with per-product availability overrides.
 * Throws on error so react-query surfaces `isError`.
 */
export async function fetchStaffProducts(): Promise<StaffProduct[]> {
  const res = await staffFetch('/api/staff/products');
  if (!res.ok) throw new Error('Failed to fetch staff products');
  const data = (await res.json()) as { products: StaffProduct[] };
  return data.products ?? [];
}

/**
 * Toggle a product's availability for the staff's branch
 * (`PATCH /api/staff/products/:productId/availability`, STAFF-004).
 *
 * Throws on error so the mutation hook surfaces `isError`.
 */
export async function patchStaffProductAvailability(
  productId: string,
  isAvailable: boolean,
): Promise<void> {
  const res = await staffFetch(`/api/staff/products/${productId}/availability`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isAvailable }),
  });
  if (!res.ok) throw new Error(`Failed to update product availability: ${res.status}`);
}

/**
 * Fetch the branch's operational settings
 * (`GET /api/staff/branch`, STAFF-004).
 *
 * staleTime: 0 — pickup status is safety-critical, always fetch fresh.
 * Throws on error so react-query surfaces `isError`.
 */
export async function fetchStaffBranchSettings(): Promise<StaffBranchSettings> {
  const res = await staffFetch('/api/staff/branch');
  if (!res.ok) throw new Error('Failed to fetch branch settings');
  return (await res.json()) as StaffBranchSettings;
}

/**
 * Update the branch's operational settings
 * (`PATCH /api/staff/branch`, STAFF-004).
 *
 * Accepts a partial payload (at least one field required by the API).
 * Returns the updated settings on success. Throws on error.
 */
export async function patchStaffBranchSettings(
  payload: Partial<StaffBranchSettings>,
): Promise<StaffBranchSettings> {
  const res = await staffFetch('/api/staff/branch', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update branch settings: ${res.status}`);
  return (await res.json()) as StaffBranchSettings;
}
