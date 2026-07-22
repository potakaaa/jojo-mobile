---
name: spec:adm-012-web-staff-setup
description: "Product-discovery SPEC for ADM-012 — web-first staff account setup: full profile onboarding (name/birthday/address) + set-password on invite-accept + role-based post-accept routing (issue #142)"
date: 21-07-26
feature: admin-dashboard
---

# ADM-012 — Web-First Staff Account Setup: Profile + Password + Role Routing (SPEC)

## Summary

ADM-011 let a super_admin promote or invite someone into staff/admin/super_admin — but it never
gave that person a real account to actually use afterward. Today, accepting an invite (or being
promoted) only ever produces a transient magic-link session with no password and no profile
information, so once that session expires the person is locked out with no way back in. Worse,
the web accept page always sends the person to the admin dashboard's home page, and the dashboard
rejects anyone who isn't `admin`/`super_admin` — so a newly-accepted `staff` member is silently
bounced to the login screen right after "successfully" accepting their own invite. This phase
fixes both problems with a real, complete web onboarding step: accepting an invite now walks the
person through the same profile information customers already provide (full name, birthday,
address) plus a password of their own choosing, then lands them somewhere that actually makes
sense for their role — admins and super_admins go into the dashboard they can use; staff see a
short, friendly confirmation telling them to sign into the mobile app instead. Staff will do their
day-to-day work signed into the mobile app with the email/password they just set here — this
phase is what makes that possible, with a genuinely complete account behind it.

## User Stories / Jobs To Be Done

1. **As a newly invited or promoted admin/super_admin**, I want to confirm my name and provide my
   birthday and address, and set a password, right after accepting my invite, so my account is a
   real, complete account — not a placeholder — from the moment I start using the dashboard.
2. **As a newly invited or promoted admin/super_admin**, once I've completed my profile and set my
   password, I want to land straight in the admin dashboard, so I can start working immediately
   without an extra sign-in step.
3. **As a newly invited staff member**, I want to complete my profile and set a password right
   after accepting my invite, so I can sign into the mobile app for my shifts using that same
   email and password, with my account already fully set up.
4. **As a newly invited staff member**, after I've completed setup, I want a clear, friendly
   message telling me to open the mobile app to sign in — not to be dropped into the admin
   dashboard (which isn't for me) or bounced to a login screen with no explanation.
5. **As someone accepting an invite whose email already has a password** (e.g. I signed up as a
   customer before being promoted), I don't want to be forced through a redundant "set a new
   password" step — but I should still be asked to confirm/complete my profile if it isn't
   already complete, then be carried straight to the right landing place for my role.
6. **As a super_admin**, I want the invite email link to always open the web accept page (not try
   to open a mobile app that the invitee may not have installed yet), so that account setup works
   reliably for every invitee regardless of whether they have the app.

## What The User Wants (Behavioral Outcomes)

- The web accept page (`apps/admin`'s staff-invite accept screen) gains a real onboarding step
  between "your invite is being verified" and "you're in." After the existing start → verify →
  consume steps succeed, the person completes TWO required sub-steps, in order:
  1. **Profile** — the exact same fields the customer mobile onboarding collects: full name
     (pre-filled from the invited person's existing name where available, editable), birthday
     (entered as MM/DD/YYYY, assembled into `YYYY-MM-DD`, validated the same way the customer
     onboarding form validates it), and address. All three are required — the step cannot be
     completed with any of them missing or invalid.
  2. **Password** — a password field with a confirm-password field and a visible strength
     indicator, enforcing the existing 8–128 character bound.
- Completing both sub-steps sets the account's real, durable sign-in credential AND its real
  profile information — from that point on the account looks and behaves exactly like a fully
  onboarded account, whether it's staff, admin, or super_admin.
- **Immediately after both sub-steps are done**, the app decides where to send the person based
  on their role (already known from the invite-accept response, no extra lookup):
  - **admin or super_admin** → straight into the admin dashboard's home screen, fully signed in.
  - **staff** → a plain, friendly confirmation screen: "You're all set — sign in to the Jojo
    Potato app to start your shifts." No dashboard access is offered or attempted.
- If the invitee's email already had a password (a pre-existing account, e.g. a customer promoted
  from the promote path or a re-invited email), the password sub-step doesn't force the person to
  redundantly change it. The profile sub-step is unaffected by this — it is asked for whenever the
  account's profile isn't already complete, independent of whether a password already exists.
- The "Open in the app" link that used to appear on the web accept page is gone — the web page is
  now the complete, self-contained way to finish setup.
- The invite email itself now links to the web accept page directly (not a mobile deep-link
  redirect) — every invite, whether the recipient is staff, admin, or super_admin, opens the same
  web flow.
- The mobile app's invite-accept screen becomes **unreachable** — there is no navigable route to
  it inside the app and no deep link into it from anywhere anymore — but the screen's file itself
  is left in place, untouched, preserved for possible reuse in a future MOBILE staff-onboarding
  phase (see Out Of Scope). Nobody actually accepts an invite from inside the mobile app anymore.
  Once a staff member has set their password and profile on the web, they open the mobile app
  separately and sign in normally with that email and password, same as any other returning user.
- Nothing about who can be promoted, what role/branch an invite grants, or how the underlying
  role/branch-assignment routes work changes — this phase only adds "complete your profile," "set
  a password," and "go to the right place afterward" on top of the accept flow ADM-011 already
  built.

## Flow / State Diagram

```
Invite email link → apps/admin web accept page (unauthenticated, unguarded route)
                    │
                    ▼
       [existing, unchanged] Step 1: POST /staff-invite/start
                    │
                    ▼
       [existing, unchanged] Step 2: authClient.magicLink.verify
       (browser session cookie set — role still 'customer' at this instant)
                    │
                    ▼
       [existing, unchanged] Step 3: POST /staff-invite/consume
       → applies invite's stored role + branch
       → response: { role, assignedBranchId, alreadyStaffLevel }
                    │
                    ▼
       Show "Complete your profile" step (REQUIRED, always shown)
       Full name (prefilled, editable) · Birthday (MM/DD/YYYY) · Address
       — cannot proceed until all three are present and valid —
                    │
                    ▼
       authClient.updateUser({ name, birthday, address, onboardedAt: now })
       (client-writable additionalFields — same call shape as customer
        onboarding's completeProfile; role is NEVER included/touched)
                    │
                    ▼
       Does this email's account already have a password?
                    │
        ┌───────────┼───────────────────┐
        │                                │
      no password yet                already has a password
        │                                │
        ▼                                │
  Show "Set your password" step          │
  (password + confirm + strength)        │
        │                                │
        ▼                                │
  POST /staff-invite/set-password        │
  (session-gated — the session from      │
   Step 2 rides along)                   │
        │                                │
        │  ┌─── PASSWORD_ALREADY_SET ────┤ (race/edge case — treat as success, continue)
        │  │                             │
        ▼  ▼                             │
  Password set/confirmed ─────────────────┘
                    │
                    ▼
        Route by role from the Step 3 response:
                    │
        ┌───────────┴────────────────┐
        │                            │
  role ∈ {admin,             role = staff
  super_admin}                       │
        │                            ▼
        ▼                  "You're all set — sign in
  Navigate into the         to the Jojo Potato app to
  admin dashboard           start your shifts." (terminal
  (fully signed in,         web confirmation screen —
   profile + password       no dashboard access offered)
   both complete)                    │
                                      │  (separately, later)
                                      ▼
                          Staff opens the MOBILE app,
                          signs in with email + the
                          password just set — normal
                          returning-user login, not an
                          invite-accept flow (that screen
                          is unreachable — no route, no
                          deep link — but its file still
                          exists on disk, untouched).
```

Unchanged, reused exactly as ADM-011 built them (no modification by this phase):
```
POST /staff-invite/start                (existing, unauthenticated + rate-limited)
authClient.magicLink.verify             (existing, better-auth client call)
POST /staff-invite/consume              (existing, session-gated, applies role/branch)
POST /api/admin/users/:id/role          (existing, ADM-001, super_admin-only)
PATCH /api/admin/staff/:id/branch       (existing, ADM-009, super_admin-only)
```

Reused verbatim from the customer onboarding pattern (not reinvented):
```
authClient.updateUser({ name, birthday, address, onboardedAt })   — profile persistence
POST /staff-invite/set-password (new, serverOnly auth.api.setPassword) — password persistence
```

## Acceptance Criteria (Testable Outcomes)

1. **Setting a password on the web accept flow persists a real, durable credential for that
   account** — after set-password succeeds, the person can sign out and sign back in (on either
   the web login or the mobile app) using that email and the password they just chose, with no
   dependency on the original invite link or magic-link session still being valid.
   `proven by:` integration test that drives start → verify → consume → set-password for a
   never-before-seen invitee email, then performs a fresh, independent email/password sign-in
   with the chosen password and asserts it succeeds.
   `strategy:` Fully-Automated.

2. **The set-password endpoint is session-gated** — it requires the live session established by
   the invite-accept verify step (or any other valid session); it rejects an unauthenticated
   request outright, and it never accepts or trusts a role/branch/email supplied by the request
   body (those are not inputs to this endpoint at all).
   `proven by:` integration test asserting an unauthenticated `POST /staff-invite/set-password`
   is rejected (401), and that a successful authenticated call only ever changes the password —
   asserting the account's role/branch are byte-identical before and after the call.
   `strategy:` Fully-Automated.

3. **Password length is enforced (8–128 characters)** — a too-short or too-long password is
   rejected with a clear error and no credential is written; a valid-length password succeeds.
   `proven by:` integration test asserting a 7-character and a 129-character password are both
   rejected with zero credential mutation, and an 8-character and a 128-character password both
   succeed.
   `strategy:` Fully-Automated.

4. **An account that already has a password is not forced through a redundant reset** — calling
   set-password (or the client skipping straight past that sub-step) for an email that already has
   a working password credential does not break, error out, or destroy the existing password; the
   flow proceeds exactly as if password setup had just completed.
   `proven by:` integration test seeding an account with an existing password credential, driving
   it through the invite-accept + set-password call, and asserting (a) the request is handled
   without a 500/hard failure, and (b) the ORIGINAL password still works for sign-in afterward
   (not silently overwritten by a second, unintended write).
   `strategy:` Fully-Automated.

5. **Completing the profile step persists name, birthday, and address, and they read back
   correctly** — after the profile sub-step succeeds, the account's `name`, `birthday`, `address`,
   and `onboardedAt` fields are all set and match what was submitted (birthday assembled to
   `YYYY-MM-DD`), readable back via the same session-read path the customer onboarding flow uses.
   `proven by:` integration test that submits a profile update via the same `updateUser`-style
   mechanism for an invite-accept session, then re-fetches the account and asserts
   `name`/`birthday`/`address`/`onboardedAt` all match the submitted values exactly.
   `strategy:` Fully-Automated.

6. **The profile step blocks completion until all three fields are present and valid** — an
   attempt to proceed with a missing name, an invalid or incomplete birthday, or a missing address
   is rejected client-side (the step does not submit) with a clear inline validation message,
   matching the same validation behavior the customer onboarding form already uses for these
   fields.
   `proven by:` component-level test on the web accept screen's profile step asserting the
   "continue" action is disabled/rejected when any of the three fields is empty or the birthday is
   malformed, and succeeds once all three are valid.
   `strategy:` Fully-Automated.

7. **The profile update never mutates `role`** — the `updateUser` call this phase makes carries
   only `name`/`birthday`/`address`/`onboardedAt`; the account's role (and branch) before and
   after the profile step are byte-identical, regardless of what role the invite granted.
   `proven by:` integration test asserting an invite-accept session's role/branch are unchanged
   immediately after the profile-update call succeeds, for each of the three role values
   (staff/admin/super_admin).
   `strategy:` Fully-Automated.

8. **After profile + password setup, an admin or super_admin invitee lands in the admin
   dashboard, fully signed in** — no additional login step is required; the dashboard's own
   session guard admits them normally.
   `proven by:` component-level test on the web accept screen asserting that, given a
   consume-response with `role: 'admin'` (or `'super_admin'`), the screen navigates to the
   dashboard route after both the profile and password sub-steps resolve.
   `strategy:` Fully-Automated (component-level) + Agent-Probe (real-browser confirmation, see
   AC12).

9. **After profile + password setup, a staff invitee sees a terminal confirmation screen
   directing them to the mobile app — never the admin dashboard, and never a bare error/login
   bounce.**
   `proven by:` component-level test asserting that, given a consume-response with `role:
   'staff'`, the screen renders the "sign in to the app" confirmation content after both sub-steps
   resolve and does NOT attempt any dashboard navigation.
   `strategy:` Fully-Automated (component-level) + Agent-Probe (real-browser confirmation, see
   AC12).

10. **The invite email link opens the web accept page directly for every role** — the mobile
    deep-link redirect step is no longer part of the invite-email path; the link an invitee
    receives points straight at the web accept URL.
    `proven by:` integration test asserting the invite-send mechanism's generated accept URL
    targets the web accept path (not the `/staff-invite/native` mobile-redirect endpoint or a
    `jojopotato://` scheme), for an invite of any target role.
    `strategy:` Fully-Automated.

11. **The mobile app's invite-accept screen is unreachable — file preserved, route removed.**
    `apps/mobile/src/app/(auth)/invite-accept.tsx` remains on disk, byte-unmodified, but there is
    no `Stack.Screen` (or other route) registration pointing to it anywhere in the mobile app's
    navigation, so no in-app action or deep link can land on it.
    `proven by:` a source-presence assertion confirming the file still exists AND that
    `apps/mobile/src/app/(auth)/_layout.tsx` no longer registers an `invite-accept` route, plus
    `apps/mobile` typecheck passing clean with the registration removed (proves nothing else in
    the app still references or navigates to the now-unregistered route).
    `strategy:` Fully-Automated.

12. **The full web accept-to-profile-to-password-to-landing walkthrough works in a real browser,
    for both a staff-role invite and an admin-role invite**, including the profile step's field
    validation and pre-fill, visibly readable strength-meter feedback, and a working
    confirm-password mismatch error.
    `proven by:` manual admin-dashboard walkthrough — the same standing no-E2E-runner residual
    already carried by ADM-009 (AC8) and ADM-011 (AC7/AC15).
    `strategy:` Agent-Probe.

13. **The already-locked role-management and branch-assignment routes are untouched** —
    `POST /api/admin/users/:id/role` and `PATCH /api/admin/staff/:id/branch` are byte-unmodified
    by this phase; this phase only adds a new set-password route, a client-side profile-update
    call, and changes what happens AFTER `/staff-invite/consume` returns.
    `proven by:` re-run of the existing role-management and branch-assignment integration test
    suites with zero new failures, confirming unchanged behavior end-to-end.
    `strategy:` Fully-Automated.

## Out Of Scope

- **A full MOBILE staff onboarding experience at parity with the customer `(onboarding)` flow.**
  With this phase, web accept-time onboarding already collects the full profile (name, birthday,
  address) plus password — so staff accounts ARE fully onboarded by the time they first open the
  mobile app. What remains out of scope, and is now lower urgency than originally flagged, is
  building an equivalent first-run MOBILE experience (e.g. if a future design wants staff to see
  something on first mobile login beyond a normal sign-in screen). This phase does not build any
  new mobile-side first-run experience. The existing `invite-accept.tsx` file is deliberately left
  in place (route removed, file kept) precisely so it can potentially be reused or repurposed by
  that future phase instead of being rebuilt from scratch. **Recommended follow-up:** file a
  backlog note (`staff-mobile-onboarding-parity_NOTE_21-07-26.md`) — mobile-only in scope, lower
  priority now that web setup collects the full profile.
- **Real inbox delivery / live email provisioning.** Standing external prerequisite, unchanged
  from ADM-011 (tracked in
  `process/features/auth-accounts/backlog/wire-better-auth-manual-prereqs_NOTE_09-07-26.md`).
- **Password reset / "forgot password" flow for existing staff/admin accounts.** This phase only
  covers the FIRST password set during invite-accept. A general reset flow (for someone who set a
  password once and then forgot it) is not built here.
- **Editing profile fields after initial setup.** This phase covers the one-time invite-accept
  onboarding step only; a general "edit my profile" screen for staff/admin/super_admin accounts
  is not built here (customers already have no such screen either, for the same fields).
- **Changing anything about who can be invited, what roles are offered, or branch assignment
  logic.** ADM-011's invite-creation surface, and the underlying role/branch routes, are reused
  completely unmodified.
- **The mobile app's login screen itself.** Staff/admin/super_admin already sign in there with
  email+password today (unchanged); this phase makes that path actually reachable — and the
  resulting account fully usable — for a newly-invited person, but it does not modify the mobile
  login screen's own code.
- **Any change to `POST /api/admin/staff/invite` (invite creation) or ADM-013's planned
  list/revoke/resend surface.** This phase only touches what happens on the ACCEPT side, after an
  invite already exists.

## Constraints

- **D1 (locked — web-first setup):** account setup (accept + complete profile + choose a
  password) happens ONLY on the web accept page. There is no reachable mobile-side accept/setup
  flow anymore.
- **D2 (locked — profile step, required, parity with customer onboarding):** the accept flow
  collects full name (prefilled from the invited person's existing name, editable), birthday
  (MM/DD/YYYY entry, assembled to `YYYY-MM-DD`, validated the same way customer onboarding
  validates it), and address — the exact same fields and validation behavior as
  `apps/mobile`'s customer `(onboarding)` flow. All three are required; the step cannot be
  completed without them.
- **D3 (locked — profile persistence mechanism, reused not invented):** the profile step persists
  via `authClient.updateUser({ name, birthday, address, onboardedAt: <now> })` — the SAME
  client-writable-additionalFields mechanism (`birthday`/`address`/`onboardedAt` are `input: true`;
  base `name` is likewise client-writable) that `completeProfile` already uses in
  `apps/mobile/src/features/auth/hooks/use-auth.ts`. `role` is `input: false` (server-owned) and
  is never included in this call, matching how the existing mechanism already refuses to accept
  it.
- **D4 (locked — new password route):** a new session-gated `POST /staff-invite/set-password`
  route applies the chosen password to the account whose session is currently active (the session
  established by the existing verify step). Password length is enforced at 8–128 characters. An
  email that already has a password from a prior signup is treated as a no-op success for the
  PASSWORD sub-step specifically — the profile sub-step is independent and still required
  whenever the account's profile isn't already complete.
- **D5 (locked — routing source):** post-setup role-based routing reads the role from the
  EXISTING `/staff-invite/consume` response (`{ role, assignedBranchId, alreadyStaffLevel }`) —
  no new `/me`-style round-trip is added to make this routing decision.
- **D6 (locked — routing destinations):** admin/super_admin → the admin dashboard home (`/`,
  fully signed in, no extra login step). staff → a terminal WEB confirmation screen instructing
  them to sign into the mobile app. Staff are never routed into the dashboard and are never
  redirected toward the mobile app automatically (no deep-link handoff) — the confirmation is
  purely informational.
- **D7 (locked — password UX):** the set-password sub-step includes a confirm-password field and
  a visible password-strength indicator, in addition to the 8–128 length bound.
- **D8 (locked — mobile surface made unreachable, NOT deleted):** the file
  `apps/mobile/src/app/(auth)/invite-accept.tsx` is left in place, untouched — it is preserved for
  possible reuse in a future MOBILE staff-onboarding phase. What this phase removes is its ROUTE
  REGISTRATION in the mobile `(auth)` layout/navigation stack, so nothing inside the app (and no
  deep link) can actually navigate to it anymore. The web accept page's "Open in the app"
  affordance is also removed. `sendStaffInvite` (in `packages/api`'s `routes/admin/staff.ts`) is
  repointed so the invite email/link targets the web accept page directly, not the
  `/staff-invite/native` → `jojopotato://` mobile-deep-link redirect — so nothing external routes
  into the mobile screen either. Net effect: the screen still exists in the codebase with zero
  reachable entry point (no in-app route, no deep link).
- **Step ordering (locked):** the profile sub-step is always shown first (whenever incomplete),
  followed by the password sub-step (skipped only when a password already exists), followed by
  role-based routing. The profile sub-step is never skipped, even for an already-has-password
  account — profile completeness and password existence are independent conditions.
- **Reused-route freeze:** `POST /api/admin/users/:id/role` and `PATCH /api/admin/staff/:id/branch`
  are not to be touched by this phase, in any way — flag immediately if a requirement here would
  require changing either.
- **Shared-file sequencing note (record, do not resolve here):** this phase edits
  `packages/api/src/routes/staff-invite.ts` (adding `set-password`) and likely
  `packages/api/src/routes/admin/staff.ts` (repointing `sendStaffInvite`'s target URL). ADM-013
  (staff invite management — list/revoke/resend) also edits `staff-invite.ts` (extending its
  liveness guards) and was already recorded, in its own SPEC, as needing to execute sequentially
  with ADM-011 Section H on that same file. ADM-012 adds a THIRD concurrent claim on
  `staff-invite.ts`. PLAN must carry this forward: whichever of ADM-012/ADM-013 lands second must
  re-scan `staff-invite.ts` immediately before editing and rebase on top of whatever landed first.
  This SPEC does not pick an execution order — that is a PLAN/orchestration decision.
- **This is auth/privilege-adjacent surface** — setting a password and writing profile fields on
  a privilege-carrying account are genuine account-security actions, same trust-boundary class as
  ADM-011's invite-accept flow. VALIDATE should weigh whether the high-risk execution handoff
  (5-artifact evidence pack) applies here, consistent with how ADM-011 was handled.
- No RN/E2E test runner exists for `apps/admin` or `apps/mobile` screen-level flows — AC12 is
  necessarily Agent-Probe, matching every prior admin-dashboard phase's standing residual.

## Open Questions

None. All decisions the task required (web-first setup, the required profile step and its exact
fields/validation/persistence mechanism, the new set-password route and its
session/length/already-has-password behavior, the routing source and destinations, the password
UX requirements, and making the mobile surface unreachable while preserving its file + repointing
the invite link) were locked before this SPEC was written — see D1–D8 above. The
mobile-staff-onboarding-parity ask is explicitly deferred to a recommended, reworded backlog note,
not left as an unresolved question for this phase.

## Background / Research Findings

- **The bug is real and confirmed by direct source read.** The web accept screen
  (`apps/admin/src/routes/staff-invite-accept.tsx`) always calls `navigate({ to: '/' })` after
  `/staff-invite/consume` succeeds, regardless of the returned role. The `(dashboard)` route's
  `beforeLoad` guard (`apps/admin/src/routes/(dashboard)/route.tsx`) calls `GET /api/admin/me`,
  which — per `require-admin.ts` — only admits `admin`/`super_admin`; a `staff` role gets a
  non-OK response and is redirected to `/login` with no explanation. So a staff invitee who
  "successfully" accepts today is silently bounced right after landing.
- **No durable credential and no profile data exist today for either accept path.**
  `/staff-invite/consume` only ever runs after a `magicLink.verify` step — better-auth's
  magic-link flow provisions/logs in an account without ever writing a password credential or
  profile fields. Neither the web nor the mobile accept screen sets a password or collects
  name/birthday/address anywhere in the current code.
- **The customer onboarding profile-persistence pattern is directly reusable, confirmed by direct
  read of `apps/mobile/src/features/auth/hooks/use-auth.ts`:** `completeProfile({ name, birthday,
  address })` calls `authClient.updateUser({ name, birthday, address, onboardedAt: new Date() })`.
  `birthday`, `address`, and `onboardedAt` are configured as client-writable
  (`input: true`) `additionalFields` on the `user` model in `packages/api/src/lib/auth.ts`; base
  `name` is a standard better-auth client-writable field. `role` is explicitly `input: false`
  (server-owned) in that same config, so it structurally cannot ride along on an `updateUser` call
  — this is the exact mechanism this phase's profile step reuses, not a new pattern.
  `updateProfile` (the sibling function that deliberately omits `onboardedAt`) also exists in that
  file, confirming the codebase already distinguishes "just update fields" from "update fields AND
  stamp completion" — this phase's profile step matches `completeProfile`'s stamp-on-submit
  semantics, not `updateProfile`'s.
- **`POST /staff-invite/consume`'s response shape is already exactly what's needed for routing:**
  `{ role, assignedBranchId, alreadyStaffLevel }` (`packages/api/src/routes/staff-invite.ts`). No
  new read is needed to know the invitee's role at the moment routing must happen.
- **The invite email currently targets a mobile deep link, not the web page.**
  `sendStaffInvite` (`packages/api/src/routes/admin/staff.ts`) builds its accept URL as
  `${BETTER_AUTH_URL}/staff-invite/native?token=...`; that endpoint
  (`packages/api/src/index.ts`, `GET /staff-invite/native`) 302-redirects to
  `jojopotato:///invite-accept?token=...`. The web accept page
  (`apps/admin/src/routes/staff-invite-accept.tsx`) exists and works (built in ADM-011 Section H)
  but is currently only reachable if someone manually navigates to it — the invite email never
  points there. This phase repoints the email link and retires the `/staff-invite/native` mobile
  redirect step from the invite path (D8).
- **better-auth's `emailAndPassword` plugin is already enabled with no length override**
  (`packages/api/src/lib/auth.ts`: `emailAndPassword: { enabled: true }`) — no
  `minPasswordLength`/`maxPasswordLength` override exists in this codebase, so the framework
  default (8–128) applies as stated in the task's locked decisions. The exact server call used to
  set a password server-side for an already-authenticated session (better-auth's `setPassword`
  server API) is an implementation detail for PLAN/INNOVATE to confirm against the installed
  better-auth version — this SPEC states the requirement (a session-gated endpoint that durably
  sets a password, 8–128 chars, graceful on an already-has-password account) rather than the exact
  call signature.
- **No prior password-set/reset flow exists anywhere in this codebase** (confirmed by search —
  zero references to `setPassword`/`resetPassword`/`changePassword` outside a local React
  `useState` setter in the unrelated login form) — this is the first phase to add one.
- **Mobile side (confirmed by direct read):** `apps/mobile/src/app/(auth)/invite-accept.tsx`
  exists (built in ADM-011, commit `0bf8365`) and drives the same start→verify→consume sequence,
  landing the invitee straight in `(staff)` with `router.replace('/(staff)')` — no password step,
  no profile step, no onboarding. Its route registration lives in
  `apps/mobile/src/app/(auth)/_layout.tsx` (`<Stack.Screen name="invite-accept" />`, confirmed by
  direct read) — this is the single registration D8 removes; the screen file itself stays. The
  mobile `(staff)` shell itself has zero onboarding of any kind (confirmed across the codebase) —
  but with this phase's web-side profile+password collection, that gap is now materially smaller
  than originally framed: staff accounts arrive at the mobile app already fully set up.
- **ADM-013 (staff invite management) is SPEC'd and PLANNED but not yet executed** — its SPEC
  already documents that it and ADM-011 Section H (also unexecuted as of ADM-013's SPEC date)
  both touch `staff-invite.ts` and must run sequentially. ADM-012 is the third concurrent editor
  of that same file; see the Shared-file sequencing constraint above. (ADM-011 Section H itself IS
  already executed and committed as of ADM-012's own SPEC date — `0bf8365` — so the live
  contention is now specifically ADM-012 vs. ADM-013, not a three-way race.)
- **Recommended next-phase strategy:** most implementation mechanics here are already narrow and
  largely locked (one new route, one reused persistence call, two new UI sub-steps reusing
  existing customer-onboarding validation logic, one routing branch, one link repoint, one route
  de-registration) — INNOVATE is a plausible skip candidate, with PLAN proceeding directly from
  this SPEC. The one open mechanical question (exact better-auth server call for setting a
  password on an active session, and its already-has-password edge-case handling) is small enough
  to resolve during PLAN rather than needing a full INNOVATE comparison of alternatives.
