import type { AppliedDiscount, Cart } from '@jojopotato/types';

import { apiRequest } from '@/features/shared/lib/api-request';

/**
 * Typed client for the session-gated `/cart` routes (CART-003). Rides
 * `apiRequest()` (→ `authClient.$fetch`) so every call carries the persisted
 * better-auth session — NOT the unauthenticated `lib/api-client.ts` `getJson()`
 * used by public branch/menu/deals reads (those would 401 here).
 *
 * The wire shape (`ApiCart`) is declared locally, matching the app's convention for
 * server response types. Its option identity is `optionId` and its line identity is
 * `productId` — both reconciled to the client `Cart`/`CartItem` field names
 * (`id`/`menuItemId`) by `mapApiCartToClient` below, so screen consumers keep
 * reading the same fields they always have.
 */

export interface ApiCartItemOption {
  optionId: string;
  optionType: 'size' | 'flavor' | 'add_on';
  name: string;
  priceDeltaCents: number;
}

export interface ApiCartItem {
  lineId: string;
  productId: string;
  quantity: number;
  productNameSnapshot: string;
  unitPriceCents: number;
  selectedOptions: ApiCartItemOption[];
  notes?: string;
  conflict?: { reason: 'unavailable' | 'price_changed' };
}

export interface ApiCartDiscount {
  source: 'coupon' | 'deal' | 'reward';
  refId: string;
  label: string;
  amountCents: number;
}

export interface ApiCart {
  id: string;
  pickupBranchId: string | null;
  items: ApiCartItem[];
  appliedDiscount?: ApiCartDiscount;
  subtotalCents: number;
  discountTotalCents: number;
  totalCents: number;
}

interface CartEnvelope {
  cart: ApiCart;
}

export interface AddCartItemBody {
  productId: string;
  selectedOptions: { optionId: string }[];
  quantity: number;
  notes?: string;
}

const unwrap = (res: CartEnvelope): ApiCart => res.cart;

export const fetchCart = (): Promise<ApiCart> => apiRequest<CartEnvelope>('/cart').then(unwrap);

export const addCartItem = (body: AddCartItemBody): Promise<ApiCart> =>
  apiRequest<CartEnvelope>('/cart/items', { method: 'POST', body }).then(unwrap);

export const updateCartItemQuantity = (lineId: string, quantity: number): Promise<ApiCart> =>
  apiRequest<CartEnvelope>(`/cart/items/${lineId}`, {
    method: 'PATCH',
    body: { quantity },
  }).then(unwrap);

/**
 * Replace a line's selected options (B4). `updateCartItemQuantity` above only ever
 * sends `{quantity}`, so this is a separate function rather than a widened one —
 * the two hit the same route but mean different things, and keeping them apart
 * makes it impossible to accidentally blank a line's options on a quantity change.
 *
 * The body carries NO `productId`: the server re-validates and re-prices the new
 * options against the line's OWN stored product, so an edit can never swap products.
 * If the new option set collides with another line, the server merges them and the
 * returned cart has one fewer line — the caller must render whatever comes back
 * rather than assuming the edited `lineId` still exists.
 */
export const updateCartItemOptions = (
  lineId: string,
  selectedOptions: { optionId: string }[],
): Promise<ApiCart> =>
  apiRequest<CartEnvelope>(`/cart/items/${lineId}`, {
    method: 'PATCH',
    body: { selectedOptions },
  }).then(unwrap);

export const removeCartItem = (lineId: string): Promise<ApiCart> =>
  apiRequest<CartEnvelope>(`/cart/items/${lineId}`, { method: 'DELETE' }).then(unwrap);

export const clearCartItems = (): Promise<ApiCart> =>
  apiRequest<CartEnvelope>('/cart', { method: 'DELETE' }).then(unwrap);

export const setCartBranch = (branchId: string): Promise<ApiCart> =>
  apiRequest<CartEnvelope>('/cart/branch', { method: 'PUT', body: { branchId } }).then(unwrap);

export const applyCartDiscount = (discount: AppliedDiscount): Promise<ApiCart> =>
  apiRequest<CartEnvelope>('/cart/discount', {
    method: 'POST',
    body: {
      source: discount.source,
      refId: discount.refId,
      label: discount.label,
      amountCents: discount.amountCents,
    },
  }).then(unwrap);

export const clearCartDiscount = (): Promise<ApiCart> =>
  apiRequest<CartEnvelope>('/cart/discount', { method: 'DELETE' }).then(unwrap);

/**
 * Map the server `ApiCart` wire shape onto the client `Cart` type. This is the ONE
 * place `productId` → `menuItemId` and `optionId` → `id` reconciliation happens, so
 * every existing screen consumer keeps reading `menuItemId`/`id`. Totals are NOT
 * copied from the wire here — the hook recomputes `subtotalCents`/`totalCents` from
 * the mapped items exactly as it always has (byte-identical consumer behavior).
 */
export function mapApiCartToClient(api: ApiCart): Cart {
  return {
    id: api.id,
    pickupBranchId: api.pickupBranchId ?? '',
    items: api.items.map((it) => ({
      lineId: it.lineId,
      menuItemId: it.productId,
      quantity: it.quantity,
      productNameSnapshot: it.productNameSnapshot,
      unitPriceCents: it.unitPriceCents,
      selectedOptions: it.selectedOptions.map((o) => ({
        id: o.optionId,
        optionType: o.optionType,
        name: o.name,
        priceDeltaCents: o.priceDeltaCents,
      })),
      ...(it.notes === undefined ? {} : { notes: it.notes }),
      ...(it.conflict ? { conflict: it.conflict } : {}),
    })),
    ...(api.appliedDiscount
      ? {
          appliedDiscount: {
            source: api.appliedDiscount.source,
            refId: api.appliedDiscount.refId,
            label: api.appliedDiscount.label,
            amountCents: api.appliedDiscount.amountCents,
          },
        }
      : {}),
  };
}
