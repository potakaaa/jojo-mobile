import { Expo } from 'expo-server-sdk';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * AC-6 (PUSH-004 / #75) — push-provider log-fallback.
 *
 * With EXPO_ACCESS_TOKEN unset, the send pipeline is safe/observable: the
 * notification row is still created, but NO outbound HTTP call is attempted —
 * the Expo SDK's `sendPushNotificationsAsync` is never invoked. Hermetic: seeds
 * its own user/branch/order + device token, cleans up in afterAll.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';
// AC-6 precondition: creds are unset → log-fallback path.
delete process.env.EXPO_ACCESS_TOKEN;

type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type DispatchModule = typeof import('../../routes/lib/notification-dispatch');
type PushModule = typeof import('../push-provider');

let db: DbModule['db'];
let schema: SchemaModule;
let dispatchOrderNotification: DispatchModule['dispatchOrderNotification'];
let sendPush: PushModule['sendPush'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();

let userId: string;
let branchId: string;
const createdOrderIds: string[] = [];

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ dispatchOrderNotification } = await import('../../routes/lib/notification-dispatch'));
  ({ sendPush } = await import('../push-provider'));

  const [user] = await db
    .insert(schema.users)
    .values({ name: 'Push User', email: `push-${suffix}@example.com` })
    .returning({ id: schema.users.id });
  userId = user!.id;

  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `PUSH B ${suffix}`,
      slug: `push-b-${suffix}`,
      address: '1 Test St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: '+639170000077',
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  branchId = branch!.id;

  // A registered device token so the send path has a recipient to (not) send to.
  await db.insert(schema.deviceTokens).values({
    user_id: userId,
    device_id: `dev-${suffix}`,
    push_token: 'ExponentPushToken[XXXXXXXXXXXXXXXXXXXXXX]',
    platform: 'ios',
  });
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    const { inArray } = await import('drizzle-orm');
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  await db.delete(schema.notifications).where(eq(schema.notifications.user_id, userId));
  await db.delete(schema.deviceTokens).where(eq(schema.deviceTokens.user_id, userId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  logSpy?.mockRestore();
});

describe('push provider — AC-6 log-fallback (EXPO_ACCESS_TOKEN unset)', () => {
  it('sendPush attempts NO outbound call and logs the fallback', async () => {
    const sendSpy = vi.spyOn(Expo.prototype, 'sendPushNotificationsAsync');
    logSpy.mockClear();

    await sendPush(['ExponentPushToken[XXXXXXXXXXXXXXXXXXXXXX]'], {
      title: 'Hi',
      body: 'There',
    });

    // No Expo client send was ever attempted.
    expect(sendSpy).not.toHaveBeenCalled();
    // The fallback log line was emitted.
    const logged = logSpy.mock.calls.some(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('[push] would send'),
    );
    expect(logged).toBe(true);
    sendSpy.mockRestore();
  });

  it('dispatchOrderNotification still creates the notification row with no outbound call', async () => {
    const sendSpy = vi.spyOn(Expo.prototype, 'sendPushNotificationsAsync');

    const [order] = await db
      .insert(schema.orders)
      .values({
        user_id: userId,
        branch_id: branchId,
        order_number: `JP-PUSH-${suffix}`,
        status: 'accepted',
        subtotal: '10.00',
        total: '10.00',
        payment_method: 'pay_at_branch',
        placed_at: new Date(),
      })
      .returning();
    createdOrderIds.push(order!.id);

    await dispatchOrderNotification(order!, 'accepted');

    // Row created despite creds being unset.
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.user_id, userId));
    const forOrder = rows.filter(
      (r) => (r.target_params as { orderId?: string } | null)?.orderId === order!.id,
    );
    expect(forOrder).toHaveLength(1);
    expect(forOrder[0]!.type).toBe('order_accepted');

    // Still no outbound HTTP call.
    expect(sendSpy).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });
});
