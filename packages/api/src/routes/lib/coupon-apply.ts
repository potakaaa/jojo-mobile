import type { AppliedDiscount, Cart } from '@jojopotato/types';
import {
  checkDealEligibility,
  checkFreeBenefit,
  checkRewardEligibility,
  computeDealDiscountCents,
  computeFreeUpgradeDiscountCents,
  computeRewardDiscountCents,
  subtotalCents,
} from '@jojopotato/utils';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db } from '../../db/client';
import {
  branchProductAvailability,
  coupons,
  offerBranches,
  offerProducts,
  offers,
  productOptions,
  products,
  rewards,
  userStars,
} from '../../db/schema/index';
import { numericToCents, serializeDeal } from './serializers';

/** Read-capable handle: the app `db` OR an open transaction — both share the query surface. */
export type Queryer = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Cart-line input shared by the apply route and the order-placement recompute. */
export interface CouponCartItem {
  productId: string;
  quantity: number;
  selectedOptions?: { optionId: string }[];
}

export type CouponResolution =
  | {
      ok: true;
      discount: AppliedDiscount;
      rewardCouponId: string | null;
      requiredStars: number | null;
    }
  | { ok: false; status: number; reason: string; message: string };

/**
 * Build a cents-based `Cart` from raw cart items by looking up real product base
 * prices + option deltas in the DB (mirrors `orders.ts`'s base+option price math,
 * lines 121-140). Only active products available at the branch contribute a line;
 * unknown/unavailable products are dropped (they cannot satisfy eligibility or
 * add to the subtotal preview). Framework code, so it can run under `db` or a tx.
 */
export async function buildCartFromItems(
  dbc: Queryer,
  pickupBranchId: string,
  items: CouponCartItem[],
): Promise<Cart> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  if (productIds.length === 0) {
    return { id: 'apply-cart', items: [], pickupBranchId };
  }

  const availableRows = await dbc
    .select({ product: products })
    .from(products)
    .innerJoin(
      branchProductAvailability,
      and(
        eq(branchProductAvailability.product_id, products.id),
        eq(branchProductAvailability.branch_id, pickupBranchId),
        eq(branchProductAvailability.is_available, true),
      ),
    )
    .where(and(inArray(products.id, productIds), eq(products.is_active, true)));
  const productById = new Map(availableRows.map((r) => [r.product.id, r.product]));

  const optionRows = await dbc
    .select()
    .from(productOptions)
    .where(and(inArray(productOptions.product_id, productIds), eq(productOptions.is_active, true)));
  const optionById = new Map(optionRows.map((o) => [o.id, o]));

  const cartItems = items.flatMap((line) => {
    const product = productById.get(line.productId);
    if (!product) return [];
    let unitPriceCents = numericToCents(product.base_price);
    const selectedOptions = (line.selectedOptions ?? []).flatMap((sel) => {
      const option = optionById.get(sel.optionId);
      if (!option || option.product_id !== product.id) return [];
      const deltaCents = numericToCents(option.price_delta);
      unitPriceCents += deltaCents;
      return [
        {
          id: option.id,
          optionType: option.option_type as 'size' | 'flavor' | 'add_on',
          name: option.name,
          priceDeltaCents: deltaCents,
        },
      ];
    });
    return [
      {
        lineId: line.productId,
        menuItemId: product.id,
        quantity: line.quantity,
        productNameSnapshot: product.name,
        unitPriceCents,
        selectedOptions,
      },
    ];
  });

  return { id: 'apply-cart', items: cartItems, pickupBranchId };
}

/**
 * Resolve + validate a coupon `code` against a cart, returning the computed
 * discount (and, for a reward coupon, the coupon row id that order-placement must
 * consume). This is the SINGLE shared resolution path used by BOTH
 * `POST /coupons/apply` (preview, zero mutation) and the `POST /orders`
 * placement recompute (defense in depth — the discount is never trusted from the
 * client's apply-time snapshot). It performs NO writes.
 *
 * Two coupon families are matched, in order:
 *  1. Reward coupons — resolved from the caller's OWN `coupons` rows scoped by
 *     `(code, user_id, reward_id IS NOT NULL)` (ADM-008 LD1: the `reward_id`
 *     scoping is required so a TARGETED offer-coupon whose `user_id` is set does
 *     not incorrectly match here and get rejected with the wrong reason).
 *  2. Offer coupons (ADM-008) — admin-issued codes backed by an `offers` row.
 *     A bulk-issued coupon (`user_id IS NULL`) is claimable by any caller; a
 *     targeted coupon (`user_id` set) only by its owner. The discount mechanic is
 *     read from the joined `offers` row via the shared `checkDealEligibility` /
 *     `computeDealDiscountCents` engine. A matched offer-coupon's row `id` is
 *     returned as `rewardCouponId` so the generic atomic burn in `orders.ts`
 *     consumes it unchanged.
 *
 * A miss in both returns the same `not_found` as an unknown code, so a coupon's
 * existence never leaks across users.
 */
export async function resolveCouponDiscount(
  dbc: Queryer,
  params: {
    code: string;
    userId: string;
    pickupBranchId: string;
    cart: Cart;
    /**
     * Order-placement only: defer the single-use check to the caller's
     * `UPDATE ... WHERE status='available'` guard (409) rather than rejecting a
     * used coupon here with `already_used` (400). Apply-preview leaves this false.
     */
    allowUsedReward?: boolean;
  },
): Promise<CouponResolution> {
  const { code, userId, pickupBranchId, cart, allowUsedReward } = params;

  // 1. Reward coupon — the caller's own coupon row, joined to its reward. The
  //    `reward_id IS NOT NULL` filter (ADM-008 LD1, required) confines this branch
  //    to reward-coupons: a targeted offer-coupon (reward_id NULL, user_id set)
  //    would otherwise match here and be wrongly rejected (`no_eligible_product`).
  const [couponRow] = await dbc
    .select({
      coupon: coupons,
      rewardName: rewards.name,
      rewardType: rewards.reward_type,
      rewardEligibleProductId: rewards.eligible_product_id,
      rewardRequiredStars: rewards.required_stars,
    })
    .from(coupons)
    .leftJoin(rewards, eq(coupons.reward_id, rewards.id))
    .where(and(eq(coupons.code, code), eq(coupons.user_id, userId), isNotNull(coupons.reward_id)));

  if (couponRow) {
    const { coupon, rewardType } = couponRow;
    const reward =
      coupon.reward_id !== null
        ? {
            rewardType: couponRow.rewardType ?? '',
            eligibleProductId: couponRow.rewardEligibleProductId,
          }
        : null;
    const result = checkRewardEligibility(
      { status: coupon.status, expiresAt: coupon.expires_at },
      reward,
      cart,
      { allowUsed: allowUsedReward },
    );
    if (!result.eligible) {
      return { ok: false, status: 400, reason: result.reason, message: result.message };
    }

    // ADM-005 (D2/checklist 3b) reward_type dispatch. `free_item` waives one unit
    // of the bound product (reward math verbatim); `free_upgrade` waives one unit's
    // paid size-upgrade delta (reuses the offer-side helper — signature-identical,
    // no adapter). `computeRewardDiscountCents` stays a pure single-purpose helper
    // (no reward_type dispatch inside it). Dual-clamped to [0, subtotal] mirroring
    // the offer-side free-mechanic branch below.
    const rawAmount =
      rewardType === 'free_upgrade'
        ? computeFreeUpgradeDiscountCents(reward!.eligibleProductId!, cart)
        : computeRewardDiscountCents(reward!.eligibleProductId!, cart);
    const amountCents = Math.max(0, Math.min(rawAmount, subtotalCents(cart)));

    // Zero-guard reject (money-path, Known-Gap BANNED): a `free_upgrade` reward
    // coupon whose bound product has no paid size upgrade in the cart computes to 0
    // — REJECT and leave the coupon UNBURNED (never a ₱0-and-burn), mirroring the
    // offer-side pattern. Scoped to `free_upgrade`: `free_item` cannot reach here
    // with a 0 (checkRewardEligibility already required the bound product in cart,
    // so its unit price is > 0). Closes the latent ₱0-burn hole for the new case.
    if (rewardType === 'free_upgrade' && amountCents <= 0) {
      return {
        ok: false,
        status: 400,
        reason: 'no_upgrade_to_waive',
        message: 'Add a size upgrade to the eligible item to use this reward.',
      };
    }

    // Star Expendable (D5): stars are a real spendable currency. Reject when the
    // caller's balance can't cover the reward's cost. Runs in the SHARED resolver
    // so `/coupons/apply` (preview) and `POST /orders` (placement) enforce it
    // symmetrically. A missing `user_stars` row reads as `current = 0`, so any
    // reward requiring stars is correctly rejected. This is the SOLE floor —
    // `user_stars.current_stars` has no DB CHECK ≥ 0 — so the guard MUST precede
    // the placement decrement (which it does: this is the resolver, called before
    // the tx decrement in orders.ts).
    if (couponRow.rewardRequiredStars != null) {
      const [balance] = await dbc
        .select({ current: userStars.current_stars })
        .from(userStars)
        .where(eq(userStars.user_id, userId));
      if ((balance?.current ?? 0) < couponRow.rewardRequiredStars) {
        return {
          ok: false,
          status: 400,
          reason: 'insufficient_stars',
          message: "You don't have enough stars to redeem this reward.",
        };
      }
    }

    return {
      ok: true,
      rewardCouponId: coupon.id,
      requiredStars: couponRow.rewardRequiredStars,
      discount: {
        source: 'reward',
        refId: coupon.id,
        label: couponRow.rewardName ?? 'Reward',
        amountCents,
      },
    };
  }

  // 2. Offer coupon (ADM-008) — an admin-issued code backed by an `offers` row.
  //    Matched by unique code + `offer_id IS NOT NULL`, then joined to its offer
  //    for the discount mechanic. Retired the static `DEAL_CATALOG` path.
  const [offerCouponRow] = await dbc
    .select({ coupon: coupons, offer: offers })
    .from(coupons)
    .innerJoin(offers, eq(coupons.offer_id, offers.id))
    .where(and(eq(coupons.code, code), isNotNull(coupons.offer_id)));

  if (offerCouponRow) {
    const { coupon, offer } = offerCouponRow;

    // Ownership: a bulk coupon (user_id NULL) is claimable by anyone (claim-on-
    // redeem); a targeted coupon belongs only to its owner. A code owned by a
    // different user reads as `not_found` (existence never leaks across users).
    if (coupon.user_id !== null && coupon.user_id !== userId) {
      return { ok: false, status: 400, reason: 'not_found', message: 'Coupon code not found.' };
    }

    // Coupon-status pre-checks mirror the reward-coupon reason-code contract.
    // `allowUsedReward` (order placement) defers the used check to the atomic
    // burn UPDATE's `WHERE status='available'` guard, exactly like reward coupons.
    if (!allowUsedReward && coupon.status === 'used') {
      return {
        ok: false,
        status: 400,
        reason: 'already_used',
        message: 'This coupon has already been used.',
      };
    }
    if (coupon.status === 'expired') {
      return { ok: false, status: 400, reason: 'expired', message: 'This coupon has expired.' };
    }
    if (coupon.expires_at !== null && coupon.expires_at.getTime() < Date.now()) {
      return { ok: false, status: 400, reason: 'expired', message: 'This coupon has expired.' };
    }

    // Offer eligibility (window/branch/product/minimum) via the shared engine —
    // build the cents-based `Deal` from the offer row + its scope junctions using
    // the same polymorphic money rule the public `GET /deals` route serializes.
    const productIds = (
      await dbc
        .select({ id: offerProducts.product_id })
        .from(offerProducts)
        .where(eq(offerProducts.offer_id, offer.id))
    ).map((r) => r.id);
    const branchIds = (
      await dbc
        .select({ id: offerBranches.branch_id })
        .from(offerBranches)
        .where(eq(offerBranches.offer_id, offer.id))
    ).map((r) => r.id);

    const deal = serializeDeal(offer, branchIds, productIds);
    const result = checkDealEligibility(deal, cart, pickupBranchId, []);
    if (!result.eligible) {
      return { ok: false, status: 400, reason: result.reason, message: result.message };
    }

    // ADM-008 Fix 6 (P2 mechanic dispatch, D4). Four of the six `deal_type`
    // mechanics route through `computeDealDiscountCents`'s cheapest-eligible-line
    // branch (discount.ts) — `buy_one_take_one`, `bundle`, `free_item`,
    // `free_upgrade` — which silently makes the cheapest cart line free. Only
    // `percentage_discount` / `fixed_discount` have real coupon-redemption discount
    // math; the two free mechanics get configured benefit semantics; b1t1/bundle
    // never redeem via a coupon. This dispatch runs AFTER eligibility (deterministic
    // reason ordering) and BEFORE any discount math, on BOTH preview and placement
    // (single resolver). The coupon is NEVER burned on a reject (apply is
    // zero-mutation; placement throws before the burn UPDATE).

    // (a) PERMANENT deny — `buy_one_take_one` / `bundle` have no coupon-redemption
    //     semantics in this plan, ever. Untouched by P2's free-mechanic dispatch.
    if (offer.deal_type === 'buy_one_take_one' || offer.deal_type === 'bundle') {
      return {
        ok: false,
        status: 400,
        reason: 'no_eligible_product',
        message: 'This offer type cannot be redeemed with a coupon.',
      };
    }

    // (b) Free-mechanic configured-path dispatch (replaces the P1b interim deny). An
    //     unconfigured offer (`benefit_product_id` NULL) stays rejected — the D4
    //     permanent safety net so a legacy free offer never mis-discounts. A
    //     configured offer runs the real benefit check + math: `free_item` waives one
    //     unit of the benefit product (reward math verbatim), `free_upgrade` waives
    //     one unit's paid size-upgrade charge. A computed 0 is a REJECT (SPEC AC6 —
    //     never ₱0-and-burn), dual-clamped to [0, subtotal].
    if (offer.deal_type === 'free_item' || offer.deal_type === 'free_upgrade') {
      if (offer.benefit_product_id === null) {
        return {
          ok: false,
          status: 400,
          reason: 'no_eligible_product',
          message: 'This offer is not configured for redemption.',
        };
      }
      const benefit = checkFreeBenefit(offer.deal_type, offer.benefit_product_id, cart);
      if (!benefit.eligible) {
        return { ok: false, status: 400, reason: benefit.reason, message: benefit.message };
      }
      const rawAmount =
        offer.deal_type === 'free_item'
          ? computeRewardDiscountCents(offer.benefit_product_id, cart)
          : computeFreeUpgradeDiscountCents(offer.benefit_product_id, cart);
      const amountCents = Math.max(0, Math.min(rawAmount, subtotalCents(cart)));
      if (amountCents <= 0) {
        return {
          ok: false,
          status: 400,
          reason: 'no_eligible_product',
          message: 'This offer is not configured for redemption.',
        };
      }
      return {
        ok: true,
        rewardCouponId: coupon.id,
        requiredStars: null,
        discount: { source: 'deal', refId: offer.id, label: offer.title, amountCents },
      };
    }

    // (c) ALLOWLIST — only `percentage_discount` / `fixed_discount` may reach
    //     `computeDealDiscountCents`. Any other/unknown mechanic is rejected (parity
    //     with the orders.ts legacy allowlist) rather than silently falling into the
    //     cheapest-eligible-line path. ADM-008 Fix 6 F1: the computed amount is
    //     dual-clamped to [0, subtotal] and a non-positive result is REJECTED (mirrors
    //     the free branch above). A legacy offer with a NULL/0/negative discount_value
    //     — or a percentage that rounds to zero on a micro-subtotal — has no redeemable
    //     value; it must never resolve ok and burn the coupon for zero benefit.
    if (offer.deal_type === 'percentage_discount' || offer.deal_type === 'fixed_discount') {
      const amountCents = Math.max(
        0,
        Math.min(computeDealDiscountCents(deal, cart), subtotalCents(cart)),
      );
      if (amountCents <= 0) {
        return {
          ok: false,
          status: 400,
          reason: 'no_eligible_product',
          message: 'This offer has no redeemable value.',
        };
      }
      return {
        ok: true,
        rewardCouponId: coupon.id,
        requiredStars: null,
        discount: {
          source: 'deal',
          refId: offer.id,
          label: offer.title,
          amountCents,
        },
      };
    }
    return {
      ok: false,
      status: 400,
      reason: 'no_eligible_product',
      message: 'This offer type cannot be redeemed with a coupon.',
    };
  }

  // 3. Neither a reward coupon nor a known offer coupon.
  return { ok: false, status: 400, reason: 'not_found', message: 'Coupon code not found.' };
}
