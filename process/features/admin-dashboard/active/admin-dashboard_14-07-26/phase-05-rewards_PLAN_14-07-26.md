---
name: plan:admin-phase-05-rewards
description: "Phase 5 (ADM-005, #43) — Rewards Configuration CRUD for the admin dashboard program. DRAFT fleshed out 17-07-26 against post-ADM-008 ground truth; open product decisions marked for user review."
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 5
---

# Phase 5 — Rewards Configuration CRUD (ADM-005, #43)

**Date:** 14-07-26 (stub) — **DRAFT fleshed out 17-07-26**
**Complexity:** COMPLEX (phase-program phase plan — carries a program HARD invariant)
**Status:** 📝 DRAFT — pending user review of `## Open Decisions For Review`

Date: 14-07-26 (draft updated 17-07-26)
Status: DRAFT — pending user review
Complexity: COMPLEX (phase-program phase plan)

**TL;DR:** Full admin CRUD for the existing `rewards` table (zero schema change needed —
verified column-by-column), following the ADM-008 offers/promotions route + UI patterns.
The correctness core is proving three non-retroactivity invariants with Fully-Automated
tests: (1) `required_stars` edits never rewrite `star_transactions` history, (2) they never
mutate already-issued reward coupons, (3) deactivation stops NEW unlocks without
invalidating issued unused coupons. STAR-002 threshold pickup is live-read by construction
— the test locks it against future caching.

---

## Open Decisions For Review

All four are recommended choices baked into this draft; flip any and the affected
checklist items are called out inline.

| # | Decision | Recommendation |
|---|---|---|
| D1 | Issue AC4 — single-active-default vs multiple-concurrent reward rules | **Multiple-concurrent, documented + tested as deterministic** (recommended — pending user review). Ground truth: the seed already ships 4 concurrent active tiers (4/5/6/8 stars) and the STAR-003 unlock path is an explicitly battle-pass cumulative model (`star-earning.ts` `unlockRewardsForLifetime` — one coupon per crossed active tier; `GET /rewards/summary` targets the MIN active tier). Enforcing single-active would be a behavior regression against live, tested code. This plan satisfies AC4 via the "explicitly documented as deterministic tested behavior" branch of the issue, with a dedicated multi-tier determinism test. |
| D2 | `reward_type` app-level allow-list values | **`['free_item', 'fixed_discount', 'percentage_discount']`** (recommended — pending user review). These are the only 3 values used by the seed (`SeedReward` union, `seed/data.ts:336`), the only 3 with label rendering (`rewardDiscountLabel`, `serializers.ts:732`), and `free_item` is the only one with redemption math (`computeRewardDiscountCents`). NOT including `free_upgrade` — avoids repeating the ADM-008 known-gap where a selectable mechanic silently redeems for ₱0. The DB column is a plain `varchar` (no pgEnum), so this Zod enum is the ONLY gate. |
| D3 | Deactivate convention | **`PATCH /api/admin/rewards/:id` with `isActive: false`** (recommended — pending user review). Matches the freshest precedent (ADM-008 `offers.ts` `updateOfferSchema` carries `isActive`), rather than Phase 2's older dedicated `PATCH .../deactivate` route. Soft-delete only either way — no hard `DELETE` ever. |
| D4 | Cross-field validation on create/update | **Enforce type-conditional required fields** (recommended — pending user review): `reward_type = 'free_item'` ⇒ `eligibleProductId` required + `rewardValueCents` must be null; discount types ⇒ `rewardValueCents` required (positive) + `eligibleProductId` must be null. Prevents mint-able-but-worthless rewards (a `free_item` reward without a product has no redemption math path — `computeRewardDiscountCents(eligibleProductId, cart)` needs the product id). Stricter than the DB (which allows all-null); if user prefers looser, drop the Zod `.superRefine` in checklist item 3. |

---

### Phase Completion Rules

This phase is CODE DONE when all Implementation Checklist items are complete and Fully-Automated
test gates in Verification Evidence are green. It is VERIFIED only after EVL confirms all gates
independently and the retroactivity regression tests (AC1/AC2 below) pass — Known-Gap is banned
for the retroactivity invariants per the umbrella charter.

---

## Overview

Add admin CRUD for `rewards` (`packages/api/src/db/schema/rewards.ts:4-14`) behind the
admin dashboard: `name`, `required_stars` (integer), `reward_type` (free-text `varchar` —
**not** a DB `pgEnum`), `reward_value` (`numeric(10,2)`, nullable, decimal pesos → cents at
the boundary), `eligible_product_id` (nullable FK → `products.id`), `is_active` (soft-delete).

### Schema verification (column-by-column vs issue #43) — NO migration needed

| Issue field | Schema column | Status |
|---|---|---|
| name | `name varchar NOT NULL` | ✅ exists |
| required_stars | `required_stars integer NOT NULL` | ✅ exists |
| reward_type | `reward_type varchar NOT NULL` (no enum — app-layer gate only, D2) | ✅ exists |
| reward_value | `reward_value numeric(10,2)` nullable | ✅ exists |
| eligible_product_id | `eligible_product_id uuid REFERENCES products(id)` nullable | ✅ exists |
| is_active | `is_active boolean DEFAULT true NOT NULL` | ✅ exists |

No column gaps. `created_at`/`updated_at` also exist. **Zero schema change; zero migration.**
(Non-gap noted: `rewards` has no unique constraint on `name` — the seed handles idempotency
app-side by find-by-name. Duplicate names are allowed; not an issue-#43 requirement.)

### How the retroactivity invariants hold (mechanism, then proof)

**Ground-truth correction vs the 14-07 stub:** the stub claimed "no table references
`rewards` at all." That is now stale — **`coupons.reward_id` exists** (STAR-003/004,
`coupons.ts:20`), so issued reward coupons ARE structurally reachable from a reward row.
The invariants therefore have two distinct surfaces:

1. **`star_transactions` (issue AC2 first half):** still carries NO reward reference
   (`star_transactions.ts:17-41` — columns: id, user_id, order_id, type, stars,
   description, created_at). No join path exists for a `rewards` UPDATE to touch history.
   The regression test exists to catch a FUTURE schema/route change that adds one.
2. **Issued coupons (issue AC2 second half + AC3):** a coupon row snapshots nothing from
   the reward except the FK — redemption reads the reward live at apply time
   (`routes/lib/coupon-apply.ts` / STAR-004), and unlock-time minting is the only writer.
   Editing `required_stars` or `reward_value` must leave existing `coupons` rows
   byte-for-byte unchanged (they will, since the admin PATCH only writes `rewards`), and
   deactivating a reward must (a) stop NEW unlocks — guaranteed by the
   `eq(rewards.is_active, true)` filter in `unlockRewardsForLifetime`
   (`star-earning.ts:110`) — while (b) leaving already-issued `available` coupons
   redeemable. **(b) requires a RESEARCH-step verification**: confirm the STAR-004
   coupon-apply path does NOT filter on `rewards.is_active` for reward-coupons (checklist
   item 1). If it does, that is a product-behavior conflict to surface, not silently
   change.

**Issue AC1 (STAR-002 pickup without deploy):** automatic by construction — both
`GET /rewards/summary` (`routes/rewards.ts:54-59`, live MIN-active query per request) and
the unlock path read `rewards` live; no constant, cache, or env var carries the threshold.
The test locks this: create/edit a reward via the admin API, immediately read
`/rewards/summary` and `/rewards/available` in the same process, assert the new values.

**Unlock-crossing semantics when lowering 5→3 (deterministic, documented per D1):** the
model is cumulative-lifetime. Lowering a threshold does NOT retroactively mint coupons for
users already past it; they unlock on their NEXT star credit (the unlock runs only inside
`creditStarForCompletedOrder`). Raising a threshold does not revoke previously unlocked
coupons. Both directions get determinism tests.

### Dependencies

Per the umbrella Phase Map: depends on P0 (scaffold) + P1 (auth/RBAC `requireAdmin`) — both
✅ delivered. Product picker UI additionally benefits from P3 (products CRUD, ✅ delivered) —
the `eligible_product_id` select can reuse the admin products list endpoint. No dependency
on ADM-008 code, but ADM-008's `offers.ts`/`promotions.ts` routes and
`apps/admin/src/features/offers/**` are the freshest patterns to mirror.

---

## Cross-Cutting Compliance

1. **Modularity** — one new route file `packages/api/src/routes/admin/rewards.ts`, appended
   to the aggregator (`routes/admin/index.ts` — 5th consumer of the append-only pattern;
   guard + CORS inherited from the `/api/admin` mount, never re-applied). One new feature
   folder `apps/admin/src/features/rewards/**` mirroring `features/offers/**`
   (lib/admin-rewards-api.ts, hooks/use-admin-rewards.ts, components/*). Reuses shared
   composites: `data-table`, `form-dialog`, `confirm-dialog`, `query-states`,
   `page-header`, `status-badge` (+ `entity-status.ts`) — no local re-implementations.
2. **Clarity** — Zod schemas mirroring `offers.ts` (`createOfferSchema` shape, `.partial()`
   + non-empty `.refine` for PATCH); `AdminApiError`/`handleAdminError` from
   `routes/admin/lib/errors.ts`; serializer added to the shared
   `routes/lib/serializers.ts` (`serializeAdminReward` — extends the existing public
   `ApiReward`/`serializeReward` there with `createdAt`/`updatedAt`; cents at the boundary
   via existing `numericToCents`/`centsToNumeric`, never re-implemented).
3. **Safety** — soft-delete only via `is_active` (D3); no hard `DELETE`. Editing
   `required_stars` gets an explicit UI confirmation dialog ("affects future unlock
   crossings only — past history and issued coupons are untouched"). The two
   retroactivity regression tests are the non-negotiable proof — Known-Gap BANNED.
4. **Security** — all routes inherit `requireAdmin` (admin + super_admin; rewards CRUD is
   not super_admin-only). All bodies validated server-side with Zod; the allow-list (D2)
   is the ONLY `reward_type` gate since the DB accepts any string.
5. **UI component modularity** — reward-specific UI limited to the `reward_type` select
   (sourced from the shared allow-list constant), the `required_stars` numeric input with
   its edit-confirmation, and the type-conditional field toggling (D4). Token-driven
   styling only; second-consumer rule governs any promotion to `components/`.

---

## Touchpoints

- `packages/api/src/routes/admin/rewards.ts` (new) — CRUD handlers (list/get/create/update
  incl. deactivate-via-PATCH per D3)
- `packages/api/src/routes/admin/index.ts` (edit, append-only) — `adminRouter.use('/rewards', rewardsRouter)`
- `packages/api/src/routes/lib/serializers.ts` (edit, additive) — `AdminReward` interface +
  `serializeAdminReward` (existing `ApiReward`/`serializeReward` untouched — the public
  STAR-002 wire shape stays frozen)
- `packages/types/src/rewards.ts` (edit, additive) — `REWARD_TYPES` runtime constant +
  `RewardType` union (shared by API Zod enum and admin UI select; mirrors the
  `STAFF_ROLES` precedent). Note: placed in `rewards.ts` next to the existing `Reward`
  type, NOT `admin.ts` — domain colocation.
- `apps/admin/src/features/rewards/**` (new) — `lib/admin-rewards-api.ts`,
  `hooks/use-admin-rewards.ts`, `components/{reward-list,reward-form}.tsx` (+ component
  tests), route files `(dashboard)/rewards.tsx` (thin `<Outlet/>` layout) +
  `(dashboard)/rewards.index.tsx` (list) per the P3 layout+index gotcha
- `apps/admin/src/config/nav-config.ts` (edit) — enable the Rewards nav item
- `packages/api/src/routes/admin/__tests__/admin-rewards.integration.test.ts` (new) — all
  Fully-Automated gates incl. both retroactivity regressions
- READ-ONLY (verified, no change): `packages/api/src/db/schema/rewards.ts`,
  `star_transactions.ts`, `coupons.ts`, `lib/star-earning.ts`, `routes/rewards.ts`,
  `routes/lib/coupon-apply.ts` (checklist item 1 verifies its `is_active` behavior)

## Public Contracts

- `GET /api/admin/rewards` → `{ rewards: AdminReward[] }` — ALL rewards incl. inactive
  (admin surface shows everything; `status-badge` renders active/inactive), ordered
  `required_stars` asc. (Matches ADM-008 offers list-all convention.)
- `GET /api/admin/rewards/:id` → `{ reward: AdminReward }` (404 on missing/malformed id)
- `POST /api/admin/rewards` → body `{ name, requiredStars: int > 0, rewardType:
  z.enum(REWARD_TYPES), rewardValueCents?: int > 0 | null, eligibleProductId?: uuid |
  null, isActive?: boolean }` + D4 cross-field rules → 201 `{ reward: AdminReward }`.
  `eligibleProductId` existence pre-checked (404 `Product not found`, mirroring
  `assertPromotionExists`) so an FK violation never surfaces as a raw 500.
- `PATCH /api/admin/rewards/:id` → `createSchema.partial()` + non-empty refine + D4 rules
  re-evaluated against the merged row → `{ reward: AdminReward }`. `isActive: false` IS the
  deactivate path (D3).
- **Wire-frozen (unchanged by this phase):** public `GET /rewards/summary`,
  `GET /rewards/available`, `GET /rewards/history`, `POST /rewards/:id/redeem`,
  `POST /coupons/apply`, and the `coupons` redemption/burn path. This phase only ADDS an
  admin surface over the same table.
- `AdminReward` wire shape: `ApiReward` fields (`id, name, requiredStars, rewardType,
  rewardValue (cents|null), eligibleProductId, isActive`) + `createdAt`/`updatedAt` ISO
  strings.

## Blast Radius

- **Packages:** `packages/api` (1 new route file, 1 aggregator append, 1 additive
  serializer edit, 1 new test file), `packages/types` (1 additive edit),
  `apps/admin` (1 new feature folder ~6 files + 2 route files + nav-config edit)
- **File count:** ~12-14 new/modified
- **Risk class:** MEDIUM-HIGH — no migration, soft-delete only, but this phase owns one of
  the program's named HARD invariants (reward retroactivity) AND sits upstream of live
  money-adjacent paths (reward coupons redeem into real order discounts via
  `computeRewardDiscountCents`). The public rewards/coupons wire shapes are frozen; any
  test failure in `rewards.integration.test.ts` / `star-earning.integration.test.ts` /
  `admin-offers.integration.test.ts` after this phase is a regression, not acceptable drift.

---

## Implementation Checklist

DRAFT-level checklist; finalized at inner-loop PLAN-SUPPLEMENT after Step 1 RESEARCH.

1. **RESEARCH verifications (read-only):** (a) confirm `routes/lib/coupon-apply.ts` does
   NOT reject an `available` reward-coupon whose parent reward has `is_active = false` —
   this decides whether issue AC3's "already-issued coupons stay valid" holds today or
   needs a product decision; (b) confirm `admin/lib/errors.ts` exports cover the FK/404
   translation needed; (c) confirm the admin products list endpoint shape for the product
   picker; (d) re-confirm no other live reader of `rewards` exists beyond
   `routes/rewards.ts`, `star-earning.ts`, coupon-apply, and serializer label paths.
2. Add `REWARD_TYPES` const + `RewardType` type to `packages/types/src/rewards.ts` (D2).
3. Write `packages/api/src/routes/admin/rewards.ts`: Zod schemas (create + partial update
   with non-empty refine + D4 `.superRefine` cross-field rules), `assertProductExists`
   helper, handlers GET-list / GET-:id / POST / PATCH; errors via
   `AdminApiError`/`handleAdminError`.
4. Add `AdminReward` + `serializeAdminReward` to `routes/lib/serializers.ts` (additive).
5. Append `adminRouter.use('/rewards', rewardsRouter)` in `routes/admin/index.ts`.
6. **TDD-first:** write `admin-rewards.integration.test.ts` retroactivity tests BEFORE/
   alongside handlers — (i) star-history snapshot test, (ii) issued-coupon snapshot test,
   (iii) deactivation unlock-stop + issued-coupon-survival test, (iv) STAR-002 live-pickup
   test, (v) 5→3 lowering + raising determinism tests, (vi) CRUD round-trips, allow-list
   rejection, 403s, FK 404, D4 cross-field 4xx. Reuse the hermetic self-seeding
   `makeUser(role)` fixture pattern (`require-admin.integration.test.ts` /
   `admin-offers.integration.test.ts`).
7. Build `apps/admin/src/features/rewards/**`: api lib (`credentials:'include'`),
   react-query hooks (list/detail/create/update mutations with invalidation), `reward-list`
   (data-table: name, required_stars, reward_type, value, status-badge), `reward-form`
   (form-dialog: type select from `REWARD_TYPES`, D4 conditional fields, product picker for
   free_item), `required_stars`-edit confirmation + deactivate confirmation
   (confirm-dialog). Route files: `rewards.tsx` (`<Outlet/>` layout) + `rewards.index.tsx`
   (P3 gotcha). Enable nav item in `nav-config.ts`.
8. Component tests for `reward-list` + `reward-form` (vitest + @testing-library/react,
   mirroring `offer-list.test.tsx`/`offer-form.test.tsx`).
9. Run gates: api typecheck, admin typecheck, `pnpm --filter @jojopotato/api test` (full
   suite — regression guard over rewards/star-earning/coupon suites),
   `pnpm --filter @jojopotato/admin test`, admin build.

---

## Acceptance Criteria

Issue-#43 ACs are the SPEC criteria; each names its proving gate (REQ-TEST-LINK).

1. **[Issue AC1]** A reward created/edited via the admin API is picked up by STAR-002's
   displayed threshold without deploy — `GET /rewards/summary` + `/rewards/available`
   reflect the change on the immediately-following request.
   — proven by: gate G4 (live-pickup test); strategy: Fully-Automated.
2. **[Issue AC2 — HARD invariant, Known-Gap BANNED]** `PATCH` changing `required_stars`
   5→3 leaves (a) every existing `star_transactions` row and (b) every previously-issued
   `coupons` row byte-for-byte unchanged (deep-equality snapshot before/after).
   — proven by: gates G1 + G2; strategy: Fully-Automated.
3. **[Issue AC3 — HARD invariant, Known-Gap BANNED]** Deactivating a reward
   (`isActive: false`) stops new unlock minting (a subsequent star credit crossing the
   threshold mints NO coupon for it) while an already-issued `available` coupon row is
   unchanged and still applies at `POST /coupons/apply` (pending checklist-1a
   verification of current apply behavior).
   — proven by: gate G3; strategy: Fully-Automated.
4. **[Issue AC4, per D1]** Multiple concurrent active rewards are deterministic, tested
   behavior: summary targets MIN-active tier; a credit crossing multiple tiers mints one
   coupon per tier; lowering a threshold unlocks existing users only on their next credit;
   raising one never revokes issued coupons.
   — proven by: gate G5; strategy: Fully-Automated.
5. CRUD round-trips persist correctly; invalid `reward_type` (outside D2 allow-list) and
   D4 cross-field violations are rejected 4xx before any write; nonexistent
   `eligibleProductId` → clean 404, never a raw 500.
   — proven by: gates G6 + G7; strategy: Fully-Automated.
6. Non-admin (customer/staff) sessions receive 403 on all `/api/admin/rewards/*` routes,
   read and write.
   — proven by: gate G8; strategy: Fully-Automated.
7. Admin UI: list renders with status badges, create/edit form round-trips with
   type-conditional fields, `required_stars` edit and deactivate each show a confirmation
   dialog.
   — proven by: gate G9 (component tests) + G10 (walkthrough); strategy: Hybrid
   (component-test portion Fully-Automated in-runner; full-flow visual judgment
   Agent-Probe — user-run walkthrough per repo convention).

---

## Verification Evidence

Preconditions for all api-suite gates: local Postgres up + migrated (native instance on
this dev box — see tests/all-tests.md gotcha). Command for G1-G8:
`pnpm --filter @jojopotato/api test`.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| G1: seed reward + user + star history; PATCH required_stars 5→3; deep-equal snapshot of all `star_transactions` rows | Fully-Automated | AC2(a) — HARD, Known-Gap banned |
| G2: seed reward + issued reward-coupon; PATCH required_stars + reward_value; deep-equal snapshot of all `coupons` rows | Fully-Automated | AC2(b) — HARD, Known-Gap banned |
| G3: deactivate reward; next crossing credit mints no coupon; pre-issued `available` coupon row unchanged + still applies | Fully-Automated | AC3 — HARD, Known-Gap banned |
| G4: create/edit reward via admin API → immediate `GET /rewards/summary` + `/available` reflect it | Fully-Automated | AC1 |
| G5: multi-tier determinism — MIN-active summary target; multi-cross mints one coupon per tier; lower→next-credit unlock; raise→no revocation | Fully-Automated | AC4 (D1) |
| G6: CRUD round-trips (create/read/update incl. isActive flip); no hard DELETE issued | Fully-Automated | AC5 |
| G7: allow-list rejection, D4 cross-field 4xx, nonexistent eligibleProductId → 404 | Fully-Automated | AC5 |
| G8: customer + staff sessions → 403 on every rewards admin route | Fully-Automated | AC6 |
| G9: `pnpm --filter @jojopotato/admin test` — reward-list + reward-form component tests (render, conditional fields, confirm dialogs) | Fully-Automated (jsdom) | AC7 |
| G10: admin browser walkthrough — list→create(free_item w/ product picker)→edit required_stars (confirm dialog)→deactivate→verify mobile Rewards screen reflects | Agent-Probe (user-run) | AC7 |
| G11: full api suite green (~368+ baseline) — regression guard over rewards/star-earning/coupon-apply/offers suites | Fully-Automated | Blast-radius wire-freeze |
| G12: `pnpm --filter @jojopotato/api typecheck` + `pnpm --filter @jojopotato/admin typecheck` + `pnpm --filter @jojopotato/admin build` | Fully-Automated | Structural integrity |

No Known-Gap rows for developed behavior. Residual: navigation-level E2E remains the
standing project-wide gap (backlog-tracked in `tests/all-tests.md`), not new to this phase.

## Test Infra Improvement Notes

(none identified yet)

---

## Phase Loop Progress

- [ ] Step 1 — RESEARCH (checklist item 1 verifications; esp. coupon-apply `is_active` behavior)
- [ ] Step 2 — INNOVATE
- [ ] Step 3 — PLAN-SUPPLEMENT
- [ ] Step 4 — PVL (validate-contract)
- [ ] Step 5 — EXECUTE
- [ ] Step 6 — EVL
- [ ] Step 7 — UPDATE PROCESS

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-05-rewards_PLAN_14-07-26.md`
2. **Last completed phase or step:** DRAFT fleshed out (17-07-26) from post-ADM-008 ground
   truth; user review of `## Open Decisions For Review` pending; Step 1 (RESEARCH) not
   formally run (draft included substantial read-only scouting — see item 4).
3. **Validate-contract status:** pending (placeholder below — vc-validate-agent writes it
   before EXECUTE)
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, umbrella plan, `packages/api/src/db/schema/{rewards,star_transactions,coupons}.ts`,
   `packages/api/src/lib/star-earning.ts`, `packages/api/src/routes/rewards.ts`,
   `packages/api/src/routes/admin/{index,offers}.ts`,
   `packages/api/src/routes/lib/serializers.ts` (reward/coupon section),
   `packages/api/src/db/seed/data.ts` (seedRewards), `packages/types/src/rewards.ts`,
   `apps/admin/src/features/offers/**` (structure).
5. **Next step for a fresh agent picking up mid-execution:** get user sign-off on D1-D4,
   then run Phase Loop Progress Step 1 (RESEARCH — checklist item 1, especially the
   coupon-apply `is_active` verification which gates AC3's exact wording), then Step 3
   (PLAN-SUPPLEMENT) to lock the checklist, then PVL.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
