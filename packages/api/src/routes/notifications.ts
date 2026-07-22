import { and, desc, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import { deviceTokens, notifications } from '../db/schema/index';
import { serializeNotification } from './lib/serializers';

/**
 * Customer notification routes (PUSH-004 / #75). Session-gated ONCE at mount in
 * `index.ts` (`app.use('/notifications', requireSession, notificationsRouter)`),
 * so every handler here can assume `req.user` is populated. All reads/writes are
 * strictly scoped to `req.user!.id` — a client-supplied `userId` is NEVER trusted
 * (mirrors the `orders`/`branches` session-scoping precedent).
 */
export const notificationsRouter: Router = Router();

// Cursor-pagination bounds (notif-delete-pagination). Mirrors `orders.ts`'s
// `DEFAULT_HISTORY_LIMIT`/`MAX_HISTORY_LIMIT` clamp style. The old flat
// `NOTIFICATIONS_LIST_LIMIT = 100` cap is retired now the client paginates.
const DEFAULT_NOTIFICATIONS_LIMIT = 10;
const MAX_NOTIFICATIONS_LIMIT = 50;

/**
 * `GET /notifications` → `{ notifications: AppNotification[], nextCursor, unreadCount }`.
 * The caller's OWN rows only, newest-first, cursor-paginated on `created_at`
 * (mirrors `GET /orders`). `unreadCount` is an INDEPENDENT server-side count
 * (`WHERE read_at IS NULL`), NOT derived from the returned page — so the bell
 * badge stays accurate regardless of scroll position.
 */
notificationsRouter.get('/', async (req, res) => {
  const userId = req.user!.id;

  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_NOTIFICATIONS_LIMIT)
    : DEFAULT_NOTIFICATIONS_LIMIT;

  // Compound cursor `${rawTimestampText}_${id}` — a `created_at`-only cursor can
  // silently and PERMANENTLY skip rows tied at millisecond precision. The DB
  // column is microsecond-precision `timestamp`, but node-postgres TRUNCATES
  // (not rounds) to milliseconds when parsing into a JS `Date` — confirmed
  // empirically: two distinct DB values `.123001` and `.123999` both produce
  // the exact same `Date#getTime()`. So encoding the cursor via
  // `created_at.toISOString()` (as the first fix attempt did) still loses the
  // microsecond digits that distinguish real, close-together rows — the very
  // ones a compound `(created_at, id)` cursor is supposed to make safe (found
  // by CodeRabbit review, PR #151, as a residual gap in that first fix).
  // The fix: never round-trip `created_at` through a JS `Date` for the cursor
  // at all. `${notifications.created_at}::text` below reads Postgres's own
  // full-precision text representation (e.g. `2026-07-22 01:36:21.734268`,
  // never containing `_`) and the incoming cursor is bound back into SQL as a
  // raw string cast (`::timestamp`), so precision is preserved end-to-end.
  const CURSOR_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;
  const [cursorTs, cursorId] =
    typeof req.query.cursor === 'string' ? req.query.cursor.split('_') : [undefined, undefined];
  const hasCursor =
    typeof cursorTs === 'string' && CURSOR_TIMESTAMP_RE.test(cursorTs) && !!cursorId;

  const whereClause = hasCursor
    ? and(
        eq(notifications.user_id, userId),
        sql`(${notifications.created_at}, ${notifications.id}) < (${cursorTs}::timestamp, ${cursorId})`,
      )
    : eq(notifications.user_id, userId);

  const rows = await db
    .select({ ...getTableColumns(notifications), createdAtRaw: sql<string>`created_at::text` })
    .from(notifications)
    .where(whereClause)
    .orderBy(desc(notifications.created_at), desc(notifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.createdAtRaw}_${last.id}` : null;

  // Independent unread count — the true total for this user, never page-derived.
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)));
  const unreadCount = countRow?.count ?? 0;

  res.json({ notifications: page.map(serializeNotification), nextCursor, unreadCount });
});

const deviceTokenSchema = z.object({
  deviceId: z.string().min(1),
  pushToken: z.string().min(1),
  // Tightened at the API boundary (not a DB enum/migration): the mobile client
  // only ever sends `Platform.OS`, which is always exactly 'ios' | 'android' at
  // RN runtime. Any other value is rejected with 422 and writes no row (AC-1).
  platform: z.enum(['ios', 'android']),
});

/**
 * `POST /notifications/device-tokens` — register/refresh this device's Expo push
 * token. Upserts on `device_id` GLOBALLY (not per-user) so a rotated token
 * UPDATES the same row instead of inserting a duplicate (AC-1) — and so
 * re-registering the SAME physical device under a DIFFERENT account (e.g.
 * logout/login on a shared device) REASSIGNS the row's `user_id` rather than
 * creating a second row that would keep delivering pushes for both accounts.
 */
notificationsRouter.post('/device-tokens', async (req, res) => {
  const userId = req.user!.id;
  const parsed = deviceTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Invalid device token payload', details: parsed.error.issues });
    return;
  }
  const { deviceId, pushToken, platform } = parsed.data;
  const now = new Date();

  await db
    .insert(deviceTokens)
    .values({
      user_id: userId,
      device_id: deviceId,
      push_token: pushToken,
      platform,
      last_seen_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [deviceTokens.device_id],
      set: { user_id: userId, push_token: pushToken, platform, last_seen_at: now, updated_at: now },
    });

  res.status(200).json({ ok: true });
});

/**
 * `PATCH /notifications/read-all` — mark every unread notification for the
 * caller as read in one atomic write. Idempotent (already-read rows untouched
 * via the `read_at IS NULL` guard). Registered BEFORE `/:id/read` so Express
 * does not treat the literal "read-all" path segment as an `:id`.
 */
notificationsRouter.patch('/read-all', async (req, res) => {
  const userId = req.user!.id;
  await db
    .update(notifications)
    .set({ read_at: new Date() })
    .where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)));
  res.json({ ok: true });
});

/**
 * `PATCH /notifications/:id/read` — mark a notification read (idempotent).
 * 404 (never 403) when the row doesn't belong to the caller, so the existence of
 * another user's notification is never leaked.
 */
notificationsRouter.patch('/:id/read', async (req, res) => {
  const userId = req.user!.id;
  const id = String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
  if (!row || row.user_id !== userId) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  const [updated] = await db
    .update(notifications)
    .set({ read_at: row.read_at ?? new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.user_id, userId)))
    .returning();

  if (!updated) {
    // Concurrently deleted between the SELECT above and this UPDATE.
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  res.json({ notification: serializeNotification(updated) });
});

/**
 * `DELETE /notifications/:id` — hard-delete the caller's own notification.
 * 404 (never 403) on a malformed id, a wrong-owner row, or an already-gone row,
 * so the existence of another user's notification is never leaked (mirrors
 * `PATCH /:id/read` verbatim — deliberately NOT cart's 403-on-wrong-owner). No
 * soft-delete column exists; this is a permanent removal. Method-distinct from
 * `/read-all` and `/:id/read`, so no Express path-collision concern.
 */
notificationsRouter.delete('/:id', async (req, res) => {
  const userId = req.user!.id;
  const id = String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
  if (!row || row.user_id !== userId) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.user_id, userId)));

  res.json({ ok: true });
});

export default notificationsRouter;
