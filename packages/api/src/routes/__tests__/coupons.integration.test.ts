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
  seededOfferIds.push(
    activeOfferId,
    expiredOfferId,
    unconfiguredFreeItemOfferId,
    unconfiguredFreeUpgradeOfferId,
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
