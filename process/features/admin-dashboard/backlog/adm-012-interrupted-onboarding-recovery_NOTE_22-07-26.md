## ADM-012 — interrupted staff-invite onboarding cannot be resumed (consumed invite → 410 lockout)

Date: 22-07-26
Source: CodeRabbit review of PR #152 (ADM-011/012) — `apps/admin/src/routes/staff-invite-accept.tsx`
Status: OPEN — accepted gap, deferred to its own scoped task (not a minimal review fix)

### Gap

The web accept flow (`staff-invite-accept.tsx`) runs start → magic-link verify → consume →
Profile → Password in one uninterrupted browser session. `/consume` marks the invite consumed and
applies the role/branch. If the invitee closes the tab / crashes AFTER consume but BEFORE completing
the Password step, the account now exists with a staff-level role but **no password credential**,
and reopening the invite link fails at `POST /staff-invite/start` with a 410 (invite already
consumed). The invitee is effectively locked out — no password to sign in, and no way to re-enter
the setup flow. `set-password` is idempotent, but the screen never reaches it on a fresh reload.

### Why not fixed in this review pass

A proper recovery flow is a feature, not a minimal fix: it needs the accept screen to detect the
"already have a session for this invite's email, invite already consumed" case, skip
start/verify/consume, read the applied role from the existing session, and resume at the Profile or
Password phase — plus jsdom tests for the resume path and a decision on what happens if a *different*
user is signed in. That is beyond a review-comment fix and belongs in a scoped task.

### Resolution options

A) On `/start` 410 (or fetch), if `authClient.useSession()` already reports a signed-in staff-level
   user, skip start/verify/consume and jump straight to the Profile/Password steps using the session
   role for routing — the true resume path.
B) Lean on ADM-013's resend (issue #149): an admin resends the invite, rotating the token, so the
   invitee gets a fresh working link. Does not self-serve, but requires no accept-screen change.
C) Add a standalone "set your password" affordance on `apps/admin` login for any passwordless
   staff-level account (also closes the Path-1-promote residual in
   `adm-011-admin-invite-no-web-access_NOTE_21-07-26.md`).

Not blocking ADM-012's own ACs (none assert interrupted-session recovery); the AC12 walkthrough
exercises the uninterrupted happy path.
