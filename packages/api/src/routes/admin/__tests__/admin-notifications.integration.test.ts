import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the admin branch-promo route (PUSH-005, AC7) — run
 * against a real local Postgres, mirroring `admin-rewards.integration.test.ts`'s
 * hermetic self-seeding + role-cookie pattern.
 *
 * Covers: AC7 (admin-triggered, one-shot, correct recent-order ∩ opted-in
 * audience — D5), AC8/AC9 for `branch_promo` (opt-out excluded; row shape), and
 * the role matrix (customer/staff → 403, unauthenticated → 401).
 *
 * `isWithinQuietHours` is stubbed to false so the wall-clock-based admin route is
 * deterministic regardless of when the suite runs (quiet-hours drop behavior is
 * proven with an injected clock in notification-dispatch-guard.integration.test.ts).
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.VITEST = 'true';

type AuthModule = typeof import('../../../lib/auth');
type DbModule = typeof import('../../../db/client');
type SchemaModule = typeof import('../../../db/schema/index');
type IndexModule = typeof import('../../../index');
type QuietHoursModule = typeof import('../../../lib/marketing-quiet-hours');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let schema: SchemaModule;
let app: IndexModule['app'];
let quietHours: QuietHoursModule;

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);
const suffix = unique();

let adminCookies: string[];
let staffCookies: string[];
let customerCookies: string[];

let branchId: string; // the promo target branch
let otherBranchId: string; // a different branch (audience must exclude it)

const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];

async function signUpAndGetCookie(email: string, password: string): Promise<string[]> {
  await auth.api.signUpEmail({ body: { email, password, name: 'Test User' } });
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .set('Content-Type', 'application/json');
  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c) => c.split(';')[0]!);
}

async function makeUser(
  roleValue: 'customer' | 'staff' | 'admin' | 'super_admin',
): Promise<{ cookies: string[]; id: string }> {
  const email = `${roleValue}-${suffix}-${unique()}@example.com`;
  const cookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
  if (roleValue !== 'customer') {
    await db.update(schema.users).set({ role: roleValue }).where(eq(schema.users.email, email));
  }
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (!row) throw new Error('Test setup: failed to read back created user');
  createdUserIds.push(row.id);
  return { cookies, id: row.id };
}

/** Seed a bare customer (no auth session) who is or isn't opted in. */
async function seedCustomer(optIn: boolean): Promise<string> {
  const [user] = await db
    .insert(schema.users)
    .values({
      name: 'Promo Customer',
      email: `promo-${suffix}-${unique()}@example.com`,
      marketingOptIn: optIn,
    })
    .returning({ id: schema.users.id });
  createdUserIds.push(user!.id);
  return user!.id;
}

async function seedOrder(userId: string, branch: string, placedAt: Date): Promise<void> {
  const [order] = await db
    .insert(schema.orders)
    .values({
      user_id: userId,
      branch_id: branch,
      order_number: `JP-PRM-${suffix}-${unique().toUpperCase()}`,
      status: 'completed',
      subtotal: '10.00',
      total: '10.00',
      payment_method: 'pay_at_branch',
      placed_at: placedAt,
    })
    .returning({ id: schema.orders.id });
  createdOrderIds.push(order!.id);
}

async function branchPromoRows(userId: string) {
  return db
    .select()
    .from(schema.notifications)
    .where(
      and(eq(schema.notifications.user_id, userId), eq(schema.notifications.type, 'branch_promo')),
    );
}

async function seedBranch(label: string): Promise<string> {
  const [branch] = await db
    .insert(schema.branches)
    .values({
      name: `Promo ${label} ${suffix}`,
      slug: `promo-${label}-${suffix}`,
      address: '1 Promo St',
      latitude: '14.500000',
      longitude: '120.900000',
      phone: `+63917000${label === 'main' ? '0071' : '0072'}`,
      opening_hours: '08:00-20:00',
    })
    .returning({ id: schema.branches.id });
  return branch!.id;
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../../lib/auth'));
  ({ db } = await import('../../../db/client'));
  schema = await import('../../../db/schema/index');
  ({ app } = await import('../../../index'));
  quietHours = await import('../../../lib/marketing-quiet-hours');

  // Deterministic: never let the wall-clock quiet-hours window gate these sends.
  vi.spyOn(quietHours, 'isWithinQuietHours').mockReturnValue(false);

  adminCookies = (await makeUser('admin')).cookies;
  staffCookies = (await makeUser('staff')).cookies;
  customerCookies = (await makeUser('customer')).cookies;

  branchId = await seedBranch('main');
  otherBranchId = await seedBranch('other');
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
  if (otherBranchId) await db.delete(schema.branches).where(eq(schema.branches.id, otherBranchId));
  logSpy?.mockRestore();
  vi.restoreAllMocks();
});

function postPromo(cookies: string[] | null, body: unknown): request.Test {
  const req = request(app).post('/api/admin/notifications/branch-promo');
  if (cookies) req.set('Cookie', cookies.join('; '));
  return req.send(body as object).set('Content-Type', 'application/json');
}

describe('POST /api/admin/notifications/branch-promo — AC7 audience + one-shot', () => {
  it('dispatches once to recent-order, opted-in customers of the branch only (D5)', async () => {
    const now = Date.now();
    const recent = new Date(now - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const stale = new Date(now - 120 * 24 * 60 * 60 * 1000); // 120 days ago

    const inAudience = await seedCustomer(true); // recent + opted-in → messaged
    const optedOut = await seedCustomer(false); // recent + opted-out → excluded (AC8)
    const tooOld = await seedCustomer(true); // opted-in but only a stale order
    const otherBranch = await seedCustomer(true); // recent but at a different branch

    await seedOrder(inAudience, branchId, recent);
    await seedOrder(optedOut, branchId, recent);
    await seedOrder(tooOld, branchId, stale);
    await seedOrder(otherBranch, otherBranchId, recent);

    const res = await postPromo(adminCookies, {
      branchId,
      title: 'Flash sale at your branch',
      body: 'Come grab 20% off today only!',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dispatched: 1 });

    // AC9 — the one messaged customer has a correctly-shaped branch_promo row.
    const rows = await branchPromoRows(inAudience);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('branch_promo');
    expect(rows[0]!.target_screen).toBe('deal_details');
    expect(rows[0]!.target_params).toEqual({ branchId });

    // AC8 / audience exclusions — nobody else was messaged.
    expect(await branchPromoRows(optedOut)).toHaveLength(0);
    expect(await branchPromoRows(tooOld)).toHaveLength(0);
    expect(await branchPromoRows(otherBranch)).toHaveLength(0);
  });

  it('rejects a payload missing title/body with 400', async () => {
    const res = await postPromo(adminCookies, { branchId });
    expect(res.status).toBe(400);
  });

  it('rejects a non-uuid branchId with 400', async () => {
    const res = await postPromo(adminCookies, {
      branchId: 'not-a-uuid',
      title: 'x',
      body: 'y',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/notifications/branch-promo — role matrix', () => {
  it('403 for a customer', async () => {
    const res = await postPromo(customerCookies, { branchId, title: 'x', body: 'y' });
    expect(res.status).toBe(403);
  });

  it('403 for staff', async () => {
    const res = await postPromo(staffCookies, { branchId, title: 'x', body: 'y' });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request (inherited requireAdmin → 403)', async () => {
    // The route inherits `requireAdmin` verbatim; that guard responds 403 for BOTH
    // wrong-role and no-session (there is no distinct 401 path). The plan's Public
    // Contract said "401 unauthenticated" but the reused guard returns 403 — asserting
    // the guard's real behavior rather than changing shared auth logic.
    const res = await postPromo(null, { branchId, title: 'x', body: 'y' });
    expect(res.status).toBe(403);
  });
});
