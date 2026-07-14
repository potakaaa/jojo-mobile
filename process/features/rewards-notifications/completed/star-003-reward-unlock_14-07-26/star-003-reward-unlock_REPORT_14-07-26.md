---
phase: star-003-reward-unlock
date: 2026-07-14
status: COMPLETE
feature: rewards-notifications
plan: process/features/rewards-notifications/active/star-003-reward-unlock_14-07-26/star-003-reward-unlock_PLAN_14-07-26.md
---

# STAR-003 — Reward Unlock + Coupon Generation — EXECUTE Report

## What Was Done

Implemented the battle-pass reward-unlock service (all 9 plan steps), fully green on every gate.

| Step | File(s) | Result |
|---|---|---|
| 1 Types | `packages/types/src/coupons.ts` | Added `CouponStatus` union + `DbCoupon` interface; kept UI `Coupon`. Flows through existing `index.ts` re-export. |
| 1b Notif type | (none) | DEFERRED per plan (DB `notifications.type` is free-form varchar; no consumer). Backlog follow-up when notifications UI is built. |
| 2 Schema index | `packages/api/src/db/schema/coupons.ts` | `uniqueIndex('coupons_user_reward_unique').on(user_id, reward_id).where(reward_id IS NOT NULL)`, modelled on 0005. |
| 3 Migration | `packages/api/drizzle/0006_windy_dexter_bennett.sql` | Contains ONLY the partial index. MIG-SYNC: re-run reports no further diff. |
| 4 Code gen | `packages/api/src/lib/reward-coupon-code.ts` (NEW) | `generateRewardCouponCode()` → `JP-RWD-XXXX` (32-char alphabet, `crypto.randomInt`) + spyable `rewardCouponCodeGenerator`. |
| 5 Notify | `packages/api/src/lib/reward-unlock-notify.ts` (NEW) | `notifyRewardUnlocked(userId, rewardIds)`: one `notifications` row per reward, `type='reward_unlocked'`, `target_screen='/(tabs)/rewards'`, try/catch-swallowed, `TODO(PUSH-002/003)` seam. |
| 6 Unlock logic | `packages/api/src/lib/star-earning.ts` | Unlock inside the credit tx on the credited path only (`inserted.length > 0` gate); `.returning()` on the `user_stars` upsert for in-tx post-bump lifetime; LIVE roadmap query; ON CONFLICT `where` form; bounded savepoint retry; additive `unlockedRewardIds` return field; post-commit best-effort notify. |
| 7 Seed | `packages/api/src/db/seed/seed.ts` | `REWARD_ROADMAP` 5/10/15/20 (tier-1 stays 5); `seedRewardsTable` generalized to N tiers idempotently; console.log summary updated. |
| 8 Tests | `packages/api/src/lib/__tests__/star-earning.integration.test.ts` | +10 STAR-003 tests (AC1–AC5, 4 EDGE, collision-retry) + fixtures (`seedRewardTier`, `setUserLifetime`, `getRewardCoupons`, `seedCompletedOrderForUser`); extended FK teardown (notifications → coupons → … → rewards); 3 STAR-001 regression assertions updated for additive `unlockedRewardIds: []`. |
| 9 Gate | — | All green. |

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `DATABASE_URL=… pnpm --filter @jojopotato/api test` | **99 passed / 99** (was 77; +20 in star-earning suite: 10 STAR-001 regression still green + 10 new STAR-003). `rewards.integration.test.ts` 12/12 — confirms `/summary` non-regression. |
| `pnpm turbo run typecheck` (FULL, unfiltered) | 5/5 packages green (E6). |
| `pnpm turbo run lint` | 6/6 tasks, 0 errors. (3 pre-existing warnings in `apps/mobile/scripts/dev-with-tunnel.mjs` — unrelated to STAR-003.) |
| `pnpm format` → `pnpm format:check` | Clean — "All matched files use Prettier code style". |
| MIG-SYNC: `pnpm --filter @jojopotato/api db:generate` | 0006 only; re-run "No schema changes, nothing to migrate". |

## Plan Deviations

**One within-blast-radius deviation (savepoint retry).** Plan Step 6.3 described a plain in-transaction retry loop on a `coupons.code` unique violation. In Postgres a raw error inside a transaction aborts the entire transaction, so a plain in-tx retry cannot succeed. Implemented the bounded (≤5) retry using a **per-insert SAVEPOINT** (drizzle nested `tx.transaction`), so a code collision rolls back only the savepoint and the retry proceeds — the correct mechanism for the plan's stated intent (retry on `coupons.code` collision only; never on the (user,reward) conflict, which ON CONFLICT DO NOTHING handles without throwing). Stays inside `star-earning.ts`, no public-contract change. Proven by the `retries on a coupons.code collision` test. The plan's Risks table already anticipated an execute-agent adjustment here ("fallback in-tx SELECT … execute-agent verifies against the live `_test` DB"); this is the analogous verified adjustment for the retry path.

No hard-stop-class deviations. All four /goal safety constraints honored: 0006 = index only; `where` ON CONFLICT form used; notify post-commit + swallowed; no mint outside the credited path.

## Test Infra Gaps Found

None. The existing hermetic `packages/api` vitest pattern covered everything; new fixtures (`seedRewardTier`, `setUserLifetime`) were added within the existing test file, no new infra.

## E-instruction confirmations

- **E1** — coupons ON CONFLICT uses the `where: sql\`reward_id IS NOT NULL\`` partial-predicate form verbatim (star-earning.ts unlock loop). ✅
- **E2** — `.returning({ lifetime_stars })` added to the `user_stars` upsert; post-bump lifetime read in-tx. No stale read. ✅
- **E3** — no existing `target_screen` value in the codebase; used `'/(tabs)/rewards'` (matches `apps/mobile/src/app/(tabs)/index.tsx` route convention). ✅
- **E4 — Seed leave-extras caveat (documented here):** `seedRewardsTable` upserts the 4 roadmap tiers by name (find-active-by-name → update-or-insert). It does NOT deactivate pre-existing extra active rewards in a SHARED local dev DB — those are left as-is. If such a shared DB holds a non-roadmap active reward with `required_stars < 5`, STAR-002's `/rewards/summary` (MIN active reward) could surprise-target it. **Not fixed here** (dev-seed concern only). The hermetic per-run `_test` DB used by the gates is recreated fresh each run, so it is unaffected — confirmed by `rewards.integration.test.ts` 12/12 green and the seed log showing exactly `rewards: 4 (roadmap: 5★, 10★, 15★, 20★)`.
- **E5** — retry bounded to 5 attempts, gated on `constraint === 'coupons_code_unique'` + SQLSTATE 23505 only; never retries the (user,reward) conflict. ✅
- **E6** — full unfiltered `pnpm turbo run typecheck` run. ✅
- **E7** — 0006 contains only `coupons_user_reward_unique`; no drift. ✅

## Closeout Packet

- **Selected plan:** `process/features/rewards-notifications/active/star-003-reward-unlock_14-07-26/star-003-reward-unlock_PLAN_14-07-26.md`
- **Finished:** Steps 1–9; all Verification Evidence gates green in this session.
- **Verified vs unverified:** All Fully-Automated gates green (execute-agent's own run). EVL confirmation run (independent vc-tester) still pending per Phase Completion Rules — CODE DONE, not yet VERIFIED until the orchestrator's EVL re-run.
- **Cleanup remaining:** UPDATE PROCESS — archive plan; update `all-context.md` (rewards state, api suite now 99 tests, migration 0006, new coupon types); write two backlog NOTEs (below).
- **Best next state:** Keep in active/testing pending EVL; then UPDATE PROCESS.
- **Classification:** `Keep in active/testing` (EVL confirmation run pending).

## Follow-up stubs / backlog items for UPDATE PROCESS

1. `rewards-progress-bar-battle-pass-semantics_NOTE_14-07-26.md` (backlog) — STAR-002's Rewards bar tracks `current_stars` vs MIN active reward; under battle-pass it should track `lifetime_stars` toward the next UNCLAIMED tier. Out of scope here (plan §Out of Scope).
2. Notification-type UI enum (`reward_unlocked`) — deferred (Step 1b); add to `NotificationType` when the notifications UI is built.
3. STAFF-003 must call `creditStarForCompletedOrder` from the live staff order-complete endpoint (TODO seam left in `star-earning.ts`).

## Forward Preview

### Test Infra Found
Hermetic `packages/api` vitest + per-run pristine `_test` DB (migrations + seed applied). Runner recreates the DB each run, so 0006 + the roadmap seed are always present. No new runner needed.

### Blast Radius Changes
`packages/api` (schema/coupons, migration 0006, lib/star-earning + 2 new lib files, seed, tests) and `packages/types/src/coupons.ts`. No auth/API-endpoint surface changed. `StarCreditResult` extended additively.

### Commands to Stay Green
- `pnpm turbo run typecheck` (unfiltered)
- `docker compose up -d && pnpm --filter @jojopotato/api db:migrate` then `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test`
- `pnpm turbo run lint` · `pnpm format:check`
- MIG-SYNC: `pnpm --filter @jojopotato/api db:generate` (expect 0006 only, no diff)

### Dependency Changes
None (no new packages). `StarCreditResult.unlockedRewardIds?` is a new additive field consumed by future STAFF-003.
