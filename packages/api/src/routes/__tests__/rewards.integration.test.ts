/* eslint-disable @typescript-eslint/no-explicit-any -- fetch/supertest JSON
   bodies are loosely typed at the test boundary; assertions narrow them. */
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the STAR-002 read-only rewards endpoints
 * (`GET /rewards/summary`, `GET /rewards/available`, `GET /rewards/history`).
 *
 * Hermetic: seeds its OWN users / user_stars / star_transactions and cleans them
 * up in afterAll. Runs against a real local Postgres (the vitest global-setup
 * recreates a pristine per-run test DB, migrates it, and runs `runSeed()` — which
 * inserts exactly one active 5-star reward). Assertions that depend on the reward
 * catalog are written against that seeded 5-star rule (LD1).
 *
 * Covers: AC3 (history reverse-chron order + earned/adjusted contents), AC1/AC2
 * summary math (3/5 not unlocked, 5/5 unlocked, 6/5 clamped server-side),
 * missing-user_stars→0, empty-history→[], no-cookie→401, cross-user isolation,
 * available list ordered asc, and the no-active-reward defensive edge.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
// Guard the app.listen in index.ts so importing `app` never binds a port.
process.env.VITEST = 'true';

type AuthModule = typeof import('../../lib/auth');
type DbModule = typeof import('../../db/client');
type SchemaModule = typeof import('../../db/schema/index');
type IndexModule = typeof import('../../index');

let auth: AuthModule['auth'];
let db: DbModule['db'];
let schema: SchemaModule;
let app: IndexModule['app'];

let logSpy: ReturnType<typeof vi.spyOn>;

const unique = () => Math.random().toString(36).slice(2, 10);

/**
 * Sign up + sign in an email/password user through the real HTTP surface, then
 * return the session cookie(s) so subsequent requests authenticate as that user.
 * Also resolves and returns the user's id (for scoping fixtures).
 */
async function signUpUser(
  email: string,
  password: string,
): Promise<{ cookies: string[]; userId: string }> {
  await auth.api.signUpEmail({ body: { email, password, name: 'Rewards Test User' } });
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .set('Content-Type', 'application/json');
  const setCookie = res.headers['set-cookie'];
  const cookieList = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookies = cookieList.map((c) => c.split(';')[0]!);

  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return { cookies, userId: row!.id };
}

const suffix = unique();

// userA — has 3/5 stars and an earned+adjusted history (AC1, AC3).
let userAId: string;
let userACookies: string[];
// userB — cross-user isolation partner (2 stars, own transactions).
let userBId: string;
let userBCookies: string[];
// userC — no user_stars row and no transactions (missing-row / empty-history edge).
let userCId: string;
let userCCookies: string[];
// userD — exactly 5/5 stars (AC2 unlocked).
let userDId: string;
let userDCookies: string[];
// userE — 6 stars over the 5-star threshold (AC2 clamp).
let userEId: string;
let userECookies: string[];

const createdUserIds: string[] = [];

async function setStars(userId: string, current: number, lifetime: number): Promise<void> {
  await db
    .insert(schema.userStars)
    .values({ user_id: userId, current_stars: current, lifetime_stars: lifetime })
    .onConflictDoUpdate({
      target: schema.userStars.user_id,
      set: { current_stars: current, lifetime_stars: lifetime, updated_at: new Date() },
    });
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../lib/auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));

  const a = await signUpUser(`rewards-a-${suffix}@example.com`, 'sup3r-secret-pw');
  userAId = a.userId;
  userACookies = a.cookies;
  const b = await signUpUser(`rewards-b-${suffix}@example.com`, 'sup3r-secret-pw');
  userBId = b.userId;
  userBCookies = b.cookies;
  const c = await signUpUser(`rewards-c-${suffix}@example.com`, 'sup3r-secret-pw');
  userCId = c.userId;
  userCCookies = c.cookies;
  const d = await signUpUser(`rewards-d-${suffix}@example.com`, 'sup3r-secret-pw');
  userDId = d.userId;
  userDCookies = d.cookies;
  const e = await signUpUser(`rewards-e-${suffix}@example.com`, 'sup3r-secret-pw');
  userEId = e.userId;
  userECookies = e.cookies;
  createdUserIds.push(userAId, userBId, userCId, userDId, userEId);

  // userA: 3 current / 4 lifetime (one was reversed). History (oldest → newest):
  // earned, earned, earned, earned, adjusted(-1). We insert with explicit,
  // spaced created_at so reverse-chron order is deterministic.
  await setStars(userAId, 3, 4);
  const base = Date.now();
  const aTx = [
    { type: 'earned' as const, stars: 1, description: 'Earned 1', offset: 5 },
    { type: 'earned' as const, stars: 1, description: 'Earned 2', offset: 4 },
    { type: 'earned' as const, stars: 1, description: 'Earned 3', offset: 3 },
    { type: 'earned' as const, stars: 1, description: 'Earned 4', offset: 2 },
    { type: 'adjusted' as const, stars: -1, description: 'Reversed for refund', offset: 1 },
  ];
  await db.insert(schema.starTransactions).values(
    aTx.map((t) => ({
      user_id: userAId,
      order_id: null,
      type: t.type,
      stars: t.stars,
      description: t.description,
      created_at: new Date(base - t.offset * 60_000),
    })),
  );

  // userB: 2 stars + its own single earned transaction (isolation partner).
  await setStars(userBId, 2, 2);
  await db.insert(schema.starTransactions).values({
    user_id: userBId,
    order_id: null,
    type: 'earned',
    stars: 1,
    description: 'userB earned',
    created_at: new Date(base - 1_000),
  });

  // userC: no user_stars row, no transactions (edge).
  // userD: exactly 5/5. userE: 6 over threshold.
  await setStars(userDId, 5, 5);
  await setStars(userEId, 6, 6);
});

afterAll(async () => {
  await db
    .delete(schema.starTransactions)
    .where((await import('drizzle-orm')).inArray(schema.starTransactions.user_id, createdUserIds));
  await db
    .delete(schema.userStars)
    .where((await import('drizzle-orm')).inArray(schema.userStars.user_id, createdUserIds));
  await db
    .delete(schema.users)
    .where((await import('drizzle-orm')).inArray(schema.users.id, createdUserIds));
  logSpy?.mockRestore();
});

describe('GET /rewards/summary', () => {
  // AC1 — 3/5 not unlocked; targets the seeded 5-star reward.
  it('returns currentStars/requiredStars for a 3/5 user, not unlocked', async () => {
    const res = await request(app).get('/rewards/summary').set('Cookie', userACookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.currentStars).toBe(3);
    expect(res.body.lifetimeStars).toBe(4);
    expect(res.body.requiredStars).toBe(5);
    expect(res.body.isUnlocked).toBe(false);
    expect(res.body.reward).not.toBeNull();
    expect(res.body.reward.requiredStars).toBe(5);
    expect(res.body.reward.isActive).toBe(true);
  });

  // AC2 (reward-auto-redeem) — the summary's target reward carries eligibleProductId.
  // runSeed() seeds free_item rewards with a non-null eligible_product_id (e.g. the
  // 4-star "Free Lemonade" → lemonade product); the MIN active reward is a free_item.
  it('includes a non-null eligibleProductId UUID on the summary target reward', async () => {
    const res = await request(app).get('/rewards/summary').set('Cookie', userACookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.reward).not.toBeNull();
    expect(typeof res.body.reward.eligibleProductId).toBe('string');
    expect(res.body.reward.eligibleProductId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  // AC2 — 5/5 unlocked.
  it('returns isUnlocked=true for a user at exactly the threshold (5/5)', async () => {
    const res = await request(app).get('/rewards/summary').set('Cookie', userDCookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.currentStars).toBe(5);
    expect(res.body.requiredStars).toBe(5);
    expect(res.body.isUnlocked).toBe(true);
  });

  // AC2 clamp — 6/5 still unlocked (server-side isUnlocked, no clamp of currentStars).
  it('returns isUnlocked=true for a user over the threshold (6/5)', async () => {
    const res = await request(app).get('/rewards/summary').set('Cookie', userECookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.currentStars).toBe(6);
    expect(res.body.requiredStars).toBe(5);
    expect(res.body.isUnlocked).toBe(true);
  });

  // Edge — missing user_stars row reads as 0 (NOT 404).
  it('returns 0 stars (not 404) for a user with no user_stars row', async () => {
    const res = await request(app).get('/rewards/summary').set('Cookie', userCCookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.currentStars).toBe(0);
    expect(res.body.lifetimeStars).toBe(0);
    expect(res.body.isUnlocked).toBe(false);
  });

  // Auth — no cookie → 401.
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/rewards/summary');
    expect(res.status).toBe(401);
  });

  // Defensive — no active reward → requiredStars:0, reward:null, not unlocked.
  it('degrades gracefully when no active reward exists', async () => {
    // Temporarily deactivate all rewards, then restore.
    const activeRows = await db
      .select({ id: schema.rewards.id })
      .from(schema.rewards)
      .where(eq(schema.rewards.is_active, true));
    await db.update(schema.rewards).set({ is_active: false });
    try {
      const res = await request(app).get('/rewards/summary').set('Cookie', userACookies.join('; '));
      expect(res.status).toBe(200);
      expect(res.body.requiredStars).toBe(0);
      expect(res.body.reward).toBeNull();
      expect(res.body.isUnlocked).toBe(false);
    } finally {
      for (const row of activeRows) {
        await db
          .update(schema.rewards)
          .set({ is_active: true })
          .where(eq(schema.rewards.id, row.id));
      }
    }
  });
});

describe('GET /rewards/available', () => {
  it('returns active rewards ordered by required_stars ascending', async () => {
    const res = await request(app).get('/rewards/available').set('Cookie', userACookies.join('; '));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rewards)).toBe(true);
    // At least the seeded 5-star reward is present and active.
    expect(res.body.rewards.length).toBeGreaterThanOrEqual(1);
    const required = res.body.rewards.map((r: any) => r.requiredStars);
    const sorted = [...required].sort((x, y) => x - y);
    expect(required).toEqual(sorted);
    expect(res.body.rewards.every((r: any) => r.isActive === true)).toBe(true);
  });

  // AC2 (reward-auto-redeem) — every reward carries the eligibleProductId field,
  // and the seeded free-item rewards (REWARD_ROADMAP → classic-fries etc.) carry a
  // real UUID. The `null` branch of the `string | null` field is proven by the
  // mobile helper/derive/AC6 tests, not by this seed (the live roadmap is all
  // free-item rewards, each mapped to an eligible product).
  it('carries a non-null eligibleProductId UUID on each available seeded reward', async () => {
    const res = await request(app).get('/rewards/available').set('Cookie', userACookies.join('; '));
    expect(res.status).toBe(200);
    // The field is present (never undefined) on every row.
    expect(res.body.rewards.every((r: any) => 'eligibleProductId' in r)).toBe(true);
    // At least one seeded free-item reward resolves to a real product UUID.
    const withProduct = res.body.rewards.filter((r: any) => r.eligibleProductId !== null);
    expect(withProduct.length).toBeGreaterThanOrEqual(1);
    expect(withProduct[0].eligibleProductId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/rewards/available');
    expect(res.status).toBe(401);
  });
});

describe('GET /rewards/history', () => {
  // AC3 — reverse-chron order + earned/adjusted contents.
  it("returns the caller's transactions in reverse-chronological order, incl. adjusted rows", async () => {
    const res = await request(app).get('/rewards/history').set('Cookie', userACookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(5);

    // Newest-first: the adjusted(-1) reversal was inserted last (smallest offset).
    expect(res.body.transactions[0].type).toBe('adjusted');
    expect(res.body.transactions[0].stars).toBe(-1);

    // Strictly descending created_at.
    const times = res.body.transactions.map((t: any) => new Date(t.createdAt).getTime());
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
    }

    // Contents: exactly one adjusted row + four earned rows, all owned by userA.
    const types = res.body.transactions.map((t: any) => t.type);
    expect(types.filter((t: string) => t === 'earned')).toHaveLength(4);
    expect(types.filter((t: string) => t === 'adjusted')).toHaveLength(1);
    expect(res.body.transactions.every((t: any) => t.userId === userAId)).toBe(true);
  });

  // Cross-user isolation — userB never sees userA's rows and vice versa.
  it('scopes history strictly to the authenticated user (no cross-user bleed)', async () => {
    const resB = await request(app).get('/rewards/history').set('Cookie', userBCookies.join('; '));
    expect(resB.status).toBe(200);
    expect(resB.body.transactions).toHaveLength(1);
    expect(resB.body.transactions.every((t: any) => t.userId === userBId)).toBe(true);
    // userB must NOT see any of userA's rows.
    expect(resB.body.transactions.some((t: any) => t.userId === userAId)).toBe(false);
  });

  // Edge — empty history → [].
  it('returns an empty array for a user with no transactions', async () => {
    const res = await request(app).get('/rewards/history').set('Cookie', userCCookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.transactions).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/rewards/history');
    expect(res.status).toBe(401);
  });
});
