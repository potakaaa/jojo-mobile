import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the PUSH-005 reward-unlock PUSH (added to
 * `notifyRewardUnlocked`) — the in-app row stays UNCONDITIONAL (STAR-003), the
 * push is a separate opt-in-gated `writeRow:false` dispatch.
 *
 * Covers: AC5 (fires once per unlock via the real star-credit path; no duplicate
 * on a retried credit), AC5b (a multi-tier unlock writes N in-app rows but makes
 * exactly ONE push guard call — E5), AC8-reward (opted-out user still gets the
 * in-app row(s) but receives NO push).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type NotifyModule = typeof import('../reward-unlock-notify');
type DispatchModule = typeof import('../../routes/lib/notification-dispatch');
type PushModule = typeof import('../push-provider');
type StarModule = typeof import('../star-earning');

let db: DbModule['db'];
let schema: SchemaModule;
let notify: NotifyModule;
let dispatch: DispatchModule;
let push: PushModule;
let creditStarForCompletedOrder: StarModule['creditStarForCompletedOrder'];

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();

let branchId: string;
const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];
const createdRewardIds: string[] = [];
let emailSeq = 0;

async function seedUser(optIn: boolean): Promise<string> {
  emailSeq += 1;
  const [user] = await db
    .insert(schema.users)
    .values({
      name: 'Unlock Customer',
      email: `unlock-${suffix}-${emailSeq}@example.com`,
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

async function seedCompletedOrder(userId: string): Promise<string> {
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: userId,
      branch_id: branchId,
      order_number: `JP-UNL-${suffix}-${unique().toUpperCase()}`,
      status: 'completed',
      subtotal: '12.50',
      total: '12.50',
      payment_method: 'pay_at_branch',
      placed_at: new Date(),
    })
    .returning({ id: schema.orders.id });
  createdOrderIds.push(order!.id);
  return order!.id;
}

async function seedRewardTier(requiredStars: number): Promise<string> {
  const [reward] = await db
    .insert(schema.rewards)
    .values({
      name: `UNL tier ${suffix}-${requiredStars}`,
      required_stars: requiredStars,
      reward_type: 'free_item',
      reward_value: null,
      is_active: true,
    })
    .returning({ id: schema.rewards.id });
  createdRewardIds.push(reward!.id);
  return reward!.id;
}

async function rewardRows(userId: string) {
  return db
    .select()
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.user_id, userId),
        eq(schema.notifications.type, 'reward_unlocked'),
      ),
    );
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  notify = await import('../reward-unlock-notify');
  dispatch = await import('../../routes/lib/notification-dispatch');
  push = await import('../push-provider');
  ({ creditStarForCompletedOrder } = await import('../star-earning'));

  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `UNL Branch ${suffix}`,
      slug: `unl-branch-${suffix}`,
      address: '1 Unl St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000061',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branchId = branch!.id;
});

afterEach(() => {
  vi.restoreAllMocks();
  // Re-install the console silencers restoreAllMocks just removed.
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.user_id, createdUserIds));
    await db.delete(schema.coupons).where(inArray(schema.coupons.user_id, createdUserIds));
    await db
      .delete(schema.starTransactions)
      .where(inArray(schema.starTransactions.user_id, createdUserIds));
    await db.delete(schema.userStars).where(inArray(schema.userStars.user_id, createdUserIds));
  }
  if (createdOrderIds.length > 0) {
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
  }
  if (createdRewardIds.length > 0) {
    await db.delete(schema.rewards).where(inArray(schema.rewards.id, createdRewardIds));
  }
  if (branchId) await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  logSpy?.mockRestore();
  errSpy?.mockRestore();
});

// ── AC5 — one push per unlock via the real credit path; none on retry ────────
describe('AC5 — reward unlock push fires once per unlock event', () => {
  it('fires exactly one push guard call on a real credit-crossing; none on a duplicate credit', async () => {
    // A tier at 3 stars (below the seeded 5/10/15/20 roadmap) so crossing 2→3
    // unlocks EXACTLY this one tier.
    const rewardId = await seedRewardTier(3);
    const userId = await seedUser(true);
    await setLifetime(userId, 2);
    const orderId = await seedCompletedOrder(userId);

    const guardSpy = vi
      .spyOn(dispatch, 'dispatchMarketingNotificationIfAllowed')
      .mockResolvedValue('sent');

    const first = await creditStarForCompletedOrder(orderId); // lifetime → 3, unlocks
    expect(first.credited).toBe(true);
    expect(first.unlockedRewardIds).toContain(rewardId);

    // One in-app row + one push guard call for the single unlocked tier.
    expect(await rewardRows(userId)).toHaveLength(1);
    expect(guardSpy).toHaveBeenCalledTimes(1);
    expect(guardSpy).toHaveBeenCalledWith(
      userId,
      'reward_unlocked',
      expect.objectContaining({ targetScreen: 'rewards' }),
      { writeRow: false },
    );

    // A duplicate credit is idempotent-skipped upstream → notifyRewardUnlocked is
    // never re-invoked → no second push.
    const second = await creditStarForCompletedOrder(orderId);
    expect(second).toEqual({ credited: false, reason: 'already-credited' });
    expect(guardSpy).toHaveBeenCalledTimes(1);
    expect(await rewardRows(userId)).toHaveLength(1);
  });
});

// ── AC5b — multi-tier unlock: N in-app rows, exactly 1 push (E5) ─────────────
describe('AC5b — multi-tier unlock writes N rows but makes 1 push call', () => {
  it('two unlocked tiers → 2 in-app rows + exactly 1 guard call', async () => {
    const userId = await seedUser(true);
    const guardSpy = vi
      .spyOn(dispatch, 'dispatchMarketingNotificationIfAllowed')
      .mockResolvedValue('sent');

    // Directly exercise the notify helper with 2 reward ids (as a single credit
    // crossing two tiers would produce).
    await notify.notifyRewardUnlocked(userId, [`r-${unique()}`, `r-${unique()}`]);

    expect(await rewardRows(userId)).toHaveLength(2);
    expect(guardSpy).toHaveBeenCalledTimes(1);
    expect(guardSpy).toHaveBeenCalledWith(
      userId,
      'reward_unlocked',
      expect.objectContaining({ targetScreen: 'rewards' }),
      { writeRow: false },
    );
  });
});

// ── AC8-reward — opted-out user: in-app row yes, push no ─────────────────────
describe('AC8-reward — opted-out user still gets the in-app row but no push', () => {
  it('writes the in-app row and never reaches the push provider', async () => {
    const userId = await seedUser(false); // opted OUT
    const sendSpy = vi.spyOn(push, 'sendPush');

    // Real guard (not mocked) — the opt-in gate must block the push.
    await notify.notifyRewardUnlocked(userId, [`r-${unique()}`]);

    // In-app row is UNCONDITIONAL.
    expect(await rewardRows(userId)).toHaveLength(1);
    // The opt-in gate short-circuits before any push send.
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
