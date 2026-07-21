---
name: plan:adm-013-invite-management
description: "COMPLEX plan for ADM-013 — staff invite management (list/revoke/resend) + staff removal/demotion (issue #149)"
date: 21-07-26
feature: admin-dashboard
---

# ADM-013 — Staff Invite Management + Staff Removal (PLAN)

Date: 21-07-26

Status: PLAN drafted, not yet validated. INNOVATE was skipped — the SPEC
(`adm-013-invite-management_SPEC_21-07-26.md`, same task folder) already locked D1 (revoke
storage), D2 (resend mechanism), and D3 (list scope); the remaining work is mechanical
implementation of a locked design, not an approach comparison.

Complexity: COMPLEX — additive migration, 3 new/extended routes on an auth-adjacent trust
boundary, touches 2 existing files this plan does NOT own alone (see Sequencing below), plus
`apps/admin` UI.

**HARD SEQUENCING CONSTRAINT (read before EXECUTE):** this plan's EXECUTE MUST run strictly
AFTER ADM-011 Section H (`apps/admin` web accept surface + CORS extension,
`process/features/admin-dashboard/active/adm-011-add-staff_21-07-26/`) has landed as a real
commit. Both plans edit `packages/api/src/routes/staff-invite.ts`,
`packages/api/src/index.ts`, and `packages/api/src/routes/__tests__/staff-invite.integration.test.ts`.
See `## Sequencing / Overlap With ADM-011 Section H` for the exact reconciliation procedure. Do
NOT begin ADM-013 EXECUTE while Section H is still in flight on the same branch.

## Scope Widened 21-07-26 (user decision — read before continuing)

This plan now covers TWO independent pieces under one ADM-013 umbrella:

- **Part A — Pending invite management** (list/revoke/resend) — the original scope below,
  UNCHANGED. Backend-heavy: new migration, 3 new routes, 2 shared-file liveness-guard edits.
- **Part B — Staff removal/demotion (NEW)** — a minimal `apps/admin`-ONLY addition. Reuses the
  EXISTING `POST /api/admin/users/:id/role` route unmodified (confirmed via direct source read:
  its Zod enum already accepts `role: 'customer'`, and `GET /api/admin/staff` already filters
  `role IN (staff, admin, super_admin)`, so a demoted user disappears from the roster with zero
  new server logic). Part B adds ONLY: a confirm-gated "Remove from staff" action on the existing
  `StaffList` component, wired to the EXISTING `useChangeStaffRole()` mutation with
  `role: 'customer'`. See `## Part B — Staff Removal` below for the full design.

**VALIDATE MUST RE-RUN.** The `## Validate Contract` below (`Gate: CONDITIONAL`, dated 21-07-26)
was written against the NARROWER Part-A-only scope. It does not cover Part B's new touchpoints,
blast radius, or ACs. See `## Inner Loop Refresh Note` at the end of this file — its presence with
a date newer than the Validate Contract's `date:` field is what tells the orchestrator's V1 check
to re-run PVL from V1 before EXECUTE, per `orchestration.md`'s VALIDATE-skip-condition logic. Do
NOT proceed to EXECUTE on the strength of the existing CONDITIONAL contract — it never evaluated
Part B.

## Overview

ADM-011 built the invite CREATE path (`POST /api/admin/staff/invite`) and the invitee ACCEPT
path (`/staff-invite/start` → `/staff-invite/consume`), but gave a super_admin no visibility
into or control over invites once sent. ADM-013 closes that gap with three additive pieces, all
built on the existing `staff_invites` table:

1. A new nullable `revoked_at` column (migration `0021`) and the **liveness invariant** — every
   "is this invite still live" check in the codebase must require `revoked_at IS NULL`, not just
   `consumed_at IS NULL AND expires_at > now`.
2. Three new super_admin-only admin routes: `GET /api/admin/staff/invites` (pending-only list),
   `POST /api/admin/staff/invites/:id/revoke`, `POST /api/admin/staff/invites/:id/resend`.
3. A "Pending invites" section on the `apps/admin` Staff screen (super_admin-gated, list +
   revoke confirm-dialog + resend action).

No change to invite CREATION, no change to the accept UI/flow beyond the liveness-guard
extension required to make revoke actually work.

## Locked Decisions (from SPEC — not re-opened here)

| Decision | Locked value |
|---|---|
| D1 — revoke storage | New nullable `staff_invites.revoked_at` timestamp column (migration `0021`, additive, zero change to existing columns). `consumed_at` = accepted; `revoked_at` = admin-cancelled; mutually exclusive by construction. |
| D2 — resend mechanism | Dedicated `POST /api/admin/staff/invites/:id/resend`. Reads the existing pending row's stored email/role/branch, generates a fresh token, overwrites `tokenHash` + `expiresAt` on the SAME row (no new row, no history table — the old token dies because its hash is gone), re-sends via the existing `sendStaffInvite`. Client supplies only the invite `:id` — never role/branch. |
| D3 — list scope | `GET /api/admin/staff/invites` returns PENDING-ONLY: `consumedAt IS NULL AND revokedAt IS NULL AND expiresAt > now`. No status-filtered/history list in this phase. |
| Critical invariant | Every "is this invite live" predicate in the codebase MUST include `isNull(revokedAt)`. Known sites (all in scope of this plan): `staff-invite.ts` `/start` liveness guard, `staff-invite.ts` `/consume` atomic WHERE, `staff.ts` create-time supersede predicate, and this plan's own list/revoke/resend "is pending" predicates. AC4 (proving this invariant) is a HARD gate — **Known-Gap is explicitly banned.** |

## Sequencing / Overlap With ADM-011 Section H

ADM-011 Section H (the `apps/admin` web accept surface + CORS extension) is
APPROVED/QUEUED and, per its own plan, currently **executing in parallel on this same branch**
as of this SPEC/PLAN being written. Section H touches:

- `packages/api/src/routes/staff-invite.ts` — adds no new route, but the file itself will
  receive Section H's context/comments and is the exact file ADM-013 edits for the liveness-
  guard extension (invariant sites 1–2 above).
- `packages/api/src/index.ts` — Section H changes the `/staff-invite` mount to add `adminCors`
  (`app.use('/staff-invite', adminCors, staffInviteRouter)`). ADM-013 does not need to touch
  this mount line itself (it mounts new routes under the existing `/api/admin/staff` aggregator,
  not `/staff-invite`), but ADM-013's own new tests share the same test file that Section H's H4
  tests also extend.
- `packages/api/src/routes/__tests__/staff-invite.integration.test.ts` — both plans add test
  cases to this file.

**Resolution (locked for EXECUTE):**

1. ADM-013 EXECUTE does not start until ADM-011 Section H has landed as a committed change on
   this branch (verify with `git log --oneline -- packages/api/src/routes/staff-invite.ts
   packages/api/src/index.ts` before starting Section D/E below).
2. Before editing `staff-invite.ts` or `index.ts`, re-read both files fresh (do not trust this
   plan's line-number references — they were written before Section H landed) and rebase the
   liveness-guard edits on top of whatever Section H actually shipped.
3. When adding new test cases to `staff-invite.integration.test.ts`, append after Section H's
   cases; do not reorder or restructure existing `describe` blocks.
4. If Section H's CORS mount conflicts with anything ADM-013 needs (it should not — ADM-013 adds
   no new mount, only edits existing route bodies), stop and flag it in the phase report rather
   than resolving unilaterally.
5. `packages/api/src/index.ts` is otherwise **not a touchpoint of this plan** — ADM-013 does not
   add or change any `app.use(...)` mount line. The three new routes live in the existing
   `staff.ts` file, already mounted under `/api/admin/staff` via the append-only
   `routes/admin/index.ts` aggregator (inherits `requireAdmin` + CORS automatically — no
   aggregator edit needed).

## Part B — Staff Removal (NEW — minimal, `apps/admin`-only, zero backend changes)

### Design summary

Reuse-route, not enum-widen. Verified facts (direct source read, this PLAN pass):
- `packages/api/src/routes/admin/users.ts`'s `roleUpdateSchema = z.enum(['customer', 'staff',
  'admin', 'super_admin'])` — `customer` is ALREADY a valid target. No Zod change needed.
- `packages/api/src/routes/admin/staff.ts`'s `GET /` already filters
  `.where(inArray(users.role, [...STAFF_ROLES]))` — a demoted user structurally vanishes from the
  roster with zero new filtering logic.
- The self-modification guard (`req.params.id === req.adminSession.userId` → 400 `Cannot modify
  own role`) already applies generically to every role target, including `customer` — zero new
  server guard needed.
- **Conclusion: Part B requires ZERO backend/`packages/api` changes.** It is a pure `apps/admin`
  UI addition wired to the already-existing `useChangeStaffRole()` mutation.

### Part B — Touchpoints

| File | Change |
|---|---|
| `apps/admin/src/features/staff/components/staff-list.tsx` | Add an `Actions` column: a "Remove from staff" `Button` (destructive variant) per row, wrapped in the shared `ConfirmDialog` composite. New props: `currentUserId: string` (hide/disable the action on the signed-in user's own row — client mirror of the server's self-modification guard) and `onRemove: (member: AdminStaffMember) => void`. |
| `apps/admin/src/features/staff/components/staff-list.test.tsx` (extend if it exists, else NEW) | RTL: "Remove from staff" renders for other rows, absent/disabled for the row matching `currentUserId`; clicking it opens the confirm dialog; confirming calls `onRemove`; cancelling does not. |
| `apps/admin/src/routes/(dashboard)/staff.index.tsx` | Pass `currentUserId={useAdminAuth().user?.id}` and `onRemove={(member) => roleMutation.mutate({ id: member.id, role: 'customer' })}` to `<StaffList>`. Reuses the EXISTING `roleMutation` (`useChangeStaffRole()`) already instantiated in this file for the Role `<select>` — no new hook needed. `mutationError` (already surfaced) picks up a failed removal automatically since it already includes `roleMutation.error`. |

No new hook, no new API-lib function, no new route, no new migration, no new serializer for Part B.

### Part B — Public Contracts

No new or changed backend contract. `POST /api/admin/users/:id/role` is reused byte-identical —
this plan does not modify `packages/api/src/routes/admin/users.ts` in any way. The only "contract"
this plan adds is the client call shape already in use elsewhere in the codebase:
`postStaffRole(memberId, 'customer')` → existing `AdminApiError`-throwing `request<T>()` wrapper.

### Part B — Blast Radius

- **Packages touched:** `apps/admin` ONLY. Zero `packages/api` files touched by Part B (contrast
  with Part A, which is backend-heavy).
- **Risk class:** same AUTH-ADJACENT / PRIVILEGE-REVOKING class as Part A's revoke — Part B
  revokes an EXISTING user's staff-level access rather than a not-yet-accepted invite's link, but
  the trust-boundary shape (super_admin-only, destructive, confirm-gated) is identical. Both
  Part A and Part B are already under this plan's single `## High-Risk Execution Handoff Note`
  and its VALIDATE-driven evidence-pack determination — Part B does not need a separate
  determination, but VALIDATE's re-run (mandatory per the Scope Widened note above) must
  explicitly re-confirm the existing CONCERN's reasoning still covers Part B, not just restate it.
- **File count:** 2-3 files (`staff-list.tsx` edit, its test file new/extended, `staff.index.tsx`
  edit) — SMALL addition on top of Part A's COMPLEX-tier backend work. Total plan blast radius
  (Part A + Part B combined): ~15-16 files across 2 packages.
- **No migration, no new route, no new serializer, no schema change.**

### Part B — Implementation Checklist (Section H)

26. `apps/admin/src/features/staff/components/staff-list.tsx` — add an `Actions` column to the
    `DataTableColumn<AdminStaffMember>[]` array (after the existing `branch` column). Cell renders
    a destructive `Button` labeled "Remove from staff", wrapped in the existing `ConfirmDialog`
    composite (confirm copy: `Remove {name} from staff? They will immediately lose staff access.
    This cannot be undone from here.`, confirm label "Remove"). Hide the action entirely (render
    `null` in that cell) when `r.id === currentUserId` — matches the server's self-modification
    guard client-side, before the click, not just after a rejected request. Add `currentUserId:
    string | null` and `onRemove: (member: AdminStaffMember) => void` to `StaffListProps`.
27. `apps/admin/src/features/staff/components/staff-list.test.tsx` (extend if it exists — check
    first; create if it doesn't) — RTL: (a) "Remove from staff" renders for a non-self row and is
    absent for the row matching `currentUserId`; (b) clicking it opens the confirm dialog without
    calling `onRemove` yet; (c) confirming calls `onRemove` with the correct row; (d) cancelling
    calls neither `onRemove` nor mutates anything.
28. `apps/admin/src/routes/(dashboard)/staff.index.tsx` — thread `currentUserId={useAdminAuth().
    user?.id ?? null}` and `onRemove={(member) => roleMutation.mutate({ id: member.id, role:
    'customer' })}` into the existing `<StaffList>` call. No new hook, no new mutation — reuses
    `roleMutation` already declared in this file.
29. Full regression (extends Section G — do not duplicate, run once covering both Parts A and B):
    `pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin test && pnpm
    --filter @jojopotato/admin build && pnpm format:check`. (Part B touches no `packages/api`
    file, so the API typecheck/test gates are unaffected by Part B but still required for Part A.)

## Touchpoints

_Part A (pending invites, unchanged) below; Part B's touchpoints are in the `## Part B — Staff Removal` section above (apps/admin only, 3 files, zero packages/api changes)._

### `packages/api` (backend — 1 new migration, 1 schema edit, 3 new routes, 2 files with
liveness-guard edits shared with ADM-011 Section H)

| File | Change |
|---|---|
| `packages/api/src/db/schema/staff_invites.ts` | Add `revokedAt: timestamp('revoked_at')` (nullable), after `consumedAt`. |
| `packages/api/drizzle/0021_[generated-name].sql` + `packages/api/drizzle/meta/0021_snapshot.json` | Generated via `drizzle-kit generate` — additive `ALTER TABLE staff_invites ADD COLUMN revoked_at timestamp`. |
| `packages/api/drizzle/meta/_journal.json` | Auto-updated by `db:generate` (append idx 21 entry). |
| `packages/api/src/routes/staff-invite.ts` | Extend `/start`'s liveness check and `/consume`'s atomic WHERE clause to also reject `revokedAt !== null` / require `isNull(revokedAt)`. **Shared-file edit — see Sequencing above.** |
| `packages/api/src/routes/admin/staff.ts` | Extend the create-time supersede predicate's WHERE to also require `isNull(staffInvites.revokedAt)`. Add 3 new route handlers: `GET /invites`, `POST /invites/:id/revoke`, `POST /invites/:id/resend`. |
| `packages/api/src/routes/lib/serializers.ts` | Add `AdminPendingStaffInvite` interface + `serializeAdminPendingStaffInvite()` (new shape: `id`, `email`, `intendedRole`, `intendedBranchId`, `intendedBranchName`, `invitedBy` (name + email), `createdAt`, `expiresAt`; never `tokenHash`). |
| `packages/api/src/routes/__tests__/staff-invite.integration.test.ts` | New test cases proving AC4 (the core cross-file liveness invariant) — revoke, then assert both `/start` and `/consume` reject the exact same token. **Shared-file edit — append after Section H's cases, see Sequencing above.** |
| `packages/api/src/routes/admin/__tests__/admin-staff-invites-list.integration.test.ts` | NEW — AC1, AC2 (list shape + role matrix). |
| `packages/api/src/routes/admin/__tests__/admin-staff-invite-revoke.integration.test.ts` | NEW — AC3, AC8 (revoke behavior + role matrix). |
| `packages/api/src/routes/admin/__tests__/admin-staff-invite-resend.integration.test.ts` | NEW — AC5, AC6, AC7, AC8 (resend behavior + smuggled-field rejection + not-pending rejection + role matrix). |

### `apps/admin` (frontend — 1 new component, 1 hook file extended, 1 lib file extended, 1
screen extended)

| File | Change |
|---|---|
| `apps/admin/src/features/staff/lib/admin-staff-api.ts` | Add `AdminPendingStaffInvite` type, `listPendingStaffInvites()`, `revokeStaffInvite(id)`, `resendStaffInvite(id)`. |
| `apps/admin/src/features/staff/hooks/use-admin-staff.ts` | Add `usePendingStaffInvites()` (query), `useRevokeStaffInvite()` / `useResendStaffInvite()` (mutations, both invalidate the pending-invites query key on success). |
| `apps/admin/src/features/staff/components/pending-invites-list.tsx` | NEW — `DataTable` of pending invites (email / role / branch / invited by / sent / expires / actions column) + `ConfirmDialog` for revoke + a resend button with per-row pending state. Presentational, mirrors `staff-list.tsx`'s shape. |
| `apps/admin/src/features/staff/components/pending-invites-list.test.tsx` | NEW — RTL render test: rows render, revoke opens confirm dialog and calls the callback on confirm, resend calls the callback directly (no confirm — not destructive). |
| `apps/admin/src/routes/(dashboard)/staff.index.tsx` | Wire `usePendingStaffInvites`/`useRevokeStaffInvite`/`useResendStaffInvite`; render `<PendingInvitesList>` below `<StaffList>`, gated on `isSuperAdmin` (same cosmetic client gate as `AddStaffDialog`). |

## Public Contracts

### `GET /api/admin/staff/invites` (NEW, `staff.ts`, inherits `requireAdmin` — additionally
super_admin-gated inline)

- Guard order: 1) `req.adminSession.role !== 'super_admin'` → 403. 2) query + serialize.
- Query: `staffInvites` left-joined to `branches` (for `intendedBranchName`) and `users` (for
  `invitedBy` name/email, aliased to avoid colliding with the target-side `users` reference if
  any exists — there is none here since invites have no `userId`), filtered
  `isNull(consumedAt) AND isNull(revokedAt) AND gt(expiresAt, now)`, ordered `desc(createdAt)`.
- **200**: `{ invites: AdminPendingStaffInvite[] }`. Never includes `tokenHash`.
- **401/403**: unauthenticated / non-super_admin.

### `POST /api/admin/staff/invites/:id/revoke` (NEW, `staff.ts`, super_admin-gated inline)

- Guard order: 1) super_admin check → 403. 2) uuid-shape guard on `:id` → 404 on malformed
  (mirrors the existing `:id/branch` route's convention — never let a non-uuid hit Postgres and
  500). 3) atomic `UPDATE staff_invites SET revoked_at = now() WHERE id = :id AND
  consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING id` (same
  compare-and-swap shape as `/consume`'s atomic claim — a concurrent revoke or an already
  not-pending invite loses the race safely). 4) no row returned → 404.
- **200**: `{ id: string }` (or `{ revoked: true }` — PLAN leaves the exact success-body shape
  to EXECUTE; no client field beyond a confirmation is needed, since the client removes the row
  from its cached list via query invalidation, not from the response body).
- **404**: id doesn't exist, or exists but is not currently pending (already consumed/revoked/
  expired) — same status for all three, matching AC3's "no distinction" requirement.
- **401/403**: unauthenticated / non-super_admin.

### `POST /api/admin/staff/invites/:id/resend` (NEW, `staff.ts`, super_admin-gated inline)

- Guard order: 1) super_admin check → 403. 2) uuid-shape guard on `:id` → 404 on malformed.
  3) fetch the target row, requiring `isNull(consumedAt) AND isNull(revokedAt) AND
  gt(expiresAt, now)` → 404 if not found under that predicate (covers not-pending AC7). 4)
  **ignore the request body entirely** — no Zod schema parses role/branch from it; only `:id` is
  read from params (closes AC6's smuggling vector structurally, not just by validation). 5)
  generate a fresh `rawToken`/`tokenHash` + fresh `expiresAt = now + INVITE_TTL_MS`, `UPDATE
  staff_invites SET tokenHash = ..., expiresAt = ... WHERE id = :id AND isNull(consumedAt) AND
  isNull(revokedAt) AND gt(expiresAt, now) RETURNING email, intendedRole, intendedBranchId,
  expiresAt` (same atomic compare-and-swap shape as revoke — re-checks pending status at the
  exact moment of write, closing a TOCTOU race between step 3's read and this write). 6) no row
  returned → 404 (handles a race where the invite stopped being pending between steps 3 and 5).
  7) post-commit: `sendStaffInvite(email, rawToken)` (same fire-and-forget, non-blocking
  delivery pattern as invite-create — failure logs but does not fail the request).
- **200**: `{ invite: AdminStaffInviteSummary }` (reuse the EXISTING create-response shape —
  email/role/branch/expiry, no token) — the resend response deliberately mirrors the create
  response's shape/serializer (`serializeAdminStaffInvite`) since it describes the same kind of
  object update.
- **404**: id doesn't exist or is not pending. Zero mutation, zero send attempt (AC7).
- **401/403**: unauthenticated / non-super_admin.

### `POST /staff-invite/start` — liveness guard EXTENDED (existing route, `staff-invite.ts`)

- Adds `invite.revokedAt !== null` to the existing `invite.consumedAt !== null ||
  invite.expiresAt <= new Date()` OR-condition that returns 410. Requires selecting
  `staffInvites.revokedAt` in the existing `db.select({...})` projection.

### `POST /staff-invite/consume` — atomic WHERE EXTENDED (existing route, `staff-invite.ts`)

- Adds `isNull(staffInvites.revokedAt)` to the existing `and(eq(tokenHash, ...),
  isNull(consumedAt), gt(expiresAt, now))` WHERE clause on the atomic claim `UPDATE`.
- The existing "distinguish 404 vs 410" fallback query (when the atomic claim returns nothing)
  stays a plain existence check by `tokenHash` — a revoked invite still "exists," so it correctly
  falls into the 410 branch (same message as expired/consumed — the SPEC does not require a
  distinct "revoked" message to the invitee, only that the link is dead).

## Blast Radius

- **Packages touched:** `packages/api` (1 new migration, 1 schema column, 3 new route handlers,
  2 shared-file liveness-guard edits, 1 serializer addition, 4 test files new/extended),
  `apps/admin` (1 new component + test, 2 files extended, 1 screen extended).
- **Risk class:** AUTH-ADJACENT / PRIVILEGE-GRANTING, same trust-boundary class as ADM-011 — a
  revoke/resend both directly control the liveness of a privilege-granting token. This plan is
  a strong candidate for the 5-artifact high-risk execution evidence pack
  (`vc-risk-evidence-pack`) — VALIDATE should make the final call, matching how ADM-011 was
  handled (see SPEC Constraints).
- **New migration:** `0021` — purely additive (`ALTER TABLE staff_invites ADD COLUMN
  revoked_at timestamp`), zero change to any existing column, zero backfill (all existing rows
  get `NULL`, meaning "not revoked" — correct default with no data migration needed).
- **Existing-file edits, not new routes:** `staff-invite.ts` (2 predicate extensions, no new
  route), `staff.ts` (1 predicate extension to the existing supersede logic + 3 new route
  handlers appended to the file).
- **No modification to any existing, already-locked route's request/response shape** — the
  create route's contract (`POST /api/admin/staff/invite`) is unchanged; `/start`/`/consume`'s
  contracts are unchanged except for which requests they now reject (a revoked token that used
  to 200 now 410s — this IS the feature, not a regression).
- **File count:** ~13 new/changed files across 2 packages (7 backend incl. 4 test files, 6
  frontend incl. 1 test file) — COMPLEX-tier blast radius.
- **Overlap with ADM-011 Section H:** 2 files (`staff-invite.ts`, the shared integration test
  file) are touched by both plans — see `## Sequencing / Overlap With ADM-011 Section H` above.
  `index.ts` is touched by Section H but NOT by this plan.

## Implementation Checklist (Execution Checklist)

### Section A — Migration + schema (packages/api)

1. `packages/api/src/db/schema/staff_invites.ts` — add `revokedAt: timestamp('revoked_at')`
   (nullable, no default) directly after `consumedAt` in the column list. Update the file's
   header doc comment to mention `revoked_at` alongside `consumed_at` (both nullable, mutually
   exclusive by construction per D1).
2. Run `pnpm --filter @jojopotato/api db:generate` to produce migration
   `0021_[generated-name].sql` + `0021_[generated-name]_snapshot.json`; confirm the generated
   SQL is exactly `ALTER TABLE "staff_invites" ADD COLUMN "revoked_at" timestamp;` (or
   equivalent single-column-add) — if drizzle-kit proposes anything touching an existing column,
   stop and re-check the schema edit before applying.
3. Run `pnpm --filter @jojopotato/api db:migrate` against local Postgres; confirm it applies
   cleanly with zero errors.

### Section B — `staff-invite.ts` liveness-guard extension (SHARED FILE — re-scan before editing, see Sequencing)

4. `/start` handler: add `staffInvites.revokedAt` to the `db.select({...})` projection; extend
   the guard condition to `invite.consumedAt !== null || invite.expiresAt <= new Date() ||
   invite.revokedAt !== null` (or an equivalent early-return per revoked/expired/consumed —
   PLAN does not mandate a distinct message per SPEC's "no distinction required" wording).
5. `/consume` handler: add `isNull(staffInvites.revokedAt)` to the atomic claim's `and(...)`
   WHERE clause alongside the existing `isNull(consumedAt)`/`gt(expiresAt, now)` conditions.

### Section C — `staff.ts` supersede predicate + 3 new routes

6. Extend the existing create-time supersede `UPDATE ... WHERE` (inside the `POST /invite`
   transaction) to add `isNull(staffInvites.revokedAt)` alongside its existing
   `isNull(consumedAt)`/`gt(expiresAt, now)` conditions — a revoked invite for the same email
   should never be "superseded" again (it's already dead; touching its `consumedAt` would be
   semantically wrong — a revoked invite was never accepted).
7. Add `GET /invites` handler per the Public Contracts section above — super_admin guard, join
   `branches` + `users` (aliased for the inviter), filter, order, serialize via the new
   `serializeAdminPendingStaffInvite`.
8. Add `POST /invites/:id/revoke` handler per the Public Contracts section above — uuid guard,
   atomic compare-and-swap `UPDATE`, 404 on no-row.
9. Add `POST /invites/:id/resend` handler per the Public Contracts section above — uuid guard,
   pending-check read, ignore request body, generate fresh token/hash/expiry, atomic
   compare-and-swap `UPDATE` on the SAME row, post-commit `sendStaffInvite` call, respond with
   the existing `serializeAdminStaffInvite` shape.

### Section D — Serializers

10. `packages/api/src/routes/lib/serializers.ts`: add
    ```ts
    export interface AdminPendingStaffInvite {
      id: string;
      email: string;
      intendedRole: 'staff' | 'admin' | 'super_admin';
      intendedBranchId: string | null;
      intendedBranchName: string | null;
      invitedByName: string;
      invitedByEmail: string;
      createdAt: string;
      expiresAt: string;
    }
    export function serializeAdminPendingStaffInvite(row: {...}): AdminPendingStaffInvite { ... }
    ```
    placed directly after `serializeAdminStaffInvite`, matching that block's doc-comment style
    ("NEVER carries the raw token or its hash").

### Section E — Backend tests

11. `packages/api/src/routes/__tests__/staff-invite.integration.test.ts` — **append** (do not
    reorder existing blocks; append after ADM-011 Section H's own new cases) a case proving AC4:
    create an invite → capture its raw token via the existing log-capture technique → revoke it
    via `POST /api/admin/staff/invites/:id/revoke` (super_admin session) → assert `POST
    /staff-invite/start` with that exact token now 410s → assert `POST /staff-invite/consume`
    with that exact token now also rejects (410 or, if `/start` was never called successfully,
    whatever status the atomic claim's fallback branch reaches — confirm both paths reject, zero
    session/account mutation).
12. `packages/api/src/routes/admin/__tests__/admin-staff-invites-list.integration.test.ts`
    (NEW) — AC1 (seed one pending + one consumed + one revoked + one expired invite; assert the
    list returns exactly the pending one with the full expected shape and no `tokenHash` field
    anywhere in the JSON), AC2 (401 unauthenticated, 403 non-super_admin admin).
13. `packages/api/src/routes/admin/__tests__/admin-staff-invite-revoke.integration.test.ts`
    (NEW) — AC3 (revoke a seeded pending invite → 200 → confirm it no longer appears in the list
    route's response → second revoke on the same id → 404 → revoke on a seeded already-consumed
    invite → 404 → revoke on a nonexistent id → 404), AC8 (401/403 matrix for revoke).
14. `packages/api/src/routes/admin/__tests__/admin-staff-invite-resend.integration.test.ts`
    (NEW) — AC5 (create → capture original token → resend → capture new token, assert it
    differs from the original → assert the OLD token now rejects at both `/start` and
    `/consume` → assert the NEW token succeeds through the full accept flow with the original
    role/branch preserved), AC6 (resend with a smuggled `intendedRole`/`intendedBranchId` in the
    request body → assert the new token's accepted role/branch still matches the ORIGINAL
    invite, unaffected by the smuggled payload), AC7 (resend against a seeded consumed invite
    and a seeded revoked invite → both 404, assert zero row mutation via a direct DB read and
    zero send attempt via the log spy), AC8 (401/403 matrix for resend).

### Section F — `apps/admin` frontend

15. `apps/admin/src/features/staff/lib/admin-staff-api.ts` — add:
    ```ts
    export interface AdminPendingStaffInvite {
      id: string; email: string; intendedRole: StaffRole;
      intendedBranchId: string | null; intendedBranchName: string | null;
      invitedByName: string; invitedByEmail: string;
      createdAt: string; expiresAt: string;
    }
    export function listPendingStaffInvites(): Promise<AdminPendingStaffInvite[]>   // GET {STAFF_API}/invites
    export function revokeStaffInvite(id: string): Promise<void>                     // POST {STAFF_API}/invites/${id}/revoke
    export function resendStaffInvite(id: string): Promise<StaffInviteSummary>       // POST {STAFF_API}/invites/${id}/resend
    ```
    matching the existing `request<T>()` wrapper convention exactly (no new fetch helper).
16. `apps/admin/src/features/staff/hooks/use-admin-staff.ts` — add a new query key
    `PENDING_INVITES_KEY = ['admin', 'staff', 'invites'] as const`, plus:
    ```ts
    export function usePendingStaffInvites() // useQuery(PENDING_INVITES_KEY, listPendingStaffInvites)
    export function useRevokeStaffInvite()   // useMutation, invalidates PENDING_INVITES_KEY
    export function useResendStaffInvite()   // useMutation, invalidates PENDING_INVITES_KEY
    ```
17. `apps/admin/src/features/staff/components/pending-invites-list.tsx` (NEW) — presentational,
    props-driven (mirrors `staff-list.tsx`/`add-staff-dialog.tsx`'s pattern: parent wires
    react-query, component takes plain callbacks): `invites`, `isLoading`, `error`, `onRevoke:
    (invite) => void`, `onResend: (invite) => void`, `revokePendingId`/`resendPendingId` (for
    per-row busy state). Uses `DataTable` with columns: Email, Role, Branch (`—` when null),
    Invited by, Sent, Expires, Actions (Revoke button + Resend button). Revoke opens a
    `ConfirmDialog` ("Revoke invite for {email}? This cannot be undone.", destructive, confirm
    label "Revoke"). Resend has NO confirm dialog (SPEC frames it as a low-stakes refresh
    action, not destructive) — a direct button click calls `onResend` immediately, with a
    "Resending…" busy label matching the `AddStaffDialog` busy-label convention.
18. `apps/admin/src/features/staff/components/pending-invites-list.test.tsx` (NEW) — RTL: renders
    a seeded row set; clicking Revoke opens the confirm dialog and only calls `onRevoke` after
    confirming; clicking Resend calls `onResend` directly with no dialog; empty state renders
    when `invites` is `[]`.
19. `apps/admin/src/routes/(dashboard)/staff.index.tsx` — wire `usePendingStaffInvites`,
    `useRevokeStaffInvite`, `useResendStaffInvite`; render `<PendingInvitesList>` below
    `<StaffList>` inside an `isSuperAdmin ? (...) : null` gate (same cosmetic client gate as
    `AddStaffDialog` — server enforces the real 403). Surface a revoke/resend mutation error the
    same way `mutationError` already surfaces branch/role mutation errors.

### Section G — Full regression + format

20. `pnpm --filter @jojopotato/api typecheck` clean.
21. `pnpm --filter @jojopotato/api test` — full suite green, including all 4 new/extended test
    files above.
22. `pnpm --filter @jojopotato/admin typecheck` clean.
23. `pnpm --filter @jojopotato/admin test` — full suite green, including the new
    `pending-invites-list.test.tsx`.
24. `pnpm --filter @jojopotato/admin build` clean.
25. `pnpm format:check` clean on all touched files.

## Acceptance Criteria

Mirrors the SPEC's 13 ACs verbatim (9 Part A + 4 Part B, see SPEC for full prose) — restated here
as the testable pass/fail statements this plan's Verification Evidence section proves:

1. Listing pending invites returns exactly unconsumed+unrevoked+unexpired invites with the full
   expected field shape, never `tokenHash`.
2. The list route is super_admin-only (403 non-super_admin, 401 unauthenticated).
3. Revoking a pending invite sets it revoked and it drops off the list; second revoke 404s;
   revoke on a consumed/expired/nonexistent invite 404s.
4. **HARD, Known-Gap banned:** after revoke, the invite's exact original token is rejected at
   BOTH `/staff-invite/start` and `/staff-invite/consume`.
5. Resend issues a genuinely new token with the SAME email/role/branch; the old token dies the
   instant resend succeeds.
6. Resend ignores any client-supplied role/branch in the request body.
7. Resend is rejected (404, zero mutation, zero send) for a non-pending invite.
8. Revoke and resend are both super_admin-only, matching AC2's boundary.
9. The Pending Invites UI (list, revoke confirm+removal, resend+updated expiry) works in a real
   browser — Agent-Probe, standing no-E2E-runner residual.
10. Staff removal demotes the target to `customer` via the existing role route; the removed user
    immediately drops off the Staff list.
11. A super_admin can never remove/demote their own account — server 400 (pre-existing coverage)
    + the UI never offers the action on the signed-in user's own row.
12. Removal is super_admin-only — pre-existing server 403 coverage + the same client-gate pattern
    already proven for Role/Branch controls.
13. The "Remove from staff" UI (confirm dialog, row disappearance, hidden for non-super_admin and
    for self) works in a real browser — Agent-Probe, standing no-E2E-runner residual.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `admin-staff-invites-list.integration.test.ts` — list shape + state filtering | Fully-Automated | AC1 |
| `admin-staff-invites-list.integration.test.ts` — 401/403 matrix | Fully-Automated | AC2 |
| `admin-staff-invite-revoke.integration.test.ts` — revoke + drop-off + double-revoke + consumed/expired/nonexistent 404 | Fully-Automated | AC3 |
| `staff-invite.integration.test.ts` — revoked token rejected at both `/start` and `/consume` (HARD gate, Known-Gap banned) | Fully-Automated | AC4 |
| `admin-staff-invite-resend.integration.test.ts` — new token issued, same email/role/branch, old token dies | Fully-Automated | AC5 |
| `admin-staff-invite-resend.integration.test.ts` — smuggled role/branch ignored | Fully-Automated | AC6 |
| `admin-staff-invite-resend.integration.test.ts` — not-pending 404, zero mutation, zero send | Fully-Automated | AC7 |
| `admin-staff-invite-revoke.integration.test.ts` + `admin-staff-invite-resend.integration.test.ts` — 401/403 matrix | Fully-Automated | AC8 |
| `pending-invites-list.test.tsx` — render/confirm/resend RTL coverage (supporting, not AC9 itself) | Fully-Automated | (supports AC9's UI shape, does not replace the browser walkthrough) |
| Manual admin-dashboard walkthrough: Pending Invites list renders, revoke confirm-dialog + row removal, resend + updated expiry, all super_admin-gated in a real browser | Agent-Probe | AC9 |
| `staff-list.test.tsx` — Remove-from-staff render/confirm/self-hidden coverage | Fully-Automated | AC10 (partial — component wiring), AC11 (client half — action hidden for self) |
| Existing role-route coverage (`admin-users-role.integration.test.ts` or equivalent, self-modification-guard case) + one new targeted assertion: POST role=customer against a seeded staff user, confirm 200 + user drops off `GET /api/admin/staff` | Fully-Automated | AC10 (server half), AC11 (server half — self-guard already generic), AC12 (server half — pre-existing 403) |
| Manual admin-dashboard walkthrough: Remove-from-staff confirm dialog, row disappearance, action hidden for non-super_admin and for the signed-in user's own row | Agent-Probe | AC13 |

### Failing stubs (TDD-first, for the Fully-Automated rows above)

```
test("list returns only pending invites with full shape, no tokenHash", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC1 list shape + state filtering")
})
test("list route requires super_admin", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC2 401/403 matrix")
})
test("revoke sets revoked_at, drops from list, rejects double-revoke and non-pending targets", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC3 revoke behavior")
})
test("revoked invite token rejected at both /start and /consume", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC4 liveness invariant (HARD gate)")
})
test("resend issues new token, preserves email/role/branch, kills old token", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC5 resend behavior")
})
test("resend ignores client-supplied role/branch", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC6 resend smuggling rejection")
})
test("resend rejects non-pending invites with zero mutation and zero send", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC7 resend not-pending rejection")
})
test("revoke and resend both require super_admin", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC8 401/403 matrix")
})
test("remove-from-staff demotes to customer and target drops off staff list", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC10 staff removal")
})
test("remove-from-staff action hidden for the signed-in user's own row", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC11 client half — self-removal guard")
})
```

## Missing Test Areas

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| Real browser render of Pending Invites list/actions | No `apps/admin` E2E/browser runner exists (project-wide gap) | Agent-Probe walkthrough (AC9), same standing residual as every prior admin-dashboard phase |
| Concurrent double-resend race (two simultaneous resend calls on the same invite) | Would need real concurrent request orchestration against a live DB — outside this plan's blast radius to build a harness for | Accepted as known-gap; the atomic compare-and-swap UPDATE (Section C step 9) already makes this safe in practice — one wins, the other's `RETURNING` is empty and 404s — but a dedicated concurrency test is not written this phase |

## Test Gate Commands

```bash
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/admin build
pnpm format:check
```

Precondition for the `@jojopotato/api` test run: local Postgres up (`docker compose up -d` or a
native instance per `process/context/tests/all-tests.md`) and migrated
(`pnpm --filter @jojopotato/api db:migrate`) through `0021`.

## Test Infra Improvement Notes

(none identified yet)

## High-Risk Execution Handoff Note

This plan sits in the same AUTH-ADJACENT / PRIVILEGE-GRANTING risk class as ADM-011 (revoke and
resend both directly control the liveness of a privilege-granting token). VALIDATE should decide
whether the 5-artifact high-risk execution evidence pack (`vc-risk-evidence-pack`) applies here,
consistent with how ADM-011 was handled (`harness/` in that task folder). Not pre-decided by this
plan.

**VALIDATE's call (21-07-26): full 5-artifact pack NOT required — see `## Validate Contract` →
Dimension findings → Security surface for the reasoning. This determination itself is a CONCERN
pending explicit human confirmation before EXECUTE (see `Accepted by` below); it is not a
self-approval of the underlying trust-boundary change.**

## Phase Completion Rules

- **CODE DONE**: all Section G + Section H gates green, all Fully-Automated ACs (1–8, 10, 11
  server+client halves, 12 server+client halves) passing, AC4 proven non-vacuous (a
  deliberately-broken liveness guard should turn the AC4 test red — confirm this during EXECUTE,
  do not just trust a green run).
- **VERIFIED**: CODE DONE, plus AC9's AND AC13's manual admin-dashboard walkthroughs both
  performed and passed by the user. Until then this task folder stays in `active/`, not archived.

## Resume and Execution Handoff

1. **Selected plan file path:** this file —
   `process/features/admin-dashboard/active/adm-013-invite-management_21-07-26/adm-013-invite-management_PLAN_21-07-26.md`.
2. **Last completed phase or step:** PLAN drafted (this document). INNOVATE was skipped per the
   SPEC's own framing (design already locked, mechanical implementation). VALIDATE has now run
   (this pass) — see `## Validate Contract` below. Nothing has been executed yet.
3. **Validate-contract status:** written this pass — `Gate: CONDITIONAL`. See `## Validate
   Contract` below. EXECUTE cannot start until (a) the security-surface CONCERN is explicitly
   accepted or overridden by a human, AND (b) ADM-011 Section H has landed as a real commit.
4. **Supporting context files loaded during PLAN:** `adm-013-invite-management_SPEC_21-07-26.md`
   (this task folder), `adm-011-add-staff_PLAN_21-07-26.md` (sibling task folder — read for the
   `staff_invites` schema, the `sendStaffInvite`/token-capture-in-tests conventions, and the
   Section H sequencing constraint), plus direct reads of
   `packages/api/src/routes/staff-invite.ts`,
   `packages/api/src/db/schema/staff_invites.ts`,
   `packages/api/src/routes/admin/staff.ts`,
   `packages/api/src/routes/admin/index.ts`,
   `packages/api/src/routes/lib/serializers.ts` (existing `serializeAdminStaffInvite` block),
   `packages/api/src/index.ts` (mount points),
   `apps/admin/src/routes/(dashboard)/staff.index.tsx`,
   `apps/admin/src/features/staff/{lib/admin-staff-api.ts,hooks/use-admin-staff.ts,
   components/add-staff-dialog.tsx}`,
   `apps/admin/src/components/{confirm-dialog.tsx,data-table.tsx}`,
   `packages/api/src/routes/admin/__tests__/admin-staff-invite-create.integration.test.ts`,
   `packages/api/src/routes/__tests__/staff-invite.integration.test.ts` (token-capture technique),
   `process/context/all-context.md` (root router).
5. **Next step for a fresh agent picking up mid-execution:** VALIDATE has produced
   `Gate: CONDITIONAL` (this pass). Before EXECUTE: (a) relay the security-surface CONCERN to the
   user and record their decision in the `Accepted by` field below (or run a plan-validate-fix
   supplement cycle if they want the full evidence pack instead); (b) confirm ADM-011 Section H
   has landed as a committed change (`git log --oneline -- packages/api/src/routes/staff-invite.ts
   packages/api/src/index.ts` must show a real commit — it did NOT as of this VALIDATE pass, see
   `## Validate Contract` → Open gaps) before starting EXECUTE Section B/C/E. If Section H has not
   yet landed, wait — do not begin EXECUTE.

## Validate Contract

Status: CONDITIONAL
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Signal count 2/7 (S1 multi-package scope: packages/api + apps/admin; S6 high-risk
class present: auth/trust-boundary). Below the parallel-subagent threshold (2-3) but a single
plan of this size does not warrant fan-out overhead for VALIDATE itself — Layer 1 (4 dimensions)
+ Layer 2 (7 sections A-G) were run as one synthesized pass by a single validate-agent reading
the plan plus direct ground-truth source reads, matching the "MEDIUM" tier's intent without the
coordination cost. EXECUTE strategy recommendation (separate from this VALIDATE-fan-out
rationale): sequential — a single vc-execute-agent, since Sections A→B→C→D→E→F→G are strictly
ordered by file dependency (schema before routes before serializers before tests before UI) and
Section B/C are shared-file edits that must not run concurrently with anything else touching the
same files.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | List returns exactly unconsumed+unrevoked+unexpired invites, full field shape, never tokenHash | Fully-Automated | `admin-staff-invites-list.integration.test.ts` — list shape + state filtering | A |
| AC2 | List route is super_admin-only | Fully-Automated | `admin-staff-invites-list.integration.test.ts` — 401/403 matrix | A |
| AC3 | Revoke sets revoked, drops from list; double-revoke and non-pending targets 404 | Fully-Automated | `admin-staff-invite-revoke.integration.test.ts` | A |
| AC4 (HARD, Known-Gap banned) | Revoked invite's exact original token rejected at BOTH /start and /consume | Fully-Automated | `staff-invite.integration.test.ts` — appended revoke-then-reject case | A |
| AC5 | Resend issues new token, preserves email/role/branch, old token dies immediately | Fully-Automated | `admin-staff-invite-resend.integration.test.ts` | A |
| AC6 | Resend ignores client-supplied role/branch (smuggling rejected) | Fully-Automated | `admin-staff-invite-resend.integration.test.ts` — smuggled-field case | A |
| AC7 | Resend on non-pending invite: 404, zero mutation, zero send | Fully-Automated | `admin-staff-invite-resend.integration.test.ts` — not-pending case | A |
| AC8 | Revoke and resend both super_admin-only | Fully-Automated | `admin-staff-invite-revoke.integration.test.ts` + `admin-staff-invite-resend.integration.test.ts` — 401/403 matrices | A |
| AC9 | Pending Invites UI (list/revoke/resend) works in a real browser | Agent-Probe | Manual admin-dashboard walkthrough | D |
| (supporting, not a numbered AC) | Concurrent double-resend race | Known-Gap | — (atomic compare-and-swap UPDATE structurally proves safety; no dedicated concurrency harness built) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/api` invite list/revoke/resend routes: Fully-automated: `pnpm --filter @jojopotato/api test` (4 new/extended integration test files, AC1–AC8) | known-gap: concurrent double-resend race (documented, atomic UPDATE mitigates in practice)
- `packages/api` staff-invite.ts liveness guard extension: Fully-automated: `pnpm --filter @jojopotato/api test` (AC4, Known-Gap banned, must be proven non-vacuous by a deliberately-broken-guard mutation check during EXECUTE)
- `apps/admin` Pending Invites UI: Fully-automated: `pnpm --filter @jojopotato/admin test` (`pending-invites-list.test.tsx` — render/confirm/resend RTL coverage) | agent-probe: manual browser walkthrough (AC9, standing no-E2E-runner project-wide gap)
- Full regression: hybrid: `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/api test && pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin test && pnpm --filter @jojopotato/admin build && pnpm format:check` + precondition: local Postgres up and migrated through `0021`

Dimension findings:
- Infra fit: PASS — Migration number `0021` confirmed correct (last on disk is `0020_minor_scarecrow.sql`, journal idx 20). New routes mount under the existing append-only `/api/admin/staff` aggregator with zero aggregator edit needed (confirmed: `routes/admin/index.ts` already mounts `staffRouter` at `/staff`, inherits `requireAdmin`+CORS). No container/infra/worker surfaces touched.
- Test coverage: PASS — all 8 numbered ACs (AC1-8) are Fully-Automated; AC4 is explicitly Known-Gap-banned with a required non-vacuous mutation check (deliberately-broken guard must fail). AC9 is Agent-Probe (standing project-wide `apps/admin` no-E2E-runner gap, consistent with every prior admin-dashboard phase — not a new gap). One accepted known-gap (concurrent double-resend race) carries a documented rationale (atomic compare-and-swap UPDATE structurally proves the race is safe even without a dedicated harness) — acceptable per vc-test-coverage-plan's resolution-option-C requirement.
- Breaking changes: PASS — no existing route's request/response contract changes. `/start`/`/consume` reject a strictly narrower set of previously-accepted requests (a revoked token that used to 200 now 410s) — this is the feature working as designed, not a regression, and is exactly what AC4 tests. `POST /api/admin/staff/invite`'s contract is untouched.
- Security surface: CONCERN — auth-adjacent/privilege trust-boundary surface (super_admin-gated revoke/resend of a privilege-granting token). Findings below; net effect is a CONDITIONAL gate requiring explicit human sign-off on the evidence-pack determination, not a FAIL.
- Section A (migration+schema): PASS — mirrors `consumedAt`'s exact column shape; additive, zero backfill, mechanically verified against the current schema file and migration directory.
- Section B (staff-invite.ts liveness guard): PASS — mechanically verified against the CURRENT (uncommitted) working-tree content of `/start` and `/consume`; both edits are single-line additive extensions to an already-imported `isNull`/existing OR-condition. The plan's own Sequencing section correctly anticipates this file is shared with ADM-011 Section H — confirmed accurate: `git status` shows `staff-invite.ts` is untracked and `index.ts` is modified (Section H has NOT yet landed as a commit as of this VALIDATE pass).
- Section C (staff.ts supersede + 3 new routes): CONCERN — mechanically feasible (route paths `/invites`, `/invites/:id/revoke`, `/invites/:id/resend` do not collide with the existing `/`, `/:id/branch`, `/invite` routes; `isNull`/`gt`/`and`/`eq` already imported in `staff.ts`; the `uuid` malformed-id-guard pattern already established by the `/:id/branch` route). Three minor gaps found, none blocking: (1) the revoke success-body shape (`{id}` vs `{revoked:true}`) is left open by the plan — needs an EXECUTE-time decision; (2) the plan's prose says the `GET /invites` join to `users` should be "aliased," but this query only joins `users` ONCE (unlike `analytics.ts`'s genuine double-self-join precedent for `alias()`) — no alias is actually required, a plain `leftJoin(users, eq(staffInvites.createdBy, users.id))` suffices; importing `alias()` here would be unnecessary complexity; (3) the Public Contracts prose says "invitedBy (name + email)" while Section D's actual interface flattens to `invitedByName`/`invitedByEmail` — purely a wording inconsistency, Section D and Section F agree with each other on the flattened shape, no real conflict.
- Section D (serializers): PASS — mirrors `serializeAdminStaffInvite`'s exact pattern; the new interface/function never touches `tokenHash` (confirmed against the row shape both are documented to receive).
- Section E (backend tests): PASS — one minor ambiguity: "append after Section H's cases" could mean end-of-file (after the CORS `describe` block) or inside the `describe('staff-invite accept flow', ...)` block; both are structurally valid and neither reorders existing blocks, so this is non-blocking (see Execute-Agent Instructions).
- Section F (apps/admin frontend): PASS — mechanically verified: `confirm-dialog.tsx` and `data-table.tsx` exist and are directly reusable; `add-staff-dialog.tsx` confirms the presentational-component-with-parent-wired-react-query convention this plan follows; `staff.index.tsx`'s current content already has the exact `isSuperAdmin ? (...) : null` gate pattern this plan reuses for `<PendingInvitesList>`.
- Section G (regression+format): PASS — all 6 gate commands correspond to real, live runners confirmed via `process/context/tests/all-tests.md` (packages/api vitest, apps/admin vitest+build, root format:check).

Open gaps:
- **Sequencing precondition, NOT a plan defect — confirmed still unresolved at VALIDATE time (21-07-26):** `git log --oneline -- packages/api/src/routes/staff-invite.ts packages/api/src/index.ts` returns EMPTY (no commits) and `git status` shows `staff-invite.ts` untracked + `index.ts` modified on branch `feat/adm-011-add-staff` — ADM-011 Section H has NOT yet landed as a real commit. EXECUTE for this plan MUST NOT start until it has. This is exactly the risk the plan's own `## Sequencing / Overlap With ADM-011 Section H` section anticipated; VALIDATE confirms the anticipation was correct and the constraint is still live.
- Revoke success-response body shape (`{id}` vs `{revoked:true}`) — left to EXECUTE, non-blocking (see Execute-Agent Instructions).
- Known-gap: concurrent double-resend race — documented, accepted, rationale recorded above (not counted toward CONDITIONAL/BLOCKED).

What this coverage does NOT prove:
- The Fully-Automated integration tests (AC1-AC8) prove server-side behavior only — they do not prove the `apps/admin` UI actually renders the list, opens the confirm dialog, or reflects a post-revoke/resend state change in a real browser. AC9's Agent-Probe walkthrough is required for that, and remains a standing residual until performed.
- The RTL test for `pending-invites-list.test.tsx` proves the presentational component's callback wiring in isolation (mocked props) — it does NOT prove the real `usePendingStaffInvites`/`useRevokeStaffInvite`/`useResendStaffInvite` react-query hooks correctly call the live API or invalidate the cache correctly end-to-end; that is only proven indirectly by the AC9 manual walkthrough.
- AC4's non-vacuous requirement (a deliberately-broken liveness guard must turn the test red) is a REQUIRED EXECUTE-time verification step, not something this VALIDATE pass itself can prove — VALIDATE can only confirm the test plan calls for it.
- No automated test proves the concurrent double-resend race is actually safe under real concurrent load — the atomic compare-and-swap UPDATE's safety is a code-reading argument, not an empirically executed regression test.
- The `alias()`-not-needed simplification note (Section C finding) has not itself been test-verified — it is a code-reading observation about the current `users` table usage in this specific query, not a proven claim about all future query shapes.

Gate: CONDITIONAL (0 FAILs; 1 substantive CONCERN — security surface / high-risk-evidence-pack determination — requires explicit human confirmation before EXECUTE; several minor non-blocking Section C/E clarifications folded into Execute-Agent Instructions below)
Accepted by: PENDING — orchestrator must relay this CONCERN to the user (or the plan's designated approver) and record their decision here verbatim before EXECUTE begins. Options: (a) accept VALIDATE's determination that the full 5-artifact evidence pack is not required, given this is a READ-mostly + revoke/resend-only surface with no new privilege-grant path and AC4's Known-Gap-banned automated proof already covers the core invariant; or (b) require the full `vc-risk-evidence-pack` (mirroring ADM-011's `harness/`) before EXECUTE, in which case re-run VALIDATE after that pack exists. Do NOT proceed to EXECUTE with this field still reading PENDING.

### Execute-Agent Instructions (non-blocking, informational)

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Pick a revoke success-response body shape (`{id}` or `{revoked:true}`) and use it consistently; no client field is strictly required since the UI relies on query invalidation, not the response body. | Section C step 8 |
| E2 | The `GET /invites` query needs only ONE join to `users` (for the inviter) — a plain `leftJoin(users, eq(staffInvites.createdBy, users.id))` is sufficient; do NOT import `alias()` from drizzle-orm for this query (that pattern is for genuine double-self-joins, e.g. `analytics.ts`'s `historyOrders` alias, which does not apply here). | Section C step 7 |
| E3 | When appending the AC4 case to `staff-invite.integration.test.ts`, add it either as a new `it()` inside the existing `describe('staff-invite accept flow', ...)` block or as its own `describe` placed AFTER the existing `describe('staff-invite CORS for the admin web origin (Section H)', ...)` block — either is acceptable; do not reorder or restructure either existing block. | Section E step 11 |
| E4 | Before starting Section B/C/E, run `git log --oneline -- packages/api/src/routes/staff-invite.ts packages/api/src/index.ts` and confirm it is non-empty (ADM-011 Section H committed). If empty, STOP — do not begin EXECUTE. Re-read both files fresh (do not trust this plan's line-number references) once confirmed. | Before Section B |

## Autonomous Goal Block

SESSION GOAL: Ship ADM-013 — super_admin visibility and control (list/revoke/resend) over
pending staff invites, closing the gap left by ADM-011's create-only invite surface.
Charter + umbrella plan: N/A — single COMPLEX plan (admin-dashboard's 8-phase program is
already COMPLETE; this is standalone follow-up work, not a program phase).
Autonomy: Standard RIPER-5 gates apply (no standing /goal active for this plan). EXECUTE requires
explicit "ENTER EXECUTE MODE" AND resolution of the Gate: CONDITIONAL Accepted-by field below
(cannot be auto-accepted — this is a trust-boundary surface, not a reversible-only decision).
Hard stop conditions / safety constraints:
- Do not begin EXECUTE Section B/C/E until `git log --oneline -- packages/api/src/routes/staff-invite.ts packages/api/src/index.ts` shows ADM-011 Section H has landed as a real commit (confirmed NOT yet landed as of this VALIDATE pass, 21-07-26).
- AC4 (revoked-token-rejected-at-both-endpoints) is Known-Gap-banned — EXECUTE must prove it non-vacuous (deliberately break the guard, confirm the test goes red, then restore it) before reporting DONE.
- Resend must never accept a client-supplied role/branch (AC6) — the body must be ignored structurally (no Zod schema parsing role/branch from it), not merely validated-and-rejected.
- No route under this plan may ever serialize `tokenHash` in any response.
- Do not self-approve the high-risk-evidence-pack determination — a human must confirm or override the CONCERN recorded in this Validate Contract before EXECUTE.
Next phase: PVL supplement cycle OR explicit user acceptance of the CONDITIONAL gate (see
`Accepted by` field above) → then EXECUTE MODE for this plan.
Validate contract: inline in this plan file (`## Validate Contract` section above).
Execute start: `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/api test`
(after Section A-E) | `pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin test && pnpm --filter @jojopotato/admin build` (after Section F) | `pnpm format:check` (final) |
Agent-Probe: manual Pending Invites walkthrough (AC9) | high-risk pack: NOT required per VALIDATE's
determination above, pending human confirmation (see Accepted by).

## Inner Loop Refresh Note

Date: 21-07-26

Scope widened this session (user decision): added **Part B — Staff Removal/Demotion** to what was
previously an invite-management-only plan. Summary of what changed:

- SPEC updated in place: new user stories 6-8, a full "Part B — Staff removal" behavioral-outcomes
  section, ACs 10-13, new Out-of-Scope bullets (general Users screen / ADM-010, audit log, bulk
  removal, branch-clearing-on-removal), a new locked decision D4 (reuse the existing role route —
  zero backend changes), and a Part-B Background/Research section recording the verified facts
  (role route already accepts `customer`, staff list already filters by role, self-modification
  guard already generic).
- PLAN updated in place: a new `## Part B — Staff Removal` section (design summary, touchpoints,
  public contracts — none, blast radius, Implementation Checklist Section H, steps 26-29), ACs
  10-13 added to `## Acceptance Criteria`, 4 new rows added to `## Verification Evidence`, 2 new
  failing TDD stubs appended.
- **Net result: this plan's total scope is now Part A (unchanged, backend-heavy) + Part B (new,
  `apps/admin`-only, zero backend changes, small — 3 touched files).**

**This note's date (21-07-26) is NOT newer than the existing `## Validate Contract`'s `date:
2026-07-21` field** (same calendar day) — per `orchestration.md`'s literal date-comparison rule
this could read as ambiguous. **Explicit instruction to the orchestrator: treat this Refresh Note
as newer regardless of the same-day timestamp** — it was written AFTER the Validate Contract in
this same session, describes a real scope change the existing contract never evaluated (Part B did
not exist when the contract was written), and the existing contract's own CONDITIONAL gate was
never accepted (`Accepted by: PENDING`) — so EXECUTE was already blocked on this plan regardless.
**Re-run PVL from V1 before EXECUTE.** Do not auto-proceed on the existing CONDITIONAL gate; it
does not cover Part B's touchpoints, blast radius, or ACs 10-13.
