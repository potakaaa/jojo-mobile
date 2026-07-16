---
name: plan:adm-008-coupons-umbrella
description: "ADM-008 Promotions/Offers/Coupon-codes — umbrella/orchestration plan for the 5-phase program"
date: 16-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: umbrella
---

# ADM-008 Coupons — Umbrella Plan

**Date:** 16-07-26
**Complexity:** COMPLEX
**Status:** ⏳ PLANNED (Phase 1 ready — validate-contract seeded CONDITIONAL from source plan VALIDATE pass)

- Program type: PHASE PROGRAM (5 phases, mostly sequential with one parallel-safe join: Phase 3 ∥ Phase 4)
- Date: 16-07-26
- Feature folder: `process/features/admin-dashboard/`
- **Source plan (historical, do not execute from):** `adm-008-coupons_PLAN_16-07-26.md` — the original
  single-COMPLEX-plan artifact, already RESEARCH→INNOVATE→PLAN→VALIDATE'd in full (VALIDATE ran
  16-07-26, Gate: CONDITIONAL, `generated-by: outer-pvl`). This umbrella + its 5 phase plans are a
  **faithful split** of that plan — no re-architecture, no re-opened Locked Decisions or ACs. The
  source plan is marked `SUPERSEDED-BY-PROGRAM` and kept as the historical record / origin of the
  validate-contract rows seeded into each phase below.

---

## Program Goal Charter

```
ADM-008 Coupons — Program Goal Charter

North star:
- Give admins a real, database-backed way to author promotional coupon codes (Promotion → Offer →
  Coupon), replacing the hardcoded static deals-catalog.ts promo-code list with real burnable
  `coupons` rows that reuse the exact redemption/burn mechanism reward coupons already use.

Definition of done (an unattended agent must be able to do all of these):
1. Create a Promotion (name, description, time window) via the admin API/UI.
2. Create an Offer (discount mechanic, value, caps, window, optional Promotion link) via the
   admin API/UI.
3. Bulk-generate N unique coupon codes for an Offer, or issue one targeted coupon to a specific
   customer, with zero code collisions (proven under forced-collision retry).
4. A customer can redeem a valid admin-issued coupon exactly once; the discount applies correctly;
   the coupon cannot be redeemed twice, is rejected outside its window, and rejects when the cart
   contains an is_deal (bundle) product.
5. Existing reward-backed coupon redemption keeps working unmodified (zero regression).
6. The renamed deals→offers schema does not break the two legacy public read surfaces
   (GET /deals, GET /deals/:id, GET /api/branches/:id) that the mobile Deals tab still reads.

What "verified" means (program level):
- Every phase's own Fully-Automated test gate is green AND the full
  `pnpm --filter @jojopotato/api test` regression suite is green AND
  `pnpm --filter @jojopotato/api typecheck` is clean AND (for Phase 5 only)
  `pnpm --filter @jojopotato/admin typecheck` + `test` are green.
- validate-contract gates must be recorded alongside phase gates and regression evidence for a
  phase to reach VERIFIED. A phase without a validate-contract (or documented skip reason)
  cannot be marked VERIFIED.
- Known-Gap is BANNED for any money-correctness AC (AC3, AC5, AC6, AC11) — every one of these
  must be proven by a real, passing Fully-Automated test, never left as a named residual.

Scope tiers → phase mapping:
- Tier 1 (schema foundation: rename + new tables) → Phase 1
- Tier 2 (redemption-path correctness: resolver + burn + is_deal guard) → Phase 2
- Tier 3 (admin authoring surface: Promotions/Offers/Coupons CRUD) → Phase 3
- Tier 4 (public-read backward compatibility) → Phase 4
- Tier 5 (admin UI) → Phase 5
- This program retires the static `deals-catalog.ts` promo-code list (Tier 2, Phase 2).

Explicitly out of scope (deferred tier):
- `apps/mobile` coupon-consuming screens (`rewards/coupons.tsx`, `use-my-coupons.ts`,
  `coupon-api.ts`) — zero changes, per source-plan Constraints.
- ADM-004's bundle-Deal CRUD (`routes/admin/deals.ts`, `is_deal`/`deal_components` schema) —
  zero changes, unrelated feature.
- Extending `POST /coupons/apply` preview payload with cart-line context (the is_deal guard is
  enforced only at `POST /orders` placement time, per Locked Decision 6).

Hard safety constraints (non-negotiable, per phase):
- Never edit an already-applied migration file (0011 is new; 0000-0010 are locked history).
- Never rename/repoint `GET /deals`/`GET /deals/:id`/`GET /api/branches/:id`'s response SHAPE —
  only their internal table symbols rename (Locked Decision 4 + 7B).
- Never let a bulk (`user_id IS NULL`) coupon and a targeted (`user_id` set) coupon double-claim —
  the atomic `UPDATE ... WHERE status='available' AND (user_id IS NULL OR user_id=$requester)` is
  the single source of truth; no parallel burn path.
- The Locked Decision 1 Branch-1 resolver fix (`reward_id IS NOT NULL` scoping) is REQUIRED before
  AC5 can pass — do not implement the resolver extension without it.
- High-risk evidence pack required before finalize (schema migration + public API +
  billing/discount-adjacent logic — per `orchestration.md` §High-Risk Execution Handoff).
- Commit each phase's execution changes before starting the next phase. Keep process/plan/context
  commits separate from execution commits. **Per user requirement: hand staging commands + a
  conventional-commit summary to the USER at each phase's commit checkpoint — the program does
  NOT auto-commit and does NOT bundle multiple phases into one commit.**
```

---

## Locked Decisions (program-wide — inherited verbatim from the source plan, do not re-litigate)

See the source plan (`adm-008-coupons_PLAN_16-07-26.md`) §Locked Decisions 1–7 for full text. Every
phase plan below cites the specific Locked Decisions relevant to its own scope; do not re-derive or
reinterpret them independently. Summary:

1. **Resolver** — extend `resolveCouponDiscount()` with a new offer-coupon branch; retire
   `deals-catalog.ts`. **VALIDATE-locked fix (required):** Branch 1 (existing reward-coupon lookup)
   must additionally require `reward_id IS NOT NULL`, or a targeted offer-coupon incorrectly matches
   it first and gets wrongly rejected (`no_eligible_product`).
2. **Issuance/`user_id`** — nullable `coupons.user_id`; claim-on-redeem folded into the existing
   atomic burn UPDATE via `COALESCE(user_id, $requester)`.
3. **Migration `0011_{name}.sql`** — non-destructive renames (`deals`→`offers`,
   `deal_products`→`offer_products`, `deal_branches`→`offer_branches`, `coupons.deal_id`→`offer_id`,
   `coupons.user_id` nullable) + new `promotions` table + `offers.promotion_id` nullable FK. Must
   preserve `coupons_user_reward_unique` partial index.
4. **Public `GET /deals`/`GET /deals/:id`** — repoint table import only; response shape UNCHANGED.
5. **Cardinality** — `offers.promotion_id` plain nullable FK (Promotion 1 — 0..N Offer).
6. **`is_deal` mutual exclusion (AC6)** — enforced inside `POST /orders` placement transaction only.
7. **Full rename inventory + wire-freeze rule (VALIDATE-added, LOCKED):**
   - A. Schema/DB-layer renames: `deals`→`offers`, `deal_products`→`offer_products` (+`deal_id`→
     `offer_id`), `deal_branches`→`offer_branches` (+`deal_id`→`offer_id`), `coupons.deal_id`→
     `offer_id`. `orders.deal_id` STAYS named `deal_id` (only its schema-file import target
     changes — column follows the renamed FK target automatically).
   - B. Wire-layer freeze: `ApiDeal`, `POST /orders`'s `dealId` field, `GET /coupons`'s `dealId`
     field (source renamed internally to `coupon.offer_id`, field NAME preserved), and
     `GET /deals`/`GET /deals/:id`/`GET /api/branches/:id` response shapes are ALL wire-frozen —
     never rename these at the HTTP contract layer, only their internal Drizzle symbols.

**Locked, non-reopened SPEC Open Questions** (source plan, do not reopen):
- Malformed coupon-generation payload → 400 (matches ADM-004 convention).
- "Generate Coupons" batch expiry → inherits Offer's `end_at` unless admin overrides per-batch.
- `deals-catalog.ts` → delete once resolver swap lands (Phase 2), contingent on an import-scan
  finding zero other importers; else leave dead + backlog note.

---

## Stable Program Goal (copy-paste this to start autonomous execution)

```
SESSION GOAL: admin-dashboard — ADM-008 Coupons (Promotions/Offers/Coupon-codes)
Ref: process/features/admin-dashboard/active/adm-008-coupons_16-07-26/adm-008-coupons_UMBRELLA_PLAN_16-07-26.md

TARGET: Complete ALL 5 phases until:
- All phase Fully-Automated test gates green (AC1-AC11, AC10b — no Known-Gap on money-correctness)
- Full pnpm --filter @jojopotato/api test suite green + typecheck clean (regression bar)
- pnpm --filter @jojopotato/admin typecheck + test green (Phase 5 only)
- Test tiers: automated (iterate-until-green) / hybrid (fix-if-in-blast-radius) / agent-probe (record-judgment)

AUTONOMY: Before ANY subagent spawn, read:
1. Umbrella ## Current Execution State → loop step + validate-contract status
2. Phase plan ## Phase Loop Progress → first unchecked box = next subagent to spawn

PER-PHASE LOOP (7-step inner loop R -> I -> P -> PVL -> E -> EVL -> UP, never skip, never reorder; SKIPS SPEC):
  1. RESEARCH -> 2. INNOVATE -> 3. PLAN-SUPPLEMENT -> 4. PVL -> 5. EXECUTE -> 6. EVL -> 7. UPDATE-PROCESS
- PLAN-SUPPLEMENT: plan-agent writes research/innovate gaps into phase plan (or marks "n/a — clean")
- PVL NEVER skipped; contract must follow example-validate-output.md full format;
  partial contract (missing Plan updates applied / Execute-agent instructions / Test gates) =
  blocked same as placeholder. Each phase plan's Validate Contract is SEEDED from the source
  plan's already-run VALIDATE pass (CONDITIONAL) — re-confirm via a fresh inner PVL pass since
  code has not yet been touched for these phases.
- Every subagent FIRST ACTION: run vc-context-discovery + vc-plan-discovery
- Every phase-END: invoke vc-agent-strategy-compare for next step strategy recommendation
- Every phase's UPDATE-PROCESS step ends with a COMMIT CHECKPOINT: hand staging commands + a
  conventional-commit summary to the USER — do NOT auto-commit, do NOT bundle phases.

Report via phase reports. No approval between phases unless hard stop hit.

HARD STOPS (pause, wait for user):
- Never edit an already-applied migration file (0011 new; 0000-0010 locked history)
- Never rename GET /deals, GET /deals/:id, GET /api/branches/:id response SHAPE
- Never allow bulk+targeted coupon double-claim (single atomic burn UPDATE only)
- Locked Decision 1 Branch-1 fix (reward_id IS NOT NULL) REQUIRED before AC5 resolver work
- High-risk evidence pack required before finalize (schema + public API + billing-adjacent)
- Net gate = BLOCKED with no backlog resolution path
- Plan file marks "pause required" or agent count > 100

SAFETY (never override):
- Commit each phase's execution changes before advancing; process and execution commits separate
- Money-correctness ACs (AC3, AC5, AC6, AC11) — Known-Gap BANNED, always real Fully-Automated test

TEST GATES (every phase exit):
  pnpm --filter @jojopotato/api typecheck
  pnpm --filter @jojopotato/api test   (docker compose up -d && pnpm --filter @jojopotato/api db:migrate first)
  pnpm --filter @jojopotato/admin typecheck   (Phase 5 only)
  pnpm --filter @jojopotato/admin test        (Phase 5 only)

VALIDATE CONTRACT: Per-phase contracts seeded from source plan's outer-pvl VALIDATE pass;
re-confirmed by vc-validate-agent inner PVL per phase before EXECUTE.

START: Phase 1, loop step PVL (validate-contract seeded CONDITIONAL from source plan — re-run
inner PVL to confirm/finalize before EXECUTE). Spawn vc-validate-agent for Phase 1.
```

---

## Phase Sequence

| Phase | Plan file | Scope summary | Depends on |
|---|---|---|---|
| 1 — Schema migration | `phase-01-schema-migration_PLAN_16-07-26.md` | Migration `0011`: rename deals→offers/offer_products/offer_branches, coupons.deal_id→offer_id + nullable user_id, new promotions table, promotion_id FK; schema-file renames; orders.ts/seed.ts/smoke.test.ts import-target updates; mechanical safety-net grep | — |
| 2 — Resolver + burn + orders.ts guard | `phase-02-resolver-burn-guard_PLAN_16-07-26.md` | Extend `resolveCouponDiscount()` with Branch-1 fix + new offer-coupon branch; retire `deals-catalog.ts`; extend burn UPDATE with COALESCE claim; extend `orders.ts`'s dealId-XOR-couponCode guard for is_deal carts; extend concurrency race test | Phase 1 |
| 3 — Admin CRUD routes | `phase-03-admin-crud_PLAN_16-07-26.md` | `admin/promotions.ts`, `admin/offers.ts`, `admin/coupons.ts` (generate + list); aggregator append; serializers; 3 integration test files | Phase 1; parallel-safe with Phase 4 |
| 4 — Public GET /deals repoint | `phase-04-public-repoint_PLAN_16-07-26.md` | `routes/deals.ts` + `index.ts`'s `GET /api/branches/:id` symbol rename; `deals.test.ts`/`branch-detail-route.test.ts` fixture updates | Phase 1; parallel-safe with Phase 3 |
| 5 — apps/admin UI | `phase-05-admin-ui_PLAN_16-07-26.md` | nav-config entries; promotions/offers feature folders; routes (Outlet split pattern); component tests; Agent-Probe walkthrough | Phase 3 |

### Join Conditions

- Phase 2, 3, 4 MUST NOT start until Phase 1 exit gate passes (`pnpm --filter @jojopotato/api
  typecheck` clean + migration applied cleanly).
- Phase 3 and Phase 4 are parallel-safe once Phase 1 lands (independent file sets: admin routes
  vs public routes — both read the same renamed schema but touch disjoint route files).
- Phase 5 MUST NOT start until Phase 3 exit gate passes (needs the admin CRUD endpoints to build UI
  against). Phase 5 does not hard-depend on Phase 2 or Phase 4, but "Generate Coupons" is not
  meaningfully testable end-to-end (redemption) until Phase 2 also lands — recommend Phase 2 lands
  before Phase 5 starts even though not a hard blocker.

---

## Per-Phase Entry / Exit Gates

| Phase | Entry | Exit gate |
|---|---|---|
| 1 | Program start | `pnpm --filter @jojopotato/api db:migrate` applies cleanly; `coupons_user_reward_unique` index confirmed intact via `\d coupons`; `pnpm --filter @jojopotato/api typecheck` clean; Phase 1 safety-net grep clean |
| 2 | Phase 1 exit met | Extended `coupons.integration.test.ts` (offer-coupon apply/order/re-apply-after-use incl. TARGETED case) + `orders.test.ts` (extended concurrency race case) green; full `api test` suite green (AC8 regression) |
| 3 | Phase 1 exit met | 3 new admin integration test files green (AC1-AC4, AC9, AC11); full `api test` suite green |
| 4 | Phase 1 exit met | `deals.test.ts` + `branch-detail-route.test.ts` re-run green (AC10, AC10b); full `api test` suite green |
| 5 | Phase 3 exit met | `apps/admin` typecheck + test green; Agent-Probe walkthrough recorded (create Promotion → create Offer → Generate Coupons → view list → copy code) |

---

## Per-Phase Loop

Each phase executes the canonical 7-step inner loop `R → I → P → PVL → E → EVL → UP`. This inner
loop SKIPS SPEC — SPEC runs once in the outer program loop (already run for this program — see the
source plan's SPEC file). The 7 steps map to:

1. **RESEARCH** — spawn research-agent: load context, read prior phase reports, re-verify the
   phase's Touchpoints against the real branch (schema/route files may have drifted further since
   the source plan's VALIDATE pass), check plan drift.
2. **INNOVATE** — spawn innovate-agent: only if research surfaces a genuinely new design fork not
   covered by the Locked Decisions above (expected to be rare/none — this is a faithful split, not
   a redesign).
3. **PLAN-SUPPLEMENT** — spawn plan-agent: if research/innovate found gaps not in the phase
   checklist, add them; otherwise mark "n/a — research clean".
4. **PVL** — spawn vc-validate-agent: the seeded validate-contract (from the source plan's
   outer-pvl VALIDATE pass) is a strong prior — re-confirm it against the phase's current real-code
   state (inner PVL), do not re-derive from scratch.
5. **EXECUTE** — spawn vc-execute-agent per the phase checklist and validate-contract.
6. **EVL** — spawn vc-tester: run the phase's exact test gates to green; register follow-up stubs.
7. **UPDATE-PROCESS** — write phase report; rewrite this umbrella's `## Current Execution State`
   (overwrite, not append); **commit checkpoint: hand staging commands + a conventional-commit
   summary to the USER, who commits manually.**

**PVL is NEVER skipped.** A placeholder `## Validate Contract` = blocked.

---

## Autonomous Execution Rules (During /goal)

During /goal execution of this phase program:
- Agent self-decides at all V5 gates — no user approval needed between phases.
- CONDITIONAL net gate: proceed autonomously, fixes applied in-flight, gaps on record.
- BLOCKED net gate: document items in backlog, continue with remaining phase plans.
- Hard stops (must pause for user approval): irreversible/outward-facing action without explicit
  contract instruction (push to remote, deploy to production, live-DB migration outside the
  documented `db:migrate` flow), plan file explicitly marks "pause required".
- **Commit checkpoints are NOT autonomous** — per user requirement, staging + commit-message
  drafting is handed to the user at every phase's UPDATE-PROCESS step; the program never
  auto-commits and never bundles multiple phases into one commit.
- Agent writes phase reports, updates phase plans, creates new sub-plans as needed — all
  autonomously.

---

## Global Constraints

- Never lower validator checks or widen an allowlist without user approval.
- After Phase 1 completes, EVERY later phase's first RESEARCH step must re-read the real current
  state of any file it touches (do not trust the source plan's pre-Phase-1 file citations once
  Phase 1 has landed).
- Preserve the wire-freeze rule (Locked Decision 7B) in every phase touching a public route.
- High-risk evidence pack required before finalize (Phase 1 through Phase 4 collectively).
- Money = cents at boundary throughout. Known-Gap banned for money-correctness ACs.
- Commit each phase's execution changes before starting the next phase (user-driven, see above).
  Keep process/plan/context commits separate from execution commits.

---

## Durable Report Destinations

| Phase | Report path (flat in this task folder) |
|---|---|
| 1 — Schema migration | `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-01-schema-migration_REPORT_{dd-mm-yy}.md` |
| 2 — Resolver + burn + guard | `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-02-resolver-burn-guard_REPORT_{dd-mm-yy}.md` |
| 3 — Admin CRUD | `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-03-admin-crud_REPORT_{dd-mm-yy}.md` |
| 4 — Public repoint | `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-04-public-repoint_REPORT_{dd-mm-yy}.md` |
| 5 — apps/admin UI | `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-05-admin-ui_REPORT_{dd-mm-yy}.md` |

---

## Program Status Table

| Phase | Status |
|---|---|
| 01 — Schema migration | ✅ VERIFIED (commit `502a01e`) |
| 02 — Resolver + burn + orders.ts guard | ✅ VERIFIED (commit `e55ee0a`) |
| 03 — Admin CRUD routes | ✅ VERIFIED (commit `f14d887`) |
| 04 — Public GET /deals repoint | ✅ VERIFIED (commit `0001118`) |
| 05 — apps/admin UI | ✅ VERIFIED (commit `cca6816`; follow-up fix `ab53caf`) |

Status values: ⏳ PLANNED | 🔨 CODE DONE | 🧪 TESTING | ✅ VERIFIED | 🚧 BLOCKED | ✅ COMPLETE

---

## Touchpoints

See each phase plan's own `## Touchpoints` section for the exact per-phase file list. Full
program-wide touchpoint inventory (source of truth, unmodified) lives in the source plan's
`## Touchpoints` section (both the original and VALIDATE-added rows) — every row there is assigned
to exactly one phase below; no row was dropped or duplicated across phases.

---

## Public Contracts

- `GET /deals`, `GET /deals/:id`, `GET /api/branches/:id` response shapes UNCHANGED (Locked
  Decision 4 + 7B) — Phase 4.
- `POST /orders` request/response shape UNCHANGED except a new 400 rejection path (is_deal cart +
  couponCode) — Phase 2.
- `GET /coupons`'s `dealId` field name UNCHANGED (source column renamed internally only) — Phase 2.
- `POST /coupons/apply` request/response shape UNCHANGED — Phase 2.
- New admin surfaces: `GET/POST/PATCH /api/admin/promotions`, `GET/POST/PATCH /api/admin/offers`,
  `POST /api/admin/coupons/generate`, `GET /api/admin/coupons` — all `requireAdmin`-gated — Phase 3.

---

## Blast Radius

- **Packages touched:** `packages/api` (schema, routes, admin routes, lib), `packages/types`
  (coupon/offer type renames), `packages/utils` (deletion of `deals-catalog.ts`), `apps/admin`
  (new feature folders, nav config, routes).
- **Risk class:** SCHEMA MIGRATION (rename, additive-only, non-destructive) + PUBLIC API CONTRACT
  (repoint, shape-preserving) + billing/discount-adjacent logic (coupon redemption). Qualifies for
  the 5-artifact high-risk evidence pack at EXECUTE time.
- **File count estimate:** ~27 touchpoints total across the program (see source plan Blast Radius
  section for the exact count derivation) — crosses the 5+ file / high-risk threshold. Phase 3 and
  Phase 4 are recommended for PARALLEL SUBAGENTS or AGENT TEAM coordination once Phase 1 lands,
  since both touch `db/schema/index.ts`/shared serializers and should coordinate to avoid
  conflicting edits.
- No new runtime surface, no new dependency, no new deploy target.

---

## Verification Evidence

Program-level regression bar (run after every phase, not just at program end):

```bash
pnpm --filter @jojopotato/api typecheck
# Expected: 0 errors

pnpm --filter @jojopotato/api test
# Expected: full suite green, 0 regressions (requires: docker compose up -d && pnpm --filter @jojopotato/api db:migrate first)

pnpm --filter @jojopotato/admin typecheck   # Phase 5 only
pnpm --filter @jojopotato/admin test        # Phase 5 only
# Expected: 0 errors / all green
```

Per-AC evidence table: see each phase plan's own `## Verification Evidence` section (split from
the source plan's single 18-row table, one AC-cluster per phase).

---

## Resume and Execution Handoff

- Selected plan file path (umbrella): `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/adm-008-coupons_UMBRELLA_PLAN_16-07-26.md`
- Last completed phase: none — program just split from the source single-plan artifact; no EXECUTE
  has happened yet for any phase.
- Validate-contract status: seeded (CONDITIONAL, from source plan's outer-pvl VALIDATE pass) into
  each phase plan below — needs a fresh inner PVL confirmation pass per phase before EXECUTE.
- Next step for a fresh agent: Read this umbrella plan, read `phase-01-schema-migration_PLAN_16-07-26.md`
  in full (including its seeded Validate Contract), run Phase 1's RESEARCH step (re-verify the real
  branch state — schema/route files may have drifted since the source plan's VALIDATE pass), then
  proceed through the 7-step inner loop.
- Current phase: Phase 1 — Schema migration.
- Next action: Spawn vc-research-agent for Phase 1 (or, since the source plan's research/validate
  content is already very fresh — same-day, same-branch — orchestrator may elect to spawn
  vc-validate-agent directly for Phase 1's PVL re-confirmation; either is acceptable, PVL must not
  be skipped either way).
- Execute-agent start instruction: Do NOT spawn execute-agent until Phase 1's `## Validate Contract`
  reads a confirmed (not placeholder, not stale) Gate: PASS or accepted CONDITIONAL.

---

## Current Execution State

**Phase-boundary correction (Option A, approved 16-07-26):** Phase 1 now = full atomic mechanical rename (schema + migration + 7 consumer-file repoints, since the deals→offers rename breaks typecheck for those consumers otherwise); Phase 2 = logic only (resolver/burn/guard) on the already-renamed symbols; Phase 4 = public-contract verification only on the already-renamed symbols. Wire-freeze (Locked Decision 7B) unaffected.

Last updated: 16-07-26 (UPDATE PROCESS — all 5 phases closed out)
Completed phases: 1, 2, 3, 4, 5 (all 5/5 — program is CODE-COMPLETE)
Current phase: none — all phases delivered; program held OPEN in `active/` (not archived)
Current loop step: n/a — every phase reached UPDATE-PROCESS and is EVL-green
Validate-contract status: confirmed via inner PVL per phase (all 5), EXECUTE + EVL green for all 5
Program Net Gate: PASS (all phase exit gates green; full `pnpm --filter @jojopotato/api test`
  313/313 → 314/314 after Phase 4; `pnpm --filter @jojopotato/admin typecheck`+`test` 21/21 green
  after Phase 5)
Latest validator run: 16-07-26 — `validate-context-discovery.mjs` (see this UPDATE PROCESS report)

**Delivered — commit ledger (branch `feat/adm-008-coupons`, NOT merged, PR pending):**
- Phase 1 (Schema migration): `502a01e` — migration `0011` (deals→offers atomic rename +
  `promotions` table), 271/271 tests.
- Phase 2 (Resolver + burn + is_deal guard): `e55ee0a` — DB-backed offer-coupon resolver branch,
  Branch-1 `reward_id IS NOT NULL` fix, claim-on-redeem atomic burn, `is_deal`×couponCode 400 guard;
  retired static `deals-catalog.ts`, 279/279 tests.
- Phase 3 (Admin CRUD): `f14d887` — `admin/{promotions,offers,coupons}.ts` + bulk/targeted coupon
  issuance, 313/313 tests (34 new).
- Phase 4 (Public repoint verification): `0001118` — confirmed `GET /deals` + `GET /api/branches/:id`
  wire-frozen post-rename, +1 AC10b assertion, 314/314 tests.
- Phase 5 (apps/admin UI): `cca6816` — Promotions + Offers UI, Generate-Coupons panel
  (bulk+targeted), coupon list sub-view; typecheck 0, 21/21 component tests, build clean.
- Follow-up UI fix: `ab53caf` — Offer create form Mechanic dropdown restricted to the 4
  coupon-based types (percentage_discount, fixed_discount, free_item, free_upgrade); dropped
  buy_one_take_one + bundle (deal/bundle-style, non-discounting). UI-only, no test-count change.

**Program status: CODE-COMPLETE, OPEN.** This task folder stays in `active/` — the user has
explicit follow-up exploration work planned on ADM-008 (see backlog note filed this pass for the
known free_item/free_upgrade redemption-math gap). Do NOT archive to `completed/` until that
follow-up work concludes or the user explicitly closes the program.

Loop step values: RESEARCH | INNOVATE | PLAN-SUPPLEMENT | PVL | EXECUTE | EVL | UPDATE-PROCESS
Orchestrator rule: read "Current loop step" and "validate-contract status" before spawning any
subagent. Never spawn execute-agent when loop step is RESEARCH, INNOVATE, PLAN-SUPPLEMENT, or PVL.

Note: The Stable Program Goal above is fixed. This section is the only part that changes —
update-process-agent rewrites it after every phase closeout (overwrite, not append).

---

## Validate Contract

**Program-level contract is NOT written here** — validate-contracts are per-phase (see each phase
plan's own `## Validate Contract` section, seeded from the source plan's single VALIDATE pass and
split by AC-cluster). This umbrella coordinates phase sequencing only.
