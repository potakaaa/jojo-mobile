import { env } from '@/config/env';

/**
 * Fetch wrapper for the ADM-008 `/api/admin/promotions` surface. Mirrors
 * `features/branches/lib/admin-branches-api.ts` verbatim (same `credentials:
 * 'include'` cookie convention, same `AdminApiError` status-carrying error, same
 * envelope-unwrap helpers). A Promotion is a named, time-windowed campaign that
 * groups 0..N Offers (Promotion 1 — 0..N Offer, via `offers.promotion_id`).
 * SPEC requires list/get/create only — no edit/deactivate for Promotions.
 */

/** Admin-facing promotion shape — mirrors the server's `AdminPromotion` (serializers.ts). */
export interface AdminPromotion {
  id: string;
  name: string;
  description: string | null;
  startAt: string; // ISO
  endAt: string; // ISO
  createdAt: string;
  updatedAt: string;
}

export interface PromotionCreateInput {
  name: string;
  description?: string;
  startAt: string; // ISO — the server coerces with z.coerce.date()
  endAt: string; // ISO
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

const BASE = `${env.apiUrl}/api/admin/promotions`;

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

  return (await res.json()) as T;
}

export function listPromotions(): Promise<AdminPromotion[]> {
  return request<{ promotions: AdminPromotion[] }>('').then((r) => r.promotions);
}

export function getPromotion(id: string): Promise<AdminPromotion> {
  return request<{ promotion: AdminPromotion }>(`/${id}`).then((r) => r.promotion);
}

export function createPromotion(input: PromotionCreateInput): Promise<AdminPromotion> {
  return request<{ promotion: AdminPromotion }>('', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.promotion);
}
