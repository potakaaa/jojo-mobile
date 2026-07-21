import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch, ProductDetail } from '@jojopotato/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import ProductDetailsScreen from '@/app/(tabs)/product';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useProductDetails } from '@/features/menu/hooks/use-product-details';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('@/features/menu/hooks/use-product-details', () => ({
  useProductDetails: jest.fn(),
}));
jest.mock('@/features/branch/hooks/use-branch', () => ({
  useBranch: jest.fn(),
}));
jest.mock('@/features/cart/hooks/use-cart', () => ({
  useCart: jest.fn(),
}));

const mockUseProductDetails = jest.mocked(useProductDetails);
const mockUseBranch = jest.mocked(useBranch);
const mockUseCart = jest.mocked(useCart);

const product: ProductDetail = {
  id: 'p1',
  name: 'Loaded Fries',
  basePriceCents: 12000,
  options: { size: [], flavor: [], add_on: [] },
  isAvailable: true,
};

const selectedBranch = { id: 'b2', name: 'North Branch' } as PickupBranch;

function setupCart(over: Record<string, unknown> = {}) {
  const addItem = jest.fn();
  const setBranch = jest.fn();
  const clearCart = jest.fn();
  mockUseCart.mockReturnValue({
    cart: { items: [{ lineId: 'l1' }], pickupBranchId: 'b1' },
    addItem,
    setBranch,
    clearCart,
    ...over,
  } as unknown as ReturnType<typeof useCart>);
  return { addItem, setBranch, clearCart };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseProductDetails.mockReturnValue({ data: product, isLoading: false, isError: false });
  mockUseBranch.mockReturnValue({ selectedBranch } as unknown as ReturnType<typeof useBranch>);
});

describe('ProductDetailsScreen — switch-branch confirmation', () => {
  test('adding from a different branch opens the ConfirmDialog instead of adding immediately', async () => {
    const { addItem } = setupCart();

    const { getByRole, findByText } = await renderWithProviders(<ProductDetailsScreen />);

    fireEvent.press(getByRole('button', { name: 'Add to Cart' }));

    expect(await findByText('Switch branch?')).toBeTruthy();
    expect(addItem).not.toHaveBeenCalled();
  });

  test('confirming runs the unchanged clear-and-switch handler (clearCart + setBranch + addItem)', async () => {
    const { addItem, setBranch, clearCart } = setupCart();

    const { getByRole, findByText, queryByText } = await renderWithProviders(
      <ProductDetailsScreen />,
    );

    fireEvent.press(getByRole('button', { name: 'Add to Cart' }));
    await findByText('Switch branch?');
    fireEvent.press(getByRole('button', { name: 'Clear and switch' }));

    expect(clearCart).toHaveBeenCalledTimes(1);
    expect(setBranch).toHaveBeenCalledWith('b2');
    expect(addItem).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(queryByText('Switch branch?')).toBeNull());
  });

  test('cancelling performs no cart mutation and closes the dialog', async () => {
    const { addItem, setBranch, clearCart } = setupCart();

    const { getByRole, findByText, queryByText } = await renderWithProviders(
      <ProductDetailsScreen />,
    );

    fireEvent.press(getByRole('button', { name: 'Add to Cart' }));
    await findByText('Switch branch?');
    fireEvent.press(getByRole('button', { name: 'Cancel' }));

    expect(clearCart).not.toHaveBeenCalled();
    expect(setBranch).not.toHaveBeenCalled();
    expect(addItem).not.toHaveBeenCalled();
    await waitFor(() => expect(queryByText('Switch branch?')).toBeNull());
  });
});
