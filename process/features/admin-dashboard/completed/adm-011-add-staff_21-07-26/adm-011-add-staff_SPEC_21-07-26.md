---
name: spec:adm-011-add-staff
description: "Product-discovery SPEC for ADM-011 — add staff via promote-existing-user + email-invite flow (issue #141)"
date: 21-07-26
feature: admin-dashboard
---

# ADM-011 — Add Staff: Promote Existing User + Email Invite (SPEC)

## Summary

ADM-009 gave admins a way to see who's already staff and reassign their branch. It did not give
admins a way to bring a **new** person into the staff roster — today, turning a customer into a
staff member (or onboarding someone who hasn't even signed up yet) still requires a developer
running a manual database update. This phase closes that gap with a single "+ Add staff" flow on
the Staff screen, covering two situations: (1) the person already has an account (as a customer)
— look them up by email and promote them, or (2) the person doesn't have an account yet — send
them an email invite that, once accepted, lands them as staff with their branch already set. Both
paths are super_admin-only, since both grant privilege. Nothing about how roles or branch
assignments are changed is rebuilt — this phase composes the existing, already-locked routes
rather than inventing new ones.

## User Stories / Jobs To Be Done

1. **As a super_admin**, I want to look up a person by their email address from the Staff screen,
   so I can find out whether they already have an account before deciding how to add them.
2. **As a super_admin**, I want to promote an existing customer account to staff (or admin, or
   super_admin) and assign their branch in one flow, so I don't have to leave the Staff screen or
   ask a developer to run a database command.
3. **As a super_admin**, I want to invite someone who has never signed up, by email, with their
   role and branch already decided, so that when they accept the invite they land in the app
   ready to work — no separate manual promotion step afterward.
4. **As a super_admin**, I want an invite link to only work once and to expire, so a leaked or
   old invite link can't be used to grant staff access later.
5. **As an admin (non-super_admin)**, I should not see or be able to use the add-staff flow at
   all, so that granting roles stays a super_admin-only capability — consistent with every other
   role-changing action in this app.
6. **As the person being invited**, I want the signup/accept step to just work from the link I was
   emailed, so I don't have to know or guess what role or branch I was assigned.

## What The User Wants (Behavioral Outcomes)

- The Staff screen gains a "+ Add staff" action, visible and usable only to super_admins (admins
  do not see it, matching the existing role-management 403 boundary).
- Starting the flow asks for an email address and looks it up.
  - **Found, and currently a customer:** the admin picks a target role (staff, admin, or
    super_admin) and, only when the target role is `staff`, a branch. Confirming promotes the
    account and — for `staff` — assigns the branch. The person now appears in the normal Staff
    list (ADM-009), fully manageable there afterward.
  - **Found, and already staff-level:** no promotion happens; the admin sees a clear "this person
    is already staff/admin/super_admin" status message pointing them to the existing Staff list
    instead of performing a duplicate action.
  - **Not found:** the admin is offered the invite path instead, pre-filling the email they just
    looked up.
- The invite path asks for: email, intended role (staff, admin, or super_admin), and — only when
  the intended role is `staff` — the branch. Submitting creates a single-use invite and sends an
  email containing an accept link. The admin sees confirmation that an invite was sent (and, when
  no real email provider is configured, sees/receives the same visible fallback the app already
  uses for magic-link sign-in — the link is written to the server log instead of emailed).
- When the invited person opens the link and completes signup, their account is created (or
  matched) already carrying the exact role and branch that were chosen at invite time — they
  never choose their own role, and the admin never has to go back and promote them afterward.
- An invite link can be used exactly once. Opening it a second time, after it already expired, or
  after someone else already used it, shows a clear rejection — it never silently grants access
  and never lets the invitee pick a different role or branch than what was set.
- Everywhere a role is granted (promote, or invite-accept), a customer can never grant themselves
  access — only a super_admin can start either flow, and self-escalation stays impossible exactly
  as it already is on the existing role route.

## Flow / State Diagram

```
Super_admin opens Staff screen → clicks "+ Add staff" (super_admin only — hidden for admin)
                    │
                    ▼
        Enter email → GET /api/admin/users/lookup?email=
                    │
      ┌─────────────┼───────────────────────┐
      │              │                       │
 not found     found, role=customer   found, role∈{staff,admin,super_admin}
      │              │                       │
      │              ▼                       ▼
      │      Pick target role          Show "already staff-level"
      │      (staff/admin/super_admin)  status — no action taken
      │              │                       │
      │        role=staff?                   │
      │         │        │                   │
      │        yes        no                  │
      │         │        │                   │
      │   pick branch     │                   │
      │         │        │                   │
      │         └───┬────┘                   │
      │             ▼                        │
      │   POST /api/admin/users/:id/role      │
      │   (unmodified — customer→target)      │
      │             │                         │
      │       target role = staff?            │
      │         │          │                  │
      │        yes         no (admin/         │
      │         │           super_admin —     │
      │         ▼           not branch-scoped)│
      │  PATCH /api/admin/staff/:id/branch     │
      │  (unmodified)                          │
      │         │                              │
      │         └──────────┬───────────────────┘
      │                    ▼
      │         User now appears in Staff
      │         list (ADM-009), fully
      │         manageable there
      ▼
Offer invite (email pre-filled)
      │
      ▼
Pick intended role (staff/admin/super_admin)
      │
role=staff? → yes → pick intended branch
      │
      ▼
POST /api/admin/staff/invite
{ email, intendedRole, intendedBranchId? }
      │
      ▼
Create single-use, expiring invite token
      │
      ▼
Send email with accept link
(real send if provider configured,
 else logged link — same fallback
 pattern as existing magic-link flow)
      │
      ▼
Admin sees "Invite sent" confirmation
      │
      │        ... invitee later opens the link ...
      ▼
GET/POST accept-invite endpoint
      │
   ┌──┴──────────────────────┐
   │                         │
token invalid/expired/    token valid + unused
already consumed              │
   │                         ▼
   ▼                 Invitee completes signup
Reject — clear error         │
shown, no account            ▼
change                Account created/matched
                       with role = intendedRole,
                       branch = intendedBranchId
                       (staff only), consumed=true
                              │
                              ▼
                     Person now appears in Staff
                     list, fully manageable there
```

Role changes and branch assignment themselves are unchanged (this phase only decides WHEN to call
them and WITH WHAT target — the routes' own internal rules, including super_admin-only gating and
self-escalation blocking, are untouched):
```
POST /api/admin/users/:id/role        (existing, ADM-001, unmodified)
PATCH /api/admin/staff/:id/branch     (existing, ADM-009, unmodified)
```

## Acceptance Criteria (Testable Outcomes)

### Path 1 — Promote existing user

1. **Looking up a known email returns that user's id, name, email, and current role.**
   `proven by:` a new admin-users-lookup integration test asserting an exact-match email lookup
   returns the seeded user's fields, and a non-matching email returns a clear not-found result
   (no 500, no partial data).
   `strategy:` Fully-Automated.

2. **Promoting a found customer to a target role, then (for `staff`) assigning a branch, results
   in exactly the same end state as calling the two existing routes directly** — no parallel
   role/branch write logic is introduced by this phase.
   `proven by:` integration test that drives the add-staff promote flow end-to-end (lookup →
   `POST /api/admin/users/:id/role` → `PATCH /api/admin/staff/:id/branch` for a `staff` target)
   and asserts the target's role and `assignedBranchId` match what a direct call to those two
   routes, in the same order, would produce.
   `strategy:` Fully-Automated.

3. **Promoting to `admin` or `super_admin` does not require or accept a branch** — the flow only
   prompts for and writes a branch when the target role is `staff`.
   `proven by:` integration test asserting a promote-to-`admin` request that omits a branch
   succeeds, and that no branch-assignment call is made/needed for that target role.
   `strategy:` Fully-Automated.

4. **Looking up an email that already belongs to a staff-level account is a no-op** — no role or
   branch write happens, and the response clearly indicates the account is already staff-level
   (with its current role) rather than silently succeeding or erroring.
   `proven by:` integration test asserting the lookup/promote-attempt for an already-staff-level
   user makes zero mutations and returns a distinguishable "already staff-level" result.
   `strategy:` Fully-Automated.

5. **The entire add-staff surface (lookup, promote, invite-create) is super_admin-only** — a
   non-super_admin authenticated admin gets 403; an unauthenticated request gets 401 — matching
   the existing `require-admin.integration.test.ts` role-matrix pattern used by every other
   admin-dashboard phase.
   `proven by:` integration test asserting 401/403 for each new route (lookup, invite-create,
   invite-accept is a separate unauthenticated-by-design case — see AC10) against non-super_admin
   and unauthenticated callers.
   `strategy:` Fully-Automated.

6. **Self-escalation stays impossible** — the existing `POST /api/admin/users/:id/role` guard
   order (super_admin-only → self-escalation check → validation → write) is exercised unmodified
   by this flow; a super_admin cannot use the add-staff UI as a side door to escalate their own
   account.
   `proven by:` re-run of the existing role-management self-escalation test plus a new assertion
   that the add-staff promote path, when given the caller's own id, is rejected the same way.
   `strategy:` Fully-Automated.

7. **The add-staff UI walkthrough (lookup → promote → branch assignment, and the already-staff /
   not-found states) is exercised in a real browser.**
   `proven by:` manual admin-dashboard walkthrough (standing no-E2E-runner gap for `apps/admin`,
   the same class of residual carried by every prior admin-dashboard phase, e.g. ADM-009 AC8).
   `strategy:` Agent-Probe.

### Path 2 — Email invite

8. **Creating an invite for an email with no existing account generates a single-use, expiring
   token and records the intended role (+ branch, when role = `staff`)** — the invite is not
   usable to grant a role the admin didn't choose.
   `proven by:` integration test asserting an invite-create call persists a token record with the
   submitted role/branch, a future expiry, and `consumed = false`.
   `strategy:` Fully-Automated.

9. **Creating an invite for an email that already has an account is rejected** (that's the
   promote path, not an invite) — no invite record is created.
   `proven by:` integration test asserting invite-create for an already-registered email returns
   a 4xx and writes no invite row.
   `strategy:` Fully-Automated.

10. **Accepting a valid, unexpired, unconsumed invite provisions the account with exactly the
    role and branch stored on the invite — never a role or branch supplied by the invitee at
    accept time** — and marks the invite consumed so it cannot be used again.
    `proven by:` integration test that creates an invite, calls the accept endpoint with a
    request that also tries to smuggle a different role/branch in its payload, and asserts the
    resulting account has the ORIGINAL invite's role/branch (the smuggled values are ignored),
    and that a second accept attempt with the same token is rejected.
    `strategy:` Fully-Automated.

11. **An expired invite token is rejected at accept time** — no account is created or promoted.
    `proven by:` integration test using a token whose expiry is in the past, asserting rejection
    and zero account mutation.
    `strategy:` Fully-Automated.

12. **The invite-create route is super_admin-only** (same boundary as AC5); the accept route is
    intentionally reachable without an existing admin session (the invitee is not yet an admin
    user) but is gated entirely by possession of a valid, unexpired, unconsumed token — there is
    no other authorization path into it.
    `proven by:` integration test asserting invite-create 401/403s the same way as AC5, and that
    invite-accept succeeds on token validity alone (no session/role required) while rejecting any
    malformed/guessed/tampered token.
    `strategy:` Fully-Automated.

13. **When no real email provider is configured, the invite link is still obtainable** (via the
    same server-log fallback the app already uses for magic-link sign-in) so the full accept flow
    is testable without live email infrastructure; when a provider IS configured, a real send is
    attempted through it.
    `proven by:` integration test capturing the logged invite link when `RESEND_API_KEY` is
    unset, then driving AC10 through that captured token — proving the end-to-end mechanism works
    today, independent of live delivery.
    `strategy:` Fully-Automated.

14. **A real invite email actually arrives in an inbox and its link works from a real device/
    browser.**
    `proven by:` manual verification once a live Resend account is provisioned (standing manual
    prereq, not new debt — see Constraints and Out Of Scope).
    `strategy:` Agent-Probe / Known-Gap (blocked on external provisioning, not on this phase's
    code).

## Out Of Scope

- **ADM-010 (customer management / general customer list, search, detail screens).** This SPEC
  reuses only a narrow, standalone email-lookup route; it does not depend on or extend ADM-010's
  (still-unexecuted) customer list/search surface.
- **Real, live-inbox email delivery infrastructure.** Provisioning an actual Resend (or
  equivalent) account is a standing manual prerequisite already tracked
  (`process/features/auth-accounts/backlog/wire-better-auth-manual-prereqs_NOTE_09-07-26.md`).
  This phase builds and fully test-covers the invite mechanism using the existing dev-log
  fallback; it does not itself provision live credentials. AC14 is a Known-Gap on that external
  dependency, not new debt.
- **Bulk invites.** One invite is created per submission; there is no CSV import or multi-email
  invite batch in this phase.
- **Editing or resending an existing pending invite.** An admin can create a new invite for the
  same email again (which should supersede/invalidate any still-pending prior invite for that
  email — see Constraints), but there is no dedicated "resend" or "edit pending invite" UI action.
- **A general invite-management screen** (list of all pending/expired/consumed invites). This
  phase's UI surface is the add-staff flow itself; a standalone invite-audit view is not built.
- **Any change to how roles or branch assignments are changed once someone IS staff.** ADM-009's
  Staff screen and its branch-assignment control, and the existing `POST
  /api/admin/users/:id/role` route, are reused completely unmodified.
- **Non-super_admin access to any part of this flow.** A plain `admin` cannot see the "+ Add
  staff" action, cannot look up users via the new lookup route, and cannot create invites.
- **MFA / two-factor enrollment.** Unrelated to this phase; already tracked separately as a
  structural seam from Phase 1.

## Constraints

- **D1 (locked — scope):** BOTH paths ship in this phase. Path 2 (email invite) is not blocked on
  live email delivery — it uses the existing dev-log fallback pattern (already proven in
  production code for magic-link sign-in) so the full create→send→accept→provision mechanism is
  buildable and Fully-Automated-testable today. Only genuine external-inbox delivery (AC14) is
  gated on the standing Resend-account prerequisite, and that gap is Known-Gap, not new debt.
- **D2 (locked — role options):** the add-staff / invite flow lets a super_admin choose the
  target/intended role from `staff`, `admin`, or `super_admin` — it is not staff-only. The entire
  add-staff surface (both paths) is super_admin-gated, because both paths perform a role grant —
  this reuses the exact 403 boundary `POST /api/admin/users/:id/role` already enforces. A plain
  `admin` cannot add or invite staff. Self-escalation stays blocked on the promote path exactly as
  it already is on the underlying role route.
- **D3 (locked — lookup mechanism):** email lookup is a standalone, exact-match
  `GET /api/admin/users/lookup?email=` route. It does NOT depend on ADM-010's (unbuilt)
  `GET /api/admin/customers?q=` search route — `email` is a unique, not-null column, so an exact
  lookup needs no fuzzy search infrastructure and carries no dependency on ADM-010 landing first.
- **Ordering constraint (locked, server-enforced already):** on the promote path, role change
  MUST happen before branch assignment. `PATCH /api/admin/staff/:id/branch` already rejects a
  target whose role is `customer` — attempting to assign a branch before promoting fails by
  design (existing behavior, not new). The add-staff flow must call the two routes in that order
  and never attempt to reorder or parallelize them.
- **Branch assignment only applies to `staff` targets.** `admin`/`super_admin` accounts are not
  branch-scoped (the existing `assertBranchScope` bypasses the check entirely for those roles) —
  the UI must only prompt for a branch when the chosen target/intended role is `staff`; offering a
  branch step for an admin/super_admin target would be a dead, misleading control.
- **Invite tokens must be unguessable, single-use, and expiring.** A pending invite is a privilege
  grant (it pre-authorizes a specific role, potentially `super_admin`) — the accept route must
  treat token possession as the sole authorization signal and must independently re-verify
  validity (not-expired, not-consumed) server-side on every accept attempt. The accept step must
  NEVER let the invitee supply or influence their own role or branch — those values come only from
  the stored invite record, never from client input at accept time.
- **This is auth-adjacent, privilege-granting surface.** Both the promote path (role escalation)
  and the invite path (unauthenticated-token-driven account provisioning with a pre-set role) sit
  in the same trust-boundary class as the original role-management route. VALIDATE should weigh
  the high-risk execution handoff (5-artifact evidence pack) for this phase, matching how
  auth/identity-class work is normally handled in this repo.
- **Whether Path 2 uses a new dedicated `invitations` table or reuses better-auth's existing
  `verification` token machinery (with a custom identifier) is NOT decided here.** This is
  explicitly left to INNOVATE — this SPEC states the requirement (single-use, expiring,
  role+branch-carrying token that a signup/accept step consumes), not the storage mechanism.
- Serializer/route-shape conventions from ADM-009/ADM-010 apply: any new admin-only response
  shapes (lookup result, invite record) stay local to `packages/api`'s admin route/serializer
  layer, not promoted to `packages/types`, unless a second consumer needs them.
- No RN/E2E test runner exists for `apps/admin` — AC7 is necessarily Agent-Probe, matching every
  other admin-dashboard phase's standing residual.

## Open Questions

None. All three decisions the issue flagged for triage (D1 scope split, D2 role-option breadth,
D3 lookup mechanism) were locked with the user before this SPEC was written — see D1–D3 above. The
storage-mechanism choice for invites (new table vs. reusing better-auth's verification tokens) is
intentionally left open for INNOVATE, not because it's unresolved product intent but because it is
an implementation decision outside SPEC's scope.

## Background / Research Findings

- **Path 1 has a real, server-enforced ordering constraint, not just a UI convention.**
  `PATCH /api/admin/staff/:id/branch` (ADM-009) already 400-rejects a target whose
  `role === 'customer'` with `'Target user is not staff-level'`. So the promote flow MUST call
  `POST /api/admin/users/:id/role` first, then the branch route — attempting the reverse order
  fails today with the existing code, unmodified.
- `POST /api/admin/users/:id/role` (`packages/api/src/routes/admin/users.ts`) is super_admin-only
  (rejects role ∈ {`admin`, `staff`} callers with 403), blocks self-escalation
  (`req.params.id === req.adminSession.userId` → 400), validates against a Zod enum of all four
  roles (`customer`/`staff`/`admin`/`super_admin`), and has no source-role restriction — it
  already permits `customer → staff`/`admin`/`super_admin` with zero modification needed.
- **No email-lookup route exists today.** ADM-010's `GET /api/admin/customers?q=` is PLANNED and
  VALIDATED (SPEC + PLAN present in
  `process/features/admin-dashboard/active/adm-010-customer-management_21-07-26/`) but NOT yet
  executed — the route file does not exist in `packages/api/src/routes/admin/`. Since `email` is a
  unique, not-null column on `users`, a standalone exact-match
  `GET /api/admin/users/lookup?email=` is small, self-contained, and has zero dependency on
  ADM-010 landing first — this is why D3 defaults to the standalone route rather than waiting on
  or coupling to ADM-010.
- **Path 2 is NOT infrastructure-blocked, contrary to the issue's framing.**
  `packages/api/src/lib/auth.ts` already configures better-auth's `magicLink` plugin with a real
  Resend-backed `sendMagicLink` sender AND a working dev-log fallback: when `RESEND_API_KEY` is
  unset, the magic link is written to the server log (`console.log`) instead of emailed — the same
  stub pattern already used for phone-OTP. This means an invite mechanism built on the same
  send-or-log pattern is buildable and fully test-covered TODAY by capturing the logged token in
  tests; only genuine external-inbox delivery needs the already-tracked, standing Resend-account
  manual prerequisite (`process/features/auth-accounts/backlog/wire-better-auth-manual-prereqs_
  NOTE_09-07-26.md` and the magic-link Expo-caveat note) — not new debt introduced by this phase.
  There is no SMS/phone channel for this flow — invites are email-only, matching the issue's own
  framing.
- `magicLink` itself is a generic sign-in primitive — it has no concept of "pre-assign a role and
  branch on accept." Path 2 therefore needs a NEW app-level mechanism layered on top: either a
  dedicated `invitations` table (email, intended role, intended branch id, token, expiry,
  consumed-at) or reuse of better-auth's existing `verification` token table with a custom
  identifier plus an app-side accept/consume step that applies the stored role+branch. Which of
  these to build is explicitly left to INNOVATE (see Constraints) — SPEC only fixes the
  requirement.
- `routes/admin/index.ts` is a proven append-only aggregator (11 existing sub-router consumers,
  including `staff.ts` from ADM-009) — any new route (lookup, invite-create, invite-accept) mounts
  the same way and inherits `requireAdmin` + CORS automatically, except the invite-ACCEPT step,
  which by design must be reachable by an unauthenticated invitee and therefore cannot sit behind
  `requireAdmin` — its own authorization is entirely token-possession-based (see Constraints).
  This asymmetry (create = admin-gated, accept = token-gated) must be handled carefully at mount
  time so the accept route isn't accidentally wrapped in the admin-only guard.
- ADM-009 is now committed and delivered a real Staff list (`GET /api/admin/staff`) and branch
  assignment. This phase's UI work extends `apps/admin/src/features/staff/**` (adding an "+ Add
  staff" affordance to the existing staff-list surface) — it does not create a new nav entry or a
  new feature folder; the existing `Staff` nav entry (enabled by ADM-009) is reused as-is.
- ADM-010 (customer management) remains unexecuted (SPEC + PLAN only). This SPEC is written to
  have zero dependency on it landing first, per D3 above — coordination is noted, not required.
- This is deliberately scoped as fresh, standalone work — the admin-dashboard 8-phase program
  (P0–P7) is fully ✅ VERIFIED and complete; this SPEC does not resume or extend that umbrella
  plan, matching how ADM-009 and ADM-010 were both scoped.
