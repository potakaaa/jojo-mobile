---
name: plan:adm-013-invite-management
description: "COMPLEX plan for ADM-013 — staff invite management (list/revoke/resend) + staff removal/demotion (issue #149)"
date: 21-07-26
feature: admin-dashboard
---

# ADM-013 — Staff Invite Management + Staff Removal (PLAN)

Date: 21-07-26

Status: PLAN drafted; VALIDATE **RE-RUN 22-07-26 (third pass, post-approval plan-supplement
confirmation)** recorded **Gate: PASS** (`generated-by: outer-pvl`, supersedes the same-day
`Gate: CONDITIONAL` contract). This pass was triggered by `## Inner Loop Refresh Note (2)` —
a plan-supplement applied AFTER the human approver's `APPROVE` decision on the high-risk
evidence pack, which was itself conditional on two required follow-ups (Fix 1: dangling
authority after demotion, now AC14; Fix 2: double-resend race exact-token compare-and-swap,
now AC15). This pass independently re-verified both fixes against the CURRENT source tree
(direct reads of `require-admin.ts`, `require-staff.ts`, `auth.ts`'s session config,
`staff-invite.ts`, `staff.ts`, `users.ts`, the shared integration test file's describe
blocks, and the harness evidence pack) — both fixes hold as designed, both are correctly
cited (with two minor line-citation corrections folded in as new non-blocking Execute-Agent
Instructions), and the C-4 test-gate table + dimension findings are now reconciled to include
AC14/AC15. The prior CONDITIONAL contract's single substantive open item (the
high-risk-evidence-pack determination) is resolved: a real human APPROVE decision is on
record (`harness/review-decision.json`), and this pass confirms its two required follow-ups
were actually and correctly applied. EXECUTE is now unblocked.

Complexity: COMPLEX — additive migration, 3 new/extended routes on an auth-adjacent trust
boundary, touches 2 existing files this plan does NOT own alone (see Sequencing below), plus
`apps/admin` UI.

**HARD SEQUENCING CONSTRAINT — RESOLVED 22-07-26 (was open at the first VALIDATE pass):**
ADM-011 Section H (`apps/admin` web accept surface + CORS extension) AND ADM-012 (web-first
staff account setup, which also touches `staff-invite.ts`) have BOTH landed as real, merged
commits — confirmed via `git log --oneline -- packages/api/src/routes/staff-invite.ts
packages/api/src/index.ts`, which returns `0bf8365` (ADM-011), `81974a9` (ADM-012), `188b9c8`
(CodeRabbit review fix on the same PR), merged at `8102045` on `feat/adm-011-add-staff`, all
present in this worktree's branch history (`feat/adm-013-staff-invmgmnt`). This VALIDATE
re-run re-confirmed (again, this third pass) `staff-invite.ts`, `packages/api/src/routes/
admin/staff.ts`, `packages/api/src/index.ts`, and the shared integration test file against
their CURRENT content (not the plan's original line-number references) — see the updated
Section B/C dimension findings below for exactly what changed and what EXECUTE must account
for. `packages/api/src/index.ts` remains confirmed NOT a touchpoint of this plan (its
`/staff-invite` mount is unchanged by ADM-013).

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

**VALIDATE has now run three times and the plan's total scope (Part A + Part B, plus the two
post-approval fixes AC14/AC15) is stable and confirmed.** The `## Validate Contract` below is
the current, authoritative contract (`Gate: PASS`). Both prior contracts (21-07-26 Part-A-only,
and the first 22-07-26 Part A+B CONDITIONAL pass) are superseded — see `supersedes:` in the
contract header. The two `## Inner Loop Refresh Note` sections at the end of this file are
retained as the historical record of why each re-run was triggered — both have now been fully
acted on.

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
| D2 — resend mechanism | Dedicated `POST /api/admin/staff/invites/:id/resend`. Reads the existing pending row's stored email/role/branch, generates a fresh token, overwrites `tokenHash` + `expiresAt` on the SAME row (no new row, no history table — the old token dies because its hash is gone), re-sends via the existing `sendStaffInvite`. Client supplies only the invite `:id` — never role/branch. **AMENDED 22-07-26 (post-approval plan-supplement, Fix 2):** the rotating `UPDATE`'s `WHERE` clause is keyed on the row's CURRENT `tokenHash` — captured in the same read that already establishes pending status — as a compare-and-swap, not merely on the pending-state predicates (`isNull(consumedAt) AND isNull(revokedAt) AND gt(expiresAt, now)`). This closes the double-resend race: a racing second resend that captured a now-stale `tokenHash` (because the first resend already rotated it) fails to match the `WHERE` and safely no-ops (404) instead of silently killing the first resend's just-delivered link. See the corrected rationale in `## Missing Test Areas` and the updated Public Contracts / Section C step 9 below. **VALIDATE-confirmed 22-07-26 (this pass):** the design is internally consistent — a racing pair that BOTH captured the same pre-rotation `tokenHash` will both attempt `sendStaffInvite` (both emails go out) but only the WHERE-winning `UPDATE` actually rotates the row; the loser 404s with zero mutation. This means a genuine simultaneous double-resend can still result in two delivered emails (one of which points at a token that will never validate) — a UX rough edge, not a security or data-integrity defect; not a new gap this pass, already implicitly covered by the corrected `## Missing Test Areas` residual note. |
| D3 — list scope | `GET /api/admin/staff/invites` returns PENDING-ONLY: `consumedAt IS NULL AND revokedAt IS NULL AND expiresAt > now`. No status-filtered/history list in this phase. |
| Critical invariant | Every "is this invite live" predicate in the codebase MUST include `isNull(revokedAt)`. Known sites (all in scope of this plan): `staff-invite.ts` `/start` liveness guard, `staff-invite.ts` `/consume` atomic WHERE, `staff.ts` create-time supersede predicate, and this plan's own list/revoke/resend "is pending" predicates. AC4 (proving this invariant) is a HARD gate — **Known-Gap is explicitly banned.** |

## Sequencing / Overlap With ADM-011 Section H

**Status as of the 22-07-26 VALIDATE re-runs: RESOLVED — both plans have landed.** The narrative
below is retained verbatim as it was written at PLAN/SPEC time, for audit-trail accuracy; the
"Resolution" list's step 1 precondition is now satisfied (confirmed by `git log`, re-confirmed
again this third VALIDATE pass). Steps 2-5 remain live guidance for EXECUTE — re-read both files
fresh before editing, do not trust stale line numbers.

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

1. ~~ADM-013 EXECUTE does not start until ADM-011 Section H has landed as a committed change on
   this branch~~ — **RESOLVED 22-07-26**: `git log --oneline -- packages/api/src/routes/staff-invite.ts
   packages/api/src/index.ts` now returns `0bf8365`, `81974a9`, `188b9c8` (non-empty). Confirmed
   this VALIDATE pass (and reconfirmed again this third pass).
2. Before editing `staff-invite.ts` or `index.ts`, re-read both files fresh (do not trust this
   plan's line-number references — they were written before Section H landed) and rebase the
   liveness-guard edits on top of whatever Section H actually shipped. **This VALIDATE re-run has
   already done this re-read — see Section B/C findings in the contract for the exact current
   shape of both files.**
3. When adding new test cases to `staff-invite.integration.test.ts`, append after Section H's
   cases; do not reorder or restructure existing `describe` blocks. **Confirmed this pass: the
   file now has 3 `describe` blocks in order — `staff-invite accept flow`, `staff-invite
   set-password + profile setup (ADM-012)`, and `staff-invite CORS for the admin web origin
   (Section H)` (the LAST block in the file) — append the new AC4 case after the CORS block, or
   inside the accept-flow block; see Execute-Agent Instruction E3.**
4. If Section H's CORS mount conflicts with anything ADM-013 needs (it should not — ADM-013 adds
   no new mount, only edits existing route bodies), stop and flag it in the phase report rather
   than resolving unilaterally. **Confirmed no conflict — reconfirmed this pass.**
5. `packages/api/src/index.ts` is otherwise **not a touchpoint of this plan** — ADM-013 does not
   add or change any `app.use(...)` mount line. The three new routes live in the existing
   `staff.ts` file, already mounted under `/api/admin/staff` via the append-only
   `routes/admin/index.ts` aggregator (inherits `requireAdmin` + CORS automatically — no
   aggregator edit needed). **Reconfirmed this pass: `routes/admin/index.ts` line 70 —
   `adminRouter.use('/staff', staffRouter)` — unchanged.**

## Part B — Staff Removal (NEW — minimal, `apps/admin`-only, zero backend changes)

### Design summary

Reuse-route, not enum-widen. Verified facts (direct source read, this PLAN pass; **RE-CONFIRMED
by direct source read during BOTH the 22-07-26 VALIDATE re-run AND this third pass** — see
Section H dimension finding below):
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
  determination; this VALIDATE re-run explicitly re-confirmed the existing CONCERN's reasoning
  covers Part B (see the contract's Security surface dimension finding), not merely restated it.
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

### Section I — Fix 1 + Fix 2 verification (NEW 22-07-26, post-approval plan-supplement)

30. **AC14 (dangling authority after demotion, Fix 1):** add one new test case to
    `packages/api/src/routes/admin/__tests__/admin-staff.integration.test.ts` (**VALIDATE
    CORRECTION, this pass — the plan's earlier "admin-users-role.integration.test.ts or
    equivalent" phrasing did not name a file that exists on disk; the real, correct home is the
    existing `describe('POST /api/admin/users/:id/role still works unmodified (AC7 regression)',
    ...)` block in `admin-staff.integration.test.ts`, confirmed by direct grep this pass — see
    Execute-Agent Instruction E8**): authenticate a seeded `staff` user and establish a session;
    as a `super_admin`, demote that user to `customer` via `POST /api/admin/users/:id/role`;
    WITHOUT re-authenticating, reuse the demoted user's already-established session to issue one
    more request against a `requireStaff`-gated route (e.g. `GET /api/staff/me`); assert it is
    now rejected (403), proving the fresh per-request `auth.api.getSession` lookup reflects the
    new role immediately, with no session-revocation step required. No production code change is
    needed for this test to pass — it is a regression lock on already-correct behavior
    (per-request role resolution, not a cached claim), not a bug fix.
31. **AC15 (double-resend race, Fix 2):** add one new test case to
    `admin-staff-invite-resend.integration.test.ts` (Section E, item 14 above): seed a pending
    invite; capture its `tokenHash` directly from the DB; call `POST
    /api/admin/staff/invites/:id/resend` once (succeeds, rotates `tokenHash`); then, using the
    ORIGINALLY-captured (now-stale) `tokenHash`, issue a second raw `UPDATE ... WHERE id = :id AND
    tokenHash = :staleTokenHash AND ...` against the test DB directly (simulating a second resend
    call that read the row before the first one committed) and assert it affects ZERO rows —
    proving the compare-and-swap is keyed on the exact token, not merely on pending-state. This is
    a deterministic simulation of the race (not a true concurrent-request harness — see the
    corrected `## Missing Test Areas` entry) and is sufficient to prove the `WHERE`-clause fix
    itself, which is the specific residual the human reviewer flagged.

## Touchpoints

_Part A (pending invites, unchanged) below; Part B's touchpoints are in the `## Part B — Staff Removal` section above (apps/admin only, 3 files, zero packages/api changes)._

### `packages/api` (backend — 1 new migration, 1 schema edit, 3 new routes, 2 files with
liveness-guard edits shared with ADM-011 Section H)

| File | Change |
|---|---|
| `packages/api/src/db/schema/staff_invites.ts` | Add `revokedAt: timestamp('revoked_at')` (nullable), after `consumedAt`. |
| `packages/api/drizzle/0021_[generated-name].sql` + `packages/api/drizzle/meta/0021_snapshot.json` | Generated via `drizzle-kit generate` — additive `ALTER TABLE staff_invites ADD COLUMN revoked_at timestamp`. |
| `packages/api/drizzle/meta/_journal.json` | Auto-updated by `db:generate` (append idx 21 entry). |
| `packages/api/src/routes/staff-invite.ts` | Extend `/start`'s liveness check and `/consume`'s atomic WHERE clause to also reject `revokedAt !== null` / require `isNull(revokedAt)`. **Shared-file edit — see Sequencing above. RE-CONFIRMED this pass: `/consume`'s atomic WHERE now has a 4th condition, `eq(staffInvites.email, req.user!.email)`, added by ADM-012's CodeRabbit fix — add `isNull(revokedAt)` as a 5th `and()` condition, not a 4th. See Execute-Agent Instruction E5.** |
| `packages/api/src/routes/admin/staff.ts` | Extend the create-time supersede predicate's WHERE to also require `isNull(staffInvites.revokedAt)`. Add 3 new route handlers: `GET /invites`, `POST /invites/:id/revoke`, `POST /invites/:id/resend`. **RE-CONFIRMED this pass: the `POST /invite` handler still has the additional branch-validate-from-DB step (ADM-012 CodeRabbit fix) between Zod parsing and the existing-account check — does not affect the supersede predicate location or shape; append the 3 new handlers before `export default staffRouter` at the file's current end (line 299), unchanged guidance.** |
| `packages/api/src/routes/lib/serializers.ts` | Add `AdminPendingStaffInvite` interface + `serializeAdminPendingStaffInvite()` (new shape: `id`, `email`, `intendedRole`, `intendedBranchId`, `intendedBranchName`, `invitedByName`, `invitedByEmail`, `createdAt`, `expiresAt`; never `tokenHash`). Inviter is FLAT (`invitedByName`/`invitedByEmail`), matching Sections D + F — not a nested `invitedBy` object. **RE-CONFIRMED this pass: `serializeAdminStaffInvite` still exists at line 1270 in the current file — placement instruction unchanged.** |
| `packages/api/src/routes/__tests__/staff-invite.integration.test.ts` | New test cases proving AC4 (the core cross-file liveness invariant) — revoke, then assert both `/start` and `/consume` reject the exact same token. **Shared-file edit — append after Section H's cases, see Sequencing above. RE-CONFIRMED this pass: file still has 3 describe blocks (accept flow / ADM-012 set-password / Section H CORS, in that order) — append after the LAST (CORS) block, or inside the accept-flow block per E3.** |
| `packages/api/src/routes/admin/__tests__/admin-staff-invites-list.integration.test.ts` | NEW — AC1, AC2 (list shape + role matrix). Confirmed no naming collision on disk (still true this pass). |
| `packages/api/src/routes/admin/__tests__/admin-staff-invite-revoke.integration.test.ts` | NEW — AC3, AC8 (revoke behavior + role matrix). Confirmed no naming collision on disk (still true this pass). |
| `packages/api/src/routes/admin/__tests__/admin-staff-invite-resend.integration.test.ts` | NEW — AC5, AC6, AC7, AC8, AC15 (resend behavior + smuggled-field rejection + not-pending rejection + role matrix + double-resend race regression). Confirmed no naming collision on disk (still true this pass). |

### `apps/admin` (frontend — 1 new component, 1 hook file extended, 1 lib file extended, 1
screen extended)

| File | Change |
|---|---|
| `apps/admin/src/features/staff/lib/admin-staff-api.ts` | Add `AdminPendingStaffInvite` type, `listPendingStaffInvites()`, `revokeStaffInvite(id)`, `resendStaffInvite(id)`. |
| `apps/admin/src/features/staff/hooks/use-admin-staff.ts` | Add `usePendingStaffInvites()` (query), `useRevokeStaffInvite()` / `useResendStaffInvite()` (mutations, both invalidate the pending-invites query key on success). |
| `apps/admin/src/features/staff/components/pending-invites-list.tsx` | NEW — `DataTable` of pending invites (email / role / branch / invited by / sent / expires / actions column) + `ConfirmDialog` for revoke + a resend button with per-row pending state. Presentational, mirrors `staff-list.tsx`'s shape. Confirmed no naming collision on disk (still true this pass). |
| `apps/admin/src/features/staff/components/pending-invites-list.test.tsx` | NEW — RTL render test: rows render, revoke opens confirm dialog and calls the callback on confirm, resend calls the callback directly (no confirm — not destructive). |
| `apps/admin/src/routes/(dashboard)/staff.index.tsx` | Wire `usePendingStaffInvites`/`useRevokeStaffInvite`/`useResendStaffInvite`; render `<PendingInvitesList>` below `<StaffList>`, gated on `isSuperAdmin` (same cosmetic client gate as `AddStaffDialog`). |

## Public Contracts

### `GET /api/admin/staff/invites` (NEW, `staff.ts`, inherits `requireAdmin` — additionally
super_admin-gated inline)

- Guard order: 1) `req.adminSession.role !== 'super_admin'` → 403. 2) query + serialize.
- Query: `staffInvites` left-joined to `branches` (for `intendedBranchName`) and `users` (for
  `invitedByName`/`invitedByEmail` — flat fields, matching the Section D/F interface; a plain
  single `leftJoin(users, eq(staffInvites.createdBy, users.id))`, no `alias()` needed since `users`
  is joined only once), filtered
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
  gt(expiresAt, now)` → 404 if not found under that predicate (covers not-pending AC7).
  **CAPTURE the row's CURRENT `tokenHash` from this same read** — this is the value the
  step-5 `UPDATE`'s `WHERE` will key on (Fix 2, 22-07-26 plan-supplement). 4)
  **ignore the request body entirely** — no Zod schema parses role/branch from it; only `:id` is
  read from params (closes AC6's smuggling vector structurally, not just by validation). 5)
  generate a fresh `rawToken`/`tokenHash` + fresh `expiresAt = now + INVITE_TTL_MS`, `UPDATE
  staff_invites SET tokenHash = ..., expiresAt = ... WHERE id = :id AND tokenHash =
  :capturedTokenHash AND isNull(consumedAt) AND isNull(revokedAt) AND gt(expiresAt, now)
  RETURNING email, intendedRole, intendedBranchId, expiresAt` — **the `tokenHash =
  :capturedTokenHash` condition is the load-bearing addition (Fix 2): it turns this from a
  pending-state-only compare-and-swap into a full compare-and-swap on the EXACT token being
  rotated**, closing a TOCTOU race between step 3's read and this write, AND closing the
  double-resend race (see below). 6) no row returned → 404. This now covers TWO distinct race
  outcomes under one clause, not one: (a) the invite stopped being pending between steps 3 and 5
  (revoked/consumed/expired mid-flight — the original TOCTOU this step already handled), AND (b)
  a DIFFERENT resend call already rotated `tokenHash` between this call's step-3 read and its own
  step-5 write (the double-resend race, Fix 2) — because this call's captured `tokenHash` no
  longer matches the row's current value, its `WHERE` fails to match and it safely 404s instead
  of re-rotating a second time and silently invalidating the first resend's just-delivered link.
  7) **send-before-commit ordering (D2 amendment, CodeRabbit):** resend differs from
  invite-create here — because rotating the hash KILLS the currently-valid link, the send must be
  attempted and confirmed BEFORE the rotation is committed. Sequence: compute the fresh
  `rawToken`/`tokenHash`/`expiresAt` in memory → `await sendStaffInvite(email, rawToken)` → only on
  send success run the `UPDATE` (step 5). If the send throws, do NOT rotate: the row keeps its
  existing still-pending token (resend's guard already requires the invite be live), so the old
  link survives and nothing is stranded; return a delivery-failure error (not 200) so the admin can
  retry. This replaces invite-create's fire-and-forget pattern for the resend route specifically —
  create can fire-and-forget because the invite is brand-new with no prior working link to lose.
  **VALIDATE note (this pass):** because both a racing pair's read (step 3) happens before either's
  send (step 7) and write (step 5), a genuine simultaneous double-resend can result in BOTH calls
  successfully sending an email (one of which points at a token that will never validate, since
  only the WHERE-winning `UPDATE` actually rotates) — this is a UX rough edge (duplicate email, one
  dead link), not a security or data-integrity defect, and does not change AC15's pass/fail
  criteria (which is about the DB-level compare-and-swap, not send-count).
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
- **RE-CONFIRMED this pass against current file content:** the guard is at line 68
  (`if (invite.consumedAt !== null || invite.expiresAt <= new Date())`), the select projection at
  lines 56-60 currently selects only `email`/`consumedAt`/`expiresAt` — add `revokedAt:
  staffInvites.revokedAt` to that projection. Nothing in ADM-012/CodeRabbit touched `/start`.

### `POST /staff-invite/consume` — atomic WHERE EXTENDED (existing route, `staff-invite.ts`)

- Adds `isNull(staffInvites.revokedAt)` to the existing `and(eq(tokenHash, ...),
  isNull(consumedAt), gt(expiresAt, now))` WHERE clause on the atomic claim `UPDATE`.
- **RE-CONFIRMED this pass — CORRECTION to the WHERE clause quoted above:** the CURRENT atomic
  claim WHERE (lines 153-159) is `and(eq(tokenHash, ...), isNull(consumedAt), gt(expiresAt, now),
  eq(staffInvites.email, req.user!.email))` — FOUR conditions, not three. ADM-012's CodeRabbit fix
  added the session-email match to close a different bug (a mismatched session claiming someone
  else's invite). Add `isNull(staffInvites.revokedAt)` as a FIFTH condition. See Execute-Agent
  Instruction E5.
- The existing "distinguish 404 vs 410 vs 500" fallback query (when the atomic claim returns
  nothing) stays a plain existence check by `tokenHash` selecting `id`/`email`/`consumedAt`/
  `expiresAt` — a revoked invite still "exists," so it correctly falls into the classification
  logic. **Re-confirmed this pass: no change needed to this fallback query or its 404/410/500
  branching — a revoked-but-otherwise-live invite has `consumedAt === null` and `expiresAt > now`
  and (by construction) `email === req.user!.email` since `/start` only mints a session for the
  invite's own email, so it correctly falls through the 500-invariant branch's email-mismatch
  check into the 410 "expired or already used" branch — same message as expired/consumed, matching
  SPEC's "no distinction required" wording. No code change is needed in the fallback classifier
  itself, only in the atomic claim's WHERE.**

## Blast Radius

- **Packages touched:** `packages/api` (1 new migration, 1 schema column, 3 new route handlers,
  2 shared-file liveness-guard edits, 1 serializer addition, 4 test files new/extended),
  `apps/admin` (1 new component + test, 2 files extended, 1 screen extended).
- **Risk class:** AUTH-ADJACENT / PRIVILEGE-GRANTING, same trust-boundary class as ADM-011 — a
  revoke/resend both directly control the liveness of a privilege-granting token. This plan is
  a strong candidate for the 5-artifact high-risk execution evidence pack
  (`vc-risk-evidence-pack`) — VALIDATE made the final call: a 4-artifact design-level pack was
  generated and reviewed by the human approver, who recorded `APPROVE` (see Security surface
  dimension finding below).
- **New migration:** `0021` — purely additive (`ALTER TABLE staff_invites ADD COLUMN
  revoked_at timestamp`), zero change to any existing column, zero backfill (all existing rows
  get `NULL`, meaning "not revoked" — correct default with no data migration needed).
  **RE-CONFIRMED this pass: `0021` is still the correct next slot — highest migration on disk
  remains `0020_minor_scarecrow.sql` (journal idx 20); no migration touching `staff_invites`
  landed between the prior VALIDATE passes and this one.**
- **Existing-file edits, not new routes:** `staff-invite.ts` (2 predicate extensions, no new
  route), `staff.ts` (1 predicate extension to the existing supersede logic + 3 new route
  handlers appended to the file).
- **No modification to any existing, already-locked route's request/response shape** — the
  create route's contract (`POST /api/admin/staff/invite`) is unchanged; `/start`/`/consume`'s
  contracts are unchanged except for which requests they now reject (a revoked token that used
  to 200 now 410s — this IS the feature, not a regression).
- **File count:** ~13 new/changed files across 2 packages for Part A (7 backend incl. 4 test
  files, 6 frontend incl. 1 test file), plus ~3 files for Part B (all `apps/admin`) — ~16 total,
  COMPLEX-tier blast radius.
- **Overlap with ADM-011 Section H / ADM-012:** 2 files (`staff-invite.ts`, the shared
  integration test file) were touched by both ADM-011 Section H and ADM-012 — see `##
  Sequencing / Overlap With ADM-011 Section H` above. Both have now landed; ADM-013 edits the
  CURRENT post-landing content of these files, re-confirmed fresh this third VALIDATE pass.
  `index.ts` was touched by Section H but is NOT touched by this plan.

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
   **The current `and(...)` already has a 4th condition (`eq(staffInvites.email,
   req.user!.email)`, added by ADM-012's CodeRabbit fix) — add `isNull(revokedAt)` as a 5th
   condition alongside it, not a 4th.**

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
   pending-check read that ALSO captures the row's current `tokenHash` (Fix 2), ignore request
   body, generate fresh token/hash/expiry, send-before-commit (`sendStaffInvite` awaited before
   the write, per the existing D2-amendment ordering), then an atomic compare-and-swap `UPDATE`
   on the SAME row **keyed on both pending-state AND the captured `tokenHash`** (not
   pending-state alone — this is what makes the CAS exact-token-scoped, closing the double-resend
   race), respond with the existing `serializeAdminStaffInvite` shape.

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
    zero send attempt via the log spy), AC8 (401/403 matrix for resend), AC15 (see Section I
    step 31 — the double-resend race compare-and-swap regression).

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

Mirrors the SPEC's 13 ACs verbatim (9 Part A + 4 Part B, see SPEC for full prose) plus the two
post-approval plan-supplement ACs (14-15) — restated here as the testable pass/fail statements
this plan's Verification Evidence section proves:

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
14. **Dangling authority after demotion:** a demoted user's role change takes effect on their
    VERY NEXT authenticated request — not merely "eventually" or "on next login." better-auth's
    session resolution (`requireAdmin`/`requireStaff`) reads the user's CURRENT role from the
    database on every request via `auth.api.getSession(...)` (confirmed by direct read of
    `packages/api/src/lib/require-admin.ts` — the `getSession` call is at line 53, with the
    resulting 403 branch at lines 55-58; `require-staff.ts` uses the identical fresh-lookup
    pattern; no `cookieCache` is configured in `packages/api/src/lib/auth.ts`'s `session` block,
    so there is no cached/stale role claim to worry about). A demoted user's already-issued
    session token therefore remains VALID as a session, but the very next request it is used for
    against any staff/admin-gated route is evaluated against the fresh, now-`customer` role and is
    rejected. No active-session revocation is required or added by this plan — this is documented
    behavior, not a gap, and must be proven by an automated test (AC14's proving test), not left as
    an unstated assumption.
15. **Double-resend race:** a second resend call racing a first resend's rotation (i.e. one that
    captured the invite's `tokenHash` before the first resend's `UPDATE` committed) is rejected
    (404, zero mutation, zero send) rather than silently re-rotating the token a second time and
    killing the first resend's just-delivered link. Proven by a targeted regression test that
    simulates the stale-capture race deterministically (see `## Verification Evidence`).

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
| `admin-staff.integration.test.ts` (existing `POST /api/admin/users/:id/role still works unmodified` block, extended) — one new targeted assertion: POST role=customer against a seeded staff user, confirm 200 + user drops off `GET /api/admin/staff` | Fully-Automated | AC10 (server half), AC11 (server half — self-guard already generic), AC12 (server half — pre-existing 403) |
| Manual admin-dashboard walkthrough: Remove-from-staff confirm dialog, row disappearance, action hidden for non-super_admin and for the signed-in user's own row | Agent-Probe | AC13 |
| `admin-staff.integration.test.ts` (same block, extended) — demote a staff user mid-test, reuse their already-established session for one more staff-gated request, assert 403 (proves fresh per-request role resolution, no session revocation needed) | Fully-Automated | AC14 |
| `admin-staff-invite-resend.integration.test.ts` — deterministic stale-`tokenHash` simulation: capture pre-resend `tokenHash`, resend once, then attempt a second `UPDATE` keyed on the stale captured hash, assert zero rows affected | Fully-Automated | AC15 |

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
test("demoted user's next request is rejected by requireStaff/requireAdmin using the fresh role", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC14 dangling authority after demotion (Fix 1)")
})
test("second resend racing a stale captured tokenHash affects zero rows", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC15 double-resend race, exact-token CAS (Fix 2)")
})
```

## Missing Test Areas

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| Real browser render of Pending Invites list/actions | No `apps/admin` E2E/browser runner exists (project-wide gap) | Agent-Probe walkthrough (AC9), same standing residual as every prior admin-dashboard phase |
| Concurrent double-resend race — **the original rationale here ("one wins, the other 404s", implying the compare-and-swap alone made this safe) was overstated.** Before the Fix 2 amendment, the resend `UPDATE`'s `WHERE` keyed on pending-status ONLY, not on the specific token being rotated — so two racing resends could BOTH succeed in sequence: the second's `WHERE` still matched (the row was still pending), silently overwriting/killing the first resend's just-delivered link (no data corruption, but a dead link handed to the invitee). This is now FIXED, not merely accepted — see the D2 amendment and the Public Contracts resend steps above: the `UPDATE`'s `WHERE` is now keyed on the row's CURRENT `tokenHash`, captured at the same read that checks pending status, making it a true compare-and-swap on the exact token being replaced. | The exact-token CAS is now proven by AC15's targeted regression test (see `## Acceptance Criteria` / `## Verification Evidence`), which simulates the race deterministically without needing true concurrent request orchestration. **Residual, still a genuine known-gap:** a real TWO-simultaneous-in-flight-request harness (true wall-clock concurrency against a live DB) is still not built — outside this plan's blast radius — but the WHERE-clause safety property itself (the mechanism the original Known-Gap rationale leaned on) is now correctly described AND proven, not merely asserted. A related, newly-noted (this VALIDATE pass) UX-only residual: because both a racing pair's pending-check reads happen before either's send/write, a genuine simultaneous double-resend can result in TWO delivered emails (one pointing at a token that will never validate) — not a security/data-integrity issue, not scored as a gap, informational only. |

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

**Note (this worktree):** this git worktree shares the `packages/api` test database with other
worktrees. Neither this VALIDATE pass nor the two prior passes ran the full `pnpm --filter
@jojopotato/api test` suite (static analysis + direct source reads only, per the orchestrator's
explicit constraint) — EXECUTE/EVL must run it for real, as usual, once implementation lands.

## Test Infra Improvement Notes

(none identified yet)

## High-Risk Execution Handoff Note

This plan sits in the same AUTH-ADJACENT / PRIVILEGE-GRANTING risk class as ADM-011 (revoke and
resend both directly control the liveness of a privilege-granting token; Part B directly revokes
an already-active staff member's access). A 4-artifact design-level `vc-risk-evidence-pack` was
generated and reviewed by the human approver (project owner), who recorded `APPROVE` in
`harness/review-decision.json`, conditional on two required plan follow-ups (Fix 1, Fix 2 —
see the Inner Loop Refresh Note (2) below). Both follow-ups have now been applied and this
VALIDATE pass has independently re-verified them against the current source tree — see the
Security surface dimension finding in `## Validate Contract` below.

**Observed precedent on this branch family (informational, not a decision):** ADM-011 (issue
#141, the invite CREATE + accept path) produced a full 5-artifact `harness/` evidence pack before
finalize. ADM-012 (issue #142, the web password/profile setup surface — a comparably-scoped
auth-adjacent surface) shipped and merged WITHOUT a `harness/` pack on disk, its CONDITIONAL gate
instead accepted directly by the user in-session. ADM-013 falls between the two: a 4-artifact
design-level pack (not the full 5-artifact post-implementation pack) was produced and genuinely
reviewed/approved by a human before EXECUTE.

## Phase Completion Rules

- **CODE DONE**: all Section G + Section H gates green, all Fully-Automated ACs (1–8, 10, 11
  server+client halves, 12 server+client halves, 14, 15) passing, AC4 proven non-vacuous (a
  deliberately-broken liveness guard should turn the AC4 test red — confirm this during EXECUTE,
  do not just trust a green run).
- **VERIFIED**: CODE DONE, plus AC9's AND AC13's manual admin-dashboard walkthroughs both
  performed and passed by the user. Until then this task folder stays in `active/`, not archived.

## Resume and Execution Handoff

1. **Selected plan file path:** this file —
   `process/features/admin-dashboard/active/adm-013-invite-management_21-07-26/adm-013-invite-management_PLAN_21-07-26.md`.
2. **Last completed phase or step:** PLAN drafted. INNOVATE was skipped per the SPEC's own
   framing (design already locked, mechanical implementation). VALIDATE has now run THREE times —
   the 21-07-26 pass (Part A only, superseded), the first 22-07-26 re-run (Part A + Part B,
   Gate: CONDITIONAL, superseded), and this second 22-07-26 re-run (confirms the post-approval
   Fix 1/Fix 2 plan-supplement, Gate: PASS, current) — see `## Validate Contract` below. Nothing
   has been executed yet.
3. **Validate-contract status:** re-written this pass — `Gate: PASS`. See `## Validate Contract`
   below. All prior blocking items (the sequencing precondition, the Part-B-was-never-evaluated
   gap, and the high-risk-evidence-pack determination) are now resolved. EXECUTE is unblocked —
   the next explicit step is `ENTER EXECUTE MODE` for this plan.
4. **Supporting context files loaded during PLAN and all three VALIDATE passes:**
   `adm-013-invite-management_SPEC_21-07-26.md` (this task folder),
   `adm-011-add-staff_PLAN_21-07-26.md` (sibling task folder), the 4-artifact `harness/` evidence
   pack + `harness/review-decision.json` (this task folder), plus direct reads of the CURRENT
   (post-ADM-011/ADM-012/CodeRabbit-fix) content of
   `packages/api/src/routes/staff-invite.ts`,
   `packages/api/src/db/schema/staff_invites.ts`,
   `packages/api/src/routes/admin/staff.ts`,
   `packages/api/src/routes/admin/index.ts`,
   `packages/api/src/routes/admin/users.ts`,
   `packages/api/src/routes/lib/serializers.ts`,
   `packages/api/src/index.ts` (mount points),
   `packages/api/src/lib/require-admin.ts`,
   `packages/api/src/lib/require-staff.ts`,
   `packages/api/src/lib/auth.ts` (session config — no `cookieCache`),
   `apps/admin/src/routes/(dashboard)/staff.index.tsx`,
   `apps/admin/src/features/staff/{lib/admin-staff-api.ts,hooks/use-admin-staff.ts,
   components/staff-list.tsx}`,
   `apps/admin/src/components/{confirm-dialog.tsx,data-table.tsx}`,
   `apps/admin/src/features/auth/hooks/use-admin-auth.ts`,
   `packages/api/src/routes/admin/__tests__/{admin-staff-invite-create,admin-staff}.integration.test.ts`,
   `packages/api/src/routes/__tests__/staff-invite.integration.test.ts` (describe-block
   structure + token-capture technique),
   `packages/types/src/staff.ts`,
   git log/status for the sequencing precondition,
   `process/context/all-context.md` (root router).
5. **Next step for a fresh agent picking up mid-execution:** this VALIDATE re-run has produced
   `Gate: PASS` (this pass). EXECUTE may begin — `ENTER EXECUTE MODE` for this plan. No further
   human sign-off is required before EXECUTE; the two Execute-Agent Instructions E7/E8 added this
   pass are informational (line-citation corrections), not blocking.

## Validate Contract

Status: PASS
Date: 22-07-26
date: 2026-07-22
generated-by: outer-pvl
supersedes: 2026-07-22 (outer-pvl) — the prior same-day contract recorded Gate: CONDITIONAL with
one substantive open item (the high-risk-evidence-pack determination, `Accepted by: PENDING`).
That item is now resolved: a genuine human `APPROVE` decision is on record
(`harness/review-decision.json`), conditional on two required plan follow-ups (Fix 1, Fix 2 —
`## Inner Loop Refresh Note (2)`). This pass re-ran V1-V7 to independently confirm both follow-ups
were correctly applied against the CURRENT source tree, not merely to trust the plan's own
self-report — both hold as designed. This is the third VALIDATE pass overall for this plan (first:
21-07-26, Part A only, superseded; second: 22-07-26, Part A+B, CONDITIONAL, superseded by this
one).

Parallel strategy: sequential
Rationale: Signal count 2/7 (S1 multi-package scope: packages/api + apps/admin; S6 high-risk
class present: auth/trust-boundary). Below the parallel-subagent threshold (2-3) — a single plan
of this size does not warrant fan-out overhead for VALIDATE itself. Layer 1 (4 dimensions) +
Layer 2 (9 sections A-I — Section I new this pass, covering the Fix 1/Fix 2 proving tests) run as
one synthesized pass by a single validate-agent, re-reading every shared/touched file directly
against its CURRENT working-tree content (`require-admin.ts`, `require-staff.ts`, `auth.ts`'s
session config, `staff-invite.ts`, `staff.ts`, `users.ts`, the shared test file's describe blocks,
the harness evidence pack) rather than trusting the plan's own prose.
EXECUTE strategy recommendation (unchanged from prior passes): sequential — a single
vc-execute-agent. Sections A→B→C→D→E→F→G remain strictly ordered by file dependency (schema
before routes before serializers before tests before UI), and Section B/C are shared-file edits
that must not run concurrently with anything else touching the same files. Section H (Part B) is
`apps/admin`-only with zero `packages/api` overlap and Section I (AC14/AC15 proving tests) touches
only existing test files — both could in principle run independently, but sequential remains
simplest for a plan this size — no parallel-subagent fan-out recommended for EXECUTE either.

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
| AC10 | Staff removal demotes target to `customer` via the existing role route; target drops off `GET /api/admin/staff` | Fully-Automated | New targeted assertion added to `admin-staff.integration.test.ts`'s existing `POST /api/admin/users/:id/role still works unmodified` block (server half) + `staff-list.test.tsx` wiring (client half) | A |
| AC11 | Self-removal rejected — pre-existing generic `Cannot modify own role` 400 guard (server) + action hidden on the caller's own row (client) | Fully-Automated | Pre-existing coverage (no new server test required — the guard is target-role-agnostic) + `staff-list.test.tsx` self-hidden case (new) | A |
| AC12 | Removal is super_admin-only — pre-existing 403 boundary (server) + cosmetic client gate matching Role/Branch controls | Fully-Automated | Pre-existing coverage (no new server test required) + `staff.index.tsx`'s existing `isSuperAdmin` gate pattern (no new test — same pattern already proven for Role/Branch controls) | A |
| AC13 | "Remove from staff" UI (confirm dialog, row disappearance, hidden for non-super_admin/self) works in a real browser | Agent-Probe | Manual admin-dashboard walkthrough | D |
| AC14 (Fix 1) | Demoted user's role change reflected on their VERY NEXT request (fresh per-request `getSession` lookup, no cookieCache, no session revocation needed) | Fully-Automated | `admin-staff.integration.test.ts` — demote mid-test, reuse pre-demotion session, assert next `requireStaff`-gated request 403s | A |
| AC15 (Fix 2) | Double-resend race rejected via exact-token compare-and-swap — a racing second resend keyed on a stale captured `tokenHash` affects zero rows | Fully-Automated | `admin-staff-invite-resend.integration.test.ts` — deterministic stale-`tokenHash` UPDATE simulation | A |
| (supporting, not a numbered AC) | True simultaneous concurrent double-resend (wall-clock, not simulated) | Known-Gap | — (exact-token compare-and-swap UPDATE structurally proves the DB-level safety property, proven by AC15; no true concurrency harness built) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy` column above carries only the 3 proving strategies
(Fully-Automated / Hybrid / Agent-Probe). Known-Gap is a named residual row (gap-resolution D),
never a strategy that proves a behavior.

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/api` invite list/revoke/resend routes: Fully-automated: `pnpm --filter @jojopotato/api test` (4 new/extended integration test files, AC1–AC8, AC15) | known-gap: true simultaneous concurrent double-resend (documented, exact-token compare-and-swap UPDATE proven safe by AC15's deterministic simulation)
- `packages/api` staff-invite.ts liveness guard extension: Fully-automated: `pnpm --filter @jojopotato/api test` (AC4, Known-Gap banned, must be proven non-vacuous by a deliberately-broken-guard mutation check during EXECUTE)
- `apps/admin` Pending Invites UI: Fully-automated: `pnpm --filter @jojopotato/admin test` (`pending-invites-list.test.tsx` — render/confirm/resend RTL coverage) | agent-probe: manual browser walkthrough (AC9, standing no-E2E-runner project-wide gap)
- `packages/api` staff removal (reused role route): Fully-automated: `pnpm --filter @jojopotato/api test` (one new targeted assertion in `admin-staff.integration.test.ts` — POST role=customer against a seeded staff user, confirm 200 + roster drop-off; AC10/AC11/AC12 server halves are otherwise pre-existing coverage, zero new server code)
- `packages/api` demotion authority freshness: Fully-automated: `pnpm --filter @jojopotato/api test` (AC14, new targeted assertion in `admin-staff.integration.test.ts` — demote mid-test, reuse pre-demotion session, assert next request rejected)
- `apps/admin` Remove-from-staff UI: Fully-automated: `pnpm --filter @jojopotato/admin test` (`staff-list.test.tsx` — new Actions-column RTL coverage) | agent-probe: manual browser walkthrough (AC13, standing no-E2E-runner project-wide gap)
- Full regression: hybrid: `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/api test && pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin test && pnpm --filter @jojopotato/admin build && pnpm format:check` + precondition: local Postgres up and migrated through `0021`

Dimension findings:
- Infra fit: PASS — Migration number `0021` re-reconfirmed correct (highest on disk is still
  `0020_minor_scarecrow.sql`, journal idx 20 — no migration touching `staff_invites` landed
  between ADM-013's SPEC/PLAN authoring and this pass). New routes mount under the existing
  append-only `/api/admin/staff` aggregator with zero aggregator edit needed (re-confirmed:
  `packages/api/src/routes/admin/index.ts:70` — `adminRouter.use('/staff', staffRouter)` —
  unchanged; the full path is `/api/admin/staff/*`). No container/infra/worker surfaces touched.
- Test coverage: PASS — all 10 numbered Part A ACs (AC1-8, AC15) are Fully-Automated; AC4 is
  explicitly Known-Gap-banned with a required non-vacuous mutation check (deliberately-broken
  guard must fail). AC9 is Agent-Probe (standing project-wide `apps/admin` no-E2E-runner gap,
  consistent with every prior admin-dashboard phase). Part B's ACs (10-12, 14) are
  Fully-Automated — largely PRE-EXISTING coverage (the role route and its guards are unmodified),
  needing only two new targeted server assertions (AC10, AC14) in `admin-staff.integration.test.ts`
  and the new `staff-list.test.tsx` client cases; AC13 is Agent-Probe, same standing gap as AC9.
  One accepted known-gap (true simultaneous concurrent double-resend, wall-clock) carries a
  documented rationale (the exact-token compare-and-swap UPDATE's DB-level safety property is now
  actually PROVEN by AC15's deterministic simulation, not merely asserted — the residual is only
  the absence of a true two-simultaneous-in-flight-request harness, which is outside this plan's
  blast radius) — acceptable per vc-test-coverage-plan's resolution-option-C requirement, and
  materially stronger than the prior pass's known-gap rationale.
- Breaking changes: PASS — no existing route's request/response contract changes. `/start`/
  `/consume` reject a strictly narrower set of previously-accepted requests (a revoked token that
  used to 200 now 410s) — this is the feature working as designed, not a regression, and is
  exactly what AC4 tests. `POST /api/admin/staff/invite`'s contract is untouched. Part B reuses
  `POST /api/admin/users/:id/role` byte-identical — re-confirmed by direct read of
  `packages/api/src/routes/admin/users.ts` this pass: `roleUpdateSchema` still accepts
  `role: 'customer'`, the self-modification guard checks only `req.params.id ===
  req.adminSession.userId` (target-role-agnostic, so it already covers self-demotion), and
  `handleAdminError`/guard-order are unchanged. Zero contract change from Part B.
- Security surface: PASS (upgraded from CONCERN — resolved) — auth-adjacent/privilege
  trust-boundary surface (super_admin-gated revoke/resend of a privilege-granting token, plus Part
  B's super_admin-gated demotion of an active staff member). The prior pass's CONCERN was the
  pending high-risk-evidence-pack determination. That is now resolved: a 4-artifact design-level
  `vc-risk-evidence-pack` was generated and reviewed by the human approver, who recorded `APPROVE`
  in `harness/review-decision.json`, conditional on two required follow-ups (Fix 1: dangling
  authority after demotion; Fix 2: double-resend race). This pass independently re-verified both
  fixes against the CURRENT source tree (not merely trusted from the plan's own claims):
  **Fix 1** — confirmed by direct read of `packages/api/src/lib/require-admin.ts` (the
  `getSession` call is at line 53, with the resulting 403 rejection at lines 55-58 — the plan's
  original "lines 56-58" citation pointed at the rejection branch, not the `getSession` call
  itself; corrected via Execute-Agent Instruction E7) and `require-staff.ts` (identical
  fresh-per-request `getSession` pattern, confirming AC14's chosen target route, `GET
  /api/staff/me`, is a valid `requireStaff`-gated probe), plus `packages/api/src/lib/auth.ts`'s
  `session` block (`expiresIn`/`updateAge` only — no `cookieCache` key present, confirmed by
  direct grep) — the substantive claim (role is re-read fresh from the DB on every request, no
  cached/stale claim) is CORRECT, only the line citation needed a minor fix. **Fix 2** — confirmed
  by direct read of `staff-invite.ts`'s current `/consume` WHERE (4 conditions, matching the
  plan's own re-scan) and the Public Contracts resend design: the exact-token compare-and-swap is
  internally consistent and does close the specific race the adversarial reviewer flagged (two
  racing resends can no longer both successfully rotate the row) — this pass additionally traced
  through the edge case where both racers read the SAME pre-rotation `tokenHash` and both attempt
  `sendStaffInvite` before either's `UPDATE` runs (per the send-before-commit ordering): this can
  still result in two delivered emails with only one valid token, a UX rough edge (not a security
  or data-integrity defect) — noted inline in the Public Contracts section, does not change AC15's
  pass/fail criteria. Both fixes are correctly designed, correctly cited (after the E7 correction),
  and covered by real proving tests (AC14, AC15). Net effect: the security-surface CONCERN this
  plan carried through two prior VALIDATE passes is now fully resolved — no outstanding item
  requires further human decision before EXECUTE.
- Section A (migration+schema): PASS — mirrors `consumedAt`'s exact column shape; additive, zero
  backfill. Re-confirmed this pass against the current `staff_invites.ts` (still has no
  `revokedAt` column) and the current migration directory (`0021` is the correct next slot).
- Section B (staff-invite.ts liveness guard): CONCERN → resolved via Execute-Agent Instruction —
  mechanically re-verified this pass against the CURRENT (committed) working-tree content of
  `/start` and `/consume`. `/start`'s guard (line 68) and select projection (lines 56-60) are
  unchanged from what the plan assumes — add `revokedAt` to both, as planned. `/consume`'s atomic
  claim WHERE (lines 153-159) still has the 4 conditions flagged by the prior pass — add
  `isNull(revokedAt)` as a 5th, not a 4th; see Execute-Agent Instruction E5 (unchanged from the
  prior pass, still accurate). No further drift found this pass.
- Section C (staff.ts supersede + 3 new routes): CONCERN — mechanically feasible (route paths
  `/invites`, `/invites/:id/revoke`, `/invites/:id/resend` do not collide with the existing `/`,
  `/:id/branch`, `/invite` routes — re-confirmed against the current file, still line 100/133/209
  respectively; `export default staffRouter` remains the file's last line, 299). `isNull`/`gt`/
  `and`/`eq` already imported; the `uuid` malformed-id-guard pattern already established by the
  `/:id/branch` route. Three minor gaps carried from prior passes, still non-blocking: (1) the
  revoke success-body shape (`{id}` vs `{revoked:true}`) is left open — needs an EXECUTE-time
  decision (E1); (2) the plan's prose says the `GET /invites` join to `users` should be "aliased,"
  but this query only joins `users` ONCE — no alias is actually required (E2); (3) the Public
  Contracts prose says "invitedBy (name + email)" while Section D's actual interface flattens to
  `invitedByName`/`invitedByEmail` — purely a wording inconsistency, no real conflict.
- Section D (serializers): PASS — re-confirmed this pass: `serializeAdminStaffInvite` still
  exists at line 1270 of the current `serializers.ts`; the new interface/function's planned
  placement and shape are unaffected by any post-PLAN change to this file. Never touches
  `tokenHash`.
- Section E (backend tests): PASS — re-confirmed this pass: the shared integration test file still
  has exactly 3 `describe` blocks in order (`staff-invite accept flow`, `staff-invite
  set-password + profile setup (ADM-012)`, `staff-invite CORS for the admin web origin (Section
  H)`) — "append after Section H's cases" unambiguously means after the LAST (CORS) block, or
  inside the first (`accept flow`) block; either is structurally valid per Execute-Agent
  Instruction E3, neither reorders existing blocks. Confirmed no naming collisions on disk for
  any of the 3 new test files.
- Section F (apps/admin frontend): PASS — mechanically re-verified this pass: `confirm-dialog.tsx`
  and `data-table.tsx` exist and are directly reusable (exact prop shapes confirmed by direct
  read — `ConfirmDialog`'s `title`/`description`/`confirmLabel`/`pending`/`error`/`destructive`/
  `onOpenChange`/`onConfirm` and `DataTableColumn<T>`'s `key`/`header`/`cell` match the plan's
  usage); `staff.index.tsx`'s current content still has the exact `isSuperAdmin ? (...) : null`
  gate pattern this plan reuses for `<PendingInvitesList>`; no naming collision for
  `pending-invites-list.tsx`/`.test.tsx` on disk.
- Section G (regression+format): PASS — all 6 gate commands correspond to real, live runners
  confirmed via `process/context/tests/all-tests.md` (packages/api vitest, apps/admin
  vitest+build, root format:check).
- Section H (Part B — staff removal): PASS — fully re-verified this pass by direct source read
  against the CURRENT tree: `packages/api/src/routes/admin/users.ts`'s `roleUpdateSchema` is still
  `z.enum(['customer', 'staff', 'admin', 'super_admin'])` (confirmed, `customer` already valid);
  the self-modification guard (`req.params.id === req.adminSession!.userId` → 400 `Cannot modify
  own role`) still runs BEFORE the Zod body parse and is target-role-agnostic (confirmed, covers
  self-demotion with zero change); `GET /api/admin/staff` still filters
  `inArray(users.role, [...STAFF_ROLES])` (confirmed, `customer` never included — a demoted user
  structurally drops off the roster with zero new filtering); `useChangeStaffRole()` in
  `use-admin-staff.ts` is still typed to accept `role: AdminStaffMember['role'] | 'customer'`
  (confirmed — zero type-widening needed anywhere); `staff.index.tsx` still has `roleMutation` in
  scope with `mutationError` already including `roleMutation.error` (confirmed — zero new
  hook/wiring needed beyond the 3 planned prop additions); `useAdminAuth()` exposes `user.id`
  (confirmed). No self-demotion/last-super_admin lockout gap found beyond the existing generic
  guard, matching the prior pass's finding — see `adversarial-validation.json` scenario 5, which
  independently reaches the same conclusion (self-lockout structurally impossible; a
  multi-super_admin collective demotion sequence is accepted, not structurally prevented, and the
  plan already surfaces this as a code-reading argument, not a probed guarantee, under `## What
  this coverage does NOT prove`). Zero backend edits required — Part B is confirmed a pure
  `apps/admin` UI addition.
- Section I (Fix 1 + Fix 2 proving tests, NEW this pass): PASS — both new checklist steps (30, 31)
  are mechanically sound and map onto existing, real test infrastructure. Step 30 (AC14) needs one
  correction: the plan's "the same file the Verification Evidence table already points to for
  Part B's server-half coverage" and its earlier "`admin-users-role.integration.test.ts` or
  equivalent" phrasing do not name a file that exists on disk — the correct, concrete home is
  `packages/api/src/routes/admin/__tests__/admin-staff.integration.test.ts`'s existing
  `describe('POST /api/admin/users/:id/role still works unmodified (AC7 regression)', ...)` block
  (confirmed present by direct grep this pass) — see Execute-Agent Instruction E8. Step 31 (AC15)
  is correctly scoped to `admin-staff-invite-resend.integration.test.ts` (a new file this plan
  already creates in Section E), no correction needed.

Open gaps:
- ~~Sequencing precondition~~ **RESOLVED** — `git log --oneline -- packages/api/src/routes/staff-invite.ts
  packages/api/src/index.ts` returns `0bf8365` (ADM-011), `81974a9` (ADM-012), `188b9c8`
  (CodeRabbit fix) — both ADM-011 Section H and ADM-012 have landed as real commits, merged at
  `8102045`. No longer blocks EXECUTE.
- Revoke success-response body shape (`{id}` vs `{revoked:true}`) — left to EXECUTE, non-blocking
  (see Execute-Agent Instruction E1).
- `/consume`'s atomic WHERE clause has drifted from the plan's original literal text (4 conditions
  before ADM-013's addition, not 3) — non-blocking, mechanically trivial, see E5.
- ~~The high-risk-evidence-pack determination~~ **RESOLVED** — human `APPROVE` recorded
  (`harness/review-decision.json`), conditional on Fix 1 + Fix 2, both now applied and
  independently re-verified by this pass. No further human decision required before EXECUTE.
- Known-gap: true simultaneous concurrent double-resend (wall-clock, not simulated) — documented,
  accepted, rationale strengthened this pass (AC15 now proves the DB-level compare-and-swap
  mechanism directly, rather than the mechanism being merely asserted as the prior pass's
  known-gap rationale did) — not counted toward CONDITIONAL/BLOCKED determination.
- NEW, non-blocking (this pass): two minor line-citation corrections folded into Execute-Agent
  Instructions E7 (require-admin.ts's `getSession` call is at line 53, not lines 56-58) and E8
  (the AC10/AC14 server-half test home is `admin-staff.integration.test.ts`, not
  `admin-users-role.integration.test.ts`).

What this coverage does NOT prove:
- The Fully-Automated integration tests (AC1-AC8, AC10-AC12, AC14, AC15) prove server-side
  behavior only — they do not prove the `apps/admin` UI actually renders the list/actions or
  reflects a post-action state change in a real browser. AC9's and AC13's Agent-Probe walkthroughs
  are required for that, and remain standing residuals until performed.
- The RTL tests (`pending-invites-list.test.tsx`, `staff-list.test.tsx`) prove each presentational
  component's callback wiring in isolation (mocked props) — they do NOT prove the real
  `usePendingStaffInvites`/`useRevokeStaffInvite`/`useResendStaffInvite`/`useChangeStaffRole`
  react-query hooks correctly call the live API or invalidate the cache end-to-end; that is only
  proven indirectly by the AC9/AC13 manual walkthroughs.
- AC4's non-vacuous requirement (a deliberately-broken liveness guard must turn the test red) is a
  REQUIRED EXECUTE-time verification step, not something this VALIDATE pass itself can prove —
  VALIDATE can only confirm the test plan calls for it.
- AC15 proves the exact-token compare-and-swap mechanism via a deterministic simulation (a direct,
  manually-issued raw UPDATE keyed on a stale captured hash) — it does NOT prove behavior under
  true wall-clock-simultaneous concurrent HTTP requests. The DB-level safety property (Postgres
  row-level atomicity of the compare-and-swap UPDATE) is the reason this simulation is a sufficient
  proxy, but a genuine concurrency harness remains unbuilt (documented known-gap).
- AC14 proves that a demoted user's NEXT request is rejected — it does not prove anything about
  concurrent in-flight requests issued at the exact moment of demotion (a request already inside
  Express's request-handling pipeline when the demotion UPDATE commits uses whatever role snapshot
  its own `getSession` call already resolved before the commit); this narrow window is not scored
  as a gap because it is bounded by ordinary single-request processing time, not session lifetime,
  and is not something either Fix 1's design or its proving test claims to address.
- This VALIDATE pass (like the two before it) did NOT run the live `packages/api`/`apps/admin`
  test suites, build, or migration against this worktree's shared test DB (explicit constraint
  from the orchestrator, to avoid disrupting other worktrees sharing the same DB) — all findings
  above are from direct source reads and static analysis only. EXECUTE must run the real gate
  commands for real green evidence; this contract's PASS findings are feasibility/correctness-of-
  design assessments, not gate-run confirmations.
- The Part B "no lockout gap" reasoning is a code-reading argument about the CURRENT guard shape,
  not an executed adversarial test — no automated test explicitly proves a chain of demotions can
  never leave zero super_admins (the argument holds because self-targeting is unconditionally
  blocked, but a multi-caller collective-demotion sequence has not been probed by `vc-predict` or
  a dedicated regression test in this plan's scope — the same accepted, documented residual as the
  prior pass, unchanged).

Gate: PASS (0 FAILs, 0 unresolved CONCERNs — Section B/C's minor mechanical CONCERNs are resolved
via Execute-Agent Instructions per this contract's standing convention; the prior pass's single
substantive CONCERN, the high-risk-evidence-pack determination, is resolved by a recorded human
APPROVE decision whose two required follow-ups have now been independently re-verified as
correctly applied by this pass)
Accepted by: human approver (project owner) — APPROVE, 2026-07-22 (see
`harness/review-decision.json` in this task folder for the full recorded decision; unchanged from
the prior pass — this VALIDATE re-run does not re-litigate that decision, it CONFIRMS the two
required follow-ups it was conditional on were correctly applied). Fix 1 (dangling authority after
demotion, AC14) and Fix 2 (double-resend race exact-token compare-and-swap, AC15) are both
independently re-verified this pass against the CURRENT source tree — both hold as designed. The
full 5-artifact `vc-risk-evidence-pack` remains not required beyond the 4-artifact design-level
pack already reviewed and approved — this determination is the human approver's own recorded
decision, not a self-approval by VALIDATE. EXECUTE is unblocked.

### Execute-Agent Instructions (non-blocking, informational)

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Pick a revoke success-response body shape (`{id}` or `{revoked:true}`) and use it consistently; no client field is strictly required since the UI relies on query invalidation, not the response body. | Section C step 8 |
| E2 | The `GET /invites` query needs only ONE join to `users` (for the inviter) — a plain `leftJoin(users, eq(staffInvites.createdBy, users.id))` is sufficient; do NOT import `alias()` from drizzle-orm for this query (that pattern is for genuine double-self-joins, e.g. `analytics.ts`'s `historyOrders` alias, which does not apply here). | Section C step 7 |
| E3 | When appending the AC4 case to `staff-invite.integration.test.ts`, add it either as a new `it()` inside the existing `describe('staff-invite accept flow', ...)` block or as its own `describe` placed AFTER the existing `describe('staff-invite CORS for the admin web origin (Section H)', ...)` block (the LAST block in the file) — either is acceptable; do not reorder or restructure any existing block, including the ADM-012 `set-password` block that now sits between them. | Section E step 11 |
| E4 | ~~Before starting Section B/C/E, run `git log --oneline -- ...` and confirm non-empty~~ — **SATISFIED, reconfirmed this pass**: `0bf8365`, `81974a9`, `188b9c8` are all present. Still re-read both files fresh before editing (do not trust this plan's original line-number references) — this VALIDATE pass has already done so a third time; re-verify at EXECUTE time in case of further drift. | Before Section B |
| E5 | `staff-invite.ts`'s `/consume` atomic claim `and(...)` WHERE clause currently has 4 conditions (`eq(tokenHash)`, `isNull(consumedAt)`, `gt(expiresAt, now)`, `eq(staffInvites.email, req.user!.email)` — the last added by ADM-012's CodeRabbit fix, commit `188b9c8`). Add `isNull(staffInvites.revokedAt)` as a 5th condition, not a 4th, and do not remove or reorder the existing email-match condition (it closes an unrelated cross-account-claim bug). | Section B step 5 |
| E6 | `staff.ts`'s `POST /invite` handler includes a branch-validate-from-DB step (ADM-012's CodeRabbit fix) between Zod parsing and the existing-account check. This does not move or otherwise affect the supersede predicate (still inside the `db.transaction`) or where the 3 new route handlers should be appended (still: before `export default staffRouter` at the file's current end, line 299). Purely informational — no plan change required. | Section C, before step 6 |
| E7 | **NEW this pass:** the `require-admin.ts` citation in AC14's prose ("lines 56-58") points at the 403-rejection branch, not the `auth.api.getSession(...)` call itself — the actual call is at line 53. The substantive claim (role is resolved fresh from the DB on every request, no cached claim) is correct; only cite line 53 (not 56-58) if referencing this in code comments or the eventual test's own comments. | Section I step 30 |
| E8 | **NEW this pass:** AC10's and AC14's server-half proving tests belong in `packages/api/src/routes/admin/__tests__/admin-staff.integration.test.ts`, inside or alongside its existing `describe('POST /api/admin/users/:id/role still works unmodified (AC7 regression)', ...)` block — NOT a file named `admin-users-role.integration.test.ts` (that file does not exist on disk). Confirmed by direct grep this pass. | Section I step 30; also applies to the AC10 targeted assertion referenced in `## Verification Evidence` |

## Autonomous Goal Block

SESSION GOAL: Ship ADM-013 — super_admin visibility and control (list/revoke/resend) over
pending staff invites, plus staff removal/demotion, closing the gaps left by ADM-011's
create-only invite surface.
Charter + umbrella plan: N/A — single COMPLEX plan (admin-dashboard's 8-phase program is
already COMPLETE; this is standalone follow-up work, not a program phase).
Autonomy: Standard RIPER-5 gates apply (no standing /goal active for this plan). EXECUTE requires
explicit "ENTER EXECUTE MODE". The Gate: CONDITIONAL Accepted-by blocker from the two prior
passes is resolved (Gate: PASS, human APPROVE recorded, both required follow-ups verified
applied) — EXECUTE is no longer conditioned on a pending human decision.
Hard stop conditions / safety constraints:
- AC4 (revoked-token-rejected-at-both-endpoints) is Known-Gap-banned — EXECUTE must prove it
  non-vacuous (deliberately break the guard, confirm the test goes red, then restore it) before
  reporting DONE.
- Resend must never accept a client-supplied role/branch (AC6) — the body must be ignored
  structurally (no Zod schema parsing role/branch from it), not merely validated-and-rejected.
- No route under this plan may ever serialize `tokenHash` in any response.
- A super_admin can never remove/demote their own account (AC11) — rely on the existing
  target-role-agnostic self-modification guard; do not weaken or bypass it.
- Resend's rotating `UPDATE`'s `WHERE` clause must be keyed on the captured `tokenHash`
  (compare-and-swap on the exact token), not merely on pending-state — this is the Fix 2 design;
  do not simplify it back to a pending-state-only WHERE during EXECUTE.
- The sequencing precondition (ADM-011 Section H / ADM-012 landed) is satisfied — EXECUTE must
  still re-read `staff-invite.ts`/`staff.ts` fresh before editing (E4/E5/E6).
Next phase: EXECUTE MODE for this plan.
Validate contract: inline in this plan file (`## Validate Contract` section above).
Execute start: `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/api test`
(after Section A-E) | `pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin test && pnpm --filter @jojopotato/admin build` (after Section F-H) | `pnpm format:check` (final) |
Agent-Probe: manual Pending Invites (AC9) + Remove-from-staff (AC13) walkthroughs | high-risk
pack: 4-artifact design-level pack already generated, reviewed, and APPROVED by the human
approver (`harness/review-decision.json`) — satisfied, no further pack required before EXECUTE.

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
2026-07-21` field at the time it was written** (same calendar day) — per `orchestration.md`'s
literal date-comparison rule this could read as ambiguous. **Explicit instruction to the
orchestrator: treat this Refresh Note as newer regardless of the same-day timestamp** — it was
written AFTER the Validate Contract in the same session, describes a real scope change the
existing contract never evaluated (Part B did not exist when the contract was written), and the
existing contract's own CONDITIONAL gate was never accepted (`Accepted by: PENDING`) — so EXECUTE
was already blocked on this plan regardless. **Re-run PVL from V1 before EXECUTE.**

**STATUS: this note has been fully acted on across two subsequent VALIDATE passes.** The first
22-07-26 re-run covered both Part A and Part B (Gate: CONDITIONAL). The second 22-07-26 re-run
(this file's CURRENT `## Validate Contract`) confirmed the post-approval Fix 1/Fix 2
plan-supplement and produced `Gate: PASS`. Retained here as historical record only.

## Inner Loop Refresh Note (2)

Date: 22-07-26

**STATUS: this note has been fully acted on.** The human approver reviewed the high-risk evidence
pack this session and recorded `APPROVE` (`harness/review-decision.json`) conditional on two
required plan follow-ups being folded in before EXECUTE:

1. **Fix 1 — dangling authority after demotion.** Added an explicit design statement (Acceptance
   Criterion 14) citing `packages/api/src/lib/require-admin.ts`: `requireAdmin` calls
   `auth.api.getSession({ headers: toHeaders(req.headers) })` fresh on every request (confirmed at
   line 53 — see Execute-Agent Instruction E7 for a minor line-citation correction to the original
   "lines 56-58" phrasing), and `packages/api/src/lib/auth.ts`'s `session` block configures no
   `cookieCache` — so role is re-evaluated from the live DB row on every request, not cached in a
   session/JWT claim. A demoted user's role change therefore takes effect on their VERY NEXT
   request; no active-session revocation is required. Added a proving test (Section I step 30) to
   the existing role-route integration suite.
2. **Fix 2 — double-resend race.** Corrected the Known-Gap rationale in `## Missing Test Areas`
   (the original "one wins, the other 404s" claim was overstated). Changed the resend route's
   design: D2 locked decision amended, the `POST /invites/:id/resend` Public Contracts steps 3/5/6
   rewritten so the rotating `UPDATE`'s `WHERE` is now keyed on the row's CURRENT `tokenHash`
   (captured at the same read that checks pending status) — a true compare-and-swap on the exact
   token being replaced, not merely on pending-state. Section C checklist step 9 updated to match.
   Added a proving test (Section I step 31, AC15).

**This VALIDATE re-run (the CURRENT `## Validate Contract` above, `Gate: PASS`) independently
re-verified both fixes against the current source tree** — both hold as designed; two minor,
non-blocking citation corrections were folded in as Execute-Agent Instructions E7 and E8. The
plan's `## Validate Contract` dimension findings, C-4 test gate table (now including AC14/AC15),
and `Gate:` line are all fully reconciled by this pass. **No further re-validate is required before
EXECUTE** — `ENTER EXECUTE MODE` may proceed on the strength of the current `Gate: PASS` contract.
