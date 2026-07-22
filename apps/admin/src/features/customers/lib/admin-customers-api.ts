import { env } from '@/config/env';

/**
 * Fetch wrapper for the ADM-010 READ-ONLY `/api/admin/customers` surface. Mirrors
 * `features/orders/lib/admin-orders-api.ts` (same `credentials: 'include'` cookie
 * convention + status-carrying error). Read-only: there are no create/update/delete
 * functions here by design (SPEC "Out Of Scope"). `AdminApiError` is duplicated
 * locally per the established `apps/admin` convention (10+ feature libs carry their
 * own copy — no shared extraction this phase).
 */

/** Admin customer list row — mirrors the server's `AdminCustomerSummary`. */
export interface AdminCustomerSummary {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  createdAt: string;
}

/** A recent order shown on the detail view — mirrors the server's `AdminOrderSummary`. */
export interface AdminCustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  placedAt: string;
  totalCents: number;
  itemSummary: string;
  branchName: string;
}

/** Admin customer detail — mirrors the server's `AdminCustomerDetail`. */
export interface AdminCustomerDetail extends AdminCustomerSummary {
  birthday: string | null;
  address: string | null;
  marketingOptIn: boolean;
  emailVerified: boolean;
  phoneNumberVerified: boolean;
  favoriteBranchName: string | null;
  onboardedAt: string | null;
  starsBalance: { current: number; lifetime: number } | null;
  recentOrders: AdminCustomerOrder[];
}

export interface CustomersPage {
  customers: AdminCustomerSummary[];
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

/** Build the `?q=…&cursor=…` query string (empty `q` is omitted). */
function buildQuery(q: string, cursor: string | null): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listCustomers(q: string, cursor: string | null = null): Promise<CustomersPage> {
  return request<CustomersPage>(`${API}/customers${buildQuery(q, cursor)}`);
}

export function getCustomer(id: string): Promise<AdminCustomerDetail> {
  return request<{ customer: AdminCustomerDetail }>(`${API}/customers/${id}`).then(
    (r) => r.customer,
  );
}
