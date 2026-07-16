/**
 * Tiny module store for the raw coupon/deal code the user actually typed in the
 * cart (STAR-004). The canonical `Cart`/`AppliedDiscount` shape deliberately does
 * NOT carry the raw code, so this out-of-band store threads it from the cart
 * "apply" step to the checkout "place order" call (which passes it as
 * `couponCode` to `POST /orders`, where the coupon is re-validated + consumed).
 *
 * Module store (not React state) so both the cart and checkout screens read the
 * same value across navigation without prop-drilling — mirrors the
 * `features/theme/theme-preference.ts` module-store pattern. Set on a successful
 * apply, cleared when the discount is removed or the order is placed.
 */
let appliedCouponCode: string | null = null;

export function setAppliedCouponCode(code: string | null): void {
  appliedCouponCode = code;
}

export function getAppliedCouponCode(): string | null {
  return appliedCouponCode;
}
