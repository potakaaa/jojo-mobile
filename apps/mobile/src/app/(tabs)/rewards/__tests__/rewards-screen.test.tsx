import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type {
  Cart,
  CartItem,
  CartItemOption,
  CouponWithReward,
  MenuItem,
  MenuResponse,
  Product,
  Reward,
  RewardsSummary,
  StarTransaction,
} from '@jojopotato/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import RewardsScreen from '@/app/(tabs)/rewards/index';
import { useCart } from '@/features/cart/hooks/use-cart';
import { resolveAndApplyDeal } from '@/features/deals/lib/apply-deal';
import { useMenu } from '@/features/menu/hooks/use-menu';
import { useAvailableRewards } from '@/features/rewards/hooks/use-available-rewards';
import { useMyCoupons } from '@/features/rewards/hooks/use-my-coupons';
import { useRewardsHistory } from '@/features/rewards/hooks/use-rewards-history';
import { useRewardsSummary } from '@/features/rewards/hooks/use-rewards-summary';
import { renderWithProviders } from '@/test-utils/render';

/**
 * Reward auto-redeem screen behavior (AC1, AC3–AC7). The Redeem tap flow is
 * verified against fully-mocked data hooks — this proves `handleRedeem`'s control
 * flow (branch guard, auto-add, idempotency, unavailability stop, degrade-null,
 * button disable), NOT the real cart/menu/navigation round-trip.
 */

// api-client-transitive auth stub (E4) — cut before it loads @better-auth ESM.
jest.mock('@/features/auth/lib/auth-client', () => ({ authClient: {} }));
jest.mock('@/features/cart/hooks/use-cart', () => ({ useCart: jest.fn() }));
jest.mock('@/features/menu/hooks/use-menu', () => ({ useMenu: jest.fn() }));
jest.mock('@/features/rewards/hooks/use-rewards-summary', () => ({ useRewardsSummary: jest.fn() }));
jest.mock('@/features/rewards/hooks/use-available-rewards', () => ({
  useAvailableRewards: jest.fn(),
}));
jest.mock('@/features/rewards/hooks/use-rewards-history', () => ({ useRewardsHistory: jest.fn() }));
jest.mock('@/features/rewards/hooks/use-my-coupons', () => ({ useMyCoupons: jest.fn() }));
jest.mock('@/features/deals/lib/apply-deal', () => ({ resolveAndApplyDeal: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockUseCart = jest.mocked(useCart);
const mockUseMenu = jest.mocked(useMenu);
const mockUseRewardsSummary = jest.mocked(useRewardsSummary);
const mockUseAvailableRewards = jest.mocked(useAvailableRewards);
const mockUseRewardsHistory = jest.mocked(useRewardsHistory);
const mockUseMyCoupons = jest.mocked(useMyCoupons);
const mockResolveAndApplyDeal = jest.mocked(resolveAndApplyDeal);

const REWARD_ID = 'reward-1';
const ELIGIBLE_PRODUCT_ID = 'prod-fries';
const COUPON_CODE = 'CODE-abc';

/** An unlockable free-item reward with a configured eligible product. */
function reward(over: Partial<Reward> = {}): Reward {
  return {
    id: REWARD_ID,
    name: 'Free Fries',
    requiredStars: 5,
    rewardType: 'free_item',
    rewardValue: null,
    isActive: true,
    eligibleProductId: ELIGIBLE_PRODUCT_ID,
    ...over,
  };
}

/** Matching `available` reward-coupon so the tier derives to `unlocked` (Redeem shows). */
function coupon(): CouponWithReward {
  return {
    id: 'coupon-1',
    userId: 'u1',
    dealId: null,
    rewardId: REWARD_ID,
    code: COUPON_CODE,
    status: 'available',
    expiresAt: null,
    usedAt: null,
    createdAt: '2026-07-21T00:00:00.000Z',
    reward: { name: 'Free Fries', requiredStars: 5 },
  };
}

function product(id: string): Product {
  return {
    id,
    name: 'Fries',
    basePriceCents: 500,
    options: { size: [], flavor: [], add_on: [] },
  };
}

/** A menu containing the eligible product. */
function menuWithEligible(): MenuResponse {
  return {
    branchId: 'b1',
    categories: [{ id: 'cat-1', name: 'Sides', products: [product(ELIGIBLE_PRODUCT_ID)] }],
  };
}

/** A menu WITHOUT the eligible product (unavailability). */
function menuWithoutEligible(): MenuResponse {
  return {
    branchId: 'b1',
    categories: [{ id: 'cat-1', name: 'Sides', products: [product('other-product')] }],
  };
}

const summary: RewardsSummary = {
  currentStars: 10,
  lifetimeStars: 10,
  requiredStars: 5,
  isUnlocked: true,
  reward: reward(),
};

const addItemMock =
  jest.fn<(menuItem: MenuItem, opts: CartItemOption[], qty?: number) => Promise<boolean>>();
const applyDiscountMock = jest.fn();

/** Build a mocked cart with the given branch + items. */
function setCart(pickupBranchId: string, items: CartItem[] = []) {
  const cart: Cart = { id: 'cart-1', items, pickupBranchId };
  mockUseCart.mockReturnValue({
    cart,
    addItem: addItemMock,
    applyDiscount: applyDiscountMock,
  } as unknown as ReturnType<typeof useCart>);
}

function cartItem(menuItemId: string): CartItem {
  return {
    id: `line-${menuItemId}`,
    menuItemId,
    name: 'Fries',
    unitPriceCents: 500,
    quantity: 1,
    selectedOptions: [],
  } as unknown as CartItem;
}

const asQuery = <T,>(data: T) =>
  ({ data, isLoading: false, isError: false, refetch: jest.fn() }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  addItemMock.mockResolvedValue(true);
  mockResolveAndApplyDeal.mockResolvedValue({
    ok: true,
    discount: {
      source: 'reward',
      refId: REWARD_ID,
      label: 'Free Fries',
      amountCents: 500,
    },
  } as never);
  mockUseRewardsSummary.mockReturnValue(asQuery(summary));
  mockUseAvailableRewards.mockReturnValue(asQuery([reward()]));
  mockUseRewardsHistory.mockReturnValue(asQuery({ transactions: [], nextCursor: null }));
  mockUseMyCoupons.mockReturnValue(asQuery([coupon()]));
  mockUseMenu.mockReturnValue(asQuery(menuWithEligible()));
});

describe('RewardsScreen — auto-redeem (AC1, AC3–AC7)', () => {
  // AC1 — no branch: toast contains "pick a branch" + navigate to branches, cart unchanged.
  test('AC1: no branch → toast "pick a branch" + navigate to branches, no addItem', async () => {
    setCart(''); // no pickup branch
    const { findByText, getByText } = await renderWithProviders(<RewardsScreen />);

    fireEvent.press(getByText('Redeem'));

    // Toast wording matched case-insensitively (AC1 contract).
    expect(await findByText(/pick a branch/i)).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/branches');
    expect(addItemMock).not.toHaveBeenCalled();
    expect(applyDiscountMock).not.toHaveBeenCalled();
  });

  // AC3 — branch set + eligible in menu + empty cart → addItem once + navigate to cart.
  test('AC3: eligible item available + empty cart → addItem + navigate to cart', async () => {
    setCart('b1', []);
    const { getByText } = await renderWithProviders(<RewardsScreen />);

    fireEvent.press(getByText('Redeem'));

    await waitFor(() => expect(addItemMock).toHaveBeenCalledTimes(1));
    const [menuItemArg, optsArg, qtyArg] = addItemMock.mock.calls[0]!;
    expect(menuItemArg.id).toBe(ELIGIBLE_PRODUCT_ID);
    expect(optsArg).toEqual([]);
    expect(qtyArg).toBe(1);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(tabs)/cart'));
    expect(applyDiscountMock).toHaveBeenCalledTimes(1);
  });

  // AC4 — eligible item already in cart → NO addItem, discount applied, navigate.
  test('AC4: eligible item already in cart → skip addItem, apply discount, navigate', async () => {
    setCart('b1', [cartItem(ELIGIBLE_PRODUCT_ID)]);
    const { getByText } = await renderWithProviders(<RewardsScreen />);

    fireEvent.press(getByText('Redeem'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(tabs)/cart'));
    expect(addItemMock).not.toHaveBeenCalled();
    expect(applyDiscountMock).toHaveBeenCalledTimes(1);
  });

  // AC5 — eligible item absent from branch menu → error toast, stay, no addItem/navigate.
  test('AC5: eligible item absent from menu → error toast, stay on screen', async () => {
    setCart('b1', []);
    mockUseMenu.mockReturnValue(asQuery(menuWithoutEligible()));
    const { getByText, findByText } = await renderWithProviders(<RewardsScreen />);

    fireEvent.press(getByText('Redeem'));

    expect(await findByText(/isn't available at your current branch/i)).toBeTruthy();
    expect(addItemMock).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(applyDiscountMock).not.toHaveBeenCalled();
  });

  // AC6 — reward with null eligibleProductId → no auto-add, existing apply path runs, no crash.
  test('AC6: eligibleProductId null → no addItem, resolveAndApplyDeal invoked, navigate', async () => {
    const nullReward = reward({ eligibleProductId: null });
    mockUseRewardsSummary.mockReturnValue(
      asQuery({ ...summary, reward: nullReward } satisfies RewardsSummary),
    );
    mockUseAvailableRewards.mockReturnValue(asQuery([nullReward]));
    setCart('b1', []);
    const { getByText } = await renderWithProviders(<RewardsScreen />);

    fireEvent.press(getByText('Redeem'));

    await waitFor(() => expect(mockResolveAndApplyDeal).toHaveBeenCalledTimes(1));
    expect(addItemMock).not.toHaveBeenCalled();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(tabs)/cart'));
  });

  // AC7 — Redeem button disabled while in-flight, re-enabled on completion.
  test('AC7: Redeem button disabled while in-flight, re-enabled on completion', async () => {
    setCart('b1', []);
    // Hold the apply promise open so we can observe the pending (disabled) state.
    let release!: () => void;
    mockResolveAndApplyDeal.mockReturnValue(
      new Promise((resolve) => {
        release = () =>
          resolve({
            ok: true,
            discount: { source: 'reward', refId: REWARD_ID, label: 'Free Fries', amountCents: 500 },
          } as never);
      }) as never,
    );

    const { getByRole, queryByRole } = await renderWithProviders(<RewardsScreen />);

    // Idle: the Redeem button is enabled and pressable.
    expect(queryByRole('button', { name: 'Redeem', disabled: true })).toBeNull();
    fireEvent.press(getByRole('button', { name: 'Redeem' }));

    // Pending: the Redeem button now reports accessibilityState.disabled === true.
    await waitFor(() =>
      expect(getByRole('button', { name: 'Redeem', disabled: true })).toBeTruthy(),
    );

    release();

    // After resolution, navigation fired and the lock is released (button re-enabled).
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(tabs)/cart'));
    await waitFor(() =>
      expect(queryByRole('button', { name: 'Redeem', disabled: true })).toBeNull(),
    );
  });
});

/**
 * A7 (AC19/AC20) — star-history rows link back to the order that earned them.
 *
 * `StarTransaction` carries only a raw `orderId` UUID (no order number), so the
 * visible reference is a "View order" affordance rather than the id itself.
 * Rows with a null `orderId` (manual adjustments / reversals) must render
 * neither the affordance nor a press handler — no dead link, no placeholder.
 */
function starTx(over: Partial<StarTransaction> = {}): StarTransaction {
  return {
    id: 'tx-1',
    userId: 'u1',
    orderId: 'order-abc',
    type: 'earned',
    stars: 5,
    description: 'Order JP-260722-0001',
    createdAt: '2026-07-22T10:00:00.000Z',
    ...over,
  };
}

describe('RewardsScreen — star-history order linkback (A7)', () => {
  test('AC19: an order-linked row renders a reference, is tappable, and navigates with the right id', async () => {
    setCart('b1');
    mockUseRewardsHistory.mockReturnValue(asQuery({ transactions: [starTx()], nextCursor: null }));

    const { getByText, getByLabelText } = await renderWithProviders(<RewardsScreen />);

    // Visible reference to the source order.
    expect(getByText('View order')).toBeTruthy();

    // Tappable, and it routes to that exact order's tracking screen.
    const row = getByLabelText('View order for Order JP-260722-0001');
    await fireEvent.press(row);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/tracking',
      params: { orderId: 'order-abc' },
    });
  });

  test('AC20: a null-orderId row renders no reference and is not tappable', async () => {
    setCart('b1');
    mockUseRewardsHistory.mockReturnValue(
      asQuery({
        transactions: [
          starTx({ id: 'tx-2', orderId: null, description: 'Manual adjustment', stars: -3 }),
        ],
        nextCursor: null,
      }),
    );

    const { queryByText, queryByLabelText } = await renderWithProviders(<RewardsScreen />);

    // The row itself still renders...
    expect(queryByText('Manual adjustment')).not.toBeNull();
    // ...but with no order affordance and no press target.
    expect(queryByText('View order')).toBeNull();
    expect(queryByLabelText(/^View order for/)).toBeNull();
  });

  test('AC19/AC20: a mixed list links only the rows that have a source order', async () => {
    setCart('b1');
    mockUseRewardsHistory.mockReturnValue(
      asQuery({
        transactions: [
          starTx({ id: 'tx-1', orderId: 'order-abc', description: 'Order one' }),
          starTx({ id: 'tx-2', orderId: null, description: 'Manual adjustment' }),
          starTx({ id: 'tx-3', orderId: 'order-xyz', description: 'Order three' }),
        ],
        nextCursor: null,
      }),
    );

    const { queryAllByText, getByLabelText } = await renderWithProviders(<RewardsScreen />);

    // Exactly the two order-backed rows carry the affordance.
    expect(queryAllByText('View order')).toHaveLength(2);

    // And each links to its OWN order, not the first one's.
    await fireEvent.press(getByLabelText('View order for Order three'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/tracking',
      params: { orderId: 'order-xyz' },
    });
  });
});
