import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { branches } from './branches';
import { users, userRoleEnum } from './users';

/**
 * `staff_invites` (ADM-011, #141) — a single-use, expiring invitation that
 * pre-authorizes a brand-new account to be provisioned at a chosen staff-level
 * role (+ branch, when the target role is `staff`). Created ONLY by a super_admin
 * (`POST /api/admin/staff/invite`); accepted, without any admin session, via the
 * unauthenticated `/staff-invite/start` → `/staff-invite/consume` flow.
 *
 * TOKEN AT REST IS HASHED (deliberate divergence from better-auth's `verification`
 * table, which stores its magic-link token PLAIN). A staff invite pre-grants
 * privilege, so a DB read alone must never be enough to impersonate an accept: the
 * raw token is delivered only through the email/log channel and NEVER stored — only
 * its SHA-256 hash lives here, hash-compared on accept. This is a materially
 * different token space from the separate better-auth magic-link token the accept
 * flow also mints; the two never interact.
 *
 * SINGLE-LIVE-INVITE-PER-EMAIL is enforced at the APPLICATION layer (the invite-create
 * handler supersedes any prior unconsumed+unexpired invite for the same email inside
 * the create transaction), NOT by a unique index — matching the `offers`/`coupons`
 * soft-delete/audit convention where superseded rows are retained (marked consumed)
 * rather than deleted, so an audit trail survives.
 *
 * `intended_role`/`intended_branch_id` are the ONLY source of the provisioned
 * role/branch at consume time — the invitee never supplies either (AC10).
 *
 * `consumed_at` and `revoked_at` (ADM-013, #149) are both nullable and mutually
 * exclusive by construction: `consumed_at` = the invite was accepted; `revoked_at`
 * = a super_admin cancelled it before acceptance. The liveness invariant is that an
 * invite is "live" only when BOTH are null AND it has not expired — every liveness
 * check in the codebase must include `revoked_at IS NULL`.
 */
export const staffInvites = pgTable('staff_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email').notNull(),
  intendedRole: userRoleEnum('intended_role').notNull(),
  intendedBranchId: uuid('intended_branch_id').references(() => branches.id),
  tokenHash: varchar('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  revokedAt: timestamp('revoked_at'),
  createdBy: uuid('created_by')
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
