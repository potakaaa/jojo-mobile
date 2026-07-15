import type { CouponDisplay } from '@jojopotato/types';

import type { ApiCouponWithLabel } from '@/lib/api-client';

/**
 * Pure adapter: server `ApiCouponWithLabel` → UI `CouponDisplay` (consumed by
 * `@jojopotato/ui`'s `CouponCard`). The server already derived a human-readable
 * `displayLabel` (via its deal/reward join), so:
 *  - `title`       = `displayLabel` (e.g. "₱50 OFF", "Free item")
 *  - `discountLabel` = a short, status-driven badge line
 *  - `isRedeemed`  = `status === 'used'`
 * Unit-testable in isolation (no rendering) — see `to-coupon-display.test.ts`.
 */
export function toCouponDisplay(coupon: ApiCouponWithLabel): CouponDisplay {
  return {
    id: coupon.id,
    code: coupon.code,
    title: coupon.displayLabel,
    discountLabel: statusLabel(coupon.status),
    ...(coupon.expiresAt ? { expiresAt: coupon.expiresAt } : {}),
    isRedeemed: coupon.status === 'used',
  };
}

/** Short badge line shown under the coupon title, driven by effective status. */
function statusLabel(status: ApiCouponWithLabel['status']): string {
  switch (status) {
    case 'used':
      return 'Used';
    case 'expired':
      return 'Expired';
    default:
      return 'Ready to use';
  }
}
