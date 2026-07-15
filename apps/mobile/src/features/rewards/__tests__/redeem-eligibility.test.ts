import { describe, expect, it } from 'vitest';

import { getRewardAffordability } from '../lib/redeem-eligibility';

describe('getRewardAffordability', () => {
  it('is affordable and has no message when balance meets the cost exactly', () => {
    const result = getRewardAffordability(5, 5);
    expect(result.canAfford).toBe(true);
    expect(result.starsShort).toBe(0);
    expect(result.message).toBeNull();
  });

  it('is affordable when balance exceeds the cost', () => {
    const result = getRewardAffordability(12, 5);
    expect(result.canAfford).toBe(true);
    expect(result.starsShort).toBe(0);
    expect(result.message).toBeNull();
  });

  it('disables redeem and reports how many more stars are needed (plural)', () => {
    const result = getRewardAffordability(2, 5);
    expect(result.canAfford).toBe(false);
    expect(result.starsShort).toBe(3);
    expect(result.message).toBe('Need 3 more stars');
  });

  it('uses the singular "star" when exactly one is short', () => {
    const result = getRewardAffordability(4, 5);
    expect(result.canAfford).toBe(false);
    expect(result.starsShort).toBe(1);
    expect(result.message).toBe('Need 1 more star');
  });

  it('clamps negative / non-finite inputs to a safe 0', () => {
    expect(getRewardAffordability(-3, 5)).toMatchObject({ canAfford: false, starsShort: 5 });
    expect(getRewardAffordability(3, -1)).toMatchObject({ canAfford: true, starsShort: 0 });
    expect(getRewardAffordability(Number.NaN, 5)).toMatchObject({ starsShort: 5 });
  });
});
