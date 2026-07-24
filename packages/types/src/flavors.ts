export interface Flavor {
  id: string;
  name: string;
  /**
   * Price impact of choosing this flavor, in cents. Optional and additive —
   * callers that omit it (or pass `0`) render no price text at all.
   */
  priceDeltaCents?: number;
}
