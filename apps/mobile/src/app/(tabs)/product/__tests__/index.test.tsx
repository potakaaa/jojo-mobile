import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { ProductDetail } from '@jojopotato/types';
import { fireEvent, within, type RenderResult } from '@testing-library/react-native';

import ProductDetailsScreen from '@/app/(tabs)/product';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useProductDetails } from '@/features/menu/hooks/use-product-details';
import { renderWithProviders } from '@/test-utils/render';

/**
 * A2 (AC6/AC7) + A1 (AC4) regression coverage for Product Details.
 *
 * A2's root cause is NAV-006's static `index` anchor: expo-router downgrades
 * PUSH -> NAVIGATE for product A -> product B, so this screen instance is
 * REUSED rather than remounted, and `quantity`/`selection` used to carry over.
 * The fix is a `key={productId}` remount boundary around the stateful body —
 * these tests drive that by re-rendering with a changed `useLocalSearchParams`
 * result, which is exactly the shape the real navigation produces.
 *
 * Non-vacuity: removing `key={productId}` from the screen turns the AC6/AC7
 * cases red (verified during EXECUTE) — the reused-instance behaviour they were
 * written against is the pre-fix behaviour.
 */

/** Mutable so a test can flip the route param without remounting the tree. */
let mockCurrentProductId = 'p-a';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ productId: mockCurrentProductId }),
  router: { back: jest.fn(), push: jest.fn() },
  // No real navigation container under jsdom — mirrors the global stub in
  // jest-setup.ts and the branch-detail-toast.test.tsx precedent.
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

const emptyOptions = { size: [], flavor: [], add_on: [] };

/** Product A: base ₱100.00, one required size group with a +₱12.00 upgrade. */
const PRODUCT_A: ProductDetail = {
  id: 'p-a',
  name: 'Product A',
  basePriceCents: 10000,
  isAvailable: true,
  options: {
    ...emptyOptions,
    size: [
      { optionId: 'a-regular', optionType: 'size', name: 'Regular', priceDeltaCents: 0 },
      { optionId: 'a-large', optionType: 'size', name: 'Large', priceDeltaCents: 1200 },
    ],
  },
};

/** Product B: base ₱50.00, also has a REQUIRED size group (so AC7 has teeth). */
const PRODUCT_B: ProductDetail = {
  id: 'p-b',
  name: 'Product B',
  basePriceCents: 5000,
  isAvailable: true,
  options: {
    ...emptyOptions,
    size: [{ optionId: 'b-regular', optionType: 'size', name: 'Regular', priceDeltaCents: 0 }],
  },
};

const PRODUCTS: Record<string, ProductDetail> = { 'p-a': PRODUCT_A, 'p-b': PRODUCT_B };

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentProductId = 'p-a';
  mockAddItem.mockResolvedValue(true);

  mockUseProductDetails.mockImplementation((productId: string) => ({
    data: PRODUCTS[productId],
    isLoading: false,
    isError: false,
  }));
  mockUseCart.mockReturnValue({
    cart: { items: [], pickupBranchId: 'br-1' },
    addItem: mockAddItem,
    setBranch: jest.fn(),
    clearCart: jest.fn(),
  } as unknown as ReturnType<typeof useCart>);
  mockUseBranch.mockReturnValue({
    selectedBranch: { id: 'br-1', name: 'Downtown' },
  } as unknown as ReturnType<typeof useBranch>);
});

describe('Product Details — state reset on product change (A2)', () => {
  test('AC6: quantity and selection reset to their first-open values on productId change', async () => {
    const view = await renderWithProviders(<ProductDetailsScreen />);

    // Dirty Product A's state: quantity 1 -> 3, plus a size selection.
    await fireEvent.press(view.getByLabelText('Increase quantity'));
    await fireEvent.press(view.getByLabelText('Increase quantity'));
    await fireEvent.press(view.getByText('Large'));

    expect(view.getByLabelText('Quantity 3')).toBeTruthy();
    // ₱100.00 base + ₱12.00 size delta, x3 = ₱336.00 — proves the selection took.
    expect(totalText(view)).toBe('₱336.00');

    // Navigate A -> B. NAV-006 reuses this mounted instance, so only the param
    // changes; nothing unmounts on its own.
    mockCurrentProductId = 'p-b';
    await view.rerender(<ProductDetailsScreen />);

    expect(view.getByText('Product B')).toBeTruthy();
    // Quantity back to 1 — not Product A's leftover 3.
    expect(view.getByLabelText('Quantity 1')).toBeTruthy();
    expect(view.queryByLabelText('Quantity 3')).toBeNull();
    // Total is B's bare base price: no leftover delta, no leftover quantity.
    expect(totalText(view)).toBe('₱50.00');
  });

  test('AC6: no option row stays selected after the product changes', async () => {
    const view = await renderWithProviders(<ProductDetailsScreen />);

    await fireEvent.press(view.getByText('Large'));
    expect(selectedLabels(view.getAllByRole('radio'))).toContain('Large');

    mockCurrentProductId = 'p-b';
    await view.rerender(<ProductDetailsScreen />);

    // Product B's own rows render, and none of them is pre-selected.
    expect(view.getByText('Regular')).toBeTruthy();
    expect(selectedLabels(view.getAllByRole('radio'))).toHaveLength(0);
  });

  test('AC7: add-to-cart eligibility recomputes for the new product rather than inheriting the old selection', async () => {
    const view = await renderWithProviders(<ProductDetailsScreen />);

    // Satisfy Product A's required size group — A is now eligible.
    await fireEvent.press(view.getByText('Large'));
    await fireEvent.press(view.getByText('Add to Cart'));
    expect(mockAddItem).toHaveBeenCalledTimes(1);

    mockAddItem.mockClear();
    mockCurrentProductId = 'p-b';
    await view.rerender(<ProductDetailsScreen />);

    // B's required size group is unselected after the reset, so tapping Add
    // must surface the validation hint and add NOTHING — the pre-fix bug would
    // have carried A's satisfied selection over and added B straight to cart.
    await fireEvent.press(view.getByText('Add to Cart'));
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(view.getByText('Please choose the required options first.')).toBeTruthy();

    // Selecting B's own option re-enables it.
    await fireEvent.press(view.getByText('Regular'));
    await fireEvent.press(view.getByText('Add to Cart'));
    expect(mockAddItem).toHaveBeenCalledTimes(1);
  });

  test('re-rendering with the SAME productId does not reset in-progress state', async () => {
    const view = await renderWithProviders(<ProductDetailsScreen />);

    await fireEvent.press(view.getByLabelText('Increase quantity'));
    await view.rerender(<ProductDetailsScreen />);

    // The remount is keyed on productId, not on every render — an over-eager
    // reset would wipe the customer's input on any incidental re-render.
    expect(view.getByLabelText('Quantity 2')).toBeTruthy();
  });
});

describe('Product Details — unit price math with per-row price deltas (A1 / AC4)', () => {
  test('AC4: the running total stays base + selected deltas after per-row price text was added', async () => {
    const view = await renderWithProviders(<ProductDetailsScreen />);

    // Bare base price with nothing selected.
    expect(totalText(view)).toBe('₱100.00');

    // The new per-row delta text renders on the non-zero option only...
    expect(view.getByText('+₱12.00')).toBeTruthy();
    expect(view.queryByText('+₱0.00')).toBeNull();

    // ...and selecting it moves the total by exactly that delta, once — the
    // per-row display must not be double-counted into the total.
    await fireEvent.press(view.getByText('Large'));
    expect(totalText(view)).toBe('₱112.00');

    // Quantity multiplies the unit price, still with a single delta applied.
    await fireEvent.press(view.getByLabelText('Increase quantity'));
    expect(totalText(view)).toBe('₱224.00');

    // Switching to the zero-delta option drops back to the bare base x qty.
    await fireEvent.press(view.getByText('Regular'));
    expect(totalText(view)).toBe('₱200.00');
  });
});

/**
 * The sticky bar's live "Total" figure.
 *
 * Scoped to `add-to-cart-bar` on purpose: the screen ALSO renders the product's
 * bare base price in its own chip, so an unscoped `getByText('₱100.00')` matches
 * two nodes and would silently assert against the wrong one (or throw) whenever
 * the total happens to equal the base price.
 */
function totalText(view: RenderResult): string {
  const bar = view.getByTestId('add-to-cart-bar');
  return within(bar).getByText(/₱/).props.children as string;
}

/**
 * Labels of every rendered option row currently in the `checked` a11y state.
 *
 * Reads `radio`/`checked` rather than `button`/`selected`: the option selectors
 * are radio/checkbox LIST rows, not pill buttons — single-select announces
 * `accessibilityRole="radio"` with `accessibilityState={{ checked }}`. The
 * assertion is unchanged in strength (still "no option is pre-selected"), only
 * retargeted at the correct role.
 */
function selectedLabels(
  rows: {
    props: { accessibilityState?: { checked?: boolean }; children?: unknown };
    children: unknown[];
  }[],
): string[] {
  return rows
    .filter((node) => node.props.accessibilityState?.checked === true)
    .flatMap((node) => collectText(node));
}

function collectText(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (node && typeof node === 'object' && 'children' in node) {
    return collectText((node as { children: unknown }).children);
  }
  return [];
}
