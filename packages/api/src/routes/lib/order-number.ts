import { randomInt } from 'node:crypto';

/**
 * Crockford-base32-style alphabet with the ambiguous characters `0`, `O`, `1`,
 * and `I` removed, so a human reading an order number aloud at pickup can't
 * confuse them. 32 characters total (8 digits + 24 letters).
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const SUFFIX_LENGTH = 4;

/**
 * Generate a human-readable order number of the form `JP-YYMMDD-XXXX`
 * (e.g. `JP-260710-4Q7K`). The `XXXX` suffix is 4 characters drawn uniformly
 * from {@link ALPHABET} via `crypto.randomInt` (unbiased). The date is scoped
 * to `now`'s local calendar date.
 *
 * Uniqueness is NOT guaranteed by this function — the DB unique constraint on
 * `orders.order_number` plus the insert retry loop is the correctness guarantee.
 * The date-scoped ~1M-combination keyspace only keeps collisions rare.
 */
export function generateOrderNumber(now: Date = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }

  return `JP-${yy}${mm}${dd}-${suffix}`;
}

/**
 * Indirection seam around {@link generateOrderNumber} so the insert-retry loop
 * in `POST /orders` can be exercised with a forced first-attempt collision in
 * tests (`vi.spyOn(orderNumberGenerator, 'generate')`). Production code always
 * calls through this object.
 */
export const orderNumberGenerator = {
  generate: generateOrderNumber,
};
