---
name: plan:adm-012-web-staff-setup
description: "ADM-012 — web-first staff account setup: profile + password onboarding on invite-accept, role-based routing, invite link repoint, mobile route unregistration (issue #142)"
date: 21-07-26
feature: admin-dashboard
---

# ADM-012 — Web-First Staff Account Setup (PLAN)

**Date**: 21-07-26
**Status**: CODE DONE + committed (`81974a9`, stacks on ADM-011 `0bf8365`) — EVL-confirmed green
(API 716/716, admin 181/181, 3 typechecks clean, admin build clean, format:check clean). **NOT
VERIFIED** — AC12 (real-browser walkthrough) and the 5-artifact high-risk evidence pack are still
owed (both user-run, deferred by the user). See
`adm-012-web-staff-setup_REPORT_21-07-26.md` (same folder) for the full EXECUTE/EVL closeout.
**Complexity**: COMPLEX (backend route + auth-adjacent write + multi-step web UI + mobile route
removal + invite-link repoint; touches 4 packages). Not a phase program (single delivery unit, no
independent validation gates between sub-parts).

**SPEC:** `adm-012-web-staff-setup_SPEC_21-07-26.md` (same folder) — authoritative for all D1–D8
decisions, the 13 ACs, and the flow diagram. This plan does not restate rationale already locked
there; it only turns it into concrete file-level steps.

**Branch:** `feat/adm-011-add-staff` (stacks on committed ADM-011, HEAD `ba489f3`).

**Context:** `process/context/all-context.md` (repo root router — read before EXECUTE for current
implementation state); test routing per `process/context/tests/all-tests.md`.

## Phase Completion Rules

- `CODE DONE` — all 13 Fully-Automated/Agent-Probe gates in Verification Evidence pass except
  AC12 (Agent-Probe, owed). **Reached 21-07-26** — see Status line above.
- `VERIFIED` — CODE DONE plus AC12's manual browser walkthrough (staff-role AND admin-role invite,
  full flow) performed and passed by the user. Do not archive to `completed/` before VERIFIED.
  **Not yet reached — task folder stays in `active/`.**

## Acceptance Criteria

See SPEC §Acceptance Criteria for the full 13 ACs with `proven by:`/`strategy:` tags — reproduced
in condensed form in the Verification Evidence table below with exact gate commands. This plan
does not restate SPEC's AC prose; SPEC is authoritative.

---

## Overview

Today, accepting a staff invite (or being promoted) produces a session with no password and no
profile — and the web accept screen always navigates to `/`, which the `(dashboard)` guard bounces
non-admin roles out of. This plan adds two required onboarding sub-steps to the web accept flow
(profile, then password), then routes by role: admin/super_admin → dashboard, staff → a terminal
"sign in on the app" screen. It also repoints the invite email link at the web page and makes the
mobile accept screen unreachable (route removed, file preserved).

## Goals

- New session-gated `POST /staff-invite/set-password` route (`packages/api`).
- Web accept screen (`apps/admin`) gains Profile step → Password step → role-based routing.
- `sendStaffInvite` repointed to the web accept URL; `/staff-invite/native` mobile-redirect step
  dropped from the invite path.
- Mobile `(auth)/_layout.tsx` de-registers `invite-accept`; the screen file is untouched.
- Zero changes to `POST /api/admin/users/:id/role` or `PATCH /api/admin/staff/:id/branch`.

## Scope

In scope: `packages/api` (new route, `sendStaffInvite` URL change), `apps/admin` (accept-screen
rewrite: profile step, password step, routing, "Open in the app" removal, auth-client field
registration — see Validate Contract E1), `apps/mobile` (`(auth)/_layout.tsx` de-registration
only). Out of scope: everything in SPEC's Out Of Scope section — mobile onboarding parity,
password reset, profile editing after setup, invite creation/list/revoke/resend (ADM-013), mobile
login screen code.

---

## Touchpoints

| File | Change |
|---|---|
| `packages/api/src/routes/staff-invite.ts` | Add `POST /staff-invite/set-password` (session-gated via `requireSession`, already imported) |
| `packages/api/src/routes/admin/staff.ts` | `sendStaffInvite`: change `acceptUrl` from `${BETTER_AUTH_URL}/staff-invite/native?token=...` to the web accept URL; also update the leading doc-comment above the function (Validate Contract E6) |
| `packages/api/src/routes/__tests__/staff-invite.integration.test.ts` | Add set-password test cases (AC1–AC4) |
| `packages/api/src/routes/admin/__tests__/admin-staff-invite-create.integration.test.ts` | Add/update assertion on the generated accept URL (AC10) — confirmed exact file at VALIDATE (see E5); reuses the existing `extractInviteToken`/`logSpy` helper already in this file |
| `apps/admin/src/features/auth/lib/auth-client.ts` | **New touchpoint, added at VALIDATE (E1) — was missing from the original plan.** Extend `inferAdditionalFields({ user: {...} })` to add `birthday: { type: 'string', input: true }`, `address: { type: 'string', input: true }`, `onboardedAt: { type: 'date', input: true }`, mirroring `apps/mobile/src/features/auth/lib/auth-client.ts` exactly. Without this, `authClient.updateUser({ name, birthday, address, onboardedAt })` in the rewritten accept screen will not type-check (only `role` is currently registered on the admin client). |
| `apps/admin/src/routes/staff-invite-accept.tsx` | Rewrite: add Profile step + Password step + role-based routing; drop "Open in the app" link; use the shadcn `Input`/`Button` components from `@/components/ui/*` (already imported in `login.tsx`, not a new "plain `<input>`" pattern — see E3) |
| `apps/admin/src/routes/-staff-invite-accept.test.tsx` | **Corrected filename at VALIDATE (E2)** — the plan originally said `staff-invite-accept.test.tsx`; the real, already-existing file (and this app's route-file-exclusion convention, documented in its own header comment) uses a leading `-`. Extend this EXISTING file with AC6, AC8, AC9 component tests. |
| `apps/mobile/src/app/(auth)/_layout.tsx` | Remove `<Stack.Screen name="invite-accept" />` line only |
| `apps/mobile/src/app/(auth)/invite-accept.tsx` | **No change** — byte-unmodified (AC11) |
| `process/features/admin-dashboard/backlog/staff-mobile-onboarding-parity_NOTE_21-07-26.md` | New backlog note (recommended by SPEC) |

## Public Contracts

- **New:** `POST /staff-invite/set-password` — session-gated (401 if unauthenticated). Body
  `{ newPassword: string }`. Success: `200 { ok: true }`. Length violation (< 8 or > 128 chars):
  `400 { error }`, zero credential mutation. `PASSWORD_ALREADY_SET` (existing password on this
  email): treat as success, `200 { ok: true }`, existing password untouched. Never accepts
  role/branch/email in the body — those are not inputs.
- **Unchanged, reused verbatim (byte-frozen — flag immediately if any step here would require
  touching either):** `POST /api/admin/users/:id/role`, `PATCH /api/admin/staff/:id/branch`,
  `POST /staff-invite/start`, `POST /staff-invite/consume` (its `{ role, assignedBranchId,
  alreadyStaffLevel }` response shape is read but not modified).
- **Changed value, not shape:** `sendStaffInvite`'s generated `acceptUrl` — now
  `${ADMIN_WEB_ORIGIN}/staff-invite-accept?token=...` (web page) instead of
  `${BETTER_AUTH_URL}/staff-invite/native?token=...` (mobile-redirect endpoint). `ADMIN_WEB_ORIGIN`
  is already exported from `packages/api/src/lib/auth.ts` — import it in `admin/staff.ts` rather
  than reading `process.env.ADMIN_WEB_ORIGIN` directly, to keep one source of truth with the CORS
  mount.
- **`authClient.updateUser({ name, birthday, address, onboardedAt })`** — reused exactly as the
  mobile customer-onboarding `completeProfile` call shape; `role` never included. Requires the
  `apps/admin` auth-client field-registration fix (E1) to compile.

## Blast Radius

4 packages (`packages/api`, `apps/admin`, `apps/mobile`, `process/features/admin-dashboard`
backlog), ~9 touched files (was 8; +1 for `apps/admin/src/features/auth/lib/auth-client.ts`, added
at VALIDATE), 0 schema/migration changes, 1 new route (session-gated, no new DB table/column —
password write goes through better-auth's existing `account` credential table via
`auth.api.setPassword`). Risk class: **auth/identity-adjacent** (setting a password + writing
profile fields on a privilege-carrying account) — same trust-boundary class as ADM-011's
invite-accept flow. No billing, no schema migration, no public read-API contract change (the only
contract addition is a new write endpoint, not a change to an existing one).

---

## Implementation Checklist

### Section A — Backend: `POST /staff-invite/set-password`

1. In `packages/api/src/routes/staff-invite.ts`, add a Zod schema:
   ```
   const setPasswordSchema = z.object({ newPassword: z.string().min(8).max(128) });
   ```
   (This client-boundary schema is a deliberate explicit re-assertion, not a duplicate of a
   framework config — better-auth's own `setPassword` independently re-checks
   `minPasswordLength`/`maxPasswordLength`, confirmed at VALIDATE to default to exactly 8/128
   — see E7. Zod rejection → `400 { error: 'Password must be 8-128 characters' }` before any
   `auth.api.setPassword` call — zero credential mutation on a length violation.)
2. Add the route, mounted on the same `staffInviteRouter`, gated by `requireSession` (already
   imported at the top of the file):
   ```
   staffInviteRouter.post('/set-password', requireSession, async (req, res) => { ... })
   ```
3. Inside the handler: parse body with `setPasswordSchema` (400 on failure). Call
   `auth.api.setPassword({ body: { newPassword: parsed.data.newPassword }, headers:
   fromNodeHeaders(req.headers) })` — reuse the `fromNodeHeaders` import pattern from
   `require-session.ts` (add the import to `staff-invite.ts`). Wrap in try/catch:
   - On success: `res.status(200).json({ ok: true })`.
   - On `PASSWORD_ALREADY_SET`: **resolved exactly at VALIDATE (E7)** — check
     `err?.body?.code === 'PASSWORD_ALREADY_SET'` (confirmed against installed better-auth
     1.6.23 source: `setPassword` throws `APIError.from('BAD_REQUEST',
     BASE_ERROR_CODES.PASSWORD_ALREADY_SET)`, and `BASE_ERROR_CODES` entries are shaped
     `{ code, message, toString }` by `defineErrorCodes()`, so the thrown error's `.body` is
     `{ message: 'User already has a password set', code: 'PASSWORD_ALREADY_SET' }` and
     `.status === 'BAD_REQUEST'` / `.statusCode === 400`). Treat as success,
     `res.status(200).json({ ok: true })`. Do NOT log this as an error — it's an expected D4
     no-op path.
   - On any other thrown error: `console.error` + `res.status(500).json({ error: 'Failed to set
     password' })` (matches the file's existing error-handling convention).
4. No new imports beyond `fromNodeHeaders` from `better-auth/node` (already used in
   `require-session.ts` — same package, same call shape).

### Section B — Backend: repoint `sendStaffInvite`

5. In `packages/api/src/routes/admin/staff.ts`, import `ADMIN_WEB_ORIGIN` from `../../lib/auth`.
6. Change `sendStaffInvite`'s `acceptUrl` construction from
   `${process.env.BETTER_AUTH_URL}/staff-invite/native?token=${encodeURIComponent(rawToken)}` to
   `${ADMIN_WEB_ORIGIN}/staff-invite-accept?token=${encodeURIComponent(rawToken)}` (the web route
   path was confirmed exact at VALIDATE — `apps/admin/src/routes/staff-invite-accept.tsx`'s
   `createFileRoute('/staff-invite-accept')` matches). Update the console.log fallback line and
   the email body text's URL reference to match, **and update the function's leading doc-comment**
   ("The link targets `/staff-invite/native`...") which is now stale (E6, added at VALIDATE — the
   original plan only named the two runtime strings, missing this doc comment).
7. **Do not touch** `GET /staff-invite/native` in `packages/api/src/index.ts` — SPEC does not ask
   to delete the endpoint, only to stop the invite email from pointing at it. Leaving the endpoint
   itself intact is lower-risk (no dead-link risk for any already-sent, unconsumed invite emails
   from before this deploy) and out of the locked scope (D8 only requires the invite email link
   changes and the mobile route de-registration).

### Section C — Web: accept-screen rewrite

8. In `apps/admin/src/routes/staff-invite-accept.tsx`, extend the `Phase` union from
   `'signing-in' | 'error'` to `'signing-in' | 'profile' | 'password' | 'routing' | 'staff-done' |
   'error'` (exact naming can be refined at EXECUTE, but the state machine has these 6 distinct
   UI states — do not collapse profile+password into one combined state, since SPEC's step
   ordering is locked: profile always first, password conditional).
9. After the existing Step 3 (`/staff-invite/consume` success), instead of calling `onSignedIn()`
   immediately: capture the consume response body (`{ role, assignedBranchId, alreadyStaffLevel }`)
   in local state, and transition to `phase: 'profile'`.
10. Build the Profile step UI reusing the mobile `(onboarding)/index.tsx` validation logic
    (`isValidBirthday`, the 3-field MM/DD/YYYY birthday assembly, the `canSubmit` gate requiring
    non-empty trimmed name + address + valid birthday) — port the pure logic (not the RN
    components) into a small local helper or inline in the web component. **Correction at
    VALIDATE (E3):** use the shadcn `Input`/`Button` components from `@/components/ui/input` and
    `@/components/ui/button` — `login.tsx` (this plan's cited precedent) actually imports and uses
    the shadcn `Input` component, not a raw `<input>` element; there is no "plain `<input>`"
    convention to match. Using the existing `Input`/`Button` primitives is the correct
    no-new-form-library choice per CLAUDE.md surgical-changes discipline. Pre-fill "Full name"
    from the session user's current `name` (read via `authClient.useSession()` or the
    already-available session object from Step 2/3 — confirm exact accessor during EXECUTE; do
    not add a new `/me` round-trip per D5).
11. On Profile step submit: call `authClient.updateUser({ name, birthday, address, onboardedAt:
    new Date() })` — exact same call shape as `completeProfile` in
    `apps/mobile/src/features/auth/hooks/use-auth.ts`. `role` is never included (structurally
    impossible per D3 — `role` is `input: false` in `auth.ts`). **Requires E1 (auth-client.ts
    field registration) to be done first, or this call will not type-check.** On success,
    transition to `phase: 'password'`. On failure, show an inline error, stay on `profile`.
12. Build the Password step UI: password field, confirm-password field (client-side match check),
    and a strength indicator. **Strength indicator implementation (locked, no new dependency
    per SPEC Constraints / PONYTAIL guidance):** a small local pure function computing a 0–4 score
    from length + character-class diversity (has-lowercase, has-uppercase, has-digit,
    has-symbol, length ≥ 12) — inline in the component or a tiny co-located helper file, not a new
    npm package. Do not gate submission on the score itself — only on the existing 8–128 length
    bound (matches D7: strength is UX feedback, not an enforcement gate).
13. **Skip-if-already-has-password branch:** SPEC (D4) says an already-has-password account's
    password sub-step doesn't force a redundant reset, but AC4 tests that calling
    set-password on such an account is *handled gracefully server-side* (PASSWORD_ALREADY_SET →
    200), not that the client must pre-detect and skip the step. **Locked implementation choice
    for this plan, reconfirmed at VALIDATE (see `## Validate Contract` → step-13 interpretation
    below — recommendation: accept as written):** the client always shows and submits the
    Password step (never client-side skips it) — the server's `PASSWORD_ALREADY_SET` handling
    (Section A step 3) is what makes this safe and correct per D4, without requiring the client to
    know in advance whether a password already exists (no new read is needed, consistent with
    D5's "no new round-trip" spirit).
14. On Password step submit: call `POST /staff-invite/set-password` with `credentials: 'include'`
    (matches the existing `fetch` pattern for `/consume` in this file) and body `{ newPassword }`.
    On `200`, transition to `phase: 'routing'`. On `400` (length), show inline error, stay on
    `password`. On other failure, show inline error, stay on `password`.
15. Routing logic (`phase: 'routing'`, resolves synchronously from the captured Step 3 response,
    per D5 — no new fetch): if `role === 'admin' || role === 'super_admin'` → call `onSignedIn()`
    (unchanged prop, still navigates to `/`). If `role === 'staff'` → transition to `phase:
    'staff-done'` and render the terminal confirmation card ("You're all set — sign in to the
    Jojo Potato app to start your shifts.") with no navigation and no dashboard-access affordance.
16. Remove the `"Open in the app"` `<a href="jojopotato://...">` block entirely (D8).
17. Update the component-level test file — **`apps/admin/src/routes/-staff-invite-accept.test.tsx`
    (corrected filename, E2 — leading `-` already exists on this file, confirmed by direct read;
    this app's convention excludes route-directory files with a leading `-` from TanStack Start's
    route generator while Vitest still discovers them via the `*.test.tsx` glob)** to cover AC6
    (profile step blocks on missing/invalid fields), AC8 (admin/super_admin → dashboard nav after
    both sub-steps), AC9 (staff → terminal confirmation, no dashboard nav attempted).

### Section D — Mobile: de-register the route

18. In `apps/mobile/src/app/(auth)/_layout.tsx`, remove the single line
    `<Stack.Screen name="invite-accept" />`. No other change to this file.
19. Do NOT touch `apps/mobile/src/app/(auth)/invite-accept.tsx` — confirm via `git diff` after
    EXECUTE that this file shows zero changes (AC11 requires byte-identical).
20. Run `apps/mobile` typecheck after the `_layout.tsx` change to confirm nothing else in the app
    still references the now-unregistered `invite-accept` route (AC11's second proof leg).

### Section E — Backlog note

21. Write `process/features/admin-dashboard/backlog/staff-mobile-onboarding-parity_NOTE_21-07-26.md`
    per SPEC's Out Of Scope recommendation — mobile-only first-run experience, now lower priority
    since web setup already collects the full profile; note that `invite-accept.tsx` is preserved
    specifically for potential reuse there.

---

## Shared-File Sequencing (carried forward from SPEC, not resolved here)

`packages/api/src/routes/staff-invite.ts` has three concurrent editors across two phases:
ADM-011 Section H (already executed/committed at `0bf8365` — no longer live contention) and
ADM-013 (SPEC'd + PLANNED, VALIDATE run 21-07-26 as Gate: CONDITIONAL — extends
`staff-invite.ts`'s liveness guards for list/revoke/resend). **This plan is the third concurrent
claim.** Confirmed at THIS plan's VALIDATE pass: `staff-invite.ts` is currently clean/committed
(part of `0bf8365`, no uncommitted edits) — neither ADM-012 nor ADM-013 has started EXECUTE yet, so
there is no live contention to resolve right now. Whichever of ADM-012/ADM-013 lands second in
EXECUTE must re-scan `staff-invite.ts` (and its integration test file) immediately before editing
and rebase its diff on top of whatever landed first — do not assume the file is in the state read
during this PLAN/VALIDATE session. Record actual landing order in this plan's Resume and Execution
Handoff section once EXECUTE begins.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `set-password` + fresh sign-in round-trip for a never-seen invitee email | Fully-Automated (`pnpm --filter @jojopotato/api test -- staff-invite`) | AC1 |
| Unauthenticated `POST /staff-invite/set-password` → 401; authenticated call changes password only, role/branch byte-identical before/after | Fully-Automated | AC2 |
| 7-char and 129-char rejected (zero mutation); 8-char and 128-char succeed | Fully-Automated | AC3 |
| Seeded existing-password account through set-password → no 500, original password still works | Fully-Automated | AC4 |
| Profile update via `auth.api.updateUser` server call, read back and asserted | Fully-Automated (`pnpm --filter @jojopotato/api test -- staff-invite` — **resolved at VALIDATE (E8):** reuse the real, already-existing `auth.api.updateUser({ body, headers })` server-side pattern from `packages/api/src/lib/__tests__/auth.integration.test.ts` lines 189/219 — no new test harness mechanism needed) | AC5 |
| Profile step "continue" disabled/rejected on missing name / invalid birthday / missing address; succeeds once valid | Fully-Automated (`pnpm --filter @jojopotato/admin test -- staff-invite-accept`) | AC6 |
| Profile-update call leaves role/branch unchanged for staff/admin/super_admin | Fully-Automated | AC7 |
| Component test: `role: 'admin'`/`'super_admin'` consume-response → navigates to dashboard route after both sub-steps | Fully-Automated | AC8 |
| Component test: `role: 'staff'` consume-response → renders terminal confirmation, no dashboard navigation attempted | Fully-Automated | AC9 |
| Invite-send accept URL targets the web path, not `/staff-invite/native` or `jojopotato://` | Fully-Automated (`pnpm --filter @jojopotato/api test -- admin-staff-invite-create` — **resolved at VALIDATE (E5):** exact file confirmed, reuse the existing `logSpy`/`extractInviteToken` helper already in this file — the raw token/URL is deliberately never returned in the API response body, only logged, per the file's own doc comment) | AC10 |
| `invite-accept.tsx` file presence + `_layout.tsx` no longer registers it + `apps/mobile` typecheck clean | Fully-Automated (`git diff --stat` assertion + `pnpm --filter @jojopotato/mobile typecheck`) | AC11 |
| Full browser walkthrough: staff-role invite and admin-role invite, both full flows, strength meter, confirm-mismatch error | Agent-Probe | AC12 |
| Re-run existing role-management and branch-assignment integration suite, zero new failures | Fully-Automated (`pnpm --filter @jojopotato/api test -- admin-staff` — **resolved at VALIDATE:** exact file confirmed as `packages/api/src/routes/admin/__tests__/admin-staff.integration.test.ts`, covers both `/role` and `/branch` routes) | AC13 |

**Test Tier Decision Waterfall applied:** all 13 ACs land on Fully-Automated except AC12, which
is Agent-Probe by SPEC's own explicit statement (no RN/E2E runner exists for `apps/admin` or
`apps/mobile` screen-level flows — standing project-wide residual, same as ADM-009/ADM-011). No
Known-Gap rows — every AC has a concrete proving strategy, confirmed real (not placeholder) at
VALIDATE for AC5/AC10/AC13, which the plan had left as "confirm at EXECUTE."

**High-risk class check:** auth/identity-adjacent (password write + profile write on a
privilege-carrying account). Per the High-Risk Classes table, this requires at minimum a Hybrid
gate — satisfied and exceeded: AC1–AC5, AC7, AC13 are all Fully-Automated integration tests
against real Postgres (hybrid-grade precondition: local Postgres running), which is stronger than
the minimum bar.

## Test Infra Improvement Notes

(none identified yet)

---

## Risks

| Risk | Mitigation |
|---|---|
| `auth.api.setPassword`'s exact error shape for an already-has-password account | **RESOLVED at VALIDATE (E7)** — confirmed against installed better-auth 1.6.23 source: `err.body?.code === 'PASSWORD_ALREADY_SET'`, `err.status === 'BAD_REQUEST'` |
| AC5's "read back via the same session-read path" test mechanism | **RESOLVED at VALIDATE (E8)** — `auth.api.updateUser` server call, real precedent already in `auth.integration.test.ts` |
| Shared-file contention on `staff-invite.ts` with ADM-013 | Re-scan-before-edit rule above; confirmed at VALIDATE that neither plan has started EXECUTE yet — no live contention as of this pass |
| Client-side "always show password step, let server no-op" reading of D4 vs. a literal "client detects and skips" reading | Flagged for one-line confirmation — see `## Validate Contract` → step-13 interpretation |
| PONYTAIL scope creep risk on the strength-meter component | Checklist step 12 locks it to a small inline pure function, no new dependency |
| `apps/admin` auth-client missing `birthday`/`address`/`onboardedAt` field registration | **FOUND and added at VALIDATE (E1)** — new Touchpoints row + Implementation Checklist note |

## Strategy Recommendation for VALIDATE

Single plan, single validate-contract, standard vc-validate-agent run (not a phase-program /
parallel-validate fan-out — this is one COMPLEX plan, not 3+ phase plans). Sequential is
appropriate for VALIDATE here; no multi-agent fan-out needed. Recommend running the auth/identity
high-risk class check explicitly in V2 given the trust-boundary surface.

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/adm-012-web-staff-setup_21-07-26/adm-012-web-staff-setup_PLAN_21-07-26.md`
2. **Last completed phase or step:** VALIDATE run 21-07-26 — Gate: CONDITIONAL, `Accepted by:
   PENDING` (real user confirmation required before EXECUTE — see `## Validate Contract`).
3. **Validate-contract status:** written this pass (21-07-26), Gate: CONDITIONAL.
4. **Supporting context files loaded:** SPEC (this folder), `packages/api/src/routes/staff-invite.ts`,
   `packages/api/src/lib/auth.ts`, `packages/api/src/middleware/require-session.ts`,
   `packages/api/src/routes/admin/staff.ts` (`sendStaffInvite`), `apps/admin/src/routes/staff-invite-accept.tsx`,
   `apps/admin/src/routes/(dashboard)/route.tsx`, `apps/admin/src/features/auth/lib/auth-client.ts`,
   `apps/admin/src/routes/login.tsx`, `apps/admin/src/routes/-staff-invite-accept.test.tsx`,
   `apps/mobile/src/app/(auth)/_layout.tsx`, `apps/mobile/src/app/(auth)/invite-accept.tsx`,
   `apps/mobile/src/app/(onboarding)/index.tsx`, `apps/mobile/src/features/auth/hooks/use-auth.ts`,
   `apps/mobile/src/features/auth/lib/auth-client.ts`,
   `packages/api/src/routes/__tests__/staff-invite.integration.test.ts` (header + fixtures only),
   `packages/api/src/lib/__tests__/auth.integration.test.ts` (updateUser precedent),
   `packages/api/src/routes/admin/__tests__/admin-staff-invite-create.integration.test.ts`
   (extractInviteToken/logSpy pattern), `packages/api/src/routes/admin/__tests__/admin-staff.integration.test.ts`,
   installed `better-auth@1.6.23` source (`dist/api/routes/update-user.mjs`,
   `dist/context/create-context.mjs`, `@better-auth/core` error codes) — direct read, not a live
   probe, ADM-013 SPEC (sequencing note only, not read in full).
5. **Next step for a fresh agent picking up mid-execution:** Get real user confirmation on (a) the
   3 Execute-Agent Instructions that require a plan-text decision (E1 auth-client.ts extension, E2
   test filename correction, E3 Input/Button wording correction — all mechanically confirmed, low
   risk, recommended: accept all) and (b) the step-13 interpretation (recommended: accept as
   written — always-show/server-no-op). Once accepted, update Gate to PASS/`Accepted by:` with the
   real name, then proceed to EXECUTE Section A → B → C → D → E in that order (backend route
   before UI, so the UI can be built against a real endpoint).

---

## Validate Contract

Status: CONDITIONAL
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 4/7 (S1 multi-package, S2 auth surface, S6 high-risk class, S7 5+ files) would
normally recommend a workflow/agent-team fan-out for the Layer 1+Layer 2 VALIDATE checks
themselves, but this VALIDATE pass was executed as direct sequential mechanical verification
(reading real source files and the installed better-auth package directly) rather than spawning
parallel subagents — no Agent-tool fan-out capability was available in this invocation, and the
plan's own scope (one locked design, no competing directions) made sequential verification
sufficient and more precise than a multi-agent fan-out would have been for a single COMPLEX plan.
For EXECUTE: recommend **sequential**, one vc-execute-agent (opus), Section A → B → C → D → E in
order — the plan's own ordering is a real dependency (UI section C calls the Section A route and
needs the Section B URL confirmed), not an artificial constraint.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | set-password persists a durable credential; fresh sign-in with the new password succeeds | Fully-Automated | `pnpm --filter @jojopotato/api test -- staff-invite` (new case: start→verify→consume→set-password→independent sign-in) | B |
| AC2 | set-password is session-gated (401 unauthenticated); only ever mutates password, role/branch untouched | Fully-Automated | same suite, new assertion | B |
| AC3 | 8–128 char length enforced both client (Zod) and server (better-auth default) | Fully-Automated | same suite, 4 boundary cases | B |
| AC4 | existing-password account handled gracefully (PASSWORD_ALREADY_SET no-op), original password still works | Fully-Automated | same suite, seeded-password case | B |
| AC5 | profile update (`name`/`birthday`/`address`/`onboardedAt`) persists and reads back exactly | Fully-Automated | `pnpm --filter @jojopotato/api test -- staff-invite` via `auth.api.updateUser` (precedent: `auth.integration.test.ts:189,219`) | B |
| AC6 | profile step blocks continue on missing/invalid name/birthday/address | Fully-Automated | `pnpm --filter @jojopotato/admin test -- staff-invite-accept` (file: `-staff-invite-accept.test.tsx`) | B |
| AC7 | profile-update call never mutates role/branch, for all 3 roles | Fully-Automated | `pnpm --filter @jojopotato/api test -- staff-invite` | B |
| AC8 | admin/super_admin consume-response → dashboard nav after both sub-steps (component-level) | Fully-Automated | `pnpm --filter @jojopotato/admin test -- staff-invite-accept` | B |
| AC9 | staff consume-response → terminal confirmation, no dashboard nav attempted (component-level) | Fully-Automated | `pnpm --filter @jojopotato/admin test -- staff-invite-accept` | B |
| AC10 | invite-send accept URL targets the web path, not the mobile deep-link path | Fully-Automated | `pnpm --filter @jojopotato/api test -- admin-staff-invite-create` (extend existing `extractInviteToken` helper) | B |
| AC11 | `invite-accept.tsx` unreachable — file preserved, route de-registered | Fully-Automated | `git diff --stat` assertion + `pnpm --filter @jojopotato/mobile typecheck` | B |
| AC12 | full browser walkthrough (staff + admin invite), strength meter, confirm-mismatch error | Agent-Probe | manual walkthrough per Phase Completion Rules | B |
| AC13 | role-management + branch-assignment routes byte-unmodified | Fully-Automated | `pnpm --filter @jojopotato/api test -- admin-staff` | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle) — AC13's covering suite already exists and passes today; this plan does not change it.
- B — fixed in this plan (gate added by this plan's checklist) — the other 12 gates are written as part of this plan's EXECUTE.
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: no `strategy:` cell above uses Known-Gap — all 13 rows use Fully-Automated or
Agent-Probe (the 3 proving strategies), matching the plan's own zero-Known-Gap claim.

Legacy line form:
- `packages/api` set-password route + profile persistence: Fully-automated: `pnpm --filter @jojopotato/api test -- staff-invite`
- `packages/api` invite-send URL repoint: Fully-automated: `pnpm --filter @jojopotato/api test -- admin-staff-invite-create`
- `packages/api` role/branch route regression: Fully-automated: `pnpm --filter @jojopotato/api test -- admin-staff`
- `apps/admin` accept-screen profile/password/routing: Fully-automated: `pnpm --filter @jojopotato/admin test -- staff-invite-accept`
- `apps/mobile` route de-registration: Fully-automated: `git diff --stat` + `pnpm --filter @jojopotato/mobile typecheck`
- Full browser walkthrough (staff + admin): agent-probe: manual, described in AC12

Dimension findings:
- Infra fit: PASS — no container/infra/port changes; new route mounts on the already-CORS'd `staffInviteRouter`; no new dependency.
- Test coverage: CONCERN → resolved — 3 "confirm exact mechanism at EXECUTE" placeholders (AC5, AC10, AC13) were resolved to concrete files/patterns during VALIDATE by direct source read; folded into the Test Gates table above and Execute-Agent Instructions E5/E8.
- Breaking changes: PASS — zero schema/migration changes; the 2 byte-frozen routes (`/role`, `/branch`) confirmed untouched and have no other unlisted consumers; `sendStaffInvite`'s changed acceptUrl is a controlled, documented value change with regression coverage (AC10).
- Security surface: PASS — new route is self-scoped (better-auth's `setPassword` operates on `ctx.context.session.user.id`, never a request-supplied target), cannot be used to alter another account's password or role; length enforced both client and server; `role` structurally excluded from the profile-update call server-side (`input: false`), not just client-side discipline; matches the existing trust-boundary class already accepted for ADM-011's invite-accept flow, no new risk class introduced.
- Section A feasibility (backend set-password route): PASS — mechanically confirmed against installed better-auth 1.6.23 source (`setPassword` is `serverOnly`, uses `sensitiveSessionMiddleware` — no freshness/re-auth requirement, confirmed distinct from `freshSessionMiddleware`; default length bounds are exactly 8/128; `PASSWORD_ALREADY_SET` error shape resolved exactly). Zero gaps, zero conflicts.
- Section B feasibility (repoint sendStaffInvite): PASS — file/symbol names and the web route path string all confirmed exact matches by direct read. One minor gap found and folded in: the function's leading doc-comment also needs updating (E6), not just the two runtime strings the plan named.
- Section C feasibility (web accept-screen rewrite): CONCERN → resolved — 2 real plan gaps found: (1) `apps/admin`'s auth-client is missing `birthday`/`address`/`onboardedAt` in `inferAdditionalFields`, which will break typecheck on the new `updateUser` call as written (E1, added to Touchpoints/Checklist); (2) the test file's real name has a leading `-` that the original plan omitted (E2, corrected in Touchpoints/Checklist). One wording-only inaccuracy also found and corrected: step 10 described "plain `<input>` elements" as `login.tsx`'s convention, but `login.tsx` actually uses the shadcn `Input` component (E3).
- Section D feasibility (mobile route de-registration): PASS — single-line change confirmed fully isolated; `invite-accept` has no other references anywhere in `apps/mobile` source or `app.config.ts`. Zero gaps.
- Section E feasibility (backlog note): PASS — trivial doc write, no conflicts.

Open gaps:
- Step-13 interpretation (always-show-and-let-server-no-op vs. client-side pre-detect-and-skip) requires a one-line human confirmation before EXECUTE. Recommendation: accept the plan's chosen approach (always-show/server-no-op) — it satisfies both SPEC's AC4 and D4 wording without a new round-trip or a new field on `/staff-invite/consume`'s response, and is the simpler, lower-risk implementation (KISS/YAGNI).
- E1/E2/E3 (auth-client.ts field registration, test filename correction, Input/Button wording correction) are mechanically confirmed, low-risk plan corrections. They have NOT been silently applied to the plan's prose by this VALIDATE pass beyond the annotations above — real user confirmation is requested before treating them as final, per this session's explicit no-fabricated-approval instruction. Recommendation: accept all 3 as written above.
- 5-artifact high-risk evidence pack (`vc-risk-evidence-pack`): same auth/identity-adjacent trust-boundary class as ADM-011's invite-accept flow. `mustStopBeforeFinalize: true` should be set for this plan's EXECUTE, matching ADM-011's own precedent — this does not block writing this contract or block EXECUTE from starting, but EXECUTE/UPDATE PROCESS should not be treated as fully proven/ready-to-finalize until the pack exists and a reviewer decision is recorded.
- Shared-file sequencing on `staff-invite.ts` with ADM-013 remains unresolved (by design — not this plan's job to pick an order). Confirmed at this VALIDATE pass: neither ADM-012 nor ADM-013 has started EXECUTE, so there is no live contention yet; whichever lands second must re-scan-before-edit.

What this coverage does NOT prove:
- AC1–AC10, AC13 (Fully-Automated, `packages/api`/`apps/admin` integration + component tests): do NOT prove real cross-origin browser cookie behavior, real email delivery, or any visual/UX correctness of the profile/password steps (field layout, strength-meter legibility, error message placement) — those are jsdom/supertest-level assertions only.
- AC11 (`git diff --stat` + typecheck): does NOT prove the mobile app doesn't have some OTHER deep-link or external mechanism (outside the app's own source, e.g. a push-notification payload or an external service) that could still reference `invite-accept` — only proves no in-app route registration or static import exists.
- AC12 (Agent-Probe): is the only gate that exercises the real browser cross-origin cookie flow, real Tailwind/shadcn rendering, and real visual strength-meter/error-message UX end to end. Until performed, the plan is CODE DONE at best, never VERIFIED (per this plan's own Phase Completion Rules).
- No gate in this table proves behavior under concurrent/racing invite-accept attempts for the same email (e.g. two browser tabs racing `/consume` — that race is already handled by `/consume`'s existing atomic `WHERE isNull(consumedAt)` guard, unchanged by this plan, and was proven by ADM-011's own test suite, not re-proven here).

Gate: CONDITIONAL (0 FAILs; all findings are either resolved-and-folded-into-the-plan mechanical
corrections (E1/E2/E3/E5/E6/E7/E8) or a single open interpretive decision (step-13) — none require
returning to PLAN or INNOVATE, but per this session's explicit instruction, no user approval is
fabricated here)
Accepted by: user (djrixg / HyuseCS) — accepted directly in-session 21-07-26 ("ok" in the main
thread, in response to the orchestrator's surfaced V4 findings). Accepted as written: (1) step-13
interpretation (always-show password step + server `PASSWORD_ALREADY_SET` no-op), (2) E1/E2/E3 plan
corrections. Gate is now an explicitly-accepted CONDITIONAL (0 FAILs, no unresolved CONCERNs) —
EXECUTE-legal per orchestration.md §PVL routing ("explicit user acceptance of CONDITIONAL gaps
quoted this session"). `mustStopBeforeFinalize: true` remains — the 5-artifact evidence pack +
reviewer decision are still required before finalize/PR, not before EXECUTE.
NOTE: This acceptance line was written by the orchestrator (which received the user's consent
directly), not by vc-validate-agent — the validate-agent correctly declined to stamp a relayed
claim, matching this program's anti-fabrication guard.

## Autonomous Goal Block

SESSION GOAL: Ship ADM-012 — web-first staff account setup (issue #142): profile + password
onboarding on invite-accept, role-based post-accept routing, invite link repoint, mobile
invite-accept route unregistration.
Charter + umbrella plan: N/A — single standalone plan (the admin-dashboard 8-phase program is
COMPLETE and its `## Stable Program Goal` does not govern new scope, confirmed by direct
filesystem check — no umbrella plan governs this work).
Autonomy: Standard /goal autonomy rules per `process/development-protocols/orchestration.md`
§Autonomy Mode — CONDITIONAL findings are auto-fixed and execution proceeds; BLOCKED items go to
backlog with continuation; an irreversible or outward-facing action taken without explicit
contract instruction is a hard stop. This plan's Gate is CONDITIONAL with `Accepted by: PENDING` —
EXECUTE must NOT start until a real user has confirmed the step-13 interpretation and E1/E2/E3.
Hard stop conditions / safety constraints:
- Do not touch `POST /api/admin/users/:id/role` or `PATCH /api/admin/staff/:id/branch` in any way (byte-frozen).
- `role` must never be included in any `authClient.updateUser`/`auth.api.setPassword` call — structurally enforced server-side (`input: false`) but must not be relied upon alone; never add it client-side either.
- Do not delete `apps/mobile/src/app/(auth)/invite-accept.tsx` — route de-registration only.
- Do not begin EXECUTE Section C until E1 (auth-client.ts field registration) is applied — the profile-step `updateUser` call will not compile otherwise.
- Before editing `staff-invite.ts`, re-run `git log --oneline -- packages/api/src/routes/staff-invite.ts` and `git status` to confirm ADM-013 hasn't landed first (shared-file sequencing).
- High-risk (auth/identity-adjacent): do not treat EXECUTE as finalize-ready without the 5-artifact evidence pack + reviewer decision, matching ADM-011's precedent.
Next phase: EXECUTE (pending Gate: CONDITIONAL → PASS promotion via real user confirmation).
Validate contract: inline in this plan file (`## Validate Contract` section above).
Execute start: `pnpm --filter @jojopotato/api test -- staff-invite` (Section A/B fully-automated) | AC12 real-browser walkthrough (staff-role + admin-role invite) | high-risk pack: yes (mustStopBeforeFinalize, see Open gaps).
