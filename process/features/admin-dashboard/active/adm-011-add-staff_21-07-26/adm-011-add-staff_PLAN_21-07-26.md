---
name: plan:adm-011-add-staff
description: "COMPLEX plan for ADM-011 — add staff via promote-existing-user + email-invite flow (issue #141)"
date: 21-07-26
feature: admin-dashboard
---

# ADM-011 — Add Staff: Promote Existing User + Email Invite (PLAN)

Date: 21-07-26

Status: **CODE DONE + COMMITTED (`0bf8365`) — NOT VERIFIED. UPDATE PROCESS pass 21-07-26.**
Sections A–G (backend + mobile accept flow) AND Section H (`apps/admin` web accept surface + CORS
extension, scope reopened same-day) are both EXECUTED and independently EVL-confirmed green:
`packages/api` 709/709, `apps/admin` 177/177 + typecheck + build clean, `apps/mobile` typecheck
clean, root typecheck + format:check clean, zero regressions. Both the base Validate Contract
(Sections A–G, Gate: PASS) and the Validate Contract Delta (Section H, Delta Gate: PASS) carry
genuine, separate human APPROVE records (`harness/review-decision.json`,
`harness/review-decision-delta.json`) — `mustStopBeforeFinalize` is satisfied for both. **This plan
stays in `active/`, not `completed/` — VERIFIED requires 3 still-owed, user-run Agent-Probe
walkthroughs (AC7 admin UI, mobile `invite-accept.tsx` on-device incl. the navigation-race
observation, AC15 web accept page real-browser) that have NOT yet been performed.** See
`adm-011-add-staff_REPORT_21-07-26.md` (same task folder) for the full UPDATE PROCESS closeout. The
admin/super_admin-invite-has-no-web-access gap is an accepted, documented Known-Gap deferred to
issue #142 (`process/features/admin-dashboard/backlog/adm-011-admin-invite-no-web-access_NOTE_21-07-26.md`)
— it does not block VERIFIED. Standalone COMPLEX plan (not a phase program). Independent of ADM-010
(unexecuted).

Complexity: COMPLEX — new migration, 5 new/extended routes across an auth-adjacent trust
boundary, 3 packages touched (packages/api, apps/admin, apps/mobile).

## Overview

ADM-011 (issue #141) adds the missing "bring a new person into the staff roster" capability that
ADM-009 (staff list + branch reassignment) did not cover. Two paths, both super_admin-only: (1)
promote an existing customer account to staff/admin/super_admin by email lookup, composing the
two already-locked routes (`POST /api/admin/users/:id/role`, `PATCH /api/admin/staff/:id/branch`)
unmodified; (2) email-invite someone with no account yet, via a new single-use, expiring,
hashed-token `staff_invites` table and a magic-link-backed accept flow that provisions the account
with a pre-set role/branch on the **mobile app only** (see Validate Contract — no `apps/admin` web
accept counterpart exists in this plan). See the SPEC
(`adm-011-add-staff_SPEC_21-07-26.md`, same task folder) for full product intent, user stories,
and the locked D1–D3 decisions; this plan implements exactly that scope, with all storage/
mechanism choices (left open to INNOVATE by SPEC) resolved and locked below.

## Feasibility Confirmation (required before locking the accept-flow design)

**Question:** Does better-auth's `magicLink` plugin auto-provision an account for an unrecognized
email by default (no `disableSignUp` set in `auth.ts`)?

**Method used:** Direct source read (not Context7 — the installed package is on disk under the
pnpm store and gives a definitive, version-pinned answer faster than a docs lookup).

```
node_modules/.pnpm/better-auth@1.6.23_.../node_modules/better-auth/dist/plugins/magic-link/index.mjs
```

**Verbatim source (verify handler, `/magic-link/verify`):**

```js
let user = await ctx.context.internalAdapter.findUserByEmail(email).then((res) => res?.user);
if (!user) if (!opts.disableSignUp) {
  const newUser = await ctx.context.internalAdapter.createUser({
    email,
    emailVerified: true,
    name: name || ""
  });
  isNewUser = true;
  user = newUser;
  if (!user) redirectWithError("failed_to_create_user");
} else redirectWithError("new_user_signup_disabled");
```

**Answer: CONFIRMED — auto-provision is the default.** `packages/api/src/lib/auth.ts`'s
`magicLink({...})` config never sets `disableSignUp`, so `opts.disableSignUp` is `undefined` →
falsy → the `!opts.disableSignUp` branch always fires for an unrecognized email: better-auth
creates a real `users` row (`emailVerified: true`, `name: name || ''`, role defaults to
`'customer'` via the `userRoleEnum('role').default('customer')` DB column default — better-auth's
`createUser` writes through the Drizzle adapter, which applies the schema's column defaults for
any field it doesn't explicitly set) and a session, THEN returns a session token.

**Design consequence (locked, no fallback needed):** the invite-accept flow can safely call
`auth.api.signInMagicLink` server-side for an invited email with zero pre-provisioning step — the
FIRST verify call for a never-seen-before email creates the account as a plain `customer`
automatically. The invite's role/branch promotion is then applied as a SEPARATE, subsequent step
(`POST /staff-invite/consume`, session-gated) — never smuggled into the auto-created user's initial
fields. This is exactly the two-step shape specified in the locked design below; no extra
provisioning code is required anywhere in this plan.

No `VC-FEASIBILITY-PROBE-NEEDED` needed — resolved definitively from source.

**VALIDATE addendum (21-07-26):** this feasibility read only inspected the magic-link plugin's
*verify* handler (auto-provision behavior). VALIDATE additionally read the plugin's **mint-side**
(`signInMagicLink`) handler while checking the `/staff-invite/start` mechanism in the Innovate Note
below, and found the Innovate Note's own claims about how the minted token is stored were
factually incorrect. See `## Validate Contract` → `Plan updates applied` for the correction; the
auto-provision conclusion above is unaffected and remains confirmed.

---

## Locked Decisions (from SPEC + INNOVATE — not re-opened here)

| ID | Decision |
|---|---|
| D1 | Both paths ship this phase. Path 2 not blocked on live email delivery — dev-log fallback proves the full mechanism today; AC14 (real inbox) is Known-Gap on the standing Resend prereq. |
| D2 | Target/intended role ∈ {staff, admin, super_admin}. Entire add-staff surface is super_admin-only (inline check, mirrors `users.ts`'s role route). Self-escalation stays blocked on the promote path (unmodified underlying route). **VALIDATE note:** for Path 2 (invite) specifically, an `admin`/`super_admin` target produces an account that can accept via mobile but currently has no way to sign into `apps/admin`'s web dashboard — see Validate Contract Known Gap and `process/features/admin-dashboard/backlog/adm-011-admin-invite-no-web-access_NOTE_21-07-26.md`. This does not narrow D2 — it is accepted as a documented gap, not a scope change. |
| D3 | Standalone `GET /api/admin/users/lookup?email=` exact-match route in `users.ts`. Zero dependency on ADM-010. |
| Ordering | Promote path: `POST /api/admin/users/:id/role` FIRST, then (staff target only) `PATCH /api/admin/staff/:id/branch`. Both routes reused byte-unmodified. |
| Invite storage | NEW `staff_invites` table (migration `0020`), additive-only. Token stored HASHED at rest (deliberate divergence from `verification`'s plaintext convention — a staff invite pre-authorizes privilege, so a DB read alone must never be enough to impersonate accept). Single-live-invite-per-email enforced app-level (supersede prior unconsumed/unexpired invite in the same transaction on create). No unique index (soft-delete/audit convention, matches `offers`/`coupons`). |
| Delivery | Inline the Resend-or-log pattern directly in the invite-create handler. No shared helper extracted (single call site, YAGNI). |
| Accept mechanism | Reuse magic-link mint/verify — no new signup form. `POST /staff-invite/start` (unauth, validates invite, server-mints a magic-link token via `auth.api.signInMagicLink`) → client verifies via `authClient.magicLink.verify` (real session lands) → `POST /staff-invite/consume` (session-gated, atomic single-use consume + apply role/branch). ~~**Mobile-only** — no `apps/admin` web accept screen exists in this plan~~ **[REVERSED 21-07-26]** — the user has explicitly reopened this scope this session: a WEB accept surface is now ADDED (`apps/admin/src/routes/staff-invite-accept.tsx`, unguarded, sibling to `login.tsx`), reusing the identical start→verify→consume sequence via a new `magicLinkClient()` plugin on the admin `authClient`. See `## Web Accept Surface (apps/admin) — Scope Reopened 21-07-26` below and the updated Validate Contract Delta. |
| Route placement | lookup → `users.ts`. `POST /api/admin/staff/invite` (create) → `staff.ts` (inherits `requireAdmin` + inline super_admin check). Accept routes → NEW `staff-invite.ts` router mounted OUTSIDE `/api/admin` in `index.ts`. |
| Token security | `crypto.randomBytes` token, SHA-256-hashed at rest, hash-compared on accept, 7-day expiry, atomic compare-and-swap single-use consume (`UPDATE ... WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING *`). |
| Path 1 UI | One `FormDialog` with internal step state on `StaffList`'s parent route ("+ Add staff" button), mirroring `deal-create-wizard.tsx`'s step-in-dialog pattern. Not a new route. super_admin-gated client-side (cosmetic — server enforces the real boundary). **VALIDATE note:** the exact file is `apps/admin/src/routes/(dashboard)/staff.index.tsx` (the list screen), not `staff.tsx` (which is only the `<Outlet/>` layout shell) — confirmed by direct read. |

---

## Touchpoints

### `packages/api` (backend — new surface + 2 reused routes, zero modification to either)

| File | Change |
|---|---|
| `packages/api/drizzle/0020_[auto-name].sql` | NEW migration — `staff_invites` table (additive) |
| `packages/api/src/db/schema/staff_invites.ts` | NEW schema file |
| `packages/api/src/db/schema/index.ts` | Add `export * from './staff_invites';` (FK depends on `users`/`branches` — section 7c, after `users`) |
| `packages/api/src/routes/admin/users.ts` | ADD `GET /users/lookup?email=` handler registered as `usersRouter.get('/users/lookup', ...)` — NOT `.get('/lookup', ...)`, since `usersRouter` mounts at the admin ROOT (`adminRouter.use('/', usersRouter)`), matching the existing `usersRouter.post('/users/:id/role', ...)` registration convention exactly (confirmed by direct read). `POST /users/:id/role` untouched, byte-identical. |
| `packages/api/src/routes/admin/staff.ts` | ADD `POST /invite` (new handler only — `GET /` and `PATCH /:id/branch` untouched) |
| `packages/api/src/routes/staff-invite.ts` | NEW router — `POST /start`, `POST /consume`, mounted OUTSIDE `/api/admin` |
| `packages/api/src/middleware/rate-limit.ts` | NEW — small in-memory (per-process) IP-keyed fixed-window rate limiter, no new dependency. Applied to `POST /staff-invite/start`. **[SUPPLEMENT-added, 21-07-26]** |
| `packages/api/src/index.ts` | Mount `app.use('/staff-invite', staffInviteRouter)` + add `GET /staff-invite/native` deep-link redirect (sibling to `/magic-link/native`). **[SUPPLEMENT-added 21-07-26]** extend the mount to `app.use('/staff-invite', adminCors, staffInviteRouter)` — reuses the existing `adminCors` object unmodified (see `## Web Accept Surface` → H3). |
| `packages/api/src/routes/lib/serializers.ts` | ADD local `AdminUserLookupResult`, `AdminStaffInviteSummary` shapes (admin-only, stay local per convention) |
| `packages/api/src/routes/admin/lib/errors.ts` | UNCHANGED — reused (`AdminApiError`, `handleAdminError`) |
| `packages/api/src/lib/auth.ts` | UNCHANGED — `signInMagicLink`/`magicLink.verify` reused via `auth.api` calls, no plugin config edits |
| `packages/api/src/db/seed/{data,seed}.ts` | No change required (invites are created via the flow, not seeded) |

### `apps/admin` (frontend — Path 1 + Path 2 create UI)

| File | Change |
|---|---|
| `apps/admin/src/features/staff/lib/admin-staff-api.ts` | ADD `lookupUserByEmail(email)`, `createStaffInvite(payload)` |
| `apps/admin/src/features/staff/hooks/use-admin-staff.ts` | ADD `useUserLookup()` (manual-trigger query or mutation-shaped), `useCreateStaffInvite()` mutation |
| `apps/admin/src/features/staff/components/add-staff-dialog.tsx` | NEW — `FormDialog` wrapping the step-state flow (email → lookup result → role/branch → confirm, or → invite form) |
| `apps/admin/src/features/staff/components/staff-list.tsx` | UNCHANGED (existing table stays as-is) |
| `apps/admin/src/routes/(dashboard)/staff.index.tsx` | ADD "+ Add staff" button (super_admin-gated via `useAdminAuth().role`), renders `AddStaffDialog`. Confirmed exact file (not `staff.tsx`, the `<Outlet/>` layout) by direct read of both files. |
| `apps/admin/src/features/staff/components/add-staff-dialog.test.tsx` | NEW — component tests |
| `apps/admin/src/routes/staff-invite-accept.tsx` | **[SUPPLEMENT-added 21-07-26]** NEW — unguarded web accept page (start→verify→consume), sibling to `login.tsx`. See `## Web Accept Surface` → H1. |
| `apps/admin/src/features/auth/lib/auth-client.ts` | **[SUPPLEMENT-added 21-07-26]** ADD `magicLinkClient()` plugin (only change to this file). See H2. |
| `apps/admin/src/routes/staff-invite-accept.test.tsx` | **[SUPPLEMENT-added 21-07-26]** NEW — component test for the start→verify→consume wiring. See H4. |

### `apps/mobile` (accept-flow screen — mobile-only, see Validate Contract)

| File | Change |
|---|---|
| `apps/mobile/src/app/(auth)/invite-accept.tsx` | NEW — thin variant of `magic-link.tsx`: verify the minted magic-link token via `authClient.magicLink.verify`, then call `POST /staff-invite/consume` (session-gated), then route to `(staff)` (root gate already routes staff-role sessions there). **VALIDATE note:** show a persistent loading/cover state across BOTH the verify step and the consume step (not just verify) — see Validate Contract Execute-Agent Instruction on the root-gate navigation race. |
| deep link registration | Confirm Expo Router auto-registers the new file (no explicit registration needed — matches `magic-link.tsx`'s own convention, file-based routing) |
| `apps/mobile/src/features/auth/lib/auth-client.ts` | UNCHANGED — `authClient.magicLink.verify` already exported/used |
| `apps/mobile/src/features/auth/hooks/use-auth.ts` | UNCHANGED — root gate already routes `isStaff` sessions to `(staff)`; no new state needed since `invite-accept.tsx` calls `/staff-invite/consume` itself, then the session refetch that `authClient.useSession()` performs on its own picks up the new role |

### `packages/types`

| File | Change |
|---|---|
| — | NO new shared types. Per SPEC's "Serializer/route-shape conventions… stay local to `packages/api`'s admin route/serializer layer… unless a second consumer needs them" — the only cross-package consumer is `apps/admin` (fetch wrapper defines its own local interface, matching `AdminStaffMember`'s existing precedent in `admin-staff-api.ts`) and `apps/mobile` (consumes only the existing `authClient.magicLink.verify` + a plain `fetch` to `/staff-invite/consume`, no shared type needed). |

---

## Public Contracts

### `GET /api/admin/users/lookup?email=` (NEW, `users.ts`, inherits `requireAdmin` — additionally super_admin-gated inline)

- **Guard order:** `req.adminSession!.role !== 'super_admin'` → 403 FIRST (mirrors the role route's guard-order discipline) → Zod query validation (`email: z.email()` — valid in this repo's pinned Zod 4.4.3; VALIDATE corrected the plan's earlier citation of a nonexistent `deal-schedule.ts` precedent — no existing route in this codebase currently validates an email field, `z.email()` is simply the correct Zod-4 API either way) → 400 on invalid → exact-match DB lookup (`eq(users.email, email)` — case-sensitivity note: DB column has no `citext`/lower-index; lookup is a plain equality match on the stored value, matching how `email.unique().notNull()` is defined; no normalization layer exists elsewhere in this codebase for email lookups, so none is added here — YAGNI, documented as a known limitation below).
- **200** (found): `{ user: { id, name, email, role } }`
- **200** (not found): `{ user: null }` — NOT a 404. A "no account with this email" outcome is a normal, expected branch of this flow (it routes the admin to the invite path), not an error condition. Matches the SPEC's flow diagram treating "not found" as a first-class branch, not an exception.
- **403**: non-super_admin caller (admin role) — same shape as every other admin 403: `{ error: 'Forbidden' }`
- **401**: unauthenticated — inherited from `requireAdmin` at mount, unchanged shape

### `POST /api/admin/staff/invite` (NEW, `staff.ts`, inherits `requireAdmin` — additionally super_admin-gated inline)

- **Guard order:** super_admin inline check (403) → Zod body validation (400) → target-email-already-has-account check (query `users` by email; if found → 409, "An account with this email already exists — use the promote flow instead") → within a `db.transaction()`: supersede any prior unconsumed+unexpired invite row for that email (`UPDATE staff_invites SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL AND expires_at > now()`) → generate token (`crypto.randomBytes(32).toString('hex')`), hash it (`crypto.createHash('sha256').update(token).digest('hex')`), insert new `staff_invites` row (`expires_at = now() + 7 days`) → commit.
- **Body:** `{ email: string, intendedRole: 'staff'|'admin'|'super_admin', intendedBranchId?: string | null }` — Zod: `intendedBranchId` required (uuid) only when `intendedRole === 'staff'` (refined schema, `.superRefine`), forbidden/ignored otherwise (mirrors D2's branch-only-for-staff rule, matching the existing branch-route's "not staff-level → 400" spirit but enforced at the SOURCE this time since we control both fields at creation).
- **Send:** after the DB write commits, inline Resend-or-log (see Delivery decision) — send failure does NOT roll back the invite row (the invite is real and accept-able even if the email bounced; matches this repo's existing precedent of never gating a DB commit on a 3rd-party send succeeding — `sendMagicLink` has the identical shape).
- **201**: `{ invite: { email, intendedRole, intendedBranchId, expiresAt } }` — deliberately NEVER returns the raw token or its hash in the response body (the accept link is only ever delivered via the email/log channel, matching how `signInMagicLink`'s token never appears in an admin-facing API response either).
- **409**: email already has an account
- **403 / 401**: same as lookup route
- **400**: invalid body (bad email, bad role enum, branch missing for `staff` target, branch present for non-`staff` target)

### `POST /staff-invite/start` (NEW router, mounted OUTSIDE `/api/admin` — UNAUTHENTICATED by design)

- **Body:** `{ token: string }` (the raw, unhashed token from the accept link's query param)
- Hash the incoming token, look up `staff_invites` by `token_hash`, check `consumed_at IS NULL AND expires_at > now()`. Invalid/expired/consumed → 400/410 (see below).
- On valid: call `auth.api.signInMagicLink({ body: { email: invite.email, name: ... }, headers: {} })` server-to-server (mirrors the exact `/dev/session` pattern used in `index.ts`'s `DEV_AUTO_LOGIN_ENABLED` block — confirmed by direct read that `auth.api.signInMagicLink({body:{...}, headers:{}})` is already a proven, working call shape in this codebase). Then capture the minted token — see **VALIDATE-corrected mechanism** below (this replaces the plan's original Innovate Note, which described an incorrect query).
- **200**: `{ magicLinkToken: string }`
- **400**: malformed/missing token in body
- **410 Gone**: token found but expired or already consumed (distinct from 404 to signal "this WAS valid once" for a clearer UI message — matches HTTP semantics precedent, no prior 410 use in this codebase but is the correct, unambiguous status here)
- **404**: token hash matches no row at all (never issued / garbage input)
- **NO auth guard at all** — token possession is the sole authorization signal (locked constraint). NOT mounted under `/api/admin`.
- **429 Too Many Requests** — **[SUPPLEMENT-added, 21-07-26]** rate-limited at 10 requests/minute/IP via the new `rateLimit` middleware (`packages/api/src/middleware/rate-limit.ts`), applied ONLY to this route (not `/consume`, which is session-gated and lower-priority; not `/api/admin/staff/invite` or `/api/admin/users/lookup`, which are super_admin-session-gated). Response body is a generic `{ error: 'Too many requests' }` — deliberately does NOT distinguish this from any other error shape, so a 429 itself cannot be used to fingerprint request timing beyond what any rate limiter already reveals. This closes the accepted residual flagged in `harness/adversarial-validation.json`'s last scenario (token-validity-probing / mail-bomb-adjacent hammering of `/start`'s own 400/404/410 responses).

### `POST /staff-invite/consume` (NEW router, mounted OUTSIDE `/api/admin` — SESSION-gated via `requireSession`, same middleware `orders.ts`/`cart.ts` already use)

- **Body:** `{ token: string }` (same raw token — the client re-sends it after landing a session, so the server can re-derive which invite this accept belongs to; the now-authenticated `req.user!.id`/`.email` is used ONLY to confirm the session's email matches the invite's email — a defense-in-depth check, not the primary authorization, which remains token-hash-driven)
- **Atomic single-use consume:** `UPDATE staff_invites SET consumed_at = now() WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING *` — if zero rows returned → 410/404 (same distinction as `/start`), no mutation to `users`.
- **Email cross-check:** if `updated.email !== req.user!.email` → this should be structurally impossible (the session was just minted FOR that exact email by `/start`) but is asserted defensively; on mismatch, treat as 500 (an invariant violation, not a client error) and do NOT apply role/branch.
- **Re-check-current-role-at-consume (locked, binding):** read the target's CURRENT role fresh from `users` (`req.user!.id`, now session-authenticated). If already at staff-level (`role !== 'customer'`) via some other path (e.g. a super_admin manually promoted them in the interim, or a second invite for the same email raced) → no-op gracefully: return 200 with a body indicating no change was needed, do NOT re-run the role/branch write, do NOT error.
- **Otherwise:** apply role via `POST /api/admin/users/:id/role`-equivalent inline write (NOT an HTTP call to that route — this handler has no admin session to call it with; it performs the identical DB write directly: `UPDATE users SET role = $intendedRole WHERE id = $userId`), then, only if `intendedRole === 'staff'`, `UPDATE users SET assigned_branch_id = $intendedBranchId`. This is the ONE place in this plan that duplicates write logic rather than calling the existing routes over HTTP — justified because the caller has no super_admin session (they ARE the invitee, not an admin) and the existing routes are super_admin-gated; the DUPLICATED write is still governed by the exact same target semantics (role write, then branch write, same order) and is regression-tested against a direct-route comparison (AC10-equivalent internal-consistency test — see Verification Evidence).
- **200**: `{ role: string, assignedBranchId: string | null, alreadyStaffLevel: boolean }`
- **410/404**: invalid/expired/consumed token (mirrors `/start`)
- **401**: no session (must have completed `/start` → `authClient.magicLink.verify` first)

### `GET /staff-invite/native` (NEW, sibling to `/magic-link/native`, unauthenticated, no body)

- Identical shape to the existing `/magic-link/native` redirect: bounces `?token=` into the app via the `jojopotato://` scheme, targeting the NEW `(auth)/invite-accept` route instead of `(auth)/magic-link`. This is the deep-link entry point the invite EMAIL actually links to (`${BETTER_AUTH_URL}/staff-invite/native?token=...`) — NOT `/staff-invite/start` directly (that's a JSON API the APP calls after landing, not an email-clickable link).

---

### `/staff-invite/start` + `/staff-invite/consume` — CORS extension **[SUPPLEMENT-added 21-07-26]**

Both routes' request/response shapes are UNCHANGED (see the two Public Contracts entries above,
still authoritative). The only delta: the router mount in `index.ts` gains the existing `adminCors`
middleware (`origin: [ADMIN_WEB_ORIGIN], credentials: true` — the same object already mounted on
`/api/admin` and `/api/auth`, not a new policy). This makes both routes callable cross-origin, with
credentials, from `apps/admin` only. Full trust-boundary analysis: `## Web Accept Surface` → H3.

## Blast Radius

- **Packages touched:** `packages/api` (new table/migration, 2 additive route handlers on existing files, 1 new router, 1 index.ts mount), `apps/admin` (2 new files, 2 files extended), `apps/mobile` (1 new file).
- **Risk class:** AUTH-ADJACENT / PRIVILEGE-GRANTING (per SPEC Constraints). Both the promote path (role escalation via an existing, unmodified route) and the invite path (unauthenticated-token-driven account provisioning with a pre-set role) sit in the same trust-boundary class as ADM-001's original role-management route.
- **New migration:** `0020` — purely additive (`CREATE TABLE staff_invites`), zero change to any existing table, zero backfill.
- **No modification to any existing, already-locked route** (`POST /api/admin/users/:id/role`, `PATCH /api/admin/staff/:id/branch`, `magicLink` plugin config) — this plan is additive-only at the route level; only 2 existing FILES gain new sibling handlers. **VALIDATE-confirmed by direct read of both files: zero existing line touched.**
- **File count:** ~13 new/changed files across 3 packages — COMPLEX-tier blast radius, matching the "new migration + auth-adjacent surface + 3 apps" framing.
- **VALIDATE recommendation:** run the 5-artifact high-risk execution evidence pack (`vc-risk-evidence-pack`) before EXECUTE, per SPEC Constraints ("VALIDATE should weigh the high-risk execution handoff… matching how auth/identity-class work is normally handled in this repo"). **Done — see `harness/` in this task folder and the Validate Contract below. `mustStopBeforeFinalize: true`; `review-decision.json` intentionally not yet created — pending human review.**
- **Coordination confirmed (VALIDATE):** `process/features/admin-dashboard/active/adm-010-customer-management_21-07-26/` is an unexecuted, already-PASS-validated sibling plan. Directly confirmed by reading its Touchpoints table: it creates an entirely separate `packages/api/src/routes/admin/customers.ts` and never touches `users.ts`, `staff.ts`, or `nav-config.ts` (ADM-011 doesn't touch `nav-config.ts` either). Zero file-level collision either direction; the plan's own recommendation to land ADM-011 before ADM-010 is a sequencing preference, not a hard dependency.
- **[SUPPLEMENT-added 21-07-26] Scope reopened — web accept surface added:** +3 files in
  `apps/admin` (1 new route, 1 new test, 1 edited file — `auth-client.ts` plugin addition), +1 line
  changed in `packages/api/src/index.ts` (CORS mount extension, reusing the existing `adminCors`
  object — zero new policy). Risk class UNCHANGED (still auth-adjacent/privilege-granting — the
  underlying `/staff-invite/start`/`/consume` mechanism is byte-identical; only its callable-origin
  surface widens from "none" to "the already-trusted admin origin"). Total blast radius: ~17
  new/changed files across 3 packages (was ~13). **This delta requires its own RE-VALIDATION pass
  before EXECUTE — see the Validate Contract Delta section below.**

---

## Innovate Note — token capture for `/staff-invite/start` (VALIDATE-CORRECTED, 21-07-26)

**This section replaces the plan's original Innovate Note, which contained two factual errors
caught during VALIDATE's Layer 2 review of Section D. The corrected mechanism below is what
EXECUTE must implement.**

**Why `/staff-invite/start` cannot reuse `dev-auto-login.ts`'s token map (unchanged from the
original plan — this reasoning was correct):** `storeDevLoginToken`/`takeDevLoginToken` in
`packages/api/src/lib/dev-auto-login.ts` is DELIBERATELY gated behind `DEV_AUTO_LOGIN_ENABLED`
(itself gated behind `NODE_ENV !== 'production'`) and hands out a token for exactly ONE
server-configured account — it must never become a general production token-relay mechanism.
`/staff-invite/start` needs the SAME "capture the token `sendMagicLink` was just asked to
deliver, and return it synchronously to a legitimate caller" mechanism, but for an ARBITRARY
invited email, in PRODUCTION.

**What the original Innovate Note got wrong (found by VALIDATE via a direct read of the
mint-side `signInMagicLink` handler, not just the verify-side handler the Feasibility
Confirmation section above already read):**

```js
// better-auth/dist/plugins/magic-link/index.mjs — mint side
const opts = { storeToken: "plain", allowedAttempts: 1, ...options };
async function storeToken(ctx, token) {
  if (opts.storeToken === "hashed") return await defaultKeyHasher(token);
  ...
  return token; // <-- default path: returns the RAW token unchanged
}
// inside signInMagicLink's handler:
const storedToken = await storeToken(ctx, verificationToken);
await ctx.context.internalAdapter.createVerificationValue({
  identifier: storedToken,             // = the RAW magic-link token (storeToken defaults to 'plain')
  value: JSON.stringify({ email, name: ctx.body.name }),
  expiresAt: ...,
});
```

`packages/api/src/lib/auth.ts`'s `magicLink({...})` config never sets `storeToken`, so it
defaults to `'plain'`. Two corrections to the original Innovate Note:

1. **`identifier` is the TOKEN, never the email.** A query filtering `WHERE identifier = email`
   (as the original Innovate Note described) matches **zero rows, always** — `/staff-invite/start`
   would 500/fail on every real request as originally specified.
2. **The token is stored PLAIN, not hashed**, given this config. The original Innovate Note's
   claim that the row is "keyed by a hashed token" was incorrect. This actually makes the
   corrected mechanism SIMPLER than originally thought: once the right row is found, `row.identifier`
   IS the usable magic-link token directly — no un-hashing step exists or is needed.

**Corrected mechanism (binding, EXECUTE must implement exactly this):**

Immediately after `await auth.api.signInMagicLink({ body: { email: invite.email, name: ... },
headers: {} })` resolves, query the `verification` table for the most recently created rows
(`SELECT * FROM verification ORDER BY created_at DESC LIMIT 10`), and in application code —
NOT in the SQL `WHERE` clause — `JSON.parse(row.value)` each candidate and take the **first
(most recent) row whose parsed `.email` matches `invite.email`**. That row's `identifier` column
is the raw magic-link token to return as `magicLinkToken` in the `200` response.

- Do NOT filter with `WHERE identifier = email` (wrong column semantics — see above).
- Do NOT attempt to hash-compare or un-hash `identifier` — it is already the plain token given
  this repo's `auth.ts` config.
- `LIMIT 10` (not `LIMIT 1`) is a defensive margin against ordinary concurrent traffic (other
  magic-link mints for other emails happening in the same window, e.g. concurrent customer
  sign-ins) between this handler's `signInMagicLink` call and its own read-back; matching on
  parsed `.email` rather than raw row position is what actually disambiguates, not the LIMIT
  size — 10 is a generous, cheap margin, not a correctness-load-bearing number.
- If zero of the most recent 10 rows match `invite.email` (should be structurally impossible
  immediately after a successful `signInMagicLink` call for that exact email) — treat as an
  invariant violation (500), matching how the `/consume` route's email cross-check treats its
  own structurally-impossible-mismatch case.
- This keeps `packages/api/src/lib/auth.ts` byte-unchanged, matching the plan's original Blast
  Radius claim — VALIDATE deliberately chose this over the lower-friction alternative (extending
  `sendMagicLink`'s callback with a correlation-id capture map, which would need an `auth.ts`
  edit) specifically to avoid widening this plan's already-locked Blast Radius.

**If, during EXECUTE, this approach proves awkward in practice** (e.g. `verification` row churn
is higher than expected in the target environment, making the 10-row window insufficient) —
document the fallback actually taken in the phase report before advancing past Section D, per the
plan's existing Phase Completion Rules.

---

## Web Accept Surface (apps/admin) — Scope Reopened 21-07-26

**Directive:** the user has explicitly reversed the plan's prior "mobile-only, no web accept"
Locked Decision this session. This section is the design for the ADDED `apps/admin` web accept
surface. It does not touch or rebuild anything in Sections A–G (all built + green, API 701/701) —
it is a pure addition sitting alongside the existing mobile accept flow, reusing the SAME backend
`/staff-invite/start` and `/staff-invite/consume` routes unmodified except for the CORS extension
below.

### H1 — New unguarded web route: `apps/admin/src/routes/staff-invite-accept.tsx`

Sibling to `login.tsx` (same directory, same "outside `(dashboard)`, no `requireAdmin`-equivalent
client guard" posture) — NOT nested under the `(dashboard)` route group, which is guarded by a
`beforeLoad` check against a real admin session (an invitee has no admin session at this point,
only eventually a plain-customer-then-promoted session).

Flow (mirrors `apps/mobile/src/app/(auth)/invite-accept.tsx`'s three-step shape exactly, adapted
for TanStack Start + a browser-cookie session instead of Expo + SecureStore):

1. Read `?token=` from the URL search params (TanStack Router's route search-param API — same
   convention as any other query-string-driven route in this app).
2. `POST {apiUrl}/staff-invite/start` with `{ token }` (plain unauthenticated `fetch`, mirrors the
   mobile screen's own plain-fetch step) → receive `{ magicLinkToken }`.
3. `authClient.magicLink.verify({ query: { token: magicLinkToken } })` — this is the ONE new client
   capability this delta requires (see H2 below); on success the browser's `HttpOnly` session
   cookie is set natively (no SecureStore equivalent needed — the browser does this automatically,
   same as the existing email/password `login.tsx` flow).
4. `POST {apiUrl}/staff-invite/consume` with `{ token }`, `credentials: 'include'` so the just-set
   cookie rides along (mirrors how `admin-staff-api.ts`'s existing fetch wrapper already sends
   credentials on every admin API call).
5. On success, `navigate({ to: '/' })` into the dashboard shell — the `(dashboard)` `beforeLoad`
   guard re-checks `GET /api/admin/me` against the now-real session and admits normally (unchanged,
   no guard code touched).

Held loading state (mirror the mobile screen's `'verifying'`-through-both-steps discipline): keep
a single "Signing you in…" state across BOTH the verify call and the consume call — do not show a
success/complete state after verify alone, for the same reason the mobile screen doesn't (the
promotion to staff-level role has not actually landed on the session until consume completes).

Include an "Open in the app" deep-link affordance: a plain link/button to
`jojopotato://staff-invite?token={token}` for staff who prefer accepting on mobile — informational
only, does not change any accept logic; this affordance exists because a staff invitee's PRIMARY
tool is often the mobile `(staff)` shell, but they may be reading the invite email on a desktop.

Error states: identical shape to the mobile screen — invalid/expired/consumed token (400/404/410
from `/start`), magic-link verify failure, consume failure (network/500) — each rendered as a
plain error card with a "Back to log in" link to `/login`.

### H2 — `apps/admin` authClient plugin addition

`apps/admin/src/features/auth/lib/auth-client.ts` currently has ZERO plugins beyond
`inferAdditionalFields`. Add `magicLinkClient()` (from `better-auth/client/plugins`, same package
`inferAdditionalFields` already comes from) to the `plugins` array so `authClient.magicLink.verify`
exists on the web client. This is the ONLY change to this file. Confirm during EXECUTE that adding
`magicLinkClient()` does not alter the existing email/password `authClient.signIn.email` call
`useAdminAuth()`'s `signIn` already uses (it should not — better-auth client plugins are additive,
each exposing its own namespaced methods; `magicLinkClient` does not touch `signIn.email`).

### H3 — CORS / trust-boundary extension (the security-sensitive part)

**Current state (confirmed by direct read of `packages/api/src/index.ts` line 268):**
`app.use('/staff-invite', staffInviteRouter);` — mounted with NO CORS middleware at all. This was
correct and sufficient for the mobile-only design (the Expo app sends no `Origin` header, so CORS
is a no-op for it either way — same as every other route in this file per the header comment at
line ~36). It is NOT sufficient for a browser caller: `apps/admin` (origin `ADMIN_WEB_ORIGIN`) must
be able to call `POST /staff-invite/start` (unauthenticated) and `POST /staff-invite/consume`
(session-gated, credentialed — needs the cookie to ride along) cross-origin, and a browser enforces
CORS on both the preflight and the real request.

**Locked design: extend the mount to use the SAME already-vetted `adminCors` object** (`const
adminCors = cors({ origin: [ADMIN_WEB_ORIGIN], credentials: true });`, defined once at the top of
`index.ts` and already mounted on `/api/auth` and `/api/admin`). Change the mount to:

```ts
app.use('/staff-invite', adminCors, staffInviteRouter);
```

Do **NOT** create a new, broader, or wildcarded CORS policy. Reusing the exact same single-origin,
credentialed policy object that already gates `/api/admin` and `/api/auth` means the trust posture
of this new surface is provably no wider than what already exists — same allowed origin, same
credentials flag, same object reference (not a re-declared copy that could silently drift).

**Trust-boundary analysis (for VALIDATE's security review — write this into the validate-contract,
do not just assert it here):**

- **`/staff-invite/start` is UNAUTHENTICATED but TOKEN-GATED.** The 256-bit
  (`crypto.randomBytes(32)`) invite token in the request body is the sole authorization signal. An
  attacker's browser calling this cross-origin with credentialed CORS enabled gains NOTHING it
  didn't already have — it has no valid token, so the call 404s/410s exactly as it would from any
  origin (CORS only controls whether the BROWSER lets JS *read* the response; the server-side
  behavior and the token-gate are unchanged regardless of Origin). The existing 10/min/IP rate
  limiter (Section D item 9) already caps brute-force token guessing; CORS exposure does not change
  that guess-rate. Adding a credentialed CORS header here does not grant a browser attacker a
  session or any new capability.
- **`/staff-invite/consume` is SESSION-gated (`requireSession`) + relies on `SameSite` cookie
  behavior + is now Origin-restricted to `ADMIN_WEB_ORIGIN` only via `adminCors`** — the SAME
  security posture every existing `/api/admin/*` route already has. CSRF analysis: a malicious
  third-party origin is NOT in the `adminCors` allowlist (`origin: [ADMIN_WEB_ORIGIN]`), so it
  cannot make a credentialed fetch that the browser will actually send with cookies attached in a
  CORS context requiring an explicit ACAO match; the only origin that can make a working
  credentialed call is `ADMIN_WEB_ORIGIN` itself — i.e., the invitee's own browser tab on the admin
  app, which is the intended and only caller. This exactly mirrors how every other `/api/admin`
  mutation route is already protected against cross-origin credentialed abuse — no new CSRF surface
  is introduced.
- **`trustedOrigins` (in `packages/api/src/lib/auth.ts`) already includes `ADMIN_WEB_ORIGIN`**
  (confirmed by direct read, line ~101) — this is the SEPARATE better-auth redirect/CSRF allowlist
  that governs `authClient.magicLink.verify`'s own internal `/api/auth/magic-link/verify` call
  (routed through `/api/auth`, already `adminCors`-mounted at line 63). No `trustedOrigins` change
  is needed for the web verify call to work cross-origin — it was already correctly configured for
  the existing email/password admin login flow, and magic-link verify rides the same `/api/auth`
  mount.

**Net scope of the CORS change:** one line in `index.ts` (`app.use('/staff-invite', ...)` gains
`adminCors` as a second middleware argument, mirroring the exact `app.use('/api/admin', adminCors,
requireAdmin(auth), adminRouter)` shape already on line 262). Zero new CORS policy object created;
zero change to `auth.ts`.

### H4 — Tests to add for this delta

- **Component/integration test** for the web accept page's start→verify→consume wiring — mirror
  how `add-staff-dialog.test.tsx` (Section E) or the mobile screen's own logic is tested at the
  seam boundary: mock `fetch`/`authClient.magicLink.verify`/the consume call, assert the 3-step
  sequence fires in order and the loading state holds across steps 3→4 (mirrors the VALIDATE-added
  Section F Agent-Probe row's intent, but automatable here since the web page's own step-sequencing
  logic — not real browser navigation — is what's under test).
- **CORS assertion, `packages/api`** — new integration test case(s) in
  `staff-invite.integration.test.ts` (or a new file) asserting: (a) a preflight `OPTIONS` request to
  `/staff-invite/start` with `Origin: ADMIN_WEB_ORIGIN` returns the expected
  `Access-Control-Allow-Origin`/`Access-Control-Allow-Credentials` headers; (b) a real `POST` request
  with that Origin gets the same headers on the actual response; (c) a request with a DISALLOWED
  Origin does NOT get an `Access-Control-Allow-Origin` header matching that origin (mirrors the
  existing ADM-001 `require-admin.integration.test.ts` preflight/real-request/no-Origin-mobile-path
  CORS test pattern — read that file before writing this one, per the plan's existing
  "reuse-proven-pattern" convention used throughout this plan).

These are added to Implementation Checklist Section H and Verification Evidence below.

## Implementation Checklist (Execution Checklist)

### Section A — Migration + schema (packages/api)

1. `packages/api/src/db/schema/staff_invites.ts` — new table: `id uuid pk default random`,
   `email varchar not null`, `intended_role user_role not null` (reuse existing `userRoleEnum`),
   `intended_branch_id uuid references branches.id` (nullable), `token_hash varchar not null`,
   `expires_at timestamp not null`, `consumed_at timestamp` (nullable), `created_by uuid not null
   references users.id`, `created_at timestamp default now not null`. Follow the existing
   camelCase-JS/snake_case-DB column convention (see `users.ts`'s `assignedBranchId: uuid('assigned_branch_id')`
   for the exact pattern to mirror).
2. Add `export * from './staff_invites';` to `packages/api/src/db/schema/index.ts`, section "7c —
   depends on users/branches", after the `users` export.
3. Run `pnpm --filter @jojopotato/api db:generate` to produce migration `0020_[name].sql` +
   snapshot. Confirm the generated SQL is a single additive `CREATE TABLE` with the FK constraints
   above, zero `ALTER` on any existing table.
4. Run `pnpm --filter @jojopotato/api db:migrate` locally, confirm clean apply.

### Section B — `users.ts` lookup route

5. Add `GET /users/lookup` to `users.ts` — register as `usersRouter.get('/users/lookup', ...)`
   (usersRouter mounts at the admin ROOT, matching how `POST /users/:id/role` is already
   registered as `usersRouter.post('/users/:id/role', ...)`; do NOT register as `.get('/lookup', ...)`,
   which would resolve to the wrong path): super_admin inline check → Zod query validation
   (`z.object({ email: z.email() })`) → exact-match select
   (`id, name, email, role`) → `{ user: row ?? null }`.
6. Test gate: `pnpm --filter @jojopotato/api test -- admin-users-lookup` (new
   `admin-users-lookup.integration.test.ts`) green before moving to Section C.

### Section C — `staff.ts` invite-create route

7. Add `POST /invite` to `staff.ts`: super_admin inline check → Zod body validation with
   `.superRefine` for the branch-only-for-staff rule → existing-account 409 check → `db.transaction`
   supersede-prior-invite + insert new row (token generated + hashed inside the transaction, never
   logged/sent until after the transaction commits) → post-commit Resend-or-log send.
8. Test gate: `pnpm --filter @jojopotato/api test -- admin-staff-invite-create` green.
   **Add one regression case beyond the plan's original Verification Evidence table** (VALIDATE
   adversarial-validation finding): create invite A for an email, then invite B for the SAME
   email, confirm A's row is superseded (`consumed_at` set), then attempt to accept A's original
   token via `/staff-invite/consume` and confirm it is rejected the same way a normal replay is.

### Section D — `staff-invite.ts` router + mounts

9. **[SUPPLEMENT-added, 21-07-26]** New `packages/api/src/middleware/rate-limit.ts`: a small
   hand-rolled fixed-window limiter (~15-20 lines, NO new npm dependency —
   `express-rate-limit` was considered and rejected as unnecessary weight for a single call
   site) — `Map<string, { count: number, windowStart: number }>` keyed by client IP, exported
   as `rateLimit({ windowMs, max })` returning an Express middleware. On exceed: `res.status(429).json({ error: 'Too many requests' })`.
   IP source: `req.ip` (Express's own `remoteAddress`-derived resolution). This codebase sets no
   `app.set('trust proxy', ...)` anywhere (confirmed by direct grep — zero hits) and has zero
   existing rate-limiting precedent to follow, so `req.ip` reflects the direct TCP peer, NOT any
   `X-Forwarded-For` header (correct and safe for the CURRENT single-instance, no-reverse-proxy
   deployment — see `admin-api-same-origin-reverse-proxy_NOTE_20-07-26.md` for the standing note
   that a reverse-proxy layer does not exist yet). Document this honestly in a code comment: if a
   reverse proxy is ever placed in front of this API, `trust proxy` must be configured AND this
   limiter's IP source revisited, or every request will appear to share the proxy's IP (either
   over-limiting everyone, or under-limiting a real attacker behind it) — do not assume
   `X-Forwarded-For` is trustworthy without that config. Also document: in-memory state is
   per-process and resets on restart/redeploy, and is NOT shared across instances if this API
   ever runs multi-instance — acceptable for the current single-instance deployment; the
   upgrade path (shared store / Redis / swap to `express-rate-limit` with a shared store) is
   named in-comment, not built now (YAGNI). **[VALIDATE-added, re-validate pass 21-07-26]** Also
   export a test-only `__resetRateLimitStoreForTests()` function from this module (a plain named
   export, no extra guard needed) so integration tests can clear the shared in-memory Map between
   test cases — without this, every test case in `staff-invite.integration.test.ts` shares ONE
   module-cached Map instance (vitest does not reset module state between tests in the same file
   by default), so the dedicated rate-limit-hammering test (item 12 below) could poison the
   limiter's state for any `/staff-invite/start` call in a test that runs afterward in the same
   file within the same 60s window — a real test-flakiness risk this re-validate pass found in the
   rate-limit addition itself, not present before the supplement was added.
10. New `packages/api/src/routes/staff-invite.ts`: `POST /start` (per Public Contracts, using the
   **VALIDATE-corrected mechanism** in the Innovate Note above — query the `verification` table's
   most recent 10 rows, parse `value` in application code, match on `.email`, read `identifier`
   directly as the token; do NOT filter `WHERE identifier = email` and do NOT attempt to un-hash
   `identifier`), `POST /consume` (session-gated — `requireSession` applied at mount, matching
   `cart.ts`'s posture).
11. Mount in `index.ts`: `app.use('/staff-invite/start', staffInviteRouter)` is WRONG shape — mount
    the whole router at `/staff-invite` with `/start` unauthenticated and `/consume` individually
    wrapped with `requireSession` INSIDE the router file (NOT at the `app.use` mount, since `/start`
    must stay unauthenticated while `/consume` must not — asymmetric guard, cannot use a single
    mount-level middleware the way `/api/staff`/`/cart` do). Add the `GET /staff-invite/native`
    redirect immediately after the existing `/magic-link/native` handler in `index.ts`, same shape,
    targeting `(auth)/invite-accept`. **[SUPPLEMENT-added, 21-07-26]** apply the new
    `rateLimit({ windowMs: 60_000, max: 10 })` middleware to the `/start` handler specifically
    (e.g. `staffInviteRouter.post('/start', rateLimit({...}), handler)`) — NOT at the router's
    `app.use` mount, so `/consume` (session-gated, lower priority per this supplement's scope) is
    unaffected.
12. Test gate: `pnpm --filter @jojopotato/api test -- staff-invite` (new
    `staff-invite.integration.test.ts` covering AC8–AC13, **[SUPPLEMENT-added]** plus a new rate-limit
    case: hammer `/staff-invite/start` past the 10/min limit, assert 429, and assert a subsequent
    valid request under the limit still succeeds) green. **[VALIDATE-added, re-validate pass
    21-07-26]** Call `__resetRateLimitStoreForTests()` in a `beforeEach`/`afterEach` for this file
    (or at minimum immediately before and after the dedicated rate-limit case) so the hammering
    case cannot cause unrelated AC8–AC13 cases in the same file to intermittently fail with 429.

### Section E — `apps/admin` Path 1 (promote) UI

13. `admin-staff-api.ts`: add `lookupUserByEmail(email): Promise<AdminUserLookupResult | null>` and
    `createStaffInvite(payload): Promise<AdminStaffInviteSummary>`.
14. `use-admin-staff.ts`: add hooks — lookup as a manual-trigger (not auto-fetching on mount;
    triggered by the dialog's "Look up" button) `useMutation`-shaped call (simpler than a
    conditionally-enabled `useQuery` for a one-shot lookup, matches how this codebase already
    prefers mutations for on-demand server calls); `useCreateStaffInvite()` as a real `useMutation`
    invalidating `['staff']` on success (a newly-invited user isn't in the roster yet, so no
    invalidation is strictly needed, but keep symmetry with `useCreateStaffMember`-style patterns
    in case caching assumptions change later — document as a no-op invalidation, not a bug).
15. New `add-staff-dialog.tsx`: internal step state (`'email' | 'found-customer' |
    'already-staff' | 'invite'`), reusing `FormDialog` (size `default`) — mirrors
    `deal-create-wizard.tsx`'s internal-step pattern (read that file's step-transition shape before
    writing this).
16. Wire "+ Add staff" button into `apps/admin/src/routes/(dashboard)/staff.index.tsx` (the list
    screen — VALIDATE-confirmed exact file; `staff.tsx` is only the `<Outlet/>` layout), gated on
    `useAdminAuth().role === 'super_admin'` (client-side cosmetic gate; `useAdminAuth` confirmed at
    `apps/admin/src/features/auth/hooks/use-admin-auth.ts`, exposes `role` — matches
    `staff.index.tsx`'s existing `isSuperAdmin` derivation, which already reads this exact hook).
17. Test gate: `pnpm --filter @jojopotato/admin test -- add-staff-dialog` green +
    `pnpm --filter @jojopotato/admin typecheck` + `pnpm --filter @jojopotato/admin build` clean.

### Section F — `apps/mobile` accept-flow screen

18. New `apps/mobile/(auth)/invite-accept.tsx` (thin `magic-link.tsx` variant): read `token` param
    from `?token=` (bounced in by `/staff-invite/native`) → `POST {apiUrl}/staff-invite/start` with
    `{ token }` (plain fetch, unauthenticated) → on success, receive `magicLinkToken` → call
    `authClient.magicLink.verify({ query: { token: magicLinkToken } })` (lands the real session in
    SecureStore) → on success, `POST {apiUrl}/staff-invite/consume` with `{ token }` (now
    session-carrying via `apiRequest`/`authClient`'s own fetch, matching how session-gated routes
    are called elsewhere) → on success, `router.replace('/(staff)')` (the root gate would route
    there anyway once the session refreshes, but an explicit replace avoids a flash of the wrong
    shell). On any step failing: same error-card UI pattern as `magic-link.tsx`.
    **VALIDATE-added instruction:** keep the screen in its `'verifying'`-equivalent loading phase
    across BOTH the `authClient.magicLink.verify` call AND the subsequent `/staff-invite/consume`
    call — do not show a success/complete state after verify alone. This does not prevent the root
    `Stack.Protected` gate in `_layout.tsx` from re-evaluating the instant the session updates
    (that gate lives in a different component and cannot be blocked from this screen), but it
    keeps this screen's OWN UI state honest (still "signing you in…") for the brief window between
    verify landing and consume completing, and `router.replace('/(staff)')` after consume succeeds
    corrects any transient wrong-shell flash. Confirm the actual on-device behavior during the
    Section F Agent-Probe walkthrough (new row added to Verification Evidence below) and document
    what was actually observed in the phase report — this is a real, previously-unflagged
    navigation-timing interaction (see Validate Contract), not a hypothetical.
19. Confirm Expo Router auto-registers the new route file — run `expo start` once (per the
    project's own typed-routes convention) then stop it, before `tsc --noEmit`.
20. Test gate: `pnpm --filter @jojopotato/mobile typecheck` clean. No RN component/E2E runner
    exists for screen-level flows (standing project-wide gap) — this screen's logic is exercised at
    the API layer by Section D's tests (AC10/AC11/AC13); the screen's on-device navigation behavior
    is exercised by the new Agent-Probe row added to Verification Evidence below.

### Section H — `apps/admin` web accept surface **[SUPPLEMENT-added 21-07-26]**

19a. `packages/api/src/index.ts`: change `app.use('/staff-invite', staffInviteRouter)` to
   `app.use('/staff-invite', adminCors, staffInviteRouter)` — one-line change, reuses the existing
   `adminCors` const declared at the top of the file. See `## Web Accept Surface` → H3.
19b. `apps/admin/src/features/auth/lib/auth-client.ts`: add `magicLinkClient()` to the `plugins`
   array (import from `better-auth/client/plugins`, same module `inferAdditionalFields` already
   comes from). No other change to this file.
19c. New `apps/admin/src/routes/staff-invite-accept.tsx`: unguarded route per H1 — read `?token=`
   → `POST /staff-invite/start` → `authClient.magicLink.verify` → `POST /staff-invite/consume` →
   `navigate({ to: '/' })`. Held loading state across verify+consume. Error card states matching
   the mobile screen's shape. "Open in the app" deep-link affordance
   (`jojopotato://staff-invite?token=...`).
19d. New `staff-invite-accept.test.tsx`: component test asserting the 3-step call sequence and the
   held-loading-state behavior (mock fetch + `authClient.magicLink.verify` + the consume call).
19e. New CORS integration test case(s) in `packages/api` (extend `staff-invite.integration.test.ts`
   or add a sibling file): preflight OPTIONS + real-request ACAO/credentials headers for
   `ADMIN_WEB_ORIGIN`, and absence of matching ACAO for a disallowed origin — mirror
   `require-admin.integration.test.ts`'s existing CORS test pattern (read that file first).
19f. Test gate: `pnpm --filter @jojopotato/admin test -- staff-invite-accept` +
   `pnpm --filter @jojopotato/admin typecheck` + `pnpm --filter @jojopotato/admin build` clean;
   `pnpm --filter @jojopotato/api test -- staff-invite` green (incl. new CORS cases).

### Section G — Full regression + format

21. `pnpm --filter @jojopotato/api test` (full suite, confirm zero regressions on
    `require-admin.integration.test.ts`, `admin-users.integration.test.ts`, existing staff tests).
22. `pnpm typecheck` (root, all packages).
23. `pnpm format:check` (fix any Prettier drift on touched files before finalizing).

---

## Acceptance Criteria

Mirrors the SPEC's 14 numbered ACs verbatim (see SPEC for full prose) — reproduced here as
testable pass/fail statements this plan's Verification Evidence section proves:

1. Email lookup returns exact-match user (id/name/email/role) or a clear not-found result — no 500.
2. Promote flow (lookup → role route → branch route for `staff` targets) produces the identical
   end state as calling the two existing routes directly, in the same order.
3. Promoting to `admin`/`super_admin` never requires or writes a branch.
4. Looking up/attempting to promote an already-staff-level account is a no-op — zero mutation,
   distinguishable "already staff-level" response.
5. The entire add-staff surface (lookup, promote, invite-create) is super_admin-only — 403 for a
   plain `admin`, 401 for unauthenticated.
6. Self-escalation stays impossible on the promote path (existing guard order unmodified).
7. The add-staff UI walkthrough (lookup → promote → branch assignment; already-staff / not-found
   states) is exercised in a real browser (Agent-Probe, standing `apps/admin` no-E2E-runner gap).
8. Invite-create for an unregistered email generates a single-use, expiring token recording the
   submitted role (+ branch when `staff`).
9. Invite-create for an email that already has an account is rejected — no invite row is created.
10. Accepting a valid, unexpired, unconsumed invite provisions EXACTLY the invite's stored
    role/branch (never invitee-supplied values) and marks it consumed — a second accept is rejected.
11. An expired invite token is rejected at accept — zero account mutation.
12. Invite-create is super_admin-only (matches AC5); invite-accept is reachable without an admin
    session, gated entirely by valid-token possession.
13. When no real email provider is configured, the invite link is obtainable via the existing
    dev-log fallback, so the full mechanism is testable without live email infra.
14. A real invite email arrives and its link works from a real device/browser (Agent-Probe /
    Known-Gap — blocked on the standing external Resend-account prerequisite, not this phase's code).

15. **[SUPPLEMENT-added 21-07-26]** The `apps/admin` web accept page completes the identical
    start→verify→consume sequence as the mobile screen and lands the invitee in the dashboard shell
    — the web accept surface is a genuine alternative to the mobile-only flow, not a stub.
16. **[SUPPLEMENT-added 21-07-26]** `/staff-invite/start` and `/staff-invite/consume` are callable
    cross-origin, with credentials, from `ADMIN_WEB_ORIGIN` (browser CORS headers present); a
    disallowed origin does NOT receive a matching `Access-Control-Allow-Origin` header.

Plus one binding non-numbered constraint proven alongside the ACs: re-checking the target's
CURRENT role at consume time (graceful no-op if already staff-level via a race/other path).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Lookup exact-match found + not-found (no 500) | Fully-Automated | AC1 |
| Promote-flow end-to-end matches direct-route-call end state (role + branch) | Fully-Automated | AC2 |
| Promote-to-admin/super_admin omits/ignores branch | Fully-Automated | AC3 |
| Lookup/promote-attempt on already-staff-level user is a no-op, distinguishable response | Fully-Automated | AC4 |
| 401/403 matrix across lookup, invite-create, (non-)super_admin, unauthenticated | Fully-Automated | AC5 |
| Self-escalation rejected on the promote path (own id as target) | Fully-Automated | AC6 |
| Admin-dashboard UI walkthrough: lookup → promote → branch assignment, already-staff / not-found states | Agent-Probe | AC7 |
| Invite-create persists token record with submitted role/branch, future expiry, `consumed=false` | Fully-Automated | AC8 |
| Invite-create for an email with an existing account rejected, no row written | Fully-Automated | AC9 |
| Accept with smuggled role/branch in payload ignored; only invite's stored values applied; second accept rejected | Fully-Automated | AC10 |
| Expired token rejected at accept, zero account mutation | Fully-Automated | AC11 |
| Invite-create 401/403 matrix; invite-accept succeeds on token validity alone, rejects tampered/guessed token | Fully-Automated | AC12 |
| Logged invite link (RESEND_API_KEY unset) captured in test, drives AC10 through captured token | Fully-Automated | AC13 |
| Real inbox delivery + real-device link works | Agent-Probe / Known-Gap | AC14 (blocked on external Resend provisioning — standing prereq, not new debt) |
| Re-check-current-role-at-consume no-op race (target already promoted via another path before consume) | Fully-Automated | Locked "re-check the target's CURRENT role at consume time" constraint (not a numbered AC but explicitly required by the task) |
| `/staff-invite/consume` write-shape matches a direct two-route call (role write, then branch write, same order) | Fully-Automated | Internal-consistency check for the ONE duplicated-write exception documented in Public Contracts |
| **[VALIDATE-added]** Invite superseded-by-a-newer-invite for the same email: original token rejected at accept the same way a replay is | Fully-Automated | Adversarial-validation finding (see Section C checklist item 8) — not a numbered SPEC AC but a locked "single-live-invite-per-email" behavior |
| **[VALIDATE-added]** Mobile `invite-accept.tsx` full on-device walkthrough: token receipt → `/start` → `authClient.magicLink.verify` → `/staff-invite/consume` → lands in `(staff)` shell; explicitly observe and document whether the root `Stack.Protected` gate produces a visible flash through `(onboarding)`/`(tabs)` before consume completes | Agent-Probe | New — the plan's original Section F test gate was typecheck-only with no behavioral walkthrough defined; VALIDATE found a real navigation-timing interaction (see Validate Contract) that only an on-device walkthrough can confirm |
| **[SUPPLEMENT-added]** `POST /staff-invite/start` rate-limited at 10 req/min/IP: hammer past the limit → assert 429; a subsequent valid request under the limit still succeeds | Fully-Automated | Addresses the accepted residual in `harness/adversarial-validation.json`'s last scenario (token-validity probing / mail-bomb-adjacent hammering of `/start`) — not a numbered SPEC AC, but a locked mitigation added at the user's explicit request during VALIDATE |

| **[SUPPLEMENT-added]** `apps/admin` web accept page: start→verify→consume sequence completes, lands in dashboard shell; held-loading-state across verify+consume | Fully-Automated (component-level) + Agent-Probe (real browser) | AC15 |
| **[SUPPLEMENT-added]** CORS: preflight + real-request ACAO/credentials headers present for `ADMIN_WEB_ORIGIN`; absent for a disallowed origin | Fully-Automated | AC16 |

### Failing stubs (TDD-first, for the Fully-Automated rows above)

```
test("GET /api/admin/users/lookup?email= returns exact-match user or null", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC1 lookup found/not-found")
})
test("promote flow produces identical end state to direct route calls", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC2 promote end-to-end")
})
test("promote to admin/super_admin never requires or writes a branch", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC3 branch-only-for-staff")
})
test("lookup/promote of an already-staff-level user makes zero mutations", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC4 already-staff no-op")
})
test("lookup, invite-create 401/403 matrix", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC5 authz boundary")
})
test("promote path rejects self-escalation", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC6 self-escalation")
})
test("invite-create persists correct token record with future expiry and unconsumed state", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC8 invite-create persistence")
})
test("invite-create rejects an email that already has an account", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC9 existing-account reject")
})
test("accept ignores smuggled role/branch payload; second accept rejected", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC10 accept integrity + single-use")
})
test("expired invite token rejected at accept with zero mutation", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC11 expiry")
})
test("invite-create authz matrix; invite-accept authz is token-only", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC12 dual authz model")
})
test("dev-log fallback captures invite link and the captured token completes AC10's flow", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC13 send-or-log mechanism proof")
})
test("consume no-ops gracefully when target already staff-level via another path", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: re-check-role-at-consume race")
})
test("a superseded invite's original token is rejected at accept the same way a replay is", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: VALIDATE-added supersede-then-old-token-rejected case")
})
test("POST /staff-invite/start is rate-limited at 10 req/min/IP — hammering returns 429, valid requests under the limit still succeed", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: SUPPLEMENT-added rate-limit on /staff-invite/start")
})
test("apps/admin staff-invite-accept page completes start->verify->consume and navigates to dashboard", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC15 web accept surface")
})
test("/staff-invite/start and /staff-invite/consume return correct CORS headers for ADMIN_WEB_ORIGIN, none for a disallowed origin", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC16 CORS extension")
})
```

---

## Test Gate Commands

```
# packages/api
docker compose up -d
pnpm --filter @jojopotato/api db:migrate
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/api typecheck

# apps/admin
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/admin build
# [SUPPLEMENT-added 21-07-26] staff-invite-accept.test.tsx runs as part of the above `test` command

# apps/mobile
pnpm --filter @jojopotato/mobile typecheck
# (no RN component/E2E runner covers screen-level flows — standing gap, see Test Infra Improvement Notes)

# root
pnpm typecheck
pnpm format:check
```

---

## Test Infra Improvement Notes

- The standing `apps/mobile` no-RN-runner-for-screen-flows gap is already tracked project-wide,
  not new debt introduced by this plan.
- **[VALIDATE-added]** This plan's `/staff-invite/start` mechanism reads the `verification` table
  by scanning its most recent 10 rows and parsing JSON in application code (see the corrected
  Innovate Note) rather than an indexed equality filter, because `identifier` is not the email.
  If EXECUTE/EVL finds this approach flaky under concurrent test-suite load (e.g. the vitest
  integration suite running many magic-link-adjacent tests in parallel against a shared test DB —
  see the existing standing note in `process/features/admin-dashboard/backlog/
  api-test-db-concurrency-guard_NOTE_17-07-26.md`), widen the `LIMIT` or add a short retry/backoff,
  and record the concrete finding in the phase report.
- **[VALIDATE-added]** Section F's mobile screen previously had no Agent-Probe test gate at all
  (typecheck-only) — a new Agent-Probe row was added to Verification Evidence above to close this.

---

## High-Risk Execution Handoff Note

This plan touches the auth-adjacent/privilege-granting trust boundary (role escalation +
unauthenticated-token-driven account provisioning with a pre-set role). Per SPEC Constraints and
this repo's standing convention, VALIDATE should generate the 5-artifact high-risk evidence pack
(`vc-risk-evidence-pack`) before EXECUTE is authorized, matching how ADM-001 (original role route)
and ADM-008 Fix 6 (money-path) were both handled.

**VALIDATE status:** Done. See `harness/{risk-gate,context-snippets,verification,
adversarial-validation}.json` in this task folder, and the `## Validate Contract` section below.
`review-decision.json` is intentionally NOT created — an explicit human APPROVE/REJECT decision is
required before EXECUTE is authorized (manual-first, no implicit approval).

---

## Phase Completion Rules

- **CODE DONE**: all Section A–G checklist items complete, all Fully-Automated gates green
  (`packages/api` full suite incl. new lookup/promote/invite/consume tests, `apps/admin`
  test+typecheck+build, `apps/mobile` typecheck, root `pnpm typecheck` + `pnpm format:check`),
  zero regressions on `require-admin.integration.test.ts` and existing staff/users tests.
- **VERIFIED**: CODE DONE, plus the 5-artifact high-risk evidence pack
  (`vc-risk-evidence-pack`) has been generated and user-reviewed (this is auth-adjacent,
  privilege-granting surface — see High-Risk Execution Handoff Note), PLUS the AC7 Agent-Probe
  admin-dashboard UI walkthrough (lookup → promote → branch assignment; already-staff /
  not-found states) has been performed and passed by the user, PLUS the VALIDATE-added mobile
  `invite-accept.tsx` Agent-Probe walkthrough has been performed and its actual navigation
  behavior documented. AC14 (real-inbox delivery) is an explicit, accepted Known-Gap on the
  standing external Resend prerequisite and does NOT block VERIFIED status — it is tracked
  separately, not new debt. The admin/super_admin-invite-has-no-web-access gap (see Validate
  Contract Known Gaps) is an explicit, accepted Known-Gap and does NOT block VERIFIED status.
- Do not mark this plan `✅ VERIFIED` on green automated gates alone — the auth-adjacent risk
  class and the mandatory Agent-Probe walkthroughs are both required per SPEC Constraints.
- **UPDATE PROCESS status (21-07-26): CODE DONE + committed + EVL-green + both human approvals
  recorded (Sections A–G and Section H separately) — still NOT VERIFIED.** The 3 owed walkthroughs
  (AC7, mobile on-device, AC15 real-browser) have not been performed. Task folder correctly stays
  in `active/`, not archived.
- If EXECUTE or EVL surfaces a gap in the `/staff-invite/start` token-capture mechanism (see
  "Innovate Note" above) that the VALIDATE-corrected `verification`-table read cannot cleanly
  resolve, document the fallback actually taken in the phase report before advancing past
  Section D.
- **EXECUTE MUST NOT BEGIN until a human has reviewed `harness/` and the Validate Contract below
  and the plan's Status line has been updated from CONDITIONAL** (`mustStopBeforeFinalize: true`
  — see Validate Contract).

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/adm-011-add-staff_21-07-26/adm-011-add-staff_PLAN_21-07-26.md`
2. **Last completed phase or step:** VALIDATE run 21-07-26, RE-VALIDATED same day after a
   plan-validate-fix supplement — Gate: PASS, see `## Validate Contract` below. First pass found 1
   FAIL (corrected in-place as a Plan Update, Section D mechanism fix) and 2 CONCERNs requiring
   human acceptance plus 1 previously-accepted residual the user chose to fix instead
   (rate-limiting on `/staff-invite/start`). This re-validate pass: (a) confirmed the rate-limit
   supplement (Section D item 9, Public Contracts 429 entry, new test gate) is sound, fixing one
   new non-blocking test-isolation finding via a further Plan Update (Section D items 9 and 12);
   (b) recorded the user's explicit acceptance of the 2 previously-open CONCERNs (admin web-access
   gap — ship as-is, deferred to issue #142; mobile navigation-race — accepted as an Agent-Probe
   check). SPEC was already locked (`adm-011-add-staff_SPEC_21-07-26.md`, same folder). INNOVATE
   decisions were locked inline in the plan-authoring instruction (no separate `*_INNOVATE_*.md`
   file exists in this task folder — the Decision Summary was delivered directly in the planning
   prompt and is reproduced verbatim under "Locked Decisions" above).
3. **Validate-contract status:** WRITTEN — Gate: PASS (see below). `mustStopBeforeFinalize: true`
   is satisfied — see `harness/review-decision.json` (APPROVE). EXECUTE is authorized.
4. **Supporting context files loaded during PLAN + VALIDATE:** `process/context/all-context.md`,
   `process/features/admin-dashboard/active/adm-011-add-staff_21-07-26/adm-011-add-staff_SPEC_21-07-26.md`,
   `packages/api/src/lib/auth.ts`, `packages/api/src/routes/admin/staff.ts`,
   `packages/api/src/routes/admin/users.ts`, `packages/api/src/index.ts`,
   `packages/api/src/db/schema/{users,verification,index}.ts`,
   `packages/api/drizzle/meta/_journal.json` (confirmed latest migration = `0019_rainy_tombstone`),
   `packages/api/src/routes/admin/lib/errors.ts`, `packages/api/src/lib/dev-auto-login.ts`,
   `packages/api/src/lib/require-admin.ts`, `packages/api/src/middleware/require-session.ts`,
   `packages/api/src/routes/admin/index.ts`, `packages/api/src/routes/cart.ts`,
   `packages/api/src/routes/lib/serializers.ts`,
   `apps/mobile/src/app/(auth)/magic-link.tsx`, `apps/mobile/src/app/_layout.tsx`,
   `apps/mobile/src/features/auth/lib/auth-client.ts`,
   `apps/admin/src/components/form-dialog.tsx`, `apps/admin/src/routes/login.tsx`,
   `apps/admin/src/routes/(dashboard)/staff{.tsx,.index.tsx}`,
   `apps/admin/src/features/staff/{lib/admin-staff-api.ts,components/staff-list.tsx,hooks/use-admin-staff.ts}`,
   `apps/admin/src/features/auth/hooks/use-admin-auth.ts`,
   `process/context/tests/all-tests.md`,
   `process/features/admin-dashboard/active/adm-010-customer-management_21-07-26/adm-010-customer-management_PLAN_21-07-26.md`,
   `node_modules/.pnpm/better-auth@1.6.23.../dist/plugins/magic-link/index.mjs` (BOTH the verify-side
   handler, read during PLAN, AND the mint-side `signInMagicLink` handler, read during VALIDATE —
   the latter is what surfaced the Innovate Note correction).
5. **Next step for a fresh agent picking up mid-execution:** COMPLETE — Sections A–H are all CODE
   DONE and committed (`0bf8365`), EVL-confirmed green (API 709, admin 177). The Section H delta
   validate pass ran and recorded Gate: PASS, and its human APPROVE decision is on record at
   `harness/review-decision-delta.json` (distinct from the Sections A–G approval,
   `harness/review-decision.json`). Remaining follow-up before `✅ VERIFIED`: the 3 Agent-Probe
   walkthroughs (AC7 admin UI, mobile `invite-accept.tsx` on-device incl. the navigation-race, AC15
   web accept real-browser) — code is done, these are manual verification only.

## Validate Contract

Status: PASS
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl
supersedes: 2026-07-21 (outer-pvl) — re-validated same-day after the plan-validate-fix supplement
(rate-limit addition on `/staff-invite/start`) was applied; this contract replaces the prior
CONDITIONAL contract in full.

Parallel strategy: sequential
Rationale: this pass is a scoped re-validate of ONE supplement (Section D item 9's rate-limit
addition) plus confirmation that the plan's 2 other previously-open CONCERNs were resolved by
explicit user decision (not re-litigated). A single focused review was sufficient — no
cross-agent fan-out was needed since the change is confined to one section and does not touch the
already-independently-verified surfaces (privilege-grant integrity, hashed tokens, atomic
consume, mount isolation, reused-routes-unmodified all re-confirmed unchanged, not re-derived).
The original PLAN-time Layer 1/Layer 2 fan-out (4 dimension agents + 7 section agents,
parallel-subagents, signal count 2/7) remains valid for everything outside Section D and is not
superseded in substance — only the contract's terminal Status/Gate/Accepted-by fields change.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Email lookup exact-match found/not-found, no 500 | Fully-Automated | `admin-users-lookup.integration.test.ts` | A |
| AC2 | Promote flow end-state matches direct two-route call | Fully-Automated | `admin-staff-invite-create.integration.test.ts` (promote-flow section) | A |
| AC3 | Promote to admin/super_admin omits/ignores branch | Fully-Automated | same suite | A |
| AC4 | Already-staff-level lookup/promote is a no-op | Fully-Automated | same suite | A |
| AC5 | Entire surface is super_admin-only (401/403 matrix) | Fully-Automated | same suite + `staff-invite.integration.test.ts` | A |
| AC6 | Self-escalation stays impossible on promote path | Fully-Automated | same suite (regression + new own-id case) | A |
| AC7 | Admin UI walkthrough (lookup→promote→branch, already-staff/not-found) | Agent-Probe | manual browser walkthrough | D |
| AC8 | Invite-create persists correct token record | Fully-Automated | `admin-staff-invite-create.integration.test.ts` | A |
| AC9 | Invite-create rejects existing-account email | Fully-Automated | same suite | A |
| AC10 | Accept ignores smuggled payload; second accept rejected | Fully-Automated | `staff-invite.integration.test.ts` | A |
| AC11 | Expired token rejected, zero mutation | Fully-Automated | same suite | A |
| AC12 | Invite-create authz matrix; accept is token-only authz | Fully-Automated | same suite | A |
| AC13 | Dev-log fallback captures invite link, drives AC10 | Fully-Automated | same suite | A |
| AC14 | Real inbox delivery, real-device link | Agent-Probe / Known-Gap | manual, blocked on external Resend prereq | C |
| (unnumbered) | Re-check-current-role-at-consume no-op race | Fully-Automated | `staff-invite.integration.test.ts` | A |
| (unnumbered) | `/consume` write-shape matches direct two-route call | Fully-Automated | same suite | A |
| VALIDATE-added | Superseded invite's old token rejected at accept | Fully-Automated | `admin-staff-invite-create.integration.test.ts` (new case, Section C item 8) | B |
| VALIDATE-added | Mobile `invite-accept.tsx` on-device walkthrough incl. navigation-race observation | Agent-Probe | manual on-device walkthrough | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle, once EXECUTE lands the code)
- B — fixed in this plan (gate added by this plan's checklist, VALIDATE-added Section C item 8)
- C — deferred to a named later item (Resend account provisioning — external prerequisite, not a plan)
- D — backlog test-building stub (named residual; Agent-Probe walkthroughs owed by the user post-EXECUTE)

C-4 reconciliation: all `strategy:` values above are Fully-Automated or Agent-Probe — no Known-Gap
strategy value is used; AC14's Known-Gap classification is carried via gap-resolution C (deferred,
named, external prerequisite), matching the plan's own explicit charter for that AC.

Legacy line form (retained for existing validate-contract consumers):
- `packages/api`: Fully-automated: `pnpm --filter @jojopotato/api test` (after `docker compose up -d` + `db:migrate`) | hybrid: none | agent-probe: none | known-gap: none
- `apps/admin` (Path 1 UI): Fully-automated: `pnpm --filter @jojopotato/admin test -- add-staff-dialog` + `typecheck` + `build` | agent-probe: AC7 real-browser walkthrough
- `apps/mobile` (accept screen): Fully-automated: `pnpm --filter @jojopotato/mobile typecheck` | agent-probe: VALIDATE-added on-device walkthrough (navigation-race observation) | known-gap: AC14 real-inbox delivery (external Resend prereq)

Dimension findings:
- Infra fit: PASS — migration `0020` confirmed additive-only, correctly sequenced behind `0019_rainy_tombstone` (directly read `_journal.json`). Route mounting mechanically sound (directly read `index.ts`, `admin/index.ts`, `cart.ts` for the asymmetric-guard-inside-router precedent). One precision correction applied to plan text (route registration path for the lookup handler).
- Test coverage: CONCERN → fixed in plan — Section F (mobile accept screen) originally had only a typecheck gate with no behavioral test; a new Agent-Probe row was added to Verification Evidence. One additional Fully-Automated regression case (supersede-then-old-token-rejected) was added to Section C, closing an adversarial-validation gap. All 14 SPEC ACs + 2 unnumbered locked constraints + 2 VALIDATE-added items are now mapped to a concrete gate.
- Breaking changes: PASS — directly read both `users.ts` and `staff.ts` in full; confirmed zero existing line is touched by this plan's checklist (only new sibling handlers added to each file). Zero schema change to any existing table. Zero collision with the sibling ADM-010 plan (directly read its Touchpoints table — separate `customers.ts` file, never touches `users.ts`/`staff.ts`/`nav-config.ts`).
- Security surface: CONCERN → 1 fixed in plan, 2 open, requiring explicit acceptance — (1) FIXED: the `/staff-invite/start` token-capture mechanism as originally described in the Innovate Note was factually broken (would return zero rows on every request); corrected via direct source read of the mint-side `signInMagicLink` handler and applied as a Plan Update above. (2) OPEN CONCERN: a real navigation-race exists between `authClient.magicLink.verify()` landing a session and the root `Stack.Protected` gate re-evaluating BEFORE `/staff-invite/consume` completes — no security/data-integrity defect (the consume call still completes; role is never wrong), but a real, previously-unflagged UX interaction requiring on-device confirmation; Execute-Agent Instruction + new Agent-Probe gate added. (3) an `admin`/`super_admin` invitee (D2-permitted target role) can accept via mobile but has no way to sign into `apps/admin`'s web dashboard through any built UI (email/password-only login, zero signup/reset screens) — pre-existing architectural gap (ADM-001), not introduced by this plan's code, but this plan's Path 2 is the first workflow to default-produce this state for a brand-new account. Filed as `process/features/admin-dashboard/backlog/adm-011-admin-invite-no-web-access_NOTE_21-07-26.md` (NEW PLAN REQUIRED, tracked as issue #142). **[RESOLVED, re-validate pass 21-07-26]: the user explicitly chose to SHIP ADM-011 as-is and defer the fix to the filed follow-up — accepted as a documented, non-blocking Known-Gap, not requiring further plan changes.** Privilege-grant integrity itself (super_admin-only enforcement at every entry point, invitee never supplies own role/branch, atomic single-use consume, hash-at-rest token, 7-day expiry, current-role re-check at consume) is independently source-verified correct — see `harness/verification.json` and `harness/adversarial-validation.json` for the full walk-through, including one previously unresolved-but-accepted residual (no bespoke rate limit on `/staff-invite/start`'s own 400/404/410 responses, matching the codebase-wide lack of route-level rate limiting elsewhere) — **[SUPPLEMENT-added, 21-07-26] this residual is now ADDRESSED, not merely accepted**: the user decided not to accept it, and this supplement adds bespoke IP-keyed rate-limiting on `/staff-invite/start` (Section D item 9, updated Public Contracts 429 entry, new Fully-Automated test gate above). **[RE-VALIDATE-added, this pass]** The rate-limit design itself was re-checked and confirmed sound: `req.ip` semantics are correct given zero `trust proxy` config anywhere in this codebase (confirmed by direct grep — zero hits), the 429 body is generic (does not widen the enumeration surface beyond what the existing 400/404/410 responses already reveal), the in-memory/per-process limitation is honestly documented with a named upgrade path, and the middleware is applied only to `/start` (not `/consume`, matching the plan's own asymmetric-guard reasoning, cross-checked against `cart.ts`'s single-mount-level-guard precedent and confirmed `/cart`'s pattern genuinely does NOT fit `/staff-invite`'s asymmetric case). One genuinely new, non-blocking finding surfaced by this re-check: the limiter's shared in-memory Map is not reset between test cases within the same integration-test file, which could cause the dedicated rate-limit-hammering test to intermittently 429 unrelated AC8–AC13 cases in the same file/run. Resolved via a Plan Update (Section D items 9 and 12, above) requiring a test-only `__resetRateLimitStoreForTests()` export and explicit reset calls around the hammering test — fixed in plan, not left open, consistent with how every other CONCERN in this contract was resolved.

Open gaps (none block EXECUTE — all 3 below are accepted, documented, non-blocking residuals):
- Admin/super_admin invite or promote produces a web-console-inaccessible account (no password/web magic-link path) — `known-gap: documented as NEW PLAN REQUIRED — see backlog/adm-011-admin-invite-no-web-access_NOTE_21-07-26.md (tracked as issue #142)`. **Accepted by user this session (re-validate pass, 21-07-26): ship ADM-011 as-is, fix deferred to the filed follow-up.**
- Mobile invite-accept screen's on-device navigation-race behavior is unconfirmed until the new Agent-Probe walkthrough is performed — `known-gap: documented — Agent-Probe walkthrough owed, see Verification Evidence VALIDATE-added row`. **Accepted by user this session (re-validate pass, 21-07-26): no data-integrity risk (consume call always completes correctly regardless of the transient UI flash) — accepted as an Agent-Probe check owed post-EXECUTE, does not block EXECUTE.**
- AC14 real-inbox delivery — `known-gap: documented as external prerequisite (Resend account provisioning), not new debt — process/features/auth-accounts/backlog/wire-better-auth-manual-prereqs_NOTE_09-07-26.md`
- ~~No bespoke rate limit on `/staff-invite/start`'s own invalid/expired/consumed-token responses~~ — **[SUPPLEMENT-added, 21-07-26] RESOLVED, not an open gap anymore.** The user decided not to accept this as a residual; a bespoke IP-keyed 10/min rate limiter now guards `/staff-invite/start` (Section D item 9, Public Contracts, new test gate). Does not affect better-auth's own separate plugin-level magic-link rate limiter (5/60s on the underlying `signInMagicLink` call), which was always independently in effect. **Re-validated this pass — design confirmed sound; see Dimension findings → Security surface.**
- **[RE-VALIDATE-added, non-blocking]** Section D's rate-limit middleware needs a test-only `__resetRateLimitStoreForTests()` export to avoid cross-test-case flakiness within `staff-invite.integration.test.ts` — `fixed in plan: gap-resolution B`, see Section D items 9 and 12 above. Not a Known-Gap; an execute-time checklist requirement.

What this coverage does NOT prove:
- The Fully-Automated `packages/api` suite proves the server-side mechanism (role/branch writes, token security, guard order, authz boundaries) is correct in isolation. It does NOT prove the `apps/admin` UI correctly drives that mechanism (real browser rendering, form validation, error display) — that is AC7's Agent-Probe scope.
- It does NOT prove the `apps/mobile` invite-accept screen correctly drives `/staff-invite/start` → `authClient.magicLink.verify` → `/staff-invite/consume` on a real device, including the navigation-race behavior flagged above — that is the new VALIDATE-added Agent-Probe row's scope.
- It does NOT prove real email delivery works (AC14) — deliberately deferred to a standing external prerequisite.
- It does NOT prove an admin/super_admin invitee can use `apps/admin` after accepting — confirmed by direct code read that they currently CANNOT, not merely untested; see Open Gaps.

Gate: PASS — 0 unresolved FAILs, 0 unresolved CONCERNs. The Section D token-capture mechanism FAIL
from the first VALIDATE pass was already corrected in-place as a Plan Update (no further action
needed — EXECUTE implements the corrected mechanism as written). The 2 previously-open CONCERNs
from the first pass are now explicitly accepted by the user (see Accepted by below and Open Gaps).
The rate-limit supplement (Section D item 9, addressing the 3rd previously-accepted residual) was
re-validated this pass and found sound; one new, non-blocking test-isolation finding in the
supplement itself was fixed via a Plan Update (Section D items 9 and 12), not left open.

Accepted by: user (session, 21-07-26 — re-validate pass). `mustStopBeforeFinalize: true` is now
satisfied — see `harness/review-decision.json` (APPROVE, written this pass). Explicitly accepted
items: (1) the admin/super_admin web-console-access gap — ship ADM-011 as-is, fix deferred to the
filed follow-up (backlog note `adm-011-admin-invite-no-web-access_NOTE_21-07-26.md`, tracked as
issue #142); (2) the mobile `invite-accept.tsx` navigation-race — accepted as an Agent-Probe check
owed post-EXECUTE (no data-integrity risk); (3) the rate-limit residual was NOT accepted — the
user instead directed a fix, which is now implemented in plan text and re-validated as sound (see
Dimension findings → Security surface).

## Autonomous Goal Block

SESSION GOAL: Ship ADM-011 (issue #141) — super_admin-only "+ Add staff" flow: promote an
existing customer by email, or invite someone new via a single-use expiring magic-link-backed
token that pre-provisions their role/branch on accept.
Charter + umbrella plan: N/A — single standalone plan (admin-dashboard 8-phase program is
complete; ADM-011 is fresh, unrelated work per its own SPEC).
Autonomy: standard RIPER-5 gates apply; EXECUTE requires explicit "ENTER EXECUTE MODE". Human
review of `harness/` and acceptance of the previously-open CONCERNs is COMPLETE (recorded
21-07-26 — see `harness/review-decision.json` and this plan's Validate Contract `Accepted by`
field) — this remains a privilege-granting auth-adjacent surface, so any FUTURE re-opening of
scope on this plan (not just this EXECUTE run) still requires the same manual-first review.
Hard stop conditions / safety constraints:
- Human acceptance is now recorded (21-07-26) — EXECUTE is authorized to proceed on "ENTER
  EXECUTE MODE".
- The invitee must NEVER be able to supply their own role/branch at accept time — only the
  stored invite record's values may ever be applied (AC10, adversarial-validation-confirmed).
- Self-escalation must stay impossible on the promote path (AC6, existing route unmodified).
- The `/staff-invite/start` token-capture mechanism MUST use the VALIDATE-corrected read (parse
  `verification.value` in application code, match on email) — the original Innovate Note's
  `WHERE identifier = email` approach is confirmed broken and must not be implemented.
- The new rate-limit middleware MUST export `__resetRateLimitStoreForTests()` and the integration
  test file MUST call it around the hammering case, or AC8–AC13 in the same file may intermittently
  429 (Section D items 9 and 12).
Next phase: EXECUTE — gate is PASS, human acceptance recorded 21-07-26.
Validate contract: inline in this plan file (`## Validate Contract` section above)
Execute start: `pnpm --filter @jojopotato/api test` (fully-auto, after `docker compose up -d` +
`db:migrate`) | `pnpm --filter @jojopotato/admin test` | `pnpm --filter @jojopotato/mobile
typecheck` | e2e spec: none (no RN E2E runner) | probe scenario: AC7 admin UI walkthrough +
VALIDATE-added mobile invite-accept on-device walkthrough | high-risk pack: yes (see `harness/`)

---

## Validate Contract Delta — RE-VALIDATION REQUIRED (21-07-26)

**This delta does NOT overwrite the `## Validate Contract` section above.** That contract's
`Gate: PASS` verdict remains accurate and unchanged for Sections A–G (backend + mobile accept
flow), which are CODE DONE, EXECUTED, and were independently human-reviewed
(`harness/review-decision.json`, APPROVE). This delta section exists solely to flag that Section H
(the `apps/admin` web accept surface + its CORS/plugin changes, added this session per explicit
user directive — see `## Web Accept Surface (apps/admin) — Scope Reopened 21-07-26` above) has
**NOT** been validated and must not be treated as covered by the existing PASS gate.

**Plan-agent does not self-issue a verdict here** — per the supplement-mode instruction, this
section records what needs re-validation, not a verdict. `vc-validate-agent` must run a scoped
VALIDATE pass covering:

1. **Security review of H3** (the CORS/trust-boundary extension) — confirm the trust-boundary
   analysis above is sound: does reusing `adminCors` unmodified genuinely introduce no new CSRF/
   enumeration/session-hijack surface beyond what `/api/admin` and `/api/auth` already accept?
   Confirm `trustedOrigins` already covering `ADMIN_WEB_ORIGIN` is sufficient for the magic-link
   verify call with no further `auth.ts` change.
2. **H2 plugin-addition side-effect check** — confirm `magicLinkClient()` does not alter
   `authClient.signIn.email`'s existing behavior (used by `login.tsx` today).
3. **New test coverage sufficiency** — confirm the H4 test plan (component test + CORS integration
   assertions) is a complete, non-vacuous proof of AC15/AC16, matching this plan's existing
   Fully-Automated/Agent-Probe discipline.
4. **Blast-radius/file-count re-confirmation** — confirm the ~17-file total and zero-collision
   claim against ADM-010 still holds with the 4 new/changed Section H files.
5. **High-risk evidence pack delta** — per the original plan's own convention (5-artifact
   `vc-risk-evidence-pack`, `harness/` in this task folder), determine whether Section H needs its
   own delta evidence-pack entry or can be folded into the existing `harness/` artifacts as an
   addendum — this is auth-adjacent surface widening (new callable-origin), matching the same
   risk class that triggered the original high-risk handoff.

**`mustStopBeforeFinalize` applies to this delta independently** — do NOT fabricate or reuse the
existing `harness/review-decision.json` (APPROVE) as covering Section H. A genuine, separate human
review/APPROVE decision is required before Section H's EXECUTE is authorized, even though Sections
A–G are already approved and executed.

**Orchestrator routing note:** on receipt of `SUPPLEMENT_APPLIED` for this plan, route to
`vc-validate-agent` for a scoped re-validate pass (Parallel strategy: sequential is likely
sufficient — this is a single, bounded, already-well-specified delta, mirroring how the prior
rate-limit re-validate pass was scoped) rather than treating the plan as still at Gate: PASS for
all sections.

### Delta Validate Findings (VALIDATE re-pass, 21-07-26 — Section H only)

**Scope:** this VALIDATE pass covers ONLY Section H (`apps/admin` web accept surface + the
`/staff-invite` CORS/plugin extension). Sections A–G's `Gate: PASS` in the `## Validate Contract`
above is unchanged and was **not** re-derived or re-reviewed by this pass.

**Method:** direct source read only. No `VC-FEASIBILITY-PROBE-NEEDED` was raised — every claim
below is mechanically derivable from installed package source (`cors@2.8.6`, `better-auth@1.6.23`)
and this repo's own files, not an unverifiable live runtime/network behavior.

#### H3 — CORS / trust-boundary extension (CONFIRMED SOUND, no new attack surface)

- **Object identity confirmed:** the `adminCors` object Section H reuses is the exact same
  instance already mounted on `/api/admin` (`index.ts:262`) and `/api/auth` (`index.ts:63`), not a
  re-declared copy — `packages/api/src/index.ts:40`.
- **Confirmed by direct read of `node_modules/.../cors@2.8.6/lib/index.js`:** for a preflight
  `OPTIONS` request, `cors()` always answers 204 regardless of whether the Origin is allowed, but
  only sets `Access-Control-Allow-Origin` when the Origin string-matches an allow-listed entry.
  Both `/staff-invite/start` and `/staff-invite/consume` require `Content-Type: application/json`
  (not a CORS-safelisted content type), so any cross-origin browser `fetch()` MUST be preflighted —
  a disallowed origin's preflight gets no ACAO header, so the browser refuses to send the real
  request at all. **A malicious page on a non-`ADMIN_WEB_ORIGIN` origin gains nothing it didn't
  already lack** — this matches the exact posture `/api/admin`/`/api/auth` already have.
- **`/staff-invite/start` (unauth, token-gated):** CORS controls response *readability* only, never
  the server-side token check — a caller without a valid 256-bit token gets 400/404/410 regardless
  of Origin. The existing 10/min/IP rate limiter (already built under Sections A–G) is unaffected.
- **`/staff-invite/consume` CSRF analysis:** a classic `<form>`-based CSRF is structurally blocked
  independent of CORS or SameSite — HTML forms cannot set `Content-Type: application/json` (only
  `x-www-form-urlencoded`/`multipart/form-data`/`text/plain` enctypes exist), so a form POST body
  is left unparsed by `express.json()` and Zod-rejects with 400 before any DB read. A JS-driven
  `fetch()` CSRF attempt from a disallowed origin is blocked at the preflight stage, same as
  `/start`. **No new CSRF surface is introduced by this delta** — it only grants the already-trusted
  `ADMIN_WEB_ORIGIN` the ability to *read* responses; it changes nothing about what any other
  origin can *do*.
- **`trustedOrigins` in `auth.ts` (line ~101) already lists `ADMIN_WEB_ORIGIN`** (direct read
  confirmed), and `/api/auth` (serving `authClient.magicLink.verify`'s underlying
  `/api/auth/magic-link/verify` call) already carries `adminCors` — pre-existing, unrelated to this
  delta. **No `auth.ts` change is required**, confirmed, matching the plan's own H3 claim.
- **Observation, NOT introduced by this delta (pre-existing, CORS-independent):**
  `/staff-invite/consume` accepts any authenticated session (not necessarily one minted by
  `/start`) and checks token validity + an email-match assertion AFTER the atomic consume-UPDATE
  has already run. A caller who already knows a valid raw token could, via a session for a
  *different* email, cause that invite to be marked consumed without applying role/branch — a
  "burn" no more useful than just completing the flow themselves (same precondition either way).
  This exists identically with or without CORS and requires no browser/cross-origin call. Not new
  Section-H surface; already implicitly covered by the outer Sections A–G trust model. No action
  required for this delta.

#### H2 — `magicLinkClient()` plugin addition (CONFIRMED additive-only)

Confirmed by direct read of the installed `better-auth@1.6.23`'s
`dist/plugins/magic-link/client.mjs`: `magicLinkClient()` returns a plain marker object (`{ id:
"magic-link", version, $InferServerPlugin: {} }`) with no `getActions`/method-override hook.
better-auth client plugins are additive and namespaced by construction — `magicLinkClient()` can
only ever add `authClient.magicLink.*` methods and structurally cannot touch `signIn.email`. **No
side effect on the existing email/password login flow (`login.tsx`).**

#### H4 — test coverage sufficiency

**CONCERN (non-blocking — resolved via Execute-Agent Instructions below, not left open):** the H4
test-plan prose is ambiguous about whether the CORS integration assertions (preflight +
real-request ACAO/ACAC + disallowed-origin-absent) cover BOTH `/staff-invite/start` AND
`/staff-invite/consume`, or only one — both are independent Express handlers under the same mount
and each needs its own 3-case proof. The H4 plan also omits an explicit **no-Origin regression
case**: `apps/mobile` already calls both routes today with no `Origin` header (proven working
pre-delta); the new `adminCors` mount must not regress that path. Confirmed by direct source read
that no regression exists in practice (see H3 above), but the suite should assert this explicitly
rather than rely on this VALIDATE pass's static analysis alone.

Everything else in H4 (component test asserting the 3-step call sequence + held-loading-state) is
a complete, non-vacuous proof of AC15 as scoped.

#### Blast-radius / file-count re-confirmation

Confirmed: Section H adds exactly 4 files/edits (`staff-invite-accept.tsx` new,
`staff-invite-accept.test.tsx` new, `auth-client.ts` one-plugin edit, `index.ts` one-line mount
edit) — matches the plan's own "~17 files total" claim (13 + 4). Zero collision with ADM-010
re-confirmed unaffected — ADM-010 never touches `apps/admin/src/routes/`, `auth-client.ts`, or
`index.ts`'s `/staff-invite` mount.

#### High-risk evidence pack delta

Section H sits in the SAME risk class as the outer contract (auth-adjacent / privilege-granting) —
its own surface change is narrower (CORS exposure of an already-built, already-reviewed
mechanism), but per the manual-first evidence contract it still requires its OWN, SEPARATE human
APPROVE/REJECT decision before EXECUTE. The existing `harness/review-decision.json` (APPROVE,
dated 21-07-26) covers Sections A–G ONLY and is **not** extended to Section H by this pass. New
delta evidence artifacts written this pass: `harness/risk-gate-delta.json`,
`harness/adversarial-validation-delta.json`.

**Execute-Agent Instructions for Section H:**
- **E-H1:** Write the CORS integration test cases (H4 / checklist item 19e) for BOTH
  `/staff-invite/start` AND `/staff-invite/consume` independently — 3 cases each (preflight headers
  present for `ADMIN_WEB_ORIGIN`, real-request headers present, disallowed-origin gets no matching
  ACAO) — 6 cases total, not 3.
- **E-H2:** Add one additional regression case to the same test file: a `POST` to
  `/staff-invite/start` with NO `Origin` header (mirrors `apps/mobile`'s calling convention) still
  succeeds and carries no `Access-Control-Allow-Origin` header — proves the CORS mount change does
  not regress the already-shipped mobile accept flow.
- **E-H3:** Confirm during EXECUTE (per H2) that adding `magicLinkClient()` does not change the
  TypeScript shape of `authClient` in a way that breaks `useAdminAuth()`'s existing `signIn.email`
  call — expected to be a no-op per the source read above; a clean `apps/admin` typecheck after the
  plugin addition is the mechanical confirmation.

**Delta Gate: PASS** — 0 FAILs. 1 CONCERN (H4 test-plan precision) resolved via the Execute-Agent
Instructions above (gap-resolution: B — fixed via checklist instruction, not left open). No new
security or trust-boundary defect found in the CORS or plugin change; reusing the already-vetted
`adminCors` object introduces no capability beyond what `/api/admin` and `/api/auth` already grant
to the same origin.

**Human approval status for this delta: APPROVED (21-07-26).** The real user APPROVE decision for
Section H is recorded at `harness/review-decision-delta.json` (a genuine session decision, distinct
from `harness/review-decision.json` which covers Sections A–G only). With that approval and Gate:
PASS, Section H was executed and committed (`0bf8365`). The `mustStopBeforeFinalize` gate for this
delta is satisfied. Remaining follow-up is manual verification only (the 3 Agent-Probe walkthroughs
above), not a further approval or re-validation.
