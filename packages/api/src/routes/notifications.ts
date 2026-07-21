import { and, desc, eq, isNull } from 'drizzle-orm';
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

const NOTIFICATIONS_LIST_LIMIT = 100;

/**
 * `GET /notifications` → `{ notifications: AppNotification[] }`.
 * The caller's OWN rows only, newest-first, capped at `NOTIFICATIONS_LIST_LIMIT`
 * (the mobile client renders a flat list with no pagination UI, so a fixed cap —
 * not cursor pagination like `GET /orders` — is the right-sized bound here).
 */
notificationsRouter.get('/', async (req, res) => {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.user_id, userId))
    .orderBy(desc(notifications.created_at))
    .limit(NOTIFICATIONS_LIST_LIMIT);
  res.json({ notifications: rows.map(serializeNotification) });
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

export default notificationsRouter;
