import type { MarketingNotificationType } from '@jojopotato/types';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * AC-3 (PUSH-004 / #75) — marketing opt-in gating.
 *
 * `marketing_opt_in` gates all 5 marketing types (zero row + zero send when
 * false; sends when true/null). It NEVER gates the 4 transactional order types —
 * an order-status push still fires for an opted-OUT user.
 *
 * Drives the dispatchers directly (unit-integration). EXPO_ACCESS_TOKEN is unset
 * so a send attempt emits exactly one `[push] would send` log line (observed via
 * logSpy). Hermetic: seeds its own users/branch/order; cleans up in afterAll.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type DispatchModule = typeof import('../lib/notification-dispatch');

let db: DbModule['db'];
let schema: SchemaModule;
let dispatchMarketingNotification: DispatchModule['dispatchMarketingNotification'];
let dispatchOrderNotification: DispatchModule['dispatchOrderNotification'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();

const MARKETING_TYPES: MarketingNotificationType[] = [
  'new_deal',
  'coupon_expiring',
  'one_more_order',
  'reward_unlocked',
  'branch_promo',
];

let optedInUserId: string;
let optedOutUserId: string;
let branchId: string;
const createdOrderIds: string[] = [];

function countPushSends(): number {
  return logSpy.mock.calls.filter(
    (call) => typeof call[0] === 'string' && (call[0] as string).includes('[push] would send'),
  ).length;
}

async function marketingRows(userId: string) {
  return db.select().from(schema.notifications).where(eq(schema.notifications.user_id, userId));
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ dispatchMarketingNotification, dispatchOrderNotification } =
    await import('../lib/notification-dispatch'));

  const [inUser] = await db
    .insert(schema.users)
    .values({
      name: 'Opted In',
      email: `mkt-in-${suffix}@example.com`,
      marketingOptIn: true,
    })
    .returning({ id: schema.users.id });
  optedInUserId = inUser!.id;

  const [outUser] = await db
    .insert(schema.users)
    .values({
      name: 'Opted Out',
      email: `mkt-out-${suffix}@example.com`,
      marketingOptIn: false,
    })
    .returning({ id: schema.users.id });
  optedOutUserId = outUser!.id;

  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `MKT B ${suffix}`,
      slug: `mkt-b-${suffix}`,
      address: '1 Test St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000099',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branchId = branch!.id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    const { inArray } = await import('drizzle-orm');
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  await db.delete(schema.notifications).where(eq(schema.notifications.user_id, optedInUserId));
  await db.delete(schema.notifications).where(eq(schema.notifications.user_id, optedOutUserId));
  await db.delete(schema.users).where(eq(schema.users.id, optedInUserId));
  await db.delete(schema.users).where(eq(schema.users.id, optedOutUserId));
  await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  logSpy?.mockRestore();
});

describe('dispatchMarketingNotification — AC-3 opt-in gating', () => {
  it('blocks all 5 marketing types when marketing_opt_in=false (zero row + zero send)', async () => {
    for (const type of MARKETING_TYPES) {
      logSpy.mockClear();
      const sent = await dispatchMarketingNotification(optedOutUserId, type, {
        title: `${type} title`,
        body: `${type} body`,
        targetScreen: 'deal_details',
      });
      expect(sent).toBe(false);
      expect(countPushSends()).toBe(0);
    }
    // No marketing rows were ever written for the opted-out user.
    expect(await marketingRows(optedOutUserId)).toHaveLength(0);
  });

  it('sends all 5 marketing types when marketing_opt_in=true (row + send each)', async () => {
    for (const type of MARKETING_TYPES) {
      logSpy.mockClear();
      const sent = await dispatchMarketingNotification(optedInUserId, type, {
        title: `${type} title`,
        body: `${type} body`,
        targetScreen: 'deal_details',
      });
      expect(sent).toBe(true);
      expect(countPushSends()).toBe(1);
    }
    // Exactly one row per marketing type.
    expect(await marketingRows(optedInUserId)).toHaveLength(MARKETING_TYPES.length);
  });

  it('an order-status push STILL sends for an opted-out user (transactional is never gated)', async () => {
    const [order] = await db
      .insert(schema.orders)
      .values({
        user_id: optedOutUserId,
        branch_id: branchId,
        order_number: `JP-MKT-${suffix}`,
        status: 'accepted',
        subtotal: '10.00',
        total: '10.00',
        payment_method: 'pay_at_branch',
        placed_at: new Date(),
      })
      .returning();
    createdOrderIds.push(order!.id);

    logSpy.mockClear();
    await dispatchOrderNotification(order!, 'accepted');
    // Transactional push fired despite marketing_opt_in=false.
    expect(countPushSends()).toBe(1);
    const rows = (await marketingRows(optedOutUserId)).filter((r) => r.type === 'order_accepted');
    expect(rows).toHaveLength(1);
  });
});
