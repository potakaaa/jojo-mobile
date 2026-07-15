import { env } from '@/config/env';

/**
 * Fetch wrapper for the ADM-004 `/api/admin/deals` surface (deals-as-products) —
 * a "deal" is a `products` row with `is_deal = true`, plus a `deal_components`
 * junction describing "what's inside". Mirrors P2/P3's `admin-branches-api.ts`/
 * `admin-products-api.ts` (`credentials: 'include'` for the HttpOnly session
 * cookie). All money fields are integer CENTS at the boundary, matching the
 * server. Supersedes the discount-shaped ADM-004 client (commit d5070d8).
 */

export interface AdminDealComponent {
  componentProductId: string;
  componentName: string;
  quantity: number;
}

export interface AdminDealProduct {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  isActive: boolean;
  isRewardEligible: boolean;
  isDeal: boolean;
  /** Populated on the detail response; `[]` on the list response. */
  components: AdminDealComponent[];
}

export interface DealCreateInput {
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  basePriceCents: number;
  isActive?: boolean;
  isRewardEligible?: boolean;
}

export type DealUpdateInput = Partial<DealCreateInput> & { isActive?: boolean };

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

  // 204 No Content (component detach) has no body to parse.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Deals (is_deal=true products) ──
export function listDeals(isActive?: boolean): Promise<AdminDealProduct[]> {
  const query = isActive === undefined ? '' : `?isActive=${isActive}`;
  return request<{ deals: AdminDealProduct[] }>(query).then((r) => r.deals);
}

export function getDeal(id: string): Promise<AdminDealProduct> {
  return request<{ deal: AdminDealProduct }>(`/${id}`).then((r) => r.deal);
}

export function createDeal(input: DealCreateInput): Promise<AdminDealProduct> {
  return request<{ deal: AdminDealProduct }>('', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.deal);
}

export function updateDeal(id: string, input: DealUpdateInput): Promise<AdminDealProduct> {
  return request<{ deal: AdminDealProduct }>(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.deal);
}

// ── Components junction ──
export function attachComponent(
  dealId: string,
  componentProductId: string,
  quantity?: number,
): Promise<void> {
  return request<void>(`/${dealId}/components`, {
    method: 'POST',
    body: JSON.stringify(
      quantity === undefined ? { componentProductId } : { componentProductId, quantity },
    ),
  });
}

export function detachComponent(dealId: string, componentProductId: string): Promise<void> {
  return request<void>(`/${dealId}/components/${componentProductId}`, { method: 'DELETE' });
}
