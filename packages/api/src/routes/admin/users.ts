import type { AdminMe, AdminUserSummary } from '@jojopotato/types';
import { eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { users } from '../../db/schema/index';
import { AdminApiError } from './lib/errors';

/**
 * Admin user routes. The `requireAdmin` guard is applied ONCE at mount time in
 * `index.ts` (`app.use('/api/admin', cors(...), requireAdmin(auth), adminRouter)`),
 * so every handler here can assume `req.adminSession` is populated. Later admin
 * phases only ADD routes/files under the `admin/` router — they never re-apply
 * the guard.
 */
const usersRouter: ExpressRouter = Router();

const roleUpdateSchema = z.object({
  role: z.enum(['customer', 'staff', 'admin', 'super_admin']),
});

const lookupQuerySchema = z.object({
  email: z.email(),
});

/**
 * Canary: `GET /api/admin/me` → `{ role }`. Read-only. Reads `req.adminSession`
 * (attached by `requireAdmin`). No `assignedBranch` — admins are not
 * branch-scoped. Also the endpoint the admin web `beforeLoad` guard calls to
 * verify the session against the REAL server (not a client-cached flag).
 */
usersRouter.get('/me', (req, res) => {
  const body: AdminMe = { role: req.adminSession!.role };
  res.json(body);
});

/**
 * `POST /api/admin/users/:id/role` — the ONLY sanctioned write path for `role`
 * (which stays `input: false` in better-auth). super_admin-only.
 *
 * GUARD ORDER (LOCKED — from vc-predict Security persona review, no reordering):
 *   5.1 super_admin inline check (FIRST)  → 403 if caller is not super_admin
 *   5.2 self-escalation guard             → 400 if target id === caller id
 *   5.3 Zod body validation               → 400 on invalid role
 *   5.4 DB write (LAST, after all guards) → 404 if no row updated
 *
 * All guards throw `AdminApiError`, caught by the single try/catch below and
 * converted to `res.status(err.status).json({ error: err.message })` (mirrors
 * `orders.ts`'s `err instanceof OrderError` catch shape). Errors are never
 * constructed-and-returned directly.
 */
usersRouter.post('/users/:id/role', async (req, res) => {
  try {
    // 5.1 — super_admin inline check (in ADDITION to requireAdmin's
    // admin-or-super_admin gate). NOT a middleware wrapper — single consumer.
    if (req.adminSession!.role !== 'super_admin') {
      throw new AdminApiError(403, 'Forbidden');
    }

    // 5.2 — self-escalation guard, BEFORE any DB read/write.
    if (req.params.id === req.adminSession!.userId) {
      throw new AdminApiError(400, 'Cannot modify own role');
    }

    // 5.3 — validate the request body.
    const parsed = roleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AdminApiError(400, 'Invalid role');
    }

    // 5.4 — DB write, after all three guards pass.
    const [updated] = await db
      .update(users)
      .set({ role: parsed.data.role })
      .where(eq(users.id, req.params.id))
      .returning({ id: users.id, email: users.email, role: users.role });

    if (!updated) {
      throw new AdminApiError(404, 'User not found');
    }

    const body: AdminUserSummary = updated;
    res.status(200).json({ resource: body });
  } catch (err) {
    if (err instanceof AdminApiError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[admin] unexpected error updating user role', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * `GET /api/admin/users/lookup?email=` (ADM-011, #141) — exact-match user lookup
 * powering the "+ Add staff" promote path (find an existing customer to promote).
 * Registered as `usersRouter.get('/users/lookup', ...)` because `usersRouter` mounts
 * at the admin ROOT (`adminRouter.use('/', usersRouter)`), matching the role route's
 * `usersRouter.post('/users/:id/role', ...)` convention.
 *
 * GUARD ORDER (mirrors the role route's discipline):
 *   1. super_admin inline check (FIRST) → 403 for a plain admin
 *   2. Zod query validation             → 400 on a missing/invalid email
 *   3. exact-match DB lookup            → returns { user } or { user: null }
 *
 * A "no account with this email" result is a normal branch of the add-staff flow
 * (it routes the admin to the invite path), NOT a 404: it returns 200 `{ user: null }`.
 * Case-sensitivity note: `users.email` has no citext/lower-index and no normalization
 * layer exists elsewhere in this codebase for email lookups, so this is a plain
 * equality match on the stored value (documented known limitation, YAGNI).
 */
usersRouter.get('/users/lookup', async (req, res) => {
  try {
    if (req.adminSession!.role !== 'super_admin') {
      throw new AdminApiError(403, 'Forbidden');
    }

    const parsed = lookupQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AdminApiError(400, 'Invalid email');
    }

    const [row] = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.email, parsed.data.email));

    res.status(200).json({ user: row ?? null });
  } catch (err) {
    if (err instanceof AdminApiError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[admin] unexpected error looking up user', err);
    res.status(500).json({ error: 'Failed to look up user' });
  }
});

export default usersRouter;
