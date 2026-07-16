import { expect, test } from 'vitest';

import { computeALaCarteTotalCents, computeDealSavings } from './deal-savings';

// AC-E7 — pure savings math for the deal create wizard.

test('computeALaCarteTotalCents sums unitCents × quantity across N items', () => {
  expect(
    computeALaCarteTotalCents([
      { unitCents: 10000, quantity: 2 },
      { unitCents: 5000, quantity: 1 },
      { unitCents: 250, quantity: 4 },
    ]),
  ).toBe(26000);
});

test('computeALaCarteTotalCents is 0 for an empty list', () => {
  expect(computeALaCarteTotalCents([])).toBe(0);
});

test('computeDealSavings reports the saving amount and percent off when the deal is cheaper', () => {
  const s = computeDealSavings([{ unitCents: 10000, quantity: 2 }], 15000);
  expect(s.aLaCarteTotalCents).toBe(20000);
  expect(s.dealPriceCents).toBe(15000);
  expect(s.savingsCents).toBe(5000);
  expect(s.percentOff).toBe(25);
  expect(s.costsMore).toBe(false);
});

test('computeDealSavings rounds percent off to one decimal', () => {
  // à-la-carte 30000, deal 20000 → saves 10000 → 33.333...% → 33.3
  const s = computeDealSavings([{ unitCents: 15000, quantity: 2 }], 20000);
  expect(s.savingsCents).toBe(10000);
  expect(s.percentOff).toBe(33.3);
});

test('computeDealSavings flips to costsMore when the deal price exceeds the à-la-carte total', () => {
  const s = computeDealSavings([{ unitCents: 5000, quantity: 1 }], 8000);
  expect(s.savingsCents).toBe(-3000);
  expect(s.costsMore).toBe(true);
});

test('computeDealSavings treats an exactly-equal deal price as costsMore (boundary)', () => {
  const s = computeDealSavings([{ unitCents: 5000, quantity: 2 }], 10000);
  expect(s.aLaCarteTotalCents).toBe(10000);
  expect(s.savingsCents).toBe(0);
  expect(s.percentOff).toBe(0);
  expect(s.costsMore).toBe(true);
});

test('computeDealSavings yields 0 percent and costsMore for an empty item list', () => {
  const s = computeDealSavings([], 5000);
  expect(s.aLaCarteTotalCents).toBe(0);
  expect(s.percentOff).toBe(0);
  expect(s.costsMore).toBe(true);
});
