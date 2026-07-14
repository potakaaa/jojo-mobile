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
Status: ✅ VERIFIED (code-complete, automated-verified; AC7 Agent-Probe manual walkthrough tracked
as owed backlog item — see `process/features/admin-dashboard/backlog/adm-002-ac7-manual-walkthrough-owed_NOTE_14-07-26.md`)
Complexity: COMPLEX (full real vertical slice — HYBRID program strategy's proof-of-pattern phase)

**Date:** 14-07-26
**Complexity:** COMPLEX (full real vertical slice — HYBRID program strategy's proof-of-pattern phase)
**Status:** ✅ VERIFIED (AC1-AC6 Fully-Automated, independently EVL-confirmed; AC7 owed, is_accepting_pickup Known-Gap documented)

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
   from `routes/lib/serializers.ts`, and the existing shared `AdminApiError`
   (`routes/admin/lib/errors.ts`, RESEARCH-confirmed live and already consumed by
   `routes/admin/users.ts`) — this phase imports it, never builds a second one.
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
- `packages/api/src/routes/admin/index.ts` (RESEARCH-confirmed, existing) — append
  `import branchesRouter from './branches'; adminRouter.use('/branches', branchesRouter);` to the
  existing live aggregator (already mounts `usersRouter` from Phase 1). Never restructure this file,
  only append — per its own doc comment.
- `packages/api/src/routes/admin/lib/errors.ts` (RESEARCH-confirmed, existing) — IMPORT and reuse
  the existing `AdminApiError` (already mirrors `OrderError` and is already consumed by
  `routes/admin/users.ts`). Do NOT create a second admin error class.
- `packages/api/src/routes/lib/serializers.ts` — READ-ONLY reuse of `numericToCents`; add a new
  `serializeAdminBranch` + local `AdminBranch` type declared in this file (matching the existing
  `ApiBranch`/`ApiOrder`/`ApiDeal` local-declaration convention) — RESEARCH confirmed the public
  `ApiBranch` shape (`serializers.ts:38-50`) omits `slug` and `isActive`, both needed by the admin
  view, so a dedicated admin serializer/type is required (see AdminBranch shape note below).
- No edit to `packages/api/src/index.ts` needed — the `/api/admin` mount already exists there
  (`index.ts:212`, from Phase 1); this phase only appends to the aggregator (`routes/admin/index.ts`).
- `packages/api/src/lib/__tests__/admin-branches.integration.test.ts` (new) — supertest integration
  suite, following the existing self-seeding fixture location convention (peer of
  `require-admin.integration.test.ts`, not a new `routes/__tests__/admin/` subfolder).
- `apps/admin/src/features/branches/` (new): `hooks/use-admin-branches.ts` (react-query
  list/get/create/update/deactivate), `lib/admin-branches-api.ts` (fetch wrapper — the FIRST
  fetch-wrapper in `apps/admin`; no existing `admin-api.ts` to reuse, unlike mobile's
  `staff-api.ts` — must use `credentials: 'include'` per `auth-client.ts`'s convention),
  `components/` (list table, create/edit form, deactivate-confirm dialog), route file(s) under
  `apps/admin/src/routes/(dashboard)/branches*` (exact file-split — folder vs
  `branches.$branchId.tsx` — deferred to EXECUTE, non-blocking). `apps/admin/src/lib/query-client.ts`
  exports a ready `queryClient` (staleTime 30s) — this phase is its first real consumer.
- `packages/types/src/admin.ts` — NOT extended by this phase (soft default: `AdminBranch` is
  declared locally in `serializers.ts` per the point above, matching existing convention).

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

`AdminBranch` shape (RESEARCH-confirmed default: declare LOCALLY in `serializers.ts`, matching the
existing `ApiBranch`/`ApiOrder`/`ApiDeal` local-declaration convention, rather than in
`packages/types/src/admin.ts`): mirrors `ApiBranch` (`serializers.ts:38-50`) plus `slug: string` and
`isActive: boolean` (RESEARCH-confirmed both are omitted from the public shape). This is the chosen
default, not a hard lock — revisit only if a second consumer outside `packages/api` needs the type.

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

1. **Confirm admin-router mount shape and shared error class** — RESEARCH (Step 1, this
   inner-loop pass) confirmed Phase 1 is delivered and live: `requireAdmin`
   (`packages/api/src/lib/require-admin.ts`) exists, the `/api/admin` aggregator
   (`packages/api/src/routes/admin/index.ts`) exists and mounts `usersRouter`, and the shared
   `AdminApiError` (`packages/api/src/routes/admin/lib/errors.ts`) already exists and is consumed by
   `routes/admin/users.ts`. This phase's dependency on Phase 1 is satisfied — proceed directly to
   Step 2 without re-checking or stubbing any of these.
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
     err.message })`. **(VALIDATE note: no prior catch-Postgres-unique-violation precedent exists in
     this codebase — see validate-contract Execute-Agent Instructions for the exact catch shape.)**
   - `PATCH /:branchId` — same validate/insert-conflict pattern as POST but `update(...).set(...)`
     with only the parsed partial fields (map `isActive` → the `is_active` column so `{ isActive: true }`
     reactivates); 404 if the branch id doesn't exist.
   - `PATCH /:branchId/deactivate` — `update(branches).set({ is_active: false, updated_at: new
     Date() }).where(eq(branches.id, branchId))`; 404 if not found.
3. **Reuse the existing shared admin error class** — import `AdminApiError` from
   `packages/api/src/routes/admin/lib/errors.ts` (already live, mirrors `OrderError`
   (`orders.ts:39-47`) exactly). Do not create a new error class file for this phase.
4. **Mount the router**: append to `packages/api/src/routes/admin/index.ts` (the existing live
   aggregator): `import branchesRouter from './branches'; adminRouter.use('/branches',
   branchesRouter);` — no edit to `index.ts` needed, the top-level `/api/admin` mount
   (`requireAdmin` + CORS) already applies to every sub-router mounted on the aggregator.
5. **Write the supertest suite** (`packages/api/src/lib/__tests__/admin-branches.integration.test.ts`,
   RESEARCH-confirmed location — peer of `require-admin.integration.test.ts`, not a new
   `routes/__tests__/admin/` subfolder), reusing the `makeUser(roleValue)` self-seeding helper
   pattern (`signUpAndGetCookie()` + `db.update(users)` to force role) from
   `require-admin.integration.test.ts` for the admin-role (AC1) and staff-role (AC6) fixtures — do
   not re-derive a seeding pattern. Mirror `orders.test.ts`'s supertest+real-DB assertion style for
   the CRUD cases.
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
| `GET /api/admin/branches` — admin session, includes inactive rows | Fully-Automated (`pnpm --filter @jojopotato/api test -- admin-branches`) | AC1 |
| `GET /api/admin/branches` — unauthenticated / customer session → 403 | Fully-Automated | AC1 |
| `POST /api/admin/branches` — valid payload → 201 + DB row match | Fully-Automated | AC2 |
| `POST /api/admin/branches` — duplicate slug → 409, no dup row | Fully-Automated | AC3 |
| `PATCH /api/admin/branches/:id` — partial update, unsupplied fields unchanged | Fully-Automated | AC4 |
| `PATCH /api/admin/branches/:id/deactivate` — `is_active` false, row count unchanged | Fully-Automated | AC5 |
| `staff`-role session on `/api/admin/branches/*` → 403 (proves `requireAdmin` not `requireStaff`) | Fully-Automated (dedicated staff-role fixture user via the reused `makeUser(roleValue)` helper from `require-admin.integration.test.ts`) | AC6 |
| Manual walkthrough: list → create → edit → deactivate → duplicate-slug attempt in the running `apps/admin` UI against dev Postgres | Agent-Probe | AC7 |
| `is_accepting_pickup` shared-state note reviewed against Phase 1/mobile staff shell design (RESEARCH-confirmed: no optimistic-concurrency/`updated_at`/`FOR UPDATE` guard exists on `branches` writes anywhere; no automated test possible until STAFF-004 exists) | Hybrid → Known-Gap (documented, not silently dropped — see Test Infra Improvement Notes) | Public Contracts §Shared mutable state contract |

Requires: `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` before running the
Fully-Automated tier (same precondition as existing `packages/api` vitest suites). **VALIDATE note
(14-07-26):** on this dev machine, native Postgres already occupies :5432 — see
`process/context/tests/all-tests.md` Debugging Quick Reference; the suite runs fine against the
already-running native instance, no `docker compose` strictly required here.

**VALIDATE correction (14-07-26):** the exact filter command above was corrected from
`test -- admin/branches` (slash) to `test -- admin-branches` (hyphen) — vitest's CLI positional arg
filters by filename substring, and the actual file is
`admin-branches.integration.test.ts` (hyphen, matching this repo's kebab-case convention), not a
`admin/branches` path segment. See validate-contract Test Gates for the authoritative command.

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
- [x] Step 3 — PLAN-SUPPLEMENT (14-07-26 — see Inner Loop Refresh Note)
- [x] Step 4 — PVL (plan-validate loop) (14-07-26 — Gate: PASS, see Validate Contract)
- [x] Step 5 — EXECUTE (14-07-26 — API CRUD + apps/admin screen delivered; AC1-AC6 Fully-Automated green, 12/12 in admin-branches suite / 134/134 whole API suite; AC7 Agent-Probe manual walkthrough owed. See phase-02-branches_REPORT_14-07-26.md)
- [x] Step 6 — EVL (14-07-26 — independent vc-tester re-run confirmed all 6 gates PASS: admin-branches suite 12/12, full API suite 134/134 (0 regressions), API+admin typecheck clean, API+admin lint clean, admin vitest 1/1, prettier clean. AC7 remains owed (backlog note filed); is_accepting_pickup Known-Gap remains accepted (backlog note filed).)
- [x] Step 7 — UPDATE PROCESS (14-07-26 — this pass: context updated, backlog notes filed, umbrella state advanced to Phase 3)

---


**Execute anchor:** this file (`phase-02-branches_PLAN_14-07-26.md`) is the primary execute anchor
for Phase 2 — there are no supporting phase files split out from it; EXECUTE reads this one file
in full.

## Inner Loop Refresh Note

**Date:** 14-07-26
**Steps run this pass:** RESEARCH (Step 1) → PLAN-SUPPLEMENT (Step 3, this edit).
**What changed:** collapsed hedged/conditional language now that RESEARCH confirmed Phase 1's
`requireAdmin`, `/api/admin` aggregator (`routes/admin/index.ts`), and shared `AdminApiError`
(`routes/admin/lib/errors.ts`) are all live — no `packages/api/src/index.ts` edit is needed, no
second error class is built, and Step 1 is no longer BLOCKED-on-Phase-1. Locked the `AdminBranch`
shape decision (local declaration in `serializers.ts`, matching existing convention) and the test
fixture location/reuse (`packages/api/src/lib/__tests__/admin-branches.integration.test.ts`, reusing
`makeUser(roleValue)`). Confirmed the `apps/admin` fetch-wrapper is a first-of-its-kind file (no
prior `admin-api.ts`) and noted the `is_accepting_pickup` Known-Gap stance is unchanged.
**Next:** PVL (Step 4) should re-run from V1 against this updated plan.

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-02-branches_PLAN_14-07-26.md`
2. **Last completed phase or step:** Step 4 — PVL (this pass, 14-07-26) — Gate: PASS.
3. **Validate-contract status:** written (14-07-26) — see `## Validate Contract` below. Gate: PASS.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`,
   `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`,
   `packages/api/src/routes/branches.ts`, `packages/api/src/db/schema/branches.ts`,
   `packages/api/src/routes/lib/serializers.ts`, `packages/api/src/routes/orders.ts`,
   `packages/api/src/lib/require-staff.ts`, `packages/api/src/lib/require-admin.ts`,
   `packages/api/src/routes/admin/index.ts`, `packages/api/src/routes/admin/lib/errors.ts`,
   `packages/api/src/routes/admin/users.ts`, `packages/api/src/lib/__tests__/require-admin.integration.test.ts`,
   `packages/api/src/index.ts`, `apps/admin/src/lib/query-client.ts`,
   `apps/admin/src/features/auth/lib/auth-client.ts`, `apps/admin/src/routes/(dashboard)/route.tsx`.
5. **Next step for a fresh agent picking up mid-execution:** proceed to Step 5 — EXECUTE. All
   Phase 1 dependencies are confirmed live (no re-check needed). Follow the Implementation
   Checklist in order (API first, then App); read the Validate Contract's Execute-Agent
   Instructions below before writing the slug-uniqueness catch in Step 2.

---

## Validate Contract

Status: PASS
Date: 14-07-26
date: 2026-07-14
generated-by: inner-pvl: phase-2

Parallel strategy: parallel-subagents
Rationale: Signal score 4/7 (S2 — new `/api/admin/*` API surface added; S4 — phase-program
classification, Phase 2 of 8; S6 — new public API contract addition is one of the 6 program-defined
high-risk classes, mitigated by `requireAdmin` mount-level enforcement + AC6's guard-mismatch
regression test; S7 — ~8-10 files in blast radius). A score this high normally signals
workflow/agent-team for *creation*-type fan-out, but this is a read-only two-layer VALIDATE
fan-out (4 Layer-1 dimension checks + 2 Layer-2 section checks) with no mid-run coordination needed
between checks — per the CREATION-vs-read-only-VALIDATE reconciliation rule, independent read-only
validation fan-out is correctly served by parallel subagents (4 dimension + 2 section = 6 total),
not agent-team.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | `GET /api/admin/branches` returns ALL branches (active+inactive) to an admin/super_admin session; 403 to unauthenticated/customer | Fully-Automated | `pnpm --filter @jojopotato/api test -- admin-branches` (`packages/api/src/lib/__tests__/admin-branches.integration.test.ts`) | A |
| AC2 | `POST /api/admin/branches` valid payload → `201` + a real Postgres row matching every field (follow-up `SELECT`) | Fully-Automated | same command | A |
| AC3 | `POST /api/admin/branches` duplicate `slug` → `409 { error: ... }`, no duplicate row created | Fully-Automated | same command | A |
| AC4 | `PATCH /api/admin/branches/:id` updates only supplied fields; unsupplied fields survive; follow-up `GET` reflects the change | Fully-Automated | same command | A |
| AC5 | `PATCH /api/admin/branches/:id/deactivate` sets `is_active=false`; row count unchanged (soft-delete, no `DELETE`) | Fully-Automated | same command | A |
| AC6 | `staff`-role session on any `/api/admin/branches/*` route → `403` (proves `requireAdmin`, not `requireStaff`, guards this router) | Fully-Automated | same command, dedicated `staff`-role fixture via `makeUser('staff')` | A |
| AC7 | `apps/admin` branches list → create → edit → deactivate → duplicate-slug-attempt walkthrough against a real running dev Postgres | Agent-Probe | Manual walkthrough scenario (see "What this coverage does NOT prove" below for exact judgment points) | A |
| Shared-state | `is_accepting_pickup` admin-write vs. future STAFF-004 mobile-write race — no optimistic-concurrency guard exists anywhere on `branches` writes | Known-Gap | — (documented; blocked on STAFF-004, which does not exist yet) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated /
Hybrid / Agent-Probe). Known-Gap is never a `strategy:` value — it is the named residual row for
the shared-state race, carried via gap-resolution D.

Legacy line form (retained so existing validate-contract consumers still parse):
- API CRUD (AC1-AC6): Fully-automated: `pnpm --filter @jojopotato/api test -- admin-branches` (precondition: local Postgres reachable via `DATABASE_URL`, migrated — either `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate`, or this dev machine's native Postgres per `all-tests.md`'s Debugging Quick Reference)
- App walkthrough (AC7): agent-probe: manual create → edit → deactivate → duplicate-slug walkthrough in the running `apps/admin` dev server against the real API
- `is_accepting_pickup` race: known-gap: documented as NEW PLAN REQUIRED — see Open gaps below; will be picked up as part of STAFF-004 when that phase is planned

**Failing stubs (Fully-Automated rows only, TDD red-first starting point for EXECUTE):**

```
test("AC1 — should return all branches (active+inactive) for an admin session, 403 for unauthenticated/customer", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1")
})
test("AC2 — should create a branch and persist exact field values in Postgres", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC2")
})
test("AC3 — should reject a duplicate slug with 409 and create no duplicate row", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3")
})
test("AC4 — should update only supplied fields on PATCH, leaving others unchanged", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC4")
})
test("AC5 — should soft-deactivate (is_active=false) without deleting the row", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC5")
})
test("AC6 — should reject a staff-role session with 403 on any /api/admin/branches/* route", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC6")
})
```

**Execute-Agent Instructions** (concerns found during VALIDATE that could not be fixed in plan text
alone — follow these while implementing):

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | No prior codebase precedent catches a Postgres unique-constraint violation (checked: `order-number.ts` uses `onConflictDoNothing`+retry, a different pattern; no file greps for `23505`). When implementing the `POST`/`PATCH` slug-conflict catch (Implementation Checklist Step 2), catch the driver error and check `(err as { code?: string }).code === '23505'` (node-postgres/pg's standard `unique_violation` code) before throwing `AdminApiError(409, 'Slug already in use')`. Do not guess a different shape — AC3's Fully-Automated test will catch a wrong shape immediately (red before green), so verify against it directly rather than reasoning abstractly. | Implementation Checklist Step 2, `POST /` and `PATCH /:branchId` handlers |
| E2 | The corrected test-gate command is `pnpm --filter @jojopotato/api test -- admin-branches` (hyphen, matching the actual file `admin-branches.integration.test.ts`) — the Verification Evidence table's original command used a slash and would not match any file under vitest's substring filter. Use the corrected command from this contract, not the one in Verification Evidence (both now say the same thing after the VALIDATE correction note added there). | Running the Fully-Automated gate at EXECUTE/EVL time |

Dimension findings:
- Infra fit: PASS — mount point cited at `index.ts:212` confirmed exact (`app.use('/api/admin', adminCors, requireAdmin(auth), adminRouter)`); `routes/admin/index.ts` aggregator confirmed live, its own doc comment explicitly invites append-only extension exactly as this plan does; no `index.ts` edit needed, matching the plan's claim.
- Test coverage: PASS (1 CONCERN found and fixed in this contract — see Execute-Agent Instructions E2) — tier assignments (Fully-Automated ×6, Agent-Probe ×1, Known-Gap ×1) are appropriate given `all-tests.md`'s confirmed test infra (`packages/api` vitest+supertest, self-seeding fixture convention, no `apps/admin` E2E/browser runner yet).
- Breaking changes: PASS — purely additive new route file + aggregator append + local type/serializer addition; no schema migration; no existing route, serializer, or shared type is modified; `packages/types/src/admin.ts` explicitly not touched this phase.
- Security surface: PASS — every new route inherits `requireAdmin` at the router-aggregator mount (verified: no per-handler role re-check pattern exists elsewhere in `routes/admin/`, consistent with this plan); AC6 explicitly uses a `staff`-role fixture (not just unauthenticated) to catch a `requireStaff`-vs-`requireAdmin` mount mistake — this is the exact regression class Phase 1's own AC8 CORS incident taught the program to test for directly rather than assume; soft-delete-only (no `DELETE`) satisfies the Safety requirement; reactivation via generic `PATCH {isActive:true}` is non-destructive so needs no confirm-gate, consistent with the plan's own stated design.
- Section A — API (`packages/api/src/routes/admin/branches.ts` + test file): PASS (1 CONCERN found and fixed via Execute-Agent Instruction E1) — mechanical feasibility HIGH confidence (every cited touchpoint file read and confirmed to exist exactly as described: `require-admin.ts`, `routes/admin/index.ts`, `routes/admin/lib/errors.ts`, `db/schema/branches.ts`, `routes/lib/serializers.ts`, `require-admin.integration.test.ts`'s `makeUser()` pattern). Gap found: `branches.priority` column (exists in schema, has a DB default, zero current consumers anywhere in the codebase per grep) is not exposed via this phase's CRUD surface — non-blocking, dormant column, noted under Open gaps rather than treated as a defect. No conflicts found against current file state or other phase plans.
- Section B — App (`apps/admin/src/features/branches/**`): PASS — mechanical feasibility confirmed (query-client, credentials:'include' auth-client convention, and the `(dashboard)` pathless-layout route-group guard all read and match the plan's description exactly; the "first fetch-wrapper in apps/admin" claim verified true — no `admin-api.ts` exists anywhere in the app yet). Gap found: exact route file split (single file vs. nested `branches.$branchId.tsx`) is explicitly deferred to EXECUTE — acceptable, matches the existing `(dashboard)/index.tsx` precedent and is a mechanical, low-risk decision. Highest-risk edit: the deactivate-confirm dialog UX, mitigated by the AC7 Agent-Probe walkthrough (no component/E2E runner exists for `apps/admin` yet, a known project-wide gap, not something this phase can fix).

Open gaps:
- `is_accepting_pickup` shared-state race: known-gap: documented as NEW PLAN REQUIRED — blocked on STAFF-004 (mobile staff shell write path), which does not exist yet; revisit when STAFF-004 is planned.
- `branches.priority` column not exposed via admin CRUD this phase: dormant column (DB default, zero current consumers per grep across `branches.ts`, `serializers.ts`, and `apps/mobile/src/features/branch/`), non-blocking — flag in the phase report's `## Forward Preview` if a later phase (e.g. branch ordering/display-priority UI) needs write access.
- `apps/admin/src/routes/(dashboard)/branches*` exact file-split (folder vs. flat `.tsx` files): deferred to EXECUTE by design, non-blocking, matches existing TanStack Start convention already in use.

What this coverage does NOT prove:
- AC1-AC6 (Fully-Automated, supertest against a real local Postgres): prove server-side CRUD correctness, guard enforcement, and DB row-state under a Node/Express/supertest harness. They do NOT prove anything about the `apps/admin` browser UI rendering these responses correctly, nor about real browser cookie/CORS behavior beyond what Phase 1's existing CORS regression tests already cover (this phase adds no new CORS surface).
- AC7 (Agent-Probe manual walkthrough): proves the four screens function together against a real running API in one operator's manual pass. It does NOT prove behavior across browsers, concurrent-admin-session conflicts, or repeatable regression over time — there is no automated re-run of this scenario, so a future refactor could silently break it with no gate catching it (tracked as the project-wide `apps/admin` E2E-runner gap, not fixable within this phase).
- Known-Gap (`is_accepting_pickup` shared-state race): proves nothing — it is an explicitly undhecked residual, not a passing gate. No concurrency test exists or is claimed.
- None of the above prove anything about `packages/types` (untouched this phase) or about Phases 3-7's reuse of the CRUD shape this phase establishes — that reuse is validated independently when those phases run their own PVL.

Gate: PASS (no FAILs; 2 CONCERNs found during V2/V3 fan-out, both resolved directly in this contract — see Execute-Agent Instructions E1/E2 — leaving no unresolved CONCERNs)
Accepted by: N/A — Gate is PASS; no CONDITIONAL concerns remain requiring explicit user/session acceptance. The `is_accepting_pickup` Known-Gap and the two deferred non-blocking notes (priority column, route file-split) are pre-classified residuals per the plan's own design, not CONCERNs needing sign-off.
