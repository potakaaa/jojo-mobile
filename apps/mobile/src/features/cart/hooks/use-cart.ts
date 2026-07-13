import type { SelectedOption } from '@jojopotato/types';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

/**
 * A single line in the cart: one product with a fixed set of selected options
 * and a quantity. `unitPriceCents` already folds in every selected option's
 * price delta (computed at add time), so the cart never has to re-price.
 */
export interface CartLine {
  /** Stable client identity derived from productId + sorted option ids. */
  lineId: string;
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  selectedOptions: SelectedOption[];
}

interface CartState {
  /** Pickup is single-branch per order: the branch every line belongs to. */
  branchId: string | null;
  items: CartLine[];
}

type CartAction =
  | { type: 'SET_BRANCH'; branchId: string }
  | { type: 'ADD_ITEM'; item: Omit<CartLine, 'lineId'> }
  | { type: 'UPDATE_QUANTITY'; lineId: string; quantity: number }
  | { type: 'REMOVE_ITEM'; lineId: string }
  | { type: 'CLEAR' };

export interface CartContextValue {
  branchId: string | null;
  items: CartLine[];
  /** Total quantity across all lines (for a cart badge / gating). */
  itemCount: number;
  /**
   * Set the active pickup branch. Switching to a different branch clears the
   * cart, since a pickup order can only be from one branch.
   */
  setBranch: (branchId: string) => void;
  /** Add a line; merges quantity when the same product+options combo exists. */
  addItem: (item: Omit<CartLine, 'lineId'>) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const INITIAL_STATE: CartState = { branchId: null, items: [] };

/** Deterministic line identity so identical product+option combos merge. */
function buildLineId(productId: string, selectedOptions: SelectedOption[]): string {
  const ids = selectedOptions
    .map((o) => o.optionId)
    .sort()
    .join(',');
  return ids ? `${productId}#${ids}` : productId;
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'SET_BRANCH': {
      if (state.branchId === action.branchId) return state;
      // Branch changed — a pickup order is single-branch, so start fresh.
      return { branchId: action.branchId, items: [] };
    }
    case 'ADD_ITEM': {
      const lineId = buildLineId(action.item.productId, action.item.selectedOptions);
      const existing = state.items.find((l) => l.lineId === lineId);
      if (existing) {
        return {
          ...state,
          items: state.items.map((l) =>
            l.lineId === lineId ? { ...l, quantity: l.quantity + action.item.quantity } : l,
          ),
        };
      }
      return { ...state, items: [...state.items, { ...action.item, lineId }] };
    }
    case 'UPDATE_QUANTITY': {
      if (action.quantity <= 0) {
        return { ...state, items: state.items.filter((l) => l.lineId !== action.lineId) };
      }
      return {
        ...state,
        items: state.items.map((l) =>
          l.lineId === action.lineId ? { ...l, quantity: action.quantity } : l,
        ),
      };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((l) => l.lineId !== action.lineId) };
    case 'CLEAR':
      return INITIAL_STATE;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, INITIAL_STATE);

  const setBranch = useCallback((branchId: string) => dispatch({ type: 'SET_BRANCH', branchId }), []);
  const addItem = useCallback(
    (item: Omit<CartLine, 'lineId'>) => dispatch({ type: 'ADD_ITEM', item }),
    [],
  );
  const updateQuantity = useCallback(
    (lineId: string, quantity: number) => dispatch({ type: 'UPDATE_QUANTITY', lineId, quantity }),
    [],
  );
  const removeItem = useCallback((lineId: string) => dispatch({ type: 'REMOVE_ITEM', lineId }), []);
  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), []);

  const value = useMemo<CartContextValue>(
    () => ({
      branchId: state.branchId,
      items: state.items,
      itemCount: state.items.reduce((n, l) => n + l.quantity, 0),
      setBranch,
      addItem,
      updateQuantity,
      removeItem,
      clear,
    }),
    [state, setBranch, addItem, updateQuantity, removeItem, clear],
  );

  return createElement(CartContext.Provider, { value }, children);
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
