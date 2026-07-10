/**
 * Pure pricing helpers (AC7). Money is handled in whole PHP units (e.g. `89`
 * = ₱89.00); results are rounded to 2 decimals to absorb float drift.
 */

/** Round to 2 decimal places (centavo precision). */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Parse a `numeric` money string (as Drizzle returns for `base_price` /
 * `price_delta`) into a plain number. Throws on non-numeric input rather than
 * silently yielding NaN.
 */
export function parsePriceString(value: string): number {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`parsePriceString: cannot parse "${value}" as a number`);
  }
  return round2(parsed);
}

/** Base price plus every selected option delta (AC7). */
export function computeUnitPrice(basePrice: number, selectedDeltas: number[]): number {
  return round2(selectedDeltas.reduce((sum, delta) => sum + delta, basePrice));
}
