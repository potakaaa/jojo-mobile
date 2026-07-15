import { Expo } from 'expo-server-sdk';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Real Device Push Delivery hardening (on top of PUSH-004 / #75).
 *
 * Covers:
 *   - AC-2: the outbound ExpoPushMessage for all 4 transactional types carries
 *     the background/killed-app fields (`priority: 'high'`, `_contentAvailable`).
 *     Pure unit-level — the `Expo` client is mocked, no DB.
 *   - Risk #4: the log-fallback (EXPO_ACCESS_TOKEN unset) returns an all-`'ok'`
 *     result array so it can NEVER trigger a prune.
 *   - #5a / Risk #6: ticket→token correlation is built from the filtered+chunked
 *     message order (positional within the chunk), NOT a zip against the raw
 *     tokens argument — a filtered-out non-Expo token must never mis-attribute a
 *     permanent error to the wrong token. Pure unit-level (no DB).
 *   - AC-3: a `DeviceNotRegistered` ticket prunes only that token's
 *     `device_tokens` row (a transient-error token is left untouched), proven for
 *     BOTH `dispatchOrderNotification` and `dispatchMarketingNotification` via the
 *     shared `sendAndPrune` helper. Seeds real rows against the test DB that
 *     `test/global-setup.ts` provisions/migrates (mirrors the hermetic self-seed
 *     pattern in `push-provider.integration.test.ts`) — the `Expo` SDK client is
 *     the only thing mocked (checklist item #8a / Execute-Agent Instruction E2).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';
// Baseline: creds unset (matches CI). Saved/restored so this suite doesn't
// pollute ambient process.env for other files in the same vitest worker.
const originalExpoToken = process.env.EXPO_ACCESS_TOKEN;
delete process.env.EXPO_ACCESS_TOKEN;

type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type DispatchModule = typeof import('../../routes/lib/notification-dispatch');
type PushModule = typeof import('../push-provider');

let db: DbModule['db'];
let schema: SchemaModule;
let dispatchOrderNotification: DispatchModule['dispatchOrderNotification'];
let dispatchMarketingNotification: DispatchModule['dispatchMarketingNotification'];
let sendPush: PushModule['sendPush'];

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();
const createdUserIds: string[] = [];

async function seedUser(marketingOptIn = false): Promise<string> {
  const [user] = await db
    .insert(schema.users)
    .values({
      name: 'Push Test',
      email: `push-test-${unique()}@example.com`,
      marketingOptIn,
    })
    .returning({ id: schema.users.id });
  createdUserIds.push(user!.id);
  return user!.id;
}

async function seedToken(userId: string, pushToken: string, platform = 'ios'): Promise<void> {
  await db.insert(schema.deviceTokens).values({
    user_id: userId,
    device_id: `dev-${unique()}`,
    push_token: pushToken,
    platform,
  });
}

async function tokenExists(pushToken: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.deviceTokens.id })
    .from(schema.deviceTokens)
    .where(eq(schema.deviceTokens.push_token, pushToken));
  return rows.length > 0;
}

beforeAll(async () => {
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ dispatchOrderNotification, dispatchMarketingNotification } = await import(
    '../../routes/lib/notification-dispatch'
  ));
  ({ sendPush } = await import('../push-provider'));
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.EXPO_ACCESS_TOKEN;
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    await db.delete(schema.notifications).where(eq(schema.notifications.user_id, userId));
    await db.delete(schema.deviceTokens).where(eq(schema.deviceTokens.user_id, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  }
  if (originalExpoToken === undefined) delete process.env.EXPO_ACCESS_TOKEN;
  else process.env.EXPO_ACCESS_TOKEN = originalExpoToken;
});

describe('sendPush — AC-2 background payload shape (Expo mocked, no DB)', () => {
  it("constructs ExpoPushMessage with priority 'high' + _contentAvailable true for all 4 transactional types", async () => {
    process.env.EXPO_ACCESS_TOKEN = 'test-access-token';
    vi.spyOn(Expo, 'isExpoPushToken').mockReturnValue(true);
    const sendSpy = vi
      .spyOn(Expo.prototype, 'sendPushNotificationsAsync')
      .mockResolvedValue([{ status: 'ok', id: 'r' }]);

    // The 4 transactional order-status notification types (mirrors ORDER_COPY).
    const transactional = [
      { title: 'Order accepted', body: 'Your order has been accepted and is queued.', type: 'order_accepted' },
      { title: 'Order being prepared', body: 'The kitchen is preparing your order.', type: 'order_preparing' },
      { title: 'Order ready for pickup', body: 'Your order is ready — head to the branch!', type: 'order_ready' },
      { title: 'Order cancelled', body: 'Your order was cancelled.', type: 'order_cancelled' },
    ];

    for (const [i, copy] of transactional.entries()) {
      await sendPush(['ExponentPushToken[AC2]'], {
        title: copy.title,
        body: copy.body,
        data: { type: copy.type },
      });
      const sentMessages = sendSpy.mock.calls[i]![0];
      const message = sentMessages[0]!;
      expect(message.priority).toBe('high');
      expect(message._contentAvailable).toBe(true);
      // The existing visible fields are still present alongside the new ones.
      expect(message.title).toBe(copy.title);
      expect(message.body).toBe(copy.body);
      expect(message.sound).toBe('default');
    }

    expect(sendSpy).toHaveBeenCalledTimes(transactional.length);
  });
});

describe('sendPush — Risk #4 log-fallback never prunes (EXPO_ACCESS_TOKEN unset)', () => {
  it('returns an all-ok result array and attempts no outbound call', async () => {
    const sendSpy = vi.spyOn(Expo.prototype, 'sendPushNotificationsAsync');

    const results = await sendPush(
      ['ExponentPushToken[A]', 'not-an-expo-token', 'ExponentPushToken[B]'],
      { title: 'Hi', body: 'There' },
    );

    expect(sendSpy).not.toHaveBeenCalled();
    // Every input token — even the malformed one — is reported 'ok', so the
    // fallback path can never signal a prune.
    expect(results).toEqual([
      { token: 'ExponentPushToken[A]', status: 'ok' },
      { token: 'not-an-expo-token', status: 'ok' },
      { token: 'ExponentPushToken[B]', status: 'ok' },
    ]);
    expect(results.some((r) => r.status === 'error')).toBe(false);
  });
});

describe('sendPush — #5a/Risk #6 ticket→token correlation (filtered+chunked order, no DB)', () => {
  it('attributes a DeviceNotRegistered error to the right token when a non-Expo token is filtered out', async () => {
    process.env.EXPO_ACCESS_TOKEN = 'test-access-token';
    // Only the ExponentPushToken[...] entries pass validation; the middle one is
    // dropped before send — so the raw tokens array (3) and the tickets (2)
    // have different lengths, which a naive zip would misalign.
    vi.spyOn(Expo, 'isExpoPushToken').mockImplementation(
      (t): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken['),
    );
    // Error ticket carries NO expoPushToken → forces the positional fallback,
    // which must resolve against the filtered+chunked message order.
    vi.spyOn(Expo.prototype, 'sendPushNotificationsAsync').mockImplementation(
      async (messages) =>
        messages.map((m) => {
          const to = Array.isArray(m.to) ? m.to[0]! : m.to;
          return to === 'ExponentPushToken[DEAD]'
            ? { status: 'error' as const, message: 'gone', details: { error: 'DeviceNotRegistered' as const } }
            : { status: 'ok' as const, id: 'r' };
        }),
    );

    const results = await sendPush(
      ['ExponentPushToken[DEAD]', 'not-an-expo-token', 'ExponentPushToken[ALIVE]'],
      { title: 'x', body: 'y' },
    );

    // Only the 2 valid tokens are in the results (invalid filtered before send).
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.token === 'ExponentPushToken[DEAD]')).toEqual({
      token: 'ExponentPushToken[DEAD]',
      status: 'error',
      errorType: 'DeviceNotRegistered',
    });
    expect(results.find((r) => r.token === 'ExponentPushToken[ALIVE]')!.status).toBe('ok');
    // The filtered-out non-Expo token is NEVER attributed an error (would prune
    // the wrong row).
    expect(results.some((r) => r.token === 'not-an-expo-token')).toBe(false);
  });
});

describe('sendAndPrune — AC-3 permanent-error token pruning via both dispatchers (real DB)', () => {
  /** Mock the SDK send: DeviceNotRegistered for `deadToken`, transient for the rest. */
  function mockDeviceNotRegisteredFor(deadToken: string) {
    vi.spyOn(Expo, 'isExpoPushToken').mockReturnValue(true);
    vi.spyOn(Expo.prototype, 'sendPushNotificationsAsync').mockImplementation(
      async (messages) =>
        messages.map((m) => {
          const to = Array.isArray(m.to) ? m.to[0]! : m.to;
          return to === deadToken
            ? {
                status: 'error' as const,
                message: 'gone',
                details: { error: 'DeviceNotRegistered' as const, expoPushToken: to },
              }
            : {
                status: 'error' as const,
                message: 'slow',
                details: { error: 'MessageRateExceeded' as const, expoPushToken: to },
              };
        }),
    );
  }

  it('dispatchOrderNotification prunes only the DeviceNotRegistered token, not the transient one', async () => {
    const userId = await seedUser();
    const deadToken = `ExponentPushToken[DEAD-${suffix}-ord]`;
    const aliveToken = `ExponentPushToken[ALIVE-${suffix}-ord]`;
    await seedToken(userId, deadToken);
    await seedToken(userId, aliveToken);

    process.env.EXPO_ACCESS_TOKEN = 'test-access-token';
    mockDeviceNotRegisteredFor(deadToken);

    const order = {
      id: randomUUID(),
      user_id: userId,
    } as Parameters<typeof dispatchOrderNotification>[0];
    await dispatchOrderNotification(order, 'accepted');

    expect(await tokenExists(deadToken)).toBe(false);
    expect(await tokenExists(aliveToken)).toBe(true);
  });

  it('dispatchMarketingNotification prunes only the DeviceNotRegistered token, not the transient one', async () => {
    const userId = await seedUser(true);
    const deadToken = `ExponentPushToken[DEAD-${suffix}-mkt]`;
    const aliveToken = `ExponentPushToken[ALIVE-${suffix}-mkt]`;
    await seedToken(userId, deadToken);
    await seedToken(userId, aliveToken);

    process.env.EXPO_ACCESS_TOKEN = 'test-access-token';
    mockDeviceNotRegisteredFor(deadToken);

    const sent = await dispatchMarketingNotification(userId, 'new_deal', {
      title: 'New deal',
      body: 'Check it out',
      targetScreen: 'deal_details',
    });
    expect(sent).toBe(true);

    expect(await tokenExists(deadToken)).toBe(false);
    expect(await tokenExists(aliveToken)).toBe(true);
  });
});
