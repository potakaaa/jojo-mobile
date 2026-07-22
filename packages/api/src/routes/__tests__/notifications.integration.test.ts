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

/**
 * notif-delete-pagination — cursor pagination + independent unreadCount + DELETE.
 *
 * Hermetic: seeds its OWN two users + notification rows, isolated from the AC-4
 * suite above (its own `beforeAll`/`afterAll`). Timestamps are spaced by index so
 * newest-first ordering is deterministic.
 */
describe('GET /notifications — pagination + unreadCount + DELETE', () => {
  const psuffix = unique();
  let ownerId: string;
  let strangerId: string;
  let ownerCookies: string[];

  // 15 owner rows (> one 10-row page), oldest→newest by index; the last 3 are read.
  const OWNER_ROW_COUNT = 15;
  const READ_ROW_COUNT = 3; // the 3 newest owner rows are pre-read
  const now = Date.now();

  beforeAll(async () => {
    const ownerEmail = `notif-pg-owner-${psuffix}@example.com`;
    const strangerEmail = `notif-pg-stranger-${psuffix}@example.com`;
    ownerCookies = await signUpAndGetCookie(ownerEmail, 'sup3r-secret-pw');
    // The stranger only needs to EXIST (owner tries to delete its row); no session used.
    await signUpAndGetCookie(strangerEmail, 'sup3r-secret-pw');
    ownerId = await userIdFor(ownerEmail);
    strangerId = await userIdFor(strangerEmail);

    // Seed 15 owner rows with strictly increasing timestamps. Rows 0..11 unread,
    // rows 12..14 (the 3 newest) read — so 12 remain unread across >1 page.
    for (let i = 0; i < OWNER_ROW_COUNT; i++) {
      const isRead = i >= OWNER_ROW_COUNT - READ_ROW_COUNT;
      await db.insert(schema.notifications).values({
        user_id: ownerId,
        type: 'order_ready',
        title: `owner ${String(i).padStart(2, '0')}`,
        body: `owner ${i} body`,
        target_screen: 'order_tracking',
        target_params: null,
        created_at: new Date(now + i * 1000),
        read_at: isRead ? new Date(now + i * 1000) : null,
      });
    }
    // A single stranger row that must never be reachable by the owner's DELETE.
    await db.insert(schema.notifications).values({
      user_id: strangerId,
      type: 'order_ready',
      title: 'stranger private',
      body: 'stranger body',
      target_screen: 'order_tracking',
      target_params: null,
      created_at: new Date(now + 999_000),
      read_at: null,
    });
  });

  afterAll(async () => {
    await db.delete(schema.notifications).where(eq(schema.notifications.user_id, ownerId));
    await db.delete(schema.notifications).where(eq(schema.notifications.user_id, strangerId));
    await db.delete(schema.users).where(eq(schema.users.id, ownerId));
    await db.delete(schema.users).where(eq(schema.users.id, strangerId));
  });

  it('AC1 — default page returns at most 10 rows, newest-first', async () => {
    const res = await request(app).get('/notifications').set('Cookie', ownerCookies.join('; '));
    expect(res.status).toBe(200);
    const list = res.body.notifications as any[];
    expect(list.length).toBe(10);
    // Newest-first: owner 14 is the newest of the 15 seeded rows.
    expect(list[0].title).toBe('owner 14');
    const times = list.map((n) => Date.parse(n.createdAt));
    const sortedDesc = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sortedDesc);
    expect(res.body.nextCursor).toBeTruthy();
  });

  it('AC2 — cursor returns the correct next page with stable order and no overlap', async () => {
    const page1 = await request(app).get('/notifications').set('Cookie', ownerCookies.join('; '));
    const p1 = page1.body.notifications as any[];
    const cursor = page1.body.nextCursor as string;

    const page2 = await request(app)
      .get(`/notifications?cursor=${encodeURIComponent(cursor)}`)
      .set('Cookie', ownerCookies.join('; '));
    const p2 = page2.body.notifications as any[];

    // 15 total → page 2 holds the remaining 5.
    expect(p2.length).toBe(5);
    // No overlap between the two pages.
    const p1Ids = new Set(p1.map((n) => n.id));
    for (const n of p2) expect(p1Ids.has(n.id)).toBe(false);
    // Page 2 is strictly older than page 1's last row (stable descending order).
    const p1LastTime = Date.parse(p1[p1.length - 1].createdAt);
    for (const n of p2) expect(Date.parse(n.createdAt)).toBeLessThan(p1LastTime);
    expect(p2[0].title).toBe('owner 04');
  });

  it('AC3 — nextCursor is null / no further rows on the last page', async () => {
    const page1 = await request(app).get('/notifications').set('Cookie', ownerCookies.join('; '));
    const page2 = await request(app)
      .get(`/notifications?cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .set('Cookie', ownerCookies.join('; '));
    // Page 2 is the terminal page (5 ≤ 10), so nextCursor must be null.
    expect(page2.body.nextCursor).toBeNull();
  });

  it('AC10 — unreadCount reflects the true total when unread rows exceed one page', async () => {
    const res = await request(app).get('/notifications').set('Cookie', ownerCookies.join('; '));
    // 15 seeded, 3 newest pre-read → 12 unread, which is > one 10-row page.
    expect(res.body.unreadCount).toBe(OWNER_ROW_COUNT - READ_ROW_COUNT);
    // And it is NOT derived from the 10 loaded rows.
    expect(res.body.notifications.length).toBe(10);
  });

  it('AC6 — DELETE hard-removes the row and a subsequent GET no longer returns it', async () => {
    const before = await request(app).get('/notifications').set('Cookie', ownerCookies.join('; '));
    const victim = (before.body.notifications as any[])[0];

    const del = await request(app)
      .delete(`/notifications/${victim.id}`)
      .set('Cookie', ownerCookies.join('; '));
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    // Absent from the DB entirely (hard delete, no soft-delete column).
    const [dbRow] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, victim.id));
    expect(dbRow).toBeUndefined();

    // Absent from a subsequent GET across all pages.
    const p1 = await request(app).get('/notifications').set('Cookie', ownerCookies.join('; '));
    const p2 = await request(app)
      .get(`/notifications?cursor=${encodeURIComponent(p1.body.nextCursor)}`)
      .set('Cookie', ownerCookies.join('; '));
    const allIds = [...p1.body.notifications, ...p2.body.notifications].map((n: any) => n.id);
    expect(allIds).not.toContain(victim.id);
  });

  it("AC8 — DELETE of another user's row returns 404 and the row persists", async () => {
    // Owner looks up the stranger's row id directly from the DB (never exposed via API).
    const [strangerRow] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.user_id, strangerId));

    const del = await request(app)
      .delete(`/notifications/${strangerRow!.id}`)
      .set('Cookie', ownerCookies.join('; '));
    expect(del.status).toBe(404);

    // The stranger's row still exists — nothing was deleted.
    const [stillThere] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, strangerRow!.id));
    expect(stillThere).toBeTruthy();
  });

  it('AC8 — DELETE of a malformed (non-UUID) id returns 404', async () => {
    const del = await request(app)
      .delete('/notifications/not-a-uuid')
      .set('Cookie', ownerCookies.join('; '));
    expect(del.status).toBe(404);
  });

  it('AC9 — unreadCount decreases by 1 when an unread row is deleted', async () => {
    const before = await request(app).get('/notifications').set('Cookie', ownerCookies.join('; '));
    const beforeCount = before.body.unreadCount as number;
    // The newest row is unread (rows 0..11 unread; newest loaded is an unread one).
    const unreadVictim = (before.body.notifications as any[]).find((n) => n.readAt == null);
    expect(unreadVictim).toBeTruthy();

    await request(app)
      .delete(`/notifications/${unreadVictim.id}`)
      .set('Cookie', ownerCookies.join('; '));

    const after = await request(app).get('/notifications').set('Cookie', ownerCookies.join('; '));
    expect(after.body.unreadCount).toBe(beforeCount - 1);
  });

  it('AC9 — unreadCount is unchanged when a read row is deleted', async () => {
    const before = await request(app).get('/notifications').set('Cookie', ownerCookies.join('; '));
    const beforeCount = before.body.unreadCount as number;
    // A read row exists among the newest 3; page 1 (newest-first) includes them.
    const readVictim = (before.body.notifications as any[]).find((n) => n.readAt != null);
    expect(readVictim).toBeTruthy();

    await request(app)
      .delete(`/notifications/${readVictim.id}`)
      .set('Cookie', ownerCookies.join('; '));

    const after = await request(app).get('/notifications').set('Cookie', ownerCookies.join('; '));
    expect(after.body.unreadCount).toBe(beforeCount);
  });
});

/**
 * CodeRabbit finding (PR #151) — cursor pagination must not skip rows that
 * share an identical `created_at` at the exact page boundary. `created_at` is
 * microsecond-precision in Postgres, but the cursor round-trips through JS
 * `Date.toISOString()` (millisecond precision), so two rows created in the
 * same millisecond previously collided at the boundary and one was
 * permanently dropped from every subsequent page (not just reordered).
 *
 * Hermetic: seeds its OWN user + 12 rows, isolated from the suites above.
 */
describe('GET /notifications — cursor tie-safety at the page boundary', () => {
  const tsuffix = unique();
  let tiedOwnerId: string;
  let tiedOwnerCookies: string[];
  const ROW_COUNT = 12;

  beforeAll(async () => {
    const email = `notif-tie-${tsuffix}@example.com`;
    tiedOwnerCookies = await signUpAndGetCookie(email, 'sup3r-secret-pw');
    tiedOwnerId = await userIdFor(email);

    const now = Date.now();
    // 12 rows, oldest (i=0) → newest (i=11), 1s apart — EXCEPT rows i=1 and i=2
    // share the IDENTICAL created_at. Sorted newest-first, the default 10-row
    // page 1 holds indices 11..2 (page 1's LAST row is i=2); page 2 holds i=1,0
    // (page 2's FIRST row is i=1). i=1 and i=2 are therefore the exact tied
    // pair straddling the page-1/page-2 boundary — precisely where the old
    // `created_at`-only cursor would have permanently dropped one of them.
    const tiedTimestamp = new Date(now + 2 * 1000);
    for (let i = 0; i < ROW_COUNT; i++) {
      const createdAt = i === 1 || i === 2 ? tiedTimestamp : new Date(now + i * 1000);
      await insertNotification({
        userId: tiedOwnerId,
        type: 'order_ready',
        title: `tie ${String(i).padStart(2, '0')}`,
        createdAt,
      });
    }
  });

  afterAll(async () => {
    await db.delete(schema.notifications).where(eq(schema.notifications.user_id, tiedOwnerId));
    await db.delete(schema.users).where(eq(schema.users.id, tiedOwnerId));
  });

  it('a tied pair at the page boundary is neither skipped nor duplicated across pages', async () => {
    const page1 = await request(app)
      .get('/notifications')
      .set('Cookie', tiedOwnerCookies.join('; '));
    const p1 = page1.body.notifications as any[];
    expect(p1.length).toBe(10);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app)
      .get(`/notifications?cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .set('Cookie', tiedOwnerCookies.join('; '));
    const p2 = page2.body.notifications as any[];

    // All 12 seeded rows are accounted for exactly once — this is the assertion
    // that would have failed under the old created_at-only cursor (the tied
    // "tie 01" row would never appear on either page).
    const allTitles = [...p1, ...p2].map((n) => n.title).sort();
    const expectedTitles = Array.from(
      { length: ROW_COUNT },
      (_, i) => `tie ${String(i).padStart(2, '0')}`,
    ).sort();
    expect(allTitles).toEqual(expectedTitles);

    // No duplicate ids between the two pages.
    const p1Ids = new Set(p1.map((n) => n.id));
    for (const n of p2) expect(p1Ids.has(n.id)).toBe(false);

    // The terminal page has no further rows.
    expect(page2.body.nextCursor).toBeNull();
  });
});
