---
name: plan:adm-008-coupons-phase-04-public-repoint
description: "ADM-008 Coupons — Phase 04: public GET /deals + GET /api/branches/:id repoint to renamed offers/offerBranches/offerProducts tables"
date: 16-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: phase-04
---

# Phase 04 — Public GET /deals Repoint

**Program:** adm-008-coupons
**Umbrella plan:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/adm-008-coupons_UMBRELLA_PLAN_16-07-26.md
**Phase status:** ✅ COMPLETE — EXECUTE done, EVL-green, code-complete (see co-located REPORT)
**Report destination:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-04-public-repoint_REPORT_{dd-mm-yy}.md (flat in the program task folder)

---

## Purpose

**Phase-boundary correction (Option A, approved 16-07-26):** Phase 1 already renamed the schema symbols and mechanically repointed `routes/deals.ts`, `index.ts`, `branch-detail-route.test.ts`, and `deals.test.ts`. Phase 4 now owns VERIFICATION of the public wire contract (frozen `dealId` JSON field unchanged post-rename) plus any response-assertion changes — NOT the symbol rename itself.

Wire-freeze repoint phase — swap the internal Drizzle table symbols the two public read surfaces
(`GET /deals`/`GET /deals/:id` and `GET /api/branches/:id`'s embedded `deals` array) query, from the
legacy `deals`/`dealBranches`/`dealProducts` tables to the Phase-1-renamed `offers`/`offerBranches`/
`offerProducts` tables. The public HTTP response SHAPE is unchanged for both surfaces (Locked
Decision 4 for `GET /deals`, Locked Decision 7B for `GET /api/branches/:id`) — this phase is purely
an internal symbol rename, never a wire-contract change. Depends on Phase 1 (needs the renamed
schema to exist). Parallel-safe with Phase 3 (admin CRUD routes) — no shared files between the two.

---

## Entry Gate

- Phase 1 exit gate passed (migration applied, `pnpm --filter @jojopotato/api typecheck` clean).

---

## Blast Radius

- `packages/api/src/routes/deals.ts` (table import swap: `deals`/`dealBranches`/`dealProducts` →
  `offers`/`offerBranches`/`offerProducts`)
- `packages/api/src/index.ts` (`GET /api/branches/:id` handler — Query A/Query B rename)
- `packages/api/src/routes/__tests__/deals.test.ts` (fixture symbol rename; assertions unchanged)
- `packages/api/src/__tests__/branch-detail-route.test.ts` (fixture symbol rename; assertions
  unchanged)

---

## Locked Decisions Referenced (do not re-litigate)

- **Locked Decision 4:** `GET /deals`/`GET /deals/:id` response shape (`ApiDeal`/`serializeDeal`) is
  UNCHANGED by the rename — `serializeDeal()` only needs its `DealRow` type import updated (source
  type now derives from `offers`, not `deals`); zero field-level changes.
- **Locked Decision 7B (VALIDATE-added — wire-freeze rule):** the `GET /api/branches/:id` handler
  (mounted directly on `app` in `packages/api/src/index.ts`, NOT inside `routes/branches.ts`) is a
  4th, previously undocumented live consumer of the renamed tables — it runs its own Query A/Query B
  union against `deals`/`dealBranches` plus a local `computeDiscountLabel()` helper, returning
  `{branch, deals: [...]}`. Rename `deals`→`offers`, `dealBranches`→`offerBranches`, and
  `dealBranches.deal_id`→`offerBranches.offer_id` in all 3 query sites inside that handler. The
  response shape (`deals: [...]`) stays byte-identical — this is an internal-symbol-only rename,
  never a field rename. No other HTTP field renames are in scope anywhere in this phase.

---

## Implementation Checklist

### Step A — Route repoint

- [ ] A1. In `routes/deals.ts`, swap the Drizzle table import from `deals`/`dealBranches`/
      `dealProducts` to `offers`/`offerBranches`/`offerProducts` — all three symbols this file
      imports, not just one.
- [ ] A2. Verify `serializeDeal`/`ApiDeal` require zero field changes (Locked Decision 4) — only the
      `DealRow` type import in `routes/lib/serializers.ts` needs updating (owned by Phase 2's Step B,
      already landed by the time this phase runs if sequenced after Phase 2; if running in parallel
      with Phase 2, confirm at RESEARCH time whether `serializeDeal`'s type import has already been
      updated or still needs a small supplementary edit here).
- [ ] A3. (VALIDATE-added) In `packages/api/src/index.ts`'s `GET /api/branches/:id` handler, apply
      the same rename in all 3 query sites (Query A, Query B, and the `dealBranches.deal_id`→
      `offerBranches.offer_id` join condition) — see Locked Decision 7B. Response shape
      (`deals: [...]`) stays byte-identical.

### Step B — Test gates

- [ ] B1. Update `routes/__tests__/deals.test.ts`'s fixture setup — `schema.deals`/
      `schema.dealBranches` symbol rename to `schema.offers`/`schema.offerBranches`. Assertions and
      response-shape checks stay unmodified (AC10) — only the fixture INSERT calls change symbol.
- [ ] B2. Update `packages/api/src/__tests__/branch-detail-route.test.ts`'s fixture setup — same
      symbol rename (`deals`→`offers`, `dealBranches`→`offerBranches`). Asserts `GET
      /api/branches/:id`'s `deals` array is unchanged post-rename (AC10b).
- [ ] B3. Run `pnpm --filter @jojopotato/api typecheck`.
- [ ] B4. Run `pnpm --filter @jojopotato/api test` — confirm `deals.test.ts` and
      `branch-detail-route.test.ts` pass with byte-identical response-shape assertions, and zero
      regressions elsewhere.

---

## Exit Gate

```bash
pnpm --filter @jojopotato/api typecheck
# Expected: 0 errors

pnpm --filter @jojopotato/api test
# Expected: full suite green, deals.test.ts + branch-detail-route.test.ts pass with unchanged
#           assertions/response shape, zero regressions
```

- All checklist items (A–B) checked.
- AC10, AC10b proven by real passing Fully-Automated tests (no Known-Gap).
- Phase report written to report destination above.

---

## Blockers That Would Justify BLOCKED Status

- Phase 1 exit gate not yet passed (hard dependency).
- The real current `routes/deals.ts` or `packages/api/src/index.ts`'s `GET /api/branches/:id`
  handler has diverged further than this plan anticipates (e.g. a 5th undocumented consumer of the
  renamed tables found at RESEARCH time) — investigate and supplement the plan before proceeding,
  do not force-fit.

---

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: re-read the REAL current `routes/deals.ts` and
      `packages/api/src/index.ts`'s `GET /api/branches/:id` handler post-Phase-1-rename; confirm
      Phase 1 landed cleanly; check for any further drift or additional consumers of the renamed
      tables since source plan's VALIDATE pass.
- [ ] 2. INNOVATE — innovate-agent: expected n/a (Locked Decisions 4 and 7B already resolve the
      design — this is a mechanical symbol rename with a frozen wire contract).
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: update this phase plan with research findings, or mark
      "n/a — research clean".
- [x] 4. PVL — SEEDED below from source plan's outer-pvl VALIDATE pass. Orchestrator MUST still
      spawn vc-validate-agent for inner PVL re-confirmation before EXECUTE.
- [ ] 5. EXECUTE — all checklist items (A–B) done; test gates green.
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written.
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated, **commit checkpoint**
      (staging commands + commit summary handed to user — no auto-commit).

**Validate-contract required before execute.**

---

## Touchpoints

- `packages/api/src/routes/deals.ts`
- `packages/api/src/index.ts` (`GET /api/branches/:id` handler)
- `packages/api/src/routes/__tests__/deals.test.ts`
- `packages/api/src/__tests__/branch-detail-route.test.ts`

---

## Public Contracts

- `GET /deals` (`?branchId=`) response shape (`ApiDeal[]`) UNCHANGED — reads `offers` table now
  (Locked Decision 4).
- `GET /deals/:id` response shape (`ApiDeal`) UNCHANGED — reads `offers` table now (Locked
  Decision 4).
- `GET /api/branches/:id` response shape (`{branch, deals: [...]}`) UNCHANGED — reads
  `offers`/`offerBranches` now, same byte-identical output (Locked Decision 7B, VALIDATE-added).
- No breaking changes to any existing public contract. This phase touches internal Drizzle table
  symbols only — never an HTTP field name.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `deals.test.ts` re-run — fixtures renamed to `offers`/`offerBranches`, assertions/response-shape byte-identical | Fully-Automated | AC10 |
| `branch-detail-route.test.ts` re-run — fixtures renamed to `offers`/`offerBranches`, `GET /api/branches/:id`'s embedded `deals` array assertions unchanged | Fully-Automated | AC10b |
| `pnpm --filter @jojopotato/api typecheck` | Fully-Automated | Renamed-symbol import regression guard across `routes/deals.ts` and `index.ts` |
| `pnpm --filter @jojopotato/api test` (full suite) | Fully-Automated | Regression bar — zero diffs elsewhere in the suite |

```bash
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/api test
```

---

## Test Infra Improvement Notes

(none identified yet)

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-04-public-repoint_PLAN_16-07-26.md`
- Last completed step: none — phase not yet started; depends on Phase 1.
- Validate-contract status: SEEDED (CONDITIONAL) — pending inner PVL re-confirmation.
- Supporting context files loaded: `adm-008-coupons_PLAN_16-07-26.md` (source master plan, PHASE 4
  section + Locked Decisions 4/7B + VALIDATE-added Touchpoints/Public Contracts rows),
  `adm-008-coupons_UMBRELLA_PLAN_16-07-26.md`.
- Next step: after Phase 1 exit gate passes, spawn vc-research-agent (or vc-validate-agent directly
  for PVL re-confirmation) for Phase 4. Parallel-safe with Phase 3 — no shared-file coordination
  needed with that phase's implementer.

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
| AC10 | Rename does not break legacy public `GET /deals`/`GET /deals/:id` mobile-facing reads | Fully-Automated | `deals.test.ts` re-run with renamed fixture symbols, assertions unchanged | B (fixture-rename correction made this VALIDATE pass; exercised by this phase's checklist step B1) |
| AC10b (VALIDATE-added) | Rename does not break `GET /api/branches/:id`'s embedded `deals` array (previously undocumented 4th consumer of the renamed tables) | Fully-Automated | `branch-detail-route.test.ts` re-run with renamed fixture symbols, assertions unchanged | B (new consumer discovered and gated this VALIDATE pass; exercised by this phase's checklist steps A3/B2) |
| — | Renamed-symbol import regression guard | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` | A |
| — | Full-suite regression bar | Fully-Automated | `pnpm --filter @jojopotato/api test` | A |

gap-resolution legend: A — proven now. B — fixed in this plan (gate added/corrected by VALIDATE, to
be exercised by EXECUTE).

Dimension findings (from source plan's VALIDATE pass, Phase 4 row):
- CONCERN (resolved via plan update) — `routes/deals.ts`'s rename is mechanically sound but the
  original plan text only mentioned "the underlying Drizzle table import" singular, where 3 symbols
  (`deals`/`dealBranches`/`dealProducts`) actually need renaming. More importantly, VALIDATE found
  the sibling `GET /api/branches/:id` consumer (`packages/api/src/index.ts`, mounted directly on
  `app`, not inside `routes/branches.ts`) was entirely missing from this phase's original scope —
  both issues fixed via new checklist steps 18/18b/19 in the source plan (Steps A1/A3/B1/B2 in this
  phase plan) plus new AC10b.
- (VALIDATE correction) The original phase wording claimed `deals.test.ts` would run "unmodified"
  post-rename — this was inaccurate. The fixture setup (`schema.deals`/`schema.dealBranches` INSERT
  calls) needs the same symbol rename as the route files; only the ASSERTIONS and response-shape
  checks stay unmodified. Corrected in this phase plan's Step B1/B2 wording.

Open gaps: none carried as Known-Gap — both findings were resolved by direct plan-text edits,
inherited into this phase plan's checklist and AC10b.

What this coverage does NOT prove:
- VALIDATE itself did not run any test — the rename inventory (3 symbols in `deals.ts`, 3 query
  sites in `index.ts`) is read-verified against real source, not yet proven by a green test run.
  EXECUTE's Step B3/B4 test run is the first actual proof.
- VALIDATE's Phase 1 mechanical safety-net grep (source plan checklist step 5c) narrows but does not
  mathematically guarantee zero remaining missed consumers of `deals`/`dealBranches`/`dealProducts`
  outside `packages/api`/`packages/types` — `apps/admin`'s and `apps/mobile`'s own `dealId`/`deals`
  hits were manually reviewed and confirmed to be the unrelated ADM-004 bundle-product feature
  (`is_deal`, route-param naming), not the legacy discount table, but this was a targeted read, not
  an exhaustive `apps/*` grep-gate.

Gate: CONDITIONAL (0 unresolved FAILs; the CONCERN found this pass was resolved via a direct plan
update in the same VALIDATE session — see Dimension findings above; residual risk is normal
pre-EXECUTE unproven-until-tested risk).
Accepted by: session (autonomous, inherited from source plan's single-shot VALIDATE pass).
