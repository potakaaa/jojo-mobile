import type { MenuResponse, PickupBranch } from '@jojopotato/types';

import { env } from '@/config/env';

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
export function getMenu(branchId: string): Promise<MenuResponse> {
  return getJson<MenuResponse>(`/branches/${encodeURIComponent(branchId)}/menu`);
}
