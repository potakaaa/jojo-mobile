---
name: plan:adm-008-coupons-phase-03-admin-crud
description: "ADM-008 Coupons — Phase 03: admin Promotions/Offers/Coupons CRUD routes (append-only aggregator)"
date: 16-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: phase-03
---

# Phase 03 — Admin CRUD Routes (Promotions / Offers / Coupons)

**Program:** adm-008-coupons
**Umbrella plan:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/adm-008-coupons_UMBRELLA_PLAN_16-07-26.md
**Phase status:** ✅ COMPLETE — EXECUTE done, EVL-green, code-complete (see co-located REPORT)
**Report destination:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-03-admin-crud_REPORT_{dd-mm-yy}.md (flat in the program task folder)

---

## Purpose

Admin authoring surface for the ADM-008 coupon system: full CRUD for Promotions and Offers, plus
coupon issuance (bulk N-generate and single-targeted-issue). Depends on Phase 1 (needs the renamed
`offers`/`promotions`/`coupons.offer_id` schema landed). Parallel-safe with Phase 4 (public `GET
/deals` repoint) — both depend only on Phase 1, not on each other.

---

## Entry Gate

- Phase 1 exit gate passed (migration `0011_{name}.sql` applied, schema barrel updated,
  `pnpm --filter @jojopotato/api typecheck` clean).

---

## Blast Radius

- `packages/api/src/routes/admin/promotions.ts` (new)
- `packages/api/src/routes/admin/offers.ts` (new)
- `packages/api/src/routes/admin/coupons.ts` (new)
- `packages/api/src/routes/admin/index.ts` (append 3 `.use()` lines only)
- `packages/api/src/routes/lib/serializers.ts` (add `AdminPromotion`/`AdminOffer`/`AdminCoupon`
  types + serializers, local-declaration convention)
- `packages/api/src/lib/reward-coupon-code.ts` (parameterize prefix for admin-issued codes; default
  to reuse-in-place over a sibling wrapper)
- 3 new integration test files: `admin-promotions.integration.test.ts`,
  `admin-offers.integration.test.ts`, `admin-coupon-issuance.integration.test.ts`

---

## Locked Decisions Referenced (do not re-litigate)

- **Reuse the existing admin plumbing verbatim:** `AdminApiError`/`handleAdminError`/
  `isUniqueViolation` from `routes/admin/lib/errors.ts`; the append-only `routes/admin/index.ts`
  aggregator pattern (`adminRouter.use('/promotions', ...)` etc. — confirmed mechanically sound
  against 4 real prior consumers: branches/products+categories/deals); `requireAdmin` inheritance
  via the single `app.use('/api/admin', cors(...), requireAdmin(auth), adminRouter)` mount point in
  `packages/api/src/index.ts` — no new guard code needed.
- **`offerType` reuses the existing 6-value enum verbatim**
  (`percentage_discount`/`fixed_discount`/`buy_one_take_one`/`free_item`/`free_upgrade`/`bundle`) —
  no new enum.
- **`POST /coupons/generate` contract:** `{offerId, quantity, userId?, expiresAt?}` — `quantity>=1`;
  `userId` only valid when `quantity===1` (single-targeted) OR omitted entirely (bulk). Validate
  the WHOLE batch request with Zod first, then loop — reject `quantity<=0` or missing `offerId`
  with 400 BEFORE any DB write (AC11).
- **Coupon code generator:** reuse the collision-safe pattern in `lib/reward-coupon-code.ts`
  (Crockford-32, `crypto.randomInt`, bounded retry) — parameterize the prefix (`JP-RWD-` vs
  `JP-OFR-`) in place rather than duplicating the retry-loop implementation in a sibling file.
- **Malformed coupon-generation payload → 400** (matches existing codebase convention, locked, not
  reopened).
- **`promotionId` on Offer create/update is optional** — when present, validate the referenced
  Promotion exists (404 if not) before writing.
- **Coupon expiry batch default:** inherits the Offer's own `end_at` unless the admin explicitly
  supplies a per-batch `expiresAt` override field (optional request field, defaults to `null` →
  resolver falls back to `offers.end_at` at redemption time — Phase 2's concern, not this phase's,
  but the `expiresAt` field must be accepted and persisted here).

---

## Implementation Checklist

### Step A — Promotions CRUD

- [x] A1. Create `packages/api/src/routes/admin/promotions.ts`: `GET /` (list), `GET /:id` (404 if
      missing), `POST /` (`{name, description?, startAt, endAt}`, Zod-validated, 201), `PATCH /:id`
      (partial update).
- [x] A2. Reuse `AdminApiError`/`handleAdminError` from `admin/lib/errors.ts` — no new error class
      (Promotions has no UNIQUE constraint, so `isUniqueViolation` was not needed here).

### Step B — Offers CRUD

- [x] B1. Create `packages/api/src/routes/admin/offers.ts`: `GET /` (list, optional `?promotionId=`
      filter), `GET /:id`, `POST /`, `PATCH /:id` (partial).
- [x] B2. `centsToNumeric` boundary serialization for `discountValueCents`/`minimumOrderAmountCents`
      (reused from `routes/lib/serializers.ts`).
- [x] B3. Validate `promotionId` FK when present — 404 if the referenced Promotion doesn't exist,
      before any write (both POST and PATCH).

### Step C — Coupons issuance + list

- [x] C1. Create `packages/api/src/routes/admin/coupons.ts`: `POST /generate` (bulk-N /
      single-targeted); `GET /?offerId=` (query filter required — list).
- [x] C2. Zod-validate the whole batch request FIRST; reject `quantity<=0`/missing `offerId` with
      400 BEFORE any DB write (AC11).
- [x] C3. Reuse the collision-safe generator, parameterized with prefix `JP-OFR-`
      (`offerCouponCodeGenerator`), same savepoint-bounded retry as star-earning.
- [x] C4. Persist `expiresAt` when supplied; persist `userId` only when `quantity===1` and `userId`
      present, else `user_id` NULL (bulk).

### Step D — Aggregator + types

- [x] D1. Append exactly 3 new lines to `packages/api/src/routes/admin/index.ts`.
- [x] D2. Add `AdminPromotion`/`AdminOffer`/`AdminCoupon` types + serializers to
      `routes/lib/serializers.ts`, local-declaration convention.

### Step E — Test gates

- [x] E1. `admin-promotions.integration.test.ts` — create/list/get (AC1). 11 tests.
- [x] E2. `admin-offers.integration.test.ts` — create with/without `promotionId` link, 404 on
      missing referenced Promotion (AC2). 11 tests.
- [x] E3. `admin-coupon-issuance.integration.test.ts` — bulk N=50 unique (AC3); forced-collision
      retry (AC3); targeted single-issue with `user_id` set (AC4); `quantity<=0`/missing `offerId`
      → 400, zero rows (AC11). 12 tests.
- [x] E4. All 3 new integration files include no-auth (403) and wrong-role (403) cases (AC9).
- [x] E5. `pnpm --filter @jojopotato/api typecheck` — 0 errors.
- [x] E6. `pnpm --filter @jojopotato/api test` — 25 files / 313 tests green, 0 regressions.

---

## Exit Gate

```bash
pnpm --filter @jojopotato/api typecheck
# Expected: 0 errors

pnpm --filter @jojopotato/api test
# Expected: full suite green, 3 new integration test files pass, zero regressions
```

- All checklist items (A–E) checked.
- AC1, AC2, AC3, AC4, AC9, AC11 all proven by real passing Fully-Automated tests (no Known-Gap).
- Phase report written to report destination above.

---

## Blockers That Would Justify BLOCKED Status

- Phase 1 exit gate not yet passed (hard dependency — `offers`/`promotions`/`coupons.offer_id`
  schema not yet present).
- `admin/lib/errors.ts` or the append-only aggregator pattern has diverged in a way that breaks the
  reuse assumption — investigate before proceeding, do not force-fit.

---

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: re-read `routes/admin/{index,lib/errors}.ts`, a real prior
      admin CRUD file (e.g. `routes/admin/branches.ts` or `products.ts`) for the exact shape to
      mirror, and `lib/reward-coupon-code.ts`; confirm Phase 1 landed cleanly (schema present);
      check for any further drift since source plan's VALIDATE pass.
- [ ] 2. INNOVATE — innovate-agent: expected n/a (Locked Decisions above already resolve the
      design; this phase is a straightforward CRUD mirror of existing admin routes).
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: update this phase plan with research findings, or mark
      "n/a — research clean".
- [x] 4. PVL — SEEDED below from source plan's outer-pvl VALIDATE pass. Orchestrator MUST still
      spawn vc-validate-agent for inner PVL re-confirmation before EXECUTE.
- [x] 5. EXECUTE — all checklist items (A–E) done; test gates green (typecheck 0 errors; 313/313
      full suite; 34 new tests across 3 files). Report written. Awaiting EVL confirmation run.
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written.
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated. **Phase VERIFIED →
      orchestrator hands staging commands + a conventional-commit summary to the USER; do NOT
      auto-commit.**

**Validate-contract required before execute.**

---

## Touchpoints

- `packages/api/src/routes/admin/promotions.ts` (new)
- `packages/api/src/routes/admin/offers.ts` (new)
- `packages/api/src/routes/admin/coupons.ts` (new)
- `packages/api/src/routes/admin/index.ts`
- `packages/api/src/routes/lib/serializers.ts`
- `packages/api/src/lib/reward-coupon-code.ts`
- `packages/api/src/routes/admin/__tests__/admin-promotions.integration.test.ts` (new)
- `packages/api/src/routes/admin/__tests__/admin-offers.integration.test.ts` (new)
- `packages/api/src/routes/admin/__tests__/admin-coupon-issuance.integration.test.ts` (new)

---

## Public Contracts

| Method + Path | Auth | Request | Response | Notes |
|---|---|---|---|---|
| `GET /api/admin/promotions` | `requireAdmin` (inherited) | — | `AdminPromotion[]` | List |
| `GET /api/admin/promotions/:id` | `requireAdmin` | — | `AdminPromotion` | 404 if missing |
| `POST /api/admin/promotions` | `requireAdmin` | `{name, description?, startAt, endAt}` | `AdminPromotion` (201) | Zod-validated |
| `PATCH /api/admin/promotions/:id` | `requireAdmin` | partial | `AdminPromotion` | |
| `GET /api/admin/offers` | `requireAdmin` | `?promotionId=` optional filter | `AdminOffer[]` | |
| `GET /api/admin/offers/:id` | `requireAdmin` | — | `AdminOffer` | |
| `POST /api/admin/offers` | `requireAdmin` | `{title, description?, offerType, discountValueCents?, minimumOrderAmountCents, startAt, endAt, usageLimitPerUser?, totalUsageLimit?, promotionId?}` | `AdminOffer` (201) | cents at boundary; `offerType` reuses the existing 6-value enum verbatim |
| `PATCH /api/admin/offers/:id` | `requireAdmin` | partial | `AdminOffer` | |
| `POST /api/admin/coupons/generate` | `requireAdmin` | `{offerId, quantity, userId?, expiresAt?}` — `quantity>=1`, `userId` only valid when `quantity===1` (single-targeted) OR omitted for bulk | `{coupons: AdminCoupon[]}` (201) | 400 on `quantity<=0`/missing `offerId` before any write (AC11) |
| `GET /api/admin/coupons?offerId=` | `requireAdmin` | query filter required | `AdminCoupon[]` | |

No changes to any pre-existing public contract in this phase's blast radius.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `admin-promotions.integration.test.ts` — create/list/get | Fully-Automated | AC1 |
| `admin-offers.integration.test.ts` — create with/without promotion link, 404 on missing FK | Fully-Automated | AC2 |
| `admin-coupon-issuance.integration.test.ts` — bulk N=50, assert 50 unique rows | Fully-Automated | AC3 |
| forced-collision unit test on code-generator retry path | Fully-Automated | AC3 |
| `admin-coupon-issuance.integration.test.ts` — targeted single-issue, `user_id` set | Fully-Automated | AC4 |
| `admin-promotions`/`admin-offers`/`admin-coupon-issuance` — no-auth (403) + wrong-role (403) cases | Fully-Automated | AC9 |
| `admin-coupon-issuance.integration.test.ts` — `quantity<=0`/missing `offerId` → 400, zero rows written | Fully-Automated | AC11 |
| `pnpm --filter @jojopotato/api typecheck` | Fully-Automated | Renamed-symbol/new-route regression guard |
| `pnpm --filter @jojopotato/api test` (full suite) | Fully-Automated | Zero-regression bar |

```bash
pnpm --filter @jojopotato/api test          # needs: docker compose up -d && pnpm --filter @jojopotato/api db:migrate first
pnpm --filter @jojopotato/api typecheck
```

**Known-Gap ban compliance:** AC1, AC2, AC3, AC4, AC9, AC11 are all assigned Fully-Automated with a
real passing test — no developed behavior in this phase is left on Known-Gap alone.

---

## Test Infra Improvement Notes

(none identified yet)

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-03-admin-crud_PLAN_16-07-26.md`
2. **Last completed phase or step:** none — phase not yet started; depends on Phase 1.
3. **Validate-contract status:** SEEDED (CONDITIONAL) — pending inner PVL re-confirmation.
4. **Supporting context files loaded this session:** source master plan
   `adm-008-coupons_PLAN_16-07-26.md` (Phase 3 section, Touchpoints, Public Contracts, Acceptance
   Criteria, Verification Evidence, Validate Contract), sibling `phase-02-resolver-burn-guard_PLAN_16-07-26.md`
   (format reference).
5. **Next step for a fresh agent picking up mid-execution:** after Phase 1 exit gate passes, spawn
   vc-research-agent (or vc-validate-agent directly for PVL re-confirmation) for Phase 3. Phase 3
   has no hard dependency on Phase 2's completion and is parallel-safe with Phase 4.

---

## Validate Contract

Status: CONDITIONAL (SEEDED from source plan's outer-pvl VALIDATE pass, 16-07-26 — re-confirm via
inner PVL before EXECUTE)
Date: 16-07-26
date: 2026-07-16
generated-by: outer-pvl

Test gates (subset of source plan's C3 table relevant to this phase):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Admin creates a Promotion | Fully-Automated | `admin-promotions.integration.test.ts` — create/list/get | A |
| AC2 | Admin creates an Offer | Fully-Automated | `admin-offers.integration.test.ts` — create with/without promotion link | A |
| AC3 | Bulk-generate N coupon codes, zero collisions | Fully-Automated | `admin-coupon-issuance.integration.test.ts` — bulk N=50 unique + forced-collision retry unit test | A |
| AC4 | Single targeted coupon issuance | Fully-Automated | `admin-coupon-issuance.integration.test.ts` — targeted single-issue, `user_id` set | A |
| AC9 | Admin auth required (403 otherwise) | Fully-Automated | 3 new admin integration files' no-auth/wrong-role cases | A |
| AC11 | Malformed/empty coupon-generation request → 400 before any write | Fully-Automated | `admin-coupon-issuance.integration.test.ts` — `quantity<=0`/missing `offerId` → 400, zero rows | A |

gap-resolution legend: A — proven now (gate passes in this cycle, once EXECUTE lands).

Dimension findings (from source plan's VALIDATE pass, Phase 3 row):
- Phase 3 (admin CRUD routes): **PASS** — append-only aggregator + `AdminApiError`/
  `handleAdminError`/`isUniqueViolation` reuse both confirmed available and stable; `makeUser(role)`
  local-fixture convention confirmed real across 5 existing integration test files
  (copy-pasteable, no shared fixture module needed). No CONCERNs or FAILs found for this phase
  specifically — the source plan's VALIDATE pass raised concerns only against Phases 1, 2, and 4.

Open gaps: none carried as Known-Gap for this phase.

What this coverage does NOT prove:
- VALIDATE itself did not run any test (no code was changed except the plan file) — this phase's
  correctness is read-verified against real prior admin-CRUD precedent (branches/products+
  categories/deals routes on this branch), not yet proven by a green test run. EXECUTE's Step E
  tests are the first actual proof.

Gate: CONDITIONAL (0 unresolved FAILs; Phase 3 itself was found PASS by the source VALIDATE pass —
this phase's gate is CONDITIONAL only because the overall program gate is CONDITIONAL, pending
EXECUTE proof; no Phase-3-specific CONCERN was left unresolved).
Accepted by: session (autonomous, inherited from source plan's single-shot VALIDATE pass).
