import { createHash } from 'node:crypto';

import { fromNodeHeaders } from 'better-auth/node';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../db/client';
import { staffInvites, users, verification } from '../db/schema/index';
import { auth } from '../lib/auth';
import { rateLimit } from '../middleware/rate-limit';
import { requireSession } from '../middleware/require-session';

/**
 * ADM-011 (#141) staff-invite ACCEPT flow. Mounted OUTSIDE `/api/admin` in
 * `index.ts` — the invitee has NO admin session; token possession is the sole
 * authorization signal for `/start`, and a freshly-minted (customer-role) session
 * for `/consume`. ASYMMETRIC guard: `/start` is unauthenticated (+ rate-limited),
 * `/consume` is session-gated — so the guards live per-route HERE, never at the
 * `app.use` mount.
 */
export const staffInviteRouter: ExpressRouter = Router();

const tokenBodySchema = z.object({ token: z.string().min(1) });

// Client-boundary re-assertion of better-auth's own 8/128 password bounds
// (its `setPassword` re-checks these independently — this is a deliberate explicit
// gate that rejects a length violation with 400 BEFORE any credential mutation,
// NOT a duplicated framework config). ADM-012 (#142).
const setPasswordSchema = z.object({ newPassword: z.string().min(8).max(128) });

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * POST /staff-invite/start — UNAUTHENTICATED, rate-limited (10/min/IP). Validates a
 * raw invite token, then server-mints a better-auth magic-link token for the invite's
 * email and returns it, so the app can complete `authClient.magicLink.verify` and land
 * a real session. Does NOT consume the invite (that happens at `/consume`, after the
 * session lands).
 *
 * Statuses: 400 malformed body; 404 token matches no invite (never issued/garbage);
 * 410 the invite exists but is expired or already consumed; 200 `{ magicLinkToken }`.
 */
staffInviteRouter.post('/start', rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  try {
    const parsed = tokenBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    const tokenHash = hashToken(parsed.data.token);
    const [invite] = await db
      .select({
        email: staffInvites.email,
        consumedAt: staffInvites.consumedAt,
        revokedAt: staffInvites.revokedAt,
        expiresAt: staffInvites.expiresAt,
      })
      .from(staffInvites)
      .where(eq(staffInvites.tokenHash, tokenHash));

    if (!invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }
    if (invite.consumedAt !== null || invite.revokedAt !== null || invite.expiresAt <= new Date()) {
      // 410 Gone — this WAS a valid invite once (clearer UI message than a 404).
      res.status(410).json({ error: 'This invite has expired or already been used' });
      return;
    }

    // Mint a magic-link token for the invite's email. The FIRST verify of a
    // never-seen email auto-provisions a plain `customer` account (feasibility-
    // confirmed). Mirrors the proven `/dev/session` server-to-server call shape.
    const derivedName = invite.email.split('@')[0] || invite.email;
    await auth.api.signInMagicLink({
      body: { email: invite.email, name: derivedName, callbackURL: 'jojopotato://' },
      headers: {},
    });

    // Capture the just-minted token. better-auth's `magicLink` config here leaves
    // `storeToken` at its 'plain' default, so `verification.identifier` IS the raw
    // magic-link token (NOT a hash, NOT the email); `verification.value` is a JSON
    // blob carrying { email, name }. Match on the parsed email in application code —
    // NOT a `WHERE identifier = email` filter (identifier is the token). LIMIT 10 is
    // a cheap defensive margin against concurrent mints for OTHER emails; matching on
    // `.email` is what disambiguates, not the LIMIT size.
    const recent = await db
      .select({ identifier: verification.identifier, value: verification.value })
      .from(verification)
      .orderBy(desc(verification.createdAt))
      .limit(10);

    let magicLinkToken: string | null = null;
    for (const row of recent) {
      try {
        const parsedValue = JSON.parse(row.value) as { email?: string };
        if (parsedValue.email === invite.email) {
          magicLinkToken = row.identifier;
          break;
        }
      } catch {
        // Non-JSON verification value (e.g. a phone OTP code) — skip.
      }
    }

    if (!magicLinkToken) {
      // Structurally impossible immediately after a successful signInMagicLink for
      // this exact email — treat as an invariant violation (matches /consume's
      // impossible-mismatch handling).
      console.error('[staff-invite] minted magic link but could not recapture the token');
      res.status(500).json({ error: 'Failed to start invite acceptance' });
      return;
    }

    res.status(200).json({ magicLinkToken });
  } catch (err) {
    console.error('[staff-invite] unexpected error starting invite acceptance', err);
    res.status(500).json({ error: 'Failed to start invite acceptance' });
  }
});

/**
 * POST /staff-invite/consume — SESSION-gated (the session was just minted by `/start`
 * → `authClient.magicLink.verify`). Atomically consumes the invite (single-use) and
 * applies its STORED role/branch to the now-authenticated user. The invitee never
 * supplies role/branch — only the invite row's values are ever applied (AC10).
 *
 * Statuses: 400 malformed body; 404 token matches no invite; 410 expired/already
 * consumed; 500 email-mismatch invariant violation; 200 `{ role, assignedBranchId,
 * alreadyStaffLevel }`.
 */
staffInviteRouter.post('/consume', requireSession, async (req, res) => {
  try {
    const parsed = tokenBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    const tokenHash = hashToken(parsed.data.token);
    const now = new Date();

    // Atomic single-use consume: only an unconsumed, unexpired invite whose email
    // matches the authenticated session is claimed. Folding the session-email match
    // INTO the predicate means an email mismatch can never set `consumedAt` (it just
    // fails to claim), so a mismatched session cannot burn someone else's invite.
    const [claimed] = await db
      .update(staffInvites)
      .set({ consumedAt: now })
      .where(
        and(
          eq(staffInvites.tokenHash, tokenHash),
          isNull(staffInvites.consumedAt),
          isNull(staffInvites.revokedAt),
          gt(staffInvites.expiresAt, now),
          eq(staffInvites.email, req.user!.email),
        ),
      )
      .returning({
        intendedRole: staffInvites.intendedRole,
        intendedBranchId: staffInvites.intendedBranchId,
      });

    if (!claimed) {
      // Not claimed: classify why. Read the row by token to distinguish never-issued
      // (404), a live invite whose email differs from the session (500 invariant —
      // NOT consumed, since email was in the predicate), and expired/consumed (410).
      const [exists] = await db
        .select({
          id: staffInvites.id,
          email: staffInvites.email,
          consumedAt: staffInvites.consumedAt,
          expiresAt: staffInvites.expiresAt,
        })
        .from(staffInvites)
        .where(eq(staffInvites.tokenHash, tokenHash));
      if (!exists) {
        res.status(404).json({ error: 'Invite not found' });
      } else if (
        exists.consumedAt === null &&
        exists.expiresAt > now &&
        exists.email !== req.user!.email
      ) {
        // The session was minted FOR the invite's email by /start, so a live-invite
        // email mismatch is structurally impossible → invariant violation, no PII logged.
        console.error('[staff-invite] consume email mismatch (invariant violation)', {
          inviteId: exists.id,
        });
        res.status(500).json({ error: 'Failed to accept invite' });
      } else {
        res.status(410).json({ error: 'This invite has expired or already been used' });
      }
      return;
    }

    // Re-check the target's CURRENT role fresh. If already staff-level via another
    // path (manual promote / a raced second invite), no-op gracefully.
    const [current] = await db
      .select({ role: users.role, assignedBranchId: users.assignedBranchId })
      .from(users)
      .where(eq(users.id, req.user!.id));

    if (current && current.role !== 'customer') {
      res.status(200).json({
        role: current.role,
        assignedBranchId: current.assignedBranchId,
        alreadyStaffLevel: true,
      });
      return;
    }

    // Apply the invite's stored role, then (staff only) its stored branch — same
    // order and semantics as the two admin routes, done inline because the invitee
    // has no super_admin session to call those super_admin-gated routes with.
    await db.update(users).set({ role: claimed.intendedRole }).where(eq(users.id, req.user!.id));

    if (claimed.intendedRole === 'staff') {
      await db
        .update(users)
        .set({ assignedBranchId: claimed.intendedBranchId })
        .where(eq(users.id, req.user!.id));
    }

    const [after] = await db
      .select({ role: users.role, assignedBranchId: users.assignedBranchId })
      .from(users)
      .where(eq(users.id, req.user!.id));

    res.status(200).json({
      role: after!.role,
      assignedBranchId: after!.assignedBranchId,
      alreadyStaffLevel: false,
    });
  } catch (err) {
    console.error('[staff-invite] unexpected error consuming invite', err);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

/**
 * POST /staff-invite/set-password (ADM-012, #142) — SESSION-gated. Sets a durable
 * password on the invitee's freshly-accepted account (which landed via magic-link
 * verify and so has no credential yet), so they can later sign in with email +
 * password. better-auth's `setPassword` operates on the SESSION user only — it can
 * never target another account, and `role`/`email`/`branch` are structurally not
 * inputs here.
 *
 * Statuses: 401 unauthenticated (requireSession); 400 length violation (8–128,
 * zero credential mutation); 200 `{ ok: true }` on success. An account that ALREADY
 * has a password (D4 — e.g. re-visiting the accept link) is treated as a graceful
 * no-op success (`PASSWORD_ALREADY_SET`), never a 500, leaving the existing password
 * untouched.
 */
staffInviteRouter.post('/set-password', requireSession, async (req, res) => {
  const parsed = setPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Password must be 8-128 characters' });
    return;
  }

  try {
    await auth.api.setPassword({
      body: { newPassword: parsed.data.newPassword },
      headers: fromNodeHeaders(req.headers),
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    // D4: an already-has-password account is an expected no-op path, not an error.
    // better-auth throws APIError('BAD_REQUEST', PASSWORD_ALREADY_SET) shaped as
    // { status: 'BAD_REQUEST', body: { code: 'PASSWORD_ALREADY_SET', ... } }.
    const e = err as { status?: string; body?: { code?: string } };
    if (e?.status === 'BAD_REQUEST' && e?.body?.code === 'PASSWORD_ALREADY_SET') {
      res.status(200).json({ ok: true });
      return;
    }
    console.error('[staff-invite] unexpected error setting password', err);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

export default staffInviteRouter;
