---
name: plan:star-003-reward-unlock
description: "STAR-003 — reward unlock + coupon generation on star-threshold crossing (battle-pass cumulative, idempotent alongside STAR-001)"
date: 14-07-26
feature: rewards-notifications
---

# STAR-003 — Reward Unlock + Coupon Generation

Date: 14-07-26
Status: PLAN written — not executed
Complexity: COMPLEX
Feature: rewards-notifications

**Complexity note:** COMPLEX — schema + migration + idempotency + coupon generation + notification side-effect; high-risk classes: schema/migration + coupon (redeemable-value) accounting. VALIDATE mandatory.
**Issue:** #28 (P0)
**Branch:** dev/star

## TL;DR

When a completed order credits a star (STAR-001) and the user's monotonic `lifetime_stars` reaches one or more active reward tiers they have not yet unlocked, generate exactly ONE `coupons` row per newly-crossed tier (idempotent via a DB partial unique index + `ON CONFLICT DO NOTHING`), then write a best-effort `notifications` row per unlock AFTER the transaction commits. The unlock runs INSIDE STAR-001's existing `db.transaction` on the credited path only, so duplicate "order completed" events cannot double-unlock. Model is **battle-pass cumulative**: `rewards` is a roadmap of tiers at increasing `required_stars`; each tier unlocks once per user forever (lifetime never resets). All coverage is Fully-Automated vitest integration in `packages/api`.

Context loaded: `process/context/all-context.md` (root router), `process/context/tests/all-tests.md` (+ chain).

---

## Overview

STAR-001 delivered idempotent star **earning** (`creditStarForCompletedOrder` / `reverseStarForRefundedOrder`) but left reward **unlocking** unbuilt. STAR-003 adds the unlock: when a credit pushes a user's cumulative progress across a reward threshold, mint the coupon for that reward. This is the standalone service unit STAFF-003 will later trigger via the live staff order-complete endpoint (STAR-003 does NOT wire that trigger — see Out of Scope).

### Goals

1. On a star credit that crosses a reward threshold, generate exactly ONE `coupons` row (`reward_id` set, `status='available'`) for each newly-unlocked active reward.
2. Make unlock idempotent alongside STAR-001: duplicate completion events → no duplicate coupons; a later order does not re-unlock an already-unlocked tier.
3. Read reward thresholds LIVE (no cached constant) so ADM-005 threshold edits are picked up for future crossings without a deploy.
4. Write a best-effort `notifications` row per unlock, post-commit, failure-swallowed.
5. Seed a small escalating reward roadmap so multi-tier behavior is exercisable.

### Locked Decisions (do NOT re-open — plan is built around these)

- **LD1 — Battle-pass cumulative model.** Progress = `user_stars.lifetime_stars` (monotonic, never reset). `rewards` = a roadmap of tiers at increasing `required_stars`. Each active reward with `required_stars <= lifetime_stars` unlocks a coupon EXACTLY ONCE per user. A single crossing may unlock multiple tiers (handle generically: "all active rewards at/below current lifetime_stars with no existing coupon for this user"). Because lifetime is monotonic and unlock is once-per-(user,reward), AC2/AC5 hold **by construction**. A refund (STAR-001 decrements `current_stars` only; `lifetime_stars` stays monotonic) does **NOT** revoke an already-unlocked tier — intended (lifetime = permanent progress).
- **LD2 — Seed a starter roadmap.** Replace the single `MVP_REWARD` in `seed.ts` with a 4-tier escalating roadmap (5 / 10 / 15 / 20 stars). Keep the seed idempotent by extending `seedRewardsTable` to converge to the active set of N tiers.
- **LD3 — Idempotency = DB partial unique index + `ON CONFLICT DO NOTHING` (migration 0006).** Partial unique index on `coupons (user_id, reward_id) WHERE reward_id IS NOT NULL`. Coupon insert uses `.onConflictDoNothing({ target: [coupons.user_id, coupons.reward_id], where: sql\`reward_id IS NOT NULL\` })` — the `where` (targetWhere) form is MANDATORY for a partial index (STAR-001's E1 lesson: the bare `target`-only form errors at runtime). Migration 0006 must contain ONLY this index (no drift).
- **LD4 — Notification = write a `notifications` row post-commit.** After the transaction commits, insert one `notifications` row per newly-unlocked reward with `type='reward_unlocked'`, `target_screen` = the rewards screen, via a decoupled `notifyRewardUnlocked(...)` helper. MUST run AFTER commit (a notification failure must never roll back a real coupon) and its failure is swallowed (best-effort). Push delivery is PUSH-002/003 — leave a TODO seam only.

---

## Acceptance Criteria

Each AC becomes a Fully-Automated vitest integration test (see Verification Evidence for the gate mapping). Each carries `proven by:` (named scenario) + `strategy:` tag.

- **AC1 — one coupon on threshold crossing.** A user whose stars cross a reward threshold (e.g. 4→5) gets exactly ONE new reward coupon (`coupons` row, `reward_id` set, `status='available'`).
  - proven by: `crossing 4→5 mints exactly one available coupon with reward_id set` · strategy: Fully-Automated
- **AC2 — no re-unlock on later order.** After unlock, a follow-up order does not re-trigger a second unlock of the same reward.
  - proven by: `follow-up order does not mint a second coupon for an already-unlocked reward` · strategy: Fully-Automated
- **AC3 — same code path.** Reaching the threshold at order completion triggers unlock through the SAME code path as any star credit (no separate untested path).
  - proven by: `unlock occurs as side-effect of creditStarForCompletedOrder (same path)` · strategy: Fully-Automated
- **AC4 — LIVE threshold read.** Changing `rewards.required_stars` (ADM-005) is picked up for future crossings without a deploy (read the threshold LIVE, not a cached constant).
  - proven by: `changing rewards.required_stars mid-life is picked up for a future crossing` · strategy: Fully-Automated
- **AC5 — duplicate events don't duplicate coupons.** Duplicate "order completed" events (STAR-001) do NOT generate duplicate coupons.
  - proven by: `duplicate completion event → exactly one coupon` · strategy: Fully-Automated
- **EDGE-boundary** — user at exactly `required_stars` unlocks (`<=`, not `<`).
  - proven by: `user at exactly required_stars unlocks` · strategy: Fully-Automated
- **EDGE-multi-tier** — a single credit crossing two tiers at once mints two coupons in one call.
  - proven by: `single credit crossing two tiers mints two coupons` · strategy: Fully-Automated
- **EDGE-no-reset** — refund after unlock does NOT revoke the coupon; `lifetime_stars` stays monotonic.
  - proven by: `refund after unlock does not revoke coupon; lifetime stays monotonic` · strategy: Fully-Automated
- **EDGE-deal-coupon** — a `reward_id=NULL` deal-coupon is exempt from the new partial index and never counted as an unlock.
  - proven by: `deal-coupon (reward_id NULL) does not block reward-coupon insert nor count as unlock` · strategy: Fully-Automated
- **REGRESSION** — STAR-001 earn/reverse semantics stay proven after the additive return-field change.
  - proven by: `STAR-001 earn/reverse suite still green` · strategy: Fully-Automated

---

## Touchpoints

Files read and/or changed. Read-for-context files marked (R).

| File | Change |
|---|---|
| `packages/types/src/coupons.ts` | Add DB-facing coupon type + `CouponStatus` union (mirrors `couponStatusEnum`). Keep existing UI `Coupon` shape. |
| `packages/types/src/index.ts` | (R) already `export * from './coupons'` — no edit needed; confirm new exports flow through. |
| `packages/types/src/notifications.ts` | OPTIONAL: add `'reward_unlocked'` to `NotificationType` (deferred unless trivially safe — see Step 1b). |
| `packages/api/src/db/schema/coupons.ts` | Add partial unique index `coupons_user_reward_unique` on `(user_id, reward_id) WHERE reward_id IS NOT NULL`. |
| `packages/api/drizzle/0006_*.sql` + `meta/` | New migration generated by `db:generate` — must contain ONLY the new index. |
| `packages/api/src/lib/reward-coupon-code.ts` | NEW — spyable coupon-code generator (mirrors `order-number.ts` seam). |
| `packages/api/src/lib/reward-unlock-notify.ts` | NEW — `notifyRewardUnlocked(...)` post-commit best-effort notification helper. |
| `packages/api/src/lib/star-earning.ts` | Add unlock logic inside `creditStarForCompletedOrder`'s transaction (credited path only); extend return shape; call notify helper post-commit. |
| `packages/api/src/db/seed/seed.ts` | Replace `MVP_REWARD` single-tier with a 4-tier roadmap; extend `seedRewardsTable` to converge N tiers. |
| `packages/api/src/lib/__tests__/star-earning.integration.test.ts` | Extend with unlock fixtures + AC1–AC5 + edge assertions. |
| `packages/api/src/db/schema/index.ts` | (R) coupons/rewards/notifications already exported — no edit. |
| `packages/api/src/routes/rewards.ts` | (R) confirms the min-active-reward `/summary` query semantics we are NOT changing. |
| `packages/api/src/routes/lib/order-number.ts` | (R) template for the spyable code generator. |

---

## Public Contracts

Interfaces/behaviors visible to other packages or callers.

1. **`StarCreditResult` extended (additive, backward-compatible).**
   Current: `{ credited: boolean; reason?: ... }`. New additive field:
   ```ts
   export interface StarCreditResult {
     credited: boolean;
     reason?: 'not-found' | 'not-completed' | 'below-minimum' | 'already-credited';
     unlockedRewardIds?: string[]; // NEW — reward ids for which a coupon was minted this call ([] when none)
   }
   ```
   Existing callers/tests reading `.credited` / `.reason` are unaffected (`toEqual({ credited: true })` assertions must be updated to include `unlockedRewardIds` where a credit occurs — see Step 8 note).

2. **`packages/types` coupon DB type + status union (NEW export).**
   ```ts
   export type CouponStatus = 'available' | 'used' | 'expired'; // mirrors couponStatusEnum verbatim
   export interface DbCoupon {
     id: string;
     userId: string;
     dealId: string | null;
     rewardId: string | null;
     code: string;
     status: CouponStatus;
     expiresAt: string | null;
     usedAt: string | null;
     createdAt: string;
   }
   ```
   Existing UI `Coupon` interface stays. Name the DB type `DbCoupon` to avoid colliding with the UI `Coupon`.

3. **DB schema — partial unique index (migration 0006).**
   `coupons_user_reward_unique` UNIQUE on `(user_id, reward_id) WHERE reward_id IS NOT NULL`. Deal-coupons (`reward_id` NULL) are exempt via the partial predicate — a user may hold many deal-coupons but at most one coupon per reward.

4. **`notifyRewardUnlocked(userId, rewardIds)` (NEW, internal to packages/api).** Best-effort; never throws to the caller; TODO seam for PUSH-002/003 delivery.

---

## Blast Radius

- **Packages:** `packages/api` (schema, migration, lib, seed, tests), `packages/types` (coupons type).
- **Files new:** 2 (`reward-coupon-code.ts`, `reward-unlock-notify.ts`) + 1 migration (`0006_*.sql`) + possibly 1 test file.
- **Files modified:** `coupons.ts` (schema), `star-earning.ts`, `seed.ts`, `packages/types/src/coupons.ts`, star-earning test file.
- **Risk class:** **schema/migration** (0006 index), **idempotency/data-integrity** (coupon minting), **billing-adjacent** (coupons are redeemable value — treat with high-risk test rigor). No auth surface change (unlock is server-internal, reached only through the already-session-gated STAR-001 credit path). No public API endpoint added.
- **Regression surface:** STAR-001 earn/reverse tests (must stay green — the unlock is additive on the credited path), the existing `rewards.ts` `/summary` min-active-reward query (semantics unchanged; the seed roadmap change keeps the 5-star tier as min, so no behavior change), and STAR-002's plan/tests reading `RewardsSummary`.

---

## Data Flow

1. STAFF-003 (future) calls `creditStarForCompletedOrder(orderId)` after an order → `completed`. (Today: only tests call it.)
2. Service loads the order, guards status/eligibility (unchanged).
3. Inside `db.transaction`:
   a. Insert `earned` star_transaction guarded by the 0005 partial index (`ON CONFLICT ... where order_id IS NOT NULL DO NOTHING`). If `inserted.length === 0` → `already-credited` early return (**this is the AC3/AC5 guard: unlock only runs on a real credit**).
   b. Upsert `user_stars` (+1 current, +1 lifetime) **with `.returning()`** so we read the post-bump `lifetime_stars` in-transaction. (Decision: use `.returning()` on the upsert — the `onConflictDoUpdate` returns the updated row; the insert branch returns the seeded row. Both give `lifetime_stars`. This avoids a second SELECT round-trip.)
   c. **Roadmap query (LIVE, in-tx):** `SELECT * FROM rewards WHERE is_active = true AND required_stars <= <lifetime_stars>`. These are candidate tiers. (LIVE read satisfies AC4 — no cached constant.)
   d. For each candidate reward, insert a `coupons` row (`user_id`, `reward_id`, generated `code`, `status` defaults `available`) with `.onConflictDoNothing({ target: [coupons.user_id, coupons.reward_id], where: sql\`reward_id IS NOT NULL\` }).returning()`. Collect the `.returning()` non-empty inserts → these are the **actually newly-unlocked** rewards (already-owned tiers hit the conflict and return empty).
   e. Return `{ credited: true, unlockedRewardIds: [...] }` from the transaction (bubble the list out).
4. **After the transaction commits**, if `unlockedRewardIds.length > 0`, call `await notifyRewardUnlocked(order.user_id, unlockedRewardIds)` wrapped so its failure is caught and logged (never rethrown). Each call inserts one `notifications` row per reward.

---

## Failure Modes

| Failure | Handling |
|---|---|
| Duplicate completion event (same order fired twice) | The `earned` insert hits the 0005 index → `inserted.length === 0` → early return `already-credited`; unlock never runs. No duplicate coupon. (AC5) |
| Later order re-reaches an already-unlocked tier | Coupon insert hits the 0006 index → empty `.returning()` → tier excluded from `unlockedRewardIds`. No second coupon. (AC2) |
| Coupon `code` collision (UNIQUE on `coupons.code`) | The 0006 conflict target is `(user_id, reward_id)`, NOT `code` — a code collision throws (not swallowed). Mitigation: high-entropy suffix (≥4 chars from a 32-char alphabet, per `order-number.ts`) makes collisions astronomically rare; **add a bounded retry (up to 5 attempts) in the code generator's caller** on a unique-violation to fully close it. Retry only on the code-unique violation, never on the `(user_id,reward_id)` conflict (handled by ON CONFLICT DO NOTHING, not an exception). |
| Notification insert fails (DB blip / bad column) | Caught + logged in `notifyRewardUnlocked`; the coupon stays committed. Post-commit placement guarantees no rollback. (LD4) |
| `required_stars` changed mid-life (ADM-005) | Roadmap query reads LIVE, so the next credit picks up the new thresholds. Past unlocks are not revoked (monotonic). (AC4) |
| Multi-tier crossing (e.g. lifetime jumps past 2 tiers) | The `<= lifetime_stars` query returns all reachable tiers; each is inserted with ON CONFLICT; all newly-inserted returned. Handles N-tier crossing generically. (EDGE — multi-tier) |
| Deal-coupon (reward_id NULL) present | Exempt from the partial index predicate — never blocks a reward-coupon insert and is never treated as an unlock. (EDGE — deal-coupon) |

---

## Implementation Checklist

Ordered to keep `pnpm turbo run typecheck` green between steps.

### Step 1 — Types (`packages/types/src/coupons.ts`)
Add `CouponStatus` union + `DbCoupon` interface (per Public Contracts §2). Keep the existing UI `Coupon`. `index.ts` already re-exports `./coupons` — verify the new names flow through. Run `pnpm turbo run typecheck` (types package has no runner; typecheck is the gate).

### Step 1b — Notification type (OPTIONAL, low-risk)
Add `'reward_unlocked'` to `NotificationType` in `packages/types/src/notifications.ts`. `AppNotification.type` is UI-facing; the DB `notifications.type` is a free-form `varchar` so this is not required for the DB write. **Decision: DEFER** — the DB column is free-form varchar and no mobile consumer renders `reward_unlocked` yet (Rewards/notifications UI is placeholder). Add a one-line note in the phase report flagging it as a follow-up when the notifications UI is built. (If execute-agent finds it trivially safe with zero consumers, adding it is acceptable; not required.)

### Step 2 — Coupons schema index (`packages/api/src/db/schema/coupons.ts`)
Add to the table's index array:
```ts
uniqueIndex('coupons_user_reward_unique')
  .on(t.user_id, t.reward_id)
  .where(sql`${t.reward_id} IS NOT NULL`)
```
Import `uniqueIndex` and `sql` from `drizzle-orm` / `drizzle-orm/pg-core`. Model exactly on the 0005 `star_transactions_order_type_unique` partial index. Run typecheck.

### Step 3 — Generate migration 0006
```
pnpm --filter @jojopotato/api db:generate
```
Confirm a single `0006_*.sql` is produced containing ONLY:
`CREATE UNIQUE INDEX "coupons_user_reward_unique" ON "coupons" USING btree ("user_id","reward_id") WHERE "coupons"."reward_id" IS NOT NULL;`
No other schema drift. If the diff includes anything else, STOP and reconcile (drift means an out-of-band schema change). Re-run `db:generate` after and confirm it reports no further changes (MIG-SYNC gate).

### Step 4 — Coupon-code generator (`packages/api/src/lib/reward-coupon-code.ts`)
Mirror `order-number.ts`: a `generateRewardCouponCode()` producing `JP-RWD-XXXX` (4-char suffix from the ambiguity-free 32-char alphabet, `crypto.randomInt`), plus a spyable `rewardCouponCodeGenerator = { generate: generateRewardCouponCode }` object so tests can force a collision. Document that uniqueness is guaranteed by the `coupons.code` UNIQUE constraint + caller retry, not by the generator. Run typecheck.

### Step 5 — Notification helper (`packages/api/src/lib/reward-unlock-notify.ts`)
Export `async function notifyRewardUnlocked(userId: string, rewardIds: string[]): Promise<void>`. For each rewardId, insert a `notifications` row: `{ user_id: userId, title, body, type: 'reward_unlocked', target_screen: '<rewards screen route>' }`. Wrap the whole body in try/catch — on error, `console.error` and return (never throw). Add `// TODO(PUSH-002/003): dispatch push notification for reward unlock` seam. Determine the exact `target_screen` value from how existing notifications reference screens (grep `target_screen` usage; if none exists, use the rewards tab route string, e.g. `'/(tabs)/rewards'` — execute-agent confirms against the app's route convention). Run typecheck.

### Step 6 — Unlock logic in `star-earning.ts`
Inside `creditStarForCompletedOrder`'s `db.transaction`, AFTER the `user_stars` upsert (add `.returning()` to it), and ONLY reached when `inserted.length > 0` (the existing credited-path gate):
1. Read `lifetimeStars` from the upsert's `.returning()` row.
2. Query candidate tiers: `tx.select().from(rewards).where(and(eq(rewards.is_active, true), lte(rewards.required_stars, lifetimeStars)))`.
3. For each candidate, insert a coupon with the ON CONFLICT (user,reward) partial guard + `.returning()`; on a `code`-unique violation, retry with a fresh code (bounded, ≤5). Collect ids of non-empty inserts into `unlockedRewardIds`.
4. Return `{ credited: true, unlockedRewardIds }`.
Then, AFTER `db.transaction` resolves, if `unlockedRewardIds.length > 0`, `await notifyRewardUnlocked(order.user_id, unlockedRewardIds)` inside a try/catch (belt-and-suspenders; helper already swallows). Update the module header TODO/seam docs. Import `lte`, `and`, `eq` as needed; import the code generator + notify helper. Run typecheck.

### Step 7 — Seed roadmap (`packages/api/src/db/seed/seed.ts`)
Replace `MVP_REWARD` with a `REWARD_ROADMAP` array of 4 tiers:
```ts
const REWARD_ROADMAP = [
  { name: 'Free regular fries or lemonade', required_stars: 5,  reward_type: 'free_item', reward_value: null },
  { name: 'Free large fries',               required_stars: 10, reward_type: 'free_item', reward_value: null },
  { name: 'Free combo meal',                required_stars: 15, reward_type: 'free_item', reward_value: null },
  { name: 'Free premium loaded fries',      required_stars: 20, reward_type: 'free_item', reward_value: null },
] as const;
```
**Tier justification:** 5/10/15/20 is a uniform 5-star cadence matching the existing 5-star MVP tier (kept as tier 1, so `/summary`'s min-active-reward is unchanged and STAR-002 behavior does not regress). Four tiers is enough to exercise single-crossing, multi-crossing, and "reach several tiers over time" without bloating the seed. All `free_item` with `reward_value: null` matches the existing MVP reward semantics (free item, not a monetary discount) — no new `reward_type` semantics introduced.
Extend `seedRewardsTable` to loop the roadmap: for each tier, find-active-by-name → update-or-insert (same converge pattern, generalized from 1 to N). Keep the console.log summary accurate (`rewards: ${REWARD_ROADMAP.length}`). Because unlock keys on `is_active` + `required_stars`, the seed must ensure exactly these N are active. (The existing helper only upserts by name; pre-existing extra rewards in a local DB are left as-is, acceptable for dev seed.) Run typecheck.

### Step 8 — Tests
Extend `star-earning.integration.test.ts` (**decision: extend the existing file** to reuse the `seedCompletedOrder`/`getUserStars` fixtures and keep the suite cohesive). New fixtures needed: a helper to seed an active reward tier (`seedRewardTier(requiredStars, name)`), and a way to **pre-seed `user_stars` near a threshold** — either `setUserLifetime(userId, n)` (direct upsert) or walk lifetime up via multiple `seedCompletedOrder` + credit calls. Extend `afterAll` reverse-FK teardown to also delete created `coupons`, `rewards`, and `notifications` rows by their created ids (order: notifications → coupons → star_transactions → user_stars → orders → users → branch; rewards deleted after coupons since coupons FK rewards).
Cover (all Fully-Automated) exactly the scenarios named in Acceptance Criteria + Verification Evidence: AC1, AC2, AC3, AC4, AC5, EDGE-boundary, EDGE-multi-tier, EDGE-no-reset, EDGE-deal-coupon.
- **REGRESSION** — update the existing STAR-001 credit tests that assert `toEqual({ credited: true })` so the additive `unlockedRewardIds` field is accounted for. Prefer `expect(result.credited).toBe(true)` + a separate `unlockedRewardIds` assertion to minimize churn — execute-agent chooses; both acceptable as long as STAR-001 semantics stay proven.
Run the full API suite.

### Step 9 — Full verification gate
Run every gate command in Verification Evidence. All must pass. MIG-SYNC must show 0006 only + no further diff. Full `pnpm turbo run typecheck` (NOT filtered — STAR-001's regression lesson: a filtered typecheck missed a cross-package break).

---

## Verification Evidence

Strategy legend: FA = Fully-Automated. All STAR-003 coverage is FA vitest integration in `packages/api` (hermetic, self-seeding, per `star-earning.integration.test.ts`), against the per-run pristine `_test` DB that applies all migrations incl. 0006.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `crossing 4→5 mints exactly one available coupon with reward_id set` | Fully-Automated | **AC1** — one coupon on threshold crossing |
| `follow-up order does not mint a second coupon for an already-unlocked reward` | Fully-Automated | **AC2** — no re-unlock on later order |
| `unlock occurs as side-effect of creditStarForCompletedOrder (same path)` | Fully-Automated | **AC3** — same code path, no separate untested path |
| `changing rewards.required_stars mid-life is picked up for a future crossing` | Fully-Automated | **AC4** — LIVE threshold read (ADM-005 ready) |
| `duplicate completion event → exactly one coupon` | Fully-Automated | **AC5** — duplicate order-completed events don't duplicate coupons |
| `user at exactly required_stars unlocks` | Fully-Automated | EDGE-boundary (`<=`) |
| `single credit crossing two tiers mints two coupons` | Fully-Automated | EDGE — multi-tier crossing |
| `refund after unlock does not revoke coupon; lifetime stays monotonic` | Fully-Automated | EDGE — battle-pass no-reset (LD1) |
| `deal-coupon (reward_id NULL) does not block reward-coupon insert nor count as unlock` | Fully-Automated | EDGE — partial-index predicate exemption |
| `STAR-001 earn/reverse suite still green` | Fully-Automated | REGRESSION — STAR-001 semantics preserved |
| `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test` | Fully-Automated | All above run + STAR-001 regression (requires `docker compose up -d` + `db:migrate` first) |
| `pnpm turbo run typecheck` (FULL, unfiltered) | Fully-Automated | Cross-package type integrity incl. `packages/types` coupon type |
| `pnpm turbo run lint` | Fully-Automated | Lint clean |
| `pnpm format:check` | Fully-Automated | Formatting clean |
| MIG-SYNC: `pnpm --filter @jojopotato/api db:generate` → exactly one 0006 file, re-run shows no diff | Fully-Automated | Migration matches schema; 0006 contains only the partial index (no drift) |

**High-risk class note (coupons = redeemable value, schema/migration):** all coverage is Fully-Automated at minimum; no known-gap accepted for any developed behavior. The idempotency guards (0006 index + ON CONFLICT `where` form) are the load-bearing proofs — AC1/AC2/AC5 + multi-tier + duplicate-event tests all exercise them LIVE (not just typecheck), mirroring STAR-001's AC4 load-bearing proof.

**Gate commands preconditions:** `docker compose up -d` then `pnpm --filter @jojopotato/api db:migrate` before the API test command (per `tests/all-tests.md`).

---

## Test Infra Improvement Notes

(none identified yet — the existing `packages/api` vitest + hermetic self-seeding pattern covers everything STAR-003 needs; a new near-threshold `user_stars` fixture is added within the existing test file, not new infra.)

---

## Out of Scope (with follow-up routing)

- **Live order→completed trigger** — STAFF-003 wires `creditStarForCompletedOrder` into the staff status-update endpoint. STAR-003 leaves the TODO seam.
- **Coupon redemption at checkout** — separate (STAR-004 / checkout work). STAR-003 only mints `available` coupons.
- **Push delivery** — PUSH-002/003. STAR-003 only writes the `notifications` row + leaves a TODO seam.
- **Admin threshold config UI** — ADM-005. STAR-003 reads thresholds LIVE so ADM-005 slots in without touching unlock logic.
- **STAR-002 progress-bar semantics rework** — the STAR-002 Rewards bar currently uses `current_stars` vs the MIN active reward. Under the battle-pass model the bar should track `lifetime_stars` toward the next UNCLAIMED tier. **FLAG as backlog follow-up, do NOT fix here.** Action for update-process: write a backlog NOTE `rewards-progress-bar-battle-pass-semantics_NOTE_14-07-26.md` under `process/features/rewards-notifications/backlog/`.
- **Notification type UI enum (`reward_unlocked`)** — deferred (Step 1b); note in phase report.

---

## Dependencies

- **Upstream (delivered):** STAR-001 (`creditStarForCompletedOrder` + `user_stars` counters + 0005 partial-index pattern + monotonic-lifetime decision). STAR-002 (`rewards` read API — read-only, semantics unchanged by this plan).
- **Blocks:** STAFF-003 (needs the unlock service to exist before wiring the live trigger).
- **DB precondition for tests:** `docker compose up -d` + `db:migrate` (includes 0006).

---

## Risks

| Risk | Mitigation |
|---|---|
| Partial-index ON CONFLICT binding errors at runtime (STAR-001 E1) | Use the `where` (targetWhere) form exactly as STAR-001 proved; AC1/AC2/AC5 tests exercise it LIVE. |
| Coupon `code` UNIQUE collision throws | High-entropy suffix + bounded retry on code-unique violation (Step 4/6). |
| `.returning()` on `onConflictDoUpdate` upsert not giving lifetime on the update branch | Drizzle returns the affected row for both insert and update branches; a fallback in-tx SELECT is acceptable if `.returning()` proves flaky — execute-agent verifies against the live `_test` DB. |
| Seed roadmap change regresses STAR-002 `/summary` (min-active reward) | Tier 1 stays at 5 stars = current min, so `/summary` progresses toward the same reward; no behavior change. |
| Full typecheck missing a cross-package break (STAR-001 lesson) | Gate is `pnpm turbo run typecheck` (unfiltered), not a `--filter` subset. |

---

## Phase Completion Rules

This is a single-plan COMPLEX feature (not a phase program). Completion gates:

- **CODE DONE** — Steps 1–8 implemented; `pnpm turbo run typecheck` green between steps.
- **VERIFIED** — every Verification Evidence gate green in an EVL confirmation run (spawned vc-tester), specifically: full API suite (AC1–AC5 + all EDGE + STAR-001 regression), full unfiltered typecheck, lint, format:check, and MIG-SYNC (0006 only, no further diff). No developed behavior may rest on a Known-Gap.
- **Not VERIFIED until** the validate-contract exists (VALIDATE mandatory — schema/migration + coupon/billing-adjacent surface) AND the EVL run passes independently of execute-agent's own iterate-until-green loop.
- Code-only completion is `CODE DONE`, never `VERIFIED`.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/rewards-notifications/active/star-003-reward-unlock_14-07-26/star-003-reward-unlock_PLAN_14-07-26.md`
2. **Last completed step:** VALIDATE complete — validate-contract written (Gate: CONDITIONAL). Steps 1–9 pending EXECUTE.
3. **Validate-contract status:** WRITTEN (CONDITIONAL — one accepted CONCERN: seed leave-extras caveat). Cleared to route to EXECUTE.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md` (+ chain), STAR-001 plan/report + service (`star-earning.ts`, `star-earning-config.ts`), STAR-001 test file (fixture pattern), schemas (`coupons`, `rewards`, `user_stars`, `notifications`, `index`), `seed.ts`, `order-number.ts`, `rewards.ts` route, `packages/types/{coupons,rewards,notifications,index}`, 0005 migration (partial-index precedent).
5. **Next step for a fresh agent:** EXECUTE Steps 1→9 in order, running typecheck between steps and the full gate suite at Step 9. Key gotchas: (a) the `where` form on ON CONFLICT is mandatory for the 0006 partial index; (b) unlock runs only on the credited path (inside the `inserted.length > 0` gate); (c) notify helper runs POST-commit, failure swallowed; (d) full unfiltered typecheck; (e) MIG-SYNC must show 0006 only.

---

## Validate Contract

Status: CONDITIONAL
Date: 14-07-26
date: 2026-07-14
generated-by: outer-pvl

Parallel strategy: parallel-subagents (executed inline — all context pre-loaded; sequential synthesis of independent read-only dimension/section checks)
Rationale: signal score 3/7 (S2 schema/migration surface, S6 high-risk coupon/redeemable-value class, S7 8 blast-radius files) — dominant signal: high-risk schema/migration + billing-adjacent class. Recommended parallel-subagents; executed inline because every load-bearing file was already read in-window (no quality gain from re-spawning).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | one coupon on threshold crossing (4→5) | Fully-Automated | `crossing 4→5 mints exactly one available coupon with reward_id set` (in `star-earning.integration.test.ts`, run via API suite) | A |
| AC2 | no re-unlock on later order | Fully-Automated | `follow-up order does not mint a second coupon for an already-unlocked reward` | A |
| AC3 | unlock via same credit code path | Fully-Automated | `unlock occurs as side-effect of creditStarForCompletedOrder (same path)` | A |
| AC4 | LIVE threshold read (ADM-005) | Fully-Automated | `changing rewards.required_stars mid-life is picked up for a future crossing` | A |
| AC5 | duplicate events → one coupon | Fully-Automated | `duplicate completion event → exactly one coupon` | A |
| EDGE-boundary | at exactly required_stars unlocks (`<=`) | Fully-Automated | `user at exactly required_stars unlocks` | A |
| EDGE-multi-tier | single credit crosses two tiers → two coupons | Fully-Automated | `single credit crossing two tiers mints two coupons` | A |
| EDGE-no-reset | refund does not revoke; lifetime monotonic | Fully-Automated | `refund after unlock does not revoke coupon; lifetime stays monotonic` | A |
| EDGE-deal-coupon | reward_id NULL exempt from partial index | Fully-Automated | `deal-coupon (reward_id NULL) does not block reward-coupon insert nor count as unlock` | A |
| REGRESSION | STAR-001 earn/reverse semantics preserved | Fully-Automated | `STAR-001 earn/reverse suite still green` (existing suite + additive `unlockedRewardIds` assertion update) | A |
| MIG-SYNC | 0006 = only the partial index, no drift | Fully-Automated | `pnpm --filter @jojopotato/api db:generate` → one 0006 file, re-run shows no diff | A |
| typecheck | cross-package type integrity | Fully-Automated | `pnpm turbo run typecheck` (FULL, unfiltered) exits 0 | A |
| lint | lint clean | Fully-Automated | `pnpm turbo run lint` exits 0 | A |
| format | formatting clean | Fully-Automated | `pnpm format:check` exits 0 | A |

gap-resolution legend: A — proven now (gate passes in this cycle) · B — fixed in this plan · C — deferred to a named later phase/plan · D — backlog test-building stub.

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value. No Known-Gap rows — every developed behavior has a Fully-Automated proving gate.

Legacy line form (retained for existing validate-contract consumers):
- Idempotency (0006 partial index + ON CONFLICT `where`): Fully-automated: `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test` (AC1/AC2/AC5 + multi-tier exercise the guard LIVE)
- Unlock logic + battle-pass correctness: Fully-automated: same API test command (AC3/AC4 + EDGE-boundary/multi-tier/no-reset/deal-coupon)
- STAR-001 regression: Fully-automated: same API test command (existing earn/reverse suite green)
- Migration hygiene: Fully-automated: `pnpm --filter @jojopotato/api db:generate` (0006 only, re-run no diff)
- Cross-package types: Fully-automated: `pnpm turbo run typecheck` (unfiltered)
- Lint / format: Fully-automated: `pnpm turbo run lint` / `pnpm format:check`
- Precondition for the API test gate: `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate`

Failing stubs (Fully-Automated rows — TDD red-first, consumed by execute-agent at Step 8; NOT written to disk during VALIDATE):

AC1:
```
test("crossing 4→5 mints exactly one available coupon with reward_id set", () => { throw new Error("NOT IMPLEMENTED — TDD stub: crossing 4→5 mints exactly one available coupon with reward_id set") })
```
AC2:
```
test("follow-up order does not mint a second coupon for an already-unlocked reward", () => { throw new Error("NOT IMPLEMENTED — TDD stub: follow-up order does not mint a second coupon for an already-unlocked reward") })
```
AC3:
```
test("unlock occurs as side-effect of creditStarForCompletedOrder (same path)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: unlock occurs as side-effect of creditStarForCompletedOrder (same path)") })
```
AC4:
```
test("changing rewards.required_stars mid-life is picked up for a future crossing", () => { throw new Error("NOT IMPLEMENTED — TDD stub: changing rewards.required_stars mid-life is picked up for a future crossing") })
```
AC5:
```
test("duplicate completion event → exactly one coupon", () => { throw new Error("NOT IMPLEMENTED — TDD stub: duplicate completion event → exactly one coupon") })
```
EDGE-boundary:
```
test("user at exactly required_stars unlocks", () => { throw new Error("NOT IMPLEMENTED — TDD stub: user at exactly required_stars unlocks") })
```
EDGE-multi-tier:
```
test("single credit crossing two tiers mints two coupons", () => { throw new Error("NOT IMPLEMENTED — TDD stub: single credit crossing two tiers mints two coupons") })
```
EDGE-no-reset:
```
test("refund after unlock does not revoke coupon; lifetime stays monotonic", () => { throw new Error("NOT IMPLEMENTED — TDD stub: refund after unlock does not revoke coupon; lifetime stays monotonic") })
```
EDGE-deal-coupon:
```
test("deal-coupon (reward_id NULL) does not block reward-coupon insert nor count as unlock", () => { throw new Error("NOT IMPLEMENTED — TDD stub: deal-coupon (reward_id NULL) does not block reward-coupon insert nor count as unlock") })
```

Dimension findings:
- Infra fit: PASS — all 14 referenced paths resolve; migration sequence correct (0005 latest, 0006 next); drizzle-orm ^0.45.2; all gate scripts (test/db:generate/db:migrate/typecheck/lint/format) exist. Minor non-gating note: plan Step 3 references `seed/seed.ts` — both `db/seed.ts` (re-export) and `db/seed/seed.ts` exist; `db:seed` script points to the flat re-export.
- Test coverage: PASS — every developed behavior (AC1–AC5 + 4 EDGE + REGRESSION) has a Fully-Automated vitest integration gate against the live `_test` DB; high-risk classes (schema/migration + coupon-redeemable-value) exceed the hybrid minimum with Fully-Automated LIVE idempotency proofs; no developed behavior rests on Known-Gap (not vacuous-green).
- Breaking changes: PASS — `StarCreditResult.unlockedRewardIds?` is additive/optional; `DbCoupon`/`CouponStatus` are NEW exports named to avoid colliding with the existing UI `Coupon`; downstream churn bounded to 3 STAR-001 test assertions (lines 152/179/216 use `toEqual({ credited: true })`), addressed by Step 8 REGRESSION; `/summary` MIN-active-reward semantics preserved by keeping tier-1 at 5 stars.
- Security surface: PASS — coupons are redeemable value (billing-adjacent trust boundary), but unlock is server-internal reached only via the already-session-gated STAR-001 credit path; idempotency (0006 index + ON CONFLICT) prevents duplicate-value issuance; post-commit notification failure is swallowed and cannot roll back a coupon; code-collision throws (fail-safe) rather than mis-issuing; no new client input, no auth surface change, no secrets/PII beyond user_id FK. No adversarial FAIL found.
- Section 1 (Idempotency mechanism) feasibility: PASS — the `where`/targetWhere ON CONFLICT form is proven LIVE against a two-column partial index by STAR-001's 0005 (`star_transactions_order_type_unique` on `(order_id,type) WHERE ... IS NOT NULL`); STAR-003's `coupons(user_id,reward_id) WHERE reward_id IS NOT NULL` is structurally identical (same drizzle version). No feasibility probe needed.
- Section 2 (Atomicity + credited-path gate) feasibility: PASS — unlock is inside the existing `db.transaction`, gated on `inserted.length > 0` (star-earning.ts:102) so idempotent-skipped completions never enter unlock; plan correctly adds `.returning()` to the `user_stars` upsert (currently absent) to read post-bump lifetime in-tx; coupon-insert failure rolls back the credit. Highest-risk edit: `.returning()` on the upsert's update branch — fallback in-tx SELECT documented in Risks.
- Section 3 (Battle-pass correctness) feasibility: PASS — threshold source is `lifetime_stars` (monotonic), confirmed NOT `current_stars` (refund decrements current only, star-earning.ts:168-174); multi-tier `<=` crossing handled generically; refund-no-revoke documented + tested (EDGE-no-reset); AC2 holds by (user,reward) uniqueness.
- Section 4 (Migration hygiene) feasibility: PASS — MIG-SYNC gate present; 0006 contains only the new index (matches 0005 shape); deal-coupons (reward_id NULL) exempt via the partial predicate.
- Section 5 (Coupon-code uniqueness) feasibility: PASS — `coupons.code` UNIQUE confirmed (schema:18); ON CONFLICT target is (user,reward) NOT code, so a code collision throws; mitigated by high-entropy 4-char/32-alphabet suffix + bounded ≤5 retry on code-unique violation only; generator spyable (mirrors `orderNumberGenerator`).
- Section 6 (Notification safety) feasibility: PASS — `notifyRewardUnlocked` runs AFTER tx commit, try/catch-wrapped, failure swallowed; columns match `notifications` schema (`type` free varchar so `'reward_unlocked'` needs no enum change; `target_screen` nullable). Minor gap: `target_screen` value unresolved (execute-agent instruction E3).
- Section 7 (Seed non-regression) feasibility: CONCERN — 5/10/15/20 roadmap keeps tier-1 at 5 (preserves `/summary` MIN-active-reward); generalizing `seedRewardsTable` to N tiers is correct, but the find-by-name-then-upsert pattern leaves pre-existing extra active rewards in a shared local DB as-is (plan acknowledges "acceptable for dev seed"). Non-issue for the hermetic per-run `_test` DB and for the self-seeding test suite (tests use `seedRewardTier`, not `db:seed`), so no test-correctness impact. Concern is the undocumented shared-DB `/summary` surprise risk — resolved by execute-agent instruction E4 (document the leave-extras caveat).
- Section 8 (Test coverage + REGRESSION) feasibility: PASS — all 5 ACs + 4 edges are named Fully-Automated scenarios, no vacuous/skipped tests; fixtures reuse `seedCompletedOrder`/`getUserStars` + new `seedRewardTier` + near-threshold pre-seed; REGRESSION churn bounded to 3 assertions; `afterAll` FK-teardown order specified correctly (notifications → coupons → star_transactions → user_stars → orders → users → branch, rewards after coupons).

Execute-agent instructions:
- E1 — Idempotency (Step 2/3/6d): copy the 0005 `where: sql\`... IS NOT NULL\`` ON CONFLICT form VERBATIM for the coupons `(user_id, reward_id)` partial index. The bare `target`-only form throws at runtime against a partial index (STAR-001 E1, proven). Non-negotiable.
- E2 — `.returning()` on `user_stars` upsert (Step 6): add `.returning()` to the existing `onConflictDoUpdate` upsert and read `lifetime_stars` from it in-tx. If `.returning()` proves flaky on the update branch against the live `_test` DB, fall back to an in-tx SELECT of `user_stars` (documented in Risks) — do NOT read a stale pre-bump value.
- E3 — `target_screen` value (Step 5): grep existing `target_screen` usage in the codebase first; if none exists, use the rewards tab route string (`'/(tabs)/rewards'`), confirming against the app's Expo Router route convention. Document the chosen value in the phase report.
- E4 — Seed leave-extras caveat (Step 7): confirm `seedRewardsTable` converges to exactly the 4 roadmap tiers active by name; explicitly document in the phase report that pre-existing extra active rewards in a shared local DB are left as-is (a `/summary` MIN-active-reward on a non-roadmap tier below 5 could surprise — flag it, do not fix here; the hermetic test DB is unaffected).
- E5 — Code-collision retry (Step 4/6.3): bound the retry to ≤5 attempts on the `coupons.code` unique violation ONLY. Never retry on the `(user_id, reward_id)` conflict (that is handled by ON CONFLICT DO NOTHING and returns an empty set, not an exception). Distinguish the two by the constraint name in the pg error.
- E6 — Full unfiltered typecheck (Step 9): run `pnpm turbo run typecheck` (NOT `--filter`). STAR-001's lesson: a filtered typecheck missed a cross-package break.
- E7 — MIG-SYNC (Step 3): the generated 0006 must contain ONLY the `coupons_user_reward_unique` partial index. Any other diff = out-of-band drift → STOP and reconcile before proceeding.

Open gaps: none blocking. One accepted CONCERN (Section 7 seed leave-extras) resolved via E4 (documentation-only; no code change beyond the console.log summary).

What this coverage does NOT prove:
- The API test suite (`pnpm --filter @jojopotato/api test`) proves the unlock/idempotency/battle-pass/regression logic against a pristine per-run `_test` Postgres — it does NOT prove behavior against a shared/dirty local DB with pre-existing non-roadmap active rewards (Section 7 CONCERN; documented, not tested).
- MIG-SYNC (`db:generate` no-diff) proves the migration matches the schema — it does NOT prove the migration applies cleanly against a production-shaped DB with existing coupon rows that violate the new partial unique constraint (no prod data exists yet; deferred — coupons table is dev-only seeded).
- typecheck/lint/format prove static integrity — they do NOT prove runtime coupon-code entropy is sufficient at scale (the bounded retry + 32^4 keyspace is the mitigation; no load test).
- The `notifications` write is best-effort/swallowed — the suite proves a coupon survives a notification failure, but does NOT prove push-notification delivery (PUSH-002/003, out of scope; TODO seam only).
- No STAR-002 progress-bar semantics coverage — the battle-pass model implies STAR-002's bar should track `lifetime_stars` toward the next unclaimed tier, but that rework is explicitly out of scope (backlog NOTE flagged for update-process).

Gate: CONDITIONAL (1 CONCERN accepted; no FAILs; all developed behavior Fully-Automated; no Known-Gap on any developed behavior)
Accepted by: session (autonomous, /goal execution) — accepted concern: Section 7 seed leave-extras caveat (resolved via execute-agent instruction E4, documentation-only)

---

## Autonomous Goal Block

```
SESSION GOAL: STAR-003 — reward unlock + coupon generation (battle-pass cumulative, idempotent alongside STAR-001)
Charter + umbrella plan: N/A — single plan
Autonomy: /goal autonomous execution — self-decide at V5/EXECUTE gates; CONDITIONAL → apply fixes + proceed; BLOCKED → backlog note + continue; hard-stop only on irreversible/outward-facing actions not in this contract. Cite feedback_autonomous_phase_execution.md.
Hard stop conditions / safety constraints:
- Migration 0006 must contain ONLY the coupons_user_reward_unique partial index — any other diff means out-of-band schema drift; STOP and reconcile, do not proceed.
- Do NOT use the bare `target`-only ON CONFLICT form against the partial index — it throws at runtime (STAR-001 E1). Use the `where` form verbatim.
- Notification insert must run AFTER the transaction commits and its failure must be swallowed — a notification failure must never roll back a real coupon.
- No coupon may be minted outside the credited path (inside the `inserted.length > 0` gate) — a duplicate completion event must never double-mint.
Next phase: EXECUTE: process/features/rewards-notifications/active/star-003-reward-unlock_14-07-26/star-003-reward-unlock_PLAN_14-07-26.md
Validate contract: inline in plan (## Validate Contract) — Gate: CONDITIONAL
Execute start: implement Steps 1→9 in order; typecheck between steps; full gate suite at Step 9. Fully-auto gates: `pnpm turbo run typecheck` | `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test` (precondition: `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate`) | `pnpm turbo run lint` | `pnpm format:check` | MIG-SYNC: `pnpm --filter @jojopotato/api db:generate`. high-risk pack: no (Fully-Automated LIVE idempotency proofs substitute for the manual evidence pack on this internal service surface).
```
