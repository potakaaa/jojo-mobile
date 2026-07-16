---
phase: phase-01-rewards-backend
date: 2026-07-15
status: COMPLETE
feature: mobile-tabs-order-flow-completion
plan: process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-01-rewards-backend_PLAN_14-07-26.md
---

# Phase 01 — Rewards/Stars Backend + Type Reconcile — EXECUTE Report

TL;DR: All 13 checklist items done. Every Exit Gate command is green (typecheck, lint, ui 47,
mobile 13, api 155 — incl. new star-accrual.test.ts 6 + rewards.test.ts 12, zero regressions).
Money-adjacent invariants (server-derived amounts, idempotent accrual, row-locked race-safe redeem,
insufficient→400 no-mutation) are proven by passing Fully-Automated tests. High-risk 5-artifact
evidence pack written and validator-clean. Two small within-blast-radius implementation choices noted
under Plan Deviations. Ready for EVL.

## What Was Done

### Step A — Type reconciliation (tier removal)
- `packages/types/src/rewards.ts`: rewritten tier-free — `Reward`, `RewardsAccount{userId,currentStars,lifetimeStars}`, `RewardsProgress{currentStars,rewardThreshold,starsToNextReward}`. `RewardsTier`/`RewardsTierProgress`/`points`/`tier` removed entirely.
- `packages/types/src/coupons.ts`: schema-based `Coupon{id,userId,code,status,dealId,rewardId,expiresAt,usedAt,createdAt}` + `CouponStatus` + a `CouponDisplay` UI helper (`id,code,title,discountLabel,expiresAt?,isRedeemed`) for cards.
- Cascade reshaped (mechanical, shape-only):
  - `packages/ui`: `reward-progress-card.tsx` (dropped `TIER_LABEL`, shows `{currentStars} stars`), `star-progress-bar.tsx` (`RewardsProgress`, "X stars to next reward" / "Reward ready!"), `coupon-card.tsx` (`CouponDisplay`), `__tests__/mocks.ts` (MOCK_REWARDS/MOCK_PROGRESS/MOCK_COUPON). `barrel-import.test.tsx` needed no edit (references component names only).
  - `apps/mobile`: `features/home/mock-home.ts` MOCK_REWARDS; `features/home/components/rewards-teaser-card.tsx` (tier badge removed → currentStars); `app/component-showcase.tsx` (SAMPLE_REWARDS/PROGRESS/COUPON + inline StarProgressBar literal); `app/(tabs)/index.tsx` (pass-through, unchanged type-wise); `app/(tabs)/order/cart.tsx` CouponCard literal (now satisfies `CouponDisplay`); `features/notifications/{mock-notifications.ts,lib/notification-factory.ts,lib/notification-factory.test.ts}` (`Coupon` → `CouponDisplay`).

### Step B — Stars accrual (server-authoritative)
- NEW `packages/api/src/routes/lib/star-accrual.ts`: pure `computeStarsEarned(subtotalCents, config)` — count-based, returns 1 at/above ₱100 (10000c) else 0; `DEFAULT_STAR_ACCRUAL_CONFIG`.
- `packages/api/src/routes/staff.ts`: replaced the `creditStarsForOrder` no-op with a real transaction — converts `order.subtotal` via `numericToCents`, gates via `computeStarsEarned`, idempotency guard (skip if an `earned` tx already exists for the order), upserts `user_stars` (+current, +lifetime), inserts `earned` `star_transactions`. Call site now `await`ed on the terminal `completed` transition (sole trigger).

### Step C — Serving routes
- NEW `packages/api/src/routes/rewards.ts`: `GET /rewards` (public catalog), `GET /rewards/balance` (requireSession, tier-free 4-field shape), `POST /rewards/:id/redeem` (requireSession; txn + `SELECT … FOR UPDATE` on user_stars → check → decrement current by cost (lifetime untouched) → `redeemed` tx → issue coupon `available` w/ code + expires_at; insufficient→400; unknown/malformed→404). `REWARD_THRESHOLD = 5`.
- `packages/api/src/routes/lib/serializers.ts`: added `ApiReward`/`serializeReward` (rewardValue → cents) and `ApiCoupon`/`serializeCoupon`.
- `packages/api/src/index.ts`: mounted `app.use('/rewards', rewardsRouter)` (no `/api` prefix, per-route gated — matches /orders convention).

### Tests
- NEW `packages/api/src/routes/__tests__/star-accrual.test.ts` (6 pure-unit tests).
- NEW `packages/api/src/routes/__tests__/rewards.test.ts` (12 integration tests): accrual happy-path + below-₱100 no-earn + cancel/reject no-earn + re-PATCH idempotency, balance shape (+401), public catalog money shape, redeem success + insufficient-400 + 404s + concurrent-redeem race.

## What Was Skipped or Deferred
- Nothing in Phase 1 scope was skipped. Mobile Rewards-tab UI wiring is Phase 4 (out of scope here). No migration was needed (all 4 tables exist from migration 0000; accrual config is a code constant).

## Test Gate Outcomes
| Gate | Command | Result |
|---|---|---|
| Monorepo typecheck | `pnpm typecheck` | PASS (7 packages) |
| Monorepo lint | `pnpm lint` | PASS (0 errors; 3 pre-existing unrelated warnings in `scripts/dev-with-tunnel.mjs`) |
| packages/ui cascade | `pnpm --filter @jojopotato/ui test` | PASS (47/47) |
| apps/mobile cascade | `pnpm --filter @jojopotato/mobile test` | PASS (13/13) |
| API + accrual/redeem | `docker compose up -d && db:migrate && pnpm --filter @jojopotato/api test` | PASS (155/155, 16 files; new star-accrual 6 + rewards 12; orders 25 / deals 13 / staff-order-status 17 unchanged) |
| Prettier | `pnpm format:check` | PASS (after formatting rewards.test.ts + staff.ts) |

## Plan Deviations
All within-blast-radius (naming / implementation detail); none hard-stop class; none change public behavior.
1. **Balance response built inline, not via a `serializeStarBalance` helper.** Blast radius listed `serializeStarBalance`; the balance route returns a 4-field computed object (`currentStars/lifetimeStars/rewardThreshold/starsToNextReward`) directly in the handler — simpler than a serializer for a shape with no DB-row source. `serializeReward`/`ApiReward` (and additionally `serializeCoupon`/`ApiCoupon` for the redeem response) were added as planned.
2. **`RewardProgressCard`/`RewardsTeaserCard` keep a `RewardsAccount` prop** (showing `currentStars`, no tier badge); only `StarProgressBar` moved to the `RewardsProgress` prop (it is the progress component that renders "X stars to next reward"). The plan's A4 phrasing ("reshape to tier-free RewardsProgress props") was satisfied as a mechanical "show stars, drop tier badge" fix without forcing every card onto `RewardsProgress`.
3. **Redeem returns HTTP 201** (created) for the new coupon, mirroring `POST /orders`. Insufficient-stars → 400 as specified.
4. **Coupon display helper named `CouponDisplay`** (plan A2 said "keep a display helper type if needed").

## Test Infra Gaps Found
- None new. Mobile RN-component/E2E runner gap is unchanged and untouched (this phase's mobile edits are type-only, covered by typecheck + the existing vitest pure-TS suite).

## Closeout Packet
- Selected plan: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-01-rewards-backend_PLAN_14-07-26.md`
- Finished: all 13 checklist items (A1–A4, B1–B3, C1–C5).
- Verified: all 5 Exit Gate commands green + prettier; high-risk evidence pack validator-clean (`harness/phase-01-rewards-backend/`).
- Unverified: none in scope. Mobile rewards UI is Phase 4.
- High-risk evidence pack: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/harness/phase-01-rewards-backend/` (risk-gate/context-snippets/verification/review-decision/adversarial-validation; `mustStopBeforeFinalize:false`, `humanApprovalRequired:true`).
- Follow-up plan stubs created: none.
- CONTEXT_PARTIAL: none.
- Best next state: EVL confirmation run (vc-tester re-runs the 5 Exit Gate gates), then UPDATE PROCESS to archive the phase + update umbrella `## Current Execution State`.
- Closeout classification: **Keep in active** — code-complete and self-verified, pending the orchestrator-owned EVL confirmation run before UPDATE PROCESS.

## Forward Preview
### Test Infra Found
- API integration pattern for session-gated routes: sign up via better-auth + drive real cookies through the full `app` (mirrors staff-order-status.integration.test.ts). Reused for rewards balance/redeem. Concurrent-redeem race proven with `Promise.all` + `SELECT … FOR UPDATE`.

### Blast Radius Changes
- `packages/types/src/{rewards,coupons}.ts` are now real schema-based shapes (breaking vs the old tier/points placeholder) — all consumers reconciled this phase. Phase 3 (Home rewire) and Phase 4 (Rewards/Coupon UI) build on `RewardsAccount`/`RewardsProgress`/`Reward`/`Coupon`/`CouponDisplay` and the `/rewards*` endpoints.
- `packages/api/src/routes/lib/serializers.ts` gained `serializeReward`/`serializeCoupon` (+ Api types) for downstream reuse.

### Commands to Stay Green
- `pnpm typecheck && pnpm lint`
- `pnpm --filter @jojopotato/ui test && pnpm --filter @jojopotato/mobile test`
- `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test`

### Dependency Changes
- None. No new packages; no migration (existing tables). Accrual threshold is a code constant (`DEFAULT_STAR_ACCRUAL_CONFIG`), admin-configurability deferred.
