import type { AppliedDiscount, Cart, CartItem, CartItemOption, MenuItem } from '@jojopotato/types';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * In-memory cart state seam, mirroring the auth Context pattern in
 * `features/auth/hooks/use-auth.ts`. There is NO persistence yet: state lives in
 * React state held above the navigator, so it survives backgrounding and
 * navigation (Tier A) but is cleared on app force-quit by design (A2/D3 — no
 * AsyncStorage). This is the only cart state seam; swapping to a real cart
 * backend (CART-002) changes only this file's internals, not its consumers.
 *
 * The initial state defaults to `EMPTY_CART` (no items, no branch); callers may
 * override it via the provider's `initialCart` prop.
 */
export interface CartSessionState {
  cart: Cart;
  subtotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  itemCount: number;
  /** Adds a line for the current branch; merges into an existing matching line. */
  addItem: (menuItem: MenuItem, opts: CartItemOption[], qty?: number) => void;
  /** Sets a line's quantity; `qty <= 0` removes the line (D-note). */
  updateQuantity: (lineId: string, qty: number) => void;
  removeItem: (lineId: string) => void;
  applyDiscount: (d: AppliedDiscount) => void;
  clearDiscount: () => void;
  clearCart: () => void;
  setBranch: (branchId: string) => void;
}

const CartContext = createContext<CartSessionState | null>(null);

/** Stable line identity: same menu item + same option set == same line. */
function lineIdFor(menuItemId: string, opts: CartItemOption[]): string {
  const optionKey = opts
    .map((o) => o.id)
    .sort()
    .join('+');
  return optionKey ? `${menuItemId}::${optionKey}` : menuItemId;
}

function unitPriceFor(menuItem: MenuItem, opts: CartItemOption[]): number {
  return opts.reduce((sum, o) => sum + o.priceDeltaCents, menuItem.priceCents);
}

const EMPTY_CART: Cart = { id: 'cart-local', items: [], pickupBranchId: '' };

export function CartSessionProvider({
  children,
  initialCart = EMPTY_CART,
}: {
  children: ReactNode;
  initialCart?: Cart;
}) {
  const [cart, setCart] = useState<Cart>(initialCart);

  const addItem = useCallback((menuItem: MenuItem, opts: CartItemOption[], qty = 1) => {
    if (qty <= 0) return;
    setCart((prev) => {
      const lineId = lineIdFor(menuItem.id, opts);
      const existing = prev.items.find((it) => it.lineId === lineId);
      const items = existing
        ? prev.items.map((it) =>
            it.lineId === lineId ? { ...it, quantity: it.quantity + qty } : it,
          )
        : [
            ...prev.items,
            {
              lineId,
              menuItemId: menuItem.id,
              quantity: qty,
              productNameSnapshot: menuItem.name,
              unitPriceCents: unitPriceFor(menuItem, opts),
              selectedOptions: opts,
            } satisfies CartItem,
          ];
      return { ...prev, items };
    });
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setCart((prev) => ({ ...prev, items: prev.items.filter((it) => it.lineId !== lineId) }));
  }, []);

  const updateQuantity = useCallback(
    (lineId: string, qty: number) => {
      if (qty <= 0) {
        removeItem(lineId);
        return;
      }
      setCart((prev) => ({
        ...prev,
        items: prev.items.map((it) => (it.lineId === lineId ? { ...it, quantity: qty } : it)),
      }));
    },
    [removeItem],
  );

  const applyDiscount = useCallback((d: AppliedDiscount) => {
    setCart((prev) => ({ ...prev, appliedDiscount: d }));
  }, []);

  const clearDiscount = useCallback(() => {
    setCart((prev) => ({ ...prev, appliedDiscount: undefined }));
  }, []);

  const clearCart = useCallback(() => {
    setCart((prev) => ({ ...prev, items: [], appliedDiscount: undefined }));
  }, []);

  const setBranch = useCallback((branchId: string) => {
    setCart((prev) =>
      prev.pickupBranchId === branchId
        ? prev
        : { ...prev, pickupBranchId: branchId, items: [], appliedDiscount: undefined },
    );
  }, []);

  const value = useMemo<CartSessionState>(() => {
    const subtotalCents = cart.items.reduce((sum, it) => sum + it.unitPriceCents * it.quantity, 0);
    const discountTotalCents = cart.appliedDiscount?.amountCents ?? 0;
    const totalCents = Math.max(0, subtotalCents - discountTotalCents);
    const itemCount = cart.items.reduce((sum, it) => sum + it.quantity, 0);
    return {
      cart,
      subtotalCents,
      discountTotalCents,
      totalCents,
      itemCount,
      addItem,
      updateQuantity,
      removeItem,
      applyDiscount,
      clearDiscount,
      clearCart,
      setBranch,
    };
  }, [
    cart,
    addItem,
    updateQuantity,
    removeItem,
    applyDiscount,
    clearDiscount,
    clearCart,
    setBranch,
  ]);

  return createElement(CartContext.Provider, { value }, children);
}

export function useCart(): CartSessionState {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartSessionProvider');
  }
  return ctx;
}
