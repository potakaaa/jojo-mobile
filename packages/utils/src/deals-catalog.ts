import type { Deal } from '@jojopotato/types';

/**
 * Server-side static deal catalog (STAR-004, relocated from the mobile mock).
 *
 * Deals are NOT DB-backed this round (the `deals`/`deal_products`/`deal_branches`
 * tables exist but are intentionally NOT wired — see the STAR-004 plan CAUTION-2).
 * This module is the single shared source of truth for deal-code apply, consumed
 * by BOTH the server route (`packages/api` `POST /coupons/apply` + the `POST
 * /orders` extension) and — for presentation only — the mobile deals screens.
 *
 * ID-SPACE NOTE (load-bearing): unlike the original mobile mock, deal product /
 * branch restrictions here are keyed by SLUG, not by UUID. Seeded product/branch
 * ids are random UUIDs (`defaultRandom()`), so a static module cannot hold real
 * ids, and `packages/utils` cannot read the DB. The consuming server route
 * resolves these slugs → real seeded UUIDs at request time (via a DB slug lookup)
 * and builds a `Deal` with the concrete id arrays before running eligibility.
 * This is why the original mobile mock's disconnected mock-id restrictions
 * (`fries-classic`, `MOCK_CART_BRANCH.id`) are re-keyed here to real seed slugs
 * (`classic-fries`, `jojo-centrio`, …) matching each deal's original intent.
 */
export interface CatalogDeal extends Omit<
  Deal,
  'eligibleProductIds' | 'eligibleBranchIds' | 'discountLabel'
> {
  /** Product slugs (resolved to real product UUIDs server-side). Empty = all. */
  eligibleProductSlugs: string[];
  /** Branch slugs (resolved to real branch UUIDs server-side). Empty = any. */
  eligibleBranchSlugs: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY_MS).toISOString();
const daysAhead = (n: number) => new Date(now + n * DAY_MS).toISOString();

/** Base window shared by all currently-active catalog deals. */
const ACTIVE_WINDOW = { startAt: daysAgo(7), endAt: daysAhead(30) };

/**
 * The static deal catalog. Only deals carrying a `code` are reachable through
 * `POST /coupons/apply` (the code-entry path); the code-less entries are ported
 * for completeness/parity but are not reachable via the unified apply endpoint
 * (documented known limitation — see STAR-004 plan Step 1).
 *
 * Restrictions are re-keyed to REAL seed slugs (never mock ids):
 *   - `BGC50` (branch-exclusive fixed discount) → `jojo-centrio`, the seed's
 *     designated branch-exclusive branch (seed "Branch-exclusive opening promo").
 *   - BOGO fries → `classic-fries`; free lemonade → `lemonade` (real seed slugs).
 */
export const DEAL_CATALOG: CatalogDeal[] = [
  {
    id: 'deal-welcome-20',
    title: 'Welcome 20% Off',
    description: 'Enjoy 20% off your first order, any branch, any item.',
    dealType: 'percentage_discount',
    discountValue: 20, // percent
    minimumOrderAmount: 0,
    ...ACTIVE_WINDOW,
    isActive: true,
    eligibleProductSlugs: [],
    eligibleBranchSlugs: [],
    code: 'WELCOME20',
  },
  {
    id: 'deal-bgc-50',
    title: '₱50 Off (Branch Exclusive)',
    description: 'Flat ₱50 off orders at our branch-exclusive location.',
    dealType: 'fixed_discount',
    discountValue: 5000, // ₱50.00 in cents
    minimumOrderAmount: 0,
    ...ACTIVE_WINDOW,
    isActive: true,
    eligibleProductSlugs: [],
    eligibleBranchSlugs: ['jojo-centrio'],
    code: 'BGC50',
  },
  {
    id: 'deal-bogo-fries',
    title: 'BOGO Classic Fries',
    description: 'Buy one Classic Fries, get one free.',
    dealType: 'buy_one_take_one',
    discountValue: 0,
    minimumOrderAmount: 0,
    ...ACTIVE_WINDOW,
    isActive: true,
    eligibleProductSlugs: ['classic-fries'],
    eligibleBranchSlugs: [],
  },
  {
    id: 'deal-free-lemonade',
    title: 'Free Lemonade',
    description: 'Spend ₱500 and get a free Lemonade.',
    dealType: 'free_item',
    discountValue: 0,
    minimumOrderAmount: 50000, // ₱500.00 in cents
    ...ACTIVE_WINDOW,
    isActive: true,
    eligibleProductSlugs: ['lemonade'],
    eligibleBranchSlugs: [],
  },
  {
    id: 'deal-size-upgrade',
    title: 'Free Size Upgrade',
    description: 'One free size upgrade per member.',
    dealType: 'free_upgrade',
    discountValue: 0,
    minimumOrderAmount: 0,
    ...ACTIVE_WINDOW,
    isActive: true,
    usageLimitPerUser: 1,
    eligibleProductSlugs: [],
    eligibleBranchSlugs: [],
  },
  {
    id: 'deal-summer-bundle',
    title: 'Summer Snack Bundle',
    description: 'Bundle deal from last season — no longer available.',
    dealType: 'bundle',
    discountValue: 0,
    minimumOrderAmount: 0,
    startAt: daysAgo(60),
    endAt: daysAgo(30),
    isActive: true,
    eligibleProductSlugs: [],
    eligibleBranchSlugs: [],
  },
];

/**
 * Build a concrete `Deal` (with resolved UUID restriction arrays) from a
 * `CatalogDeal` + the real product/branch ids the consuming server route looked
 * up by slug. `discountLabel` is not needed for eligibility/discount math, so a
 * placeholder empty string is fine here.
 */
export function catalogDealToDeal(
  deal: CatalogDeal,
  eligibleProductIds: string[],
  eligibleBranchIds: string[],
): Deal {
  return {
    id: deal.id,
    title: deal.title,
    description: deal.description,
    discountLabel: '',
    imageUrl: deal.imageUrl,
    validUntil: deal.validUntil,
    dealType: deal.dealType,
    discountValue: deal.discountValue,
    minimumOrderAmount: deal.minimumOrderAmount,
    startAt: deal.startAt,
    endAt: deal.endAt,
    isActive: deal.isActive,
    usageLimitPerUser: deal.usageLimitPerUser,
    totalUsageLimit: deal.totalUsageLimit,
    code: deal.code,
    eligibleProductIds,
    eligibleBranchIds,
  };
}

/** Resolve a code (case-insensitive) to a catalog deal, or `undefined`. */
export function findCatalogDealByCode(code: string): CatalogDeal | undefined {
  const normalized = code.trim().toUpperCase();
  return DEAL_CATALOG.find((d) => d.code?.toUpperCase() === normalized);
}
