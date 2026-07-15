---
name: plan:mobile-tabs-order-flow-completion-phase-01-rewards-backend
description: "Mobile Tabs + Order-Flow Completion — Phase 01: Rewards/Stars backend (accrual on order-completion + balance/summary + redeem→coupon) and rewards/coupons type reconciliation"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: mobile-tabs-order-flow-completion
  phase: phase-01
---

# Phase 01 — Rewards/Stars Backend + Type Reconcile

**Program:** mobile-tabs-order-flow-completion
**Umbrella plan:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/mobile-tabs-order-flow-completion-umbrella_PLAN_14-07-26.md
**Date**: 14-07-26
**Status**: ✅ VERIFIED
**Complexity**: COMPLEX (phase of a COMPLEX phase program)
**Report destination:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-01-rewards-backend_REPORT_14-07-26.md

## Overview / Context

TL;DR: Build the rewards/stars backend the whole rewards feature depends on, and reconcile the divergent shared types first. Tables (`rewards`, `user_stars`, `star_transactions`, `star_tx_type` enum) already exist (migration 0000) — this phase serves them, wires real stars accrual on order completion (replacing the `creditStarsForOrder` no-op stub), and exposes balance/summary + redeem routes. This is the foundation; Phases 2-4 depend on it. Read `process/context/all-context.md` and `process/context/tests/all-tests.md` first.

Money and stars are server-authoritative. **[SUPPLEMENT 14-07-26 — INNOVATE decision locked]** Accrual is **count-based, not peso-ratio**: exactly 1 star per completed order whose subtotal >= a minimum threshold (default 100000 = PHP 100, threshold is admin-configurable, effectively 10000 cents at PHP 100). Cancelled/rejected orders earn nothing. **NO tier system** — Bronze/Silver/Gold is dropped entirely. Progress is expressed as "X / 5 stars to next reward" (reward threshold = 5 stars, per PRD), not a tier badge.

**[VALIDATE 14-07-26] Order-completion trigger site — RESOLVED (was flagged ambiguous):** confirmed by code inspection: `packages/api/src/routes/staff.ts`'s `PATCH /orders/:orderId` handler is the ONLY code path in the repo that transitions an order to `'completed'` (the state machine in `order-state-machine.ts` makes `completed` terminal — no `completed→completed` transition is legal), so `creditStarsForOrder(updatedOrder)` at that call site (~line 290) is naturally idempotent per-order by construction. `orders.ts` never sets status — it only creates (`pending`) and reads orders. RESEARCH/INNOVATE should treat this as confirmed, not open.

## Phase Completion Rules

This phase is VERIFIED only when: all checklist items checked; the phase validate-contract exists with green gates; regression checks against overlapping earlier phases pass; and the phase report is written. Code-only completion is CODE DONE, never VERIFIED. Mobile-screen behavior with no automated runner is proven by Agent-Probe and recorded as Known-Gap. Post-phase testing uses the Exit Gate test gates (see process/context/tests/all-tests.md).

## Acceptance Criteria

- AC1: Order completion credits correct stars idempotently (Fully-Automated).
- AC2: GET /rewards/balance and POST /rewards/:id/redeem work; redeem creates a coupon; insufficient stars → 400 (Fully-Automated).
- AC3: rewards/coupons types reconciled to schema; typecheck green.

## Entry Gate

- Phase 0 (umbrella) complete.
- `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` runnable (needed for api tests).

## Blast Radius

- `packages/types/src/rewards.ts` — reconcile to schema (`current_stars`/`lifetime_stars`/`required_stars`/`reward_type`/`reward_value`); add a tier-free `RewardsProgress` shape (`currentStars`/`rewardThreshold`/`starsToNextReward`) — **[SUPPLEMENT 14-07-26] NO tier types** (Bronze/Silver/Gold removed per locked INNOVATE decision).
- `packages/types/src/coupons.ts` — reconcile to schema shape (`code`/`status`/`deal_id`/`reward_id`/`expires_at`) so Phase 2/4 consume a real shape (edited here once).
- `packages/api/src/routes/rewards.ts` — NEW route file.
- `packages/api/src/routes/lib/serializers.ts` — add `serializeReward`/`serializeStarBalance`/`ApiReward`.
- `packages/api/src/routes/lib/star-accrual.ts` (or similar) — NEW pure accrual computation (star math from order subtotal cents).
- `packages/api/src/index.ts` — mount `/rewards` (NO `/api` prefix — mirror the ACTUAL existing `/orders`/`/branches`/`/deals` router mounts, e.g. `app.use('/rewards', rewardsRouter)`. `/api/staff` and `/api/admin` are a DIFFERENT convention — mount-level-guarded router pairs, not the one to copy here. `GET /rewards/balance` and `POST /rewards/:id/redeem` are gated per-route with `requireSession` middleware inside `rewards.ts`, same as every handler in `orders.ts` — never gated at the `app.use` mount. **[VALIDATE 14-07-26] This corrects an internal contradiction in the original plan draft** — AC2 already said `/rewards/balance` (no prefix) while this line and Public Contracts said `/api/rewards/...`; `/rewards/*` (no prefix) is now the single source of truth.
- Order-completion accrual site: replace the `creditStarsForOrder` no-op in `packages/api/src/routes/staff.ts` (confirmed sole call site — see Overview note above) with a real transaction that writes `user_stars` + a `star_transactions` `earned` row.
- `packages/api/src/routes/__tests__/rewards.test.ts` — NEW automated gate (mirror `orders.test.ts`/`deals.test.ts`).
- Possible migration (ONLY if accrual config needs a new column, e.g. per-branch stars ratio) — flagged for RESEARCH; default is no migration.
- **[VALIDATE 14-07-26 — CASCADE BLAST RADIUS, added; breaking-changes finding]** **[SUPPLEMENT 14-07-26]** Type reconciliation of `RewardsAccount`/`RewardsTierProgress` (→ schema-based `RewardsAccount{userId,currentStars,lifetimeStars}`/`RewardsProgress{currentStars,rewardThreshold,starsToNextReward}` — tier-free, NO tier field) and `Coupon` (`title`/`discountLabel`/`isRedeemed` → `code`/`status`/`dealId`/`rewardId`/`expiresAt`/`usedAt`) has REAL consumers beyond `packages/types` that the original draft did not list. Mechanical (shape-only) fixes required, no new behavior:
  - `packages/ui/src/components/{reward-progress-card,star-progress-bar,coupon-card}.tsx` — prop types import `RewardsAccount`/`RewardsTierProgress`/`Coupon` directly and read `rewards.tier`/`rewards.points`/`progress.currentPoints`/`progress.pointsToNextTier`/`progress.nextTier`/`coupon.title`/`coupon.discountLabel`/`coupon.isRedeemed` — these will not compile against the new shape. **[SUPPLEMENT 14-07-26]** Reshape to the tier-free `RewardsProgress` props: components show "X / 5 stars to next reward" text/bar, never a tier badge/label.
  - `packages/ui/src/components/__tests__/{mocks.ts,reward-progress-card.test.tsx,star-progress-bar.test.tsx,coupon-card.test.tsx,barrel-import.test.tsx}` — jest-expo fixtures/assertions built on the OLD shape; this is `packages/ui`'s REAL automated test suite (not a placeholder) and must stay green.
  - `apps/mobile/src/features/home/mock-home.ts`, `apps/mobile/src/app/component-showcase.tsx`, `apps/mobile/src/app/(tabs)/index.tsx` — consume `RewardsAccount`/pass it to `RewardProgressCard` (pass-through or literal-field-rename only). **[INNER-PVL 14-07-26 correction]** `apps/mobile/src/features/home/components/rewards-teaser-card.tsx` is NOT a pass-through — confirmed by direct read: it renders its OWN inline tier badge (`TIER_LABEL: Record<RewardsAccount['tier'], string>`) and reads `rewards.tier`/`rewards.points` directly, the same pattern as `packages/ui`'s `reward-progress-card.tsx`. It needs the SAME tier-badge-removal treatment (drop `TIER_LABEL`, show stars/"X to next reward" instead of a tier label), not merely an import/type-name update.
  - `apps/mobile/src/app/(tabs)/order/cart.tsx` — consumes `CouponCard`/`Coupon`. **[INNER-PVL 14-07-26 correction]** confirmed by direct read: this constructs an inline `Coupon`-shaped literal from `cart.appliedDiscount` (a deal-application, not an issued coupon) with `title`/`discountLabel`/`isRedeemed` fields — none of which exist on the new schema-based `Coupon` (`code`/`status`/`dealId`/`rewardId`/`expiresAt`/`usedAt`). This is the concrete case Checklist A2's "keep a display helper type if needed by UI" note exists for: `CouponCard`'s prop type (and this literal) should use that UI-display helper type, not the raw schema `Coupon`, since `title`/`discountLabel` have no schema equivalent.
  - `apps/mobile/src/features/notifications/{mock-notifications.ts,lib/notification-factory.ts,lib/notification-factory.test.ts}` — **ALREADY-EXECUTED, live code** (delivered today by `process/features/rewards-notifications/active/push-notifications-ui_14-07-26/`, Gate: PASS, EXECUTE report status COMPLETE_WITH_GAPS) imports `Coupon` and constructs `MOCK_COUPON: Coupon` with the OLD shape; `shouldNotifyCouponExpiring(coupon: Coupon, ...)` reads `coupon.expiresAt` (its `!coupon.expiresAt` null-check is forward-compatible with a nullable `expiresAt`, but the `MOCK_COUPON` literal and any `.title`/`.discountLabel`/`.isRedeemed` reads are not). Fix the shape only — building/changing the notifications FEATURE stays out of this program's scope per the umbrella charter.

## Implementation Checklist

### Step A — Type reconciliation

- [x] A1. Rewrite `packages/types/src/rewards.ts` to match schema: `Reward` (id, name, requiredStars, rewardType, rewardValue|null, eligibleProductId|null, isActive), `RewardsAccount` = `{ userId, currentStars, lifetimeStars }` (match schema `current_stars`/`lifetime_stars`; remove `points`/`tier`). **[SUPPLEMENT 14-07-26 — locked]** Replace `RewardsTierProgress` with tier-free `RewardsProgress = { currentStars, rewardThreshold, starsToNextReward }` (threshold = 5, PRD). NO tier field, type, or derivation function anywhere (`RewardsTier`/`tierFor(lifetimeStars)` — DO NOT create). Remove the `points`/`tier`-only placeholder shape.
- [x] A2. Rewrite `packages/types/src/coupons.ts` to schema shape: `Coupon` (id, userId, code, status, dealId|null, rewardId|null, expiresAt|null, usedAt|null, createdAt). Keep a display helper type if needed by UI, but base type mirrors DB. **[INNER-PVL 14-07-26]** `userId` added to the field list (schema has `coupons.user_id`, omitted from the original enumeration — needed for any future per-user coupon read, e.g. Phase 4's Coupon Wallet); no behavior change in this phase.
- [x] A3. Fix any existing consumers broken by the type change (grep for `points`/`tier`/`discountLabel`/`isRedeemed` usages) — typecheck must stay green.
- [x] A4. **[VALIDATE 14-07-26 addition]** Mechanically update the cascade blast radius named above (`packages/ui`'s `RewardProgressCard`/`StarProgressBar`/`CouponCard` + their `mocks.ts` fixtures + 4 component test files; `apps/mobile/src/features/home/{mock-home.ts,components/rewards-teaser-card.tsx}`; `apps/mobile/src/app/component-showcase.tsx`; `apps/mobile/src/app/(tabs)/index.tsx`; `apps/mobile/src/app/(tabs)/order/cart.tsx`; `apps/mobile/src/features/notifications/{mock-notifications.ts,lib/notification-factory.ts,lib/notification-factory.test.ts}`) to the new schema-based shapes. Shape-only — do not add new behavior to Home or Notifications (out of this phase's/program's scope). **[INNER-PVL 14-07-26]** `rewards-teaser-card.tsx` and `packages/ui`'s own `reward-progress-card.tsx` both need their inline tier-badge render logic dropped in favor of a stars/progress display (see Blast Radius correction above) — this is still a mechanical shape fix (swap what's displayed to match the new fields), not new feature behavior. `cart.tsx`/`CouponCard` should consume the A2 UI-display helper type, not the raw schema `Coupon`. Confirm `pnpm --filter @jojopotato/ui test` and `pnpm --filter @jojopotato/mobile test` both stay green.

### Step B — Stars accrual (server-authoritative)

- [x] B1. Add pure `computeStarsEarned(subtotalCents, config)` in a new lib file. **[SUPPLEMENT 14-07-26 — locked INNOVATE decision, overrides prior ratio framing]** Count-based, NOT peso-ratio: returns a FIXED `1` when `subtotalCents >= config.minOrderSubtotalCents` (named config constant, default 10000 = PHP 100), else `0`. subtotalCents is used ONLY as the minimum-amount gate input, never as a ratio multiplier. Accrual base = order **subtotal** (convert the orders table's raw decimal-peso `order.subtotal` via `numericToCents()` from `serializers.ts` — see serializers.ts:110-111 — before calling `computeStarsEarned`). Unit-test both branches (>= threshold → 1, < threshold → 0) (Fully-Automated).
- [x] B2. Replace `creditStarsForOrder` no-op: on order reaching completed state, inside a transaction, upsert `user_stars` (increment current + lifetime) and insert a `star_transactions` row (`type: 'earned'`, order_id, stars, description). Idempotent per order (never double-credit).
- [x] B3. Cover accrual with supertest: order completion credits correct stars; re-running does not double-credit; non-completed states credit nothing.

### Step C — Serving routes

- [x] C1. `GET /rewards/balance` (session-gated via `requireSession`, NO `/api` prefix — see Blast Radius note) → `{ currentStars, lifetimeStars, rewardThreshold, starsToNextReward }`. **[SUPPLEMENT 14-07-26 — locked]** NO `tier`/`tierProgress` fields — tier system removed.
- [x] C2. `GET /rewards` (PUBLIC, no session required — mirrors `/branches`/`/deals`, catalog has no per-user data) → active rewards catalog, serialized (cents/units per schema).
- [x] C3. `POST /rewards/:id/redeem` (session-gated via `requireSession`) → inside a transaction, `SELECT ... FOR UPDATE` the caller's `user_stars` row (mirror the `deals` `.for('update')` pattern in `orders.ts` — **[VALIDATE 14-07-26] required to prevent a race where two concurrent redeem calls both read a passing balance and both decrement, driving `current_stars` negative**), then validate `current_stars >= reward.required_stars` server-side, **decrement `user_stars.current_stars` by `reward.required_stars`** (**[SUPPLEMENT 14-07-26 — locked]** do NOT reset to 0; `lifetime_stars` is untouched and keeps accumulating), insert `star_transactions` `redeemed` row, and create a `coupons` row (status `available`, `reward_id` set, unique `code`, `expires_at` set). Reject insufficient stars with 400. Return the created coupon. **[SUPPLEMENT 14-07-26]** `reward_type` taxonomy mirrors the existing deals discount-type taxonomy where applicable (`free_item`/`fixed_discount`/`percentage_discount`) — kept minimal; PRD's MVP reward is a free item. Treat as a RESEARCH/EXECUTE note, not a blocker.
- [x] C4. Mount `/rewards` in `packages/api/src/index.ts` — `app.use('/rewards', rewardsRouter)`, matching the ACTUAL `/orders`/`/branches`/`/deals` mount pattern (NOT the `/api/staff`/`/api/admin` mount-level-guard pattern).
- [x] C5. Add `rewards.test.ts` covering balance shape, redeem success, redeem insufficient-stars 401/400, and coupon creation on redeem.

## Exit Gate

```bash
docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test
# Expected: all suites pass incl. new rewards.test.ts; 0 failures

pnpm typecheck && pnpm lint
# [VALIDATE 14-07-26] Widened from `pnpm --filter @jojopotato/mobile typecheck` to the ROOT
# `pnpm typecheck` (turbo, all packages) — the mobile-scoped command would NOT have caught a
# packages/ui prop-type regression from the rewards/coupons type reconciliation.
# Expected: exit 0 (type reconciliation broke nothing, incl. packages/ui)

pnpm --filter @jojopotato/ui test
# [VALIDATE 14-07-26 addition] jest-expo component suite — must stay green after the
# RewardProgressCard/StarProgressBar/CouponCard prop-shape + mocks.ts updates (Checklist A4).
# Expected: exit 0

pnpm --filter @jojopotato/mobile test
# [VALIDATE 14-07-26 addition] vitest pure-TS suite — covers notification-factory.test.ts,
# which consumes the reconciled Coupon type (Checklist A4).
# Expected: exit 0
```

- All checklist items checked.
- Accrual is idempotent and server-authoritative; redeem is transactional.
- Phase report written to report destination above.

## Blockers That Would Justify BLOCKED Status

- Accrual requires a schema column that needs a migration AND migration cannot run (docker/db unavailable).
- Type reconciliation cascades into unrelated broken consumers beyond this blast radius (route to a follow-up plan, do not widen scope).
- ~~Order-completion trigger site ambiguous~~ **[VALIDATE 14-07-26] RESOLVED — not a blocker.** Confirmed sole site: `packages/api/src/routes/staff.ts` PATCH handler (see Overview note). No RESEARCH time needed on this specific question.

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: prior context loaded; trigger site confirmed (see Overview); plan drift checked. **[SUPPLEMENT 14-07-26]** Accrual model (count-based) and reward threshold (5 stars, no tiers) are now LOCKED by INNOVATE — no longer open RESEARCH questions.
- [x] 2. INNOVATE — innovate-agent: accrual model decided — count-based (1 star/order >= min subtotal, no tier system, 5-star reward threshold); Decision Summary locked **[SUPPLEMENT 14-07-26 — user-locked decisions applied]**
- [x] 3. PLAN-SUPPLEMENT — plan-agent: phase plan updated (0 text changes required — plan already reconciled to locked decisions from prior supplement pass; Inner Loop Refresh Note written to trigger inner PVL re-run) **[SUPPLEMENT 14-07-26]**
- [x] 4. PVL — vc-validate-agent: inner-PVL focused re-confirm complete (generated-by: inner-pvl: phase-1); validate-contract written, Gate: PASS **[INNER-PVL 14-07-26]**
- [x] 5. EXECUTE — all checklist items done; per-section test gates green (typecheck/lint green; ui 47, mobile 13, api 155 all pass — new star-accrual.test.ts 6 + rewards.test.ts 12) **[EXECUTE 15-07-26]**
- [x] 6. EVL — all EVL gates green (6/6 independently re-confirmed: typecheck, lint, ui 47/47, mobile 13/13, api 155/155, format:check); no follow-up stubs required; EVL HANDOFF SUMMARY emitted **[EVL 15-07-26]**
- [x] 7. UPDATE PROCESS — phase report written (`phase-01-rewards-backend_REPORT_14-07-26.md`), umbrella `## Current Execution State` updated (Phase 1 → ✅ VERIFIED, Phase 1 Learnings section added), execution commit already made by execute-agent per per-phase commit rule; process/plan-bookkeeping commit pending orchestrator checkpoint **[UPDATE PROCESS 15-07-26]**

**Validate-contract required before execute.**

## Touchpoints

- `packages/types/src/rewards.ts`, `packages/types/src/coupons.ts`
- `packages/api/src/routes/rewards.ts`, `packages/api/src/routes/lib/serializers.ts`, `packages/api/src/routes/lib/star-accrual.ts`, `packages/api/src/index.ts`
- Order-completion accrual site (`packages/api/src/routes/staff.ts` PATCH — confirmed sole site)
- `packages/api/src/routes/__tests__/rewards.test.ts`
- **[VALIDATE 14-07-26 addition — cascade from type reconciliation, mechanical only]** `packages/ui/src/components/{reward-progress-card,star-progress-bar,coupon-card}.tsx` + `packages/ui/src/components/__tests__/{mocks.ts,reward-progress-card.test.tsx,star-progress-bar.test.tsx,coupon-card.test.tsx,barrel-import.test.tsx}`; `apps/mobile/src/features/home/{mock-home.ts,components/rewards-teaser-card.tsx}`; `apps/mobile/src/app/component-showcase.tsx`; `apps/mobile/src/app/(tabs)/index.tsx`; `apps/mobile/src/app/(tabs)/order/cart.tsx`; `apps/mobile/src/features/notifications/{mock-notifications.ts,lib/notification-factory.ts,lib/notification-factory.test.ts}`

## Public Contracts

- NEW: `GET /rewards/balance` (session-gated), `GET /rewards` (public catalog), `POST /rewards/:id/redeem` (session-gated). **No `/api` prefix** — matches the existing `/orders`/`/branches`/`/deals` convention, not `/api/staff`/`/api/admin`. [VALIDATE 14-07-26 — corrected from `/api/rewards/...`, which contradicted this plan's own AC2.]
- Order API (`POST /orders`, `GET /orders/:id`) shape UNCHANGED — accrual is an internal side effect; `payment_status` stays `unpaid`.
- `packages/types` reward/coupon shapes change (breaking) — all consumers reconciled in this phase.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Order completion credits correct stars; re-run does not double-credit (`rewards.test.ts`) | Fully-Automated | AC-1 (stars earned on completion) |
| `GET /rewards/balance` returns currentStars/lifetimeStars/rewardThreshold/starsToNextReward (no tier fields) | Fully-Automated | AC-2 (view balance/progress) |
| `POST /rewards/:id/redeem` decrements stars + creates coupon; insufficient stars → 400 | Fully-Automated | AC-2/AC-3 (redeem→coupon) |
| Concurrent redeem calls cannot both succeed against an insufficient shared balance (`FOR UPDATE` lock proven by a serialized-then-rejected second call in `rewards.test.ts`) | Fully-Automated | AC-2 (server-authoritative redeem — security surface) |
| `computeStarsEarned` pure math (unit test) | Fully-Automated | AC-1 |
| Type reconciliation leaves typecheck green | Fully-Automated | AC-1/AC-2 (real shapes) |
| `packages/ui` RewardProgressCard/StarProgressBar/CouponCard render against the new prop shapes (existing jest-expo suite, updated fixtures) | Fully-Automated | AC-3 (cascade blast radius, breaking-changes finding) |
| `apps/mobile` notification-factory.test.ts stays green against the reconciled `Coupon` type | Fully-Automated | AC-3 (cascade blast radius) |

```bash
pnpm --filter @jojopotato/api test
# Expected: rewards.test.ts green, no regressions in orders/deals suites

pnpm --filter @jojopotato/ui test && pnpm --filter @jojopotato/mobile test
# [VALIDATE 14-07-26 addition] confirms the type-reconciliation cascade (packages/ui components +
# apps/mobile notification-factory.test.ts) did not regress
```

## Test Infra Improvement Notes

(none identified yet — accrual math is extracted as pure TS specifically so it is Fully-Automated). [VALIDATE 14-07-26] Noting a cross-plan coordination gap surfaced during this validate pass: `push-notifications-ui_14-07-26` (a sibling active plan in `process/features/rewards-notifications/active/`) was executed the same day as this phase's PVL and shipped live code consuming the pre-reconciliation `Coupon` shape, with no mechanism that flagged the impending Phase 1 type change to that plan's author. No fix required in THIS phase (the cascade is folded into Checklist A4 above) — flagging as a process observation for UPDATE PROCESS / vc-plan-discovery to consider: active plans in different folders that share a `packages/types` surface should cross-reference each other.

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-01-rewards-backend_PLAN_14-07-26.md`
- Last completed step: Step 7 UPDATE PROCESS — phase closed out, ✅ VERIFIED (15-07-26)
- Validate-contract status: PASS (inner-pvl: phase-1, 14-07-26)
- Supporting context: schema files under `packages/api/src/db/schema/{rewards,user_stars,star_transactions,coupons}.ts`; `packages/api/src/routes/orders.ts` and `deals.ts` as pattern references.
- Next step: Phase complete. Program proceeds to Phase 2 (Coupons Backend) — see umbrella `## Current Execution State` and `## Phase 1 Learnings for Downstream Phases`.

## Inner Loop Refresh Note

Date: 2026-07-14
Trigger: Step 1 (RESEARCH) + Step 2 (INNOVATE) ran for this phase; user locked the final accrual/redeem/type decisions (see Overview note and Checklist B1/C1/C3, and Blast Radius/Public Contracts tier-removal edits). This note supersedes the tier-inclusive framing still present in a few rows of the existing outer-pvl Validate Contract below (see its "Open gaps" paragraph, which already flagged this).

Changes applied by this PLAN-SUPPLEMENT pass:
- Confirmed (already correctly reflected in plan text from a prior supplement pass) — no plan-text edits were needed for: count-based accrual (fixed 1 star per completed order, gated by a ₱100/10000-cents minimum subtotal threshold, subtotal is NOT a ratio input); full removal of the tier system (no `RewardsTier`/`tierFor()`/`tier`/`tierProgress` anywhere); replacement of `RewardsTierProgress` with tier-free `RewardsProgress{currentStars,rewardThreshold,starsToNextReward}` (threshold=5 per PRD); redeem semantics (`SELECT...FOR UPDATE` row lock, decrement `current_stars` by `required_stars` — never reset to 0 — `lifetime_stars` untouched, insert `star_transactions` redeemed row, create `coupons` row `status:'available'`); `reward_type` taxonomy noted as mirroring the deals discount-type set (`free_item`/`fixed_discount`/`percentage_discount`), flagged EXECUTE-note not blocker.
- `packages/types/src/rewards.ts` target shape (Checklist A1) already specifies tier-free `RewardsAccount{userId,currentStars,lifetimeStars}` + `RewardsProgress` — 0 tier fields.
- `packages/ui` cascade (Checklist A4) already specifies reshaping `RewardProgressCard`/`StarProgressBar` to the tier-free progress props ("X / 5 stars to next reward" text/bar, never a tier badge) — 0 tier references remain in the checklist target shape.
- Verified: zero remaining `tier`/`Tier`/`Bronze`/`Silver`/`Gold` references anywhere in this plan's checklist, blast-radius, or contract target-shape prose (the only surviving "tier" tokens are inside historical VALIDATE-pass narrative text describing what was REMOVED, not forward-looking design).

Net effect: no plan-text mutation was required — the plan was already fully reconciled to the locked decisions from the prior supplement pass on 14-07-26. This note formally records that inner-loop RESEARCH+INNOVATE ran and confirms the decisions are locked, which per protocol re-triggers inner PVL (Step 4) so vc-validate-agent re-checks the existing outer-pvl contract's Section A/C rows against the (already tier-free) reshaped types before EXECUTE proceeds.

## Validate Contract

Status: PASS
Date: 14-07-26
date: 2026-07-14
generated-by: inner-pvl: phase-1
supersedes: 2026-07-14 (outer-pvl) — inner PVL has current evidence

Parallel strategy: sequential
Rationale: Signal score not re-scored — this is a FOCUSED inner-PVL re-confirm (explicit invocation scope), not a full Layer 1/Layer 2 fan-out. The outer-PVL contract above (superseded) already ran the full parallel-subagents fan-out (score 6/7) and its dimension/section findings remain valid — this pass re-checks only what the `## Inner Loop Refresh Note` (tier removal + locked INNOVATE decisions) touched: type-reconciliation completeness, forward-text coherence, exit-gate adequacy, and money-unit correctness. A single sequential re-check was sufficient; no cross-agent coordination was needed.

Focused inner-PVL checks performed (per invocation scope):
- **Coherence — no residual tier references in forward-looking content:** confirmed by full-file grep for `tier`/`Tier`/`Bronze`/`Silver`/`Gold`. Every forward-looking checklist/blast-radius/contract-target-shape occurrence is explicitly tier-FREE ("NO tier field", "tier-free", "0 tier fields"). The only "tier" tokens remaining are inside historical VALIDATE-pass narrative describing what was removed (e.g. this contract's own Dimension findings/Open gaps prose below) — not forward design. PASS.
- **Type-reconciliation completeness — all consumers of the reshaped types listed, nothing orphaned:** confirmed by direct file reads (not inference) of every named consumer: `packages/types/src/{rewards,coupons}.ts` (current OLD shape verified — `RewardsAccount{userId,points,tier}`, `RewardsTierProgress`, `Coupon{title,discountLabel,isRedeemed}` — matches what the plan says must change); `packages/ui/src/components/{reward-progress-card,star-progress-bar,coupon-card}.tsx` + `__tests__/{mocks.ts,reward-progress-card.test.tsx,star-progress-bar.test.tsx,coupon-card.test.tsx,barrel-import.test.tsx}` all exist as named; `apps/mobile/src/features/home/{mock-home.ts,components/rewards-teaser-card.tsx}`, `component-showcase.tsx`, `(tabs)/index.tsx`, `(tabs)/order/cart.tsx`, `features/notifications/{mock-notifications.ts,lib/notification-factory.ts,lib/notification-factory.test.ts}` all exist and import the old-shape types as described. Nothing orphaned — every real consumer found on disk is already listed in Blast Radius/Touchpoints/Checklist A4. **Two small forward-text gaps found and FIXED directly in this pass** (not scope changes — precision corrections to already-in-scope checklist items):
  1. `rewards-teaser-card.tsx` was described as a simple "pass it to `RewardProgressCard`" consumer; direct read showed it independently renders its own `TIER_LABEL` tier badge + `rewards.points`, the same pattern as `packages/ui`'s `reward-progress-card.tsx` (which already had precise treatment). Corrected Blast Radius bullet + Checklist A4 to call out the same tier-badge-removal treatment for this file.
  2. `cart.tsx`'s `CouponCard` usage constructs a `Coupon`-shaped literal from `cart.appliedDiscount` using `title`/`discountLabel`/`isRedeemed` — fields with no equivalent in the new schema-based `Coupon`. This is exactly the case Checklist A2's "keep a display helper type if needed by UI" already anticipates; corrected A2/A4 to point `CouponCard`/`cart.tsx` at that helper type explicitly, and added the schema's `userId` field (present in `coupons.user_id`, previously omitted from A2's field enumeration) so a future per-user coupon read (Phase 4) isn't blocked. Confirmed via direct schema read (`packages/api/src/db/schema/{user_stars,rewards,coupons}.ts`) that all other field names (`current_stars`/`lifetime_stars`/`required_stars`/`reward_type`/`reward_value`/`code`/`status`/`deal_id`/`reward_id`/`expires_at`/`used_at`) exactly match what the plan's target shapes already specify. No FAIL — both were precision fixes to already-correctly-scoped checklist items, applied directly to plan text.
- **Exit gate adequacy:** confirmed the Exit Gate (lines under `## Exit Gate`) runs all 4 required commands: root `pnpm typecheck && pnpm lint` (catches a `packages/ui` prop-type regression, not just `apps/mobile`-scoped), `pnpm --filter @jojopotato/ui test` (jest-expo suite covering the reshaped `RewardProgressCard`/`StarProgressBar`/`CouponCard`), `pnpm --filter @jojopotato/mobile test` (vitest suite covering `notification-factory.test.ts`'s reconciled `Coupon` consumption), and `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test` (the new `rewards.test.ts` gate). All 4 present and correctly scoped — a `packages/ui` prop break WOULD be caught. PASS.
- **Money-unit correctness:** confirmed Checklist B1 explicitly requires converting the orders table's raw decimal-peso `order.subtotal` via `numericToCents()` (verified present at `packages/api/src/routes/lib/serializers.ts:110` and already used for `subtotalCents` elsewhere in the same file, e.g. line 199) BEFORE calling `computeStarsEarned(subtotalCents, config)`. The threshold gate (`subtotalCents >= config.minOrderSubtotalCents`, default 10000 = ₱100) is correctly stated as a cents-vs-cents comparison, not a decimal-vs-cents mismatch. PASS.

Test gates (C3 5-column table) — carried forward from the superseded outer-pvl contract, unaffected by the tier removal (all rows already tier-free and match the confirmed schema field names):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Order completion (via staff PATCH → `completed`) credits correct stars exactly once per order | Fully-Automated | `rewards.test.ts`: complete an order, assert `user_stars`/`star_transactions` row; re-invoke transition (illegal per state machine) confirms no double-credit | B |
| AC1 | `computeStarsEarned(subtotalCents, config)` pure math | Fully-Automated | new `star-accrual.test.ts` (or colocated) unit test | B |
| AC2 | `GET /rewards/balance` returns `{currentStars,lifetimeStars,rewardThreshold,starsToNextReward}` (no tier fields) | Fully-Automated | `rewards.test.ts` | B |
| AC2 | `GET /rewards` returns active rewards catalog (public, no session) | Fully-Automated | `rewards.test.ts` | B |
| AC2/AC3 | `POST /rewards/:id/redeem` decrements stars, creates `coupons` row (status `available`) | Fully-Automated | `rewards.test.ts` | B |
| AC2 | Redeem with insufficient stars → 400, no mutation | Fully-Automated | `rewards.test.ts` | B |
| AC2 (security surface) | Two concurrent redeem calls against a shared balance cannot both succeed (row-lock proven) | Fully-Automated | `rewards.test.ts` | B |
| AC3 | Type reconciliation leaves the WHOLE monorepo green, not just `apps/mobile` | Fully-Automated | root `pnpm typecheck` | B |
| AC3 (breaking-changes cascade) | `packages/ui` RewardProgressCard/StarProgressBar/CouponCard render against new prop shapes (incl. tier-badge removal) | Fully-Automated | `pnpm --filter @jojopotato/ui test` | B |
| AC3 (breaking-changes cascade) | `apps/mobile`'s already-shipped `notification-factory.test.ts` stays green against reconciled `Coupon` type | Fully-Automated | `pnpm --filter @jojopotato/mobile test` | B |

gap-resolution legend: B — fixed in this plan (gate added/widened by this plan's checklist).

Failing stub:
test("should credit correct stars exactly once when an order transitions to completed", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: order completion credits correct stars idempotently")
})

Failing stub:
test("should reject a second concurrent redeem once the first has consumed the balance", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: concurrent redeem race is serialized by a row lock, not a lost update")
})

Failing stub:
test("should return 400 and make no mutation when redeeming with insufficient stars", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: redeem insufficient-stars rejects with 400, no partial write")
})

Legacy line form (retained so existing validate-contract consumers still parse):
- backend (packages/api): Fully-automated: `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test` | Expected: all suites incl. new `rewards.test.ts` pass, 0 failures.
- monorepo typecheck/lint: Fully-automated: `pnpm typecheck && pnpm lint` | Expected: exit 0 (root scope, catches packages/ui regressions).
- packages/ui cascade: Fully-automated: `pnpm --filter @jojopotato/ui test` | Expected: exit 0 (component prop-shape cascade, incl. tier-badge removal).
- apps/mobile cascade: Fully-automated: `pnpm --filter @jojopotato/mobile test` | Expected: exit 0 (notification-factory.test.ts cascade).

Dimension findings:
- Infra fit: PASS — carried forward from outer-pvl (route mount convention `/rewards`, no `/api` prefix, per-route `requireSession`; tables confirmed to exist via migration `0000`). Re-confirmed this pass via direct schema-file read (`user_stars`/`rewards`/`coupons` tables) — field names match plan exactly.
- Test coverage: PASS — carried forward (Exit Gate widened to root typecheck + packages/ui test + apps/mobile test); re-confirmed all 4 Exit Gate commands present and correctly scoped this pass.
- Breaking changes: PASS — carried forward blast-radius completeness finding, re-confirmed by direct read this pass with 2 precision fixes applied (rewards-teaser-card.tsx tier-badge-removal scope, CouponCard/cart.tsx display-helper-type routing) — see Focused inner-PVL checks above. No new orphaned consumers found.
- Security surface: PASS — carried forward (redeem row-lock via `SELECT ... FOR UPDATE`; accrual idempotency sound by construction — `completed` is terminal in the state machine and `staff.ts` PATCH is the sole trigger site).
- Section A — Type reconciliation: PASS — mechanical feasibility confirmed; the 2 precision fixes (rewards-teaser-card.tsx, CouponCard helper-type) are now folded into Checklist A2/A4 forward text.
- Section B — Stars accrual: PASS — money-unit conversion (`numericToCents`) confirmed correctly placed before the threshold gate in Checklist B1.
- Section C — Serving routes: PASS — carried forward (route-prefix convention, row-lock, unified 400 status code).

Open gaps: none. The 2 forward-text precision fixes found during this inner-PVL pass (rewards-teaser-card.tsx tier-badge scope; CouponCard/cart.tsx display-helper-type routing) were applied directly to plan text (Blast Radius + Checklist A2/A4) and are no longer gaps — see Focused inner-PVL checks above.

What this coverage does NOT prove:
- `rewards.test.ts` proves backend correctness (accrual, balance, redeem, locking) but does NOT prove the mobile UI actually calls these endpoints correctly or renders their responses — that is Phase 4's (Rewards Tab + Coupon Wallet UI) scope, not this phase's.
- The `packages/ui`/`apps/mobile` cascade gates prove the RECONCILED TYPES compile and existing component/logic tests still pass — they do NOT prove any new rendering behavior, since this phase makes no UI behavior changes beyond swapping a tier badge for a stars/progress display (mechanical shape fix, not new feature work).
- No live device/simulator walkthrough is planned or required for this phase (backend + type-only phase); Agent-Probe is deferred to the UI phases (3, 4, 5) per the umbrella program's test-tier split.
- The `FOR UPDATE` lock test proves serialization under a single-process supertest scenario; it does not prove behavior under true multi-process/multi-connection-pool concurrency at production scale (standard Postgres row-lock semantics are relied upon, not independently load-tested).

Gate: PASS (0 FAILs, 0 CONCERNs remaining. The 2 forward-text precision gaps found this pass were fixed directly in plan text — Blast Radius + Checklist A2/A4 — during this same validate pass, leaving no open gap. Plan is coherent post-tier-removal and EXECUTE-ready.)
