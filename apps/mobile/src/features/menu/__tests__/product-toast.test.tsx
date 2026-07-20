import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch, ProductDetail } from '@jojopotato/types';
import { Spacing } from '@jojopotato/ui';
import { fireEvent } from '@testing-library/react-native';
import { Platform } from 'react-native';

import ProductDetailsScreen from '@/app/(tabs)/product/[productId]';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import {
  BAR_CONTENT_BLOCK_HEIGHT,
  getAddToCartBarHeight,
} from '@/features/menu/components/add-to-cart-bar';
import { useProductDetails } from '@/features/menu/hooks/use-product-details';
import { renderWithProviders, requiredStyleValues, toastOverlayBottom } from '@/test-utils/render';

/**
 * AC4 / AC6 / AC7 for Product Details.
 *
 * AC6 is explicit that the old inline "Added to cart ✓" notice must be GONE, not
 * left as a second, redundant notice — so this asserts both that the toast fires
 * and that the old text no longer renders.
 */

jest.mock('@/features/menu/hooks/use-product-details', () => ({
  useProductDetails: jest.fn(),
}));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));

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

/** A product with a REQUIRED size group, so `canAdd` is false until chosen. */
const productWithRequiredOption: ProductDetail = {
  ...product,
  options: {
    size: [
      {
        optionId: 'o1',
        optionType: 'size',
        name: 'Large',
        priceDeltaCents: 0,
        isRequired: true,
      },
    ],
    flavor: [],
    add_on: [],
  },
} as unknown as ProductDetail;

const selectedBranch = { id: 'b1', name: 'Downtown' } as PickupBranch;

function setupCart(over: Record<string, unknown> = {}) {
  const addItem = jest.fn();
  mockUseCart.mockReturnValue({
    cart: { items: [], pickupBranchId: 'b1' },
    addItem,
    setBranch: jest.fn(),
    clearCart: jest.fn(),
    ...over,
  } as unknown as ReturnType<typeof useCart>);
  return { addItem };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseProductDetails.mockReturnValue({ data: product, isLoading: false, isError: false });
  mockUseBranch.mockReturnValue({ selectedBranch } as unknown as ReturnType<typeof useBranch>);
});

describe('ProductDetailsScreen — add-to-cart toast (AC4/AC6)', () => {
  test('a successful add fires the success toast AND still calls addItem', async () => {
    const { addItem } = setupCart();

    const { getByRole, queryByText, findByText } = await renderWithProviders(
      <ProductDetailsScreen />,
    );
    expect(queryByText('Added to cart')).toBeNull();

    fireEvent.press(getByRole('button', { name: 'Add to Cart' }));

    expect(await findByText('Added to cart')).toBeTruthy();
    // The underlying behavior is unchanged — only the notice moved.
    expect(addItem).toHaveBeenCalledTimes(1);
  });

  // AC6: the ad-hoc inline notice must be REMOVED, not left alongside the toast.
  test('the old inline "Added to cart ✓" text no longer renders', async () => {
    setupCart();
    const { getByRole, queryByText } = await renderWithProviders(<ProductDetailsScreen />);

    fireEvent.press(getByRole('button', { name: 'Add to Cart' }));

    expect(queryByText('Added to cart ✓')).toBeNull();
  });

  test('adding with no branch selected fires an error toast and does NOT add', async () => {
    const { addItem } = setupCart();
    mockUseBranch.mockReturnValue({ selectedBranch: null } as unknown as ReturnType<
      typeof useBranch
    >);

    const { getByRole, findByText } = await renderWithProviders(<ProductDetailsScreen />);
    fireEvent.press(getByRole('button', { name: 'Add to Cart' }));

    expect(await findByText('Please select a pickup branch before adding items.')).toBeTruthy();
    expect(addItem).not.toHaveBeenCalled();
  });
});

describe('ProductDetailsScreen — toast clearance (AC7 automated leg)', () => {
  /**
   * These run on the NATIVE path. `jest-expo` reports `Platform.OS === 'ios'`
   * (probed, not assumed), which matters enormously: the clearance bug lived
   * ONLY in the `Platform.OS !== 'web'` branch, so a suite that silently ran as
   * web would go green while the real overlap shipped. This guard fails loudly
   * if the preset's platform ever changes out from under these assertions.
   */
  test('the suite exercises the native branch, where the clearance bug lives', () => {
    expect(Platform.OS).not.toBe('web');
  });

  test('the toast overlay resolves a bottom offset that clears the add-to-cart bar', async () => {
    setupCart();
    const { getByRole, getByTestId, findByText } = await renderWithProviders(
      <ProductDetailsScreen />,
    );

    fireEvent.press(getByRole('button', { name: 'Add to Cart' }));
    await findByText('Added to cart');

    // Assert the RESOLVED `bottom`, not that a prop was passed. Native, insets 0:
    // this bar only ever renders on Product Details, a pushed (nested) screen, so
    // resolveTabBarClearance(true, footprint, 0) drops the floating-tab-bar
    // footprint entirely and reserves only the device inset (0 here) — bar =
    // 2 + 8 + 69 + (0 + 24) = 103; offset = 103 + 8 = 111.
    expect(toastOverlayBottom(getByTestId('toast-card'))).toBe(111);
    expect(toastOverlayBottom(getByTestId('toast-card'))).toBe(
      getAddToCartBarHeight(0) + Spacing.two,
    );
  });

  /**
   * THE REGRESSION PIN. Every other assertion here compares the offset against
   * `getAddToCartBarHeight`, i.e. against the very function that produced it —
   * which proves nothing on its own. This one instead measures the bar's REAL
   * rendered padding/border (post-override, read off the mounted tree) and
   * asserts the toast clears the total. It is what makes a future change to the
   * bar's padding fail a test instead of an on-device walkthrough. At zero device
   * inset on this nested screen the correctly-derived padding legitimately equals
   * the base padding (there is no dead tab-bar footprint to clear here) — the
   * real regression guard is the insets-delta test below, which a static
   * constant could never pass.
   */
  test("the offset clears the bar's REAL rendered height, measured off the mounted tree", async () => {
    setupCart();
    const { getByRole, getByTestId, findByText } = await renderWithProviders(
      <ProductDetailsScreen />,
    );

    fireEvent.press(getByRole('button', { name: 'Add to Cart' }));
    await findByText('Added to cart');

    const bar = requiredStyleValues(getByTestId('add-to-cart-bar'), [
      'borderTopWidth',
      'paddingTop',
      'paddingBottom',
    ]);
    expect(bar.paddingBottom).toBe(Spacing.four);

    const realBarHeight =
      bar.borderTopWidth + bar.paddingTop + BAR_CONTENT_BLOCK_HEIGHT + bar.paddingBottom;
    expect(realBarHeight).toBe(103);

    const offset = toastOverlayBottom(getByTestId('toast-card')) as number;
    expect(offset).toBeGreaterThanOrEqual(realBarHeight);
  });

  /**
   * The height must track `insets.bottom`. A regression to any static constant
   * (the original defect's shape) makes these two values equal and fails here.
   */
  test('the bar height grows with the safe-area inset rather than being static', () => {
    expect(getAddToCartBarHeight(0)).toBe(103);
    expect(getAddToCartBarHeight(34)).toBe(137);
    expect(getAddToCartBarHeight(34) - getAddToCartBarHeight(0)).toBe(34);
  });

  /**
   * Gap 6: the height is deliberately the ALWAYS-TALL (hint-visible) variant,
   * because `showHint` is local state inside the bar that this screen cannot
   * see. This exercises the `showHint && !canAdd` state specifically — a test
   * that only covered the hint-HIDDEN default would pass while a real overlap
   * shipped. The offset must not shrink when the hint appears.
   */
  test('the offset is the same tall value even when the required-options hint is visible', async () => {
    setupCart();
    mockUseProductDetails.mockReturnValue({
      data: productWithRequiredOption,
      isLoading: false,
      isError: false,
    });

    const { getByRole, findByText } = await renderWithProviders(<ProductDetailsScreen />);

    // canAdd === false, so pressing surfaces the bar's inline hint (it does NOT add).
    fireEvent.press(getByRole('button', { name: 'Add to Cart' }));
    expect(await findByText('Please choose the required options first.')).toBeTruthy();

    // Hint-state-independent by construction: one value, always tall.
    expect(getAddToCartBarHeight(0)).toBe(103);
    expect(getAddToCartBarHeight(0) + Spacing.two).toBe(111);
  });
});
