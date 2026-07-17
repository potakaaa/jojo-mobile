import type { AdminAnalytics } from '@jojopotato/types';

import { env } from '@/config/env';

/**
 * Fetch wrapper for the ADM-007 read-only `/api/admin/analytics` surface. Mirrors
 * `features/orders/lib/admin-orders-api.ts` (same `credentials: 'include'` cookie
 * convention + status-carrying error). Read-only: one GET, no mutations. The
 * `AdminAnalytics` response type is shared from `@jojopotato/types`.
 */

export interface AnalyticsParams {
  /** Manila calendar date, YYYY-MM-DD. */
  from: string;
  /** Manila calendar date, YYYY-MM-DD. */
  to: string;
  /** Optional single-branch scope. */
  branchId?: string;
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

/**
 * react-query cache key for a given params tuple. `branchId` is normalized to the
 * stable placeholder `'all'` when unset (Execute-Agent Instruction E4) so the
 * "all branches" view and a specific-branch view are DISTINCT, non-colliding cache
 * entries (an `undefined` slot would collide/serialize ambiguously).
 */
export function analyticsQueryKey(params: AnalyticsParams) {
  return ['admin', 'analytics', params.from, params.to, params.branchId ?? 'all'] as const;
}

export function getAnalytics(params: AnalyticsParams): Promise<AdminAnalytics> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  if (params.branchId) qs.set('branchId', params.branchId);
  return request<{ resource: AdminAnalytics }>(`${API}/analytics?${qs.toString()}`).then(
    (r) => r.resource,
  );
}
