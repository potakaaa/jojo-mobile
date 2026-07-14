---
phase: star-002-rewards-screen
date: 2026-07-14
status: COMPLETE
feature: rewards-notifications
plan: process/features/rewards-notifications/active/star-002-rewards-screen_14-07-26/star-002-rewards-screen_PLAN_14-07-26.md
---

# STAR-002 Rewards Screen — EXECUTE Report

**TL;DR:** All 11 plan steps implemented exactly. Regression fix (Steps 2–4) landed first;
FULL `pnpm turbo run typecheck` went green before any feature work. New session-gated rewards
read API (per-user isolated), one seeded 5-star reward (no migration), react-query mobile data
layer, and the real Rewards screen replacing `<ComingSoon>`. Every gate is green:
FULL typecheck (5/5), API vitest (89/89, +12 new), UI jest-expo (51/51, +9 new), lint (0 errors),
format:check clean, MIG-SYNC "No schema changes". Status: **CODE DONE** (VERIFIED pending the
user-confirmed on-device Agent-Probe for AC1/AC2 rendered visual + AC5 refetch-on-focus).

## What Was Done

- **Step 1 — types:** Added `Reward` + `RewardsSummary` to `packages/types/src/rewards.ts`
  (additive; existing STAR-001 `StarTransaction`/`UserStars`/`StarTransactionType` untouched).
- **Step 2 — UI re-type (regression fix):** `star-progress-bar.tsx` now takes
  `{ currentStars, requiredStars }` (exported `StarProgress`); width =
  `clamp(currentStars/requiredStars, 0, 1)`; caption "N stars to your reward" / "Reward unlocked".
  `reward-progress-card.tsx` re-typed to `{ currentStars, requiredStars }` (exported
  `RewardProgress`); `TIER_LABEL` and the bronze/silver/gold model dropped.
- **Step 3 — mocks + tests:** `mocks.ts` star-shaped (`{ currentStars: 3, requiredStars: 5 }`);
  `star-progress-bar.test.tsx` adds AC1 (3/5 → 60% + "2 stars" caption, distinct from 5/5), AC2
  (5/5 → 100% + "Reward unlocked"), clamp (6/5 → 100%), and singular-caption edge;
  `reward-progress-card.test.tsx` asserts "N of M stars". A `testID="star-progress-fill"` was added
  to the bar's fill `View` so the automated fraction assertion is deterministic.
- **Step 4 — mobile regression sites:** `mock-home.ts` + `component-showcase.tsx` re-typed to the
  star shape (imports `RewardProgress`/`StarProgress` from `@jojopotato/ui`); dead
  `rewards-teaser-card.tsx` DELETED (re-verified zero external importers). **FULL
  `pnpm turbo run typecheck` green here (AC-REGRESSION) — the exact gate that would have caught the
  STAR-001 miss.**
- **Step 5 — API route:** `packages/api/src/routes/rewards.ts` — 3 read-only GET handlers
  (`/summary`, `/available`, `/history`). Every handler scopes on `req.user!.id` (server-owned
  session, never client-supplied). `/summary` targets the MIN active reward by `required_stars`,
  missing `user_stars` → 0s, defensive `requiredStars:0/reward:null` when no active reward.
  `/history` uses `desc(created_at)` + cursor pagination (mirrors `orders.ts:214-256`), includes
  `adjusted` rows. Mounted `app.use('/rewards', requireSession, rewardsRouter)` (session gate once
  at mount).
- **Step 6 — seed:** `seedRewardsTable()` inserts ONE idempotent active 5-star reward
  (`required_stars:5, reward_type:'free_item', reward_value:null, is_active:true`); called in
  `runSeed()` + log line. Data-only — no DDL, MIG-SYNC confirms no drift.
- **Step 7 — integration tests:** `rewards.integration.test.ts` — 12 hermetic self-seeding tests
  (mirrors `staff-orders.integration.test.ts`): AC3 history order + earned/adjusted contents,
  summary math (3/5 not unlocked, 5/5 unlocked, 6/5 clamped), missing-row→0, empty-history→[],
  no-cookie→401 (×3 endpoints), cross-user isolation, available list asc, no-active-reward edge.
- **Step 8 — T&C:** `packages/ui/src/components/rewards-terms.tsx` `<RewardsTerms>` — real,
  non-lorem copy authored from PRD §6.10 (1 star per completed eligible order; cancelled/refunded
  don't earn; 5 stars unlocks a reward; no cash value). Exported from ui index; `rewards-terms.test.tsx`
  asserts known non-lorem phrases present + no lorem (AC4).
- **Step 9 — mobile data layer:** `features/rewards/lib/rewards-api.ts` mirrors `staff-api.ts`
  (absolute `env.apiUrl` + `Cookie: authClient.getCookie()`, throws on non-OK; NOT `authClient.$fetch`).
  Three react-query hooks (`use-rewards-summary`, `use-rewards-history`, `use-available-rewards`)
  with stable query keys; rely on global `refetchOnWindowFocus: true` for AC5.
- **Step 10 — screen:** `(tabs)/rewards/index.tsx` replaces `<ComingSoon>` + the `Dev: View Coupons`
  link with the real screen composed of `@jojopotato/ui` (`StarProgressBar`, `Card`, `Badge`,
  `EmptyState`, `RewardsTerms`): progress tracker + stars-needed, reward preview, available-rewards
  list, reverse-chron history, T&C; loading/error/empty states handled.
- **Step 11 — full gate suite:** all green (see Test Gate Outcomes).

## What Was Skipped or Deferred

- Live crediting wiring (order→star on completion): STAFF-003 (out of scope, plan §Out of Scope).
- Coupon issuance on threshold (STAR-003), redemption flow (STAR-004), admin threshold config
  (ADM-005), true push/websocket real-time (LIVE-001): all out of scope.
- AC5 *live-credit trigger* is a documented known-gap (STAFF-003 + LIVE-001). Only the
  refetch-on-focus *mechanism* is in scope and provable.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| AC-REGRESSION | `pnpm turbo run typecheck` (FULL) | 5/5 packages green |
| API contract + AC3 + summary math | `DATABASE_URL=... pnpm --filter @jojopotato/api test` | 89/89 passed (12 new rewards tests) |
| AC1/AC2 logic + AC4 T&C + UI regression | `pnpm --filter @jojopotato/ui test` | 51/51 passed (9 new) |
| style | `pnpm turbo run lint` | 6/6 successful, 0 errors |
| format | `pnpm format` + `pnpm format:check` | clean |
| MIG-SYNC | `pnpm --filter @jojopotato/api db:generate` | "No schema changes"; no new file/diff under `packages/api/drizzle/` |

Agent-Probe (NOT run here — requires user on device): AC1/AC2 rendered bar-fill + unlocked styling
at 3/5 vs 5/5; AC5 refetch-on-focus (simulate server-state change → refocus → observe update).

## Plan Deviations

1. **`apps/mobile/src/features/auth/hooks/use-auth.ts` reformatted (whitespace-only).** NOT in the
   plan blast radius. Cause: the plan's mandated Gate 5 command (`pnpm format`) formats the whole
   repo and corrected pre-existing Prettier drift on this branch. `git diff -w` confirms the change
   is pure line-wrapping of a `useCallback(...)` call — zero logic change. Benign, unavoidable side
   effect of a required gate. Not reverted (reverting would fail `format:check`).
2. **Added `testID="star-progress-fill"` to `StarProgressBar`'s fill View** (in-blast-radius, M2).
   Rationale: enables the deterministic automated AC1 fraction assertion (`fillPercent` reads the
   fill's width). Additive test hook, no runtime behavior change.

No hard-stop-class deviations. No auth/billing/API-contract/container/migration deviations.

## Test Infra Gaps Found

- **RN component/E2E runner gap (pre-existing, project-wide):** the Rewards screen's rendered visual
  (bar fill, unlocked styling) and AC5 refetch-on-focus runtime cannot be automated (no
  jest-expo-RN-render / Detox / Maestro for `apps/mobile`). Tracked at
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. AC1/AC2 *logic* is
  pushed into the testable `packages/ui` component + the API, so only pixel-level visual + live-focus
  remain Agent-Probe. This plan does NOT close the gap.

## Closeout Packet

- **Selected plan:** `process/features/rewards-notifications/active/star-002-rewards-screen_14-07-26/star-002-rewards-screen_PLAN_14-07-26.md`
- **Finished:** all 11 checklist steps; every per-step + full-suite gate green.
- **Verified vs unverified:** Fully-Automated gates VERIFIED (typecheck/api/ui/lint/format/MIG-SYNC).
  Agent-Probe (AC1/AC2 rendered visual + AC5 refetch-on-focus) UNVERIFIED — needs user on-device walkthrough.
- **Cleanup remaining:** none code-side. Not committed (per instruction). Plan should stay in
  `active/` until the user records the Agent-Probe walkthrough (plan §Phase Completion Rules:
  VERIFIED requires user confirmation).
- **Closeout classification:** `Keep in active/testing` — CODE DONE, VERIFIED pending user Agent-Probe.
- **Follow-up plan stubs created:** none.
- **CONTEXT_PARTIAL items:** none.

## Forward Preview

### Test Infra Found
- vitest + supertest in `packages/api` (hermetic self-seeding via `staff-orders` pattern — reused).
- jest-expo in `packages/ui` (async `await render` API — note: `render` returns a Promise here).
- No RN runner for `apps/mobile` (Agent-Probe only for rendered visual / focus runtime).

### Blast Radius Changes
- New: `packages/api/src/routes/rewards.ts` (+ its integration test), `packages/ui/src/components/rewards-terms.tsx`
  (+ test), `apps/mobile/src/features/rewards/{lib,hooks}`.
- Modified breaking (all consumers reconciled): `StarProgressBarProps`/`RewardProgressCardProps`
  now take `{ currentStars, requiredStars }` (was points/tier).
- Deleted: `apps/mobile/src/features/home/components/rewards-teaser-card.tsx` (dead code).

### Commands to Stay Green
- `pnpm turbo run typecheck` (FULL) · `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test`
  · `pnpm --filter @jojopotato/ui test` · `pnpm turbo run lint` · `pnpm format:check`
  · `pnpm --filter @jojopotato/api db:generate` (expect no diff).
- Local Postgres must be up (`localhost:5432`, jojo/jojo/jojopotato); the vitest harness recreates a
  pristine per-run test DB + migrates + seeds (so the 5-star reward row exists in tests).

### Dependency Changes
- No new runtime deps. Reuses existing `@tanstack/react-query`, `drizzle-orm`, `express`, `better-auth`.
- This plan's `/rewards/*` endpoints unblock STAFF-003 (live crediting → makes AC5 live), STAR-003
  (coupon issuance), STAR-004 (redemption).
