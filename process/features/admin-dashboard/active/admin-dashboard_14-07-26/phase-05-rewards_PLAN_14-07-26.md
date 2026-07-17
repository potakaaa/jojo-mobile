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
**Status:** ✅ DECISIONS LOCKED (D1–D4 resolved with user 17-07-26) — ready for Step 1 RESEARCH

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

## Open Decisions For Review — ✅ RESOLVED (user, 17-07-26)

| # | Decision | Resolution |
|---|---|---|
| D1 | Issue AC4 — single-active-default vs multiple-concurrent reward rules | **✅ LOCKED: Multiple-concurrent (battle-pass), documented + tested as deterministic.** User-confirmed intended product model: users earn stars toward each set reward, claimable via coupon on crossing. Matches live code — the seed ships 4 concurrent active tiers (4/5/6/8 stars) and `unlockRewardsForLifetime` mints one coupon per crossed active tier; `GET /rewards/summary` targets the MIN active tier. Satisfied via a dedicated multi-tier determinism test (G5). |
| D2 | `reward_type` app-level allow-list values | **✅ LOCKED: `['free_item', 'fixed_discount', 'percentage_discount', 'free_upgrade']`** — user chose to INCLUDE `free_upgrade` (retention-standard mechanic). **SCOPE IMPACT (diverges from the draft recommendation):** `free_upgrade` has NO reward-side redemption math today (`computeRewardDiscountCents` handles `free_item` only), so including it in the allow-list REQUIRES adding reward-side `free_upgrade` math in this phase — otherwise it redeems for ₱0 (the ADM-008 trap). Reuse/adapt the offer-side `computeFreeUpgradeDiscountCents` (`packages/utils/src/discount.ts`, built in ADM-008 Fix 6 P2) rather than net-new. This adds one money-path (Known-Gap BANNED for it) — see new checklist item 3b + touchpoint. D4's cross-field rule extends to treat `free_upgrade` like `free_item` (needs `eligibleProductId`, value must be null). |
| D3 | Deactivate convention | **✅ LOCKED: `PATCH /api/admin/rewards/:id` with `isActive: false`** (matches ADM-008 `offers.ts` precedent). Soft-delete only — no hard `DELETE` ever. |
| D4 | Cross-field validation on create/update | **✅ LOCKED: Enforce type-conditional required fields.** `reward_type ∈ {'free_item','free_upgrade'}` ⇒ `eligibleProductId` required + `rewardValueCents` must be null; discount types ⇒ `rewardValueCents` required (positive) + `eligibleProductId` must be null. (Extended per D2 to cover `free_upgrade` in the product-required branch.) Prevents mint-able-but-worthless rewards. |

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
- `packages/utils/src/discount.ts` (edit, additive — **D2/free_upgrade money-path**) —
  extend `computeRewardDiscountCents` with a `free_upgrade` branch reusing/adapting
  `computeFreeUpgradeDiscountCents`; `packages/utils/src/__tests__/discount.test.ts` (edit)
  — exact-cents unit tests for the new branch
- `packages/api/src/routes/admin/__tests__/admin-rewards.integration.test.ts` (new) — all
  Fully-Automated gates incl. both retroactivity regressions + `free_upgrade` reward
  apply-path assertion (never ₱0)
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

1. **RESEARCH verifications (read-only):** (a) **✅ VERIFIED** —
   `packages/api/src/routes/lib/coupon-apply.ts`'s reward-coupon branch of
   `resolveCouponDiscount` (~lines 151-189) joins `rewards` with a plain `leftJoin` and
   never filters `rewards.is_active`; `checkRewardEligibility` only receives
   `{ eligibleProductId }`. Confirmed: an `available` reward coupon whose parent reward was
   later deactivated STILL redeems today — no product-behavior conflict, no change needed.
   AC3 is worded definitively below (not conditionally) — this phase LOCKS the behavior
   with a regression test (G3), it does not build it; (b) confirm `admin/lib/errors.ts`
   exports cover the FK/404 translation needed — use the pre-check-then-404 convention
   (`assertProductExists`, mirroring `assertPromotionExists` in `offers.ts:113`); confirmed
   there is NO `isForeignKeyViolation` helper in `admin/lib/errors.ts` and none should be
   added; (c) **✅ VERIFIED** — admin products list endpoint shape confirmed for the product
   picker; (d) **✅ VERIFIED** — re-confirmed no other live reader of `rewards` exists beyond
   `routes/rewards.ts`, `star-earning.ts`, coupon-apply, and serializer label paths;
   (e) **[D2/free_upgrade]** read the offer-side `computeFreeUpgradeDiscountCents`
   (`packages/utils/src/discount.ts`) + the reward-coupon apply path — **RESEARCH-confirmed
   dispatch location**: `resolveCouponDiscount`'s reward-coupon branch (~lines 156-189)
   currently SELECTs only `rewards.name` + `rewards.eligible_product_id`; it must ALSO
   select `rewards.reward_type` and add a `reward_type`-based dispatch there (`free_item` →
   `computeRewardDiscountCents` unchanged; `free_upgrade` → `computeFreeUpgradeDiscountCents`,
   which is signature-identical `(productId, cart) => cents` and drops in with no adapter).
   `computeRewardDiscountCents` itself stays a pure single-purpose helper with NO
   reward_type dispatch — do not give it one. See rewritten checklist item 3b.
2. Add `REWARD_TYPES` const + `RewardType` type to `packages/types/src/rewards.ts` (D2).
3. Write `packages/api/src/routes/admin/rewards.ts`: Zod schemas (create + partial update
   with non-empty refine + D4 `.superRefine` cross-field rules), `assertProductExists`
   helper, handlers GET-list / GET-:id / POST / PATCH; errors via
   `AdminApiError`/`handleAdminError`.
3b. **[D2/free_upgrade money-path — Known-Gap BANNED]** RESEARCH-verified precise
   change (do NOT add a `reward_type` dispatch inside `computeRewardDiscountCents` — it
   must stay a pure `(productId, cart) => cents` helper):
   - In `packages/api/src/routes/lib/coupon-apply.ts`'s `resolveCouponDiscount`, add
     `reward_type` to the reward-coupon SELECT (currently selects only `rewards.name` +
     `rewards.eligible_product_id`, ~lines 156-160), keeping `eligible_product_id`.
   - Add a `reward_type`-based dispatch in the reward-coupon branch (~lines 165-189):
     `free_item` keeps calling `computeRewardDiscountCents`; `free_upgrade` calls the
     offer-side `computeFreeUpgradeDiscountCents(eligibleProductId, cart)` directly — no
     adapter needed (identical signature).
   - **Zero-guard reject (user-confirmed decision, money-path, Known-Gap BANNED):** when
     the computed `free_upgrade` waive amount is `<= 0` (nothing in the cart to upgrade),
     REJECT with a 400 and do NOT burn the coupon — mirror the offer-side pattern
     (~lines 296-304, e.g. a `no_eligible_product`-style reject). The reward path has NO
     such guard today (latent ₱0-burn bug); this closes it for the new `free_upgrade` case.
   - Add `free_upgrade` to the `rewardDiscountLabel` render path (`serializers.ts` ~line
     727) — confirmed it currently falls through to `default` (harmless but incomplete).
   - Add exact-cents unit tests to `packages/utils/src/__tests__/discount.test.ts` for the
     new dispatch path, plus an apply-path integration assertion (gate G13, new) that a
     `free_upgrade` reward coupon (a) waives the correct size-upgrade delta when there IS
     an eligible upgrade in cart, and (b) is REJECTED (400, coupon unburned) when there is
     nothing to upgrade. Both Fully-Automated, Known-Gap BANNED.
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
| G13: `free_upgrade` reward-coupon apply-path — (a) waives correct size-upgrade delta in `coupon-apply.ts` when an eligible upgrade exists in cart; (b) REJECTED 400 (coupon unburned) when nothing to upgrade | Fully-Automated | D2/free_upgrade money-path — HARD, Known-Gap banned |

No Known-Gap rows for developed behavior. Residual: navigation-level E2E remains the
standing project-wide gap (backlog-tracked in `tests/all-tests.md`), not new to this phase.

## Test Infra Improvement Notes

(none identified yet)

---

## Phase Loop Progress

- [x] Step 1 — RESEARCH (checklist item 1 verifications complete; coupon-apply `is_active` behavior confirmed non-filtering — AC3 holds definitively today)
- [x] Step 2 — INNOVATE (resolved by RESEARCH — free_upgrade dispatch location settled: coupon-apply.ts reward-coupon branch, not computeRewardDiscountCents; no separate INNOVATE artifact needed)
- [x] Step 3 — PLAN-SUPPLEMENT (this pass — checklist items 1a/3b rewritten with exact dispatch location + zero-guard reject; new gate G13 added)
- [x] Step 4 — PVL (validate-contract) — Gate: PASS, 17-07-26
- [x] Step 5 — EXECUTE (17-07-26) — all checklist items complete; gates green (API 448/448 incl. admin-rewards 19 + coupons 28 with G13a/G13b; admin 58/58 incl. reward-list 5 + reward-form 4; api+admin typecheck clean; admin build clean; format:check clean). Baseline pre-phase API count was 427 (E5); +21 = new admin-rewards suite + 2 G13 reward-side free_upgrade tests. HARD gates G1/G2/G3/G13 all proven by real passing Fully-Automated tests — no Known-Gap used for developed behavior.
- [x] Step 6 — EVL (17-07-26) — orchestrator-owned confirmation run independently re-ran the
  full gate set: API 448/448 (incl. 19 new `admin-rewards.integration.test.ts` + 2 new G13
  `coupons.integration.test.ts` free_upgrade cases), admin 58/58, api+admin typecheck clean,
  admin build clean, `pnpm format:check` clean. HARD gates G1/G2/G3/G13 all confirmed proven by
  real passing Fully-Automated tests — no Known-Gap used for developed money behavior. G10
  (Agent-Probe admin UI walkthrough) remains owed — user-run, standing project-wide gap (no
  `apps/admin` browser/E2E runner), not new debt.
- [ ] Step 7 — UPDATE PROCESS (this pass — doc-only reconciliation; plan stays in `active/`
  pending G10 user walkthrough + branch merge, per program's standing "held OPEN" convention)

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-05-rewards_PLAN_14-07-26.md`
2. **Last completed phase or step:** DRAFT fleshed out (17-07-26) from post-ADM-008 ground
   truth; user review of `## Open Decisions For Review` pending; Step 1 (RESEARCH) not
   formally run (draft included substantial read-only scouting — see item 4).
3. **Validate-contract status:** ✅ WRITTEN — Gate: PASS, 17-07-26 (see `## Validate Contract`
   below). Ready for `ENTER EXECUTE MODE`.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, umbrella plan, `packages/api/src/db/schema/{rewards,star_transactions,coupons}.ts`,
   `packages/api/src/lib/star-earning.ts`, `packages/api/src/routes/rewards.ts`,
   `packages/api/src/routes/admin/{index,offers}.ts`,
   `packages/api/src/routes/lib/serializers.ts` (reward/coupon section),
   `packages/api/src/db/seed/data.ts` (seedRewards), `packages/types/src/rewards.ts`,
   `apps/admin/src/features/offers/**` (structure). VALIDATE additionally read
   `packages/api/src/routes/lib/coupon-apply.ts` (full file), `packages/utils/src/discount.ts`
   (full file) + its test suite, `packages/api/src/routes/admin/lib/errors.ts`,
   `packages/api/src/routes/admin/index.ts`, `apps/admin/src/config/nav-config.ts`, and the
   umbrella's `## Phase Ordering` table (dependency check: P0/P1 both ✅ VERIFIED, no
   Dependency-BLOCKED).
5. **Next step for a fresh agent picking up mid-execution:** CODE-COMPLETE + EVL-green
   (17-07-26, commit `7a198b9` on branch `feat/adm-005-rewards`, not yet merged). UPDATE
   PROCESS doc reconciliation done this pass. Remaining before this phase is stamped
   ✅ VERIFIED at the umbrella level: (a) user-run G10 Agent-Probe admin UI walkthrough
   (list→create free_item w/ product picker→edit required_stars w/ confirm dialog→
   deactivate→verify mobile Rewards screen reflects); (b) branch merge into `development`.
   Plan intentionally stays in `active/` (not archived) until both land, matching this
   program's standing "held OPEN" convention (see ADM-008/Fix-6 precedent). See
   `phase-05-rewards_REPORT_17-07-26.md` for the full EXECUTE/EVL evidence and the umbrella's
   `## Current Execution State` for the current program-wide pointer.

---

## Validate Contract

Status: PASS
Date: 17-07-26
date: 2026-07-17
generated-by: inner-pvl: phase-5

Parallel strategy: sequential (single-agent synthesis)
Rationale: 7-signal score for this fan-out is 5/7 — S1 present (packages/api, packages/types,
apps/admin, packages/utils — 4 workspace packages); S2 present (new admin API surface +
a live money-computation change in the shared coupon-apply resolver); S3 NOT present (no
separate INNOVATE artifact — RESEARCH resolved the one open design question, the
free_upgrade dispatch location, directly); S4 present (Phase 5 of the 8-phase
admin-dashboard program); S5 NOT present (no explicit user depth request beyond the D1-D4
decision review); S6 present (money-adjacent high-risk class — reward-coupon redemption
discount computation feeding real order totals, plus a HARD non-retroactivity invariant
named in the umbrella charter); S7 present (~12-14 files in blast radius). 5/7 → HIGH
signal, which per the threshold table would normally recommend workflow/agent-team for the
VALIDATE fan-out itself. No Agent/Task spawning tool was available in this validate-agent's
invocation, so all 4 Layer 1 dimensions and 5 Layer 2 sections below were performed
directly, sequentially, by this single agent instance, each backed by a direct source-file
read (not inference) — mirrors the same documented process deviation as the Phase 4/4a and
Phase 4 Enhancement E1 contracts in this same task folder.
EXECUTE strategy recommendation (separate from this VALIDATE fan-out): **sequential, single
vc-execute-agent (opus)**. The checklist has a tight linear dependency chain — `REWARD_TYPES`
(types) must land before the Zod schema (route) can reference it; the route's wire shape
must exist before the admin UI hooks/components can be built against it; the money-path
dispatch in `coupon-apply.ts` is a single shared function edited once; the TDD-first
retroactivity tests (item 6) are most safely written by the same agent that writes the
handlers they gate. No independent parallelizable workstream exists — parallel subagents or
a workflow pipeline would add coordination overhead without reducing wall-clock risk, and
would risk two agents touching `coupon-apply.ts`/`serializers.ts` (both edited by more than
one checklist item) concurrently.

### Dependency check (V1)

Umbrella `## Phase Ordering`: Phase 5 (P5) depends on P0, P1 only — both ✅ VERIFIED. No
`Dependency-BLOCKED` condition. (No `phase-blast-radius-registry.md` exists for this
program; dependency status read directly from the umbrella's Phase Ordering table instead.)
Note (non-blocking): the umbrella's `## Current Execution State` block is stale (last
updated 16-07-26, describes Phase 4a as "NOT YET MERGED") — `process/context/all-context.md`
confirms Phase 4a merged via PR #92 and ADM-008 also shipped since. This staleness does not
affect Phase 5's dependencies (P0/P1 only) and is flagged here for the eventual UPDATE
PROCESS pass to reconcile, not a VALIDATE blocker.

### Structural check (V1 Step 3b)

`node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs
process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-05-rewards_PLAN_14-07-26.md`
→ 0 failures, 2 advisory warnings (legacy phase-program plan shape — no dedicated
execute-anchor/supporting-phase-file notes; consistent with every other phase plan in this
task folder, not phase-5-specific). No FAIL.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| G1 (AC2a, HARD) | `required_stars` PATCH 5→3 leaves every `star_transactions` row byte-for-byte unchanged (deep-equal snapshot) | Fully-Automated | `admin-rewards.integration.test.ts` — star-history snapshot test | B |
| G2 (AC2b, HARD) | `required_stars`/`reward_value` PATCH leaves every previously-issued `coupons` row byte-for-byte unchanged (deep-equal snapshot) | Fully-Automated | `admin-rewards.integration.test.ts` — issued-coupon snapshot test | B |
| G3 (AC3, HARD) | deactivate stops NEW unlock minting on next crossing credit; pre-issued `available` coupon row unchanged + still redeems at `POST /coupons/apply` | Fully-Automated | `admin-rewards.integration.test.ts` — deactivation unlock-stop + issued-coupon-survival test | B |
| G4 (AC1) | reward create/edit via admin API is live-read (no cache) by `GET /rewards/summary` + `/available` on the immediately-following request | Fully-Automated | `admin-rewards.integration.test.ts` — STAR-002 live-pickup test | B |
| G5 (AC4, D1) | multi-tier determinism: MIN-active summary target; multi-cross mints one coupon per tier; lower→next-credit-only unlock; raise→no revocation | Fully-Automated | `admin-rewards.integration.test.ts` — multi-tier determinism test (reuses `seedRewards`' 4/5/6/8-star shape) | B |
| G6 (AC5) | CRUD round-trips (create/read/update incl. `isActive` flip); no hard `DELETE` issued anywhere | Fully-Automated | `admin-rewards.integration.test.ts` — CRUD round-trip tests | B |
| G7 (AC5) | D2 allow-list rejection; D4 cross-field 4xx (merged-state on PATCH); nonexistent `eligibleProductId` → clean 404, never 500 | Fully-Automated | `admin-rewards.integration.test.ts` — validation-rejection tests | B |
| G8 (AC6) | customer + staff sessions → 403 on every `/api/admin/rewards/*` route, read and write | Fully-Automated | `admin-rewards.integration.test.ts` — `requireAdmin` guard tests | B |
| G9 (AC7 partial) | `reward-list`/`reward-form` render, D4 conditional-field toggling, confirm-dialog triggers | Fully-Automated (jsdom) | `apps/admin` vitest — `reward-list.test.tsx` + `reward-form.test.tsx` | B |
| G10 (AC7 partial) | full-flow visual/UX judgment: list→create(free_item, product picker)→edit required_stars (confirm dialog)→deactivate→mobile Rewards screen reflects | Agent-Probe | manual walkthrough (no `apps/admin` browser/E2E runner — project-wide gap, same standing precedent as P1 AC8 / P2 AC7 / P3 AC8 / 4a AC12 / E1 AC-E6) | D |
| G11 (regression) | rewards/star-earning/coupon-apply/offers suites + full api suite unaffected by this phase's edits | Fully-Automated | `pnpm --filter @jojopotato/api test` (baseline ~368+ pre-phase, confirm no drop) | A |
| G12 (structural) | no cross-package type breakage; admin build clean | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` && `pnpm --filter @jojopotato/admin typecheck` && `pnpm --filter @jojopotato/admin build` | A |
| G13 (D2/3b, HARD) | `free_upgrade` reward-coupon apply-path: (a) waives the EXACT size-upgrade delta at `POST /coupons/apply` when an eligible upgrade is in cart; (b) REJECTED 400, coupon left `available` (unburned), when nothing to upgrade | Fully-Automated | new exact-cents integration test — see Execute-Agent Instruction E2 for placement | B |

gap-resolution legend: A — proven now, re-run of an already-existing gate; B — fixed in this
plan (new test added by this plan's own checklist items 2/3/3b/6/8, TDD stub provided
below); C — deferred to a named later phase/plan (not used here); D — backlog
test-building stub (named residual, keep-active, continue — G10 only, standing project-wide
Agent-Probe precedent, not new debt introduced by this phase).

Legacy line form (retained for existing consumers):
- Rewards retroactivity (packages/api): Fully-automated: `pnpm --filter @jojopotato/api test admin-rewards` (G1-G8, G13) | precondition: local Postgres migrated (native instance, see all-tests.md)
- Rewards admin UI (apps/admin): Fully-automated: `pnpm --filter @jojopotato/admin test` (G9) | agent-probe: manual walkthrough (G10)
- Structural (repo-wide): Fully-automated: `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin build` (G12)
- Full regression (repo-wide): Fully-automated: `pnpm --filter @jojopotato/api test` (G11)

C-4 reconciliation: every `strategy:` value above is one of the 3 proving strategies
(Fully-Automated / Agent-Probe); Known-Gap is used nowhere as a strategy — G10's Agent-Probe
residual is carried via gap-resolution D (named, standing, project-wide), never presented as
a strategy that proves a behavior. No developed money behavior (G1/G2/G3/G13, all HARD) rests
on Known-Gap — net-gate vacuous-green ban satisfied (see Net gate derivation below).

### Failing stubs (Fully-Automated, new-test rows only — G1-G9, G13; G11/G12 are existing-suite re-runs, not new TDD items)

```text
test("G1 — PATCH required_stars 5→3 should leave every existing star_transactions row byte-for-byte unchanged", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G1")
})
test("G2 — PATCH required_stars/reward_value should leave every previously-issued coupons row byte-for-byte unchanged", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G2")
})
test("G3 — deactivating a reward should mint no new coupon on the next crossing credit while a pre-issued available coupon stays unchanged and still redeems", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G3")
})
test("G4 — a reward created/edited via the admin API should be reflected by GET /rewards/summary and /available on the immediately-following request", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G4")
})
test("G5 — multiple concurrent active rewards should be deterministic: MIN-active summary target, one coupon per crossed tier, lower→next-credit-only unlock, raise→no revocation", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G5")
})
test("G6 — reward CRUD should round-trip correctly (create/read/update incl. isActive flip) and never issue a hard DELETE", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G6")
})
test("G7 — an out-of-allow-list reward_type or a D4 cross-field violation should be rejected 4xx before any write, and a nonexistent eligibleProductId should 404 (never 500)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G7")
})
test("G8 — customer and staff sessions should receive 403 on every /api/admin/rewards/* route, read and write", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G8")
})
test("G9 — reward-list and reward-form should render, toggle D4-conditional fields, and trigger confirm dialogs on required_stars edit and deactivate", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G9")
})
test("G13a — a free_upgrade reward coupon should waive the exact size-upgrade delta at POST /coupons/apply when an eligible upgrade exists in cart", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G13a")
})
test("G13b — a free_upgrade reward coupon should be rejected 400 (coupon left available, unburned) at POST /coupons/apply when nothing in cart has a paid size upgrade to waive", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: G13b")
})
```

Dimension findings:
- Infra fit: PASS — no container/infra/worker/port surface touched; zero migration (schema
  already covers every field, verified column-by-column against `rewards.ts` directly); the
  route file append (`adminRouter.use('/rewards', rewardsRouter)`) is the 5th confirmed
  consumer of the same append-only aggregator pattern used by branches/products-categories/
  deals/promotions-offers-coupons — mechanically identical, directly read in `admin/index.ts`.
- Test coverage: PASS — every AC (1-7) has a named proving gate (G1-G13) with a matching TDD
  stub for every new Fully-Automated row; `packages/utils` free_upgrade math is REUSED
  (`computeFreeUpgradeDiscountCents`), not new, and is ALREADY covered by 35/35 passing exact-
  cents unit tests in `discount.test.ts` (directly read and confirmed — no new
  `packages/utils` test is required by this phase, only the reward-side dispatch wiring in
  `coupon-apply.ts` needs its own integration proof, which is G13). Net-gate vacuous-green
  check: G1/G2/G3/G13 (the four HARD/Known-Gap-banned behaviors) are ALL proven by
  Fully-Automated gates with concrete TDD stubs — none rests on Known-Gap or on G10's
  Agent-Probe residual alone.
- Breaking changes: PASS — public wire-frozen surfaces (`GET /rewards/summary|available|
  history`, `POST /rewards/:id/redeem`, `POST /coupons/apply`) are read-verified as
  UNCHANGED by this plan: `serializeReward`/`ApiReward` (public) are left untouched; only a
  NEW, additive `AdminReward`/`serializeAdminReward` is introduced, matching the
  `AdminBranch`/`AdminProduct`/`AdminOffer` local-declaration convention (confirmed against
  `serializers.ts:658-679` directly). The one live-code EDIT to an existing shared function —
  `resolveCouponDiscount`'s reward-coupon branch in `coupon-apply.ts` — is a single shared
  resolver consumed identically by BOTH `POST /coupons/apply` (preview) and order-placement
  recompute, so preview/placement can never drift (by construction, confirmed by direct
  read of the file's own doc-comment and dispatch structure). No downstream consumer outside
  this phase's own blast radius touches the edited SELECT/dispatch block.
- Security surface: PASS — `requireAdmin` inheritance is automatic (no new mount, guard/CORS
  applied once at `/api/admin`, confirmed via `admin/index.ts`); every body is Zod-validated
  server-side before any write (D4 `.superRefine`/merged-state PATCH check, directly mirrors
  the already-shipped, already-tested `offers.ts` `mechanicBenefitError` pattern); the
  `reward_type` allow-list (D2) is the only gate on an otherwise-unconstrained `varchar`
  column, consistent with the pre-existing `deal_type`/`offer_type` app-level-gating
  precedent (not a new risk pattern). STRIDE quick-scan: no new secret/CORS/trust-boundary
  surface; no new elevation-of-privilege path (rewards CRUD is admin+super_admin, same tier
  as offers/products/branches, not narrower or broader than the established convention); no
  new information-disclosure surface (admin-only reward data, same shape class as existing
  admin list/detail responses).
- Section A feasibility (money-path dispatch, checklist 1a/3b, gate G13): PASS — mechanical
  feasibility confirmed by direct read of `coupon-apply.ts` lines 151-189:
  `computeFreeUpgradeDiscountCents` is ALREADY imported at the top of the file (line 7) and
  is signature-identical to `computeRewardDiscountCents` (both `(productId: string, cart:
  Cart) => number`), so the dispatch requires no adapter — a straight `reward_type === 
  'free_upgrade' ? computeFreeUpgradeDiscountCents(...) : computeRewardDiscountCents(...)`
  branch. The offer-side coupon-apply branch (lines 279-310, same file) already implements
  the EXACT pattern this checklist item asks for on the reward side — compute → clamp
  `Math.max(0, Math.min(raw, subtotalCents(cart)))` → `<= 0` reject with `no_eligible_product`
  — giving EXECUTE a directly-copyable in-file template, not a from-scratch design. Gaps
  found: the plan's checklist item 3b does not explicitly say the `reward` destructure at
  line ~167-168 (`{ eligibleProductId: couponRow.rewardEligibleProductId }`) must also carry
  `rewardType` through to the dispatch site — resolved via Execute-Agent Instruction E1
  (below), not a plan-text defect requiring a return to PLAN. Conflicts found: none — the
  RESEARCH claim in checklist item 1a (coupon-apply never filters on `rewards.is_active`)
  was independently re-verified in this VALIDATE pass by a full re-read of the same lines;
  confirmed accurate. Highest-risk edit: this dispatch change, because it sits on a live
  money path shared by preview AND placement. Mitigation: TDD-first per plan checklist item
  6, with G13's stub written before the dispatch code (see Execute-Agent Instruction E2 for
  exact test-file placement) — this exact TDD-first + exact-cents-assertion discipline is
  the proven pattern from the offer-side equivalent (`orders.test.ts:1408` "redeems a
  free_upgrade offer coupon at the exact size-upgrade delta, burns" — directly read and
  confirmed as the template to mirror).
- Section B feasibility (admin Rewards CRUD route + D4 cross-field validation): PASS —
  mechanical feasibility confirmed: `offers.ts`'s `createOfferSchema`/`updateOfferSchema`/
  `mechanicBenefitError`/merged-state-PATCH-revalidation structure (directly read in full)
  is a byte-for-byte transferable template for D4's `reward_type`-conditional required
  fields. Gaps found (non-blocking, resolved via Execute-Agent Instruction E3): the plan's
  `assertProductExists` helper (checklist item 3) does not explicitly require the target
  product to be ACTIVE or non-deal, whereas the offer-side precedent's
  `assertBenefitProductExists` (directly read, `offers.ts:130-144`) explicitly rejects an
  inactive or `is_deal=true` product for the identical reason (an inactive/deal product can
  never be added to a cart, so a reward pointed at one could never actually be redeemed).
  This is a UX/product-quality gap, not a money-correctness defect (no wrong discount amount
  results — the reward would simply be permanently unredeemable), so it does not block PASS;
  folded into Execute-Agent Instruction E3. Conflicts found: none. Highest-risk edit: the
  merged-state PATCH cross-validation (touching only fields that were actually sent, per the
  `offers.ts` `touchesMechanicFields` precedent) — mitigated by directly reusing that
  precedent's structure rather than a novel design.
- Section C feasibility (types/serializers additions — `REWARD_TYPES`, `AdminReward`,
  `serializeAdminReward`, `rewardDiscountLabel` free_upgrade case): PASS — mechanical
  feasibility confirmed: `serializers.ts:727-741`'s `rewardDiscountLabel` directly read and
  confirmed to fall through to its `default` branch for `free_upgrade` today (matches the
  plan's claim exactly); adding a `case 'free_upgrade':` arm is a 2-line additive change with
  no risk to the `fixed_discount`/`percentage_discount`/`free_item` branches. `ApiReward`/
  `serializeReward` (public) confirmed untouched by this plan — only a new local
  `AdminReward extends ApiReward`-shaped interface is added, matching the established
  `AdminBranch`/`AdminOffer` convention. Gaps found: none. Conflicts found: none. Highest-
  risk edit: none — purely additive.
- Section D feasibility (apps/admin rewards UI — list/form/hooks/routes/nav): PASS —
  mechanical feasibility confirmed: `apps/admin/src/features/offers/**`'s file structure
  (lib/hooks/components/2-file route split) directly enumerated and confirmed as a 1:1
  transferable template. Gaps found (non-blocking, resolved via Execute-Agent Instruction
  E4): `apps/admin/src/config/nav-config.ts` was read in full and contains **NO existing
  "rewards" entry at all** (not even a `disabled: true` placeholder) — the plan's checklist
  item 7 wording ("Enable nav item in nav-config.ts") incorrectly implies one exists to be
  un-disabled. This is a plan-text inaccuracy, not a design flaw; the fix is mechanical (add
  a new, non-disabled `NavItem`, mirroring the `offers`/`deals` entries which ARE
  non-disabled) and does not require returning to PLAN — captured as Execute-Agent
  Instruction E4. Conflicts found: none. Highest-risk edit: none beyond the already-covered
  route-wire-shape dependency on Section B.
- Section E feasibility (retroactivity + CRUD test suite, G1-G8/G13, TDD-first): PASS —
  mechanical feasibility confirmed: the hermetic self-seeding `makeUser(role)` fixture
  pattern is directly confirmed present and reusable in `admin-offers.integration.test.ts`
  (grep-verified); the mechanism each HARD-invariant test needs to assert against
  (`unlockRewardsForLifetime`'s `eq(rewards.is_active, true)` filter at
  `star-earning.ts:110`, and `coupon-apply.ts`'s non-filtering reward-coupon branch) was
  independently re-read and confirmed in this VALIDATE pass, not merely trusted from the
  plan's own RESEARCH claim. `seedRewards` in `db/seed/data.ts` was directly read and
  confirmed to already ship 4 concurrent active tiers at 4/5/6/8 required_stars — directly
  usable (or a close ad-hoc variant) for G5's multi-tier determinism test, matching D1's
  own citation. Gaps found: none. Conflicts found: none. Highest-risk edit: G5 (multi-tier
  determinism) is the most complex single test to author — mitigated by the existing seed
  shape being directly reusable rather than requiring novel fixture design.

Net gate: 0 FAILs / 0 unresolved CONCERNs (3 findings, all resolved via Execute-Agent
Instructions E1/E3/E4 below — none require a plan-text change or a return to PLAN) / 4
Layer 1 PASS / 5 Layer 2 sections PASS → **PASS**.

Known-gap exclusion note: this phase carries no `## Known Gaps (Resolved via Backlog)`
section and introduces none of its own. G10 (Agent-Probe UI walkthrough) is NOT a Known-Gap-
tier row for net-gate purposes — it is a legitimate proving strategy under the C-4
3-strategy reconciliation, identical standing precedent to every prior admin-dashboard phase
in this program (P1 AC8, P2 AC7, P3 AC8, 4a AC12, Phase-4 E1 AC-E6). The net-gate
vacuous-green ban does not apply: every developed HARD behavior (G1/G2/G3/G13) has a
Fully-Automated gate with a concrete failing-stub target — none rests on Known-Gap or on
G10's Agent-Probe residual alone.

### Execute-agent instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | When implementing checklist item 3b's dispatch in `coupon-apply.ts`, thread `rewards.reward_type` through the existing `reward` destructure (`{ eligibleProductId, rewardType }`) so the dispatch site can branch on it — the plan names the SELECT/dispatch change but does not spell out this local variable threading. | Writing `resolveCouponDiscount`'s reward-coupon branch (checklist item 3b, gate G13) |
| E2 | Place G13's new exact-cents test(s) directly adjacent to the ALREADY-EXISTING offer-side `free_upgrade` coupon-apply tests in `packages/api/src/routes/__tests__/coupons.integration.test.ts` (see e.g. its `redeems a free_upgrade offer coupon at the exact size-upgrade delta` and `rejects a free_upgrade coupon when the benefit has no paid size upgrade` cases, and the mirrored cases in `orders.test.ts`), OR add them to the new `admin-rewards.integration.test.ts` if the reward-coupon fixtures are more naturally seeded there — either file is acceptable; do not duplicate the same assertions in both. Name the test cases exactly per the failing-stub skeletons above (G13a/G13b) regardless of file choice. | Writing gate G13 (checklist item 3b, 4th sub-bullet) |
| E3 | Extend the plan's `assertProductExists` helper (checklist item 3) to also reject an inactive or `is_deal=true` `eligibleProductId`, mirroring `offers.ts`'s `assertBenefitProductExists` (lines 130-144) — an inactive/deal product can never be added to a cart, so a reward pointed at one would be permanently unredeemable. This is a quality improvement, not a HARD-invariant requirement; if time-constrained, document the omission explicitly in the phase report rather than silently skipping it. | Writing `assertProductExists` in `admin/rewards.ts` (checklist item 3) |
| E4 | `apps/admin/src/config/nav-config.ts` has NO existing "rewards" entry (confirmed by direct read — not even `disabled: true`). Checklist item 7's "enable the Rewards nav item" must be read as "ADD a new, non-disabled `NavItem`" under the `Management` group, mirroring the `offers`/`deals` entries (which are non-disabled) — not "toggle an existing disabled flag." Choose an unused `lucide-react` icon (e.g. `Gift` or `Award` — neither is currently imported in the file) and route `to: '/rewards'`. | Writing the nav-config.ts edit (checklist item 7) |
| E5 | Confirm `pnpm --filter @jojopotato/api test` baseline count immediately BEFORE starting EXECUTE (expected ~368+ per the plan's own G11 note) and record the exact pre-phase count in the phase report, so the post-phase G11 regression comparison is against a real number, not the plan's approximate estimate. | Before starting checklist item 1 / at EXECUTE kickoff |

### High-risk pack

Required: no — this phase is MEDIUM-HIGH risk (money-adjacent, one program HARD invariant)
but does not independently meet the umbrella's/orchestration.md's 6 high-risk-pack trigger
classes (no auth/identity change, no billing/payment-processor change, no schema migration,
no public API *breaking* change — the admin surface is net-new and additive, no deploy/
container/gateway change, no new secret/trust-boundary logic). The umbrella's own risk
framing for this phase ("second of the two program-level non-negotiable invariants") is
already satisfied by this contract's HARD/Known-Gap-banned gate treatment of G1/G2/G3/G13,
which is a stronger, more specific proof than a generic 5-artifact evidence pack would add.
If EXECUTE discovers a genuinely new trust-boundary or payment-processor surface not visible
at VALIDATE time, escalate and request a risk-evidence pack before finalizing.

### Backlog artifacts to create during durable capture

- none new — G10's Agent-Probe residual is already tracked by the standing project-wide
  `apps/admin` browser/E2E-runner gap in `process/context/tests/all-tests.md`, not a new
  artifact.

Open gaps:
- G10 Agent-Probe manual walkthrough — accepted, standing project-wide precedent (no
  `apps/admin` browser/E2E runner exists yet; same gap already documented for every prior
  admin-dashboard phase in this program). Not a new gap introduced by this phase.
- The umbrella's `## Current Execution State` staleness (Phase 4a shown as "NOT YET MERGED"
  when it has in fact merged) — non-blocking for Phase 5, flagged for the next UPDATE
  PROCESS reconciliation pass, not a VALIDATE gate item.
- Execute-Agent Instructions E1/E3/E4 above are execution-time clarifications of already-
  correct plan intent, not design gaps requiring a return to PLAN.

What this coverage does NOT prove:
- G1/G2/G3's deep-equal snapshot tests prove no row was MUTATED by this phase's own admin
  write paths — they do NOT prove no FUTURE route/migration could add a join or write path
  from `rewards` into `star_transactions`/`coupons`; that residual is exactly why the plan
  frames these as regression LOCKS, not one-time assertions, and why G11's full-suite
  regression re-run must stay green on every subsequent phase touching these tables.
- G13's Fully-Automated exact-cents assertions prove the `free_upgrade` reward-coupon math
  is correct for the specific cart shapes exercised (one qualifying line, one non-qualifying
  line, multi-line `Math.min`, zero-delta line) — mirroring the offer-side test matrix; they
  do NOT prove every conceivable cart topology (e.g. the same benefit product appearing with
  three or more differently-priced size options simultaneously) — that residual risk is the
  same one already accepted for the offer-side `computeFreeUpgradeDiscountCents` in ADM-008
  Fix 6, not a new risk introduced by this phase's reuse of it.
- G9's jsdom component tests prove `reward-list`/`reward-form` render correctly and that
  confirm-dialogs/conditional fields trigger under test — they do NOT prove the full browser
  round-trip (real network calls, real cookie session, real mobile-screen reflection) works;
  that is G10's job, and G10 is Agent-Probe only (no automated browser assertion exists in
  this repo yet).
- G11/G12 prove no OTHER existing suite/typecheck broke — they do NOT prove the NEW
  `admin-rewards.integration.test.ts` file itself is well-formed until it is actually run;
  its own gates (G1-G8, G13-if-colocated-there) are the proof for its own content.
- None of these gates exercise Phase 6 (Orders view) or Phase 7 (Analytics) — both remain
  unbuilt and out of scope for this contract.

Gate: PASS (0 FAILs, 0 unresolved CONCERNs; 3 findings resolved via Execute-Agent
Instructions E1/E3/E4; 1 standing project-wide Agent-Probe residual (G10) accepted under the
same precedent as every prior phase in this program — not a new exception created here)
Accepted by: N/A — Gate is PASS, no CONCERNs required user acceptance. (G10's Agent-Probe
residual is a proving-strategy choice under the standing program-wide precedent, not an
accepted CONCERN — see Known-gap exclusion note above.)
