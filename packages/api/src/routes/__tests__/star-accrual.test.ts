import { describe, expect, it } from 'vitest';

import {
  computeStarsEarned,
  DEFAULT_STAR_ACCRUAL_CONFIG,
  type StarAccrualConfig,
} from '../lib/star-accrual';

/**
 * Pure unit tests for the count-based accrual math (no DB). A completed order
 * earns exactly ONE star at/above the minimum subtotal, ZERO below it — the
 * subtotal is a gate, never a multiplier.
 */
describe('computeStarsEarned', () => {
  it('earns 1 star at exactly the ₱100 (10000-cent) threshold', () => {
    expect(computeStarsEarned(10_000)).toBe(1);
  });

  it('earns 1 star above the threshold', () => {
    expect(computeStarsEarned(10_001)).toBe(1);
    expect(computeStarsEarned(999_999)).toBe(1);
  });

  it('earns 0 stars below the threshold', () => {
    expect(computeStarsEarned(9_999)).toBe(0);
    expect(computeStarsEarned(0)).toBe(0);
  });

  it('never scales with the amount (count-based, not a ratio)', () => {
    // A huge subtotal still earns exactly 1 — proves it is not a peso ratio.
    expect(computeStarsEarned(10_000_000)).toBe(1);
  });

  it('honors a custom threshold config', () => {
    const config: StarAccrualConfig = { minOrderSubtotalCents: 5_000 };
    expect(computeStarsEarned(5_000, config)).toBe(1);
    expect(computeStarsEarned(4_999, config)).toBe(0);
  });

  it('exposes a ₱100 default threshold', () => {
    expect(DEFAULT_STAR_ACCRUAL_CONFIG.minOrderSubtotalCents).toBe(10_000);
  });
});
