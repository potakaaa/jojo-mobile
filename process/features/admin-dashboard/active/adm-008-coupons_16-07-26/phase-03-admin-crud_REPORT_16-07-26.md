---
phase: phase-03-admin-crud
date: 2026-07-16
status: COMPLETE
feature: admin-dashboard
plan: process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-03-admin-crud_PLAN_16-07-26.md
---

# Phase 03 — Admin CRUD (Promotions / Offers / Coupons) — EXECUTE Report

**TL;DR:** All A–E checklist items done. 3 new admin route files (promotions/offers/coupons),
3 new serializers, generator prefix parameterized, aggregator appended (3 lines). 34 new tests
across 3 integration files. Exit gate GREEN: `typecheck` 0 errors, full suite 25 files / **313
tests / 0 failures / 0 regressions**. AC1/2/3/4/9/11 each proven by a real passing test (no
Known-Gap). Not committed — staging handed to user.

---

## What Was Done

### Route 1 — `packages/api/src/routes/admin/promotions.ts` (new)
Admin Promotion CRUD, mirrors `branches.ts` shape verbatim.
- `GET /` — list, newest-first (`desc(created_at)`).
- `GET /:promotionId` — detail; 404 on malformed or missing id.
- `POST /` — `{name, description?, startAt, endAt}`, Zod-validated (`z.coerce.date()` for the two
  timestamps), 201.
- `PATCH /:promotionId` — partial update; empty-body `.refine` guard; 404 on missing.
- Reuses `AdminApiError`/`handleAdminError`. No UNIQUE constraint on `promotions`, so
  `isUniqueViolation` is not needed here.

### Route 2 — `packages/api/src/routes/admin/offers.ts` (new)
Admin Offer CRUD. `offerType` reuses the existing 6-value `deal_type` enum verbatim (no new enum).
- `GET /` — list newest-first; optional `?promotionId=` filter (malformed filter → empty list).
- `GET /:offerId` — detail; 404 on malformed or missing id.
- `POST /` — `{title, description?, offerType, discountValueCents?, minimumOrderAmountCents,
  startAt, endAt, usageLimitPerUser?, totalUsageLimit?, promotionId?}`, 201. Money via
  `centsToNumeric` on write. `promotionId` FK validated (404) **before** any insert.
- `PATCH /:offerId` — partial; re-validates a supplied `promotionId` FK (404) before update.
- `deal_type` column populated from the request `offerType`; serializer maps `deal_type` →
  `offerType` on read.

### Route 3 — `packages/api/src/routes/admin/coupons.ts` (new)
Admin coupon issuance.
- `POST /generate` — `{offerId, quantity, userId?, expiresAt?}`. Whole batch Zod-validated FIRST
  (`quantity>=1`, `offerId` required, `userId` only when `quantity===1` via `.refine`) → malformed
  request is 400 BEFORE any DB write (AC11). Referenced Offer existence checked (404) before any
  coupon write. Coupons minted inside a single `db.transaction`; each insert wrapped in a nested
  savepoint (`tx.transaction`) with a bounded 5-attempt retry on a `coupons.code` UNIQUE collision
  (mirrors the star-earning unlock retry). `user_id` set only for a targeted single issue, else
  NULL (bulk). `expires_at` persisted when supplied.
- `GET /?offerId=` — list coupons for an Offer; `offerId` query filter required (400 if absent/malformed).

### `packages/api/src/lib/reward-coupon-code.ts` — prefix parameterization (in place)
Extracted a shared `generateCouponCode(prefix)` and added an `offerCouponCodeGenerator` seam
(`JP-OFR-` prefix). The reward path is unchanged behaviorally (`generateRewardCouponCode()` now
delegates to `generateCouponCode('JP-RWD-')`; `rewardCouponCodeGenerator.generate` unchanged). The
retry loop was NOT duplicated — it lives in each caller.

Diff (semantic):
```
- export function generateRewardCouponCode(): string {
-   let suffix = '';
-   for (...) suffix += ALPHABET[randomInt(ALPHABET.length)];
-   return `JP-RWD-${suffix}`;
- }
- export const rewardCouponCodeGenerator = { generate: generateRewardCouponCode };
+ const REWARD_PREFIX = 'JP-RWD-';
+ const OFFER_PREFIX  = 'JP-OFR-';
+ export function generateCouponCode(prefix: string): string {
+   let suffix = '';
+   for (...) suffix += ALPHABET[randomInt(ALPHABET.length)];
+   return `${prefix}${suffix}`;
+ }
+ export function generateRewardCouponCode(): string { return generateCouponCode(REWARD_PREFIX); }
+ export function generateOfferCouponCode(): string  { return generateCouponCode(OFFER_PREFIX); }
+ export const rewardCouponCodeGenerator = { generate: generateRewardCouponCode };  // unchanged
+ export const offerCouponCodeGenerator = { generate: generateOfferCouponCode };    // new seam
```

### `packages/api/src/routes/admin/index.ts` — aggregator append (exactly 3 `.use()` lines)
```
+ adminRouter.use('/promotions', promotionsRouter);
+ adminRouter.use('/offers', offersRouter);
+ adminRouter.use('/coupons', couponsRouter);
```
Plus the 3 matching imports. No existing line restructured; `requireAdmin` + CORS inherited from
the single `/api/admin` mount.

### `packages/api/src/routes/lib/serializers.ts` — 3 types + 3 serializers
`AdminPromotion`/`serializeAdminPromotion`, `AdminOffer`/`serializeAdminOffer`,
`AdminCoupon`/`serializeAdminCoupon` — local-declaration convention (no `packages/types` edit).
Cents at boundary via `numericToCents`. `AdminCoupon` exposes the real `offerId` column (admin
surface is internal, not the wire-frozen public `ApiCoupon.dealId`).

---

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm --filter @jojopotato/api typecheck` | `tsc --noEmit` → **0 errors** |
| Full suite | `pnpm --filter @jojopotato/api test` | **Test Files 25 passed (25) / Tests 313 passed (313)** — 0 failures, 0 regressions |
| Prettier | `prettier --check` on 9 touched files | clean (2 files auto-fixed with `--write`, re-typechecked) |

New test files (all green):
- `src/routes/admin/__tests__/admin-promotions.integration.test.ts` — **11 tests** (AC1 create/list/get/patch + AC9 403 no-auth/customer/staff)
- `src/routes/admin/__tests__/admin-offers.integration.test.ts` — **11 tests** (AC2 create with/without promotion link, cents round-trip, all 6 offerType enum values, 404 missing-promotion FK on POST + PATCH, list/detail/filter + AC9)
- `src/routes/admin/__tests__/admin-coupon-issuance.integration.test.ts` — **12 tests** (AC3 bulk N=50 unique + forced-collision retry, AC4 targeted user_id + expiresAt persist + reject userId when quantity>1, AC11 quantity<=0/negative/missing offerId → 400 zero rows, 404 missing offer, list + AC9)

**Per-AC proof (Known-Gap BANNED, all Fully-Automated):**
| AC | Behavior | Proving test | Status |
|---|---|---|---|
| AC1 | Admin creates a Promotion | admin-promotions create/list/get | ✅ real pass |
| AC2 | Admin creates an Offer (± promotion link) | admin-offers create with/without + 404 FK | ✅ real pass |
| AC3 | Bulk-generate N codes, zero collisions | admin-coupon bulk N=50 unique + forced-collision retry | ✅ real pass |
| AC4 | Single targeted coupon issuance | admin-coupon targeted user_id set | ✅ real pass |
| AC9 | Admin auth required (403 otherwise) | all 3 files' no-auth + wrong-role cases | ✅ real pass |
| AC11 | Malformed request → 400 before any write | admin-coupon quantity<=0 / missing offerId → 400, zero rows | ✅ real pass |

---

## What Was Skipped or Deferred

- Nothing in the Phase 3 checklist was skipped.
- **Program-level obligation carried forward (not a Phase 3 gate):** the umbrella flags a 5-artifact
  high-risk evidence pack "before finalize (Phase 1–4 collectively)". Phase 3's own exit gate is
  typecheck + tests + ACs only (per the phase plan §Exit Gate) — evidence pack is a program-finalize
  concern, not this phase's blocker.

## Plan Deviations

1. **Offer discount field named `discountValueCents` (not `discountValue`).** The plan's Public
   Contract table wrote the request field as `discountValue?`, but B2 explicitly requires
   `centsToNumeric` treatment and the admin serializer convention uses an explicit `*Cents` suffix
   (`minimumOrderAmountCents`, `basePriceCents`, `priceDeltaCents`). For self-documenting
   consistency the request+response field is `discountValueCents` (cents). Within-blast-radius
   naming deviation; no external consumer (Phase 5 admin UI, authored later, consumes this surface).
2. **Test files placed at `routes/admin/__tests__/` (as the plan Touchpoints specify), which differs
   from the physical location of the 5 fixture precedents (`lib/__tests__/`).** I copied the
   `makeUser(role)` self-seeding fixture pattern verbatim from `admin-branches.integration.test.ts`
   (adjusting relative import depth by one `../`), honoring the plan's explicit Touchpoint paths.
   No shared fixture module was introduced (per plan).

## Test Infra Gaps Found

- None. The existing `globalSetup` (drop/create/migrate/seed) + `makeUser(role)` fixture pattern
  covered every scenario, including the forced-collision spy on `offerCouponCodeGenerator.generate`.

## Closeout Packet

- **Selected plan:** `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-03-admin-crud_PLAN_16-07-26.md`
- **Finished:** Steps A–E in full; both exit-gate commands green.
- **Verified:** typecheck (0 errors), full suite (313/313), 34 new tests, Prettier clean.
- **Unverified:** none for this phase's scope. (Program high-risk evidence pack deferred to
  program-finalize, per umbrella.)
- **Blast radius (files touched):** `routes/admin/promotions.ts` (new), `routes/admin/offers.ts`
  (new), `routes/admin/coupons.ts` (new), `routes/admin/index.ts`, `routes/lib/serializers.ts`,
  `lib/reward-coupon-code.ts`, + 3 new test files under `routes/admin/__tests__/`.
- **Classification:** `Ready for UPDATE PROCESS archival` after the orchestrator's EVL confirmation
  run + the user's commit checkpoint. Phase 3 has NO hard dependency on Phase 2/4 (parallel-safe
  with Phase 4).
- **Commit:** NOT done — per user requirement, staging + conventional-commit message handed to the
  user (see below).

### Suggested commit (user-driven — not executed)
```
git add packages/api/src/routes/admin/promotions.ts \
        packages/api/src/routes/admin/offers.ts \
        packages/api/src/routes/admin/coupons.ts \
        packages/api/src/routes/admin/index.ts \
        packages/api/src/routes/lib/serializers.ts \
        packages/api/src/lib/reward-coupon-code.ts \
        packages/api/src/routes/admin/__tests__/admin-promotions.integration.test.ts \
        packages/api/src/routes/admin/__tests__/admin-offers.integration.test.ts \
        packages/api/src/routes/admin/__tests__/admin-coupon-issuance.integration.test.ts

feat(admin): ADM-008 Phase 3 — Promotions/Offers/Coupons admin CRUD + issuance
```

## Forward Preview

- **Test Infra Found:** `globalSetup` recreates + migrates + seeds a `<db>_test` DB per run; the
  `makeUser(role)` self-seeding fixture and `offerCouponCodeGenerator` spy seam are reusable by
  Phase 5's UI-adjacent tests if any land server-side.
- **Blast Radius Changes:** 3 new admin sub-routers now mounted under `/api/admin/{promotions,offers,coupons}`.
  `offerCouponCodeGenerator` is a new export from `lib/reward-coupon-code.ts` (Phase 5 UI does not
  import it; Phase 2 redemption is independent). `serializeAdminOffer.discountValueCents` is the
  field Phase 5's Offer UI will bind to.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/api typecheck` + `pnpm --filter
  @jojopotato/api test` (needs local Postgres reachable via `DATABASE_URL`).
- **Dependency Changes:** none — no new package, no new runtime surface, no migration (Phase 1's
  0011 already provides `promotions`/`offers`/`coupons.offer_id`/nullable `user_id`).
