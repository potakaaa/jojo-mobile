import type { MenuResponse, PickupBranch, ProductDetail } from '@jojopotato/types';

import { env } from '@/config/env';

/**
 * Typed fetch wrapper for the menu/branch/product API. Reuses the
 * `ngrok-skip-browser-warning` header pattern from `auth-client.ts` so free-tier
 * ngrok does not return its HTML interstitial instead of JSON.
 */
const commonHeaders = { 'ngrok-skip-browser-warning': 'true' } as const;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, { headers: commonHeaders });
  if (!res.ok) {
    throw new Error(`API request failed (${res.status}): ${path}`);
  }
  return (await res.json()) as T;
}

/** Raw `GET /api/branches` row (no `isOpen` — derived client-side below). */
interface BranchResponse {
  id: string;
  name: string;
  slug: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  openingHours: string;
  isActive: boolean;
  isAcceptingPickup: boolean;
  estimatedPrepMinutes: number;
}

export async function getBranches(): Promise<PickupBranch[]> {
  const body = await getJson<{ branches: BranchResponse[] }>('/api/branches');
  // `isOpen` is a client-facing convenience: open = active AND accepting pickup.
  return body.branches.map((branch) => ({
    ...branch,
    isOpen: branch.isActive && branch.isAcceptingPickup,
  }));
}

export function getMenu(branchId: string): Promise<MenuResponse> {
  return getJson<MenuResponse>(`/api/menu?branchId=${encodeURIComponent(branchId)}`);
}

export function getProductDetails(productId: string, branchId: string): Promise<ProductDetail> {
  return getJson<ProductDetail>(
    `/api/menu/products/${encodeURIComponent(productId)}?branchId=${encodeURIComponent(branchId)}`,
  );
}
