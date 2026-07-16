import type { StaffOrderDetail, StaffOrderSummary } from '@jojopotato/types';
import type { InferSelectModel } from 'drizzle-orm';

import type {
  branchProductAvailability,
  branches,
  categories,
  coupons,
  offers,
  orderItems,
  orders,
  productOptions,
  products,
  rewards,
} from '../../db/schema/index';

type BranchRow = InferSelectModel<typeof branches>;
type CategoryRow = InferSelectModel<typeof categories>;
type ProductRow = InferSelectModel<typeof products>;
type ProductOptionRow = InferSelectModel<typeof productOptions>;
type BranchProductAvailabilityRow = InferSelectModel<typeof branchProductAvailability>;
type OrderRow = InferSelectModel<typeof orders>;
type OrderItemRow = InferSelectModel<typeof orderItems>;
type DealRow = InferSelectModel<typeof offers>;
type RewardRow = InferSelectModel<typeof rewards>;
type CouponRow = InferSelectModel<typeof coupons>;

type ProductOptionType = 'size' | 'flavor' | 'add_on';
type DealType = DealRow['deal_type'];

/**
 * A single customization snapshot stored on an order item / carried on a cart
 * line. Mirrors `@jojopotato/types`' `SelectedOption` (cents-based) — defined
 * locally so `packages/api` need not take a workspace dependency on the shared
 * types package just for a boundary shape.
 */
export interface SelectedOption {
  optionId: string;
  optionType: ProductOptionType;
  name: string;
  priceDeltaCents: number;
}

export interface ApiBranch {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  openingHours: string;
  estimatedPrepMinutes: number;
  isAcceptingPickup: boolean;
  /** Display sort weight (ascending) for the no-location branch list order. */
  priority: number;
  /** Great-circle distance in km from a query point, when lat/lng were supplied. */
  distanceKm?: number;
}

/**
 * Admin-facing branch shape (ADM-002). Mirrors `ApiBranch` (minus the query-only
 * `distanceKm`) plus `slug` and `isActive`, both of which the PUBLIC `ApiBranch`
 * omits — the admin dashboard must see every branch's slug and active state,
 * including deactivated (soft-deleted) rows. Declared locally here, matching the
 * existing `ApiBranch`/`ApiOrder`/`ApiDeal` local-declaration convention (no
 * cross-dependency on `packages/types` just for a boundary shape).
 */
export interface AdminBranch {
  id: string;
  name: string;
  slug: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  openingHours: string;
  estimatedPrepMinutes: number;
  isAcceptingPickup: boolean;
  isActive: boolean;
}

// ─── Admin catalog serializers (ADM-003) ────────────────────────────────────
//
// Admin-facing shapes for the product-catalog surface. Declared LOCALLY here
// (never in `packages/types`) matching the `AdminBranch` convention — the admin
// dashboard is the only consumer, and there is no second consumer yet to justify
// promoting these to the shared types package. All money fields are integer
// cents at the boundary (`numericToCents`/`centsToNumeric` are the only place
// the numeric<->cents conversion happens). Unlike the PUBLIC `ApiMenu*` shapes,
// these carry `slug`/`isActive`/`sortOrder` and never hide inactive rows.

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

export interface AdminProduct {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  isActive: boolean;
  isRewardEligible: boolean;
  // ADM-004 deals-as-products: true for a deal-product (surfaced by the dedicated
  // Deals admin screen), false for a regular catalog product. Additive.
  isDeal: boolean;
}

export interface AdminProductOption {
  id: string;
  productId: string;
  optionType: ProductOptionType;
  name: string;
  priceDeltaCents: number;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminBranchAvailability {
  id: string;
  branchId: string;
  productId: string;
  isAvailable: boolean;
}

export function serializeAdminCategory(category: CategoryRow): AdminCategory {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    sortOrder: category.sort_order,
    isActive: category.is_active,
  };
}

export function serializeAdminProduct(product: ProductRow): AdminProduct {
  return {
    id: product.id,
    categoryId: product.category_id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    imageUrl: product.image_url,
    basePriceCents: numericToCents(product.base_price),
    isActive: product.is_active,
    isRewardEligible: product.is_reward_eligible,
    isDeal: product.is_deal,
  };
}

export function serializeAdminProductOption(option: ProductOptionRow): AdminProductOption {
  return {
    id: option.id,
    productId: option.product_id,
    optionType: toOptionType(option.option_type),
    name: option.name,
    priceDeltaCents: numericToCents(option.price_delta),
    isActive: option.is_active,
    sortOrder: option.sort_order,
  };
}

export function serializeAdminBranchAvailability(
  row: BranchProductAvailabilityRow,
): AdminBranchAvailability {
  return {
    id: row.id,
    branchId: row.branch_id,
    productId: row.product_id,
    isAvailable: row.is_available,
  };
}

export interface ApiMenuOption {
  optionId: string;
  optionType: ProductOptionType;
  name: string;
  priceDeltaCents: number;
}

export interface ApiMenuProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  options: Record<ProductOptionType, ApiMenuOption[]>;
}

export interface ApiMenuCategory {
  id: string;
  name: string;
  products: ApiMenuProduct[];
}

export interface ApiMenu {
  branchId: string;
  categories: ApiMenuCategory[];
}

export interface ApiOrderItem {
  id: string;
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  selectedOptions: SelectedOption[];
}

export interface ApiOrder {
  id: string;
  orderNumber: string;
  branchId: string;
  status: OrderRow['status'];
  subtotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  paymentMethod: OrderRow['payment_method'];
  paymentStatus: OrderRow['payment_status'];
  estimatedReadyAt: string | null;
  placedAt: string;
  dealId: string | null;
  couponId: string | null;
  items: ApiOrderItem[];
}

/**
 * Convert a Postgres `numeric` value (returned by the pg driver as a decimal
 * string, e.g. `"12.50"`) to integer cents (`1250`). Guards against float drift
 * by rounding after the ×100 scale.
 */
export function numericToCents(value: string): number {
  return Math.round(Number(value) * 100);
}

/**
 * Convert integer cents (`1250`) to the Postgres `numeric` decimal string
 * (`"12.50"`) the pg driver expects at write time. Inverse of `numericToCents`.
 * Exported so every write path (order placement, admin product/option writes)
 * shares one round-half-up conversion instead of re-declaring it per route file.
 */
export function centsToNumeric(cents: number): string {
  return (cents / 100).toFixed(2);
}

function toOptionType(value: string): ProductOptionType {
  return value as ProductOptionType;
}

export function serializeBranch(branch: BranchRow, distanceKm?: number): ApiBranch {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    latitude: Number(branch.latitude),
    longitude: Number(branch.longitude),
    phone: branch.phone,
    openingHours: branch.opening_hours,
    estimatedPrepMinutes: branch.estimated_prep_minutes,
    isAcceptingPickup: branch.is_accepting_pickup,
    priority: branch.priority,
    ...(distanceKm === undefined ? {} : { distanceKm }),
  };
}

/**
 * Serialize a `branches` row for the ADMIN surface (ADM-002). Unlike
 * `serializeBranch`, this includes `slug` and `isActive` and never carries a
 * distance (admin views are not geo-sorted).
 */
export function serializeAdminBranch(branch: BranchRow): AdminBranch {
  return {
    id: branch.id,
    name: branch.name,
    slug: branch.slug,
    address: branch.address,
    latitude: Number(branch.latitude),
    longitude: Number(branch.longitude),
    phone: branch.phone,
    openingHours: branch.opening_hours,
    estimatedPrepMinutes: branch.estimated_prep_minutes,
    isAcceptingPickup: branch.is_accepting_pickup,
    isActive: branch.is_active,
  };
}

function serializeMenuOption(option: ProductOptionRow): ApiMenuOption {
  return {
    optionId: option.id,
    optionType: toOptionType(option.option_type),
    name: option.name,
    priceDeltaCents: numericToCents(option.price_delta),
  };
}

/**
 * Group a product's active options by `option_type` into the size/flavor/add_on
 * buckets the mobile selectors expect. Every bucket is always present (possibly
 * empty) so the client never has to null-check a missing key.
 */
export function serializeMenuProduct(
  product: ProductRow,
  options: ProductOptionRow[],
): ApiMenuProduct {
  const grouped: Record<ProductOptionType, ApiMenuOption[]> = {
    size: [],
    flavor: [],
    add_on: [],
  };
  for (const option of options) {
    grouped[toOptionType(option.option_type)].push(serializeMenuOption(option));
  }

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.image_url,
    basePriceCents: numericToCents(product.base_price),
    options: grouped,
  };
}

export function serializeMenuCategory(
  category: Pick<CategoryRow, 'id' | 'name'>,
  products: ApiMenuProduct[],
): ApiMenuCategory {
  return {
    id: category.id,
    name: category.name,
    products,
  };
}

function serializeOrderItem(item: OrderItemRow): ApiOrderItem {
  return {
    id: item.id,
    productId: item.product_id,
    productNameSnapshot: item.product_name_snapshot,
    quantity: item.quantity,
    unitPriceCents: numericToCents(item.unit_price),
    totalPriceCents: numericToCents(item.total_price),
    selectedOptions: (item.selected_options as SelectedOption[]) ?? [],
  };
}

export function serializeOrder(order: OrderRow, items: OrderItemRow[]): ApiOrder {
  return {
    id: order.id,
    orderNumber: order.order_number,
    branchId: order.branch_id,
    status: order.status,
    subtotalCents: numericToCents(order.subtotal),
    discountTotalCents: numericToCents(order.discount_total),
    totalCents: numericToCents(order.total),
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    estimatedReadyAt: order.estimated_ready_at ? order.estimated_ready_at.toISOString() : null,
    placedAt: order.placed_at.toISOString(),
    dealId: order.deal_id,
    couponId: order.coupon_id,
    items: items.map(serializeOrderItem),
  };
}

/**
 * A promotional deal at the HTTP boundary.
 *
 * MUST stay structurally identical to `@jojopotato/types` `Deal` — the mobile
 * client casts `GET /deals` responses to `Deal[]` with no runtime validation, so
 * any field-name/optionality drift here silently breaks the client. Declared
 * locally (not imported from the workspace types package) to keep the established
 * no-cross-dependency boundary convention (`ApiBranch`/`ApiOrder` do the same).
 *
 * VALUE-UNIT NOTE (mirrors `packages/types/src/deals.ts`):
 *  - `minimumOrderAmount` is CENTS.
 *  - `discountValue` is polymorphic: a percentage (0–100) for
 *    `percentage_discount`, CENTS for `fixed_discount`, and 0 for the other
 *    four (complex) deal types.
 */
export interface ApiDeal {
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
  code?: string;
}

/**
 * Derive the `DealCard.discountLabel` string from the deal type + already-scaled
 * value. Mirrors the mobile `deriveDiscountLabel` (`features/deals/lib/eligibility.ts`)
 * exactly: `percentage_discount` reads a percent, `fixed_discount` reads CENTS.
 */
function dealDiscountLabel(dealType: DealType, discountValue: number): string {
  switch (dealType) {
    case 'percentage_discount':
      return `${discountValue}% OFF`;
    case 'fixed_discount':
      return `₱${(discountValue / 100).toFixed(0)} OFF`;
    case 'buy_one_take_one':
      return 'BOGO';
    case 'free_item':
      return 'FREE ITEM';
    case 'free_upgrade':
      return 'FREE UPGRADE';
    case 'bundle':
      return 'BUNDLE DEAL';
  }
}

/**
 * Serialize a `deals` row (+ its flattened branch/product eligibility id lists)
 * to the client `ApiDeal` shape. Applies the polymorphic money rule:
 *  - `minimumOrderAmount` — always cents (`numericToCents`).
 *  - `discountValue` — percent (un-scaled) for `percentage_discount`, cents
 *    (`numericToCents`) for `fixed_discount`, `0` for the four complex types.
 */
export function serializeDeal(
  deal: DealRow,
  eligibleBranchIds: string[],
  eligibleProductIds: string[],
): ApiDeal {
  let discountValue = 0;
  if (deal.discount_value !== null) {
    if (deal.deal_type === 'percentage_discount') {
      discountValue = Number(deal.discount_value); // percentage — NOT ×100
    } else if (deal.deal_type === 'fixed_discount') {
      discountValue = numericToCents(deal.discount_value); // cents
    }
    // other four deal types → discountValue stays 0
  }

  return {
    id: deal.id,
    title: deal.title,
    ...(deal.description === null ? {} : { description: deal.description }),
    discountLabel: dealDiscountLabel(deal.deal_type, discountValue),
    ...(deal.image_url === null ? {} : { imageUrl: deal.image_url }),
    validUntil: deal.end_at.toISOString(),
    dealType: deal.deal_type,
    discountValue,
    minimumOrderAmount: numericToCents(deal.minimum_order_amount),
    startAt: deal.start_at.toISOString(),
    endAt: deal.end_at.toISOString(),
    isActive: deal.is_active,
    ...(deal.usage_limit_per_user === null ? {} : { usageLimitPerUser: deal.usage_limit_per_user }),
    ...(deal.total_usage_limit === null ? {} : { totalUsageLimit: deal.total_usage_limit }),
    eligibleProductIds,
    eligibleBranchIds,
    // `code` has no column in the `deals` schema (cart apply-by-code = Phase 3).
  };
}

// ─── Admin deal-product serializer (ADM-004 deals-as-products) ───────────────
//
// A "deal" is a `products` row with `is_deal = true`, so the admin deal shape is
// the SAME as `AdminProduct` (reusing `serializeAdminProduct` verbatim — DRY)
// plus a `components` array describing "what's inside" (the `deal_components`
// junction, resolved with each component product's display name). Declared
// LOCALLY here matching the `AdminBranch`/`AdminProduct` convention.
//
// `components` is populated only on the DETAIL response (it needs a junction
// join); the list route passes `[]` to avoid N+1 joins. NB: the discount-shaped
// `AdminDeal`/`AdminDealExtras`/`serializeAdminDeal` that lived here (ADM-004
// discount model, commit d5070d8) were DISCARDED by the deals-as-products pivot —
// their only consumer was the now-rewritten `admin/deals.ts`. The PUBLIC
// `ApiDeal`/`serializeDeal` above are KEPT (dormant, still consumed by the live
// `routes/deals.ts` read routes).

export interface AdminDealComponent {
  componentProductId: string;
  componentName: string;
  quantity: number;
}

export interface AdminDealProduct extends AdminProduct {
  components: AdminDealComponent[];
}

/**
 * Serialize a deal-product (`products` row with `is_deal = true`) to the admin
 * `AdminDealProduct` shape. Reuses `serializeAdminProduct` for the base fields
 * and appends the resolved `components` list (fetched by the route handler; `[]`
 * on the list route to avoid per-row junction joins).
 */
export function serializeAdminDealProduct(
  product: ProductRow,
  components: AdminDealComponent[] = [],
): AdminDealProduct {
  return { ...serializeAdminProduct(product), components };
}

// ─── Staff order serializers (STAFF-002) ────────────────────────────────────

/**
 * Server-computed item summary for the staff list row (OC-3). Format:
 * `"2× Loaded Fries, 1× Classic Soda"` — joined by `, `, capped at 3 items,
 * then `+ N more`. Keeps the list response lean (no full item arrays).
 */
export function buildItemSummary(items: OrderItemRow[]): string {
  const parts = items.map((item) => `${item.quantity}× ${item.product_name_snapshot}`);
  if (parts.length <= 3) {
    return parts.join(', ');
  }
  const shown = parts.slice(0, 3).join(', ');
  return `${shown} + ${parts.length - 3} more`;
}

/**
 * Serialize an order + its items into the lean `StaffOrderSummary` list row
 * (STAFF-002). Full item array is intentionally NOT included — only the
 * server-computed `itemSummary` string (OC-2/OC-3).
 */
export function serializeStaffOrderSummary(
  order: OrderRow,
  items: OrderItemRow[],
): StaffOrderSummary {
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    placedAt: order.placed_at.toISOString(),
    totalCents: numericToCents(order.total),
    itemSummary: buildItemSummary(items),
  };
}

function serializeStaffOrderItem(item: OrderItemRow): StaffOrderDetail['items'][number] {
  return {
    productId: item.product_id,
    productName: item.product_name_snapshot,
    quantity: item.quantity,
    unitPriceCents: numericToCents(item.unit_price),
    totalPriceCents: numericToCents(item.total_price),
    selectedOptions: (item.selected_options as SelectedOption[]) ?? [],
  };
}

/**
 * Serialize an order + its items into the full `StaffOrderDetail` shape
 * (STAFF-002 detail screen). Uses a dedicated serializer so `productName`
 * (the staff-facing field name) maps correctly from `product_name_snapshot`.
 */
export function serializeStaffOrderDetail(
  order: OrderRow,
  items: OrderItemRow[],
): StaffOrderDetail {
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    placedAt: order.placed_at.toISOString(),
    estimatedReadyAt: order.estimated_ready_at ? order.estimated_ready_at.toISOString() : null,
    totalCents: numericToCents(order.total),
    items: items.map(serializeStaffOrderItem),
  };
}

// ─── Rewards / coupons serializers (Phase 1 — rewards backend) ───────────────

/**
 * A reward at the HTTP boundary. Mirrors `@jojopotato/types` `Reward` (declared
 * locally to keep the no-cross-dependency boundary convention). `rewardValue` is
 * cents (`reward_value` is a pg numeric decimal-peso string), or null.
 */
export interface ApiReward {
  id: string;
  name: string;
  requiredStars: number;
  rewardType: string;
  rewardValue: number | null;
  eligibleProductId: string | null;
  isActive: boolean;
}

/** Serialize a `rewards` row to `ApiReward` (money → cents at the boundary). */
export function serializeReward(reward: RewardRow): ApiReward {
  return {
    id: reward.id,
    name: reward.name,
    requiredStars: reward.required_stars,
    rewardType: reward.reward_type,
    rewardValue: reward.reward_value === null ? null : numericToCents(reward.reward_value),
    eligibleProductId: reward.eligible_product_id,
    isActive: reward.is_active,
  };
}

/**
 * An issued coupon at the HTTP boundary. Mirrors `@jojopotato/types` `Coupon`
 * (schema-based — no display `title`/`discountLabel`). Timestamps are ISO strings.
 */
export interface ApiCoupon {
  id: string;
  // ADM-008 LD2: coupons.user_id is now nullable (bulk-issued coupons are
  // claimed on redeem). No live path emits a null yet (all current coupons are
  // user-owned), but the type reflects the schema.
  userId: string | null;
  code: string;
  status: CouponRow['status'];
  dealId: string | null;
  rewardId: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
}

/** Serialize a `coupons` row to `ApiCoupon`. */
export function serializeCoupon(coupon: CouponRow): ApiCoupon {
  return {
    id: coupon.id,
    userId: coupon.user_id,
    code: coupon.code,
    status: coupon.status,
    // Wire-freeze (LD7B): the JSON field stays `dealId`; only the source column
    // renamed (coupons.deal_id → offer_id in migration 0011).
    dealId: coupon.offer_id,
    rewardId: coupon.reward_id,
    expiresAt: coupon.expires_at ? coupon.expires_at.toISOString() : null,
    usedAt: coupon.used_at ? coupon.used_at.toISOString() : null,
    createdAt: coupon.created_at.toISOString(),
  };
}

/**
 * Human-readable label for a REWARD-issued coupon, analogous to
 * `dealDiscountLabel`. `rewardType` is an unconstrained `varchar` (no DB enum),
 * so the `default` branch is mandatory: any unrecognized type falls back to the
 * reward's own name (never throws, never returns undefined).
 *  - `fixed_discount`      → `"₱X OFF"` (X = whole-peso reward_value)
 *  - `percentage_discount` → `"X% OFF"`
 *  - `free_item`           → the reward's `name` (or `"Free item"` if empty)
 *  - anything else         → the reward's `name` (or `"Reward"` if empty)
 */
export function rewardDiscountLabel(
  rewardType: string,
  rewardValue: string | null,
  rewardName: string,
): string {
  switch (rewardType) {
    case 'fixed_discount':
      return `₱${Number(rewardValue ?? '0').toFixed(0)} OFF`;
    case 'percentage_discount':
      return `${Number(rewardValue ?? '0')}% OFF`;
    case 'free_item':
      return rewardName.trim().length > 0 ? rewardName : 'Free item';
    default:
      return rewardName.trim().length > 0 ? rewardName : 'Reward';
  }
}

/**
 * An issued coupon at the HTTP boundary WITH a derived, human-readable
 * `displayLabel` (so the coupon-wallet card has renderable text). Used only by
 * `GET /coupons`, which LEFT JOINs the linked deal/reward to build the label.
 * `serializeCoupon` (no label) stays untouched for `POST /rewards/:id/redeem`.
 */
export interface ApiCouponWithLabel extends ApiCoupon {
  displayLabel: string;
}

/**
 * Serialize a `coupons` row PLUS its (optional) joined deal/reward row into an
 * `ApiCouponWithLabel`. The label source mirrors how the coupon was issued:
 * a `deal_id`-linked coupon uses `dealDiscountLabel` (reusing `serializeDeal`'s
 * polymorphic value rule); a `reward_id`-linked coupon uses `rewardDiscountLabel`.
 * Falls back to `"Coupon"` when neither link resolves a row. NEVER modifies or
 * re-implements `serializeCoupon` — it wraps its output additively.
 */
export function serializeCouponWithLabel(
  coupon: CouponRow,
  deal: DealRow | null,
  reward: RewardRow | null,
): ApiCouponWithLabel {
  let displayLabel = 'Coupon';
  if (coupon.offer_id !== null && deal !== null) {
    let discountValue = 0;
    if (deal.discount_value !== null) {
      if (deal.deal_type === 'percentage_discount') {
        discountValue = Number(deal.discount_value);
      } else if (deal.deal_type === 'fixed_discount') {
        discountValue = numericToCents(deal.discount_value);
      }
    }
    displayLabel = dealDiscountLabel(deal.deal_type, discountValue);
  } else if (coupon.reward_id !== null && reward !== null) {
    displayLabel = rewardDiscountLabel(reward.reward_type, reward.reward_value, reward.name);
  }

  return { ...serializeCoupon(coupon), displayLabel };
}
