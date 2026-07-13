/**
 * PLACEHOLDER / MOCK DATA — dev seed for the Order History + Reorder screens
 * (HIST-001 / HIST-002).
 *
 * There is no order backend yet (see process/context/all-context.md Open
 * Questions). Until a real order-history API lands, the Order History screen
 * renders against this module. Every value is typed against the real
 * `@jojopotato/types` `Order`/`Cart` contracts. Replace with backend-backed
 * reads later (same "swap the seam" pattern as `use-cart.ts`).
 *
 * MOCK_CURRENT_USER_ID is the hardcoded literal 'mock-user' (matching
 * MOCK_REWARDS.userId in mock-home.ts) — it is deliberately NOT derived from the
 * live `useAuth()` session id. The real dev session mints a DB-generated id that
 * is never literally 'mock-user', so filtering by the live id would silently
 * produce zero orders (masquerading as the empty state). See the plan's D6.
 *
 * Dataset invariants (verified at authoring time — the plan's step 2 / T8):
 * (a) >=1 order for a DIFFERENT userId  -> ORDER "ord-2003" (userId 'other-user')
 * (b) >=1 cancelled order, starsEarned 0 -> ORDER "ord-1003"
 * (c) >=1 completed order, positive stars -> ORDER "ord-1001" (120), "ord-1002" (95)
 * (d) >=1 line referencing 'nuggets-classic' (isAvailable:false) -> "ord-1002"
 * (e) >=1 line whose historical unitPriceCents differs from the product's
 *     CURRENT MOCK_PRODUCTS priceCents -> "ord-1001" fries-cheddar line
 *     (historical 13900 base vs current 14900 base) proves re-pricing
 * (f) >=1 line with 2+ selectedOptions -> "ord-1001" fries-cheddar line
 * (g) varied placedAt timestamps to prove sort order -> all four differ
 */
import type { Cart, CartItem, CartItemOption, Order } from '@jojopotato/types';

import { MOCK_OTHER_BRANCH } from '@/features/cart/mock-cart';
import { MOCK_BRANCH } from '@/features/home/mock-home';

/** The signed-in user whose orders the Order History screen shows (D6/A5). */
export const MOCK_CURRENT_USER_ID = 'mock-user';

/** Sum a line's historical unit price from an explicit base + its option deltas. */
function historicalUnitPrice(baseCents: number, opts: CartItemOption[]): number {
  return opts.reduce((sum, o) => sum + o.priceDeltaCents, baseCents);
}

function line(
  menuItemId: string,
  nameSnapshot: string,
  baseCents: number,
  quantity: number,
  opts: CartItemOption[] = [],
  notes?: string,
): CartItem {
  const optionKey = opts
    .map((o) => o.id)
    .sort()
    .join('+');
  return {
    lineId: optionKey ? `${menuItemId}::${optionKey}` : menuItemId,
    menuItemId,
    quantity,
    productNameSnapshot: nameSnapshot,
    unitPriceCents: historicalUnitPrice(baseCents, opts),
    selectedOptions: opts,
    ...(notes ? { notes } : {}),
  };
}

function cart(id: string, pickupBranchId: string, items: CartItem[]): Cart {
  return { id, pickupBranchId, items };
}

function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, it) => sum + it.unitPriceCents * it.quantity, 0);
}

// --- ORDER 1001: completed, own user, multi-option + price-drift line (e/f) ---
const ORD_1001_ITEMS: CartItem[] = [
  // fries-cheddar historical base 13900; CURRENT MOCK_PRODUCTS price is 14900 ->
  // proves reorder re-prices from the current catalog, not this snapshot (AC6).
  // Two selectedOptions -> proves multi-option reconstruction (AC9).
  line('fries-cheddar', 'Cheddar Loaded Fries', 13900, 2, [
    { optionType: 'size', id: 'size-large', name: 'Large', priceDeltaCents: 2000 },
    { optionType: 'add_on', id: 'addon-bacon', name: 'Bacon Bits', priceDeltaCents: 1500 },
  ]),
  line('lemonade-yuzu', 'Yuzu Lemonade', 8900, 1, [], 'No ice'),
];

// --- ORDER 1002: completed, own user, contains unavailable nuggets-classic (d) ---
const ORD_1002_ITEMS: CartItem[] = [
  line('nuggets-classic', 'Classic Chicken Nuggets', 14900, 1, [
    { optionType: 'flavor', id: 'flavor-bbq', name: 'BBQ Dip', priceDeltaCents: 0 },
  ]),
  line('fries-classic', 'Classic Fries', 9900, 1),
];

// --- ORDER 1003: cancelled, own user, starsEarned 0 (b) ---
const ORD_1003_ITEMS: CartItem[] = [line('corndog-mozzarella', 'Mozzarella Corndog', 12900, 3)];

// --- ORDER 2003: DIFFERENT user (a) — must be excluded by the userId filter ---
const ORD_2003_ITEMS: CartItem[] = [line('fries-fire', 'Fire Spice Fries', 13900, 1)];

export const MOCK_ORDER_HISTORY: Order[] = [
  {
    id: 'ord-1002',
    userId: MOCK_CURRENT_USER_ID,
    cart: cart('cart-ord-1002', MOCK_BRANCH.id, ORD_1002_ITEMS),
    branchId: MOCK_BRANCH.id,
    status: 'completed',
    totalCents: cartTotal(ORD_1002_ITEMS),
    starsEarned: 95,
    placedAt: '2026-07-05T12:30:00.000Z',
    createdAt: '2026-07-05T12:30:00.000Z',
  },
  {
    id: 'ord-1001',
    userId: MOCK_CURRENT_USER_ID,
    cart: cart('cart-ord-1001', MOCK_BRANCH.id, ORD_1001_ITEMS),
    branchId: MOCK_BRANCH.id,
    status: 'completed',
    totalCents: cartTotal(ORD_1001_ITEMS),
    starsEarned: 120,
    placedAt: '2026-07-11T09:15:00.000Z',
    createdAt: '2026-07-11T09:15:00.000Z',
  },
  {
    id: 'ord-1003',
    userId: MOCK_CURRENT_USER_ID,
    cart: cart('cart-ord-1003', MOCK_OTHER_BRANCH.id, ORD_1003_ITEMS),
    branchId: MOCK_OTHER_BRANCH.id,
    status: 'cancelled',
    totalCents: cartTotal(ORD_1003_ITEMS),
    starsEarned: 0,
    placedAt: '2026-07-08T18:45:00.000Z',
    createdAt: '2026-07-08T18:45:00.000Z',
  },
  {
    id: 'ord-2003',
    userId: 'other-user',
    cart: cart('cart-ord-2003', MOCK_BRANCH.id, ORD_2003_ITEMS),
    branchId: MOCK_BRANCH.id,
    status: 'completed',
    totalCents: cartTotal(ORD_2003_ITEMS),
    starsEarned: 40,
    placedAt: '2026-07-12T20:00:00.000Z',
    createdAt: '2026-07-12T20:00:00.000Z',
  },
];
