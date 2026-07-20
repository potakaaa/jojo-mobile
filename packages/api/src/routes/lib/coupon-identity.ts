/**
 * Reward XOR offer mutual-exclusivity guard for `coupons` rows — the
 * application-boundary twin of the DB CHECK `coupons_reward_offer_mutex`
 * (migration 0015).
 *
 * A coupon row is ONE identity: a reward-coupon (`reward_id` set), an
 * offer-coupon (`offer_id` set), or neither (pre-issuance / untargeted) — never
 * both. The resolver (`routes/lib/coupon-apply.ts`) checks `reward_id IS NOT NULL`
 * first, so a dual-FK row would silently take the reward branch and skip the
 * entire offer code path (including the free-mechanic guard). A write site calls
 * this to reject such a row at the boundary before the DB CHECK does
 * (defense-in-depth). An admin wanting both benefits mints two separate coupons.
 *
 * Returns `true` when the `(reward_id, offer_id)` pair is a valid single identity.
 */
export function couponIdentityIsExclusive(ids: {
  reward_id?: string | null;
  offer_id?: string | null;
}): boolean {
  return ids.reward_id == null || ids.offer_id == null;
}
