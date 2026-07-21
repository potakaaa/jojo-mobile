import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the PUSH-005 marketing trigger hub (`marketing-triggers.ts`).
 *
 * Hermetic: seeds its own branch / offer / users / coupons / rewards / user_stars
 * and tears them down in afterAll. Runs against the per-run pristine `_test`
 * Postgres (packages/api/test/global-setup.ts):
 *   docker compose up -d
 *   pnpm --filter @jojopotato/api test
 *
 * Covers: AC0 (boot registration + start), AC0b (index.ts static wiring),
 * AC0/D3 self-rearming continuation + resilience (E1), AC1/AC2 (coupon-expiring
 * poll), AC3/AC4 (one-more-order poll), AC6 (new-deal event), AC12 (restart-safe
 * dedup).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type TriggersModule = typeof import('../marketing-triggers');
type SchedulerModule = typeof import('../scheduler');

let db: DbModule['db'];
let schema: SchemaModule;
let triggers: TriggersModule;
let createScheduler: SchedulerModule['createScheduler'];

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();

// A fixed instant OUTSIDE Manila quiet hours (UTC 04:00 → Manila 12:00), so the
// guard never drops on quiet-hours during scan tests.
const NON_QUIET = new Date('2026-06-15T04:00:00.000Z');

let branchId: string;
let offerId: string;
const createdUserIds: string[] = [];
const createdRewardIds: string[] = [];
let emailSeq = 0;

const flush = () => new Promise((r) => setImmediate(r));

async function seedUser(optIn = true): Promise<string> {
  emailSeq += 1;
  const [user] = await db
    .insert(schema.users)
    .values({
      name: 'Marketing Customer',
      email: `mkt-${suffix}-${emailSeq}@example.com`,
      marketingOptIn: optIn,
    })
    .returning({ id: schema.users.id });
  createdUserIds.push(user!.id);
  return user!.id;
}

async function setLifetime(userId: string, n: number): Promise<void> {
  await db
    .insert(schema.userStars)
    .values({ user_id: userId, current_stars: n, lifetime_stars: n })
    .onConflictDoUpdate({
      target: schema.userStars.user_id,
      set: { current_stars: n, lifetime_stars: n, updated_at: new Date() },
    });
}

let couponSeq = 0;
async function seedOfferCoupon(opts: {
  userId: string;
  expiresAt: Date | null;
  status?: 'available' | 'used' | 'expired';
}): Promise<string> {
  couponSeq += 1;
  const [coupon] = await db
    .insert(schema.coupons)
    .values({
      user_id: opts.userId,
      offer_id: offerId,
      code: `JP-MKT-${suffix}-${couponSeq}`,
      status: opts.status ?? 'available',
      expires_at: opts.expiresAt,
    })
    .returning({ id: schema.coupons.id });
  return coupon!.id;
}

async function seedRewardTier(requiredStars: number): Promise<string> {
  const [reward] = await db
    .insert(schema.rewards)
    .values({
      name: `MKT tier ${suffix}-${requiredStars}`,
      required_stars: requiredStars,
      reward_type: 'free_item',
      reward_value: null,
      is_active: true,
    })
    .returning({ id: schema.rewards.id });
  createdRewardIds.push(reward!.id);
  return reward!.id;
}

async function notificationsFor(userId: string, type: string) {
  return db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.user_id, userId), eq(schema.notifications.type, type)));
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  triggers = await import('../marketing-triggers');
  ({ createScheduler } = await import('../scheduler'));

  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `MKT Branch ${suffix}`,
      slug: `mkt-branch-${suffix}`,
      address: '1 Mkt St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000041',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branchId = branch!.id;

  const [offer] = await db
    .insert(schema.offers)
    .values({
      title: `MKT Offer ${suffix}`,
      deal_type: 'percentage_discount',
      discount_value: '10',
      start_at: new Date('2026-01-01T00:00:00.000Z'),
      end_at: new Date('2027-01-01T00:00:00.000Z'),
    })
    .returning({ id: schema.offers.id });
  offerId = offer!.id;
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.user_id, createdUserIds));
    await db.delete(schema.coupons).where(inArray(schema.coupons.user_id, createdUserIds));
    await db.delete(schema.userStars).where(inArray(schema.userStars.user_id, createdUserIds));
    await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
  }
  if (createdRewardIds.length > 0) {
    await db.delete(schema.rewards).where(inArray(schema.rewards.id, createdRewardIds));
  }
  if (offerId) await db.delete(schema.offers).where(eq(schema.offers.id, offerId));
  if (branchId) await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  logSpy?.mockRestore();
  errSpy?.mockRestore();
  vi.restoreAllMocks();
});

// ── AC0 — scheduler boot ─────────────────────────────────────────────────────
describe('bootMarketingScheduler (AC0)', () => {
  it('registers both poll triggers and calls start() once', () => {
    const now = () => NON_QUIET;
    const sched = createScheduler({ intervalMs: triggers.MARKETING_SCAN_INTERVAL_MS, now });
    const startSpy = vi.spyOn(sched, 'start').mockImplementation(() => {});
    const registerSpy = vi.spyOn(sched, 'register');

    const returned = triggers.bootMarketingScheduler({ scheduler: sched, now, intervalMs: 1000 });

    expect(returned).toBe(sched);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy).toHaveBeenCalledTimes(2);
    startSpy.mockRestore();
    registerSpy.mockRestore();
  });
});

// ── AC0b — static wiring in index.ts (env-guarded call never runs under vitest) ─
describe('AC0b — index.ts wires bootMarketingScheduler inside the boot guard', () => {
  it('imports bootMarketingScheduler and invokes it inside the non-test env guard', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');
    // Imported from the triggers module.
    expect(src).toMatch(
      /import\s*\{\s*bootMarketingScheduler\s*\}\s*from\s*['"]\.\/lib\/marketing-triggers['"]/,
    );
    // The invocation exists and sits AFTER the non-test boot-guard condition.
    const guardIdx = src.indexOf("process.env.VITEST !== 'true'");
    const callIdx = src.indexOf('bootMarketingScheduler()');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(guardIdx);
  });
});

// ── AC0/D3 — self-rearming continuation + resilience ─────────────────────────
describe('self-rearming poll trigger (AC0/D3)', () => {
  it('continues firing across intervals (a successor is re-registered each fire)', async () => {
    let ms = new Date('2026-06-15T04:00:00.000Z').getTime();
    const now = () => new Date(ms);
    const sched = createScheduler({ intervalMs: 1000, now });
    let scanCount = 0;
    const stub = async () => {
      scanCount += 1;
    };

    triggers.registerSelfRearmingTrigger(sched, 'cont-test', stub, now, 1000);

    sched.tick();
    await flush();
    expect(scanCount).toBe(1);

    // Advance one interval — the successor registered on the first fire must fire.
    ms += 1000;
    sched.tick();
    await flush();
    expect(scanCount).toBe(2);

    sched.stop();
  });

  it('survives a throwing scan — the chain re-arms in finally (E1)', async () => {
    let ms = new Date('2026-06-15T04:00:00.000Z').getTime();
    const now = () => new Date(ms);
    const sched = createScheduler({ intervalMs: 1000, now });
    let calls = 0;
    const throwing = async () => {
      calls += 1;
      throw new Error('transient scan failure');
    };

    triggers.registerSelfRearmingTrigger(sched, 'resil-test', throwing, now, 1000);

    sched.tick();
    await flush();
    expect(calls).toBe(1);

    // Despite the throw, a successor was re-registered → next interval fires again.
    ms += 1000;
    sched.tick();
    await flush();
    expect(calls).toBe(2);

    sched.stop();
  });
});

// ── AC1 / AC2 — coupon-expiring poll ─────────────────────────────────────────
describe('scanExpiringCoupons (AC1/AC2)', () => {
  it('AC1 — fires exactly once for an in-window coupon; no second row on repeat poll', async () => {
    const userId = await seedUser(true);
    const couponId = await seedOfferCoupon({
      userId,
      expiresAt: new Date(NON_QUIET.getTime() + 24 * 60 * 60 * 1000), // +24h, in the 72h window
    });

    await triggers.scanExpiringCoupons(NON_QUIET);
    let rows = await notificationsFor(userId, 'coupon_expiring');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.target_screen).toBe('coupon_wallet');
    expect(rows[0]!.target_params).toEqual({ couponId });

    // Repeat poll — persisted dedup blocks a second row.
    await triggers.scanExpiringCoupons(NON_QUIET);
    rows = await notificationsFor(userId, 'coupon_expiring');
    expect(rows).toHaveLength(1);
  });

  it('AC2 — does not fire for a used coupon', async () => {
    const userId = await seedUser(true);
    await seedOfferCoupon({
      userId,
      expiresAt: new Date(NON_QUIET.getTime() + 24 * 60 * 60 * 1000),
      status: 'used',
    });

    await triggers.scanExpiringCoupons(NON_QUIET);
    expect(await notificationsFor(userId, 'coupon_expiring')).toHaveLength(0);
  });

  it('AC2 — does not fire for a fully-expired coupon (expires_at in the past)', async () => {
    const userId = await seedUser(true);
    await seedOfferCoupon({
      userId,
      expiresAt: new Date(NON_QUIET.getTime() - 60 * 60 * 1000), // 1h ago
    });

    await triggers.scanExpiringCoupons(NON_QUIET);
    expect(await notificationsFor(userId, 'coupon_expiring')).toHaveLength(0);
  });

  it('does not fire for an opted-out user (AC8 coupon_expiring)', async () => {
    const userId = await seedUser(false);
    await seedOfferCoupon({
      userId,
      expiresAt: new Date(NON_QUIET.getTime() + 24 * 60 * 60 * 1000),
    });

    await triggers.scanExpiringCoupons(NON_QUIET);
    expect(await notificationsFor(userId, 'coupon_expiring')).toHaveLength(0);
  });
});

// ── AC3 / AC4 — one-more-order poll ──────────────────────────────────────────
describe('scanOneMoreOrder (AC3/AC4)', () => {
  it('AC3 — fires only at lifetime_stars = required_stars − 1; AC4 — one-shot on repeat', async () => {
    // High required_stars so this tier never collides with the seeded 5/10/15/20
    // roadmap (and the chosen lifetimes 298–301 are not near-miss for those).
    const required = 300;
    await seedRewardTier(required);

    const twoAway = await seedUser(true);
    const oneAway = await seedUser(true);
    const atThreshold = await seedUser(true);
    const past = await seedUser(true);
    await setLifetime(twoAway, required - 2);
    await setLifetime(oneAway, required - 1);
    await setLifetime(atThreshold, required);
    await setLifetime(past, required + 1);

    await triggers.scanOneMoreOrder(NON_QUIET);

    // Only the exactly-one-away user is nudged.
    const oneAwayRows = await notificationsFor(oneAway, 'one_more_order');
    expect(oneAwayRows).toHaveLength(1);
    expect(oneAwayRows[0]!.target_screen).toBe('rewards');
    expect(oneAwayRows[0]!.target_params).toEqual({ requiredStars: String(required) });
    expect(await notificationsFor(twoAway, 'one_more_order')).toHaveLength(0);
    expect(await notificationsFor(atThreshold, 'one_more_order')).toHaveLength(0);
    expect(await notificationsFor(past, 'one_more_order')).toHaveLength(0);

    // AC4 — repeat tick does not re-nudge the same near-miss tier.
    await triggers.scanOneMoreOrder(NON_QUIET);
    expect(await notificationsFor(oneAway, 'one_more_order')).toHaveLength(1);
  });
});

// ── AC6 — new-deal event ─────────────────────────────────────────────────────
describe('notifyNewDeal (AC6)', () => {
  it('notifies each opted-in user once; no re-notify on repeat; opted-out excluded', async () => {
    const optedInA = await seedUser(true);
    const optedInB = await seedUser(true);
    const optedOut = await seedUser(false);
    const dealId = `deal-${suffix}-${unique()}`;

    await triggers.notifyNewDeal(dealId, NON_QUIET);

    for (const uid of [optedInA, optedInB]) {
      const rows = (await notificationsFor(uid, 'new_deal')).filter(
        (r) => (r.target_params as { dealId?: string } | null)?.dealId === dealId,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.target_screen).toBe('deal_details');
    }
    // AC8 new_deal — opted-out user gets nothing.
    expect(
      (await notificationsFor(optedOut, 'new_deal')).filter(
        (r) => (r.target_params as { dealId?: string } | null)?.dealId === dealId,
      ),
    ).toHaveLength(0);

    // Repeat call — persisted dedup blocks a second per-user row.
    await triggers.notifyNewDeal(dealId, NON_QUIET);
    const aRows = (await notificationsFor(optedInA, 'new_deal')).filter(
      (r) => (r.target_params as { dealId?: string } | null)?.dealId === dealId,
    );
    expect(aRows).toHaveLength(1);
  });
});

// ── AC12 — restart-safe dedup ────────────────────────────────────────────────
describe('restart-safe dedup (AC12)', () => {
  it('a fresh scheduler (empty in-memory fired set) does not duplicate a persisted send', async () => {
    const userId = await seedUser(true);
    await seedOfferCoupon({
      userId,
      expiresAt: new Date(NON_QUIET.getTime() + 12 * 60 * 60 * 1000),
    });

    // "First process" — scan writes exactly one row.
    await triggers.scanExpiringCoupons(NON_QUIET);
    expect(await notificationsFor(userId, 'coupon_expiring')).toHaveLength(1);

    // "Restart" — brand-new scheduler instance (fresh fired set); drive one tick
    // that re-runs the same scan. Dedup is derived from the persisted row, not the
    // lost in-memory state, so no duplicate is written.
    const sched = createScheduler({ intervalMs: 1000, now: () => NON_QUIET });
    triggers.registerSelfRearmingTrigger(
      sched,
      'coupon-scan',
      triggers.scanExpiringCoupons,
      () => NON_QUIET,
      1000,
    );
    sched.tick();
    await flush();
    sched.stop();

    expect(await notificationsFor(userId, 'coupon_expiring')).toHaveLength(1);
  });
});
