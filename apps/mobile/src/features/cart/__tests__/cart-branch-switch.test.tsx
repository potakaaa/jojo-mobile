import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch } from '@jojopotato/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import CartScreen from '@/app/(tabs)/order/cart';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useReorderConflicts } from '@/features/cart/hooks/use-reorder-conflicts';
import { useDeal } from '@/features/deals/hooks/use-deal';
import { useDealUsage } from '@/features/deals/hooks/use-deal-usage';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/deals/hooks/use-deal', () => ({ useDeal: jest.fn() }));
jest.mock('@/features/deals/hooks/use-deal-usage', () => ({ useDealUsage: jest.fn() }));
jest.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/features/cart/hooks/use-reorder-conflicts', () => ({
  useReorderConflicts: jest.fn(),
}));
jest.mock('@/features/deals/lib/apply-deal', () => ({ resolveAndApplyDeal: jest.fn() }));

const mockUseCart = jest.mocked(useCart);
const mockUseBranch = jest.mocked(useBranch);
const mockUseDeal = jest.mocked(useDeal);
const mockUseDealUsage = jest.mocked(useDealUsage);
const mockUseAuth = jest.mocked(useAuth);
const mockUseReorderConflicts = jest.mocked(useReorderConflicts);

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
  };
}

function setupCart() {
  const clearCart = jest.fn();
  const setBranch = jest.fn();
  const clearConflicts = jest.fn();
  mockUseCart.mockReturnValue({
    cart: {
      items: [
        {
          lineId: 'l1',
          menuItemId: 'p1',
          quantity: 1,
          productNameSnapshot: 'Loaded Fries',
          unitPriceCents: 12000,
          selectedOptions: [],
        },
      ],
      pickupBranchId: 'b1',
      appliedDiscount: null,
    },
    subtotalCents: 12000,
    discountTotalCents: 0,
    totalCents: 12000,
    itemCount: 1,
    updateQuantity: jest.fn(),
    removeItem: jest.fn(),
    clearCart,
    setBranch,
    clearDiscount: jest.fn(),
    applyDiscount: jest.fn(),
  } as unknown as ReturnType<typeof useCart>);

  mockUseReorderConflicts.mockReturnValue({
    conflicts: [],
    clearConflicts,
  } as unknown as ReturnType<typeof useReorderConflicts>);

  return { clearCart, setBranch, clearConflicts };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseBranch.mockReturnValue({
    branches: [branch('b1', 'Downtown'), branch('b2', 'North Branch')],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useBranch>);
  mockUseDeal.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useDeal>);
  mockUseDealUsage.mockReturnValue({} as unknown as ReturnType<typeof useDealUsage>);
  mockUseAuth.mockReturnValue({ user: { id: 'u1' } } as unknown as ReturnType<typeof useAuth>);
});

describe('CartScreen — change-branch confirmation', () => {
  test('pressing Change opens the ConfirmDialog instead of clearing the cart', async () => {
    const { clearCart } = setupCart();

    const { getByRole, findByText } = await renderWithProviders(<CartScreen />);

    fireEvent.press(getByRole('button', { name: 'Change' }));

    expect(await findByText('Change branch?')).toBeTruthy();
    expect(clearCart).not.toHaveBeenCalled();
  });

  test('confirming runs the unchanged clear-and-switch handler', async () => {
    const { clearCart, setBranch, clearConflicts } = setupCart();

    const { getByRole, findByText, queryByText } = await renderWithProviders(<CartScreen />);

    fireEvent.press(getByRole('button', { name: 'Change' }));
    await findByText('Change branch?');
    fireEvent.press(getByRole('button', { name: 'Change & clear' }));

    expect(clearConflicts).toHaveBeenCalledTimes(1);
    expect(clearCart).toHaveBeenCalledTimes(1);
    expect(setBranch).toHaveBeenCalledWith('b2');
    await waitFor(() => expect(queryByText('Change branch?')).toBeNull());
  });

  test('cancelling performs no cart mutation and closes the dialog', async () => {
    const { clearCart, setBranch } = setupCart();

    const { getByRole, findByText, queryByText } = await renderWithProviders(<CartScreen />);

    fireEvent.press(getByRole('button', { name: 'Change' }));
    await findByText('Change branch?');
    fireEvent.press(getByRole('button', { name: 'Cancel' }));

    expect(clearCart).not.toHaveBeenCalled();
    expect(setBranch).not.toHaveBeenCalled();
    await waitFor(() => expect(queryByText('Change branch?')).toBeNull());
  });
});
