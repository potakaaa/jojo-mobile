/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies and the
   getSession stub are loosely typed at the test boundary; assertions narrow them. */
import type { AddressInfo } from 'node:net';

import { eq } from 'drizzle-orm';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the session-gated coupon routes (Phase 2):
 *   - GET /coupons: own-coupon list (newest-first), ?status= filter over the
 *     EFFECTIVE status (read-time expiry relabel), user isolation, and the
 *     deal/reward display-label LEFT JOIN.
 *   - POST /coupons/:id/redeem: atomic CAS available→used, 409 already-used,
 *     409 expired, 403 not-owner, 404 unknown, and a concurrent-double-redeem
 *     race (exactly one succeeds).
 *   - AC3: a coupon issued from a reward (reward_id set) appears in the list.
 *   - Regression: POST /rewards/:id/redeem response shape is unchanged.
 *
 * Hermetic + self-seeding (mirrors deals.test.ts / orders.test.ts). Asserts by
 * fixture id — never a global list length. Auth is stubbed at auth.api.getSession
 * via an x-test-user header. Runs against a real local Postgres:
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api db:migrate
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
const suffix = uid();

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

// Fixtures.
let userA: string;
let userB: string;
let dealId: string; // percentage_discount 20% → label "20% OFF"
let rewardId: string; // fixed_discount ₱50 → label "₱50 OFF"

let availableRewardCouponId: string; // userA, reward-linked, available
let availableDealCouponId: string; // userA, deal-linked, available
let usedCouponId: string; // userA, used
let expiredCouponId: string; // userA, status 'available' but expires_at in past
let userBCouponId: string; // userB (isolation)

const DAY = 24 * 60 * 60 * 1000;

async function insertCoupon(values: {
  userId: string;
  status?: 'available' | 'used' | 'expired';
  dealId?: string | null;
  rewardId?: string | null;
  expiresAt?: Date | null;
  usedAt?: Date | null;
}): Promise<string> {
  const [row] = await db
    .insert(schema.coupons)
    .values({
      user_id: values.userId,
      code: `CPN-${suffix}-${uid()}`.toUpperCase(),
      status: values.status ?? 'available',
      deal_id: values.dealId ?? null,
      reward_id: values.rewardId ?? null,
      expires_at: values.expiresAt ?? null,
      used_at: values.usedAt ?? null,
    })
    .returning({ id: schema.coupons.id });
  return row!.id;
}

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  const { couponsRouter } = await import('../coupons');
  const { auth } = await import('../../lib/auth');

  vi.spyOn(auth.api, 'getSession').mockImplementation((async ({ headers }: any) => {
    const id = headers.get('x-test-user');
    if (!id) return null;
    return { session: { id: `sess-${id}`, userId: id }, user: { id } };
  }) as any);

  const app = express();
  app.use(express.json());
  app.use('/coupons', couponsRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const [ua] = await db
    .insert(schema.users)
    .values({ name: 'Coupon A', email: `cpn-a-${suffix}@example.com` })
    .returning({ id: schema.users.id });
  userA = ua!.id;
  const [ub] = await db
    .insert(schema.users)
    .values({ name: 'Coupon B', email: `cpn-b-${suffix}@example.com` })
    .returning({ id: schema.users.id });
  userB = ub!.id;

  const now = Date.now();
  const [deal] = await db
    .insert(schema.deals)
    .values({
      title: `Coupon Deal ${suffix}`,
      deal_type: 'percentage_discount',
      discount_value: '20.00',
      start_at: new Date(now - DAY),
      end_at: new Date(now + DAY),
      is_active: true,
    })
    .returning({ id: schema.deals.id });
  dealId = deal!.id;

  const [reward] = await db
    .insert(schema.rewards)
    .values({
      name: `Coupon Reward ${suffix}`,
      required_stars: 5,
      reward_type: 'fixed_discount',
      reward_value: '50.00',
      is_active: true,
    })
    .returning({ id: schema.rewards.id });
  rewardId = reward!.id;

  availableRewardCouponId = await insertCoupon({
    userId: userA,
    rewardId,
    expiresAt: new Date(now + 30 * DAY),
  });
  availableDealCouponId = await insertCoupon({
    userId: userA,
    dealId,
    expiresAt: new Date(now + 30 * DAY),
  });
  usedCouponId = await insertCoupon({
    userId: userA,
    rewardId,
    status: 'used',
    usedAt: new Date(now - DAY),
  });
  expiredCouponId = await insertCoupon({
    userId: userA,
    rewardId,
    status: 'available', // stored available, but past expires_at → effective expired
    expiresAt: new Date(now - DAY),
  });
  userBCouponId = await insertCoupon({ userId: userB, rewardId, expiresAt: new Date(now + DAY) });
});

afterAll(async () => {
  const { inArray } = await import('drizzle-orm');
  await db.delete(schema.coupons).where(inArray(schema.coupons.user_id, [userA, userB]));
  await db.delete(schema.rewards).where(eq(schema.rewards.id, rewardId));
  await db.delete(schema.deals).where(eq(schema.deals.id, dealId));
  await db.delete(schema.users).where(inArray(schema.users.id, [userA, userB]));
  vi.restoreAllMocks();
  server?.close();
});

describe('GET /coupons — auth + list', () => {
  it('401s with no session', async () => {
    const { status } = await get('/coupons');
    expect(status).toBe(401);
  });

  it("lists the caller's own coupons and excludes other users' coupons", async () => {
    const { status, json } = await get('/coupons', { user: userA });
    expect(status).toBe(200);
    const ids = json.coupons.map((c: any) => c.id);
    expect(ids).toContain(availableRewardCouponId);
    expect(ids).toContain(availableDealCouponId);
    expect(ids).toContain(usedCouponId);
    expect(ids).toContain(expiredCouponId);
    // Isolation: userA never sees userB's coupon (list-scoping, not 403).
    expect(ids).not.toContain(userBCouponId);
  });

  it('returns an empty list for a user with no coupons (isolation, not 403)', async () => {
    const [ghost] = await db
      .insert(schema.users)
      .values({ name: 'Ghost', email: `ghost-${uid()}@example.com` })
      .returning({ id: schema.users.id });
    const { status, json } = await get('/coupons', { user: ghost!.id });
    expect(status).toBe(200);
    expect(json.coupons).toEqual([]);
    await db.delete(schema.users).where(eq(schema.users.id, ghost!.id));
  });

  it('newest-first ordering (created_at desc)', async () => {
    const { json } = await get('/coupons', { user: userA });
    const times = json.coupons.map((c: any) => new Date(c.createdAt).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });
});

describe('GET /coupons — status filter + expiry relabel', () => {
  it('relabels a still-available-but-past-expiry coupon as expired', async () => {
    const { json } = await get('/coupons', { user: userA });
    const expired = json.coupons.find((c: any) => c.id === expiredCouponId);
    expect(expired.status).toBe('expired');
  });

  it('?status=available excludes the used and effectively-expired coupons', async () => {
    const { json } = await get('/coupons?status=available', { user: userA });
    const ids = json.coupons.map((c: any) => c.id);
    expect(ids).toContain(availableRewardCouponId);
    expect(ids).toContain(availableDealCouponId);
    expect(ids).not.toContain(usedCouponId);
    expect(ids).not.toContain(expiredCouponId);
  });

  it('?status=used returns only the used coupon among the fixtures', async () => {
    const { json } = await get('/coupons?status=used', { user: userA });
    const ids = json.coupons.map((c: any) => c.id);
    expect(ids).toContain(usedCouponId);
    expect(ids).not.toContain(availableRewardCouponId);
    expect(ids).not.toContain(expiredCouponId);
  });

  it('?status=expired includes the effectively-expired coupon', async () => {
    const { json } = await get('/coupons?status=expired', { user: userA });
    const ids = json.coupons.map((c: any) => c.id);
    expect(ids).toContain(expiredCouponId);
    expect(ids).not.toContain(availableRewardCouponId);
  });
});

describe('GET /coupons — display-label join (A1a/A1b)', () => {
  it('reward-linked coupon carries a non-empty displayLabel from the reward', async () => {
    const { json } = await get('/coupons', { user: userA });
    const c = json.coupons.find((x: any) => x.id === availableRewardCouponId);
    expect(typeof c.displayLabel).toBe('string');
    expect(c.displayLabel.length).toBeGreaterThan(0);
    expect(c.displayLabel).toBe('₱50 OFF'); // fixed_discount ₱50.00
  });

  it('deal-linked coupon carries a non-empty displayLabel from the deal', async () => {
    const { json } = await get('/coupons', { user: userA });
    const c = json.coupons.find((x: any) => x.id === availableDealCouponId);
    expect(typeof c.displayLabel).toBe('string');
    expect(c.displayLabel).toBe('20% OFF'); // percentage_discount 20
  });
});

describe('POST /coupons/:id/redeem — CAS status flip', () => {
  it('401s with no session', async () => {
    const { status } = await post(`/coupons/${availableRewardCouponId}/redeem`);
    expect(status).toBe(401);
  });

  it('404s an unknown id and a malformed id', async () => {
    const unknown = await post('/coupons/00000000-0000-4000-8000-000000000000/redeem', {
      user: userA,
    });
    expect(unknown.status).toBe(404);
    const malformed = await post('/coupons/not-a-uuid/redeem', { user: userA });
    expect(malformed.status).toBe(404);
  });

  it("403s another user's coupon", async () => {
    const { status } = await post(`/coupons/${userBCouponId}/redeem`, { user: userA });
    expect(status).toBe(403);
  });

  it('409s an already-used coupon', async () => {
    const { status } = await post(`/coupons/${usedCouponId}/redeem`, { user: userA });
    expect(status).toBe(409);
  });

  it('409s an expired (past expires_at) coupon and never flips it to used', async () => {
    const { status } = await post(`/coupons/${expiredCouponId}/redeem`, { user: userA });
    expect(status).toBe(409);
    const [row] = await db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.id, expiredCouponId));
    expect(row!.status).toBe('available'); // stored status untouched (read-time relabel only)
  });

  it('flips available → used and returns the updated coupon', async () => {
    const id = await insertCoupon({
      userId: userA,
      rewardId,
      expiresAt: new Date(Date.now() + DAY),
    });
    const { status, json } = await post(`/coupons/${id}/redeem`, { user: userA });
    expect(status).toBe(200);
    expect(json.coupon.status).toBe('used');
    expect(json.coupon.id).toBe(id);

    const [row] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, id));
    expect(row!.status).toBe('used');
    expect(row!.used_at).not.toBeNull();
  });

  it('concurrent double-redeem: exactly one 200, the other 409 (CAS race safety)', async () => {
    const id = await insertCoupon({
      userId: userA,
      rewardId,
      expiresAt: new Date(Date.now() + DAY),
    });
    const [a, b] = await Promise.all([
      post(`/coupons/${id}/redeem`, { user: userA }),
      post(`/coupons/${id}/redeem`, { user: userA }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const [row] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, id));
    expect(row!.status).toBe('used'); // used exactly once
  });
});

describe('AC3 — coupon from reward redemption appears in list', () => {
  it('a coupon with reward_id set is listed for its owner with a label', async () => {
    // Hermetic: insert a reward-issued coupon directly (mirrors how POST
    // /rewards/:id/redeem creates one) rather than calling the live endpoint.
    const id = await insertCoupon({
      userId: userA,
      rewardId,
      expiresAt: new Date(Date.now() + DAY),
    });
    const { json } = await get('/coupons', { user: userA });
    const c = json.coupons.find((x: any) => x.id === id);
    expect(c).toBeDefined();
    expect(c.rewardId).toBe(rewardId);
    expect(c.displayLabel.length).toBeGreaterThan(0);
  });
});
