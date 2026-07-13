export type DealType =
  | 'percentage_discount'
  | 'fixed_discount'
  | 'buy_one_take_one'
  | 'free_item'
  | 'free_upgrade'
  | 'bundle';

/**
 * A promotional deal. Superset of the original card-only shape: `discountLabel`
 * and `imageUrl` are retained (consumed by `DealCard`), plus the eligibility /
 * discount fields mirror the server Drizzle schema
 * (`packages/api/src/db/schema/deals.ts`) 1:1 minus casing, with the
 * `deal_products`/`deal_branches` join tables flattened to id arrays for the
 * mock/client layer.
 *
 * VALUE-UNIT NOTE: `discountValue` and `minimumOrderAmount` are CENTS here, for
 * internal consistency with the cents-based cart contract (`unitPriceCents`,
 * `amountCents`). The server columns `discount_value` / `minimum_order_amount`
 * are `numeric(10,2)` decimal PHP major units — a future API-wiring plan must
 * convert (×100) when populating this client shape.
 */
export interface Deal {
  id: string;
  title: string;
  description?: string;
  discountLabel: string;
  imageUrl?: string;
  validUntil?: string;
  dealType: DealType;
  discountValue: number; // cents (see VALUE-UNIT NOTE)
  minimumOrderAmount: number; // cents; 0 = no minimum
  startAt: string; // ISO
  endAt: string; // ISO
  isActive: boolean;
  usageLimitPerUser?: number;
  totalUsageLimit?: number;
  eligibleProductIds: string[]; // empty = all products
  eligibleBranchIds: string[]; // empty = branch-agnostic
  code?: string; // for the cart "Apply coupon/deal" input
}
