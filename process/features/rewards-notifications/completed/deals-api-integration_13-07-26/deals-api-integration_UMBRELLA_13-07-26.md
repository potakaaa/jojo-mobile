---
name: plan:deals-api-integration-umbrella
description: "Deals API Integration — umbrella/orchestration plan for the 3-phase backend-wiring program (DEAL-001/002/003)"
date: 13-07-26
metadata:
  node_type: memory
  type: plan
  feature: rewards-notifications
  phase: umbrella
---

# Deals API Integration — Umbrella Plan

**Date:** 13-07-26
**Complexity:** COMPLEX
**Status:** ✅ COMPLETE — all 3 phases VERIFIED (14-07-26); archived to `completed/`

- Program type: PHASE PROGRAM (3 phases, sequential with gated joins)
- Feature folder: `process/features/rewards-notifications/`
- Program task folder: `process/features/rewards-notifications/active/deals-api-integration_13-07-26/`
- Predecessor: `deals-screens_13-07-26` (screens-only, mock-fed Deals UI already built — this program replaces the mock data source with real backend wiring)

**TL;DR:** Turn the already-built (but mock-fed) Deals feature into a real backend-wired one across 3 gated phases — real Deals list (P1), real Deal Details + eligibility (P2), and real apply-deal-in-cart with server-authoritative placement validation + `orders.deal_id` migration (P3). Deals ONLY; coupons deferred. P3 is high-risk (billing + schema migration + transaction) and requires a manual-first evidence pack.

---

## Program Goal Charter

```
Deals API Integration — Program Goal Charter

North star:
- Replace the Deals feature's mock data source with real backend wiring so the Deals list, Deal
  Details + eligibility, and in-cart apply are driven by the server — with server-authoritative
  discount validation at order placement. Deals only; coupons deferred.

Definition of done (an unattended agent must be able to do all of these):
1. `GET /deals?branchId=` returns real, active, in-window, branch-scoped deals from Postgres via a
   new `serializeDeal` (cents at the HTTP boundary; percentage values NOT ×100). The mobile Deals
   list renders from this endpoint (react-query), not from MOCK_DEALS.
2. `GET /deals/:id` returns a single serialized deal; the Deal Details screen and the existing
   6-step client eligibility engine run against real deal data (all 6 deal types display/evaluate).
3. `POST /orders` accepts an optional `dealId`, re-runs eligibility server-side inside the placement
   transaction against a freshly-read deal + usage count, computes a REAL `discount_total`
   (percentage_discount + fixed_discount only), writes `total = subtotal − discount`, persists
   `orders.deal_id`, all atomically. The cart sends `dealId` at checkout.

What "verified" means (program level):
- packages/api endpoints (P1/P2/P3 backend) are covered by REAL automated vitest+supertest suites
  (docker compose up -d + db:migrate preconditions) — these are the hard gate.
- apps/mobile client behavior has NO RN test runner (project-wide gap) — it is Agent-Probe
  (manual simulator walkthrough) only, recorded as such; never claimed as automated coverage.
- validate-contract gates must be recorded alongside phase gates and regression evidence for a
  phase to reach VERIFIED. A phase without a validate-contract (or documented skip reason) cannot
  be marked VERIFIED.

Scope tiers → phase mapping:
- Tier 1 (read: Deals list) → Phase 1 (DEAL-001 / #22). LOW risk.
- Tier 2 (read: Deal Details + eligibility) → Phase 2 (DEAL-002 / #23). MEDIUM risk.
- Tier 3 (write: cart apply + placement validation + migration) → Phase 3 (DEAL-003 / #24). HIGH risk.
- This program retires Tiers 1–3 of the Deals backend wiring.

Explicitly out of scope (deferred tier):
- Coupons entirely: no /coupons route, no coupon seed, no coupon type↔DB reconciliation, no Coupon
  Wallet. #24's "apply deal or coupon" = apply DEAL only (the existing cart "coupon" input already
  resolves against deals — that stays).
- In-cart APPLY discount math for the 4 complex deal types (buy_one_take_one, free_item,
  free_upgrade, bundle) — shown/evaluated but marked not-yet-applicable in cart; never apply a
  guessed discount.
- Star/rewards accrual, live payment processing, a separate deal_usages table.

Hard safety constraints (non-negotiable, per phase):
- MONEY BOUNDARY: DB stores numeric(10,2) PHP decimal; serializeDeal converts to cents at the HTTP
  boundary (follow numericToCents/centsToNumeric in packages/api/src/routes/lib/serializers.ts).
  API + client contract is cents. EXCEPTION: percentage_discount values are a percent on both sides
  — do NOT ×100 them (see packages/types/src/deals.ts VALUE-UNIT NOTE).
- %/FIXED-ONLY APPLY: in-cart apply computes real discount ONLY for percentage_discount +
  fixed_discount. The other 4 types are never charged a guessed discount.
- ATOMIC USAGE + DISCOUNT: server-side eligibility re-validation, discount computation, and
  orders.deal_id persistence in Phase 3 happen inside the single POST /orders transaction.
- USAGE SOURCE = derive from orders.deal_id (no new deal_usages table).
- ELIGIBILITY OWNERSHIP: server-authoritative re-validation at order placement is the source of
  truth for what is charged; the client engine (apps/mobile/src/features/deals/lib/eligibility.ts)
  stays as DISPLAY/UX only.
- PRESERVE useReorderConflicts in cart.tsx (from the order-history batch) — Phase 3 must keep its
  import + conflict-notice render path intact (disjoint from the coupon/deal slot).
- Phase 3 requires the High-Risk Execution Handoff (manual-first evidence pack per
  vc-risk-evidence-pack) before finalize.
- Commit each phase's execution changes before starting the next phase. Keep process/plan/context
  commits separate from execution commits.
```

---

## Stable Program Goal (copy-paste this to start autonomous execution)

```
SESSION GOAL: rewards-notifications — Deals API Integration
Ref: process/features/rewards-notifications/active/deals-api-integration_13-07-26/deals-api-integration_UMBRELLA_13-07-26.md

TARGET: Complete Phases 1→2→3 until:
- packages/api vitest+supertest suites for /deals, /deals/:id, and POST /orders (with dealId) pass
- all 3 phase exit gates green; migration 0004 applied and orders.deal_id persists
- Test tiers: automated (packages/api — iterate-until-green) / agent-probe (apps/mobile — record judgment; NO RN runner)

AUTONOMY: Before ANY subagent spawn, read:
1. Umbrella ## Current Execution State → loop step + validate-contract status
2. Phase plan ## Phase Loop Progress → first unchecked box = next subagent to spawn

PER-PHASE LOOP (7-step inner loop R -> I -> P -> PVL -> E -> EVL -> UP, never skip, never reorder; SKIPS SPEC — umbrella SPEC governs):
  1. RESEARCH -> 2. INNOVATE -> 3. PLAN-SUPPLEMENT -> 4. PVL -> 5. EXECUTE -> 6. EVL -> 7. UPDATE-PROCESS
- PLAN-SUPPLEMENT: plan-agent writes research/innovate gaps into the phase plan (or marks "n/a — clean")
- PVL NEVER skipped; contract per example-validate-output.md full format; partial contract = blocked
- Every subagent FIRST ACTION: run vc-context-discovery + vc-plan-discovery
- Every phase-END: invoke vc-agent-strategy-compare for next-step strategy
Report via phase reports. No approval between phases unless a hard stop is hit.

HARD STOPS (pause, wait for user):
- Phase 3 order-placement/discount/migration change without the manual-first high-risk evidence pack
- Any irreversible/outward-facing action (deploy, live payment, destructive data op)
- Net gate = BLOCKED with no backlog resolution path
- Validate-contract is placeholder and vc-validate-agent cannot run

SAFETY (never override):
- Money boundary: cents at HTTP boundary; percentage_discount NOT ×100
- In-cart apply: real discount ONLY for percentage_discount + fixed_discount
- Server-authoritative eligibility + discount + orders.deal_id write are atomic in POST /orders tx
- Usage count derives from orders.deal_id (no deal_usages table)
- Preserve useReorderConflicts import + render path in cart.tsx
- Coupons stay out of scope (deals only)
- Commit each phase before advancing; process and execution commits separate

TEST GATES (every phase exit):
  node .claude/skills/vc-audit-plans/scripts/validate-plan-inventory.mjs
  node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs <phase-plan.md>
  node .claude/skills/vc-generate-phase-program/scripts/validate-umbrella-artifact.mjs process/features/rewards-notifications/active/deals-api-integration_13-07-26/deals-api-integration_UMBRELLA_13-07-26.md
  node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs <phase-plan.md>
  pnpm --filter @jojopotato/api test   (docker compose up -d + db:migrate first)

VALIDATE CONTRACT: Per-phase contracts written by vc-validate-agent into each phase plan before EXECUTE.

START: Phase 1, loop step PVL (CONDITIONAL first pass — orchestrator runs one PVL supplement cycle, then EXECUTE).
```

---

## Phase Ordering

| Phase | Plan file | Scope summary | Depends on |
|---|---|---|---|
| 0 (pre-program) | this file | Confirm folder structure, create phase stubs, blast-radius registry | — |
| 1 — Deals list (DEAL-001 / #22) | `process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-1-deals-list_PLAN_13-07-26.md` | `GET /deals?branchId=` + `serializeDeal` + react-query deals hook; swap `deals/index.tsx` MOCK_DEALS → API. NO schema change. LOW risk. | Phase 0 |
| 2 — Deal Details + eligibility (DEAL-002 / #23) | `process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-2-deal-details-eligibility_PLAN_13-07-26.md` | `GET /deals/:id`; wire `deals/deal/[dealId].tsx` off it; feed the existing 6-step eligibility engine with real data. NO schema change. MEDIUM risk. | Phase 1 |
| 3 — Cart apply + placement validation (DEAL-003 / #24) | `process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-3-cart-apply-placement_PLAN_13-07-26.md` | Migration `0006_legal_daredevil.sql` (nullable `orders.deal_id`); rewrite `POST /orders` for server-authoritative eligibility + real discount (%/fixed only) + atomic `deal_id` persistence; wire cart apply/remove to send `dealId`. HIGH risk — billing + schema + transaction. | Phase 1 + Phase 2 |

### Join Conditions

- Phase 1 MUST NOT start until Phase 0 exit gate passes (stubs + registry created).
- Phase 2 MUST NOT start until Phase 1 exit gate passes (`serializeDeal` exists; Phase 2 reuses it).
- Phase 3 MUST NOT start until Phase 1 AND Phase 2 exit gates both pass.

---

## Per-Phase Entry / Exit Gates

| Phase | Entry | Exit gate |
|---|---|---|
| 0 | Program start | 3 phase stubs + blast-radius registry created; umbrella + stub validators exit 0 |
| 1 | Phase 0 complete | `GET /deals?branchId=` returns serialized deals; deals list renders from API; `packages/api/src/routes/__tests__/deals.test.ts` passes; typecheck+lint green |
| 2 | Phase 1 exit met | `GET /deals/:id` returns single deal; Deal Details renders off it; eligibility engine runs on real data; deals `/:id` test passes |
| 3 | Phases 1+2 exits met | Migration 0004 applied; `POST /orders` persists `deal_id` + real `discount_total` (%/fixed) atomically; server re-validates eligibility; orders test suite (incl. dealId cases) passes; high-risk evidence pack complete |

---

## Per-Phase Loop

Each phase executes the canonical 7-step inner loop `R → I → P → PVL → E → EVL → UP`. This inner loop SKIPS SPEC — the umbrella governs product scope for all phases. The 7 steps:

1. **RESEARCH** — research-agent: load context, read prior phase reports, check plan drift, document findings
2. **INNOVATE** — innovate-agent: decide approach; write Decision Summary (chosen + rejected)
3. **PLAN-SUPPLEMENT** — plan-agent: turn the phase STUB into a full plan / add gaps found; or mark "n/a — research clean"
4. **PVL** — vc-validate-agent: full V1–V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md`
5. **EXECUTE** — vc-execute-agent per approved plan + validate-contract
6. **EVL** — vc-tester: run phase test gates to green; register follow-up stubs; write EVL HANDOFF SUMMARY
7. **UPDATE-PROCESS** — write phase report to durable report path; rewrite umbrella `## Current Execution State`

**PVL is NEVER skipped.** A placeholder `## Validate Contract` = blocked.

**Phase stubs vs full plans:** the 3 files created at Phase 0 are STUBS (goal + scope + issues + AC pointer + dependencies + blast-radius claim). The full implementation checklist + validate-contract for each phase is authored during that phase's inner loop (Step 3 PLAN-SUPPLEMENT + Step 4 PVL) — not now.

---

## Autonomous Execution Rules (During /goal)

- Agent self-decides at all V5 gates — no user approval needed between phases, EXCEPT the Phase 3 high-risk handoff (manual-first evidence pack) which is a hard stop.
- CONDITIONAL net gate: proceed autonomously, fixes applied in-flight, gaps on record.
- BLOCKED net gate: document items in backlog, continue with remaining phases; backlog is always a valid resolution.
- Hard stops (pause for user): Phase 3 order-placement/discount/migration without the evidence pack; irreversible/outward-facing actions; live payment.
- The phase report is the communication channel for conflicts/errors/learnings — not inline questions.

---

## Global Constraints

- Money stays cents at every HTTP/client boundary; percentage_discount is never ×100 (see deals.ts VALUE-UNIT NOTE).
- In-cart apply never charges a discount for the 4 complex deal types — %/fixed only.
- Server-authoritative eligibility re-validation is the source of truth for what is charged (client engine is display-only).
- Usage count derives from `orders.deal_id`; no `deal_usages` table is introduced.
- `cart.tsx` must retain its `useReorderConflicts()` import and conflict-notice render path.
- Coupons remain out of scope across all phases.
- Commit each phase's execution changes before the next; keep process/plan/context commits separate.

---

## Durable Report Destinations

| Phase | Report path (flat in the program task folder) |
|---|---|
| 1 — Deals list | `process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-1-deals-list_REPORT_13-07-26.md` |
| 2 — Deal Details + eligibility | `process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-2-deal-details-eligibility_REPORT_13-07-26.md` |
| 3 — Cart apply + placement | `process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-3-cart-apply-placement_REPORT_13-07-26.md` |

---

## Program Status Table

| Phase | Status |
|---|---|
| 0 — Pre-program (scaffold) | ✅ COMPLETE |
| 1 — Deals list (DEAL-001 / #22) | ✅ VERIFIED (EVL-confirmed clean; user Agent-Probe walkthrough still owed, non-blocking) |
| 2 — Deal Details + eligibility (DEAL-002 / #23) | ✅ VERIFIED (EVL-confirmed clean; user Agent-Probe walkthrough still owed, non-blocking) |
| 3 — Cart apply + placement (DEAL-003 / #24) | ✅ VERIFIED — **HIGH RISK, RESOLVED: EXECUTE complete (83/83 api tests, 15 new deal-apply cases; api/types/mobile typecheck+lint green); high-risk evidence pack (5 artifacts) written + validator-clean; EVL-confirmed independently by vc-tester (all 6 gate groups green + 7 security/correctness spot-checks verified against landed code). closeout_classification: CLEAN.** |

Status values: ⏳ PLANNED | 🔨 CODE DONE | 🧪 TESTING | ✅ VERIFIED | 🚧 BLOCKED | ✅ COMPLETE

---

## Touchpoints

- **Phase 1:** `packages/api/src/routes/deals.ts` (new), `packages/api/src/routes/lib/serializers.ts` (add `serializeDeal`), `packages/api/src/index.ts` (mount `/deals`), `packages/api/src/routes/__tests__/deals.test.ts` (new), `apps/mobile/src/features/deals/hooks/*` (new react-query hook), `apps/mobile/src/lib/api-client.ts` (add `getDeals`), `apps/mobile/src/app/(tabs)/deals/index.tsx` (swap MOCK_DEALS → API).
- **Phase 2:** `packages/api/src/routes/deals.ts` (add `GET /:id`), `packages/api/src/routes/__tests__/deals.test.ts` (extend), `apps/mobile/src/features/deals/hooks/*` (single-deal hook), `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` (wire off API), `apps/mobile/src/features/deals/lib/eligibility.ts` (feed real data — read).
- **Phase 3:** migration `0006_legal_daredevil.sql` + `packages/api/src/db/schema/orders.ts` (`deal_id`), `packages/api/src/routes/orders.ts` (rewrite placement), `packages/types/src/*` (createOrder input adds `dealId`), `packages/api/src/routes/__tests__/orders.*` (extend), `apps/mobile/src/features/cart/hooks/use-cart.ts` + `apps/mobile/src/app/(tabs)/order/cart.tsx` (send dealId; preserve useReorderConflicts).

---

## Public Contracts

- **New:** `GET /deals?branchId=` → `{ deals: [...] }` (P1); `GET /deals/:id` → `{ deal: {...} }` (P2); `POST /orders` gains optional `dealId` in request body (P3).
- **`serializeDeal`** — new boundary serializer (cents; percentage exception; flattens `deal_branches`/`deal_products` → `eligibleBranchIds`/`eligibleProductIds`).
- **Unchanged:** `packages/types/src/deals.ts` `Deal` client shape (already a superset — used as the API contract target); `AppliedDiscount`/`useCart()` display seam; `useReorderConflicts()` in cart.tsx; existing `/branches` + `/orders` (non-dealId) behavior.

---

## Blast Radius

Files directly modified or created across the program:

- `packages/api/src/routes/deals.ts` (new — P1, extended P2)
- `packages/api/src/routes/lib/serializers.ts` (add `serializeDeal` — P1)
- `packages/api/src/index.ts` (mount `/deals` — P1)
- `packages/api/src/routes/__tests__/deals.test.ts` (new — P1, extended P2)
- `packages/api/src/db/schema/orders.ts` + `packages/api/drizzle/0006_legal_daredevil.sql` (P3)
- `packages/api/src/routes/orders.ts` (rewrite placement — P3)
- `packages/api/src/routes/__tests__/orders.*` (extend — P3)
- `packages/types/src/*` (createOrder input `dealId` — P3)
- `apps/mobile/src/lib/api-client.ts`, `apps/mobile/src/features/deals/hooks/*` (P1/P2)
- `apps/mobile/src/app/(tabs)/deals/{index.tsx,deal/[dealId].tsx}` (P1/P2)
- `apps/mobile/src/features/cart/hooks/use-cart.ts`, `apps/mobile/src/app/(tabs)/order/cart.tsx` (P3)

Risk class: P1 LOW (new read route, no schema), P2 MEDIUM (single-read route + eligibility feed), P3 HIGH (billing + schema migration + placement transaction — requires high-risk evidence pack). Packages touched: `packages/api`, `packages/types`, `apps/mobile` (3). Per-phase blast-radius claims + non-overlap: see `phase-blast-radius-registry.md` in this folder.

---

## Verification Evidence

```bash
# Program scaffold validators (Phase 0 exit)
node .claude/skills/vc-generate-phase-program/scripts/validate-umbrella-artifact.mjs process/features/rewards-notifications/active/deals-api-integration_13-07-26/deals-api-integration_UMBRELLA_13-07-26.md
# Expected: PASS (0 failures)
node .claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-1-deals-list_PLAN_13-07-26.md
# Expected: PASS (0 failures)

# Per-phase automated gate (P1/P2/P3 backend — hard gate)
docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test
# Expected: all deals + orders suites green
```

Note: `apps/mobile` client behavior (list render, details render, cart apply/remove) is Agent-Probe only — no RN test runner exists (project-wide gap, see `process/context/tests/all-tests.md`). Recorded as Agent-Probe, never claimed as automated coverage.

---

## Test Infra Improvement Notes

(none identified yet — per-phase test-coverage assessment happens in each phase's inner-loop PLAN-SUPPLEMENT + PVL. Standing project-wide gap: `apps/mobile` has no RN test runner, so all client-side deal behavior is Agent-Probe only; `packages/api` has vitest+supertest and IS the automated gate for the endpoints.)

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/rewards-notifications/active/deals-api-integration_13-07-26/deals-api-integration_UMBRELLA_13-07-26.md`
- Last completed phase: Phase 2 — Deal Details + eligibility (DEAL-002 / #23) — DONE, EVL-confirmed clean. Report: `phase-2-deal-details-eligibility_REPORT_13-07-26.md`.
- Validate-contract status: Phase 1 — Gate: CONDITIONAL, accepted (14-07-26); generated-by: inner-pvl: phase-1. Phase 2 — Gate: CONDITIONAL, accepted (14-07-26); generated-by: inner-pvl: phase-2. Phase 3 — Gate: CONDITIONAL, first pass (14-07-26); generated-by: inner-pvl: phase-3; 2 concerns (C1/C2) routed to PVL supplement cycle.
- Supporting context files for Phase 3: `process/context/all-context.md`, `phase-1-deals-list_{PLAN,REPORT}_13-07-26.md`, `phase-2-deal-details-eligibility_{PLAN,REPORT}_13-07-26.md`, `phase-3-cart-apply-placement_PLAN_13-07-26.md`, `packages/api/src/routes/{deals.ts,orders.ts,lib/serializers.ts}`, `packages/api/src/db/schema/orders.ts`, `apps/mobile/src/features/cart/hooks/use-cart.ts`, `apps/mobile/src/app/(tabs)/order/cart.tsx`.
- **PROGRAM COMPLETE (14-07-26):** all 3 phases VERIFIED. Phase 3 EXECUTE finished, high-risk evidence pack (5 artifacts) complete + validator-clean, and EVL independently confirmed all gates green by vc-tester (not merely execute-agent's internal claim). Program task folder archived `active/` → `completed/` — see UPDATE PROCESS closeout report for full program-level summary.
- Current phase: none — program closed.
- Next action: none for this program. Follow-up work (3 owed Agent-Probe walkthroughs — Phase 1 deals list, Phase 2 deal details, Phase 3 cart-apply-through-checkout) is tracked as a non-blocking backlog item, not a new phase. A future coupons/complex-deal-pricing effort would be a NEW feature/program, not a continuation of this one.

---

## Current Execution State

Last updated: 14-07-26 (PROGRAM CLOSEOUT — Phase 3 EVL-confirmed clean; all 3 phases VERIFIED; program archived)
Completed phases: Phase 0 (Scaffold), Phase 1 — Deals list (DEAL-001 / #22) — ✅ VERIFIED (EVL-confirmed clean), Phase 2 — Deal Details + eligibility (DEAL-002 / #23) — ✅ VERIFIED (EVL-confirmed clean), Phase 3 — Cart apply + placement (DEAL-003 / #24) — ✅ VERIFIED (EVL-confirmed clean; high-risk evidence pack complete)
Current phase: none — PROGRAM COMPLETE.
Phase 3 status: EXECUTE complete (all A→D checklist items; 83/83 api tests incl. 25 orders/15 deal-apply; api/types/mobile tsc + api/mobile lint green); high-risk evidence pack (5 artifacts) written + validator-clean; EVL independently re-confirmed by vc-tester (all 6 gate groups green + 7 security/correctness spot-checks against landed code); closeout_classification: CLEAN.
Phase 3 EVL: COMPLETE (14-07-26) — see `phase-3-cart-apply-placement_REPORT_13-07-26.md` §EVL Confirmation.
Phase 3 report: `phase-3-cart-apply-placement_REPORT_13-07-26.md` (finalized, EVL section appended).
Current loop step: UPDATE-PROCESS (Step 7) — COMPLETE for all 3 phases. Program task folder archived `active/` → `completed/`.
Validate-contract status: Phase 1 — Gate: CONDITIONAL, accepted; generated-by: inner-pvl: phase-1; EVL-confirmed clean. Phase 2 — Gate: CONDITIONAL, accepted; generated-by: inner-pvl: phase-2; EVL-confirmed clean. Phase 3 — Gate: CONDITIONAL TERMINAL (re-validated after 1 supplement cycle); generated-by: inner-pvl: phase-3; C1/C2 RESOLVED; EVL-confirmed clean; high-risk evidence pack complete.
Program Net Gate: Phase 1 CLOSED (EVL-confirmed, CLEAN). Phase 2 CLOSED (EVL-confirmed, CLEAN). Phase 3 CLOSED (EVL-confirmed, CLEAN; high-risk evidence pack accepted). **PROGRAM COMPLETE — all 3 phases VERIFIED.**
Latest validator run: 14-07-26 — high-risk evidence pack validator (0 failures/warnings); phase-3 plan-artifact validator (PVL re-validation cycle 2, 0 failures)

**⚠️ HIGH-RISK PHASE 3 FLAG — RESOLVED (14-07-26):** Phase 3's schema migration
(`0006_legal_daredevil.sql` — additive-only, nullable `orders.deal_id` + FK; renumbered twice
during merge-conflict reconciliation with `development`'s own migrations, same content throughout)
and `POST /orders`
billing/discount/placement rewrite (server-authoritative eligibility re-validation, real discount
computation, atomic `deal_id` persistence) both landed and were EVL-confirmed clean. The
High-Risk Execution Handoff (manual-first evidence pack per `vc-risk-evidence-pack`, 5 artifacts)
was produced and is validator-clean. This flag is kept in the historical record (not deleted) —
status: **RESOLVED, no longer a hard stop.**

Next phase: none. Program closed. See §Program-Level Closeout below (added at UPDATE PROCESS) for
what shipped, what's still owed (3 Agent-Probe walkthroughs, non-blocking backlog), and the
recommended commit-scoping split given the co-mingled working tree.

**Co-mingled working tree note (flagged at UPDATE PROCESS, 14-07-26):** the tree also contains
uncommitted work from an unrelated sibling batch (`order-history-reorder-api`, feature
`ordering-cart`). No commit was made by this UPDATE PROCESS pass — see the closeout report for a
recommended commit split by logical batch.

Loop step values: RESEARCH | INNOVATE | PLAN-SUPPLEMENT | PVL | EXECUTE | EVL | UPDATE-PROCESS
Orchestrator rule: read "Current loop step" and "Validate-contract status" before spawning any subagent. Never spawn execute-agent when loop step is RESEARCH, INNOVATE, PLAN-SUPPLEMENT, or PVL.

**Phase 1+2 closeout notes carried into Phase 3:**
- `serializeDeal`/`ApiDeal` (serializers.ts) and the `{ deals: ApiDeal[] }` / `{ deal }` shapes are locked — Phase 3's server-side re-read of the deal inside the `POST /orders` transaction is its OWN read (not via `getDeal`/`useDeal`), but should follow the same money-boundary convention (cents; `percentage_discount` NOT ×100).
- Hermetic own-fixture test-assertion convention (never assert global array emptiness/length) — carry into `orders.test.ts` extension.
- The `checkDealEligibility` client engine (`eligibility.ts`) stays DISPLAY/UX-only per the charter — Phase 3's server-side re-validation is the source of truth for what is actually charged; do not treat the client engine's pass as authoritative.
- Deferred-CTA UX pattern established in Phase 2 (`deal/[dealId].tsx`): a disabled/deferred CTA must ALWAYS give visible feedback (persistent helper copy and/or an Alert on tap) — never a silent dead button. Apply this same principle if Phase 3 needs any interim/deferred UI states (see PVL C1 — complex-type deals must give clear "can't apply" feedback, not a dead-end).
- Hermetic test convention scales cleanly — `deals.test.ts` grew from 6 (Phase 1) to 13 (Phase 2, +7 for `/:id`) tests reusing the same `beforeAll` fixtures with zero new global-length assertions. Follow the same pattern extending `orders.test.ts` for the `dealId` cases.
- `orders.deal_id` usage-count derivation (no separate `deal_usages` table) is a hard safety constraint — Phase 2's `usage: []` interim was provably always-pass and is now retired once Phase 3 lands the real column.
- Outstanding non-blocking items: user's manual Agent-Probe walkthrough of the Phase 1 deals list screen AND the Phase 2 Deal Details screen (render / not-found / 6 eligibility-reason states / deferred-Apply UX) are both still owed — tracked, does not block Phase 3 start.

Note: The Stable Program Goal above is fixed. This section is the only part that changes — update-process-agent rewrites it after every phase closeout (overwrite, not append — git history is the audit log).

---

## Program-Level Closeout (UPDATE PROCESS, 14-07-26)

**What shipped (all 3 phases, real end-to-end):**
- **#22 (Phase 1, DEAL-001):** Real Deals list — `GET /deals?branchId=` + `serializeDeal`
  boundary serializer, react-query `useDeals()` hook, deals list screen renders from the API (not
  `MOCK_DEALS`).
- **#23 (Phase 2, DEAL-002):** Real Deal Details + eligibility — `GET /deals/:id`, `useDeal()`
  hook, Deal Details screen feeds the existing 6-step `checkDealEligibility` engine with real
  server data.
- **#24 (Phase 3, DEAL-003):** Real cart-apply + server-authoritative placement — `orders.deal_id`
  migration (additive, nullable FK), `POST /orders` rewritten for atomic server-side eligibility
  re-validation + real discount computation (%/fixed only, dual-clamped) + `deal_id` persistence
  under a `FOR UPDATE` row lock; cart's dead coupon-code-input UI removed; real
  browse→details→Apply→cart flow wired; checkout Total-display bug fixed.

**What's still owed (non-blocking backlog, not a program blocker):**
- 3 manual Agent-Probe walkthroughs never performed by a human: Phase 1 deals list render,
  Phase 2 Deal Details + eligibility-reason display, Phase 3 full cart-apply-through-checkout flow
  (incl. the C1 complex-type CTA guard and the Total/discount breakdown). `apps/mobile` has no RN
  test runner (project-wide gap, tracked at
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — these were
  never claimed as automated coverage at any phase.
- Complex deal types (`buy_one_take_one`/`free_item`/`free_upgrade`/`bundle`) remain
  display/evaluate-only — not cart-applicable in this MVP (charter-deferred, by design).
- Coupons remain entirely out of scope (charter-deferred).

**Program verdict:** DEFINITION OF DONE MET. All 3 charter criteria (real Deals list, real Deal
Details + eligibility, server-authoritative cart-apply + placement) are satisfied by
Fully-Automated `packages/api` gates (backend, the hard gate) with disclosed Agent-Probe-only
residuals on the mobile client (the accepted, project-wide test-tier split — never a vacuous
green). This program is CLOSED as scoped; any future coupons or complex-deal-pricing work is new
scope for a new feature/program, not a continuation.

**Commit-scoping recommendation (working tree is co-mingled — no commit made by this UPDATE
PROCESS pass):**

The tree currently mixes two unrelated batches. Recommend splitting into (at least) 2 logical
commits, reviewed separately:

1. **Deals API Integration (#22/#23/#24) — this program:**
   - `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx`
   - `apps/mobile/src/app/(tabs)/deals/index.tsx`
   - `apps/mobile/src/app/(tabs)/order/cart.tsx` (deal-apply region only — see note below)
   - `apps/mobile/src/app/(tabs)/order/checkout.tsx`
   - `apps/mobile/src/features/deals/lib/apply-deal.ts`
   - `apps/mobile/src/features/deals/hooks/` (new)
   - `apps/mobile/src/features/orders/lib/api-client.ts`
   - `apps/mobile/src/lib/api-client.ts` (deals-related additions only — verify no unrelated changes)
   - `packages/api/drizzle/0006_legal_daredevil.sql` + `packages/api/drizzle/meta/0006_snapshot.json`
     + `packages/api/drizzle/meta/_journal.json`
   - `packages/api/src/db/schema/orders.ts`
   - `packages/api/src/index.ts` (deals router mount, if not already committed from Phase 1)
   - `packages/api/src/routes/deals.ts` (new) + `packages/api/src/routes/__tests__/deals.test.ts` (new)
   - `packages/api/src/routes/orders.ts` + `packages/api/src/routes/__tests__/orders.test.ts`
   - `packages/api/src/routes/lib/serializers.ts`
   - `packages/types/src/order.ts`
   - `process/context/all-context.md` (Deals section — this pass's edit)
   - `process/features/rewards-notifications/completed/deals-api-integration_13-07-26/` (archived
     task folder — new location after this UPDATE PROCESS move)

2. **order-history-reorder-api — separate, unrelated feature batch (`ordering-cart`):**
   - `apps/mobile/src/app/(tabs)/order/history.tsx`
   - `apps/mobile/src/features/cart/hooks/use-reorder-conflicts.ts` (new)
   - `apps/mobile/src/features/orders/hooks/use-reorder.ts` (new)
   - `apps/mobile/src/app/_layout.tsx` — **AMBIGUOUS: verify which batch owns this edit before
     splitting** (could be either batch or an unrelated third change — inspect the diff directly)
   - `packages/utils/src/index.ts`, `packages/utils/src/order-display.ts` (new),
     `packages/utils/src/reorder.ts` (new), `packages/utils/src/__tests__/order-display.test.ts`
     (new), `packages/utils/src/__tests__/reorder.test.ts` (new)
   - `process/features/ordering-cart/active/order-history-reorder-api_13-07-26/` (its own task
     folder — NOT part of this program's closeout, left untouched by this UPDATE PROCESS pass)

`cart.tsx` needs care: Phase 3 deleted the coupon-code-input UI and preserved
`useReorderConflicts()` in the SAME file — if `use-reorder-conflicts.ts` (batch 2) was authored
independently of Phase 3's edit to `cart.tsx`, the `cart.tsx` diff itself is a single file touched
by both batches conceptually; a human reviewer should confirm the diff doesn't need manual
splitting (e.g. via `git add -p`) before committing, since it can't be cleanly assigned to one
git-mv-style batch. Recommend reviewing `git diff apps/mobile/src/app/\(tabs\)/order/cart.tsx`
directly before staging.

**No commit was made by this UPDATE PROCESS pass** — per protocol, `vc-git-manager` is not
self-invoked here; committing this cleanly is deferred to an explicit follow-up commit action
with the split above as a starting recommendation.

---

## Validate Contract

(placeholder — vc-validate-agent writes a per-phase contract into each phase plan before that phase's EXECUTE. The umbrella itself is not separately validate-gated; per-phase contracts govern.)
