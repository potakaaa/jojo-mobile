import { describe, expect, test } from 'vitest';

import { isNestedTabRoute, resolveTabBarClearance } from '../floating-tab-bar.helpers';

describe('isNestedTabRoute', () => {
  test('returns false for a root route (nested state.index 0)', () => {
    expect(isNestedTabRoute({ state: { index: 0 } })).toBe(false);
  });

  test('returns false for a route with no nested state', () => {
    expect(isNestedTabRoute({})).toBe(false);
  });

  test('returns true for a nested route (nested state.index 1)', () => {
    expect(isNestedTabRoute({ state: { index: 1 } })).toBe(true);
  });
});

describe('resolveTabBarClearance', () => {
  // A deliberately nonzero, non-round footprint: if a test passes with this
  // value present, the footprint term was genuinely ignored — not coincidentally
  // zero. (Real value today is TAB_BAR_FOOTPRINT = 85.)
  const FOOTPRINT = 85;

  test('isNested=true reserves the device inset ONLY — footprint term is ignored', () => {
    expect(resolveTabBarClearance(true, FOOTPRINT, 34)).toBe(34);
  });

  test('isNested=false reserves footprint + device inset', () => {
    expect(resolveTabBarClearance(false, FOOTPRINT, 34)).toBe(119);
  });

  test('isNested=true with a zero inset (no home indicator) reserves nothing', () => {
    expect(resolveTabBarClearance(true, FOOTPRINT, 0)).toBe(0);
  });

  test('isNested=false with a zero inset reserves the footprint only', () => {
    expect(resolveTabBarClearance(false, FOOTPRINT, 0)).toBe(FOOTPRINT);
  });

  test('is a plain equality-style sum — no rounding applied to a fractional inset', () => {
    // Callers add the result straight into layout `paddingBottom`, so the
    // function must not silently round/floor a fractional device inset.
    expect(resolveTabBarClearance(true, FOOTPRINT, 34.5)).toBe(34.5);
    expect(resolveTabBarClearance(false, FOOTPRINT, 0.5)).toBe(85.5);
  });

  test('nested clearance is always strictly less than root clearance for a real footprint', () => {
    // The dead-space bug this function exists to fix, stated as an invariant.
    expect(resolveTabBarClearance(true, FOOTPRINT, 34)).toBeLessThan(
      resolveTabBarClearance(false, FOOTPRINT, 34),
    );
  });
});
