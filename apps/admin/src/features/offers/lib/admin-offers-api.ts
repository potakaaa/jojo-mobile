import { env } from '@/config/env';

/**
 * Fetch wrapper for the ADM-008 `/api/admin/offers` + `/api/admin/coupons`
 * surfaces. Mirrors `features/branches/lib/admin-branches-api.ts` (same
 * `credentials: 'include'` cookie convention, same status-carrying error). An
 * Offer is the discount mechanic (the legacy `deals` table, renamed to `offers`).
 * Money is CENTS at the boundary — the form enters PHP and multiplies by 100.
 * Coupon issuance (bulk N or single targeted) + the per-offer coupon list live
 * here too, since the coupon surface only exists under an Offer.
 */

/** The 6-value offer mechanic (reuses the existing `deal_type` enum verbatim). */
export type OfferType =
  | 'percentage_discount'
  | 'fixed_discount'
  | 'buy_one_take_one'
  | 'free_item'
  | 'free_upgrade'
  | 'bundle';

export const OFFER_TYPE_OPTIONS: { value: OfferType; label: string }[] = [
  { value: 'percentage_discount', label: 'Percentage discount' },
  { value: 'fixed_discount', label: 'Fixed discount' },
  { value: 'buy_one_take_one', label: 'Buy one take one' },
  { value: 'free_item', label: 'Free item' },
  { value: 'free_upgrade', label: 'Free upgrade' },
  { value: 'bundle', label: 'Bundle' },
];

/** Mechanics an admin can CREATE an Offer with today. buy_one_take_one and
 * bundle are deal/bundle-style (handled by the Deals product feature, not
 * coupon Offers) and excluded. free_item/free_upgrade are coupon-based Offer
 * mechanics — selectable, though their redemption discount math is not yet
 * implemented (computeDealDiscountCents returns 0 for them today).
 * The label map above stays full for display; only the creatable set narrows. */
export const OFFER_TYPE_CREATE_OPTIONS: { value: OfferType; label: string }[] =
  OFFER_TYPE_OPTIONS.filter(
    (o) =>
      o.value === 'percentage_discount' ||
      o.value === 'fixed_discount' ||
      o.value === 'free_item' ||
      o.value === 'free_upgrade',
  );

/**
 * Mechanics whose redemption grants a specific product benefit and therefore
 * REQUIRE a configured `benefitProductId` (ADM-008 fix 6). free_item grants one
 * unit of the designated product free; free_upgrade waives that product's paid
 * size upgrade. Mirrors the server-side per-mechanic requirement — the server
 * Zod `superRefine` is the real gate; this client check is convenience only.
 */
export function needsBenefitProduct(offerType: OfferType): boolean {
  return offerType === 'free_item' || offerType === 'free_upgrade';
}

/** Admin-facing offer shape — mirrors the server's `AdminOffer` (serializers.ts). */
export interface AdminOffer {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  offerType: OfferType;
  discountValueCents: number | null;
  minimumOrderAmountCents: number;
  startAt: string; // ISO
  endAt: string; // ISO
  usageLimitPerUser: number | null;
  totalUsageLimit: number | null;
  isActive: boolean;
  promotionId: string | null;
  /**
   * The product a free_item/free_upgrade offer grants at redemption (ADM-008 fix
   * 6). Non-null only for the benefit-bearing mechanics; null for every other
   * mechanic and for legacy free-mechanic offers created before this field.
   */
  benefitProductId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Admin-facing coupon shape — mirrors the server's `AdminCoupon` (serializers.ts). */
export interface AdminCoupon {
  id: string;
  offerId: string | null;
  userId: string | null;
  code: string;
  status: 'available' | 'redeemed' | 'expired';
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
}

export interface OfferCreateInput {
  title: string;
  description?: string;
  offerType: OfferType;
  discountValueCents?: number;
  minimumOrderAmountCents: number;
  startAt: string; // ISO
  endAt: string; // ISO
  usageLimitPerUser?: number;
  totalUsageLimit?: number;
  isActive?: boolean;
  promotionId?: string;
  /** Required by the server for free_item/free_upgrade; omitted otherwise. */
  benefitProductId?: string;
}

/**
 * Update payload. `benefitProductId` may be explicit `null` to CLEAR the column
 * (ADM-008 fix 6 F2) — sent when a free mechanic is switched to a discount mechanic
 * in edit mode. `undefined`/omitted leaves the column unchanged.
 */
export type OfferUpdateInput = Partial<Omit<OfferCreateInput, 'benefitProductId'>> & {
  benefitProductId?: string | null;
};

/**
 * What `OfferForm` emits on submit. Same as a create payload but `benefitProductId`
 * may be explicit `null` (edit-mode clear). The create branch strips the null (a new
 * offer never needs to clear a column); the update branch passes it through.
 */
export type OfferSubmitInput = Omit<OfferCreateInput, 'benefitProductId'> & {
  benefitProductId?: string | null;
};

export interface GenerateCouponsInput {
  offerId: string;
  quantity: number;
  userId?: string; // targeted issue — valid only when quantity === 1
  expiresAt?: string; // ISO — optional per-batch expiry override
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

export function listOffers(): Promise<AdminOffer[]> {
  return request<{ offers: AdminOffer[] }>(`${API}/offers`).then((r) => r.offers);
}

export function getOffer(id: string): Promise<AdminOffer> {
  return request<{ offer: AdminOffer }>(`${API}/offers/${id}`).then((r) => r.offer);
}

export function createOffer(input: OfferCreateInput): Promise<AdminOffer> {
  return request<{ offer: AdminOffer }>(`${API}/offers`, {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.offer);
}

export function updateOffer(id: string, input: OfferUpdateInput): Promise<AdminOffer> {
  return request<{ offer: AdminOffer }>(`${API}/offers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.offer);
}

export function listOfferCoupons(offerId: string): Promise<AdminCoupon[]> {
  return request<{ coupons: AdminCoupon[] }>(
    `${API}/coupons?offerId=${encodeURIComponent(offerId)}`,
  ).then((r) => r.coupons);
}

export function generateCoupons(input: GenerateCouponsInput): Promise<AdminCoupon[]> {
  return request<{ coupons: AdminCoupon[] }>(`${API}/coupons/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.coupons);
}
