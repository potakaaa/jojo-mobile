import { env } from '@/config/env';

/**
 * Fetch wrapper for the ADM-004 `/api/admin/deals` surface — deals CRUD plus the
 * `deal_products`/`deal_branches` junction attach/detach and the coupon-cascade
 * deactivate. Mirrors P2/P3's `admin-branches-api.ts`/`admin-products-api.ts`
 * (`credentials: 'include'` for the HttpOnly session cookie). All money fields
 * are integer CENTS at the boundary, matching the server.
 */

export type DealType =
  | 'percentage_discount'
  | 'fixed_discount'
  | 'buy_one_take_one'
  | 'free_item'
  | 'free_upgrade'
  | 'bundle';

export type CouponPolicy = 'leave' | 'expire';

export interface AdminDeal {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  dealType: DealType;
  discountValue: number | null; // cents (unconditional) — null for complex types
  minimumOrderAmount: number; // cents
  startAt: string; // ISO
  endAt: string; // ISO
  usageLimitPerUser: number | null;
  totalUsageLimit: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  productIds: string[];
  branchIds: string[];
  outstandingCoupons: number;
}

export interface DealCreateInput {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  dealType: DealType;
  discountValueCents?: number | null;
  minimumOrderAmountCents?: number;
  startAt: string;
  endAt: string;
  usageLimitPerUser?: number | null;
  totalUsageLimit?: number | null;
}

export type DealUpdateInput = Partial<DealCreateInput>;

export interface DeactivateResult {
  deal: AdminDeal;
  outstandingCouponsAffected: number;
}

/** Carries the HTTP status alongside the server's error message (e.g. 409 dup). */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

const BASE = `${env.apiUrl}/api/admin/deals`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
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

  // 204 No Content (junction detach) has no body to parse.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Deals ──
export function listDeals(isActive?: boolean): Promise<AdminDeal[]> {
  const query = isActive === undefined ? '' : `?isActive=${isActive}`;
  return request<{ deals: AdminDeal[] }>(query).then((r) => r.deals);
}

export function getDeal(id: string): Promise<AdminDeal> {
  return request<{ deal: AdminDeal }>(`/${id}`).then((r) => r.deal);
}

export function createDeal(input: DealCreateInput): Promise<AdminDeal> {
  return request<{ deal: AdminDeal }>('', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.deal);
}

export function updateDeal(id: string, input: DealUpdateInput): Promise<AdminDeal> {
  return request<{ deal: AdminDeal }>(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.deal);
}

export function deactivateDeal(id: string, couponPolicy: CouponPolicy): Promise<DeactivateResult> {
  return request<DeactivateResult>(`/${id}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ couponPolicy }),
  });
}

// ── Junctions ──
export function attachProduct(dealId: string, productId: string): Promise<void> {
  return request<void>(`/${dealId}/products`, {
    method: 'POST',
    body: JSON.stringify({ productId }),
  });
}

export function detachProduct(dealId: string, productId: string): Promise<void> {
  return request<void>(`/${dealId}/products/${productId}`, { method: 'DELETE' });
}

export function attachBranch(dealId: string, branchId: string): Promise<void> {
  return request<void>(`/${dealId}/branches`, {
    method: 'POST',
    body: JSON.stringify({ branchId }),
  });
}

export function detachBranch(dealId: string, branchId: string): Promise<void> {
  return request<void>(`/${dealId}/branches/${branchId}`, { method: 'DELETE' });
}
