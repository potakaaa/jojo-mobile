---
name: plan:mobile-tabs-order-flow-completion-umbrella
description: "Mobile Tabs + Order-Flow Completion — umbrella/orchestration plan for the 6-phase program (rewards + coupons backend, Home rewire, Rewards/wallet + Account UI, UX polish)"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: mobile-tabs-order-flow-completion
  phase: umbrella
---

# Mobile Tabs + Order-Flow Completion — Umbrella Plan

**Date**: 14-07-26
**Complexity**: COMPLEX
**Status**: ⏳ PLANNED

- Program type: PHASE PROGRAM (6 phases, sequential with gated joins)
- Date: 14-07-26
- Program folder: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/`
- Spans features: `rewards-notifications`, `ordering-cart`, `auth-accounts`, general mobile UX — hence general-plans, not a single feature folder.

## Overview / Context

TL;DR: Finish the Jojo Potato customer app's 5-tab UI/UX + order flow to *partial* production readiness. The order flow is already real and API-wired end-to-end (verified against code, 14-07-26) — this program does NOT rebuild it. It (1) builds the missing Rewards/stars and Coupons backends, (2) rewires the 100%-mock Home tab and the two `<ComingSoon>` tabs (Rewards, Account) to real data, and (3) runs a cross-tab UX-friendliness polish pass. Payment stays **pay-at-branch only** (`payment_status` always `unpaid`, no external processor). Overriding principle from the product owner: **always prioritize user friendliness.**

Read `process/context/all-context.md` first, then this file, then the current phase plan.

Verified current-state facts (trust these over the possibly-stale all-context.md — checked against code this session):
- Order flow (order/index → product → cart → checkout `useCheckout()`→`POST /orders` → payment-method → confirmation `GET /orders/:id` → tracking → history) is FULLY real. UX polish only.
- Order, Branches, Deals tabs are real (react-query against `/branches`, `/branches/:id/menu`, `/deals`, `/deals/:id`).
- Home `(tabs)/index.tsx` renders 100% from `apps/mobile/src/features/home/mock-home.ts`. Only `useCart().setBranch` is real.
- Rewards tab (`rewards/index.tsx` 23 ln + `coupons.tsx`) and Account tab (`account/index.tsx` 65 ln) are `<ComingSoon>` shells; `signOut` is real.
- DB tables `rewards`, `user_stars`, `star_transactions` (+ `star_tx_type` enum), `coupons` (+ `coupon_status` enum), `account` ALL exist and were created in migration `0000_puzzling_lightspeed.sql` — already migrated. **No new migration is needed to serve them** (a migration is only needed if a phase adds a column, e.g. a stars-per-peso accrual config — flagged as a per-phase RESEARCH item).
- Serving routes for rewards/coupons/account: **zero.** `packages/api/src/routes/` has only branches, deals, orders, staff, admin.
- Shared types diverge from schema: `packages/types/src/rewards.ts` uses `points`/`tier` (bronze/silver/gold); schema has `required_stars`/`current_stars`/`lifetime_stars` and NO tier column (tier is client-derived). `packages/types/src/coupons.ts` uses `title`/`discountLabel`/`isRedeemed`; schema uses `code`/`status`/`deal_id`/`reward_id`/`expires_at`. **Reconcile types before wiring.**
- Stars accrual is currently a named no-op stub (`creditStarsForOrder`) in the STAFF-003 order PATCH. Backlog: `process/features/ordering-cart/backlog/stars-accrual-and-history-display_NOTE_13-07-26.md`.
- Shared UI already exports `RewardProgressCard`, `StarProgressBar`, `CouponCard`, `EmptyState`, `Toggle` — reuse, do not one-off.

### Phase Completion Rules

A phase is `✅ VERIFIED` only when: all checklist items checked; the phase validate-contract exists and its gates are green; regression checks against overlapping earlier phases pass; and the phase report is written to the durable destination. Code-only completion is `🔨 CODE DONE`, never VERIFIED. Mobile-screen behavior that has no automated runner is proven by Agent-Probe and recorded honestly as a Known-Gap — never claimed as automated coverage.

### Acceptance Criteria (program level)

- AC-1: A customer earns stars automatically when an order reaches a completed state; the balance is queryable and reflected in the app.
- AC-2: A customer can view star balance + tier progress and redeem a reward into a coupon.
- AC-3: Coupons can be listed and redeemed (status transitions available→used) through a real API.
- AC-4: Home tab renders from real branch/menu/deals + a real rewards summary — no `mock-home.ts` in the render path.
- AC-5: Rewards tab and coupon wallet render real data with friendly loading/empty/error states.
- AC-6: Account tab shows real profile and can edit name/birthday/address via better-auth `updateUser`.
- AC-7: Every tab has consistent, friendly loading/empty/error handling (skeletons, retry, empty states).
- AC-8: Payment behavior unchanged — pay-at-branch only, `payment_status` stays `unpaid`.

---

## Program Goal Charter

```
Mobile Tabs + Order-Flow Completion — Program Goal Charter

North star:
- Ship a friendly, real-data customer app: all 5 tabs and the pickup order flow work against
  real APIs with pay-at-branch payment, full rewards, and a coupon wallet — no mock render paths.

Definition of done (an unattended agent must be able to do all of these):
1. Place a pay-at-branch order and, when it completes, see stars credited via a real API.
2. Open Rewards, see star balance + tier progress, and redeem a reward into a coupon.
3. Open the coupon wallet, see real coupons, and redeem one.
4. Open Home and see real branch/menu/deals + a real rewards summary (no mock-home.ts).
5. Open Account, view the real profile, and edit name/birthday/address (persists via better-auth).
6. Experience friendly loading/empty/error states on every tab.

What "verified" means (program level):
- packages/api backend logic (accrual, balance, redeem, coupon list/redeem) is proven by
  vitest+supertest gates that exit 0 (the ONE real automated hard gate in this repo).
- Pure-TS client logic (tier computation, redemption eligibility, star math) is proven by
  apps/mobile or packages/utils vitest.
- Mobile screen UX is proven by Agent-Probe walkthrough and recorded as Known-Gap for automation
  (no RN component/E2E runner exists — project-wide gap).
- validate-contract gates + regression evidence recorded per phase. No validate-contract = not VERIFIED.

Scope tiers -> phase mapping:
- Tier 1 (Rewards/stars backend + type reconcile) -> Phase 1
- Tier 2 (Coupons backend) -> Phase 2
- Tier 3 (Home rewire) -> Phase 3
- Tier 4 (Rewards tab + coupon wallet UI) -> Phase 4
- Tier 5 (Account/profile screen) -> Phase 5
- Tier 6 (Cross-tab UX-friendliness polish) -> Phase 6
- This program retires Tiers 1-6.

Explicitly out of scope (deferred tier):
- Notifications API / push delivery (leave the existing local-mock Notifications screen as-is).
- Live-tracking polling / websockets.
- Admin and staff shells (separate programs).
- External payment processor / online payment (pay-at-branch only, payment_status stays unpaid).
- Real pricing for the 4 complex deal types (unchanged from current state).

Hard safety constraints (non-negotiable, per phase):
- NEVER add an external payment processor or change payment_status away from 'unpaid'.
- NEVER make `role` client-writable; it stays server-owned (input:false) in better-auth config.
- Star/coupon mutations are server-authoritative — never trust a client-sent star count or discount.
- Money is CENTS everywhere in packages/api; reward_value numeric stays server-computed.
- Commit each phase's execution changes before starting the next phase.
  Keep process/plan/context commits separate from execution commits.
```

---

## Stable Program Goal (copy-paste this to start autonomous execution)

```
SESSION GOAL: mobile-tabs-order-flow-completion — Mobile Tabs + Order-Flow Completion
Ref: process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/mobile-tabs-order-flow-completion-umbrella_PLAN_14-07-26.md

TARGET: Complete ALL 6 phases until:
- All phase exit gates green (packages/api vitest+supertest exits 0 for backend phases)
- Home/Rewards/Account render real data; pay-at-branch order flow polished; coupon wallet works
- Test tiers: automated (iterate-until-green) / hybrid (fix-if-in-blast-radius) / agent-probe (record-judgment)

AUTONOMY: Before ANY subagent spawn, read:
1. Umbrella ## Current Execution State -> loop step + validate-contract status
2. Phase plan ## Phase Loop Progress -> first unchecked box = next subagent to spawn

PER-PHASE LOOP (7-step inner loop R -> I -> P -> PVL -> E -> EVL -> UP, never skip, never reorder; SKIPS SPEC):
  1. RESEARCH -> 2. INNOVATE -> 3. PLAN-SUPPLEMENT -> 4. PVL -> 5. EXECUTE -> 6. EVL -> 7. UPDATE-PROCESS
- PLAN-SUPPLEMENT: plan-agent writes research/innovate gaps into phase plan (or marks "n/a — clean")
- PVL NEVER skipped; contract must follow example-validate-output.md full format;
  partial contract (missing Plan updates applied / Execute-agent instructions / Test gates) = blocked
- Every subagent FIRST ACTION: run vc-context-discovery (context group files +
  process/context/tests/all-tests.md routing chain) AND vc-plan-discovery
- Every phase-END: invoke vc-agent-strategy-compare for next-step strategy recommendation

Report via phase reports. No approval between phases unless hard stop hit.

HARD STOPS (pause, wait for user):
- Any attempt to add an external payment processor or change payment_status (forbidden by charter)
- Net gate = BLOCKED with no backlog resolution path
- Plan file marks "pause required" or agent count > 100
- Validate-contract is placeholder and vc-validate-agent cannot run

SAFETY (never override):
- payment_status stays 'unpaid'; no external processor
- role stays server-owned (input:false); star/coupon mutations server-authoritative; money in cents
- Commit each phase before advancing; process and execution commits separate

TEST GATES (every phase exit):
  docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test
  pnpm --filter @jojopotato/mobile test
  pnpm --filter @jojopotato/mobile typecheck
  pnpm lint
  pnpm format:check

VALIDATE CONTRACT: Per-phase contracts written by vc-validate-agent into each phase plan before EXECUTE.

START: Phase 1, loop step RESEARCH (pending). Spawn vc-research-agent for Phase 1.
```

---

## Phase Sequence

| Phase | Plan file | Scope summary | Depends on |
|---|---|---|---|
| 0 (pre-program) | this file | Confirm folder + baseline audit; create 6 phase plans | — |
| 1 — Rewards/Stars Backend + Type Reconcile | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-01-rewards-backend_PLAN_14-07-26.md` | Reconcile rewards/coupons types to schema; build stars accrual on order-completion + GET balance/summary + redeem→coupon routes | Phase 0 |
| 2 — Coupons Backend | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-02-coupons-backend_PLAN_14-07-26.md` | `GET /coupons` (list) + `POST /coupons/:id/redeem` (available→used); issuance via reward redemption | Phase 1 |
| 3 — Home Tab Rewire | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-03-home-rewire_PLAN_14-07-26.md` | Replace `mock-home.ts` render path with real `useBranch`/`useMenu`/`useDeals` + rewards summary | Phase 1 |
| 4 — Rewards Tab + Coupon Wallet UI | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-04-rewards-coupon-ui_PLAN_14-07-26.md` | Real Rewards tab (balance/tier/redeem) + coupon wallet screen | Phase 1 + Phase 2 |
| 5 — Account / Profile Screen | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-05-account-profile_PLAN_14-07-26.md` | Replace ComingSoon Account shell with real profile view + edit (better-auth updateUser) + settings | Phase 0 |
| 6 — Cross-Tab UX Polish | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-06-ux-polish_PLAN_14-07-26.md` | Consistent loading/empty/error states, skeletons, a11y, react-query consistency (Branches uses local fetch state) | Phases 1-5 |

## Phase Ordering

1. Phase 1 (Rewards/Stars Backend + Type Reconcile) — foundation; no UI depends on it yet.
2. Phase 2 (Coupons Backend) — after Phase 1 (shares reconciled types + reward_id FK).
3. Phase 3 (Home Rewire) — after Phase 1 (needs rewards summary route). Independent of Phase 2.
4. Phase 5 (Account/Profile) — depends only on Phase 0; may run in parallel with Phase 3 (no shared blast radius). Sequenced here after Phase 3 for delivery simplicity.
5. Phase 4 (Rewards Tab + Coupon Wallet UI) — after Phase 1 AND Phase 2 (needs both backends).
6. Phase 6 (UX Polish) — LAST; polishes all tabs delivered in Phases 3-5 and the existing order flow.

### Join Conditions

- Phase 1 MUST NOT start until Phase 0 exit gate passes.
- Phase 2 MUST NOT start until Phase 1 exit gate passes.
- Phase 3 MUST NOT start until Phase 1 exit gate passes.
- Phase 4 MUST NOT start until Phase 1 AND Phase 2 exit gates both pass.
- Phase 5 MUST NOT start until Phase 0 exit gate passes (no backend dependency).
- Phase 6 MUST NOT start until Phases 1-5 exit gates all pass.

---

## Per-Phase Entry / Exit Gates

| Phase | Entry | Exit gate |
|---|---|---|
| 0 | Program start | 6 phase plan files created; baseline validators recorded |
| 1 | Phase 0 complete | Rewards/coupons types reconciled to schema; accrual + balance + redeem routes green in `pnpm --filter @jojopotato/api test` |
| 2 | Phase 1 exit met | Coupons list + redeem routes green in api test suite |
| 3 | Phase 1 exit met | Home renders real data; `mock-home.ts` removed from render path; typecheck + Agent-Probe pass |
| 4 | Phases 1+2 exits met | Rewards tab + coupon wallet render real data; redeem round-trip works (Agent-Probe) |
| 5 | Phase 0 complete | Account shows real profile; edit persists via better-auth (Agent-Probe); typecheck green |
| 6 | Phases 1-5 exits met | Consistent loading/empty/error across tabs; typecheck + lint + Agent-Probe pass |

---

## Per-Phase Loop

Each phase executes the canonical 7-step inner loop `R → I → P → PVL → E → EVL → UP`. This inner loop SKIPS SPEC — SPEC runs once in the outer program loop, not per phase.

1. **RESEARCH** — research-agent: load context, read prior phase reports, check plan drift, document findings.
2. **INNOVATE** — innovate-agent: decide approach; write Decision Summary (chosen + rejected).
3. **PLAN-SUPPLEMENT** — plan-agent: add research/innovate gaps to the phase plan, or mark "n/a — research clean" and tick step 3.
4. **PVL** — vc-validate-agent: full V1-V7; validate-contract written per `.claude/skills/vc-validate-findings/references/example-validate-output.md` format.
5. **EXECUTE** — vc-execute-agent per approved plan and validate-contract.
6. **EVL** — vc-tester: run phase test gates to green; register follow-up stubs; write EVL HANDOFF SUMMARY.
7. **UPDATE-PROCESS** — write phase report; rewrite umbrella `## Current Execution State` (overwrite, not append).

**PVL is NEVER skipped.** A placeholder `## Validate Contract` = blocked.

---

## Autonomous Execution Rules (During /goal)

- Agent self-decides at all V5 gates — no user approval between phases.
- CONDITIONAL net gate: proceed autonomously, fixes applied in-flight, gaps on record.
- BLOCKED net gate: document items in backlog, continue with remaining phases; backlog is always a valid resolution.
- Hard stops (must pause): any attempt to add a payment processor or change `payment_status`; irreversible/outward-facing action without explicit contract instruction; plan file marks "pause required".
- The phase report is the communication channel for conflicts/errors/learnings — not inline questions.

---

## Global Constraints

- NEVER add an external payment processor; `payment_status` stays `'unpaid'` (pay-at-branch only).
- NEVER make `role` client-writable — stays `input:false` in better-auth config.
- All star/coupon/discount mutations are server-authoritative; money in CENTS in packages/api.
- Mirror existing backend patterns: routes in `packages/api/src/routes/`, mounted in `src/index.ts`, session-gated via `middleware/require-session.ts`, boundary serializers in `routes/lib/serializers.ts`.
- Reuse shared `@jojopotato/ui` components; never hardcode colors/spacing duplicating `theme.ts` tokens.
- Do NOT claim automated coverage for mobile screens — no RN runner exists; record as Agent-Probe/Known-Gap.
- Commit each phase's execution changes before starting the next. Keep process/plan/context commits separate from execution commits.

## Pre-PVL Conflict Resolution

(placeholder — orchestrator fills this before outer PVL begins. Classify each shared package as parallel-safe or reassign. If no conflicts exist, state: 'No package conflicts — all phases are parallel-safe.')

Known shared-surface notes for the orchestrator to resolve:
- `packages/types/src/{rewards,coupons}.ts` — reconciled ONLY in Phase 1 (coupons type) / Phase 1 (rewards type); Phases 2/4 consume, do not re-edit shape.
- `packages/api/src/index.ts` mount block — Phases 1 and 2 both add a mount line; append-only, low conflict.
- `apps/mobile` tab screens — Phases 3/4/5 touch disjoint tab folders (`(tabs)/index.tsx` vs `rewards/` vs `account/`); Phase 6 touches all but runs last.

---

## Durable Report Destinations

| Phase | Report path (flat in program task folder) |
|---|---|
| 0 (pre-program) | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-00-planning_REPORT_14-07-26.md` |
| 1 — Rewards Backend | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-01-rewards-backend_REPORT_14-07-26.md` |
| 2 — Coupons Backend | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-02-coupons-backend_REPORT_14-07-26.md` |
| 3 — Home Rewire | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-03-home-rewire_REPORT_14-07-26.md` |
| 4 — Rewards/Wallet UI | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-04-rewards-coupon-ui_REPORT_14-07-26.md` |
| 5 — Account/Profile | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-05-account-profile_REPORT_14-07-26.md` |
| 6 — UX Polish | `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-06-ux-polish_REPORT_14-07-26.md` |

---

## Program Status Table

| Phase | Status |
|---|---|
| 0 — Pre-program (plan creation) | ✅ COMPLETE |
| 01 — Rewards/Stars Backend + Type Reconcile | ✅ VERIFIED |
| 02 — Coupons Backend | ✅ VERIFIED |
| 03 — Home Tab Rewire | ⏳ PLANNED |
| 04 — Rewards Tab + Coupon Wallet UI | ⏳ PLANNED |
| 05 — Account / Profile Screen | ⏳ PLANNED |
| 06 — Cross-Tab UX Polish | ⏳ PLANNED |

Status values: ⏳ PLANNED | 🔨 CODE DONE | 🧪 TESTING | ✅ VERIFIED | 🚧 BLOCKED | ✅ COMPLETE

---

## Touchpoints

- `packages/types/src/rewards.ts`, `packages/types/src/coupons.ts` — reconcile to schema (Phase 1).
- `packages/api/src/routes/rewards.ts` (new), `packages/api/src/routes/coupons.ts` (new), `packages/api/src/routes/account.ts` (optional, Phase 5) — new serving routes.
- `packages/api/src/routes/lib/serializers.ts`, `packages/api/src/index.ts` — serializers + mounts.
- `packages/api/src/routes/orders.ts` and/or the STAFF-003 order-completion path — wire real `creditStarsForOrder`.
- `apps/mobile/src/features/{rewards,coupons,home,account}/hooks/*` — new react-query hooks.
- `apps/mobile/src/app/(tabs)/index.tsx`, `.../rewards/index.tsx`, `.../rewards/coupons.tsx`, `.../account/index.tsx` — screen rewires.
- `packages/ui/src/components/*` — additions only where a reusable component is missing.

---

## Public Contracts

- Existing customer order API (`POST /orders`, `GET /orders/:id`) behavior unchanged — pay-at-branch, `payment_status` unpaid.
- Existing `/branches`, `/branches/:id/menu`, `/deals` routes unchanged.
- better-auth `updateUser` seam unchanged; `role` stays server-owned.
- New public/session-gated contracts introduced: rewards balance/summary, reward redeem, coupons list/redeem (defined in phase plans).

---

## Blast Radius

Files directly modified or created (aggregate across phases):

- `packages/types/src/rewards.ts`, `packages/types/src/coupons.ts` (reconcile)
- `packages/api/src/routes/rewards.ts`, `packages/api/src/routes/coupons.ts` (new; optional `account.ts`)
- `packages/api/src/routes/lib/serializers.ts`, `packages/api/src/index.ts`
- `packages/api/src/routes/__tests__/rewards.test.ts`, `.../coupons.test.ts` (new automated gates)
- order-completion accrual site (orders route / staff PATCH `creditStarsForOrder`)
- `apps/mobile/src/features/{rewards,coupons,home,account}/**` (new hooks + screens)
- `apps/mobile/src/app/(tabs)/{index.tsx,rewards/index.tsx,rewards/coupons.tsx,account/index.tsx}`
- `apps/mobile/src/features/home/mock-home.ts` (removed from render path in Phase 3)
- `packages/ui/src/components/**` (additive only)

Risk class: rewards/credit accounting (server-authoritative money-adjacent logic) — high-risk; requires at least Hybrid/Fully-Automated backend gates per phase.

---

## Verification Evidence

```bash
# Backend gates (Phases 1, 2 — the real automated hard gate)
docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test
# Expected: all suites pass, 0 failures (new rewards/coupons suites included)

# Pure-TS client logic (tier computation, eligibility)
pnpm --filter @jojopotato/mobile test
# Expected: 0 failures

# Typecheck / lint / format
pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm format:check
# Expected: exit 0

# Plan artifact validators
node .claude/skills/vc-generate-phase-program/scripts/validate-umbrella-artifact.mjs process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/mobile-tabs-order-flow-completion-umbrella_PLAN_14-07-26.md
# Expected: no FAIL lines
```

Mobile-screen UX (Home/Rewards/Wallet/Account render + redeem round-trip) is Agent-Probe — recorded as Known-Gap for automation (no RN runner).

---

## Test Infra Improvement Notes

- Project-wide gap: no RN component/E2E runner for `apps/mobile` screens — all screen UX proven by Agent-Probe only. Each UI phase records this as a Known-Gap; do not claim automated coverage.
- Opportunity: extract pure logic (tier computation, redemption eligibility, star math) into `packages/utils` or `apps/mobile` pure-TS modules so it CAN be vitest-covered (Fully-Automated), keeping only render/navigation as Agent-Probe.
- `packages/types` and `packages/utils` unit coverage is thin — new reconciled reward/coupon logic should add tests where a runner exists.

---

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/mobile-tabs-order-flow-completion-umbrella_PLAN_14-07-26.md`
- Last completed phase: Phase 0 (this umbrella plan = Phase 0 artifact)
- Validate-contract status: pending (vc-validate-agent writes per-phase)
- Supporting context files loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md`, schema files under `packages/api/src/db/schema/`, `packages/types/src/{rewards,coupons}.ts`.
- Next step for a fresh agent: Read this umbrella plan, read the Phase 1 plan (`phase-01-rewards-backend_PLAN_14-07-26.md`), then run the Phase 1 RESEARCH subagent before any EXECUTE work.
- Current phase: Phase 1 (not started)
- Next action: Spawn vc-research-agent for Phase 1.
- Execute-agent start instruction: Read this file. Read the Phase 1 plan. Run research subagent first — do NOT execute directly.

---

## Current Execution State

Last updated: 15-07-26 (Phase 2 closeout)
Completed phases: Phase 0 (Planning), Phase 1 (Rewards/Stars Backend + Type Reconcile — ✅ VERIFIED), Phase 2 (Coupons Backend — ✅ VERIFIED)
Phase 2 status: ✅ VERIFIED
Phase 2 EVL: PASS — all gates green independently: `packages/api` 189/189 (baseline 155 + coupons.test.ts 18 + orders.test.ts +16), root typecheck 6/6, `apps/mobile` typecheck clean, lint clean (3 pre-existing unrelated `dev-with-tunnel.mjs` warnings, not Phase 2 regressions), `format:check` clean, migration `0007_round_menace.sql` applied clean — confirmed by orchestrator-driven EVL re-run, not just execute-agent's self-report
Phase 2 report: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-02-coupons-backend_REPORT_14-07-26.md`
Phase 2 high-risk evidence pack: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/harness/phase-02-coupons-backend/` (5 artifacts — adversarial-validation.json, context-snippets.json, review-decision.json, risk-gate.json, verification.json; `humanApprovalRequired:true` — human sign-off on the coupon/order pricing-engine evidence pack recommended before production deploy; not a program blocker, carried forward, same posture as Phase 1)
Phase 1 status: ✅ VERIFIED (unchanged this pass)
Phase 1 report: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-01-rewards-backend_REPORT_14-07-26.md`
Phase 1 high-risk evidence pack: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/harness/phase-01-rewards-backend/` (`mustStopBeforeFinalize:false`, `humanApprovalRequired:true` — carried forward)
Current phase: Phase 3 — Home Tab Rewire
Current loop step: RESEARCH (not started)
Validate-contract status: pending
Program Net Gate: PENDING
Latest validator run: 15-07-26 — none run this pass (no harness/agent/skill files touched by this UPDATE PROCESS session; only plan-file bookkeeping edits — see Phase 2 Learnings below)
Outstanding non-blocking item: Phase 2's execution changes (see git status: `orders.ts`, `serializers.ts`, `coupons.ts` (new), `coupons.test.ts` (new), `orders.test.ts`, schema/migration files) are still UNCOMMITTED as of this UPDATE PROCESS pass — orchestrator should invoke `vc-git-manager` for the Phase 2 execution commit before or alongside this process-artifact commit, per the umbrella's "commit each phase before advancing" global constraint. Note: `apps/mobile/src/features/auth/hooks/use-auth.ts` is also modified in the working tree but is UNRELATED to Phase 2 (predates this program's session) — do not fold it into the Phase 2 execution commit; flag to orchestrator separately.

Loop step values: RESEARCH | INNOVATE | PLAN-SUPPLEMENT | PVL | EXECUTE | EVL | UPDATE-PROCESS
Orchestrator rule: read "Current loop step" and "validate-contract status" before spawning any subagent. Never spawn execute-agent when loop step is RESEARCH, INNOVATE, PLAN-SUPPLEMENT, or PVL.

Note: The Stable Program Goal above is fixed. This section is the only part that changes — update-process-agent rewrites it after every phase closeout (overwrite, not append).

---

## Phase 2 Learnings for Downstream Phases

Captured at Phase 2's UPDATE PROCESS closeout (15-07-26). Read this before starting Phase 3 or Phase 4 RESEARCH.

1. **`POST /orders` now accepts an optional `couponId` and returns `couponId` on `ApiOrder`.** Phase 4's checkout UI wiring (passing a selected coupon into checkout) consumes this directly — the backend contract is done; only the mobile UI wiring remains, explicitly Phase 4's scope (Phase 2 does not touch mobile).
2. **`serializeCouponWithLabel` (NOT `serializeCoupon`) is the join-based labeled serializer.** `GET /coupons` (consumed by Phase 4's coupon wallet UI) uses `serializeCouponWithLabel`, which LEFT JOINs `deals`+`rewards` to populate a human-readable `displayLabel` field. `serializeCoupon` (Phase 1's original, unmodified) has no label and remains the response shape for `POST /rewards/:id/redeem` only — do not conflate the two when building Phase 4's UI data-fetch hooks.
3. **`rewardDiscountLabel(reward_type, reward_value, reward_name)` helper exists in `serializers.ts`** (note: 3-arg signature, deviated from the plan's original 2-arg spec — see Phase 2 plan's `## Deviations`) — reusable for any future reward-label rendering need; analogous to the existing `dealDiscountLabel`.
4. **Migration `0007_round_menace.sql` added `orders.coupon_id`** (nullable, NO ACTION FK to `coupons.id`) — any future phase reading/writing the `orders` table should be aware this column now exists alongside `deal_id`.
5. **Coupon auto-apply supports `fixed_discount`/`percentage_discount`/`free_item` (requires the eligible product in cart) reward-linked coupons, plus deal-linked coupons (via `computeDealDiscountCents` reuse), and stacks with an existing `dealId` discount — always clamped to subtotal, `discount_total` stores the clamped combined value.** `reward_type` has no DB-level enum constraint; unrecognized values are safely rejected (400) rather than mispriced. This is the canonical pattern for any future money-adjacent discount-stacking logic in this codebase.
6. **High-risk evidence-pack pattern is now precedented twice** (Phase 1 rewards, Phase 2 coupons/order-pricing) — both `humanApprovalRequired:true`, both non-blocking to program progress, both carried forward for a single pre-production human sign-off pass. Future money-adjacent phases in this program (none currently planned — Phases 3-6 are UI/UX) would follow the same 5-artifact `harness/{phase-slug}/` shape if one arose.
7. **Process observation (non-blocking):** Phase 2's execution changes remain uncommitted at this UPDATE PROCESS closeout (see Current Execution State's "Outstanding non-blocking item" above) — the orchestrator, not this agent, owns invoking `vc-git-manager`. Flagging so Phase 3's RESEARCH does not assume a clean working tree.
8. **Recommended (not required) context delta, still deferred to program-end UPDATE PROCESS:** consistent with Phase 1's same recommendation, `process/context/all-context.md`'s "Current Implementation State" should gain a bullet for the full rewards+coupons backend once Phases 1-4 all ship, rather than churning mid-program. Not written this pass by explicit task instruction.

---

## Phase 1 Learnings for Downstream Phases

Captured at Phase 1's UPDATE PROCESS closeout (15-07-26). Read this before starting Phase 2 or Phase 4 RESEARCH — it corrects/confirms assumptions those phase plans made about Phase 1's deliverable.

1. **Canonical types are now real and tier-free — Phase 4 must NOT expect a "derived tier."** `packages/types/src/rewards.ts` ships `RewardsAccount{userId,currentStars,lifetimeStars}` and `RewardsProgress{currentStars,rewardThreshold,starsToNextReward}` (`rewardThreshold` fixed at 5). There is NO tier system anywhere — not bronze/silver/gold, not a "derived tier." Phase 4's plan text (written before Phase 1 executed) speculated Phase 1 would ship "schema-derived fields (currentStars/lifetimeStars/derived tier)" — that derived-tier prediction did NOT happen; tier was fully removed, not derived. Phase 4 RESEARCH should treat "no tier, ever" as a locked fact, not an open question.
2. **`Coupon` + `CouponDisplay` — the display-label gap Phase 4 flagged as CROSS-PHASE Known-Gap is Phase 2's problem to close, not open.** Phase 1 shipped the schema-based `Coupon{id,userId,code,status,dealId,rewardId,expiresAt,usedAt,createdAt}` PLUS a UI-display helper `CouponDisplay{id,code,title,discountLabel,expiresAt?,isRedeemed}` for card rendering. Phase 2's plan already self-corrected (post-PVL supplement) to have `serializeCoupon` join `deals`/`rewards` and populate the display-label fields — that cross-phase gap is on track to close in Phase 2, not still open.
3. **`serializeReward`/`serializeCoupon` already exist in `packages/api/src/routes/lib/serializers.ts`.** Phase 2 should extend/reuse `serializeCoupon` (add the join) rather than re-creating it. Phase 4 should consume `ApiReward`/`ApiCoupon` response shapes as-is.
4. **Money-unit gotcha for any future accrual/pricing work touching the `orders` table:** `orders.subtotal` (and other order money columns) are raw DECIMAL PESOS, not cents. Convert via `numericToCents()` (`packages/api/src/routes/lib/serializers.ts:110`) before any cents-based comparison or math — Phase 1's `computeStarsEarned` gate is the reference pattern (convert first, then compare against a cents-denominated threshold).
5. **Accrual is idempotent at the terminal `completed` transition in `packages/api/src/routes/staff.ts`'s PATCH handler** — confirmed the sole trigger site (state machine makes `completed` terminal, no re-transition possible). Any future phase touching order-completion side effects (e.g. a Phase 6 UX polish that surfaces "stars earned" toast) should hook the same site, not add a second one.
6. **Process observation (non-blocking):** during Phase 1's inner-PVL, a same-day sibling plan (`process/features/rewards-notifications/active/push-notifications-ui_14-07-26/`) shipped live code consuming the OLD `Coupon` shape with no cross-plan flag. It was caught and reconciled in Phase 1's blast radius (Checklist A4). No action needed now — flagging only so Phase 2/4 authors know to grep for `Coupon`/`CouponDisplay` consumers outside this program folder before assuming this program's blast radius is exhaustive.
7. **Recommended (not required) context delta, deferred to program-end UPDATE PROCESS:** `process/context/all-context.md`'s "Current Implementation State" should eventually gain a bullet for the rewards/coupons backend once the full rewards feature (Phases 1-4) ships, rather than a partial mid-program edit. Not written this pass by design (see UPDATE PROCESS task instructions — avoid partial-program context churn).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
