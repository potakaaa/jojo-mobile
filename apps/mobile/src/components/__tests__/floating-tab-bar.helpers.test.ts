import { describe, expect, test } from 'vitest';

import {
  decideTabTapAction,
  isNestedTabRoute,
  resolveTabBarClearance,
} from '../floating-tab-bar.helpers';

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

/**
 * A5 / AC16 — the tab-icon tap DECISION only.
 *
 * Scope note, verbatim from the SPEC: these prove the decision function picks
 * the right one of {pop-to-root, scroll-to-top, no-op}. They do NOT prove the
 * resulting native pop or native animated scroll happens on screen — that half
 * is AC14/AC15, Agent-Probe only (no RN navigation/gesture E2E runner exists).
 */
describe('decideTabTapAction', () => {
  test('re-tapping the active tab while nested pops to root', () => {
    expect(decideTabTapAction(true, false)).toBe('pop-to-root');
  });

  test('re-tapping the active tab when already at root scrolls to top', () => {
    expect(decideTabTapAction(true, true)).toBe('scroll-to-top');
  });

  test('tapping a DIFFERENT tab is a no-op here (plain navigate is left untouched)', () => {
    expect(decideTabTapAction(false, true)).toBe('no-op');
    expect(decideTabTapAction(false, false)).toBe('no-op');
  });

  test('the two stages are mutually exclusive — one tap never both pops and scrolls', () => {
    // Same-tab re-tap always yields exactly ONE action, and which one is decided
    // solely by whether the tab is at its root.
    expect(decideTabTapAction(true, false)).not.toBe(decideTabTapAction(true, true));
  });

  test('composes with isNestedTabRoute the way the tab bar calls it', () => {
    // The bar passes `!isNestedTabRoute(route)` as `isAtRoot`; wiring the two
    // together here guards the call-site contract, not just the pure function.
    const nested = { state: { index: 2 } };
    const atRoot = { state: { index: 0 } };
    const uninitialized = {};

    expect(decideTabTapAction(true, !isNestedTabRoute(nested))).toBe('pop-to-root');
    expect(decideTabTapAction(true, !isNestedTabRoute(atRoot))).toBe('scroll-to-top');
    // A tab whose nested navigator has not initialized counts as "at root".
    expect(decideTabTapAction(true, !isNestedTabRoute(uninitialized))).toBe('scroll-to-top');
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
