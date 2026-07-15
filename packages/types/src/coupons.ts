/**
 * Coupon domain shapes.
 *
 * `Coupon` mirrors the DB `coupons` table exactly (an issued coupon owned by a
 * user, linked to the deal or reward that created it). `title`/`discountLabel`
 * have NO DB column — they are display-only strings derived from the linked
 * reward/deal — so UI cards consume the separate `CouponDisplay` helper instead.
 */

export type CouponStatus = 'available' | 'used' | 'expired';

/** An issued coupon row (`coupons` table). Money-free — no amount is stored here. */
export interface Coupon {
  id: string;
  userId: string;
  code: string;
  status: CouponStatus;
  dealId: string | null;
  rewardId: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
}

/**
 * UI display helper for coupon cards. `title`/`discountLabel` are derived
 * presentation strings with no DB column; `isRedeemed` is a display flag derived
 * from `Coupon.status`. Kept separate from the schema `Coupon` so screens can
 * render a friendly card without inventing DB fields.
 */
export interface CouponDisplay {
  id: string;
  code: string;
  title: string;
  discountLabel: string;
  expiresAt?: string;
  isRedeemed: boolean;
}
