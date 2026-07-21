---
name: report:adm-008-coupons-phase-01-schema-migration
description: "ADM-008 Coupons Phase 01 EXECUTE report — deals→offers atomic rename + promotions table (migration 0013, originally generated as 0011)"
date: 16-07-26
metadata:
  node_type: memory
  type: report
  feature: admin-dashboard
  phase: phase-01
---

# Phase 01 — Schema Migration — EXECUTE Report

**Status:** COMPLETE (all exit gates green). Not committed — commit handed to user per commit-per-phase policy.
**Branch:** feat/adm-008-coupons
**Plan:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-01-schema-migration_PLAN_16-07-26.md

## What Was Done

Atomic, non-destructive `deals`→`offers` rename + new `promotions` foundation, executed at the
Option-A expanded scope (schema + hand-authored migration + all consumer repoints so the build
and full test suite stay green).

- **Migration `0013_rename_deals_to_offers.sql`** (originally generated as 0011, renumbered to 0013
  in the PR #93 merge; hand-authored — `db:generate` NOT trusted for
  renames per the Drizzle hardening rules). RENAME + additive only, zero `DROP TABLE`/`DROP COLUMN`.
- **Schema files:** `deals.ts`→`offers.ts` (+ `promotion_id` FK), `deal_products.ts`→`offer_products.ts`
  (`deal_id`→`offer_id`), `deal_branches.ts`→`offer_branches.ts` (`deal_id`→`offer_id`),
  new `promotions.ts`, `coupons.ts` (`deal_id`→`offer_id`, `user_id` nullable), `orders.ts`
  (import target only — `orders.deal_id` column name unchanged, LD7A), barrel `index.ts`.
- **Consumer repoints (mechanical, wire-preserving)** — the 7 planned Step-C7 files:
  `src/index.ts`, `routes/deals.ts`, `routes/orders.ts`, `routes/lib/serializers.ts`,
  `__tests__/branch-detail-route.test.ts`, `routes/__tests__/orders.test.ts`,
  `routes/__tests__/deals.test.ts` — PLUS two deviation files (see Plan Deviations):
  `routes/coupons.ts` and `packages/types/src/coupons.ts`.
- **Downstream fixups (Step E):** `db/seed/seed.ts` symbols/columns, `schema/__tests__/smoke.test.ts`
  table-name list.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| D1/D2 migrate | `pnpm --filter @jojopotato/api db:migrate` | **PASS** — `[✓] migrations applied successfully!`, 0 errors |
| F1 typecheck | `pnpm --filter @jojopotato/api typecheck` (`tsc --noEmit`) | **PASS** — `TYPECHECK_EXIT=0` |
| F2 full suite | `pnpm --filter @jojopotato/api test` | **PASS** — `Test Files 22 passed (22) / Tests 271 passed (271)`, 0 regressions |
| D3 index survival | `pg_indexes` on freshly full-migrated `jojopotato_test` | **PASS** (see below) |
| D4 row-count preservation | pre/post counts on `jojopotato` | **PASS** (see below) |
| E3 safety-net grep | `grep -rn "\bdeals\b\|\bdealBranches\b\|\bdealProducts\b" ...` | **PASS** — all hits accounted for (see below) |

### D3 — `coupons_user_reward_unique` survival (authoritative check)

The dev DB `jojopotato` could not authoritatively prove D3 (its migration 0008 was never physically
applied — pre-existing corruption, see Test Infra Gaps). The authoritative check ran on
`jojopotato_test`, which the test-suite `globalSetup` DROPs + reCREATEs + migrates 0000→0011 in
order every run:

```
$ psql ... -d jojopotato_test -c "SELECT indexdef FROM pg_indexes WHERE indexname='coupons_user_reward_unique';"
CREATE UNIQUE INDEX coupons_user_reward_unique ON public.coupons USING btree (user_id, reward_id) WHERE (reward_id IS NOT NULL)
```

Partial predicate `WHERE (reward_id IS NOT NULL)` intact (LD3). Also confirmed on that fresh DB:
`offers`/`offer_products`/`offer_branches`/`promotions` present, `deals`/`deal_products`/`deal_branches`
gone, `coupons.offer_id` present + `coupons.user_id` nullable, `offers.promotion_id` present,
`orders.deal_id` still present (LD7A).

### D4 — Row-count preservation (rename-not-destroy), dev DB `jojopotato`

| Table (pre → post) | Pre-migration | Post-migration | Verdict |
|---|---|---|---|
| deals → offers | 6 | 6 | PASS |
| deal_products → offer_products | 5 | 5 | PASS |
| deal_branches → offer_branches | 1 | 1 | PASS |

A drop+create would have zeroed these; the RENAME preserved every row. (0==0 was not the case here —
real rows were preserved, giving a stronger signal than a fresh-DB trivial pass.)

### E3 — Safety-net grep classification

Remaining `\bdeals\b`/`\bdealBranches\b`/`\bdealProducts\b` hits fall into 5 accounted-for buckets
(F1 typecheck=0 + F2=271 pass independently confirm zero broken symbol references):

1. **Comments/docstrings** mentioning "deals" (harmless prose across schema/route/seed files).
2. **Wire-frozen HTTP surface** (LD4/LD7B) — the `GET /deals`/`GET /deals/:id` route paths, the
   `dealsRouter` variable/file name, the `app.use('/deals', ...)` mount, and the `{ deals: [...] }` /
   `json.deals` response-envelope field. These are the public contract and MUST stay named `deals`.
3. **ADM-004 deals-as-products (unrelated feature):** `routes/admin/deals.ts`, `admin/index.ts`
   `dealsRouter`, `admin-deals.integration.test.ts`, `deal_components`, `is_deal`,
   `DEALS_CATEGORY_SLUG='deals'`, `serializeAdminDealProduct`.
4. **Frozen wire types:** `packages/types/src/deals.ts` (`ApiDeal`) + `packages/types/src/index.ts`
   `export * from './deals'`.
5. **Deliberate test aliases:** `branch-detail-route.test.ts` local `let deals: SchemaModule['offers']`
   / `let dealBranches: SchemaModule['offerBranches']` (aliased bindings to the renamed symbols;
   `.offer_id` used for the column). Minimal-diff choice; functionally the renamed symbols.

## Final 0011 SQL

```sql
ALTER TABLE "deals" RENAME TO "offers";--> statement-breakpoint
ALTER TABLE "deal_products" RENAME TO "offer_products";--> statement-breakpoint
ALTER TABLE "offer_products" RENAME COLUMN "deal_id" TO "offer_id";--> statement-breakpoint
ALTER TABLE "deal_branches" RENAME TO "offer_branches";--> statement-breakpoint
ALTER TABLE "offer_branches" RENAME COLUMN "deal_id" TO "offer_id";--> statement-breakpoint
ALTER TABLE "coupons" RENAME COLUMN "deal_id" TO "offer_id";--> statement-breakpoint
ALTER TABLE "coupons" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "promotion_id" uuid;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;
```

Journal entry `idx: 11, tag: 0011_rename_deals_to_offers` appended to `drizzle/meta/_journal.json`.
`ALTER TABLE ... RENAME` preserves constraint/index names, so `orders_deal_id_deals_id_fk`,
`coupons_deal_id_deals_id_fk`, and the two junction unique indexes follow the renamed `offers` table
automatically (no constraint churn; LD7A intact).

## Plan Deviations

Two consumer files beyond the plan's enumerated 7 were edited — both are the direct, mechanical,
wire-preserving tail of ALREADY-AUTHORIZED locked decisions (within blast radius), not new scope:

1. **`packages/api/src/routes/coupons.ts` (8th consumer):** `coupon.deal_id` → `coupon.offer_id`
   at the `GET /coupons` serializer. This is fallout of the authorized `coupons.deal_id`→`offer_id`
   rename (LD3 / Step B1/C4) that the plan's C7 enumeration missed. The emitted JSON field stays
   `dealId` (wire-freeze, LD7B). The E3 grep pattern (`\bdeals\b`) could not have flagged it — the
   break is on the `.deal_id` column accessor, not the `deals` symbol.
2. **`packages/types/src/coupons.ts` `DbCoupon.userId` + `serializers.ts` `ApiCoupon.userId`:
   `string` → `string | null`.** Direct fallout of the authorized LD2 nullable-`user_id` change
   (making the column nullable forces the InferSelectModel + serializers to `string | null`). The
   two incorrect alternatives (non-null assert `!`, or `?? ''` fabrication) were rejected. No
   consumer reads `coupon.userId` (mobile grep empty) and no live path emits a null today, so this
   is a type-level widening with zero runtime/JSON-shape change now; Phase 3 bulk coupons will
   exercise the null. The umbrella already scopes `packages/types` coupon types into the program.

`orders.deal_id` (schema + `serializers.ts:367` + `orders.ts:299/310` + `orders.test.ts:442/443`)
was deliberately left unchanged per LD7A.

## Test Infra Gaps Found (pre-existing, NOT caused by this phase)

1. **Dev DB `jojopotato` migration-history corruption.** Before this phase the dev DB had only 8
   migration records and was missing 0008 (`coupons_user_reward_unique`) and 0009 (`orders.coupon_id`)
   objects, though 0010's objects (`deal_components`/`products.is_deal`) WERE present — an
   out-of-order application artifact of the documented ADM-004/development migration renumbering.
   drizzle-kit's timestamp-based migrator skips 0008/0009 permanently (their `folderMillis` predate
   the last-recorded 0010) and applied only my later-timestamped 0011. My 0011 applied cleanly on
   top; the corruption is unrelated to 0011. **Impact:** `db:seed` against the dev DB will now throw
   (the reward-coupon upsert's `onConflictDoNothing` needs the absent `coupons_user_reward_unique`
   partial index). **Recommendation:** the dev DB owner should drop + recreate + full-migrate
   `jojopotato` (0000→0011 in order) to reconcile. The hermetic test DB is unaffected (recreated
   fresh every run).
2. **`db:generate` is broken repo-wide (pre-existing).** It aborts with
   `[drizzle/meta/0007_snapshot.json, drizzle/meta/0010_snapshot.json] are pointing to a parent
   snapshot ... which is a collision` — a meta-snapshot parent collision from the earlier migration
   renumbering. Consequently NO `meta/0011_snapshot.json` was produced (hand-authoring the SQL +
   journal was the correct, hardening-compliant path anyway). This does NOT affect `db:migrate`
   (which does not read snapshots) or any Phase-1 exit gate, and no later phase in THIS program runs
   `db:generate`. A FUTURE schema-changing program must first fix the meta collision and reconcile
   the missing 0011 snapshot. Flagged for future reconciliation, out of Phase-1 scope.

## Closeout Packet

- **Selected plan:** phase-01-schema-migration_PLAN_16-07-26.md
- **Finished:** all checklist items A–F (incl. Step C7 + F2). Migration + schema + 9 consumer files
  (7 planned + 2 deviation) + seed + smoke.
- **Verified:** db:migrate clean; typecheck 0; full suite 271/271; index survival (authoritative
  fresh DB); row-count preservation (real rows); E3 grep clean.
- **Unverified/deferred:** `apps/admin` typecheck (Phase 5 only, N/A here); dev-DB reconcile
  (recommendation, out of scope); 0011 snapshot (blocked by pre-existing `db:generate` breakage).
- **Best next state:** COMMIT this phase (user-driven, commit-per-phase), then proceed to Phase 2
  (resolver + burn + orders.ts is_deal guard) — its RESEARCH step must re-read the now-renamed
  `offers`/`offer_products`/`offer_branches`/`coupons.offer_id` state.
- **Classification:** Keep in active — code-complete + EVL-green; awaits user commit + UPDATE PROCESS.

## Forward Preview

- **Test Infra Found:** Dev DB reconcile needed; `db:generate` broken repo-wide (meta collision).
  No 0011 snapshot exists.
- **Blast Radius Changes:** Phase-1 code blast radius grew from the planned 7 consumer files to 9
  (added `routes/coupons.ts` + `packages/types/src/coupons.ts`). Schema symbols are now
  `offers`/`offerProducts`/`offerBranches`/`promotions`; `coupons.offer_id`; `coupons.user_id`
  nullable; `DbCoupon.userId`/`ApiCoupon.userId` are `string | null`.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/api typecheck` + `pnpm --filter @jojopotato/api test`
  (test DB auto-recreates + migrates 0000→0011). `db:migrate` for a clean dev DB.
- **Dependency Changes:** Phases 2/3/4 now read the renamed schema. Phase 2 owns the
  resolver/burn/`is_deal`-guard LOGIC on `orders.ts`; Phase 4 owns the public-contract VERIFICATION
  on `deals.ts`/`index.ts` — both on top of these already-renamed symbols.
