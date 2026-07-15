import type { AppliedDiscount, Cart } from '@jojopotato/types';

import { env } from '@/config/env';
import { authClient } from '@/features/auth/lib/auth-client';

/**
 * Coupon/deal apply API access (STAR-004). `POST /coupons/apply` is OUR OWN
 * Express route (NOT better-auth), so — like `features/rewards/lib/rewards-api.ts`
 * — we use a plain `fetch` against an ABSOLUTE URL with the persisted session
 * cookie, NOT `authClient.$fetch` (whose relative paths resolve against the
 * better-auth basePath). The server validates the code + recomputes the discount
 * against the passed cart and performs ZERO DB mutation (the discount is only
 * consumed later, at order placement).
 */

export type ApplyCouponResult =
  { ok: true; discount: AppliedDiscount } | { ok: false; reason: string; message: string };

/** Map a cart to the `/coupons/apply` request cart-items shape (ids + quantity). */
function toCartItems(cart: Cart) {
  return cart.items.map((line) => ({
    productId: line.menuItemId,
    quantity: line.quantity,
    selectedOptions: line.selectedOptions.map((o) => ({ optionId: o.id })),
  }));
}

/**
 * Validate a reward/deal `code` against the current cart, returning the computed
 * discount to hand to `useCart().applyDiscount`. Never throws for a business
 * rejection (unknown code, ineligible, etc.) — those come back as
 * `{ ok: false, reason, message }`; only a transport failure yields a generic
 * error message.
 */
export async function applyCouponCode(
  code: string,
  cart: Cart,
  pickupBranchId: string,
): Promise<ApplyCouponResult> {
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}/coupons/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: authClient.getCookie() },
      body: JSON.stringify({ code, pickupBranchId, cartItems: toCartItems(cart) }),
    });
  } catch {
    return {
      ok: false,
      reason: 'network_error',
      message: 'Could not reach the server. Try again.',
    };
  }

  const data = (await res.json().catch(() => null)) as {
    discount?: AppliedDiscount;
    error?: string;
    reason?: string;
  } | null;

  if (res.ok && data?.discount) {
    return { ok: true, discount: data.discount };
  }
  return {
    ok: false,
    reason: data?.reason ?? 'not_found',
    message: data?.error ?? 'This code could not be applied.',
  };
}
