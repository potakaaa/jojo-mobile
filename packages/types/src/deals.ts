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
 * VALUE-UNIT NOTE: `minimumOrderAmount` is CENTS here, for internal consistency
 * with the cents-based cart contract (`unitPriceCents`, `amountCents`).
 * `discountValue` is polymorphic: a percentage (0–100) for `percentage_discount`,
 * cents for `fixed_discount`, and unused (0) for other deal types. The server
 * columns `discount_value` / `minimum_order_amount` are `numeric(10,2)` decimal
 * PHP major units — a future API-wiring plan must convert `minimumOrderAmount`
 * (×100) and `discountValue` (×100, only when `dealType === 'fixed_discount'`)
 * when populating this client shape. Do NOT convert `discountValue` for
 * `percentage_discount` — it is already a percentage on both sides.
 */
export interface Deal {
  id: string;
  title: string;
  description?: string;
  discountLabel: string;
  imageUrl?: string;
  validUntil?: string;
  dealType: DealType;
  discountValue: number; // polymorphic — see VALUE-UNIT NOTE
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
