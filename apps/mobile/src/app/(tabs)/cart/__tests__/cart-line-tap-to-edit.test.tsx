import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import CartScreen from '@/app/(tabs)/cart';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useReorderConflicts } from '@/features/cart/hooks/use-reorder-conflicts';
import { renderWithProviders } from '@/test-utils/render';

/**
 * B4.1 — tapping a cart line opens Product Details PREFILLED for that line.
 *
 * The prefill params are the whole point: without `lineId` the destination screen
 * is the plain ADD flow, so a missing param silently turns "edit this line" into
 * "add a second line". Each param is asserted individually rather than as a loose
 * object match.
 *
 * Non-vacuity: dropping any one param from the `router.push` call turns the
 * corresponding assertion red (verified during EXECUTE).
 */

jest.mock('expo-router', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return {
    __esModule: true,
    router: mockRouter,
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/',
    useIsFocused: () => true,
  };
});
// The cart screen transitively imports `use-auth.ts`, which calls
// `Linking.createURL` at MODULE scope — that throws under jest without an
// expo-constants manifest. Mocking the hook is the established project fix for
// this (see `process/context/tests/all-tests.md`).
jest.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'u-1' }, isStaff: false, isLoading: false }),
}));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/cart/hooks/use-reorder-conflicts', () => ({
  useReorderConflicts: jest.fn(),
}));

const mockUseCart = jest.mocked(useCart);
const mockUseBranch = jest.mocked(useBranch);
const mockUseReorderConflicts = jest.mocked(useReorderConflicts);
const mockPush = jest.mocked(router.push);

const LINE = {
  lineId: 'line-42',
  menuItemId: 'prod-7',
  quantity: 3,
  productNameSnapshot: 'Loaded Fries',
  unitPriceCents: 12000,
  selectedOptions: [
    { id: 'opt-large', optionType: 'size' as const, name: 'Large', priceDeltaCents: 2000 },
    { id: 'opt-cheese', optionType: 'flavor' as const, name: 'Cheese', priceDeltaCents: 0 },
  ],
};

async function renderCart() {
  mockUseCart.mockReturnValue({
    cart: { items: [LINE], pickupBranchId: 'branch-1' },
    subtotalCents: 36000,
    discountTotalCents: 0,
    totalCents: 36000,
    itemCount: 3,
    updateQuantity: jest.fn(),
    removeItem: jest.fn(),
    clearCart: jest.fn(),
    applyDiscount: jest.fn(),
    clearDiscount: jest.fn(),
    editCartLine: jest.fn(),
  } as unknown as ReturnType<typeof useCart>);

  mockUseBranch.mockReturnValue({
    selectedBranch: { id: 'branch-1', name: 'Branch One' },
    branches: [{ id: 'branch-1', name: 'Branch One' }],
  } as unknown as ReturnType<typeof useBranch>);

  mockUseReorderConflicts.mockReturnValue({
    conflicts: [],
    acknowledge: jest.fn(),
    clear: jest.fn(),
  } as unknown as ReturnType<typeof useReorderConflicts>);

  return renderWithProviders(<CartScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('B4.1 — tapping a cart line navigates to Product Details prefilled', () => {
  test('pushes the product route carrying productId, lineId, optionIds and quantity', async () => {
    const { getByTestId } = await renderCart();

    await fireEvent.press(getByTestId('cart-line-line-42'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const arg = mockPush.mock.calls[0]![0] as { pathname: string; params: Record<string, string> };

    expect(arg.pathname).toBe('/(tabs)/product');
    // The product being edited.
    expect(arg.params.productId).toBe('prod-7');
    // Without this the destination is the plain ADD flow, not an edit.
    expect(arg.params.lineId).toBe('line-42');
    // Both current options, so the selectors open on the line's real state.
    expect(arg.params.optionIds).toBe('opt-large,opt-cheese');
    // Route params are strings, and the destination parses this back to a number.
    expect(arg.params.quantity).toBe('3');
  });
});
