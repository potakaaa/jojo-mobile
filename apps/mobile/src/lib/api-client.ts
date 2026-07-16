import type { Deal, MenuResponse, PickupBranch } from '@jojopotato/types';

import { env } from '@/config/env';
import { resolveImageUrl } from '@/lib/image-url';

/**
 * Error carrying the HTTP status of a failed API response, so callers (e.g. the
 * coupon-redeem mutation) can distinguish a 409 "already used/expired" from other
 * failures and render a friendly inline message instead of crashing.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Typed fetch wrapper for the menu/branch API. Targets THIS branch's real
 * cents-native backend at bare paths (`/branches`, `/branches/:id/menu` — no
 * `/api/` prefix). Reuses the `ngrok-skip-browser-warning` header pattern from
 * `auth-client.ts` so free-tier ngrok does not return its HTML interstitial
 * instead of JSON.
 */
const commonHeaders = { 'ngrok-skip-browser-warning': 'true' } as const;

const REQUEST_TIMEOUT_MS = 10_000;

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${path}`, {
      headers: commonHeaders,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    throw new Error(`API request failed (${res.status}): ${path}`);
  }
  return (await res.json()) as T;
}

/**
 * Raw `GET /branches` row (this branch's real `ApiBranch` shape — see
 * `packages/api/src/routes/lib/serializers.ts`). It has NO `isActive` field: the
 * backend query already filters `is_active = true` server-side, so every row
 * returned is implicitly active. `isOpen` is derived client-side below.
 */
interface BranchResponse {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  openingHours: string;
  estimatedPrepMinutes: number;
  isAcceptingPickup: boolean;
  /** Display sort weight (ascending) for the no-location branch list order. */
  priority: number;
  distanceKm?: number;
}

/** `GET /branches` → `{ branches: [...] }` envelope (Gap G). */
export async function getBranches(): Promise<PickupBranch[]> {
  const body = await getJson<{ branches: BranchResponse[] }>('/branches');
  // `isOpen` is a client-facing convenience. Our `ApiBranch` has no `isActive`
  // field — the list is already active-only server-side — so `isAcceptingPickup`
  // is the field-accurate equivalent of development's `isActive && isAcceptingPickup`.
  return body.branches.map((branch) => ({
    ...branch,
    isOpen: branch.isAcceptingPickup,
  }));
}

/**
 * `GET /branches/:branchId/menu` → unwrapped `{ branchId, categories }` (Gap G —
 * no wrapper key, already the `MenuResponse` shape).
 */
export async function getMenu(branchId: string): Promise<MenuResponse> {
  const menu = await getJson<MenuResponse>(`/branches/${encodeURIComponent(branchId)}/menu`);
  // Resolve relative product image paths (e.g. `/images/fries-large.webp`) to
  // absolute URLs against the current API origin (tunnel-proof). Idempotent for
  // already-absolute URLs.
  return {
    ...menu,
    categories: menu.categories.map((category) => ({
      ...category,
      products: category.products.map((product) => ({
        ...product,
        imageUrl: resolveImageUrl(product.imageUrl),
      })),
    })),
  };
}

/**
 * `GET /deals` → `{ deals: [...] }` envelope. Appends `?branchId=` only when a
 * branch is supplied (absent branchId → branch-agnostic deals only, server-side).
 * The server `ApiDeal` shape is structurally identical to `Deal` (guarded by the
 * `deals.test.ts` field-name assertions), so no client-side mapping is needed.
 */
export async function getDeals(branchId?: string): Promise<Deal[]> {
  const path = branchId ? `/deals?branchId=${encodeURIComponent(branchId)}` : '/deals';
  const body = await getJson<{ deals: Deal[] }>(path);
  // Resolve relative image paths to absolute URLs (tunnel-proof); idempotent.
  return body.deals.map((deal) => ({ ...deal, imageUrl: resolveImageUrl(deal.imageUrl) }));
}

/**
 * `GET /deals/:id` → `{ deal }` envelope. Returns the deal regardless of branch
 * scope or window (client eligibility renders the specific reason). A 404
 * (missing/inactive/malformed id) throws via `getJson`, surfaced by `useDeal`
 * as an error/not-found state.
 */
export async function getDeal(dealId: string): Promise<Deal> {
  const body = await getJson<{ deal: Deal }>(`/deals/${encodeURIComponent(dealId)}`);
  // Resolve the relative image path to an absolute URL (tunnel-proof); idempotent.
  return { ...body.deal, imageUrl: resolveImageUrl(body.deal.imageUrl) };
}
