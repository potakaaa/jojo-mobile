import type { StaffOrderDetail, StaffOrderSummary } from '@jojopotato/types';
import type { InferSelectModel } from 'drizzle-orm';

import type {
  branches,
  categories,
  orderItems,
  orders,
  productOptions,
  products,
} from '../../db/schema/index';

type BranchRow = InferSelectModel<typeof branches>;
type CategoryRow = InferSelectModel<typeof categories>;
type ProductRow = InferSelectModel<typeof products>;
type ProductOptionRow = InferSelectModel<typeof productOptions>;
type OrderRow = InferSelectModel<typeof orders>;
type OrderItemRow = InferSelectModel<typeof orderItems>;

type ProductOptionType = 'size' | 'flavor' | 'add_on';

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
  /** Great-circle distance in km from a query point, when lat/lng were supplied. */
  distanceKm?: number;
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
  productId: string;
  productName: string;
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
    ...(distanceKm === undefined ? {} : { distanceKm }),
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
    productId: item.product_id,
    productName: item.product_name_snapshot,
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
    items: items.map(serializeOrderItem),
  };
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

/**
 * Serialize an order + its items into the full `StaffOrderDetail` shape
 * (STAFF-002 detail screen). Reuses `serializeOrderItem` for the item array so
 * the `selectedOptions` shape matches the customer order serializer exactly.
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
    items: items.map(serializeOrderItem),
  };
}
