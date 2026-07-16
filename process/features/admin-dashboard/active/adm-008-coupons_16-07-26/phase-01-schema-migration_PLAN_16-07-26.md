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
**Phase status:** ⏳ PLANNED — validate-contract SEEDED (CONDITIONAL) from source plan's outer-pvl VALIDATE pass; needs inner PVL confirmation before EXECUTE
**Report destination:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-01-schema-migration_REPORT_{dd-mm-yy}.md (flat in the program task folder)

---

## Purpose

Foundation phase. Renames the legacy discount `deals`/`deal_products`/`deal_branches` tables to
`offers`/`offer_products`/`offer_branches`, repoints `coupons.deal_id`→`offer_id` and makes
`coupons.user_id` nullable, and adds a new `promotions` table with `offers.promotion_id` nullable
FK. All non-destructive (renames + additive columns/tables only). Blocks Phases 2, 3, and 4 — every
later phase reads the renamed schema.

---

## Entry Gate

- Program start — no prior phase.
- Hard precondition already satisfied (confirmed at source-plan VALIDATE time): `feat/adm-004-deals`
  merged into `development` via PR #92; `products.is_deal` + `deal_components` present;
  `coupons`/`routes/coupons.ts`/`coupon-apply.ts`/`reward-coupon-code.ts`/`deals-catalog.ts` all
  present on the branch.

---

## Blast Radius

- `packages/api/drizzle/0011_{name}.sql` (new migration file)
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
      and confirm every remaining hit is either (a) already accounted for in this plan's Touchpoints,
      or (b) genuinely unrelated to the legacy discount `deals` table (e.g. ADM-004's unrelated
      `is_deal`/`deal_components` bundle-product feature). Record the grep output in the phase
      report.

### Step F — Test gate

- [ ] F1. Run `pnpm --filter @jojopotato/api typecheck` — catches every renamed-symbol import site
      across the package in one pass (covers Step E files too, since `tsconfig.json`'s `include`
      covers all of `src/`, test files included).

---

## Exit Gate

```bash
pnpm --filter @jojopotato/api db:migrate
# Expected: applies cleanly, 0 errors

pnpm --filter @jojopotato/api typecheck
# Expected: 0 errors
```

- All checklist items (A–F) checked.
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
      `orders.ts`/`seed.ts`/`smoke.test.ts` on the branch (may have drifted since source plan's
      VALIDATE pass); confirm migration slot 0011 still free; test context loaded.
- [ ] 2. INNOVATE — innovate-agent: expected n/a (Locked Decisions 3 + 7A already resolve the
      design; only invoke if research surfaces a genuinely new fork).
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: update this phase plan with research findings, or mark
      "n/a — research clean".
- [x] 4. PVL — SEEDED below from source plan's outer-pvl VALIDATE pass (Gate: CONDITIONAL,
      resolved via plan-text fixes in that pass — see `## Validate Contract`). Orchestrator MUST
      still spawn vc-validate-agent for an inner PVL re-confirmation pass before EXECUTE (the
      seeded contract is a strong prior, not a substitute for re-running V1–V7 against this split
      phase plan's own text).
- [ ] 5. EXECUTE — all checklist items (A–F) done; test gates green.
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

---

## Public Contracts

- None directly — this phase is schema-only. No HTTP route reads the renamed tables yet within this
  phase's own scope (Phases 2/3/4 do that). `orders.deal_id`'s wire-facing field name is unaffected
  (Locked Decision 7A).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api db:migrate` — applies cleanly | Fully-Automated | Migration correctness (foundation for all ACs) |
| `\d coupons` post-migration — `coupons_user_reward_unique` present | Fully-Automated (manual psql check, scriptable) | Reward-coupon regression guard (protects AC8) |
| Row-count preservation check (pre vs post migration) | Fully-Automated | Rename-not-destroy correctness (Drizzle hardening rule 4) |
| Step E3 safety-net grep — zero unaccounted `deals`/`dealBranches`/`dealProducts` hits | Fully-Automated | Renamed-symbol completeness (protects Phases 2-4) |
| `pnpm --filter @jojopotato/api typecheck` | Fully-Automated | Renamed-symbol regression guard (all touchpoints) |

```bash
pnpm --filter @jojopotato/api db:migrate
pnpm --filter @jojopotato/api typecheck
```

---

## Test Infra Improvement Notes

(none identified yet)

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-01-schema-migration_PLAN_16-07-26.md`
- Last completed step: none — phase not yet started.
- Validate-contract status: SEEDED (CONDITIONAL, from source plan's outer-pvl pass) — pending inner
  PVL re-confirmation.
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
| — | No orphaned symbol imports post-rename | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` (covers seed.ts/smoke.test.ts/orders.ts import-target updates) | A |

gap-resolution legend: A — proven now (gate passes in this cycle, once EXECUTE lands).

Dimension findings (from source plan's VALIDATE pass, Phase 1 row):
- CONCERN (resolved via plan update) — migration slot 0011 confirmed correct via real
  `_journal.json` read; `coupons_user_reward_unique` partial-index survival reasoning confirmed
  sound (scoped to `reward_id IS NOT NULL`, unaffected by these changes). Gap found:
  `orders.deal_id`'s FK to `deals` (migration 0006) was not enumerated in the original Locked
  Decision 3 / Touchpoints — fixed via Locked Decision 7A (column stays unrenamed, only the schema
  file's import target changes — zero new SQL needed). This fix is now Step C6 above.

Open gaps: none carried as Known-Gap — all findings resolved by direct plan-text edits in the
source plan's VALIDATE pass, inherited verbatim into this phase plan's checklist (Steps C6, D4,
E1-E3).

What this coverage does NOT prove:
- The Drizzle rename-detection hardening (this phase plan's own addition, not in the source plan's
  VALIDATE pass) has not itself been test-proven — it is a process/authoring discipline, not a
  runtime assertion. The row-count preservation check (D4) is the closest automatable proxy.

Gate: CONDITIONAL (0 unresolved FAILs; all CONCERNs from the source VALIDATE pass were resolved via
direct plan-text updates; residual risk is normal pre-EXECUTE unproven-until-tested risk).
Accepted by: session (autonomous, inherited from source plan's single-shot VALIDATE pass) — every
CONCERN closed by a concrete plan-text fix, now present in this phase's checklist.
