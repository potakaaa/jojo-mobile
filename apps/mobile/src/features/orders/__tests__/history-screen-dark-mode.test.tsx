import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Order, PickupBranch } from '@jojopotato/types';
import { Colors, Spacing } from '@jojopotato/ui';
import { StyleSheet } from 'react-native';

import OrderHistoryScreen from '@/app/(tabs)/history/index';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useOrderHistory } from '@/features/orders/hooks/use-order-history';
import { useReorder } from '@/features/orders/hooks/use-reorder';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC1 — Order History renders DARK-mode tokens when the app scheme is dark.
 *
 * This is the regression guard for the original reported bug: `history.tsx:74`
 * rendered a bare `<Card>` (no `mode`), so the Card silently defaulted to the
 * LIGHT surface while the sibling text used the dark `theme` — dark text on a
 * cream card, unreadable.
 *
 * The test asserts RESOLVED styles (via `StyleSheet.flatten`), never prop
 * presence: a `toHaveProp('mode')` assertion would pass on the pre-fix code
 * for the text nodes and tells us nothing about what actually painted.
 */

// The app's own resolver (NOT react-native's). `useTheme()` reads this same
// module, so mocking it drives BOTH the screen's `mode` and its `theme` — the
// real chain, exactly as it runs on device.
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'dark' }));

jest.mock('@/features/orders/hooks/use-order-history', () => ({ useOrderHistory: jest.fn() }));
jest.mock('@/features/branch/hooks/use-branch', () => ({ useBranch: jest.fn() }));
jest.mock('@/features/orders/hooks/use-reorder', () => ({ useReorder: jest.fn() }));

const mockUseOrderHistory = jest.mocked(useOrderHistory);
const mockUseBranch = jest.mocked(useBranch);
const mockUseReorder = jest.mocked(useReorder);

const ORDER_NUMBER = 'JP-260717-0001';

/**
 * The four date-bucket labels `groupOrdersByDate` can emit. Matched as a set
 * rather than hardcoded: the grouping runs against the REAL `new Date()`, so
 * which bucket the fixture lands in drifts as wall-clock time passes.
 */
const SECTION_TITLE_RE = /^(Today|Yesterday|This Week|Earlier)$/;

function order(): Order {
  return {
    id: 'o1',
    orderNumber: ORDER_NUMBER,
    branchId: 'b1',
    items: [
      {
        id: 'i1',
        productId: 'p1',
        productNameSnapshot: 'Loaded Fries',
        quantity: 1,
        unitPriceCents: 12000,
        totalPriceCents: 12000,
        selectedOptions: [],
      },
    ],
    status: 'completed',
    subtotalCents: 12000,
    discountTotalCents: 0,
    totalCents: 12000,
    paymentMethod: 'pay_at_branch',
    paymentStatus: 'paid',
    estimatedReadyAt: null,
    placedAt: '2026-07-13T10:00:00.000Z',
    dealId: null,
  };
}

function branch(): PickupBranch {
  return {
    id: 'b1',
    name: 'Downtown',
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

/**
 * Walk up from a section-title text node to the sticky section-header View —
 * the nearest ancestor carrying a resolved `backgroundColor`.
 *
 * Located structurally (first backgrounded ancestor), never by the colour under
 * assertion: searching for the expected colour would make the test circular.
 */
function sectionHeaderOf(node: StyledNode): Record<string, unknown> {
  let current: StyledNode | null = node.parent;
  while (current) {
    const flat = flatStyle(current);
    if (typeof flat.backgroundColor === 'string') return flat;
    current = current.parent;
  }
  throw new Error('No backgrounded section-header ancestor found above the section title');
}

beforeEach(() => {
  jest.clearAllMocks();
  // useInfiniteQuery return shape (G0): the screen reads `data.pages.flatMap(...)`,
  // so a page-wrapped order is required or the list renders empty and these
  // dark-mode assertions go vacuous.
  mockUseOrderHistory.mockReturnValue({
    data: { pages: [{ orders: [order()], nextCursor: null }], pageParams: [null] },
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isRefetching: false,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  } as unknown as ReturnType<typeof useOrderHistory>);
  mockUseBranch.mockReturnValue({
    branches: [branch()],
  } as unknown as ReturnType<typeof useBranch>);
  mockUseReorder.mockReturnValue({
    reorder: jest.fn(),
    isReordering: false,
    error: null,
  } as unknown as ReturnType<typeof useReorder>);
});

describe('OrderHistoryScreen — dark mode (AC1)', () => {
  test('the order Card surface resolves the DARK element token, not the light default', async () => {
    const { getByText } = await renderWithProviders(<OrderHistoryScreen />);

    const card = findCardSurface(getByText(ORDER_NUMBER));

    expect(card.backgroundColor).toBe(Colors.dark.backgroundElement);
    expect(card.borderColor).toBe(Colors.dark.border);
    // The exact pre-fix failure: a light card underneath dark-mode text.
    expect(card.backgroundColor).not.toBe(Colors.light.backgroundElement);
  });

  test('the Card surface and its text resolve tokens from the SAME (dark) mode', async () => {
    const { getByText } = await renderWithProviders(<OrderHistoryScreen />);

    const orderNumber = getByText(ORDER_NUMBER);
    const card = findCardSurface(orderNumber);

    expect(card.backgroundColor).toBe(Colors.dark.backgroundElement);
    expect(flatStyle(orderNumber).color).toBe(Colors.dark.text);
    expect(flatStyle(getByText('Downtown')).color).toBe(Colors.dark.text);
    expect(flatStyle(getByText('1× Loaded Fries')).color).toBe(Colors.dark.textSecondary);
  });

  /*
    A4 / AC13 — the sticky section header's OPACITY wiring.

    Scope note (do not over-read these): they prove the header is given an
    explicit, non-transparent, theme-tied background AND that no transparent
    margin strip sits inside its sticky region. They do NOT prove the header
    actually composites opaquely during a real scroll — jest runs no layout pass
    and cannot produce a scroll position. That half is AC12, Agent-Probe only.
  */
  test('AC13: the sticky section header gets an explicit non-transparent theme background', async () => {
    const { getByText } = await renderWithProviders(<OrderHistoryScreen />);

    const header = sectionHeaderOf(getByText(SECTION_TITLE_RE));

    expect(header.backgroundColor).toBe(Colors.dark.background);
    expect(header.backgroundColor).not.toBe('transparent');
    expect(header.backgroundColor).not.toBe(Colors.light.background);
  });

  test('AC13: the sticky header has no transparent margin strip inside its sticky region', async () => {
    const { getByText } = await renderWithProviders(<OrderHistoryScreen />);

    const header = sectionHeaderOf(getByText(SECTION_TITLE_RE));

    // A margin renders OUTSIDE the background box — rows scroll visibly through
    // it while the header is pinned. Spacing must be padding, not margin.
    expect(header.marginTop).toBeUndefined();
    expect(header.marginVertical).toBeUndefined();
    expect(header.margin).toBeUndefined();

    // The spacing that replaced it must actually be there (a silently-dropped
    // paddingTop would make the assertions above vacuously true). Asserted as an
    // EXACT value, not `> 0`: the top gap is a deliberate Spacing.one (halved
    // from the original Spacing.two on user request), and a loose check would
    // let a silent revert to Spacing.two pass.
    expect(header.paddingTop).toBe(Spacing.one);
  });

  test('the status badge inside the Card resolves the dark border token', async () => {
    // `history.tsx:93`'s <OrderStatusBadge> was a third defect the tsc sweep
    // found that nobody had reported. `mode` drives only the badge's
    // borderColor, so that is the one resolved value worth asserting.
    const { getByText } = await renderWithProviders(<OrderHistoryScreen />);

    const badge = getByText('Picked up').parent;
    if (!badge) throw new Error('badge label has no parent view');

    expect(flatStyle(badge).borderColor).toBe(Colors.dark.border);
    expect(flatStyle(badge).borderColor).not.toBe(Colors.light.border);
  });
});
