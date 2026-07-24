import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch } from '@jojopotato/types';
import { Palette, Radii } from '@jojopotato/ui';
import { fireEvent, within, type RenderResult } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import CartScreen from '@/app/(tabs)/cart/index';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useReorderConflicts } from '@/features/cart/hooks/use-reorder-conflicts';
import { useDeal } from '@/features/deals/hooks/use-deal';
import { useDealUsage } from '@/features/deals/hooks/use-deal-usage';
import { renderWithProviders } from '@/test-utils/render';

/**
 * A3 (AC9 call-site half + AC10) — the cart's applied-discount row.
 *
 * `CouponCard`'s own rendering rule is covered in
 * `packages/ui/src/components/__tests__/coupon-card.test.tsx`. What can only be
 * proven HERE is the call site's decision: when there is no `appliedDeal`, the
 * cart must pass `code: undefined` (so the false-button pill is omitted) rather
 * than falling back to the descriptive label, and must format the amount through
 * `formatCurrency` rather than hand-rolled `.toFixed(2)` math.
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

const mockUseCart = jest.mocked(useCart);
const mockUseBranch = jest.mocked(useBranch);
const mockUseDeal = jest.mocked(useDeal);
const mockUseDealUsage = jest.mocked(useDealUsage);
const mockUseAuth = jest.mocked(useAuth);
const mockUseReorderConflicts = jest.mocked(useReorderConflicts);

const mockClearDiscount = jest.fn();

/** The descriptive label the OLD code pushed into the yellow pill. */
const DISCOUNT_LABEL = 'Applied birthday reward discount';

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

beforeEach(() => {
  jest.clearAllMocks();

  mockUseCart.mockReturnValue({
    cart: {
      items: [
        {
          lineId: 'l1',
          menuItemId: 'p1',
          quantity: 1,
          productNameSnapshot: 'Loaded Fries',
          unitPriceCents: 200000,
          selectedOptions: [],
        },
      ],
      pickupBranchId: 'b1',
      // A server-applied discount with NO customer-facing code — the exact
      // shape that produced the reported defect.
      appliedDiscount: {
        source: 'reward',
        refId: 'r1',
        label: DISCOUNT_LABEL,
        amountCents: 128900,
      },
    },
    subtotalCents: 200000,
    discountTotalCents: 128900,
    totalCents: 71100,
    itemCount: 1,
    updateQuantity: jest.fn(),
    removeItem: jest.fn(),
    clearCart: jest.fn(),
    setBranch: jest.fn(),
    clearDiscount: mockClearDiscount,
    applyDiscount: jest.fn(),
  } as unknown as ReturnType<typeof useCart>);

  mockUseReorderConflicts.mockReturnValue({
    conflicts: [],
    clearConflicts: jest.fn(),
  } as unknown as ReturnType<typeof useReorderConflicts>);
  mockUseBranch.mockReturnValue({
    branches: [branch('b1', 'Downtown')],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useBranch>);
  // No resolved deal — so `appliedDeal` is undefined at the call site.
  mockUseDeal.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useDeal>);
  mockUseDealUsage.mockReturnValue({} as unknown as ReturnType<typeof useDealUsage>);
  mockUseAuth.mockReturnValue({ user: { id: 'u1' } } as unknown as ReturnType<typeof useAuth>);
});

describe('CartScreen — applied-discount row (A3)', () => {
  test('AC9: a code-less discount renders no yellow code pill', async () => {
    const view = await renderWithProviders(<CartScreen />);
    const slot = couponSlot(view);

    // The label still reaches the customer — as the card's TITLE, not as a
    // fake button. (The old code put it inside the pill, where it clipped.)
    expect(within(slot).getByText(DISCOUNT_LABEL)).toBeTruthy();

    expect(countYellowPills(slot.toJSON?.() ?? slot)).toBe(0);
  });

  test('AC9: the discount amount is formatted through formatCurrency, not toFixed(2)', async () => {
    const view = await renderWithProviders(<CartScreen />);
    const slot = within(couponSlot(view));

    // `formatCurrency(128900)` -> "-₱1,289.00" (peso sign + thousands
    // separator). The old `-${(cents/100).toFixed(2)}` produced "-1289.00":
    // no currency symbol and no grouping. Scoped to the coupon slot on
    // purpose — CartSummary renders its own (already-formatted) discount line,
    // so an unscoped query would pass even with the call site left unfixed.
    expect(slot.getByText('-₱1,289.00')).toBeTruthy();
    expect(slot.queryByText('-1289.00')).toBeNull();
  });

  test('AC10: the "Remove discount" action is present and still fires its handler', async () => {
    const { getByText } = await renderWithProviders(<CartScreen />);

    const remove = getByText('Remove discount');
    expect(remove).toBeTruthy();

    await fireEvent.press(remove);
    expect(mockClearDiscount).toHaveBeenCalledTimes(1);
  });
});

/**
 * The cart's "Coupon / reward" section node — the CouponCard plus its
 * "Remove discount" button.
 *
 * Located by walking up from the unique section heading until the subtree also
 * contains the Remove button (i.e. the whole slot, not just the heading's own
 * text wrapper). Scoping matters: `CartSummary` further down the screen renders
 * the SAME label and the SAME formatted amount, so an unscoped query proves
 * nothing about the CouponCard call site.
 */
function couponSlot(view: RenderResult): ReturnType<RenderResult['getByText']> {
  let node = view.getByText('Coupon / reward');
  for (let hop = 0; hop < 6; hop += 1) {
    const parent = node.parent;
    if (!parent) break;
    node = parent as typeof node;
    if (within(node).queryByText('Remove discount')) return node;
  }
  throw new Error('Could not locate the coupon slot containing the Remove discount button');
}

/** Count of jyellow rounded surfaces (the CouponCard code pill) in the tree. */
function countYellowPills(json: unknown): number {
  if (!json || typeof json !== 'object') return 0;
  if (Array.isArray(json)) return json.reduce<number>((n, c) => n + countYellowPills(c), 0);
  const node = json as { props?: { style?: unknown }; children?: unknown };
  const flat = (StyleSheet.flatten(node.props?.style) ?? {}) as Record<string, unknown>;
  const isPill =
    flat.backgroundColor === Palette.jyellow &&
    flat.borderWidth === 2 &&
    flat.borderRadius === Radii.sm;
  return (isPill ? 1 : 0) + countYellowPills(node.children);
}
