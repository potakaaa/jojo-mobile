/**
 * Menu domain types — shaped to the real DB schema (see
 * `packages/api/src/db/schema/{categories,products,product_options}.ts`).
 *
 * The API layer maps snake_case DB columns to these camelCase fields and parses
 * `numeric` money columns (`base_price`, `price_delta`) into plain `number`s
 * (whole PHP units, e.g. `89` = ₱89.00) — clients never see the raw string form.
 */

export type ProductOptionType = 'size' | 'flavor' | 'add_on';

export interface ProductOption {
  id: string;
  productId: string;
  optionType: ProductOptionType;
  name: string;
  /** Added to the base price when this option is selected (whole PHP units). */
  priceDelta: number;
  isActive: boolean;
  sortOrder: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  /** Whole PHP units (e.g. `89` = ₱89.00). */
  basePrice: number;
  isActive: boolean;
  isRewardEligible: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  /** Branch-available, active products. May be empty (client renders empty state). */
  products: Product[];
}

/** Single-product detail payload (`GET /api/menu/products/:id`). */
export interface ProductDetail extends Product {
  /** Computed: product active AND available at the requested branch. */
  isAvailable: boolean;
  /** Active options, sorted by `sortOrder`. */
  options: ProductOption[];
}

/** `GET /api/menu?branchId=` response. */
export interface MenuResponse {
  categories: Category[];
}

/**
 * Cart-internal catalog shape (cents convention) — used only as the input to
 * `useCart().addItem()` (see `features/cart/hooks/use-cart.ts`). Distinct from
 * `Product`/`ProductDetail` above (the real API catalog types, whole-PHP-unit
 * convention); callers building a cart line from a `ProductDetail` convert at
 * the boundary (see the Product Details "Add to Cart" handler).
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
