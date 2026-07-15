import { describe, expect, it } from 'vitest';

import type { ApiCouponWithLabel } from '@/lib/api-client';

import { toCouponDisplay } from './to-coupon-display';

function makeCoupon(overrides: Partial<ApiCouponWithLabel> = {}): ApiCouponWithLabel {
  return {
    id: 'c1',
    userId: 'u1',
    code: 'RWD-ABC123',
    status: 'available',
    dealId: null,
    rewardId: 'r1',
    expiresAt: null,
    usedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    displayLabel: '₱50 OFF',
    ...overrides,
  };
}

describe('toCouponDisplay', () => {
  it('maps an available coupon: title = displayLabel, "Ready to use", not redeemed', () => {
    const display = toCouponDisplay(makeCoupon({ status: 'available' }));
    expect(display.id).toBe('c1');
    expect(display.code).toBe('RWD-ABC123');
    expect(display.title).toBe('₱50 OFF');
    expect(display.discountLabel).toBe('Ready to use');
    expect(display.isRedeemed).toBe(false);
  });

  it('maps a used coupon: isRedeemed true, "Used" badge', () => {
    const display = toCouponDisplay(makeCoupon({ status: 'used' }));
    expect(display.isRedeemed).toBe(true);
    expect(display.discountLabel).toBe('Used');
  });

  it('maps an expired coupon: not redeemed, "Expired" badge', () => {
    const display = toCouponDisplay(makeCoupon({ status: 'expired' }));
    expect(display.isRedeemed).toBe(false);
    expect(display.discountLabel).toBe('Expired');
  });

  it('includes expiresAt only when present', () => {
    expect(toCouponDisplay(makeCoupon({ expiresAt: null })).expiresAt).toBeUndefined();
    expect(toCouponDisplay(makeCoupon({ expiresAt: '2026-08-01T00:00:00.000Z' })).expiresAt).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  it('carries the server displayLabel verbatim as the title (deal- or reward-derived)', () => {
    expect(toCouponDisplay(makeCoupon({ displayLabel: 'Free item' })).title).toBe('Free item');
    expect(toCouponDisplay(makeCoupon({ displayLabel: '20% OFF' })).title).toBe('20% OFF');
  });
});
