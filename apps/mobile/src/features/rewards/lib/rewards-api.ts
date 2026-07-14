import type { Reward, RewardsSummary, StarTransaction } from '@jojopotato/types';

import { env } from '@/config/env';
import { authClient } from '@/features/auth/lib/auth-client';

/**
 * Rewards API access layer (STAR-002).
 *
 * These endpoints (`/rewards/*`) are OUR OWN Express routes, NOT better-auth
 * routes — so we CANNOT use `authClient.$fetch` (its relative paths resolve
 * against better-auth's baseURL, which already includes the `/api/auth`
 * basePath, yielding a 404; see `staff-api.ts` for the full caveat). Instead we
 * follow the documented @better-auth/expo pattern: a plain `fetch` against an
 * ABSOLUTE URL (`env.apiUrl`), attaching the persisted session cookie from
 * `authClient.getCookie()`.
 *
 * All three functions THROW on a non-OK response (STAFF-002 P2 precedent) so
 * react-query surfaces `isError` — a screen must be able to distinguish "empty"
 * from "request failed".
 */
async function rewardsFetch(path: string): Promise<Response> {
  return fetch(`${env.apiUrl}${path}`, {
    headers: { Cookie: authClient.getCookie() },
  });
}

export interface RewardsHistoryPage {
  transactions: StarTransaction[];
  nextCursor: string | null;
}

/** `GET /rewards/summary` → the caller's star state + target reward. */
export async function fetchRewardsSummary(): Promise<RewardsSummary> {
  const res = await rewardsFetch('/rewards/summary');
  if (!res.ok) throw new Error('Failed to fetch rewards summary');
  return (await res.json()) as RewardsSummary;
}

/** `GET /rewards/available` → active rewards, ascending by required stars. */
export async function fetchAvailableRewards(): Promise<Reward[]> {
  const res = await rewardsFetch('/rewards/available');
  if (!res.ok) throw new Error('Failed to fetch available rewards');
  const data = (await res.json()) as { rewards: Reward[] };
  return data.rewards ?? [];
}

/** `GET /rewards/history` → the caller's star ledger (reverse-chron). */
export async function fetchRewardsHistory(): Promise<RewardsHistoryPage> {
  const res = await rewardsFetch('/rewards/history');
  if (!res.ok) throw new Error('Failed to fetch rewards history');
  const data = (await res.json()) as RewardsHistoryPage;
  return { transactions: data.transactions ?? [], nextCursor: data.nextCursor ?? null };
}
