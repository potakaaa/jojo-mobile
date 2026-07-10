import type { Cart, CartItem } from '@jojopotato/types';
import { cartReducer, initialCartState } from '@jojopotato/utils';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

export interface CartContextValue {
  cart: Cart;
  addItem: (item: CartItem) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * In-memory cart (no persistence this phase — matches SPEC Out Of Scope). Wraps
 * the pure `cartReducer` from `@jojopotato/utils`; each added item is already a
 * frozen add-time snapshot (see `buildCartItemSnapshot`).
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, dispatch] = useReducer(cartReducer, initialCartState);

  const addItem = useCallback((item: CartItem) => {
    dispatch({ type: 'ADD_ITEM', item });
  }, []);

  const value = useMemo<CartContextValue>(() => ({ cart, addItem }), [cart, addItem]);

  return createElement(CartContext.Provider, { value }, children);
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
