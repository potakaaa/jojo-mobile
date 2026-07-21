/**
 * Menu (catalog) domain types.
 *
 * Two distinct sets live here:
 *
 * 1. The **cents-native catalog types** (`ProductOption`, `Product`, `Category`,
 *    `ProductDetail`, `MenuResponse`) — the public shape the mobile client reads
 *    from this branch's real backend (`GET /branches/:id/menu`). Field names and
 *    money units mirror `packages/api/src/routes/lib/serializers.ts`'s
 *    `ApiMenuOption`/`ApiMenuProduct`/`ApiMenuCategory`/`ApiMenu` EXACTLY: the
 *    option identity is `optionId` (not `id`), and all money is integer cents
 *    (`basePriceCents`/`priceDeltaCents`, e.g. `890` = ₱8.90) — never whole-PHP
 *    decimals. Options arrive already grouped by type (a `Record`), matching
 *    `serializeMenuProduct`'s grouped output, so no client-side grouping is needed.
 *
 * 2. The **cart-internal catalog shape** (`MenuItem`, `MenuCategory`) — the input
 *    to `useCart().addItem()`. Also cents (`priceCents`). Callers build a
 *    `MenuItem` from a `Product`/`ProductDetail` at the add-to-cart boundary.
 */

import type { ProductOptionType } from './product-option';

/**
 * One selectable product option (a size, flavor, or add-on). Mirrors the server's
 * `ApiMenuOption` — identity is `optionId`, price adjustment is `priceDeltaCents`
 * (integer cents).
 */
export interface ProductOption {
  optionId: string;
  optionType: ProductOptionType;
  name: string;
  priceDeltaCents: number;
}

/**
 * A product on a branch menu, with its options grouped by type. Mirrors the
 * server's `ApiMenuProduct` — base price is `basePriceCents` (integer cents),
 * options are grouped into `size`/`flavor`/`add_on` buckets (each always present,
 * possibly empty).
 */
export interface Product {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  basePriceCents: number;
  options: Record<ProductOptionType, ProductOption[]>;
  /**
   * ADM-004 deals-as-products: true when this product is a "deal" (priced at its
   * own base_price, its contents described by `components`). Optional/additive —
   * a regular menu product omits it (or sends false). The mobile Deals tab reads
   * `GET /branches/:id/menu?isDeal=true` to list these (4b handoff).
   */
  isDeal?: boolean;
  /** The deal's "what's inside" list — present only on deal-products (4b display). */
  components?: DealComponent[];
  /**
   * DEAL-005 Phase 3 — the deal's live `deal_schedules` windows (days/hours),
   * for the customer-facing "Available Mon–Fri, 8:00 AM – 8:25 PM" annotation.
   * Present ONLY on a currently-live scheduled deal from
   * `GET /branches/:id/menu?isDeal=true`; OMITTED entirely for a schedule-less
   * (always-live) deal and for every regular (non-deal) product — additive,
   * mirrors the `isDeal`/`components` omit-when-absent convention. Read-only
   * display data; never used for pricing or eligibility.
   */
  schedule?: DealScheduleWindow[];
}

/**
 * One live schedule window of a deal-product (DEAL-005 Phase 3), as it arrives on
 * the wire. Client mirror of the server's `ApiDealScheduleWindow` — camelCase,
 * ISO-string timestamps. `recur*` fields are Manila WALL-CLOCK values (NOT UTC —
 * do NO timezone math on them, only string formatting); only `startsAt`/`endsAt`
 * are raw UTC instants needing the fixed +08:00 Manila shift when formatting.
 */
export interface DealScheduleWindow {
  startsAt: string | null;
  endsAt: string | null;
  /** 0=Sun..6=Sat, Manila-indexed; null = a non-recurring (absolute-window) row. */
  recurDays: number[] | null;
  /** "HH:mm", Manila wall-clock, inclusive; null when the row is non-recurring. */
  recurStartTime: string | null;
  /** "HH:mm", Manila wall-clock, exclusive; null when the row is non-recurring. */
  recurEndTime: string | null;
}

/**
 * One line of a deal-product's contents (the `deal_components` junction, ADM-004).
 * Mirrors the admin `AdminDealComponent` boundary shape: which product is included
 * and how many. Metadata for the "what's inside" display only — never used for
 * pricing (a deal is priced at its own `basePriceCents`).
 */
export interface DealComponent {
  componentProductId: string;
  componentName: string;
  quantity: number;
}

/** A menu category with its branch-available, active products. Mirrors `ApiMenuCategory`. */
export interface Category {
  id: string;
  name: string;
  products: Product[];
}

/**
 * Single-product detail — derived client-side from the branch menu tree (this
 * branch's backend has no dedicated per-product endpoint). `isAvailable` reflects
 * presence in the branch's menu tree (the tree only contains available products).
 */
export type ProductDetail = Product & { isAvailable: boolean };

/** `GET /branches/:branchId/menu` response — categories → products → grouped options. */
export interface MenuResponse {
  branchId?: string;
  categories: Category[];
}

/**
 * Cart-internal catalog shape (cents convention) — used only as the input to
 * `useCart().addItem()` (see `features/cart/hooks/use-cart.ts`). Distinct from
 * `Product`/`ProductDetail` above; callers building a cart line from a `Product`
 * convert at the boundary (see `features/cart/lib/product-to-menu-item.ts`).
 */
export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  imageUrl?: string;
  categoryId: string;
  isAvailable: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}
