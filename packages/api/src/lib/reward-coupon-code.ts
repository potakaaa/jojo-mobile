import { randomInt } from 'node:crypto';

/**
 * Crockford-base32-style alphabet with the ambiguous characters `0`, `O`, `1`,
 * and `I` removed (mirrors `routes/lib/order-number.ts`), so a human reading a
 * coupon code aloud can't confuse them. 32 characters total.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const SUFFIX_LENGTH = 4;

/**
 * Generate a reward-coupon code of the form `JP-RWD-XXXX` (e.g. `JP-RWD-4Q7K`).
 * The `XXXX` suffix is 4 characters drawn uniformly from {@link ALPHABET} via
 * `crypto.randomInt` (unbiased) — a 32^4 (~1M) keyspace.
 *
 * Uniqueness is NOT guaranteed by this function — the `coupons.code` UNIQUE
 * constraint plus a bounded insert retry in the caller (star-earning unlock) is
 * the correctness guarantee. The keyspace only keeps collisions astronomically
 * rare.
 */
export function generateRewardCouponCode(): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `JP-RWD-${suffix}`;
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
