import { env } from '@/config/env';

/**
 * Fetch wrapper for the ADM-005 `/api/admin/rewards` surface. Mirrors
 * `features/offers/lib/admin-offers-api.ts` (same `credentials: 'include'` cookie
 * convention, same status-carrying error). A Reward is a points-earned redemption
 * tier over the `rewards` table. Money (`rewardValue`) is CENTS at the boundary —
 * the form enters PHP / percent and converts to the integer the API expects.
 */

/** The 4-value admin reward mechanic (mirrors the server `REWARD_TYPES` allow-list, D2). */
export type RewardType = 'free_item' | 'fixed_discount' | 'percentage_discount' | 'free_upgrade';

export const REWARD_TYPE_OPTIONS: { value: RewardType; label: string }[] = [
  { value: 'free_item', label: 'Free item' },
  { value: 'free_upgrade', label: 'Free upgrade' },
  { value: 'fixed_discount', label: 'Fixed discount' },
  { value: 'percentage_discount', label: 'Percentage discount' },
];

/**
 * Mechanics whose redemption grants a specific product benefit and therefore
 * REQUIRE an `eligibleProductId` (D4): free_item grants one unit of the product
 * free; free_upgrade waives that product's paid size upgrade. Mirrors the
 * server-side per-mechanic requirement — the server Zod `superRefine` is the real
 * gate; this client check is convenience only.
 */
export function needsEligibleProduct(rewardType: RewardType): boolean {
  return rewardType === 'free_item' || rewardType === 'free_upgrade';
}

/** Mechanics that carry a scalar monetary value (D4 requires a positive value). */
export function hasScalarValue(rewardType: RewardType): boolean {
  return rewardType === 'fixed_discount' || rewardType === 'percentage_discount';
}

/** Admin-facing reward shape — mirrors the server's `AdminReward` (serializers.ts). */
export interface AdminReward {
  id: string;
  name: string;
  requiredStars: number;
  rewardType: RewardType;
  /** Cents, or null for the two product-benefit mechanics. */
  rewardValue: number | null;
  eligibleProductId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RewardCreateInput {
  name: string;
  requiredStars: number;
  rewardType: RewardType;
  rewardValueCents?: number;
  eligibleProductId?: string;
  isActive?: boolean;
}

/**
 * Update payload. `eligibleProductId` and `rewardValueCents` may be explicit `null`
 * to CLEAR the column (a product→discount mechanic flip clears the product; the
 * reverse clears the value). `undefined`/omitted leaves the column unchanged.
 */
export type RewardUpdateInput = Partial<
  Omit<RewardCreateInput, 'eligibleProductId' | 'rewardValueCents'>
> & {
  eligibleProductId?: string | null;
  rewardValueCents?: number | null;
};

/**
 * What `RewardForm` emits on submit. Same as a create payload but the two
 * conditional fields may be explicit `null` (edit-mode clear). The create branch
 * strips the null; the update branch passes it through.
 */
export type RewardSubmitInput = Omit<
  RewardCreateInput,
  'eligibleProductId' | 'rewardValueCents'
> & {
  eligibleProductId?: string | null;
  rewardValueCents?: number | null;
};

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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
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

  return (await res.json()) as T;
}

export function listRewards(): Promise<AdminReward[]> {
  return request<{ rewards: AdminReward[] }>(`${API}/rewards`).then((r) => r.rewards);
}

export function getReward(id: string): Promise<AdminReward> {
  return request<{ reward: AdminReward }>(`${API}/rewards/${id}`).then((r) => r.reward);
}

export function createReward(input: RewardCreateInput): Promise<AdminReward> {
  return request<{ reward: AdminReward }>(`${API}/rewards`, {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.reward);
}

export function updateReward(id: string, input: RewardUpdateInput): Promise<AdminReward> {
  return request<{ reward: AdminReward }>(`${API}/rewards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.reward);
}
