## ADM-011 — admin/super_admin invite or promote produces a web-console-inaccessible account — NEW PLAN REQUIRED

Date: 21-07-26
Source: ADM-011 (add-staff promote + email-invite, issue #141) — VALIDATE Layer 1/2 finding
Status: INVITE PATH RESOLVED by ADM-012 (#142) via resolution option (A) — the `apps/admin` web
accept page now runs a password-setup step (`POST /staff-invite/set-password`) before role-based
routing, so an `admin`/`super_admin` invitee sets a durable password and can sign into the web
dashboard. Remaining OPEN residual: Path 1 (promote) of an existing *passwordless* customer account
(magic-link/phone-OTP/Google-only signup, never given a password) still lands in the same
web-inaccessible state — pre-existing since ADM-001, not worsened by ADM-011/012.

### Gap

`apps/admin`'s login screen (`apps/admin/src/routes/login.tsx`) is **email/password only** — no
magic-link, no OAuth, no signup screen, and no password-reset/forgot-password screen exist
anywhere in `apps/admin`. The only way an account gets a usable password today is via
`POST /api/auth/sign-up/email` called directly (not through any built UI) — see the standing
memory note `admin-dashboard-no-seeded-admin.md` on how the first super_admin was bootstrapped.

ADM-011's Path 1 (promote) and Path 2 (email invite) both let a super_admin grant `admin` or
`super_admin` role (SPEC D2, locked). At ADM-011 time, Path 2's accept mechanism was mobile-only
(`apps/mobile/src/app/(auth)/invite-accept.tsx`, via `authClient.magicLink.verify`) with no
`apps/admin` web accept counterpart, so a magic-link-provisioned invitee never had a password
credential and could not sign into the web dashboard. **ADM-012 (#142) fixed this**: the invite
email now points at the `apps/admin` web accept page (`staff-invite-accept.tsx`), which sets a
durable password before routing an admin/super_admin invitee into the dashboard. The paragraph
below describes the RESOLVED (pre-ADM-012) invite-path gap; the still-open residual is Path 1 only.

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

A) ✅ SHIPPED in ADM-012 (#142) for the invite path — a "set password" step
   (`POST /staff-invite/set-password`) on the `apps/admin` web accept flow. Extending the same
   set-password affordance to Path 1 (promoting an existing passwordless customer) is the remaining
   open slice.
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
