import type { AppliedDiscount, Cart } from '@jojopotato/types';
import {
  checkDealEligibility,
  checkRewardEligibility,
  computeDealDiscountCents,
  computeRewardDiscountCents,
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
} from '../../db/schema/index';
import { numericToCents, serializeDeal } from './serializers';

/** Read-capable handle: the app `db` OR an open transaction — both share the query surface. */
type Queryer = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Cart-line input shared by the apply route and the order-placement recompute. */
export interface CouponCartItem {
  productId: string;
  quantity: number;
  selectedOptions?: { optionId: string }[];
}

export type CouponResolution =
  | { ok: true; discount: AppliedDiscount; rewardCouponId: string | null }
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
      rewardEligibleProductId: rewards.eligible_product_id,
    })
    .from(coupons)
    .leftJoin(rewards, eq(coupons.reward_id, rewards.id))
    .where(and(eq(coupons.code, code), eq(coupons.user_id, userId), isNotNull(coupons.reward_id)));

  if (couponRow) {
    const { coupon } = couponRow;
    const reward =
      coupon.reward_id !== null ? { eligibleProductId: couponRow.rewardEligibleProductId } : null;
    const result = checkRewardEligibility(
      { status: coupon.status, expiresAt: coupon.expires_at },
      reward,
      cart,
      { allowUsed: allowUsedReward },
    );
    if (!result.eligible) {
      return { ok: false, status: 400, reason: result.reason, message: result.message };
    }
    const amountCents = computeRewardDiscountCents(reward!.eligibleProductId!, cart);
    return {
      ok: true,
      rewardCouponId: coupon.id,
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

    // ADM-008 Fix 6 (P1 permanent guard, D4). A `free_item`/`free_upgrade` offer
    // with no configured `benefit_product_id` has no real redemption meaning —
    // legacy such offers (all created before this fix) would otherwise route to
    // `computeDealDiscountCents`'s cheapest-eligible-line branch and silently make
    // the cheapest cart line free. Reject here instead, AFTER eligibility so the
    // reason ordering is deterministic and BEFORE any discount math. Runs on BOTH
    // preview and placement (single resolver); the coupon is NEVER burned on this
    // reject (apply is zero-mutation; placement throws before the burn UPDATE).
    // Permanent legacy safety net — stays even after P2 lands the real semantics.
    if (
      (offer.deal_type === 'free_item' || offer.deal_type === 'free_upgrade') &&
      offer.benefit_product_id === null
    ) {
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
      discount: {
        source: 'deal',
        refId: offer.id,
        label: offer.title,
        amountCents: computeDealDiscountCents(deal, cart),
      },
    };
  }

  // 3. Neither a reward coupon nor a known offer coupon.
  return { ok: false, status: 400, reason: 'not_found', message: 'Coupon code not found.' };
}
