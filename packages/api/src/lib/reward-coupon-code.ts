import { randomInt } from 'node:crypto';

/**
 * Crockford-base32-style alphabet with the ambiguous characters `0`, `O`, `1`,
 * and `I` removed (mirrors `routes/lib/order-number.ts`), so a human reading a
 * coupon code aloud can't confuse them. 32 characters total.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const SUFFIX_LENGTH = 4;

/** Reward-unlock coupon prefix (STAR-003). */
const REWARD_PREFIX = 'JP-RWD-';
/** Admin-issued offer coupon prefix (ADM-008 Phase 3). */
const OFFER_PREFIX = 'JP-OFR-';

/**
 * Generate a coupon code of the form `{prefix}XXXX` (e.g. `JP-RWD-4Q7K`,
 * `JP-OFR-9M2T`). The `XXXX` suffix is 4 characters drawn uniformly from
 * {@link ALPHABET} via `crypto.randomInt` (unbiased) — a 32^4 (~1M) keyspace.
 * The prefix is parameterized so reward-unlock (`JP-RWD-`) and admin-issued
 * offer coupons (`JP-OFR-`) share ONE generator — the retry loop lives in each
 * caller, never duplicated here.
 *
 * Uniqueness is NOT guaranteed by this function — the `coupons.code` UNIQUE
 * constraint plus a bounded insert retry in the caller (star-earning unlock /
 * admin coupon issuance) is the correctness guarantee. The keyspace only keeps
 * collisions astronomically rare.
 */
export function generateCouponCode(prefix: string): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${prefix}${suffix}`;
}

/** Backward-compatible reward-coupon code (`JP-RWD-XXXX`). */
export function generateRewardCouponCode(): string {
  return generateCouponCode(REWARD_PREFIX);
}

/** Admin-issued offer-coupon code (`JP-OFR-XXXX`). */
export function generateOfferCouponCode(): string {
  return generateCouponCode(OFFER_PREFIX);
}

/**
 * Indirection seam around {@link generateRewardCouponCode} so the coupon-insert
 * retry loop can be exercised with a forced first-attempt collision in tests
 * (`vi.spyOn(rewardCouponCodeGenerator, 'generate')`). Production code always
 * calls through this object.
 */
export const rewardCouponCodeGenerator = {
  generate: generateRewardCouponCode,
};

/**
 * Same indirection seam for admin-issued offer coupons (ADM-008 Phase 3), so the
 * admin issuance retry loop can be exercised with a forced first-attempt
 * collision in tests (`vi.spyOn(offerCouponCodeGenerator, 'generate')`).
 */
export const offerCouponCodeGenerator = {
  generate: generateOfferCouponCode,
};
