---
phase: admin-phase-01-auth-rbac
date: 2026-07-14
status: COMPLETE
feature: admin-dashboard
plan: process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-01-auth-rbac_PLAN_14-07-26.md
---

# Phase 1 — Auth/RBAC (ADM-001) — EXECUTE Report

**TL;DR:** Shipped the first `/api/admin/*` protected surface + the first browser-cookie session
flow in the repo. All 7 automated/hybrid acceptance criteria (AC1–AC7) are GREEN — full API suite
78/78 (after the post-AC8 CORS fix, see below), typecheck/lint/build clean across `packages/api`,
`packages/types`, `apps/admin`. MFA is seam-only as specified. **AC8 (browser login walkthrough)
was RE-CLOSED**: the first manual browser pass found a real CORS defect (fixed + regression-tested),
and a re-verified walkthrough now PASSES in a real browser for all 3 roles (super_admin/customer/staff).
4 within-blast-radius deviations, all documented. Not committed (EVL + commit are orchestrator-owned).

## What Was Done

**Server (`packages/api`, `packages/types`):**
- `packages/api/src/lib/require-admin.ts` (new) — `requireAdmin(auth)` middleware mirroring
  `require-staff.ts`. Admits `role ∈ {admin, super_admin}` only (never plain `staff`), attaches
  `req.adminSession = {userId, role}` via `declare global`, returns `403 {error:'Forbidden'}` on any
  failure inside try/catch (never a 500).
- `packages/types/src/admin.ts` (new) + barrel export — `ADMIN_ROLES`, `AdminRole`, `AdminMe`
  (with the additive optional `mfaPending?: boolean` MFA seam field), `AdminUserSummary`.
- `packages/api/src/routes/admin/lib/errors.ts` (new) — `AdminApiError` (status + message), mirrors
  `OrderError` throw/catch shape exactly.
- `packages/api/src/routes/admin/users.ts` (new) — `GET /me` canary (→ `{role}` typed `AdminMe`) +
  `POST /users/:id/role` role-management route with the LOCKED guard order (5.1 inline super_admin →
  5.2 self-escalation → 5.3 Zod → 5.4 Drizzle UPDATE ... RETURNING, 404 if no row).
- `packages/api/src/routes/admin/index.ts` (new) — `adminRouter` aggregator (mounted at admin root).
- `packages/api/src/index.ts` — `import cors`; single-mount guard chain
  `app.use('/api/admin', cors({origin:[ADMIN_WEB_ORIGIN], credentials:true}), requireAdmin(auth), adminRouter)`
  placed after the `/api/staff` mount. `ADMIN_WEB_ORIGIN = process.env.ADMIN_WEB_ORIGIN ?? 'http://localhost:3100'`
  (never a wildcard).
- `packages/api/src/lib/auth.ts` — appended the admin origin to `trustedOrigins` (existing
  `jojopotato://`/`exp://` entries untouched). `role` stays `input:false`.
- `packages/api/src/lib/require-staff.ts` — resolved `TODO(STAFF-ADM)`: `assertBranchScope` gains an
  additive optional trailing `role?` param with an admin/super_admin bypass as the FIRST check;
  comments updated. Existing 2-arg callers/tests unchanged. (Confirmed: no live call site exists.)
- `packages/api/package.json` — added `cors` + `@types/cors` (+ `pnpm install`).

**Admin web (`apps/admin`):**
- `src/config/env.ts` (new) — `import.meta.env.VITE_API_URL` with `http://localhost:3000` default.
- `src/features/auth/lib/auth-client.ts` (new) — plain `createAuthClient({baseURL})` from
  `better-auth/react`, ZERO plugins + `inferAdditionalFields` for `role` typing + `credentials:'include'`.
- `src/features/auth/hooks/use-admin-auth.ts` (new) — `AdminAuthProvider` + `useAdminAuth()`:
  `{user, role, isLoading, isAdmin, signIn, signOut}`, browser-cookie-backed (no secure-store).
- `src/routes/login.tsx` (new) — email/password login OUTSIDE the `(dashboard)` group, unguarded;
  carries the Step 7.3 MFA-GATEWAY no-op comment between sign-in success and dashboard routing.
- `src/routes/(dashboard)/route.tsx` (new) — pathless layout with a `beforeLoad` guard that verifies
  the session against the REAL server (`GET /api/admin/me`), redirecting non-OK to `/login`.
- `src/routes/(dashboard)/index.tsx` (new) — dashboard landing shell (the group's only child).
- `src/components/ui/input.tsx` (new — deviation, see below).
- `src/routes/__root.tsx` — mounted `AdminAuthProvider`.
- `apps/admin/package.json` — added `better-auth` + `@jojopotato/types` (deviation) deps.

**Tests:**
- `packages/api/src/lib/__tests__/require-admin.integration.test.ts` (new) — AC1 role matrix, AC2
  self-escalation, AC3 admin-forbidden, AC4 super_admin-success, AC6 CORS (2 cases). Hermetic
  self-seeding (signUpAndGetCookie + inline env + VITEST guard), mirroring the staff test.
- `packages/api/src/lib/__tests__/require-staff.integration.test.ts` — added AC7 `assertBranchScope`
  admin/super_admin bypass cases to the existing pure-function block.

## Test Gate Outcomes (actual output)

| Gate | Command | Result |
|---|---|---|
| Full API suite | `pnpm --filter @jojopotato/api test` | **PASS — 11 files / 78 tests** (post-CORS-fix; was 75 at first close, +3 auth-route CORS regression tests) |
| require-admin (AC1–AC4, AC6) | (in above) | **PASS — 6/6** |
| require-staff (AC7 + existing) | (in above) | **PASS — 10/10** (incl. 2 new bypass cases) |
| auth AC5 regression | (in above) | **PASS — 6/6** (role-write-rejection green) |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | **PASS** |
| types typecheck | `pnpm --filter @jojopotato/types typecheck` | **PASS** |
| admin typecheck (MFA-SEAM gate) | `pnpm --filter @jojopotato/admin typecheck` | **PASS** |
| admin test (runner precedent) | `pnpm --filter @jojopotato/admin test` | **PASS — 1/1** |
| admin build (route/SSR compile) | `pnpm --filter @jojopotato/admin build` | **PASS** (client+SSR bundles for login/(dashboard)/route) |
| api + types + admin lint | `pnpm --filter … lint` | **PASS** (pre-existing MODULE_TYPELESS warning unrelated) |

**AC status table:**

| AC | Strategy | Status | Evidence |
|---|---|---|---|
| AC1 role matrix | Fully-Automated | ✅ PASS | unauth/customer/staff→403; admin/super_admin→200 + `req.adminSession` populated |
| AC2 self-escalation | Fully-Automated | ✅ PASS | super_admin self-call→400, DB row unchanged (see guard-order note) |
| AC3 admin-forbidden | Fully-Automated | ✅ PASS | admin→403, target row unchanged |
| AC4 super_admin-success | Fully-Automated | ✅ PASS | 200 + DB row updated to new role |
| AC5 role server-owned | Fully-Automated (regression) | ✅ PASS | existing auth test still green |
| AC6 cross-origin cookie | Hybrid | ✅ PASS | supertest-with-Origin variant (see note) |
| AC7 assertBranchScope bypass | Fully-Automated | ✅ PASS | admin/super_admin→true; 4 existing cases unchanged |
| AC8 login+shell walkthrough | Agent-Probe (manual, real browser) | ✅ PASS (re-verified post-fix) | first pass FAILED on CORS (see below); fixed + re-walked in Firefox — see "AC8 Verification (browser, post-fix)" |
| MFA-SEAM | Fully-Automated (typecheck) | ✅ PASS | optional field + no-op comment compile clean |

**AC2 guard-order note:** under the LOCKED order (5.1 super_admin check FIRST), the self-escalation
`400` is only reachable by a **super_admin** — a plain admin self-call is rejected `403` at 5.1
before reaching 5.2. So AC2's proving test uses a super_admin self-call → 400 (the case that
actually exercises the self-escalation guard). A plain-admin self-call → 403 is covered by AC3.

## AC6 Implementation Choice (RECORDED per plan requirement)

**Built: supertest-with-manual-Origin-header variant** (NOT a real headless browser). Reason: no
browser automation runner exists in this repo (project-wide gap, tracked in
`process/context/tests/all-tests.md`). The test proves: (a) the sign-in `Set-Cookie` round-trips and
is recognized on a follow-up cross-origin request carrying `Origin: http://localhost:3100`; (b) the
server's credentialed CORS response echoes the **exact** admin origin (never `*`) and sets
`Access-Control-Allow-Credentials: true`, on both the OPTIONS preflight and the actual GET. **What it
does NOT prove:** real browser `SameSite=Lax` enforcement / production `Secure`-cookie HTTPS behavior
— that remains AC8's Agent-Probe scope + a future E2E harness. This matches the validate-contract's
"what this coverage does NOT prove" note for AC6 verbatim.

## Plan Deviations (all within-blast-radius; documented per /goal)

1. **Admin route mount structure** — Public Contracts require `GET /api/admin/me` AND
   `POST /api/admin/users/:id/role` (two different prefixes), but the literal Step relative-paths
   couldn't both resolve under a single `/users` mount. Resolution: mounted `usersRouter` at the
   admin ROOT (`adminRouter.use('/', usersRouter)`) with handler paths `/me` and `/users/:id/role`,
   so both authoritative absolute contracts resolve exactly. Routing-detail deviation, same files,
   identical external contract.
2. **Added `apps/admin/src/components/ui/input.tsx`** — the plan's Cross-Cutting Compliance
   references composing from "P0-scaffolded Button, **Input**, Card", but P0 only scaffolded
   `button.tsx` + `card.tsx`. Added the canonical shadcn v4 `Input` primitive to honor the plan's own
   "no hand-rolled form controls" rule. Standard primitive, apps/admin UI scope.
3. **Removed P0 placeholder `apps/admin/src/routes/index.tsx`** — the pathless `(dashboard)/index.tsx`
   serves `/`, which collided with the P0 placeholder index at `/`. The guarded dashboard landing
   supersedes the placeholder (natural P0→P1 progression). `admin-home.tsx` + its test
   (`index.test.tsx`, imports the component directly) stay intact and still pass.
4. **Added `@jojopotato/types` workspace dep to `apps/admin/package.json`** — the plan's `admin.ts`
   is explicitly designed so "both `packages/api` and `apps/admin` can depend on these"; P0 hadn't
   added the dep (it excluded RN-only `packages/ui`). `packages/types` is platform-agnostic — safe
   for the web app. Required for `use-admin-auth` to derive `isAdmin` from `ADMIN_ROLES`.

No hard-stop-class deviations. The auth/CORS/trustedOrigins/role-management surface changes are all
explicitly authorized by the plan + validate-contract.

## What Was Skipped or Deferred

- **AC8 (Agent-Probe browser walkthrough)** — deferred to a manual/agent walkthrough. No automated
  browser E2E runner exists for `apps/admin` (project-wide, already-tracked gap). Server-side
  enforcement (AC1) is automated-proven, so the deferral is the client-side convenience layer only.
- **MFA/TOTP** — seam only, by design. No `twoFactor` plugin, no migration, no enrollment/verify
  routes, no env flag. Shipped: `AdminMe.mfaPending?` optional field + the login.tsx no-op comment.

## Test Infra Gaps Found

- **No headless-browser / E2E runner for `apps/admin`** — forced AC6 into the supertest-CORS variant
  and AC8 into manual Agent-Probe. This is the same project-wide gap tracked in
  `process/context/tests/all-tests.md` and `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.
  Not new; no new backlog note warranted.
- **No new stubs/backlog created** — every developed behavior in this phase is proven by a
  Fully-Automated or Hybrid gate. No section rests on Known-Gap alone (vacuous-green check clears).

## High-Risk Evidence Pack (auth/identity)

5-artifact pack written to
`process/features/admin-dashboard/active/admin-dashboard_14-07-26/harness/`:
`risk-gate.json` (mustStopBeforeFinalize + risk class), `context-snippets.json` (6 load-bearing
citations), `verification.json` (12 verification steps incl. happy + boundary/failure),
`adversarial-validation.json` (8 attack scenarios ruled out), `review-decision.json` (APPROVE).

## Closeout Packet

- **Selected plan:** `phase-01-auth-rbac_PLAN_14-07-26.md`
- **Finished:** Implementation Steps 1–7 (Step 0 probe pre-done). AC1–AC7 + MFA-SEAM automated-green.
- **Verified vs unverified:** AC1–AC7 automated-verified; AC6 server-CORS-verified (both `/api/admin`
  and, after the post-AC8 fix, `/api/auth`); AC8 now browser-verified (see "AC8 Verification
  (browser, post-fix)" below) — no longer unverified.
- **Cleanup remaining (UPDATE — resolved this pass):** EVL confirmation ✅ DONE (independent
  vc-tester re-run, all gates green); context delta ✅ DONE (`all-context.md`/`tests/all-tests.md`
  updated, `auth/` context-group candidate flagged as recommendation, not created); commit still
  pending (user commits manually, plan below). AC8 manual walkthrough remains Agent-Probe-recorded
  manual-pending — non-blocking, same treatment as P0's visual ACs.
- **Best next state:** user commits (execution commit, then process commit — see plan above), then
  proceed to Phase 2 (Branches CRUD, ADM-002), Step 0 RESEARCH.
- **Closeout classification (UPDATE):** **✅ VERIFIED** — automated/hybrid gates green
  (AC1-AC7 + MFA-SEAM), independently EVL-confirmed (75/75 + all typecheck/lint/build gates); AC8
  is Agent-Probe-recorded manual-pending, consistent with the umbrella's precedent for Agent-Probe
  tiers (not a blocker for phase VERIFIED status).

## EVL Confirmation (independent vc-tester re-run, per EVL HANDOFF SUMMARY)

The orchestrator's independent EVL confirmation run re-ran the exact validate-contract gate
commands (not just execute-agent's self-report) and confirmed all green (first pass):
`api-test-75/75, api-typecheck, types-typecheck, admin-typecheck, admin-build, admin-test,
api-lint, types-lint, admin-lint`. `closeout_classification: CLEAN`. A SECOND independent EVL
confirmation ran after the post-AC8 CORS fix: `api-test-78/78, api-typecheck` — both green, no
regression (see "AC8 Verification (browser, post-fix)" below). One known gap CLOSED, one carried
forward:
1. **AC8-agent-probe-pending — CLOSED.** Originally recorded as Agent-Probe-only manual-pending.
   The manual browser walkthrough has now actually run (Firefox, all 3 roles) and PASSED post-fix.
   No longer a carried-forward gap.
2. **malformed-id-role-route-500-not-404** — a malformed `:id` on
   `POST /api/admin/users/:id/role` surfaces as a 500 rather than a 404 (a documented guard-order
   side effect, non-exploitable, reachable only by an already-authenticated `super_admin`). Tracked
   as a known gap, not fixed this phase (out of blast radius).

No follow-up stubs were required (`follow_up_stubs: none`) and no context areas were left partial
(`context_partial: []`).

## UPDATE PROCESS Cleanup (14-07-26)

- Fixed the P0 leftover `apps/admin/src/routes/index.test.tsx` — the un-prefixed test file inside
  `apps/admin/src/routes/` made TanStack Start's route generator warn on every dev boot that it
  "does not export a Route". Renamed to `apps/admin/src/routes/-index.test.tsx` (the leading `-`
  makes the route generator ignore it while vitest still discovers it via the `*.test.tsx` glob).
  Confirmed `pnpm --filter @jojopotato/admin test` still passes (1/1) and `pnpm --filter
  @jojopotato/admin build` is clean.
- Phase Loop Progress (Steps 5-7) ticked; plan header status updated to ✅ VERIFIED.
- Umbrella `## Current Execution State` rewritten: Phase 1 now in Completed phases; current phase
  advanced to Phase 2 (Branches CRUD, ADM-002); Program Net Gate updated to 2/8 VERIFIED.
- `process/context/all-context.md` and `process/context/tests/all-tests.md` updated with the
  Phase 1 delta (new `/api/admin/*` surface, browser-cookie session flow, `admin.ts` types,
  role-management route, resolved `TODO(STAFF-ADM)` seam, MFA/TOTP structural seam, the
  `-index.test.tsx` rename convention, the new integration test, and the native-Postgres-port
  dev-machine gotcha). `auth/` context-group threshold flagged as a strong candidate (now 3
  narratives) but NOT created this pass — recommendation only, per UPDATE PROCESS scope discipline.
- Memory: new durable fact captured — better-auth's default browser-cookie session works with zero
  extra plugins when adding a new (non-Expo) client to an existing instance (`~/.claude/projects/
  -home-hyuse-Desktop-jojo-mobile/memory/better-auth-browser-cookie-zero-plugins.md`).
- Task folder stays in `active/` — this is a phase program and Phase 1 is one of 8 phases; only
  the whole program folder moves to `completed/` once all 8 phases verify.
- Not committed — per standing rule, the user commits manually. Suggested commit plan: 1) execution
  commit (`packages/api`, `packages/types`, `apps/admin` changes + the `harness/` evidence pack +
  the `-index.test.tsx` rename), 2) separate process commit (plan/umbrella/context/report updates).

## Forward Preview

- **Test Infra Found:** `apps/admin` vitest (jsdom + @testing-library/react) renders components; API
  vitest self-seeds ephemeral `<db>_test` against native Postgres (host 5432 native service — NOT
  docker compose; `jojo` role has CREATEDB). AC6/AC8 need a future browser E2E runner.
- **Blast Radius Changes:** P2–P7 admin route files append to `adminRouter` (inherit CORS +
  requireAdmin automatically) and add sibling child routes to the `(dashboard)` group (never
  restructure). `AdminApiError` is the shared admin error class. `apps/admin` now depends on
  `@jojopotato/types` + `better-auth`.
- **Commands to Stay Green:** `DATABASE_URL=postgres://jojo:jojo@localhost:5432/jojopotato BETTER_AUTH_SECRET=… BETTER_AUTH_URL=http://localhost:3000 pnpm --filter @jojopotato/api test`;
  `pnpm --filter @jojopotato/{api,types,admin} typecheck`; `pnpm --filter @jojopotato/admin test`.
  After adding admin route files, run `pnpm --filter @jojopotato/admin generate-routes`.
- **Dependency Changes:** `packages/api` +`cors`/`@types/cors`; `apps/admin` +`better-auth`/`@jojopotato/types`.

## CORS Fix (post-AC8)

**Reopens AC8** — the manual browser walkthrough must be re-verified after this fix.

**Defect (found in AC8 manual browser walkthrough).** The admin web app at
`http://localhost:3100` could not log in. Phase 1 mounted credentialed CORS only on `/api/admin`,
but the admin browser client (`better-auth/react`) ALSO calls `/api/auth/*` cross-origin
(`get-session`, `sign-in/email`, `sign-out`). Those responses carried NO
`Access-Control-Allow-Origin` header, so the browser blocked them:
- Console: `Cross-Origin Request Blocked … /api/auth/get-session (Reason: CORS header
  'Access-Control-Allow-Origin' missing)`; `/api/auth/sign-in/email` preflight OPTIONS → 404 →
  `NetworkError`.
- curl: `OPTIONS /api/auth/sign-in/email` (Origin `:3100`) → 404, no CORS headers; `POST` same →
  200 but no ACAO. Contrast `OPTIONS /api/admin/me` → 204 WITH ACAO.

**Root cause.** Two SEPARATE layers were conflated. `trustedOrigins` (auth.ts:83, already listing
`:3100`) is better-auth's CSRF/redirect allowlist — it does NOT emit HTTP CORS response headers.
The browser's cross-origin block is governed by the CORS-header layer, which Phase 1 only applied
to `/api/admin`, never to the better-auth `/api/auth/*` routes.

**Fix (minimal, additive, mobile-safe).** In `packages/api/src/index.ts`:
1. Extracted ONE shared middleware `const adminCors = cors({ origin: [ADMIN_WEB_ORIGIN],
   credentials: true })` (reusing the existing `ADMIN_WEB_ORIGIN` constant — no second hardcoded
   origin).
2. Mounted `app.use('/api/auth', adminCors)` BEFORE the better-auth handler
   (`app.all('/api/auth/*splat', toNodeHandler(auth))`), so cors() (a) answers the preflight
   OPTIONS with ACAO/credentials and (b) adds ACAO to the actual sign-in/get-session/sign-out
   responses. Ordering preserved: `express.json()` still mounts AFTER the auth handler, and cors()
   only sets headers / short-circuits OPTIONS — it never consumes the raw body better-auth needs.
3. Replaced the inline duplicate `cors(...)` at the `/api/admin` mount with the same `adminCors` —
   one definition, two mount points, zero drift.

**Mobile safety.** The Expo app sends no `Origin` header (native fetch / bearer tokens, not a
browser origin), so cors() passes it through untouched — no ACAO added, never blocked. Only
browser requests from `:3100` get ACAO; any other browser origin gets none (correctly blocked).
This is proven by the new no-Origin regression test.

**New regression test** (`require-admin.integration.test.ts`, `describe('auth-route CORS for the
admin browser origin (post-AC8 regression)')` — closes the AC6 gap that only tested `/api/admin`
CORS, never `/api/auth`):
1. `OPTIONS /api/auth/sign-in/email` (Origin `:3100`) → 2xx/204 WITH `ACAO: :3100` +
   `Access-Control-Allow-Credentials: true` (not 404).
2. Real `POST /api/auth/sign-in/email` (Origin `:3100`, seeded user) → 200 WITH ACAO.
3. `POST /api/auth/sign-in/email` WITHOUT Origin header → 200, ACAO absent (mobile-path guard).

**Port / CORS consistency verification (no drift found — all confirmed consistent):**
- API port: `3000` (index.ts `PORT ?? 3000`) — shared by mobile + admin, unchanged.
- Admin dev port: `3100` (apps/admin/package.json `vite dev --port 3100`) — no collision.
- Mobile Metro: `8081` (apps/mobile/scripts/dev-with-tunnel.mjs `START_PORT=8081`, auto-increments);
  mobile has zero references to `3100` (grep-confirmed). The `(staff)` group is inside apps/mobile
  — no own port.
- `ADMIN_WEB_ORIGIN` default `http://localhost:3100` (index.ts:24) == `trustedOrigins` entry
  (auth.ts:83) == the origin used by BOTH CORS mounts (single `adminCors` constant).
- Admin `VITE_API_URL` default `http://localhost:3000` (apps/admin/src/config/env.ts:7) ==
  apps/admin/.env.example == the API port.
- No port value changed — they were already correct and non-conflicting.

**Gate outcomes:**
- `pnpm --filter @jojopotato/api typecheck` → PASS (clean).
- `pnpm --filter @jojopotato/api test` → PASS, 78/78 (require-admin suite 6 → 9 tests; the 3 new
  auth-CORS tests green). Run against native Postgres
  (`postgresql://jojo:jojopotato@localhost:5432/jojopotato`, migrations applied) — docker compose
  is unavailable on this box (native Postgres owns :5432).
- Harness validators NOT run (no harness files touched).

## AC8 Verification (browser, post-fix)

**EVL reconfirmation (independent vc-tester re-run, post-CORS-fix):** `pnpm --filter @jojopotato/api
test` → **78/78** (11 files), `pnpm --filter @jojopotato/api typecheck` → PASS. No regression against
any Phase 1 gate (AC1–AC7, MFA-SEAM all still green). This supersedes the 75/75 figure recorded
earlier in this report at first close.

**Browser walkthrough (orchestrator-driven, Firefox, `http://localhost:3100`), all 3 roles:**

| Role | Test account | Result |
|---|---|---|
| super_admin | `admin@jojopotato.local` | Reaches dashboard shell — "Signed in as admin@jojopotato.local (super_admin)". Screenshot: `apps/admin/ac8-admin-dashboard.png` |
| customer | `jojo@test.com` | Rejected — stays on `/login`, no shell reached |
| staff | `staff-branch1@jojopotato.local` | Rejected — stays on `/login`, no shell reached |

Server-side enforcement additionally curl-proven independent of the browser session: `customer` and
`staff` → `GET /api/admin/me` → `403`; `super_admin` → `200`.

**Bootstrap note (operational, not a defect):** no admin/super_admin user is seeded by
`packages/api/src/db/seed/seed.ts` (seed only creates `staff` + 2 `customer` users). The
`admin@jojopotato.local` super_admin account used for this AC8 pass was manually bootstrapped:
(1) `POST /api/auth/sign-up/email` to create the user via the normal signup flow, then (2) a direct
DB write `UPDATE users SET role='super_admin' WHERE email='admin@jojopotato.local'` against
`postgresql://jojo:jojopotato@localhost:5432/jojopotato` — the app's own role-management route
cannot mint the first super_admin (it requires an already-existing super_admin caller). See the
recommendation in the umbrella/context updates to seed a dev-only admin going forward.

**AC8 verdict: PASS (browser-verified)** — no longer Agent-Probe-deferred/manual-pending; the
walkthrough happened and passed for all 3 roles after the CORS fix.

**Not done (orchestrator-owned):** no git commit yet (execution + process commits still pending,
see the updated commit plan in the umbrella `## Current Execution State`); loop-progress ticks and
umbrella state ARE updated as part of this UPDATE PROCESS re-close pass.
