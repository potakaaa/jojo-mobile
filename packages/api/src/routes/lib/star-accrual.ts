/**
 * Pure star-accrual math. Count-based, NOT a peso ratio: a completed order earns
 * exactly ONE star when its subtotal meets a minimum threshold, else zero. The
 * subtotal (in cents) is used ONLY as the minimum-amount gate — never as a
 * multiplier. Extracted as pure TS so it is Fully-Automated unit-testable with no
 * DB dependency.
 */

export interface StarAccrualConfig {
  /** Minimum order subtotal (in cents) required to earn a star. Default ₱100. */
  minOrderSubtotalCents: number;
}

/** Default accrual config: 1 star per completed order of at least ₱100 (10000 cents). */
export const DEFAULT_STAR_ACCRUAL_CONFIG: StarAccrualConfig = {
  minOrderSubtotalCents: 10_000,
};

/**
 * Stars earned for an order with the given subtotal (in cents). Returns `1` when
 * `subtotalCents >= config.minOrderSubtotalCents`, otherwise `0`. Never scales
 * with the amount.
 */
export function computeStarsEarned(
  subtotalCents: number,
  config: StarAccrualConfig = DEFAULT_STAR_ACCRUAL_CONFIG,
): number {
  return subtotalCents >= config.minOrderSubtotalCents ? 1 : 0;
}
