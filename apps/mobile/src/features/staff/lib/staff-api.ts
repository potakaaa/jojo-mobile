import type { StaffMe, StaffOrderDetail, StaffOrderSummary } from '@jojopotato/types';

import { env } from '@/config/env';
import { authClient } from '@/features/auth/lib/auth-client';

/**
 * Staff API access layer (STAFF-001/002).
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
async function staffFetch(path: string): Promise<Response> {
  return fetch(`${env.apiUrl}${path}`, {
    headers: { Cookie: authClient.getCookie() },
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
