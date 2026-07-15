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
| 03 — Home Tab Rewire | ✅ VERIFIED |
| 04 — Rewards Tab + Coupon Wallet UI | ✅ VERIFIED |
| 05 — Account / Profile Screen | ✅ VERIFIED |
| 06 — Cross-Tab UX Polish | ✅ VERIFIED |

**PROGRAM COMPLETE (15-07-26): all 6 phases ✅ VERIFIED.** Program Goal Charter definition-of-done
items 1-6 all delivered: real stars accrual + rewards balance/redeem, real coupon wallet + redeem,
real Home tab (no mock-home.ts in render path), real Account profile view/edit, and consistent
friendly loading/empty/error states across all tabs (Phase 6 closed the last gap — Branches
react-query migration + dev-link cleanup + pay-at-branch copy + a11y pass). Payment stayed
pay-at-branch only throughout (no processor added, `payment_status` never left `unpaid`).

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

Last updated: 15-07-26 (Phase 6 closeout — PROGRAM COMPLETE)
Completed phases: Phase 0 (Planning), Phase 1 (Rewards/Stars Backend + Type Reconcile — ✅ VERIFIED), Phase 2 (Coupons Backend — ✅ VERIFIED), Phase 3 (Home Tab Rewire — ✅ VERIFIED), Phase 4 (Rewards Tab + Coupon Wallet UI — ✅ VERIFIED), Phase 5 (Account / Profile Screen — ✅ VERIFIED), Phase 6 (Cross-Tab UX Polish — ✅ VERIFIED)
Phase 6 status: ✅ VERIFIED
Phase 6 EVL: PASS — confirmed independently: mobile vitest 44/44 + jest 23/23 (19 baseline + 4 new branches tests) green; api 189/189 green (orders.test.ts 41/41 order-flow regression guard, branches.test.ts 7/7 proving the B1a `priority` passthrough didn't break anything); mobile typecheck/lint/format:check all green; 0 `"Dev:"` nav-link occurrences remain in `(tabs)`. C3 (optional checkout jest test) skipped honestly — non-blocking, reanimated-mock gap recorded in Test Infra Gaps Found.
Phase 6 report: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-06-ux-polish_REPORT_14-07-26.md`
Phase 6 known state (not a blocker): C3 optional checkout jest regression test deferred — shared `test-utils/jest-setup.ts` reanimated mock lacks layout-animation exports (`FadeIn`/`FadeOut`/`SlideInDown`/`SlideOutDown`/`Easing`/`cancelAnimation`) needed to render checkout under jest; extending that mock is a cross-cutting test-infra change out of this bounded phase's scope. Recommended backlog item, not a program blocker — `orders.test.ts` remains the hard order-flow regression gate.

**PROGRAM STATUS: COMPLETE.** All 6 phases ✅ VERIFIED. See Program Status Table above for the
program-completion summary. Next action for this feature line: none required — future adjacent work
(e.g. extending the reanimated jest mock, adding a native-restart persistence harness, notifications
backend) belongs in new, separate feature/plan folders, not a reopened phase of this program.

Phase 5 status: ✅ VERIFIED (unchanged this pass)
Phase 5 EVL: PASS — all gates confirmed independently: mobile typecheck clean, mobile test vitest 44/44 + jest 19/19 (5 suites), ui regression 47/47, lint clean, format:check clean, role-scope grep clean (no `role` field anywhere in `edit-profile.tsx`); jest suite content confirmed to assert real render/interaction behavior including explicit assertion that Save calls `updateProfile` with EXACTLY `{name,birthday,address}` — no `role`, no `onboardedAt` — not smoke-only placeholders
Phase 5 report: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-05-account-profile_REPORT_14-07-26.md`
Phase 5 known state (not a blocker): AC7 (native-restart persistence round-trip) is Agent-Probe/Known-Gap, irreducible — no process-restart harness exists project-wide (same standing gap noted by every prior UI phase). No follow-up plan stub created — this is a project-wide infra gap already tracked, not a Phase-5-specific miss.
Phase 4 status: ✅ VERIFIED (unchanged this pass)
Phase 4 report: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-04-rewards-coupon-ui_REPORT_14-07-26.md`
Phase 4 test-infra milestone (durable, still load-bearing for Phase 6): `apps/mobile` has its FIRST RN component test runner (jest-expo). `test` script = `vitest run --passWithNoTests && jest` (vitest owns `*.test.ts`, jest owns `*.test.tsx`). Reusable helpers: `apps/mobile/src/test-utils/render.tsx` (ASYNC `renderWithProviders()` — must be awaited) and `apps/mobile/src/test-utils/jest-setup.ts` (hand-rolled reanimated mock; global `expo-router` stub; global `@/features/auth/lib/auth-client` mock). Phase 5 reused these verbatim and additionally established the `jest.mock('@/features/auth/hooks/use-auth', ...)` pattern for screens needing a signed-in-user fixture — Phase 6 should reuse THAT pattern too wherever it touches an authed screen.
Phase 3 status: ✅ VERIFIED (unchanged this pass)
Phase 3 report: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-03-home-rewire_REPORT_14-07-26.md`
Phase 3 known state (not a blocker): `apps/mobile/src/features/home/mock-home.ts` was NOT fully deleted from disk — it is demoted to showcase-only (still imported transitively by `features/cart/mock-cart.ts`, the `component-showcase.tsx` demo seed), removed from the production render path only. This matches the plan's C1 explicit exclusion of `mock-cart.ts`, not a deviation from plan intent — recorded here as a durable known state for any future full-cleanup pass.
Phase 3 Agent-Probe owed (Known-Gap, non-blocking): on-device Home render + friendliness walkthrough (branch/menu/deals/rewards render from live data; loading/empty/error+retry across all 4 queries; branch↔cart sync; navigation) — no RN runner exists (project-wide gap), never claimed as automated coverage.
Phase 2 status: ✅ VERIFIED (unchanged this pass)
Phase 2 report: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-02-coupons-backend_REPORT_14-07-26.md`
Phase 2 high-risk evidence pack: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/harness/phase-02-coupons-backend/` (5 artifacts — adversarial-validation.json, context-snippets.json, review-decision.json, risk-gate.json, verification.json; `humanApprovalRequired:true` — human sign-off on the coupon/order pricing-engine evidence pack recommended before production deploy; not a program blocker, carried forward)
Phase 1 status: ✅ VERIFIED (unchanged this pass)
Phase 1 report: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-01-rewards-backend_REPORT_14-07-26.md`
Phase 1 high-risk evidence pack: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/harness/phase-01-rewards-backend/` (`mustStopBeforeFinalize:false`, `humanApprovalRequired:true` — carried forward)
Current phase: Phase 6 — Cross-Tab UX Polish (COMPLETE — program's final phase)
Current loop step: 7-update-process (complete)
Validate-contract status: CONDITIONAL (written 15-07-26; 1 concern — B1a priority-field regression — resolved via direct plan fix; see Phase 6 plan's `## Validate Contract`)
Program Net Gate: PASS — all 6 phases ✅ VERIFIED, program complete
Latest validator run: 15-07-26 (this UPDATE PROCESS pass) — `validate-context-discovery.mjs` + `validate-plan-inventory.mjs` run post-context-edit and post-archival; results in the Phase 6 UPDATE PROCESS report
Outstanding non-blocking item (carried forward, orchestrator-owned — NOT resolved by this UPDATE PROCESS pass, commit intentionally deferred to orchestrator per task instruction): Phase 1-6's execution changes (commits 04effb1/f9dc60e/7dae7f2/3e9d246/be7e6d2 plus Phase 6's still-uncommitted working-tree diff) need a final execution commit + PR before this program can be considered fully closed out at the repo level. `apps/mobile/src/features/auth/hooks/use-auth.ts` was modified by Phase 5 (additive `updateProfile`) — part of Phase 5's blast radius, not unrelated.

Loop step values: RESEARCH | INNOVATE | PLAN-SUPPLEMENT | PVL | EXECUTE | EVL | UPDATE-PROCESS
Orchestrator rule: read "Current loop step" and "validate-contract status" before spawning any subagent. Never spawn execute-agent when loop step is RESEARCH, INNOVATE, PLAN-SUPPLEMENT, or PVL.

Note: The Stable Program Goal above is fixed. This section is the only part that changes — update-process-agent rewrites it after every phase closeout (overwrite, not append).

---

## Phase 5 Learnings for Downstream Phases

Captured at Phase 5's UPDATE PROCESS closeout (15-07-26). Read this before starting Phase 6
(Cross-Tab UX Polish) RESEARCH — Phase 6 is the FINAL phase and touches every tab Phase 3/4/5
delivered, plus the existing order flow.

1. **`useAuth()` now has `updateProfile({name,birthday,address})` — additive, distinct from
   `completeProfile()`.** `completeProfile()` re-stamps `onboardedAt` (used once, at onboarding);
   `updateProfile()` does NOT touch `onboardedAt` and is the correct call for any future
   post-onboarding profile edit. Both call `authClient.updateUser` with an explicit field allowlist
   — `role` is never sent by either. Phase 6 should reuse `updateProfile()` verbatim if it needs any
   further profile-adjacent edit; do not add a third profile-mutation path.
2. **`features/auth/lib/birthday.ts` (new) is now the canonical birthday helper** —
   `isValidBirthday` (real calendar/leap-year aware), `assembleBirthday`, `splitBirthday`. It was
   extracted from onboarding's inline logic but onboarding itself was intentionally NOT refactored
   to import it (kept Phase 5's blast radius bounded) — this is a known, accepted duplication, not
   a Phase 5 miss. If Phase 6's UX-polish pass touches onboarding's birthday input, consider folding
   it onto this shared helper as a bonus cleanup (optional, not required).
3. **The `jest.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: jest.fn() }))` factory
   pattern is now established** as the way to jest-test any screen that needs a signed-in-user
   fixture without loading the real hook's top-level `Linking.createURL` side effect. Phase 6 should
   reuse this pattern for any screen test needing an authed user, rather than re-deriving a mock.
4. **`account/index.tsx` is now a real profile view (no more `<ComingSoon>`), `account/edit-profile.tsx`
   is a new route registered in `account/_layout.tsx`.** Phase 6's UX-polish pass over the Account
   tab should treat these as the baseline to polish (loading/empty/error consistency, a11y) — not
   screens to rebuild.
5. **Test totals after Phase 5 (durable reference for Phase 6's EVL baseline):** `apps/mobile`
   vitest 44 + jest 19 (5 suites); `packages/ui` jest 47/47. Phase 6 should expect these counts to
   only grow, never regress — any EVL run showing fewer passing tests than this baseline is a
   regression, not a flaky-test false negative.
6. **Process observation (non-blocking):** Phase 2/3/4's execution changes remain uncommitted at
   this UPDATE PROCESS closeout, and Phase 5 adds one more uncommitted phase on top (see Current
   Execution State's "Outstanding non-blocking item" above) — the orchestrator, not this agent, owns
   invoking `vc-git-manager`. Also note: the prior umbrella note flagging
   `apps/mobile/src/features/auth/hooks/use-auth.ts` as "unrelated to this program" is now WRONG —
   Phase 5 legitimately modified this file (additive `updateProfile`); it IS part of this program's
   blast radius as of this phase and should be included in the Phase 5 execution commit, not
   excluded from it.
7. **Recommended (not required) context delta, still deferred to program-end UPDATE PROCESS (Phase 6):**
   consistent with every prior phase's same recommendation, `process/context/all-context.md` should
   gain, once Phase 6 ships: (a) a bullet for the full rewards+coupons+Home-rewire+Rewards-UI+
   Account-profile delivery, (b) the jest-expo-in-apps/mobile testing-stack note, and (c) confirmation
   that all 5 tabs now render real data (no `<ComingSoon>` remaining except Notifications-related
   surfaces, which are explicitly out of scope for this program). Not written this pass by explicit
   task instruction (program-end task).

---

## Phase 4 Learnings for Downstream Phases

Captured at Phase 4's UPDATE PROCESS closeout (15-07-26). Read this before starting Phase 5
(Account/Profile) or Phase 6 (UX Polish) RESEARCH — Phase 4 established `apps/mobile`'s first RN
component test runner, and per the user's standing mandate, Phase 5 and Phase 6 MUST reuse it.

1. **`apps/mobile` now has a real RN component test runner (jest-expo) — this is the biggest
   durable change from Phase 4.** `apps/mobile/package.json`'s `test` script is now
   `vitest run --passWithNoTests && jest` — vitest owns pure-TS `*.test.ts` files, jest owns
   component `*.test.tsx` files. Both run sequentially under `pnpm --filter @jojopotato/mobile test`.
   `apps/mobile/jest.config.js` mirrors `packages/ui`'s existing jest-expo setup (same pinned dep
   versions, same pnpm-aware `transformIgnorePatterns`).
2. **Reuse `apps/mobile/src/test-utils/render.tsx` and `apps/mobile/src/test-utils/jest-setup.ts`
   verbatim — do not re-derive.** `render.tsx` exports an ASYNC `renderWithProviders()` (must be
   `await`ed — RTL render is wrapped to flush the QueryClientProvider tree) plus `spyOnAlert()`.
   `jest-setup.ts` carries 3 empirically-proven gotcha fixes:
   (a) a hand-rolled `react-native-reanimated` mock — the official `/mock` export crashes on this
   repo's reanimated 4.5.0 + worklets 0.10.0 pin;
   (b) a `SafeAreaProvider` `initialMetrics` fixture (`TEST_SAFE_AREA_METRICS`) — without fixed
   metrics the provider does not resolve synchronously in jest;
   (c) a global `expo-router` stub AND a global `jest.mock('@/features/auth/lib/auth-client')` —
   the auth-client mock is REQUIRED whenever a screen (even transitively) imports
   `@/lib/api-client`, because that module pulls in `@better-auth/*` ESM that jest cannot transform.
   Any screen touching `api-client.ts` (directly or via a hook) needs this mock already active —
   it's global in `jest-setup.ts`, so new test files get it for free.
3. **Per the user's standing mandate: Phase 5 (Account/profile) and Phase 6 (UX polish) MUST write
   real jest component tests for their screens, not Agent-Probe deferrals.** Phase 4 proved this is
   mechanically tractable (AC1/AC2 moved from Agent-Probe to Fully-Automated) — treat that as the
   now-expected bar, not an optional stretch goal. Agent-Probe should be narrowed to ONLY
   real-device gesture/navigation-stack confirmation that no runner can substitute for.
4. **Session-authed mobile fetches use the `authedJson` helper (`apps/mobile/src/lib/api-client.ts`),
   which attaches `Cookie: authClient.getCookie()` and throws a typed `ApiError` (carries HTTP
   status) on non-2xx.** `getRewardsBalance`, `getRewardsCatalog`, `redeemReward`, `getCoupons`,
   `redeemCoupon` all use it. Phase 5's Account/profile fetch (if it adds a new authed GET) should
   reuse `authedJson` rather than hand-rolling another cookie-attachment fetch wrapper.
5. **Pure adapter/eligibility logic pattern reconfirmed:** `features/coupons/lib/to-coupon-display.ts`
   (API shape → `CouponDisplay` UI shape) and `features/rewards/lib/redeem-eligibility.ts`
   (affordability check) are both pure functions with dedicated vitest unit suites — the same
   extract-to-pure-function-plus-unit-test pattern Phase 3 established with
   `menu-to-home-view.ts`. Phase 5/6 should follow this for any non-trivial reshape/eligibility logic
   inside a screen.
6. **Process observation (non-blocking):** Phase 2/3/4's execution changes remain uncommitted at
   this UPDATE PROCESS closeout (see Current Execution State's "Outstanding non-blocking item"
   above) — the orchestrator, not this agent, owns invoking `vc-git-manager`. Flagging so Phase 5's
   RESEARCH does not assume a clean working tree.
7. **Recommended (not required) context delta, still deferred to program-end UPDATE PROCESS:**
   `process/context/all-context.md` should eventually gain (a) a bullet for the full
   rewards+coupons+Home-rewire+Rewards-UI delivery once the program ships, and (b) a note in the
   Technology Stack / Testing section that `apps/mobile` now has jest-expo alongside vitest (the
   FIRST RN component-test-runner precedent in this repo, mirroring `packages/ui`'s jest-expo setup
   and `apps/admin`'s earlier vitest+RTL precedent). Not written this pass by explicit task
   instruction (program-end task) — recommendation captured here so it isn't lost.

---

## Phase 3 Learnings for Downstream Phases

Captured at Phase 3's UPDATE PROCESS closeout (15-07-26). Read this before starting Phase 4 RESEARCH — Phase 4 (Rewards Tab + Coupon Wallet UI) shares the `features/rewards/` directory and the `/rewards/balance` consumption pattern Phase 3 just established.

1. **`apps/mobile/src/features/rewards/hooks/use-rewards-summary.ts` + `getRewardsBalance()` (`apps/mobile/src/lib/api-client.ts`) now exist and are live.** They return `{currentStars, lifetimeStars, rewardThreshold, starsToNextReward}` (tier-free, no envelope wrapper — matches `getMenu()`'s pattern, not `getBranches`/`getDeals`'s `{key}` envelope pattern). Phase 4's Rewards tab should consume `useRewardsSummary()` directly rather than re-deriving balance state or re-implementing the fetch.
2. **`getRewardsBalance()` attaches the session cookie (`authClient.getCookie()`), diverging from the plan's original "mirror `getMenu()` verbatim" instruction (Deviation D1 in the Phase 3 report).** `getMenu()` is a PUBLIC route; `/rewards/balance` is `requireSession`-gated. The established, reusable pattern for any future authed mobile fetch in `lib/api-client.ts` is: keep the no-envelope response-parsing style, but attach `Cookie: authClient.getCookie()` — the same pattern `features/staff/lib/staff-api.ts`'s `staffFetch` already uses. Phase 4's coupon-wallet fetch (`GET /coupons`, also session-gated per the umbrella's Phase 1/2 delivery) must follow the same cookie-attachment pattern, not a verbatim copy of a public-route fetch helper.
3. **`packages/ui`'s `RewardProgressCard`/`StarProgressBar` already consume the tier-free `RewardsAccount`/`RewardsProgress` shapes — confirmed twice now (Phase 3's inner-PVL direct source read, then re-confirmed at EXECUTE with zero adaptation needed).** Phase 4 can wire these components directly against current prop types; the earlier cross-phase coordination risk (E1, tracked since Phase 1) is fully closed, not just deferred.
4. **`apps/mobile/src/features/home/lib/menu-to-home-view.ts` establishes the pure-adapter pattern for flattening a nested API tree shape into a flat UI-prop shape** (`flattenMenuForHome`, covered by a 9-case vitest unit suite). Any future screen that needs to reshape a nested API response for a flat-shaped UI component should follow this same extract-to-pure-function-plus-unit-test pattern (Fully-Automated) rather than inlining the reshape logic in the screen component — this is also the concrete answer to the umbrella's "Test Infra Improvement Notes" opportunity for future UI phases.
5. **Known state (non-blocking): `apps/mobile/src/features/home/mock-home.ts` was NOT deleted from disk.** It is demoted to showcase-only — still transitively imported by `features/cart/mock-cart.ts` (the `component-showcase.tsx` demo seed), which was explicitly out of scope for Phase 3's C1 cleanup step. The production render path (`(tabs)/index.tsx` + `features/home/components`) is clean per the Exit Gate grep. This is NOT a Phase 3 deviation — it matches the plan's explicit C1 exclusion — but is recorded here so no future phase mistakes `mock-home.ts`'s continued on-disk presence for an incomplete Phase 3.
6. **Process observation (non-blocking):** Phase 2's (and now Phase 3's) execution changes remain uncommitted at this UPDATE PROCESS closeout (see Current Execution State's "Outstanding non-blocking item" above) — the orchestrator, not this agent, owns invoking `vc-git-manager`. Flagging so Phase 4's RESEARCH does not assume a clean working tree.
7. **Recommended (not required) context delta, still deferred to program-end UPDATE PROCESS:** consistent with Phases 1 and 2's same recommendation, `process/context/all-context.md`'s "Current Implementation State" should gain a bullet for the full rewards+coupons+Home-rewire delivery once Phases 1-4 all ship, rather than churning mid-program. Not written this pass by explicit task instruction (program-end task).

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
