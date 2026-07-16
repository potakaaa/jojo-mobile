---
phase: phase-02-coupons-backend
date: 2026-07-15
status: COMPLETE
feature: mobile-tabs-order-flow-completion
plan: process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-02-coupons-backend_PLAN_14-07-26.md
---

# Phase 02 — Coupons Backend — EXECUTE Report

TL;DR: All 22 checklist items done. New `GET /coupons` wallet list + `POST /coupons/:id/redeem` (atomic CAS), plus HIGH-RISK server-side coupon auto-apply at checkout (`POST /orders` optional `couponId` → server-derived, dual-clamped, stacking-consistent discount, consume-exactly-once). Additive migration `0007_round_menace.sql` (nullable `orders.coupon_id`). Exit Gate fully green (API 189/189, typecheck 6/6, lint clean, mobile typecheck clean, format clean). High-risk 5-artifact evidence pack written + validated. No blocking deviations.

## What Was Done

**Schema + migration (C0)**
- `packages/api/src/db/schema/orders.ts` — added nullable `coupon_id: uuid('coupon_id').references(() => coupons.id)` (NO ACTION), mirroring `deal_id`; imports `coupons`.
- `packages/api/drizzle/0007_round_menace.sql` — drizzle-kit-generated (NOT hand-written): `ADD COLUMN coupon_id uuid` + NO ACTION FK. Applied clean via `db:migrate`.

**Serializers (A1a, A1b)**
- `packages/api/src/routes/lib/serializers.ts` — added `rewardDiscountLabel(rewardType, rewardValue, rewardName)` (explicit default branch for unrecognized `reward_type`), `serializeCouponWithLabel(coupon, deal, reward)` + `ApiCouponWithLabel`. Added `couponId` to `ApiOrder` + `serializeOrder`. **`serializeCoupon` signature UNCHANGED** (still used by `POST /rewards/:id/redeem`).

**Coupons route (A1, B1) — NEW file**
- `packages/api/src/routes/coupons.ts` — `GET /coupons` (per-route `requireSession`, LEFT JOIN deals+rewards for `displayLabel`, `?status=` filter over EFFECTIVE status, read-time expiry relabel, newest-first) and `POST /coupons/:id/redeem` (atomic CAS `available→used`; 0-row → 404/403/409). Mounted at `/coupons` (no `/api` prefix) in `packages/api/src/index.ts`.

**Orders coupon auto-apply (C1–C6)**
- `packages/api/src/routes/orders.ts` — optional `couponId` in the zod schema; imports `coupons`, `rewards`. Inside the placement transaction, AFTER the deal block (consistent lock ordering): `SELECT ... FOR UPDATE` the coupon → validate owner/status/expiry → derive `couponDiscountCents` (fixed/percentage/free_item-base-price from reward, or `computeDealDiscountCents` from deal, or 400 for unrecognized/complex/unlinked) → individual clamp. Stacking: `combinedDiscountCents = min(deal + coupon, subtotal)` drives BOTH `discount_total` and `total`. After the order insert (same txn): CAS-mark-used; 0 rows → 409 abort.

**Tests**
- `packages/api/src/routes/__tests__/coupons.test.ts` — NEW, 18 cases (list/filter/isolation/expiry-relabel/label-join/redeem CAS + 404/403/409/concurrent/AC3).
- `packages/api/src/routes/__tests__/orders.test.ts` — EXTENDED, +16 coupon-apply cases (per-reward-type, free-item base-price, free-item-absent 400, deal-issued + complex reject, unrecognized reward_type 400, stacking + clamp, terminal 409/403/404, concurrent race, rollback atomicity, backward-compat couponId null).

## What Was Skipped or Deferred

- Mobile checkout UI wiring (passing a selected `couponId` into `POST /orders`) — explicitly Phase 4's scope, not touched (per plan cross-phase ownership note).
- No write-back of `status='expired'` (TTL relabel is read-time only — no cron in scope, per plan Expiry semantics).

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Migration (Hybrid) | `db:generate` → `0007_round_menace.sql`; `db:migrate` | PASS (applied clean) |
| API suite (Fully-Automated) | `pnpm --filter @jojopotato/api test` | PASS — 189/189, 17 files (baseline 155 + coupons 18 + orders +16) |
| Regression guard | `rewards.test.ts` (serializeCoupon shape) | PASS — 12/12, shape unchanged |
| Mobile typecheck | `pnpm --filter @jojopotato/mobile typecheck` | PASS (exit 0) |
| Root typecheck | `pnpm typecheck` | PASS — 6/6 |
| Lint | `pnpm lint` | PASS — 7/7 (3 pre-existing unrelated warnings in `dev-with-tunnel.mjs`) |
| Format | `pnpm format:check` | PASS — all clean |

Every AC4 money-path behavior has an asserting Fully-Automated test (no Known-Gap-only behavior; net-gate vacuous-green ban satisfied).

## Plan Deviations

1. **`rewardDiscountLabel` third param (`rewardName`) — within-blast-radius, minor.** Plan A1b wrote a 2-arg `(reward_type, reward_value)` signature; implemented with a third `rewardName` because the plan's OWN stated behavior needs the name (free_item + fallback labels). Same file, internal helper, no public-contract impact. Recorded in the plan's `## Deviations` section. No hard-stop class touched.

## Test Infra Gaps Found

- None new. Standing project-wide gap unchanged: no RN component/E2E runner for `apps/mobile` (not relevant here — Phase 2 has no mobile touchpoints). Cross-phase live integration (Phase 1 redeem → Phase 2 checkout) remains fixture-decoupled, verified end-to-end only at Phase 4 Agent-Probe.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-02-coupons-backend_PLAN_14-07-26.md`
- **Finished:** all 22 checklist items; migration applied; evidence pack written + validated (0 failures).
- **Verified:** Exit Gate green (all commands above, real results). **Unverified:** none in scope. `humanApprovalRequired: true` on the money surface (sign-off recommended pre-prod, not a program blocker).
- **Cleanup remaining:** orchestrator EVL re-run (independent vc-tester), then UPDATE PROCESS (archive/commit + umbrella `## Current Execution State` rewrite to Phase 3).
- **Best next state:** orchestrator spawns vc-tester for the EVL confirmation run (re-run the Exit Gate commands); on green → `ENTER UPDATE PROCESS MODE`.
- **Evidence pack:** `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/harness/phase-02-coupons-backend/` (5 artifacts, validator: 0 failures).
- **Follow-up stubs created:** none. **CONTEXT_PARTIAL items:** none.
- **Closeout classification:** Ready for UPDATE PROCESS archival (pending orchestrator EVL confirmation).

## Forward Preview

### Test Infra Found
- `packages/api` vitest+supertest against real Postgres (docker `jojo-mobile-jojopotato-db-1` on :5432, jojo/jojo/jojopotato) is the hard automated gate. Hermetic self-seeding fixtures (assert-by-id) are the established pattern; the `Promise.all` concurrency pattern in `orders.test.ts` is reused for coupon races.

### Blast Radius Changes
- NEW: `packages/api/src/routes/coupons.ts`, `packages/api/src/routes/__tests__/coupons.test.ts`, `packages/api/drizzle/0007_round_menace.sql` (+ meta snapshot).
- MODIFIED: `packages/api/src/routes/orders.ts`, `.../orders.test.ts`, `.../lib/serializers.ts`, `.../db/schema/orders.ts`, `.../index.ts`.
- API response `Order` gains nullable `couponId` (additive). `POST /orders` gains optional `couponId` (backward-compatible). `POST /rewards/:id/redeem` UNCHANGED.

### Commands to Stay Green
- `docker compose up -d` (or use the running `jojo-mobile-jojopotato-db-1`) → `pnpm --filter @jojopotato/api db:migrate` → `pnpm --filter @jojopotato/api test`
- `pnpm typecheck && pnpm lint && pnpm --filter @jojopotato/mobile typecheck && pnpm format:check`

### Dependency Changes
- None (no new packages). New schema migration `0007_round_menace.sql` must be applied in any fresh environment before the suite runs.

## STRIDE (vc-security) Summary
Recorded in `harness/phase-02-coupons-backend/adversarial-validation.json` — 9 scenarios ruled out: tampered discount amount, free-item price-gaming, IDOR on another user's coupon, double-spend race (redeem+order / order+order), expired-coupon bypass, over-subtotal/negative-total, unrecognized reward_type, partial-state atomicity, migration safety. All ruled out with a proving test.
