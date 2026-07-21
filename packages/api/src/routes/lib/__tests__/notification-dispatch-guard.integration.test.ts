import type { MarketingNotificationType, NotificationTargetScreen } from '@jojopotato/types';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the PUSH-005 marketing dispatch guard
 * (`dispatchMarketingNotificationIfAllowed`) and the transactional exemption of
 * `dispatchOrderNotification`. Hermetic self-seeding against the pristine `_test`
 * Postgres.
 *
 * Covers: AC8 (opt-out per type), AC9 (row shape per type), AC10 (24h + 30d cap;
 * order-status exempt), AC10b (reward_unlocked in-app rows EXCLUDED from the cap —
 * E4), AC11 (quiet-hours drop; order-status exempt), AC11b (event drop vs poll
 * re-attempt asymmetry).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type DbModule = typeof import('../../../db/client');
type SchemaModule = typeof import('../../../db/schema/index');
type DispatchModule = typeof import('../notification-dispatch');

let db: DbModule['db'];
let schema: SchemaModule;
let dispatch: DispatchModule;

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();

// UTC 04:00 → Manila 12:00 (NOT quiet). UTC 14:00 → Manila 22:00 (quiet).
const NON_QUIET = new Date('2026-06-15T04:00:00.000Z');
const QUIET = new Date('2026-06-15T14:00:00.000Z');

let branchId: string;
const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];
let emailSeq = 0;

async function seedUser(optIn: boolean): Promise<string> {
  emailSeq += 1;
  const [user] = await db
    .insert(schema.users)
    .values({
      name: 'Guard Customer',
      email: `guard-${suffix}-${emailSeq}@example.com`,
      marketingOptIn: optIn,
    })
    .returning({ id: schema.users.id });
  createdUserIds.push(user!.id);
  return user!.id;
}

async function seedOrder(userId: string): Promise<typeof schema.orders.$inferSelect> {
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: userId,
      branch_id: branchId,
      order_number: `JP-GRD-${suffix}-${unique().toUpperCase()}`,
      status: 'accepted',
      subtotal: '10.00',
      total: '10.00',
      payment_method: 'pay_at_branch',
      placed_at: new Date(),
    })
    .returning();
  createdOrderIds.push(order!.id);
  return order!;
}

async function rowsFor(userId: string, type: string) {
  return db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.user_id, userId), eq(schema.notifications.type, type)));
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ db } = await import('../../../db/client'));
  schema = await import('../../../db/schema/index');
  dispatch = await import('../notification-dispatch');

  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `Guard Branch ${suffix}`,
      slug: `guard-branch-${suffix}`,
      address: '1 Guard St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000051',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branchId = branch!.id;
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.user_id, createdUserIds));
  }
  if (createdOrderIds.length > 0) {
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
  }
  if (branchId) await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  logSpy?.mockRestore();
  errSpy?.mockRestore();
  vi.restoreAllMocks();
});

// The 4 cap-counted marketing types + their AC9 target screen / params.
interface TypeCase {
  type: MarketingNotificationType;
  screen: NotificationTargetScreen;
  params: Record<string, string>;
}
const TYPE_CASES: TypeCase[] = [
  { type: 'coupon_expiring', screen: 'coupon_wallet', params: { couponId: 'c-1' } },
  { type: 'one_more_order', screen: 'rewards', params: { requiredStars: '5' } },
  { type: 'new_deal', screen: 'deal_details', params: { dealId: 'd-1' } },
  { type: 'branch_promo', screen: 'deal_details', params: { branchId: 'b-1' } },
];

// ── AC9 — row shape per type ─────────────────────────────────────────────────
describe('AC9 — correct row shape per marketing type', () => {
  it.each(TYPE_CASES)('writes type=$type with screen $screen and its params', async (c) => {
    const userId = await seedUser(true);
    const result = await dispatch.dispatchMarketingNotificationIfAllowed(
      userId,
      c.type,
      { title: `T ${c.type}`, body: `B ${c.type}`, targetScreen: c.screen, targetParams: c.params },
      { now: () => NON_QUIET },
    );
    expect(result).toBe('sent');

    const rows = await rowsFor(userId, c.type);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe(c.type);
    expect(rows[0]!.target_screen).toBe(c.screen);
    expect(rows[0]!.target_params).toEqual(c.params);
  });
});

// ── AC8 — opt-out blocks all marketing types, per type ───────────────────────
describe('AC8 — opt-out blocks every marketing type', () => {
  it.each(TYPE_CASES)('gates $type for an opted-out user (no row)', async (c) => {
    const userId = await seedUser(false);
    const result = await dispatch.dispatchMarketingNotificationIfAllowed(
      userId,
      c.type,
      { title: 'x', body: 'y', targetScreen: c.screen, targetParams: c.params },
      { now: () => NON_QUIET },
    );
    expect(result).toBe('gated-opt-out');
    expect(await rowsFor(userId, c.type)).toHaveLength(0);
  });
});

// ── AC10 — frequency cap; transactional never counted/blocked ────────────────
describe('AC10 — marketing frequency cap', () => {
  it('enforces MAX_PER_24H (3) back-to-back; the 4th is gated-frequency', async () => {
    const userId = await seedUser(true);
    const send = (
      type: (typeof TYPE_CASES)[number]['type'],
      screen: 'coupon_wallet' | 'rewards' | 'deal_details',
    ) =>
      dispatch.dispatchMarketingNotificationIfAllowed(
        userId,
        type,
        { title: 't', body: 'b', targetScreen: screen },
        { now: () => NON_QUIET },
      );

    expect(await send('coupon_expiring', 'coupon_wallet')).toBe('sent');
    expect(await send('one_more_order', 'rewards')).toBe('sent');
    expect(await send('new_deal', 'deal_details')).toBe('sent');
    // 4th distinct marketing send in the same 24h window → capped.
    expect(await send('branch_promo', 'deal_details')).toBe('gated-frequency');

    // Order-status push is NEVER counted or blocked by the marketing cap.
    const order = await seedOrder(userId);
    await dispatch.dispatchOrderNotification(order, 'accepted');
    expect(await rowsFor(userId, 'order_accepted')).toHaveLength(1);
    // ...and a further marketing send is STILL capped (the order push added no budget).
    expect(await send('coupon_expiring', 'coupon_wallet')).toBe('gated-frequency');
  });

  it('enforces MAX_PER_30D (8) across the 30-day window (older than 24h)', async () => {
    const userId = await seedUser(true);
    // 8 cap-counted rows dated 2 days ago (inside 30d, outside 24h) → 30d cap hit.
    const twoDaysAgo = new Date(NON_QUIET.getTime() - 2 * 24 * 60 * 60 * 1000);
    await db.insert(schema.notifications).values(
      Array.from({ length: 8 }, (_, i) => ({
        user_id: userId,
        type: 'new_deal',
        title: 't',
        body: 'b',
        target_screen: 'deal_details',
        target_params: { dealId: `bulk-${i}` },
        created_at: twoDaysAgo,
      })),
    );

    const result = await dispatch.dispatchMarketingNotificationIfAllowed(
      userId,
      'coupon_expiring',
      { title: 't', body: 'b', targetScreen: 'coupon_wallet' },
      { now: () => NON_QUIET },
    );
    expect(result).toBe('gated-frequency');
  });
});

// ── AC10b — reward_unlocked in-app rows EXCLUDED from the cap (E4) ────────────
describe('AC10b — reward_unlocked in-app rows do not spend cap budget (E4)', () => {
  it('a burst of reward_unlocked rows does not suppress a subsequent coupon-expiry push', async () => {
    const userId = await seedUser(true);
    // 5 unconditional reward_unlocked in-app rows "now" (would exceed the 24h cap
    // of 3 IF counted). Per E4 they are excluded, so a marketing push still sends.
    await db.insert(schema.notifications).values(
      Array.from({ length: 5 }, () => ({
        user_id: userId,
        type: 'reward_unlocked',
        title: 'Reward unlocked!',
        body: 'x',
        target_screen: '/(tabs)/rewards',
        created_at: NON_QUIET,
      })),
    );

    const result = await dispatch.dispatchMarketingNotificationIfAllowed(
      userId,
      'coupon_expiring',
      { title: 't', body: 'b', targetScreen: 'coupon_wallet', targetParams: { couponId: 'c' } },
      { now: () => NON_QUIET },
    );
    expect(result).toBe('sent');
    expect(await rowsFor(userId, 'coupon_expiring')).toHaveLength(1);
  });
});

// ── AC11 — quiet hours suppress marketing; transactional exempt ──────────────
describe('AC11 — quiet hours', () => {
  it('drops a marketing send during quiet hours (no row)', async () => {
    const userId = await seedUser(true);
    const result = await dispatch.dispatchMarketingNotificationIfAllowed(
      userId,
      'new_deal',
      { title: 't', body: 'b', targetScreen: 'deal_details', targetParams: { dealId: 'd' } },
      { now: () => QUIET },
    );
    expect(result).toBe('gated-quiet-hours');
    expect(await rowsFor(userId, 'new_deal')).toHaveLength(0);
  });

  it('order-status push delivers during quiet hours (transactional exempt)', async () => {
    const userId = await seedUser(true);
    const order = await seedOrder(userId);
    // dispatchOrderNotification does not route through the guard at all.
    await dispatch.dispatchOrderNotification(order, 'ready');
    expect(await rowsFor(userId, 'order_ready')).toHaveLength(1);
  });
});

// ── AC11b — event drop vs poll re-attempt asymmetry ──────────────────────────
describe('AC11b — event-trigger quiet-hours drop vs poll re-attempt', () => {
  it('drops the send in quiet hours (no row), but a later non-quiet attempt succeeds', async () => {
    const userId = await seedUser(true);
    const payload = {
      title: 't',
      body: 'b',
      targetScreen: 'deal_details' as const,
      targetParams: { dealId: 'evt-1' },
    };

    // Quiet-hours attempt (an event trigger firing now) → dropped, no row, no
    // deferred re-send. A genuinely-once event that lands here stays dropped.
    expect(
      await dispatch.dispatchMarketingNotificationIfAllowed(userId, 'new_deal', payload, {
        now: () => QUIET,
      }),
    ).toBe('gated-quiet-hours');
    expect(await rowsFor(userId, 'new_deal')).toHaveLength(0);

    // A poll trigger, by contrast, re-attempts on the next non-quiet tick: because
    // no row was written, the retry is not deduped and now succeeds.
    expect(
      await dispatch.dispatchMarketingNotificationIfAllowed(userId, 'new_deal', payload, {
        now: () => NON_QUIET,
      }),
    ).toBe('sent');
    expect(await rowsFor(userId, 'new_deal')).toHaveLength(1);
  });
});

// Sanity: no unexpected error logs leaked from the guard's swallow branch.
describe('guard hygiene', () => {
  it('did not hit the fail-safe catch branch during these tests', () => {
    const guardErrors = errSpy.mock.calls.filter((c) =>
      String(c[0]).includes('guarded marketing dispatch failed'),
    );
    expect(guardErrors).toHaveLength(0);
  });
});
