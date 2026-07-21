## ADM-011 — admin/super_admin invite or promote produces a web-console-inaccessible account — NEW PLAN REQUIRED

Date: 21-07-26
Source: ADM-011 (add-staff promote + email-invite, issue #141) — VALIDATE Layer 1/2 finding
Status: OPEN — accepted as a known, documented gap for ADM-011's own scope; not new debt
introduced by this plan's code (the underlying limitation is pre-existing architecture from
ADM-001), but ADM-011 is the first phase to actively widen exposure to it by default.

### Gap

`apps/admin`'s login screen (`apps/admin/src/routes/login.tsx`) is **email/password only** — no
magic-link, no OAuth, no signup screen, and no password-reset/forgot-password screen exist
anywhere in `apps/admin`. The only way an account gets a usable password today is via
`POST /api/auth/sign-up/email` called directly (not through any built UI) — see the standing
memory note `admin-dashboard-no-seeded-admin.md` on how the first super_admin was bootstrapped.

ADM-011's Path 1 (promote) and Path 2 (email invite) both let a super_admin grant `admin` or
`super_admin` role (SPEC D2, locked). For Path 2 specifically, the ENTIRE accept mechanism is
mobile-only (`apps/mobile/src/app/(auth)/invite-accept.tsx`, via `authClient.magicLink.verify`) —
there is no `apps/admin` web accept counterpart in this plan. A magic-link-provisioned account
never has an `account` row with a password credential. The result: an invitee who accepts as
`admin` or `super_admin` lands correctly in the mobile `(staff)` shell (their role is genuinely
granted, server-side), but has **no way to sign into `apps/admin`'s web dashboard** — the actual
tool an `admin`/`super_admin`'s job requires (branches/products/deals/orders/analytics/rewards/
coupons CRUD all live there, not in the mobile `(staff)` shell).

Path 1 (promote) has the same latent exposure for any existing customer account that was never
given a password (magic-link/phone-OTP/Google-OAuth-only signups) — this part is not new, it
already existed before ADM-011 for any customer promoted to admin/super_admin via the pre-existing
`POST /api/admin/users/:id/role` route (ADM-001). ADM-011 does not worsen Path 1's exposure; it
only newly exposes Path 2 (invite), whose entire purpose is onboarding someone who has NEVER had
any account, guaranteeing zero password by construction.

### Why not fixed in ADM-011

Building a password-set flow (e.g. a first-login "set your password" step) or web magic-link
support for `apps/admin` is a real, separate feature — schema/auth-adjacent, its own SPEC/INNOVATE/
PLAN cycle, not a small addition foldable into ADM-011's already-locked scope without re-opening
D1-D3.

### Resolution options (for the next planning pass)

A) Add a "set password" step to the `apps/admin` web accept/first-login flow (new `apps/admin`
   screen + a `POST /api/auth/set-password`-style call, or better-auth's own password-reset token
   flow repurposed) — closes the gap for both promote and invite paths.
B) Add magic-link support to `apps/admin`'s login screen (mirrors the mobile pattern, reusing the
   existing `magicLink` plugin + a new `/magic-link/native`-equivalent-for-web redirect) — avoids
   ever needing a password for admin/super_admin accounts.
C) Narrow SPEC D2 so Path 2 (email invite) only ever grants `staff` (who genuinely only need the
   mobile `(staff)` shell) — defer `admin`/`super_admin` invites to Path 1 (promote an existing,
   already-password-capable account) until (A) or (B) ships.
D) Accept as a standing, documented gap (current status) — a super_admin inviting/promoting another
   admin/super_admin today must separately arrange for that person to get a password via the
   existing (UI-less) `POST /api/auth/sign-up/email` call, same as the original bootstrap process.

### Not blocking ADM-011's own EXECUTE

`staff`-target invites/promotes are unaffected (staff only ever need the mobile `(staff)` shell,
which magic-link accept fully provisions). This gap is scoped to `admin`/`super_admin` targets
specifically and does not invalidate ADM-011's own Acceptance Criteria (none of the 14 ACs assert
web-dashboard sign-in for the invitee).
