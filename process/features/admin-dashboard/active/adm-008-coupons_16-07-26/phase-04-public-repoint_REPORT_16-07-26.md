---
name: report:adm-008-coupons-phase-04-public-repoint
description: "ADM-008 Coupons Phase 04 EXECUTE report — public GET /deals + GET /api/branches/:id repoint VERIFICATION + AC10b wire-freeze assertion"
date: 16-07-26
metadata:
  node_type: memory
  type: report
  feature: admin-dashboard
  phase: phase-04
---

# Phase 04 — Public Repoint (VERIFICATION) — EXECUTE Report

**Status:** COMPLETE
**Plan:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-04-public-repoint_PLAN_16-07-26.md
**Branch:** feat/adm-008-coupons

---

## Answer First

Phase 4 was **almost entirely folded into Phase 1's commit `502a01e`** (the Option-A atomic
rename). The rename mechanically repointed all four of this phase's files to
`offers`/`offerBranches`/`offerProducts` — verified clean, zero remaining legacy-table references
in the code paths this phase owns. The **only new code this phase wrote** is one minimal
wire-freeze `it` block in `branch-detail-route.test.ts` proving AC10b (the `GET /api/branches/:id`
`deals:[...]` array items still expose their frozen public field set post-rename). AC10 was
already fully proven by pre-existing assertions — no new code for it.

---

## Did Phase 4 Require New Code?

- **Route/handler repoint (Steps A1, A2, A3):** NO new code. Already done in Phase 1 commit `502a01e`.
- **Test fixture repoint (Steps B1, B2):** NO new code. Already done in Phase 1 commit `502a01e`.
- **AC10 wire-freeze proof (GET /deals):** NO new code. Pre-existing assertions already freeze it.
- **AC10b wire-freeze proof (GET /api/branches/:id):** ONE new minimal `it` block added to
  `branch-detail-route.test.ts` (the only diff this phase produced).

---

## What Was Done

### Verification (no code) — repoint landed cleanly in Phase 1

Confirmed by direct file read + word-boundary grep that these files reference ONLY the renamed
`offers`/`offerBranches`/`offerProducts` symbols (no legacy `deals`/`dealBranches`/`dealProducts`
table symbols remain; remaining `deals` hits are comments and the FROZEN `deals:`/`deal:` JSON
response keys, which must stay):

| File | Symbols verified | Evidence |
|---|---|---|
| `packages/api/src/routes/deals.ts` | `offers` (L6,32,91), `offerBranches` (L6,45-46,99), `offerProducts` (L6,49-50,100) — all 3 | grep: 0 legacy table symbols |
| `packages/api/src/index.ts` GET /api/branches/:id | import L14; Query A L162-170; Query B L177-190; join `offerBranches.offer_id` L164,184 — all 3 query sites | grep: `NO legacy dealBranches/dealProducts` |
| `packages/api/src/routes/__tests__/deals.test.ts` | fixtures use `schema.offers` (L98,113,131,145), `schema.offerBranches` (L126), `offer_id` (L127) | file read |
| `packages/api/src/__tests__/branch-detail-route.test.ts` | schema bound via `{ offers: deals, offerBranches: dealBranches }` alias (L44), `.offer_id` join (L80,99) | file read |

### New code (the one diff) — AC10b wire-freeze assertion

Added one `it` block to `packages/api/src/__tests__/branch-detail-route.test.ts` (after the
`jojo-sm-downtown` test, before the describe close). It reuses the existing `visibleDealsForBranch`
helper, `branchIdBySlug` helper, and `dbAvailable` guard — **no new test scaffolding** (no new
server, no new beforeAll). It asserts a returned deal row exposes the frozen public field set the
`{ branch, deals: [...] }` array items carry via `...d` spread: `id`, `title`, `deal_type`,
`discount_value`, `is_active`, `start_at`, `end_at`. (The `offers` table kept its `deal_*` column
names — the ADM-008 rename was table-name-only — so this proves the rename did not silently rename
the wire fields.)

---

## Test Gate Outcomes

### AC10 (GET /deals `dealId`/ApiDeal shape frozen) — proven by PRE-EXISTING passing assertions

- `deals.test.ts:166` — `expect(Array.isArray(json.deals)).toBe(true)` freezes the `{ deals: [...] }` envelope.
- `deals.test.ts:214-228` — full ApiDeal field-name guard on `GET /deals` items, including
  `dealType` (the critical "not renamed to offerType" guard), `id`, `discountValue`, etc.
- `deals.test.ts:243-258` — `GET /deals/:id` freezes the `{ deal }` envelope + full ApiDeal field guard.
- Result: **13/13 passed.** No new code added (task rule: existing full-shape assertion satisfies AC10).

### AC10b (GET /api/branches/:id `{branch, deals:[...]}` array frozen) — PARTIALLY verified

- **Field-set evidence (present):** `branch-detail-route.test.ts` — new `it('deals array items
  expose the frozen public field set after the offers rename (AC10b)')` asserts the frozen deal-item
  field set on a returned row via the `visibleDealsForBranch` query-mirror helper.
- Supported by pre-existing content assertions (L126-153) confirming the correct deals still surface
  by title through the renamed tables.
- Result: **5/5 passed** (was 4, +1 new). File went 4→5 tests confirming the new assertion ran and passed.
- **Gap (not yet proven):** the assertion runs against the `visibleDealsForBranch` query-mirror
  helper, NOT an actual `GET /api/branches/:id` supertest call, and does NOT assert that the
  internal `promotion_id`/`benefit_product_id` columns are ABSENT from the response. Full
  HTTP-envelope verification + field-absence assertion is pending — a follow-up supertest
  assertion should be added to close this.

### Exit-gate command output

```
$ pnpm --filter @jojopotato/api typecheck
> tsc --noEmit
# 0 errors

$ pnpm --filter @jojopotato/api test
 Test Files  25 passed (25)
      Tests  314 passed (314)
   Duration  65.65s
   ✓ src/routes/__tests__/deals.test.ts (13 tests) 792ms
   ✓ src/__tests__/branch-detail-route.test.ts (5 tests) 371ms
```

Zero regressions across the full suite.

---

## Plan Deviations

None. All checklist items A1-A3, B1-B4 satisfied. Steps A1/A2/A3/B1/B2 were satisfied by
verification (Phase 1 already performed the mechanical repoint); Steps B3/B4 ran green. The only
added code (AC10b assertion) is exactly the "add a minimal assertion if no test freezes the field"
action the task authorized — within blast radius (`packages/api/src/__tests__/branch-detail-route.test.ts`,
already listed in the plan's Blast Radius).

---

## Test Infra Gaps Found

- `branch-detail-route.test.ts` remains a **query-logic mirror** (not an HTTP-layer test) — the
  `GET /api/branches/:id` HTTP envelope key (`deals:` vs `offers:`) is still a documented known-gap
  (`api-http`), unchanged by this phase. The new AC10b assertion proves the deal-item COLUMN field
  freeze at the query-mirror level (the likely rename-breakage vector), not the HTTP envelope key.
  Freezing the HTTP envelope key would require a supertest server (new scaffolding) — out of scope
  and pre-existing. No new gap introduced.

---

## Closeout Packet

- **Selected plan:** phase-04-public-repoint_PLAN_16-07-26.md
- **Finished:** repoint verification (all 4 files) + AC10b wire-freeze assertion added; typecheck 0
  errors; full suite 314/314.
- **Verified:** AC10 (pre-existing), AC10b (new), typecheck, full-suite regression — all green.
- **Unverified:** none in scope. (HTTP-envelope-key freeze remains a pre-existing, out-of-scope known-gap.)
- **Cleanup remaining:** none. Do NOT commit (per task). Since the repoint itself was folded into
  Phase 1's commit `502a01e`, the ONLY uncommitted diff from this phase is the single AC10b test
  assertion in `branch-detail-route.test.ts` — the user commits manually.
- **Best next state:** Ready for UPDATE PROCESS (tick Phase 4 Steps 5-7; update umbrella
  `## Current Execution State`; hand commit to user).

---

## Forward Preview

- **Test Infra Found:** API vitest+supertest suite runs green against native Postgres at
  localhost:5432 (jojo/jojo). `offers`/`offer_branches`/`offer_products` tables confirmed present
  (Phase 1 migration applied). Full suite ~66s.
- **Blast Radius Changes:** one-line-scope diff — `packages/api/src/__tests__/branch-detail-route.test.ts`
  (+1 `it` block). No route/handler/schema files touched this phase.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/api typecheck` && `pnpm --filter @jojopotato/api test`
  (requires Postgres up + migrated).
- **Dependency Changes:** none.
