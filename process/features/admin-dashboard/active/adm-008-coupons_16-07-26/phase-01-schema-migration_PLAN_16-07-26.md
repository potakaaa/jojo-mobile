---
name: plan:adm-008-coupons-phase-01-schema-migration
description: "ADM-008 Coupons — Phase 01: schema migration (deals->offers rename + new promotions table)"
date: 16-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: phase-01
---

# Phase 01 — Schema Migration

**Program:** adm-008-coupons
**Umbrella plan:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/adm-008-coupons_UMBRELLA_PLAN_16-07-26.md
**Phase status:** ✅ COMPLETE — EXECUTE done, EVL-green, code-complete (see co-located REPORT)

**Phase-boundary correction (Option A, approved 16-07-26):** EXECUTE discovered the deals→offers
Drizzle rename is ATOMIC — renaming the physical junction column `deal_products.deal_id`/
`deal_branches.deal_id`→`offer_id` and the `deals`→`offers` schema symbols breaks 7 consumer files
at compile time, so this phase's `pnpm --filter @jojopotato/api typecheck` exit gate is
unsatisfiable unless this phase ALSO mechanically repoints those 7 consumers. Phase 1 now includes
the full mechanical rename (schema + migration + all 7 consumer files below); Phase 2 layers LOGIC
onto the already-renamed symbols; Phase 4 layers PUBLIC-CONTRACT VERIFICATION onto the
already-renamed symbols. Commit-per-phase is preserved (Phase 1 = rename, Phase 2 = logic, Phase 4
= verification). The wire-freeze rule (Locked Decision 7B) is UNAFFECTED by this correction — these
are DB-symbol renames only; JSON field names like `dealId` stay frozen in the
serializer/response layer.

**Report destination:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-01-schema-migration_REPORT_{dd-mm-yy}.md (flat in the program task folder)

---

## Purpose

Foundation phase. Renames the legacy discount `deals`/`deal_products`/`deal_branches` tables to
`offers`/`offer_products`/`offer_branches`, repoints `coupons.deal_id`→`offer_id` and makes
`coupons.user_id` nullable, and adds a new `promotions` table with `offers.promotion_id` nullable
FK. All non-destructive (renames + additive columns/tables only). Blocks Phases 2, 3, and 4 — every
later phase reads the renamed schema. Per the Option A correction above, this phase ALSO
mechanically repoints the 7 consumer files whose imports would otherwise break at compile time —
those repoints are symbol/column-name changes only, no behavior/wire-shape change.

---

## Entry Gate

- Program start — no prior phase.
- Hard precondition already satisfied (confirmed at source-plan VALIDATE time): `feat/adm-004-deals`
  merged into `development` via PR #92; `products.is_deal` + `deal_components` present;
  `coupons`/`routes/coupons.ts`/`coupon-apply.ts`/`reward-coupon-code.ts`/`deals-catalog.ts` all
  present on the branch.

---

## Blast Radius

- `packages/api/drizzle/0013_rename_deals_to_offers.sql` (new migration file — originally generated as 0011, renumbered to 0013 in the PR #93 merge)
- `packages/api/src/db/schema/deals.ts` → renamed to `offers.ts`
- `packages/api/src/db/schema/deal_products.ts` → renamed to `offer_products.ts`
- `packages/api/src/db/schema/deal_branches.ts` → renamed to `offer_branches.ts`
- `packages/api/src/db/schema/promotions.ts` (new)
- `packages/api/src/db/schema/coupons.ts` (deal_id→offer_id rename, user_id nullable)
- `packages/api/src/db/schema/index.ts` (barrel export updates)
- `packages/api/src/db/schema/orders.ts` (import target update only — `orders.deal_id` column
  itself stays unrenamed, Locked Decision 7A)
- `packages/api/src/db/seed/seed.ts` (`seedDealsTable()`/`seedDealScopingTables()` symbol + column renames)
- `packages/api/src/db/schema/__tests__/smoke.test.ts` (table-name string list update)
- `packages/api/src/index.ts` — `dealBranches.deal_id`, `deals` (branch-detail route) (mechanical
  symbol/column repoint only — keep build + tests compiling; no behavior/wire change)
- `packages/api/src/routes/deals.ts` — `dealBranches.deal_id`, `dealProducts.deal_id`, `deals`
  (mechanical symbol/column repoint only — keep build + tests compiling; no behavior/wire change)
- `packages/api/src/routes/orders.ts` — `dealBranches.deal_id`, `dealProducts.deal_id`, `deals`
  (mechanical symbol/column repoint only — keep build + tests compiling; no behavior/wire change)
- `packages/api/src/routes/lib/serializers.ts` — `deals`, `DealRow = InferSelectModel<typeof deals>`
  (shared; mechanical symbol/column repoint only — keep build + tests compiling; no behavior/wire
  change)
- `packages/api/src/__tests__/branch-detail-route.test.ts` — `schema.deals`, `schema.dealBranches`,
  `.deal_id` (mechanical symbol/column repoint only — keep build + tests compiling; no
  behavior/wire change)
- `packages/api/src/routes/__tests__/orders.test.ts` — `schema.deals/dealBranches/dealProducts`,
  `.deal_id` (mechanical symbol/column repoint only — keep build + tests compiling; no
  behavior/wire change)
- `packages/api/src/routes/__tests__/deals.test.ts` — `schema.deals`, `schema.dealBranches`,
  `.deal_id` (mechanical symbol/column repoint only — keep build + tests compiling; no
  behavior/wire change)

---

## Locked Decisions Referenced (do not re-litigate)

- **Locked Decision 3** — exact migration contents (renames + new `promotions` table + nullable
  `user_id` + `promotion_id` FK). `coupons_user_reward_unique` partial index MUST survive unchanged
  — verify post-migration via `\d coupons`.
- **Locked Decision 7A** — `orders.deal_id` stays named `deal_id` (only the schema file's import
  target changes: `import { deals } from './deals'` → `import { offers } from './offers'`,
  `.references(() => offers.id)`). `deal_products`/`deal_branches` DO rename their own `deal_id`
  column to `offer_id` (they are the two junction tables, distinct from `orders.deal_id`).

---

## ⚠️ Drizzle Rename-Detection Hardening (MANDATORY — applies to this phase's step 1 and 3)

**Problem:** `drizzle-kit generate` (i.e. `pnpm --filter @jojopotato/api db:generate`) cannot
reliably detect a table/column **rename** non-interactively. Faced with a schema-file change like
`deals.ts` → `offers.ts` (or `deal_id` → `offer_id` inside a schema file), drizzle-kit may emit a
**destructive** migration (`DROP TABLE deals; CREATE TABLE offers;` / `DROP COLUMN deal_id; ADD
COLUMN offer_id;`) instead of the intended `ALTER TABLE deals RENAME TO offers;` /
`ALTER TABLE ... RENAME COLUMN deal_id TO offer_id;`. A drop+create would **silently empty every
row** in the renamed tables — unacceptable even against a near-empty dev DB, and catastrophic
against any DB with real data.

**This repo already hand-authors migrations when precision matters** — see `0004_add_branch_priority`
and `0005_add_rejected_order_status`, both hand-written rather than generated. This migration
follows the same precedent.

**Mandatory rules for this phase's Implementation Checklist step 1 and step 3:**

1. **Hand-author the rename SQL.** Every `ALTER TABLE ... RENAME TO ...` and
   `ALTER TABLE ... RENAME COLUMN ... TO ...` statement in migration `0011` MUST be written by
   hand, not trusted from `db:generate` output.
2. **`db:generate` may be used ONLY to scaffold the purely additive parts** — the new `promotions`
   table definition and the `offers.promotion_id` nullable FK column. Even then, the emitted SQL
   file MUST be manually inspected before it is treated as final.
3. **FORBIDDEN:** applying any generated migration file that contains `DROP TABLE deals`,
   `DROP TABLE deal_products`, `DROP TABLE deal_branches`, or a `DROP COLUMN`/`ADD COLUMN` pair
   standing in for what should be a `RENAME COLUMN`. If `db:generate` emits any of these, DISCARD
   the generated file and hand-author the correct `RENAME` statement instead — do not "fix up" a
   drop+create by re-adding data, since dev-DB data loss is still a real regression to catch, and a
   drop+create against ANY future non-empty DB (staging, prod) would be destructive.
4. **Post-apply verification (new, added to step 5 below):** after `db:migrate` runs, confirm the
   renamed tables' row counts match their pre-migration state (a rename preserves rows; a
   drop+create would silently empty them). On a fresh/near-empty dev DB this is a trivial `0 == 0`
   check, but it is still the correctness signal that would have caught a drop+create — treat a
   nonzero pre-migration count that becomes zero post-migration as a FAILED gate, not a shrug.

---

## Implementation Checklist

### Step A — Journal + safety confirmation

- [ ] A1. Read `packages/api/drizzle/meta/_journal.json` to RE-confirm `0011` is still the next
      free migration slot (confirmed at PLAN time: journal ends at idx 10 = `0010_fearless_crystal`;
      re-confirm in case new migrations landed between PLAN and EXECUTE).
- [ ] A2. Confirm `packages/api/src/db/schema/deal_products.ts` and `deal_branches.ts` both exist
      as schema files distinct from ADM-004's `deal_components.ts` (already confirmed at PLAN time
      via recon — re-verify file presence before writing the migration).

### Step B — Migration (hand-authored renames, per hardening rules above)

- [ ] B1. Write `packages/api/drizzle/0011_{name}.sql` by hand with these statements, in order:
      - `ALTER TABLE deals RENAME TO offers;`
      - `ALTER TABLE deal_products RENAME TO offer_products;`
      - `ALTER TABLE offer_products RENAME COLUMN deal_id TO offer_id;`
      - `ALTER TABLE deal_branches RENAME TO offer_branches;`
      - `ALTER TABLE offer_branches RENAME COLUMN deal_id TO offer_id;`
      - `ALTER TABLE coupons RENAME COLUMN deal_id TO offer_id;` (FK repoints to `offers.id`
        automatically — Postgres `RENAME COLUMN` does not require dropping/re-adding the FK
        constraint)
      - `ALTER TABLE coupons ALTER COLUMN user_id DROP NOT NULL;`
      - `CREATE TABLE promotions (id, name, description, start_at, end_at, created_at, updated_at, ...);`
        (may use `db:generate` to scaffold this table definition; hand-inspect the output before
        accepting it)
      - `ALTER TABLE offers ADD COLUMN promotion_id uuid REFERENCES promotions(id);`
- [ ] B2. Inspect the final SQL file: confirm zero `DROP TABLE` / disallowed `DROP COLUMN`+`ADD
      COLUMN` pairs are present (see hardening rules).

### Step C — Schema files

- [ ] C1. Rename `packages/api/src/db/schema/deals.ts` → `offers.ts`; rename exported symbol
      `deals`→`offers`. Decide (least-invasive) whether `dealTypeEnum` renames to `offerTypeEnum`
      or keeps its name (export-only rename is acceptable either way — this is EXECUTE's call, not
      a Locked Decision).
- [ ] C2. Rename `deal_products.ts` → `offer_products.ts`, `deal_branches.ts` → `offer_branches.ts`;
      update exported symbols and their internal `deal_id`→`offer_id` column refs.
- [ ] C3. Create `packages/api/src/db/schema/promotions.ts` — new Drizzle table def matching B1.
- [ ] C4. Update `coupons.ts` — `deal_id`→`offer_id` rename, `user_id` nullable (remove
      `.notNull()`).
- [ ] C5. Update the schema barrel/`index.ts` — export `offers`/`offer_products`/`offer_branches`/
      `promotions` in place of the old `deals`/`deal_products`/`deal_branches` exports.
- [ ] C6. Update `packages/api/src/db/schema/orders.ts`'s import target only (Locked Decision 7A —
      `orders.deal_id` column stays named `deal_id`): `import { deals } from './deals'` →
      `import { offers } from './offers'`; `.references(() => offers.id)`.

### Step C7 — Consumer symbol repoints (Option A correction, MECHANICAL ONLY)

Renaming the schema symbols in Step C is atomic — the following 7 consumer files import the old
`deals`/`dealBranches`/`dealProducts` symbols and/or their `.deal_id` column and will fail
`pnpm --filter @jojopotato/api typecheck` (and, for the test files, fail to compile at all) unless
repointed in this same phase. **These edits are mechanical symbol/column renames ONLY — no
behavior change, no response-shape change, no logic change.** `serializers.ts` keeps emitting the
same `dealId` JSON field (wire-freeze, Locked Decision 7B) — only its internal Drizzle import
target changes. Test-file edits here are import/fixture-symbol updates only; Phase 2 and Phase 4
still own their respective assertion/logic changes to these same files.

- [ ] C7a. `packages/api/src/index.ts` — repoint `dealBranches.deal_id`→`offerBranches.offer_id`
      and `deals`→`offers` in the `GET /api/branches/:id` handler's query sites (symbol/column
      rename only; response shape unchanged).
- [ ] C7b. `packages/api/src/routes/deals.ts` — repoint `dealBranches.deal_id`,
      `dealProducts.deal_id`, `deals` to the renamed `offerBranches`/`offerProducts`/`offers`
      symbols (symbol/column rename only; response shape unchanged).
- [ ] C7c. `packages/api/src/routes/orders.ts` — repoint `dealBranches.deal_id`,
      `dealProducts.deal_id`, `deals` to the renamed symbols (symbol/column rename only; no logic
      change — Phase 2 owns the burn/guard logic changes to this same file).
- [ ] C7d. `packages/api/src/routes/lib/serializers.ts` — repoint the `deals` import and
      `DealRow = InferSelectModel<typeof deals>` to `offers`/`InferSelectModel<typeof offers>`
      (shared serializer file; symbol rename only — emitted JSON field names unchanged).
- [ ] C7e. `packages/api/src/__tests__/branch-detail-route.test.ts` — repoint `schema.deals`,
      `schema.dealBranches`, and `.deal_id` fixture references to `schema.offers`/
      `schema.offerBranches`/`.offer_id` (import/fixture-symbol update only; assertions unchanged
      here — Phase 4 owns any assertion changes).
- [ ] C7f. `packages/api/src/routes/__tests__/orders.test.ts` — repoint `schema.deals`/
      `schema.dealBranches`/`schema.dealProducts` and `.deal_id` fixture references to the renamed
      symbols (import/fixture-symbol update only; assertions unchanged here — Phase 2 owns any
      assertion/logic changes).
- [ ] C7g. `packages/api/src/routes/__tests__/deals.test.ts` — repoint `schema.deals`,
      `schema.dealBranches`, and `.deal_id` fixture references to the renamed symbols
      (import/fixture-symbol update only; assertions unchanged here — Phase 4 owns any assertion
      changes).

### Step D — Apply + verify

- [ ] D1. Run `pnpm --filter @jojopotato/api db:migrate` against a real local Postgres.
- [ ] D2. Confirm migration applies cleanly with zero errors.
- [ ] D3. Verify `coupons_user_reward_unique` (partial unique index from migration 0008) still
      exists via `\d coupons` post-migration (Locked Decision 3's correctness checkpoint).
- [ ] D4. **Row-count preservation check** (per Drizzle hardening rule 4 above): confirm renamed
      tables' row counts match pre-migration state (0==0 on a fresh dev DB is an acceptable pass,
      but the check must actually run, not be assumed).

### Step E — Downstream fixups (VALIDATE-added, mandatory)

- [ ] E1. Update `packages/api/src/db/seed/seed.ts`'s `seedDealsTable()`/`seedDealScopingTables()`:
      rename Drizzle symbols (`deals`→`offers`, `dealProducts`→`offerProducts`,
      `dealBranches`→`offerBranches`) and the two junction tables' `deal_id`→`offer_id` column keys
      in `.values()`/`.onConflictDoUpdate()` calls.
- [ ] E2. Update `packages/api/src/db/schema/__tests__/smoke.test.ts`'s table-existence string
      list: `'deals'`→`'offers'`, `'dealProducts'`→`'offerProducts'`, `'dealBranches'`→`'offerBranches'`.
- [ ] E3. **Mechanical safety net (mandatory before declaring Phase 1 CODE DONE):** run
      `grep -rn "\bdeals\b\|\bdealBranches\b\|\bdealProducts\b" packages/api/src packages/types/src`
      and confirm every remaining hit is either (a) already accounted for in this plan's Touchpoints
      (now including the 7 Step C7 consumer files — see Blast Radius/Touchpoints), or (b) genuinely
      unrelated to the legacy discount `deals` table (e.g. ADM-004's unrelated `is_deal`/
      `deal_components` bundle-product feature, or the frozen `packages/types/src/deals.ts`
      `ApiDeal` wire type and ADM-004's `routes/admin/deals.ts`, neither of which participate in
      this rename). Record the grep output in the phase report.

### Step F — Test gate

- [ ] F1. Run `pnpm --filter @jojopotato/api typecheck` — catches every renamed-symbol import site
      across the package in one pass (covers Step E files and all 7 Step C7 consumer files too,
      since `tsconfig.json`'s `include` covers all of `src/`, test files included).
- [ ] F2. Run `pnpm --filter @jojopotato/api test` (full API suite) — since this phase now edits
      route files (`index.ts`, `routes/deals.ts`, `routes/orders.ts`, `serializers.ts`) and test
      fixture files (`branch-detail-route.test.ts`, `orders.test.ts`, `deals.test.ts`) as mechanical
      symbol repoints, the full suite must stay green with ZERO regressions — behavior is
      unchanged, so every existing assertion should still pass unmodified.

---

## Exit Gate

```bash
pnpm --filter @jojopotato/api db:migrate
# Expected: applies cleanly, 0 errors

pnpm --filter @jojopotato/api typecheck
# Expected: 0 errors, INCLUDING the 7 Step C7 mechanically-repointed consumer files

pnpm --filter @jojopotato/api test
# Expected: full suite green, 0 regressions — the mechanical Step C7 repoints must not change any
#           existing behavior or assertion outcome
```

- All checklist items (A–F, including new Step C7) checked.
- `coupons_user_reward_unique` confirmed intact via `\d coupons`.
- Step E3 safety-net grep run and documented in the phase report.
- Row-count preservation check (D4) recorded as PASS.
- Phase report written to report destination above.

---

## Blockers That Would Justify BLOCKED Status

- `db:generate` cannot be coerced into safe output and hand-authoring reveals an unresolvable
  schema conflict (very unlikely given the confirmed hard precondition).
- Migration slot `0011` is no longer free (another migration landed in the interim) — re-number and
  retry, not a true blocker.
- `coupons_user_reward_unique` index does NOT survive the migration — this is a hard stop requiring
  investigation before proceeding to any later phase.

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop
`R → I → P → PVL → E → EVL → UP` SKIPS SPEC (SPEC ran once at the outer program/source-plan level).

- [ ] 1. RESEARCH — research-agent: re-verify real current state of `deals.ts`/`coupons.ts`/
      `orders.ts`/`seed.ts`/`smoke.test.ts`/`index.ts`/`routes/deals.ts`/`serializers.ts`/the 3
      test fixture files (may have drifted since source plan's VALIDATE pass); confirm migration
      slot 0011 still free; test context loaded.
- [ ] 2. INNOVATE — innovate-agent: expected n/a (Locked Decisions 3 + 7A already resolve the
      design; only invoke if research surfaces a genuinely new fork).
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: update this phase plan with research findings, or mark
      "n/a — research clean".
- [x] 4. PVL — SEEDED below from source plan's outer-pvl VALIDATE pass (Gate: CONDITIONAL,
      resolved via plan-text fixes in that pass — see `## Validate Contract`). Orchestrator MUST
      still spawn vc-validate-agent for an inner PVL re-confirmation pass before EXECUTE (the
      seeded contract is a strong prior, not a substitute for re-running V1–V7 against this split
      phase plan's own text, INCLUDING the Option A Step C7 expansion).
- [ ] 5. EXECUTE — all checklist items (A–F, incl. Step C7) done; test gates green.
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written.
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated, **commit checkpoint**
      (staging commands + commit summary handed to user — no auto-commit).

**Validate-contract required before execute.** The seeded contract below is CONDITIONAL, not PASS —
orchestrator must re-confirm via inner PVL before spawning vc-execute-agent.

---

## Touchpoints

- `packages/api/drizzle/0011_{name}.sql` (new)
- `packages/api/src/db/schema/deals.ts` → `offers.ts`
- `packages/api/src/db/schema/deal_products.ts` → `offer_products.ts`
- `packages/api/src/db/schema/deal_branches.ts` → `offer_branches.ts`
- `packages/api/src/db/schema/promotions.ts` (new)
- `packages/api/src/db/schema/coupons.ts`
- `packages/api/src/db/schema/index.ts`
- `packages/api/src/db/schema/orders.ts` (import target only)
- `packages/api/src/db/seed/seed.ts`
- `packages/api/src/db/schema/__tests__/smoke.test.ts`
- `packages/api/src/index.ts` (mechanical symbol/column repoint only — keep build + tests
  compiling; no behavior/wire change)
- `packages/api/src/routes/deals.ts` (mechanical symbol/column repoint only — keep build + tests
  compiling; no behavior/wire change)
- `packages/api/src/routes/orders.ts` (mechanical symbol/column repoint only — keep build + tests
  compiling; no behavior/wire change)
- `packages/api/src/routes/lib/serializers.ts` (mechanical symbol/column repoint only — keep build
  + tests compiling; no behavior/wire change)
- `packages/api/src/__tests__/branch-detail-route.test.ts` (mechanical symbol/column repoint only —
  keep build + tests compiling; no behavior/wire change)
- `packages/api/src/routes/__tests__/orders.test.ts` (mechanical symbol/column repoint only — keep
  build + tests compiling; no behavior/wire change)
- `packages/api/src/routes/__tests__/deals.test.ts` (mechanical symbol/column repoint only — keep
  build + tests compiling; no behavior/wire change)

---

## Public Contracts

- None directly — this phase is schema-only plus mechanical consumer repoints. No HTTP route
  behavior or response shape changes within this phase's own scope (Phases 2/4 layer logic and
  verification on top). `orders.deal_id`'s wire-facing field name is unaffected (Locked Decision
  7A). `GET /deals`, `GET /deals/:id`, `GET /api/branches/:id`, and `GET /coupons`'s `dealId` field
  all keep byte-identical response shapes post-repoint (wire-freeze, Locked Decision 7B) — the
  Step C7 edits change only which Drizzle table symbol each handler queries.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api db:migrate` — applies cleanly | Fully-Automated | Migration correctness (foundation for all ACs) |
| `\d coupons` post-migration — `coupons_user_reward_unique` present | Fully-Automated (manual psql check, scriptable) | Reward-coupon regression guard (protects AC8) |
| Row-count preservation check (pre vs post migration) | Fully-Automated | Rename-not-destroy correctness (Drizzle hardening rule 4) |
| Step E3 safety-net grep — zero unaccounted `deals`/`dealBranches`/`dealProducts` hits | Fully-Automated | Renamed-symbol completeness (protects Phases 2-4) |
| `pnpm --filter @jojopotato/api typecheck` | Fully-Automated | Renamed-symbol regression guard (all touchpoints, incl. Step C7) |
| `pnpm --filter @jojopotato/api test` (full suite) | Fully-Automated | Zero-regression proof for the Step C7 mechanical consumer repoints |

```bash
pnpm --filter @jojopotato/api db:migrate
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/api test
```

---

## Test Infra Improvement Notes

(none identified yet)

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-01-schema-migration_PLAN_16-07-26.md`
- Last completed step: none — phase not yet started.
- Validate-contract status: SEEDED (CONDITIONAL, from source plan's outer-pvl pass) — pending inner
  PVL re-confirmation, now also covering the Option A Step C7 expansion.
- Next step: Spawn vc-research-agent (or, given same-day/same-branch freshness, vc-validate-agent
  directly for PVL re-confirmation) for Phase 1.

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
| — | Schema/migration correctness | Fully-Automated | `pnpm --filter @jojopotato/api db:migrate` + `pnpm --filter @jojopotato/api typecheck` | A |
| — | `coupons_user_reward_unique` index survives rename + nullable-user_id change | Fully-Automated | `\d coupons` post-migration check | A |
| — | No orphaned symbol imports post-rename, incl. the 7 Step C7 consumer files | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` (covers seed.ts/smoke.test.ts/orders.ts import-target updates + index.ts/routes/deals.ts/routes/orders.ts/serializers.ts/3 test fixture files) | A |
| — | Mechanical consumer repoints introduce zero behavior regressions | Fully-Automated | `pnpm --filter @jojopotato/api test` (full suite) | B (test-run added by the Option A correction; gate is new this pass) |

gap-resolution legend: A — proven now (gate passes in this cycle, once EXECUTE lands). B — fixed in
this plan (gate added by the Option A phase-boundary correction, to be exercised by EXECUTE).

Dimension findings (from source plan's VALIDATE pass, Phase 1 row):
- CONCERN (resolved via plan update) — migration slot 0011 confirmed correct via real
  `_journal.json` read; `coupons_user_reward_unique` partial-index survival reasoning confirmed
  sound (scoped to `reward_id IS NOT NULL`, unaffected by these changes). Gap found:
  `orders.deal_id`'s FK to `deals` (migration 0006) was not enumerated in the original Locked
  Decision 3 / Touchpoints — fixed via Locked Decision 7A (column stays unrenamed, only the schema
  file's import target changes — zero new SQL needed). This fix is now Step C6 above.

Dimension findings (Option A phase-boundary correction, 16-07-26):
- CONCERN (resolved via plan update) — EXECUTE discovered the rename is atomic: 7 consumer files
  (`index.ts`, `routes/deals.ts`, `routes/orders.ts`, `serializers.ts`, and 3 test fixture files)
  import the pre-rename symbols and would fail typecheck/compile if left unrepointed. Fixed via new
  Step C7 (mechanical-only consumer repoints) plus a new full-suite test-run gate (Step F2) proving
  zero behavior regression from the repoint.

Open gaps: none carried as Known-Gap — all findings resolved by direct plan-text edits, inherited
verbatim into this phase plan's checklist (Steps C6, C7, D4, E1-E3, F2).

What this coverage does NOT prove:
- The Drizzle rename-detection hardening (this phase plan's own addition, not in the source plan's
  VALIDATE pass) has not itself been test-proven — it is a process/authoring discipline, not a
  runtime assertion. The row-count preservation check (D4) is the closest automatable proxy.

Gate: CONDITIONAL (0 unresolved FAILs; all CONCERNs from the source VALIDATE pass and the Option A
correction were resolved via direct plan-text updates; residual risk is normal pre-EXECUTE
unproven-until-tested risk).
Accepted by: session (autonomous, inherited from source plan's single-shot VALIDATE pass; Option A
correction approved by user 16-07-26) — every CONCERN closed by a concrete plan-text fix, now
present in this phase's checklist.
