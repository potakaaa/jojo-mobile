---
name: plan:adm-008-coupons
description: "ADM-008 Promotions/Offers/Coupon-codes admin authoring surface — precondition satisfied post-merge (PR #92), ready for VALIDATE"
date: 16-07-26
feature: admin-dashboard
---

# ADM-008 — Promotions / Offers / Coupon Codes — Implementation Plan

> ⚠️ **SUPERSEDED BY PHASE PROGRAM (16-07-26).** This monolithic COMPLEX plan has been split into a
> phase program for commit-per-phase checkpoints. The authoritative execution artifacts are now:
> `adm-008-coupons_UMBRELLA_PLAN_16-07-26.md` (shared context, Locked Decisions 1–7, Program Goal
> Charter, Current Execution State) + `phase-0{1..5}-*_PLAN_16-07-26.md`. This file is retained
> READ-ONLY as the historical source and as the home of the original outer-PVL `## Validate Contract`
> (Gate: CONDITIONAL, all concerns fixed in-plan) from which each phase's contract was seeded. Do NOT
> execute from this file — execute per phase from the umbrella + phase plans.

**Date**: 16-07-26
**Status**: SUPERSEDED-BY-PROGRAM (was: READY FOR VALIDATE) — hard precondition satisfied (`feat/adm-004-deals` merged into `development` via PR #92, 16-07-26).
**Complexity**: COMPLEX (schema rename + new tables, cross-cutting redemption-path change, new
admin CRUD surface, dormant-route repoint, hard cross-branch merge precondition).

---

## Overview

ADM-008 gives admins a real, database-backed way to author promotional coupon codes — a
Promotion (marketing event container), an Offer (the discount mechanic, renamed/split off the
legacy `deals` table), and bulk or single-targeted Coupon issuance — replacing today's hardcoded
static promo-code list (`deals-catalog.ts`) with real, burnable `coupons` rows reusing the exact
mechanism reward coupons already use. This plan is design-only: EXECUTE is deferred until
`feat/adm-004-deals` merges into `development`, because this plan's blast radius needs
`products.is_deal` (ADM-004-only, for AC6's mutual-exclusion guard) and `development`'s existing
coupon backend (`coupons` table, `routes/coupons.ts`, `coupon-apply.ts`,
`reward-coupon-code.ts`) to coexist in one tree — see the Hard Precondition section below
(now RESOLVED — the merge landed and both requirements are confirmed present on this branch).

## ⚠️ HARD PRECONDITION — RESOLVED (16-07-26)

**PRECONDITION SATISFIED.** `feat/adm-004-deals` merged into `development` via PR #92. The current
`feat/adm-008-coupons` branch sits on the merged tree and has BOTH requirements confirmed present:

| Requirement | Status post-merge |
|---|---|
| `products.is_deal` column + `deal_components` table | ✅ present |
| `coupons` table + `routes/coupons.ts` + `routes/lib/coupon-apply.ts` + `lib/reward-coupon-code.ts` + `utils/deals-catalog.ts` + `coupons_user_reward_unique` partial index | ✅ present |

Build-health note: post-merge `pnpm --filter @jojopotato/api typecheck` and
`pnpm --filter @jojopotato/admin typecheck` initially failed on stale workspace symlinks — a plain
`pnpm install` resolved it; both typechecks are now green.

**Status: READY FOR VALIDATE** (was: BLOCKED). Everything below designs against the real,
now-coexisting merged tree — file paths for the former "development-only" files are now directly
readable on this branch, not cited secondhand from the SPEC.

**Migration sequence (concrete, confirmed via `drizzle/meta/_journal.json`):** the journal ends at
idx 10 = `0010_fearless_crystal` (ADM-004's `is_deal` + `deal_components`, renumbered from pre-merge
`0007`). The new ADM-008 migration is **0011**. Full sequence for reference: 0006 `orders.deal_id`
FK → 0007 `star_transactions` idx → 0008 `coupons_user_reward_unique` idx → 0009 `orders.coupon_id`
FK → 0010 `is_deal`+`deal_components` → **0011 (this plan)**.

## Locked Decisions (from INNOVATE — do not re-litigate during EXECUTE)

1. **Resolver:** extend the existing `resolveCouponDiscount()` in `routes/lib/coupon-apply.ts`
   with ONE new code-match branch against `coupons.offer_id` rows. This REPLACES the static
   `deals-catalog.ts` `DEAL_CATALOG` lookup — the static catalog is retired as a resolution
   source (Phase 2 decides delete-file-vs-leave-dead, defaulting to delete since nothing else
   imports it after the swap). Reuse the existing atomic burn in `orders.ts` verbatim — no
   parallel resolver, no second burn path.
   **VALIDATE finding, LOCKED FIX (must apply, not optional):** the real Branch 1 in
   `resolveCouponDiscount()` (the existing reward-coupon lookup) queries `coupons` scoped ONLY to
   `(code, user_id)` — it does NOT filter `reward_id IS NOT NULL`. A TARGETED offer-coupon (whose
   `user_id` is set at issuance per Locked Decision 2) would incorrectly MATCH this existing branch
   first, then hit `checkRewardEligibility(..., reward=null, ...)` → `no_eligible_product` (400) —
   verified via reading `packages/utils/src/discount.ts`'s null-reward handling — a wrong rejection,
   not a crash. **Fix: Branch 1's condition must additionally require `coupon.reward_id !== null`
   (or the query itself adds `AND reward_id IS NOT NULL`) before treating a matched row as the
   reward-coupon path; a matched row with `reward_id === null` (an offer-coupon) must fall through
   to the new offer-coupon branch instead.** This is a real, code-verified logic gap in the original
   INNOVATE design, not a hypothetical — AC5 (targeted-coupon redemption) will fail without it. The
   bulk (`user_id IS NULL`) case already falls through correctly today (Branch 1's `user_id = ?`
   condition simply won't match a NULL row), so only the targeted case needs this explicit guard.
2. **Issuance / `user_id`:** make `coupons.user_id` NULLABLE (new migration). Targeted issuance
   sets `user_id` at creation time; bulk issuance leaves it `NULL`. Redemption folds
   claim-on-redeem into the EXISTING atomic burn UPDATE:
   ```sql
   UPDATE coupons
   SET status = 'used', user_id = COALESCE(user_id, $requester)
   WHERE id = $couponId AND status = 'available'
     AND (user_id IS NULL OR user_id = $requester)
   ```
   This is a one-line extension of the current `UPDATE coupons SET status='used' WHERE id=... AND
   status='available'` (SPEC Background, `orders.ts` citation) — no new burn statement, no new
   table.
3. **Migration: `0011_{name}.sql`** (concrete, confirmed via `drizzle/meta/_journal.json` — journal
   ends at idx 10 = `0010_fearless_crystal`; EXECUTE must still re-confirm via journal read before
   writing, in case new migrations land between PLAN and EXECUTE). Contents (all non-destructive):
   - `ALTER TABLE deals RENAME TO offers;`
   - `ALTER TABLE deal_products RENAME TO offer_products;` + `ALTER TABLE offer_products RENAME
     COLUMN deal_id TO offer_id;` — **CONFIRMED via recon: `deal_products.ts` and
     `deal_branches.ts` both exist on the merged tree as schema files distinct from ADM-004's
     `deal_components.ts`** (all 3 files present in `packages/api/src/db/schema/`). No longer
     conditional — include this rename unconditionally.
   - `ALTER TABLE deal_branches RENAME TO offer_branches;` + matching `deal_id`→`offer_id` column rename
   - `ALTER TABLE coupons RENAME COLUMN deal_id TO offer_id;` + FK repoint to `offers.id`
     (Postgres `RENAME COLUMN` on an FK column does not require dropping/re-adding the
     constraint — the constraint follows the column)
   - `ALTER TABLE coupons ALTER COLUMN user_id DROP NOT NULL;` — **migration-correctness checkpoint:**
     the existing partial unique index `coupons_user_reward_unique ON coupons (user_id, reward_id)
     WHERE reward_id IS NOT NULL` (created in migration 0008) MUST survive this migration unchanged.
     A nullable `user_id` still satisfies the index (it's scoped to `reward_id IS NOT NULL`, not
     `user_id IS NOT NULL`), and neither `ALTER COLUMN ... DROP NOT NULL` nor the `deal_id`→`offer_id`
     `RENAME COLUMN` above touches this index — verify with `\d coupons` post-migration that
     `coupons_user_reward_unique` is still listed.
   - `CREATE TABLE promotions (...)` — new table (id, name, description, start_at, end_at,
     created_at, updated_at)
   - `ALTER TABLE offers ADD COLUMN promotion_id uuid REFERENCES promotions(id);` — nullable FK
   - Never edit an already-applied migration file; this is additive/rename-only, zero backfill,
     zero data loss (renames preserve rows).
4. **Public `GET /deals` / `GET /deals/:id`:** repoint `routes/deals.ts` IN PLACE — same URL
   paths, same `ApiDeal`/`serializeDeal` response shape (per SPEC AC10) — only the underlying
   Drizzle table import swaps from `deals` to `offers`. No compatibility view, no second route.
   This is free because the RENAME preserves row shape 1:1.
5. **Cardinality:** `offers.promotion_id` is a plain nullable FK to `promotions.id` (Promotion
   1 — 0..N Offer). No junction table — matches the SPEC's flow diagram exactly.
6. **`is_deal` mutual exclusion (AC6):** enforced INSIDE the `POST /orders` placement transaction
   ONLY, extending the EXISTING `dealId`-XOR-`couponCode` 400 guard already in `orders.ts` — if
   `couponCode` is set AND any cart line references an `is_deal=true` product → 400 before any
   write. NOT enforced at `POST /coupons/apply` preview time (preview has no cart-line context in
   today's contract — extending the preview payload is out of scope for this pass; the guard's
   correctness bar is the ORDER endpoint, matching SPEC AC6's own phrasing "cart containing... on
   `POST /orders`").

Also: rename the dormant `orders.ts` `deal_id`-guard comments/references from "deal" to "offer"
terminology in the same pass for consistency (the mechanism is unchanged, only naming), since the
SPEC's own Background section quotes our branch's `orders.ts` comment anticipating this exact
handoff.

7. **VALIDATE addition — full rename inventory + wire-compatibility rule (LOCKED, resolves a
   real under-scoping gap found by reading every actual consumer of `deals`/`dealBranches`/
   `dealProducts` on this branch — see Touchpoints additions below).** Two independent axes:

   **A. What RENAMES at the schema/DB layer** (Drizzle symbol + DB identifier):
   - `deals` table → `offers`; `deal_products` table → `offer_products` (+ its own `deal_id`
     column → `offer_id`); `deal_branches` table → `offer_branches` (+ its own `deal_id` column
     → `offer_id`); `coupons.deal_id` column → `offer_id` (already covered by Locked Decision 3).
   - `orders.deal_id` **stays named `deal_id`** (NOT renamed) — Postgres `RENAME TABLE`
     auto-follows the FK target, so the column continues to point at `offers.id` with zero SQL
     changes required. Only the Drizzle schema file's import/reference target updates
     (`import { deals } from './deals'` → `import { offers } from './offers'`,
     `.references(() => offers.id)`). This is the smallest-diff option and avoids an unforced
     wire-contract question (see B).
   - `deal_type` (the enum-carrying column inside the renamed `offers` table) is **not** renamed
     by this migration — only the table name and the two junction FKs rename. Per the existing
     Touchpoints row, `dealTypeEnum`→`offerTypeEnum` export renaming is EXECUTE's call, is
     independent of the column name, and does not block anything else in this list.

   **B. What STAYS THE SAME at the HTTP/wire layer** (never rename these — mirrors Locked
   Decision 4's treatment of `GET /deals`, extended consistently to every other wire surface that
   touches this rename):
   - `ApiDeal` (Locked Decision 4 — already locked).
   - `POST /orders` request body's `dealId` field and `ApiOrder`/`OrderDetail.dealId` in the
     response — both already declared UNCHANGED in the Public Contracts table; consistent with
     `orders.deal_id` staying unrenamed at the DB layer (A above), this needs ZERO code changes in
     `packages/types/src/order.ts` or `serializeOrder()`.
   - `GET /coupons`'s `dealId` field (`DbCoupon`/`CouponWithReward`/`ApiCoupon` in
     `packages/types/src/coupons.ts` and `packages/api/src/routes/lib/serializers.ts`) — **keep
     the wire field name `dealId`, source it from the renamed `coupon.offer_id` column
     internally** (i.e. `dealId: coupon.offer_id`), rather than renaming the field to `offerId`.
     Verified via grep that no `apps/mobile` consumer (`use-my-coupons.ts`,
     `rewards/coupons.tsx`) reads `.dealId` off a fetched coupon today, so either choice is
     runtime-safe, but preserving the name is the smaller, lower-coordination diff and avoids
     touching a file the plan already declares out of scope for mobile. **This supersedes the
     Touchpoints table's literal "DbCoupon.dealId→offerId" wording** — reinterpret that row as
     "keep the field name `dealId`; only its internal source column renames," not a wire rename.
   - `GET /deals`/`GET /deals/:id` AND the previously-unlisted `GET /api/branches/:id` (see new
     Touchpoints/Public-Contracts rows below) both keep their `deals: [...]`/`ApiDeal` response
     shape byte-identical — only their internal Drizzle table/column symbols rename.

**Locked, non-reopened SPEC Open Questions:**
- Malformed coupon-generation payload → **400** (matches existing codebase convention, per
  ADM-004's same open question resolution).
- "Generate Coupons" batch expiry → **inherits the Offer's own `end_at`** unless the admin
  explicitly overrides with a per-batch `expiresAt` field (optional request field, defaults to
  `null` → resolver falls back to `offers.end_at` at redemption time).
- `deals-catalog.ts` (`DEAL_CATALOG`) → **delete** in Phase 2 once the new resolver branch is
  wired and its only consumer (`resolveCouponDiscount`) no longer imports it. If any other file
  is found importing it during Phase 1 verification, downgrade to "leave dead" and note in the
  phase report.

---

## Touchpoints

| File | Change | Why |
|---|---|---|
| `packages/api/drizzle/00NN_{name}.sql` (new, number computed post-merge) | New migration: renames + new `promotions` table + nullable `user_id` + `promotion_id` FK (see Locked Decision 3) | Schema foundation for everything else |
| `packages/api/src/db/schema/deals.ts` → renamed `offers.ts` | Rename exported table `deals`→`offers`, `dealTypeEnum`→`offerTypeEnum` (or keep enum name, rename export only — Phase 1 decides based on what's least invasive to enum-value-dependent code); add `promotion_id` column | Table rename mirrors migration |
| `packages/api/src/db/schema/promotions.ts` (new) | New Drizzle table def: id, name, description, start_at, end_at, timestamps | Backs Promotion entity |
| `packages/api/src/db/schema/coupons.ts` (development, post-merge) | `deal_id`→`offer_id` rename + FK repoint; `user_id` becomes nullable (`.notNull()` removed) | Coupon row now points at offers, supports bulk-issued unclaimed rows |
| `packages/api/src/db/schema/index.ts` (or equivalent barrel) | Update exports: `deals`→`offers`, add `promotions` | Barrel must reflect renamed/new tables |
| `packages/api/src/routes/lib/coupon-apply.ts` (development, post-merge) | `resolveCouponDiscount()` gains a THIRD resolution branch: code match against `coupons.offer_id`-backed rows (after existing user-owned-reward-coupon branch, replacing the static-catalog branch) | Closes the SPEC's core gap — admin-issued codes become real burnable DB rows |
| `packages/utils/src/deals-catalog.ts` (development, post-merge) | DELETE (Locked Decision, contingent on Phase 1 import-scan; fallback: leave dead + backlog note) | Retired resolution source once the DB-backed branch replaces it |
| `packages/api/src/routes/orders.ts` (development, post-merge) | Extend existing `dealId`-XOR-`couponCode` 400 guard to also reject `couponCode` + any `is_deal=true` cart line; rename dormant `deal_id`-guard comments to `offer_id` terminology; the coupon burn `UPDATE` gains `user_id = COALESCE(user_id, $requester)` | AC6 guard + claim-on-redeem burn extension |
| `packages/api/src/routes/deals.ts` (development, post-merge) | Repoint table import `deals`→`offers`; response shape (`ApiDeal`/`serializeDeal`) UNCHANGED | AC10 — mobile Deals-tab interim read path must not break |
| `packages/types/src/coupons.ts` (development, post-merge) | `DbCoupon.dealId`→`offerId`; `user_id` type becomes `string \| null` | Type-level rename follows schema |
| `packages/types/src/deals.ts` | `ApiDeal`/related types: no field rename needed (response SHAPE is unchanged per Locked Decision 4) — verify only, likely zero-diff | Confirms AC10 compatibility |
| `packages/api/src/routes/admin/lib/errors.ts` | none (reused as-is) | Existing `AdminApiError`/`handleAdminError`/`isUniqueViolation` cover all new routes |
| `packages/api/src/routes/admin/promotions.ts` (new) | Full CRUD: `GET /`, `GET /:id`, `POST /`, `PATCH /:id` | Promotion admin surface (AC1) |
| `packages/api/src/routes/admin/offers.ts` (new) | Full CRUD: `GET /`, `GET /:id`, `POST /`, `PATCH /:id` (mirrors `admin/products.ts` shape) | Offer admin surface (AC2) |
| `packages/api/src/routes/admin/coupons.ts` (new) | `POST /generate` (bulk N + optional single-targeted via `userId` + `quantity=1`), `GET /` (list, filterable by `offerId`) | Coupon issuance surface (AC3, AC4) |
| `packages/api/src/routes/admin/index.ts` | Append 3 new `adminRouter.use('/promotions', ...)`, `.use('/offers', ...)`, `.use('/coupons', ...)` lines | Append-only aggregator pattern (unchanged file structure) |
| `packages/api/src/lib/reward-coupon-code.ts` (development, post-merge) — OR a new sibling `admin-coupon-code.ts` | Reuse the collision-safe generator pattern (Crockford-32, `crypto.randomInt`, bounded retry) for admin-issued codes; Phase 3 decides reuse-in-place (parameterize prefix `JP-RWD-` vs `JP-OFR-`) vs a thin sibling wrapper — default to **parameterize in place** (smallest diff, single retry-loop implementation to test) | Zero-collision bulk generation (AC3) |
| `apps/admin/src/config/nav-config.ts` | Add 2 new nav items under "Management": `id: 'promotions'` label "Promotions", `id: 'offers'` label "Offers" — coupons are reached FROM an Offer detail page, no standalone top-level "Coupons" nav item. **NEVER add an item labeled "Deals"** (collision with ADM-004's existing bundle-Deals nav item) | Naming-collision guard from SPEC Constraints |
| `apps/admin/src/features/promotions/**` (new) | List + create/edit dialog, reusing `data-table`, `form-dialog`, `confirm-dialog`, `query-states`, `page-header` | Promotion admin UI |
| `apps/admin/src/features/offers/**` (new) | List + create/edit dialog + detail page with "Generate Coupons" action + coupon list sub-view | Offer admin UI + issuance UI |
| `apps/admin/src/routes/(dashboard)/promotions.tsx` + `promotions.index.tsx` (new) | Thin `<Outlet/>` layout + list page, per the TanStack Start nested-detail-route pattern (P3 durable gotcha) | Routing |
| `apps/admin/src/routes/(dashboard)/offers.tsx` + `offers.index.tsx` + `offers.$offerId.tsx` (new) | Same layout+index+detail split pattern | Routing (detail page hosts "Generate Coupons") |

**VALIDATE-added rows (real files found by reading every actual consumer of `deals`/
`dealBranches`/`dealProducts` on this branch — see Locked Decision 7 for the exact rename rule
each row follows):**

| File | Change | Why |
|---|---|---|
| `packages/api/src/db/schema/orders.ts` | Update import target only: `import { deals } from './deals'` → `import { offers } from './offers'`; `.references(() => offers.id)`. Column stays named `deal_id` (Locked Decision 7A) — zero SQL/wire change. | Otherwise this file fails to compile the moment `deals.ts` is renamed — a real inbound FK to `deals` the original Touchpoints list missed |
| `packages/api/src/index.ts` | `GET /api/branches/:id` (mounted directly on `app`, NOT inside `routes/branches.ts`) runs its own Query A/Query B union against `deals`/`dealBranches` + a local `computeDiscountLabel()` helper, returning `{branch, deals: [...]}`. Rename `deals`→`offers`, `dealBranches`→`offerBranches`, and `dealBranches.deal_id`→`offerBranches.offer_id` in all 3 query sites. Response shape (`deals: [...]`) stays byte-identical (Locked Decision 7B). | A 4th, previously undocumented live consumer of the renamed tables — has its own dedicated test (`__tests__/branch-detail-route.test.ts`) that will fail to compile otherwise |
| `packages/api/src/db/seed/seed.ts` | `seedDealsTable()`/`seedDealScopingTables()` insert directly into `deals`/`dealProducts`/`dealBranches` by Drizzle symbol and raw `deal_id` column key. Rename symbols to `offers`/`offerProducts`/`offerBranches`; `dealProducts.deal_id`→`offer_id`, `dealBranches.deal_id`→`offer_id` in the `.values()`/`.onConflictDoUpdate()` calls (per Locked Decision 7A — these two junction tables DO rename their `deal_id` column, unlike `orders`). | Local/dev DB seeding pipeline — breaks every developer's `db:seed` and any test relying on seeded rows until fixed |
| `packages/api/src/db/schema/__tests__/smoke.test.ts` | Update the table-existence string list: `'deals'`→`'offers'`, `'dealProducts'`→`'offerProducts'`, `'dealBranches'`→`'offerBranches'` | Schema smoke test asserts these table names by string; will fail post-rename |
| `packages/api/src/routes/lib/serializers.ts` | `DealRow = InferSelectModel<typeof deals>` → `typeof offers`. `serializeCoupon()`'s `dealId: coupon.deal_id` → `dealId: coupon.offer_id` (field NAME preserved, source column renamed — Locked Decision 7B). `serializeCouponWithLabel()`'s `coupon.deal_id !== null` → `coupon.offer_id !== null`, and its `deal: DealRow \| null` param → the renamed type. `serializeOrder()`'s `dealId: order.deal_id` needs ZERO changes (column unrenamed, Locked Decision 7A). `serializeDeal()` needs its `DealRow` type import updated but no field renames (Locked Decision 4). | 4 existing functions read the renamed schema; none were in the original Touchpoints list (which only covered ADDING new Admin* serializers here) |
| `packages/api/src/routes/coupons.ts` | `GET /coupons` handler's inline `dealId: coupon.deal_id` (line ~86) → `dealId: coupon.offer_id` (field name preserved, Locked Decision 7B) | Directly reads the renamed column; not in the original Touchpoints list |
| `packages/api/src/routes/__tests__/orders.test.ts` | ~15 existing deal-apply test cases use `schema.deals`, `schema.dealBranches`, `schema.dealProducts`, and `schema.orders.deal_id` directly (fixture inserts + assertions). Update the 3 renamed symbol references; `schema.orders.deal_id` needs ZERO changes (Locked Decision 7A). Also: this file — NOT `coupons.integration.test.ts` — is where commit `43e9c13`'s reward-coupon race test actually lives; the Phase 2 concurrency-test extension (new bulk-offer-coupon racer case) belongs here. | Existing regression suite; will fail to compile post-rename; corrects a file-location ambiguity in the original supplement note |
| `packages/api/src/routes/__tests__/deals.test.ts` | Fixture setup (`schema.deals`, `schema.dealBranches`) needs the same symbol rename. The Phase 4 checklist's "re-run unmodified" wording is corrected below — the fixtures need real changes even though assertions/response-shape stay identical | Original Phase 4 wording was inaccurate — this file cannot literally run "unmodified" post-rename |
| `packages/api/src/__tests__/branch-detail-route.test.ts` | Same symbol rename (`deals`→`offers`, `dealBranches`→`offerBranches`) in its fixture setup; asserts `GET /api/branches/:id`'s `deals` array is unchanged post-rename | Dedicated test for the newly-documented `GET /api/branches/:id` consumer (see `index.ts` row above) |

**Phase 1 mechanical safety net (added by VALIDATE):** because this enumeration was assembled by
reading the real branch rather than trusting the SPEC's pre-merge citations, Phase 1's own test
gate step now includes a repo-wide verification grep (see Implementation Checklist Phase 1, new
step) so any further consumer this pass still missed is caught mechanically before Phase 1 is
declared CODE DONE, not discovered later as a build break.

**Explicitly NOT touched (verified, stated per SPEC Constraints):**
- `packages/api/src/routes/admin/deals.ts` (ADM-004 bundle-Deal CRUD) — zero changes.
- `apps/mobile/src/app/(tabs)/rewards/coupons.tsx`, `use-my-coupons.ts`, `coupon-api.ts` — zero
  changes (SPEC Out of Scope).
- `packages/api/src/db/schema/{products,deal_components}.ts` (ADM-004 bundle-Deal schema) — zero
  changes.

---

## Public Contracts

New/changed HTTP surfaces:

| Method + Path | Auth | Request | Response | Notes |
|---|---|---|---|---|
| `GET /api/admin/promotions` | `requireAdmin` (inherited) | — | `AdminPromotion[]` | List |
| `GET /api/admin/promotions/:id` | `requireAdmin` | — | `AdminPromotion` | 404 if missing |
| `POST /api/admin/promotions` | `requireAdmin` | `{name, description?, startAt, endAt}` | `AdminPromotion` (201) | Zod-validated |
| `PATCH /api/admin/promotions/:id` | `requireAdmin` | partial | `AdminPromotion` | |
| `GET /api/admin/offers` | `requireAdmin` | `?promotionId=` optional filter | `AdminOffer[]` | |
| `GET /api/admin/offers/:id` | `requireAdmin` | — | `AdminOffer` | |
| `POST /api/admin/offers` | `requireAdmin` | `{title, description?, offerType, discountValue?, minimumOrderAmountCents, startAt, endAt, usageLimitPerUser?, totalUsageLimit?, promotionId?}` | `AdminOffer` (201) | cents at boundary; `offerType` reuses the existing 6-value enum verbatim (percentage_discount/fixed_discount/buy_one_take_one/free_item/free_upgrade/bundle) |
| `PATCH /api/admin/offers/:id` | `requireAdmin` | partial | `AdminOffer` | |
| `POST /api/admin/coupons/generate` | `requireAdmin` | `{offerId, quantity, userId?, expiresAt?}` — `quantity>=1`, `userId` only valid when `quantity===1` (single-targeted) OR omitted for bulk | `{coupons: AdminCoupon[]}` (201) | 400 on `quantity<=0`/missing `offerId` before any write (AC11) |
| `GET /api/admin/coupons?offerId=` | `requireAdmin` | query filter required | `AdminCoupon[]` | |
| `GET /deals` (repointed) | public | `?branchId=` | `ApiDeal[]` — UNCHANGED shape | Reads `offers` table now |
| `GET /api/branches/:id` (repointed, VALIDATE-added) | public | — | `{branch, deals: [...]}` — UNCHANGED shape | Previously undocumented consumer (`packages/api/src/index.ts`); reads `offers`/`offerBranches` now, same byte-identical output |
| `GET /deals/:id` (repointed) | public | — | `ApiDeal` — UNCHANGED shape | Reads `offers` table now |
| `POST /coupons/apply` (development, post-merge) | session | `{code}` | discount preview | Resolver gains offer-coupon branch; preview remains zero-write |
| `POST /orders` (development, post-merge) | session | existing body + `couponCode?` | existing | Gains `is_deal`-cart-vs-couponCode 400 guard; burn UPDATE gains `COALESCE` claim |

No breaking changes to any EXISTING public contract — `GET /deals`/`GET /deals/:id` response shape
is provably unchanged (Locked Decision 4); `GET /api/branches/:id`'s embedded `deals` array is
likewise provably unchanged (Locked Decision 7B — VALIDATE-added); `POST /coupons/apply` and
`POST /orders` request/response shapes are unchanged, only internal resolution logic gains a
branch; `GET /coupons`'s `dealId` field name is preserved (Locked Decision 7B).

---

## Blast Radius

- **Packages touched:** `packages/api` (schema, routes, admin routes, lib), `packages/types`
  (coupon/offer type renames), `packages/utils` (deletion of `deals-catalog.ts`), `apps/admin`
  (new feature folders, nav config, routes).
- **Risk class:** SCHEMA MIGRATION (rename, additive-only, non-destructive) + PUBLIC API CONTRACT
  (repoint, shape-preserving) + billing/discount-adjacent logic (coupon redemption). Per
  `orchestration.md` §High-Risk Execution Handoff, this program qualifies for the 5-artifact
  high-risk evidence pack at EXECUTE time (schema/migration class + public API class both present).
- **File count estimate:** ~9 backend files changed/renamed + 3 new backend route files + 1 new
  migration + ~4 new type files/exports + ~10 new `apps/admin` files (feature folder + routes) ≈
  27 touchpoints. This crosses the 5+ file / high-risk threshold in
  `vc-agent-strategy-compare` (S6 + S7 present) — recommend PARALLEL SUBAGENTS or AGENT TEAM for
  the eventual EXECUTE fan-out (Phase 3 admin routes + Phase 5 UI are largely independent of each
  other once Phase 1+2 land; recommend agent-team coordination between the schema/resolver
  implementer and the admin-CRUD implementer since both touch `db/schema/index.ts` and
  `routes/admin/index.ts`).
- **No new runtime surface, no new dependency, no new deploy target.**

---

## Implementation Checklist (phased — one plan file, sequenced sections)

### Phase 1 — Schema migration (blocks 2, 3, 4)

1. On the real post-merge `development` tip, run `pnpm --filter @jojopotato/api db:generate` (or
   hand-author) migration `0011_{name}.sql` — read `packages/api/drizzle/meta/_journal.json` to
   RE-confirm 0011 is still the next free slot (confirmed at PLAN time: journal ends at idx 10 =
   `0010_fearless_crystal`).
2. `deal_products`/`deal_branches` presence — CONFIRMED (no longer a verification step): both
   `packages/api/src/db/schema/deal_products.ts` and `deal_branches.ts` exist on the merged tree as
   schema files distinct from ADM-004's `deal_components.ts`. Include their rename unconditionally
   in the migration (see Locked Decision 3).
3. Write the migration SQL: `ALTER TABLE deals RENAME TO offers;`, `deal_products`/`deal_branches`
   renames (unconditional, confirmed), `coupons.deal_id`→`offer_id` rename + FK repoint,
   `coupons.user_id` nullable, new `promotions` table, `offers.promotion_id` nullable FK. After
   applying, verify `coupons_user_reward_unique` (the partial unique index from migration 0008)
   still exists via `\d coupons` — see Locked Decision 3's migration-correctness checkpoint.
4. Update `packages/api/src/db/schema/deals.ts` → rename file to `offers.ts`, update exported
   symbols (`deals`→`offers`); create `packages/api/src/db/schema/promotions.ts`; update
   `coupons.ts` (`deal_id`→`offer_id`, `user_id` nullable); update the schema barrel/index.
5. Run `pnpm --filter @jojopotato/api db:migrate` against a real local Postgres and confirm the
   migration applies cleanly with zero data loss (empty tables pre-migration on a fresh dev DB is
   fine — the correctness bar is "applies without error," not "preserves seeded rows," since
   `deals`/`coupons` are near-empty in dev).
5b. (VALIDATE-added) Update `packages/api/src/db/schema/orders.ts`'s import target (`deals`→
    `offers`, per Locked Decision 7A — column name `deal_id` stays unchanged) and
    `packages/api/src/db/seed/seed.ts`'s `seedDealsTable()`/`seedDealScopingTables()` (schema
    symbols + the two junction tables' `deal_id`→`offer_id` columns) and
    `packages/api/src/db/schema/__tests__/smoke.test.ts`'s table-name string list — see the
    VALIDATE-added Touchpoints rows for the exact per-file rename.
5c. (VALIDATE-added, mechanical safety net) Before declaring Phase 1 CODE DONE, run:
    `grep -rn "\bdeals\b\|\bdealBranches\b\|\bdealProducts\b" packages/api/src packages/types/src`
    and confirm every remaining hit is either (a) already accounted for in this plan's Touchpoints
    (including the VALIDATE-added rows), or (b) genuinely unrelated to the legacy discount `deals`
    table (e.g. ADM-004's unrelated `is_deal`/`deal_components` bundle-product feature). This closes
    the loop on VALIDATE's own enumeration in case a further consumer was still missed.
6. Test gate: `pnpm --filter @jojopotato/api typecheck` — catches every renamed-symbol import site
   across the package in one pass (this now includes the VALIDATE-added files above, since
   `tsconfig.json`'s `include` covers all of `src/`, test files included).

### Phase 2 — Resolver + burn + orders.ts guard (depends on Phase 1)

**Caution (post-merge recon finding):** `routes/orders.ts` has evolved further than the SPEC's
quoted snippet — `orders` gained a `coupon_id` column (migration 0009) and commit `490d271`
("persist consumed coupon, drop non-UUID dealId at checkout, catch wrapped code collisions")
already reworked the checkout coupon logic. EXECUTE MUST read the REAL current `routes/orders.ts`
on this branch before extending the burn UPDATE and `is_deal` guard — do not extend against the
SPEC's quoted snippet, which predates this rework. The plan's approach (Locked Decisions 2 + 6) is
unchanged; only the "read the real file first" caution is new.

7. Extend `resolveCouponDiscount()` in `routes/lib/coupon-apply.ts`: **first narrow the existing
   Branch 1 query/condition to `reward_id IS NOT NULL`** (Locked Decision 1's VALIDATE-locked fix —
   required, not optional, to avoid intercepting targeted offer-coupons), THEN after that branch,
   add a new branch matching `code` against `coupons` rows where `offer_id IS NOT NULL`, joining
   `offers` for the discount mechanic — apply the same reason-code contract
   (`expired`/`already_used`/`not_in_window`) the reward-coupon branch already uses. Return the
   matched coupon's `id` as `rewardCouponId` (reused field name — the burn path in `orders.ts` is
   generic over any coupon-row source) so the existing atomic burn UPDATE consumes it unchanged.
7b. (VALIDATE-added) Update `packages/api/src/routes/coupons.ts`'s `GET /coupons` handler
    (`dealId: coupon.deal_id` → `dealId: coupon.offer_id`, field name preserved) and
    `packages/api/src/routes/lib/serializers.ts`'s `serializeCoupon()`/`serializeCouponWithLabel()`
    (same field-preserved, column-renamed pattern) — see Locked Decision 7B and the VALIDATE-added
    Touchpoints rows.
8. Remove the static `DEAL_CATALOG` branch. Search-scan the repo for any other importer of
   `packages/utils/src/deals-catalog.ts` before deleting; delete only if zero other importers
   found (Locked Decision 6's Phase-1-verification contingency), else leave dead + write a
   backlog note.
9. In `routes/orders.ts`: extend the coupon burn `UPDATE` to
   `SET status='used', user_id=COALESCE(user_id,$requester) WHERE id=... AND status='available' AND
   (user_id IS NULL OR user_id=$requester)`.
10. In `routes/orders.ts`: extend the existing `dealId`-XOR-`couponCode` 400 guard — before any
    write, if `couponCode` is present AND any cart line's `productId` resolves to a `products` row
    with `is_deal=true`, throw the existing 400 error class with a clear reason
    (`"Coupon codes cannot be combined with Deal products"` or similar). Rename dormant
    `deal_id`-guard code comments to `offer_id` terminology in the same pass.
11. Test gate (Fully-Automated): extend `coupons.integration.test.ts` (or the SPEC-cited
    equivalent) with an Offer-coupon apply+order+re-apply-after-use case (AC5) — including a
    TARGETED (user_id-set) offer-coupon case that exercises the Locked Decision 1 Branch-1 fix
    directly (this is the concrete regression test for the bug VALIDATE found); add the
    `is_deal`-cart+couponCode 400 case (AC6); re-run full suite for reward-coupon regression (AC8).
    (VALIDATE correction) The concurrency race-test extension lives in
    `routes/__tests__/orders.test.ts` (commit `43e9c13`'s file), not `coupons.integration.test.ts`
    — see the VALIDATE-added Touchpoints row for that file.

### Phase 3 — Admin CRUD routes (depends on Phase 1; parallel-safe with Phase 4)

12. Create `packages/api/src/routes/admin/promotions.ts` — full CRUD, Zod schemas, reuse
    `AdminApiError`/`handleAdminError`/`isUniqueViolation` from `admin/lib/errors.ts`.
13. Create `packages/api/src/routes/admin/offers.ts` — full CRUD, `centsToNumeric` boundary
    serialization for `discountValue`/`minimumOrderAmountCents`, optional `promotionId` FK
    validation (404 if referenced promotion doesn't exist).
14. Create `packages/api/src/routes/admin/coupons.ts` — `POST /generate` (bulk or single-targeted
    per the `quantity`/`userId` contract above), reusing the collision-safe code-generator pattern
    (parameterized prefix); `GET /?offerId=` list. Reject `quantity<=0` or missing `offerId` with
    400 BEFORE any DB write (AC11) — validate the whole batch request with Zod first, then loop.
15. Append 3 new `.use()` lines to `routes/admin/index.ts` (promotions, offers, coupons) —
    append-only, no restructuring of existing lines.
16. Add `AdminPromotion`/`AdminOffer`/`AdminCoupon` types + serializers to
    `routes/lib/serializers.ts` following the existing `AdminBranch`/`AdminDealProduct` local-
    declaration convention.
17. Test gate (Fully-Automated): 3 new integration test files
    (`admin-promotions.integration.test.ts`, `admin-offers.integration.test.ts`,
    `admin-coupon-issuance.integration.test.ts`) using the `makeUser(role)` fixture — cover AC1,
    AC2, AC3 (incl. forced-collision retry unit test on the generator), AC4, AC9 (403 no-auth/
    wrong-role cases across all 3 files).

### Phase 4 — Public GET /deals repoint (depends on Phase 1; parallel-safe with Phase 3)

18. In `routes/deals.ts`, swap the Drizzle table import from `deals`/`dealBranches`/`dealProducts`
    to `offers`/`offerBranches`/`offerProducts` (all three symbols this file imports, not just
    one); verify `serializeDeal`/`ApiDeal` require zero field changes (Locked Decision 4).
18b. (VALIDATE-added) Apply the same rename in `packages/api/src/index.ts`'s
    `GET /api/branches/:id` handler (Query A/Query B against `deals`/`dealBranches`) — see the
    VALIDATE-added Touchpoints row. Response shape (`deals: [...]`) stays byte-identical
    (Locked Decision 7B).
19. Test gate (Fully-Automated): re-run `deals.test.ts` and `__tests__/branch-detail-route.test.ts`
    — **(VALIDATE correction)** these are NOT run "unmodified": their fixture setup directly uses
    `schema.deals`/`schema.dealBranches` and needs the same symbol rename as the route files. What
    stays unmodified is the ASSERTIONS — response shape is byte-identical pre/post rename (AC10 for
    `deals.test.ts`; AC10b — VALIDATE-added — for `branch-detail-route.test.ts`).

### Phase 5 — apps/admin UI (depends on Phase 3)

20. Add `nav-config.ts` entries: "Promotions" (`/promotions`) and "Offers" (`/offers`) under
    "Management" — verify neither label collides with the existing "Deals" nav item.
21. Build `apps/admin/src/features/promotions/**`: list + create/edit `form-dialog`, reusing
    `data-table`/`confirm-dialog`/`query-states`/`page-header`.
22. Build `apps/admin/src/routes/(dashboard)/promotions.tsx` (thin `<Outlet/>` layout) +
    `promotions.index.tsx` (list) — apply the P3 nested-detail-route pattern from session start.
23. Build `apps/admin/src/features/offers/**`: list + create/edit dialog + detail page with a
    "Generate Coupons" action (quantity input, optional single-customer picker, optional expiry
    override) + a coupon list sub-view (code, status, user if targeted, expires_at) — copyable/
    exportable per SPEC.
24. Build `apps/admin/src/routes/(dashboard)/offers.tsx` + `offers.index.tsx` +
    `offers.$offerId.tsx` — same layout+index+detail split.
25. Test gate: `apps/admin` vitest + `@testing-library/react` component tests for the new
    list/dialog components (Fully-Automated where DOM-testable); Agent-Probe manual walkthrough
    for the full create-Promotion → create-Offer → generate-coupons → view-list flow (mirrors P3's
    AC8 pattern).

---

## Acceptance Criteria

This plan carries the SPEC's 11 acceptance criteria verbatim (full text, `proven by`, and
`strategy` for each lives in
`process/features/admin-dashboard/active/adm-008-coupons_16-07-26/adm-008-coupons_SPEC_16-07-26.md`
§Acceptance Criteria). Summary, mapped to the phase that delivers each:

| AC | Summary | Delivered by phase |
|---|---|---|
| AC1 | Admin can create a Promotion (name, description, window) | Phase 3 |
| AC2 | Admin can create an Offer (mechanic, value, min order, caps, window, optional Promotion link) | Phase 3 |
| AC3 | Admin can bulk-generate N coupon codes, zero collisions (incl. forced-collision retry) | Phase 3 |
| AC4 | Admin can issue a single targeted coupon to one customer | Phase 3 |
| AC5 | Customer redeems a valid admin-issued coupon; discount applies; code marked used exactly once | Phase 2 |
| AC6 | Cart with an `is_deal` product rejects coupon application (400) | Phase 2 |
| AC7 | Expired/used/out-of-window coupon rejected with correct reason code | Phase 2 (regression-extended) |
| AC8 | Reward-backed coupons keep working unmodified (regression) | Phase 2 (regression gate) |
| AC9 | All Promotion/Offer/coupon-issuance admin actions require admin auth (403 otherwise) | Phase 3 |
| AC10 | Rename does not break legacy public `GET /deals`/`GET /deals/:id` mobile-facing reads | Phase 4 |
| AC10b (VALIDATE-added) | Rename does not break `GET /api/branches/:id`'s embedded `deals` array (a previously undocumented 4th consumer of the renamed tables) | Phase 4 |
| AC11 | Malformed/empty coupon-generation request rejected 400 before any write | Phase 3 |

Every AC above is proven by a Fully-Automated test (see Verification Evidence table below) except
the UI usability walkthrough, which is Agent-Probe. No AC is left on Known-Gap.

## Phase Completion Rules

A phase is **CODE DONE** when its checklist steps are implemented and its own Phase test gate
(named in the Implementation Checklist) passes locally. A phase is **VERIFIED** only when:

1. Its own test gate is green AND
2. The full `pnpm --filter @jojopotato/api test` regression suite is green (proves no earlier
   phase or pre-existing surface — especially reward-coupon redemption, AC8 — broke) AND
3. `pnpm --filter @jojopotato/api typecheck` is clean across the whole package (catches renamed-
   symbol import sites Phase 1 introduces, which later phases and untouched files may still
   reference under the old names) AND
4. For Phase 5 (apps/admin UI): `pnpm --filter @jojopotato/admin typecheck` and
   `pnpm --filter @jojopotato/admin test` are both green.

Phase dependency order (see Blast Radius): Phase 1 blocks Phases 2/3/4. Phases 3 and 4 are
parallel-safe once Phase 1 lands. Phase 5 depends on Phase 3. Phase 2 has no hard dependency on
Phase 3/4 completion but should land before Phase 5's "Generate Coupons" UI is meaningfully
testable end-to-end.

No phase may be marked VERIFIED without both its own evidence and the regression evidence above —
code-only completion is CODE DONE, not VERIFIED.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `admin-promotions.integration.test.ts` — create/list/get | Fully-Automated | AC1 |
| `admin-offers.integration.test.ts` — create with/without promotion link | Fully-Automated | AC2 |
| `admin-coupon-issuance.integration.test.ts` — bulk N=50, assert 50 unique rows | Fully-Automated | AC3 |
| forced-collision unit test on code-generator retry path | Fully-Automated | AC3 |
| `admin-coupon-issuance.integration.test.ts` — targeted single-issue, `user_id` set | Fully-Automated | AC4 |
| `coupons.integration.test.ts` extended — Offer-coupon apply preview + order placement + re-apply-after-use rejection | Fully-Automated | AC5 |
| `orders.integration.test.ts` (or equivalent) — `is_deal` cart line + `couponCode` set → 400 | Fully-Automated | AC6 |
| `coupons.integration.test.ts` reason-code assertions extended to Offer-coupons | Fully-Automated | AC7 |
| full `coupons.integration.test.ts` suite re-run, zero diffs | Fully-Automated | AC8 (regression) |
| `admin-promotions`/`admin-offers`/`admin-coupon-issuance` — no-auth (403) + wrong-role (403) cases | Fully-Automated | AC9 |
| `deals.test.ts`-equivalent regression suite re-run post-rename, response shape unchanged | Fully-Automated | AC10 |
| `__tests__/branch-detail-route.test.ts` re-run post-rename, response shape unchanged | Fully-Automated | AC10b (VALIDATE-added) |
| `coupons.integration.test.ts` — TARGETED (user_id-set) offer-coupon redemption case (proves Locked Decision 1's Branch-1 fix) | Fully-Automated | AC5 (Branch-1 collision regression) |
| `admin-coupon-issuance.integration.test.ts` — `quantity<=0` / missing `offerId` → 400, zero rows written | Fully-Automated | AC11 |
| Agent-Probe: full admin walkthrough (create Promotion → create Offer → Generate Coupons bulk + single-targeted → view list → copy code) | Agent-Probe | AC1-AC4, AC-UI (no numbered AC — UI usability) |
| `pnpm --filter @jojopotato/api typecheck` | Fully-Automated | Renamed-symbol regression guard (all touchpoints) |
| `pnpm --filter @jojopotato/admin typecheck` + `pnpm --filter @jojopotato/admin test` | Fully-Automated | New UI components compile + render |
| `pnpm --filter @jojopotato/api test` (full suite) | Fully-Automated | AC8 regression bar + overall zero-regression check |

**Test commands (exact, from `process/context/tests/all-tests.md`):**
```
pnpm --filter @jojopotato/api test          # needs: docker compose up -d && pnpm --filter @jojopotato/api db:migrate first
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/admin lint
```

**Known-Gap ban compliance:** every money-correctness AC (AC3, AC5, AC6, AC11) is assigned
Fully-Automated with a real passing test, per the SPEC's explicit "Known-Gap BANNED, mirror ADM-004a
AC9 / ADM-003 AC1 bar" instruction and the vacuous-green ban in this harness's PLAN protocol. No
developed behavior in this plan is left on Known-Gap alone.

**Concurrency test (explicit, Security-persona-flagged in INNOVATE) — EXTEND, don't duplicate:**
post-merge recon confirms commit `43e9c13` ("test coupon race concurrently") already added a
coupon-redemption race test on `development`. Phase 2 must EXTEND/RECONCILE that existing test
with a NEW case, not author a fresh one from scratch: the claim-on-redeem
`UPDATE ... WHERE status='available' AND (user_id IS NULL OR user_id=$requester)` for a bulk
(`user_id IS NULL`) code needs its own two-racer case — two simultaneous requests racing to
claim+burn the SAME bulk code, asserting exactly one succeeds (200) and one gets the existing
`already_used` rejection. Add this as a new case alongside the existing `43e9c13` race test (same
file, using the same `Promise.all([...])` pattern against two concurrent supertest requests) —
this remains a hard requirement, just reframed as an extension of prior work rather than new
authorship.

---

## Test Infra Improvement Notes

(none identified yet)

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/adm-008-coupons_PLAN_16-07-26.md`
2. **Last completed phase or step:** VALIDATE — this file's `## Validate Contract` section below is
   now the real, filled contract (was a placeholder). EXECUTE has not started.
3. **Validate-contract status:** written below, `generated-by: outer-pvl`, `Gate: CONDITIONAL`.
4. **Supporting context files loaded this session:**
   - `process/context/all-context.md` (admin-dashboard ADM-004 pivot details, append-only
     aggregator pattern, cents convention)
   - `process/context/tests/all-tests.md` (test commands)
   - SPEC: `adm-008-coupons_SPEC_16-07-26.md` (this task folder)
   - Real, current (not SPEC-cited) reads of every file this plan touches or was found to touch
     during VALIDATE — see the VALIDATE-added Touchpoints rows and Locked Decision 7 for the full
     list (`db/schema/{deals,coupons,deal_products,deal_branches,deal_components,products,orders,
     index}.ts`, `routes/{deals,orders,coupons}.ts`, `routes/lib/{coupon-apply,serializers}.ts`,
     `routes/admin/{index,lib/errors}.ts`, `db/seed/seed.ts`, `packages/types/src/{coupons,deals,
     order}.ts`, `apps/admin/src/config/nav-config.ts`, and the existing test files enumerated in
     the VALIDATE-added Touchpoints rows).
5. **Next step for a fresh agent picking up mid-execution:**
   - Read the `## Validate Contract` section below in full, including Locked Decision 1's Branch-1
     resolver fix and Locked Decision 7's rename inventory — both are load-bearing for Phase 1/2/4.
   - Proceed to EXECUTE starting at Phase 1 (schema migration, `0011_{name}.sql`), using the
     VALIDATE-expanded checklist steps (5b/5c added to Phase 1; 7b added to Phase 2; 18b added to
     Phase 4).

## Inner Loop Refresh Note

**Date:** 16-07-26

Post-merge reconciliation supplement (PLAN-SUPPLEMENT mode, 6 deltas applied against the real
merged tree — `feat/adm-004-deals` merged into `development` via PR #92):

1. **Migration number resolved to 0011** (concrete, confirmed via `drizzle/meta/_journal.json` —
   journal ends at idx 10 = `0010_fearless_crystal`) — Locked Decision 3 + Phase 1 step 1 updated.
2. **`deal_products`/`deal_branches` existence CONFIRMED** (both present as schema files distinct
   from ADM-004's `deal_components`) — the Phase 1 step 2 conditional verification is now a
   confirmed inclusion; Locked Decision 3's migration SQL includes their renames unconditionally.
3. **`orders.ts` evolution caution added** to Phase 2 — the file has moved past the SPEC's quoted
   snippet (new `coupon_id` column, commit `490d271` coupon-checkout rework); EXECUTE must read the
   real current file, not the SPEC's citation.
4. **Concurrency race test reframed as EXTEND, not duplicate** — commit `43e9c13` already added a
   coupon race test; Phase 2 must add the new bulk-claim-on-redeem case alongside it, not author a
   fresh test file.
5. **`coupons_user_reward_unique` index preservation** made an explicit migration-correctness
   checkpoint in Locked Decision 3 and Phase 1 step 3 — verify it survives the nullable-`user_id`
   and `deal_id`→`offer_id` rename changes.
6. **Hard Precondition section rewritten** from BLOCKED to RESOLVED/READY FOR VALIDATE — the merge
   landed (PR #92), both requirements (`is_deal`+`deal_components` and the coupon backend) are
   confirmed present on the current branch; build-health note (stale workspace links fixed via
   `pnpm install`, both typechecks green) added.

No new phases, no re-architecture — all 5 original Locked Decisions and the 5-phase structure are
unchanged by this note. (VALIDATE, run after this note, added Locked Decision 7 and a Branch-1
resolver fix inside Locked Decision 1 — see `## Validate Contract` below; those are VALIDATE
findings, not a further plan-supplement cycle.)

---

## Validate Contract

Status: CONDITIONAL
Date: 16-07-26
date: 2026-07-16
generated-by: outer-pvl

Parallel strategy: sequential (single-plan VALIDATE fan-out was run via read-only source
inspection in one session — Layer 1 dimensions + Layer 2 per-phase feasibility below; no
multi-agent spawn was needed since every fork was resolvable by reading real, already-merged
source on this branch, per the task's own "just read it" instruction)
Rationale: 0 signals present for parallel/team escalation (single plan, no phase-program, no
5+ blast-radius-package spread beyond what one focused read-through covers) — sequential
read-and-synthesize was the right-sized strategy for this VALIDATE pass.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Admin creates a Promotion | Fully-Automated | `admin-promotions.integration.test.ts` — create/list/get | A |
| AC2 | Admin creates an Offer | Fully-Automated | `admin-offers.integration.test.ts` — create with/without promotion link | A |
| AC3 | Bulk-generate N coupon codes, zero collisions | Fully-Automated | `admin-coupon-issuance.integration.test.ts` — bulk N=50 unique + forced-collision retry unit test | A |
| AC4 | Single targeted coupon issuance | Fully-Automated | `admin-coupon-issuance.integration.test.ts` — targeted single-issue, `user_id` set | A |
| AC5 | Customer redeems valid admin-issued coupon; discount applies; code marked used once | Fully-Automated | `coupons.integration.test.ts` — Offer-coupon apply+order+re-apply-after-use, PLUS a new TARGETED-coupon case proving the Locked Decision 1 Branch-1 fix | B (fix specified this VALIDATE pass; test added by Phase 2 checklist step 11) |
| AC6 | Cart with `is_deal` product rejects coupon (400) | Fully-Automated | `orders.integration.test.ts`-equivalent — `is_deal` cart line + `couponCode` → 400 | A |
| AC7 | Expired/used/out-of-window coupon rejected with correct reason | Fully-Automated | `coupons.integration.test.ts` reason-code assertions extended | A |
| AC8 | Reward-backed coupons keep working unmodified (regression) | Fully-Automated | full `coupons.integration.test.ts` suite re-run | A |
| AC9 | Admin auth required (403 otherwise) | Fully-Automated | 3 new admin integration files' no-auth/wrong-role cases | A |
| AC10 | `GET /deals`/`GET /deals/:id` rename-safe | Fully-Automated | `deals.test.ts` re-run (fixtures updated, assertions unchanged) | B (fixture-update scope corrected this VALIDATE pass) |
| AC10b | `GET /api/branches/:id` rename-safe (VALIDATE-added — previously undocumented consumer) | Fully-Automated | `__tests__/branch-detail-route.test.ts` re-run (fixtures updated, assertions unchanged) | B (touchpoint + test added this VALIDATE pass) |
| AC11 | Malformed/empty coupon-generation request → 400 before any write | Fully-Automated | `admin-coupon-issuance.integration.test.ts` — `quantity<=0`/missing `offerId` → 400, zero rows | A |
| — | Full-package regression + no orphaned symbol imports | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` (now covers the VALIDATE-added files — `tsconfig.json` includes all of `src/`) + `pnpm --filter @jojopotato/api test` (full suite) | A |
| — | `apps/admin` UI compiles/renders | Fully-Automated | `pnpm --filter @jojopotato/admin typecheck` + `pnpm --filter @jojopotato/admin test` | A |
| — | Full admin walkthrough (create Promotion → create Offer → Generate Coupons → view list → copy code) | Agent-Probe | Manual walkthrough per Phase 5 checklist step 25 | D (named residual — UI usability judgment, not money-correctness; not bankable as Known-Gap for AC1-4 themselves since those have real Fully-Automated coverage above) |

gap-resolution legend: A — proven now (gate passes in this cycle, once EXECUTE lands). B — fixed
in this plan (gate added/corrected by this VALIDATE pass's plan-text edits, to be exercised by
EXECUTE). C — deferred to a named later phase/plan. D — backlog test-building stub / residual.

C-4 reconciliation: no `strategy:` cell above is `Known-Gap` — every developed money-correctness
behavior (AC1–AC11, AC10b) is proven by a real Fully-Automated test. The single Agent-Probe row is
a UI-usability judgment call layered ON TOP of already-automated AC1-4 coverage, not a substitute
for it — this is not a vacuous-green pattern.

Legacy line form (retained for existing consumers):
- Schema/migration correctness: Fully-automated: `pnpm --filter @jojopotato/api db:migrate` (Phase 1) + `pnpm --filter @jojopotato/api typecheck`
- Resolver/burn/orders.ts guard: Fully-automated: `pnpm --filter @jojopotato/api test` (extended `coupons.integration.test.ts` + `orders.test.ts`)
- Admin CRUD (Promotions/Offers/Coupons): Fully-automated: 3 new integration test files, `makeUser(role)` fixture pattern (5 real precedents on this branch)
- Public `GET /deals` + `GET /api/branches/:id` repoint: Fully-automated: `deals.test.ts` + `branch-detail-route.test.ts` re-run
- apps/admin UI: Fully-automated: `pnpm --filter @jojopotato/admin typecheck` + `test`; agent-probe: full walkthrough

Dimension findings:
- Infra fit: PASS — no new runtime surface, no new deploy target; append-only admin aggregator
  pattern (`adminRouter.use('/promotions', ...)` etc.) is mechanically confirmed sound against 4
  real prior consumers (branches/products+categories/deals) on this exact branch.
- Test coverage: CONCERN (resolved via plan update this pass) — test commands verified exact
  against `process/context/tests/all-tests.md`; original plan under-scoped which existing test
  files (`orders.test.ts`, `deals.test.ts`, `branch-detail-route.test.ts`, `smoke.test.ts`) need
  updating for the rename — all 4 are now explicit Touchpoints/checklist items.
- Breaking changes: CONCERN (resolved via plan update this pass) — found a 4th, previously
  undocumented live public consumer of the `deals`/`dealBranches` tables
  (`GET /api/branches/:id` in `packages/api/src/index.ts`, distinct from `routes/deals.ts` and
  `routes/branches.ts`) with its own dedicated test; found the `orders.deal_id` FK the original
  Touchpoints list missed (migration 0006); both now covered — Locked Decision 7 + new
  Touchpoints/Public-Contracts/AC rows. No actual wire-contract break found once Locked Decision
  7B's "preserve field names, rename only internal columns" rule is applied (verified: no
  `apps/mobile` consumer reads `.dealId` off a fetched coupon, so `GET /coupons`'s shape is
  runtime-safe either way; `POST /orders`'s `dealId` field is untouched since `orders.deal_id`
  stays unrenamed).
- Security surface: PASS — `requireAdmin` inheritance via the single append-only mount point
  (`packages/api/src/index.ts`'s `app.use('/api/admin', cors(...), requireAdmin(auth), adminRouter)`)
  confirmed mechanically sound; claim-on-redeem atomic UPDATE (`COALESCE(user_id, $requester)` +
  `status='available'` guard) is a sound, race-safe single-statement design, consistent with the
  existing reward-coupon burn pattern; nav-config.ts "Deals" collision-avoidance requirement
  confirmed correct against the real current file (existing item at `id:'deals'`, `to:'/deals'`).
- Phase 1 (schema migration): CONCERN (resolved via plan update) — migration slot 0011 confirmed
  correct via real `_journal.json` read; `coupons_user_reward_unique` partial-index survival
  reasoning confirmed sound (scoped to `reward_id IS NOT NULL`, unaffected by the changes here).
  Gap found: `orders.deal_id`'s FK to `deals` (migration 0006) was not enumerated in the original
  Locked Decision 3 / Touchpoints — fixed via Locked Decision 7A (column stays unrenamed, only the
  schema file's import target changes — zero new SQL needed).
- Phase 2 (resolver + burn + orders.ts guard): CONCERN (resolved via plan update) — real,
  code-verified logic bug: the existing reward-coupon Branch 1 in `resolveCouponDiscount()` isn't
  scoped to `reward_id IS NOT NULL`, so a targeted offer-coupon would incorrectly match it first and
  be rejected with the wrong reason (`no_eligible_product`, verified via `checkRewardEligibility`'s
  null-reward handling — not a crash, but a wrong 400). Fixed via a locked amendment to Locked
  Decision 1 plus a new required regression test (targeted-coupon case) in Phase 2's checklist. Also
  found `routes/orders.ts`'s dormant ~100-line deal-apply block (lines ~221-322 on the real branch)
  was drastically under-scoped by the original "rename dormant comments" wording — now precisely
  specified via Locked Decision 7A (rename `deals`/`dealBranches`/`dealProducts` symbols and their
  junction `.deal_id`→`.offer_id` columns; `orders.deal_id` itself stays unrenamed).
- Phase 3 (admin CRUD routes): PASS — append-only aggregator + `AdminApiError`/`handleAdminError`/
  `isUniqueViolation` reuse both confirmed available and stable; `makeUser(role)` local-fixture
  convention confirmed real across 5 existing integration test files (copy-pasteable, no shared
  fixture module needed).
- Phase 4 (public GET /deals repoint): CONCERN (resolved via plan update) — `routes/deals.ts`'s
  rename is mechanically sound but the plan only mentioned "the underlying Drizzle table import"
  singular where 3 symbols (`deals`/`dealBranches`/`dealProducts`) need renaming; more importantly,
  found the sibling `GET /api/branches/:id` consumer (see Breaking changes above) entirely missing
  from this phase's original scope — both fixed via new checklist steps 18/18b/19 and AC10b.
- Phase 5 (apps/admin UI): PASS — nav-config.ts collision check mechanically verified against the
  real current file; existing shared composites (`data-table`/`form-dialog`/`confirm-dialog`/
  `query-states`/`page-header`) confirmed available per the ADM-004a Phase 3/4a precedent; the
  TanStack Start nested-detail-route `<Outlet/>` gotcha is correctly anticipated (layout+index+
  detail split pattern already locked in the Touchpoints table).

Open gaps: none carried as Known-Gap — all findings above were resolved by direct plan-text edits
in this VALIDATE pass (new Touchpoints rows, Locked Decision 7, the Locked Decision 1 amendment,
and checklist steps 5b/5c/7b/18b, plus AC10b + its test row). Residual risk is normal
pre-EXECUTE risk (the fixes are specified but not yet exercised by a passing test) — this is why
the gate is CONDITIONAL rather than PASS, not because any gap was left undocumented or deferred.

What this coverage does NOT prove:
- The Fully-Automated test gates above prove correctness once EXECUTE implements them; VALIDATE
  itself did not run any test (no code was changed except this plan file) — the Branch-1 resolver
  fix and the rename inventory are read-verified against real source, not yet proven by a green
  test run.
- The Agent-Probe walkthrough (Phase 5) does not prove money correctness — that is fully covered by
  the Fully-Automated AC1-4/9/11 tests above; the walkthrough only covers UI usability judgment.
- VALIDATE's Phase 1 mechanical safety-net grep (checklist step 5c) narrows but does not
  mathematically guarantee zero remaining missed consumers of `deals`/`dealBranches`/
  `dealProducts` outside `packages/api`/`packages/types` — `apps/admin`'s and `apps/mobile`'s own
  `dealId`/`deals` hits were manually reviewed this pass and confirmed to be the UNRELATED ADM-004
  bundle-product feature (`is_deal`, route-param naming), not the legacy discount table, but this
  is a targeted read, not an exhaustive apps/* grep-gate.

Gate: CONDITIONAL (0 unresolved FAILs; all CONCERNs found this pass were resolved via direct plan
updates in this same VALIDATE session — see Dimension findings above; residual risk is normal
pre-EXECUTE unproven-until-tested risk, not an accepted known gap)
Accepted by: session (autonomous, single-shot VALIDATE pass) — every CONCERN above was closed by a
concrete plan-text fix (Locked Decision 1 amendment, Locked Decision 7, new Touchpoints/Public
Contracts/Acceptance Criteria/Verification Evidence rows, and checklist steps 5b/5c/7b/18b) rather
than left as an accepted gap; the only thing "accepted" is that these fixes are unit-of-work for
EXECUTE to implement and prove, which is why the gate is CONDITIONAL and not a bare PASS.

## Autonomous Goal Block

SESSION GOAL: Ship ADM-008 — admin-authored Promotions/Offers/Coupon-codes, replacing the static
`DEAL_CATALOG` with real DB-backed, burnable coupon rows, reusing the existing reward-coupon burn
mechanism and the append-only admin-CRUD aggregator pattern.
Charter + umbrella plan: N/A — single plan (admin-dashboard's 8-phase program covers ADM-001..007;
this is a standalone follow-on plan, not one of that program's named phases).
Autonomy: standard /goal autonomous execution rules — CONDITIONAL findings apply fixes and proceed;
BLOCKED items go to backlog + continue; irreversible/outward-facing actions without explicit
contract instruction are a hard stop.
Hard stop conditions / safety constraints:
- Never edit an already-applied migration file (0011 is new; 0000-0010 are locked history).
- Never rename/repoint `GET /deals`/`GET /deals/:id`/`GET /api/branches/:id`'s response SHAPE — only
  their internal table symbols rename (Locked Decision 4 + 7B).
- Never let a bulk (`user_id IS NULL`) coupon and a targeted (`user_id` set) coupon double-claim —
  the atomic `UPDATE ... WHERE status='available' AND (user_id IS NULL OR user_id=$requester)` is
  the single source of truth; no parallel burn path.
- The Locked Decision 1 Branch-1 resolver fix (`reward_id IS NOT NULL` scoping) is REQUIRED before
  AC5 can pass — do not implement the resolver extension without it.
- High-risk evidence pack required before finalize (schema migration + public API + billing/discount
  logic — per `orchestration.md` §High-Risk Execution Handoff).
Next phase: EXECUTE — start at Phase 1 (schema migration, `0011_{name}.sql`), following the
VALIDATE-expanded Implementation Checklist (steps 5b/5c added to Phase 1; 7b added to Phase 2; 18b
added to Phase 4).
Validate contract: inline in this plan file, section above.
Execute start: `pnpm --filter @jojopotato/api db:generate` (Phase 1 step 1) | E2E spec: none new
(reuses existing integration-test harness) | probe scenario: Phase 5 checklist step 25 (full admin
walkthrough) | high-risk pack: yes (schema migration + public API + billing/discount-adjacent logic)
