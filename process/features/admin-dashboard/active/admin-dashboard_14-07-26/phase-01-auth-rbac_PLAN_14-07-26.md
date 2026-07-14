---
name: plan:admin-phase-01-auth-rbac
description: "Admin Dashboard Phase 1 — requireAdmin guard, browser cookie session, admin login shell, super_admin role management"
date: 14-07-26
feature: admin-dashboard
phase: 1
---

# Phase 1 — Auth/RBAC (ADM-001, #39)

**Date:** 14-07-26
**Complexity:** COMPLEX (foundational auth surface + new session model)
**Status:** ⏳ PLANNED

Date: 14-07-26
Status: PLANNED
Complexity: COMPLEX

---

## Phase Completion Rules

This phase is CODE DONE when all Implementation Steps are applied and Acceptance Criteria 1-7
(automated/hybrid) pass. This phase is VERIFIED only when, in addition, AC8 (Agent-Probe) has been
walked through and the validate-contract's gates all show PASS — matching the umbrella's
Phase Ordering / Program Status Table conventions (⏳ PLANNED → 🔨 CODE DONE → 🧪 TESTING →
✅ VERIFIED).

## Overview

This phase builds the first protected `/api/admin/*` surface and the first **browser cookie**
session flow in this repo (today only the Expo bearer-token flow exists — `auth-client.ts` via
`@better-auth/expo`). It mirrors the STAFF-001 pattern (`requireStaff` guard, router-level mount,
`packages/types/src/staff.ts` shape) but is NOT staff — `requireAdmin` admits only `admin` and
`super_admin`, never plain `staff`.

Four deliverables:
1. `requireAdmin(auth)` middleware + `/api/admin` mount + CORS/`trustedOrigins` for the admin web origin.
2. A proven browser-cookie-session flow for `apps/admin` (via a feasibility probe first — see Step 0).
3. `GET /api/admin/me` canary + `packages/types/src/admin.ts` (mirrors `staff.ts`).
4. `POST /api/admin/users/:id/role` role-management route (super_admin-only, self-escalation guard)
   + resolution of the `TODO(STAFF-ADM)` seam in `require-staff.ts`.
5. `apps/admin` real login screen + role-gated dashboard-landing shell (depends on P0 scaffold).

This phase is gating: every later phase's `apps/admin` screens depend on the session/auth seam
established here, and every later phase's `/api/admin/*` route depends on `requireAdmin`.

---

## Cross-Cutting Compliance

**Modularity:** `requireAdmin` lives in its own file (`packages/api/src/lib/require-admin.ts`),
sibling to `require-staff.ts` — not folded into `require-staff.ts`. `/api/admin/*` routes live under
`packages/api/src/routes/admin/` as one file per domain; this phase adds only
`packages/api/src/routes/admin/index.ts` (router aggregator) and
`packages/api/src/routes/admin/users.ts` (the `me` canary + role-management route). Later phases add
sibling files to the same `admin/` router — this phase must NOT hardcode a flat single-file router
that later phases would need to refactor. App side: `apps/admin/src/features/auth/**` is its own
feature folder (hooks, lib, screens), mirroring `apps/mobile/src/features/auth/`.

**Clarity:** Response envelopes match the `{ resource: ... }` / `{ resources: [...] }` family already
used by `staff.ts`/`orders.ts`/`branches.ts` routes. Errors follow the `OrderError`
(`packages/api/src/routes/orders.ts:39-47`) typed-error pattern — this phase introduces
`AdminApiError` (shared, in `packages/api/src/routes/admin/lib/errors.ts`) for all `/api/admin/*`
routes, reused by every later phase's admin route file. Zod `safeParse` validates the role-change
request body. Naming matches repo convention: kebab-case files, camelCase functions, PascalCase
components.

**Safety:** The role-management route is the ONLY sanctioned write path for `role` — `role` stays
`input: false` in better-auth (`auth.ts:64-70`, unchanged by this phase). Two non-negotiable guards,
both server-side and unconditional: (a) self-escalation — an actor can never change its own role
via this route (checked before any DB write); (b) admin-vs-super_admin — only `super_admin` may call
the route at all (checked by `requireAdmin`-plus-role-check, not merely UI hiding). No soft-delete
concern in this phase (no destructive data ops — role changes are mutations, not deletes, and are
fully reversible by another super_admin call).

**Security:** `/api/admin/*` is guarded ONCE at `app.use('/api/admin', requireAdmin(auth), adminRouter)`
in `index.ts` (mirrors `app.use('/api/staff', requireStaff(auth), staffRouter)` at
`index.ts:51`) — every later phase's admin route inherits the guard automatically by being added to
`adminRouter`, never by re-checking role inline per-handler. `trustedOrigins` in `auth.ts:79` gains
the admin web dev origin (e.g. `http://localhost:3001` — confirm the actual dev port during
RESEARCH/P0 scaffold) — never a wildcard. All admin route inputs (role-change body) are Zod-validated
server-side.

---

## Touchpoints

| File | Change |
|---|---|
| `packages/api/src/lib/require-admin.ts` (new) | `requireAdmin(auth)` middleware, mirrors `require-staff.ts:55-80` |
| `packages/api/src/lib/require-staff.ts:65-67,103` | Resolve `TODO(STAFF-ADM)` — admin/super_admin bypass `assertBranchScope` |
| `packages/api/src/lib/auth.ts:79` | Add admin web dev origin to `trustedOrigins` array |
| `packages/api/src/index.ts` | `import cors from 'cors'` + CORS middleware scoped to `/api/admin`; `app.use('/api/admin', requireAdmin(auth), adminRouter)` mount (mirrors line 51) |
| `packages/api/src/routes/admin/index.ts` (new) | `adminRouter` aggregator — mounts `users.ts` sub-routes; later phases mount their own sub-routers here |
| `packages/api/src/routes/admin/users.ts` (new) | `GET /me` canary, `POST /:id/role` role-management route |
| `packages/api/src/routes/admin/lib/errors.ts` (new) | `AdminApiError` typed error, mirrors `orders.ts:39-47` |
| `packages/types/src/admin.ts` (new) | `ADMIN_ROLES`, `AdminRole`, `AdminMe`, `AdminUserSummary` types, mirrors `staff.ts` |
| `packages/api/package.json` | Add `cors` + `@types/cors` dependency (confirm not already present) |
| `apps/admin/src/features/auth/hooks/use-admin-auth.ts` (new) | Session hook — cookie-session client, mirrors `apps/mobile/.../use-auth.ts` shape (`user`, `role`, `isLoading`, `signIn`, `signOut`) |
| `apps/admin/src/features/auth/lib/auth-client.ts` (new) | better-auth **browser** client (plain `createAuthClient` from `better-auth/react` or `better-auth/client`, NOT `@better-auth/expo`) |
| `apps/admin/src/routes/login.tsx` (new, exact path depends on P0's router file convention) | Admin login screen (email/password) |
| `apps/admin/src/routes/(dashboard)/index.tsx` or equivalent shell route (new) | Role-gated dashboard landing shell |
| `packages/api/src/lib/__tests__/require-admin.integration.test.ts` (new) | Integration tests, mirrors `require-staff.integration.test.ts` |
| `packages/api/src/lib/__tests__/require-admin.unit.test.ts` (new, if `assertBranchScope`-style pure logic is extracted) | Pure-function unit tests for self-escalation / role-matrix guard |

---

## Public Contracts

**`requireAdmin(auth): RequestHandler`** (`packages/api/src/lib/require-admin.ts`)
- Signature and behavior mirror `requireStaff` (`require-staff.ts:55-80`) exactly, substituting the
  admitted role set: `role ∈ {'admin', 'super_admin'}` (NOT `staff`).
- On success: attaches `req.adminSession = { userId: string; role: AdminRole }` and calls `next()`.
- On failure (no session, or role not admin/super_admin): `403 { error: 'Forbidden' }` — same
  no-leak-on-failure behavior as `requireStaff` (catches internally, never a 500).

**`GET /api/admin/me`** → `200 { role: AdminRole }` (mirrors `StaffMe` shape but has no
`assignedBranch` concept — admin/super_admin are not branch-scoped). `403` if not admin/super_admin
(via `requireAdmin`). Response type: `AdminMe` (`packages/types/src/admin.ts`).

**`POST /api/admin/users/:id/role`** — body: `{ role: 'admin' | 'staff' | 'customer' }` (Zod-validated
against `userRoleEnum` minus a promotion-to-super_admin path — decide during RESEARCH whether
super_admin can grant super_admin; default per charter: only `super_admin` calls this route at all,
and it MAY set target role to any of `customer | staff | admin | super_admin` EXCEPT it must reject
setting the caller's own `id`).
- `403` if caller is not `super_admin` (checked in addition to `requireAdmin`'s admin-or-super_admin
  gate — this route needs the STRICTER super_admin-only check, done as a second guard inside the
  handler or a dedicated `requireSuperAdmin` wrapper — decide in RESEARCH/INNOVATE which is cleaner;
  either way it must be a real server check, not a route that trusts a client role flag).
- `400 { error: 'Cannot modify own role' }` if `req.params.id === req.adminSession.userId`
  (self-escalation guard — checked BEFORE any DB write, unconditional).
- `200 { resource: AdminUserSummary }` on success (updated user's id/email/role).
- `404 { error: 'User not found' }` if target id doesn't exist.

**`packages/types/src/admin.ts`** (new, mirrors `staff.ts` shape):
```
export const ADMIN_ROLES = ['admin', 'super_admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export interface AdminMe { role: AdminRole; }
export interface AdminUserSummary { id: string; email: string; role: 'customer' | 'staff' | 'admin' | 'super_admin'; }
```
(Exact shape finalized during EXECUTE if RESEARCH surfaces a need for more fields — e.g. `name` —
keep additive, never remove the above.)

**Browser cookie session contract (apps/admin):** `apps/admin`'s `auth-client.ts` uses the plain
better-auth browser client against `${API_URL}/api/auth/*` (same mount as the Expo client already
uses — `index.ts:35`). No new better-auth instance, no new plugin registration beyond what
Phase 1's feasibility probe proves is needed (e.g. confirming default cookie session works with no
plugin, OR that a `nextCookies`/session-cookie-cache tweak is required for a plain fetch-based SPA).

---

## Blast Radius

- **Packages touched:** `packages/api` (lib, routes, index.ts mount, package.json dep), `packages/types`
  (new file), `apps/admin` (new feature folder + 2 routes) — 3 packages.
- **Risk class:** HIGH — this phase is `auth or identity` (new session model + new protected surface)
  AND touches the shared `trustedOrigins`/CORS config (a security-adjacent shared surface). Per
  `vc-test-coverage-plan` High-Risk Classes table, this mandates at minimum a Hybrid test tier for
  every auth-adjacent area — Known-Gap is not acceptable without explicit documented rationale.
- **File count estimate:** ~12 new/changed files (see Touchpoints) — comfortably within COMPLEX-plan
  territory but not a multi-package sprawl.
- **Shared-surface conflict note:** `packages/api/src/index.ts` mount ordering and
  `packages/types/src/admin.ts` are both flagged in the umbrella's `## Pre-PVL Conflict Resolution`
  placeholder as surfaces later phases will extend (not create) — this phase OWNS their creation;
  later phases must only append, never restructure, without a cross-phase note.

---

## Implementation Checklist (Phased Delivery Plan)

See the ordered, executable steps below (Implementation Steps 0-7).

## Implementation Steps

**Step 0 — Feasibility probe (GATING, run before INNOVATE/PLAN lock the session design):**
0.1. Emit `VC-FEASIBILITY-PROBE-NEEDED: Does better-auth's default cookie session work end-to-end
     for a plain browser fetch client (no Expo plugin) against the existing betterAuth() instance in
     auth.ts, without additional plugins? — cost-class: cheap-local` and route per
     `orchestration.md` §VC-FEASIBILITY-PROBE-NEEDED Signal Routing.
0.2. Probe scope: stand up a throwaway browser-client fetch (or a `supertest` cookie-jar
     round-trip) against the existing `app` export (`packages/api/src/index.ts`) hitting
     `/api/auth/sign-in/email` then a follow-up authenticated request with the returned
     `Set-Cookie`. Confirm: (a) cookie is set with correct `SameSite`/`Secure` defaults for a
     same-origin-in-dev / cross-origin-in-prod setup; (b) `trustedOrigins` addition is sufficient
     for CORS+credentials to work from a real browser origin (not just supertest).
0.3. Record verdict + "Resulting Design Constraint" (licenses/forbids/uncertain) before proceeding —
     this determines whether Step 3 below needs a plugin/cookie-cache tweak or is a plain client.

**Step 1 — `requireAdmin` middleware.**
1.1. Create `packages/api/src/lib/require-admin.ts`. Copy the structure of `require-staff.ts:55-80`
     (session fetch via `auth.api.getSession`, `toHeaders` helper — either import a shared helper or
     duplicate the small private `toHeaders` function, matching existing duplication precedent since
     `require-staff.ts`'s `toHeaders` is not exported).
1.2. Define `isAdminRole(role)` checking `role ∈ {'admin', 'super_admin'}` (import `ADMIN_ROLES` from
     `packages/types/src/admin.ts` — Step 2 must land first or be done in the same commit).
1.3. On success, attach `req.adminSession = { userId, role }` (extend the `Express.Request`
     interface via `declare global` block, same pattern as `require-staff.ts:15-31`).
1.4. On failure, `403 { error: 'Forbidden' }`, wrapped in try/catch (never leak internals — mirror
     `require-staff.ts:75-78`).

**Step 2 — `packages/types/src/admin.ts`.**
2.1. Create the file per the Public Contracts section above: `ADMIN_ROLES`, `AdminRole`, `AdminMe`,
     `AdminUserSummary`.
2.2. Export from `packages/types/src/index.ts` (confirm existing barrel-export pattern by checking
     how `staff.ts` is exported).

**Step 3 — CORS + `trustedOrigins` + mount.**
3.1. Add `cors` (+ `@types/cors` if not already a transitive dep) to `packages/api/package.json`.
     Run `pnpm install` (workspace-aware) after adding.
3.2. In `packages/api/src/index.ts`, import `cors` and apply it scoped to `/api/admin` (e.g.
     `app.use('/api/admin', cors({ origin: [adminWebOrigin], credentials: true }), requireAdmin(auth), adminRouter)`)
     — confirm exact dev port for `apps/admin` from the P0 scaffold plan/report before hardcoding;
     read from an env var (e.g. `ADMIN_WEB_ORIGIN`) with a dev-only fallback, never inline a bare
     string with no override.
3.3. Add the same origin to `auth.ts:79`'s `trustedOrigins` array (append, do not replace the
     existing `jojopotato://`/`exp://` entries).
3.4. Create `packages/api/src/routes/admin/index.ts` as the `adminRouter` aggregator (an Express
     `Router()` that mounts `usersRouter` from `./users.ts`) and mount it:
     `app.use('/api/admin', ...guards, adminRouter)` in `index.ts`, placed after the `/api/staff`
     mount (mirrors ordering, does not need to precede it — confirm no ordering conflict during
     EXECUTE).

**Step 4 — `AdminApiError` + `GET /api/admin/me`.**
4.1. Create `packages/api/src/routes/admin/lib/errors.ts` with `AdminApiError` mirroring
     `OrderError` (`orders.ts:39-47`) — a typed error class with `statusCode` + `message`.
4.2. Create `packages/api/src/routes/admin/users.ts`: `GET /me` handler reads `req.adminSession`
     (attached by `requireAdmin`) and responds `200 { role: req.adminSession.role }` typed as
     `AdminMe`.

**Step 5 — Role-management route + resolve `TODO(STAFF-ADM)`.**
5.1. In `users.ts`, add `POST /:id/role`. Guard: require `req.adminSession.role === 'super_admin'`
     (a second check beyond `requireAdmin`'s admin-or-super_admin gate — either inline in the
     handler or via a small `requireSuperAdmin` wrapper reusing `req.adminSession`; decide during
     EXECUTE which reads clearer, document the choice in the phase report).
5.2. Add the self-escalation guard: `if (req.params.id === req.adminSession.userId) return
     AdminApiError(400, 'Cannot modify own role')` — placed BEFORE any DB read/write.
5.3. Zod-validate body `{ role: z.enum(['customer','staff','admin','super_admin']) }`.
5.4. DB write: `UPDATE users SET role = $role WHERE id = $id RETURNING id, email, role` (Drizzle
     `.update(users).set({ role }).where(eq(users.id, id)).returning(...)`), 404 if no row.
5.5. Resolve `TODO(STAFF-ADM)` in `require-staff.ts`: update the comment at lines 65-67 to remove
     the "for now" language, and update `assertBranchScope` (or its call site in `staff.ts`/wherever
     it's invoked) so that when `role ∈ {'admin','super_admin'}` the branch-scope check is bypassed
     entirely (return `true` unconditionally) rather than falling through to the `staff`-only logic.
     Add/adjust the pure-function unit test for `assertBranchScope` to cover the admin-bypass case.

**Step 6 — `apps/admin` auth client + hook.**
6.1. Create `apps/admin/src/features/auth/lib/auth-client.ts`: a plain browser better-auth client
     (`createAuthClient({ baseURL: ... })` from the browser/react entrypoint, NOT `@better-auth/expo`)
     — confirm the exact import path and any config needed based on the Step 0 probe verdict.
6.2. Create `apps/admin/src/features/auth/hooks/use-admin-auth.ts`: `AdminAuthProvider` +
     `useAdminAuth()` exposing `{ user, role, isLoading, isAdmin, signIn, signOut }` — mirrors the
     shape of `apps/mobile/src/features/auth/hooks/use-auth.ts` but browser-cookie-backed, no
     `expo-secure-store` persistence (the browser handles cookie persistence natively).

**Step 7 — Login screen + role-gated dashboard shell.**
7.1. Build the admin login screen (email/password form → `authClient.signIn.email(...)`) at
     whatever router convention P0 established (TanStack Start file-based routing — confirm exact
     path from the P0 scaffold plan/report).
7.2. Build a role-gated dashboard-landing shell: unauthenticated → redirect to login;
     authenticated-but-not-admin (customer/staff) → reject (403 page or redirect, NOT a silent
     fallback); authenticated admin/super_admin → render the shell. The server remains the source of
     truth — the client gate is convenience only, since every `/api/admin/*` call is independently
     guarded by `requireAdmin`.

---

## Acceptance Criteria

1. **AC1 — requireAdmin role-matrix (mirrors `require-staff.integration.test.ts`):** a supertest
   suite proves: unauthenticated → `403`; customer session → `403`; staff session → `403`; admin
   session → `200` + `req.adminSession` populated; super_admin session → `200` + `req.adminSession`
   populated. *Proven by: `packages/api/src/lib/__tests__/require-admin.integration.test.ts` — strategy: Fully-Automated.*
2. **AC2 — self-escalation rejected:** an admin (or super_admin) calling
   `POST /api/admin/users/:ownId/role` with any role value receives `400 { error: 'Cannot modify own
   role' }` and the DB row is unchanged (verified by a follow-up read). *Proven by:
   `require-admin.integration.test.ts` self-escalation case — strategy: Fully-Automated.*
3. **AC3 — admin cannot call role-management route:** a plain `admin`-role session calling
   `POST /api/admin/users/:otherId/role` receives `403`, and the target user's role is unchanged.
   *Proven by: `require-admin.integration.test.ts` admin-forbidden case — strategy: Fully-Automated.*
4. **AC4 — super_admin CAN promote/demote another user:** a `super_admin` session calling the route
   against a different user's id succeeds (`200`) and the DB row reflects the new role on a
   follow-up read. *Proven by: `require-admin.integration.test.ts` super_admin-success case —
   strategy: Fully-Automated.*
5. **AC5 — `role` stays server-owned:** attempting to set `role` via the existing
   `authClient.updateUser` self-service path (the onboarding-era client field write) is rejected/
   ignored by better-auth (`input: false`, unchanged) — regression check only, not new code.
   *Proven by: existing `auth.integration.test.ts` role-write-rejection case (no new test needed;
   confirm it still passes) — strategy: Fully-Automated (regression).*
6. **AC6 — browser cookie session round-trips:** a probe (or a real integration test built on the
   Step 0 probe's technique) proves sign-in via `/api/auth/sign-in/email` returns a `Set-Cookie`
   that a subsequent authenticated request (with that cookie) accepts, from a cross-origin browser
   context matching the `trustedOrigins`/CORS config added in Step 3. *Proven by: Step 0's
   feasibility-probe VERDICT artifact + a hybrid test exercising the same round-trip with the real
   admin web origin — strategy: Hybrid (requires the admin origin/cors config to be live).*
7. **AC7 — `assertBranchScope` admin bypass:** a unit test proves `assertBranchScope` (or its
   updated call site) returns `true` unconditionally when the caller's role is `admin` or
   `super_admin`, regardless of `assignedBranchId`/`requestedBranchId` values. *Proven by: new/updated
   pure-function unit test in `require-staff` test suite — strategy: Fully-Automated.*
8. **AC8 — admin login + dashboard shell (agent-probe):** a manual/agent walkthrough confirms: (a)
   an admin/super_admin user can log in via the browser and reach the dashboard shell; (b) a
   customer or staff-role user attempting the same login is rejected and cannot view the shell
   content (client-side reject observed; server-side guard is what actually enforces it — see AC1).
   *Proven by: Agent-Probe walkthrough — strategy: Agent-Probe (no automated RN/browser E2E runner
   exists yet for `apps/admin`, project-wide gap — see `process/context/tests/all-tests.md`).*

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `require-admin.integration.test.ts` — full role matrix (unauth/customer/staff/admin/super_admin) | Fully-Automated | AC1 |
| `require-admin.integration.test.ts` — self-escalation rejected | Fully-Automated | AC2 |
| `require-admin.integration.test.ts` — admin forbidden from role route | Fully-Automated | AC3 |
| `require-admin.integration.test.ts` — super_admin promotes/demotes another user | Fully-Automated | AC4 |
| `auth.integration.test.ts` — existing role-write-rejection (regression re-run) | Fully-Automated | AC5 |
| Feasibility probe VERDICT (Step 0) + hybrid cross-origin cookie round-trip test | Hybrid | AC6 |
| `require-staff` unit test — `assertBranchScope` admin/super_admin bypass | Fully-Automated | AC7 |
| Agent-Probe: admin login + role-gated shell walkthrough (admit admin, reject customer/staff) | Agent-Probe | AC8 |

---

## Test Infra Improvement Notes

(none identified yet)

---

## Phase Loop Progress

- [ ] 1. RESEARCH
- [ ] 2. INNOVATE
- [ ] 3. PLAN-SUPPLEMENT
- [ ] 4. PVL (validate-contract)
- [ ] 5. EXECUTE
- [ ] 6. EVL
- [ ] 7. UPDATE-PROCESS

---

## Resume and Execution Handoff

1. **Selected plan file path (primary execute anchor for this phase):** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-01-auth-rbac_PLAN_14-07-26.md`. There are no supporting phase files for Phase 1 — this single file is the complete execute anchor; the umbrella plan (`admin-dashboard_UMBRELLA_PLAN_14-07-26.md`) is program-level context only, not a supporting phase file to execute from.
2. **Last completed phase or step:** none — this plan was just written; no loop steps have run yet.
3. **Validate-contract status:** pending (placeholder below — vc-validate-agent writes this before EXECUTE).
4. **Supporting context files loaded:**
   - `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
   - `process/context/all-context.md`
   - `packages/api/src/lib/require-staff.ts`, `packages/api/src/lib/auth.ts`, `packages/api/src/index.ts`,
     `packages/api/src/db/schema/users.ts`, `packages/types/src/staff.ts`,
     `packages/api/src/middleware/require-session.ts`
5. **Next step for a fresh agent picking up mid-execution:** confirm P0 (Scaffold) phase's plan/report
   exists and states the `apps/admin` dev port + router-file convention (needed for Steps 3.2 and
   7.1 above); if P0 is not yet complete, this phase's RESEARCH step should surface that as a
   dependency block before Step 0's feasibility probe runs (the probe itself does not need `apps/admin`
   to exist — it can run purely against `packages/api`'s existing `app` export via supertest).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE; generated-by: TBD —
outer-pvl or inner-pvl: phase-1 depending on when PVL runs for this phase)
