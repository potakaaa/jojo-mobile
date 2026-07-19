/**
 * Shared display formatting for the analytics feature.
 *
 * `formatPeso` matches the format string used across the rest of `apps/admin`
 * (offers/deals/products/orders) verbatim — no thousands separators — so every
 * admin screen renders money identically. Migrating the whole app to
 * `packages/utils`' `formatCurrency` is a separate follow-up; do not switch this
 * one screen to `Intl.NumberFormat` in isolation.
 */
export function formatPeso(cents: number | null): string {
  return cents === null ? '—' : `₱${(cents / 100).toFixed(2)}`;
}
