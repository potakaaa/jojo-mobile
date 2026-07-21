---
name: spec:adm-013-invite-management
description: "Product-discovery SPEC for ADM-013 — staff invite management (list pending / revoke / resend) + staff removal/demotion (issue #149)"
date: 21-07-26
feature: admin-dashboard
---

# ADM-013 — Staff Invite Management + Staff Removal (SPEC)

**Scope widened 21-07-26 (user decision):** this SPEC now covers TWO related but distinct capabilities under one ADM-013 umbrella — (A) pending invite management (list/revoke/resend, the original scope, unchanged below) and (B) staff removal/demotion (NEW — removing an already-active staff member's access entirely). Both are super_admin-only privilege-boundary actions on the same Staff screen; they are kept in one SPEC/plan because they ship together, but they are functionally independent — (A) acts on a `staff_invites` row that was never accepted, (B) acts on a `users` row that already has staff-level access.

## Summary

ADM-011 gave super_admins a way to send a staff invite, but once that email goes out (or gets
logged, when there's no live provider), the admin loses all visibility into it — there's no way
to see which invites are still waiting to be accepted, no way to cancel one that was sent by
mistake or to the wrong person, and no way to send a fresh link if the invitee lost the original.
This phase closes that gap: a "Pending invites" view on the Staff screen that lists outstanding
invites, lets a super_admin revoke one (killing its accept link for good), and lets a super_admin
resend one (issuing a brand-new link and retiring the old one). It builds directly on the
`staff_invites` table ADM-011 created — no new invite-creation flow, no new email-sending path
beyond what ADM-011 already built.

## User Stories / Jobs To Be Done

1. **As a super_admin**, I want to see a list of invites that are still pending, so I know who
   I've invited and am waiting to hear back from — without having to check a database or ask a
   developer.
2. **As a super_admin**, I want to revoke a pending invite, so that if I sent one to the wrong
   person, or a role/branch was mistaken, or the invite is stale, the link stops working
   immediately and no one can use it to become staff.
3. **As a super_admin**, I want to resend a pending invite, so that if the invitee lost the
   original email (or it never arrived), I can get them a fresh working link without recreating
   the whole invite from scratch or re-deciding their role and branch.
4. **As an admin (non-super_admin)**, I should not be able to see or act on pending invites at
   all, so that visibility into who's been invited stays a super_admin-only capability —
   consistent with every other privilege-adjacent action in this app.

6. **As a super_admin**, I want to remove an existing staff member's access entirely (demote them
   back to a plain customer), so that when someone leaves the team, changes roles outside the
   staff structure, or was granted staff access by mistake, I can revoke that access myself
   without asking a developer to run a database update.
7. **As a super_admin**, I should not be able to remove my own staff access, so that I (or anyone
   with super_admin) can never accidentally lock myself out of the admin dashboard.
8. **As an admin (non-super_admin)**, I should not be able to remove or demote any staff member,
   so removal stays a super_admin-only capability — consistent with role changes and branch
   assignment, which are already gated the same way.
5. **As the person holding a revoked or superseded invite link**, when I try to use it, I want a
   clear rejection — not a silent failure and not accidental access — so revoking or resending
   actually does what it says.

## What The User Wants (Behavioral Outcomes)

- The Staff screen gains a "Pending invites" section/table, visible and usable only to
  super_admins (same 403 boundary as every other admin-dashboard privilege action).
- The list shows only invites that are genuinely still actionable: not yet accepted, not
  revoked, and not expired. Accepted, revoked, and expired invites simply drop off the list —
  there is no "show everything" toggle in this phase.
- Each row shows who's being invited, what role/branch they're headed for, who sent the invite,
  when it was sent, and when it expires — enough for a super_admin to recognize the invite and
  decide whether to leave it, revoke it, or resend it.
- **Revoke**, with a confirmation step (this is a destructive, security-relevant action — the
  admin should not be able to fat-finger it): once revoked, the invite's accept link stops
  working immediately and permanently. There is no "un-revoke."
- **Resend**: the invitee gets a brand-new working link with the same role and branch that were
  originally chosen (an admin cannot use resend to sneak in a role/branch change — that's not
  what this button does). The moment resend succeeds, the OLD link from the original invite (or
  a previous resend) stops working — there is never more than one live link per invite at a time.
- If an invite has already been accepted, expired on its own, or was already revoked, it's
  simply gone from the list — revoke/resend actions are never offered for something that isn't
  actionable.

### Part B — Staff removal (NEW, 21-07-26)

- The existing Staff list gains a **"Remove from staff"** action per row (an Actions-column
  button), visible only to super_admins — same client-side cosmetic gate as the existing Role
  `<select>` and branch `<select>` controls, with the server's existing super_admin-only 403 as
  the real boundary.
- Removal is a **destructive, confirm-gated** action (same class as invite revoke) — a confirm
  dialog names the staff member and states the effect plainly before anything happens.
- **The removal mechanism is: demote the target user's role to `customer`.** This is not a new
  concept — it reuses the EXISTING `POST /api/admin/users/:id/role` route unmodified. Once
  demoted, the user is no longer `role IN (staff, admin, super_admin)`, so they naturally drop
  out of `GET /api/admin/staff`'s roster on the next refresh (that route already filters
  `WHERE role IN (...)` — nothing new needs to filter them out).
  - The row disappears from the Staff list immediately after a successful removal, the same way
    a revoked invite disappears from the Pending Invites list (Part A) — consistent UX between
    the two destructive actions on this screen.
  - A `staff`-role member who is removed loses `assignedBranchId` significance implicitly (the
    column stays whatever it was — a `customer` has no branch-scope semantics — but this SPEC
    does not require clearing it; that's an implementation detail, not a product decision).
- **A super_admin can never remove/demote themselves** — this is the existing server-side
  self-modification guard (`Cannot modify own role`, already enforced on
  `POST /api/admin/users/:id/role` for EVERY role change, not just removal) doing double duty;
  the UI additionally hides or disables the action on the signed-in user's own row so the
  restriction is visible before the click, not just after a rejected request.
- No confirmation email, no notification to the removed user, no audit trail beyond whatever the
  `users.role` column change itself represents — this phase does not add a removal-history table.

## Flow / State Diagram — Part A (pending invites, unchanged)

```
Super_admin opens Staff screen → "Pending invites" section (super_admin only — hidden for admin)
                    │
                    ▼
        GET /api/admin/staff/invites
        (pending-only: not consumed, not revoked, not expired)
                    │
                    ▼
        List renders: email · role · branch · invited by · sent · expires
                    │
        ┌───────────┼───────────────┐
        │                           │
   click Revoke               click Resend
        │                           │
        ▼                           ▼
  Confirm dialog             POST .../:id/resend
  ("Revoke invite for
   {email}? This cannot        │
   be undone.")           regenerate token + hash
        │                  + fresh 7-day expiry
        ▼                  on the SAME row
  POST .../:id/revoke           │
        │                  re-send via sendStaffInvite
        ▼                  (real send or log-fallback,
  set revoked_at = now      same as ADM-011)
  (only if still pending;       │
   404 if not found/            ▼
   not pending)           row's expiresAt/updated,
        │                 old token now dead
        ▼                       │
  Row disappears           Row stays, new expiry
  from the list             shown
        │                       │
        └───────────┬───────────┘
                     ▼
        Invitee's OLD accept link:
        GET/POST /staff-invite/start
        and /consume both now reject
        (revoked_at set, or token
         hash no longer matches
         after resend)
```

Everything about HOW an invite is originally created, and how an invitee accepts a still-live
link, is unchanged — this phase only adds ways to see, kill, or refresh an already-existing
pending invite:
```
POST /api/admin/staff/invite        (existing, ADM-011, unmodified creation shape)
GET  /staff-invite/start            (existing, ADM-011 — liveness guard EXTENDED, see below)
POST /staff-invite/consume          (existing, ADM-011 — liveness guard EXTENDED, see below)
```

## Acceptance Criteria (Testable Outcomes)

1. **Listing pending invites returns exactly the invites that are unconsumed, unrevoked, and
   unexpired** — with id, email, intended role, intended branch name (when set), who invited
   them (name/email), sent-at, and expires-at. A consumed, revoked, or expired invite never
   appears.
   `proven by:` a new admin-staff-invites-list integration test seeding one of each state
   (pending, consumed, revoked, expired) and asserting only the pending one is returned, with
   the full expected field shape (and no `tokenHash` field present anywhere in the response).
   `strategy:` Fully-Automated.

2. **The list route is super_admin-only** — a non-super_admin authenticated admin gets 403, an
   unauthenticated request gets 401.
   `proven by:` integration test asserting 401/403 against non-super_admin and unauthenticated
   callers, matching the existing `require-admin.integration.test.ts` role-matrix pattern.
   `strategy:` Fully-Automated.

3. **Revoking a pending invite sets it as revoked and it immediately drops off the pending
   list** — a second revoke attempt on the same invite is rejected (already not pending), and
   revoking a nonexistent invite id 404s. No revoke action is possible on an already-consumed or
   already-expired invite (both reject the same way — not found among pending).
   `proven by:` integration test: revoke a seeded pending invite, assert it no longer appears in
   the list route's response, assert a second revoke on the same id 404s, and assert revoke on a
   seeded already-consumed invite 404s.
   `strategy:` Fully-Automated.

4. **THE CORE GUARANTEE: after revoke, the invite's accept link is dead everywhere** — both the
   invite-accept start step and the consume step reject a token belonging to a revoked invite,
   using the exact same token that worked before the revoke.
   `proven by:` integration test: create an invite, capture its real (log-fallback) token, revoke
   the invite, then assert BOTH `GET /staff-invite/start` and `POST /staff-invite/consume` reject
   that exact token (no account created, no session issued). This is a HARD gate — Known-Gap is
   explicitly banned for this AC (see Constraints).
   `strategy:` Fully-Automated.

5. **Resending a pending invite issues a genuinely new, working token with the SAME email, role,
   and branch as the original — and the old token stops working the instant resend succeeds.**
   `proven by:` integration test: create an invite, capture its original token, resend it,
   capture the new token (different from the original), assert the OLD token now rejects at
   both `/start` and `/consume` while the NEW token succeeds through the full accept flow with
   the original role/branch preserved.
   `strategy:` Fully-Automated.

6. **Resend does not accept a client-supplied role or branch** — only the values already stored
   on the invite are reused; resend cannot be used as a side door to change what an invite grants.
   `proven by:` integration test calling resend with a smuggled alternate role/branch in the
   request body and asserting the resulting new token still carries the ORIGINAL role/branch,
   unaffected by the smuggled payload.
   `strategy:` Fully-Automated.

7. **Resend is rejected for an invite that is not currently pending** (already consumed, already
   revoked, already expired) — 404, no token regenerated, no email sent.
   `proven by:` integration test attempting resend against a seeded consumed invite and a seeded
   revoked invite, asserting both 404 with zero row mutation and zero send attempt.
   `strategy:` Fully-Automated.

8. **Revoke and resend are both super_admin-only**, matching AC2's boundary exactly.
   `proven by:` integration test asserting 401/403 for both routes against non-super_admin and
   unauthenticated callers.
   `strategy:` Fully-Automated.

9. **The Pending Invites admin UI (list render, revoke confirm-dialog + row removal, resend
   action + updated expiry) is exercised in a real browser.**
   `proven by:` manual admin-dashboard walkthrough — the same standing no-E2E-runner residual
   carried by every prior admin-dashboard phase (e.g. ADM-009 AC8, ADM-011 AC7).
   `strategy:` Agent-Probe.

10. **Staff removal demotes the target's role to `customer` via the existing role route, and the
    removed user immediately drops off the Staff list.**
    `proven by:` integration test (or a targeted assertion added to the existing
    `admin-users-role.integration.test.ts`-style suite) — POST the existing role route with
    `role: 'customer'` against a seeded staff-level user, assert 200, assert the user no longer
    appears in `GET /api/admin/staff`'s response.
    `strategy:` Fully-Automated.

11. **A super_admin can never remove/demote their own account** — a self-targeted removal is
    rejected with the same `Cannot modify own role` 400 the existing route already returns for
    every self-targeted role change, and the UI additionally never offers the removal action on
    the signed-in user's own row.
    `proven by:` (server) existing self-modification-guard coverage already proves this for the
    route generically — no new server test needed since no server code changes; (client) RTL test
    on the staff-list component asserting the "Remove from staff" action is absent/disabled for a
    row matching the current session's user id.
    `strategy:` Fully-Automated.

12. **Removal is super_admin-only** — a non-super_admin admin cannot see or trigger the removal
    action, and a direct API call gets the same 403 the existing role route already returns for
    any non-super_admin caller.
    `proven by:` no new server test needed (the existing role route's 403 boundary already covers
    this — it is not role-target-specific); client-side coverage is the same
    `isSuperAdmin`-gated-action pattern already proven for the Role/Branch `<select>` controls.
    `strategy:` Fully-Automated (server, pre-existing coverage) / Hybrid (client gate, same
    pattern as existing role-select cosmetic gate).

13. **The "Remove from staff" UI (confirm dialog, row disappearance after confirm, action hidden
    for non-super_admin and for the signed-in user's own row) is exercised in a real browser.**
    `proven by:` manual admin-dashboard walkthrough — same standing no-E2E-runner residual as AC9.
    `strategy:` Agent-Probe.

## Out Of Scope

- **Reminder emails / automatic re-notification.** Nothing in this phase proactively emails an
  invitee before or as they approach expiry — resend is always an explicit admin action.
- **A cron sweep of expired rows.** Expired invites simply stop appearing in the pending list
  (filtered by `expiresAt > now` at query time); this phase does not delete or archive expired
  rows on a schedule.
- **Bulk revoke / bulk resend.** Every action in this phase operates on exactly one invite at a
  time.
- **In-place editing of a pending invite's role or branch.** There is no "edit" action — only
  revoke (kill it) and resend (refresh the link, same role/branch). Changing the target role or
  branch requires revoking and creating a brand-new invite via ADM-011's existing create flow.
- **A status-filtered / "show all invites" list** (including consumed/revoked/expired history).
  This phase's list is pending-only by design (D3, locked) — a broader audit/history view is a
  clearly separable future enhancement, not part of this MVP.
- **Any change to invite CREATION** (`POST /api/admin/staff/invite`) or to the accept UI/flow
  itself beyond the liveness-guard extension required to make revoke actually work (see
  Constraints). ADM-011's create flow and accept screen are otherwise reused unmodified.
- **Non-super_admin access to any part of this surface.** A plain `admin` cannot see the Pending
  Invites section, cannot list, revoke, or resend invites.

- **A general-purpose Users/Customers management screen (ADM-010).** Staff removal here is
  scoped ONLY to the existing Staff screen's roster — it reuses the existing role route but adds
  no new "browse all users" or "manage any user's role" surface. ADM-010 (customer management,
  separately planned) remains the eventual home for anything broader than staff-roster removal.
- **Removal history / audit log.** No new table or event log records who removed whom or when —
  the `users.role` column change is the only durable trace, matching the existing role-change
  route's behavior for every other role transition.
- **Bulk removal.** Removal operates on exactly one staff member at a time, matching Part A's
  "one invite at a time" scoping for revoke/resend.
- **Clearing `assignedBranchId` on removal.** The column is left as-is; a `customer` role has no
  branch-scope semantics regardless of what the column holds.

## Constraints

- **D1 (locked — revoke storage):** revocation is tracked with a new, nullable `revoked_at`
  timestamp column on `staff_invites` (additive migration, zero change to existing columns).
  `consumed_at` means "genuinely accepted"; `revoked_at` means "admin-cancelled." These two are
  mutually exclusive by construction — a revoke attempt on an invite that's already consumed is
  rejected as not-pending, and a revoke on an already-revoked invite is rejected the same way.
- **D2 (locked — resend mechanism):** resend is a dedicated `POST
  /api/admin/staff/invites/:id/resend` route (super_admin-only). It reads the existing pending
  row's stored email/role/branch, generates a fresh token, hashes it, sets a fresh expiry on
  THAT SAME row (the old token dies because the stored hash is overwritten — there is no second
  row, no history table of past tokens), and re-sends via the existing `sendStaffInvite`
  mechanism from ADM-011 (real send or log-fallback, unchanged). The client never supplies role
  or branch to this route — only an invite id.
- **D3 (locked — list scope):** the MVP list (`GET /api/admin/staff/invites`) returns
  PENDING-ONLY invites: `consumedAt IS NULL AND revokedAt IS NULL AND expiresAt > now`. A
  broader, status-filterable list (showing consumed/revoked/expired history too) is explicitly
  deferred — status is trivially derivable from the same three columns whenever that
  enhancement is built, so deferring it costs nothing today.
- **D4 (locked — staff removal mechanism):** removal is NOT a new route. It reuses the
  EXISTING `POST /api/admin/users/:id/role` route (already accepts `role: z.enum(['customer',
  'staff', 'admin', 'super_admin'])`, confirmed unchanged) by POSTing `{ role: 'customer' }`
  against the target staff member's id. Zero backend changes are required for this part of the
  scope — `GET /api/admin/staff` already filters `WHERE role IN (staff, admin, super_admin)`, so
  a demoted user structurally disappears from the roster on next fetch with no new server logic.
  The self-modification guard (`Cannot modify own role`, 400) and the super_admin-only 403 are
  BOTH already enforced by this route for every role target, including `customer` — confirmed by
  direct read of `packages/api/src/routes/admin/users.ts`. This is purely an `apps/admin`
  frontend addition: a new confirm-gated "Remove from staff" action on the existing Staff list,
  wired to the EXISTING `useChangeStaffRole()` mutation with `role: 'customer'`.
- **THE CRITICAL CORRECTNESS INVARIANT (headline requirement, not a footnote):** because revoke
  is implemented via a NEW column, every place in the codebase that currently decides "is this
  invite still live" MUST be updated to also require `revoked_at IS NULL`, or a revoked invite's
  accept link keeps working — silently defeating the entire feature. The known sites that must
  all be updated together, in the same change:
  1. `packages/api/src/routes/staff-invite.ts`'s `POST /start` liveness guard (today checks
     `consumedAt !== null || expiresAt <= now`; must also reject when `revokedAt !== null`).
  2. `packages/api/src/routes/staff-invite.ts`'s `POST /consume` atomic compare-and-swap WHERE
     clause (today matches on `isNull(consumedAt), gt(expiresAt, now)`; must also require
     `isNull(revokedAt)`).
  3. `packages/api/src/routes/admin/staff.ts`'s create-time supersede predicate (which decides
     "is there already a pending invite for this email to invalidate") and this phase's own new
     list/revoke/resend "is this invite pending" predicates — all of these must independently
     include `isNull(revokedAt)`, not just one canonical shared predicate that some call sites
     forget to use.
  AC4 is the automated proof of this invariant and is a HARD gate: **Known-Gap is explicitly
  banned for AC4.** A revoked invite that still lets someone through at accept time is a security
  regression, not an acceptable residual.
- **Sequencing with ADM-011 Section H (locked — record, do not re-litigate):** ADM-011's Section
  H (the `apps/admin` web accept surface + CORS extension) is APPROVED/QUEUED but not yet
  executed as of this SPEC, and it ALSO touches `packages/api/src/routes/staff-invite.ts` (the
  same file this phase's liveness-guard changes land in). **ADM-013 and ADM-011 Section H
  therefore overlap on `staff-invite.ts` and must EXECUTE SEQUENTIALLY, never in parallel.**
  Whichever lands second must re-scan `staff-invite.ts` immediately before editing and rebase its
  changes on top of whatever the first one landed — this is a plan-time constraint to carry into
  PLAN, not something this SPEC resolves by picking an order.
- **This is auth/privilege-adjacent surface**, same trust-boundary class as ADM-011 (revoke and
  resend both act on a privilege-granting token). VALIDATE should weigh whether the high-risk
  execution handoff (5-artifact evidence pack) applies here, consistent with how ADM-011 was
  handled.
- No RN/E2E test runner exists for `apps/admin` — AC9 is necessarily Agent-Probe, matching every
  other admin-dashboard phase's standing residual.
- `tokenHash` must never appear in any serialized response from the list route (or any other
  route touched by this phase) — it is a secret-adjacent column, same discipline ADM-011 already
  established.

## Open Questions

None. D1 (revoke storage), D2 (resend mechanism), D3 (list scope), and D4 (staff removal
mechanism — reuse the existing role route, no new backend surface) were all locked with the user
before/during this SPEC's authoring (D4 added 21-07-26 as a scope-widening decision). The exact route-file layout beyond what's locked above (e.g.
which file within `routes/admin/` hosts revoke/resend) is intentionally left open for PLAN/
INNOVATE, not because it's unresolved product intent but because it's an implementation detail
outside SPEC's scope.

## Background / Research Findings — Part B (staff removal, added 21-07-26)

- **Verified via direct source read, not assumed:** `packages/api/src/routes/admin/users.ts`'s
  `roleUpdateSchema` is `z.enum(['customer', 'staff', 'admin', 'super_admin'])` — `customer` is
  ALREADY a valid target for `POST /api/admin/users/:id/role`. The client-side type
  (`postStaffRole`'s `role: 'customer' | 'staff' | 'admin' | 'super_admin'` param in
  `admin-staff-api.ts`) already reflects this too. **No backend enum widening is required** —
  research confirms the route already accepts the removal target; only a UI affordance is
  missing.
- **`GET /api/admin/staff`** (`packages/api/src/routes/admin/staff.ts`) filters
  `.where(inArray(users.role, [...STAFF_ROLES]))` — `customer` is never included. A demoted user
  therefore disappears from this list automatically; no new filtering logic is needed anywhere.
- **Self-modification guard already generic:** `users.ts`'s role route rejects
  `req.params.id === req.adminSession.userId` with `Cannot modify own role` (400) for ANY target
  role, not specifically "cannot self-promote" — this already covers self-demotion-to-customer
  with zero server changes.
- **Existing UI precedent this reuses:** `staff-list.tsx`'s own doc comment (D4 in that file,
  unrelated numbering to this SPEC's D4) already anticipated this gap: "This action stays
  reachable only via direct API call; a general Users screen (ADM-010, out of scope) is its
  natural home" — this SPEC deliberately narrows that framing: rather than waiting on ADM-010, a
  minimal confirm-gated action on the EXISTING Staff screen closes the gap now, reusing the
  existing mutation hook (`useChangeStaffRole()`) already wired in `staff.index.tsx`.
- **`useAdminAuth()`** exposes `user.id` for the signed-in session — sufficient to gate the
  removal action off the caller's own row client-side (`currentUserId` prop threaded into
  `StaffList`), matching the server's own self-modification guard.

## Background / Research Findings

- **`staff_invites` schema (already built by ADM-011):** `id` (uuid PK), `email`, `intendedRole`
  (`userRoleEnum`, NOT NULL), `intendedBranchId` (uuid → `branches`, nullable), `tokenHash`
  (varchar, SHA-256 hash — never serialized), `expiresAt` (NOT NULL), `consumedAt` (nullable),
  `createdBy` (uuid → `users`, NOT NULL), `createdAt`. Latest migration on disk is `0020`, so this
  phase's additive `revoked_at` column lands as migration `0021`.
- **Reusable from ADM-011's `staff.ts` `POST /invite`:** the super_admin inline guard
  (`if (req.adminSession.role !== 'super_admin') → 403`, matching the discipline of the original
  role-management route), the standalone `sendStaffInvite(email, rawToken)` function (builds the
  accept URL and sends via Resend or logs the link — the same fallback pattern reused verbatim
  for resend), the invite-supersede transaction pattern (already handles "there's already a
  pending invite for this email" at create time), and `INVITE_TTL_MS` (7 days, reused unchanged
  for resend's fresh expiry).
- **Branch-name join precedent:** `staff.ts`'s `GET /` staff-list route already `leftJoin`s
  `branches` to surface a human-readable branch name — the new pending-invites list route follows
  the same join shape for `intendedBranchId → intendedBranchName`.
- **Route home:** the natural home for the new routes is the SAME `staff.ts` file ADM-011 already
  extended (mounted via the existing append-only `routes/admin/index.ts` aggregator — no
  `index.ts` edit needed, `requireAdmin` + CORS inherited automatically). PLAN confirms the exact
  file split.
- **Admin UI home:** `apps/admin/src/routes/(dashboard)/staff.index.tsx`, alongside the existing
  `StaffList`/`AddStaffDialog` components from ADM-009/ADM-011. Reusable composites already exist
  in this codebase: `data-table`, `status-badge`, `confirm-dialog` — no new shared primitive is
  expected to be needed for a list-with-row-actions.
- **Serializer gap identified during research:** the current `AdminStaffInviteSummary` shape
  (from ADM-011) is create-response-only — it carries email/role/branch/expiry but not `id`,
  `createdAt`, or inviter identity. The list this phase adds needs a NEW or EXTENDED serializer
  shape adding `id`, `createdAt`, and a second join to resolve `createdBy` → inviter name/email.
  This is a PLAN-level detail (which serializer, which file) — recorded here so PLAN doesn't
  have to rediscover it.
- **Test tier (unchanged convention):** all 8 list/revoke/resend/liveness-invariant ACs are
  Fully-Automated on the existing `makeUser(role)` self-seeding fixture, using the same
  captured-log-token technique ADM-011 already established for driving the accept flow in tests
  without live email infrastructure. Only the admin UI walkthrough (AC9) is Agent-Probe — the
  same standing project-wide `apps/admin` no-E2E-runner gap carried by every prior phase.
- **Program status context:** the admin-dashboard 8-phase program (P0–P7) is fully ✅ VERIFIED
  and complete. ADM-009 (staff management) is committed. ADM-010 (customer management) is
  planned but not yet executed. ADM-011 (add staff) is CODE-COMPLETE with Section H
  APPROVED/QUEUED but not yet executed. This SPEC is deliberately scoped as fresh, standalone
  work that does NOT resume or extend the completed umbrella program — matching how ADM-009,
  ADM-010, and ADM-011 were each scoped independently.
