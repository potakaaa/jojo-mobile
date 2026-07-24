/* eslint-disable @typescript-eslint/no-explicit-any -- fetch JSON bodies and the
   getSession stub are loosely typed at the test boundary; assertions narrow them. */
import type { AddressInfo } from 'node:net';

import { and, eq } from 'drizzle-orm';
import express from 'express';
import { Expo } from 'expo-server-sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * push-notifications-fixes — AC1–AC4 for the staff new-order push.
 *
 * When a customer places an order at branch B, every staff member assigned to
 * branch B gets a `staff_new_order` notification row + a push; staff at any other
 * branch get NOTHING (branch isolation, AC1). The dispatch is awaited-after-commit
 * and never throws, so a staff-push failure can never turn a successful placement
 * into a 500 (AC2). The row targets the placed order (AC3), and a permanently-dead
 * staff token is pruned via the shared `sendAndPrune` (AC4).
 *
 * Hermetic self-seed (mirrors orders.test.ts / notifications.integration.test.ts):
 * seeds its own customer + branches + staff + product; auth is stubbed at the
 * `auth.api.getSession` seam (`x-test-user` header selects the caller). All DB
 * writes are real, against the DB test/global-setup.ts provisions + migrates.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';
// Baseline: creds unset (matches CI + the log-fallback path). Saved/restored so
// this suite never pollutes ambient process.env for sibling files in the worker.
const originalExpoToken = process.env.EXPO_ACCESS_TOKEN;
delete process.env.EXPO_ACCESS_TOKEN;

type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type PushModule = typeof import('../../lib/push-provider');
type AuthModule = typeof import('../../lib/auth');

let db: DbModule['db'];
let schema: SchemaModule;
let push: PushModule;
let auth: AuthModule['auth'];
let base: string;
let server: ReturnType<express.Express['listen']>;

/** (Re)install the deterministic session stub: x-test-user header -> user id. */
function installSessionStub(): void {
  vi.spyOn(auth.api, 'getSession').mockImplementation((async ({ headers }: any) => {
    const id = headers.get('x-test-user');
    if (!id) return null;
    return { session: { id: `sess-${id}`, userId: id }, user: { id } };
  }) as any);
}

const uid = () => Math.random().toString(36).slice(2, 10);
const suffix = uid();

/**
 * Opening hours that read as OPEN at every instant of every day (mirrors
 * `orders.test.ts`). `POST /orders` gates placement on
 * `getIsOpenNow(branch.opening_hours)`, which JSON-parses this column — a bare
 * `HH:MM`-range string is not JSON, so it parses as closed and every placement
 * 400s. `close: '00:00'` means end-of-day, so open 00:00 / close 00:00 is open
 * the whole day, every weekday, whatever day CI lands on.
 */
const ALWAYS_OPEN_HOURS = JSON.stringify({
  sun: { open: '00:00', close: '00:00' },
  mon: { open: '00:00', close: '00:00' },
  tue: { open: '00:00', close: '00:00' },
  wed: { open: '00:00', close: '00:00' },
  thu: { open: '00:00', close: '00:00' },
  fri: { open: '00:00', close: '00:00' },
  sat: { open: '00:00', close: '00:00' },
});

let customerId: string;
let branchBId: string;
let branchCId: string;
let staffB1Id: string; // branch B, has a device token
let staffB2Id: string; // branch B, no device token
let staffC1Id: string; // branch C, has a device token
let productId: string;
let categoryId: string;

const staffB1Token = `ExponentPushToken[B1-${suffix}]`;
const staffC1Token = `ExponentPushToken[C1-${suffix}]`;

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

function orderBody(branchId: string) {
  return {
    branchId,
    paymentMethod: 'pay_at_branch',
    items: [{ productId, quantity: 1, selectedOptions: [] }],
  };
}

/** Staff `staff_new_order` rows for a given staff user. */
async function staffOrderRows(userId: string) {
  return db
    .select()
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.user_id, userId),
        eq(schema.notifications.type, 'staff_new_order'),
      ),
    );
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
  push = await import('../../lib/push-provider');
  const { ordersRouter } = await import('../orders');
  ({ auth } = await import('../../lib/auth'));

  installSessionStub();

  const app = express();
  app.use(express.json());
  app.use('/orders', ordersRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Customer (default role) — places the order.
  const [customer] = await db
    .insert(schema.users)
    .values({ name: 'Customer', email: `cust-${suffix}@example.com` })
    .returning();
  customerId = customer!.id;

  const [branchB] = await db
    .insert(schema.branches)
    .values({
      name: `Branch B ${suffix}`,
      slug: `branch-b-${suffix}`,
      address: '1 St',
      latitude: '14.5',
      longitude: '120.9',
      phone: '+639170000020',
      opening_hours: ALWAYS_OPEN_HOURS,
      estimated_prep_minutes: 20,
    })
    .returning();
  branchBId = branchB!.id;

  const [branchC] = await db
    .insert(schema.branches)
    .values({
      name: `Branch C ${suffix}`,
      slug: `branch-c-${suffix}`,
      address: '2 St',
      latitude: '14.6',
      longitude: '120.8',
      phone: '+639170000021',
      opening_hours: ALWAYS_OPEN_HOURS,
      estimated_prep_minutes: 30,
    })
    .returning();
  branchCId = branchC!.id;

  // Staff at branch B (with token), branch B (no token), branch C (with token).
  const [staffB1] = await db
    .insert(schema.users)
    .values({
      name: 'Staff B1',
      email: `staff-b1-${suffix}@example.com`,
      role: 'staff',
      assignedBranchId: branchBId,
    })
    .returning();
  staffB1Id = staffB1!.id;

  const [staffB2] = await db
    .insert(schema.users)
    .values({
      name: 'Staff B2',
      email: `staff-b2-${suffix}@example.com`,
      role: 'staff',
      assignedBranchId: branchBId,
    })
    .returning();
  staffB2Id = staffB2!.id;

  const [staffC1] = await db
    .insert(schema.users)
    .values({
      name: 'Staff C1',
      email: `staff-c1-${suffix}@example.com`,
      role: 'staff',
      assignedBranchId: branchCId,
    })
    .returning();
  staffC1Id = staffC1!.id;

  await db.insert(schema.deviceTokens).values([
    {
      user_id: staffB1Id,
      device_id: `dev-b1-${suffix}`,
      push_token: staffB1Token,
      platform: 'ios',
    },
    {
      user_id: staffC1Id,
      device_id: `dev-c1-${suffix}`,
      push_token: staffC1Token,
      platform: 'ios',
    },
  ]);

  const [category] = await db
    .insert(schema.categories)
    .values({ name: `Cat ${suffix}`, slug: `cat-${suffix}`, sort_order: 1 })
    .returning();
  categoryId = category!.id;

  const [product] = await db
    .insert(schema.products)
    .values({
      category_id: categoryId,
      name: `Fries ${suffix}`,
      slug: `fries-${suffix}`,
      base_price: '5.00',
    })
    .returning();
  productId = product!.id;

  // Available at branch B only (the branch orders are placed at).
  await db
    .insert(schema.branchProductAvailability)
    .values({ branch_id: branchBId, product_id: productId, is_available: true });
});

afterEach(() => {
  // Restore any per-test Expo / sendPush / console mocks.
  vi.restoreAllMocks();
  delete process.env.EXPO_ACCESS_TOKEN;
  // restoreAllMocks also removed the getSession stub — re-install it so later
  // tests can still authenticate the customer placing the order.
  installSessionStub();
});

afterAll(async () => {
  // Orders + items first (FK), then the notification rows, tokens, catalog, and
  // finally detach staff from branches before deleting users/branches.
  const orderRows = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(eq(schema.orders.user_id, customerId));
  const orderIds = orderRows.map((o) => o.id);
  for (const id of orderIds) {
    await db.delete(schema.orderItems).where(eq(schema.orderItems.order_id, id));
  }
  await db.delete(schema.orders).where(eq(schema.orders.user_id, customerId));

  for (const userId of [customerId, staffB1Id, staffB2Id, staffC1Id]) {
    if (!userId) continue;
    await db.delete(schema.notifications).where(eq(schema.notifications.user_id, userId));
    await db.delete(schema.deviceTokens).where(eq(schema.deviceTokens.user_id, userId));
  }

  await db
    .delete(schema.branchProductAvailability)
    .where(eq(schema.branchProductAvailability.product_id, productId));
  await db.delete(schema.products).where(eq(schema.products.id, productId));
  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));

  for (const userId of [customerId, staffB1Id, staffB2Id, staffC1Id]) {
    if (userId) await db.delete(schema.users).where(eq(schema.users.id, userId));
  }
  for (const branchId of [branchBId, branchCId]) {
    if (branchId) await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
  }

  server?.close();
  if (originalExpoToken === undefined) delete process.env.EXPO_ACCESS_TOKEN;
  else process.env.EXPO_ACCESS_TOKEN = originalExpoToken;
});

describe('POST /orders — staff new-order notification (AC1/AC3, branch isolation)', () => {
  it('notifies every staff at the order branch, targets the order, and skips other-branch staff', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { status, json } = await post('/orders', {
      user: customerId,
      body: orderBody(branchBId),
    });
    expect(status).toBe(201);
    const orderId = json.order.id as string;
    expect(orderId).toBeTruthy();

    // AC1 — branch-B staff (both B1 and B2) get a row; branch-C staff get none.
    const b1Rows = await staffOrderRows(staffB1Id);
    const b2Rows = await staffOrderRows(staffB2Id);
    const c1Rows = await staffOrderRows(staffC1Id);
    expect(b1Rows.some((r) => (r.target_params as any)?.orderId === orderId)).toBe(true);
    expect(b2Rows.some((r) => (r.target_params as any)?.orderId === orderId)).toBe(true);
    expect(c1Rows.some((r) => (r.target_params as any)?.orderId === orderId)).toBe(false);

    // AC3 — B1's row targets the placed order and stays PII-free (orderId only).
    const b1Row = b1Rows.find((r) => (r.target_params as any)?.orderId === orderId)!;
    expect(b1Row.target_screen).toBe('staff_order_detail');
    expect(b1Row.target_params).toEqual({ orderId });

    logSpy.mockRestore();
  });
});

describe('POST /orders — staff dispatch resilience (AC2)', () => {
  it('still returns 201 when the staff push send throws', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Force the staff dispatch's send to reject — its own try/catch must swallow
    // it so the already-committed placement still returns 201. Asserting the spy
    // was actually called keeps this non-vacuous (proves the throw path ran).
    const sendSpy = vi.spyOn(push, 'sendPush').mockRejectedValue(new Error('boom'));

    const { status } = await post('/orders', { user: customerId, body: orderBody(branchBId) });

    expect(status).toBe(201);
    expect(sendSpy).toHaveBeenCalled();
  });
});

describe('POST /orders — staff dead-token prune (AC4)', () => {
  it('prunes a DeviceNotRegistered staff token via the shared sendAndPrune', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Live-send path (log-fallback returns all-'ok' and could NEVER prune — E2):
    // set the access token and mock the Expo SDK to report the branch-B staff
    // token as permanently dead.
    process.env.EXPO_ACCESS_TOKEN = 'test-access-token';
    vi.spyOn(Expo, 'isExpoPushToken').mockReturnValue(true);
    vi.spyOn(Expo.prototype, 'sendPushNotificationsAsync').mockImplementation(async (messages) =>
      messages.map((m) => {
        const to = Array.isArray(m.to) ? m.to[0]! : m.to;
        return to === staffB1Token
          ? {
              status: 'error' as const,
              message: 'gone',
              details: { error: 'DeviceNotRegistered' as const, expoPushToken: to },
            }
          : { status: 'ok' as const, id: 'r' };
      }),
    );

    expect(await tokenExists(staffB1Token)).toBe(true);

    const { status } = await post('/orders', { user: customerId, body: orderBody(branchBId) });
    expect(status).toBe(201);

    // The dead branch-B staff token is pruned; the branch-C token (never sent to
    // for a branch-B order) is untouched.
    expect(await tokenExists(staffB1Token)).toBe(false);
    expect(await tokenExists(staffC1Token)).toBe(true);
  });
});
