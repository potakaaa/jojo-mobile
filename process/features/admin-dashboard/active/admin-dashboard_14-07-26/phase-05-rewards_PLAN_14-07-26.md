---
name: plan:admin-phase-05-rewards
description: "Phase 5 (ADM-005, #43) — Rewards CRUD for the admin dashboard program"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 5
---

# Phase 5 — Rewards CRUD (ADM-005, #43)

**Date:** 14-07-26
**Complexity:** COMPLEX (phase-program phase plan)
**Status:** ⏳ PLANNED

Date: 14-07-26
Status: PLANNED
Complexity: COMPLEX (phase-program phase plan)

### Phase Completion Rules

This phase is CODE DONE when all Implementation Checklist items are complete and fully-automated
test gates in Verification Evidence are green. It is VERIFIED only after EVL confirms all gates
independently and the reward-retroactivity regression test (AC1) passes — Known-Gap is banned for
AC1 per the umbrella charter.

---

## Overview

Add CRUD for `rewards` (`packages/api/src/db/schema/rewards.ts:4-14`) behind the admin dashboard:
name, `required_stars` (integer), `reward_type` (free-text `varchar` — **not** a DB `pgEnum`),
`reward_value` (`numeric(10,2)`, nullable), `eligible_product_id` (nullable FK → `products.id`), and
the existing `is_active` boolean for soft-delete.

Because `reward_type` has no DB-level constraint, the admin API MUST validate it against an
app-level allow-list (Zod enum) — the database will silently accept any string, so correctness here
is entirely an application-layer responsibility (Safety/Clarity cross-cutting principles).

The umbrella's second named **HARD invariant** lives in this phase: editing a reward's
`required_stars` must affect **future** redemptions only, and must **never** rewrite historical
`star_transactions` rows. Confirmed structurally safe by inspection — `star_transactions`
(`packages/api/src/db/schema/star_transactions.ts:7-20`) has columns `id, user_id, order_id, type
(earned|redeemed|adjusted|expired), stars, description, created_at` and **carries no FK or column
referencing `rewards` at all** (no `reward_id`), so a reward row's `required_stars` value can never
be structurally reachable from a `star_transactions` row — there is no join path for an UPDATE to
`rewards` to cascade into. This phase must still add an automated regression test that PROVES this
byte-for-byte (see Acceptance Criteria #1) — the charter bans Known-Gap for this invariant even
though the schema shape makes accidental violation unlikely; the test exists to catch a future
schema/route change that introduces a join and silently breaks the invariant.

Dependency per Phase Map: depends on P0 (scaffold) + P1 (auth/RBAC — `requireAdmin`), **not** on
P2/P3/P4 (branches/products/deals) — `eligible_product_id` is a nullable, unenforced-at-write-time
reference for display/filtering only in this phase's scope (no product-existence validation is
required beyond FK integrity; product picker UI is a nice-to-have, not a hard requirement, since
Phase 5 has no ordering dependency on Phase 3's products UI existing yet in a HYBRID build).

---

## Cross-Cutting Compliance

1. **Modularity** — one route file `packages/api/src/routes/admin/rewards.ts` (new), mounted once
   inside the shared `adminRouter` (established in Phase 1) behind `requireAdmin`. One feature folder
   `apps/admin/src/features/rewards/**` (new: list, create/edit form, delete/deactivate action).
   Reuses Phase 1's shared `requireAdmin` guard, shared `AdminApiError`/error-envelope pattern, and
   Phase 2's established serializer file convention (`admin/lib/serializers.ts`-style helper) rather
   than reimplementing money/shape conversion locally.
2. **Clarity** — Zod `safeParse` request validation (mirrors `routes/orders.ts:24-34`); response
   envelopes `{ resource: reward }` / `{ resources: reward[] }` matching the branches/orders/staff
   convention; typed errors via the shared admin error class (mirrors `OrderError`,
   `packages/api/src/routes/orders.ts:39-47`); serializer helper converts DB row → API shape,
   including `reward_value` decimal-string → cents via the existing `numericToCents`
   (`packages/api/src/routes/lib/serializers.ts:105-107`) — reused, not reimplemented.
3. **Safety** — soft-delete via existing `rewards.is_active` (`rewards.ts:11`) — no hard `DELETE`.
   Editing `required_stars` requires an explicit UI confirmation step ("this only affects future
   redemptions") since it is logically destructive to in-flight customer expectations even though no
   row is deleted. The reward-retroactivity regression test (Acceptance Criteria #1) is the
   non-negotiable proof for this section — Known-Gap is banned.
4. **Security** — `/api/admin/rewards/*` mounted behind `requireAdmin` at the router level (same
   pattern as `app.use('/api/staff', requireStaff(auth), staffRouter)`,
   `packages/api/src/index.ts:51`) — never a per-handler inline role check. All request bodies
   validated server-side with Zod; a client-side rejection is never trusted as the only gate.

---

## Touchpoints

- `packages/api/src/routes/admin/rewards.ts` (new) — CRUD route handlers
- `packages/api/src/routes/admin/lib/serializers.ts` (shared, established Phase 1/2 — extended with
  `serializeReward`)
- `packages/api/src/routes/admin/index.ts` (established Phase 1) — mount `rewardsRouter` into the
  shared `adminRouter`
- `packages/types/src/admin.ts` (established Phase 1) — extend with `AdminReward`, `RewardType`
  allow-list type, request/response DTOs
- `apps/admin/src/features/rewards/**` (new) — list screen, create/edit form, deactivate action,
  API client hook(s)
- `packages/api/src/db/schema/rewards.ts` — READ ONLY, no schema change expected (confirm during
  RESEARCH; only touch if `is_active` or another column is found missing)
- Regression test file (new, exact location TBD at PLAN-SUPPLEMENT / EXECUTE) — proves
  reward-retroactivity invariant

## Public Contracts

- `GET /api/admin/rewards` → `{ resources: AdminReward[] }` (list, includes inactive unless
  `?active=true` filter — confirm exact query-param shape during RESEARCH/EXECUTE against Phase 2's
  established list-filter convention)
- `GET /api/admin/rewards/:id` → `{ resource: AdminReward }`
- `POST /api/admin/rewards` → validates body against Zod schema (name, `requiredStars: number
  (int, positive)`, `rewardType: z.enum([...allow-list])`, `rewardValueCents: number | null`,
  `eligibleProductId: string uuid | null`) → `{ resource: AdminReward }`
- `PATCH /api/admin/rewards/:id` → partial update, same validation rules per field present →
  `{ resource: AdminReward }`
- `PATCH /api/admin/rewards/:id/deactivate` (or `is_active` toggle via the same PATCH — decide
  during EXECUTE which convention Phase 2/3 established and match it) → soft-delete
- All routes require `requireAdmin` session; `admin` and `super_admin` both permitted (rewards CRUD
  is not a `super_admin`-only action, per the umbrella's role-management scoping — only role
  promotion/demotion itself is `super_admin`-gated)

## Blast Radius

- **Packages touched:** `packages/api` (new route file + shared admin router mount + serializer
  extension), `packages/types` (new/extended `admin.ts` types), `apps/admin` (new feature folder)
- **Estimated file count:** ~6-9 new/modified files (1 route, 1 serializer extension, 1 types
  extension, 1 router-mount edit, 3-4 new `apps/admin` files, 1 new regression test file)
- **Risk class:** MEDIUM — no schema migration expected, no destructive-by-default operation
  (soft-delete only), but carries one of the program's two named HARD invariants
  (reward-retroactivity) — elevates this phase's test-gate bar above a normal CRUD phase despite the
  otherwise-low blast radius

---

## Implementation Checklist

**EXECUTE-level checklist finalized at this phase's inner-loop PLAN-SUPPLEMENT after RESEARCH — kept flexible so earlier phases' CRUD pattern informs the exact steps.**

High-level outline only:

1. RESEARCH: confirm Phase 1/2/3's established `admin/lib/serializers.ts` and `AdminApiError`
   conventions exist and are reusable as-is (do not re-derive independently); confirm whether
   `rewards.reward_type` should have an app-level allow-list sourced from a shared constant
   (mirroring `STAFF_ROLES` in `packages/types/src/staff.ts`) — propose `REWARD_TYPES` in
   `packages/types/src/admin.ts` if none exists yet.
2. Add `rewards.ts` route file: list/get/create/update/deactivate handlers, Zod schemas, `requireAdmin`
   already applied at router-mount (no per-handler check needed).
3. Extend `packages/types/src/admin.ts`: `AdminReward` type, `RewardType` allow-list constant + type,
   request/response DTOs.
4. Extend admin serializer helper: `serializeReward` (DB row → API shape; `reward_value` numeric →
   cents via `numericToCents`).
5. Mount `rewardsRouter` into the shared `adminRouter` (established Phase 1).
6. Build `apps/admin/src/features/rewards/**`: list screen (table: name, required_stars, reward_type,
   is_active), create/edit form (with reward_type dropdown sourced from the allow-list, not free
   text), deactivate action with confirmation dialog per Cross-Cutting Compliance #3.
7. Write the reward-retroactivity regression test (Acceptance Criteria #1) — this is the
   highest-priority test in the phase and should be written before/alongside the CRUD handlers
   (TDD-first), not deferred to the end.
8. Write remaining fully-automated + hybrid test gates per the Verification Evidence table.

---

## Acceptance Criteria

1. **[TOP-BILLED — HARD INVARIANT]** Editing a reward's `required_stars` (via `PATCH
   /api/admin/rewards/:id`) leaves every existing `star_transactions` row byte-for-byte unchanged.
   Proven by a dedicated automated regression test that: seeds a reward + at least one
   `star_transactions` row referencing the same user (not the reward — there is no FK, confirmed at
   `packages/api/src/db/schema/star_transactions.ts:7-20`), snapshots all `star_transactions` rows,
   performs the `required_stars` update, re-reads all `star_transactions` rows, and asserts deep
   equality against the snapshot. Known-Gap is BANNED for this criterion per the umbrella charter.
2. `POST /api/admin/rewards` and `PATCH /api/admin/rewards/:id` create/update a reward with valid
   fields and persist correctly (round-trip read matches write). Cite the route handler once written
   (file:line to be confirmed at EXECUTE).
3. An invalid `reward_type` value (not in the app-level allow-list) is rejected with a 4xx response
   at the API layer — proven by a test asserting the DB itself has NO enum constraint (confirmed:
   `rewards.ts:8` is a plain `varchar`, so app-level Zod validation is the *only* gate) and that the
   Zod schema rejects an out-of-list value before it reaches the DB.
4. Only `admin`/`super_admin` roles can write to `/api/admin/rewards/*` — a `customer` or `staff`
   session receives 403 (mirrors the `requireStaff` 403 pattern at `require-staff.ts:65`, via the
   Phase 1 `requireAdmin` equivalent). A read from a non-admin session is also rejected (no read-only
   admin-lite exception in this program).
5. Deactivating a reward (`is_active` → false) hides it from the default admin list view but the row
   is retained (soft-delete, per Cross-Cutting Compliance #3) — no hard `DELETE` statement is issued
   against `rewards`.
6. `eligible_product_id`, when provided, must reference an existing `products.id` row — enforced by
   the existing DB FK (`rewards.ts:10`); a nonexistent product id surfaces as a clear 4xx (FK
   violation caught and translated), not a raw 500.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Reward-retroactivity regression: update `required_stars`, assert all `star_transactions` rows unchanged | Fully-Automated | AC1 (HARD invariant — Known-Gap banned) |
| Create reward with valid fields, round-trip read matches write | Fully-Automated | AC2 |
| Update reward fields (name, reward_value, eligible_product_id), round-trip read matches write | Fully-Automated | AC2 |
| Zod schema rejects `reward_type` value outside app-level allow-list | Fully-Automated | AC3 |
| Non-admin (customer/staff) session receives 403 on all `/api/admin/rewards/*` routes (read + write) | Fully-Automated | AC4 |
| Deactivate reward — `is_active` flips false, row still present, excluded from default list query | Fully-Automated | AC5 |
| Create reward with `eligible_product_id` pointing at a nonexistent product — clean 4xx, not 500 | Fully-Automated | AC6 |
| Admin UI: reward list renders, create/edit form round-trips, deactivate shows confirmation dialog | Agent-Probe | AC2, AC3, AC5 (UI-layer judgment call — no automated RN/web component runner exists yet for `apps/admin`, confirm during RESEARCH whether Vitest + Testing Library is wired by P0 scaffold) |

## Test Infra Improvement Notes

(none identified yet)

---

## Phase Loop Progress

- [ ] Step 1 — RESEARCH
- [ ] Step 2 — INNOVATE
- [ ] Step 3 — PLAN-SUPPLEMENT
- [ ] Step 4 — PVL (validate-contract)
- [ ] Step 5 — EXECUTE
- [ ] Step 6 — EVL
- [ ] Step 7 — UPDATE PROCESS

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-05-rewards_PLAN_14-07-26.md`
2. **Last completed phase or step:** none — plan just written, Step 1 (RESEARCH) not yet started
3. **Validate-contract status:** pending (placeholder below — vc-validate-agent writes this section
   before EXECUTE)
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md`,
   `packages/api/src/db/schema/rewards.ts`, `packages/api/src/db/schema/star_transactions.ts`,
   `packages/api/src/db/schema/user_stars.ts`, `packages/api/src/db/schema/products.ts`,
   `packages/api/src/routes/orders.ts`, `packages/api/src/lib/require-staff.ts`,
   `packages/api/src/routes/lib/serializers.ts`
5. **Next step for a fresh agent picking up mid-execution:** run Phase Loop Progress Step 1
   (RESEARCH) — re-confirm P1/P2/P3 have landed the shared `requireAdmin`/`AdminApiError`/serializer
   conventions this plan assumes exist, then proceed to Step 3 (PLAN-SUPPLEMENT) to finalize the
   `## Implementation Checklist` checklist before PVL.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
