export function formatCurrency(amountInCents: number, currency = 'PHP', locale = 'en-PH'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountInCents / 100);
}

/**
 * Format a whole-currency-unit amount (e.g. `89` → "₱89.00"), for the real
 * `base_price` / `price_delta` values which are stored in whole PHP units —
 * distinct from the cents-based `formatCurrency` above.
 */
export function formatPricePHP(amount: number, locale = 'en-PH'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'PHP' }).format(amount);
}
