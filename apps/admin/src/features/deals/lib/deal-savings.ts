/**
 * Pure savings math for the deal create wizard (Enhancement E1). All values are
 * integer CENTS (the API/money boundary), computed CLIENT-SIDE from the already-
 * loaded product list — no extra fetch. Kept as a pure, dependency-free unit so
 * the "customer saves ₱X · Y% off" / "costs ₱X more" panel is unit-testable
 * (AC-E7) independent of the wizard component.
 */

export interface SavingsLineItem {
  /** À-la-carte unit price of the component product, in cents. */
  unitCents: number;
  /** How many of this component the deal includes (>= 1). */
  quantity: number;
}

export interface DealSavings {
  /** Σ(unitCents × quantity) across every line item. */
  aLaCarteTotalCents: number;
  /** The deal's own price, in cents. */
  dealPriceCents: number;
  /**
   * À-la-carte total minus the deal price. Positive when the deal is cheaper
   * (a genuine saving); negative/zero when the deal costs the same or more.
   */
  savingsCents: number;
  /**
   * Percent off the à-la-carte total, to one decimal. `0` when there is nothing
   * to compare against (à-la-carte total of 0). Can be negative when the deal
   * costs more than buying separately.
   */
  percentOff: number;
  /**
   * True when the deal price is greater than OR equal to the à-la-carte total —
   * i.e. NOT a saving. Drives the warning-styled panel (spec: flip to warning
   * when `dealPrice >= aLaCarte`).
   */
  costsMore: boolean;
}

/** Σ(unitCents × quantity) across all line items. Empty list → 0. */
export function computeALaCarteTotalCents(items: SavingsLineItem[]): number {
  return items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0);
}

/**
 * Derive the full savings breakdown for a deal priced at `dealPriceCents` whose
 * contents are `items`. Percent is rounded to one decimal.
 */
export function computeDealSavings(items: SavingsLineItem[], dealPriceCents: number): DealSavings {
  const aLaCarteTotalCents = computeALaCarteTotalCents(items);
  const savingsCents = aLaCarteTotalCents - dealPriceCents;
  const percentOff =
    aLaCarteTotalCents > 0 ? Math.round((savingsCents / aLaCarteTotalCents) * 1000) / 10 : 0;
  const costsMore = dealPriceCents >= aLaCarteTotalCents;
  return { aLaCarteTotalCents, dealPriceCents, savingsCents, percentOff, costsMore };
}
