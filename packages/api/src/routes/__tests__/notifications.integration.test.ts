/* eslint-disable @typescript-eslint/no-explicit-any -- fetch/supertest JSON
   bodies are loosely typed at the test boundary; assertions narrow them. */
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * AC-4 (PUSH-004 / #75) — GET /notifications session-scoping.
 *
 * Returns ONLY the caller's own rows, newest-first, matching the mobile
 * `AppNotification` shape. Also covers PATCH /notifications/:id/read
 * (session-scoped, 404 on a foreign row so existence is never leaked).
 *
 * Hermetic: seeds its OWN two users + notification rows; cleans up in afterAll.
 */

process.env.DATABASE_URL ??= 'postgres://jojo:jojo@localhost:5432/jojopotato';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
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
const suffix = unique();

let userAId: string;
let userBId: string;
let userACookies: string[];
let userBCookies: string[];

async function signUpAndGetCookie(email: string, password: string): Promise<string[]> {
  await auth.api.signUpEmail({ body: { email, password, name: 'Test User' } });
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .set('Content-Type', 'application/json');
  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c: string) => c.split(';')[0]!);
}

async function userIdFor(email: string): Promise<string> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return row!.id;
}

async function insertNotification(opts: {
  userId: string;
  type: string;
  title: string;
  createdAt: Date;
  targetParams?: Record<string, string>;
}): Promise<void> {
  await db.insert(schema.notifications).values({
    user_id: opts.userId,
    type: opts.type,
    title: opts.title,
    body: `${opts.title} body`,
    target_screen: 'order_tracking',
    target_params: opts.targetParams ?? null,
    created_at: opts.createdAt,
  });
}

beforeAll(async () => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ auth } = await import('../../lib/auth'));
  ({ db } = await import('../../db/client'));
  schema = await import('../../db/schema/index');
  ({ app } = await import('../../index'));

  const emailA = `notif-a-${suffix}@example.com`;
  const emailB = `notif-b-${suffix}@example.com`;
  userACookies = await signUpAndGetCookie(emailA, 'sup3r-secret-pw');
  userBCookies = await signUpAndGetCookie(emailB, 'sup3r-secret-pw');
  userAId = await userIdFor(emailA);
  userBId = await userIdFor(emailB);

  const now = Date.now();
  // User A: 3 rows with distinct timestamps (oldest → newest).
  await insertNotification({
    userId: userAId,
    type: 'order_accepted',
    title: 'A oldest',
    createdAt: new Date(now - 30_000),
    targetParams: { orderId: 'order-a-1' },
  });
  await insertNotification({
    userId: userAId,
    type: 'order_preparing',
    title: 'A middle',
    createdAt: new Date(now - 20_000),
  });
  await insertNotification({
    userId: userAId,
    type: 'order_ready',
    title: 'A newest',
    createdAt: new Date(now - 10_000),
  });
  // User B: 1 row that must NEVER appear in A's list.
  await insertNotification({
    userId: userBId,
    type: 'order_ready',
    title: 'B private',
    createdAt: new Date(now - 5_000),
  });
});

afterAll(async () => {
  await db.delete(schema.notifications).where(eq(schema.notifications.user_id, userAId));
  await db.delete(schema.notifications).where(eq(schema.notifications.user_id, userBId));
  await db.delete(schema.users).where(eq(schema.users.id, userAId));
  await db.delete(schema.users).where(eq(schema.users.id, userBId));
  logSpy?.mockRestore();
});

describe('GET /notifications — AC-4 session scoping', () => {
  it("returns only the caller's own rows, newest-first, in AppNotification shape", async () => {
    const res = await request(app).get('/notifications').set('Cookie', userACookies.join('; '));
    expect(res.status).toBe(200);

    const list = res.body.notifications as any[];
    const titles = list.map((n) => n.title);

    // Only A's rows — never B's.
    expect(titles).toEqual(['A newest', 'A middle', 'A oldest']);
    expect(titles).not.toContain('B private');

    // Shape matches AppNotification (camelCase, ISO createdAt, targetParams).
    const newest = list[0];
    expect(newest).toMatchObject({
      userId: userAId,
      type: 'order_ready',
      title: 'A newest',
      targetScreen: 'order_tracking',
    });
    expect(typeof newest.createdAt).toBe('string');
    expect(newest.id).toBeTruthy();

    // targetParams round-trips from jsonb for the row that had one.
    const oldest = list.find((n) => n.title === 'A oldest');
    expect(oldest.targetParams).toEqual({ orderId: 'order-a-1' });
  });

  it('requires a session (401 without a cookie)', async () => {
    const res = await request(app).get('/notifications');
    expect(res.status).toBe(401);
  });

  it("PATCH /notifications/:id/read marks the caller's own row read", async () => {
    const listRes = await request(app).get('/notifications').set('Cookie', userACookies.join('; '));
    const target = (listRes.body.notifications as any[]).find((n) => n.title === 'A middle');
    expect(target.readAt).toBeUndefined();

    const patchRes = await request(app)
      .patch(`/notifications/${target.id}/read`)
      .set('Cookie', userACookies.join('; '));
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.notification.readAt).toBeTruthy();
  });

  it("PATCH /notifications/:id/read on another user's row returns 404 (no existence leak)", async () => {
    const listRes = await request(app).get('/notifications').set('Cookie', userACookies.join('; '));
    const aRowId = (listRes.body.notifications as any[])[0].id;

    // User B tries to mark user A's row read.
    const res = await request(app)
      .patch(`/notifications/${aRowId}/read`)
      .set('Cookie', userBCookies.join('; '));
    expect(res.status).toBe(404);
  });
});
