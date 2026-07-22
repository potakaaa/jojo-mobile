import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { ProductDetail } from '@jojopotato/types';
import { fireEvent } from '@testing-library/react-native';

import ProductDetailsScreen from '@/app/(tabs)/product';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useProductDetails } from '@/features/menu/hooks/use-product-details';
import { renderWithProviders } from '@/test-utils/render';

/**
 * B4.5 — the cart-line EDIT path on Product Details.
 *
 * The headline assertion is a REGRESSION LOCK, not a feature check: saving an edit
 * must never call `clearCart()` and must never open the branch-switch confirm.
 * `handleAdd` (the add path) legitimately does both — it opens a `pendingSwitch`
 * dialog when the cart holds items for a different branch and calls `clearCart()`
 * on confirm. Reusing it for the edit path would mean a user who believed they were
 * editing ONE line silently loses their WHOLE cart. Hence the deliberately separate
 * `handleSaveEdit`.
 *
 * The cart is seeded for a DIFFERENT branch than `selectedBranch` on purpose: that
 * is exactly the condition that trips `isSwitchingBranch` in the add path, so if the
 * edit path ever fell through to `handleAdd`, these tests go red.
 *
 * Non-vacuity: pointing the sticky bar's `onAdd` at `handleAdd` when `lineId` is
 * present turns the clearCart/branch-dialog cases red (verified during EXECUTE).
 */

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { back: jest.fn(), push: jest.fn() },
  useIsFocused: () => true,
}));
jest.mock('@/features/menu/hooks/use-product-details', () => ({
  useProductDetails: jest.fn(),
}));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));

const mockUseProductDetails = jest.mocked(useProductDetails);
const mockUseCart = jest.mocked(useCart);
const mockUseBranch = jest.mocked(useBranch);

const mockAddItem = jest.fn<() => Promise<boolean>>();
const mockEditCartLine = jest.fn<() => Promise<boolean>>();
const mockClearCart = jest.fn();
const mockSetBranch = jest.fn();

const emptyOptions = { size: [], flavor: [], add_on: [] };

/** One required size group so the sticky bar's `canAdd` gate can be satisfied. */
const PRODUCT: ProductDetail = {
  id: 'p-1',
  name: 'Loaded Fries',
  basePriceCents: 10000,
  isAvailable: true,
  options: {
    ...emptyOptions,
    size: [
      { optionId: 'regular', optionType: 'size', name: 'Regular', priceDeltaCents: 0 },
      { optionId: 'large', optionType: 'size', name: 'Large', priceDeltaCents: 2000 },
    ],
  },
} as unknown as ProductDetail;

function renderScreen(params: Record<string, string>) {
  mockParams = params;
  mockUseProductDetails.mockReturnValue({
    data: PRODUCT,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useProductDetails>);

  // Cart holds a line for branch-OTHER while the selected branch is branch-1 —
  // the exact state that trips the add path's branch-switch confirm.
  mockUseCart.mockReturnValue({
    cart: {
      items: [{ lineId: 'line-1', menuItemId: 'p-1', quantity: 2, selectedOptions: [] }],
      pickupBranchId: 'branch-OTHER',
    },
    addItem: mockAddItem,
    editCartLine: mockEditCartLine,
    clearCart: mockClearCart,
    setBranch: mockSetBranch,
  } as unknown as ReturnType<typeof useCart>);

  mockUseBranch.mockReturnValue({
    selectedBranch: { id: 'branch-1', name: 'Branch One' },
  } as unknown as ReturnType<typeof useBranch>);

  return renderWithProviders(<ProductDetailsScreen />);
}

const EDIT_PARAMS = {
  productId: 'p-1',
  lineId: 'line-1',
  optionIds: 'large',
  quantity: '2',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEditCartLine.mockResolvedValue(true);
  mockAddItem.mockResolvedValue(true);
});

describe('B4.5 — saving an edit never clears the cart or switches branch', () => {
  test('saving calls editCartLine, and calls neither clearCart nor addItem nor setBranch', async () => {
    const { getByText } = await renderScreen(EDIT_PARAMS);

    await fireEvent.press(getByText('Add to Cart'));

    expect(mockEditCartLine).toHaveBeenCalledTimes(1);
    expect(mockEditCartLine).toHaveBeenCalledWith(
      'line-1',
      expect.arrayContaining([expect.objectContaining({ id: 'large' })]),
    );
    // The three add-path side effects that would wipe or repoint the cart.
    expect(mockClearCart).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(mockSetBranch).not.toHaveBeenCalled();
  });

  test('saving never opens the branch-switch confirm, even with a cart on another branch', async () => {
    const { getByText, queryByTestId } = await renderScreen(EDIT_PARAMS);

    await fireEvent.press(getByText('Add to Cart'));

    // `ConfirmDialog`'s stable testIDs — present only if the switch dialog opened.
    expect(queryByTestId('confirm-dialog-confirm')).toBeNull();
    expect(mockClearCart).not.toHaveBeenCalled();
  });

  test('rendering the edit screen without saving mutates nothing', async () => {
    await renderScreen(EDIT_PARAMS);

    expect(mockEditCartLine).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(mockClearCart).not.toHaveBeenCalled();
  });
});

describe('B4.1 — the edited line prefills the selectors', () => {
  test('the prefilled option is preselected, so the unit price already includes its delta', async () => {
    const { getByText } = await renderScreen(EDIT_PARAMS);

    // base 100.00 + Large 20.00 = 120.00, × quantity 2 = 240.00 on the sticky bar.
    expect(getByText('₱240.00')).toBeTruthy();
  });

  test('with no prefill params the screen is the plain ADD flow (quantity 1, no selection)', async () => {
    const { getAllByText, queryByText } = await renderScreen({ productId: 'p-1' });

    // The ₱240.00 total is only reachable via the prefill (Large + quantity 2), so
    // its ABSENCE is what proves no prefill leaked into the plain add flow.
    expect(queryByText('₱240.00')).toBeNull();
    // Base price only, quantity 1 — rendered by both the price tag and the sticky
    // bar, hence getAllByText rather than an ambiguous single-element query.
    expect(getAllByText('₱100.00').length).toBeGreaterThan(0);
  });
});

describe('B4 — the add path is completely unchanged when no lineId is present', () => {
  test('adding with a cart on another branch still opens the branch-switch confirm', async () => {
    const { getByText, getByTestId } = await renderScreen({ productId: 'p-1' });

    await fireEvent.press(getByText('Regular'));
    await fireEvent.press(getByText('Add to Cart'));

    // The add path's pre-existing behaviour is intact — proving the edit path's
    // absence of this dialog is a real difference, not a globally broken dialog.
    expect(getByTestId('confirm-dialog-confirm')).toBeTruthy();
    expect(mockEditCartLine).not.toHaveBeenCalled();
  });
});
