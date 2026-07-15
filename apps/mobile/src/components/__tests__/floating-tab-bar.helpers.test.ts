import { describe, expect, test } from 'vitest';

import { isNestedTabRoute } from '../floating-tab-bar.helpers';

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
