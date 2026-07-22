import type { AppliedDiscount, Cart, CartItemOption, MenuItem } from '@jojopotato/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth/hooks/use-auth';
import {
  addCartItem,
  applyCartDiscount,
  clearCartDiscount,
  clearCartItems,
  fetchCart,
  mapApiCartToClient,
  removeCartItem,
  setCartBranch,
  updateCartItemOptions,
  updateCartItemQuantity,
  type ApiCart,
  type ApiCartItemOption,
} from '@/features/cart/lib/cart-api';

/**
 * Server-persisted cart seam (CART-003). The cart now lives in Postgres behind the
 * session-gated `/cart` routes; this provider swaps the old in-memory `useState<Cart>`
 * internals for a `useQuery(['cart', userId])` read + one `useMutation` per action,
 * each following the optimistic-update recipe (onMutate snapshot+apply, onError
 * restore, onSettled invalidate). The exported `CartSessionState` / `useCart()`
 * surface is UNCHANGED — every existing screen consumer keeps working with zero edits.
 *
 * All cart mutations share `scope: { id: 'cart-mutations' }`, so react-query runs them
 * strictly serially in call order. This preserves the ordering the old synchronous
 * in-memory cart gave for free (e.g. reorder's setBranch → clearCart → addItem×N),
 * which un-serialized network writes could otherwise reorder.
 */
export interface CartSessionState {
  cart: Cart;
  subtotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  itemCount: number;
  /**
   * Adds a line for the current branch; merges into an existing matching line.
   * Resolves `true` once the server has confirmed the write, `false` if it
   * failed (network error, session expired, etc.) — a caller that shows a
   * success toast MUST await this and only show it on `true`, or the toast
   * lies about what actually happened (the failure mode this return value
   * exists to close).
   */
  addItem: (
    menuItem: MenuItem,
    opts: CartItemOption[],
    qty?: number,
    notes?: string,
  ) => Promise<boolean>;
  /** Sets a line's quantity; `qty <= 0` removes the line (D-note). */
  updateQuantity: (lineId: string, qty: number) => void;
  /**
   * Replaces a line's selected options (B4). Resolves `true` once the server has
   * confirmed the write, `false` on failure — same contract as `addItem`, so a
   * caller that navigates away or shows a success message on save MUST await it.
   *
   * If the new option set matches another line, the SERVER merges them, so the
   * edited `lineId` may no longer exist in the cart afterwards. Callers must not
   * assume it survives.
   */
  editCartLine: (lineId: string, opts: CartItemOption[]) => Promise<boolean>;
  removeItem: (lineId: string) => void;
  applyDiscount: (d: AppliedDiscount) => void;
  clearDiscount: () => void;
  clearCart: () => void;
  setBranch: (branchId: string) => void;
}

const CartContext = createContext<CartSessionState | null>(null);

const EMPTY_CART: Cart = { id: 'cart-local', items: [], pickupBranchId: '' };

/** Sorted option-id key — the stable line identity (same product + same options). */
function optionKey(ids: string[]): string {
  return [...ids].sort().join('+');
}

/** Recompute the wire totals after an optimistic edit (kept consistent for the cache). */
function recomputeTotals(cart: ApiCart): ApiCart {
  const subtotalCents = cart.items.reduce((s, it) => s + it.unitPriceCents * it.quantity, 0);
  const rawDiscount = cart.appliedDiscount?.amountCents ?? 0;
  const discountTotalCents = Math.max(0, Math.min(rawDiscount, subtotalCents));
  return {
    ...cart,
    subtotalCents,
    discountTotalCents,
    totalCents: subtotalCents - discountTotalCents,
  };
}

// ─── Optimistic updaters (operate on the cached ApiCart) ─────────────────────

function optimisticAdd(
  cart: ApiCart,
  menuItem: MenuItem,
  opts: CartItemOption[],
  qty: number,
  notes?: string,
): ApiCart {
  const newKey = optionKey(opts.map((o) => o.id));
  const apiOpts: ApiCartItemOption[] = opts.map((o) => ({
    optionId: o.id,
    optionType: o.optionType,
    name: o.name,
    priceDeltaCents: o.priceDeltaCents,
  }));
  const unitPriceCents = opts.reduce((sum, o) => sum + o.priceDeltaCents, menuItem.priceCents);
  const existing = cart.items.find(
    (it) =>
      it.productId === menuItem.id &&
      optionKey(it.selectedOptions.map((o) => o.optionId)) === newKey,
  );
  const items = existing
    ? cart.items.map((it) => (it === existing ? { ...it, quantity: it.quantity + qty } : it))
    : [
        ...cart.items,
        {
          lineId: `optimistic-${menuItem.id}-${newKey}`,
          productId: menuItem.id,
          quantity: qty,
          productNameSnapshot: menuItem.name,
          unitPriceCents,
          selectedOptions: apiOpts,
          ...(notes === undefined ? {} : { notes }),
        },
      ];
  return recomputeTotals({ ...cart, items });
}

/**
 * Best-effort client guess at a line's state after an options edit (B4).
 *
 * Deliberately does NOT try to predict the server's collision-merge: it only swaps
 * the option snapshot and re-prices from the option deltas it was handed. That is
 * safe because `useCartMutation`'s shared `onSettled` invalidates the cart key
 * unconditionally, so the authoritative post-merge cart replaces this guess within
 * one round trip. This is UX smoothing, not a correctness dependency — do not add
 * merge simulation here and start depending on it.
 */
function optimisticEditLine(cart: ApiCart, lineId: string, opts: CartItemOption[]): ApiCart {
  const apiOpts: ApiCartItemOption[] = opts.map((o) => ({
    optionId: o.id,
    optionType: o.optionType,
    name: o.name,
    priceDeltaCents: o.priceDeltaCents,
  }));
  const deltaSum = opts.reduce((sum, o) => sum + o.priceDeltaCents, 0);
  return recomputeTotals({
    ...cart,
    items: cart.items.map((it) => {
      if (it.lineId !== lineId) return it;
      // Recover the base price by removing the CURRENT options' deltas, then add
      // the new ones — the line row carries no separate base-price field.
      const currentDeltaSum = it.selectedOptions.reduce((s, o) => s + o.priceDeltaCents, 0);
      const baseCents = it.unitPriceCents - currentDeltaSum;
      return { ...it, selectedOptions: apiOpts, unitPriceCents: baseCents + deltaSum };
    }),
  });
}

function optimisticSetQuantity(cart: ApiCart, lineId: string, quantity: number): ApiCart {
  return recomputeTotals({
    ...cart,
    items: cart.items.map((it) => (it.lineId === lineId ? { ...it, quantity } : it)),
  });
}

function optimisticRemove(cart: ApiCart, lineId: string): ApiCart {
  return recomputeTotals({ ...cart, items: cart.items.filter((it) => it.lineId !== lineId) });
}

function optimisticClearCart(cart: ApiCart): ApiCart {
  const { appliedDiscount: _drop, ...rest } = cart;
  return recomputeTotals({ ...rest, items: [] });
}

function optimisticApplyDiscount(cart: ApiCart, d: AppliedDiscount): ApiCart {
  return recomputeTotals({
    ...cart,
    appliedDiscount: {
      source: d.source,
      refId: d.refId,
      label: d.label,
      amountCents: d.amountCents,
    },
  });
}

function optimisticClearDiscount(cart: ApiCart): ApiCart {
  const { appliedDiscount: _drop, ...rest } = cart;
  return recomputeTotals({ ...rest });
}

function optimisticSetBranch(cart: ApiCart, branchId: string): ApiCart {
  if (cart.pickupBranchId === branchId) return cart;
  const { appliedDiscount: _drop, ...rest } = cart;
  return recomputeTotals({ ...rest, pickupBranchId: branchId, items: [] });
}

/**
 * One cart mutation with the standard optimistic recipe + serial scope. Snapshots the
 * cached cart, applies an optimistic edit, rolls back on error, and invalidates on
 * settle so the authoritative (re-validated, real-lineId) server cart replaces the
 * optimistic one.
 */
function useCartMutation<V>(
  cartKey: readonly unknown[],
  mutationFn: (vars: V) => Promise<ApiCart>,
  optimistic: (cart: ApiCart, vars: V) => ApiCart,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    scope: { id: 'cart-mutations' },
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: cartKey });
      const previous = qc.getQueryData<ApiCart>(cartKey);
      if (previous) qc.setQueryData<ApiCart>(cartKey, optimistic(previous, vars));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(cartKey, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: cartKey });
    },
  });
}

export function CartSessionProvider({
  children,
  initialCart = EMPTY_CART,
}: {
  children: ReactNode;
  initialCart?: Cart;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const cartKey = useMemo(() => ['cart', userId] as const, [userId]);

  const { data: apiCart } = useQuery({
    queryKey: cartKey,
    queryFn: fetchCart,
    enabled: userId !== null,
  });

  const cart = useMemo<Cart>(
    () => (apiCart ? mapApiCartToClient(apiCart) : initialCart),
    [apiCart, initialCart],
  );

  const { mutateAsync: addMutateAsync } = useCartMutation(
    cartKey,
    (v: { menuItem: MenuItem; opts: CartItemOption[]; quantity: number; notes?: string }) =>
      addCartItem({
        productId: v.menuItem.id,
        selectedOptions: v.opts.map((o) => ({ optionId: o.id })),
        quantity: v.quantity,
        ...(v.notes === undefined ? {} : { notes: v.notes }),
      }),
    (c, v) => optimisticAdd(c, v.menuItem, v.opts, v.quantity, v.notes),
  );

  const { mutate: updateMutate } = useCartMutation(
    cartKey,
    (v: { lineId: string; quantity: number }) => updateCartItemQuantity(v.lineId, v.quantity),
    (c, v) => optimisticSetQuantity(c, v.lineId, v.quantity),
  );

  const { mutateAsync: editLineMutateAsync } = useCartMutation(
    cartKey,
    (v: { lineId: string; opts: CartItemOption[] }) =>
      updateCartItemOptions(
        v.lineId,
        v.opts.map((o) => ({ optionId: o.id })),
      ),
    (c, v) => optimisticEditLine(c, v.lineId, v.opts),
  );

  const { mutate: removeMutate } = useCartMutation(
    cartKey,
    (lineId: string) => removeCartItem(lineId),
    (c, lineId) => optimisticRemove(c, lineId),
  );

  const { mutate: clearMutate } = useCartMutation<void>(
    cartKey,
    () => clearCartItems(),
    (c) => optimisticClearCart(c),
  );

  const { mutate: setBranchMutate } = useCartMutation(
    cartKey,
    (branchId: string) => setCartBranch(branchId),
    (c, branchId) => optimisticSetBranch(c, branchId),
  );

  const { mutate: applyDiscountMutate } = useCartMutation(
    cartKey,
    (d: AppliedDiscount) => applyCartDiscount(d),
    (c, d) => optimisticApplyDiscount(c, d),
  );

  const { mutate: clearDiscountMutate } = useCartMutation<void>(
    cartKey,
    () => clearCartDiscount(),
    (c) => optimisticClearDiscount(c),
  );

  const addItem = useCallback(
    async (menuItem: MenuItem, opts: CartItemOption[], qty = 1, notes?: string) => {
      if (qty <= 0) return false;
      try {
        await addMutateAsync({
          menuItem,
          opts,
          quantity: qty,
          ...(notes === undefined ? {} : { notes }),
        });
        return true;
      } catch {
        // Rollback + refetch already happened inside useCartMutation's onError/
        // onSettled — the caller just needs to know NOT to claim success.
        return false;
      }
    },
    [addMutateAsync],
  );

  const removeItem = useCallback(
    (lineId: string) => {
      removeMutate(lineId);
    },
    [removeMutate],
  );

  const updateQuantity = useCallback(
    (lineId: string, qty: number) => {
      // qty <= 0 removes the line — preserves the old hook's updateQuantity semantics.
      if (qty <= 0) {
        removeMutate(lineId);
        return;
      }
      updateMutate({ lineId, quantity: qty });
    },
    [removeMutate, updateMutate],
  );

  const editCartLine = useCallback(
    async (lineId: string, opts: CartItemOption[]) => {
      try {
        await editLineMutateAsync({ lineId, opts });
        return true;
      } catch {
        // Rollback + refetch already happened inside useCartMutation's onError/
        // onSettled — the caller just needs to know NOT to claim success.
        return false;
      }
    },
    [editLineMutateAsync],
  );

  const applyDiscount = useCallback(
    (d: AppliedDiscount) => {
      applyDiscountMutate(d);
    },
    [applyDiscountMutate],
  );

  const clearDiscount = useCallback(() => {
    clearDiscountMutate();
  }, [clearDiscountMutate]);

  const clearCart = useCallback(() => {
    clearMutate();
  }, [clearMutate]);

  const setBranch = useCallback(
    (branchId: string) => {
      // Same-branch early-return (matches the old setBranch): no server call, no clear.
      const current = queryClient.getQueryData<ApiCart>(cartKey);
      if (current && current.pickupBranchId === branchId) return;
      setBranchMutate(branchId);
    },
    [setBranchMutate, queryClient, cartKey],
  );

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
      editCartLine,
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
    editCartLine,
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
