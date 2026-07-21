---
name: plan:star-002-rewards-screen
description: "STAR-002 Rewards screen — stars progress tracker, reward preview, available rewards, reverse-chron history, T&C; plus a mandatory STAR-001 points→stars type-regression fix"
date: 14-07-26
feature: rewards-notifications
phase: "star-002"
---

# STAR-002 — Rewards Screen (COMPLEX PLAN)

Date: 14-07-26
Status: ACTIVE — PLAN written, VALIDATE pending
Complexity: COMPLEX
Feature: rewards-notifications
Branch: dev/star

**TL;DR:** Ship the customer Rewards screen (star progress tracker, stars-needed label, reward
preview, available rewards, reverse-chron history, real Terms & Conditions). Two hard prerequisites
come FIRST: (1) fix the live STAR-001 type regression (points/tier types were deleted → `packages/ui`
+ `apps/mobile` typecheck are RED right now), and (2) add a new session-gated `packages/api`
rewards route (none exists — STAR-001 built the service but mounted no endpoint). Locked decisions:
single seeded 5-star reward, AC5 = react-query refetch-on-focus (no push/websocket), T&C authored
from PRD §6.10, data layer = react-query over a cookie-attached `fetch` (STAFF-002 precedent).
Expected: NO new migration (all three tables already exist; seeding a reward row is seed-only).

This is a COMPLEX plan (multi-package: `packages/types` + `packages/ui` + `packages/api` +
`apps/mobile`; new API surface + session-auth + schema-read; blocking cross-package type regression).

**Next phase:** VALIDATE (schema-read / new API / session-auth surface → VALIDATE is mandatory, not
skippable). Structure below is validate-ready: explicit gates, tiers, and AC→gate mapping.

---

## Overview

STAR-001 delivered the star-earning *engine* (`user_stars` counter, `star_transactions` ledger,
`creditStarForCompletedOrder` / `reverseStarForRefundedOrder` services, idempotency via a partial
unique index) but: (a) deleted the old points/tier shared types, breaking 6 consumers, and (b)
wired no HTTP route. STAR-002 makes the earned stars *visible*: a read-only Rewards screen backed by
new authenticated GET endpoints.

Primary context reads: `process/context/all-context.md` and `process/context/tests/all-tests.md`
(test runner + verification order — vitest in `packages/api`, jest-expo in `packages/ui`, no RN
component/E2E runner for `apps/mobile`).

### Goals

1. Restore a green tree by reconciling all 6 points/tier consumers to the real stars/threshold model.
2. Expose the caller's star state + reward catalog + transaction history via new session-gated
   `GET` endpoints under a new `packages/api/src/routes/rewards.ts`.
3. Build the real Rewards screen (replacing the `<ComingSoon>` placeholder) from shared
   `@jojopotato/ui` components, with a data layer under `apps/mobile/src/features/rewards/`.
4. Author real (non-lorem) Terms & Conditions derived from PRD §6.10.

### Non-Goals (Out of Scope — see §Out of Scope)

Live crediting wiring (STAFF-003), coupon issuance on threshold (STAR-003), redemption flow
(STAR-004), admin threshold config (ADM-005), true push/websocket real-time (LIVE-001).

---

## Acceptance Criteria

Each criterion names its proving scenario and strategy (see §Verification Evidence for the full gate
table). Strategy tags: `Fully-Automated` | `Hybrid` | `Agent-Probe`.

- **AC1 — Progress bar renders `current_stars / required_stars` (3/5 visually distinct from 5/5).**
  - proven by: `star-progress-bar.test.tsx` fraction case (3/5 ≈ 0.6) + `rewards.integration.test.ts`
    summary math + on-device bar-fill probe. strategy: Fully-Automated (logic) + Agent-Probe (visual).
- **AC2 — Reaching `required_stars` visually indicates reward unlocked/ready.**
  - proven by: `star-progress-bar.test.tsx` 5/5 unlocked-caption + clamp case + `rewards.integration.test.ts`
    `isUnlocked` + on-device unlocked-state probe. strategy: Fully-Automated (logic) + Agent-Probe (visual).
- **AC3 — Reward history list matches the user's actual `star_transactions` rows in reverse-chron order.**
  - proven by: `rewards.integration.test.ts` history-order + earned/adjusted-contents assertions.
    strategy: Fully-Automated.
- **AC4 — Terms & Conditions text present and NOT placeholder/lorem at ship time.**
  - proven by: `rewards-terms.test.tsx` asserts a known non-lorem phrase is present. strategy: Fully-Automated.
- **AC5 — Screen updates without app restart after a qualifying order completes (refetch-on-focus).**
  - proven by: on-device probe (simulate server-state change → refocus → observe update). strategy:
    Agent-Probe. Known-gap: the *live* credit trigger depends on STAFF-003 (unbuilt) + LIVE-001;
    only the refetch-on-focus *mechanism* is provable now.
- **AC-REGRESSION — Full `pnpm turbo run typecheck` green (STAR-001 points→stars reconciliation complete).**
  - proven by: `pnpm turbo run typecheck` (FULL, not filtered). strategy: Fully-Automated.

**Vacuous-green / Known-Gap note:** No developed behavior is declared PASS on Known-Gap alone. AC1/AC2
carry Fully-Automated logic gates in addition to their Agent-Probe visual gates. AC5's live-trigger
residual is recorded as a known-gap (STAFF-003/LIVE-001) and kept out of the PASS claim — only the
refetch mechanism is asserted. AC3/AC4/AC-REGRESSION are fully automated.

---

## Locked Decisions (do NOT re-open)

| # | Decision | Consequence for this plan |
|---|---|---|
| LD1 | **Threshold = one seeded 5-star reward.** Seed ONE `rewards` row (`required_stars=5`, `is_active=true`) in `seed.ts`. Progress bar targets the MIN active reward's `required_stars`. | Seed-only change (NOT schema). Summary endpoint computes target = `min(required_stars) WHERE is_active`. Admin-configurable thresholds = ADM-005, out of scope. |
| LD2 | **AC5 = refetch-on-focus.** Use react-query `refetchOnWindowFocus` — already the global default in `apps/mobile/src/lib/query-client.ts` (confirmed `refetchOnWindowFocus: true`). | No push/websocket. STAFF-003 (live crediting) + LIVE-001 (live infra) recorded as explicit known-gap. Screen re-reads server state on focus. |
| LD3 | **T&C authored from PRD §6.10.** Real concise copy: 1 star per completed eligible order; cancelled/refunded don't earn; 5 stars unlocks a reward. Store as a constant, non-lorem. | New `packages/ui` text block (`rewards-terms.ts`) preferred (reusable, theme-token driven) OR a mobile constant. Chosen: `packages/ui` text-block component `<RewardsTerms>` — see Step 8. |
| LD4 | **Data layer = react-query over cookie-attached `fetch`.** Follow STAFF-002: plain `fetch(\`${env.apiUrl}${path}\`, { headers: { Cookie: authClient.getCookie() } })`. Do NOT use `authClient.$fetch` for own routes (it prefixes better-auth's `/api/auth` basePath → 404, documented in `staff-api.ts:7-20`). | New `apps/mobile/src/features/rewards/lib/rewards-api.ts` mirrors `staff-api.ts`; react-query hooks in `apps/mobile/src/features/rewards/hooks/`. |

---

## Touchpoints

**Read for context (not modified):**
- `packages/api/src/lib/star-earning.ts` — the star model, `numericToCents`, counter semantics
- `packages/api/src/routes/orders.ts:214-256` — history pagination/`desc(placed_at)` precedent
- `packages/api/src/routes/staff.ts` — GET route shape + `req.staffSession`/`resolveBranchScope`
- `packages/api/src/routes/__tests__/staff-orders.integration.test.ts` — hermetic self-seeding pattern
- `packages/api/src/middleware/require-session.ts` — session gate (`req.user!.id`)
- `packages/api/src/routes/lib/serializers.ts` — `numericToCents`, serializer conventions
- `packages/api/src/db/schema/{rewards,user_stars,star_transactions,orders}.ts` — table shapes
- `apps/mobile/src/features/staff/lib/staff-api.ts` — the exact cookie-fetch pattern to copy (LD4)
- `apps/mobile/src/lib/query-client.ts` — confirms `refetchOnWindowFocus: true` (LD2)
- `apps/mobile/src/features/auth/lib/auth-client.ts` — `authClient.getCookie()`
- `packages/ui/src/index.ts`, `packages/ui/src/components/empty-state.tsx` — reuse-first check
- `docs/jojo-potato-mobile-prd.md` §6.10 — T&C source, reward-rule source

**Modified / created — see full list in §Blast Radius.**

---

## Public Contracts

### New API endpoints (all session-gated via `requireSession`, mounted `app.use('/rewards', requireSession, rewardsRouter)`)

Follows the `/branches`/`/orders` mount convention (top-level, NOT under `/api/staff`). `requireSession`
applied once at mount; every handler assumes `req.user!.id`.

**`GET /rewards/summary`** → `RewardsSummary`
```
{
  currentStars: number;      // user_stars.current_stars; 0 if no row (STAR-001 creates lazily)
  lifetimeStars: number;     // user_stars.lifetime_stars; 0 if no row
  requiredStars: number;     // min(required_stars) WHERE is_active (LD1: the 5-star rule)
  isUnlocked: boolean;       // currentStars >= requiredStars
  reward: Reward | null;     // the min active reward (the one being progressed toward), null if none active
}
```
- MISSING `user_stars` row ⇒ `currentStars=0, lifetimeStars=0` (do NOT 404). STAR-001 creates the
  row lazily on first credit, so new users legitimately have no row.
- NO active reward ⇒ `requiredStars` falls back to a safe sentinel (`0`) and `reward=null`,
  `isUnlocked=false`. (With LD1's seed, one active reward always exists in seeded envs.)

**`GET /rewards/available`** → `{ rewards: Reward[] }`
- All `is_active=true` rewards, ordered by `required_stars` asc.
- Decision: keep SEPARATE from `/summary` (not folded in). Rationale: the screen's "available
  rewards list" section is a distinct concern from the top progress tracker; a separate endpoint
  keeps each response single-purpose and matches the one-endpoint-per-section precedent in
  `staff.ts`. Summary still embeds the single `reward` it targets for the tracker's preview.

**`GET /rewards/history`** → `{ transactions: StarTransaction[], nextCursor: string | null }`
- The caller's `star_transactions` rows, `orderBy(desc(created_at))` (AC3 = reverse-chron).
- Cursor pagination mirroring `orders.ts:214-256` (`limit`+1 look-ahead, `nextCursor` = last row's
  `created_at.toISOString()`). Default limit 20, max 50.
- Serializer maps snake_case DB rows → camelCase `StarTransaction` (`createdAt` as ISO string).

### New shared types (`packages/types/src/rewards.ts`, re-exported from `index.ts` — already re-exports `./rewards`)

```
export interface Reward {
  id: string;
  name: string;
  requiredStars: number;
  rewardType: string;
  rewardValue: number | null;   // numericToCents-converted (integer cents) OR null
  isActive: boolean;
}

export interface RewardsSummary {
  currentStars: number;
  lifetimeStars: number;
  requiredStars: number;
  isUnlocked: boolean;
  reward: Reward | null;
}
```
- `StarTransaction`, `UserStars`, `StarTransactionType` already exist (STAR-001) — DO NOT redefine;
  reuse. `StarTransaction` already has `createdAt: string` (ISO) — matches the history serializer.

### Changed shared-component prop contracts (regression fix — breaking, all consumers reconciled in-plan)

- `StarProgressBarProps.progress: RewardsTierProgress` → `{ currentStars: number; requiredStars: number }`
  (a NEW inline/exported `StarProgress` shape). Width = `currentStars/requiredStars` clamped [0,1].
- `RewardProgressCardProps.rewards: RewardsAccount` → `{ currentStars: number; requiredStars: number }`
  (stars shape; drop `tier`/`points`). Drops `TIER_LABEL`.

### T&C constant (LD3)

New `<RewardsTerms>` text-block component in `packages/ui` (theme-token driven, `mode` prop). Real
copy, non-lorem, derived from PRD §6.10. Exported from `packages/ui/src/index.ts`.

---

## Blast Radius

**Risk class:** MEDIUM-HIGH. New authenticated API surface (session-auth), schema reads, a
cross-package breaking type change with 8 reconciled consumers. NO destructive writes, NO migration,
NO auth-provider change. All endpoints are read-only GET.

### New files (create)

| # | Path | Purpose |
|---|---|---|
| N1 | `packages/api/src/routes/rewards.ts` | 3 session-gated GET handlers (summary/available/history) |
| N2 | `packages/api/src/routes/__tests__/rewards.integration.test.ts` | hermetic vitest: AC3 history order+contents, AC1/AC2 summary math, edges |
| N3 | `apps/mobile/src/features/rewards/lib/rewards-api.ts` | cookie-fetch functions (LD4, mirrors staff-api.ts) |
| N4 | `apps/mobile/src/features/rewards/hooks/use-rewards-summary.ts` | react-query hook over N3 |
| N5 | `apps/mobile/src/features/rewards/hooks/use-rewards-history.ts` | react-query hook over N3 |
| N6 | `apps/mobile/src/features/rewards/hooks/use-available-rewards.ts` | react-query hook over N3 |
| N7 | `packages/ui/src/components/rewards-terms.tsx` | `<RewardsTerms>` T&C text block (LD3) |
| N8 | `packages/ui/src/components/__tests__/rewards-terms.test.tsx` | renders + asserts non-lorem copy present (AC4) |

### Modified files

| # | Path | Change | Why |
|---|---|---|---|
| M1 | `packages/types/src/rewards.ts` | ADD `Reward`, `RewardsSummary` (keep existing STAR-001 types) | new view types |
| M2 | `packages/ui/src/components/star-progress-bar.tsx` | re-type props points→stars; width = `currentStars/requiredStars`; caption "N stars to your reward"/"Reward unlocked" | REGRESSION FIX + AC1/AC2 tracker |
| M3 | `packages/ui/src/components/reward-progress-card.tsx` | re-type props points/tier→stars; drop `TIER_LABEL` | REGRESSION FIX |
| M4 | `packages/ui/src/components/__tests__/mocks.ts` | star-shaped `MOCK_REWARDS`/`MOCK_PROGRESS`; drop points/tier imports | REGRESSION FIX (test compile) |
| M5 | `packages/ui/src/components/__tests__/reward-progress-card.test.tsx` | update to star-shaped props/assertions | REGRESSION FIX (existing test) |
| M6 | `packages/ui/src/components/__tests__/star-progress-bar.test.tsx` | update to star-shaped props/assertions + AC1/AC2 fraction/unlocked cases | REGRESSION FIX + AC1/AC2 automated coverage |
| M7 | `packages/ui/src/index.ts` | export `./components/rewards-terms` | expose N7 |
| M8 | `apps/mobile/src/features/home/mock-home.ts` | `MOCK_REWARDS` → star shape (drop `RewardsAccount` import) | REGRESSION FIX |
| M9 | `apps/mobile/src/app/(tabs)/index.tsx` | pass star-shaped `MOCK_REWARDS` to `RewardProgressCard` | REGRESSION FIX (consumer at :65) |
| M10 | `apps/mobile/src/features/home/components/rewards-teaser-card.tsx` | **DELETE** — dead code (grep: zero usages), superseded by ui `RewardProgressCard` | consolidation (directive: consolidation preferred) |
| M11 | `apps/mobile/src/app/component-showcase.tsx` | star-shaped `SAMPLE_REWARDS`/`SAMPLE_PROGRESS` + the inline `progress={{...}}` at :299 | REGRESSION FIX |
| M12 | `packages/api/src/db/seed/seed.ts` | ADD `seedRewardsTable()` (one 5-star active reward) + call in `runSeed()` + log line | LD1 |
| M13 | `packages/api/src/index.ts` | import + mount `app.use('/rewards', requireSession, rewardsRouter)` | expose N1 |
| M14 | `apps/mobile/src/app/(tabs)/rewards/index.tsx` | REPLACE `<ComingSoon>` with the real Rewards screen; REMOVE the `Dev: View Coupons` link | the screen (AC1–AC5) |

**Consolidation decision (M10):** `rewards-teaser-card.tsx` is dead code — `grep -rn "RewardsTeaserCard"`
returns ZERO usages outside its own file, and the home screen already renders ui's `RewardProgressCard`.
Delete it rather than re-typing a second near-duplicate. This is the "consolidation preferred" path.

**Dev-link removal (M14):** the `Dev: View Coupons` link and `<ComingSoon>` are replaced wholesale by
the real screen. (The `rewards/coupons` route it pointed to is untouched — a separate screen.)

**Migration:** NONE expected. `rewards`, `user_stars`, `star_transactions` all already exist
(STAR-001 + prior). Seeding a row is data, not DDL. MIG-SYNC gate (below) proves no drift.

---

## Data Flow

**Screen load / focus (LD2):**
`RewardsScreen` mounts → `useRewardsSummary()` + `useAvailableRewards()` + `useRewardsHistory()`
react-query hooks fire → each calls a `rewards-api.ts` function → `fetch(env.apiUrl + path, {Cookie})`
→ Express `requireSession` resolves `req.user.id` → handler reads Postgres (`user_stars`,
`rewards`, `star_transactions`) → serializes → JSON → hook returns typed data → screen renders.
On tab re-focus, `refetchOnWindowFocus` re-runs the queries → screen reflects any server-side change
(e.g. a star credited by a future STAFF-003 flow) WITHOUT app restart (AC5).

**Summary math (AC1/AC2, server-side):**
`currentStars` = `user_stars.current_stars` (or 0 if no row). `requiredStars` = `min(required_stars)`
over `WHERE is_active`. `isUnlocked` = `currentStars >= requiredStars`. Progress bar fraction (client,
M2) = `min(1, max(0, currentStars/requiredStars))`.

**History (AC3):** `star_transactions WHERE user_id = caller ORDER BY created_at DESC`, cursor-paginated.

---

## Failure Modes & Edge Cases (from vc-scenario)

| Case | Expected behavior | Covered by |
|---|---|---|
| 0 stars, no `user_stars` row (new user) | summary returns `currentStars:0`, NOT 404; bar empty; history empty-state | N2 test + Agent-Probe |
| Exactly at threshold (5/5) | `isUnlocked:true`; bar full; caption "Reward unlocked"; visually distinct from 3/5 | M6 unit + N2 + Agent-Probe (AC2) |
| Over threshold (6/5) | fraction clamped to 1.0; `isUnlocked:true` | M6 unit (clamp assertion) |
| Empty history | history endpoint returns `[]`; screen shows EmptyState, not a crash | N2 + Agent-Probe |
| History with `adjusted` (-1) rows (refund reversal) | reversal rows appear in reverse-chron with negative stars; not filtered out | N2 test (seed earned+adjusted, assert order+sign) |
| No active reward (defensive) | `requiredStars:0`, `reward:null`, `isUnlocked:false`; screen degrades gracefully | N2 edge test |
| Unauthenticated request | `requireSession` → 401 | N2 test (no-cookie → 401) |
| Cross-user isolation | caller sees only own transactions/stars | N2 test (seed 2 users, assert no bleed) |
| Network error on device | hook `isError`; screen shows error state (rewards-api throws on non-OK per STAFF-002 P2 precedent) | Agent-Probe |
| Loading | hooks `isLoading`; screen shows loading state | Agent-Probe |

---

## Implementation Checklist (ordered so the tree typechecks between steps)

**Ordering principle:** types first (additive — never break), then the ui re-types WITH their
consumers in the SAME step group so no intermediate state leaves a dangling reference, then API, then
mobile. The regression fix (Steps 2–4) lands early so `pnpm turbo run typecheck` goes green before
any new feature code. Each step ends green.

### Step 1 — Add view types (additive, safe)
1a. In `packages/types/src/rewards.ts`, ADD `Reward` and `RewardsSummary` (per §Public Contracts).
    Keep existing `StarTransactionType`/`UserStars`/`StarTransaction` untouched.
1b. Confirm `packages/types/src/index.ts` already re-exports `./rewards` (it does — no change).
- **Gate:** `pnpm --filter @jojopotato/types typecheck` green.

### Step 2 — Re-type shared UI components (REGRESSION FIX, part 1)
2a. `star-progress-bar.tsx` (M2): props `progress: { currentStars, requiredStars }`; drop
    `RewardsTierProgress` import. `fraction = requiredStars > 0 ? min(1, max(0, currentStars/requiredStars)) : 0`.
    Caption: `currentStars >= requiredStars ? 'Reward unlocked' : \`${requiredStars - currentStars} stars to your reward\``.
    Keep the `View`/`StyleSheet` bar rendering; only the value source changes.
2b. `reward-progress-card.tsx` (M3): props `rewards: { currentStars, requiredStars }`; delete
    `TIER_LABEL`; render stars/label from the stars shape (e.g. "N of M stars"). Drop `RewardsAccount` import.
- **Gate:** `pnpm --filter @jojopotato/ui typecheck` green (component sources compile).

### Step 3 — Reconcile UI test mocks + existing UI tests (REGRESSION FIX, part 2)
3a. `mocks.ts` (M4): `MOCK_REWARDS = { currentStars: 3, requiredStars: 5 }`;
    `MOCK_PROGRESS = { currentStars: 3, requiredStars: 5 }`; drop `RewardsAccount`/`RewardsTierProgress` imports.
3b. `reward-progress-card.test.tsx` (M5): update to star-shaped props/assertions.
3c. `star-progress-bar.test.tsx` (M6): star-shaped props; ADD cases for AC1 (3/5 fraction ≈ 0.6)
    and AC2 (5/5 → unlocked caption, fraction 1.0) and clamp (6/5 → 1.0). These are the automated
    AC1/AC2 gates.
- **Gate:** `pnpm --filter @jojopotato/ui test` (jest-expo) green; `pnpm --filter @jojopotato/ui typecheck` green.

### Step 4 — Reconcile mobile regression sites (REGRESSION FIX, part 3)
4a. `mock-home.ts` (M8): `MOCK_REWARDS = { currentStars: 3, requiredStars: 5 }`; drop `RewardsAccount` import.
4b. `(tabs)/index.tsx` (M9): confirm `<RewardProgressCard rewards={MOCK_REWARDS} />` compiles with new shape.
4c. DELETE `rewards-teaser-card.tsx` (M10) — dead code.
4d. `component-showcase.tsx` (M11): `SAMPLE_REWARDS`/`SAMPLE_PROGRESS` → star shape; fix inline
    `progress={{ currentPoints: 900, ... }}` at :299 → `progress={{ currentStars: 5, requiredStars: 5 }}`.
    Drop `RewardsAccount`/`RewardsTierProgress` imports.
- **Gate:** `pnpm turbo run typecheck` (FULL — all packages) green. **This is the regression-green gate (AC-REGRESSION).**

### Step 5 — API rewards route + types wiring
5a. Create `packages/api/src/routes/rewards.ts` (N1): `rewardsRouter` with three GET handlers
    (`/summary`, `/available`, `/history`) per §Public Contracts. Use `numericToCents` for
    `reward_value`. History uses `desc(created_at)` + cursor pagination (copy `orders.ts:214-256`).
    Summary target = `db.select({ min: min(required_stars) }).where(eq(is_active, true))` (or fetch
    min active reward row and read its `required_stars`). Missing `user_stars` row ⇒ 0s.
5b. `index.ts` (M13): `import { rewardsRouter } from './routes/rewards';` + `app.use('/rewards', requireSession, rewardsRouter);` (place with the other `/branches`/`/orders` mounts).
- **Gate:** `pnpm --filter @jojopotato/api typecheck` green.

### Step 6 — Seed one active 5-star reward (LD1)
6a. `seed.ts` (M12): add `seedRewardsTable()` inserting ONE row (`name`, `required_stars: 5`,
    `reward_type` e.g. `'free_item'`, `reward_value` nullable, `is_active: true`). Call it in
    `runSeed()`; add a `console.log` line.
- **Gate:** `pnpm --filter @jojopotato/api typecheck` green. (Seed run itself is exercised by N2's
  hermetic self-seed, not `db:seed`.)

### Step 7 — API integration tests (AC3 + summary math)
7a. Create `packages/api/src/routes/__tests__/rewards.integration.test.ts` (N2): hermetic
    self-seeding per `staff-orders.integration.test.ts`. Cover: AC3 (history reverse-chron order +
    earned/adjusted contents), AC1/AC2 summary math (3/5 not unlocked; 5/5 unlocked; 6/5 clamped
    server-side isUnlocked), missing-`user_stars`→0, empty-history→`[]`, no-cookie→401, cross-user
    isolation, available list ordered asc.
- **Gate:** `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test` green.

### Step 8 — T&C text block (LD3)
8a. Create `packages/ui/src/components/rewards-terms.tsx` (N7): `<RewardsTerms mode?>` theme-token
    text block. Real copy from PRD §6.10: "You earn 1 Jojo Star for every completed order. Cancelled
    or refunded orders don't earn stars. Collect 5 stars to unlock a free reward. Stars have no cash
    value and can't be transferred." (final wording locked at ship; NON-lorem).
8b. `packages/ui/src/index.ts` (M7): export `./components/rewards-terms`.
8c. Create `rewards-terms.test.tsx` (N8): render + assert a known non-lorem phrase is present (AC4).
- **Gate:** `pnpm --filter @jojopotato/ui test` + `pnpm --filter @jojopotato/ui typecheck` green.

### Step 9 — Mobile data layer (LD4)
9a. Create `apps/mobile/src/features/rewards/lib/rewards-api.ts` (N3): `rewardsFetch(path)` copying
    `staff-api.ts` (absolute `env.apiUrl` + `Cookie: authClient.getCookie()`). Functions:
    `fetchRewardsSummary()`, `fetchAvailableRewards()`, `fetchRewardsHistory()`. Throw on non-OK
    (STAFF-002 P2 precedent) so react-query surfaces `isError`.
9b. Create hooks N4/N5/N6 (`use-rewards-summary`, `use-rewards-history`, `use-available-rewards`)
    wrapping the functions in `useQuery` with stable query keys.
- **Gate:** `pnpm --filter @jojopotato/mobile typecheck` green.

### Step 10 — Rewards screen (AC1–AC5)
10a. `(tabs)/rewards/index.tsx` (M14): replace `<ComingSoon>`+dev link with the real screen composed
     of `@jojopotato/ui`: `StarProgressBar` (tracker), stars-needed label, reward preview (Card/Badge),
     available rewards list, reverse-chron history list, `<RewardsTerms>`. Use `EmptyState` for empty
     history/zero-star. Handle loading/error states from the three hooks. Ensure the screen is inside
     the react-query provider tree (already mounted app-wide).
- **Gate:** `pnpm --filter @jojopotato/mobile typecheck` + `pnpm turbo run lint` + Agent-Probe walkthrough (AC1/AC2/AC5 on device).

### Step 11 — Full regression + format
11a. Run the full gate suite (see §Gate Commands).
- **Gate:** ALL commands green; MIG-SYNC no-diff (proves no migration needed).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `star-progress-bar.test.tsx` — 3/5 fraction ≈ 0.6, distinct from 5/5 (M6) | Fully-Automated | AC1 (progress bar renders current/required, 3/5 visually distinct from 5/5) |
| `star-progress-bar.test.tsx` — 5/5 → `isUnlocked`/"Reward unlocked" caption + fraction 1.0; 6/5 clamp (M6) | Fully-Automated | AC2 (reaching required visually indicates unlocked) |
| On-device: bar fill width + "unlocked" visual state at 3/5 vs 5/5 (Agent-Probe) | Agent-Probe | AC1 + AC2 (rendered visual distinctness — RN-runner gap, tests/all-tests.md) |
| `rewards.integration.test.ts` — history `desc(created_at)`, earned+adjusted contents match seeded rows (N2) | Fully-Automated | AC3 (history matches star_transactions in reverse-chron) |
| `rewards.integration.test.ts` — summary math: 3/5 not unlocked, 5/5 unlocked, 6/5 clamped, missing-row→0, cross-user isolation, no-cookie→401 (N2) | Fully-Automated | AC1/AC2 server side + auth/isolation |
| `rewards-terms.test.tsx` — asserts known non-lorem phrase present (N8) | Fully-Automated | AC4 (T&C present, not placeholder/lorem) |
| On-device: focus screen → (simulate credited star via DB or STAFF-003 stub) → screen updates on refocus without restart (Agent-Probe) | Agent-Probe | AC5 (refetch-on-focus; STAFF-003/LIVE-001 known-gap for true live trigger) |
| `pnpm turbo run typecheck` (FULL — all packages) green | Fully-Automated | AC-REGRESSION (STAR-001 points→stars reconciliation complete; NOT a filtered subset — the filter is what let STAR-001 through) |
| `DATABASE_URL=... pnpm --filter @jojopotato/api test` green | Fully-Automated | API contract + AC3 + summary math regression |
| `pnpm --filter @jojopotato/ui test` (jest-expo) green | Fully-Automated | AC1/AC2 fraction logic + AC4 T&C + ui regression |
| `pnpm turbo run lint` green | Fully-Automated | style gate |
| `pnpm format:check` green | Fully-Automated | format gate |
| Re-run `pnpm --filter @jojopotato/api db:generate` → "No schema changes" | Fully-Automated | MIG-SYNC: confirms NO migration needed (seed-only) |

**Honesty note on tiers:** AC1/AC2 *logic* (progress fraction, unlocked boolean) and AC3/summary
*data* are Fully-Automated (jest-expo for the component; vitest for the API). The *rendered on-device
visual* (bar fill, unlocked styling) and AC5 *refetch-on-focus runtime* are **Agent-Probe only** —
there is no RN component/E2E runner for `apps/mobile` (project-wide gap, `tests/all-tests.md` Known
Gaps). This is a documented gap, not a claimed automated pass. AC5's true *live-credit trigger*
depends on STAFF-003 (unbuilt) + LIVE-001 (live infra) — recorded as an explicit known-gap; the
refetch-on-focus *mechanism* is verifiable (simulate a server-state change, refocus, observe update).

---

## Gate Commands (copy-paste for VALIDATE/EXECUTE)

```bash
# Regression-green gate — FULL typecheck (NOT a filtered subset)
pnpm turbo run typecheck
# API integration (needs docker compose up -d + db:migrate first)
DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test
# UI component tests (jest-expo — AC1/AC2 fraction, AC4 T&C, ui regression)
pnpm --filter @jojopotato/ui test
# Lint + format
pnpm turbo run lint
pnpm format:check
# MIG-SYNC (expected: no diff — proves seed-only, no migration)
pnpm --filter @jojopotato/api db:generate   # expect "No schema changes"
```

---

## Post-Phase Testing / Test Procedure

After each Implementation Checklist step, run that step's named **Gate** (see per-step gates above)
before advancing — do not batch gates to the end. The regression-green gate at Step 4d
(`pnpm turbo run typecheck`, FULL) must pass before any Step 5+ feature work begins. The full gate
suite in §Gate Commands is the EXECUTE-exit / EVL confirmation set. Test runner reference:
`process/context/tests/all-tests.md` (vitest in `packages/api`, jest-expo in `packages/ui`, no RN
component/E2E runner for `apps/mobile` → Agent-Probe for rendered visual + refetch runtime).

---

## Phase Completion Rules

This is a single-plan COMPLEX artifact (not a phase program), so "phase" here = the whole STAR-002
plan. Completion is honest-status gated:

- **CODE DONE** — all 11 Implementation Checklist steps applied and every per-step Gate green,
  including the FULL `pnpm turbo run typecheck` (AC-REGRESSION) and the API vitest + ui jest-expo suites.
- **VERIFIED** — CODE DONE **plus** the EVL confirmation run (vc-tester re-runs §Gate Commands) is
  green **plus** the Agent-Probe walkthrough (AC1/AC2 rendered visual + AC5 refetch-on-focus) is
  recorded by the user. AC5's live-credit trigger remains a documented known-gap (STAFF-003/LIVE-001)
  and does NOT block VERIFIED — only the refetch mechanism is required.
- **✅ VERIFIED requires user confirmation** of the Agent-Probe walkthrough — code-only completion is
  `CODE DONE`, never `VERIFIED`. Do not mark the plan VERIFIED without the user-confirmed on-device probe.

---

## Dependencies & Sequencing

- **Hard prerequisite (in-plan):** Steps 2–4 (regression fix) MUST complete before Steps 5–10, else
  the tree never typechecks and no gate can run. Step 4d's full `turbo run typecheck` is the gate
  that unblocks feature work.
- **External unblocked deps:** none. STAR-001's tables, services, and idempotency are done and merged.
- **Downstream consumers (out of scope, but this plan's endpoints unblock them):** STAFF-003 (calls
  the credit service; will make AC5 live), STAR-003 (coupon issuance), STAR-004 (redemption).

---

## Out of Scope

| Item | Owner | Why deferred |
|---|---|---|
| Live crediting wiring (order→star on completion) | STAFF-003 | endpoints + services exist; the staff status-transition trigger is a separate surface |
| Coupon issuance when threshold reached | STAR-003 | reward *unlock display* is in scope; issuing an actual coupon is not |
| Redemption flow (spend stars) | STAR-004 | screen is read-only display; spending is a distinct write flow |
| Admin threshold configuration | ADM-005 | LD1 fixes a single seeded 5-star reward; configurable thresholds are admin work |
| True push/websocket real-time | LIVE-001 | LD2 = refetch-on-focus; live infra is a separate program |

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A points/tier consumer missed → tree still RED after Step 4 | Low | grep in §Blast Radius enumerated all 8 sites; Step 4d's FULL `turbo run typecheck` catches any miss (the exact gate that would have caught STAR-001) |
| `min(required_stars)` over active rewards returns null (no active reward) | Low | defensive fallback `requiredStars:0, reward:null` (edge test in N2) |
| `reward_value` numeric→cents conversion wrong (null-safe) | Low | reuse `numericToCents`; N2 asserts shape; `reward_value` is nullable → guard null |
| react-query provider not wrapping the Rewards screen | Low | provider is app-wide (`_layout.tsx`); confirm in Step 10 |
| Seed change accidentally emits a migration diff | Low | MIG-SYNC gate; seeding is INSERT data, not DDL |
| `authClient.$fetch` mistakenly used → 404 | Low | LD4 explicit; copy `staff-api.ts` verbatim pattern |

---

## Test Infra Improvement Notes

- **RN component/E2E runner gap (pre-existing, project-wide):** the Rewards screen's rendered visual
  state (bar fill, unlocked styling) and AC5 refetch-on-focus runtime cannot be automated — no
  jest-expo-RN-render / Detox / Maestro harness for `apps/mobile`. Tracked at
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. This plan does NOT
  close it; AC1/AC2 *logic* is pushed down into the testable `packages/ui` component (jest-expo) and
  the API (vitest) so only the pixel-level visual + the live-focus runtime remain Agent-Probe.
- (none other identified yet)

---

## Validate Contract

Status: PASS
Date: 14-07-26
date: 2026-07-14
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 3/7 signals (S1 multi-package: types+ui+api+mobile; S2 new API + session-auth surface; S7 14+ blast-radius files). Sequential chosen over parallel because the checklist is a strict typecheck-ordered chain (types -> ui+consumers -> api -> mobile) — each step gates the next, so parallelism is not applicable. One vc-execute-agent, opus. Cost guard: not triggered.

Test gates (C3 5-column table — ADDITIVE; legacy line form follows below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 (logic) | Progress bar fraction current/required (3/5 ~= 0.6, distinct from 5/5) | Fully-Automated | `pnpm --filter @jojopotato/ui test` — star-progress-bar.test.tsx 3/5 fraction case (M6) | A |
| AC1/AC2 (visual) | On-device bar fill + unlocked styling at 3/5 vs 5/5 | Agent-Probe | on-device walkthrough (RN-runner gap) | D |
| AC2 (logic) | 5/5 -> isUnlocked + "Reward unlocked" caption + fraction 1.0; 6/5 clamp | Fully-Automated | `pnpm --filter @jojopotato/ui test` — star-progress-bar.test.tsx 5/5 + clamp cases (M6) | A |
| AC1/AC2 (server) | Summary math: 3/5 not unlocked, 5/5 unlocked, 6/5 clamped, missing-row->0 | Fully-Automated | `DATABASE_URL=... pnpm --filter @jojopotato/api test` — rewards.integration.test.ts summary cases (N2) | A |
| AC3 | History `desc(created_at)` reverse-chron; earned+adjusted contents match seeded rows | Fully-Automated | `DATABASE_URL=... pnpm --filter @jojopotato/api test` — rewards.integration.test.ts history-order (N2) | A |
| SEC-isolation | Cross-user isolation (2 seeded users, no bleed) + no-cookie->401 | Fully-Automated | `DATABASE_URL=... pnpm --filter @jojopotato/api test` — rewards.integration.test.ts isolation + 401 cases (N2) | A |
| AC4 | T&C present and NOT lorem/placeholder | Fully-Automated | `pnpm --filter @jojopotato/ui test` — rewards-terms.test.tsx non-lorem-phrase assertion (N8) | A |
| AC5 | Refetch-on-focus mechanism (server-state change -> refocus -> screen updates, no restart) | Agent-Probe | on-device walkthrough (live-credit trigger = STAFF-003/LIVE-001 known-gap) | D |
| AC-REGRESSION | Full tree typechecks green (STAR-001 points->stars reconciled, all 8 consumers) | Fully-Automated | `pnpm turbo run typecheck` (FULL — all packages, NOT filtered) | A |
| MIG-SYNC | No new migration (seed-only, no DDL drift) | Fully-Automated | `pnpm --filter @jojopotato/api db:generate` -> "No schema changes" | A |
| style | Lint clean | Fully-Automated | `pnpm turbo run lint` | A |
| format | Format clean | Fully-Automated | `pnpm format:check` | A |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to named later phase; D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy value — the Agent-Probe visual/AC5 rows carry gap-resolution D (named residual), not a Known-Gap strategy.

Legacy line form (retained so existing validate-contract consumers still parse):
- API summary/history/isolation: Fully-automated: `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test` (needs `docker compose up -d` + `db:migrate` first)
- UI logic (progress fraction, unlocked, T&C): Fully-automated: `pnpm --filter @jojopotato/ui test` (jest-expo)
- Regression-green: Fully-automated: `pnpm turbo run typecheck` (FULL — not a filtered subset)
- Style: Fully-automated: `pnpm turbo run lint`
- Format: Fully-automated: `pnpm format:check`
- MIG-SYNC: Fully-automated: `pnpm --filter @jojopotato/api db:generate` (expect "No schema changes")
- On-device visual (bar fill / unlocked styling) + AC5 refetch-on-focus: agent-probe: user walkthrough on device
- Live-credit trigger (order->star on completion): known-gap: STAFF-003 (unbuilt) + LIVE-001 (live infra) — refetch mechanism provable now, live trigger is out of scope

Dimension findings:
- Infra fit: PASS — `/rewards` mounts top-level with `requireSession` (mirrors `/orders`); react-query provider is app-wide; jest-expo + vitest runners are real; no new dep/agent/runtime.
- Test coverage: PASS — AC1/AC2 logic pushed into testable ui component (jest-expo) + API (vitest); AC3/summary/isolation vitest via proven hermetic self-seed pattern; visual+AC5 honestly Agent-Probe (documented RN-runner gap); FULL typecheck + MIG-SYNC gates present; not vacuously green.
- Breaking changes: PASS — points/tier->stars type change; grep confirmed ALL 8 on-disk consumers exactly match the Blast Radius enumeration; step ordering (types->ui+consumers->api->mobile) keeps the tree green between steps.
- Security surface: PASS — per-user isolation is sound: `requireSession` resolves `req.user.id` from the server-owned better-auth session (never client-supplied), handlers read `WHERE user_id = req.user!.id`; cross-user-isolation + no-cookie->401 tests specified; read-only GETs, no writes, no migration.
- Section — Regression fix (Steps 2-4): PASS — all edit targets grep-matchable; M10 `rewards-teaser-card.tsx` dead-code delete verified safe (zero external importers).
- Section — API route (Step 5): PASS — orders.ts:214-256 cursor/`desc` pagination precedent is real and copyable; `numericToCents` available; highest-risk edit = the min-active-reward target query (mitigation: defensive `requiredStars:0, reward:null` fallback, N2 edge test).
- Section — Seed (Step 6): PASS — no existing test reads `rewards`; integration suites are hermetic (self-insert/delete, not `db:seed`) so the seed row cannot break branches/orders/staff suites.
- Section — Integration tests (Step 7): PASS — cross-user isolation, missing-row->0, 401, and adjusted(-1) rows all mechanically feasible via the proven staff-orders self-seed pattern; N2 must self-seed its own `rewards` row (correctly specified — CI DB is migrated but not `db:seed`'d).
- Section — T&C + data layer + screen (Steps 8-10): PASS — staff-api.ts cookie-fetch pattern (LD4) verbatim-copyable, `authClient.$fetch` 404 caveat is real; `refetchOnWindowFocus:true` confirmed in query-client.ts; ui reuse-first honored.

Open gaps:
- On-device rendered visual (bar fill, unlocked styling) — Agent-Probe only (project-wide RN component/E2E runner gap; tracked at `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`).
- AC5 live-credit trigger (order completion -> star credited live) — known-gap: STAFF-003 (unbuilt) + LIVE-001 (live infra). The refetch-on-focus mechanism IS provable now; only the live trigger is deferred. Not part of the PASS claim.

What This Coverage Does NOT Prove:
- `pnpm turbo run typecheck` — proves the tree compiles; does NOT prove runtime rendering, on-device layout, or that the progress bar's pixel width matches the fraction.
- `pnpm --filter @jojopotato/ui test` (jest-expo) — proves the fraction math, unlocked-boolean logic, and T&C copy render in a JS test env; does NOT prove the on-device visual bar fill or unlocked styling appearance.
- `DATABASE_URL=... pnpm --filter @jojopotato/api test` — proves summary math, history order/contents, cross-user isolation, and 401 against a real Postgres; does NOT prove the mobile screen wires the responses correctly (no RN render runner) or that refetch-on-focus fires on device.
- `pnpm turbo run lint` / `pnpm format:check` — prove style/format only; prove nothing about behavior.
- MIG-SYNC (`db:generate`) — proves no schema drift (seed-only); does NOT prove the seeded reward row is semantically correct beyond shape.
- On-device Agent-Probe — proves rendered visual distinctness + refetch-on-focus mechanism by human judgment; does NOT prove the LIVE credit trigger (STAFF-003/LIVE-001 known-gap) fires end-to-end.

Gate: PASS (no FAILs, no unresolved CONCERNs; plan structurally validated, 8-consumer regression coverage grep-confirmed complete, per-user isolation sound, no migration confirmed by MIG-SYNC gate)
Accepted by: n/a (PASS gate — no CONDITIONAL concerns to accept)

---
---

## Autonomous Goal Block

```
SESSION GOAL: STAR-002 — Rewards screen + star progress tracker (issue #27, P0). Fix STAR-001 points->stars type regression first, then ship session-gated rewards read API + react-query mobile data layer + the Rewards screen.
Charter + umbrella plan: N/A — single plan (no phase program)
Autonomy: standard RIPER-5 EXECUTE consent required (feedback_autonomous_phase_execution.md). Reversible edits auto-proceed; surface only hard stops.
Hard stop conditions / safety constraints:
- Any cross-user data leak (a caller reading another user's stars or transactions) — HARD STOP, do not ship. Handlers MUST scope every read to req.user!.id from the server session, never a client-supplied id.
- Do NOT weaken require-session gating on any /rewards handler.
- Do NOT emit a new drizzle migration — seeding is data-only. If db:generate produces a diff, STOP.
- Regression gate is the FULL `pnpm turbo run typecheck` (all packages). A filtered subset is what let STAR-001 through — never accept a filtered typecheck as the regression-green gate.
Next phase: EXECUTE — process/features/rewards-notifications/active/star-002-rewards-screen_14-07-26/star-002-rewards-screen_PLAN_14-07-26.md (Steps 1->11 in order; Steps 2-4 regression fix FIRST; do not start Step 5+ until Step 4d `pnpm turbo run typecheck` is green)
Validate contract: inline in plan (## Validate Contract — Gate: PASS)
Execute start: FIRST run Steps 2-4 (regression) then gate `pnpm turbo run typecheck`. Fully-auto gates: `pnpm turbo run typecheck` | `DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" pnpm --filter @jojopotato/api test` | `pnpm --filter @jojopotato/ui test` | `pnpm turbo run lint` | `pnpm format:check` | MIG-SYNC `pnpm --filter @jojopotato/api db:generate`. Agent-probe: on-device AC1/AC2 visual + AC5 refetch-on-focus. High-risk pack: no (read-only GETs, per-user isolation covered by automated N2 test).
```

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/rewards-notifications/active/star-002-rewards-screen_14-07-26/star-002-rewards-screen_PLAN_14-07-26.md`
2. **Last completed phase or step:** PLAN written (all 11 steps drafted). No EXECUTE work started.
3. **Validate-contract status:** PENDING — VALIDATE is the next phase and is MANDATORY (new
   session-gated API + schema reads). Do NOT skip.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, STAR-001 plan+report
   (`.../completed/star-001-star-earning_14-07-26/`), `packages/api/src/lib/star-earning.ts`,
   `packages/api/src/routes/{orders,staff}.ts` + `middleware/require-session.ts` +
   `routes/lib/serializers.ts`, `packages/api/src/db/schema/{rewards,user_stars,star_transactions}.ts`,
   `packages/api/src/db/seed/seed.ts`, `packages/types/src/rewards.ts` + `index.ts`,
   `packages/ui/src/components/{star-progress-bar,reward-progress-card}.tsx` + `index.ts` +
   `__tests__/mocks.ts` + `jest.config.js`, `apps/mobile/src/app/(tabs)/{rewards/index,index}.tsx`,
   `apps/mobile/src/features/home/*`, `apps/mobile/src/lib/query-client.ts`,
   `apps/mobile/src/features/staff/lib/staff-api.ts`.
5. **Next step for a fresh agent:** Run VALIDATE (vc-validate-agent) to convert this plan into an
   executable contract (V1–V7), then EXECUTE Steps 1→11 in order. The FIRST executable work is the
   STAR-001 regression fix (Steps 2–4); do NOT start API/screen work until `pnpm turbo run typecheck`
   is green (Step 4d gate). Branch: `dev/star`.

---

**Next Step:** Plan complete. Review carefully. Say **'ENTER VALIDATE MODE'** (RIPER-5) when ready to
proceed to plan validation (required before implementation / ENTER EXECUTE MODE).
