import { createHash, randomBytes } from 'node:crypto';

import { STAFF_ROLES } from '@jojopotato/types';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { Resend } from 'resend';
import { z } from 'zod';

import { db } from '../../db/client';
import { branches, staffInvites, users } from '../../db/schema/index';
import { ADMIN_WEB_ORIGIN } from '../../lib/auth';
import {
  serializeAdminPendingStaffInvite,
  serializeAdminStaffInvite,
  serializeAdminStaffSummary,
} from '../lib/serializers';
import { AdminApiError, handleAdminError } from './lib/errors';

// Resend-or-log invite delivery — mirrors `auth.ts`'s `sendMagicLink` exactly:
// real email when RESEND_API_KEY is configured, otherwise a server-side log so
// local dev / tests exercise the full accept flow without a Resend account (the
// link still round-trips, it just isn't emailed). Single call site (the invite
// handler), so no shared helper is extracted (YAGNI, locked Delivery decision).
const resendApiKey = process.env.RESEND_API_KEY;
const inviteResend = resendApiKey ? new Resend(resendApiKey) : null;
const inviteFrom = process.env.RESEND_FROM ?? 'Jojo Potato <onboarding@resend.dev>';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Deliver an invite accept link. The link targets the `apps/admin` WEB accept page
 * (`${ADMIN_WEB_ORIGIN}/staff-invite-accept`, ADM-012 #142), where the invitee
 * completes profile + password setup in the browser — NOT the mobile `jojopotato://`
 * deep-link bounce (`/staff-invite/native`) used before ADM-012. Send failure NEVER
 * rolls back the invite row (matching `sendMagicLink`'s precedent — the invite is
 * real and accept-able even if the mail bounced). The raw token appears ONLY here,
 * never in the API response body or the DB.
 */
async function sendStaffInvite(email: string, rawToken: string): Promise<void> {
  const acceptUrl = `${ADMIN_WEB_ORIGIN}/staff-invite-accept?token=${encodeURIComponent(rawToken)}`;
  if (!inviteResend) {
    console.log(`[admin] staff invite for ${email} (RESEND_API_KEY unset): ${acceptUrl}`);
    return;
  }
  await inviteResend.emails.send({
    from: inviteFrom,
    to: email,
    subject: "You've been invited to the Jojo Potato staff app",
    text: `Tap to accept your staff invite and set up your Jojo Potato account: ${acceptUrl}`,
  });
}

const inviteSchema = z
  .object({
    email: z.email(),
    intendedRole: z.enum(['staff', 'admin', 'super_admin']),
    intendedBranchId: z.uuid().nullable().optional(),
  })
  .superRefine((val, ctx) => {
    // D2: a branch is required for (and only for) a `staff` target. Enforced at the
    // SOURCE here since we own both fields at creation time.
    if (val.intendedRole === 'staff') {
      if (!val.intendedBranchId) {
        ctx.addIssue({
          code: 'custom',
          message: 'A branch is required for a staff invite',
          path: ['intendedBranchId'],
        });
      }
    } else if (val.intendedBranchId) {
      ctx.addIssue({
        code: 'custom',
        message: 'A branch may only be set for a staff invite',
        path: ['intendedBranchId'],
      });
    }
  });

/**
 * Admin Staff management routes (ADM-009, #124). Lists staff-level users and sets
 * or clears their `assignedBranchId` — closing the only production gap in staff
 * onboarding (the seed was previously the only writer of that column). The
 * `requireAdmin` guard + CORS are inherited from the `/api/admin` mount; no handler
 * re-checks role. This is the 12th consumer of the append-only admin aggregator.
 *
 * Role changes are NOT rebuilt here — the existing `POST /api/admin/users/:id/role`
 * route (`users.ts`) is reused byte-for-byte by the Staff screen's UI. This file
 * only owns the list + branch-assignment surface.
 */
const staffRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();

const branchAssignSchema = z.object({
  branchId: z.uuid().nullable(),
});

/**
 * GET /api/admin/staff — every user with role ∈ STAFF_ROLES (staff, admin,
 * super_admin), left-joined to `branches` for the assigned branch name.
 * Customers are never included (WHERE role IN (...), not a client-side filter).
 * No pagination — staff rosters are small (locked decision, YAGNI).
 */
staffRouter.get('/', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        assignedBranchId: users.assignedBranchId,
        branchName: branches.name,
      })
      .from(users)
      .leftJoin(branches, eq(users.assignedBranchId, branches.id))
      .where(inArray(users.role, [...STAFF_ROLES]));

    res.status(200).json({ staff: rows.map(serializeAdminStaffSummary) });
  } catch (err) {
    handleAdminError(err, res, 'listing staff');
  }
});

/**
 * PATCH /api/admin/staff/:id/branch — set or clear a staff-level user's branch.
 * Guard order (LOCKED, mirrors users.ts's role-route guard-order discipline):
 *   1. Zod body validation           → 400 on invalid shape
 *   2. target user lookup            → 404 if not found
 *   3. target role check             → 400 if role === 'customer'
 *   4. branchId === null             → short-circuit straight to the DB write (clear)
 *   5. branch lookup + isActive check→ 400 "Unknown or inactive branch"
 *   6. DB write + re-join + serialize
 * Branch existence/active status is ALWAYS read fresh from the DB — never
 * trusted from client input (mirrors resolveBranchScope's convention).
 */
staffRouter.patch('/:id/branch', async (req, res) => {
  try {
    const parsed = branchAssignSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AdminApiError(400, 'Invalid request body');
    }

    // A malformed (non-uuid) :id can never be a real target — guard it to a clean
    // 404 (matching rewards.ts's uuid guard) rather than letting the `eq()` lookup
    // hit Postgres's `uuid` column and throw a 22P02 → 500. Part of the target-404
    // resolution step, so the locked guard order (Zod body → target 404 → …) holds.
    if (!uuidSchema.safeParse(req.params.id).success) {
      throw new AdminApiError(404, 'User not found');
    }

    const [target] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, req.params.id));
    if (!target) {
      throw new AdminApiError(404, 'User not found');
    }
    if (target.role === 'customer') {
      throw new AdminApiError(400, 'Target user is not staff-level');
    }

    if (parsed.data.branchId !== null) {
      const [branch] = await db
        .select({ id: branches.id, isActive: branches.is_active })
        .from(branches)
        .where(eq(branches.id, parsed.data.branchId));
      if (!branch || !branch.isActive) {
        throw new AdminApiError(400, 'Unknown or inactive branch');
      }
    }

    await db
      .update(users)
      .set({ assignedBranchId: parsed.data.branchId })
      .where(eq(users.id, req.params.id));

    const [updated] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        assignedBranchId: users.assignedBranchId,
        branchName: branches.name,
      })
      .from(users)
      .leftJoin(branches, eq(users.assignedBranchId, branches.id))
      .where(eq(users.id, req.params.id));

    res.status(200).json({ staff: serializeAdminStaffSummary(updated!) });
  } catch (err) {
    handleAdminError(err, res, 'assigning staff branch');
  }
});

/**
 * POST /api/admin/staff/invite (ADM-011, #141) — super_admin-only. Creates a
 * single-use, expiring, hashed-token invite for an email that has NO account yet.
 *
 * GUARD ORDER:
 *   1. super_admin inline check       → 403 for a plain admin (mirrors users.ts)
 *   2. Zod body validation            → 400 (bad email/role, or branch-only-for-staff)
 *   3. existing-account check         → 409 if an account with this email exists
 *   4. db.transaction:
 *        a. supersede any prior unconsumed+unexpired invite for this email
 *        b. generate a 256-bit token, store ONLY its SHA-256 hash, insert the row
 *   5. AFTER commit: Resend-or-log the accept link (send failure does NOT roll back)
 *
 * The raw token is delivered ONLY through the email/log channel and NEVER returned
 * in the response body (which carries only email/role/branch/expiry).
 */
staffRouter.post('/invite', async (req, res) => {
  try {
    if (req.adminSession!.role !== 'super_admin') {
      throw new AdminApiError(403, 'Forbidden');
    }

    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AdminApiError(400, 'Invalid invite');
    }
    const { email, intendedRole } = parsed.data;
    const intendedBranchId =
      intendedRole === 'staff' ? (parsed.data.intendedBranchId ?? null) : null;

    // Validate the branch fresh from the DB — never trust a client-supplied branch id
    // (mirrors the PATCH /:id/branch handler). A staff invite's stored branch is applied
    // verbatim at consume time, so an unknown/inactive branch must be rejected at source.
    if (intendedBranchId !== null) {
      const [branch] = await db
        .select({ id: branches.id, isActive: branches.is_active })
        .from(branches)
        .where(eq(branches.id, intendedBranchId));
      if (!branch || !branch.isActive) {
        throw new AdminApiError(400, 'Unknown or inactive branch');
      }
    }

    // An email that already has an account must use the promote flow, not an invite.
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) {
      throw new AdminApiError(
        409,
        'An account with this email already exists — use the promote flow instead',
      );
    }

    // Token generated + hashed INSIDE the transaction; the raw token is captured in
    // a closure variable and only ever sent/logged AFTER the commit succeeds.
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);

    const invite = await db.transaction(async (tx) => {
      // Supersede any prior live invite for this email (single-live-invite-per-email,
      // enforced app-level — mark consumed, never delete, for audit).
      await tx
        .update(staffInvites)
        .set({ consumedAt: now })
        .where(
          and(
            eq(staffInvites.email, email),
            isNull(staffInvites.consumedAt),
            isNull(staffInvites.revokedAt),
            gt(staffInvites.expiresAt, now),
          ),
        );

      const [row] = await tx
        .insert(staffInvites)
        .values({
          email,
          intendedRole,
          intendedBranchId,
          tokenHash,
          expiresAt,
          createdBy: req.adminSession!.userId,
        })
        .returning({
          email: staffInvites.email,
          intendedRole: staffInvites.intendedRole,
          intendedBranchId: staffInvites.intendedBranchId,
          expiresAt: staffInvites.expiresAt,
        });
      return row!;
    });

    // Post-commit delivery. A send failure must NOT fail the request — the invite
    // row is real and accept-able regardless (matches sendMagicLink's precedent).
    try {
      await sendStaffInvite(email, rawToken);
    } catch (sendErr) {
      console.error('[admin] staff invite created but delivery failed', sendErr);
    }

    res.status(201).json({ invite: serializeAdminStaffInvite(invite) });
  } catch (err) {
    handleAdminError(err, res, 'creating staff invite');
  }
});

/**
 * GET /api/admin/staff/invites (ADM-013, #149) — super_admin-only. Lists
 * PENDING-ONLY invites (unconsumed AND unrevoked AND unexpired), newest first,
 * joined to `branches` (intended branch name) and `users` (inviter name/email).
 * NEVER serializes `tokenHash`. Guard order: super_admin check → query → serialize.
 */
staffRouter.get('/invites', async (req, res) => {
  try {
    if (req.adminSession!.role !== 'super_admin') {
      throw new AdminApiError(403, 'Forbidden');
    }

    const now = new Date();
    // Single join to `users` (the inviter) — no alias needed, `users` is joined once (E2).
    const rows = await db
      .select({
        id: staffInvites.id,
        email: staffInvites.email,
        intendedRole: staffInvites.intendedRole,
        intendedBranchId: staffInvites.intendedBranchId,
        intendedBranchName: branches.name,
        invitedByName: users.name,
        invitedByEmail: users.email,
        createdAt: staffInvites.createdAt,
        expiresAt: staffInvites.expiresAt,
      })
      .from(staffInvites)
      .leftJoin(branches, eq(staffInvites.intendedBranchId, branches.id))
      .leftJoin(users, eq(staffInvites.createdBy, users.id))
      .where(
        and(
          isNull(staffInvites.consumedAt),
          isNull(staffInvites.revokedAt),
          gt(staffInvites.expiresAt, now),
        ),
      )
      .orderBy(desc(staffInvites.createdAt));

    res.status(200).json({ invites: rows.map(serializeAdminPendingStaffInvite) });
  } catch (err) {
    handleAdminError(err, res, 'listing pending staff invites');
  }
});

/**
 * POST /api/admin/staff/invites/:id/revoke (ADM-013, #149) — super_admin-only.
 * Atomically marks a still-pending invite revoked (compare-and-swap: only an
 * unconsumed+unrevoked+unexpired row is claimed, so a concurrent revoke or an
 * already-not-pending invite loses the race safely → 404). Guard order:
 * super_admin check → uuid-shape guard → atomic CAS UPDATE → 404 on no row.
 */
staffRouter.post('/invites/:id/revoke', async (req, res) => {
  try {
    if (req.adminSession!.role !== 'super_admin') {
      throw new AdminApiError(403, 'Forbidden');
    }
    // A malformed (non-uuid) :id can never be a real target — clean 404 rather than
    // letting the `eq()` hit Postgres's `uuid` column and throw a 22P02 → 500.
    if (!uuidSchema.safeParse(req.params.id).success) {
      throw new AdminApiError(404, 'Invite not found or not pending');
    }

    const now = new Date();
    const [revoked] = await db
      .update(staffInvites)
      .set({ revokedAt: now })
      .where(
        and(
          eq(staffInvites.id, req.params.id),
          isNull(staffInvites.consumedAt),
          isNull(staffInvites.revokedAt),
          gt(staffInvites.expiresAt, now),
        ),
      )
      .returning({ id: staffInvites.id });

    if (!revoked) {
      throw new AdminApiError(404, 'Invite not found or not pending');
    }

    res.status(200).json({ id: revoked.id });
  } catch (err) {
    handleAdminError(err, res, 'revoking staff invite');
  }
});

/**
 * POST /api/admin/staff/invites/:id/resend (ADM-013, #149) — super_admin-only.
 * Rotates a still-pending invite's token (kills the old link, issues a fresh one
 * with a refreshed expiry) and re-delivers it. The invitee's stored email/role/
 * branch are preserved verbatim — the request BODY is ignored entirely (no Zod
 * schema reads role/branch from it, closing the AC6 smuggling vector structurally).
 *
 * Guard/flow order:
 *   1. super_admin check                              → 403
 *   2. uuid-shape guard                               → 404 malformed
 *   3. pending-read, CAPTURING the current tokenHash  → 404 if not pending (AC7)
 *   4. generate fresh rawToken/tokenHash/expiry
 *   5. send-before-commit: await sendStaffInvite FIRST — rotating the hash kills the
 *      currently-valid link, so delivery must be confirmed before the row is mutated.
 *      A send throw propagates to handleAdminError (non-200) with the old token intact.
 *   6. exact-token compare-and-swap UPDATE keyed on BOTH pending-state AND the captured
 *      tokenHash (Fix 2, AC15) — a racing second resend whose captured hash is now stale
 *      (the first resend already rotated) fails the WHERE and 404s instead of clobbering
 *      the first resend's just-delivered link.
 *   7. no row returned → 404.
 */
staffRouter.post('/invites/:id/resend', async (req, res) => {
  try {
    if (req.adminSession!.role !== 'super_admin') {
      throw new AdminApiError(403, 'Forbidden');
    }
    if (!uuidSchema.safeParse(req.params.id).success) {
      throw new AdminApiError(404, 'Invite not found or not pending');
    }

    const readNow = new Date();
    // Capture the row's CURRENT tokenHash in the SAME read that checks pending status —
    // this is the compare-and-swap key for the rotating UPDATE below (Fix 2).
    const [pending] = await db
      .select({
        email: staffInvites.email,
        tokenHash: staffInvites.tokenHash,
      })
      .from(staffInvites)
      .where(
        and(
          eq(staffInvites.id, req.params.id),
          isNull(staffInvites.consumedAt),
          isNull(staffInvites.revokedAt),
          gt(staffInvites.expiresAt, readNow),
        ),
      );

    if (!pending) {
      // Not pending → 404, zero mutation, zero send attempt (AC7).
      throw new AdminApiError(404, 'Invite not found or not pending');
    }

    // Fresh token + refreshed expiry, computed in memory (not yet committed).
    const rawToken = randomBytes(32).toString('hex');
    const newTokenHash = createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);

    // Send-before-commit (D2 amendment): the rotation KILLS the live link, so delivery
    // must be attempted+confirmed BEFORE the write. A send throw leaves the old token
    // intact (still pending) and surfaces as a non-200 error via handleAdminError.
    await sendStaffInvite(pending.email, rawToken);

    // Exact-token compare-and-swap: keyed on the captured tokenHash (Fix 2, AC15).
    const [rotated] = await db
      .update(staffInvites)
      .set({ tokenHash: newTokenHash, expiresAt })
      .where(
        and(
          eq(staffInvites.id, req.params.id),
          eq(staffInvites.tokenHash, pending.tokenHash),
          isNull(staffInvites.consumedAt),
          isNull(staffInvites.revokedAt),
          gt(staffInvites.expiresAt, now),
        ),
      )
      .returning({
        email: staffInvites.email,
        intendedRole: staffInvites.intendedRole,
        intendedBranchId: staffInvites.intendedBranchId,
        expiresAt: staffInvites.expiresAt,
      });

    if (!rotated) {
      // The row stopped being pending, OR a different resend already rotated the
      // tokenHash between this call's read and write (double-resend race, Fix 2).
      throw new AdminApiError(404, 'Invite not found or not pending');
    }

    res.status(200).json({ invite: serializeAdminStaffInvite(rotated) });
  } catch (err) {
    handleAdminError(err, res, 'resending staff invite');
  }
});

export default staffRouter;
