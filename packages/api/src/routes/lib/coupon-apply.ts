import type { AppliedDiscount, Cart } from '@jojopotato/types';
import {
  catalogDealToDeal,
  checkDealEligibility,
  checkRewardEligibility,
  computeDealDiscountCents,
  computeRewardDiscountCents,
  findCatalogDealByCode,
} from '@jojopotato/utils';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/client';
import {
  branchProductAvailability,
  branches,
  coupons,
  productOptions,
  products,
  rewards,
} from '../../db/schema/index';
import { numericToCents } from './serializers';

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
 * Reward coupons are resolved from the caller's OWN `coupons` rows only (scoped by
 * `(code, user_id)` — a miss returns the same `not_found` as an unknown code, so a
 * coupon's existence never leaks across users). Deal codes resolve against the
 * static `DEAL_CATALOG`, with slug restrictions resolved to real seeded ids here.
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

  // 1. Reward coupon — the caller's own coupon row, joined to its reward.
  const [couponRow] = await dbc
    .select({
      coupon: coupons,
      rewardName: rewards.name,
      rewardEligibleProductId: rewards.eligible_product_id,
    })
    .from(coupons)
    .leftJoin(rewards, eq(coupons.reward_id, rewards.id))
    .where(and(eq(coupons.code, code), eq(coupons.user_id, userId)));

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

  // 2. Deal code — static catalog, slug restrictions resolved to real ids here.
  const catalogDeal = findCatalogDealByCode(code);
  if (catalogDeal) {
    const productIds =
      catalogDeal.eligibleProductSlugs.length > 0
        ? (
            await dbc
              .select({ id: products.id })
              .from(products)
              .where(inArray(products.slug, catalogDeal.eligibleProductSlugs))
          ).map((r) => r.id)
        : [];
    const branchIds =
      catalogDeal.eligibleBranchSlugs.length > 0
        ? (
            await dbc
              .select({ id: branches.id })
              .from(branches)
              .where(inArray(branches.slug, catalogDeal.eligibleBranchSlugs))
          ).map((r) => r.id)
        : [];

    const deal = catalogDealToDeal(catalogDeal, productIds, branchIds);
    // Deal usage-limit checks have no server-side persisted source this round
    // (documented STAR-004 known limitation) — pass an empty usage history.
    const result = checkDealEligibility(deal, cart, pickupBranchId, []);
    if (!result.eligible) {
      return { ok: false, status: 400, reason: result.reason, message: result.message };
    }
    return {
      ok: true,
      rewardCouponId: null,
      discount: {
        source: 'deal',
        refId: deal.id,
        label: deal.title,
        amountCents: computeDealDiscountCents(deal, cart),
      },
    };
  }

  // 3. Neither a reward coupon nor a known deal code.
  return { ok: false, status: 400, reason: 'not_found', message: 'Coupon code not found.' };
}
