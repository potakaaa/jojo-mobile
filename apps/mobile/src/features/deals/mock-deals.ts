/**
 * PLACEHOLDER / MOCK DATA — dev seed for the Deals feature (#22/#23/#24).
 *
 * There is no deals backend wired into `apps/mobile` yet (see
 * process/context/all-context.md Open Questions; server `deals` tables exist per
 * the db-schema plan but are not consumed here). Every value is typed against
 * the real `@jojopotato/types` `Deal` contract. `discountValue` /
 * `minimumOrderAmount` are CENTS (client convention — see the VALUE-UNIT NOTE on
 * `Deal`). `discountLabel` is derived via `deriveDiscountLabel` so it stays
 * consistent with `dealType`/`discountValue` instead of being hand-typed.
 * Replace with backend-backed data later.
 */
import type { Deal } from '@jojopotato/types';

import { MOCK_CART_BRANCH } from '@/features/cart/mock-cart';
import { MOCK_PRODUCTS } from '@/features/home/mock-home';
import { deriveDiscountLabel, type DealUsageRecord } from '@/features/deals/lib/eligibility';

/** Resolve a real catalog product id (falls back to the literal if renamed). */
const productId = (id: string): string => MOCK_PRODUCTS.find((p) => p.id === id)?.id ?? id;
const CLASSIC_FRIES_ID = productId('fries-classic');
const YUZU_LEMONADE_ID = productId('lemonade-yuzu');

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY_MS).toISOString();
const daysAhead = (n: number) => new Date(now + n * DAY_MS).toISOString();

/** Base window shared by all currently-active mock deals. */
const ACTIVE_WINDOW = { startAt: daysAgo(7), endAt: daysAhead(30) };

/**
 * Author a deal with a `deriveDiscountLabel`-consistent label so we never
 * hand-type a label that drifts from `dealType`/`discountValue`.
 */
function makeDeal(deal: Omit<Deal, 'discountLabel'>): Deal {
  return { ...deal, discountLabel: deriveDiscountLabel(deal as Deal) };
}

export const MOCK_DEALS: Deal[] = [
  // percentage_discount — branch-agnostic, no product restriction, has a code.
  makeDeal({
    id: 'deal-welcome-20',
    title: 'Welcome 20% Off',
    description: 'Enjoy 20% off your first order, any branch, any item.',
    dealType: 'percentage_discount',
    discountValue: 20, // percent
    minimumOrderAmount: 0,
    ...ACTIVE_WINDOW,
    isActive: true,
    eligibleProductIds: [],
    eligibleBranchIds: [],
    code: 'WELCOME20',
  }),
  // fixed_discount — branch-scoped to the cart's default branch.
  makeDeal({
    id: 'deal-bgc-50',
    title: '₱50 Off at BGC',
    description: 'Flat ₱50 off orders at our BGC branch.',
    dealType: 'fixed_discount',
    discountValue: 5000, // ₱50.00 in cents
    minimumOrderAmount: 0,
    ...ACTIVE_WINDOW,
    isActive: true,
    eligibleProductIds: [],
    eligibleBranchIds: [MOCK_CART_BRANCH.id],
    code: 'BGC50',
  }),
  // buy_one_take_one — restricted to specific products in the cart.
  makeDeal({
    id: 'deal-bogo-fries',
    title: 'BOGO Classic Fries',
    description: 'Buy one Classic Fries, get one free.',
    dealType: 'buy_one_take_one',
    discountValue: 0,
    minimumOrderAmount: 0,
    ...ACTIVE_WINDOW,
    isActive: true,
    eligibleProductIds: [CLASSIC_FRIES_ID],
    eligibleBranchIds: [],
  }),
  // free_item — high minimum order so it exercises `below_minimum_order`.
  makeDeal({
    id: 'deal-free-lemonade',
    title: 'Free Yuzu Lemonade',
    description: 'Spend ₱500 and get a free Yuzu Lemonade.',
    dealType: 'free_item',
    discountValue: 0,
    minimumOrderAmount: 50000, // ₱500.00 in cents (mock cart subtotal is ₱347)
    ...ACTIVE_WINDOW,
    isActive: true,
    eligibleProductIds: [YUZU_LEMONADE_ID],
    eligibleBranchIds: [],
  }),
  // free_upgrade — usage-limited per user (paired with MOCK_DEAL_USAGE below).
  makeDeal({
    id: 'deal-size-upgrade',
    title: 'Free Size Upgrade',
    description: 'One free size upgrade per member.',
    dealType: 'free_upgrade',
    discountValue: 0,
    minimumOrderAmount: 0,
    ...ACTIVE_WINDOW,
    isActive: true,
    usageLimitPerUser: 1,
    eligibleProductIds: [],
    eligibleBranchIds: [],
  }),
  // bundle — expired (endAt in the past): proves hidden-from-list + not_in_window.
  makeDeal({
    id: 'deal-summer-bundle',
    title: 'Summer Snack Bundle',
    description: 'Bundle deal from last season — no longer available.',
    dealType: 'bundle',
    discountValue: 0,
    minimumOrderAmount: 0,
    startAt: daysAgo(60),
    endAt: daysAgo(30),
    isActive: true,
    eligibleProductIds: [],
    eligibleBranchIds: [],
  }),
];

/**
 * Mock usage history. The `deal-size-upgrade` deal has `usageLimitPerUser: 1`
 * and a matching record here, so it resolves to `user_usage_limit_reached`.
 */
export const MOCK_DEAL_USAGE: DealUsageRecord[] = [
  { dealId: 'deal-size-upgrade', userId: 'mock-user' },
];
