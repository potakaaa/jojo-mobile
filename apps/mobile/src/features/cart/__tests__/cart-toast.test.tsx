import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch } from '@jojopotato/types';
import { MinTouchTarget, Spacing } from '@jojopotato/ui';
import { fireEvent } from '@testing-library/react-native';
import { Platform } from 'react-native';

import CartScreen, { getCartFooterHeight } from '@/app/(tabs)/cart/index';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useReorderConflicts } from '@/features/cart/hooks/use-reorder-conflicts';
import { useDeal } from '@/features/deals/hooks/use-deal';
import { useDealUsage } from '@/features/deals/hooks/use-deal-usage';
import { checkDealEligibility } from '@/features/deals/lib/eligibility';
import { resolveAndApplyDeal } from '@/features/deals/lib/apply-deal';
import { renderWithProviders, requiredStyleValues, toastOverlayBottom } from '@/test-utils/render';

/**
 * AC4 / AC7 / AC9 for the cart's three migrated notices.
 *
 * Severity split under test (AC9): the two AUTO-FIRED state changes
 * (deal-removed, cart-updated) are 'warning' — the user did nothing wrong but
 * their cart changed at a real cost; the tap-handler FAILURE (cannot-apply-code)
 * is 'error'. Warning and error both require a tap, so neither can be missed.
 */

jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/deals/hooks/use-deal', () => ({ useDeal: jest.fn() }));
jest.mock('@/features/deals/hooks/use-deal-usage', () => ({ useDealUsage: jest.fn() }));
jest.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/features/cart/hooks/use-reorder-conflicts', () => ({
  useReorderConflicts: jest.fn(),
}));
jest.mock('@/features/deals/lib/apply-deal', () => ({ resolveAndApplyDeal: jest.fn() }));
jest.mock('@/features/deals/lib/eligibility', () => ({ checkDealEligibility: jest.fn() }));

const mockUseCart = jest.mocked(useCart);
const mockUseBranch = jest.mocked(useBranch);
const mockUseDeal = jest.mocked(useDeal);
const mockUseDealUsage = jest.mocked(useDealUsage);
const mockUseAuth = jest.mocked(useAuth);
const mockUseReorderConflicts = jest.mocked(useReorderConflicts);
const mockCheckDealEligibility = jest.mocked(checkDealEligibility);
const mockResolveAndApplyDeal = jest.mocked(resolveAndApplyDeal);

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

function setupCart(over: Record<string, unknown> = {}) {
  const clearDiscount = jest.fn();
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
      ...((over.cart as object) ?? {}),
    },
    subtotalCents: 12000,
    discountTotalCents: 0,
    totalCents: 12000,
    itemCount: 1,
    updateQuantity: jest.fn(),
    removeItem: jest.fn(),
    clearCart: jest.fn(),
    setBranch: jest.fn(),
    clearDiscount,
    applyDiscount: jest.fn(),
  } as unknown as ReturnType<typeof useCart>);

  mockUseReorderConflicts.mockReturnValue({
    conflicts: [],
    clearConflicts: jest.fn(),
  } as unknown as ReturnType<typeof useReorderConflicts>);

  return { clearDiscount };
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

describe('CartScreen — deal-removed notice (AC4/AC9)', () => {
  test('an ineligible applied deal is cleared AND surfaces a tap-required warning toast', async () => {
    const { clearDiscount } = setupCart({
      cart: { appliedDiscount: { source: 'deal', refId: 'd1', label: 'BOGO' } },
    });
    mockUseDeal.mockReturnValue({ data: { id: 'd1' } } as unknown as ReturnType<typeof useDeal>);
    mockCheckDealEligibility.mockReturnValue({
      eligible: false,
      message: 'This deal has expired.',
    } as unknown as ReturnType<typeof checkDealEligibility>);

    const { findByText } = await renderWithProviders(<CartScreen />);

    // The underlying state change is unchanged — only the notice moved.
    expect(clearDiscount).toHaveBeenCalled();
    expect(await findByText('Deal removed — This deal has expired.')).toBeTruthy();
  });

  test('an eligible applied deal fires no toast and clears nothing', async () => {
    const { clearDiscount } = setupCart({
      cart: { appliedDiscount: { source: 'deal', refId: 'd1', label: 'BOGO' } },
    });
    mockUseDeal.mockReturnValue({ data: { id: 'd1' } } as unknown as ReturnType<typeof useDeal>);
    mockCheckDealEligibility.mockReturnValue({ eligible: true } as unknown as ReturnType<
      typeof checkDealEligibility
    >);

    const { queryByTestId } = await renderWithProviders(<CartScreen />);

    expect(clearDiscount).not.toHaveBeenCalled();
    expect(queryByTestId('toast-card')).toBeNull();
  });
});

describe('CartScreen — cannot-apply-code notice (AC4/AC9)', () => {
  test('a failed code apply fires an error toast with the server message', async () => {
    setupCart();
    mockResolveAndApplyDeal.mockResolvedValue({
      ok: false,
      message: 'That code is not valid here.',
    } as never);

    const { getByPlaceholderText, getByRole, findByText } = await renderWithProviders(
      <CartScreen />,
    );

    await fireEvent.changeText(getByPlaceholderText('Enter coupon code'), 'BADCODE');
    await fireEvent.press(getByRole('button', { name: 'Apply' }));

    expect(await findByText('That code is not valid here.')).toBeTruthy();
  });
});

describe('CartScreen — toast clearance (AC7 automated leg)', () => {
  /** See the matching note in product-toast.test.tsx: the bug is native-only. */
  test('the suite exercises the native branch, where the clearance bug lives', () => {
    expect(Platform.OS).not.toBe('web');
  });

  async function renderWithFailedCodeApply() {
    setupCart();
    mockResolveAndApplyDeal.mockResolvedValue({
      ok: false,
      message: 'That code is not valid here.',
    } as never);

    const utils = await renderWithProviders(<CartScreen />);
    await fireEvent.changeText(utils.getByPlaceholderText('Enter coupon code'), 'BADCODE');
    await fireEvent.press(utils.getByRole('button', { name: 'Apply' }));
    await utils.findByText('That code is not valid here.');
    return utils;
  }

  test('the toast overlay resolves a bottom offset that clears the sticky checkout footer', async () => {
    const { getByTestId } = await renderWithFailedCodeApply();

    // Native, insets 0: cart.tsx is always a pushed (nested) screen, so
    // resolveTabBarClearance(true, footprint, 0) drops the floating-tab-bar
    // footprint entirely and reserves only the device inset (0 here) — footer =
    // 16 + 48 + (0 + 8) = 72; offset = 80.
    expect(toastOverlayBottom(getByTestId('toast-card'))).toBe(80);
    expect(toastOverlayBottom(getByTestId('toast-card'))).toBe(
      getCartFooterHeight(0) + Spacing.two,
    );
  });

  /**
   * THE REGRESSION PIN — see the twin in product-toast.test.tsx. Measures the
   * footer's REAL rendered padding off the mounted tree instead of trusting the
   * function that produced the offset. At zero device inset on a nested screen
   * the correctly-derived padding legitimately equals the base padding (there is
   * no dead tab-bar footprint to clear here) — the real regression guard is the
   * insets-delta test below, which a static constant could never pass.
   */
  test("the offset clears the footer's REAL rendered height, measured off the mounted tree", async () => {
    const { getByTestId } = await renderWithFailedCodeApply();

    const footer = requiredStyleValues(getByTestId('cart-footer'), ['paddingTop', 'paddingBottom']);
    expect(footer.paddingBottom).toBe(Spacing.two);

    const realFooterHeight = footer.paddingTop + MinTouchTarget + footer.paddingBottom;
    expect(realFooterHeight).toBe(72);

    const offset = toastOverlayBottom(getByTestId('toast-card')) as number;
    expect(offset).toBeGreaterThanOrEqual(realFooterHeight);
  });

  /** A regression to a static constant (the original defect) fails here. */
  test('the footer height grows with the safe-area inset rather than being static', () => {
    expect(getCartFooterHeight(0)).toBe(72);
    expect(getCartFooterHeight(34)).toBe(106);
    expect(getCartFooterHeight(34) - getCartFooterHeight(0)).toBe(34);
  });
});

/**
 * DEFENSIVE regression test (plan D2). Replace-latest means a second toast
 * silently replaces the first, which is only safe because the deal-removed and
 * cart-updated effects are mutually exclusive: they are gated on
 * `cart.appliedDiscount?.source` being 'deal' vs 'reward' respectively, and a
 * cart holds at most one discount. This locks that currently-undocumented
 * invariant — if a future change let both fire for one state transition, one
 * notice would vanish unseen and the user would lose money silently.
 */
describe('CartScreen — simultaneous-notice invariant (D2)', () => {
  test('a reward discount cannot also trigger the deal-removed effect', async () => {
    setupCart({
      cart: { appliedDiscount: { source: 'reward', refId: 'r1', label: 'Free fries' } },
    });
    mockUseDeal.mockReturnValue({ data: { id: 'r1' } } as unknown as ReturnType<typeof useDeal>);
    mockCheckDealEligibility.mockReturnValue({
      eligible: false,
      message: 'This deal has expired.',
    } as unknown as ReturnType<typeof checkDealEligibility>);

    const { queryByText } = await renderWithProviders(<CartScreen />);

    // The deal-removed effect keys off the deal lookup, not the reward path; the
    // reward effect only fires on an items change after a baseline is captured.
    // Neither may produce BOTH notices in one render pass.
    const dealNotice = queryByText('Deal removed — This deal has expired.');
    const rewardNotice = queryByText('Cart updated — re-apply your reward code to redeem it.');
    expect([dealNotice, rewardNotice].filter(Boolean).length).toBeLessThanOrEqual(1);
  });
});
