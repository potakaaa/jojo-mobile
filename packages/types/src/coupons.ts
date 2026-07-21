/** UI-facing coupon shape (rendered in the mobile coupons list). Unchanged. */
export interface Coupon {
  id: string;
  code: string;
  title: string;
  discountLabel: string;
  expiresAt?: string;
  isRedeemed: boolean;
}

/** Mirrors the `coupon_status` pg enum (`packages/api` schema) verbatim. */
export type CouponStatus = 'available' | 'used' | 'expired';

/**
 * DB-facing coupon row (STAR-003). Named `DbCoupon` to avoid colliding with the
 * UI-facing `Coupon` above. A coupon is either a deal-coupon (`dealId` set) or a
 * reward-coupon (`rewardId` set) — at most one reward-coupon per (user, reward)
 * is enforced by the `coupons_user_reward_unique` partial index (migration 0006).
 */
export interface DbCoupon {
  id: string;
  // ADM-008 LD2: coupons.user_id is now nullable (bulk-issued coupons claimed on
  // redeem). No live path emits a null yet; the type reflects the schema.
  userId: string | null;
  dealId: string | null;
  rewardId: string | null;
  code: string;
  status: CouponStatus;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
}

/**
 * `GET /coupons` response row (STAR-004): a `DbCoupon` joined with a light reward
 * label (name + required stars) for reward-backed coupons, `null` for deal
 * coupons. Deliberately NOT the full UI-facing `Coupon` mapper — the Rewards
 * screen only needs the code + a minimal label to surface an available reward.
 */
export interface CouponWithReward extends DbCoupon {
  reward: { name: string; requiredStars: number } | null;
}
