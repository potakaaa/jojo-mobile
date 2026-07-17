import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch } from '@jojopotato/types';
import { Colors } from '@jojopotato/ui';
import { StyleSheet } from 'react-native';

import CartScreen from '@/app/(tabs)/order/cart';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useReorderConflicts } from '@/features/cart/hooks/use-reorder-conflicts';
import { useDeal } from '@/features/deals/hooks/use-deal';
import { useDealUsage } from '@/features/deals/hooks/use-deal-usage';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC3 — the cart's reorder-conflict Card (`cart.tsx:239`) renders DARK-mode
 * tokens when the app scheme is dark. Second of the two originally-reported
 * bugs: the Card was bare (`<Card style={...}>`, no `mode`) so it silently
 * painted the light surface under dark-mode text.
 *
 * Lives in its own file rather than extending `cart-branch-switch.test.tsx`:
 * that suite's fixture mocks `useReorderConflicts` with `conflicts: []`, so it
 * never renders the conflict Card at all.
 *
 * Asserts RESOLVED styles (`StyleSheet.flatten`), never prop presence.
 */

// The app's own resolver (NOT react-native's). `useTheme()` reads this same
// module, so mocking it drives both `mode` and `theme` — the real chain.
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'dark' }));

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

const CONFLICT_TITLE = 'Some items are unavailable';

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

/**
 * Minimal structural view of a rendered node. Hand-rolled rather than importing
 * `ReactTestInstance`: `react-test-renderer` ships no type declarations in this
 * repo, so importing its types fails `tsc --noEmit`. This is the subset the
 * helpers below actually touch.
 */
interface StyledNode {
  props: { style?: unknown };
  parent: StyledNode | null;
}

/** Flatten a node's style prop to a plain object of RESOLVED values. */
function flatStyle(node: StyledNode): Record<string, unknown> {
  return (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
}

/**
 * Walk up from `node` to the nearest `<Card>` surface. Located STRUCTURALLY (by
 * Card's `borderWidth: 2` + a resolved `backgroundColor`), never by colour —
 * searching for the colour we intend to assert would make the test circular.
 */
function findCardSurface(node: StyledNode): Record<string, unknown> {
  let current: StyledNode | null = node.parent;
  while (current) {
    const flat = flatStyle(current);
    if (flat.borderWidth === 2 && typeof flat.backgroundColor === 'string') return flat;
    current = current.parent;
  }
  throw new Error('No Card surface (borderWidth: 2 + backgroundColor) found above the node');
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
    clearCart: jest.fn(),
    setBranch: jest.fn(),
    clearDiscount: jest.fn(),
    applyDiscount: jest.fn(),
  } as unknown as ReturnType<typeof useCart>);

  // A non-empty conflicts list is what renders the conflict Card under test.
  mockUseReorderConflicts.mockReturnValue({
    conflicts: [{ productName: 'Sold Out Fries', reason: 'product_unavailable' }],
    clearConflicts: jest.fn(),
  } as unknown as ReturnType<typeof useReorderConflicts>);

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

describe('CartScreen — reorder-conflict Card in dark mode (AC3)', () => {
  test('the conflict Card surface resolves the DARK element token, not the light default', async () => {
    const { getByText } = await renderWithProviders(<CartScreen />);

    const card = findCardSurface(getByText(CONFLICT_TITLE));

    expect(card.backgroundColor).toBe(Colors.dark.backgroundElement);
    expect(card.borderColor).toBe(Colors.dark.border);
    // The exact pre-fix failure: a light card underneath dark-mode text.
    expect(card.backgroundColor).not.toBe(Colors.light.backgroundElement);
  });

  test('the conflict Card surface and its text resolve tokens from the SAME (dark) mode', async () => {
    const { getByText } = await renderWithProviders(<CartScreen />);

    const title = getByText(CONFLICT_TITLE);
    const card = findCardSurface(title);

    expect(card.backgroundColor).toBe(Colors.dark.backgroundElement);
    expect(flatStyle(title).color).toBe(Colors.dark.text);
    expect(flatStyle(getByText('Sold Out Fries')).color).toBe(Colors.dark.text);
  });
});
