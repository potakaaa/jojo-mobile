/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies and the
   getSession stub are loosely typed at the test boundary; assertions narrow them. */
import type { AddressInfo } from 'node:net';

import { and, eq } from 'drizzle-orm';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the STAR-004 coupon routes (`POST /coupons/apply` +
 * `GET /coupons`).
 *
 * Hermetic + self-seeding (mirrors orders.test.ts): seeds its OWN users / branch /
 * product / options / availability / reward / coupons and cleans them up in
 * afterAll. Auth is stubbed at the `auth.api.getSession` seam (an `x-test-user`
 * header selects the caller). Run against a real local Postgres:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
 *
 * Covers AC1 (GET /coupons scoping + code field), AC2 (apply success + the three
 * rejections), AC3 (ported deal code succeeds through the unified path), AC4 (zero
 * mutation on apply), AC7 (null-eligible reject at APPLY — the apply half of the
 * defense-in-depth pair; the placement half is in orders.test.ts).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';

type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');

let db: DbModule['db'];
let schema: SchemaModule;
let base: string;
let server: ReturnType<express.Express['listen']>;

const uid = () => Math.random().toString(36).slice(2, 10);

// Fixtures.
let userA: string;
let userB: string;
let branchId: string;
let productId: string;
let rewardWithProductId: string;
let rewardNullEligibleId: string;
const createdUserIds: string[] = [];

// Coupon codes we control (so we can apply them by value).
const REWARD_CODE_A = `JP-RWD-A${uid().slice(0, 3).toUpperCase()}`;
const REWARD_CODE_NULL = `JP-RWD-N${uid().slice(0, 3).toUpperCase()}`;
const REWARD_CODE_B = `JP-RWD-B${uid().slice(0, 3).toUpperCase()}`; // userB's, for scoping

// Offer-coupon fixtures (ADM-008). Cleaned up (incl. the bulk user_id NULL row)
// in afterAll by offer_id, then the parent offers.
let activeOfferId: string;
let expiredOfferId: string;
// ADM-008 Fix 6 (P1): free-mechanic offers with NO benefit_product_id (the legacy
// unconfigured state) — coupons against them must be rejected at apply, not burned.
let unconfiguredFreeItemOfferId: string;
let unconfiguredFreeUpgradeOfferId: string;
const seededOfferIds: string[] = [];
const OFFER_BULK = `JP-OFR-B${uid().slice(0, 3).toUpperCase()}`; // user_id NULL
const OFFER_TARGETED = `JP-OFR-T${uid().slice(0, 3).toUpperCase()}`; // user_id = userA (LD1 fix)
const OFFER_EXPIRED = `JP-OFR-E${uid().slice(0, 3).toUpperCase()}`; // status expired
const OFFER_USED = `JP-OFR-U${uid().slice(0, 3).toUpperCase()}`; // status used
const OFFER_WINDOW = `JP-OFR-W${uid().slice(0, 3).toUpperCase()}`; // offer out of window
// Targeted to userA against unconfigured free_item / free_upgrade offers (P1 guard).
const OFFER_FI_UNCONFIG = `JP-OFR-FI${uid().slice(0, 2).toUpperCase()}`;
const OFFER_FU_UNCONFIG = `JP-OFR-FU${uid().slice(0, 2).toUpperCase()}`;
// ADM-008 P1b widened deny-guard fixtures (all targeted to userA): the two
// permanently-denied mechanics (b1t1/bundle), the two CONFIGURED free mechanics
// (non-null benefit_product_id — the finding-2 window-hole lock), and one
// fixed_discount offer coupon (finding-4 exact-cents guard-restructure insurance).
let cheapProductId: string; // 300c second line — proves no cheapest-line leak
let b1t1OfferId: string;
let bundleOfferId: string;
let configuredFreeItemOfferId: string;
let configuredFreeUpgradeOfferId: string;
let fixedOfferId: string;
const OFFER_B1T1 = `JP-OFR-BT${uid().slice(0, 2).toUpperCase()}`;
const OFFER_BUNDLE = `JP-OFR-BN${uid().slice(0, 2).toUpperCase()}`;
const OFFER_FI_CONFIG = `JP-OFR-FC${uid().slice(0, 2).toUpperCase()}`;
const OFFER_FU_CONFIG = `JP-OFR-UC${uid().slice(0, 2).toUpperCase()}`;
const OFFER_FIXED = `JP-OFR-FX${uid().slice(0, 2).toUpperCase()}`;
// ADM-008 P2 free-mechanic redemption fixtures: a product WITH a paid size upgrade
// (for the free_upgrade exact-cents success) + a free_upgrade offer configured to it.
let sizedProductId: string;
let sizedSizeOptionId: string;
let fuSizedOfferId: string;
const OFFER_FU_SIZED = `JP-OFR-FS${uid().slice(0, 2).toUpperCase()}`;
// ADM-008 Fix 6 F1: zero-redeemable-value percentage/fixed offers (legacy/SQL-only,
// bypass admin Zod). A percentage with discount_value 0, a fixed with NULL, and a
// micro-percentage that rounds to 0 on the 500c subtotal — all must reject (no burn),
// never resolve ok for zero benefit.
let zeroPercentOfferId: string;
let nullFixedOfferId: string;
let microPercentOfferId: string;
const OFFER_PCT_ZERO = `JP-OFR-PZ${uid().slice(0, 2).toUpperCase()}`;
const OFFER_FIXED_NULL = `JP-OFR-XN${uid().slice(0, 2).toUpperCase()}`;
const OFFER_PCT_MICRO = `JP-OFR-PM${uid().slice(0, 2).toUpperCase()}`;

async function post(
  path: string,
  opts: { user?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.user) headers['x-test-user'] = opts.user;
  const res = await fetch(base + path, {
    method: 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function get(
  path: string,
  opts: { user?: string } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (opts.user) headers['x-test-user'] = opts.user;
  const res = await fetch(base + path, { headers });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Apply-request cart with the seeded product (no options → unit = base price). */
function cartWith(productIdInCart: string, quantity = 1) {
  return {
    code: '',
    pickupBranchId: branchId,
    cartItems: [{ productId: productIdInCart, quantity }],
  };
}

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  const { couponsRouter } = await import('../coupons');
  const { requireSession } = await import('../../middleware/require-session');
  const { auth } = await import('../../lib/auth');

  vi.spyOn(auth.api, 'getSession').mockImplementation((async ({ headers }: any) => {
    const id = headers.get('x-test-user');
    if (!id) return null;
    return { session: { id: `sess-${id}`, userId: id }, user: { id } };
  }) as any);

  const app = express();
  app.use(express.json());
  app.use('/coupons', requireSession, couponsRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const suffix = uid();

  const [ua] = await db
    .insert(schema.users)
    .values({ name: 'Coupon A', email: `cpn-a-${suffix}@example.com` })
    .returning();
  userA = ua!.id;
  const [ub] = await db
    .insert(schema.users)
    .values({ name: 'Coupon B', email: `cpn-b-${suffix}@example.com` })
    .returning();
  userB = ub!.id;
  createdUserIds.push(userA, userB);

  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `CpnBranch ${suffix}`,
      slug: `cpn-branch-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000090',
      opening_hours: '08:00-20:00',
      estimated_prep_minutes: 15,
    })
    .returning();
  branchId = branch!.id;

  const [category] = await db
    .insert(schema.categories)
    .values({ name: `CpnCat ${suffix}`, slug: `cpn-cat-${suffix}`, sort_order: 1 })
    .returning();

  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: category!.id,
      name: `CpnFries ${suffix}`,
      slug: `cpn-fries-${suffix}`,
      base_price: '5.00',
    })
    .returning();
  productId = product!.id;

  await db
    .insert(schema.branchProductAvailability)
    .values({ branch_id: branchId, product_id: productId, is_available: true });

  // ADM-008 P1b: a cheaper (300c) second product available at the same branch, for
  // TWO-LINE-cart deny fixtures (finding 5). Paired with the 500c seeded product,
  // the cheapest-line mis-discount — absent the P1b guard — would leak 300c.
  const [cheapProduct] = await db
    .insert(schema.products)
    .values({
      category_id: category!.id,
      name: `CpnCheap ${suffix}`,
      slug: `cpn-cheap-${suffix}`,
      base_price: '3.00',
    })
    .returning();
  cheapProductId = cheapProduct!.id;
  await db
    .insert(schema.branchProductAvailability)
    .values({ branch_id: branchId, product_id: cheapProductId, is_available: true });

  // Reward bound to the product (redeemable) + a reward with NO eligible product.
  const [rewardWithProduct] = await db
    .insert(schema.rewards)
    .values({
      name: `Free CpnFries ${suffix}`,
      required_stars: 5,
      reward_type: 'free_item',
      eligible_product_id: productId,
    })
    .returning();
  rewardWithProductId = rewardWithProduct!.id;

  const [rewardNull] = await db
    .insert(schema.rewards)
    .values({
      name: `Broken Reward ${suffix}`,
      required_stars: 5,
      reward_type: 'free_item',
      eligible_product_id: null,
    })
    .returning();
  rewardNullEligibleId = rewardNull!.id;

  // Coupons: userA holds a valid reward coupon + a null-eligible reward coupon;
  // userB holds its own reward coupon (used only for the scoping assertion).
  await db.insert(schema.coupons).values([
    { user_id: userA, reward_id: rewardWithProductId, code: REWARD_CODE_A },
    { user_id: userA, reward_id: rewardNullEligibleId, code: REWARD_CODE_NULL },
    { user_id: userB, reward_id: rewardWithProductId, code: REWARD_CODE_B },
  ]);

  // Offer-coupon fixtures (ADM-008): an active agnostic 20%-off offer + an
  // out-of-window offer, plus coupons exercising bulk / targeted / status / window.
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const nowMs = Date.now();
  const [activeOffer] = await db
    .insert(schema.offers)
    .values({
      title: `ActiveOffer ${suffix}`,
      deal_type: 'percentage_discount',
      discount_value: '20.00',
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  activeOfferId = activeOffer!.id;
  const [expiredOffer] = await db
    .insert(schema.offers)
    .values({
      title: `ExpiredOffer ${suffix}`,
      deal_type: 'percentage_discount',
      discount_value: '20.00',
      start_at: new Date(nowMs - 2 * DAY),
      end_at: new Date(nowMs - DAY),
      is_active: true,
    })
    .returning();
  expiredOfferId = expiredOffer!.id;

  // ADM-008 Fix 6 (P1): free_item / free_upgrade offers with benefit_product_id
  // left NULL (the legacy unconfigured state). In-window + branch-agnostic +
  // no minimum, so checkDealEligibility PASSES for a cart holding the seeded
  // product — the P1 guard is what rejects them, proving it fires AFTER
  // eligibility rather than the coupon slipping through to the cheapest-line
  // mis-discount.
  const [freeItemOffer] = await db
    .insert(schema.offers)
    .values({
      title: `FreeItemUnconfig ${suffix}`,
      deal_type: 'free_item',
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  unconfiguredFreeItemOfferId = freeItemOffer!.id;
  const [freeUpgradeOffer] = await db
    .insert(schema.offers)
    .values({
      title: `FreeUpgradeUnconfig ${suffix}`,
      deal_type: 'free_upgrade',
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  unconfiguredFreeUpgradeOfferId = freeUpgradeOffer!.id;

  // ADM-008 P1b: the four cheapest-line-vulnerable mechanics as offer coupons —
  // all in-window + branch-agnostic + no minimum so checkDealEligibility PASSES and
  // the P1b guard is provably what rejects. b1t1/bundle are PERMANENTLY denied;
  // the two free mechanics are CONFIGURED (non-null benefit_product_id) to lock the
  // finding-2 window hole (P1 admitted a configured free offer; P1b denies it).
  const [b1t1Offer] = await db
    .insert(schema.offers)
    .values({
      title: `B1T1 ${suffix}`,
      deal_type: 'buy_one_take_one',
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  b1t1OfferId = b1t1Offer!.id;
  const [bundleOffer] = await db
    .insert(schema.offers)
    .values({
      title: `Bundle ${suffix}`,
      deal_type: 'bundle',
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  bundleOfferId = bundleOffer!.id;
  const [configuredFreeItemOffer] = await db
    .insert(schema.offers)
    .values({
      title: `FreeItemConfig ${suffix}`,
      deal_type: 'free_item',
      benefit_product_id: productId,
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  configuredFreeItemOfferId = configuredFreeItemOffer!.id;
  const [configuredFreeUpgradeOffer] = await db
    .insert(schema.offers)
    .values({
      title: `FreeUpgradeConfig ${suffix}`,
      deal_type: 'free_upgrade',
      benefit_product_id: productId,
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  configuredFreeUpgradeOfferId = configuredFreeUpgradeOffer!.id;
  // fixed_discount offer — finding-4 exact-cents insurance (the guard restructure
  // must NOT perturb the fixed_discount fall-through). ₱3.00 = 300c.
  const [fixedOffer] = await db
    .insert(schema.offers)
    .values({
      title: `FixedOffer ${suffix}`,
      deal_type: 'fixed_discount',
      discount_value: '3.00',
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  fixedOfferId = fixedOffer!.id;

  // ADM-008 P2: a product carrying a paid size upgrade (+2.00 = 200c) + a
  // free_upgrade offer configured to it, for the exact size-delta success path.
  const [sizedProduct] = await db
    .insert(schema.products)
    .values({
      category_id: category!.id,
      name: `CpnSized ${suffix}`,
      slug: `cpn-sized-${suffix}`,
      base_price: '4.00',
    })
    .returning();
  sizedProductId = sizedProduct!.id;
  await db
    .insert(schema.branchProductAvailability)
    .values({ branch_id: branchId, product_id: sizedProductId, is_available: true });
  const [sizeOption] = await db
    .insert(schema.productOptions)
    .values({
      product_id: sizedProductId,
      option_type: 'size',
      name: 'Large',
      price_delta: '2.00',
      sort_order: 1,
    })
    .returning();
  sizedSizeOptionId = sizeOption!.id;
  const [fuSizedOffer] = await db
    .insert(schema.offers)
    .values({
      title: `FreeUpgradeSized ${suffix}`,
      deal_type: 'free_upgrade',
      benefit_product_id: sizedProductId,
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  fuSizedOfferId = fuSizedOffer!.id;

  // ADM-008 Fix 6 F1: zero-redeemable-value percentage/fixed offers. All in-window,
  // branch-agnostic, no minimum → checkDealEligibility PASSES, so the F1 amount<=0
  // guard is provably what rejects them (AFTER eligibility, deterministic ordering).
  const [zeroPercentOffer] = await db
    .insert(schema.offers)
    .values({
      title: `ZeroPercent ${suffix}`,
      deal_type: 'percentage_discount',
      discount_value: '0.00',
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  zeroPercentOfferId = zeroPercentOffer!.id;
  const [nullFixedOffer] = await db
    .insert(schema.offers)
    .values({
      // discount_value left NULL (omitted) — serializeDeal maps NULL → 0.
      title: `NullFixed ${suffix}`,
      deal_type: 'fixed_discount',
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  nullFixedOfferId = nullFixedOffer!.id;
  const [microPercentOffer] = await db
    .insert(schema.offers)
    .values({
      // 0.05% of the 500c subtotal = 0.25c → Math.round → 0 → reject (F1).
      title: `MicroPercent ${suffix}`,
      deal_type: 'percentage_discount',
      discount_value: '0.05',
      start_at: new Date(nowMs - HOUR),
      end_at: new Date(nowMs + DAY),
      is_active: true,
    })
    .returning();
  microPercentOfferId = microPercentOffer!.id;

  seededOfferIds.push(
    zeroPercentOfferId,
    nullFixedOfferId,
    microPercentOfferId,
    activeOfferId,
    expiredOfferId,
    unconfiguredFreeItemOfferId,
    unconfiguredFreeUpgradeOfferId,
    b1t1OfferId,
    bundleOfferId,
    configuredFreeItemOfferId,
    configuredFreeUpgradeOfferId,
    fixedOfferId,
    fuSizedOfferId,
  );

  await db.insert(schema.coupons).values([
    // Bulk (user_id NULL) — claimable by anyone at apply preview.
    { user_id: null, offer_id: activeOfferId, code: OFFER_BULK },
    // Targeted to userA — the LD1 Branch-1 regression case (must NOT match the
    // reward branch and be wrongly rejected).
    { user_id: userA, offer_id: activeOfferId, code: OFFER_TARGETED },
    // Targeted, coupon-status expired / used.
    { user_id: userA, offer_id: activeOfferId, code: OFFER_EXPIRED, status: 'expired' },
    { user_id: userA, offer_id: activeOfferId, code: OFFER_USED, status: 'used' },
    // Targeted, but the OFFER itself is out of window (not_in_window).
    { user_id: userA, offer_id: expiredOfferId, code: OFFER_WINDOW },
    // ADM-008 Fix 6 (P1): targeted coupons against the two unconfigured
    // free-mechanic offers — must be rejected at apply and stay available.
    { user_id: userA, offer_id: unconfiguredFreeItemOfferId, code: OFFER_FI_UNCONFIG },
    { user_id: userA, offer_id: unconfiguredFreeUpgradeOfferId, code: OFFER_FU_UNCONFIG },
    // ADM-008 P1b: targeted coupons against the widened-deny mechanics.
    { user_id: userA, offer_id: b1t1OfferId, code: OFFER_B1T1 },
    { user_id: userA, offer_id: bundleOfferId, code: OFFER_BUNDLE },
    { user_id: userA, offer_id: configuredFreeItemOfferId, code: OFFER_FI_CONFIG },
    { user_id: userA, offer_id: configuredFreeUpgradeOfferId, code: OFFER_FU_CONFIG },
    { user_id: userA, offer_id: fixedOfferId, code: OFFER_FIXED },
    { user_id: userA, offer_id: fuSizedOfferId, code: OFFER_FU_SIZED },
    // ADM-008 Fix 6 F1: zero-redeemable-value percentage/fixed offer coupons.
    { user_id: userA, offer_id: zeroPercentOfferId, code: OFFER_PCT_ZERO },
    { user_id: userA, offer_id: nullFixedOfferId, code: OFFER_FIXED_NULL },
    { user_id: userA, offer_id: microPercentOfferId, code: OFFER_PCT_MICRO },
  ]);
});

afterAll(async () => {
  const { inArray } = await import('drizzle-orm');
  // Offer-coupons (incl. the bulk user_id NULL row) — delete by offer_id first,
  // then the parent offers (coupons.offer_id FK).
  await db.delete(schema.coupons).where(inArray(schema.coupons.offer_id, seededOfferIds));
  await db.delete(schema.coupons).where(inArray(schema.coupons.user_id, createdUserIds));
  await db.delete(schema.offers).where(inArray(schema.offers.id, seededOfferIds));
  await db
    .delete(schema.branchProductAvailability)
    .where(eq(schema.branchProductAvailability.branch_id, branchId));
  await db
    .delete(schema.rewards)
    .where(inArray(schema.rewards.id, [rewardWithProductId, rewardNullEligibleId]));
  await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
  vi.restoreAllMocks();
  server?.close();
});

describe('GET /coupons — AC1', () => {
  it("returns only the caller's own coupons, code field present", async () => {
    const res = await get('/coupons', { user: userA });
    expect(res.status).toBe(200);
    const codes = res.json.coupons.map((c: any) => c.code);
    expect(codes).toContain(REWARD_CODE_A);
    expect(codes).toContain(REWARD_CODE_NULL);
    // userB's coupon must never appear.
    expect(codes).not.toContain(REWARD_CODE_B);
    expect(res.json.coupons.every((c: any) => c.userId === userA)).toBe(true);
    // Reward-backed coupons carry a light reward label.
    const rewardCoupon = res.json.coupons.find((c: any) => c.code === REWARD_CODE_A);
    expect(rewardCoupon.reward).not.toBeNull();
    expect(rewardCoupon.reward.requiredStars).toBe(5);
  });

  it('401s without a session', async () => {
    const res = await get('/coupons');
    expect(res.status).toBe(401);
  });
});

describe('POST /coupons/apply — AC2 (reward)', () => {
  it('succeeds for a valid reward code with the eligible item in cart', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: { ...cartWith(productId), code: REWARD_CODE_A },
    });
    expect(res.status).toBe(200);
    expect(res.json.discount.source).toBe('reward');
    expect(res.json.discount.amountCents).toBe(500); // base 5.00, one free unit
  });

  it('rejects a reward code whose reward has a null eligible_product_id (AC7 apply half)', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: { ...cartWith(productId), code: REWARD_CODE_NULL },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('no_eligible_product');
  });

  it('rejects when the eligible item is not in the cart', async () => {
    // Cart contains a valid product line, but not the reward's bound product.
    // Use a throwaway product id that is not in cart by sending an empty-eligible
    // scenario: the reward's product is `productId`; send a DIFFERENT (unknown to
    // cart) product is impossible without a 2nd product, so instead send a cart
    // WITHOUT the eligible product by using quantity on a non-matching path — we
    // seed a second product line inline.
    const suffix = uid();
    const [cat2] = await db
      .insert(schema.categories)
      .values({ name: `CpnCat2 ${suffix}`, slug: `cpn-cat2-${suffix}`, sort_order: 2 })
      .returning();
    const [p2] = await db
      .insert(schema.products)
      .values({
        category_id: cat2!.id,
        name: `Other ${suffix}`,
        slug: `cpn-other-${suffix}`,
        base_price: '3.00',
      })
      .returning();
    await db
      .insert(schema.branchProductAvailability)
      .values({ branch_id: branchId, product_id: p2!.id, is_available: true });

    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: REWARD_CODE_A,
        pickupBranchId: branchId,
        cartItems: [{ productId: p2!.id, quantity: 1 }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('not_in_cart');

    await db
      .delete(schema.branchProductAvailability)
      .where(eq(schema.branchProductAvailability.product_id, p2!.id));
    await db.delete(schema.products).where(eq(schema.products.id, p2!.id));
    await db.delete(schema.categories).where(eq(schema.categories.id, cat2!.id));
  });

  it('rejects an unknown code', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: { ...cartWith(productId), code: 'JP-RWD-NOPE' },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('not_found');
  });
});

// ADM-008: the static DEAL_CATALOG apply path (the old AC3 "WELCOME20" parity
// test) is RETIRED — deal codes now resolve against real DB-backed offer coupons.
describe('POST /coupons/apply — AC5/AC7 (offer coupon, ADM-008)', () => {
  it('succeeds for a bulk offer coupon (source deal, real discount)', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: { code: OFFER_BULK, pickupBranchId: branchId, cartItems: [{ productId, quantity: 2 }] },
    });
    expect(res.status).toBe(200);
    expect(res.json.discount.source).toBe('deal');
    // subtotal = 500 * 2 = 1000; 20% off = 200.
    expect(res.json.discount.amountCents).toBe(200);
  });

  it('succeeds for a TARGETED (user_id-set) offer coupon — LD1 Branch-1 fix regression', async () => {
    // Before the LD1 fix this matched reward Branch 1 (scoped only by code+user_id)
    // and was wrongly rejected with no_eligible_product (reward=null). With the
    // reward_id IS NOT NULL scoping it now falls through to the offer branch.
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_TARGETED,
        pickupBranchId: branchId,
        cartItems: [{ productId, quantity: 2 }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.discount.source).toBe('deal');
    expect(res.json.discount.amountCents).toBe(200);
  });

  it('rejects a targeted offer coupon for a non-owner (reason not_found)', async () => {
    const res = await post('/coupons/apply', {
      user: userB, // OFFER_TARGETED is owned by userA
      body: {
        code: OFFER_TARGETED,
        pickupBranchId: branchId,
        cartItems: [{ productId, quantity: 1 }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('not_found');
  });

  it('rejects an expired-status offer coupon (reason expired)', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_EXPIRED,
        pickupBranchId: branchId,
        cartItems: [{ productId, quantity: 1 }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('expired');
  });

  it('rejects a used-status offer coupon (reason already_used)', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: { code: OFFER_USED, pickupBranchId: branchId, cartItems: [{ productId, quantity: 1 }] },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('already_used');
  });

  it('rejects an offer coupon whose offer is out of window (reason not_in_window)', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_WINDOW,
        pickupBranchId: branchId,
        cartItems: [{ productId, quantity: 1 }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('not_in_window');
  });
});

// ADM-008 Fix 6 (P1): the interim + permanent guard. An offer coupon whose offer
// mechanic is free_item/free_upgrade but has no benefit product configured is
// rejected at apply — the legacy cheapest-line mis-discount can no longer occur,
// and (apply being zero-mutation) the coupon is never burned.
describe('POST /coupons/apply — AC1 unconfigured free-mechanic guard (ADM-008 Fix 6 P1)', () => {
  it('rejects an unconfigured free_item offer coupon (no_eligible_product), coupon untouched', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_FI_UNCONFIG,
        pickupBranchId: branchId,
        cartItems: [{ productId, quantity: 2 }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('no_eligible_product');
    expect(res.json.error).toBe('This offer is not configured for redemption.');
    // No discount leaked (the cheapest-line mis-discount never runs).
    expect(res.json.discount).toBeUndefined();

    const [coupon] = await db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.code, OFFER_FI_UNCONFIG));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
  });

  it('rejects an unconfigured free_upgrade offer coupon (no_eligible_product), coupon untouched', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_FU_UNCONFIG,
        pickupBranchId: branchId,
        cartItems: [{ productId, quantity: 2 }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('no_eligible_product');
    expect(res.json.error).toBe('This offer is not configured for redemption.');
    expect(res.json.discount).toBeUndefined();

    const [coupon] = await db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.code, OFFER_FU_UNCONFIG));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
  });
});

// ADM-008 P1b→P2: the PERMANENT deny half of the widened guard. buy_one_take_one /
// bundle have no coupon-redemption semantics ever, so they are denied at the
// resolver (b1t1/bundle deny survives P2 untouched). Two-line carts (finding 5)
// prove no cheapest-line discount leaks: absent the guard, computeDealDiscountCents
// would return the cheaper line's 300c. The CONFIGURED free-mechanic cases that P1b
// also denied now REDEEM under P2 — see the P2 configured-redemption block below.
// Every reject leaves the coupon `available` (apply is zero-mutation).
describe('POST /coupons/apply — P1b permanent deny-guard (ADM-008 Fix 6 P1b/P2)', () => {
  // Two-line cart: seeded product (500c) + cheaper product (300c). If the P1b guard
  // were removed, the cheapest-eligible-line path would leak a 300c discount.
  const twoLineCart = () => ({
    pickupBranchId: branchId,
    cartItems: [
      { productId, quantity: 1 },
      { productId: cheapProductId, quantity: 1 },
    ],
  });

  async function expectDenied(code: string): Promise<{ status: number; json: any }> {
    const res = await post('/coupons/apply', { user: userA, body: { ...twoLineCart(), code } });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('no_eligible_product');
    // No discount object at all → no cheapest-line (300c) leak.
    expect(res.json.discount).toBeUndefined();
    // Coupon untouched (apply is zero-mutation).
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
    return res;
  }

  it('denies a buy_one_take_one offer coupon (permanent), no cheapest-line leak', async () => {
    await expectDenied(OFFER_B1T1);
  });

  it('denies a bundle offer coupon (permanent), no cheapest-line leak', async () => {
    await expectDenied(OFFER_BUNDLE);
  });

  // finding 4 — fixed_discount offer-coupon exact-cents insurance: the guard
  // restructure must NOT perturb the fixed_discount fall-through path.
  it('still applies a fixed_discount offer coupon at exact cents (guard-restructure insurance)', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_FIXED,
        pickupBranchId: branchId,
        cartItems: [{ productId, quantity: 1 }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.discount.source).toBe('deal');
    // subtotal 500; fixed ₱3.00 = 300c; min(300, 500) = 300.
    expect(res.json.discount.amountCents).toBe(300);
  });
});

// ADM-008 P2: CONFIGURED free-mechanic redemption semantics at preview. free_item
// waives one unit of the BENEFIT product (reward math verbatim) — never the cheapest
// cart line; free_upgrade waives one unit's paid size-upgrade delta. Exact cents,
// reject on not_in_cart / no_upgrade_to_waive (never a ₱0-and-burn), apply
// zero-mutation. These REPLACE the P1b CONFIGURED-deny assertions (findings 1–5).
describe('POST /coupons/apply — P2 configured free-mechanic redemption (ADM-008 Fix 6 P2)', () => {
  async function couponStatus(code: string): Promise<string> {
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    return coupon!.status;
  }

  it('free_item waives the exact benefit-product unit price (AC2), NOT the cheapest cart line', async () => {
    // Two-line cart: benefit productId (500c) + cheaper product (300c). free_item
    // must waive the BENEFIT product's 500c, never the cheapest line's 300c.
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_FI_CONFIG,
        pickupBranchId: branchId,
        cartItems: [
          { productId, quantity: 1 },
          { productId: cheapProductId, quantity: 1 },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.discount.source).toBe('deal');
    expect(res.json.discount.amountCents).toBe(500);
    expect(res.json.discount.refId).toBe(configuredFreeItemOfferId);
    // AC9 wire-freeze: the AppliedDiscount shape is exactly {source, refId, label, amountCents}.
    expect(Object.keys(res.json.discount).sort()).toEqual([
      'amountCents',
      'label',
      'refId',
      'source',
    ]);
    // Apply is zero-mutation — the coupon stays available on success.
    expect(await couponStatus(OFFER_FI_CONFIG)).toBe('available');
  });

  it('free_item rejects when the benefit product is absent from the cart (AC4 not_in_cart)', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_FI_CONFIG,
        pickupBranchId: branchId,
        cartItems: [{ productId: cheapProductId, quantity: 1 }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('not_in_cart');
    expect(res.json.discount).toBeUndefined();
    expect(await couponStatus(OFFER_FI_CONFIG)).toBe('available');
  });

  it('free_upgrade waives the exact paid size-upgrade delta (AC5)', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_FU_SIZED,
        pickupBranchId: branchId,
        cartItems: [
          {
            productId: sizedProductId,
            quantity: 1,
            selectedOptions: [{ optionId: sizedSizeOptionId }],
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.discount.source).toBe('deal');
    expect(res.json.discount.amountCents).toBe(200); // +2.00 size delta
    expect(await couponStatus(OFFER_FU_SIZED)).toBe('available');
  });

  it('free_upgrade rejects when the benefit has no paid size upgrade (AC6 no_upgrade_to_waive, no ₱0-burn)', async () => {
    // OFFER_FU_CONFIG benefit = productId, which has NO size option — present but
    // nothing to waive → no_upgrade_to_waive, never a ₱0-and-burn success.
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_FU_CONFIG,
        pickupBranchId: branchId,
        cartItems: [{ productId, quantity: 1 }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('no_upgrade_to_waive');
    expect(res.json.discount).toBeUndefined();
    expect(await couponStatus(OFFER_FU_CONFIG)).toBe('available');
  });

  it('free_upgrade rejects when the benefit product is absent (AC4 not_in_cart)', async () => {
    const res = await post('/coupons/apply', {
      user: userA,
      body: {
        code: OFFER_FU_SIZED,
        pickupBranchId: branchId,
        cartItems: [{ productId, quantity: 1 }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('not_in_cart');
    expect(res.json.discount).toBeUndefined();
  });
});

// ADM-008 Fix 6 F1: a percentage/fixed offer coupon whose computed discount is <= 0
// (NULL/0/negative discount_value, or a percentage that rounds to zero on a small
// subtotal) must REJECT at preview — never resolve ok and burn for zero benefit. The
// reject lands AFTER checkDealEligibility (these offers all pass eligibility), so F1
// is provably the guard that fires. Apply is zero-mutation, so the coupon stays
// available.
describe('POST /coupons/apply — F1 zero-value discount offer reject (ADM-008 Fix 6)', () => {
  async function expectNoRedeemableValue(code: string): Promise<void> {
    const res = await post('/coupons/apply', {
      user: userA,
      body: { code, pickupBranchId: branchId, cartItems: [{ productId, quantity: 1 }] },
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('no_eligible_product');
    expect(res.json.error).toBe('This offer has no redeemable value.');
    expect(res.json.discount).toBeUndefined();
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    expect(coupon!.status).toBe('available');
    expect(coupon!.used_at).toBeNull();
  }

  it('rejects a percentage_discount offer with discount_value 0', async () => {
    await expectNoRedeemableValue(OFFER_PCT_ZERO);
  });

  it('rejects a fixed_discount offer with a NULL discount_value', async () => {
    await expectNoRedeemableValue(OFFER_FIXED_NULL);
  });

  it('rejects a percentage_discount that rounds to 0 on a micro subtotal', async () => {
    await expectNoRedeemableValue(OFFER_PCT_MICRO);
  });
});

describe('POST /coupons/apply — AC4 (zero mutation)', () => {
  it('performs no DB mutation on the coupons table', async () => {
    const before = await db
      .select()
      .from(schema.coupons)
      .where(and(eq(schema.coupons.code, REWARD_CODE_A), eq(schema.coupons.user_id, userA)));

    const res = await post('/coupons/apply', {
      user: userA,
      body: { ...cartWith(productId), code: REWARD_CODE_A },
    });
    expect(res.status).toBe(200);

    const after = await db
      .select()
      .from(schema.coupons)
      .where(and(eq(schema.coupons.code, REWARD_CODE_A), eq(schema.coupons.user_id, userA)));

    expect(after[0]!.status).toBe('available');
    expect(after[0]!.used_at).toBeNull();
    expect(after[0]!.status).toBe(before[0]!.status);
    expect(after[0]!.used_at).toEqual(before[0]!.used_at);
  });
});
