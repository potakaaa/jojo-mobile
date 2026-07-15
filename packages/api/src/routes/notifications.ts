import { and, desc, eq } from 'drizzle-orm';
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

/**
 * `GET /notifications` → `{ notifications: AppNotification[] }`.
 * The caller's OWN rows only, newest-first.
 */
notificationsRouter.get('/', async (req, res) => {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.user_id, userId))
    .orderBy(desc(notifications.created_at));
  res.json({ notifications: rows.map(serializeNotification) });
});

const deviceTokenSchema = z.object({
  deviceId: z.string().min(1),
  pushToken: z.string().min(1),
  platform: z.string().min(1),
});

/**
 * `POST /notifications/device-tokens` — register/refresh this device's Expo push
 * token. Upserts on `(user_id, device_id)` so a rotated token UPDATES the same
 * row instead of inserting a duplicate (AC-1).
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
      target: [deviceTokens.user_id, deviceTokens.device_id],
      set: { push_token: pushToken, platform, last_seen_at: now, updated_at: now },
    });

  res.status(200).json({ ok: true });
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

  res.json({ notification: serializeNotification(updated!) });
});

export default notificationsRouter;
