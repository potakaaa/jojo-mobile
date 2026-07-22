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
**Status:** ✅ VERIFIED (AC1-AC7 + MFA-SEAM automated/hybrid-green; AC8 Agent-Probe recorded manual-pending, consistent with P0's visual-AC precedent — not blocking)

Date: 14-07-26
Status: VERIFIED
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

## Feasibility Verdict (Step 0)

**VIABLE** — the Step 0 probe confirmed a plain browser better-auth client works with **zero
plugins**: `POST /api/auth/sign-in/email` issues `Set-Cookie: better-auth.session_token=...;
Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax` (no `Secure` — expected under dev `http://`), and
`GET /api/auth/get-session` recognizes that cookie alone (no bearer headers, no Expo plugin, no
`nextCookies`/cookie-cache config). This licenses `apps/admin`'s `auth-client.ts` (Step 6.1) to be
a plain `createAuthClient({ baseURL })` from `better-auth/react`, hitting the same `/api/auth/*`
mount the Expo app already uses.

**Known-gap carried into AC6 (Hybrid):** the probe only proved same-origin issuance/recognition via
supertest — it did NOT exercise real cross-origin browser behavior (`apps/admin` dev origin ->
`packages/api`) with `SameSite=Lax` + CORS `credentials: true`. That remains AC6's scope, to be
proven once Step 3's CORS/`trustedOrigins` wiring and the live `:3100` origin exist.

Full artifact: `phase-01-auth-rbac_FEASIBILITY_14-07-26.md`.

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
in `index.ts` (mirrors `app.use('/api/staff', requireStaff(auth), staffRouter)`, currently at
`index.ts:183` — confirm the CURRENT line via grep at EXECUTE time rather than trusting any cited
line number, since this file has grown since STAFF-001) — every later phase's admin route inherits
the guard automatically by being added to `adminRouter`, never by re-checking role inline
per-handler. `trustedOrigins` in `auth.ts:79` gains the admin web dev origin (e.g. `http://localhost:3100`
— confirm the actual dev port during RESEARCH/P0 scaffold) — never a wildcard. All admin route
inputs (role-change body) are Zod-validated server-side.

**UI component modularity & reusability:** the login screen and dashboard shell are composed from the
P0-scaffolded shadcn/ui primitives (Button, Input, Card) — no hand-rolled form controls. This phase
does not yet extract cross-domain CRUD composites (branches in P2 is the first extractor); it only
consumes primitives and the ported Tailwind design tokens. The super_admin role-management screen
reuses the same primitives, and its table/form should be built so the P2 `data-table`/`form-dialog`
composites can later replace any bespoke markup here (flag as a follow-up rather than duplicating).

---

## MFA/TOTP Gateway (seam only — NOT implemented this phase)

Phase 1 leaves a documented insertion point where a future MFA/TOTP challenge step will go, and
NOTHING else. No TOTP logic, no OTP verification, no enrollment.

**Explicitly NOT done this phase** (so a later agent doesn't think these were forgotten):
- NO better-auth `twoFactor` plugin registration
- NO DB migration for MFA/TOTP state
- NO enrollment/verify routes
- NO env flag for MFA/TOTP

A later phase (candidate ADM-0xx — unassigned/future) registers the real better-auth `twoFactor`
plugin at this seam.

---

## Touchpoints

| File | Change |
|---|---|
| `packages/api/src/lib/require-admin.ts` (new) | `requireAdmin(auth)` middleware, mirrors `require-staff.ts:55-80` |
| `packages/api/src/lib/require-staff.ts:65-67,103` | Resolve `TODO(STAFF-ADM)` — admin/super_admin bypass `assertBranchScope` |
| `packages/api/src/lib/auth.ts:79` | Add admin web dev origin to `trustedOrigins` array |
| `packages/api/src/index.ts` | `import cors from 'cors'` + CORS middleware scoped to `/api/admin`; `app.use('/api/admin', requireAdmin(auth), adminRouter)` mount (mirrors the existing `/api/staff` mount — currently `index.ts:183`, confirm via grep, not line number) |
| `packages/api/src/routes/admin/index.ts` (new) | `adminRouter` aggregator — mounts `users.ts` sub-routes; later phases mount their own sub-routers here |
| `packages/api/src/routes/admin/users.ts` (new) | `GET /me` canary, `POST /:id/role` role-management route |
| `packages/api/src/routes/admin/lib/errors.ts` (new) | `AdminApiError` typed error, mirrors `orders.ts:39-47` |
| `packages/types/src/admin.ts` (new) | `ADMIN_ROLES`, `AdminRole`, `AdminMe`, `AdminUserSummary` types, mirrors `staff.ts`; also carries the additive `mfaPending?: boolean` MFA/TOTP gateway seam field (see `## MFA/TOTP Gateway` section — always absent/false today) |
| `packages/api/package.json` | Add `cors` + `@types/cors` dependency — **confirmed absent**, not already present |
| `apps/admin/package.json` | Add `better-auth` dependency — **confirmed absent**; probe confirmed **no extra plugin needed** (plain `createAuthClient`) |
| `apps/admin/src/config/env.ts` (new) | Vite env seam exposing `import.meta.env.VITE_API_URL` — mirrors `apps/mobile/src/config/env.ts`, distinct from Expo's `EXPO_PUBLIC_*` convention; default fallback `http://localhost:3000` (matches the API's own default port) when the env var is unset, consumed by Step 6.1's auth-client and Step 3's CORS origin wiring |
| `apps/admin/src/features/auth/hooks/use-admin-auth.ts` (new) | Session hook — cookie-session client, mirrors `apps/mobile/.../use-auth.ts` shape (`user`, `role`, `isLoading`, `signIn`, `signOut`) |
| `apps/admin/src/features/auth/lib/auth-client.ts` (new) | better-auth **browser** client (plain `createAuthClient` from `better-auth/react` or `better-auth/client`, NOT `@better-auth/expo`) |
| `apps/admin/src/routes/login.tsx` (new) | Admin login screen (email/password) — stays OUTSIDE the `(dashboard)` group, unguarded; also carries the Step 7.3 MFA-GATEWAY no-op seam comment (see `## MFA/TOTP Gateway` section) |
| `apps/admin/src/routes/(dashboard)/route.tsx` (new) | Pathless layout route — `beforeLoad` guard (server-verified via `GET /api/admin/me`, not a client-cached role flag) wraps ALL child routes in the group |
| `apps/admin/src/routes/(dashboard)/index.tsx` (new) | Phase 1's ONLY child route in the group — dashboard landing shell. Later phases (P2-P7) ADD sibling child routes into this same group; they never restructure it. |
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
- `403` if caller is not `super_admin` — **LOCKED (INNOVATE decision): an INLINE check inside the
  handler** (`if (req.adminSession.role !== 'super_admin') return 403 { error: 'Forbidden' }`), run
  in addition to `requireAdmin`'s admin-or-super_admin gate. NOT a `requireSuperAdmin` middleware
  wrapper — this route is the only super_admin-only consumer today, and no P2-P7 phase route needs a
  second one; promote to a shared helper only when a second caller appears. This is a real server
  check on `req.adminSession` (set by `requireAdmin`), never a client-trusted role flag.
- `400 { error: 'Cannot modify own role' }` if `req.params.id === req.adminSession.userId`
  (self-escalation guard — checked BEFORE any DB write, unconditional).
- `200 { resource: AdminUserSummary }` on success (updated user's id/email/role).
- `404 { error: 'User not found' }` if target id doesn't exist.
- **Error-flow pattern (LOCKED, resolves PVL concern):** mirror `orders.ts`'s `OrderError`
  throw/catch shape exactly — `AdminApiError` is a `class AdminApiError extends Error { status: number }`,
  thrown inside the handler (`throw new AdminApiError(400, 'Cannot modify own role')`,
  `throw new AdminApiError(403, 'Forbidden')`, `throw new AdminApiError(404, 'User not found')`), and
  the route wraps its body in try/catch, converting `err instanceof AdminApiError` into
  `res.status(err.status).json({ error: err.message })` in the catch block (same shape as
  `orders.ts:205`). Do NOT construct-and-return an `AdminApiError` instance directly as a response
  body — it is always thrown-and-caught, never serialized as-is.

**`packages/types/src/admin.ts`** (new, mirrors `staff.ts` shape):
```
export const ADMIN_ROLES = ['admin', 'super_admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export interface AdminMe { role: AdminRole; mfaPending?: boolean; }
export interface AdminUserSummary { id: string; email: string; role: 'customer' | 'staff' | 'admin' | 'super_admin'; }
```
(Exact shape finalized during EXECUTE if RESEARCH surfaces a need for more fields — e.g. `name` —
keep additive, never remove the above. `mfaPending?: boolean` is the MFA/TOTP gateway seam field
(see `## MFA/TOTP Gateway` section) — always absent/false today; additive, do not remove.)

**Browser cookie session contract (apps/admin) — LOCKED per feasibility verdict (VIABLE):**
`apps/admin`'s `auth-client.ts` is a plain `createAuthClient({ baseURL })` from `better-auth/react`,
ZERO plugins, plus `inferAdditionalFields` for typing `role`/`isAdmin`, against `${VITE_API_URL}/api/auth/*`
(same mount as the Expo client already uses — `index.ts:35`). No new better-auth instance. The probe
confirmed the default cookie session (`better-auth.session_token`, `HttpOnly`, `SameSite=Lax`,
30-day `Max-Age`) works end-to-end with no `nextCookies`/cookie-cache tweak — that branch is closed,
not left open for EXECUTE to decide.

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
- **Confirmed N/A this phase:** no admin route in this phase touches `order_items` or
  `star_transactions` (the two program-level hard invariants) — Phase 1's only DB write is
  `UPDATE users SET role = ...`. Confirmed by inspection of the Touchpoints/Public Contracts above;
  re-confirmed at V2 (Breaking Changes dimension) — no route/schema file in this phase references
  either table.

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
     `AdminUserSummary` (including the additive `mfaPending?: boolean` seam field on `AdminMe`).
2.2. Export from `packages/types/src/index.ts` (confirmed existing barrel-export pattern: mirror the
     `export * from './staff';` line already present).

**Step 3 — CORS + `trustedOrigins` + mount.**
3.1. Add `cors` (+ `@types/cors` if not already a transitive dep) to `packages/api/package.json`.
     Run `pnpm install` (workspace-aware) after adding.
3.2. In `packages/api/src/index.ts`, import `cors` and apply it scoped to `/api/admin` (e.g.
     `app.use('/api/admin', cors({ origin: [adminWebOrigin], credentials: true }), requireAdmin(auth), adminRouter)`)
     — confirmed dev port for `apps/admin` is `3100` (`apps/admin/package.json`'s `dev` script:
     `vite dev --port 3100`); read from an env var (e.g. `ADMIN_WEB_ORIGIN`) with a dev-only fallback
     of `http://localhost:3100`, never inline a bare string with no override.
3.3. Add the same origin to `auth.ts:79`'s `trustedOrigins` array (append, do not replace the
     existing `jojopotato://`/`exp://` entries).
3.4. Create `packages/api/src/routes/admin/index.ts` as the `adminRouter` aggregator (an Express
     `Router()` that mounts `usersRouter` from `./users.ts`) and mount it:
     `app.use('/api/admin', ...guards, adminRouter)` in `index.ts`. Find the current `/api/staff`
     mount by grepping `app.use('/api/staff'` (currently `index.ts:183` — this line number WILL
     drift as the file grows further; grep at execute time, do not hardcode) and place the new mount
     after it (mirrors ordering, does not need to precede it — confirm no ordering conflict during
     EXECUTE).

**Environment Notes (from RESEARCH, dev-machine gotcha — not a code change):** host port 5432 on
this dev machine is occupied by a native `postgresql.service`, so plain `docker compose up -d` for
Postgres fails. `require-admin.integration.test.ts` (like the existing STAFF-001 tests) needs a
live migrated Postgres to run — use the already-running native instance instead of fighting the
port conflict: a `jojo` role (with `CREATEDB`) + `jojopotato` database was created against it during
the Step 0 probe, letting vitest's `global-setup.ts` create its ephemeral `<db>_test` databases.
This is an EXECUTE/EVL setup note, not an implementation step.

**Step 4 — `AdminApiError` + `GET /api/admin/me`.**
4.1. Create `packages/api/src/routes/admin/lib/errors.ts` with `AdminApiError` mirroring
     `OrderError` (`orders.ts:39-47`) — a typed error class with `statusCode` + `message`, always
     thrown-and-caught (see the Public Contracts "Error-flow pattern (LOCKED)" note above — never
     constructed and returned directly).
4.2. Create `packages/api/src/routes/admin/users.ts`: `GET /me` handler reads `req.adminSession`
     (attached by `requireAdmin`) and responds `200 { role: req.adminSession.role }` typed as
     `AdminMe`.

**Step 5 — Role-management route + resolve `TODO(STAFF-ADM)`.**
**ORDERING GUARD (locked, from vc-predict Security persona review): the four checks below run in
this exact order — 5.1 (super_admin check) FIRST, then 5.2 (self-escalation guard), then 5.3
(Zod validation), then 5.4 (DB write). All three guards (5.1-5.3) precede any DB read/write —
no reordering permitted during EXECUTE.**
5.1. In `users.ts`, add `POST /:id/role`. Guard: **LOCKED — INLINE check in the handler**:
     `if (req.adminSession.role !== 'super_admin') throw new AdminApiError(403, 'Forbidden')`,
     a second check beyond `requireAdmin`'s admin-or-super_admin gate. NOT a `requireSuperAdmin`
     middleware wrapper — single consumer today, no P2-P7 phase needs a second super_admin-only
     route; promote to a shared helper only if/when a second caller appears.
5.2. Add the self-escalation guard (runs SECOND, after 5.1): `if (req.params.id === req.adminSession.userId) throw
     new AdminApiError(400, 'Cannot modify own role')` — placed BEFORE any DB read/write. Both this
     throw and 5.1's throw are caught by a single try/catch wrapping the whole handler body (mirror
     `orders.ts`'s `err instanceof OrderError` catch shape).
5.3. Zod-validate body (runs THIRD, after 5.1-5.2) `{ role: z.enum(['customer','staff','admin','super_admin']) }`.
     A failed `safeParse` throws `new AdminApiError(400, '<zod message>')`.
5.4. DB write (runs LAST, after all three guards pass): `UPDATE users SET role = $role WHERE id = $id RETURNING id, email, role` (Drizzle
     `.update(users).set({ role }).where(eq(users.id, id)).returning(...)`); throw
     `new AdminApiError(404, 'User not found')` if no row returned.
5.5. Resolve `TODO(STAFF-ADM)` in `require-staff.ts`. **LOCKED signature change (resolves PVL
     concern — `assertBranchScope` currently has NO live call site in `staff.ts`; only
     `resolveBranchScope` is called there today, and `assertBranchScope` is exercised only by its own
     pure-function unit tests in `require-staff.integration.test.ts`):** change the function
     signature to `assertBranchScope(assignedBranchId: string | null, requestedBranchId: string | null, role?: string | null): boolean`
     — add the bypass as the FIRST check inside the function body:
     `if (role === 'admin' || role === 'super_admin') return true;` before the existing
     `assignedBranchId === null` check. The new `role` parameter is OPTIONAL and appended LAST so
     every existing call in `require-staff.integration.test.ts` (which calls with 2 args) continues
     to compile and pass unchanged — this is an additive, backward-compatible signature change, not
     a breaking one. Update the comment at lines 65-67 and 103 to remove the "for now"/TODO language
     now that the bypass is implemented. Add a new unit test case: `assertBranchScope('any-branch',
     'other-branch', 'admin')` and `assertBranchScope(null, 'branch-x', 'super_admin')` both return
     `true` (proves the bypass fires even when the "would otherwise fail" conditions are true) — this
     is the AC7 proving test.

**Step 6 — `apps/admin` auth client + hook.**
6.1. Create `apps/admin/src/features/auth/lib/auth-client.ts`: **LOCKED shape (per feasibility
     verdict)** — plain `createAuthClient({ baseURL: env.apiUrl })` from `better-auth/react`, ZERO
     plugins, plus `inferAdditionalFields` for typing `role`/`isAdmin` (NOT `@better-auth/expo`,
     NOT a `nextCookies`/cookie-cache plugin — the probe proved the base flow suffices). `env.apiUrl`
     comes from the new `apps/admin/src/config/env.ts` Vite env seam (`import.meta.env.VITE_API_URL`,
     default fallback `http://localhost:3000` when unset — see Touchpoints).
6.2. Create `apps/admin/src/features/auth/hooks/use-admin-auth.ts`: `AdminAuthProvider` +
     `useAdminAuth()` exposing `{ user, role, isLoading, isAdmin, signIn, signOut }` — mirrors the
     shape of `apps/mobile/src/features/auth/hooks/use-auth.ts` but browser-cookie-backed, no
     `expo-secure-store` persistence (the browser handles cookie persistence natively).

**Step 7 — Login screen + role-gated dashboard shell.**
7.1. Build the admin login screen (email/password form → `authClient.signIn.email(...)`) at
     whatever router convention P0 established (TanStack Start file-based routing — confirm exact
     path from the P0 scaffold plan/report).
7.2. **LOCKED route shape (INNOVATE decision):** build `apps/admin/src/routes/(dashboard)/route.tsx`
     as a pathless route-group LAYOUT with a `beforeLoad` guard, wrapping child routes. Phase 1
     creates the group with exactly ONE child, `(dashboard)/index.tsx` (the landing shell) — later
     phases (P2-P7) ADD sibling child routes into this SAME group; they must never restructure it
     (per the umbrella's "append never restructure" rule). `login.tsx` stays OUTSIDE the group,
     unguarded. The `beforeLoad` guard calls `GET /api/admin/me` against the REAL server session —
     it does NOT trust a client-cached role flag. Guard behavior: unauthenticated → redirect to
     login; authenticated-but-not-admin (customer/staff) → reject (403 page or redirect, NOT a
     silent fallback); authenticated admin/super_admin → render the shell. The server remains the
     source of truth regardless — the client gate is convenience only, since every `/api/admin/*`
     call is independently guarded by `requireAdmin`.
7.3. **MFA/TOTP gateway seam (structural, no-op — see `## MFA/TOTP Gateway` section).** In the login
     screen (`login.tsx`), after a successful `authClient.signIn.email(...)` and BEFORE routing to
     the `(dashboard)` shell, add a clearly-marked no-op seam comment:
     `// MFA-GATEWAY (ADM-0xx, future): a two-factor challenge step inserts here between sign-in
     success and dashboard routing. No-op today — sign-in success routes straight to the shell.`
     This is a structural placeholder comment plus the natural flow ordering — NOT a function, NOT a
     branch, NOT a conditional. Do not add a real MFA check.

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
7. **AC7 — `assertBranchScope` admin bypass:** a unit test proves `assertBranchScope` (updated
   signature — see Step 5.5) returns `true` unconditionally when the caller's `role` argument is
   `admin` or `super_admin`, regardless of `assignedBranchId`/`requestedBranchId` values. *Proven by:
   new pure-function unit test cases in the `require-staff` test suite — strategy: Fully-Automated.*
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
| `require-staff` unit test — `assertBranchScope` admin/super_admin bypass (new `role` param) | Fully-Automated | AC7 |
| Agent-Probe: admin login + role-gated shell walkthrough (admit admin, reject customer/staff) | Agent-Probe | AC8 |

---

## Test Infra Improvement Notes

(none identified yet)

---

## Phase Loop Progress

- [x] 1. RESEARCH
- [x] 2. INNOVATE
- [x] 3. PLAN-SUPPLEMENT
- [x] 4. PVL (validate-contract) — Gate: PASS (14-07-26; re-run inner-pvl to fold MFA seam, still PASS)
- [x] 5. EXECUTE — AC1-AC7 + MFA-SEAM automated-green (75/75 API suite); AC8 deferred to Agent-Probe
- [x] 6. EVL — independent vc-tester re-run confirmed 75/75 + all typecheck/lint/build gates green
- [x] 7. UPDATE-PROCESS — this pass (14-07-26)

---

## Inner Loop Refresh Note

**Date:** 2026-07-14

MFA/TOTP gateway seam (structural, no implementation) added to Public Contracts
(`AdminMe.mfaPending?`) + Step 7.3 + new `## MFA/TOTP Gateway` section after the
`inner-pvl: phase-1` contract was written; PVL must re-run to fold the seam into the contract
before EXECUTE.

**Status: PROCESSED** — the inner-pvl re-run of 14-07-26 folded the MFA/TOTP gateway seam into the
validate-contract below (supersedes chain records the prior contract). Verdict held at Gate: PASS.
This note is retained as the audit trail for the re-run trigger; no further PVL re-run is pending.

---

## Resume and Execution Handoff

1. **Selected plan file path (primary execute anchor for this phase):** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-01-auth-rbac_PLAN_14-07-26.md`. There are no supporting phase files for Phase 1 — this single file is the complete execute anchor; the umbrella plan (`admin-dashboard_UMBRELLA_PLAN_14-07-26.md`) is program-level context only, not a supporting phase file to execute from.
2. **Last completed phase or step:** Step 4 (PVL) — validate-contract written, Gate: PASS, then
   RE-RUN (inner-pvl) to fold the MFA/TOTP gateway seam per the Inner Loop Refresh Note; verdict held
   at PASS. RESEARCH (port :3100 confirmed, `cors`/`better-auth` deps confirmed absent, Postgres
   port-conflict workaround documented), INNOVATE (super_admin inline-check, `(dashboard)` route-group
   shape, guard ordering, server-verified `beforeLoad` locked), PLAN-SUPPLEMENT, and PVL (3 minor
   mechanical-feasibility concerns resolved via locked plan clarifications: `AdminApiError`
   throw/catch shape, `assertBranchScope` additive signature change, `VITE_API_URL` default) are all
   folded into the checklist above. Next step is EXECUTE.
3. **Validate-contract status:** WRITTEN — Gate: PASS (14-07-26), `generated-by: inner-pvl: phase-1`,
   supersedes the prior 14-07-26 inner-pvl contract (MFA seam re-run). See `## Validate Contract` below.
4. **Supporting context files loaded:**
   - `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`
   - `process/context/all-context.md`, `process/context/tests/all-tests.md`
   - `packages/api/src/lib/require-staff.ts`, `packages/api/src/lib/auth.ts`, `packages/api/src/index.ts`,
     `packages/api/src/db/schema/users.ts`, `packages/types/src/staff.ts`,
     `packages/api/src/middleware/require-session.ts`, `packages/api/src/routes/orders.ts`,
     `packages/api/src/lib/__tests__/require-staff.integration.test.ts`,
     `packages/api/src/lib/__tests__/auth.integration.test.ts`, `apps/admin/package.json`
5. **Next step for a fresh agent picking up mid-execution:** P0 (Scaffold) is VERIFIED and its dev
   port (`3100`) is confirmed and locked into this plan (Touchpoints, Cross-Cutting Compliance,
   Steps 3.2/3.3). The Step 0 feasibility probe already ran and is VIABLE (see
   `phase-01-auth-rbac_FEASIBILITY_14-07-26.md`) — do not re-run it. PVL is complete (Gate: PASS).
   Next step: spawn vc-execute-agent for Step 5 (EXECUTE), following the Implementation Steps above
   in order (0 already done → 1 → 2 → 3 → 4 → 5 → 6 → 7) — the steps have real ordering dependencies
   (types before routes; CORS/mount before route handlers; auth-client before hook before screens),
   so a single execute-agent working sequentially through the steps is the correct strategy (see
   Execute Strategy Recommendation below).

---

## Validate Contract

Status: PASS
Date: 14-07-26
date: 2026-07-14
generated-by: inner-pvl: phase-1
supersedes: 2026-07-14 (inner-pvl: phase-1) — re-run to fold the MFA/TOTP gateway seam (structural-only, no implementation) into the contract per the Inner Loop Refresh Note dated 2026-07-14

Parallel strategy: sequential
Rationale: Signal score 3/7 (S1 multi-package scope: packages/api + packages/types + apps/admin;
S2 schema/API/auth surface touched; S4 phase-program classification) would nominally suggest
parallel-subagents, but the Implementation Steps (0-7) have a hard linear dependency chain — types
(Step 2) must exist before the middleware that imports them (Step 1), CORS/mount (Step 3) before
route handlers (Step 4-5), and the auth-client (Step 6) before the screens that consume it
(Step 7). Fan-out would create file-edit races and rework, not speedup. Strategy-by-fit overrides
the raw signal count here: **sequential — one vc-execute-agent working through Steps 0-7 in
order** is correct, matching "iterative execution where steps are known but parallelism adds no
benefit."

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | `requireAdmin` role matrix: unauth/customer/staff → 403; admin/super_admin → 200 + `req.adminSession` populated | Fully-Automated | `packages/api/src/lib/__tests__/require-admin.integration.test.ts` — role-matrix describe block | A |
| AC2 | Self-escalation on `POST /api/admin/users/:ownId/role` rejected (400), DB row unchanged | Fully-Automated | `require-admin.integration.test.ts` — self-escalation case | A |
| AC3 | Plain `admin` role forbidden (403) from role-management route, target row unchanged | Fully-Automated | `require-admin.integration.test.ts` — admin-forbidden case | A |
| AC4 | `super_admin` successfully promotes/demotes another user (200, DB row updated) | Fully-Automated | `require-admin.integration.test.ts` — super_admin-success case | A |
| AC5 | `role` stays server-owned; client `updateUser` role write ignored/rejected (regression) | Fully-Automated | `packages/api/src/lib/__tests__/auth.integration.test.ts` — existing role-rejection case (re-run, no new test) | A |
| AC6 | Browser cookie session round-trips cross-origin with `trustedOrigins`+CORS `credentials:true` | Hybrid | Step 0 FEASIBILITY VERDICT (same-origin proof, already captured) + new hybrid test exercising the round-trip with the real `:3100` admin origin — precondition: Step 3's CORS/mount must be live | B |
| AC7 | `assertBranchScope(assignedBranchId, requestedBranchId, role)` returns `true` unconditionally when `role ∈ {admin, super_admin}` | Fully-Automated | `require-staff.integration.test.ts` — new `assertBranchScope` bypass cases (additive `role` param, see Step 5.5) | B |
| AC8 | Admin/super_admin can log in + reach dashboard shell; customer/staff rejected client-side (server-enforced per AC1) | Agent-Probe | Manual/agent walkthrough against the built login + `(dashboard)` route group | D — underlying automated RN/browser-E2E coverage gap is project-wide and already tracked (`process/context/tests/all-tests.md` Known Gaps; `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`); AC8 itself IS proven this phase via the Agent-Probe strategy, not left unproven |
| MFA-SEAM (structural) | `AdminMe.mfaPending?: boolean` optional additive type field compiles and consumers still typecheck; Step 7.3 login.tsx no-op comment is a comment only (no runtime branch/function/conditional) | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` + `pnpm --filter @jojopotato/admin typecheck` (the optional field is covered by existing typecheck — NO new MFA test is warranted; there is no MFA behavior to assert yet) | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- Admin authz role-matrix + role-management route: Fully-automated: `pnpm --filter @jojopotato/api test` (runs `require-admin.integration.test.ts`, needs live migrated Postgres) | known caveat: none
- `role` server-ownership regression: Fully-automated: `pnpm --filter @jojopotato/api test` (runs `auth.integration.test.ts`)
- `assertBranchScope` admin bypass: Fully-automated: `pnpm --filter @jojopotato/api test` (runs updated `require-staff.integration.test.ts` pure-function cases)
- MFA/TOTP gateway seam (structural-only): Fully-automated: `pnpm --filter @jojopotato/api typecheck` + `pnpm --filter @jojopotato/admin typecheck` (the `AdminMe.mfaPending?` optional field + the login.tsx no-op comment introduce NO runtime/auth surface — typecheck is the only coverage warranted; no new MFA test)
- Cross-origin cookie round-trip: hybrid: `pnpm --filter @jojopotato/api test` + precondition: Step 3 CORS/mount + `:3100` admin origin live (dev server or test harness hitting the real port)
- Admin login + dashboard shell: agent-probe: manual walkthrough — no automated browser E2E runner exists for `apps/admin` yet (project-wide gap)

### Failing stubs (Fully-Automated rows)

```
test("should return 200 with req.adminSession for admin and super_admin sessions, 403 for unauthenticated/customer/staff", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: requireAdmin role-matrix (AC1)")
})
```

```
test("should reject self-escalation with 400 'Cannot modify own role' and leave the DB row unchanged", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: self-escalation rejected (AC2)")
})
```

```
test("should reject a plain admin session calling POST /api/admin/users/:otherId/role with 403, target row unchanged", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: admin cannot call role-management route (AC3)")
})
```

```
test("should let a super_admin session promote/demote another user's role and persist the change", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: super_admin CAN promote/demote another user (AC4)")
})
```

```
test("should return true from assertBranchScope when role is 'admin' or 'super_admin', regardless of assignedBranchId/requestedBranchId", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: assertBranchScope admin bypass (AC7)")
})
```

(AC5 is a regression re-run of an existing, already-passing test — no new stub. AC6/AC8 are
Hybrid/Agent-Probe tiers and do not receive stubs per protocol. The MFA-SEAM row is a typecheck-only
gate — an optional additive type field + a no-op comment — and receives NO stub: there is no MFA
runtime behavior to assert, and inventing an MFA test would be wrong.)

Dimension findings:
- Infra fit: PASS — `:3100` dev port, `cors`/`better-auth` dependency-absence, and the native-Postgres
  workaround are all confirmed against real repo state (package.json scripts, package.json deps).
  The MFA seam adds NO new infra surface (no plugin, no migration, no env flag, no route). One
  observational note (not blocking): the umbrella plan's citation of `index.ts:51` for the
  `/api/staff` mount pattern is stale (actual current line is `index.ts:183` — the file has grown
  since STAFF-001); this phase's own plan text now says "confirm via grep" instead of a hardcoded
  line, so it does not propagate the staleness into EXECUTE.
- Test coverage: PASS — all 8 ACs mapped to a tier; AC6 (auth-adjacent, high-risk class) correctly
  assigned Hybrid, not Known-Gap, satisfying the High-Risk Classes mandate; AC8's Agent-Probe tier is
  a legitimate proving strategy given the project-wide, already-tracked absence of a browser/RN E2E
  runner. The MFA/TOTP gateway seam introduces NO new auth-security surface to test (a no-op comment +
  an optional type field) — the only automated coverage implication is `AdminMe.mfaPending?`'s
  compilation, covered by existing typecheck (MFA-SEAM row, gap-resolution A). Correctly, NO new MFA
  test was invented — there is nothing to assert yet. No developed behavior in this phase rests on
  Known-Gap alone (vacuous-green check clears).
- Breaking changes: PASS — (a) `assertBranchScope`'s signature change (adding an optional trailing
  `role` parameter) is additive/backward-compatible; the 4 existing pure-function test cases in
  `require-staff.integration.test.ts` (lines 74-90, calling with 2 args) continue to compile and pass
  unchanged. (b) `AdminMe.mfaPending?: boolean` is an OPTIONAL additive field on a brand-new type
  (`packages/types/src/admin.ts`, created this phase) — no existing consumer reads `AdminMe` yet, and
  optionality means even future consumers compile without it. `packages/types/src/admin.ts` and the
  `/api/admin` mount point are new surfaces this phase OWNS (per the umbrella's Pre-PVL Conflict
  Resolution note) — no existing consumer is broken.
- Security surface: PASS — guard ordering (5.1 super_admin check → 5.2 self-escalation → 5.3 Zod
  validation → 5.4 DB write) is explicit and locked; both hard umbrella safety constraints (no
  self-escalation, super_admin-only role management) have dedicated Fully-Automated tests (AC2, AC3);
  `role` stays `input:false` (AC5, regression-confirmed); `trustedOrigins` is appended to, never
  replaced or wildcarded; confirmed no `order_items`/`star_transactions` write path exists in this
  phase's blast radius (umbrella hard invariant — N/A this phase, by inspection). **The MFA/TOTP
  gateway seam weakens NO existing AC or hard guard: it adds no runtime behavior, no migration, no
  route, no plugin, no env flag — a no-op comment (Step 7.3) plus an absent-by-default optional type
  field. Self-escalation, super_admin-only, role input:false, and order_items/star_transactions
  untouched all hold exactly as before.**
- Section: API layer (Steps 1, 3, 4, 5) feasibility: PASS — `requireAdmin`/`AdminApiError`/mount
  targets are all findable and uniquely matchable; one gap found and resolved in the prior PVL pass
  (error-flow throw/catch shape for `AdminApiError`, now LOCKED to mirror `OrderError` exactly); no
  conflicts with current file state; highest-risk edit is Step 5 (role-management route) — mitigated
  by the locked guard ordering and the explicit AC2/AC3 automated tests.
- Section: packages/types (Step 2) feasibility: PASS — mechanical, mirrors `staff.ts` shape exactly;
  barrel-export pattern confirmed (`export * from './staff';` present in `index.ts`, easy to mirror).
  The additive `mfaPending?: boolean` field is a one-line, backward-compatible addition to a new type.
- Section: apps/admin auth client + hook (Step 6) feasibility: PASS — `better-auth` and a
  `config/env.ts` seam are both confirmed absent/new (no collision); one gap found and resolved in the
  prior PVL pass (unspecified `VITE_API_URL` default — now locked to `http://localhost:3000`).
- Section: apps/admin routes/screens (Step 7, incl. 7.3 MFA seam) feasibility: PASS — current
  `apps/admin/src/routes/` contains only `index.tsx`/`__root.tsx`; `(dashboard)` route group and
  `login.tsx` are genuinely new, no restructuring of existing routes required. Step 7.3's MFA-GATEWAY
  seam is a plain comment placed in the natural flow ordering between sign-in success and dashboard
  routing — NOT a function, branch, or conditional — so it is mechanically trivial and adds zero
  runtime behavior (verified against the explicit exclusions in the `## MFA/TOTP Gateway` section).

Open gaps: none unresolved. The three minor mechanical-feasibility concerns from the prior PVL pass
remain resolved (locked plan clarifications: `AdminApiError` throw/catch shape, `assertBranchScope`
additive `role` param, `VITE_API_URL` default). The MFA/TOTP gateway seam added since the prior
contract is validated as correctly structural-only and introduces no gap. AC6's cross-origin-browser
known-gap (from the Step 0 feasibility VERDICT) is intentionally carried forward as AC6's own Hybrid
scope, not an open gap — it is the thing AC6 exists to close.

**Documented future seam (NOT covered this phase, by design):** MFA/TOTP is a documented gateway seam
for a future phase (candidate ADM-0xx — unassigned). Phase 1 ships ONLY the structural insertion
point: the `AdminMe.mfaPending?` optional field, a no-op comment in `login.tsx` (Step 7.3), and the
`## MFA/TOTP Gateway` section's explicit exclusion list (no `twoFactor` plugin, no DB migration, no
enrollment/verify routes, no env flag). There is intentionally no MFA test in this phase — there is
no MFA behavior to assert until ADM-0xx implements it. This is a by-design deferral, not a coverage
gap.

What this coverage does NOT prove:
- AC1-AC4, AC7 (Fully-Automated, supertest-based): prove server-side authorization logic and DB
  state transitions. They do NOT prove the `apps/admin` UI actually calls these routes correctly, or
  that the browser attaches the session cookie on a real cross-origin request (that's AC6/AC8's job).
- AC5 (regression): proves better-auth still rejects a client-supplied `role`; does not re-verify any
  other `additionalFields` behavior (unchanged, out of scope).
- AC6 (Hybrid): proves the cookie round-trip works from the real `:3100` origin under the CORS config
  built in Step 3. Does NOT prove production `Secure`-cookie/HTTPS behavior (dev-only `BETTER_AUTH_URL`
  here, explicitly flagged as future work by the Step 0 VERDICT) or Safari/Firefox-specific
  `SameSite` enforcement differences (single-browser-engine test only, if the hybrid test uses a
  headless browser at all — if it remains a supertest-with-manual-Origin-header simulation instead of
  a real browser automation, it does not prove actual browser enforcement, only the server's CORS
  response headers; execute-agent should note in the phase report which of these two hybrid
  implementations was actually built).
- AC8 (Agent-Probe): proves a human/agent walkthrough succeeded once, under one browser, one session
  state. Does not prove regression-safety on future changes (no automated re-run) — this is the
  accepted, already-tracked project-wide gap.
- MFA-SEAM (typecheck): proves the optional field compiles and the no-op comment breaks nothing. Does
  NOT prove any MFA/TOTP challenge behavior — that is DELIBERATELY unimplemented this phase (future
  ADM-0xx). There is nothing more to prove here by design.
(Required until C3 is implemented — temporary C3 mitigation)

Gate: PASS (no FAILs, plan updated)
Accepted by: N/A — Gate is PASS; no CONCERNs remain pending user acceptance. The MFA/TOTP gateway
seam is validated as correctly structural-only (no runtime/auth surface, weakens no AC or hard
guard); the 3 concerns from the prior PVL pass were already resolved via locked plan clarifications
(see Open Gaps above), not carried forward as accepted risk.

### Execute Strategy Recommendation (for EXECUTE phase)

Score: 3/7 — signals present: S1 (multi-package: packages/api, packages/types, apps/admin), S2
(auth surface touched), S4 (phase-program classification)
Recommended strategy: Sequential — one vc-execute-agent (opus) working through Implementation Steps
0-7 in order
Agent count: 1
Model: opus (execution leg)
Cost guard: not triggered
Rationale: the threshold table would suggest parallel-subagents at score 3, but the Implementation
Steps have a strict linear dependency chain (types → middleware → CORS/mount → routes → auth-client
→ screens) touching overlapping files across the 3 packages; fan-out here would create edit races,
not speedup. Strategy-by-fit (dependency chain) overrides the raw signal count.
