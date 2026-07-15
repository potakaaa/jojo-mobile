import type {
  Coupon,
  CouponStatus,
  Deal,
  MenuResponse,
  PickupBranch,
  Reward,
  RewardsProgress,
} from '@jojopotato/types';

import { env } from '@/config/env';
import { authClient } from '@/features/auth/lib/auth-client';
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

/**
 * Session-gated typed fetch. Unlike the public `getJson`, this attaches the
 * persisted better-auth session cookie via `authClient.getCookie()` — the same
 * documented @better-auth/expo pattern `staffFetch` uses — so `requireSession`
 * routes (`/rewards/*`, `/coupons/*`) authenticate. Throws an `ApiError` carrying
 * the response status on a non-ok response so callers can branch on 409/403/404.
 */
async function authedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Only attach the Cookie header when a session cookie actually exists — an
  // unauthenticated `getCookie()` returns null, which would otherwise be sent as
  // the literal string "null".
  const cookie = authClient.getCookie();
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: { ...commonHeaders, ...(cookie ? { Cookie: cookie } : {}), ...init?.headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    throw new ApiError(res.status, `API request failed (${res.status}): ${path}`);
  }
  return (await res.json()) as T;
}

/** Star balance + tier-free reward progress (`GET /rewards/balance`). */
export type RewardsBalance = RewardsProgress & { lifetimeStars: number };

/**
 * `GET /rewards/balance` → returns the balance object DIRECTLY (no envelope
 * wrapper, mirroring `getMenu`'s shape — `{ currentStars, lifetimeStars,
 * rewardThreshold, starsToNextReward }`). Session-gated (`requireSession`).
 */
export function getRewardsBalance(): Promise<RewardsBalance> {
  return authedJson<RewardsBalance>('/rewards/balance');
}

/**
 * An issued coupon at the HTTP boundary WITH the server-derived human-readable
 * `displayLabel` (built from a LEFT JOIN to the linked deal/reward). Structural
 * mirror of `packages/api`'s `ApiCouponWithLabel` — declared locally so the mobile
 * bundle never imports server code. `GET /coupons` and `POST /coupons/:id/redeem`
 * both return this shape.
 */
export type ApiCouponWithLabel = Coupon & { displayLabel: string };

/** `GET /rewards` → `{ rewards }` envelope. Active redeemable rewards catalog. */
export async function getRewardsCatalog(): Promise<Reward[]> {
  const body = await authedJson<{ rewards: Reward[] }>('/rewards');
  return body.rewards;
}

/**
 * `POST /rewards/:id/redeem` → `{ coupon }` (201). Server decrements stars and
 * issues a coupon atomically — the client sends only the reward id, never an
 * amount. Returns the issued coupon.
 */
export async function redeemReward(rewardId: string): Promise<Coupon> {
  const body = await authedJson<{ coupon: Coupon }>(
    `/rewards/${encodeURIComponent(rewardId)}/redeem`,
    { method: 'POST' },
  );
  return body.coupon;
}

/**
 * `GET /coupons` → `{ coupons }` envelope, newest-first, each with `displayLabel`.
 * Optional `status` scopes the list to the effective (read-time-expiry-relabeled)
 * status server-side.
 */
export async function getCoupons(status?: CouponStatus): Promise<ApiCouponWithLabel[]> {
  const path = status ? `/coupons?status=${encodeURIComponent(status)}` : '/coupons';
  const body = await authedJson<{ coupons: ApiCouponWithLabel[] }>(path);
  return body.coupons;
}

/**
 * `POST /coupons/:id/redeem` → `{ coupon }` (200) on success. A re-redeem of an
 * already-used/expired coupon returns 409, a non-owned coupon 403, a missing one
 * 404 — all surfaced as an `ApiError` with the matching `status`.
 */
export async function redeemCoupon(couponId: string): Promise<ApiCouponWithLabel> {
  const body = await authedJson<{ coupon: ApiCouponWithLabel }>(
    `/coupons/${encodeURIComponent(couponId)}/redeem`,
    { method: 'POST' },
  );
  return body.coupon;
}
