---
name: spec:adm-009-staff-management
description: "Product-discovery SPEC for ADM-009 — admin staff list + branch-assignment surface (issue #124)"
date: 21-07-26
feature: admin-dashboard
---

# ADM-009 — Staff Management: Branch Assignment + Role Admin Surface (SPEC)

## Summary

Today, assigning a staff member to a branch is a manual database edit — there is no admin screen
for it. The only production code path that sets `assignedBranchId` is the one-time database seed.
A super_admin CAN already promote a user to `staff`/`admin`/`super_admin` (an existing route), but
once someone is staff, nobody outside direct DB access can tell the app which branch they work at,
or move them to a different branch later. This phase gives admins a real screen: a list of every
staff/admin/super_admin account, showing their role and their assigned branch, with a control to
set, change, or clear that branch assignment. Role changes themselves are not rebuilt — the
existing, already-locked role-change route is reused as-is. This closes the operational gap that
makes onboarding or reassigning a staff member require a developer.

## User Stories / Jobs To Be Done

1. **As an admin**, I want to see a list of everyone with a staff-level role (staff, admin,
   super_admin), along with their assigned branch, so I can tell at a glance who works where —
   and who has no branch yet.
2. **As an admin**, I want to assign a branch to a staff member who doesn't have one yet, so a
   newly-promoted staff account can actually use the staff app (which requires a branch to see any
   orders or settings).
3. **As an admin**, I want to reassign a staff member to a different branch when they transfer, so
   the app reflects where they currently work.
4. **As an admin**, I want to clear a staff member's branch assignment (set it to none), so I can
   put an account on hold without deleting it or changing its role.
5. **As a super_admin**, I want to continue changing a user's role using the existing role controls
   (already shipped), with this new staff list simply reflecting that role — I don't need a second,
   separate way to change roles.

## What The User Wants (Behavioral Outcomes)

- A new "Staff" screen in the admin dashboard lists every user whose role is `staff`, `admin`, or
  `super_admin` — customers are never shown here.
- Each row shows: the person's name/email, their current role, and their assigned branch (or a
  clear "No branch assigned" indicator when none is set).
- From this screen, an admin can pick a branch for a staff member (or clear it back to none) without
  leaving the page, and the change is reflected immediately once saved.
- Only active branches can be picked as an assignment target — a deactivated branch never appears
  as an assignable option.
- Assigning a branch to an account is blocked if that account isn't actually staff-level (a
  customer account should never end up with a branch assignment through this screen).
- The screen does not let an admin change someone's role — that remains the existing, separate
  role-management control (unchanged, reused as-is).
- If a staff member is later demoted to `customer` through the existing role control, their branch
  assignment is left as-is in storage (not auto-cleared) — it simply has no effect while they're a
  customer, and would silently reappear if they're re-promoted to staff later. This is a known,
  accepted quirk (see Constraints), not a defect.
- A new "Staff" entry appears in the admin dashboard's navigation, replacing the current
  disabled "Users & Roles" placeholder.

## Flow / State Diagram

```
Admin opens dashboard → clicks "Staff" (nav, now enabled)
                │
                ▼
      Staff list screen loads
      GET /api/admin/staff
                │
                ▼
   Table: name/email | role | assigned branch
   (customers never appear in this list)
                │
        ┌───────┴────────────────────┐
        │                            │
  Row has NO branch            Row HAS a branch
        │                            │
        ▼                            ▼
  Admin picks a branch      Admin changes branch,
  from a dropdown of        or clears it back to
  ACTIVE branches only      "No branch assigned"
        │                            │
        └──────────────┬─────────────┘
                        ▼
        PATCH /api/admin/staff/:id/branch
        { branchId: <uuid> | null }
                        │
              ┌─────────┴─────────┐
              │                   │
    target is NOT staff-level   target IS staff-level
    (customer)                  AND branch is active/exists
              │                   │ (or branchId is null → clear)
              ▼                   ▼
         Reject, no          Row updates, list reflects
         change made         new assignment immediately
              │                   │
              ▼                   ▼
        Error shown         Success — staff member can
        to admin            now use the (staff) app for
                             that branch on next session
```

Role changes (separate, unchanged, not part of this flow):
```
Admin uses existing role control (already shipped, super_admin-only)
        → POST /api/admin/users/:id/role
        → role updates; branch assignment untouched either way
```

## Acceptance Criteria (Testable Outcomes)

1. **`GET /api/admin/staff` returns every user with role ∈ {staff, admin, super_admin}**, each
   including their assigned branch id and branch name (or null/absent when unassigned). Customers
   are never included.
   `proven by:` a new admin-staff integration test suite asserting the returned set matches exactly
   the seeded staff/admin/super_admin users, with the branch name correctly joined for an assigned
   user and null-safe for an unassigned one.
   `strategy:` Fully-Automated.

2. **`PATCH /api/admin/staff/:id/branch` successfully sets a branch assignment** for a staff-level
   target when given a valid, active branch id.
   `proven by:` integration test asserting the row's `assignedBranchId` is updated and the response
   reflects the new value.
   `strategy:` Fully-Automated.

3. **`PATCH /api/admin/staff/:id/branch` successfully clears a branch assignment** when given
   `branchId: null`.
   `proven by:` integration test asserting a previously-assigned user's `assignedBranchId` becomes
   null after the call.
   `strategy:` Fully-Automated.

4. **The branch-assignment route rejects an inactive or non-existent branch id** — no partial or
   silent write occurs.
   `proven by:` integration test asserting a 4xx response and that the target's `assignedBranchId`
   is unchanged when given a deactivated branch id and again when given a random/non-existent uuid.
   `strategy:` Fully-Automated.

5. **The branch-assignment route rejects a target user who is not staff-level** (i.e. a customer
   account) — a customer can never end up with a branch assignment through this surface.
   `proven by:` integration test asserting a 4xx response and no row mutation when the target id
   belongs to a `customer`-role user.
   `strategy:` Fully-Automated.

6. **The staff-management API surface is admin-role-gated** the same way every other
   `/api/admin/*` route already is — no new/looser authorization path is introduced.
   `proven by:` integration test asserting 401 for an unauthenticated request and 403 for an
   authenticated non-admin (customer or staff-role) request, against both the list and the
   branch-assignment routes — mirroring the existing `require-admin.integration.test.ts` role-matrix
   pattern.
   `strategy:` Fully-Automated.

7. **Role changes continue to work exactly as before, untouched by this phase.** The existing
   `POST /api/admin/users/:id/role` route (super_admin-only, self-escalation blocked) is not
   modified, and this SPEC introduces no second/parallel role-change path.
   `proven by:` existing `require-admin.integration.test.ts` / role-management test suite re-run
   green with zero changes to that route's behavior.
   `strategy:` Fully-Automated.

8. **The admin dashboard Staff screen shows the full staff/admin/super_admin list with role and
   branch columns, and lets an admin assign/reassign/clear a branch from the UI**, with the "Staff"
   nav entry enabled and reachable.
   `proven by:` manual admin-dashboard walkthrough (standing no-E2E-runner gap for `apps/admin`,
   same class of residual carried by every prior admin-dashboard phase — e.g. Phase 5/6's Agent-Probe
   UI gate).
   `strategy:` Agent-Probe.

## Out Of Scope

- **ADM-010 — customer management / a general Users screen.** This phase builds a *dedicated* Staff
  screen only (per the locked decision below), not a shared or filterable all-users view. Customer
  account management is explicitly a separate, not-yet-scoped future phase.
- **Auto-clearing a branch assignment on demotion to customer.** A demoted user's stale
  `assignedBranchId` is left in place (see locked decision D1 below) — no cleanup logic is built.
- **Staff account creation / invite flow.** This phase assumes staff accounts already exist (created
  via signup + an existing role promotion); it does not add a "create a new staff account" flow.
- **Any change to how roles are changed.** The existing `POST /api/admin/users/:id/role` route,
  its guard order, and its super_admin-only/self-escalation rules are reused completely unmodified.
- **MFA / two-factor enrollment for staff or admin accounts.** Unrelated to this phase; tracked
  separately (see the structural MFA seam noted in Phase 1's delivery, still unbuilt).
- **Multi-branch assignment.** A staff member is assigned to exactly one branch or none — this
  phase does not introduce a many-to-many staff-to-branch model.
- **Any change to the `(staff)` mobile app's own behavior** when a staff member has no branch
  (currently a silent dead-end per `assertBranchScope`) — this phase only gives admins the tool to
  prevent that state from happening; it does not change what the staff app does if it's still
  reached.

## Constraints

- Must reuse the existing `requireAdmin` guard + `routes/admin/index.ts` append-only aggregator
  pattern — a new `staff.ts` sub-router mounts under `/api/admin/staff` and inherits admin-only CORS
  and auth automatically. No new authorization mechanism.
- Must NOT modify `POST /api/admin/users/:id/role` — its guard order (super_admin-only →
  self-escalation → Zod validation → DB write) is locked from a prior security review and reused
  verbatim.
- Branch data must always be read fresh from the database for the assignment check (never trusted
  from client input or session state) — mirrors the existing `resolveBranchScope` convention.
- Deactivated branches must never be assignable — the assignment route must independently verify
  branch existence AND active status (no existing shared helper does this; it must be checked
  directly).
- The admin-only staff summary shape (id, email, role, assigned branch id + name) stays local to
  `packages/api`'s admin route/serializer layer, matching the existing convention of NOT promoting
  admin-only DTOs into `packages/types` unless a second consumer needs them.
- No RN/E2E test runner exists for `apps/admin` today — the UI acceptance criterion is necessarily
  Agent-Probe, not automated, matching every other admin-dashboard phase's standing residual.
- **D1 (locked):** demoting a staff member to `customer` via the existing role route does NOT clear
  their `assignedBranchId`. This is a deliberate, zero-extra-code decision — the stale value is
  inert while the account is a customer (the staff-only authorization chain rejects them at the
  door regardless of any lingering branch id) but will silently reappear if the account is later
  re-promoted to staff. Documented as a known, accepted quirk — not to be "fixed" as part of this
  phase.
- **D2 (locked):** this phase ships exactly one dedicated `Staff` nav entry (renaming the existing
  disabled `Users & Roles` placeholder → `Staff`, pointed at the new route). It does NOT build a
  shared/filterable all-users screen. A future, separately-scoped ADM-010 (customer management) will
  add its own `Customers` nav entry later — no speculative shared-screen design is built now.

## Open Questions

None. Both product decisions needed to write these ACs (stale-branch-on-demotion handling; single
dedicated nav entry vs. shared Users screen) were locked with the user before this SPEC was written
(D1, D2 above).

## Background / Research Findings

- `packages/api/src/routes/admin/users.ts` today only has `GET /me` and
  `POST /users/:id/role` (super_admin-only, guard order locked: super_admin check → self-escalation
  guard → Zod enum validation → `UPDATE ... RETURNING` → 404 if no row). This route is reused
  unmodified; no new role logic is introduced.
- `users.assignedBranchId` (`packages/api/src/db/schema/users.ts:38`) is a nullable uuid FK to
  `branches.id`, staff-only by convention. The ONLY production write path today is the hardcoded
  seed (`seed.ts:86`) — there is no client-facing write path at all. This gap is the entire reason
  for this phase.
- `require-staff.ts`'s `assertBranchScope(assignedBranchId, requestedBranchId, role?)`: an
  admin/super_admin role bypasses the check entirely; a `null` `assignedBranchId` for a staff user
  makes every `/api/staff/*` data route return empty/403 — i.e. a staff account with no assigned
  branch is a silent dead-end in the staff app today, with no admin-facing way to notice or fix it
  except direct DB access. This SPEC's screen directly addresses that operational blind spot.
- `routes/admin/index.ts` is a proven append-only aggregator (11 existing sub-router consumers) — a
  new `staff.ts` mounted as `adminRouter.use('/staff', staffRouter)` inherits `requireAdmin` + CORS
  automatically, no new wiring needed at the top level.
- Serializer convention (established across Branches/Rewards/Orders/Analytics phases): admin-only
  response shapes are declared LOCALLY in `routes/lib/serializers.ts`, not promoted to
  `packages/types`, unless a second consumer outside `packages/api` needs the type. A new
  `AdminStaffSummary` (id, email, role, assignedBranchId, branchName | null) follows this precedent.
  The branch-name join itself has a direct precedent: `staff.ts`'s existing `GET /me` canary already
  does a null-safe `{id, name, slug}` select from `branches` by `assignedBranchId`.
- No existing shared helper checks "branch exists AND is active" — `branches.ts`'s `GET /:id`
  deliberately does NOT filter on `is_active` (by design, for other consumers) — the new
  branch-assignment route must do its own active-branch check. Similarly, no existing helper checks
  "target user is staff-level" — the route needs a fresh role lookup.
- `apps/admin` has no `features/staff/` folder yet. The established feature-module shape (most
  directly mirrored from `features/rewards/**`) is: a `lib/admin-*-api.ts` fetch wrapper
  (`credentials: 'include'`), a `hooks/use-admin-*.ts` react-query hook (list query + mutation(s)),
  and `components/*-list.tsx` (+ matching `.test.tsx`) — Rewards has no separate detail screen or
  types file, which this phase's single-list-with-inline-edit shape also doesn't need.
- The TanStack Start nested-route `<Outlet/>` gotcha (found and fixed the hard way in Phase 3) is a
  hard constraint here too: the Staff screen needs a thin `routes/(dashboard)/staff.tsx` layout
  (`<Outlet/>`) plus `staff.index.tsx` holding the actual list — a single non-split route file would
  silently fail to render if a future detail sub-route is ever added, matching the established
  reference pattern for every list screen since Phase 3.
- `nav-config.ts` already has a `Users & Roles` entry (`disabled: true`, `to: '/users'`) in the
  Management group — this phase enables it, per the locked D2 decision, by repurposing it into a
  dedicated `Staff` entry (`to: '/staff'`) rather than building a second, generic users screen.
- `require-admin.integration.test.ts` is the existing role-matrix test precedent (401 unauthenticated
  / 403 non-admin) that AC6's new tests should mirror for the staff routes.
- This is deliberately scoped as fresh, standalone work — the admin-dashboard 8-phase program
  (P0–P7) is already fully ✅ VERIFIED and complete; this SPEC does not resume or extend that
  umbrella plan.
