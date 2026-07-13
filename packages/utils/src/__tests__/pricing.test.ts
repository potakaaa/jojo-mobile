import { describe, expect, it } from 'vitest';

import { computeUnitPrice, parsePriceString } from '../pricing';

describe('parsePriceString', () => {
  it.each([
    ['89.00', 89],
    ['109.50', 109.5],
    ['0', 0],
    ['30', 30],
  ])('parses "%s" -> %d', (input, expected) => {
    expect(parsePriceString(input)).toBe(expected);
  });

  it('throws on non-numeric input', () => {
    expect(() => parsePriceString('not-a-price')).toThrow(/cannot parse/);
  });
});

describe('computeUnitPrice (AC7)', () => {
  it.each([
    // base, deltas, expected
    ['no options selected', 89, [], 89],
    ['single option delta', 89, [30], 119],
    ['multiple option groups', 59, [20, 15], 94],
    ['zero-delta options only', 69, [0, 0], 69],
    ['mixed zero and non-zero', 109, [0, 30, 20], 159],
  ])('%s', (_label, base, deltas, expected) => {
    expect(computeUnitPrice(base as number, deltas as number[])).toBe(expected);
  });

  it('rounds float drift to centavo precision', () => {
    expect(computeUnitPrice(0.1, [0.2])).toBe(0.3);
  });
});
