import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch } from '@jojopotato/types';
import { act } from '@testing-library/react-native';

import { useBranch } from '@/features/branch/hooks/use-branch';
import {
  useConfirmBranchSwitch,
  type ConfirmBranchSwitchState,
} from '@/features/branch/hooks/use-confirm-branch-switch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { renderWithProviders } from '@/test-utils/render';

/**
 * home-all-branches D4 — the shared confirm-then-switch hook.
 *
 * The highest-value assertion here is that `confirm()` writes BOTH branch stores.
 * `useCart().setBranch()` alone leaves `useMenu()`/`useProductDetails()` pointed
 * at the OLD branch, so a Home cross-branch tap would navigate to a Product
 * Details screen that cannot resolve the product — a silent failure no existing
 * regression test could catch (the pre-existing Product Details flow already has
 * the right `selectedBranch`).
 *
 * Exercised through a render probe rather than RTL's `renderHook`: in this
 * dependency graph `renderHook` leaves `result.current` null (the render is not
 * flushed the way `renderWithProviders` flushes it), so the probe is the honest
 * way to read the hook's live value after each state update.
 */
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));

const mockUseBranch = jest.mocked(useBranch);
const mockUseCart = jest.mocked(useCart);

/** Latest hook value — republished on every probe render. */
let hook: ConfirmBranchSwitchState;

/**
 * Publishes the hook's current value through a caller-supplied callback rather
 * than assigning a module-level binding directly (which `react-hooks/globals`
 * correctly rejects inside a component body).
 */
function Probe({ onState }: { onState: (state: ConfirmBranchSwitchState) => void }) {
  onState(useConfirmBranchSwitch());
  return null;
}

function branch(id: string, name: string): PickupBranch {
  return {
    id,
    name,
    address: '1 Test St',
    latitude: 0,
    longitude: 0,
    phone: '000',
    openingHours: '{}',
    estimatedPrepMinutes: 15,
    isAcceptingPickup: true,
    priority: 0,
    isOpen: true,
  } as PickupBranch;
}

const downtown = branch('b1', 'Downtown');
const north = branch('b2', 'North Branch');

let setBranch: jest.Mock;
let clearCart: jest.Mock;
let setSelectedBranch: jest.Mock;

async function setup(
  opts: {
    cartItems?: unknown[];
    cartBranchId?: string;
    selectedBranchId?: string;
    branches?: PickupBranch[];
  } = {},
): Promise<void> {
  setBranch = jest.fn();
  clearCart = jest.fn();
  setSelectedBranch = jest.fn();

  const all = opts.branches ?? [downtown, north];
  const selectedId = opts.selectedBranchId ?? 'b1';

  mockUseCart.mockReturnValue({
    cart: {
      items: opts.cartItems ?? [],
      pickupBranchId: opts.cartBranchId ?? 'b1',
    },
    setBranch,
    clearCart,
  } as unknown as ReturnType<typeof useCart>);

  mockUseBranch.mockReturnValue({
    branches: all,
    selectedBranch: all.find((b) => b.id === selectedId) ?? null,
    setSelectedBranch,
  } as unknown as ReturnType<typeof useBranch>);

  await renderWithProviders(
    <Probe
      onState={(state) => {
        hook = state;
      }}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useConfirmBranchSwitch', () => {
  test('requesting the already-current branch is a no-op (no dialog staged)', async () => {
    await setup({ selectedBranchId: 'b1', cartBranchId: 'b1' });

    await act(async () => hook.requestSwitch('b1'));

    expect(hook.pendingBranchId).toBeNull();
  });

  test('requesting a different branch stages it', async () => {
    await setup({ selectedBranchId: 'b1', cartBranchId: 'b1' });

    await act(async () => hook.requestSwitch('b2'));

    expect(hook.pendingBranchId).toBe('b2');
  });

  // The load-bearing assertion (VALIDATE P1).
  test('confirm() switches BOTH the cart branch and the selected pickup branch', async () => {
    await setup({ selectedBranchId: 'b1', cartBranchId: 'b1' });

    await act(async () => hook.requestSwitch('b2'));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.confirm();
    });

    expect(ok).toBe(true);
    expect(setBranch).toHaveBeenCalledWith('b2');
    // The FULL branch object, not just an id — `setSelectedBranch` persists the
    // whole record, and `useMenu()` keys off this store.
    expect(setSelectedBranch).toHaveBeenCalledWith(north);
    expect(hook.pendingBranchId).toBeNull();
  });

  test('confirm() clears the cart when it holds items from a DIFFERENT branch', async () => {
    await setup({ cartItems: [{ lineId: 'l1' }], cartBranchId: 'b1' });

    await act(async () => hook.requestSwitch('b2'));
    expect(hook.willClearCart).toBe(true);
    await act(async () => {
      await hook.confirm();
    });

    expect(clearCart).toHaveBeenCalledTimes(1);
  });

  test('confirm() does NOT clear an empty cart', async () => {
    await setup({ cartItems: [], cartBranchId: 'b1' });

    await act(async () => hook.requestSwitch('b2'));
    expect(hook.willClearCart).toBe(false);
    await act(async () => {
      await hook.confirm();
    });

    expect(clearCart).not.toHaveBeenCalled();
    // The switch itself still happened.
    expect(setBranch).toHaveBeenCalledWith('b2');
    expect(setSelectedBranch).toHaveBeenCalledWith(north);
  });

  test('confirm() does NOT clear a cart that already belongs to the target branch', async () => {
    // Cart already at b2, but the SELECTED branch is b1 — switching selection
    // must not wipe a cart that is already correct for the target.
    await setup({
      cartItems: [{ lineId: 'l1' }],
      cartBranchId: 'b2',
      selectedBranchId: 'b1',
    });

    await act(async () => hook.requestSwitch('b2'));
    await act(async () => {
      await hook.confirm();
    });

    expect(clearCart).not.toHaveBeenCalled();
    expect(setSelectedBranch).toHaveBeenCalledWith(north);
  });

  test('cancel() drops the staged switch without mutating anything', async () => {
    await setup({ cartItems: [{ lineId: 'l1' }], cartBranchId: 'b1' });

    await act(async () => hook.requestSwitch('b2'));
    await act(async () => hook.cancel());

    expect(hook.pendingBranchId).toBeNull();
    expect(clearCart).not.toHaveBeenCalled();
    expect(setBranch).not.toHaveBeenCalled();
    expect(setSelectedBranch).not.toHaveBeenCalled();
  });

  // Edge case: the branch dropped out of the selectable list between tap and
  // confirm. Must not half-switch and must not throw.
  test('confirm() on a branch that is no longer selectable resolves false and mutates nothing', async () => {
    await setup({
      cartItems: [{ lineId: 'l1' }],
      cartBranchId: 'b1',
      branches: [downtown],
    });

    await act(async () => hook.requestSwitch('b2'));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.confirm();
    });

    expect(ok).toBe(false);
    expect(clearCart).not.toHaveBeenCalled();
    expect(setBranch).not.toHaveBeenCalled();
    expect(setSelectedBranch).not.toHaveBeenCalled();
    expect(hook.pendingBranchId).toBeNull();
  });

  test('confirm() with nothing staged resolves false and mutates nothing', async () => {
    await setup();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await hook.confirm();
    });

    expect(ok).toBe(false);
    expect(setBranch).not.toHaveBeenCalled();
    expect(setSelectedBranch).not.toHaveBeenCalled();
  });
});
