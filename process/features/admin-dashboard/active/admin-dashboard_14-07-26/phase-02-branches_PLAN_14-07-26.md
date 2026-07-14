---
name: plan:admin-phase-02-branches
description: "Admin Dashboard Phase 2 — Branches CRUD (ADM-002, #40): full real vertical slice (API + apps/admin screen + Postgres)"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 2
---

# Phase 2 — Branches CRUD (ADM-002, #40)

Date: 14-07-26
Status: PLANNED
Complexity: COMPLEX (full real vertical slice — HYBRID program strategy's proof-of-pattern phase)

**Date:** 14-07-26
**Complexity:** COMPLEX (full real vertical slice — HYBRID program strategy's proof-of-pattern phase)
**Status:** ⏳ PLANNED

---

## Overview

This phase proves the whole `apps/admin` stack works end to end, once, before Phases 3–7 reuse the
shape. It delivers full CRUD (list/get/create/update/soft-delete) for `branches` — the simplest
catalog table, with no join tables and only one cross-cutting hazard (`is_accepting_pickup` shared
state with the not-yet-built mobile staff shell, STAFF-004).

Two halves:

1. **API**: `packages/api/src/routes/admin/branches.ts` — new router mounted under `/api/admin`,
   guarded by `requireAdmin` (built in Phase 1, `packages/api/src/lib/require-admin.ts`, mirroring
   `requireStaff` at `packages/api/src/lib/require-staff.ts:55-80`). List / get-by-id / create /
   update / soft-delete (`is_active` toggle, never `DELETE`).
2. **App**: `apps/admin/src/features/branches/**` — list screen, create/edit form, deactivate flow
   with a confirmation step, backed by `@tanstack/react-query` against a dedicated
   `apps/admin` query client (Phase 0/1 scaffolding — reference, do not duplicate).

This phase establishes the reusable admin-CRUD shape (route module structure under
`routes/admin/`, shared error envelope, serializer usage, react-query hooks, form pattern) that
Phases 3–7 will reference or deliberately diverge from during their own RESEARCH.

**Existing code this phase mirrors (cited `file:line`):**
- `packages/api/src/routes/branches.ts:1-77` (public read-only branch routes — the model for
  serializer usage and response envelope shape, NOT for admin auth — this is a public router).
- `packages/api/src/db/schema/branches.ts:13-31` (the `branches` table — every editable column and
  its constraints).
- `packages/api/src/routes/lib/serializers.ts:96-99,105-114` (`numericToCents`, `serializeBranch`).
- `packages/api/src/routes/orders.ts:39-47` (`OrderError` typed-error pattern) and `:60-66`
  (`createOrderSchema` Zod `safeParse` pattern) — the model for admin route validation/error shape.
- `packages/api/src/lib/require-staff.ts:55-80` (`requireStaff` middleware — Phase 1's
  `requireAdmin` mirrors this shape; this phase only CONSUMES `requireAdmin`, it does not build it).
- `packages/api/src/index.ts:51` (`app.use('/api/staff', requireStaff(auth), staffRouter)` mount
  pattern — this phase's mount is `app.use('/api/admin/branches', requireAdmin(auth),
  adminBranchesRouter)`, or nested under a shared `/api/admin` mount from Phase 1 if that already
  exists — confirm exact mount shape during RESEARCH, since Phase 1 owns the `/api/admin` mount
  point itself).

---

## Cross-Cutting Compliance

1. **Modularity** — one route file (`packages/api/src/routes/admin/branches.ts`) for this domain,
   guarded once at mount (inherits `requireAdmin` — no per-handler role checks). One app feature
   folder (`apps/admin/src/features/branches/`). Reuses (does not reimplement): `numericToCents`
   from `routes/lib/serializers.ts`, and whatever shared `AdminApiError` / Zod-validation helper
   Phase 1 establishes (if Phase 1 has not yet built a shared admin error class, this phase builds
   the FIRST domain-level `AdminApiError` mirroring `OrderError` — flag this back to the umbrella
   if Phase 1's plan should instead own it; do not silently duplicate across phases).
2. **Clarity** — Zod `safeParse` on all writes; response envelopes `{ branch: ... }` (singular) /
   `{ branches: [...] }` (list) matching the existing public-router convention; kebab-case files,
   camelCase functions, PascalCase components.
3. **Safety** — soft-delete only (`is_active = false`); NEVER `DELETE FROM branches`. Deactivation
   requires a confirmation step in the UI (Safety — logically destructive to future ordering even
   though the row survives).
4. **Security** — every `/api/admin/branches/*` route inherits `requireAdmin` from the router
   mount; no route re-checks role inline. All writes are Zod-validated server-side; client
   validation is never trusted alone.

5. **UI component modularity & reusability** — this is the vertical slice that FIRST extracts the
   cross-domain admin UI composites every later phase reuses. Build branches concretely, then lift the
   recurring CRUD shapes into shared composites under `apps/admin/src/components/`: `data-table.tsx`
   (resource list/table), `form-dialog.tsx` (create/edit form modal), `confirm-dialog.tsx`
   (deactivate/delete confirmation), `page-header.tsx` (title + primary action), `query-states.tsx`
   (loading/empty/error). Each is built ONCE on shadcn primitives and consumed by
   `features/branches/`; P3-P7 import them rather than re-implementing. Keep genuinely
   branch-specific pieces inside `features/branches/`. `ponytail:` extract a composite only where a
   real second consumer is imminent (all five above are known-recurring across every CRUD domain, so
   they qualify now); do not pre-build speculative variants.

---

## Touchpoints

- `packages/api/src/routes/admin/branches.ts` (new) — full CRUD router.
- `packages/api/src/routes/admin/index.ts` or equivalent admin-router aggregator (new, or extend
  Phase 1's if it exists) — mounts `branchesRouter` under `/api/admin/branches`.
- `packages/api/src/routes/lib/admin-errors.ts` (new, IF Phase 1 has not already created a shared
  admin error class) — `AdminApiError` mirroring `OrderError` (`orders.ts:39-47`).
- `packages/api/src/routes/lib/serializers.ts` — READ-ONLY reuse of `numericToCents`; add
  `serializeAdminBranch` (or reuse `serializeBranch` directly — same shape, admin needs no extra
  fields beyond what the public serializer already returns) — confirm during Implementation Step 1
  whether the public `ApiBranch` shape is sufficient for the admin list/detail view or whether an
  admin-specific shape (e.g. exposing `slug`, which the public shape omits) is needed.
- `packages/api/src/index.ts` — mount line for `/api/admin` (only if Phase 1 has not already added
  the top-level `/api/admin` mount; if Phase 1 already mounts an aggregator router, this phase adds
  its sub-router to that aggregator instead of touching `index.ts` directly).
- `packages/api/src/routes/__tests__/admin/branches.test.ts` (new) — supertest integration suite.
- `apps/admin/src/features/branches/` (new): `hooks/use-admin-branches.ts` (react-query
  list/get/create/update/deactivate), `lib/admin-branches-api.ts` (fetch wrapper), `components/`
  (list table, create/edit form, deactivate-confirm dialog), route file(s) per Phase 0's TanStack
  Start routing convention (confirm exact route-file location during RESEARCH — Phase 0 owns the
  app's route-tree shape).
- `packages/types/src/admin.ts` (extend, if Phase 1 created it) — add `AdminBranch` type if the
  admin shape diverges from `ApiBranch`.

---

## Public Contracts

New HTTP surface (all behind `requireAdmin`, JSON in/out):

| Method | Path | Request body | Response | Notes |
|---|---|---|---|---|
| GET | `/api/admin/branches` | — | `{ branches: AdminBranch[] }` | ALL branches (active + inactive) — admin view must show inactive rows, unlike the public `/branches` route which filters `is_active = true` (`branches.ts:39`) |
| GET | `/api/admin/branches/:branchId` | — | `{ branch: AdminBranch }` | 404 if id malformed or not found (no `is_active` filter — admin can view inactive rows) |
| POST | `/api/admin/branches` | `{ name, slug, address, latitude, longitude, phone, openingHours, isAcceptingPickup?, estimatedPrepMinutes? }` | `201 { branch: AdminBranch }` | `slug` uniqueness → `409 { error: 'Slug already in use' }` on DB unique-constraint violation |
| PATCH | `/api/admin/branches/:branchId` | partial of the above (any subset), plus optional `isActive?: boolean` | `200 { branch: AdminBranch }` | Same 409 slug-conflict handling if `slug` is changed to a duplicate. `isActive: true` reactivates a branch the deactivate route set false |
| PATCH | `/api/admin/branches/:branchId/deactivate` | — | `200 { branch: AdminBranch }` | Sets `is_active = false`. Separate endpoint (not a generic PATCH is_active field) so the UI's confirm-step maps to one unambiguous action; reactivation (`is_active = true`) is available via the same generic PATCH endpoint above by design (no separate "reactivate" route needed — only deactivation is the destructive direction needing its own confirm-gated endpoint) |

`AdminBranch` shape (new type, `packages/types/src/admin.ts` or inline in `serializers.ts` if the
admin app doesn't need a shared type — decide during Step 1): mirrors `ApiBranch`
(`serializers.ts:33-45`) plus `slug: string` and `isActive: boolean` (both omitted from the public
shape).

**Shared mutable state contract (critical):** `is_accepting_pickup` has NO separate admin-only
flag — it is the exact same DB column the (not-yet-built) mobile staff shell (STAFF-004) will also
write. This phase's plan explicitly states: there is ONE source of truth
(`branches.is_accepting_pickup`); admin and staff both write it directly; last-write-wins is
accepted for now. If RESEARCH (Step 1 below) finds evidence of an actual race (e.g. a
optimistic-concurrency `updated_at` check already exists elsewhere in the schema), flag it back to
the umbrella plan rather than silently deciding to add or skip a version guard.

---

## Blast Radius

- **Packages touched:** `packages/api` (new route file, new/extended admin-errors module, index.ts
  mount or aggregator extension, test file), `apps/admin` (new feature folder, hooks, components,
  route files), `packages/types` (conditionally, only if `AdminBranch` needs its own shared type).
- **Risk class:** none of the 6 program-defined high-risk classes are hit directly by THIS
  table — `branches` has no auth/billing/migration-of-existing-data/public-external-contract
  surface. It IS a public API contract addition (new `/api/admin/*` surface) so `requireAdmin`
  enforcement is the security-critical line, tested explicitly (see Acceptance Criteria).
- **File count estimate:** ~8-10 new/changed files (1 API route, 1 error module (conditional), 1
  mount-point edit, 1 test file, 4-6 new app files).
- **No schema migration needed** — `branches` table (`schema/branches.ts:13-31`) already has every
  column this phase needs; no new columns, no new migration file.

---

## Implementation Checklist (Implementation Steps)

1. **Confirm admin-router mount shape and shared error class** (RESEARCH gate — do this before
   writing code). Read Phase 1's plan/execution state: does `requireAdmin` exist yet
   (`packages/api/src/lib/require-admin.ts`)? Does a top-level `/api/admin` aggregator router
   exist? Does a shared `AdminApiError` already exist? If Phase 1 is not yet executed, this phase
   is BLOCKED on Phase 1 (see Phase Ordering in umbrella plan — P2 depends on P1). Do not stub or
   fake `requireAdmin` — wait for the real dependency.
2. **Add `packages/api/src/routes/admin/branches.ts`**:
   - `adminBranchesRouter = Router()`.
   - Zod schemas: `createBranchSchema` (all required fields per column constraints — `name`,
     `slug`, `address`, `latitude`/`longitude` as `z.number()`, `phone`, `openingHours`; optional
     `isAcceptingPickup: z.boolean().optional()`, `estimatedPrepMinutes: z.number().int().positive().optional()`)
     and `updateBranchSchema` (`createBranchSchema.partial().extend({ isActive: z.boolean().optional() })` —
     `isActive` is NOT a field on `createBranchSchema`, so `.partial()` alone can't carry it; it must
     be added explicitly here or a generic PATCH can never reactivate a deactivated branch).
   - `GET /` — `db.select().from(branches).orderBy(asc(branches.name))` (no `is_active` filter —
     admin sees everything). Map with `serializeAdminBranch` (or `serializeBranch` + manually spread
     `slug`/`isActive` if no new serializer is added).
   - `GET /:branchId` — same UUID-validate-then-404 pattern as `branches.ts:59-64`, but WITHOUT the
     `is_active` filter in the where clause (`branches.ts:69` filters `is_active = true` — admin's
     version omits that condition).
   - `POST /` — `safeParse` → `400` with `details: parsed.error.issues` on failure (mirror
     `orders.ts:61-64`); insert; catch unique-constraint violation on `slug` → throw `AdminApiError`
     with `status: 409`; a top-level Express error handler (or a try/catch per route, matching
     `orders.ts`'s in-handler catch style) converts it to `res.status(err.status).json({ error:
     err.message })`.
   - `PATCH /:branchId` — same validate/insert-conflict pattern as POST but `update(...).set(...)`
     with only the parsed partial fields (map `isActive` → the `is_active` column so `{ isActive: true }`
     reactivates); 404 if the branch id doesn't exist.
   - `PATCH /:branchId/deactivate` — `update(branches).set({ is_active: false, updated_at: new
     Date() }).where(eq(branches.id, branchId))`; 404 if not found.
3. **Add the shared admin error class** (`packages/api/src/routes/lib/admin-errors.ts`) ONLY if
   Phase 1 has not already created one — mirror `OrderError` (`orders.ts:39-47`) exactly:
   `class AdminApiError extends Error { constructor(readonly status: number, message: string) {
   super(message); this.name = 'AdminApiError'; } }`.
4. **Mount the router**: add `packages/api/src/routes/admin/branches.ts`'s router either as a
   sub-router on Phase 1's `/api/admin` aggregator, or (if no aggregator exists yet) directly:
   `app.use('/api/admin/branches', requireAdmin(auth), adminBranchesRouter)` in `index.ts`,
   following the exact mount-line style at `index.ts:51`.
5. **Write the supertest suite** (`packages/api/src/routes/__tests__/admin/branches.test.ts`),
   mirroring `packages/api/src/routes/__tests__/branches.test.ts` and `orders.test.ts`'s
   supertest+real-DB conventions — see Acceptance Criteria for required cases.
6. **Build `apps/admin/src/features/branches/`**:
   - `lib/admin-branches-api.ts` — thin fetch wrapper (list/get/create/update/deactivate), same
     shape as `apps/mobile/src/lib/api-client.ts`'s `getBranches()`/`getMenu()` pattern but for the
     admin app's own base client (Phase 1's session-aware fetch wrapper — reuse, do not
     reimplement).
   - `hooks/use-admin-branches.ts` — react-query hooks: `useAdminBranches()` (list),
     `useAdminBranch(id)` (detail), `useCreateBranch()`, `useUpdateBranch()`,
     `useDeactivateBranch()` mutations, each invalidating the list query key on success.
   - `components/branch-list.tsx`, `components/branch-form.tsx` (shared create/edit, shadcn/ui form
     components), `components/deactivate-branch-dialog.tsx` (confirmation dialog — Safety
     requirement).
   - Route file(s) per Phase 0's TanStack Start file-routing convention (exact path TBD from Phase
     0's scaffold — confirm during Step 1 research, do not guess the route-tree shape).
7. **Manual verification pass** (Agent-Probe tier — see Verification Evidence): walk create → edit
   → deactivate → attempt duplicate slug in the running admin app against a real (dev) Postgres.

---

## Phase Completion Rules

- CODE DONE: all Implementation Checklist steps applied, typecheck/lint green.
- TESTING: Fully-Automated gates in Verification Evidence all green (`pnpm --filter @jojopotato/api test`).
- VERIFIED: TESTING passed AND the Agent-Probe manual walkthrough (AC7) is confirmed working AND
  the Known-Gap (`is_accepting_pickup` shared-state) is recorded, not silently dropped.
- This phase cannot be marked ✅ VERIFIED without a validate-contract Gate: PASS or an accepted
  CONDITIONAL per the umbrella plan's "What verified means" bar.

## Acceptance Criteria

1. `GET /api/admin/branches` returns ALL branches including inactive ones, admin-authenticated →
   200; unauthenticated or customer/staff-role session → 403 (`requireAdmin` rejection, mirroring
   `require-staff.ts:60-63`'s 403 shape).
2. `POST /api/admin/branches` with a full valid payload → `201` and the row exists in Postgres with
   exact field values (verified by a follow-up `SELECT`, mirroring `orders.test.ts`'s DB-assertion
   style).
3. `POST /api/admin/branches` with a `slug` matching an existing branch → `409 { error: '...' }`
   (typed via `AdminApiError`), and NO duplicate row is created.
4. `PATCH /api/admin/branches/:id` updates only the supplied fields; unsupplied fields are
   unchanged; a follow-up `GET` reflects the update.
5. `PATCH /api/admin/branches/:id/deactivate` sets `is_active = false` in Postgres; the row still
   exists (`SELECT` finds it) — this is the soft-delete Safety guarantee, verified by asserting the
   row count is unchanged before/after.
6. A `staff`-role (non-admin) session hitting any `/api/admin/branches/*` route → `403`, proving
   `requireAdmin` (not `requireStaff`) is the actual guard in effect — this test must use a
   `staff`-role test user, not just an unauthenticated request, to catch a mistaken
   `requireStaff`-instead-of-`requireAdmin` mount.
7. `apps/admin` branches list/create/edit/deactivate screens function against the real API in a
   manual walkthrough (Agent-Probe — see Verification Evidence for exact scope).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `GET /api/admin/branches` — admin session, includes inactive rows | Fully-Automated (`pnpm --filter @jojopotato/api test -- admin/branches`) | AC1 |
| `GET /api/admin/branches` — unauthenticated / customer session → 403 | Fully-Automated | AC1 |
| `POST /api/admin/branches` — valid payload → 201 + DB row match | Fully-Automated | AC2 |
| `POST /api/admin/branches` — duplicate slug → 409, no dup row | Fully-Automated | AC3 |
| `PATCH /api/admin/branches/:id` — partial update, unsupplied fields unchanged | Fully-Automated | AC4 |
| `PATCH /api/admin/branches/:id/deactivate` — `is_active` false, row count unchanged | Fully-Automated | AC5 |
| `staff`-role session on `/api/admin/branches/*` → 403 (proves `requireAdmin` not `requireStaff`) | Fully-Automated (dedicated staff-role fixture user, mirroring `require-staff.integration.test.ts`'s self-seeding fixture pattern) | AC6 |
| Manual walkthrough: list → create → edit → deactivate → duplicate-slug attempt in the running `apps/admin` UI against dev Postgres | Agent-Probe | AC7 |
| `is_accepting_pickup` shared-state note reviewed against Phase 1/mobile staff shell design (no automated test possible until STAFF-004 exists) | Hybrid → Known-Gap (documented, not silently dropped — see Test Infra Improvement Notes) | Public Contracts §Shared mutable state contract |

Requires: `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` before running the
Fully-Automated tier (same precondition as existing `packages/api` vitest suites).

---

## Test Infra Improvement Notes

- The `is_accepting_pickup` race-condition concern (admin write vs. future STAFF-004 mobile write)
  cannot get real automated coverage until STAFF-004 exists — recorded here as a tracked Known-Gap,
  not silently dropped. If STAFF-004 ships an optimistic-concurrency guard, Phase 2's route needs a
  follow-up patch to respect it; flag this in the phase report's `## Forward Preview`.
- No RN/browser E2E runner exists for `apps/admin` yet (Phase 0 scope, not this phase) — the
  Agent-Probe manual walkthrough (AC7) is the only coverage for the actual screen interactions
  until such a runner is set up; this mirrors the project-wide gap already documented in
  `process/context/tests/all-tests.md`.

---

## Phase Loop Progress

- [ ] Step 1 — RESEARCH
- [ ] Step 2 — INNOVATE
- [ ] Step 3 — PLAN-SUPPLEMENT
- [ ] Step 4 — PVL (plan-validate loop)
- [ ] Step 5 — EXECUTE
- [ ] Step 6 — EVL (execute-validate loop)
- [ ] Step 7 — UPDATE PROCESS

---


**Execute anchor:** this file (`phase-02-branches_PLAN_14-07-26.md`) is the primary execute anchor
for Phase 2 — there are no supporting phase files split out from it; EXECUTE reads this one file
in full.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-02-branches_PLAN_14-07-26.md`
2. **Last completed phase or step:** none — plan just written, Phase Loop Progress all unchecked.
3. **Validate-contract status:** pending (placeholder below — vc-validate-agent writes this before
   EXECUTE).
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`,
   `packages/api/src/routes/branches.ts`, `packages/api/src/db/schema/branches.ts`,
   `packages/api/src/routes/lib/serializers.ts`, `packages/api/src/routes/orders.ts`,
   `packages/api/src/lib/require-staff.ts`, `packages/api/src/index.ts`.
5. **Next step for a fresh agent picking up mid-execution:** confirm Phase 1 (`requireAdmin`,
   `/api/admin` mount point, any shared `AdminApiError`) is actually merged/available before
   starting Step 1 RESEARCH for this phase — this phase is hard-blocked on Phase 1's output per the
   umbrella's Phase Ordering table.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
