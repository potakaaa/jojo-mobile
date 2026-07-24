import { useCallback, useState } from 'react';

import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';

export interface ConfirmBranchSwitchState {
  /** The branch id awaiting confirmation, or `null` when no dialog is pending. */
  pendingBranchId: string | null;
  /**
   * Stage a switch to `targetBranchId`. A no-op when that branch is ALREADY both
   * the selected pickup branch and the cart's branch (nothing would change).
   * Deciding *whether* a given user action needs confirming at all stays with the
   * caller — Product Details asks only when the cart holds other-branch items,
   * while a Home/Deals cross-branch tap always asks.
   */
  requestSwitch: (targetBranchId: string) => void;
  /**
   * Resolve the staged switch. Clears the cart first (only when it holds items
   * from a different branch), then points BOTH branch stores at the target.
   * Resolves `true` once that has happened, or `false` when there was nothing
   * staged / the target is no longer selectable — never throws.
   *
   * Callers must `await` this and only then navigate or add to cart: the whole
   * point of the ordering is that the branch is already switched before the next
   * screen reads it.
   */
  confirm: () => Promise<boolean>;
  /** Drop the staged switch. Mutates nothing. */
  cancel: () => void;
  /** True when confirming would clear the cart — for honest dialog copy. */
  willClearCart: boolean;
}

/**
 * The single confirm-then-switch pickup-branch flow, shared by every screen that
 * needs it (home-all-branches D4). Extracted from `(tabs)/product/index.tsx`,
 * which had owned it inline since the add-to-cart branch-switch shipped, and now
 * reused by the new Home / Deals cross-branch tap.
 *
 * ── Why BOTH branch stores are written ────────────────────────────────────────
 * `useCart().setBranch()` only moves the CART's `pickupBranchId`. It has zero
 * effect on `useBranch().selectedBranch` — the two contexts are fully independent
 * — and `useMenu()` (and therefore `useProductDetails()`, which powers Product
 * Details) is keyed EXCLUSIVELY on `useBranch().selectedBranch.id`.
 *
 * So a switch that wrote only the cart would keep working for the original
 * Product Details flow (there `selectedBranch` is already the target; only the
 * cart is stale) while silently failing the new Home/Deals flow: the menu query
 * would still be pointed at the OLD branch, and navigating to the tapped product
 * would land on "This product isn't available". Writing `setSelectedBranch` too
 * is therefore load-bearing, not tidiness. It is idempotent for the Product
 * Details flow (same id in, same id out — the query key does not change, so no
 * extra refetch).
 *
 * The hook deliberately does NOT navigate and does NOT add to cart. Those stay
 * caller-specific, and keeping them out is what guarantees the switch has fully
 * resolved before the caller's next action runs.
 */
export function useConfirmBranchSwitch(): ConfirmBranchSwitchState {
  const { cart, setBranch, clearCart } = useCart();
  const { branches, selectedBranch, setSelectedBranch } = useBranch();
  const [pendingBranchId, setPendingBranchId] = useState<string | null>(null);

  const requestSwitch = useCallback(
    (targetBranchId: string) => {
      // Nothing to switch: the target is already both stores' branch.
      if (targetBranchId === selectedBranch?.id && targetBranchId === cart.pickupBranchId) return;
      setPendingBranchId(targetBranchId);
    },
    [selectedBranch, cart],
  );

  const cancel = useCallback(() => setPendingBranchId(null), []);

  const confirm = useCallback(async (): Promise<boolean> => {
    const targetId = pendingBranchId;
    setPendingBranchId(null);
    if (targetId === null) return false;

    // Resolve the FULL branch object — `setSelectedBranch` persists the whole
    // record, not just an id.
    const target = branches.find((branch) => branch.id === targetId);
    if (!target) {
      // The branch stopped accepting pickup between tap and confirm (rare, but
      // real). Do NOT half-switch: bail out and let the caller say so.
      return false;
    }

    if (cart.items.length > 0 && cart.pickupBranchId !== targetId) {
      clearCart();
    }
    setBranch(targetId);
    setSelectedBranch(target);
    return true;
  }, [pendingBranchId, branches, cart, clearCart, setBranch, setSelectedBranch]);

  const willClearCart =
    pendingBranchId !== null && cart.items.length > 0 && cart.pickupBranchId !== pendingBranchId;

  return { pendingBranchId, requestSwitch, confirm, cancel, willClearCart };
}
